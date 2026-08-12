# Música ambiental (Spotify Connect + IA)

Módulo que hace sonar la música del local sin que nadie la administre. Nació de un problema concreto del dueño: **no tiene tiempo de armar y renovar playlists**, y con un solo local ya es molesto — con varios, imposible.

Docs de producto: [`docs/INVESTIGACION-MUSICA-AMBIENTAL.md`](../../../../docs/INVESTIGACION-MUSICA-AMBIENTAL.md) (proveedores y restricciones legales/técnicas), [`docs/PLAN-MUSICA-SPOTIFY.md`](../../../../docs/PLAN-MUSICA-SPOTIFY.md) (arquitectura), [`docs/DISENO-OPERATIVO-MUSICA.md`](../../../../docs/DISENO-OPERATIVO-MUSICA.md) (cómo se configura y cómo decide la IA).

---

## 1. Las cinco decisiones que explican todo el diseño

Si vas a tocar este módulo, entendé esto primero. Cada una responde a una limitación real, no a una preferencia.

### 1.1 Nuestra app NO reproduce audio

El **Web Playback SDK de Spotify exige Widevine DRM**, que Electron no trae. El fork de castLabs sigue dando error 500 en `widevine-license`. Descartado.

**El player es la app de Spotify Desktop instalada en el PC del PdV**, controlada por Spotify Connect. FRC Gourmet es un **control remoto**. Consecuencias: Spotify tiene que estar abierto y logueado (hay handler `musica-abrir-spotify` que lo lanza con el protocolo `spotify:`), y una cuenta Premium reproduce en **un solo device a la vez**.

### 1.2 OAuth con PKCE y redirect loopback

- **PKCE sin `client_secret`**: el secret no se guarda en ningún lado. Solo persiste el refresh token, en **keytar**.
- **Redirect `http://127.0.0.1:<puerto>/callback`**: desde la migración de OAuth de nov-2025 Spotify exige HTTPS salvo loopback con IP explícita, y **prohíbe `localhost` como nombre**. Se levanta un listener HTTP efímero solo durante la autorización.
- **Una app de Spotify por local**: Extended Quota exige 250.000 usuarios activos mensuales — inalcanzable. Cada local crea su app en Development Mode (5 usuarios, owner Premium) y carga su `client_id` en Configuración.

### 1.3 Spotify es catálogo + parlante; el cerebro es nuestro

La API fue podada dos veces:

| Cuándo | Qué murió |
|---|---|
| nov-2024 | `recommendations`, `related-artists`, `audio-features`, `audio-analysis`, `featured playlists`, previews de 30s |
| feb-2026 | endpoints bulk de catálogo, `artist top tracks`, campo `popularity`, **`search` bajó de 50 a 10 resultados**, playlists `tracks`→`items` |

Por eso el repertorio vive en **nuestra** tabla `musica_tracks` y las características (BPM, valencia) vienen de fuera.

### 1.4 El día se resuelve UNA vez, en playlists reales

El plan diario se materializa en **playlists de Spotify** (3 variantes de energía por bloque, sobreescritas cada día sobre el mismo `playlistId`). El runtime **no elige tema por tema**.

Razones, por peso:
1. **Si FRC Gourmet se cierra, se cuelga o se actualiza, la música sigue sonando.** Con una cola gestionada en vivo, moría con la app.
2. ~6-10 llamadas a la API por día en vez de miles.
3. El día queda auditable y editable antes de sonar.

### 1.5 El LLM descubre, Spotify resuelve

Es el corazón del módulo. Como Spotify ya no recomienda, **el criterio musical lo pone el LLM** (que conoce catálogo y escenas) y `search` solo convierte "artista — tema" en un track real — que es justo para lo que sigue sirviendo.

---

## 2. Mapa de archivos

