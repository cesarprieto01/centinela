// Las webs ciudadanas que aparecieron tras el M7.4, como datos consultables.
//
// Después del sismo aparecieron catorce plataformas hechas por voluntarios,
// cada una con su formulario y ninguna hablando con las otras. Un hilo de
// r/Colombia lo resumió: "he visto 20 plataformas, ninguna está centralizada".
// Este archivo es el índice que falta: qué resuelve cada una y a quién sirve.
//
// La diferencia con `recursos` (src/db.js) importa:
//
//   - `recursos` son LUGARES físicos a los que se puede ir, con dirección y
//     GPS. Se raspan de las webs cada media hora y cambian todo el tiempo.
//   - esto son las WEBS mismas. Cambian poco, así que viven en código, y son
//     la respuesta cuando no hay ningún lugar físico cerca de la persona.
//
// Esa es la regla del bot: primero un sitio al que puedas ir hoy; si no hay
// ninguno cerca, la web que sí cubre tu zona.

/**
 * Cobertura de cada plataforma. Ninguna cubre el país entero de verdad, y
 * mandar a alguien de Tumaco a una web del Eje Cafetero es peor que no
 * responder: pierde el tiempo y deja de confiar en el bot.
 *
 * `categorias` es un mapa {categoria: rango}. El rango ordena DENTRO de esa
 * categoría, porque una misma web puede ser la mejor para una cosa y la
 * última para otra: Ayuda Colombia es la única que busca mascotas, y para
 * buscar personas es la más pequeña de las cuatro.
 *
 *   "nacional"   → sirve en todo el país
 *   [claves]     → solo estos municipios de MUNICIPIOS (src/sismos.js)
 *   "exterior"   → pensada para quien ayuda desde fuera de Colombia
 */
