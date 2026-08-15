-- Esquema de Centinela en Supabase.
--
-- Motivo del cambio: `data/*.json` funciona en local y se rompe en serverless.
-- El filesystem de Vercel es efímero y cada invocación puede caer en otra
-- instancia, así que un suscriptor guardado en una petición puede no existir
-- en la siguiente. El fallo es intermitente y silencioso, que es el peor modo
-- posible para una lista de gente que espera una alerta.
--
--   psql "$SUPABASE_DB_URL" -f db/schema.sql
--
-- Idempotente: se puede correr varias veces.

create extension if not exists postgis;
create extension if not exists unaccent;

-- ---------------------------------------------------------------- suscriptores

create table if not exists suscriptores (
  telefono   text primary key,              -- E.164 sin '+', como lo entrega Kapso
  municipio  text not null,                 -- clave de MUNICIPIOS en src/sismos.js
  creado_en  timestamptz not null default now()
);

-- Idempotencia del ciclo de respuesta: un mensaje entrante se contesta una vez.
create table if not exists respondidos (
  mensaje_id   text primary key,
  respondido_en timestamptz not null default now()
);

-- Idempotencia del ciclo de alertas, con clave `<idEvento>:<telefono>`.
--
-- Va a Supabase junto con lo demás y no es opcional: el USGS revisa la
-- magnitud de un mismo evento varias veces, y si este registro vive en un
-- disco efímero, cada instancia nueva vuelve a alertar del mismo sismo. En
-- local es un archivo; en serverless serían cinco mensajes a las 3 de la
-- mañana a alguien que lleva días durmiendo en la calle.
create table if not exists enviados (
  clave      text primary key,             -- '<id del evento USGS>:<telefono>'
  enviado_en timestamptz not null default now()
);

-- --------------------------------------------------------------------- recursos

-- Una sola tabla polimórfica en vez de cinco. Las webs ciudadanas publican
-- variaciones de la misma forma —un sitio con nombre, dirección, horario y
-- qué recibe—, así que cinco tablas obligarían a cinco pipelines para el
-- mismo trabajo. El `tipo` separa lo poco que hay que separar.
do $$ begin
  create type recurso_tipo as enum
    ('acopio', 'donacion', 'sangre', 'albergue', 'vivienda', 'voluntariado');
exception when duplicate_object then null;
end $$;

create table if not exists recursos (
  id            uuid primary key default gen_random_uuid(),
  tipo          recurso_tipo not null,
  nombre        text not null,
  descripcion   text,                       -- organización responsable
  direccion     text,
  municipio     text,
  lat           double precision,
  lon           double precision,
  geo           geography(point, 4326),
  telefono      text,                       -- E.164
  horario       text,
  acepta        text[] not null default '{}',
  rechaza       text[] not null default '{}',
  urgente       text[] not null default '{}',
  url           text,

  -- Procedencia. Sin esto el agregador es indistinguible de un rumor: toda
  -- respuesta del bot cita fuente y fecha, y eso sale de estas cuatro columnas.
  fuente        text not null,              -- 'emergency-rosy', 'cuidarcolombia', ...
  fuente_url    text not null,
  verificado    boolean not null default false,
  verificado_en timestamptz,

  hash          text not null,              -- huella del contenido, detecta cambios
  visto_en      timestamptz not null default now(),
  activo        boolean not null default true
);

-- Un recurso es el mismo si su contenido no cambió: hash estable = upsert.
create unique index if not exists recursos_fuente_hash_idx
  on recursos (fuente, hash);

create index if not exists recursos_geo_idx
  on recursos using gist (geo);

create index if not exists recursos_tipo_municipio_idx
  on recursos (tipo, municipio) where activo;

-- Deduplicación entre fuentes.
--
-- Este es el problema que motiva todo: cinco webs listan el mismo centro de
-- acopio y la gente ve cinco. La clave normaliza tipo + nombre; la vista se
-- queda con la fila verificada más recientemente y deja las demás disponibles
-- para auditar de dónde salió cada dato.
alter table recursos
  add column if not exists clave text
  generated always as (
    tipo::text || '|' ||
    lower(regexp_replace(unaccent(nombre), '[^a-zA-Z0-9]', '', 'g'))
  ) stored;

create index if not exists recursos_clave_idx on recursos (clave) where activo;

