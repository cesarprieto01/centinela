// Autochequeo del clasificador de intenciones: node src/responder.test.js

import assert from "node:assert/strict";
import { clasificarIntencion, componerRespuesta } from "./responder.js";
import { MUNICIPIOS } from "./sismos.js";

// Cómo escribe la gente de verdad: sin acentos, sin mayúsculas, con typos.
const CASOS = [
  ["¿qué tan fuerte fue?", "detalle"],
  ["que tan fuerte fue", "detalle"],
  ["QUE PASO", "detalle"],
  ["cuanto fue la magnitud", "detalle"],
  ["temblo otra vez?", "replicas"],
  ["hubo replicas", "replicas"],
  ["¿hubo réplicas?", "replicas"],
  ["quiero cambiar de ciudad", "cambiar"],
  ["me mude", "cambiar"],
  ["BAJA", "baja"],
  ["ya no quiero", "baja"],
  ["parar", "baja"],
  ["hola", "ayuda"],
  ["ayuda", "ayuda"],
  ["buenas", "ayuda"],

  // Las dos puertas del menú. Van antes que las categorías porque "necesito
  // ayuda" contiene "ayuda", que si no se la llevaría el menú general.
  ["quiero ayudar", "menu_ayudar"],
  ["Quiero ayudar", "menu_ayudar"],
  ["en que puedo ayudar", "menu_ayudar"],
  ["necesito ayuda", "menu_necesito"],
  ["Necesito ayuda", "menu_necesito"],

  // Recursos de ayuda. La frontera fina está entre las tres: "donar sangre"
  // no es "donar dinero", y "donar" a secas es llevar cosas a un acopio.
  ["donde dono", "acopio"],
  ["dónde llevo la ayuda", "acopio"],
  ["centros de acopio", "acopio"],
  ["que puedo donar", "acopio"],
  ["donde llevar mercado", "acopio"],
  ["donar sangre", "sangre"],
  ["banco de sangre cerca", "sangre"],
  ["quiero donar dinero", "donar"],
  ["a que cuenta transfiero plata", "donar"],
  ["tienen nequi", "donar"],

  // Categorías nuevas del menú.
  ["quiero ser voluntario", "voluntariado"],
  ["soy ingeniero civil", "voluntariado"],
  ["perdí mi perro", "mascota"],
  ["estoy buscando a mi hermano", "buscar_persona"],
  ["mi tía está desaparecida", "buscar_persona"],
  ["necesito donde dormir", "alojamiento_necesito"],
  ["tengo una habitacion libre", "alojamiento_ofrecer"],
  ["mi casa tiene grietas", "reportar_dano"],

  // Los títulos exactos de los botones: al tocar una fila, WhatsApp manda el
  // título como si la persona lo hubiera escrito. Si esto se rompe, los
  // botones dejan de funcionar sin que nadie se entere.
  ["Llevar cosas", "acopio"],
  ["Donar dinero", "donar"],
  ["Donar sangre", "sangre"],
  ["Ser voluntario", "voluntariado"],
  ["Ofrecer alojamiento", "alojamiento_ofrecer"],
  ["Buscar a alguien", "buscar_persona"],
  ["Perdí mi mascota", "mascota"],
  ["Necesito dónde dormir", "alojamiento_necesito"],
  ["Necesito ayuda económica", "necesito_dinero"],
  ["Reportar daños", "reportar_dano"],

  // Varias a la vez: obligar a preguntar de a una convierte una conversación
  // en un formulario.
  ["quiero donar sangre y llevar mercado", "varias"],
];

for (const [texto, esperado] of CASOS) {
  assert.equal(
    clasificarIntencion(texto),
    esperado,
    `"${texto}" debería ser ${esperado}, dio ${clasificarIntencion(texto)}`
  );
}

// "baja" gana sobre todo lo demás: si alguien quiere irse, se va. Un producto
// de notificaciones que discute la baja es spam.
assert.equal(clasificarIntencion("que tan fuerte fue? ya no quiero mas"), "baja");

// Las respuestas que no consultan la red deben salir completas y sin huecos.
for (const intencion of ["baja", "cambiar", "ayuda"]) {
  const r = await componerRespuesta(intencion, MUNICIPIOS.quibdo);
  assert.ok(r.length > 40, `respuesta de ${intencion} demasiado corta`);
  assert.ok(!r.includes("undefined"), `respuesta de ${intencion} con huecos`);
}

