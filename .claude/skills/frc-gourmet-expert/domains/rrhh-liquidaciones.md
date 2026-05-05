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
  movimiento_id?: int                   // FK plana a CajaMayorMovimiento (al pagar)
  comprobante_url?
}

LiquidacionItem {
  liquidacion (CASCADE)
  concepto: LiquidacionConcepto
  descripcion: string
  monto: decimal
  tipo: HABER | DESCUENTO
  referenciaId?, referenciaTipo?: VALE | CPP_CUOTA | AGUINALDO | LIQUIDACION_COMISION | etc.
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

`seedLiquidacionConceptos()`:
- HABER: SALARIO_BASE, HORA_EXTRA, BONO_MANUAL, AGUINALDO, COMISION
- DESCUENTO: IPS_DESCUENTO, ADELANTO_DESCUENTO, VALE_DESCUENTO, PENALIZACION, PRESTAMO_CUOTA

### Generación de borrador

`generar-liquidacion-borrador(funcionarioId, periodo, monedaPagoId)` (liquidacion-sueldo.handler.ts:147+):

```
1. Si existe BORRADOR para (funcionario, periodo):
   - Borrar items NO manuales (preserva manuales del usuario)
2. Si APROBADA o PAGADA: error
3. Items auto:
   - SALARIO_BASE (HABER): salarioBase del funcionario
   - IPS_DESCUENTO (DESCUENTO): salarioBase × IPS_PORCENTAJE_FUNCIONARIO%
   - HORA_EXTRA (HABER): SUM HoraExtra del período no anuladas
   - PENALIZACION (DESCUENTO): SUM Penalizacion del período no anuladas
   - BONO_MANUAL (HABER): SUM Bono no anulados del período
   - VALE_DESCUENTO (DESCUENTO): SUM Vale CONFIRMADO/DESCONTADO del período pendientes (referenciaTipo=VALE, referenciaId=vale.id)
   - ADELANTO_DESCUENTO (DESCUENTO): vales con esAdelanto=true (categoría aparte)
   - PRESTAMO_CUOTA (DESCUENTO): cuotas CPP PRESTAMO_FUNCIONARIO vencidas en período
   - COMISION (HABER): si LiquidacionComision APROBADA del período
   - AGUINALDO (HABER): si mes == config.MES_AGUINALDO y Aguinaldo APROBADO

4. Recalcular totales:
   totalHaberes = SUM items WHERE tipo=HABER
   totalDescuentos = SUM items WHERE tipo=DESCUENTO
   totalNeto = totalHaberes - totalDescuentos
```

**User puede agregar items manuales** (con `manual=true`) — no se borran al regenerar.

### Estados y permisos

| Estado | Permite | Permiso |
|---|---|---|
| BORRADOR | regenerar items auto, agregar manuales, eliminar | RRHH_LIQUIDACION_GENERAR |
| APROBADA | nada (read-only). Solo se puede pagar o anular. | RRHH_LIQUIDACION_APROBAR |
| PAGADA | nada. Solo se puede anular. | RRHH_LIQUIDACION_PAGAR |
| ANULADA | nada (terminal) | (anular requiere permiso de pagar + flujo especial) |

### Pagar liquidación (transacción atómica)

`pagar-liquidacion(id, cajaMayorId, monedaId, formaPagoId)`:

```
1. Validar APROBADA
2. Crear CajaMayorMovimiento (EGRESO_SALARIO, totalNeto, liquidacionSueldoId=this.id)
3. actualizarSaldoCajaMayor(EGRESO_SALARIO)
4. Para cada item con referenciaTipo:
   - VALE → vale.estado = DESCONTADO, vale.liquidacion_id = this.id
   - CPP_CUOTA → marcar cuota PAGADA (sin generar movimiento aparte porque ya cuenta el EGRESO_SALARIO total)
   - LIQUIDACION_COMISION → comision.estado = INTEGRADA
   - AGUINALDO → aguinaldo.estado = PAGADO, aguinaldo.fechaPago, liquidacion_id
5. liquidacion.estado = PAGADA, fechaPago, movimiento_id
6. Commit
```

### Anular liquidación pagada (revertir TODO)

`anular-liquidacion-sueldo` (liquidacion-sueldo.handler.ts):

Si era PAGADA, recorre items y revierte por `referenciaTipo`:
- **VALE**: estado DESCONTADO → CONFIRMADO, `liquidacion_id = null` (con cast `as any` por TypeORM).
- **CPP_CUOTA**: resta de `monto_pagado` cuota+CPP, vuelve a PENDIENTE/PARCIAL, `fecha_pago = null`. CPP de PAGADO → ACTIVO.
- **AGUINALDO**: PAGADO → APROBADO, `liquidacion_id = null`, `fecha_pago = null`.
- **LIQUIDACION_COMISION**: INTEGRADA → APROBADA.

Crea contra-movimiento `AJUSTE_POSITIVO` en Caja Mayor (vinculado al original via `referencia_anulacion_id`), suma saldo.

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
  estado: BORRADOR | APROBADA | PAGADA | ANULADA
}

LiquidacionFinalItem {
  liquidacion (CASCADE)
  concepto: string                       // 'INDEMNIZACION', 'VACACIONES_NO_GOZADAS', 'AGUINALDO_PROPORCIONAL'
  monto: decimal
  descripcion?
}
```

### Cálculos

`liquidacion-final.handler.ts:52+`:

```
1. antiguedad = diff(fechaIngreso, fechaEgreso) → dias, meses (÷30), años (÷365)
2. salarioPromedio = avg(totalHaberes) últimas 6 LiquidacionSueldo APROBADA/PAGADA
3. Indemnización:
   if motivoEgreso == DESPIDO_INJUSTIFICADO and dias >= INDEMNIZACION_ANTIGUEDAD_MIN_DIAS (90):
     indemnizacion = (salarioPromedio/30) × INDEMNIZACION_DIAS_POR_ANIO × max(1, anios)