| Archivo | Rol |
|---|---|
| `electron/services/musica-estilos.service.ts` | Catálogo canónico, alias, **resolución de estilo por precedencia** (`resolverEstilo` / `aplicarResolucion` / `RELACIONES_ESTILO`), reclasificación, desacuerdos, mezcla por bloque y cálculo de déficit |
| `electron/services/musicbrainz.service.ts` | Género por ISRC (género de grabación, no de artista) |
| `electron/services/spotify.service.ts` | OAuth PKCE, listener loopback, refresh con rotación, wrapper de API con reintento en 401 y `Retry-After` en 429, operaciones de player |
| `electron/services/musica-pool.service.ts` | Importa semillas (playlist/artista/track/biblioteca) al repertorio |
| `electron/services/musica-descubrimiento.service.ts` | Prompt + OpenAI + resolución en Spotify + filtros. También `rechazarTrack` |
| `electron/services/musica-features.service.ts` | ReccoBeats (BPM/energía/valencia) + etiquetado semántico con LLM en lote |
| `electron/services/musica-brief.service.ts` | Brief en texto → grilla semanal completa (F1.5) |
| `electron/services/musica-agente.service.ts` | Planificador diario: ajusta el perfil de cada bloque (F3) |
| `electron/services/musica-salon.service.ts` | Señales del PdV: ocupación, ritmo de ventas, ventas por franja |
| `electron/services/musica-planner.service.ts` | Genera el plan y materializa las playlists. `getBloqueVigente` |
| `electron/services/musica-runtime.service.ts` | Heartbeat de 2 min: cambio de bloque, watchdog, modo manual, `TrackLog` |
| `electron/server/musica-sse-routes.ts` | Stream SSE `/api/musica/stream` |
| `electron/utils/musica-events.utils.ts` | Emisor de eventos (IPC + EventEmitter para el SSE) |
| `electron/utils/stream-token.utils.ts` | **Tokens efímeros de stream — compartido con el KDS** |
| `electron/handlers/musica.handler.ts` | ~30 handlers, todos con `ensurePermission` |
| `electron/utils/musica-presets.ts` | Preset `RESTAURANTE_BAR` (grilla semanal completa + vetos) |
| `electron/utils/musica-secrets.util.ts` | Refresh token en keytar |
| `src/app/pages/configuracion/musica/` | 5 pestañas: Reproductor · Mi estilo · Repertorio · **Estilos** · Programación |
| `src/app/shared/components/musica-control-dialog/` | Control rápido desde el header del PdV (gemelo del de la PWA) |
| `projects/mobile/src/app/pages/musica/` | Control principal en la PWA |
| `src/app/database/entities/musica/` | 8 entidades |

**Entidades:** `MusicaSemilla`, `MusicaTrack`, `MusicaVeto`, `BloqueProgramacion`, `PlanProgramacion`, `PlanBloque`, `TrackLog`, `MusicaFeedback`, `MusicaEstilo`, `MusicaEstiloAlias`, `BloqueEstiloMezcla`.

**Migraciones:** `1786378422682-MusicaAmbiental` (8 tablas), `1786383979096-MusicaOpcionesAvanzadas` (opciones por bloque), `1786475808081-MusicaCatalogoEstilos` (catálogo, alias, mezcla + columnas en tracks y vetos), `1786563231306-MusicaClasificacionSemantica` (3 columnas de opinión + backfill, normalización del vocabulario ya guardado, `animosEvitar` / `escenaPreferida` en el bloque).

**Permisos:** `MUSICA_VER` (mozos) · `MUSICA_CONTROLAR` (cajero/gerente/admin: controlan y votan) · `MUSICA_CONFIGURAR` (gerente/admin).

---

## 3. Reglas del generador (y por qué)

| Regla | Por qué existe |
|---|---|
| Máx N temas por artista por bloque, **configurable y `null` = sin límite** | Mata el "se trabó un artista y sonó 3 horas". Es **por bloque** porque en covers bossa repetir intérprete es lo esperado y en la noche de rock es el bug |
| Nunca dos del mismo artista seguidos (toggle por bloque) | Idem, aun con cupo disponible |
| Ventana anti-repetición (3 días por defecto) | Ataca la habituación del equipo |
| Playlist 1,5× la duración del bloque | Si se agota, **Spotify arranca su autoplay de recomendaciones** — justo lo que el módulo evita |
| Si el filtro estricto no junta material, **se relaja y se avisa** | Una playlist corta es peor que un tema levemente fuera de perfil (ver punto anterior) |
| Desempate aleatorio sobre el score | Dos días con el mismo pool no dan la misma playlist |

