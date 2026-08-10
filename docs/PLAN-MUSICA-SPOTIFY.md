# Plan de implementación — Música ambiental con Spotify (FRC Gourmet)

**Fecha:** 2026-08-07
**Decisión tomada por el usuario:** avanzar con **Spotify**. El cumplimiento de licencias/derechos queda fuera del alcance de este plan (gestionado por el dueño).
**Alcance de este doc:** arquitectura y fases de implementación técnica.
Investigación previa y comparativa de proveedores: [INVESTIGACION-MUSICA-AMBIENTAL.md](INVESTIGACION-MUSICA-AMBIENTAL.md).

---

## 1. Qué de la API de Spotify sirve hoy (verificado agosto 2026)

### ✅ Vivo y suficiente para el producto — **Player API (Spotify Connect)**
Confirmado en el changelog de febrero 2026: **los endpoints de player no fueron tocados**.

| Endpoint | Uso en nuestro sistema |
|---|---|
| `GET /me/player/devices` | descubrir el parlante/PC del local |
| `PUT /me/player` (transfer) | fijar el dispositivo de salida del local |
| `PUT /me/player/play` | arrancar un `context_uri` (playlist) o `uris` (lista de tracks) |
| `PUT /me/player/pause`, `POST /me/player/next|previous` | control manual y skip automático |
| `PUT /me/player/volume` | volumen por franja horaria |
| `POST /me/player/queue` | encolar el próximo track elegido por nosotros |
| `GET /me/player` / `currently-playing` | saber qué suena y cuánto falta (motor del runtime) |
| `PUT /me/player/shuffle`, `repeat` | apagarlos: la secuencia la decidimos nosotros |
| Playlists CRUD (`/playlists`, `/items`) | crear y reordenar las playlists del local |
| `GET /search` | resolver artistas/tracks/playlists |
| `GET /me/top/*`, `/me/player/recently-played` | insumo de gustos |

**Requiere Spotify Premium.** Sin Premium no hay control de playback por API (y además hay anuncios).

### ❌ Muerto — hay que reemplazarlo con infra propia
- **Deprecado nov-2024 para apps nuevas:** `recommendations`, `audio-features`, `audio-analysis`, `related-artists`, `featured playlists`, previews de 30s.
- **Podado feb-2026:** endpoints bulk de catálogo (varios álbumes/artistas/tracks), `artist's top tracks`, `available markets`, campos `popularity` / `followers` / `available_markets`; **`GET /search` bajó de máximo 50 a máximo 10 resultados** (default 5); playlists renombraron `tracks` → `items`.

**Consecuencia de diseño:** Spotify queda reducido a **catálogo + reproductor**. **El cerebro lo ponemos nosotros.** Que es justamente donde está el valor del producto, así que no es una pérdida — pero cambia el plan: hay que construir un índice propio de características musicales.

### ⚠️ Cuotas — el punto que define el onboarding
- **Development Mode:** limitado a **5 usuarios autenticados** por app y **el dueño de la app debe tener Premium**. Desde julio 2026 la cuota se cuenta **por cuenta de developer** (hasta 25 Client IDs).
- **Extended Quota:** exige empresa registrada + **250.000 usuarios activos mensuales** + servicio lanzado en mercados clave, y sólo se aceptan solicitudes de organizaciones. **No calificamos, y no vamos a calificar.**

**→ Decisión de arquitectura:** cada local usa **su propia app de Spotify en Development Mode** con **su propia cuenta Premium**. El onboarding pide al cliente crear la app en el dashboard de Spotify y pegar `client_id` + `client_secret` en la configuración de FRC Gourmet. Nosotros nunca somos el titular de la cuota. Es fricción de setup (10 minutos, una sola vez, con guía paso a paso), pero elimina el techo de 5 usuarios como problema de escala: 5 usuarios por local sobra.

---

## 2. Las dos decisiones técnicas duras

### Decisión A — El reproductor es la **app de Spotify Desktop instalada en el PC del PdV**

**DECIDIDO (2026-08-07): siempre player en la PC, nunca hardware externo.** Raspberry / parlantes Connect quedan fuera del alcance.

