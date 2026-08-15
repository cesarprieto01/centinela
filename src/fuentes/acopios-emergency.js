// Centros de acopio publicados por «Centros de Acopio Colombia».
//
//   https://emergency-rosy.vercel.app
//
// De las webs ciudadanas que aparecieron tras el M7.4 ésta es la que mejor
// dato tiene: 145 centros en 27 departamentos, con coordenadas, horario, qué
// recibe cada uno, qué NO recibe, y el estado de verificación con su fuente.
// Es también la pregunta que más llega al bot —dónde llevo lo que junté—, así
// que es el primer conector.
//
// El sitio no expone API, pero es Next.js con App Router: los datos viajan
// serializados en el payload RSC del HTML. Leerlos de ahí es preferible a
// parsear el DOM renderizado —los nombres de campo son estables, las clases
// de Tailwind no— aunque sigue siendo un contrato no publicado y puede
// romperse sin aviso. Por eso `extraer()` falla ruidosamente en vez de
// devolver una lista vacía: una lista vacía se confundiría con «no hay
// acopios» y el bot le diría a alguien que no tiene dónde llevar la ayuda.
//
// ponytail: lo correcto es pedirle a quien mantiene el sitio un
// `/api/centros.json`. Este conector es el puente mientras tanto.

import { createHash } from "node:crypto";

export const fuente = "emergency-rosy";
export const tipo = "acopio";
export const nombre = "Centros de Acopio Colombia";
export const metodo = "rsc";
// Sin contacto público todavía: correcto es escribirle a quien mantiene el
// sitio antes de dejarle un cron encima cada 30 min (ver nota al final del
// archivo). Se deja null hasta tener ese dato.
export const contacto = null;

const SITIO = "https://emergency-rosy.vercel.app";
export const url = SITIO;

/** Reconstruye el payload RSC repartido en varios `self.__next_f.push`. */
function payloadRsc(html) {
  const trozos = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,\s*("(?:[^"\\]|\\.)*")\]\)/g),
  ].map((m) => JSON.parse(m[1]));

  if (trozos.length === 0) {
    throw new Error("no se encontró payload RSC: el sitio cambió de framework");
  }
  return trozos.join("");
}

/**
 * Recorta el arreglo JSON que empieza en `desde`, respetando comillas.
 *
 * Un `indexOf("]")` cortaría en el primer corchete que aparezca dentro de una
 * dirección o de una nota de verificación, y hay varias.
 */
function recortarArreglo(texto, desde) {
  let profundidad = 0;
  let enTexto = false;
  let escapado = false;

  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];

    if (escapado) { escapado = false; continue; }
    if (c === "\\") { escapado = true; continue; }
    if (c === '"') { enTexto = !enTexto; continue; }
    if (enTexto) continue;

    if (c === "[") profundidad++;
    else if (c === "]") {
      profundidad--;
      if (profundidad === 0) return texto.slice(desde, i + 1);
    }
  }
  throw new Error("el arreglo de centros quedó sin cerrar");
}

function telefonoE164(valor) {
  if (!valor) return null;
  const digitos = String(valor).replace(/\D/g, "");
  if (digitos.length === 10) return `57${digitos}`;      // celular colombiano
  if (digitos.startsWith("57")) return digitos;
  return digitos || null;
}

function aFecha(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Huella del contenido: si no cambió, el upsert no toca la fila. */
function huella(centro) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        centro.name,
        centro.address,
        centro.municipality,
        centro.schedule_text,
        centro.accepted_items,
        centro.verification_status,
      ])
    )
    .digest("hex")
    .slice(0, 32);
}

/** Un centro del sitio → una fila de `recursos`. */
export function aRecurso(centro) {
  return {
    tipo,
    nombre: centro.name,
    descripcion: centro.organization || null,
    // En Bogotá y otros distritos el municipio y el departamento son el mismo
    // nombre; repetirlo se lee como un error de plantilla.
    direccion: [
      ...new Set([centro.address, centro.municipality, centro.department].filter(Boolean)),
    ].join(", "),
    municipio: centro.municipality || null,
    lat: centro.latitude ?? null,
    lon: centro.longitude ?? null,
    telefono: telefonoE164(centro.whatsapp || centro.phone),
    horario: centro.schedule_text || null,
    acepta: centro.accepted_items ?? [],
    rechaza: centro.rejected_items ?? [],
    urgente: centro.urgent_needs ?? [],
    url: SITIO,
    fuente,
    // La fuente primaria del dato, no el agregador: si un acopio salió de una
    // historia de Instagram de la alcaldía, ese es el enlace que hay que citar.
    fuente_url: centro.source_url || SITIO,
    verificado: centro.verification_status === "verified",
    verificado_en: aFecha(centro.source_published_at),
    hash: huella(centro),
  };
}

/** Un acopio con fecha de cierre pasada ya no sirve para mandar a nadie. */
function vigente(centro) {
  if (!centro.ends_at) return true;
  return new Date(centro.ends_at) >= new Date(new Date().toDateString());
}

export async function extraer({ html } = {}) {
  const crudo = html ?? (await descargar());
  const payload = payloadRsc(crudo);

  const marca = payload.indexOf('"centers":[');
  if (marca === -1) {
    throw new Error('el payload no trae "centers": el sitio cambió de estructura');
  }

  const centros = JSON.parse(
    recortarArreglo(payload, payload.indexOf("[", marca))
  );

  if (centros.length === 0) {
    throw new Error("el sitio devolvió 0 centros: se aborta antes de vaciar la tabla");
  }

  return centros.filter(vigente).map(aRecurso);
}

async function descargar() {
  const res = await fetch(SITIO, {
    // Un sitio que no responde no puede colgar la ingesta entera.
    signal: AbortSignal.timeout(20_000),
    headers: {
      // Identificarse y dejar contacto es lo mínimo cuando uno lee el sitio de
      // otro cada media hora. Estas webs las mantiene una persona en plan
      // gratuito.
      "User-Agent":
        "CentinelaBot/1.0 (alertas sísmicas por WhatsApp; +https://github.com/LucasLeguizamo/centinela)",
    },
  });
  if (!res.ok) throw new Error(`emergency-rosy respondió ${res.status}`);
  return res.text();
}