export const SITIOS = [
  // --------------------------------------------------------- desaparecidos
  {
    id: "colombiatebusca",
    nombre: "Colombia Te Busca",
    url: "https://colombiatebusca.com",
    categorias: { buscar_persona: 1 },
    cobertura: "nacional",
    que: "El registro ciudadano más grande: 5.416 personas reportadas y 1.137 ya localizadas. Podés publicar un caso con foto y generar un cartel para imprimir.",
    revisadoEnVivo: true,
  },
  {
    id: "encontrados",
    nombre: "Encontrados",
    url: "https://encontrados.co",
    categorias: { buscar_persona: 2 },
    cobertura: "nacional",
    que: "Además del registro ciudadano, cruza con las listas de Medicina Legal, así que es la que mejor cierra un caso. Los organismos de rescate suben fotos de personas halladas.",
    revisadoEnVivo: false,
  },
  {
    id: "asocapitales",
    nombre: "Asocapitales (oficial)",
    url: "https://asocapitales.co/terremoto-colombia.html",
    categorias: { buscar_persona: 3 },
    cobertura: "nacional",
    que: "El canal oficial de las alcaldías para reportar desaparecidos.",
    revisadoEnVivo: false,
  },
  {
    id: "ayudacolombia",
    nombre: "Ayuda Colombia",
    url: "https://ayuda-colombia.vercel.app",
    categorias: { mascota: 1, buscar_persona: 9 },
    cobertura: ["manizales", "cali", "pereira", "medellin"],
    que: "Busca personas y mascotas perdidas: 201 casos activos, 146 de ellos mascotas. Es la única que cubre mascotas.",
    revisadoEnVivo: true,
  },

  // ----------------------------------------------------------------- ayudar
  {
    id: "acopios",
    nombre: "Centros de Acopio Colombia",
    url: "https://emergency-rosy.vercel.app",
    categorias: { acopio: 1 },
    cobertura: "nacional",
    que: "145 centros en 27 departamentos, con horarios y qué recibe cada uno. Podés registrar uno que falte.",
    revisadoEnVivo: true,
  },
  {
    id: "cuidarcolombia",
    nombre: "Cuidar a Colombia",
    url: "https://cuidarcolombia.vercel.app",
    categorias: { sangre: 1, donar: 2, acopio: 2 },
    cobertura: "nacional",
    que: "Verifica cada dato con fuente y fecha, y publica cuándo lo va a revisar de nuevo. También desmiente las cadenas falsas de WhatsApp.",
    revisadoEnVivo: true,
  },
  {
    id: "colombiateamo",
    nombre: "Colombia Te Amo",
    url: "https://colombiateamo.com",
    categorias: { voluntariado: 2, donar: 3, sangre: 2, salud_mental: 1 },
    cobertura: "nacional",
    que: "Guía de ayuda mutua: dinero, alimentos, sangre, voluntariado y apoyo psicológico en un solo lugar.",
    revisadoEnVivo: false,
  },
  {
    id: "mapaterremoto",
    nombre: "Mapa del Terremoto",
    url: "https://www.mapadelterremoto.com",
    categorias: { voluntariado: 1, acopio: 3, reportar_dano: 2 },
    cobertura: "nacional",
    que: "Mapa abierto de daños, albergues y acopios. Tiene convocatoria para ingenieros, arquitectos y estudiantes que quieran apoyar la evaluación.",
    revisadoEnVivo: false,
  },
  {
    id: "helpthemdirectly",
    nombre: "Help Them Directly",
    url: "https://helpthemdirectly.org/es/",
    categorias: { donar: 1, necesito_dinero: 1 },
    cobertura: "nacional",
    que: "Conecta familias afectadas con quien quiere ayudarlas directamente. No recibe ni administra plata: cada donación va a la cuenta de la familia. También podés publicar tu propio caso.",
    revisadoEnVivo: true,
  },
  {
    id: "colombiahub",
    nombre: "Colombia Hub",
    url: "https://colombiahub.org/terremoto-colombia-2026-como-ayudar/",
    categorias: { donar: 1, acopio: 1 },
    cobertura: "exterior",
    que: "Pensada para colombianos fuera del país: organizaciones verificadas y acopios en Nueva York, Nueva Jersey y Florida.",
    revisadoEnVivo: true,
  },

  // ------------------------------------------------------ techo y daños
  {
    id: "techocafetero",
    nombre: "Techo Cafetero",
    url: "https://techocafetero.app",
    categorias: { alojamiento_ofrecer: 1, alojamiento_necesito: 1 },
    cobertura: ["pereira", "armenia"],
    que: "Conecta a quien perdió su casa con propietarios que tienen un espacio disponible en el Eje Cafetero.",
    revisadoEnVivo: false,
  },
  {
    id: "mapadanos",
    nombre: "Mapa de Daños",
    url: "https://terremotovenezuela.com",
    categorias: { reportar_dano: 1 },
    cobertura: "nacional",
    que: "Mapea daños estructurales edificio por edificio. Podés reportar el tuyo con hasta ocho fotos y hay grupos de WhatsApp por ciudad.",
    revisadoEnVivo: true,
  },
];

/**
 * Organizaciones para donar dinero.
 *
 * Van por nombre y sitio oficial, nunca por número de cuenta: con las
 * campañas falsas que ya reportó la Policía, un bot que recita cuentas es el
 * vector perfecto. El número lo controla quien recibe la plata, en su web.
 */
export const ORGANIZACIONES = [
  { nombre: "Cruz Roja Colombiana", url: "https://www.cruzrojacolombiana.org" },
  { nombre: "Fundación PLAN", url: "https://fundacionplan.org" },
  { nombre: "Bancos de Alimentos ABACO", url: "https://bancosdealimentos.org.co" },
];

/** Las dos puertas de entrada del menú de WhatsApp. */
export const MENUS = {
  ayudar: {
    titulo: "¿En qué querés ayudar?",
    opciones: [
      { id: "acopio", titulo: "Llevar cosas", detalle: "Mercado, ropa, aseo" },
      { id: "donar", titulo: "Donar dinero", detalle: "Canales verificados" },
      { id: "sangre", titulo: "Donar sangre", detalle: "Puntos y jornadas" },
      { id: "voluntariado", titulo: "Ser voluntario", detalle: "Poner el tiempo o el oficio" },
      { id: "alojamiento_ofrecer", titulo: "Ofrecer alojamiento", detalle: "Tengo un espacio libre" },
    ],
  },
  necesito: {
    titulo: "¿Qué necesitás?",
    opciones: [
      { id: "buscar_persona", titulo: "Buscar a alguien", detalle: "Reportar o consultar" },
      { id: "mascota", titulo: "Perdí mi mascota", detalle: "Reportar o buscar" },
      { id: "alojamiento_necesito", titulo: "Necesito dónde dormir", detalle: "Alojamiento temporal" },
      { id: "necesito_dinero", titulo: "Necesito ayuda económica", detalle: "Publicar mi caso" },
      { id: "reportar_dano", titulo: "Reportar daños", detalle: "Mi casa o edificio" },
    ],
  },
};

