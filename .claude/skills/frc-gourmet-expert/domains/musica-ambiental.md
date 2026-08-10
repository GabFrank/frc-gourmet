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
| `electron/services/spotify.service.ts` | OAuth PKCE, listener loopback, refresh con rotación, wrapper de API con reintento en 401 y `Retry-After` en 429, operaciones de player |
| `electron/services/musica-pool.service.ts` | Importa semillas (playlist/artista/track/biblioteca) al repertorio |
| `electron/services/musica-descubrimiento.service.ts` | Prompt + OpenAI + resolución en Spotify + filtros. También `rechazarTrack` |
| `electron/services/musica-planner.service.ts` | Genera el plan y materializa las playlists. `getBloqueVigente` |
| `electron/services/musica-runtime.service.ts` | Heartbeat de 2 min: cambio de bloque, watchdog, modo manual, `TrackLog` |
| `electron/handlers/musica.handler.ts` | ~30 handlers, todos con `ensurePermission` |
| `electron/utils/musica-presets.ts` | Preset `RESTAURANTE_BAR` (grilla semanal completa + vetos) |
| `electron/utils/musica-secrets.util.ts` | Refresh token en keytar |
| `src/app/pages/configuracion/musica/` | 4 pestañas: Reproductor · Mi estilo · Repertorio · Programación |
| `projects/mobile/src/app/pages/musica/` | Control principal en la PWA |
| `src/app/database/entities/musica/` | 8 entidades |

**Entidades:** `MusicaSemilla`, `MusicaTrack`, `MusicaVeto`, `BloqueProgramacion`, `PlanProgramacion`, `PlanBloque`, `TrackLog`, `MusicaFeedback`.

**Migraciones:** `1786378422682-MusicaAmbiental` (8 tablas), `1786383979096-MusicaOpcionesAvanzadas` (opciones por bloque).

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

## 4. Gotchas

1. **El pool es portable, las playlists no.** Los `spotifyId` son universales: lo importado con una cuenta sirve con otra. Pero las playlists `FRC · …` se crean en la cuenta conectada — en desarrollo con cuenta personal, aparecen ahí.
2. **Las playlists editoriales de Spotify (`37i9dQZF…`) no son importables**: quedaron fuera de la API en nov-2024. Devuelven 404.
3. **Se pueden leer playlists públicas de cualquier cuenta**; las privadas, solo de la cuenta autorizada.
4. **El importador ignora las playlists `FRC · `** — reimportarlas sería un bucle: el pool alimenta la playlist y la playlist vuelve al pool.
5. **Al reimportar no se pisa `estado`/`score`/etiquetado**: un tema vetado no vuelve a aprobarse porque reaparezca en otra playlist.
6. **`notas` del bloque y `brief` NO van a UPPERCASE** (excepción a la regla del proyecto): van literales al prompt, y gritarlos degrada la lectura del modelo.
7. **`temperature: 0.8` en el descubrimiento es deliberado**: con 0 el modelo propone siempre lo mismo y el repertorio deja de crecer.
8. **El match de resolución es estricto** (artista + título normalizado). Sin eso Spotify devuelve cualquier cosa para nombres inventados y el pool se llena de basura.
9. **BPM/valencia están vacíos hasta F2** (enriquecimiento con ReccoBeats). Mientras tanto los filtros de perfil dejan pasar lo que no tiene el dato, así que las tres variantes salen parecidas.
10. **`migration:generate` no sirve en este repo**: el DataSource del CLI apunta a una SQLite vacía y genera el esquema completo (2000+ líneas). Además falla salvo con `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'`. Las migraciones de este módulo se escribieron a mano.
11. **SQLite no soporta `IF NOT EXISTS` en `ADD COLUMN`**: la migración de opciones avanzadas consulta el esquema con `getTable()` antes de agregar cada columna.

---

## 5. Estado y qué falta

**F1 implementado** (branch `feat/musica-ambiental`): conexión y control, repertorio con importador, descubrimiento con IA, grilla con presets, generador de playlists, runtime automático, UI desktop y PWA.

**Pendiente:**
- **F1.5** — el brief se guarda y alimenta el descubrimiento, pero **todavía no genera la grilla** con LLM.
- **F2** — enriquecimiento con ReccoBeats (BPM/energía/valencia reales) + etiquetado semántico en lote. Sin esto los perfiles por bloque no muerden.
- **F3** — planificador diario con LLM + señales del PdV (ocupación, ritmo de ventas, KDS) para cambiar de variante por evento.
- **SSE** — hoy la PWA hace poll de 10 s; el diseño prevé `/api/musica/stream` como el KDS.
- **Dashboard música ↔ ventas** por bloque.
