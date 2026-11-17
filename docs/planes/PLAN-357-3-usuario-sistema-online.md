# PLAN #357 punto 3 — rutas públicas a nombre de «Sistema / Online»

Decisión del propietario (14/11/2026, opción A): las acciones de las rutas públicas (QR de mesa y tienda online, `/pub/rpc`) quedan a nombre de un usuario de sistema explícito, sin permisos y sin login.

## Problema
`public-routes.ts` invoca los handlers sin usuario de request (`withRequestUser`). Dentro de una operación pública:
- `getCurrentUser()` (envuelto con `getEffectiveUser`) devuelve el **operador logueado en la consola** del servidor.
- `ensurePermission` resuelve también a la consola → una operación pública **hereda sus permisos** (verificado con un test: sin el arreglo, `ensurePermission('VENTAS_PDV')` pasa dentro de `/pub/rpc`).
- `setEntityUserTracking(ds, ent, undefined)` (lo que usa `materializarPedidoOnlineEnVenta` desde `crear-pedido-online`) deja la venta, los ítems, el delivery y la mesa **sin autor**.

## Cambio
1. `electron/utils/usuario-sistema.utils.ts` (nuevo): `getUsuarioSistemaOnline(ds)` busca el usuario `SISTEMA_ONLINE` y, si no existe, lo crea en una transacción (persona «SISTEMA / ONLINE» inactiva + usuario **inactivo**, sin roles, clave bcrypt aleatoria). Cache en memoria (promesa); ante choque por nickname único (dos requests a la vez) relee el existente. Idempotente en SQLite y Postgres, sin migración (lo crea el ORM con los defaults de la entidad).
2. `public-routes.ts`: el handler de `/pub/rpc` corre dentro de `comoSistemaOnline(dataSource, fn)` = `withRequestUser(sistema, fn)`. Si el usuario no se puede resolver, se loguea y la operación sigue como hoy (no cortar la tienda ni el QR).
3. `server.ts`: `registerPublicRoutes(fastify, opts.dataSource)`.

Efecto: lo que crea un comensal o cliente online (venta MESA_QR, ítems, delivery, mesa) queda con `created_by/updated_by = Sistema / Online`; ningún `ensurePermission` dentro de lo público pasa con los permisos de la consola. Los handlers públicos actuales no llaman a `ensurePermission` (revisado: pedidos-online-pedidos, -auth, -config público, menú, y la cadena materializar → crearDeliveryEnTx / crearComandaItemsSiCorresponde / autoPrintComandaIfNeeded).

Por qué no puede loguearse: `activo=false` → `/api/auth/login`, `login` IPC y `/api/rpc` (fail-closed de #357) lo rechazan; además la clave es aleatoria y no se guarda.

## Fuera de alcance
- No se tocan datos históricos (sin arreglos retroactivos).
- Los handlers de staff citados en la issue (`mesa-qr.handler.ts`, `pedidos-online-admin.handler.ts`) ya corren con `ensurePermission` y, por HTTP, con el usuario del JWT (#341/#357): no son rutas públicas.
- Conflicto con los PRs de la tienda (#323…#354): tocan la línea del `ctx` en `public-routes.ts` y un import; este cambio deja esas líneas intactas (envuelve el handler entero) para que el rebase no choque.

## Pruebas
- `test:usuario-efectivo` sección 8 (Fastify real, `/pub/rpc`): un solo usuario con 2 requests concurrentes; inactivo y sin roles; el handler ve a Sistema / Online y la autoría queda a su nombre; `ensurePermission` falla dentro de lo público; `tienda.config` real → 200; tras reiniciar el cache reusa el mismo usuario; no puede iniciar sesión; su token en `/api/rpc` → 401; la consola sigue intacta. Control sin el arreglo: 7 de 32 fallan.
- Creación del usuario en Postgres (script contra el Postgres de la estación).
- `electron:serve-tsc`, `test:all --jobs 3` sin fallas nuevas sobre la línea base.
- Prueba real en la copia de Don Franco: pedido por QR de mesa y por tienda vía `/pub/rpc` → venta con `created_by` = Sistema / Online. No toca cobro ni factura.

## Al instalar
La primera operación pública crea el usuario «SISTEMA_ONLINE» (inactivo). Aparece en la lista de usuarios como inactivo: no hay que activarlo ni darle roles.
