# Checklist de pruebas manuales — Cobro consolidado de CPC (multi-cuota + descuento)

Feature: *Caja Mayor → Ingreso → Cobrar a Cliente* pasa a abrir el wizard consolidado
(`concepto = COBRO_CLIENTE`), que cobra **varias cuotas de un mismo cliente** en un solo
evento, con N líneas (multi-moneda × multi-forma × caja/banco) y un **descuento** opcional.

> **Requiere reiniciar la app**: el cambio toca `electron/handlers/`, entidades y una
> migración. Con hot reload de Angular no alcanza.

Automatizado: `npm run test:cobro-cpc-consolidado` (63 asserts, E2E sobre SQLite con
migraciones y handlers reales), `npm run test:pago-consolidado` (90), y
`npm run test:pagar-obligaciones-dialog` (19). Este checklist cubre lo que ningún test
automatizado ve: la pantalla.

---

## 0. Preparación

- [ ] Migración corrida sin error al arrancar (log `DatabaseService.runMigrations`).
- [ ] Un cliente con una CPC ACTIVA de al menos 3 cuotas pendientes (se genera con una
      venta a crédito desde el PdV, o con *Cuentas por Cobrar → Nueva*).
- [ ] Una caja mayor ABIERTA con saldo en efectivo Gs y, si se va a probar multimoneda,
      en USD.
- [ ] Una cuenta bancaria activa en Gs.
- [ ] Usuario de prueba **sin** `CPC_DESCUENTO` (para el paso 4) y el admin **con** el
      permiso. El permiso es nuevo y **no está en ningún rol plantilla**: hay que
      asignarlo a mano desde *Personas → Roles*.

## 1. Cobro simple (el camino feliz)

- [ ] *Caja Mayor → Ingreso*: la tarjeta **Cobrar a Cliente** dice "Cobrar una o varias
      cuotas pendientes de un cliente, con descuento opcional".
- [ ] Al elegirla se abre el wizard, **no** el diálogo viejo de búsqueda de CPC.
- [ ] El título dice **Cobrar a cliente**; la columna de la tabla dice **Cliente** (no
      "Beneficiario") y la de monto **Monto a cobrar** (no "Monto a pagar").
- [ ] Se listan las cuotas pendientes con su vencimiento y saldo.
- [ ] Tildar 2 cuotas del mismo cliente. El subtítulo muestra la cantidad y el total.
- [ ] Paso 2: el encabezado dice **Cobrar a \<cliente\>**; el paso se llama **Formas de
      cobro**; el balance dice **Total a cobrar** / **Total formas de cobro**.
- [ ] Agregar una línea de efectivo por el total → aparece el tilde de "cuadra".
- [ ] Paso 3: dice **Se cobra**; el botón dice **Confirmar cobro**.
- [ ] Confirmar. Snackbar "Cobro registrado."
- [ ] En movimientos de Caja Mayor aparece **un solo** movimiento de ingreso (no uno por
      cuota) con descripción que empieza con **COBRO**.
- [ ] El saldo de la caja **subió** por el monto cobrado.
- [ ] Las 2 cuotas quedaron COBRADAS y el saldo del cliente bajó (verificar en
      *Clientes → ficha del cliente*).

## 2. Un cobro = un cliente

- [ ] Con una cuota de un cliente tildada, las cuotas de **otros** clientes quedan
      deshabilitadas (fila atenuada, checkbox bloqueado).
- [ ] Destildar libera al resto.
- [ ] El filtro dice **Filtrar por cliente** y el buscador de texto filtra por nombre al
      apretar **Filtrar** (no mientras se tipea).

## 3. Multimoneda y banco

- [ ] Cobrar una cuota en Gs con 2 líneas: efectivo Gs + efectivo USD con cotización.
      El total convertido cuadra.
- [ ] Tras confirmar: el saldo USD de la caja subió **en USD** (sin convertir) y el de Gs
      en Gs. Se generaron 2 movimientos (uno por moneda).
- [ ] Cobrar otra cuota con fuente **Cuenta bancaria**: el saldo de la cuenta **subió** y
      en el historial del banco figura una **ENTRADA**, no una salida.

## 4. Descuento

Con el usuario **sin** `CPC_DESCUENTO`:
- [ ] En el paso 2 **no** aparece el botón *Aplicar descuento*.

