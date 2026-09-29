# Capítulo 8 — Caja Mayor

Centro contable del negocio. Toda la liquidez se ve consolidada acá.

## Concepto

**Caja Mayor ≠ Caja del PdV**.

- **Caja del PdV**: tu registradora física, tiene apertura/cierre diario, maneja efectivo del día.
- **Caja Mayor**: agregador virtual. Consolida ingresos (retiros de cajas + entradas + cobros) y egresos (gastos + compras + salarios). No tiene "apertura diaria" — está abierta hasta que la cierres explícitamente (raro).

Una empresa puede tener varias Cajas Mayor (ej: una por sucursal o por moneda).

## 1. Crear Caja Mayor

**Menu → Financiero → Caja Mayor → "Crear nueva caja mayor"**.

- **Nombre**: ej "Caja Mayor Sucursal Centro".
- **Descripción**.
- **Responsable**: usuario al cargo.
- **Estado**: ABIERTA.

## 2. Ver Caja Mayor (Detalle)

Click en tu caja → se abre el **Caja Mayor Detalle**.

Layout:

```
┌─────────────────────────────────────────────┬──────────────┐
│ MOVIMIENTOS                                 │ SIDEBAR      │
│ Filtros, search, paginate.                  │              │
│                                             │ Saldos:      │
│ Tabla:                                      │  PYG EFECT   │
│ Tipo | Moneda | FP | Monto | Resp | Fecha   │  $50.000.000 │
│                                             │  USD EFECT   │
│ EGRESO_GASTO  PYG  EFECT  -50.000  Juan     │  $1.200      │
│ INGRESO_RETIRO PYG EFECT +200.000 Juan      │              │
│ ...                                         │ Cuentas:     │
│                                             │  Banco Itaú  │
│ ☐ Ver anulaciones (toggle)                  │   PYG 5M     │
│                                             │   Reservado  │
│ [☑ refresh]                                 │   200k       │
│                                             │   Futuro 1M  │
│                                             │              │
│                                             │ CPP:         │
│                                             │  Este mes    │
│                                             │  Mes que     │
│                                             │  viene       │
│                                             │  Vencidas    │
│                                             │              │
│                                             │ CPC:         │
│                                             │ ...          │
└─────────────────────────────────────────────┴──────────────┘
```

### Cards en sidebar

**Saldos** (uno por moneda × forma de pago configurada).

**Cuentas bancarias** (si están en la config). Muestra:
- Saldo actual.
- Saldo reservado (cheques diferidos emitidos).
- Saldo futuro (acreditaciones POS pendientes).
- Click → abre tab con movimientos detallados de esa cuenta.

**CPP** (si está habilitado en config). Por moneda:
- Este mes (cuotas a vencer ≤ fin mes actual).
- Mes que viene.
- Total.
- Vencidas (a fecha < hoy, sin pagar).
- Click → tab con lista CPP filtrada.

**CPC** análogo (cuentas por cobrar de clientes).

### Configurar visibilidad

Botón "Configurar" (icono tune) → dialog:
- Marcar qué formas de pago mostrar como cards de saldo.
- Marcar qué cuentas bancarias mostrar.
- ✅/❌ "Mostrar Cuentas por Pagar".
- ✅/❌ "Mostrar Cuentas por Cobrar".

## 3. Tipos de movimientos

### Ingresos

| Tipo | Origen |
|---|---|
| INGRESO_RETIRO_CAJA | Cajero ingresó retiro de caja PdV |
| INGRESO_ENTRADA_VARIA | Entrada varia (donaciones, recuperos, etc.) |
| INGRESO_OPERACION_FINANCIERA | Cambio de divisa (lado destino) |
| INGRESO_RETIRO_BANCO | Retiraste plata del banco a caja mayor |
| INGRESO_COBRO_CLIENTE | Cobraste a un cliente con CPC |
| INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO | Cobro directo de préstamo a empleado |
| TRANSFERENCIA_ENTRADA | Otra caja mayor te transfirió |
| AJUSTE_POSITIVO | Manual o contra-mov de anulación |

