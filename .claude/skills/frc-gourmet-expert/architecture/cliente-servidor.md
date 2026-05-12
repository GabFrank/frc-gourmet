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

## Fases por orden histórico

### F1 — Dual driver SQLite/Postgres + migrations
- `database.config.ts` admite override → `getDataSourceOptions` decide driver.
- `synchronize: false` definitivo.
- Dual baseline `migrations/` SQLite + Postgres.
- `DatabaseService.runMigrations` + backup pre-migrate + rename de baseline legacy.

### F2 — Repository abstract + factory
- `repository.service.ts` se renombró a `repository-ipc.service.ts` (impl IPC original).
- Se creó `repository.service.ts` como **abstract class canónica** generada desde la impl.
- Se creó `repository-http.service.ts` (impl HTTP para `mode=client`).
- DI provider `repositoryFactory()` en `AppModule` elige impl según `process.env.FRC_APP_MODE` (que setea `main.ts`).

### F3 — Server skeleton + RPC router
- F3.1: Fastify server en `electron/server/` con endpoints `/api/version`, `/api/health`.
- F3.2/3.3: JWT auth middleware + login/refresh + RPC router (`/api/rpc/:channel`) + file endpoint.
- **Handler registry global** vía monkey-patch de `ipcMain.handle` — cada canal IPC queda registrado en `handlerRegistry` y el RPC router puede invocarlo por nombre. Resultado: los 696 handlers IPC originales son automáticamente accesibles por HTTP sin duplicar código.

### F4 — UI modo + cliente HTTP
- F4.1: Preload monkey-patchea `ipcRenderer.invoke` en `mode=client` para rutear a HTTP. Auth flow (login → JWT en memoria → refresh).
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

## Smoke server para testing E2E

`scripts/test-server-standalone.ts` arranca un Fastify completo con los 696 handlers reales (mediante el handler registry global). Permite testear `mode=client` en una sola Mac sin necesidad de 2 PCs.

Memoria: `reference_smoke_server_e2e.md`.

## Estado al 2026-05-11

Todo F1–F5 está mergeado en `develop`. Pendiente:
- Testing E2E F4 images con cliente real.
- F6 Mobile (fuera de scope actual).
- Activar `PermissionService` en frontend (existe pero no se usa para chequear permisos).

Memoria: `project_proxima_sesion_post_f5.md`, `project_cliente_servidor_f4.md`.
