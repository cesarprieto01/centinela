import { START, Workflow } from "@kapso/workflows";

// Número de WhatsApp "Melo" (+1 555-307-5027)
const PHONE_NUMBER_ID = "1243233552205505";

const workflow = new Workflow("ayuda", {
  name: "Menú de ayuda: quiero ayudar / necesito ayuda",
});

// Se dispara cuando alguien escribe AYUDA (o toca el botón del menú). El
// onboarding sigue atendiendo a los que llegan por primera vez.
workflow.addTrigger({
  type: "inbound_message",
  phoneNumberId: PHONE_NUMBER_ID,
  matches: ["ayuda", "menu", "menú", "opciones"],
});

workflow.addNode(START, { position: { x: 100, y: 100 } });

// Dos puertas, no una lista de diez cosas.
//
// Quien viene a dar y quien viene a pedir están en momentos opuestos: al
// primero le sobra tiempo, al segundo no. Meterlos en el mismo menú obliga al
// damnificado a leer opciones de donación para llegar a la suya.
workflow.addNode("puertas", {
  type: "send_interactive",
  interactiveType: "buttons",
  bodyText:
    "¿Con qué te ayudo?\n\n" +
    "Si querés aportar, te digo dónde y qué se necesita.\n" +
    "Si lo estás pasando mal, te conecto con quien puede echarte una mano.",
  footerText: "Podés volver acá escribiendo AYUDA",
  buttons: [
    { id: "quiero_ayudar", title: "Quiero ayudar" },
    { id: "necesito_ayuda", title: "Necesito ayuda" },
  ],
  position: { x: 100, y: 220 },
});

workflow.addNode("elegir_puerta", {
  type: "wait_for_response",
  saveResponseTo: "puerta",
  position: { x: 100, y: 340 },
});

// Los títulos de estas filas son exactamente las frases que reconoce
// `clasificarIntencion` en src/responder.js. Cuando alguien toca una fila,
// WhatsApp manda su título como si lo hubiera escrito, así que el bot lo
// atiende por el mismo camino que el texto libre y no hay que duplicar
// lógica ni consultar la base desde acá.
workflow.addNode("menu_ayudar", {
  type: "send_interactive",
  interactiveType: "list",
  headerType: "text",
  headerText: "¿En qué querés ayudar?",
  bodyText: "Elegí una y te digo dónde, según donde estés. Después podés pedirme otra.",
  footerText: "Todo lo que te paso lleva fuente y fecha",
  listButtonText: "Ver opciones",
  listSections: [
    {
      title: "Formas de ayudar",
      rows: [
        { id: "acopio", title: "Llevar cosas", description: "Mercado, ropa, aseo" },
        { id: "donar", title: "Donar dinero", description: "Canales verificados" },
        { id: "sangre", title: "Donar sangre", description: "Puntos y jornadas" },
        { id: "voluntariado", title: "Ser voluntario", description: "Poner el tiempo o el oficio" },
        { id: "alojamiento_ofrecer", title: "Ofrecer alojamiento", description: "Tengo un espacio libre" },
      ],
    },
  ],
  position: { x: -80, y: 460 },
});

workflow.addNode("menu_necesito", {
  type: "send_interactive",
  interactiveType: "list",
  headerType: "text",
  headerText: "¿Qué necesitás?",
  bodyText: "Elegí una y te paso a dónde acudir, lo más cerca que tenga.",
  footerText: "Si no hay nada cerca, te lo digo en vez de inventarlo",
  listButtonText: "Ver opciones",
  listSections: [
    {
      title: "Qué necesitás",
      rows: [
        { id: "buscar_persona", title: "Buscar a alguien", description: "Reportar o consultar" },
        { id: "mascota", title: "Perdí mi mascota", description: "Reportar o buscar" },
        { id: "alojamiento_necesito", title: "Necesito dónde dormir", description: "Alojamiento temporal" },
        { id: "necesito_dinero", title: "Necesito ayuda económica", description: "Publicar mi caso" },
        { id: "reportar_dano", title: "Reportar daños", description: "Mi casa o edificio" },
      ],
    },
  ],
  position: { x: 280, y: 460 },
});

workflow.addEdge(START, "puertas");
workflow.addEdge("puertas", "elegir_puerta");
workflow.addEdge("elegir_puerta", "menu_ayudar", { when: "{{vars.puerta}} == 'quiero_ayudar'" });
workflow.addEdge("elegir_puerta", "menu_necesito", { when: "{{vars.puerta}} == 'necesito_ayuda'" });

// A propósito no hay nodo después de las listas: la respuesta la compone
// src/responder.js, que sí puede consultar los acopios cercanos y el
// directorio de webs. El workflow solo abre la puerta.

export default workflow;
