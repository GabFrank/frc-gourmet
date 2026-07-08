# Dominio: RRHH — Liquidaciones y Comisiones

## Liquidación de Sueldo

```typescript
@Index(['funcionario', 'periodo'])
LiquidacionSueldo {
  funcionario
  periodo: string                       // YYYY-MM (ej: '2026-04')
  fechaInicio, fechaFin: date
  salarioBase: decimal
  totalHaberes, totalDescuentos, totalNeto: decimal
  monedaPago: Moneda
  estado: LiquidacionSueldoEstado       // BORRADOR | APROBADA | PAGADA | ANULADA
  aprobadoPor?: Usuario
  fechaAprobacion?, fechaPago?: datetime
  movimientoId?: int                    // FK plana `movimiento_id` a CajaMayorMovimiento (al pagar)
  cuentaBancariaId?: int                // si el pago salió de una cuenta bancaria (en vez de Caja Mayor)
  observacion?
  comprobanteUrl?
}

LiquidacionItem {
  liquidacion (CASCADE)
  concepto: LiquidacionConcepto
  descripcion: string
  monto: decimal
  tipo: HABER | DESCUENTO
  referenciaId?, referenciaTipo?: string  // VALE | CPP_CUOTA | AGUINALDO | LIQUIDACION_COMISION | HORA_EXTRA | BONO | PENALIZACION | VACACION_VENTA
  manual: boolean                       // true si lo agregó el usuario, false si auto
  observacion?
}

LiquidacionConcepto {
  codigo: string UNIQUE UPPERCASE
  descripcion
  esHaber: boolean
  esCalculadoAuto: boolean
  activo
}
```

### Conceptos seed

`seedLiquidacionConceptos()` (10 conceptos):
- HABER: SALARIO_BASE, HORA_EXTRA, BONO_MANUAL, AGUINALDO, COMISION
- DESCUENTO: IPS_DESCUENTO, ADELANTO_DESCUENTO, VALE_DESCUENTO, PENALIZACION, PRESTAMO_CUOTA

> `VACACION_VENTA` se usa como `referenciaTipo`/código de item HABER pero **no está en el seed de conceptos** (el item se crea sin `concepto`).

### Generación de borrador

`generar-liquidacion-borrador(payload {funcionarioId, periodo, monedaPagoId})` (`liquidacion-sueldo.handler.ts`):

```
1. Busca liquidación del (funcionario, periodo) EXCLUYENDO ANULADAS (una anulada queda
   histórica; se genera un borrador nuevo). Si existe BORRADOR, borra sus items NO manuales.
2. Si la existente está APROBADA o PAGADA: error
3. Items auto (orden real en el handler):
   1. SALARIO_BASE (HABER): salarioBase del funcionario
   2. IPS_DESCUENTO (DESCUENTO): **solo si `funcionario.ipsActivo`** y IPS% > 0 → salarioBase × IPS_PORCENTAJE_FUNCIONARIO%
   3. HORA_EXTRA (HABER): cada HoraExtra del período no anulada (referenciaTipo=HORA_EXTRA), usa su `montoCalculado`
   4. BONO_MANUAL (HABER): cada Bono no anulado del período (referenciaTipo=BONO)
   5. VALE / ADELANTO (DESCUENTO): cada Vale en estado **CONFIRMADO** del funcionario (sin filtrar por período); concepto ADELANTO_DESCUENTO si `esAdelanto`, si no VALE_DESCUENTO. referenciaTipo=VALE
   6. PRESTAMO_CUOTA (DESCUENTO): cuotas de CPP PRESTAMO_FUNCIONARIO con vencimiento dentro del período (estados PENDIENTE/PARCIAL/VENCIDA), saldo > 0 (referenciaTipo=CPP_CUOTA)
   7. PENALIZACION (DESCUENTO): cada Penalizacion del período no anulada con monto > 0 (referenciaTipo=PENALIZACION)
   8. AGUINALDO (HABER): solo si `periodo` termina en `-12` (**hardcodeado a diciembre**); calcula/usa el Aguinaldo del año si su estado ≠ PAGADO (referenciaTipo=AGUINALDO)
   9. COMISION (HABER): si existe LiquidacionComision **APROBADA** del período
   10. VACACION_VENTA (HABER): cada VacacionVenta PENDIENTE del funcionario (referenciaTipo=VACACION_VENTA). No tiene concepto seedeado → el item se crea con `concepto=null`.

4. Recalcular totales:
   totalHaberes = SUM items WHERE tipo=HABER
   totalDescuentos = SUM items WHERE tipo=DESCUENTO
   totalNeto = totalHaberes - totalDescuentos
```