**Fecha del plan en hora local, nunca `toISOString()`**: en Paraguay (UTC-3) el plan de las 21:00 del sábado se guardaría como domingo y el local sonaría con la grilla equivocada toda la noche.

---

## 3.1 Streams SSE y tokens efímeros (compartido con el KDS)

`EventSource` **no permite mandar headers**, así que el token va por query. Mandar ahí el JWT de sesión —como hacía el KDS— lo deja escrito en logs de acceso, historial del navegador y proxies, y ese token sirve para **todo** `/api/rpc`.

Por eso existe `stream-token.utils.ts`: un token aparte con tres límites que el de sesión no tiene.

| Límite | Valor | Por qué |
|---|---|---|
| Vida | 60 s | solo para **abrir**; el stream ya abierto sigue vivo aunque el token venza |
| Usos | 1 (nonce consumido) | reusarlo desde un log no sirve |
| Alcance | `kds` \| `musica` | no abre el RPC |

HMAC-SHA256 sobre el secreto de keytar, comparación en tiempo constante. Se pide por RPC autenticado (`stream-token`) y **esto habilitó SSE en la PWA**, que antes no podía usarlo por no tener el token a mano.

**Reconexión:** el token se consume al abrir, así que reconectar exige pedir uno nuevo — el cliente cierra el `EventSource` y reintenta con backoff (15-20 s). El poll de respaldo (60 s en música, 12 s en KDS) cubre el hueco: **nunca se depende solo del stream**.

**Ojo con proxies:** SSE se rompe si algo bufferea la respuesta. Va `X-Accel-Buffering: no` y heartbeat de 25 s, pero **falta probarlo a través del túnel Cloudflare** — en localhost siempre funciona.

## 3.bis Catálogo de estilos (F4) — el vocabulario único

**El problema que resuelve.** El módulo tenía **cuatro vocabularios que no se hablaban**:

| Quién | Vocabulario | Origen |
|---|---|---|
| Los temas | `MPB`, `ELECTRÓNICA`, `ELECTRONIC`… (59 valores) | Spotify, géneros **de artista** |
| La grilla | `BOSSA N' ROSES`, `ELECTRÓNICA SUNSET` | inventado por el LLM al leer el brief |
| Los vetos | strings sueltos comparados con `includes()` | manual |
| El descubrimiento | los de la grilla | — |

Dos consecuencias verificadas contra la base real:

1. **`generosPreferidos` del bloque NUNCA se leyó en el planner.** Configurar "almuerzo: bossa" no tenía ningún efecto sobre lo que sonaba — la playlist se armaba solo por BPM + valencia + score + azar. Y aunque se leyera, no habría matcheado: los nombres de la grilla tenían **cero temas** cada uno.
2. **El veto por género vetaba de más**: `FUNK` mataba al funk americano por culpa de `FUNK BRASILEIRO`.

**El modelo.**

| Tabla | Rol |
|---|---|
| `musica_estilos` | vocabulario canónico del local (nombre único) |
| `musica_estilo_alias` | **capa anticorrupción**: género crudo normalizado → estilo, con **UNIQUE en `valor`** |
| `musica_bloque_estilo_mezcla` | `(bloque, estilo, porcentaje)` — la receta de cada bloque |
| `musica_tracks.estilo_id` + `estiloFijado` | estilo resuelto y **persistido**; `estiloFijado` protege la curación manual |
| `musica_vetos.estilo_id` + `TipoVeto.ESTILO` | veto por id, sin ambigüedad de strings |

El UNIQUE en `alias.valor` es la pieza clave: hace **imposible** que un género crudo apunte a dos estilos, que es como se degradan estas tablas sin restricción.

