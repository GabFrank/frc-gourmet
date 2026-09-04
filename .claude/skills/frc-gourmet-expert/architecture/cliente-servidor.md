# Modo cliente / servidor (F1–F5)

Fases mergeadas a develop 2026-05-11. Permite que un PC actúe como servidor central (Fastify expuesto) y varios PCs sean clientes que llaman por HTTP.

## Modos de operación

Configurable desde *Sistema → Modo de operación* (`app-settings.json:mode`):

| Modo | DB | Handlers | UI | Uso típico |
|---|---|---|---|---|
| `standalone` (default) | Local (SQLite o Postgres) | IPC local | Local | Una sola PC, todo en uno |
| `server` | Local (típico Postgres) | IPC local + Fastify `/api/*` expuesto en LAN | Local | El PC central del local |
| `client` | NO tiene DB | Llama por HTTP al server | Local | Tablets/PCs de mozo, cajeros remotos |

Settings unificadas en `userData/app-settings.json`. Password DB en **keytar** (no en el JSON).

## Rate limiting diferenciado (2026-09)

**Problema resuelto:** HTTP 429 "Rate limit exceeded" en el módulo delivery del PdV cuando múltiples superficies (desktop client, PWA mobile, web admin, storefront público) compartían una sola IP externa bajo túnel Cloudflare.

**Configuración anterior:** `@fastify/rate-limit` con `max: 300` req/min global, key = IP del cliente. Todas las superficies compartían el mismo bucket de 300 req/min.

**Solución implementada (F1-F4, 2026-09):**

### F1: allowList (rutas exceptuadas del rate limit)

Rutas sin límite:
- Health checks: `/api/version`, `/api/health`, `/api/client-config`
- Assets públicos: `/face-models/*`, `/pub/producto-image/*`
- Assets estáticos SPA: `.js`, `.css`, `.html`, `.ico`, `.woff`, `.map`, etc.
- Deep-links SPA GET: navegación del router Angular (fallback a `index.html`)

**NUNCA exceptuar `/api/rpc`** — es el canal principal de staff autenticado y debe estar protegido.

### F2: max diferenciado por ruta

| Ruta | Límite | Propósito |
|---|---|---|
| `/api/auth/*` | 30 req/min | Anti-brute-force login |
| `/pub/*` | 200 req/min | Storefront público (clientes finales) |
| `/api/rpc` | 600 req/min | Staff autenticado (el doble del anterior) |
| Resto | 300 req/min | Default |

### F3: keyGenerator por device_id/user

**Staff autenticado:** bucket por `device_id` (preferido) > `id` (usuario) > IP (fallback).  
**Anónimo:** bucket por IP.

**Implementación:**
```typescript
keyGenerator: (request) => {
  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return request.ip;
  
  try {
    const token = authHeader.substring(7);
    // jwt.decode (sintáctico), NO verify — el middleware de auth verifica después
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== 'object') return request.ip;
    
    const deviceId = (decoded as any).device_id;
    const userId = (decoded as any).id;  // El JWT usa 'id', no 'sub'
    
    if (deviceId) return `device:${deviceId}`;
    if (userId) return `user:${userId}`;
    return request.ip;
  } catch {
    return request.ip;
  }
}
```

**Resultado:** Cada terminal staff tiene su propio bucket de 600 req/min. Varias cajas bajo el mismo túnel Cloudflare **ya no comparten límite**.

### F4: Backoff exponencial en poll del delivery dialog

El poll de `cargarPedidosOnline()` (cada 15s) detecta HTTP 429 y aplica backoff exponencial: 15s → 30s → 60s → 120s (tope). Resetea a 15s en éxito.

**Patrón anti-race (enmiendas auditoría):**
- **Tras 429:** flag `needsIntervalUpdate` + recreación del interval en `finally` fuera del `catch`, evitando timers huérfanos ante 429 concurrentes.
- **En éxito:** detecta si `wasBackedOff` (pollIntervalMs > 15000) antes de resetear, y si lo estaba, recrea el interval inmediatamente. Sin esto el interval quedaba atascado en el tiempo de backoff para siempre.

