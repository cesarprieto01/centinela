// US-008: responder preguntas de seguimiento con datos reales.
//
// Una alerta que no se puede repreguntar es un volante. La ventaja de
// WhatsApp sobre una app es justamente ésta: la persona contesta el mensaje
// como le contestaría a un conocido, y el sistema responde con el dato.
//
//   node src/responder.js --seco    → clasifica y muestra, sin enviar
//   node src/responder.js           → responde de verdad

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import {
  sismosRecientes,
  clasificarReplicas,
  evaluarAlerta,
  intensidadEn,
  describirIntensidad,
  normalizarMunicipio,
  MUNICIPIOS,
} from "./sismos.js";
import {
  leerSuscriptores,
  leerRespondidos,
  marcarRespondidos,
  buscarRecursos,
} from "./db.js";
import {
  MENUS,
  ORGANIZACIONES,
  TIPO_RECURSO,
  sitiosPara,
  sitiosExterior,
  sitiosDeCategoria,
  describirCobertura,
} from "./directorio.js";

const ejecutar = promisify(execFile);

const PHONE_NUMBER_ID = "1243233552205505";
const KAPSO = join(process.env.HOME, "Library", "pnpm", "kapso");

function sinAcentos(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Categorías de ayuda, en orden de especificidad.
 *
 * Cada patrón reconoce dos cosas a la vez: cómo lo escribe la gente por su
 * cuenta ("donde llevo el mercado") y el título exacto del botón del menú
 * ("Llevar cosas"). Es lo que permite que los botones de WhatsApp y el texto
 * libre entren por la misma puerta: al tocar una fila de la lista, WhatsApp
 * manda su título como si la persona lo hubiera escrito.
 */
const CATEGORIAS = [
  ["sangre", /\bsangre\b|hemocentro|donar sangre/],

  ["mascota", /\bmascotas?\b|\bperr[oa]s?\b|\bgat[oa]s?\b|perdi mi (perro|gato|mascota)/],

  ["buscar_persona",
    /desaparecid|buscar a (alguien|mi|una persona)|no encuentro a|estoy buscando a|reportar una persona/],

  ["alojamiento_necesito",
    /necesito (donde |un |)(dormir|alojamiento|techo|posada)|me quede sin casa|perdi mi casa|donde duermo/],

  ["alojamiento_ofrecer",
    /ofrecer (alojamiento|techo|casa|habitacion)|tengo (un |una |)(espacio|habitacion|apartamento|casa) (libre|disponible|vacia)|puedo alojar/],

  ["necesito_dinero",
    /necesito (ayuda economica|plata|dinero)|publicar mi caso|soy damnificad|quede sin nada/],

  ["reportar_dano",
    /reportar (danos?|mi casa|el edificio)|mi (casa|edificio|apartamento) (se |quedo |esta )?(agrieto|agrietad|dañad|danad|con grietas)|grietas/],

  ["voluntariado",
    /voluntari|ser volunta|poner (mi |el )?tiempo|ayudar con mis manos|soy (ingenier|arquitect|medic|psicolog)/],

  ["donar",
    // Verbos con sufijo abierto: la gente escribe "transfiero" y "consigno",
    // no el infinitivo del diccionario.
    /donar dinero|(donar|dono|donacion|aportar|transfer\w*|consign\w*)[^.]{0,25}(plata|dinero|efectivo|pesos|cuenta)|(plata|dinero|efectivo)[^.]{0,25}(donar|dono|aportar|transfer\w*|consign\w*|cuenta)|\bcuenta\b[^.]{0,25}(transfer\w*|consign\w*|donar|plata|dinero)|\b(nequi|daviplata|bancolombia|bre ?-?b|cuenta bancaria|numero de cuenta)\b/],

  ["acopio",
    /\bacopios?\b|punto de (acopio|recoleccion)|llevar cosas|donde (los |las |la |lo )?(llevo|llevar|dono|donar|entrego|entregar|dejo|dejar)|que (puedo |se |les |)(donar|dona|reciben|recibe|sirve)|llevar (comida|ropa|mercado|ayudas?)/],
];

/** Todas las categorías que menciona un mensaje, no solo la primera. */
export function categoriasEn(texto) {
  const t = sinAcentos(texto);
  return CATEGORIAS.filter(([, patron]) => patron.test(t)).map(([id]) => id);
}

/**
 * Clasificación por palabras clave, no por modelo.
 *
 * La gente escribe estas cosas casi igual siempre. Un LLM acá costaría plata
 * y latencia para adivinar lo que un `test` resuelve, y sobre todo abriría la
 * puerta a que el bot invente una dirección: por este camino todo dato
 * concreto sale de una consulta, no de un modelo.
 *
 * ponytail: el techo sigue ahí. Esto cubre la pregunta directa ("dónde llevo
 * la ayuda") pero no la abierta ("junté ropa usada y pañales, ¿me sirve de
 * algo?"). Eso pide un clasificador de verdad con tool-calling sobre estas
 * mismas consultas — el modelo redacta, las herramientas responden.
 */
export function clasificarIntencion(texto) {
  const t = sinAcentos(texto);

  // La baja gana sobre todo lo demás: si alguien quiere irse, se va.
  if (/\b(baja|cancelar|parar|stop|no quiero)\b/.test(t)) return "baja";
  if (/\b(cambiar|mudar|otra ciudad|me mude)\b/.test(t)) return "cambiar";

  // Los dos menús van antes que las categorías: "necesito ayuda" es una
  // puerta, no una pregunta concreta, y contiene la palabra "ayuda" que si no
  // se la llevaría el menú general.
  // "Necesito ayuda" abre el menú; "necesito ayuda económica" ya es una
  // categoría concreta y sería un paso de más mandarla al menú.
  if (/necesito ayuda(?!\s*(economica|economico|con plata|con dinero))|necesito apoyo|^necesito$/.test(t))
    return "menu_necesito";
  if (/quiero ayudar|como (puedo )?ayudar|en que (puedo )?ayudar|donde (puedo )?ayudar|^ayudar$/.test(t))
    return "menu_ayudar";

  const categorias = categoriasEn(t);
  if (categorias.length > 1) return "varias";
  if (categorias.length === 1) return categorias[0];

  if (/\b(replica|replicas|volvio a temblar|otra vez)\b/.test(t)) return "replicas";
  if (/(que tan fuerte|cuanto fue|magnitud|que paso|que fue eso|temblo|tembl)/.test(t))
    return "detalle";
  if (/\b(ayuda|help|que haces|como funciona|opciones|hola|buenas|menu)\b/.test(t))
    return "ayuda";

  return "desconocida";
}

/** Última alerta relevante para esa ciudad, con su intensidad local. */
async function contextoSismico(lugar) {
  const sismos = clasificarReplicas(
    await sismosRecientes({ desdeMinutos: 7 * 24 * 60, magnitudMinima: 2.5 })
  );
  const sentidos = sismos.filter((s) => evaluarAlerta(s, lugar).alertar);
  const principal = sentidos.filter((s) => !s.replicaDe).at(-1);
  const replicas = principal ? sentidos.filter((s) => s.replicaDe === principal.id) : [];
  return { principal, replicas };
}

/** Fecha corta para citar cuándo se verificó un dato. */
function fechaCorta(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });
}