**Cascada de clasificación**, en orden de precisión y costo:

```
1. Spotify /artists/{id}   → género de ARTISTA     gratis, grueso
2. MusicBrainz por ISRC    → género de GRABACIÓN   1 req/seg, preciso
3. Alias                   → traduce al catálogo   gratis
4. Herencia por artista    → gratis, determinista
5. LLM (en el etiquetado)  → elige de la lista CERRADA, nunca inventa
```

## 3.ter Tres opiniones y una resolución (2026-08-12)

**El problema.** Con **una sola** columna `estilo_id`, la última capa en correr pisaba a las anteriores. Como la reclasificación por género corre **después** del etiquetado, el veredicto del LLM se revertía en la corrida siguiente, en silencio.

Eso hacía **estructuralmente imposible** una distinción que el local sí necesita: *bossa covers* vs *bossa clásica* son el mismo género (`BOSSA NOVA`) y solo se distinguen entendiendo el tema. El `UNIQUE` de `alias.valor` —que es lo que impide que la tabla se pudra— es a la vez lo que impide expresar "un género, dos estilos".

**El modelo.** Tres columnas de opinión + una resuelta:

| Columna | Quién escribe | Gana porque |
|---|---|---|
| `estilo_manual_id` | el dueño (`fijarEstiloTrack`) | ya miró ese tema |
| `estilo_agente_id` | el LLM (`etiquetarTracks`) | es el único que **entiende** el tema |
| `estilo_genero_id` | alias + herencia (`reclasificarPool`) | barato, estable, reproducible |
| `estilo_id` | **`aplicarResolucion()`** | valor resuelto; es el único que lee el planner |

`resolverEstilo()` es la regla, y vive en **un solo lugar**: `manual ?? agente ?? genero`. Toda escritura de cualquiera de las tres tiene que pasar por `aplicarResolucion()` — si cada capa recalculara por su cuenta, en meses `estilo_id` no coincidiría con ninguna fuente y nadie sabría por qué.

**Consecuencia práctica:** `Clasificar` dejó de ser destructivo. Se puede correr en cualquier orden y cuantas veces se quiera.

**Los desacuerdos son la cola de curación.** Donde `estilo_agente ≠ estilo_genero` casi siempre hay una distinción que la taxonomía de géneros no sabe expresar. `desacuerdosDeEstilo()` los lista y la pestaña Estilos los muestra. Se arma sola.

**La descripción del estilo va al prompt.** Sin ella el modelo recibe solo nombres y no tiene con qué elegir entre dos estilos del mismo género.

## 3.quater Ejes semánticos: ánimo y momento

El etiquetador ya completaba `ambiente`, `escenas`, `familiaridad` e `idioma` — **al 100% del repertorio** — y **ninguna línea del backend los leía**. Mientras tanto el planner seleccionaba por BPM y valencia, que ReccoBeats cubre al 87% y que no distinguen una balada linda de una de despecho.

El brief del local dice *"nada triste"* y había **45 temas `MELANCOLICO`** sonando: la regla estaba escrita y no se aplicaba, porque los vetos aceptan artista, género, estilo, tema e idioma — ninguno describe el ánimo.

| Campo del bloque | Comportamiento | Por qué |
|---|---|---|
| `animosEvitar` | **exclusión dura**, ni siquiera se relaja | es una regla explícita del dueño, no un parámetro de perfil |
| `escenaPreferida` | **preferencia**: suma 1 al peso de orden | de 278 temas solo 38 declaran `ALMUERZO`; como filtro duro dejaría el bloque a un tercio y entraría el autoplay de Spotify |

**Vocabulario cerrado, validado al escribir.** `AnimoTrack` y `EscenaTrack` en `musica-enums.ts`, con `normalizarAnimo()` / `normalizarEscenas()` y un mapa de sinónimos. No alcanza con pedirlo en el prompt: en producción el modelo devolvió `energico` **51 veces** y `energetico` **16** para el mismo concepto, y un filtro por `energico` perdía esos 16 en silencio.