### Consideraciones de producción

1. **TRUST_PROXY requerido:** Sin `TRUST_PROXY=true` (env var), el `keyGenerator` lee siempre la IP del proxy (127.0.0.1 o IP interna de Cloudflare), no la del cliente. La separación de buckets NO funciona sin esto.

   **Validar en alpha:** `electron/server/server.ts` líneas 86-92 leen `process.env.TRUST_PROXY`. Si el server está detrás de Cloudflare, setear `TRUST_PROXY=true` en el ambiente.

2. **Reinicio necesario:** Cambios en `electron/server/server.ts` (F1-F3) requieren **reiniciar el server** en `mode=server`. Los clientes NO necesitan reinicio (el rate limit es server-side).

3. **`/pub/*` exige auth:** Si alguna ruta `/pub` fuera anónima (no exige JWT de cliente), documentarlo y no bajar la defensa del límite de 200 req/min.

4. **Tests:** Suite `npm run test:rate-limit-e2e` cubre lógica básica. Validación final en alpha con checklist manual (plan §5.2).

---

## Por qué está hecho así (decisiones de 2026-05, siguen vigentes)

Cuatro alternativas que se evaluaron y se descartaron. Están acá porque cada tanto
alguien las vuelve a proponer:

**Hub-and-spoke, no varios servidores contra una Postgres compartida en LAN.** Con
DB compartida cada PC lleva credenciales de base: comprometer una caja es
comprometer todo, y las reglas de negocio quedan replicadas en cada cliente
(cualquiera puede saltearse una). Además las migraciones exigirían actualizar todas
las PCs al mismo tiempo — con auto-update eso no se coordina. Y lo que la mata: un
navegador **no puede** hablar Postgres, así que la PWA mobile habría requerido
construir igual un backend HTTP. Con hub-and-spoke el cliente sólo tiene
credenciales de usuario, toda escritura pasa por un lugar, y el server se actualiza
primero mientras `/api/version` deja que el cliente detecte el desfasaje.

**Un solo binario para los tres modos**, con el rol como configuración
(`app-settings.json:mode`), no tres instaladores. Una sola pipeline de release, un
solo canal de update.

**Fastify + un único `/api/rpc`, no rutas REST por handler.** El endpoint único
mapea automáticamente cada `ipcMain.handle(channel, fn)` ya existente (vía
`handlerRegistry`); escribir ~700 rutas a mano no era viable. Se descartaron
**tRPC** (excelente Node↔Node, pero sus typings agresivos no encajan con la forma
de los handlers) y **GraphQL** (obliga a reescribir todo como resolvers).
⚠️ La contracara de ese mapeo automático es que `/api/rpc` es **default-allow**:
ver [auth-permissions.md](auth-permissions.md).

**Fuera de alcance a propósito, y sigue estándolo:** sync offline-first / CRDT
(si se cae la red el cliente se bloquea), replicación multi-sucursal (ese es el
dominio de `frc-comercial/central` + `filial`; acá se asume UN local con varias PCs
en LAN), microservicios (el server es monolítico y así se queda) y hosting en la
nube (el server vive en una PC del restaurante; el patrón lo permitiría, pero no es
el objetivo).

## Fases por orden histórico

### F1 — Dual driver SQLite/Postgres + migrations
- `database.config.ts` admite override → `getDataSourceOptions` decide driver.
- `synchronize: false` definitivo.
- Dual baseline `migrations/` SQLite + Postgres.
- `DatabaseService.runMigrations` + backup pre-migrate + rename de baseline legacy.

