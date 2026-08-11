# Investigación — Música ambiental gestionada por agente (FRC Gourmet)

**Fecha:** 2026-08-07
**Estado:** investigación / decisión pendiente. **No hay código escrito.**
**Pregunta original:** ¿podemos integrar música de ambiente controlada por un agente (por horario, día, clima, estilo) a FRC Gourmet? ¿Conviene como módulo del SaaS o como producto separado?

---

## 1. El problema real

Lo que hoy pasa en el local no es "falta música", son cuatro problemas distintos:

1. **Costo de curaduría continuo** — armar y renovar playlists consume tiempo del dueño, todas las semanas, para siempre.
2. **Pérdida de control de marca** — el que agarra el reproductor impone su gusto; se traba un artista y suena 3 horas; suena algo que no corresponde al horario/público.
3. **Ceguera de exposición** — el equipo deja de percibir la música (habituación), así que nadie corrige.
4. **No escala** — con 1 local es molesto; con 5 locales es imposible controlarlo manualmente.

A eso se suma un quinto problema que hoy está latente y nadie mira:

5. **Ilegalidad** — usar Spotify/YouTube Music en un local comercial viola los ToS de esas plataformas **y** el derecho de comunicación pública en Paraguay.

El diferencial no es "poner música". Es **automatizar la curaduría, blindar el control de marca y dejar al local legal** — con una señal que ningún proveedor de música tiene: **los datos del PdV**.

---

## 2. Hallazgo bloqueante #1 — Spotify y YouTube Music quedan descartados

### Legal
- Los **Spotify Developer Terms** prohíben explícitamente aplicaciones para **restaurantes, comercios, bares o retail**: Spotify es "personal, non-commercial use only".
- La cuenta personal (incluso Premium) está licenciada sólo para uso personal. Spotify puede terminar la cuenta.
- YouTube / YouTube Music: mismo problema (uso personal), y **no existe API pública** de YouTube Music.

### Técnico (aunque fuera legal, ya no se puede)
El 27-nov-2024 Spotify deprecó para apps nuevas justo los endpoints que servirían para curar:
`audio-features`, `audio-analysis`, `recommendations`, `related-artists`, `featured playlists`, previews de 30s.
Sólo siguen las apps que ya tenían quota extension antes de esa fecha, y sujeto a revisión. En 2026 endurecieron aún más los Developer Terms (riesgos de automatización/IA).

**Conclusión:** no se puede construir producto encima de Spotify ni de YouTube Music. Ni como atajo, ni como MVP. Si el sistema arranca así, se cae solo.

---

## 3. Hallazgo bloqueante #2 — Derechos de comunicación pública en Paraguay

Marco: **Ley 1.328/98** de Derecho de Autor y Derechos Conexos; **DINAPI** regula y exhorta al pago.

Tres sociedades de gestión colectiva autorizadas cobran por el mismo local:

| Sociedad | Qué representa |
|---|---|
| **APA** (Autores Paraguayos Asociados) | autores y compositores (afiliada a CISAC) |
| **AIE Paraguay** | intérpretes y ejecutantes |
| **SGP** | productores fonográficos |

APA factura con tres sistemas alternativos (art. 142 inc. 4 de la Ley 1.328/98): **porcentaje**, **UDA** (Unidad de Derecho de Autor) y **mínimo por persona**. **No publican montos** — hay que pedir el tarifario (021 445 300 / info@apa.org.py).

### El dato que cambia la estrategia
**Soundtrack Your Brand incluye licencias de ejecución pública sólo en EE.UU. y Canadá (ASCAP/BMI/GMR). En Latinoamérica NO.** O sea: pagar Soundtrack en Paraguay **no** exime de pagar APA + AIE + SGP.

En cambio, un catálogo **propietario** (Epidemic Sound, Jamendo, música generada por IA) concentra los tres derechos —master, conexos y composición— en un solo titular, y se comercializa como "sin PROs / sin sociedad de gestión".

> ⚠️ **A validar con abogado paraguayo antes de vender esto como argumento.** En varios países las sociedades de gestión reclaman con presunción de repertorio universal y la defensa es exhibir la licencia directa + el log de reproducción. Nuestro sistema puede generar ese log automáticamente (eso es, de hecho, una feature vendible).