/**
 * Una ficha de recurso, en el formato que WhatsApp lee bien.
 *
 * Siempre lleva fuente y fecha de verificación. No es adorno: la mitad de las
 * preguntas que llegan son "¿esto es real?", y en una emergencia donde ya hay
 * campañas falsas circulando, un dato sin procedencia vale menos que ninguno.
 */
function ficha(r) {
  const lineas = [`*${r.nombre}*${r.verificado ? " ✓" : ""}`];

  if (r.descripcion) lineas.push(`_${r.descripcion}_`);
  if (r.direccion) lineas.push(`📍 ${r.direccion}`);
  if (r.distancia_km != null) lineas.push(`📏 a ${r.distancia_km} km de vos`);
  if (r.horario) lineas.push(`🕐 ${r.horario}`);
  if (r.urgente?.length) lineas.push(`🔴 Más urgente: ${r.urgente.slice(0, 3).join(", ")}`);
  else if (r.acepta?.length) lineas.push(`📦 Recibe: ${r.acepta.slice(0, 4).join(", ")}`);
  if (r.telefono) lineas.push(`📞 +${r.telefono}`);

  const verificado = fechaCorta(r.verificado_en);
  if (verificado) lineas.push(`Verificado el ${verificado} · ${r.fuente}`);

  return lineas.join("\n");
}

/**
 * Recursos cerca, ampliando el radio antes de rendirse.
 *
 * 25 km sirve dentro de una ciudad; 80 km alcanza al municipio vecino, que es
 * lo que necesita alguien en un pueblo donde no hay acopio propio. Decir "no
 * hay nada" cuando lo hay a 40 km sería el peor resultado posible.
 */