El **Web Playback SDK** de Spotify exige **Widevine DRM**. Electron no trae Widevine CDM; hay que usar el fork de castLabs y aun así hay reportes persistentes de error 500 en `widevine-license` en producción. Es un pozo sin fondo → **descartado**.

| Opción evaluada | Veredicto |
|---|---|
| **App oficial de Spotify Desktop** en el PC del PdV, controlada por Connect | ✅ **ELEGIDA.** Cero DRM propio, audio nativo, la mantiene Spotify, la podemos lanzar y vigilar nosotros |
| Player web (`open.spotify.com`) en Chrome, lanzado desde la app | ❌ funciona (Chrome trae Widevine) pero es frágil: ventana que se puede cerrar, suspensión de pestañas en background, login aparte. Sin ventaja sobre la app nativa |
| Web Playback SDK dentro de Electron | ❌ Widevine ausente; castLabs no lo resuelve de forma confiable |
| Raspberry Pi + raspotify / parlante Connect | ❌ fuera de alcance por decisión del usuario |

**Nuestra app es el *controlador*, no el reproductor.**

**Implicancias operativas de esta elección:**

1. **La app de Spotify debe estar abierta y logueada** con la cuenta dedicada, o no aparece en `GET /me/player/devices`. Mitigación: configurarla para iniciar con Windows minimizada + **auto-lanzado desde FRC Gourmet** al arrancar el nodo server (protocolo `spotify:` — funciona tanto con el instalador clásico como con la versión de Microsoft Store; fallback a spawn de `%APPDATA%\Spotify\Spotify.exe`) + **watchdog** que la relanza y avisa por SSE si el device desaparece.
2. **Una cuenta Premium = un stream simultáneo.** Si alguien abre la misma cuenta en su celular, se roba la reproducción del local. Mitiga la cuenta dedicada con password no compartida.
3. **El staff puede tocar la app de Spotify a mano** (está en el mismo PC). Se convierte en feature: al detectar un cambio manual (track que no encolamos nosotros), el runtime entra en **modo manual** por N minutos configurables y después retoma el plan — en vez de pelear con el usuario cada 30 s. El modo manual se muestra en la toolbar y en la PWA.
4. **Apagar `shuffle` y `repeat` por API** al iniciar, y mantener la cola siempre con al menos 2 tracks para que no se dispare el autoplay de recomendaciones de Spotify al terminar el contexto.

### Decisión B — Índice propio de características musicales

Sin `audio-features` ni `recommendations`, hay que construir el pool y sus atributos:

1. **Fuentes de tracks:** playlists públicas de Spotify (búsqueda tope 10 resultados → paginar por consultas variadas), playlists ya armadas por el dueño, biblioteca del usuario, `top tracks` y `recently played` del local.
2. **Enriquecimiento:** **ReccoBeats** (API gratuita, da BPM/energy/danceability/valence/key — es el reemplazo estándar del endpoint muerto). Alternativas de respaldo: GetSongBPM, Deezer, Cyanite.
3. **Caché propio:** guardamos todo en **nuestra** tabla `MusicaTrack`. Enriquecimiento incremental en background, una vez por track, para siempre. **Ese índice se vuelve un activo del producto** — es lo que nos permite migrar a otro proveedor sin perder el cerebro.
4. **Fallback del LLM:** para lo que ninguna API cubre (contexto cultural, "esto es música de brunch", "esto no va con feriado patrio"), el agente etiqueta el track una sola vez y se cachea.

---

## 3. Arquitectura

```
┌─ FRC Gourmet (nodo server del local) ─────────────────────┐
│                                                            │
│  PdV ─ señales ─┐                                          │
│  KDS ───────────┤                                          │
│  Cajas ─────────┼──► MusicaRuntimeService (cada 15-30 s)   │
│  Mesas ─────────┘        │ reglas deterministas, sin IA    │
│                          │                                 │
│  PlanProgramacion (BD) ──┤                                 │
│                          ▼                                 │
│                   SpotifyClient ──HTTPS──► Spotify Web API  │
│                          │                       │          │
│                          │                  (Connect)       │
│                          ▼                       ▼          │
│                   TrackLog (BD)          Raspberry/Desktop  │
│                                             = audio real    │
│  MusicaPlannerService (1×/día) ──► Claude API ──► plan      │
│                                                            │
│  SSE /api/musica/stream ──► desktop tab + PWA mobile        │
└────────────────────────────────────────────────────────────┘
```