### Egresos

| Tipo | Origen |
|---|---|
| EGRESO_GASTO | Pagaste un gasto operativo |
| EGRESO_COMPRA | (legacy pre-refactor) Pago directo de compra contado |
| EGRESO_CUOTA_COMPRA | Pago de cuota de compra (post-refactor) |
| EGRESO_CUOTA_PRESTAMO | Pago de cuota de préstamo |
| EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO | Le prestaste plata a un empleado |
| EGRESO_VALE | Confirmaste un vale RRHH |
| EGRESO_SALARIO | Pagaste liquidación de sueldo o final |
| EGRESO_CHEQUE | Emitiste un cheque |
| EGRESO_DEPOSITO_BANCO | Depositaste plata en cuenta bancaria |
| TRANSFERENCIA_SALIDA | Transferiste a otra caja mayor |
| AJUSTE_NEGATIVO | Manual o contra-mov de anulación |

## 4. Registrar gasto

**Botón Egreso → "Gasto"** o desde dialog específico.

`create-gasto`:
- **Categoría** (jerárquica).
- **Descripción**.
- **Monto**.
- **Moneda** y **Forma de pago**.
- **Estado**: PENDIENTE / PAGADO / PROGRAMADO / CANCELADO.
- **Es recurrente** (✅): para gastos como alquiler, servicios.
- **Frecuencia** (si recurrente): MENSUAL, SEMANAL, etc.
- **Próximo vencimiento**.
- **Proveedor** (opcional).
- **Detalles**: si pagás en múltiples monedas / formas de pago, agregar líneas.

Al guardar:
- Genera `EGRESO_GASTO` en Caja Mayor por cada detalle.
- Actualiza saldo.
- Si gasto recurrente: queda PROGRAMADO con próximo vencimiento.

### Anular gasto

Cada detalle → contra-movimiento AJUSTE_POSITIVO. Estado del Gasto → CANCELADO.

## 5. Retiros de caja

Cuando el cajero retira efectivo de la caja PdV durante el día (depósito intermedio):

**Menu → Financiero → Caja Mayor → Retiros**.

1. Crear retiro:
   - Caja origen (PdV).
   - Detalles: por moneda + forma de pago, monto.
2. Estado: FLOTANTE.

Más tarde, **ingresar el retiro a Caja Mayor**:

3. Click "Ingresar".
4. Seleccionar Caja Mayor destino.
5. Confirmar → genera `INGRESO_RETIRO_CAJA` en Caja Mayor por cada detalle.

Estado → INGRESADO.

## 6. Entradas varias

Ingresos extraordinarios (no venta, no retiro):
- Préstamos recibidos.
- Donaciones.
- Recuperos.
- Ajustes positivos.

**Botón Ingreso → "Entrada Varia"**.

- Categoría.
- Descripción.
- Monto, moneda, forma de pago.
- Fecha.
- **Destino**: CAJA_MAYOR o CUENTA_BANCARIA (no ambas).
- Comprobante (opcional).

Al guardar:
- Si destino CM: `INGRESO_ENTRADA_VARIA` + saldo.
- Si destino banco: suma directa al saldo de la cuenta bancaria (no toca CM).

## 7. Operaciones financieras

Operaciones entre cuentas/cajas (no son ingreso ni egreso real):

**Menu → Financiero → Caja Mayor → Operaciones financieras**.

4 tipos:

### Cambio de divisa

Cambiás PYG por USD (ej. para pagar a un proveedor extranjero):
- Origen: caja mayor + moneda PYG + forma EFECTIVO + monto 7.300.000.
- Destino: misma caja mayor + moneda USD + forma EFECTIVO + monto 1.000.
- Cotización: 7.300.

Genera 2 movimientos: EGRESO_OPERACION_FINANCIERA (PYG) e INGRESO_OPERACION_FINANCIERA (USD).

### Depósito bancario

Llevás plata del local al banco:
- Origen: caja mayor PYG.
- Destino: cuenta bancaria.