**Oportunidad comercial:** hoy prácticamente todos los restaurantes de Asunción están infringiendo. "FRC Gourmet Música te deja legal y te ahorra el tarifario de las tres sociedades" es un argumento de venta más fuerte que "playlists lindas".

---

## 4. Proveedores viables (los que sí tienen API y licencia comercial)

| Proveedor | Catálogo | API / integración | Cubre ejecución pública en PY | Costo aprox. | Veredicto |
|---|---|---|---|---|---|
| **Soundtrack Your Brand** | comercial real (100M+ tracks, hits) — **disponible en Paraguay** | API GraphQL: queries/mutations/subscriptions; control por *sound zone* (play/pause, skip, volumen, playlist, monitoreo). SDK de partners bajo NDA (`sdk@soundtrack.io`). Rate limit por tokens (3.600, +50/s) | **No** (sólo US/CA) | ~USD 29–54 / zona / mes, sin descuento por volumen, **un player por zona** | Mejor catálogo. Pero exige *su* player por zona, licencia PY aparte, y los "visitantes" no pueden controlar playback |
| **Epidemic Sound** | propio, 55k tracks / 390 géneros — poseen 100% de los derechos | **Partner API** self-serve (API key inmediata) + producto **In-store**. Prohibido cachear metadata | **Sí** (in-store incluye public performance, 150+ países, "sin PROs") | in-store vía partner/reseller por territorio (no publicado); Business desde ~USD 30/mes | **El más prometedor.** Falta confirmar que el Partner API habilite reproducción in-venue desde *nuestro* player |
| **Feed.fm** | mayor + indie + royalty-free, pre-cleared | API B2B pensada para apps y dispositivos; gestionan licencias, reporting e **indemnización** | Parcial — advierten que **in-venue requiere licencia distinta** de la de app | no publicado | Fuerte en apps (fitness); consultar específicamente in-venue Latam |
| **Jamendo Licensing** | 250k tracks independientes, royalty-free | producto **In-store Radios** explícito (bares, restaurantes, retail) | **Sí** ("sin regalías a PRO ni sociedad local") | el más barato del lote | Buen MVP / plan de entrada. Sin hits conocidos |
| **Mubert** | **generativa (IA)**, infinita, 150+ moods | API pensada para apps/streams; música que nunca se repite | Sí (derechos de Mubert) | hasta ~USD 149/mes plan comercial | Sirve para fondo instrumental (café, brunch, spa). No sirve para un bar que quiere temas conocidos |

Competencia del vertical sin API relevante para nosotros: **Rockbot** (música + señalización + TV por zona, automatización por daypart), **Cloud Cover / Pandora**, **Jukeboxy** (curaduría humana), **Soundsuit**, **SoundMachine**. Casi todos US/EU.

**Novedad 2026:** *Tringbox* — startup de música de fondo con IA que hace "AI Vibe Check" (evalúa si un pedido encaja con la política del local, el público y la hora). Es lo más cercano a la idea, pero orientado a pedidos de canciones en venues, no a POS.

---

## 5. Dónde está nuestro diferencial (y es grande)

Todos los proveedores automatizan por **hora, día y temporada**. **Ninguno reacciona a lo que realmente está pasando en el salón**, porque ninguno tiene el POS. Nosotros sí:

| Señal que ya tenemos en FRC Gourmet | Uso musical |
|---|---|
| Mesas ocupadas / sectores activos | salón vacío vs lleno → energía |
| Comandas abiertas + tiempos del KDS | cocina saturada → bajar estímulo |
| Ritmo de ventas por minuto | detectar inicio y fin del pico real (no el horario teórico) |
| Ticket promedio y mix de categorías | café/postre vs cerveza → estilo distinto |
| Apertura/cierre de caja | inicio y cierre del día real |
| Delivery vs salón | delivery alto + salón vacío → música para el equipo, no para el cliente |
| RRHH / turnos | quién está en el salón |
| Feriados PY (ya sembrados) + clima (API externa) | programación estacional |

