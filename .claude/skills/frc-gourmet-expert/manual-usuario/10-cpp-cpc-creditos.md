# Capítulo 10 — CPP / CPC: créditos

Cuentas por Pagar (deudas del negocio) y Cuentas por Cobrar (créditos a clientes).

## CPP — Cuentas por Pagar

### Tipos

| Tipo | Significado | Dirección |
|---|---|---|
| **COMPRA** | Deuda con proveedor por compra a crédito | EN CONTRA (negocio paga) |
| **PRESTAMO** | Préstamo bancario / a 3eros | EN CONTRA |
| **PRESTAMO_FUNCIONARIO** | Préstamo a un empleado | A FAVOR del negocio (cobra) |
| **OTRO** | Otros conceptos | EN CONTRA |

### CPP de Compra

Generadas automáticamente al **finalizar una compra** (capítulo 7). No las crees a mano.

### CPP de Préstamo bancario

Cuando el banco te presta:

**Menu → Financiero → Caja Mayor → Cuentas por Pagar → "Nueva CPP"**.

- Tipo: PRESTAMO.
- Descripción: "Préstamo Banco X — 12 cuotas".
- Monto total: el total adeudado.
- Cantidad de cuotas: 12 (ej).
- Fecha inicio.
- Moneda.

Genera 12 cuotas mensuales con fechas de vencimiento secuenciales.

### CPP a Funcionario (préstamo)

Le prestás plata a un empleado:

**Menu → Recursos Humanos → Préstamos → "Nuevo préstamo"** o desde CPP con tipo PRESTAMO_FUNCIONARIO.

- Tipo: PRESTAMO_FUNCIONARIO.
- Funcionario: seleccionar.
- Monto, cuotas, fecha inicio.
- Caja Mayor + Moneda + Forma de Pago: la plata sale de aquí.

Al confirmar:
- Genera N cuotas.
- Genera `CajaMayorMovimiento` tipo `EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO` (egresa la plata que le prestaste).
- Saldo Caja Mayor disminuye.

⚠️ **Dirección invertida**: aunque el movimiento es egreso (sale la plata), la deuda es a favor tuyo (el funcionario te debe).

### Pagar cuota CPP

#### Cuota de compra

→ Capítulo 7, sección "Pagar compra" (dialog `pagar-compras-dialog`).

#### Cuota de préstamo bancario

**Menu → Financiero → Caja Mayor → Cuentas por Pagar → tu CPP → click cuota → "Pagar"**.

Dialog:
- Monto a pagar (≤ saldo pendiente).
- Fuente: CAJA_MAYOR / CUENTA_BANCARIA.
- Caja, moneda, forma de pago (si CM).
- Cuenta bancaria (si banco).

Al confirmar:
- Cuota.estado actualiza (PARCIAL / PAGADA).
- Genera `EGRESO_CUOTA_PRESTAMO`.
- Saldo Caja Mayor o cuenta bancaria disminuye.

#### Cobrar cuota a funcionario

**Mismo dialog**, pero como es a favor:

`PagarCuotaDialog` recibe `direccion: 'COBRAR'`. Cambia título "Cobrar cuota", labels "Cobrado", "Saldo a cobrar".

Genera `INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO`. Saldo Caja Mayor aumenta.

#### Cuota descontada vía liquidación de sueldo

Si el préstamo es a funcionario, otra forma de cobrar es **descontar de la liquidación**:

Al generar liquidación de sueldo borrador (capítulo 14), si el funcionario tiene cuotas vencidas en el período, el sistema agrega item DESCUENTO automáticamente.

Al pagar la liquidación, las cuotas se marcan PAGADAS implícitamente (el descuento ya quedó en el neto pagado, no se genera movimiento aparte).

### Lista CPP

**Menu → Financiero → Caja Mayor → Cuentas por Pagar**.

Columnas:
- ID, descripción, tipo, proveedor / funcionario, monto total, monto pagado, estado.
- Cuotas total / pagadas.

**Toggle "Incluir pagos contado pendientes"**: por defecto OFF (excluye CPP de tickets contado de compras diarias). ON los muestra.

Iconos:
- ↓ verde para INGRESO (a favor).
- ↑ rojo para EGRESO (en contra).

Columna "Beneficiario / Origen" con etiqueta de rol (Funcionario/Proveedor/Acreedor).

### Cancelar CPP

Click ⋮ → "Cancelar CPP" (con motivo).

- CPP → CANCELADO.
- Cuotas PENDIENTE → CANCELADA.
- Si tenía cuotas pagadas: las pagadas se mantienen, solo cancela las pendientes.