**Cuotas en el planner.** `seleccionarTracks` reparte por estilo **intercalando**: en cada paso toma de la cuota más atrasada respecto de su objetivo. Llenar cubeta por cubeta daría media hora de bossa seguida y después media hora de pagode — dos playlists pegadas. Cuando una cuota se queda sin material, reparte el hueco y lo reporta en `cuotasIncumplidas`.

**Los porcentajes no tienen que sumar 100.** Lo que falte se completa con el resto del repertorio. Sumar menos es una forma válida de decir "quiero bossa y pagode, el resto me da igual".

**Déficit.** `calcularDeficit()` devuelve, por bloque y estilo, cuánta música pide la cuota contra cuánta hay. Es lo que evita pedir 50% de bossa teniendo 7 temas y que la playlist repita los mismos siete toda la tarde.

**Por qué no Chosic ni Every Noise At Once:** ninguno tiene API pública. Every Noise quedó congelado cuando su autor dejó Spotify a fines de 2023. Consumirlos sería scraping — frágil, contra sus términos, y deuda de mantenimiento en un sistema que corre solo en el local.

## 4. Gotchas

1. **El pool es portable, las playlists no.** Los `spotifyId` son universales: lo importado con una cuenta sirve con otra. Pero las playlists `FRC · …` se crean en la cuenta conectada — en desarrollo con cuenta personal, aparecen ahí.
2. **Las playlists editoriales de Spotify (`37i9dQZF…`) no son importables**: quedaron fuera de la API en nov-2024. Devuelven 404.
3. **Solo se importan playlists de las que la cuenta conectada es DUEÑA o COLABORADORA.** No alcanza con que sean públicas: desde la migración de feb-2026, Spotify devuelve la metadata pero **omite `items`** para playlists ajenas, y en Development Mode responde directamente **403**. Para sembrar con playlists de otra cuenta hay que copiar los temas a una propia, hacerlas colaborativas, o conectar la cuenta dueña.
4. **El importador ignora las playlists `FRC · `** — reimportarlas sería un bucle: el pool alimenta la playlist y la playlist vuelve al pool.
5. **Al reimportar no se pisa `estado`/`score`/etiquetado**: un tema vetado no vuelve a aprobarse porque reaparezca en otra playlist.
6. **`notas` del bloque y `brief` NO van a UPPERCASE** (excepción a la regla del proyecto): van literales al prompt, y gritarlos degrada la lectura del modelo.
7. **`temperature: 0.8` en el descubrimiento es deliberado**: con 0 el modelo propone siempre lo mismo y el repertorio deja de crecer.
8. **El match de resolución es estricto** (artista + título normalizado). Sin eso Spotify devuelve cualquier cosa para nombres inventados y el pool se llena de basura.
9. **Hasta correr "Analizar temas", BPM/valencia están vacíos** y los filtros de perfil dejan pasar lo que no tiene el dato: las tres variantes salen parecidas. El aviso está en la UI, pero es la causa #1 de "no distingue el almuerzo de la noche".
10. **`migration:generate` no sirve en este repo**: el DataSource del CLI apunta a una SQLite vacía y genera el esquema completo (2000+ líneas). Además falla salvo con `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'`. Las migraciones de este módulo se escribieron a mano.
11. **SQLite no soporta `IF NOT EXISTS` en `ADD COLUMN`**: la migración de opciones avanzadas consulta el esquema con `getTable()` antes de agregar cada columna.
12. **Spotify NO expone género por tema.** El género que declara el sello al publicar se queda en la distribuidora; los endpoints de track no tienen campo de género. Lo único disponible es `genres` del **artista**, que además viene **vacío** para artistas con poca data — típicamente los regionales. Por eso 142 de 427 temas quedaron sin clasificar. La respuesta es MusicBrainz por ISRC, que sí da género de grabación.
13. **`GET /artists?ids=` devuelve 403 para esta app** (verificado: los 3 lotes fallaron con credenciales válidas), mientras que `/artists/{id}` individual funciona. El backfill intenta el lote y cae a uno por uno.
14. **`relations: ['estilo']` no es opcional.** `repo.find()` sin él deja `t.estilo` en `undefined` en TODOS los temas: la herencia por artista hereda cero y el planner manda todo el pool a la cubeta "(resto)". Costó dos bugs.
15. **MusicBrainz exige `User-Agent` identificable** con forma de contacto, y bloquea a quien no lo manda. Límite de cortesía: 1 request/segundo; pasarse devuelve 503 y termina en bloqueo de IP.
16. **El etiquetado con LLM VETA temas solo.** `aptoFamiliar === false` pone el tema en `VETADO` sin pasar por el dueño. El modelo juzga con título + artista + género, **sin la letra**. Medido: 6,9% en inglés, 7,8% en portugués, 5% en español — sin sesgo cultural, pero 19 de 21 no estaban marcados como explícitos por Spotify.
17. **Nunca escribir `estilo_id` directo.** Se escribe la columna de la fuente que corresponda (`estiloManual` / `estiloAgente` / `estiloGenero`) y después `aplicarResolucion()`. Escribir el resuelto a mano lo desincroniza de sus fuentes y la próxima corrida lo revierte. Las relaciones a cargar están en `RELACIONES_ESTILO` — y aplica el gotcha 14: sin ellas, `resolverEstilo()` ve `undefined` y **borraría** el estilo al guardar.
18. **El vocabulario del LLM deriva solo.** `energico` (51) y `energetico` (16) para el mismo concepto, en producción. El prompt es una sugerencia; la garantía es `normalizarAnimo()` / `normalizarEscenas()` al escribir. Todo eje semántico nuevo necesita su enum y su normalizador, no solo una línea en el prompt.
19. **El ánimo prohibido no se relaja.** El planner relaja BPM y valencia cuando falta material, pero `animosEvitar` se respeta siempre. Es deliberado: preferimos playlist corta antes que un tema de despecho en el almuerzo familiar.
20. **La escena es preferencia, no filtro.** Convertirla en filtro duro vacía el bloque: la cobertura por escena es muy despareja (`TARDE` 204 temas, `ALMUERZO` 38, `APERTURA` 1).
21. **El listener loopback del OAuth hay que cancelarlo a mano.** Espera hasta `OAUTH_TIMEOUT_MS` (3 min) y nada más lo cierra: abandonar el flujo dejaba el puerto tomado **por la propia app**, y el reintento moría con `EADDRINUSE` mostrando un error que culpaba a otro programa. Hoy `cancelarConexionSpotify()` lo aborta, lo llaman el `ngOnDestroy` de la pantalla y el propio `conectarSpotify()` antes de bindear. Ojo: `server.close()` **no** basta si hay conexiones abiertas — va con `closeAllConnections()`, y la respuesta HTML se termina de mandar antes de cortar el socket.