### F2 — Repository abstract + factory
- `repository.service.ts` se renombró a `repository-ipc.service.ts` (impl IPC original).
- Se creó `repository.service.ts` como **abstract class canónica** generada desde la impl.
- Se creó `repository-http.service.ts` (impl HTTP para `mode=client`). **⚠️ Quedó como SKELETON (sus métodos tiran "no implementado") y NO se usa.** El `mode=client` del desktop usa el monkey-patch de `ipcRenderer.invoke` (F4.1), no esta clase. La **PWA mobile** sí necesitó transporte HTTP real → lo resolvió con un shim sobre `window.api` reutilizando `RepositoryIpcService` (ver [mobile-pwa.md](mobile-pwa.md)).
- DI provider `repositoryFactory()` en `AppModule` elige impl según `process.env.FRC_APP_MODE` (que setea `main.ts`); en la práctica devuelve siempre `RepositoryIpcService` y el preload routea HTTP en cliente.

### F3 — Server skeleton + RPC router
- F3.1: Fastify server en `electron/server/` (archivos: `server.ts`, `rpc-router.ts`, `auth-middleware.ts`, `auth-routes.ts`, `file-routes.ts`, `kds-sse-routes.ts`, `special-routes.ts`). Endpoints de salud/versión + SSE para KDS.
- F3.2/3.3: JWT auth middleware + login/refresh + RPC router (`POST /api/rpc` con body `{ method, params }`) + file endpoint (`/api/files/by-url`).
- **Handler registry global** vía monkey-patch de `ipcMain.handle` — cada canal IPC queda registrado en `handlerRegistry` y el RPC router puede invocarlo por nombre. Resultado: los 700+ handlers IPC originales son automáticamente accesibles por HTTP sin duplicar código.

### F4 — UI modo + cliente HTTP
- F4.1: Preload monkey-patchea `ipcRenderer.invoke` en `mode=client` para rutear a HTTP. Auth flow (login → JWT en memoria → refresh). **El refresh token SÍ se persiste desde 2026-08** — ver «La sesión sobrevive al cierre de la app» abajo.
- F4.2: Wizard `Sistema → Modo de operación` (standalone/server/cliente con URL servidor).
- F4 images: archivos `app://*` proxean por `/api/files/by-url` en `mode=client`.

### F5 — Multi-tenant device_id
- Entities clave (ventas, compras, conteos, comandas) tienen `dispositivo_id`.
- Migration driver-aware agrega la columna.
- F5.3: wiring `device_id` desde JWT claim (mode=client) o `AppSettings.deviceId` (mode=standalone/server).
- F5.4: wizard "device picker" en *Modo de operación*; filtros UI por dispositivo en listas de ventas/compras.

## Pyramid de resolución de `device_id`

`resolveRequestDeviceId(request)`:
1. JWT claim (si vino vía HTTP en mode=client)
2. `AppSettings.deviceId` (local persistido)
3. `null` (compatible con datos legacy; columna nullable)

Memoria: `project_f5_device_tracking.md`.

## Bugs casi inevitables al monkey-patchear `ipcRenderer.invoke`

Memoria `feedback_preload_monkey_patch_gotchas.md`. Los 4 patrones:
1. Recursion: el wrapper debe llamar a la `invoke` original, no a sí mismo.
2. Nombres de canal: usar el mismo string que `ipcMain.handle` (sin prefijo `client-` ni nada).
3. Timing: el override de modo debe leerse antes del primer `invoke`, no en lazy init.
4. Factory: la decisión IPC vs HTTP se evalúa una sola vez al arranque del Angular, no por llamada.
5. **Lo que es local debe quedarse local.** Todo canal que actúe sobre ESTE proceso —no sobre los datos— tiene que estar en `ALWAYS_LOCAL_CHANNELS` (impresoras, diálogos de archivo, config de modo, backups) o cubierto por una regla de prefijo. Se agregó `esCanalDeVentana()`: cualquier canal `window:*` (botones de la titlebar, zoom, DevTools, pantalla completa) es **siempre IPC directo**. Antes salían por HTTP: en modo cliente los botones de ventana no hacían nada y, peor, apuntaban a la ventana del servidor. Síntoma típico de este bug: "el botón no hace nada, sólo en los clientes".

## Smoke server para testing E2E

