# PLAN #357 — /api/rpc fail-closed y sesión de la consola protegida

Seguimiento de #341 (PR #356), hallado en sus auditorías.

## Problema
1. `electron/server/rpc-router.ts`: si el JWT es válido pero el usuario del token no existe (borrado), la consulta falla o el token no trae `id`, el handler corre **sin** `withRequestUser` y todos los handlers usan al operador de la consola del servidor, con sus permisos (fail-open). Además no se mira `usuario.activo`: un usuario desactivado sigue operando por HTTP hasta que vence su token (15 min) y, con refresh, más.
2. `logout` y `restoreSession` no están en `BLOCKED_CHANNELS`: un cliente HTTP puede llamar `logout` por `/api/rpc` y hacer `setCurrentUser(null)` sobre la sesión de la consola (o cambiarla con `restoreSession`).

## Cambio (`rpc-router.ts` y `auth-routes.ts`)
- Con `dataSource` presente (siempre en producción, `server.ts:192`):
  - token sin `id` numérico → **401** `NO AUTENTICADO: token sin usuario`.
  - `findOne` falla → **503** `NO SE PUDO VERIFICAR EL USUARIO, REINTENTE` (no se cae a la consola).
  - usuario inexistente o `activo = false` → **401** `NO AUTENTICADO: usuario inexistente o inactivo`.
- `login`, `logout` y `restoreSession` a `BLOCKED_CHANNELS` (403). `login` por RPC reemplazaba la consola con el usuario logueado y esquivaba el límite de `/api/auth/login` (auditoría B).
- `/api/auth/refresh`: si el usuario está inactivo, revoca todos sus refresh tokens y da 401, así el cliente vuelve al login en vez de quedar con 401 en cada RPC (auditoría A).
- `logout` y `restoreSession`: La PWA y `/admin` cierran sesión por `/api/auth/logout` (`src/app/web/api-http.ts:168`) y `restoreSession` es local en `api-http.ts:245`: ningún cliente HTTP los usa.
- Sin `dataSource` (solo arneses de test viejos) el comportamiento no cambia.

Verificado: todos los emisores de JWT de staff ponen `id` (`auth-routes.ts:89/181`, `device-auth-routes.ts:94`, login IPC `auth.handler.ts:43`). El token de cliente de la tienda usa otro secreto y audiencia (`customer-jwt.utils.ts`), no pasa `authenticate`.

## Fuera de alcance
- Punto 3 de la issue (`public-routes.ts:124`, autoría de lo público a nombre de la consola): requiere elegir entre autor nulo o un usuario de sistema; queda en la issue.

## Riesgo
- Un usuario desactivado pierde el acceso por HTTP al siguiente request (es lo esperado). Si en producción hubiera un usuario operativo con `activo = false`, quedaría afuera: `activo` es `NOT NULL DEFAULT true`.
- 401 en la PWA dispara el refresh; con el cambio el refresh de un inactivo da 401 → la PWA borra los tokens y vuelve al login.
- `validate-credentials` NO se bloquea: `cobrar-venta-dialog` lo usa por `/api/rpc` desde `/admin`. Su límite de pedidos queda como observación aparte.

## Auditoría
- A (corrección): APROBADO C/OBS → refresh de inactivos (aplicado), 503 sin test (bajo), `/api/files` y aprobar dispositivo con JWT de inactivo hasta 15 min (bajo, a la issue).
- B (seguridad): OBJETADO por `login` abierto por RPC → aplicado. Resto bajo: `validate-credentials` sin límite propio, 500 con `err.message` crudo (preexistente).

## Pruebas
- `test:usuario-efectivo` sección 7 (Fastify real con `registerAuthPlugin` + `registerRpcRoute`): token de cajero activo → 200 y ve al cajero (control); usuario inexistente → 401; inactivo → 401; sin id → 401; `logout` y `restoreSession` → 403 y la consola sigue intacta. + `login` → 403, refresh de inactivo → 401 con tokens revocados (control: refresh activo → 200). En develop fallan 7; con el cambio 21/21. `test:sin-fuga-datos` 90/90.
- No toca cobro, factura ni PdV: no requiere cobrar y facturar real.
- `tsc` + test:all `--jobs 3` sin fallas nuevas.
