# RRHH — Fichaje de asistencia por reconocimiento facial

> Fichaje de entrada/salida por **reconocimiento facial**. Embeddings generados **on-device**, match **1:N en el backend** (JS puro, sin ML ni consultas a BD en el matching). Implementado en 5 fases (F1–F5) + geocerca. Librería: **`@vladmandic/human` `^3.3.6`**. Sin documentar hasta 2026-07.

## Principio de diseño

- La cámara (desktop o PWA) produce un **embedding** (descriptor facial `number[]`) + scores de **liveness/antispoof** usando Human, cargado como chunk lazy (backend WebGL). **El matching nunca ocurre en el cliente** — solo se envía el embedding.
- El backend hace **match 1:N** en memoria contra todos los rostros activos (similitud **coseno** + umbral absoluto + margen contra el 2º mejor). Lógica pura en `electron/utils/face-match.ts` (testeada).
- **No se guarda la imagen** del rostro — solo el embedding (`JSON.stringify(number[])`). El `thumbnailUrl` opcional es solo auditoría.

**Por qué on-device y no en el servidor** (decisión de 2026-07, sigue vigente): menor
latencia (no viaja un JPEG por la LAN), privacidad (el vector de ~4 KB no es
reversible a foto) y sobre todo **evita `@tensorflow/tfjs-node`** — la dependencia
nativa que rompería el empaquetado de Electron. Por eso el match 1:N del server es
JS plano y no usa ML: la parte pesada ya se hizo en el browser. Los modelos (~8–15 MB)
los cachea el service worker.

## Modelo de datos

| Entity | Tabla | Campos clave |
|---|---|---|
| `FuncionarioRostro` | `funcionario_rostros` | `funcionario` (FK), `embedding` (text = JSON del descriptor), `dimension` (ej. 1024), `modelo` (UPPERCASE, versiona el embedding — ej. `HUMAN-FACERES-1024`; si cambia hay que **re-enrolar**), `thumbnailUrl?`, `activo`. Se guardan 3–5 rostros por funcionario. |
| `Asistencia` (existente) | +2 cols | `metodoRegistro` (`'MANUAL'\|'FACIAL'`), `similitudFacial` (decimal 5,4 = score del match) |
| `Empresa` (existente) | +geocerca | `latitud`, `longitud`, `radioFichajeMetros` (default 200 m) |

**Migrations:** `1783808912909-AddReconocimientoFacial.ts` (tabla + cols de asistencia; `embedding` es **`text` en ambos drivers a propósito** — evita que Postgres parsee jsonb; el match carga todo en memoria) y `1783915694893-AddUbicacionEmpresa.ts` (geocerca).

## Handlers (Electron)

- **`asistencia-facial.handler.ts`** (~277 líneas):
  - `enrolar-rostro` (permiso `RRHH_FUNCIONARIO_EDITAR`) — guarda embedding, invalida cache, no devuelve el embedding.
  - `get-rostros-funcionario` / `eliminar-rostro` (`RRHH_FUNCIONARIO_EDITAR`, hard delete + borra thumbnail).
  - **`fichar-facial`** — el corazón. **Abierto a cualquier usuario logueado** (la cara identifica; la geocerca valida el lugar). Flujo:
    1. **Liveness server-authoritative**: usa los scores `real` (antispoof) + `live` del cliente; exige ambos ≥ `FACIAL_LIVENESS_MIN` si `FACIAL_LIVENESS_OBLIGATORIO`.
    2. **Geocerca** Haversine si `FACIAL_GEOCERCA_ACTIVA` y la empresa tiene coords (reasons `SIN_UBICACION`/`FUERA_UBICACION`).
    3. **Match 1:N** vía `elegirMejorMatch`.
    4. Resuelve **ENTRADA/SALIDA** (según lo pedido por el kiosco o autodetección de entrada abierta); crea Asistencia con `metodoRegistro='FACIAL'` (resuelve el turno vigente para calcular tardanza). Respeta `FACIAL_PERMITIR_MULTIPLE_DIARIO` (turnos partidos → `YA_COMPLETO`).
  - **Cache invalidable** de embeddings activos en memoria (`rostrosCacheDirty`), refrescada en cada enrolar/eliminar.
