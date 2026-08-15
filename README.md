# Centinela

Alertas sísmicas por WhatsApp para quien el teléfono no avisa.

El 10 de agosto de 2026 un M7.4 sacudió Colombia con epicentro en San José del Palmar, Chocó. Los Android sonaron segundos antes. Los iPhone no sonaron: **Apple solo opera alertas sísmicas en Estados Unidos y Taiwán.**

Centinela llena ese hueco por el único canal que todo el mundo ya tiene abierto. Y hace algo que ningún sistema hace hoy: te dice qué tan fuerte se sintió **donde vos estás**, no la magnitud en el epicentro.

## Lo que sí hace y lo que no

Este proyecto **no** es alerta sísmica temprana y no debe presentarse como tal.

Medido contra las APIs públicas: USGS publica un evento entre 93 y 186 segundos después del origen. La onda S llega a Cali desde el Chocó en ~43 s, a Medellín en ~51 s, a Bogotá en ~100 s. **La alerta siempre llega después del temblor.** Google puede avisar antes porque los 2.000 millones de Android *son* la red de sensores; ni la API pública ni WhatsApp cierran esa brecha.

Lo que sí aporta valor real:

| | Ventaja de tiempo | Valor |
|---|---|---|
| Confirmación del evento | ninguna | Corta el pánico y la desinformación cuando las redes colapsan |
| Réplicas | sí | Tras el M7.4 vinieron M5.0, M4.3, M4.2. La gente duerme en la calle días |
| Tsunami | 20–40 min en el Pacífico | Aquí la latencia es irrelevante y salva vidas |
| Intensidad personalizada | — | Un M4 a 10 km de Quibdó importa; el mismo M4 no le importa a Bogotá |

## Fuentes de datos

Todas verificadas en vivo el 15 de agosto de 2026.

| Fuente | Uso | Estado |
|---|---|---|
| USGS FDSN | Detección de eventos, latencia 93–186 s | ✅ operativa |
| EMSC Seismic Portal | Respaldo | ✅ operativa |
| PTWC / NOAA | Boletines de tsunami del Pacífico | ✅ operativa |
| SGC `catalogo_sismos` | — | ❌ congelado en dic-2020 |

El Servicio Geológico Colombiano no expone un feed público en tiempo real. Su catálogo ArcGIS tiene 16.290 registros y el último evento es del 30/12/2020; el resto son formularios PHP. Toca USGS + EMSC.

## La restricción que define la arquitectura

WhatsApp no deja empujar el primer mensaje.

Probado seis veces contra tres números y cuatro plantillas aprobadas: **toda plantilla de categoría MARKETING hacia alguien que nunca le ha escrito al negocio falla con error 131049** — *"not delivered to maintain healthy ecosystem engagement"*. No hay parámetro que lo evite; la condición de desbloqueo es un mensaje entrante.

Consecuencias de diseño, no negociables:

1. **El onboarding empieza con el usuario escribiendo primero.** Link `wa.me` o QR con mensaje precargado. Captar suscriptores empujándoles el primer mensaje no funciona: no llega ninguno.
2. **Toda alerta fuera de la ventana de 24 h va por plantilla UTILITY.** Las UTILITY están exentas del tope 131049. Ojo: Meta reclasifica — dos plantillas de este mismo proyecto pasaron de UTILITY a MARKETING solas.
3. **Dentro de la ventana de 24 h, texto libre y gratis.** Ahí vive la conversación: preguntas, explicaciones, derechos de petición.

### Costo

Colombia tiene una de las tarifas más bajas del mundo para plantillas *utility*: **≈ US$0,0008 por mensaje entregado**. Diez mil alertas cuestan 8 dólares. El canal no es el costo; el costo es la inferencia del modelo, y solo se paga sobre lo que ya pasó el filtro determinístico.

## Estructura

```
BACKLOG.md                      Backlog priorizado del hackathon
db/schema.sql                   Esquema de Supabase (idempotente)
src/db.js                       Persistencia: Supabase o archivos JSON
src/sismos.js                   Detección USGS + intensidad por ubicación
src/alertar.js                  Ciclo de alertas (agrupa réplicas)
src/responder.js                Preguntas de seguimiento
src/tsunami.js                  Boletines del PTWC para la costa Pacífica
src/directorio.js               Las 12 webs ciudadanas, con cobertura por zona
src/ingesta.js                  Trae los recursos de ayuda de las webs ciudadanas
src/fuentes/                    Un conector por web ciudadana
workflows/ayuda/                Menú: quiero ayudar / necesito ayuda
src/comparar.js                 Un sismo visto desde varias ciudades
workflows/onboarding/           Flujo de suscripción por WhatsApp
docs/ONBOARDING.md              Cómo se capta y por qué así
docs/DEMO.md                    Guion de demo, 3 minutos
docs/prd-contratacion.html      PRD de contratación pública (parqueado)
```

