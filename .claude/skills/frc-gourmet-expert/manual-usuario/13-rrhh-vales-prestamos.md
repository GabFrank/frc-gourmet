# Capítulo 13 — Vales y préstamos a funcionarios

## 1. Vales

Adelantos / vales corrientes de plata al funcionario. Se descuentan de su sueldo.

### Crear vale

**Menu → Recursos Humanos → Vales → "Nuevo vale"**.

- **Funcionario**.
- **Monto**.
- **Fecha**.
- **Motivo de vale** (opcional, catálogo).
- **Es adelanto** (✅): adelanto vs vale corriente. Diferencia categórica en liquidación.
- **Caja Mayor + Moneda + Forma de pago**: de dónde sale la plata.
- **Comprobante** (opcional): URL / archivo.
- **Autorizado por**.

Estado inicial: **SOLICITADO**.

### Estados del vale

```
SOLICITADO  ─┐  (creado, NO impacta caja todavía)
             │
             │ "Confirmar vale"
             ▼
CONFIRMADO  ─┐  (genera EGRESO_VALE en Caja Mayor)
             │
             │ Pagar liquidación que lo descuenta
             ▼
DESCONTADO   (queda registrado como descontado en sueldo)

   o ANULADO desde cualquier estado (revierte caja si era CONFIRMADO).
```

### Confirmar vale

Click ⋮ → "Confirmar".

- Vale → CONFIRMADO.
- Genera `CajaMayorMovimiento` tipo `EGRESO_VALE` (con `valeId` apuntando).
- Saldo Caja Mayor disminuye.

⚠️ **Concurrencia**: si dos cajeros confirman el mismo vale al mismo tiempo, una falla. La transacción atómica con check de estado evita doble confirmación.

### Anular vale

Click ⋮ → "Anular".

- Si era CONFIRMADO: genera contra-movimiento `AJUSTE_POSITIVO` + revierte saldo.
- Vale → ANULADO.

### Lista vales del funcionario

**Funcionario → Tab "Vales"**.

Ves:
- Pendientes (SOLICITADO + CONFIRMADO).
- Históricos (DESCONTADO + ANULADO).
- Total adeudado.

## 2. Motivos de vale

**Menu → Recursos Humanos → Motivos de vale**.

Catálogo plano. Ej:
- ANTICIPO_SUELDO
- EMERGENCIA_MEDICA
- COMPRA_INSUMOS_PERSONALES
- VACACIONES
- OTRO

## 3. Adelantos

Vales con `esAdelanto=true`. Diferencia conceptual:
- **Vale corriente**: monto extra que el empleado pidió (típicamente más informal).
- **Adelanto**: parte del sueldo de fin de mes anticipada.

En la liquidación, los items se categorizan diferente (`ADELANTO_DESCUENTO` vs `VALE_DESCUENTO`).

## 4. Préstamos a funcionarios (CPP)

A diferencia de un vale (corto plazo, dentro del mes), un préstamo es a varias cuotas:

**Menu → Recursos Humanos → Préstamos → "Nuevo préstamo"** o desde CPP con tipo PRESTAMO_FUNCIONARIO.

### Crear préstamo

- **Funcionario**.
- **Monto total**: ej 600.000 PYG.
- **Cantidad de cuotas**: 6.
- **Fecha inicio**.
- **Moneda**.
- **Caja Mayor + Forma de pago**: de dónde sale la plata.
- (TODO) **Tasa de interés**: campo no implementado aún.

Al confirmar:
- Crea `CuentaPorPagar` tipo PRESTAMO_FUNCIONARIO.
- Crea N cuotas mensuales (montos divididos equitativamente, última absorbe redondeo).
- Genera `CajaMayorMovimiento` tipo `EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO`.
- Saldo Caja Mayor disminuye.

⚠️ **Dirección**: aunque es egreso (sale plata), la deuda es **a favor tuyo** (el funcionario te debe). Por eso los movimientos son específicos.

### Cobrar cuota préstamo

Dos formas:

#### A. Cobro directo (efectivo)

**Menu → Recursos Humanos → Préstamos → tu préstamo → click cuota → "Cobrar"**.

Dialog `PagarCuotaDialog` con `direccion: 'COBRAR'`:
- Monto a cobrar.
- Fuente: CAJA_MAYOR (caja, moneda, forma).
- Genera `INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO`.
- Saldo Caja Mayor aumenta.

#### B. Descuento de sueldo

Al generar liquidación de sueldo del funcionario, si tiene cuotas vencidas en el período, se agregan automáticamente como item DESCUENTO (referenciaTipo=CPP_CUOTA).

Al pagar la liquidación, esas cuotas se marcan PAGADAS implícitamente (no se genera movimiento aparte — el descuento ya quedó en el neto pagado).

→ Capítulo 14.

### Anular cuota / préstamo

Anular cuota individual: revierte el cobro o descuento.

Anular préstamo completo: marca CPP=CANCELADO. Si tenía cuotas pagadas, el dinero NO se devuelve automáticamente (gestión manual).

## 5. Lista de préstamos

**Menu → Recursos Humanos → Préstamos**.

Columnas:
- Funcionario.
- Monto total.
- Pagado.
- Saldo a cobrar.
- Cuotas pagadas / total.
- Estado.

Terminología invertida vs CPP normal:
- "Cobrar cuota" (no "pagar").
- "Cobrado" (no "pagado").
- "Saldo a cobrar" (no "saldo a pagar").

## 6. Errores comunes

### "Confirmar vale dice 'sin saldo en caja mayor'"

- Verificá que la caja mayor tenga saldo positivo en la moneda + forma de pago elegida.
- Si querés permitir saldo negativo: confirmar con "Sí, quiero" en el dialog de saldo negativo.

### "Anulé un vale, el saldo no volvió"

- Verificar que el vale estaba en estado CONFIRMADO. Si era SOLICITADO, no había saldo afectado.
- Buscar el contra-movimiento en Caja Mayor (debería tener `referenciaAnulacion = id_del_movimiento_original`).

### "Préstamo a funcionario sin caja mayor especificada — error"

- Es **obligatorio** especificar caja mayor + moneda + forma de pago al crear, porque genera el desembolso automáticamente.

### "Cobré una cuota de préstamo, no se actualizó el saldo del cliente"

- Confirmá que es CPP de tipo PRESTAMO_FUNCIONARIO (a empleado), no CPP de Cliente. Los clientes son CPC.

---

**Próximo capítulo →** [14 — Liquidación de sueldo](14-rrhh-liquidacion-sueldo.md)