**User puede agregar items manuales** (con `manual=true`) — no se borran al regenerar.

### Estados y permisos

| Estado | Permite | Permiso |
|---|---|---|
| BORRADOR | regenerar items auto, agregar manuales, eliminar | `generar-liquidacion-borrador` **no valida permiso** (existe `RRHH_LIQUIDACION_GENERAR` pero no se aplica) |
| APROBADA | nada (read-only). Solo se puede pagar o anular. | RRHH_LIQUIDACION_APROBAR (`aprobar-liquidacion-sueldo`) |
| PAGADA | nada. Solo se puede anular. | RRHH_LIQUIDACION_PAGAR (`pagar-liquidacion-sueldo`) |
| ANULADA | nada (terminal) | `anular-liquidacion-sueldo` requiere RRHH_LIQUIDACION_PAGAR |

### Pagar liquidación (transacción atómica)

`pagar-liquidacion-sueldo(id, payload)` — `payload.fuente` = `CAJA_MAYOR` (default) o `CUENTA_BANCARIA`:

```
1. Validar APROBADA
2. Generar el egreso por totalNeto según fuente:
   - CAJA_MAYOR: crear CajaMayorMovimiento (EGRESO_SALARIO, liquidacionSueldoId=this.id) +
                 actualizarSaldoCajaMayor(EGRESO_SALARIO). Requiere cajaMayorId, monedaId, formaPagoId.
   - CUENTA_BANCARIA: debita el saldo de la cuenta (sin movimiento de Caja Mayor) y
                      guarda liq.cuentaBancariaId. Requiere cuentaBancariaId.
3. Para cada item con referenciaTipo:
   - VALE → vale CONFIRMADO → DESCONTADO, vale.liquidacionId = this.id
   - CPP_CUOTA → cuota PAGADA (sin movimiento aparte: ya va dentro del EGRESO_SALARIO total); recalcula CPP
   - AGUINALDO → aguinaldo (si ≠ PAGADO) → PAGADO, fechaPago, liquidacionId
   - LIQUIDACION_COMISION → comision APROBADA → INTEGRADA
   - VACACION_VENTA → VacacionVenta PENDIENTE → PAGADO, liquidacionId
4. liquidacion.estado = PAGADA, fechaPago, movimientoId (si Caja Mayor)
5. Commit
```

### Anular liquidación pagada (revertir TODO)

`anular-liquidacion-sueldo` (`liquidacion-sueldo.handler.ts`):

Firma: `anular-liquidacion-sueldo(id, motivo)` — permiso `RRHH_LIQUIDACION_PAGAR`.

Si era PAGADA, recorre items y revierte por `referenciaTipo`:
- **VALE**: estado DESCONTADO → CONFIRMADO, `liquidacionId = null` (con cast `as any` por TypeORM).
- **CPP_CUOTA**: resta de `montoPagado` cuota+CPP, vuelve a PENDIENTE/PARCIAL, `fechaPago = null`. CPP de PAGADO → ACTIVO.
- **AGUINALDO**: PAGADO → APROBADO, `liquidacionId = null`, `fechaPago = null`.
- **LIQUIDACION_COMISION**: INTEGRADA → APROBADA.
- **VACACION_VENTA**: PAGADO → PENDIENTE, `liquidacionId = null`.

Revierte el egreso según cómo se pagó: si fue por Caja Mayor crea contra-movimiento `AJUSTE_POSITIVO` (vinculado al original via `referenciaAnulacionId`) y suma saldo; si fue por cuenta bancaria reacredita el saldo de la cuenta.

`liquidacion.estado = ANULADA`.

Si era BORRADOR/APROBADA: solo marca ANULADA (sin efectos cruzados).

→ `project_anular_liquidacion_sueldo`

## Liquidación Final (egreso)

