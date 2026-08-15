// Persistencia con dos respaldos: Supabase si está configurado, archivos JSON
// si no.
//
// La razón de que sean dos y no uno: `data/*.json` se rompe en Vercel —el
// filesystem es efímero y cada invocación puede caer en otra instancia— pero
// exigir Supabase para correr un test o una demo local sería peor. El código
// que llama no sabe cuál está activo.
//
// Se activa Supabase con SUPABASE_URL + SUPABASE_SERVICE_KEY.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { distanciaSuperficie } from "./sismos.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATOS = join(RAIZ, "data");

const URL_SUPABASE = process.env.SUPABASE_URL;
const LLAVE_SUPABASE = process.env.SUPABASE_SERVICE_KEY;

export const usandoSupabase = Boolean(URL_SUPABASE && LLAVE_SUPABASE);

// ------------------------------------------------------------------ JSON

async function leerJson(archivo, porDefecto) {
  try {
    return JSON.parse(await readFile(join(DATOS, archivo), "utf8"));
  } catch {
    return porDefecto;
  }
}

async function escribirJson(archivo, valor) {
  try {
    await mkdir(DATOS, { recursive: true });
    await writeFile(join(DATOS, archivo), JSON.stringify(valor, null, 2));
  } catch (error) {
    // En Vercel el filesystem es de solo lectura salvo /tmp. Si alguien
    // despliega sin configurar Supabase, el error crudo es un EROFS sobre una
    // ruta que no dice nada; este mensaje sí dice qué falta.
    if (error.code === "EROFS" || error.code === "EACCES") {
      throw new Error(
        `No se pudo escribir ${archivo}: el filesystem es de solo lectura. ` +
          `Configurá SUPABASE_URL y SUPABASE_SERVICE_KEY para persistir en Supabase.`
      );
    }
    throw error;
  }
}

// -------------------------------------------------------------- Supabase

/**
 * Cliente mínimo sobre PostgREST.
 *
 * No se usa @supabase/supabase-js a propósito: de esa librería aquí sólo se
 * necesitan select, upsert y rpc, y añadirla traería el cliente de auth,
 * realtime y storage a un proceso que no los toca. Son treinta líneas contra
 * un árbol de dependencias.
 */
async function pedir(ruta, opciones = {}) {
  const res = await fetch(`${URL_SUPABASE}/rest/v1/${ruta}`, {
    ...opciones,
    // Sin plazo, un fetch colgado se lleva por delante todo el ciclo: en un
    // cron serverless la función muere por tiempo máximo y esa corrida no
    // alerta a nadie. Mejor fallar en 10 s y reintentar en la siguiente.
    signal: AbortSignal.timeout(10_000),
    headers: {
      apikey: LLAVE_SUPABASE,
      Authorization: `Bearer ${LLAVE_SUPABASE}`,
      "Content-Type": "application/json",
      ...opciones.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status} en ${ruta}: ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

const rpc = (nombre, args) =>
  pedir(`rpc/${nombre}`, { method: "POST", body: JSON.stringify(args) });

// --------------------------------------------------------- suscriptores

export async function leerSuscriptores() {
  if (!usandoSupabase) return leerJson("suscriptores.json", []);
  return pedir("suscriptores?select=telefono,municipio");
}

export async function guardarSuscriptor({ telefono, municipio }) {
  if (usandoSupabase) {
    await pedir("suscriptores?on_conflict=telefono", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ telefono, municipio }),
    });
    return;
  }
  const todos = await leerJson("suscriptores.json", []);
  const otros = todos.filter((s) => s.telefono !== telefono);
  await escribirJson("suscriptores.json", [...otros, { telefono, municipio }]);
}

export async function borrarSuscriptor(telefono) {
  if (usandoSupabase) {
    await pedir(`suscriptores?telefono=eq.${encodeURIComponent(telefono)}`, {
      method: "DELETE",
    });
    return;
  }
  const todos = await leerJson("suscriptores.json", []);
  await escribirJson(
    "suscriptores.json",
    todos.filter((s) => s.telefono !== telefono)
  );
}

// ----------------------------------------------------------- respondidos

export async function leerRespondidos() {
  if (!usandoSupabase) return new Set(await leerJson("respondidos.json", []));
  const filas = await pedir("respondidos?select=mensaje_id");
  return new Set(filas.map((f) => f.mensaje_id));
}

export async function marcarRespondidos(ids) {
  if (ids.length === 0) return;
  if (usandoSupabase) {
    await pedir("respondidos", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(ids.map((mensaje_id) => ({ mensaje_id }))),
    });
    return;
  }
  const previos = await leerJson("respondidos.json", []);
  await escribirJson("respondidos.json", [...new Set([...previos, ...ids])]);
}

// -------------------------------------------------------------- enviados

export async function leerEnviados() {
  if (!usandoSupabase) return new Set(await leerJson("enviados.json", []));
  const filas = await pedir("enviados?select=clave");
  return new Set(filas.map((f) => f.clave));
}

export async function marcarEnviados(claves) {
  if (claves.length === 0) return;
  if (usandoSupabase) {
    await pedir("enviados", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(claves.map((clave) => ({ clave }))),
    });
    return;
  }
  const previos = await leerJson("enviados.json", []);
  await escribirJson("enviados.json", [...new Set([...previos, ...claves])]);
}

// -------------------------------------------------------------- recursos

/**
 * Deja la tabla igual a lo que la fuente publica ahora mismo.
 *
 * Lo que dejó de aparecer se marca `activo=false` en vez de borrarse: un
 * acopio que cierra tiene que desaparecer del bot, pero saber que existió y
 * cuándo dejó de estar es lo que permite auditar una respuesta vieja.
 */