EGRESO_DEPOSITO_BANCO + saldo banco +.

### Retiro bancario

Retirás plata del banco a la caja:
- Origen: cuenta bancaria.
- Destino: caja mayor.

INGRESO_RETIRO_BANCO + saldo banco -.

### Transferencia entre cajas

Movés plata entre 2 cajas mayores (sucursales).

TRANSFERENCIA_SALIDA en origen + TRANSFERENCIA_ENTRADA en destino.

### Diferencia (ajuste de redondeo / comisión)

Si hay un pequeño descalce entre origen y destino (ej. comisión de cambio no anotada):
- `diferencia` decimal.
- `diferenciaDestinoTipo`:
  - GASTO: crea Gasto automáticamente.
  - VALE: crea Vale RRHH (raro).
  - IGNORAR: solo en observación.

## 8. Anular movimiento

Click ⋮ en una fila de movimientos → "Anular".

Pide motivo.

### Bloqueos automáticos

El sistema NO te deja anular directo si el movimiento está vinculado a otro módulo. Te indica desde dónde anular:

| Vínculo | Mensaje |
|---|---|
| `liquidacionSueldoId` | "Anular desde Liquidaciones de Sueldo" |
| `cuentaPorPagarCuotaId` | "Anular desde Cuentas por Pagar (cuota)" |
| `valeId` | "Anular desde Vales" |
| `liquidacionComisionId` | "Anular desde Comisiones" |
| `cuentaPorCobrarCuotaId` | "Anular desde Cuentas por Cobrar" |
| `cuentaPorPagarId` | "Anular CPP completo" |
| `compraId` | "Anular desde módulo Compras" |
| Tipo == ANULACION | "No se puede anular una anulación" |
| Ya tiene contra-movimiento | "Movimiento ya anulado" |

### Si pasa los bloqueos

Genera contra-movimiento AJUSTE_POSITIVO (si era egreso) o AJUSTE_NEGATIVO (si era ingreso). El saldo vuelve al estado previo.

### UX en lista

Por default, los contra-movimientos están **ocultos**. Las filas originales anuladas aparecen con texto **tachado** + chip rojo `🚫 ANULADO` con tooltip (motivo, responsable, fecha).

Toggle "Ver anulaciones" arriba: muestra también los contra-movimientos con chip naranja.

## 9. Recalcular saldos

Si por alguna razón sospechás que los saldos no coinciden con la suma de movimientos:

**(Avanzado, requerir permiso)**: handler `recalcular-saldos`. Borra todos los `CajaMayorSaldo` y los reconstruye sumando movimientos activos. Es safety net.

UI: TODO. Si lo necesitás urgente, contactar admin.

## 10. Cerrar Caja Mayor

Raro. Solo cuando se cierra una sucursal:
- Click "Cerrar caja mayor" → confirma.
- Estado → CERRADA.
- No se pueden agregar más movimientos.

## 11. Ajustar una caja del PdV ya cerrada

**Las cajas del PdV no se reabren.** Nunca. Si una caja se cerró y después
aparece un gasto que faltó, un retiro mal cargado o un conteo con un error, lo que
hay es el **ajuste**: una corrección puntual sobre la caja cerrada, con motivo y
con firma.

**Dónde:** *Financiero → Cajas* → buscar la caja cerrada → según el caso,
**AGREGAR GASTO**, **AGREGAR RETIRO** o **AJUSTAR CONTEO**. Editar un gasto ya
cargado se hace desde el **Resumen** de la caja.

**Qué te pide el sistema:**

1. **El permiso `FINANCIERO_CAJA_AJUSTAR`.** Un cajero con el permiso normal de
   caja **no** puede ajustar: le aparece *«PERMISO REQUERIDO»*. Es del encargado o
   del gerente.
2. **Un motivo, obligatorio.** Una ventana te lo pide antes de dejarte cargar
   nada, y no acepta el campo vacío. Ejemplo: *«FALTÓ CARGAR LA COMPRA DE HIELO
   DEL TURNO NOCHE»*.