```typescript
LiquidacionFinal {
  funcionario
  fechaEgreso: date
  motivoEgreso: MotivoEgreso             // RENUNCIA | DESPIDO_JUSTIFICADO | DESPIDO_INJUSTIFICADO | MUTUO_ACUERDO | JUBILACION | FALLECIMIENTO | OTRO
  antiguedadDias, antiguedadMeses, antiguedadAnios: int
  salarioPromedioUltimos6Meses: decimal
  indemnizacionMonto: decimal
  indemnizacionAplica: boolean
  vacacionesNoGozadas: int
  montoVacacionesNoGozadas: decimal
  aguinaldoProporcional: decimal
  totalLiquidado: decimal
  moneda: Moneda                         // FK `moneda_id`
  estado: LiquidacionFinalEstado         // BORRADOR | APROBADA | PAGADA | ANULADA
  aprobadoPor?: Usuario
  fechaAprobacion?, fechaPago?: date
  movimientoId?: int                     // FK plana `movimiento_id` (al pagar)
  observacion?
}

LiquidacionFinalItem {
  liquidacionFinal (CASCADE)             // FK `liquidacion_final_id`
  concepto: string                       // texto: 'INDEMNIZACION', 'VACACIONES_NO_GOZADAS', 'AGUINALDO_PROPORCIONAL', ...
  monto: decimal
  descripcion?
}
```

### Cálculos

`generar-liquidacion-final(payload {funcionarioId, fechaEgreso, motivoEgreso})` — permiso `RRHH_LIQUIDACION_FINAL_GENERAR`:

```
1. antiguedad = diff(fechaIngreso, fechaEgreso) → dias, meses (÷30), años (÷365)
2. salarioPromedio = promedio de totalHaberes de las LiquidacionSueldo APROBADA/PAGADA
   con fechaInicio en los últimos 6 meses. Si no hay ninguna → funcionario.salarioBase.
3. Indemnización:
   if motivoEgreso == DESPIDO_INJUSTIFICADO and dias >= INDEMNIZACION_ANTIGUEDAD_MIN_DIAS (90):
     indemnizacion = (salarioPromedio/30) × INDEMNIZACION_DIAS_POR_ANIO × max(1, anios)
4. Vacaciones no gozadas:
   diasNoGozados = SUM(diasGenerados - diasGozados) de Vacacion no prescritas
   monto = diasNoGozados × (salarioPromedio/30)
5. Aguinaldo proporcional:
   totalGanado = SUM(totalHaberes) liquidaciones APROBADA/PAGADA del año del egreso
   aguinaldoProporcional = totalGanado / 12
6. totalLiquidado = indemnizacion + vacaciones + aguinaldo
7. Crea LiquidacionFinalItem por cada concepto con monto > 0
   (INDEMNIZACION, VACACIONES_NO_GOZADAS, AGUINALDO_PROPORCIONAL).
8. **En la generación** marca el funcionario egresado: `fechaEgreso`, `motivoEgreso`, `activo = false`.
```

> Solo puede existir una LiquidacionFinal no anulada por funcionario.

### Aprobar / Pagar

- `aprobar-liquidacion-final(id)` — permiso `RRHH_LIQUIDACION_FINAL_GENERAR`.
- `pagar-liquidacion-final(id, payload)` — permiso `RRHH_LIQUIDACION_PAGAR`. Análogo a sueldo (Caja Mayor o cuenta bancaria); el egreso es `EGRESO_SALARIO`.

## Comisiones

### ReglaComision

```typescript
{
  nombre, descripcion?
  tipo: TipoReglaComision               // META_UNIDADES | PORCENTAJE_VENTA | META_VENTA_LOCAL | EXTRA_MANUAL | PENALIZACION_MANUAL | EQUIPO_PORCENTAJE
  montoBase?: decimal                   // monto fijo (META_*, EXTRA_MANUAL)
  porcentaje?: decimal                  // % (PORCENTAJE_VENTA, EQUIPO_PORCENTAJE)
  metaUnidades?: int                    // (META_UNIDADES)
  metaMontoLocal?: decimal              // (META_VENTA_LOCAL)
  modoValidacion: TODO_O_NADA | PROPORCIONAL
  recurrencia: UNICA | DEFINIDA | INDEFINIDA
  fechaInicio, fechaFin: date
  esEquipo: boolean
  activo
}
```

### Productos efectivos y requisitos

```typescript
ReglaComisionProducto {
  reglaComision (CASCADE)
  producto
  // Si está vacío para una regla: aplica a TODOS los productos
}

ReglaComisionRequisito {
  reglaComision
  tipo: TARDANZA_MAX | QUEJA_MAX | ASISTENCIA_MIN | CUSTOM
  umbral: decimal                       // ej: 5 (TARDANZA_MAX min), 30 (ASISTENCIA_MIN días)
  peso: decimal default 1
  descripcion?
}
```

### Asignación a funcionario

```typescript
FuncionarioReglaComision {
  funcionario, reglaComision
  fechaDesde, fechaHasta?: date
  activo
}
```

