# Capítulo 14 — Liquidación de sueldo, aguinaldos, bonos

Liquidación mensual del sueldo del empleado. Centraliza salario base, horas extra, comisiones, vales descontados, cuotas de préstamos, IPS, penalizaciones, bonos, aguinaldos.

## Conceptos seed

**Conceptos** (rótulos para los items de liquidación):

| Código | Tipo | Descripción |
|---|---|---|
| SALARIO_BASE | HABER | Sueldo del mes |
| HORA_EXTRA | HABER | Suma horas extra del período |
| BONO_MANUAL | HABER | Bono ingresado manualmente |
| AGUINALDO | HABER | 13° salario |
| COMISION | HABER | Comisión calculada |
| IPS_DESCUENTO | DESCUENTO | Aporte IPS funcionario (default 9%) |
| VALE_DESCUENTO | DESCUENTO | Vales pendientes |
| ADELANTO_DESCUENTO | DESCUENTO | Adelantos |
| PENALIZACION | DESCUENTO | Suma penalizaciones |
| PRESTAMO_CUOTA | DESCUENTO | Cuotas vencidas en el período |

## 1. Generar liquidación borrador

**Menu → Recursos Humanos → Liquidaciones → "Nueva liquidación"**.

- **Funcionario**.
- **Período** (YYYY-MM, ej: '2026-04').
- **Moneda de pago**.

Click "Generar".

### Lógica del sistema

1. Si ya existe BORRADOR para ese (funcionario, período): regenera (preserva items con `manual=true`, borra los auto).
2. Si está APROBADA o PAGADA: error — no se puede regenerar.
3. Items auto:
   - **SALARIO_BASE** = `funcionario.salarioBase`.
   - **IPS_DESCUENTO** = `salarioBase × IPS_PORCENTAJE_FUNCIONARIO%` (default 9%).
   - **HORA_EXTRA** = SUM `HoraExtra` del período no anuladas.
   - **PENALIZACION** = SUM `Penalizacion` del período no anuladas.
   - **BONO_MANUAL** = SUM Bono no anulados del período.
   - **VALE_DESCUENTO** = SUM Vale CONFIRMADO/DESCONTADO pendientes.
   - **ADELANTO_DESCUENTO** = vales con `esAdelanto=true`.
   - **PRESTAMO_CUOTA** = cuotas CPP PRESTAMO_FUNCIONARIO vencidas.
   - **COMISION** = si LiquidacionComision APROBADA del período.
   - **AGUINALDO** = si mes == `MES_AGUINALDO` (default 12 = diciembre) y Aguinaldo APROBADO.
4. Recalcula totales:
   - totalHaberes = SUM HABER.
   - totalDescuentos = SUM DESCUENTO.
   - totalNeto = totalHaberes - totalDescuentos.

## 2. Editar borrador

Mientras estado=BORRADOR:
- Agregar items manuales (bono extra, descuento ad-hoc) con `manual=true`.
- Borrar items individuales.
- Cambiar montos.
- Re-generar (preserva manuales).

## 3. Aprobar

Click "Aprobar". Requiere permiso `RRHH_LIQUIDACION_APROBAR`.

- Estado → APROBADA.
- Asigna `aprobadoPor` y `fechaAprobacion`.
- Ya no es editable.

## 4. Pagar

Click "Pagar". Requiere permiso `RRHH_LIQUIDACION_PAGAR`.

Dialog:
- **Caja Mayor** + **Moneda** + **Forma de pago**.

Al confirmar (transacción atómica):
1. Genera `CajaMayorMovimiento` tipo **EGRESO_SALARIO** con monto = `totalNeto`, vinculado a `liquidacionSueldoId`.
2. Saldo Caja Mayor disminuye.
3. Por cada item con referenciaTipo:
   - **VALE** → `vale.estado = DESCONTADO`, `liquidacion_id = this.id`.
   - **CPP_CUOTA** → `cuota.montoPagado += monto`, estado actualiza, `fechaPago` = now. Si todas pagadas → CPP estado=PAGADO.
   - **LIQUIDACION_COMISION** → `comision.estado = INTEGRADA`.
   - **AGUINALDO** → `aguinaldo.estado = PAGADO`, `fechaPago`.
4. Liquidación → PAGADA, `fechaPago`, `movimiento_id`.
5. (TODO) Genera comprobante PDF y lo asigna a `comprobante_url`.