Con el admin (con el permiso):
- [ ] Aparece **Aplicar descuento**, separado del formulario de líneas.
- [ ] Abre el diálogo de descuento con radio **PORCENTAJE / MONTO FIJO**, motivo
      obligatorio y el resumen "Descuento: −X / Total con descuento".
- [ ] Aplicar 10%: se agrega una línea **Descuento — \<motivo\>** con ícono propio, y el
      total de cobro pasa a necesitar sólo el resto en efectivo.
- [ ] Completar con efectivo → cuadra. Confirmar.
- [ ] A la caja entró **sólo el efectivo**, no el total de la deuda.
- [ ] Las cuotas quedaron **COBRADAS** igual, y el saldo del cliente bajó por el **total**
      (efectivo + condonado).
- [ ] En la ficha del cliente, el movimiento de descuento figura **separado** del pago
      (uno es PAGO, el otro AJUSTE_NEGATIVO).
- [ ] En el menú ⋮ del movimiento → *Ver detalle*: se ve la línea de descuento con su
      motivo y el total condonado.

### Límites del descuento

- [ ] Intentar un descuento **igual al total** del cobro: se rechaza en el acto, con un
      mensaje que apunta a cancelar la cuenta por cobrar. **No** debe dejar avanzar hasta
      el paso 3 para fallar ahí.
- [ ] Dejar el motivo vacío: el botón *APLICAR* queda deshabilitado.
- [ ] En *Configurar Caja Mayor* poner **Descuento máximo = 5%**. Volver al wizard:
      el diálogo muestra "Tope de esta caja: 5%" y el máximo en monto; pasarse bloquea
      *APLICAR* con un mensaje de tope.
- [ ] Dejar el tope vacío → vuelve a no haber límite.

### El descuento no sobrevive a un cambio de base

- [ ] Aplicar un descuento, y después **destildar** una cuota: el descuento se quita solo
      y aparece un aviso explicando por qué.

## 5. Cuota reservada por una liquidación de sueldo

Sólo aplica si hay un funcionario que además es cliente y consume a crédito.

- [ ] Generar el **borrador** de su liquidación de sueldo (que toma sus cuotas CPC del
      período).
- [ ] Abrir el wizard de cobro: esa cuota aparece **bloqueada**, y el tooltip dice que
      está reservada por la liquidación #N.
- [ ] Pagar la liquidación. Volver al wizard: si quedó saldo, la cuota se **destraba**.

## 6. Anulación

- [ ] Menú ⋮ del movimiento de cobro → *Ver detalle* → **Anular cobro**.
- [ ] El diálogo dice "Anular cobro" (no "Anular pago").
- [ ] Si la caja no tuviera saldo suficiente para devolver, avisa que quedará en negativo
      y pide confirmación (anular un cobro **debita** la caja).
- [ ] Tras anular: saldo de caja y del banco vuelven a su valor previo, las cuotas
      vuelven a PENDIENTE, la CPC vuelve a ACTIVA y el saldo del cliente se repone —
      incluido lo que se había condonado.
- [ ] Intentar anular el movimiento suelto desde el menú ⋮: lo rechaza y remite a anular
      el evento completo.
- [ ] Volver a anular el mismo evento: dice que ya fue anulado.

## 7. No se rompió el pago (regresión)

- [ ] *Caja Mayor → Egreso → Pagar Gastos*: el wizard sigue diciendo **Monto a pagar**,
      **Formas de pago**, **Confirmar pago**.
- [ ] *Pagar Compras*: al tildar una cuota de un proveedor, las de otros proveedores
      quedan deshabilitadas.
- [ ] *Pagar Salarios*: sigue permitiendo **una sola** liquidación por vez.
- [ ] En ninguno de los cuatro aparece el botón de descuento, ni siquiera con el permiso.
- [ ] *PdV → descuento global de una venta*: sigue funcionando igual (el diálogo de
      descuento es compartido y se le agregaron entradas opcionales).

## 8. Modo servidor / cliente

- [ ] Repetir el cobro simple desde un nodo en **modo cliente** contra un servidor:
      el evento se registra igual por `/api/rpc`.
- [ ] Con Postgres: dos cobros simultáneos del mismo cliente desde dos dispositivos no
      dejan el `saldoActual` mal (el cobro consolidado lockea cuota → CPC → cliente).