async function recursosCerca(tipo, lugar) {
  for (const radioKm of [25, 80]) {
    const hallados = await buscarRecursos({
      tipo,
      lat: lugar.lat,
      lon: lugar.lon,
      radioKm,
      limite: 3,
    });
    if (hallados.length > 0) return { hallados, radioKm };
  }
  return { hallados: [], radioKm: 80 };
}

/** Encabezado y cierre propios de cada categoría. */
const TEXTOS = {
  acopio: {
    conLugares: (l) => `Esto es lo que tengo cerca de ${l.nombre}:`,
    cierre: "Antes de salir, llamá para confirmar que siguen recibiendo: los horarios cambian de un día para otro.",
    sinLugares: (l) => `No tengo ningún centro de acopio verificado cerca de ${l.nombre}, pero acá podés buscar en todo el país:`,
  },
  sangre: {
    conLugares: (l) => `Donación de sangre cerca de ${l.nombre}:`,
    cierre: "Llamá antes de ir: las jornadas se llenan. Y la sangre se necesita durante semanas, no solo los primeros días.",
    sinLugares: (l) => `Todavía no tengo bancos de sangre cargados para ${l.nombre}, y no te mando a una dirección que no pueda confirmar. Acá están los puntos y jornadas verificados:`,
  },
  voluntariado: {
    sinLugares: () => "Para poner el tiempo o el oficio:",
    cierre: "Si sos ingeniero, arquitecto o estudiante de esas áreas, decilo al registrarte: hay convocatorias específicas para evaluar estructuras.",
  },
  alojamiento_ofrecer: {
    sinLugares: () => "Para ofrecer un espacio a alguien que perdió su casa:",
  },
  alojamiento_necesito: {
    conLugares: (l) => `Albergues cerca de ${l.nombre}:`,
    sinLugares: () => "Para conseguir alojamiento temporal:",
  },
  buscar_persona: {
    sinLugares: () => "Para buscar o reportar a una persona:",
    cierre: "Registrá el caso en las dos primeras: son las que más gente consulta y no comparten información entre sí, así que estar en una sola reduce las probabilidades.",
  },
  mascota: {
    sinLugares: () => "Para buscar o reportar una mascota:",
  },
  necesito_dinero: {
    sinLugares: () => "Para publicar tu caso y recibir ayuda directa:",
    cierre: "Ahí la plata llega a tu propia cuenta: la plataforma no la recibe ni la administra.",
  },
  reportar_dano: {
    sinLugares: () => "Para reportar daños en tu casa o edificio:",
    cierre: "Reportarlo sirve para dos cosas: que quede registro y que las cuadrillas de evaluación sepan dónde ir.",
  },
};

/** Una web del directorio, en el formato que WhatsApp lee bien. */
function fichaSitio(s) {
  return `• *${s.nombre}*\n  ${s.que}\n  ${s.url}`;
}

/**
 * Respuesta de una categoría, con la regla que pediste:
 * primero un sitio físico al que se pueda ir, y solo si no hay ninguno cerca,
 * la web que sí cubre esa zona.
 */
async function responderCategoria(categoria, lugar) {
  const textos = TEXTOS[categoria] ?? {};
  const tipo = TIPO_RECURSO[categoria];

  // ¿Hay lugares físicos raspados para esta categoría y cerca de la persona?
  if (tipo) {
    const { hallados } = await recursosCerca(tipo, lugar);
    if (hallados.length > 0) {
      const sitios = sitiosPara(categoria, lugar);
      return (
        `${textos.conLugares(lugar)}\n\n` +
        hallados.map(ficha).join("\n\n") +
        (textos.cierre ? `\n\n${textos.cierre}` : "") +
        (sitios.length ? `\n\nVer todos: ${sitios[0].url}` : "")
      );
    }
  }

  // No hay dónde ir: a la web, pero solo a la que sirve donde está.
  const sitios = sitiosPara(categoria, lugar);

  if (sitios.length === 0) {
    // No hay nada que cubra su zona. Antes de rendirse: decirle qué existe y
    // hasta dónde llega. "Existe pero no llega a vos" es información útil;
    // el silencio lo deja pensando que lo suyo no le sirve a nadie.
    const nombres = Object.fromEntries(
      Object.entries(MUNICIPIOS).map(([clave, m]) => [clave, m.nombre])
    );
    const otras = sitiosDeCategoria(categoria).map(
      (s) => `${fichaSitio(s)}\n  ⚠️ Por ahora solo cubre ${describirCobertura(s, nombres)}`
    );
    const fuera = sitiosExterior(categoria).map(fichaSitio);

    if (otras.length === 0 && fuera.length === 0) {
      return (
        `Todavía no tengo nada verificado de eso para ${lugar.nombre}, y prefiero decírtelo a mandarte a un sitio que no te sirva.\n\n` +
        `Escribime más adelante: estoy sumando fuentes nuevas cada día.`
      );
    }

    return (
      `No tengo nada que cubra ${lugar.nombre} para eso todavía. Te digo lo que hay, por si te sirve o conocés a alguien en esas zonas:\n\n` +
      [...otras, ...fuera].join("\n\n") +
      `\n\nSi aparece algo para ${lugar.nombre}, lo sumo.`
    );
  }

  return (
    `${textos.sinLugares(lugar)}\n\n` +
    sitios.map(fichaSitio).join("\n\n") +
    (textos.cierre ? `\n\n${textos.cierre}` : "")
  );
}