**Regla de oro:** el LLM planifica **una vez por día**; el runtime decide **cada 30 segundos** con reglas deterministas. Si se cae internet hacia la IA, la música sigue. Si se cae Spotify, no hay música (riesgo aceptado — hoy ya pasa).

### Capa de abstracción obligatoria desde el día 1

Interfaz `ProveedorMusica` (`conectar / listarDispositivos / reproducir / pausar / siguiente / volumen / estadoActual / buscarTracks`) con implementación `SpotifyProvider`. Spotify podó su API dos veces en 20 meses; si vuelve a hacerlo, se cambia el provider sin tocar el agente, el plan ni el índice. Mismo criterio que el dual driver SQLite/Postgres.

---

## 4. Modelo de datos (`src/app/database/entities/musica/`)

| Entidad | Contenido |
|---|---|
| `MusicaCuenta` | credenciales OAuth por local: `clientId`, `refreshToken` (cifrado / keytar), scopes, estado, cuenta Spotify vinculada |
| `ZonaAudio` | zona lógica → `deviceId` de Spotify Connect; volumen máximo; horario activo (puede mapear a `Sector`) |
| `MusicaPolitica` | géneros permitidos/vetados, artistas e ítems en lista negra, `explicit` sí/no, idiomas, ventana anti-repetición (track/artista), rango de BPM y energía por defecto |
| `BloqueProgramacion` | día de semana + rango horario + perfil objetivo (energía, BPM min/max, géneros, volumen) |
| `PlanProgramacion` | plan generado por el agente para una fecha: bloques resueltos + pool de tracks candidatos + razón (texto del agente, auditable) |
| `MusicaTrack` | caché del índice propio: `spotifyId`, artista, título, duración, BPM, energía, valencia, danceability, key, género inferido, tags del LLM, `explicit` |
| `TrackLog` | qué sonó, cuándo, en qué zona, bajo qué bloque, y el estado del salón en ese momento (ocupación, ventas/min) → insumo del dashboard música↔ventas |
| `MusicaFeedback` | "no va" del staff: track/artista + franja + usuario. Alimenta la lista negra |

Migración dual SQLite/Postgres con timestamp real (`date +%s%3N`), entidades registradas en `database.config.ts`.

## 5. Backend

`electron/handlers/musica.handler.ts` — todos los mutantes con `ensurePermission` como primera sentencia (recordar: `/api/rpc` es default-allow):

- `musica-oauth-iniciar` / `musica-oauth-callback` — Authorization Code + **PKCE**, refresh automático (token expira en 1 h). Scopes: `user-read-playback-state`, `user-modify-playback-state`, `user-read-currently-playing`, `playlist-read-private`, `playlist-modify-private`, `user-top-read`, `user-read-recently-played`.
- `musica-listar-dispositivos`, `musica-asignar-zona`
- `musica-play`, `musica-pausar`, `musica-siguiente`, `musica-volumen`, `musica-estado` (control manual desde desktop y PWA)
- `musica-guardar-politica`, `musica-guardar-bloques`
- `musica-generar-plan` (dispara el agente a demanda)
- `musica-feedback-no-va`
- `musica-buscar-tracks`, `musica-enriquecer-pool` (background)

**Permisos nuevos** en `SEED_PERMISOS`: `MUSICA_VER`, `MUSICA_CONTROLAR`, `MUSICA_CONFIGURAR`, `MUSICA_DASHBOARD_VER`.