Base científica que respalda las reglas (Milliman; Caldwell & Hibbert 2002; literatura de retail):
- **Tempo lento → mayor permanencia** (hasta ~40% más de estadía) y más consumo de bebidas/cursos.
- **Tempo rápido → mayor velocidad de consumo** ("bites per minute" sube con el BPM).
- El efecto sobre **ventas** es mixto en la literatura; la permanencia es el hallazgo sólido. No prometer "+X% de ventas": prometer control, consistencia y rotación.

Uso práctico: **BPM alto en pico** (rotar mesas cuando hay cola) / **BPM bajo en valle** (retener y que consuman más). Eso hoy nadie lo hace automático porque nadie tiene el dato de ocupación.

---

## 6. Diseño propuesto del agente (3 capas)

Un LLM eligiendo canción por canción es caro, lento e impredecible. Diseño correcto:

**a) Política (configuración del dueño, no IA)**
Estilos permitidos/vetados, idiomas, artistas en lista negra, explicit filter, energía objetivo por franja y día, volumen máximo por zona/horario, tope de repetición (no repetir artista en X horas / track en Y días).

**b) Planificador (agente LLM, batch — 1 vez por día o semana)**
Genera el **plan de programación**: bloques horarios → estaciones/playlists con perfil objetivo (género, mood, BPM). Insumos: política + historial de ventas por franja + feriados + clima + feedback acumulado del staff. Costo: unas pocas llamadas por local por día → centavos. Reusa la infra de IA que ya tiene el sistema (importación de facturas con OCR).

**c) Runtime (reglas deterministas, sin IA — cada 2-5 min)**
Dentro del bloque vigente ajusta según ocupación y ritmo real: sube/baja energía objetivo, saltea track fuera de perfil, cambia de estación. Determinista = predecible, gratis y **funciona sin internet hacia la IA**.

**d) Feedback**
Botón "no va" en la PWA del mozo/encargado → mata el track/artista para ese local y esa franja. Y un dashboard **música ↔ ventas** por bloque (qué suena cuando vendemos mejor). Ese log, además, sirve como prueba documental frente a las sociedades de gestión.

---

## 7. Encaje con la arquitectura actual

Nada de esto pide arquitectura nueva:

- **Dominio nuevo** `src/app/database/entities/musica/`: `MusicaPolitica`, `ZonaAudio` (o reusar `Sector`), `BloqueProgramacion`, `PlanProgramacion`, `TrackLog`, `MusicaFeedback`. Credenciales del proveedor en **keytar** (como el apikey de Evolution API y el secret de customer-jwt).
- **Handlers** `electron/handlers/musica.handler.ts` + `ensurePermission` (`MUSICA_CONFIGURAR`, `MUSICA_CONTROLAR`, `MUSICA_VER`) — recordar que `/api/rpc` es default-allow.
- **Player**: ventana Electron oculta (o tab "Música") con `<audio>` en el nodo **server**; el PC del PdV ya está prendido todo el día. Control remoto desde la **PWA mobile** (el encargado desde el celular) y desde el desktop.
- **Estado en vivo**: **SSE**, exactamente el mecanismo que ya usa el KDS (`kds-sse-routes.ts`).
- **Migración** obligatoria (dual SQLite/Postgres), dashboards con el padrón `<app-dash-*>`, hoja en `MENU_TREE`.
- **Multi-local**: en modo server cada local ya es un nodo; la programación se define central y se replica.

**Riesgo técnico a resolver temprano:** el local sin internet se queda sin música. Casi todos los proveedores prohíben cachear. Hay que preguntar explícitamente por **descarga/caché local offline** — quien lo permita gana puntos (y es una ventaja concreta frente a Spotify, que también muere sin internet en modo público).
Segundo riesgo: **iOS no permite audio en background confiable en PWA** → el player debe ser el desktop/Electron o un Android dedicado, no un iPhone.

---

## 8. ¿Módulo de FRC Gourmet o producto separado?

**Recomendación: módulo dentro de FRC Gourmet, activable por feature flag/licencia, pero con el core desacoplado para poder empaquetarlo aparte después.**