---

## 5. Estado y qué falta

**F0 a F3 implementados** (branch `feat/musica-ambiental`, 16 commits): conexión y control, repertorio con importador, descubrimiento con IA, brief → grilla, enriquecimiento con ReccoBeats + etiquetado, generador de playlists, planificador diario, runtime que reacciona al salón, UI desktop (4 pestañas) y control en la PWA.

**Las tres decisiones de IA, por frecuencia** (nunca mezclarlas):

| Decisión | Quién | Cuándo | temperature |
|---|---|---|---|
| Etiquetar un track | LLM en lote de 50 | una vez por track | 0 (clasificación) |
| Interpretar el brief | LLM | al configurar | 0.3 (estructura) |
| Planificar el día | LLM, 1 llamada | 1×/día | 0.4 |
| Descubrir música | LLM | a pedido | **0.8** (con 0 propone siempre lo mismo) |
| Elegir el próximo tema | **código** | por evento | — |

**Reacción al salón** (`musica-runtime.service`): ocupación ≥80% + ventas → `MOVIDO`; ocupación ≤30% con mesas ocupadas → `SUAVE`. Con **histéresis de 10 min**: sin ella la música cambiaría de humor cada vez que entra o sale una mesa. Nunca pisa el modo manual.

**Validado contra Spotify y OpenAI reales (2026-08-11):** conexión, brief → grilla de 31 bloques, 3 rondas de descubrimiento (427 temas), plan generado por IA y **15 playlists creadas**. Las duraciones confirmaron el fix de medianoche: el bloque de 7 h produce 10,5 h de playlist (1,5×).