/** Menú como texto, para el caso en que no llegue por botón. */
function menuTexto(menu) {
  return (
    `${menu.titulo}\n\n` +
    menu.opciones.map((o) => `• *${o.titulo}* — ${o.detalle}`).join("\n") +
    `\n\nEscribime la que necesites. Podés pedirme varias a la vez.`
  );
}

export async function componerRespuesta(intencion, lugar, texto = "") {
  if (intencion === "menu_ayudar") return menuTexto(MENUS.ayudar);
  if (intencion === "menu_necesito") return menuTexto(MENUS.necesito);

  // Varias categorías en un mismo mensaje ("sangre y ropa"): se responden
  // todas. Obligar a preguntar de a una convierte una conversación en un
  // formulario.
  if (intencion === "varias") {
    const partes = [];
    for (const categoria of categoriasEn(texto)) {
      partes.push(await responderCategoria(categoria, lugar));
    }
    return partes.join("\n\n———\n\n");
  }

  if (intencion === "donar") {
    // Regla dura: el bot no dicta números de cuenta.
    //
    // Ya hay campañas falsas suplantando entidades por WhatsApp y SMS, y un
    // bot que recita una cuenta es el vector perfecto. Nombramos la
    // organización y mandamos a su sitio oficial, donde el número está bajo
    // el control de quien recibe la plata. Si el dato viaja por acá, tarde o
    // temprano viaja uno equivocado.
    const sitios = sitiosPara("donar", lugar);

    return (
      `Para donar dinero, andá siempre a la página oficial y sacá el dato de ahí:\n\n` +
      ORGANIZACIONES.map((o) => `• *${o.nombre}*\n  ${o.url}`).join("\n\n") +
      (sitios.length
        ? `\n\nY estas dos verifican los canales de mucha más gente:\n\n${sitios.map(fichaSitio).join("\n\n")}`
        : "") +
      `\n\n⚠️ No te fíes de cuentas que te lleguen por WhatsApp o SMS, ni siquiera reenviadas por alguien conocido. La Policía ya alertó de campañas falsas que suplantan entidades.\n\n` +
      `Yo nunca te voy a mandar un número de cuenta: si te llega uno a mi nombre, no soy yo.`
    );
  }

  if (TEXTOS[intencion]) return responderCategoria(intencion, lugar);

  if (intencion === "baja") {
    return (
      "Listo, no te escribo más. 👋\n\n" +
      "Si algún día querés volver, escribime y te suscribo otra vez en un mensaje."
    );
  }

  if (intencion === "cambiar") {
    const ciudades = Object.values(MUNICIPIOS)
      .map((c) => c.nombre)
      .join(", ");
    return `Decime en qué ciudad estás ahora y la cambio.\n\nPor ahora cubro: ${ciudades}.`;
  }

  if (intencion === "ayuda") {
    return (
      "Te aviso cuando tiemble en tu ciudad y te digo qué tan fuerte se sintió *ahí*. " +
      "Y te conecto con la ayuda, para los dos lados:\n\n" +
      "• *QUIERO AYUDAR* — llevar cosas, donar, sangre, voluntariado, alojamiento\n" +
      "• *NECESITO AYUDA* — buscar a alguien, mascota perdida, dónde dormir, reportar daños\n\n" +
      "También podés escribirme directo:\n" +
      "• *qué tan fuerte fue* — detalle del último sismo\n" +
      "• *réplicas* — si hubo réplicas y cuántas\n" +
      "• *cambiar* — para cambiar de ciudad\n" +
      "• *baja* — para dejar de recibir alertas\n\n" +
      "Un recordatorio: el aviso te llega después del temblor, no antes."
    );
  }

  const { principal, replicas } = await contextoSismico(lugar);

  if (!principal) {
    return `En los últimos 7 días no hubo ningún sismo que se sintiera en ${lugar.nombre}. Todo tranquilo por allá.`;
  }

  // toLocaleString ya cierra con punto ("7:34 a. m."); no agregar otro.
  const cuando = principal.hora.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });

  if (intencion === "replicas") {
    if (replicas.length === 0) {
      return (
        `Después del sismo M${principal.magnitud} del ${cuando} no ha habido réplicas que se sintieran en ${lugar.nombre}.\n\n` +
        `Si viene alguna, te aviso.`
      );
    }
    const mayor = replicas.reduce((a, b) => (b.magnitud > a.magnitud ? b : a));
    return (
      `Sí: ${replicas.length} réplica(s) del sismo M${principal.magnitud} del ${cuando}. La mayor fue M${mayor.magnitud}.\n\n` +
      `Las réplicas son normales y van bajando de intensidad con el tiempo.`
    );
  }

  // detalle / desconocida → el dato útil por defecto
  const alerta = evaluarAlerta(principal, lugar);
  const mmi = intensidadEn(principal, lugar);

  return (
    `El último que se sintió en ${lugar.nombre} fue un M${principal.magnitud} el ${cuando}\n\n` +
    `📍 Epicentro: ${principal.lugar}\n` +
    `📏 A ${alerta.distanciaKm} km de vos, ${Math.round(principal.profundidadKm)} km de profundidad\n` +
    `💥 En ${lugar.nombre} se sintió *${describirIntensidad(mmi).etiqueta}*\n\n` +
    (replicas.length > 0 ? `Después vinieron ${replicas.length} réplica(s).\n\n` : "") +
    `La magnitud (M${principal.magnitud}) es del sismo; lo que sentiste depende de qué tan lejos y qué tan hondo fue.\n\n` +
    `Fuente: USGS\n${principal.url}`
  );
}