/** Categorías que además tienen lugares físicos raspados en `recursos`. */
export const TIPO_RECURSO = {
  acopio: "acopio",
  sangre: "sangre",
  donar: "donacion",
  alojamiento_necesito: "albergue",
};

/**
 * Las webs que sirven para esta categoría Y para donde está la persona.
 *
 * El orden importa: primero lo que cubre su zona específicamente, después lo
 * nacional. Una web hecha para el Eje Cafetero le sirve más a alguien de
 * Pereira que una nacional; a alguien de Tumaco no le sirve de nada.
 */
/**
 * La clave del municipio, venga o no ya calculada.
 *
 * `normalizarMunicipio` la agrega, pero quien llame con una entrada cruda de
 * MUNICIPIOS no la trae, y sin ella la cobertura regional se vacía en
 * silencio: el bot dejaría de ofrecer Techo Cafetero justo en Pereira, que es
 * donde sirve. Derivarla acá evita que ese fallo dependa de por dónde entró.
 */
function claveDe(lugar) {
  if (lugar?.clave) return lugar.clave;
  if (!lugar?.nombre) return null;
  return lugar.nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

export function sitiosPara(categoria, lugar) {
  const clave = claveDe(lugar);

  return SITIOS.filter((s) => categoria in s.categorias)
    .filter((s) => {
      if (s.cobertura === "nacional") return true;
      // Las del exterior no se ofrecen a quien está en Colombia: su valor es
      // para la diáspora, y acá solo sería ruido.
      if (s.cobertura === "exterior") return false;
      return clave ? s.cobertura.includes(clave) : false;
    })
    .sort((a, b) => {
      // Primero el rango dentro de esta categoría: un registro nacional de
      // 5.416 personas va antes que uno regional de 55, aunque el regional
      // cubra justo su ciudad. Después, a igual rango, gana el más local.
      const rango = (s) => s.categorias[categoria] ?? 99;
      const local = (s) => (s.cobertura === "nacional" ? 1 : 0);
      return rango(a) - rango(b) || local(a) - local(b);
    });
}

/** Las pensadas para quien ayuda desde fuera del país. */
export function sitiosExterior(categoria) {
  return SITIOS.filter(
    (s) => s.cobertura === "exterior" && categoria in s.categorias
  );
}

/** Todas las de una categoría, sin filtrar por zona. */
export function sitiosDeCategoria(categoria) {
  return SITIOS.filter((s) => categoria in s.categorias).sort(
    (a, b) => (a.categorias[categoria] ?? 99) - (b.categorias[categoria] ?? 99)
  );
}

/**
 * Cómo se describe la cobertura de un sitio, para poder decirlo en voz alta.
 *
 * Sirve para el caso incómodo: alguien de Quibdó ofrece una habitación y la
 * única plataforma de vivienda cubre el Eje Cafetero. Decirle "existe pero no
 * llega a tu zona" es información útil; quedarse callado lo deja pensando que
 * su ofrecimiento no le sirve a nadie.
 */
export function describirCobertura(sitio, nombresPorClave = {}) {
  if (sitio.cobertura === "nacional") return "todo el país";
  if (sitio.cobertura === "exterior") return "colombianos en el exterior";
  const nombres = sitio.cobertura.map((c) => nombresPorClave[c] ?? c);
  return nombres.length > 1
    ? `${nombres.slice(0, -1).join(", ")} y ${nombres.at(-1)}`
    : nombres[0];
}