`scripts/test-server-standalone.ts` arranca un Fastify completo con los 700+ handlers reales (mediante el handler registry global). Permite testear `mode=client` en una sola Mac sin necesidad de 2 PCs.

Memoria: `reference_smoke_server_e2e.md`.

## Estado

- F1–F5 mergeado en `develop`. Permisos validados en backend (`ensurePermission`) + frontend (`*appHasPermission`).
- Cliente PWA (`projects/mobile`) construido sobre este server. Ver [mobile-pwa.md](mobile-pwa.md).
- El server además puede servir la PWA estática (`dist/mobile`) y exponer SSE para KDS.

---

## Actualización 2026-07 — tres superficies web servidas por el nodo `server`

En `mode=server`, el Fastify embebido sirve **tres** frontends distintos, cada uno con su base-href y su modelo de auth. No confundirlos:

| Ruta | Qué es | Bundle | Auth |
|---|---|---|---|
| `/` | **PWA mobile** (staff en LAN, operación móvil) | `dist/mobile` (`projects/mobile`) | Staff (JWT `/api/rpc`) |
| `/admin/` | **Frontend desktop completo servido como web** (panel administrativo full en el navegador, sin Electron) | `dist/frc-gourmet-web` (`--base-href /admin/`) | Staff (JWT `/api/rpc`) |
| `/tienda/` | **Storefront público** (clientes finales, pedidos online) | `dist/storefront` (`--base-href /tienda/`) | **Cliente** (JWT propio, `/pub/*`) → [pedidos-online.md](../domains/pedidos-online.md) |

### Web `/admin` (`f7cde79`)

Es el **mismo Angular del desktop** corriendo en un browser contra el nodo server. El frontend siempre habla por `window.api`; en web se instala un **shim HTTP** (`src/app/web/api-http.ts`) que enruta cada llamada de `RepositoryIpcService` a `POST /api/rpc`, login por `/api/auth/login`, refresh de JWT en 401, imágenes `app://` proxeadas por `/api/files/by-url`, y **stubea las APIs solo-Electron** (controles de ventana, auto-update, backups) para que los guards del frontend las detecten ausentes. Entry `src/main.web.ts` + `tsconfig.web.json`; config `web` en `angular.json`; `build:web` dentro de `build:prod`. Servido con `@fastify/static` prefijo `/admin/` + SPA fallback.

Fixes de reapertura de navegador: **single-flight del refresh token** (un burst de 401 concurrentes borraba ambos tokens de un refresh de un solo uso) y evento `frc-web-auth-expired` → `AuthService.logout()` cuando el refresh vence (`0167421`/`fffefbc`). En Electron el evento nunca se emite (no-op).

### WhatsApp (dos mecanismos independientes)

- **Evolution API** (self-hosted Baileys, `electron/services/whatsapp.service.ts`) — URL+instancia como config normal, **apikey en keytar** (`notif-evolution-apikey`; canal `set-notif-secret` bloqueado en `/api/rpc`). Usos: notificaciones RRHH y **resumen de cierre de caja como imagen** (`resumen-caja-imagen.util.ts`, `BrowserWindow` offscreen → PNG; hook en `update-caja`, best-effort; handler manual `enviar-resumen-cierre-whatsapp` + botón "Reenviar" en `list-cajas`).
- **WhatsApp Cloud API (Meta)** (`electron/utils/whatsapp-sender.ts`) — **solo el OTP de pedidos online**; config por env (`WHATSAPP_CLOUD_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`); sin credenciales usa `provider='dev-log'` (loguea el código y lo devuelve en la respuesta para pruebas).


## La sesión sobrevive al cierre de la app (2026-08-27)

### Qué estaba roto

El access token y el refresh token eran **variables de módulo de `preload.ts`**:
morían con el proceso. Pero el estado de sesión de la UI se persiste en
`localStorage` (`current_user`, `session_id`) y sobrevivía.