// La ayuda tiene que repetir la advertencia: es la promesa que no podemos
// dejar que el usuario malentienda.
const ayuda = await componerRespuesta("ayuda", MUNICIPIOS.quibdo);
assert.ok(/despu[eé]s del temblor, no antes/.test(ayuda), "la ayuda debe aclarar que no es alerta temprana");

// El menú tiene que anunciar las dos puertas: una capacidad que no se nombra
// no existe para quien está del otro lado.
for (const palabra of ["QUIERO AYUDAR", "NECESITO AYUDA"]) {
  assert.ok(ayuda.includes(palabra), `el menú debería mencionar "${palabra}"`);
}

// Las dos puertas y sus categorías.
for (const puerta of ["menu_ayudar", "menu_necesito"]) {
  const r = await componerRespuesta(puerta, MUNICIPIOS.quibdo);
  assert.ok(r.length > 80, `el menú ${puerta} salió demasiado corto`);
  assert.ok(!r.includes("undefined"), `el menú ${puerta} tiene huecos`);
}

// Cada categoría del menú tiene que responder algo útil y con enlace, tanto
// si hay lugares físicos cerca como si no. Un botón que lleva a un mensaje
// vacío es peor que no tener el botón.
const CATEGORIAS_MENU = [
  "acopio", "donar", "sangre", "voluntariado", "alojamiento_ofrecer",
  "buscar_persona", "mascota", "alojamiento_necesito", "necesito_dinero", "reportar_dano",
];
for (const categoria of CATEGORIAS_MENU) {
  const r = await componerRespuesta(categoria, MUNICIPIOS.quibdo);
  assert.ok(r.length > 60, `${categoria} respondió demasiado corto`);
  assert.ok(!r.includes("undefined"), `${categoria} tiene huecos`);
  assert.ok(/https?:\/\//.test(r), `${categoria} debe citar una fuente consultable`);
}

// Segmentación por ubicación. Techo Cafetero solo cubre el Eje Cafetero:
// a alguien de Pereira se le recomienda a secas; a alguien de Quibdó se le
// nombra pero advirtiendo hasta dónde llega. Callárselo lo dejaría creyendo
// que su ofrecimiento no le sirve a nadie.
const techoPereira = await componerRespuesta("alojamiento_ofrecer", MUNICIPIOS.pereira);
const techoQuibdo = await componerRespuesta("alojamiento_ofrecer", MUNICIPIOS.quibdo);

assert.ok(techoPereira.includes("techocafetero"), "Pereira está en la cobertura");
assert.ok(
  !techoPereira.includes("solo cubre"),
  "a quien sí cubre no se le pone la advertencia de cobertura"
);
assert.ok(
  techoQuibdo.includes("solo cubre Pereira y Armenia"),
  "a quien queda fuera hay que decirle hasta dónde llega"
);

// Varias categorías en un mismo mensaje se responden todas.
const varias = await componerRespuesta(
  "varias", MUNICIPIOS.quibdo, "quiero donar sangre y llevar mercado"
);
assert.ok(varias.includes("———"), "las respuestas múltiples van separadas");
assert.ok(varias.length > 200, "una respuesta múltiple no puede ser más corta que una simple");

// Sin recursos cargados, las tres intenciones nuevas responden igual de bien:
// dicen que no tienen el dato y mandan a la fuente. Nunca inventan un lugar.
for (const intencion of ["acopio", "sangre", "donar"]) {
  const r = await componerRespuesta(intencion, MUNICIPIOS.quibdo);
  assert.ok(r.length > 60, `respuesta de ${intencion} demasiado corta`);
  assert.ok(!r.includes("undefined"), `respuesta de ${intencion} con huecos`);
  assert.ok(/https?:\/\//.test(r), `${intencion} debe citar una fuente consultable`);
}

// Regla dura del producto: el bot no dicta números de cuenta.
//
// Con campañas falsas activas suplantando entidades, un bot que recita una
// cuenta es el vector perfecto. Esta prueba existe para que nadie la agregue
// "por comodidad" en un commit apurado a las 3 de la mañana.
const donar = await componerRespuesta("donar", MUNICIPIOS.quibdo);
assert.ok(
  !/\d[\d\s.-]{7,}/.test(donar.replace(/https?:\/\/\S+/g, "")),
  "la respuesta de donación no puede contener algo con forma de número de cuenta"
);
assert.ok(
  /oficial/.test(donar),
  "la respuesta de donación debe mandar al canal oficial de cada organización"
);

console.log(`✓ responder.js ok — ${CASOS.length} frases clasificadas`);
