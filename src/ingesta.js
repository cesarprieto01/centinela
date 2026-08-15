// Trae los recursos de ayuda de las webs ciudadanas y los deja en `recursos`.
//
//   node src/ingesta.js --seco    → extrae y muestra, sin escribir
//   node src/ingesta.js           → extrae y guarda
//
// Pensado para correr cada 20 o 30 minutos. Cada conector expone la misma
// firma —`fuente`, `tipo`, `extraer()`— así que sumar una web nueva es
// agregar un archivo en src/fuentes y una línea en FUENTES.

import * as acopiosEmergency from "./fuentes/acopios-emergency.js";
import { reemplazarRecursos, registrarFuente, registrarCorrida, usandoSupabase } from "./db.js";

const FUENTES = [acopiosEmergency];

export async function ingerir({ seco = false } = {}) {
  const resumen = [];

  for (const conector of FUENTES) {
    // En seco no escribe nada, ni siquiera el catálogo: es el modo para
    // mirar sin dejar rastro.
    if (!seco) {
      await registrarFuente({
        clave: conector.fuente,
        nombre: conector.nombre,
        url: conector.url,
        tipos: [conector.tipo],
        metodo: conector.metodo,
        contacto: conector.contacto ?? null,
      });
    }

    try {
      const filas = await conector.extraer();

      if (seco) {
        console.log(`[seco] ${conector.fuente}: ${filas.length} ${conector.tipo}(s)`);
        for (const f of filas.slice(0, 3)) {
          console.log(`    · ${f.nombre} — ${f.municipio ?? "sin municipio"}` +
            `${f.verificado ? " ✓" : ""}`);
        }
        if (filas.length > 3) console.log(`    · … y ${filas.length - 3} más`);
      } else {
        await reemplazarRecursos(conector.fuente, filas);
        await registrarCorrida(conector.fuente, { ok: true, filas: filas.length });
        console.log(`${conector.fuente}: ${filas.length} ${conector.tipo}(s) guardados`);
      }

      resumen.push({ fuente: conector.fuente, filas: filas.length });
    } catch (error) {
      // Un conector roto no puede tumbar los demás: el bot sigue sirviendo lo
      // que ya tiene guardado, que es viejo pero cierto.
      console.error(`${conector.fuente} falló: ${error.message}`);
      if (!seco) {
        await registrarCorrida(conector.fuente, { ok: false, error: error.message });
      }
      resumen.push({ fuente: conector.fuente, error: error.message });
    }
  }

  return resumen;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!usandoSupabase && !process.argv.includes("--seco")) {
    console.log("Sin SUPABASE_URL: guardando en data/recursos.json\n");
  }
  const resumen = await ingerir({ seco: process.argv.includes("--seco") });
  if (resumen.some((r) => r.error)) process.exitCode = 1;
}