Por qué:
- El diferencial **es** la data del PdV. Sin POS somos "un servicio más de música para negocios" compitiendo contra Soundtrack y Rockbot, que tienen catálogo, contratos y 10 años de ventaja. Con POS, no tenemos competencia directa.
- Como módulo es **upsell puro** sobre clientes que ya pagan, con costo de adquisición cero.
- Como producto separado habría que montar venta, soporte y contratos de música desde cero.

Dos modelos de negocio posibles para el catálogo:

| Modelo | Cómo | Pro | Contra |
|---|---|---|---|
| **A — Orquestador** | El cliente contrata Soundtrack/Epidemic a su nombre; nosotros sólo controlamos vía API | Rápido, sin riesgo legal ni de cobranza | Margen chico; dependemos de que el cliente contrate; Soundtrack exige su player por zona |
| **B — Reseller/partner** | Somos partner de Epidemic o Jamendo y facturamos música + software en una sola cuota | Margen real, una sola factura para el cliente, control total del player | Nos volvemos responsables de licencia, reporting y cumplimiento |

**B es el que vale la pena** si el acuerdo de partner cierra. Empezar con A en el piloto para no bloquearse.

Y si algún día se vende suelto: mismo código, empaque reducido (programación por horario/día/clima sin señales de POS).

---

## 9. Qué hay que averiguar ANTES de escribir código (F0, 1–2 semanas, sin desarrollo)

1. **Tarifario APA + AIE + SGP** para un restaurante de tu tamaño (021 445 300 / info@apa.org.py). Define el ahorro concreto que vendemos.
2. **Abogado PY**: ¿una licencia directa de catálogo propietario (Epidemic/Jamendo) libera de las tres sociedades? ¿Qué prueba exigen?
3. **Epidemic Sound** — contacto in-store + partner/reseller para Paraguay: ¿el Partner API habilita reproducción in-venue desde player propio? ¿precio por local? ¿caché offline? ¿white-label?
4. **Soundtrack Your Brand** (`sdk@soundtrack.io`): NDA + SDK, precio real en PY, si podemos ser canal de reventa.
5. **Jamendo In-store Radios** — precio, API, offline. Es el plan B barato para MVP.
6. **Feed.fm** — condiciones para in-venue en Latam.
7. Definir el **precio del módulo** (referencia: la competencia cobra USD 29–54 por zona/mes; hay lugar para USD 15–25/local si el catálogo es propietario).

## 10. Fases de implementación (después de F0)

- **F1 — Piloto en tu local, sin IA.** Player + zonas + política + programación por franja/día + control desde la PWA + log de reproducción. Ya resuelve ~80% del dolor (renovación automática, nadie toca el reproductor, nada de un artista 3 horas).
- **F2 — Agente.** Planificador LLM (plan diario/semanal) + runtime reactivo con señales de ocupación/ritmo + botón "no va" del staff.
- **F3 — Multi-local + analítica.** Programación central replicada, dashboard música↔ventas, A/B por bloque horario.
- **F4 — Empaque comercial.** Feature flag, precio, contrato de música, onboarding.

---

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Las sociedades de gestión PY cobran igual pese a la licencia directa | Validación legal en F0; log de reproducción como prueba |
| Catálogo royalty-free sin hits → rechazo del equipo y de los clientes | Probar en el piloto con el equipo real antes de vender; considerar Soundtrack para locales que exijan hits |
| Costo por zona erosiona el margen | Modelo B (partner) y/o catálogo propietario más barato |
| Caída de internet deja el local en silencio | Exigir caché offline al proveedor; fallback a un set local licenciado |
| iOS/PWA no reproduce en background | El player vive en el desktop Electron o Android dedicado |
| "La música es opinión": el dueño va a querer meter mano | Override inmediato desde la PWA (skip, cambiar bloque, vetar artista) sin romper el plan |
| Dependencia de un solo proveedor | Capa de abstracción `ProveedorMusica` desde el día 1 (como el dual driver de BD) |

---

## 12. Veredicto

