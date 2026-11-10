# PLAN tienda online F8b — cuenta web vinculada al cliente y compra a cuenta

Rama: `bot/ceo-frc-gourmet/feat-tienda-f8b-credito`, sale de `feat-tienda-pagos-proveedores`.
Nada se mergea sin el OK del propietario. Toca crédito y cuentas por cobrar: antes del merge se
prueba **cobrando de verdad** en la copia (pedido a cuenta → entrega → CPC → cobro de la cuota).

## Estado (2026-11-07)

Fase 1 (vinculación) hecha: migración `TiendaVinculoCuentaCliente`, handlers
`cuentas-tienda.handler.ts`, pantalla «Cuentas de la Tienda», chip en la ficha del cliente,
pedido y venta con el cliente. Tests `test:tienda-vinculacion` 32/32 en SQLite y Postgres,
migraciones 74/74, batería completa 105/105, AOT y Chrome. Guía para agentes:
`docs/runbooks/RUNBOOK-TIENDA-VINCULAR-CUENTAS.md`. Fase 2 (compra a cuenta) hecha el mismo día: `credito-tienda.utils.ts`, checkout «A cuenta» con
disponible, deuda al aceptar (1 cuota a fin de mes), reversa al cancelar, guardas contra doble
cobro. `test:tienda-credito` 41/41 en SQLite y Postgres; batería 107/107; probado en Chrome contra
la copia: pedido a cuenta, aceptado (CPC ₲ 20.000 vence 30/11, saldo ₲ 20.000) y cancelado
(CPC CANCELADA, saldo 0).

### Pendiente conocido (auditoría fase 2)

- **Editar la venta después de aceptar** (RESUELTO 2026-11-10: la deuda sigue al total, con
  tope y bloqueo si tiene cobros; ver `PLAN-tienda-deuda-editada.md`). Antes: (agregar/quitar ítems, descuento, cambiar el envío): la
  deuda queda por el total del pedido. Si el total sube, la diferencia se cobra al entregar como
  cualquier saldo; si baja, la deuda queda mayor que la venta y hay que ajustarla a mano en la
  cuenta del cliente. Propuesta: bloquear la edición de una venta con deuda web, o resincronizar
  la CPC. Decisión del propietario.
- **Límite 0 = sin crédito** (RESUELTO 2026-11-09, web y PdV; el PdV ya no deja «forzar» pasarse). Antes: se cambia
  esa regla.

## Por qué

Decisión del propietario (05/11, confirmada 07/11): la tienda tiene que poder vender a cuenta a
los clientes que ya tienen crédito en el local. Hoy la cuenta web (`CuentaCliente`) nunca se une
al `Cliente` interno: no hay crédito, ni historial, ni factura con sus datos.

Regla cerrada: **la vinculación es manual**, la hace el personal con permiso y queda registrado
quién la hizo. Nunca automática por teléfono o correo: cualquiera puede crear una cuenta web con
el teléfono de otro y comprar a su nombre.

## Lo que ya existe

- `CuentaCliente.cliente` (`cliente_id`, nullable) ya está en la entidad y en la base; nada lo
  escribe.
- `Cliente.credito`, `limite_credito`, `saldo_actual`; `ajustarSaldoCliente` (atómico).
- `cobrar-venta-credito` (cuentas-por-cobrar.handler): Pago CREDITO, venta CONCLUIDA, CPC
  `CREDITO_VENTA` con cuotas, `MovimientoCliente` CARGO, saldo. En el PdV el límite es un aviso
  confirmable (`forzar`).
- Pago del pedido (F8): `metodos_pago` en la config, `validarPagoPedido`, `pagoPrevisto` precargado
  en el cobro del delivery.

## Diseño

### 1. Vincular (admin)

- Pantalla nueva **«Cuentas de la tienda»** (menú Pedidos online): nombre, teléfono, correo,
  último ingreso, cantidad de pedidos, cliente vinculado. Filtro con botón (sin filtrado en vivo).
- Acciones **Vincular a un cliente** (buscador de clientes existente) y **Desvincular**, con
  confirmation-dialog. Permiso `CLIENTES_GESTIONAR`.
- Un cliente puede tener **una sola** cuenta web vinculada (evita que dos cuentas gasten el mismo
  crédito sin control). Se valida en el servidor.
- Registro: columnas `vinculado_por` / `vinculado_en` en `cuentas_cliente` y una tabla de
  historial `cuentas_cliente_vinculos` (cuenta, cliente, acción VINCULAR/DESVINCULAR, usuario,
  fecha, motivo opcional). Desvincular no borra nada.
- La ficha del cliente muestra «Cuenta web: <teléfono/correo>» si está vinculada.

### 2. Pedido de una cuenta vinculada

- Al pasar a venta (`materializarPedidoOnlineEnVenta`) la venta lleva `cliente` = el vinculado,
  con o sin crédito: queda en su historial y la factura sale con sus datos.

### 3. Compra a cuenta

- Método nuevo `CREDITO` («A cuenta»), modalidad `A_CUENTA`. Se habilita en la config de la tienda
  como los demás métodos.
- El checkout lo muestra **solo** si la cuenta está vinculada a un cliente activo con `credito` y
  le alcanza el disponible. `pub-cliente-me` devuelve `credito: { disponible, limite }` (sin el
  saldo detallado). Invitados y MESA_QR no lo ven.
- **Disponible** = `limite_credito − saldo_actual − pedidos web A_CUENTA todavía no cobrados`.
  Límite 0 = sin crédito, igual que en el PdV (decisión 2026-11-09).
- `pedido.crear` lo vuelve a validar en el servidor, bajo lock del cliente: en la web el límite es
  **duro** (el cliente no puede «forzar»). Error `credito_insuficiente` / `credito_no_habilitado`.