## 5. Anular liquidación pagada

Click ⋮ → "Anular".

⚠️ **Operación crítica**. Solo si fue error real.

Si era PAGADA, transacción atómica:
1. Por cada item:
   - VALE → estado DESCONTADO → CONFIRMADO, `liquidacion_id = null`.
   - CPP_CUOTA → resta monto pagado de cuota+CPP, estado vuelve a PENDIENTE/PARCIAL, `fecha_pago = null`. Si CPP estaba PAGADO → ACTIVO.
   - AGUINALDO → estado PAGADO → APROBADO, `liquidacion_id = null`.
   - LIQUIDACION_COMISION → INTEGRADA → APROBADA.
2. Crea contra-movimiento **AJUSTE_POSITIVO** en Caja Mayor (vinculado al original).
3. Saldo Caja Mayor aumenta (revierte el egreso).
4. Liquidación → ANULADA.

Si era BORRADOR/APROBADA: solo marca ANULADA (sin efectos cruzados).

## 6. Lista liquidaciones

**Menu → Recursos Humanos → Liquidaciones**.

Filtros:
- Funcionario.
- Período.
- Estado.

Acciones (⋮):
- Ver detalle.
- Aprobar (BORRADOR).
- Pagar (APROBADA).
- Anular.

## 7. Bonos

Bonificaciones manuales o recurrentes.

**Menu → Recursos Humanos → Bonos → "Nuevo bono"**.

- **Funcionario**.
- **Tipo**: CUMPLEANIOS / NAVIDAD / DESEMPENIO / PRODUCTIVIDAD / OTRO.
- **Monto**.
- **Fecha**.
- **Motivo** (opcional).
- **Es recurrente** (✅): para bonos como "vacaciones todos los años en enero".
- **Frecuencia** (si recurrente): MENSUAL / TRIMESTRAL / etc.
- **Anulado**: si lo cancelaste.

Bonos no anulados se agregan automáticamente como item HABER tipo BONO_MANUAL en la liquidación del período.

## 8. Aguinaldos

13° salario. En Paraguay: 1/12 del total ganado en el año.

**Menu → Recursos Humanos → Aguinaldos**.

Por funcionario:
- Calcular aguinaldo del año.
- Aprobar.
- Pagar (vinculado a liquidación de sueldo de diciembre o aparte).

### Cálculo automático

Sistema toma:
- SUM `totalHaberes` de liquidaciones APROBADA/PAGADA del año en curso (enero-diciembre).
- Divide ÷ 12.

Estado:
- **CALCULADO** (recién generado).
- **APROBADO** (revisado por encargado).
- **PAGADO** (incluido en una liquidación pagada).

### Mes de aguinaldo

`config.MES_AGUINALDO` (default 12 = diciembre). Determina cuándo el sistema sugiere incluirlo en la liquidación.

## 9. Errores comunes

### "Liquidación se generó con item BONO duplicado"

- Verificá que no tengas Bonos duplicados en BD.
- Regenerar el borrador (borra y recrea items auto).

### "El monto del IPS está mal"

- Verificá `IPS_PORCENTAJE_FUNCIONARIO` en Config RRHH.
- El sistema aplica al `salarioBase` del funcionario, no a `totalHaberes`. Si querés que aplique al total (incluyendo HE, bonos, comisión), modificar lógica del handler (TODO config).

### "Pagué la liquidación pero saldo no bajó"

- Verificar que el movimiento `EGRESO_SALARIO` se haya creado: ir a Caja Mayor Detalle.
- Si no aparece: re-procesar (contactar admin).

### "Anulé liquidación, el vale no volvió a CONFIRMADO"

- Bug raro. Reportar. Mientras tanto, edición manual del vale.

### "Liquidación dice 'Funcionario sin usuario' al incluir comisión"

- Para que el motor de comisiones encuentre las ventas, el funcionario debe tener `usuario_id` vinculado. Vincular en el detalle del funcionario.

## 10. Recibos firmables (TODO)

- Generación de PDF con detalle (haberes / descuentos / total / firma).
- Guardado en `comprobante_url`.
- Visualización en histórico.

Status: TODO.

---

**Próximo capítulo →** [15 — Vacaciones y liquidación final](15-rrhh-vacaciones-egresos.md)