**Servicios en el main process:**
- `SpotifyClient` — auth, refresh, rate limiting (respetar `Retry-After` en 429), reintentos con backoff.
- `MusicaRuntimeService` — loop de 15–30 s: lee estado del player, calcula el perfil objetivo del momento, elige el próximo track del pool, encola, corrige volumen, registra en `TrackLog`.
- `MusicaPlannerService` — 1×/día (o a demanda): arma el prompt con política + histórico de ventas por franja + feriados + clima + feedback, llama a Claude, valida y guarda el `PlanProgramacion`.
- **Watchdog:** si el device desaparece (Spotify cerrado, Raspberry reiniciada), reintenta transferir playback y avisa por SSE con un chip rojo en la toolbar.

**SSE** `/api/musica/stream` para estado en vivo, reusando el patrón de `kds-sse-routes.ts`.

## 6. Frontend

- **Tab "Música"** (desktop): estado actual (carátula, track, artista, zona, bloque vigente), controles, plan del día en timeline, botón "no va", editor de política y de bloques.
- **PWA mobile**: control remoto para el encargado — qué suena, skip, volumen, "no va". Es la pantalla que más se va a usar.
- **Dashboard música↔ventas** con el padrón `<app-dash-*>`: ticket promedio y ventas por bloque horario vs perfil musical.
- Hoja en `MENU_TREE` (sin esto no aparece en sidenav ni en el buscador global).

## 7. El agente

**Planificador (Claude, 1×/día, batch)** — entrada: política + bloques + ventas por franja de las últimas N semanas + feriados PY (ya sembrados) + clima + feedback acumulado + lo que ya sonó mucho. Salida (JSON validado): para cada bloque, perfil objetivo (energía 1-5, BPM min/max, géneros, permitir/evitar) + pool de candidatos + una frase de justificación auditable. Costo: centavos por local por día.

**Ejecución (determinista, dirigida por eventos, sin IA):**

El plan del día se materializa en **playlists reales de Spotify** (3 variantes de energía por bloque, sobreescritas cada día). El sistema no elige tema por tema: sólo cambia de playlist cuando pasa algo.

```
al empezar un bloque              → play(context_uri de la playlist "normal" del bloque)
salón lleno sostenido ≥10 min     → cambiar a variante "movido"
salón vacío sostenido ≥10 min     → cambiar a variante "suave"
"No va" del staff                 → next + vetar track
pedido de regenerar               → recalcular plan y reescribir playlists
cambio manual en la app Spotify   → modo manual hasta el próximo bloque

heartbeat cada 2-5 min: ¿device vivo? ¿suena? ¿es la playlist esperada? → avisar, NO elegir música
```

**Por qué así y no con una cola gestionada en vivo:** si FRC Gourmet se cierra, se cuelga o se actualiza, la playlist sigue sonando. Además son ~6-10 llamadas por día (sin riesgo de 429) y el día queda auditable antes de sonar. Detalle en [DISENO-OPERATIVO-MUSICA.md](DISENO-OPERATIVO-MUSICA.md) §3.3.

**Feedback:** "no va" del staff → blacklist por local+franja, y entra al prompt del próximo plan.

## 8. Fases

| Fase | Qué se hace | Entregable / criterio de terminado |
|---|---|---|
| **F0 — PoC (1 día, descartable)** | App Spotify en dev mode, OAuth PKCE, listar devices, transferir playback, play/pause/skip/volumen desde un tab pelado, con el Spotify Desktop del PC como salida | **Suena música en tu local controlada desde FRC Gourmet.** Valida el 90% del riesgo técnico antes de invertir |
| **F1 — Base sin IA** | Entidades + migración + handlers + política + bloques horarios + runtime determinista + tab desktop + control desde PWA + `TrackLog` | Programación automática por franja/día. **Ya resuelve el dolor original**: nadie toca el reproductor, no se traba un artista, se renueva sola |
| **F2 — Índice propio** | Integración ReccoBeats, enriquecimiento en background, anti-repetición, reglas de energía por perfil | Selección por BPM/energía real, no por playlist fija |
| **F3 — Agente** | `MusicaPlannerService` con Claude + señales del PdV (ocupación, ritmo, KDS) + "no va" del staff | Plan diario automático + reacción al salón |
| **F4 — Producto** | Multi-local, dashboard música↔ventas, onboarding guiado del `client_id`, appliance Raspberry documentado, feature flag | Vendible como módulo |