- **Cuándo nace la cuenta por cobrar — decisión del propietario (ver abajo).**
- El personal ve «A CUENTA» en la bandeja, el diálogo de delivery y la comanda, igual que hoy ve
  «Efectivo» o «Tarjeta al recibir».
- Cancelar un pedido A_CUENTA: si la CPC ya existe se revierte con la reversa que ya existe para
  ventas a crédito (`venta-reversa.utils`); si no, solo libera el disponible.
- «Mis pedidos» / «Mi cuenta»: muestra «Pagado a cuenta» y, en Mi cuenta, el disponible.

### 4. Datos (migración aditiva)

- `cuentas_cliente.vinculado_por`, `vinculado_en`.
- Tabla `cuentas_cliente_vinculos`.
- Enums: `MetodoPagoPedido.CREDITO`, `PagoModalidad.A_CUENTA` (varchar, sin cambio de columna).
- Índice único parcial «un cliente, una cuenta» donde el driver lo permita; si no, validación en
  el handler bajo lock.

## Correcciones de la auditoría (07/11)

- **P0 — No hay lock por cliente.** `pedido.crear` guarda sin transacción y los locks que hay son
  por pedido o por mesa. Nuevo `withClienteLock(clienteId)` (mutex en memoria, cubre SQLite y el
  servidor único) + transacción con `FOR UPDATE` sobre `clientes` en Postgres: releer saldo y
  reservas e insertar el pedido en la misma transacción. Test de dos pedidos simultáneos en
  **los dos** drivers.
- **P0 — `cobrar-venta-credito` confía en lo que manda la pantalla** (`clienteId`, `montoTotal`).
  Para una venta de pedido A_CUENTA el servidor fija el cliente del pedido, exige monto = total de
  la venta, rechaza otro cliente y revalida el límite bajo lock.
- **P0 — Puertas que no estaban:** un delivery marcado ENTREGADO sin cobrar (vía
  `sincronizarPedidosOnline`) dejaba el pedido entregado **sin deuda**; también cobro en efectivo
  de un pedido «a cuenta», aceptación automática, modificar pedido y rechazos de la bandeja. La
  reserva se calcula con una sola consulta por estado (no un contador).
- **El pedido guarda su `cliente_id`** al crearse: desvincular la cuenta después no cambia a quién
  se le cobra.
- **Solo identidad verificada compra a cuenta:** teléfono validado por código o correo verificado.
  Una cuenta vinculada que solo tiene teléfono de contacto sin verificar no ve «A cuenta».
- La API pública hoy devuelve el `clienteId` interno en la cuenta: se quita.
- Si el local cambia el total (agrega ítems, envío): se revalida el disponible con la diferencia;
  el local puede forzar, como en el PdV.
- Un pedido A_CUENTA con una cuota ya cobrada no se cancela (regla actual de la reversa).
- Sin caja abierta (o con dos) falla como hoy: test incluido. Cuotas en la moneda principal,
  redondeo en la última; `recalcular-saldo-cliente` tiene que dar el mismo saldo después de todo.
- Índice único parcial «un cliente, una cuenta» en los dos drivers. Permiso `CLIENTES_GESTIONAR`
  ya existe.

## Decisiones del propietario (07/11)

- La deuda nace **al aceptar el pedido**, en la misma transacción que crea la venta.
- **1 cuota que vence el último día del mes** de la compra.
- El cliente ve en la tienda solo su disponible.

## Opciones que se plantearon

1. **¿Cuándo nace la CPC?**
   - **a) Al aceptar el pedido, cuando pasa a venta (recomendado tras la auditoría).** La deuda
     nace en la misma transacción que la venta, sin intervención del cajero: no hay forma de
     entregar sin deuda ni de cambiarle el cliente o el monto. Cancelar revierte la CPC con la
     reversa que ya existe.
   - b) Al entregar / finalizar. Es el momento en que hoy se cobra un delivery, pero abre la
     puerta a entregar sin cobrar y obliga a reservar el disponible aparte.
2. **Cuotas y vencimiento:** 1 cuota a N días (propuesta: 30, configurable en la tienda).
3. **¿El cliente ve su saldo en la tienda?** Propuesta: solo el disponible, no el detalle.

## Fases

1. Vinculación: migración, handlers, pantalla, historial, venta con cliente. Tests.
2. Compra a cuenta: método, disponible, validación con lock, checkout, CPC al entregar (o al
   aceptar, según la decisión), cancelación. Tests SQLite y Postgres.
3. Cierre: auditoría con agentes, batería completa, AOT, Chrome (vincular, pedir a cuenta,
   entregar, cobrar la cuota), manual de pruebas, skill y docs.

## Tests

- Vincular sin permiso → rechazado; vincular un cliente que ya tiene cuenta → rechazado;
  desvincular deja historial; el pedido de una cuenta vinculada sale con su cliente.
- A cuenta sin vínculo / cliente sin crédito / inactivo → rechazado aunque el storefront lo mande.
- Límite: justo en el disponible pasa; un peso más no; dos pedidos simultáneos que juntos superan
  el disponible → uno pasa y el otro no (Postgres).
- CPC: se genera una sola vez, con el monto del pedido; saldo y MovimientoCliente cuadran;
  cancelar antes/después revierte bien.

## Riesgos

- Dos pedidos a la vez del mismo cliente: el lock tiene que ser sobre el cliente, no sobre el
  pedido.
- El crédito del PdV y el de la web comparten saldo: una venta en el local mientras hay un pedido
  web en curso puede dejar al cliente sobre el límite. En el local sigue siendo aviso confirmable.