**Medido en producción (2026-08-12, 278 temas aprobados).** El limitante del módulo **no es el algoritmo, es el repertorio**. Las cuotas funcionan: el ALMUERZO del miércoles pedía BOSSA 50 / PAGODE 40 / CHILL 5 / SOUL 5 y la playlist salió con 65 temas y 4,43 h contra un objetivo de 6 h — el 95% de todo lo que existe en esos cuatro estilos. Cuando una cubeta se seca, su cuota la absorben las demás, así que lo que suena termina siendo ≈ BOSSA 40 / PAGODE 9 / CHILL 18 / SOUL 33.

Reparto real, muy sesgado a lo anglo: `INDIE 53 · POP 47 · ROCK 44 · BOSSA/MPB 27 · ELECTRONICA 26 · SOUL 25` contra `PAGODE 6 · SERTANEJO 6 · BRASIL FESTIVO 0`.

**Antes de tocar el planner, mirar `musica-deficit` del bloque.** Una cuota solo es realista si el estilo tiene material para `duración × factorDuracion (1.5) × porcentaje`.

Dos hallazgos del mismo día: los 278 aprobados están **todos clasificados** (cero sin estilo), y el estilo `BOSSA / MPB` tiene los alias `MPB` y `POP BRASILENO` **vacíos** — los 27 temas vienen etiquetados `BOSSA NOVA` a secas, así que el nombre del estilo miente.

**Pendiente:**
- **Semilla que declara su estilo.** La procedencia es el discriminador más barato y confiable: un tema que entró por la playlist *Bossa Nova Covers* **es** un cover, y eso es un hecho del origen, no una inferencia. Requiere columna en `MusicaSemilla` + migración. Con la cadena de precedencia ya en su lugar, entraría entre manual y agente.
- **Dashboard música ↔ ventas** por bloque (los datos ya se registran en `TrackLog`).
- **ReccoBeats YA se ejecutó contra la API real (2026-08-11)**: funcionó. Cobertura 234 de 300 procesados (78%); el resto no está en su base. Datos sanos: BPM 75–200, energía 0.13–0.98, valencia 0.04–0.97.
- **Los rangos de BPM de la grilla están mal calibrados.** Los escribió el LLM al interpretar el brief con una intuición equivocada: SOBREMESA pide 50–70 BPM y **el repertorio no tiene NADA por debajo de 75**. La bossa nova real mide 91–144 (promedio 117). Ese bloque cae siempre en modo relajado y su perfil nunca muerde. Corregir con los datos reales, no con intuición.
- **Sembrar la música local con semillas de ARTISTA**: el modelo no conoce la escena paraguaya y no la propone aunque el brief la nombre.

---

## 6. Tests

| Comando | Qué cubre |
|---|---|
| `npm run test:musica-estilos` | Normalización de géneros, siembra idempotente, `estiloFijado`, **precedencia manual › agente › género** (que reclasificar no pise al agente, y que quitar la corrección manual vuelva al agente en vez de dejar el tema sin estilo), **desacuerdos**, validación de mezcla, cálculo de déficit, medianoche como fin de bloque. Corre migraciones sobre SQLite limpia |
| `npm run test:musica-cuotas` | El algoritmo de cuotas: proporciones, **intercalado** (que la bossa no salga toda junta), cuota sin material, límite por artista, sin repetidos. Más los **ejes semánticos**: que el ánimo prohibido no entre ni siquiera en modo relajado, y que la escena preferida ordene sin dejar la playlist corta. Función pura, sin red ni base |