## Dónde llevar la ayuda

Después del sismo aparecieron catorce webs ciudadanas para coordinar la ayuda, cada una con su propio formulario y ninguna hablando con las otras. La pregunta que llega por WhatsApp no es «¿qué webs hay?», es «junté un mercado, ¿dónde lo llevo?».

Centinela responde eso con los datos de esas webs, no con los suyos: `src/ingesta.js` los trae cada media hora y `src/responder.js` contesta con el punto más cercano, qué recibe y cuándo se verificó.

```
Vos · donde dono

Centinela · Esto es lo que tengo cerca de Pereira:

  *Complejo Bodeguero Alpaca — Bodega 01* ✓
  _Tigresas de la Patria — «Colombia un solo corazón»_
  📍 Vía La Romelia – El Pollo, Vereda Santa Ana Baja, Pereira, Risaralda
  📏 a 6.5 km de vos
  🕐 8:00 a. m. – 12:00 m. y 2:00 – 6:00 p. m.
  🔴 Más urgente: Agua potable, Alimentos no perecederos, Elementos de aseo
  📞 +573105289438
  Verificado el 12 de ago · emergency-rosy
```

### Dos puertas, no una lista de diez cosas

Quien viene a dar y quien viene a pedir están en momentos opuestos: al primero le sobra tiempo, al segundo no. Por eso el menú abre con dos botones y no con un listado único, que obligaría al damnificado a leer opciones de donación para llegar a la suya.

**Quiero ayudar** → llevar cosas · donar dinero · donar sangre · ser voluntario · ofrecer alojamiento
**Necesito ayuda** → buscar a alguien · mascota perdida · dónde dormir · ayuda económica · reportar daños

Los títulos de los botones son exactamente las frases que reconoce el clasificador, así que tocar una fila y escribirla a mano entran por el mismo camino. El workflow solo abre la puerta; la respuesta la compone `src/responder.js`, que sí puede consultar los acopios cercanos.

### La regla: primero un lugar, después una web

Ante cada categoría el bot busca un sitio físico al que puedas ir hoy. Si no hay ninguno cerca, manda a la web **que cubre tu zona**, no a cualquiera: mandar a alguien de Tumaco a una plataforma del Eje Cafetero es peor que no responder.

Y cuando ninguna cubre su zona, lo dice y nombra igual la que existe, con su límite: *"Techo Cafetero — por ahora solo cubre Pereira y Armenia"*. Callárselo dejaría a quien ofrece una habitación en Quibdó creyendo que su ofrecimiento no le sirve a nadie.

Toda respuesta lleva fuente y fecha de verificación. No es adorno: media pregunta que llega es «¿esto es real?», y con campañas falsas circulando por WhatsApp, un dato sin procedencia vale menos que ninguno.

**El bot nunca dicta un número de cuenta.** Ante «¿a qué cuenta consigno?» nombra la organización y manda a su sitio oficial, donde el número lo controla quien recibe la plata. Hay una prueba que falla si alguien agrega uno.