async function enviarWhatsapp(telefono, texto) {
  const { stdout } = await ejecutar(KAPSO, [
    "whatsapp", "messages", "send",
    "--phone-number-id", PHONE_NUMBER_ID,
    "--to", telefono,
    "--text", texto,
    "--output", "json",
  ]);
  return JSON.parse(stdout).messages?.[0]?.id;
}

async function entrantesRecientes(horas = 24) {
  const desde = new Date(Date.now() - horas * 3_600_000).toISOString();
  const { stdout } = await ejecutar(KAPSO, [
    "whatsapp", "messages", "list",
    "--phone-number-id", PHONE_NUMBER_ID,
    "--direction", "inbound",
    "--since", desde,
    "--limit", "50",
    "--output", "json",
  ]);
  return JSON.parse(stdout).data ?? [];
}

export async function atenderPreguntas({ seco = false } = {}) {
  const suscriptores = await leerSuscriptores();
  const respondidos = await leerRespondidos();
  const mensajes = await entrantesRecientes();

  const nuevos = [];
  let atendidos = 0;

  for (const m of mensajes) {
    if (respondidos.has(m.id)) continue;

    const texto = m.text?.body;
    if (!texto) continue;

    // Solo contestamos a quien ya está suscrito: los nuevos los atiende el
    // workflow de onboarding, y responder los dos sería hablar encima.
    const sus = suscriptores.find((s) => s.telefono === m.from);
    if (!sus) continue;

    const lugar = normalizarMunicipio(sus.municipio);
    if (!lugar) continue;

    const intencion = clasificarIntencion(texto);
    const respuesta = await componerRespuesta(intencion, lugar, texto);

    if (seco) {
      console.log(`[seco] ${m.from} · "${texto}" → ${intencion}`);
      console.log(respuesta.replace(/^/gm, "    "), "\n");
    } else {
      const wamid = await enviarWhatsapp(m.from, respuesta);
      console.log(`→ ${m.from} · "${texto}" → ${intencion} · ${wamid}`);
      respondidos.add(m.id);
      nuevos.push(m.id);
    }
    atendidos++;
  }

  if (!seco) await marcarRespondidos(nuevos);
  if (atendidos === 0) console.log("Nada que responder.");
  return atendidos;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await atenderPreguntas({ seco: process.argv.includes("--seco") });
}
