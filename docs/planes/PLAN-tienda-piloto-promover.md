# PLAN — Promover la tienda online a develop para el piloto en Don Franco

Fecha: 25/11/2026 · Rama: `bot/ceo-frc-gourmet/feat-tienda-piloto` (desde la punta de la cadena,
`feat-tienda-avisos-cliente` 05a26faa) · OK del propietario: «Sí, preparala ahora (sin mergear)».

## Problema

La tienda online (F1–F9, pagos Pix/USDT/a cuenta, deuda editada, avisos de WhatsApp) vive en una
cadena de ramas que develop no tiene (174 commits, 239 archivos). Para el piloto hace falta un solo
PR hacia develop, al día, con el CI en verde y la prueba final hecha. Además queda un pendiente de
#357 punto 3: el aviso de los proveedores de pago (`POST /pub/pagos/:proveedor/aviso`) y el job de
pagos (`iniciarJobPagosOnline`, cada 60 s) corren sin usuario de request, o sea, a nombre del
usuario de la consola del servidor (y con sus permisos). Lo que crean (pedido pagado, venta
materializada, pago) tiene que quedar a nombre de «Sistema / Online», como /pub/rpc.

## Qué se cambia

1. **Traer develop** (#368 fusionar-clientes, #369 cuotas con centavos) por merge en la rama. Los
   conflictos son solo de los dos mapas generados (`src/app/web/api-channel-map.generated.ts`,
   `projects/mobile/.../api-channel-map.generated.ts`): se regeneran con el script del repo, no se
   editan a mano.
2. **Aviso de pago como Sistema / Online**: en `public-routes.ts` la ruta del aviso resuelve el
   usuario con `getUsuarioSistemaOnline` y corre `invokeHandlerWithContext` dentro de
   `withRequestUser(sistema, …)`. Fail-closed: si no se resuelve, 503 (el proveedor reintenta y el
   job lo levanta igual por consulta).
3. **Job de pagos como Sistema / Online**: en `iniciarJobPagosOnline`, cada ciclo resuelve el
   usuario y corre `tickPagosOnline` dentro de `withRequestUser`. Si no se resuelve, se saltea el
   ciclo con un aviso en el log (nunca corre con la consola de fondo).

No se toca lógica de cobro, factura ni PdV: solo quién figura como autor de lo que hacen esas dos
entradas.

## Pruebas

- Unitarias/integración de lo tocado y de la tienda: `test:pagos-online` (SQLite y PG),
  `test:pedidos-online`, `test:usuario-efectivo`, `test:tienda-seguridad`, `test:mesa-qr`,
  `test:tienda-online-migracion` (SQLite y PG). Prueba nueva: aviso y ciclo del job dejan
  `created_by` = SISTEMA_ONLINE y fallan cerrado si el usuario no se puede resolver.
- `npm run check` (tsc) y `test:all` con 3 suites en paralelo: sin fallas nuevas frente a develop.
- Prueba final en la copia de Don Franco (`donfranco_copia`, nunca sale de la estación), tienda en
  tema claro y escritorio en oscuro, siguiendo `docs/testing/GUIA-PRUEBA-FINAL-TIENDA.md`: como
  mínimo retiro con pago al recibir (aceptar → cocina → **cobrar y facturar de verdad** en el PdV →
  entregado), delivery con zona, Pix simulado pagado (aviso del proveedor → venta a nombre de
  Sistema / Online), a cuenta, cancelaciones y cierre de caja sin ventas colgadas. Se anota el
  resultado en la tabla de la guía y se mandan capturas. Lo que dependa de servicios externos sin
  claves en la estación (dinelco, token de Meta, Google real) se declara no probado.
- CI 4/4 en el PR.

## Riesgos

- Es una entrega grande (25k líneas): migraciones nuevas de la tienda corren al instalar. Mitigación:
  prueba de migraciones en SQLite y en PG sobre la copia, y `down` de cada una ya probado en su fase.
- Al instalar, la tienda queda **apagada** hasta configurarla (Config Tienda Online); el piloto se
  prende a mano. Pagos online sin credenciales quedan desactivados.
- Si el usuario Sistema / Online no existe, se crea solo (#357); el job no corre hasta tenerlo.

## Vuelta atrás

- Antes del merge: no hay efecto en producción (PR en borrador, sin merge).
- Después del merge: revert del squash por PR con OK del propietario → alpha nueva sin la tienda. Las
  tablas nuevas quedan sin uso (no se borran datos); la tienda se puede apagar desde la config sin
  revert.

## Entrega

Un PR en borrador hacia develop («feat(tienda): tienda online para el piloto»), que reemplaza a los
PR #323, #324, #326, #342, #344, #353 y #354 (se cierran al mergear este). El merge y su horario los
decide el propietario.