| Fuente | Qué aporta | Estado |
|---|---|---|
| [Centros de Acopio Colombia](https://emergency-rosy.vercel.app) | 145 acopios en 27 departamentos, con GPS, horario y qué recibe cada uno | ✅ conectada |
| [Cuidar a Colombia](https://cuidarcolombia.vercel.app) | 219 registros: donaciones, bancos de sangre, afectación | en el directorio |
| [Colombia Te Busca](https://colombiatebusca.com) · [Encontrados](https://encontrados.co) | 5.416 y 4.900+ personas reportadas | en el directorio |
| [Ayuda Colombia](https://ayuda-colombia.vercel.app) | 146 mascotas perdidas, la única que las cubre | en el directorio |
| [Techo Cafetero](https://techocafetero.app) | Alojamiento temporal en el Eje Cafetero | en el directorio |
| [Help Them Directly](https://helpthemdirectly.org/es/) · [Colombia Hub](https://colombiahub.org) · [Mapa del Terremoto](https://www.mapadelterremoto.com) · [Mapa de Daños](https://terremotovenezuela.com) · [Colombia Te Amo](https://colombiateamo.com) · [Asocapitales](https://asocapitales.co/terremoto-colombia.html) | Donación directa, diáspora, voluntariado, daños | en el directorio |

*Conectada* = el bot lee sus datos cada media hora y responde con direcciones concretas.
*En el directorio* = el bot la recomienda según la zona y la necesidad, pero todavía no raspa sus datos.

`recursos` es una sola tabla polimórfica con un `tipo`, y la vista `recursos_unicos` se queda con la fila verificada más reciente por nombre. Ahí está el punto: cuando cinco webs listen el mismo acopio, la gente verá uno.

## Parqueado

Este proyecto nació mirando contratación pública del SECOP II. Ese frente tiene PRD completo en `docs/prd-contratacion.html` y cuatro señales de riesgo ya validadas contra datos reales — quedó fuera del alcance por decisión de producto, no por falta de viabilidad.

## Desarrollo

```bash
pnpm install
pnpm test                          # autochequeo de geometría y umbrales

node src/alertar.js --seco         # ciclo de alertas sin enviar nada
node src/alertar.js                # revisa y envía de verdad
node src/alertar.js --desde 8000   # reproduce un evento real (para la demo)

node src/responder.js --seco       # clasifica preguntas entrantes, sin enviar
node src/responder.js              # responde de verdad
node src/comparar.js --dias 10     # un sismo visto desde varias ciudades

node src/ingesta.js --seco         # extrae los recursos de ayuda, sin guardar
node src/ingesta.js                # extrae y guarda
node src/migrar.js                 # data/*.json → Supabase (idempotente)

kapso build                        # compila workflows/**/workflow.ts a JSON
kapso push                         # publica en Kapso (queda en draft)
```

Cinco piezas:

- **`workflows/onboarding`** — se dispara con cualquier mensaje entrante, ofrece la lista de ciudades y confirma la suscripción. Detalle en [`docs/ONBOARDING.md`](docs/ONBOARDING.md).
- **`src/alertar.js`** — consulta el USGS, calcula la intensidad en el municipio de cada suscriptor y le escribe solo a quien lo sintió. Agrupa las réplicas en un mensaje.
- **`src/tsunami.js`** — vigila los boletines del PTWC y avisa a la costa Pacífica. Es el único aviso del sistema donde la persona todavía puede moverse a tiempo.
- **`src/responder.js`** — contesta con datos: *¿qué tan fuerte fue?*, *¿hubo réplicas?*, *¿dónde dono?*, *¿dónde dono sangre?*, *cambiar*, *baja*.
- **`src/ingesta.js`** — recorre los conectores de `src/fuentes` y deja los recursos de ayuda al día.

### Persistencia

Sin variables de entorno todo se guarda en `data/*.json` y el repo corre igual que antes. Con `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` se usa Supabase, que es lo que hay que hacer en cuanto esto salga de una máquina:

```bash
psql "$SUPABASE_DB_URL" -f db/schema.sql
node src/migrar.js                 # sube los data/*.json que ya existan
```

No es una preferencia de estilo. En serverless el filesystem es efímero y cada invocación puede caer en otra instancia, así que un suscriptor guardado en una petición puede no existir en la siguiente, y `enviados` —la clave que evita repetir una alerta— se reinicia sola. El fallo es intermitente y silencioso: alguien deja de recibir alertas, o las recibe cinco veces a las 3 de la mañana.

### Verificado de punta a punta

Reproduciendo el M7.4 del 10 de agosto sobre un suscriptor en Quibdó:

```
→ 573223224730 (Quibdó) MMI 4.8 · delivered
```

> ⚠️ Sismo M7.4 detectado
> 📍 5 km S of San José del Palmar, Colombia
> 🕐 7:34:28 a. m. · 110 km de profundidad
> **En Quibdó se sintió moderado** (a 152 km del epicentro).

El mismo evento le habría dicho *fuerte* a Pereira y *leve* a Bogotá. Las réplicas M5.0 y M4.2, profundas, no habrían despertado a nadie.

## Estado

Prototipo funcional. El ciclo completo está verificado de punta a punta contra datos y teléfonos reales: detección, cálculo de intensidad, envío, agrupación de réplicas y respuesta a preguntas.

Falta activar el workflow de onboarding en Kapso y que Meta apruebe la plantilla UTILITY para poder alertar fuera de la ventana de 24 h. Lo siguiente con más valor es el aviso de tsunami en el Pacífico, que es el único caso con ventaja de tiempo real.