- **`face-match.ts`** (lógica pura, sin Electron/DB/ML): `l2Norm`, `cosineSim`, `elegirMejorMatch(query, cache, umbral, margenMin)` → mejor por funcionario, umbral absoluto y margen contra el 2º (reasons `SIN_ROSTROS`/`NO_MATCH`/`BAJO_MARGEN`).
- **`face-models.handler.ts`** — `get-face-models-status`, `download-face-models` (`RRHH_CONFIG_EDITAR`, progreso por evento `face-models-progress`), `get-face-models-base-url`. Descarga in-app de `https://vladmandic.github.io/human-models/models/` a `userData/face-models/` (modelos `blazeface, facemesh, faceres, antispoof, liveness`).
- **`empresa.handler.ts`** — get/set ubicación (geocerca).

## Configuración (seed en `configuracion-rrhh.handler.ts`)

6 claves `FACIAL_*` en `ConfiguracionRrhh`: `FACIAL_UMBRAL_SIMILITUD` (0.6), `FACIAL_MARGEN_MIN` (0.05), `FACIAL_LIVENESS_OBLIGATORIO` (true), `FACIAL_LIVENESS_MIN` (0.5), `FACIAL_PERMITIR_MULTIPLE_DIARIO` (false), `FACIAL_GEOCERCA_ACTIVA` (false).

## Frontend

- **Servicio compartido** `src/app/services/face-recognition.service.ts` (`@frc/shared-core`, desktop + PWA). Carga Human dinámicamente; `MODEL_NAME='HUMAN-FACERES-1024'`, `DIMENSION=1024`. Solo produce embedding + liveness.
- **Cámara reutilizable** `src/app/shared/components/face-capture/` — requiere secure context (HTTPS), overlay de cuenta regresiva, emite `captured`/`noFace`/`ready`/`cameraError`.
- **Enrollment desktop:** tab **"Rostros"** en `funcionario-detalle.component.ts` + `enrolar-rostro-dialog/`.
- **Config desktop:** `pages/rrhh/configuracion-facial/` (descarga de modelos + umbrales). Menú `menu-tree.ts` (icon `face`, permiso `RRHH_CONFIG_EDITAR`).
- **PWA (kiosco):** `projects/mobile/src/app/pages/rrhh/fichaje/fichaje-facial.page.ts` — tablet fijo, botones ENTRADA (verde)/SALIDA (rojo), **auto-captura por cuenta regresiva de 5 s**, geolocalización del navegador en el payload, **cola offline** (`localStorage 'frc_fichaje_pendientes'`, flush al reconectar). Enrollment PWA en `enrolar-rostro.page.ts`. Acceso desde el home.

## Tests

`scripts/test-fichaje-facial.ts` (F4) → `npm run test:fichaje-facial`. Es un **script standalone ts-node** (no un `.spec.ts`) que testea la lógica pura de `face-match.ts` (umbral/margen/ranking 1:N).

## Gotchas

- Si cambia `MODEL_NAME`/`DIMENSION`, los embeddings viejos quedan incompatibles → hay que **re-enrolar** a todos (el campo `modelo` versiona esto).
- El fichaje requiere **secure context** (HTTPS o localhost) para acceder a la cámara — relevante para el kiosco PWA en LAN.
- El liveness es **server-authoritative**: el cliente manda los scores pero el backend decide; no confiar en un "ok" del cliente.
- **La iluminación es la causa #1 de fallos.** Enrolar con la luz real de la
  entrada y montar el tablet sin contraluz vale más que bajar el umbral.
- **Gemelos y hermanos parecidos** son el caso que rompe un umbral absoluto solo:
  por eso `elegirMejorMatch` exige además **margen contra el 2º candidato**
  (`FACIAL_MARGEN_MIN`). Bajarlo para "que reconozca más rápido" es exactamente
  cómo se ficha por otro.
- **Tablets baratos:** input chico y detección sólo de cara; sin eso la captura se
  arrastra.
- **Los modelos hay que descargarlos una vez** desde RRHH → Reconocimiento facial →
  Descargar modelos (van a `userData/face-models/`, servidos por HTTP). Sin eso
  todas las pantallas de rostro muestran error, y el síntoma no dice que falten
  modelos.