## CPC — Cuentas por Cobrar

Créditos otorgados a clientes.

### Tipos

| Tipo | Significado |
|---|---|
| CREDITO_VENTA | Venta a crédito (cliente con `credito=true`) |
| PRESTAMO_CLIENTE | Préstamo directo al cliente |
| OTRO | |

### Crear CPC

#### CPC automática (venta a crédito)

Si el cliente tiene `credito=true` y `limite_credito > 0`, podés cobrarle "a crédito":
- En PdV, al cobrar → forma de pago "CRÉDITO" (depende de cómo lo configures).
- O al cobrar como "Pendiente" (ver capítulo 6).

El sistema crea `CuentaPorCobrar` tipo CREDITO_VENTA + cuotas según política.

#### CPC manual (préstamo a cliente)

**Menu → Financiero → Caja Mayor → Cuentas por Cobrar → "Nueva CPC"**.

- Tipo: PRESTAMO_CLIENTE.
- Cliente.
- Monto total.
- Cuotas, fecha inicio, moneda.

### Cobrar cuota CPC

**Click cuota → "Cobrar"**.

Análogo a CPP pero genera `INGRESO_COBRO_CLIENTE` en Caja Mayor.

También crea `MovimientoCliente` tipo PAGO + actualiza `cliente.saldoActual`.

### Movimientos del cliente

**Menu → Recursos Humanos → Clientes → click cliente → Movimientos**.

Lista:
- CARGO (cuando le vendiste a crédito).
- PAGO (cuando te pagó).
- AJUSTE_POSITIVO / AJUSTE_NEGATIVO (correcciones).

Saldo actual = SUM(CARGOs - PAGOs - AJUSTES_NEGATIVOS + AJUSTES_POSITIVOS).

### Estados CPC

```
ACTIVO (con cuotas pendientes)
   ↓ todas las cuotas COBRADAS
COBRADO

   ↓ cancelar
CANCELADO
```

## Sidebar de Caja Mayor: cards CPP/CPC

En el detalle de Caja Mayor (capítulo 8), si activaste `mostrarCuentasPorPagar` y `mostrarCuentasPorCobrar`:

Se muestran cards por moneda con buckets:
- **Este mes**: cuotas a vencer ≤ fin mes actual.
- **Mes que viene**: vencen entre próximo día y fin mes siguiente.
- **Total**: SUM saldoPendiente.
- **Vencidas**: SUM con fechaVencimiento < hoy. **Se SUMA al total** (no es disjunto).

Click en card → tab con lista filtrada.

## Errores comunes

### "No puedo crear CPP a funcionario sin caja mayor"

- Si tipo=PRESTAMO_FUNCIONARIO, el sistema **requiere** especificar caja mayor + moneda + forma pago al crear, porque genera el desembolso automáticamente.

### "Saldo del cliente está mal"

- Verificar `MovimientoCliente` y compararlos con CPC.
- Si hay desviación: agregar AJUSTE_POSITIVO o AJUSTE_NEGATIVO en MovimientoCliente con observación explicativa.

### "Quiero cobrar una cuota anticipadamente"

- Sí, podés cobrar antes de la fechaVencimiento sin restricción.

### "El cliente paga más del saldo"

- El sistema NO acepta pagos > saldo pendiente. Si querés ingresar un crédito a favor del cliente, hacelo como AJUSTE_POSITIVO (cliente queda con saldo negativo = a su favor).

### "Cancelé liquidación de sueldo y la cuota CPP volvió a estar pendiente"

✅ Correcto. La anulación de liquidación revierte cuotas que se pagaban a través de ella. Capítulo 14.

## Direccion del flujo: resumen

| Caso | Movimiento generado | Caja Mayor |
|---|---|---|
| Crear CPP COMPRA | (ninguno al crear) | — |
| Pagar cuota CPP COMPRA | EGRESO_CUOTA_COMPRA | -saldo |
| Crear CPP PRESTAMO_FUNCIONARIO | EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO | -saldo |
| Cobrar cuota PRESTAMO_FUNCIONARIO directo | INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO | +saldo |
| Cobrar cuota PRESTAMO_FUNCIONARIO via liquidación | (ninguno aparte; descuento implícito en liquidación) | - (afecta liquidación) |
| Crear CPC | (ninguno al crear) | — |
| Cobrar cuota CPC | INGRESO_COBRO_CLIENTE | +saldo |

---

**Próximo capítulo →** [11 — RRHH: funcionarios](11-rrhh-funcionarios.md)