3. Y que el **retiro del cierre de esa caja no haya entrado todavía a Caja
   Mayor**. Si ya entró, el sistema corta con:

   > **El retiro del cierre ya fue ingresado a Caja Mayor. Revertí ese ingreso desde Caja Mayor antes de ajustar la caja.**

   Es el límite natural: una vez que esa plata se consolidó, cambiar el arqueo de
   origen desacomoda los saldos.

**Qué queda registrado.** El ajuste no es silencioso: la caja queda marcada como
**revisada**, con **tu usuario** y con **el motivo que escribiste** (se guarda en
mayúsculas). Eso es lo que le permite a quien mire el arqueo mañana entender por
qué los números no son los del cierre original.

**Con AJUSTAR CONTEO no hay un paso extra:** cuando confirmás el conteo corregido,
el sistema cierra el ajuste solo — vuelve a generar el **retiro del cierre** a
partir del conteo nuevo, para que lo que entre a Caja Mayor sea el monto real, y
avisa con *«CAJA AJUSTADA»*.

⚠️ **AGREGAR GASTO y AGREGAR RETIRO no regeneran el retiro del cierre**, y está
bien que sea así: ese retiro sale del **efectivo que se contó** al cerrar, y un
gasto que se carga después no cambia lo que había en el cajón. Lo que sí cambia es
el **esperado** del arqueo, y eso se ve en el resumen de la caja.

Dos detalles prácticos:

- El resumen de la caja y las pantallas del PdV que estuvieran abiertas se
  **actualizan solas** después de un ajuste: no hace falta recargar para ver el
  monto nuevo.
- Si el botón de editar gasto **no aparece** en el resumen de una caja cerrada, es
  que tenés permiso para gestionar cajas pero no para ajustarlas. Es a propósito:
  mejor que no esté, que dejarte llenar el formulario para rechazarlo al final.
- ⚠️ **Los gastos y retiros del turno normal —caja abierta— no piden nada de
  esto.** El motivo se pide **sólo** sobre una caja que ya no está abierta, y desde
  los Utilitarios del PdV nunca se puede ajustar una caja cerrada.

## 12. Errores comunes

### "Saldo negativo al pagar gasto"

El sistema te avisa si vas a quedar en saldo negativo. Podés:
- Cancelar.
- Confirmar (si está autorizado por permiso).

### "Diferencia entre saldos guardados y movimientos sumados"

Casi siempre es porque algún flujo creó un movimiento sin pasar por el helper. Run `recalcular-saldos`.

### "No puedo anular este movimiento"

Si dice "Anular desde X módulo", ir al módulo origen y anular desde ahí (revierte todo automáticamente).

### "Anular gasto recurrente — ¿cancela los próximos?"

No. Anular solo cancela ESTE registro de gasto. La recurrencia sigue activa. Si querés cancelar todos los próximos: editar el Gasto y poner `esRecurrente=false`.

### "Quiero agregar un gasto a una caja del PdV y me dice que ya fue cerrada"

Es el guard de caja: a una caja cerrada no entra plata nueva sin dejar rastro. Si
el gasto es real y falta, usá el **ajuste** — ver
[Ajustar una caja del PdV ya cerrada](#11-ajustar-una-caja-del-pdv-ya-cerrada).
Necesitás el permiso `FINANCIERO_CAJA_AJUSTAR` y un motivo escrito.

### "Ajusté la caja y ahora el retiro del cierre no cuadra"

Si lo que corregiste fue el **conteo** (AJUSTAR CONTEO), el retiro del cierre se
regenera solo al confirmar. Si lo que hiciste fue **agregar un gasto o un retiro**,
el retiro del cierre **no** se toca a propósito: refleja el efectivo que se contó,
no lo que se cargó después. Y si el retiro ya entró a Caja Mayor, no se puede
ajustar nada hasta revertir ese ingreso desde Caja Mayor.

---

**Próximo capítulo →** [09 — Bancos, cheques y POS](09-bancos-cheques-pos.md)