Cada fase con `npm run check` antes de pushear, manual de pruebas y actualización de docs + skill (regla 23 del DoD).

## 9. Riesgos técnicos (los legales quedan fuera de alcance)

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **Spotify vuelve a podar la API** (van 2 podas en 20 meses) | alto | capa `ProveedorMusica` desde F1; el índice propio y el agente son nuestros y sobreviven a un cambio de proveedor |
| Development Mode: 5 usuarios / cuota por developer | medio | una app + una cuenta Premium **por local**; onboarding guiado |
| **Extended Quota es inalcanzable** (250k MAU) | medio | nunca depender de ella; el modelo "app del cliente" la evita |
| Widevine/DRM en Electron | alto si se ignora | **no usar Web Playback SDK**; controlar un device Connect externo |
| El player se cierra / la Raspberry se reinicia | alto (silencio) | watchdog + reintento de transfer + alerta visible en la toolbar |
| Premium obligatorio por local | bajo | ~USD 7/mes, se lo carga el cliente |
| Rate limits y 429 | medio | poll de 30 s (no 5 s), backoff con `Retry-After`, caché agresivo de metadata |
| Search limitado a 10 resultados | bajo | construir el pool con muchas consultas variadas + playlists sembradas, y cachear todo |
| Token expirado / refresh revocado | medio | refresh automático, y alerta de "reconectar Spotify" en configuración |
| Internet caído en el local | alto | Spotify no funciona offline en modo controlado → documentarlo; fallback futuro a carpeta local |

## 10. Decisiones cerradas (2026-08-07)

| Decisión | Elegido | Consecuencia |
|---|---|---|
| **Player** | **App de Spotify Desktop en el PC del PdV**, siempre. Nunca hardware externo | Auto-lanzado + watchdog + modo manual (ver §2 Decisión A). Sin costo de hardware, sin DRM propio |
| **Zonas de audio** | **Una sola** | `ZonaAudio` se modela igual (por diseño, para no rehacerlo después) pero la UI arranca con una zona fija. Una sola cuenta Premium alcanza |
| **Cuenta Spotify** | **Dedicada al local** | `top tracks` / `recently played` reflejan el local y no el gusto personal del dueño → mejor insumo para el agente. Password no repartida al staff |

Simplificaciones que habilitan estas decisiones: sin multi-zona no hace falta ruteo de audio ni varias cuentas; sin hardware externo no hay provisioning ni soporte de appliance; con cuenta dedicada el historial de la cuenta es señal limpia.

---

## Fuentes

- [Web API Changelog — febrero 2026](https://developer.spotify.com/documentation/web-api/references/changes/february-2026) · [Guía de migración feb-2026](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) · [Changelog julio 2026](https://developer.spotify.com/documentation/web-api/references/changes/july-2026)
- [Cambios a la Web API (27-nov-2024)](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api)
- [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) · [Apps](https://developer.spotify.com/documentation/web-api/concepts/apps) · [Web API quota updates for Development Mode (jul-2026)](https://developer.spotify.com/blog/2026-07-23-web-api-quota-updates) · [TechCrunch: dev mode requiere Premium y limita test users](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)
- [Start/Resume Playback](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback) · [Transfer Playback](https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback) · [Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk/howtos/web-app-player)
- Widevine en Electron: [Spotify Community — DRM en Web Playback SDK](https://community.spotify.com/t5/Spotify-for-Developers/Need-a-solution-to-this-DRM-problem-in-Web-Playback-SDK/td-p/6487515) · [castLabs + Widevine CDM](https://alexanderallen.medium.com/castlabs-widevine-cdm-ea369bb5623b)
- Reemplazo de audio features: [FreqBlog vs ReccoBeats](https://freqblog.com/compare/freqblog-vs-reccobeats/) · [MMAudioFeatures (uso real de ReccoBeats)](https://github.com/DrHardReset/MMAudioFeatures)