- **Spotify / YouTube Music: descartados definitivamente** (legal y técnicamente).
- **Sí hay camino viable**: catálogo propietario licenciado (Epidemic o Jamendo) + player propio + agente de programación.
- **El valor no está en la música, está en el cerebro conectado al PdV.** Eso no lo tiene ningún competidor hoy.
- **Como módulo de FRC Gourmet**, no como producto separado — al menos hasta tener tracción.
- **Riesgo principal: comercial/legal, no técnico.** Por eso F0 es teléfono y abogado, no código.

---

## Fuentes

- [Spotify Developer Terms](https://developer.spotify.com/terms) · [Compliance Tips](https://developer.spotify.com/compliance-tips)
- [Introducing some changes to our Web API (27-nov-2024)](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api) · [Music Ally: Spotify removes features from Web API](https://musically.com/2024/11/28/spotify-removes-features-from-web-api-citing-security-issues/) · [Techzine: stricter API rules](https://www.techzine.eu/news/devops/138608/spotify-puts-the-brakes-on-developer-mode-with-stricter-api-rules/)
- [Soundtrack: Can you use Spotify in a business?](https://www.soundtrack.io/blog/can-you-play-spotify-in-a-business/)
- [APA Paraguay — Licencias](https://www.apa.org.py/licencias/) · [Propiedad intelectual y sociedades de gestión colectiva](https://www.apa.org.py/2026/06/01/propiedad-intelectual-y-sociedades-de-gestion-colectiva/) · [DINAPI — Sociedades de Gestión Colectiva](https://www.dinapi.gov.py/portal/v3/derecho-de-autor/sociedades/) · [DINAPI exhorta al pago de regalías](https://www.dinapi.gov.py/portal/v3/noticias/detalle-noticia?idNoticia=68)
- [Soundtrack API docs](https://api.soundtrackyourbrand.com/v2/docs) · [Soundtrack SDK para partners](https://developer.soundtrackyourbrand.com/) · [Dónde está disponible Soundtrack](https://help.soundtrack.io/hc/en-us/articles/115002010051-Where-Soundtrack-is-available) · [Qué licencias necesito](https://help.soundtrack.io/hc/en-us/articles/115002049632-What-music-licenses-do-I-need) · [Planes](https://help.soundtrack.io/hc/en-us/articles/5003012145180-Learn-more-about-our-plans)
- [Epidemic Sound — Developers / Partner API](https://www.epidemicsound.com/business/developers/) · [In-store Music](https://www.epidemicsound.com/instore/instore-music/) · [Business music licensing](https://www.epidemicsound.com/how-it-works/business-music-licensing/) · [Partner API docs](https://developers.epidemicsite.com/docs/)
- [Feed.fm — Music API for businesses](https://www.feed.fm/music-api) · [Music licensing 101](https://www.feed.fm/music-licensing-101)
- [Jamendo Licensing — In-store Radios](https://licensing.jamendo.com/en/in-store)
- [Mubert API](https://mubert.com/api) · [Mubert License](https://mubert.com/render/license)
- [Rockbot — Music for business](https://rockbot.com/music-for-business) · [Soundsuit](https://soundsuit.fm/background-music-for-business-can-i-use-spotify-apple-pandora/)
- [Music Ally — Tringbox, AI background music para venues (jun-2026)](https://musically.com/2026/06/23/ai-background-music-startup-tringbox-is-also-working-with-live-venues/)
- Efecto del tempo: [The effect of tempo of background music on duration of stay and spending in a bar (PDF)](https://www.rybn.org/ANTI/ADMXI/documentation/ALGORITHM_DOCUMENTATION/HARMONY_OF_THE_SPEARS/BACKGROUND_MUSIC_STUDIES/EFFECT_ON_TIME_PERCEPTION/2009_The_effect_of_tempo_of_background_music_on_duration_of_stay_and_spending_in_a_bar.pdf) · [It is all in the mix: music tempo and mode on in-store sales](https://www.researchgate.net/publication/227451750_It_is_all_in_the_mix_The_interactive_effect_of_music_tempo_and_mode_on_in-store_sales) · [SoundMachine — volume & tempo in dining](https://sound-machine.com/blog/2025/08/20/how-volume-and-tempo-influence-dining-behavior/)