### Equipos

```typescript
EquipoComision {
  nombre, descripcion?
  activo
  // sin OneToMany; miembros y reglas son entidades aparte (FK equipo_comision_id)
}

EquipoComisionMiembro {
  equipo, funcionario                    // FK `equipo_comision_id`, `funcionario_id`
  porcentajeReparto: decimal             // suma debería ser 100%
}

EquipoComisionRegla {
  equipo, reglaComision
  fechaDesde, fechaHasta?
  activo
}
```

## Motor de evaluación

`comisiones.handler.ts` — función interna `evaluarReglaParaFuncionario(dataSource, queryRunner, reglaId, funcionarioId, fechaInicio, fechaFin)`. Retorna `{ monto, observacionSnapshot }`.

> El funcionario **debe** tener `usuario_id`; si no, la evaluación lanza error (las ventas se atribuyen por usuario).

```
1. Query venta_items JOIN ventas (SQL crudo):
   - v.estado = 'CONCLUIDA'
   - vi.estado != 'CANCELADO'
   - producto_id IN reglaProductos (si la regla no tiene productos: todos)
   - COALESCE(vi.vendedor_id, v.vendedor_id, v.created_by) = funcionario.usuario.id
   - fecha (fecha_cierre o created_at) dentro de [fechaInicio, fechaFin]

2. Métricas:
   - totalUnidades        = SUM(vi.cantidad)
   - totalMontoProductos  = SUM(precioUnitario×cant − descuentoUnitario×cant + precioAdicionales)
   - totalMontoVentaLocal = SUM(v.total) de las ventas únicas tocadas

3. Evaluar requisitos (cada ReglaComisionRequisito) → factorRequisitos:
   FOR EACH requisito:
     TARDANZA_MAX:   valor = COUNT Asistencia estado=TARDANZA del período;            cumple = valor <= umbral
     QUEJA_MAX:      valor = COUNT Penalizacion QUEJA_CLIENTE no anuladas del período; cumple = valor <= umbral
     ASISTENCIA_MIN: valor = COUNT Asistencia estado IN (PRESENTE, JUSTIFICADO, FERIADO); cumple = valor >= umbral
     CUSTOM:         no evaluable automáticamente → se asume cumple = true

   factorRequisitos:
     TODO_O_NADA:  1 si TODOS cumplen, si no 0
     PROPORCIONAL: pesoCumplido / pesoTotal (suma de `peso` de los requisitos cumplidos / total)

4. montoBase según tipo:
   META_UNIDADES:
     - TODO_O_NADA:  totalUnidades >= metaUnidades ? montoBase : 0
     - PROPORCIONAL: (totalUnidades / metaUnidades) × montoBase (cap en montoBase si llega a la meta)
   PORCENTAJE_VENTA:     totalMontoProductos × (porcentaje / 100)
   META_VENTA_LOCAL:     totalMontoVentaLocal >= metaMontoLocal ? montoBase : 0
   EXTRA_MANUAL / PENALIZACION_MANUAL / EQUIPO_PORCENTAJE: 0 (solo se aplican vía items manuales / flujo de equipo)

5. montoFinal = montoBase × factorRequisitos
   observacionSnapshot = JSON con { regla, métricas, requisitos, factorRequisitos, montoBase, montoFinal } (auditoría).
```

> No hay resta de penalizaciones `COMISION_DESCUENTO` dentro del motor (ese enum existe en `PenalizacionTipo` pero el motor no lo aplica). El reparto por equipo **tampoco** ocurre dentro del motor: ver Generación.

## LiquidacionComision

```typescript
LiquidacionComision {
  funcionario
  periodo: string                       // YYYY-MM
  fechaInicio, fechaFin: date
  totalCalculado: decimal
  estado: LiquidacionComisionEstado     // BORRADOR | APROBADA | INTEGRADA | ANULADA
  aprobadoPor?: Usuario
  fechaAprobacion?
  observacion?
}

LiquidacionComisionItem {
  liquidacion
  reglaComision?: ReglaComision         // null si manual
  concepto: string                       // texto descriptivo (max 300)
  monto: decimal
  esManual: boolean
  observacion?: text                     // snapshot de parámetros aplicados
}
```

### Estados

- **BORRADOR**: editable. Items se generan corriendo el motor.
- **APROBADA**: por usuario con permiso `COMISION_LIQUIDACION_APROBAR`.
- **INTEGRADA**: marcada cuando se incluye en LiquidacionSueldo PAGADA.
- **ANULADA**: si se anula la liquidación de sueldo asociada.