create or replace view recursos_unicos as
  select distinct on (clave) *
  from recursos
  where activo
  order by clave, verificado desc, verificado_en desc nulls last, visto_en desc;

-- ------------------------------------------------------------------- búsqueda

-- Búsqueda por cercanía. Vive en SQL y no en JS porque el índice GiST hace en
-- milisegundos lo que en Node serían 145 haversines por mensaje entrante.
create or replace function recursos_cerca(
  p_tipo      recurso_tipo,
  p_lat       double precision,
  p_lon       double precision,
  p_radio_km  double precision default 25,
  p_limite    integer default 5
)
returns table (
  nombre text, descripcion text, direccion text, municipio text,
  telefono text, horario text, acepta text[], urgente text[],
  fuente text, fuente_url text, verificado boolean, verificado_en timestamptz,
  distancia_km double precision
)
language sql stable as $$
  select r.nombre, r.descripcion, r.direccion, r.municipio,
         r.telefono, r.horario, r.acepta, r.urgente,
         r.fuente, r.fuente_url, r.verificado, r.verificado_en,
         round((st_distance(r.geo, st_point(p_lon, p_lat)::geography) / 1000)::numeric, 1)::double precision
  from recursos_unicos r
  where r.tipo = p_tipo
    and r.geo is not null
    and st_dwithin(r.geo, st_point(p_lon, p_lat)::geography, p_radio_km * 1000)
  order by r.verificado desc, r.geo <-> st_point(p_lon, p_lat)::geography
  limit p_limite;
$$;

-- ---------------------------------------------------------------------- fuentes

-- Catálogo de fuentes scrapeadas, con su salud.
--
-- Qué sitios se leen vive en código (`FUENTES` en src/ingesta.js) y ahí se
-- queda: sumar una fuente sigue siendo un archivo en src/fuentes y una línea
-- en ese arreglo. Esta tabla no reemplaza eso, sólo lo vuelve auditable sin
-- abrir JavaScript — nombre, a qué tipo(s) de recurso sirve, y si la última
-- corrida de `src/ingesta.js` funcionó.
--
-- No es el directorio de las catorce webs ciudadanas (`src/directorio.js`):
-- ese es producto, para decidir a qué sitio mandar a alguien que el bot no
-- puede resolver con un lugar físico cerca. Esta tabla es sólo la porción de
-- esas webs que además se scrapea hacia `recursos`.
create table if not exists fuentes (
  clave              text primary key,        -- igual a recursos.fuente, ej. 'emergency-rosy'
  nombre             text not null,
  url                text not null,
  tipos              recurso_tipo[] not null,
  metodo             text not null,            -- 'rsc' | 'dom' | 'api'
  contacto           text,                     -- de quien mantiene el sitio, antes de automatizar más

  activa             boolean not null default true,
  frecuencia_minutos integer not null default 30,

  -- Estado de la última corrida de `ingerir()`, no de todas: si algo se
  -- rompe, lo que importa para decidir si el bot sigue sirviendo el sitio es
  -- el estado ahora, no un historial completo.
  ultima_corrida_en  timestamptz,
  ultima_corrida_ok  boolean,
  ultimo_error       text,
  registros          integer,

  creado_en          timestamptz not null default now()
);

create index if not exists fuentes_activa_idx on fuentes (activa);

-- ---------------------------------------------------------------------- RLS

-- El bot escribe con la service key desde el servidor; nadie más toca esto.
--
-- `enviados` tiene que estar acá aunque parezca metadato: su clave es
-- '<evento>:<telefono>', así que dejarla sin RLS publica la lista de
-- teléfonos suscritos a cualquiera con la anon key. En Supabase una tabla del
-- esquema public sin RLS queda expuesta por PostgREST.
alter table suscriptores enable row level security;
alter table respondidos  enable row level security;
alter table enviados     enable row level security;
alter table recursos     enable row level security;
alter table fuentes      enable row level security;

-- Los recursos son información pública de emergencia: lectura abierta para
-- que cualquiera pueda consumirlos. Los suscriptores no: son teléfonos.
drop policy if exists recursos_lectura_publica on recursos;
create policy recursos_lectura_publica on recursos for select using (true);

-- El estado de los conectores no es un dato sensible y sirve para un futuro
-- panel de salud del scraping sin exponer nada de suscriptores.
drop policy if exists fuentes_lectura_publica on fuentes;
create policy fuentes_lectura_publica on fuentes for select using (true);