4. Vacaciones no gozadas:
   diasNoGozados = SUM(diasGenerados - diasGozados) de Vacacion no prescritas
   monto = diasNoGozados × (salarioPromedio/30)
5. Aguinaldo proporcional:
   totalGanado = SUM(totalHaberes) liquidaciones APROBADA/PAGADA año en curso
   aguinaldoProporcional = totalGanado / 12
6. totalLiquidado = indemnizacion + vacaciones + aguinaldo
```

### Pagar

Análogo a sueldo: crea `EGRESO_SALARIO` con observación "LIQUIDACION FINAL". Marca `funcionario.activo = false`.

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
  miembros: EquipoComisionMiembro[]
  reglas: EquipoComisionRegla[]
}

EquipoComisionMiembro {
  equipoComision, funcionario
  porcentajeReparto: decimal             // suma debería ser 100%
}

EquipoComisionRegla {
  equipoComision, reglaComision
  fechaDesde, fechaHasta?
  activo
}
```

## Motor de evaluación

`comisiones.handler.ts:40+` (`evaluarReglaParaFuncionario(reglaId, funcionarioId, periodo)`):

```
1. Query VentaItem JOIN Venta:
   - venta.estado = CONCLUIDA
   - ventaItem.estado != CANCELADO
   - producto_id IN reglaProductos (si vacío: todos)
   - COALESCE(ventaItem.vendedor_id, venta.vendedor_id) = funcionario.usuario_id
   - fecha IN [fechaInicio, fechaFin]

2. Métricas:
   - totalUnidades = SUM(quantity)
   - totalMontoProductos = SUM(monto)
   - totalMontoVentaTotalLocal = SUM(montoEnMonedaLocal)

3. Evaluar requisitos (cada ReglaComisionRequisito):
   FOR EACH requisito:
     IF tipo == TARDANZA_MAX:
       totalTardanzas = SUM(minutosTardanza) Asistencia TARDANZA del período
       cumple = totalTardanzas <= umbral
     ELSE IF tipo == ASISTENCIA_MIN:
       diasPresentes = COUNT Asistencia (PRESENTE | TARDANZA)
       cumple = diasPresentes >= umbral
     ELSE IF tipo == QUEJA_MAX:
       quejas = COUNT Penalizacion (QUEJA_CLIENTE)
       cumple = quejas <= umbral
     ELSE IF tipo == CUSTOM:
       cumple = evaluarCustom()

   IF NOT cumple:
     IF modoValidacion == TODO_O_NADA: return monto = 0
     ELSE IF modoValidacion == PROPORCIONAL: aplicar descuento proporcional según peso

4. Calcular monto según tipo:
   META_UNIDADES:        monto = totalUnidades >= metaUnidades ? montoBase : 0
   PORCENTAJE_VENTA:     monto = totalMontoProductos × (porcentaje / 100)
   META_VENTA_LOCAL:     monto = totalMontoLocal >= metaMontoLocal ? montoBase : 0
   EXTRA_MANUAL:         monto = montoBase
   PENALIZACION_MANUAL:  monto = -montoBase

5. Restar penalizaciones COMISION_DESCUENTO:
   monto -= SUM Penalizacion (tipo=COMISION_DESCUENTO)

6. Si EQUIPO_PORCENTAJE:
   FOR EACH EquipoComisionMiembro:
     miembroMonto = monto × (porcentajeReparto / 100)
     Crear LiquidacionComisionItem con funcionario=miembro

7. Snapshot de parámetros en LiquidacionComisionItem.observacion (auditoría: "META_UNIDADES: 50u de PARRILLA, resultado 60u")
```

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

`generar-liquidacion-comision(funcionarioId, periodo)`:
1. Si existe BORRADOR: borrar items y regenerar.
2. Para cada `FuncionarioReglaComision` activa del funcionario en el período:
   - `evaluarReglaParaFuncionario(...)` → monto + observación.
   - Crear `LiquidacionComisionItem`.
3. Para cada `EquipoComisionMiembro` del funcionario activa:
   - Por cada `EquipoComisionRegla` del equipo: evaluar (monto × porcentajeReparto).
   - Crear items.
4. `totalCalculado = SUM items`.

## Dashboard RRHH

`src/app/pages/rrhh/dashboard/`:
- Card: total nómina mes actual (SUM `totalNeto` de PAGADAs).
- Card: % asistencia mes (PRESENTE+TARDANZA / días laborales).
- Card: vales pendientes (SUM CONFIRMADO).
- Card: préstamos activos (SUM cuotas VENCIDA).
- Card: próximos cumpleaños (30d).
- Card: vacaciones próximas (30d, PROGRAMADA + EN_CURSO).
- Tabla: top 5 vendedores (SUM comisiones mes).
- Gráfico: evolución asistencia últimos 3 meses (Chart.js).

## Reportes

`src/app/pages/rrhh/reportes/reportes-rrhh-page.component`:

- Selector de tipo de reporte:
  - Nómina del mes
  - Asistencia por rango
  - Vales pendientes
  - Préstamos activos
  - Vacaciones (con prescripción)
  - Comisiones por período
  - Liquidaciones (lista)
- Filtros: fechaDesde, fechaHasta, funcionario, tipo.
- Botones: Generar, Export PDF (pdfmake), Export Excel (exceljs).

`reportes-rrhh.handler.ts` (515 líneas) — implementación.

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