Al reabrir, `AuthService` reconstruía el usuario desde ese caché **sin mirar los
tokens**, y el transporte HTTP arrancaba sin credenciales. Resultado: la app
mostraba el nombre y el avatar leídos del disco, y cada llamada salía sin
`Authorization` y volvía rechazada. **Sesión zombi.** Relogear lo resolvía.

Nada la corregía sola: el evento `frc-web-auth-expired`, que dispara el logout
automático, sólo lo emitía el shim de la web `/admin`. En Electron el listener
existía sin que nada lo disparara nunca.

### Cómo funciona ahora

1. **El refresh token se persiste** (`electron/utils/client-refresh-token.utils.ts`):
   keytar y, si no hay keyring, archivo `0600` en `userData`. Mismo patrón que
   `jwt-secret.utils.ts`. Se escribe en el login, en el login por QR y **en cada
   rotación**; se borra en el logout y cuando el servidor lo rechaza.
2. **Se rehidrata antes del primer RPC** (`preload.ensureRehydrated()`,
   memoizada, esperada dentro de `invokeRouter`).
3. **Red de seguridad** en `AuthService`: si tras la rehidratación el transporte
   sigue sin credenciales, limpia la sesión y va al login.
4. **Una sola vía de expiración**: el preload emite `frc-web-auth-expired`
   también en Electron.

### Cuatro cosas no obvias

- **⚠️ La rehidratación pasa SIEMPRE por `refreshAccessIfPossible()`**, que
  reenvía el `deviceId`. Por otro camino el JWT vuelve con `device_id: null` y
  `resolveRequestDeviceId` no puede identificar la terminal: **los tickets salen
  por la impresora equivocada**.
- **Los canales van por `_originalInvoke`, no por `ipcRenderer.invoke`.** En
  modo cliente está monkey-patcheado y la llamada saldría a `/api/rpc` contra un
  canal que el servidor no registra, fallando en silencio.
- **Los handlers se registran en `app.on('ready')`, sincrónicamente y antes de
  `createWindow()`** — no dentro de `registerAllAppHandlers()`, que corre al
  final de la cadena async de `initializeDatabase()` (después de migraciones y
  seeds) mientras la ventana ya carga en paralelo. El primer RPC puede llegar
  antes. No necesitan la base: son keytar + filesystem.
- **La rehidratación se memoiza y se espera dentro de `invokeRouter`**, no en el
  top level del preload: el módulo es CommonJS (sin top-level await) y bloquear
  su carga congelaría la ventana.

### `useHash: true` en el router (el bug que venía de arriba)

En la build empaquetada la ventana carga `file://.../index.html`. El
`<base href="/">` **no aplica a `history.pushState`**, que resuelve contra la URL
real del documento: un `router.navigate(['/login'])` no fallaba ni lanzaba —
dejaba `location.href` en `file:///login`, la raíz del filesystem, en silencio.
La app seguía andando porque el Router lee `location.pathname`, pero el
siguiente **reload real** (el botón «Recargar la aplicación») moría con
`ERR_FILE_NOT_FOUND` y dejaba la pantalla en blanco hasta reiniciar el proceso.

Se llegaba ahí en **cada arranque en frío** (el `BehaviorSubject` de sesión
emite `null` antes de que termine la restauración async, y `app.component`
navega al login) y en **cada logout**, en los tres modos. Era preexistente y
transversal, no un efecto del arreglo del autologin.

Verificado empíricamente sobre Electron 24.3.0, no por inspección.

### Lo que el informe original decía y no era

Un diagnóstico previo listaba como defecto que **el usuario cacheado no trae
roles**. No es un problema: `PermissionService` se suscribe a `currentUser$` y
pide los permisos al servidor (`getPermissionsByUser`) en cada cambio, y **nada
lee `usuario.roles`** — la entidad ni tiene esa propiedad. El sidenav aparecía
vacío por la sesión zombi (esa llamada también salía sin token), no por el caché.

**Test:** `npm run test:sesion-cliente` (18 asserts). Manual:
`docs/testing/TESTING-CHECKLIST-SESION-CLIENTE.md`.