export async function reemplazarRecursos(fuente, filas) {
  if (usandoSupabase) {
    // Marca de agua de esta corrida. Sirve para apagar lo que ya no aparece
    // sin tener que enumerar 145 hashes en la query string: se apaga lo que
    // no se volvió a ver, que además escala a las fuentes que faltan.
    const corrida = new Date().toISOString();

    // `on_conflict` es obligatorio: la clave de deduplicación es (fuente,
    // hash) y no la primaria. Sin este parámetro PostgREST resuelve contra
    // `id`, que trae un uuid nuevo en cada fila, así que nunca hay conflicto
    // que resolver y la segunda corrida revienta con duplicate key.
    await pedir("recursos?on_conflict=fuente,hash", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(
        filas.map((f) => ({
          ...f,
          geo: f.lat != null && f.lon != null ? `POINT(${f.lon} ${f.lat})` : null,
          visto_en: corrida,
          activo: true,
        }))
      ),
    });

    await pedir(
      `recursos?fuente=eq.${encodeURIComponent(fuente)}` +
        `&visto_en=lt.${encodeURIComponent(corrida)}&activo=is.true`,
      { method: "PATCH", body: JSON.stringify({ activo: false }) }
    );
    return filas.length;
  }

  const todos = await leerJson("recursos.json", []);
  const otras = todos.filter((r) => r.fuente !== fuente);
  await escribirJson("recursos.json", [
    ...otras,
    ...filas.map((f) => ({ ...f, visto_en: new Date().toISOString(), activo: true })),
  ]);
  return filas.length;
}

// ---------------------------------------------------------------- fuentes

/**
 * Registra o actualiza el metadato estático de una fuente scrapeada.
 *
 * Se llama en cada corrida de `src/ingesta.js`, no sólo la primera vez: es
 * un upsert por `clave`, así que si alguien cambia el nombre o suma un tipo
 * al conector, la próxima corrida lo refleja sin migración aparte.
 */
export async function registrarFuente({ clave, nombre, url, tipos, metodo, contacto = null }) {
  if (usandoSupabase) {
    await pedir("fuentes?on_conflict=clave", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ clave, nombre, url, tipos, metodo, contacto }),
    });
    return;
  }
  const todas = await leerJson("fuentes.json", []);
  const previa = todas.find((f) => f.clave === clave) ?? {};
  const otras = todas.filter((f) => f.clave !== clave);
  await escribirJson("fuentes.json", [
    ...otras,
    { ...previa, clave, nombre, url, tipos, metodo, contacto },
  ]);
}

/**
 * Deja constancia de cómo salió la última corrida de un conector.
 *
 * Sobreescribe el estado anterior a propósito: lo que importa para decidir
 * si el bot sigue sirviendo esta fuente es cómo está ahora, no un historial
 * completo de corridas.
 */
export async function registrarCorrida(clave, { ok, filas = null, error = null }) {
  const cambios = {
    ultima_corrida_en: new Date().toISOString(),
    ultima_corrida_ok: ok,
    registros: filas,
    ultimo_error: error,
  };
  if (usandoSupabase) {
    await pedir(`fuentes?clave=eq.${encodeURIComponent(clave)}`, {
      method: "PATCH",
      body: JSON.stringify(cambios),
    });
    return;
  }
  const todas = await leerJson("fuentes.json", []);
  await escribirJson(
    "fuentes.json",
    todas.map((f) => (f.clave === clave ? { ...f, ...cambios } : f))
  );
}

export async function leerFuentes() {
  if (!usandoSupabase) return leerJson("fuentes.json", []);
  return pedir("fuentes?select=*");
}

/** Dedupe entre fuentes: mismo tipo y mismo nombre normalizado es lo mismo. */
function clave(recurso) {
  return (
    recurso.tipo +
    "|" +
    recurso.nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "")
  );
}

/**
 * Recursos de un tipo cerca de un punto, más cercano primero.
 *
 * En Supabase lo resuelve `recursos_cerca` con índice GiST. En el respaldo
 * JSON se calcula en memoria: con unos cientos de filas sobra, y mantiene el
 * bot corriendo en local sin base de datos.
 */
export async function buscarRecursos({ tipo, lat, lon, radioKm = 25, limite = 5 }) {
  if (usandoSupabase) {
    return rpc("recursos_cerca", {
      p_tipo: tipo,
      p_lat: lat,
      p_lon: lon,
      p_radio_km: radioKm,
      p_limite: limite,
    });
  }

  const todos = await leerJson("recursos.json", []);
  const unicos = new Map();

  for (const r of todos) {
    if (!r.activo || r.tipo !== tipo || r.lat == null || r.lon == null) continue;
    const k = clave(r);
    const previo = unicos.get(k);
    // Mismo criterio que la vista `recursos_unicos`: gana el verificado, y
    // entre iguales el verificado más recientemente.
    if (
      !previo ||
      (r.verificado && !previo.verificado) ||
      (r.verificado === previo.verificado &&
        (r.verificado_en ?? "") > (previo.verificado_en ?? ""))
    ) {
      unicos.set(k, r);
    }
  }

  return [...unicos.values()]
    .map((r) => ({
      ...r,
      distancia_km: Number(distanciaSuperficie(lat, lon, r.lat, r.lon).toFixed(1)),
    }))
    .filter((r) => r.distancia_km <= radioKm)
    .sort((a, b) =>
      a.verificado === b.verificado
        ? a.distancia_km - b.distancia_km
        : Number(b.verificado) - Number(a.verificado)
    )
    .slice(0, limite);
}
