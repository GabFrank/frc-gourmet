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

## 11. Errores comunes

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

---

**Próximo capítulo →** [09 — Bancos, cheques y POS](09-bancos-cheques-pos.md)
