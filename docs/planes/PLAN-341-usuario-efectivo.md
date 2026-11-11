# PLAN #341 — Usuario efectivo en todos los handlers (no la consola del servidor)

## Problema
Por `/api/rpc` (modo server: PCs cliente, `/admin`, PWA) el usuario del request vive en el
`AsyncLocalStorage` (`withRequestUser` en `rpc-router.ts`). `checkPermission`/`ensurePermission`
y `setEntityUserTracking` ya lo leen, pero ~400 llamadas `getCurrentUser()` de los handlers leen
el global del main process = **el operador logueado en la consola del servidor**. Efectos:

- Auditoría a nombre equivocado: `verificadoPor`, `responsable`, `revisadoPor`, `usuario` de rondas,
  movimientos de stock, trazas de ajuste, etc.
- Controles de permiso manuales (`get-gasto`, `get-vale`, `pago-consolidado` ~504) que autorizan con
  los permisos de la **consola**: hueco de seguridad (un cajero por HTTP lee gastos si la consola es admin)
  y rechazos espurios «no autenticado» si la consola no tiene sesión.

## Solución (sistémica, una línea de lógica)
En `electron/utils/register-all-handlers.ts`, `registerAllAppHandlers` envuelve el `getCurrentUser`
recibido: `const getCurrentUser = () => getEffectiveUser(rawGetCurrentUser)` y es ESE el que se pasa
a todos los `register*Handlers`. Así el patrón no se puede repetir en handlers nuevos.

- Standalone / IPC local: sin store ALS → `getEffectiveUser` devuelve el global. **Sin cambio.**
- Schedulers / tareas fuera de request (acreditaciones cada 5 min, avisos): sin store → global. Sin cambio.
- `checkPermission(getCurrentUser)` y los 37 `getEffectiveUser(getCurrentUser)` existentes: idempotente.
- `setCurrentUser` NO se toca (login/logout siguen operando el global).
- IPC `getCurrentUser`: en modo cliente es `ALWAYS_LOCAL_CHANNELS` (preload), no viaja por HTTP; por HTTP
  directo pasa a devolver el usuario del request (correcto).
- Forma del objeto: el usuario del request se carga con `findOne` sin relaciones; `password` es
  `select:false`, no sale el hash. Verificado: ningún handler lee `currentUser.persona` del global.
- `main.ts` registra fuera de `registerAllAppHandlers` solo window-chrome y refresh-token (no usan usuario).

## Alcance
Solo código. Sin migraciones, sin datos retroactivos (los registros viejos atribuidos a la consola quedan).
No toca cobro/factura/PdV en su lógica: solo QUIÉN queda como autor en modo server. Cambia la atribución de
rondas/stock/ajustes hechos desde clientes HTTP (pasa a ser el usuario real). `createVenta` ya atribuía bien
(vía `setEntityUserTracking`).

## Pruebas
- `test:usuario-efectivo` nuevo (SQLite tmp + registerAllAppHandlers, patrón de test-permissions-e2e):
  1. consola=admin, request=cajero sin FINANCIERO_GASTO_VER/CAJA_MAYOR_OPERAR → `get-gasto` rechaza NO_PERMISSION
     (en develop pasa = reproduce el hueco).
  2. consola=null, request=admin → `get-gasto` no da «no autenticado» (develop falla).
  3. IPC `getCurrentUser` dentro de `withRequestUser(cajero)` devuelve cajero; fuera, el global.
  4. Standalone: sin request, consola=admin → `get-gasto` pasa como hoy.
  5. Guardia estática: register-all-handlers envuelve con getEffectiveUser.
- Suites vecinas: test:permissions, test:cpc-cancelada-cuotas, test:saldos-atomicos; test:all completo (línea base).
- Prueba real en clon de Don Franco por HTTP (servidor de prueba): acción auditada desde cliente con consola en otro
  usuario → autor correcto; y una venta cobrada + factura desde cliente HTTP (toca el camino de PdV aunque sea solo autoría).