### Generación

`generar-liquidacion-comision(funcionarioId, periodo)` — permiso `COMISION_LIQUIDACION_GENERAR`:
1. Busca/crea la LiquidacionComision del (funcionario, periodo). Si está APROBADA o INTEGRADA: error (no se regenera).
2. Borra los items **NO manuales** (preserva `esManual=true`).
3. Para cada `FuncionarioReglaComision` **activa y vigente** en el período cuya `reglaComision` esté activa y sea de tipo auto-evaluable (`META_UNIDADES`, `PORCENTAJE_VENTA`, `META_VENTA_LOCAL`):
   - `evaluarReglaParaFuncionario(...)` → monto + observación (snapshot JSON).
   - Si `monto != 0`, crea `LiquidacionComisionItem` (`concepto = regla.nombre`, `reglaComision`, `esManual=false`).
4. `totalCalculado = SUM(items auto) + SUM(items manuales preservados)`.

> Las reglas de equipo (`EQUIPO_PORCENTAJE`) y las `EXTRA_MANUAL` / `PENALIZACION_MANUAL` **no** se procesan en este handler: se agregan como items manuales (`esManual=true`). Las entidades `EquipoComision*` existen pero el reparto automático por miembro no está implementado en la generación.

## Dashboard RRHH

`src/app/pages/rrhh/dashboard/`. Canal único `get-dashboard-rrhh-kpis(periodo)` (`dashboard-rrhh.handler.ts`) devuelve:
- totalNominaMes (nómina del período)
- totalFuncionariosActivos
- porcentajeAsistenciaMes
- valesPendientes (CONFIRMADO)
- prestamosActivos
- proximosCumpleanios (30 días)
- vacacionesProximas (30 días)
- top5Vendedores del período
- liquidacionesPendientesAprobacion (BORRADOR)
- liquidacionesPendientesPago (APROBADA)

## Reportes

`src/app/pages/rrhh/reportes/`. Cada reporte tiene sus propios canales IPC en `reportes-rrhh.handler.ts` (`get-reporte-*-data` + `export-reporte-*-excel`/`-pdf`):

- Liquidaciones del mes (`...liquidaciones-mes...`, por `periodo`) — Excel + PDF
- Asistencia del mes (`...asistencia-mes...`, por `periodo` y `funcionarioId?`) — Excel
- Vales del mes (`...vales-mes...`, por `periodo`) — Excel
- Préstamos activos (`...prestamos-activos...`) — Excel
- Comisiones del mes (`...comisiones-mes...`, por `periodo`) — Excel
- Aguinaldo anual (`...aguinaldo-anual...`, por `anio`) — Excel + PDF
- Resumen IPS (`...resumen-ips...`, por `periodo`) — Excel
- Recibo de liquidación PDF (`export-recibo-liquidacion-pdf`, por `liquidacionId`)

Export con exceljs (Excel) y pdfmake (PDF).

## Verificación end-to-end

`docs/plan-rrhh-comisiones.md` § 6 — secuencia de 20 pasos:

1. Seed permisos, asignar a ADMIN.
2. Alta Funcionario A MOZO 2.500.000.
3. Subir cédula PDF.
4. Asistencia día 1 PRESENTE, día 2 TARDANZA 15 min.
5. Vale 200k SOLICITADO.
6. Confirmar Vale → -200k saldo, EGRESO_VALE.
7. Préstamo CPP 600k/6 cuotas.
8. Pagar cuota 1 → -100k, EGRESO_CUOTA_PRESTAMO.
9. Regla META_UNIDADES PARRILLA 50u=150k.
10. 60 ventas vendedor=A producto PARRILLA.
11. Generar liquidación comisión → item COMISION 150k.
12. Aprobar comisión.
13. Generar liquidación sueldo BORRADOR → items: SALARIO 2.5M, COMISION 150k, IPS -225k, VALE -200k, CUOTA -100k, PENALIZACION -X.
14. Bono Manual 50k → item BONO 50k.
15. Aprobar.
16. Pagar → -neto saldo, EGRESO_SALARIO, vale DESCONTADO, comisión INTEGRADA, recibo PDF.
17. Export Excel.
18. Anular liquidación pagada → contra-mov ANULACION, saldo revertido.
19. Egreso Funcionario A motivo DESPIDO_INJUSTIFICADO.
20. Pagar liquidación final.
