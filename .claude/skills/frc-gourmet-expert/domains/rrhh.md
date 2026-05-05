# Dominio: RRHH (Recursos Humanos)

Sistema integral de gestión de empleados. ~40 entidades, 13+ handlers. Implementado en 8 fases (todas mergeadas a `main`).

→ Plan original: `docs/plan-rrhh-comisiones.md`.

## Estructura general

```
Persona (datos personales)
  └─ Funcionario (datos laborales)
       ├─ Cargo (cargo actual)
       ├─ HistoricoCargo (cambios de cargo)
       ├─ HistoricoSalario (cambios salariales)
       ├─ FuncionarioDocumento (PDFs, certificados)
       ├─ FuncionarioTurno → Turno
       ├─ Asistencia (diaria)
       ├─ Penalizacion (manual o auto-tardanza)
       ├─ HoraExtra
       ├─ Vale (adelantos / vales corrientes)
       ├─ Vacacion (acumulado anual)
       │   └─ VacacionPeriodo (período de goce)
       ├─ LiquidacionSueldo (mensual)
       │   └─ LiquidacionItem (haberes / descuentos)
       ├─ LiquidacionFinal (al egreso)
       ├─ Aguinaldo (anual)
       ├─ Bono
       ├─ FuncionarioReglaComision → ReglaComision
       └─ EquipoComisionMiembro → EquipoComision
```

→ Liquidaciones detalladas en [rrhh-liquidaciones.md](rrhh-liquidaciones.md).

## Funcionario

`src/app/database/entities/rrhh/funcionario.entity.ts`:

| Campo | Tipo | Notas |
|---|---|---|
| `persona_id` | FK | Persona base (nombre, apellido, email, fechaNacimiento, sexo, estadoCivil) |
| `cargo_id` | FK | Cargo actual |
| `usuario_id` | FK nullable | Vínculo con Usuario sistema (para permisos + comisiones) |
| `salarioBase` | decimal(18,2) | |
| `monedaSalario_id` | FK | |
| `esJornalero` | boolean | |
| `valorJornal?` | decimal | Si jornalero |
| `ipsActivo`, `numeroIps` | bool, string | Aporte IPS Paraguay |
| `cuentaBancariaPropia?` | string | Datos cuenta cobro (TODO: enum `formaCobroSalario`) |
| `fechaIngreso` | date | |
| `fechaEgreso?` | date | Si egresó |
| `motivoEgreso?` | enum MotivoEgreso | RENUNCIA, DESPIDO_JUSTIFICADO, DESPIDO_INJUSTIFICADO, MUTUO_ACUERDO, JUBILACION, FALLECIMIENTO, OTRO |
| `codigoInterno?` | string UNIQUE | Código interno opcional |
| `activo` | boolean | Soft delete |

### Crear funcionario (transacción)

`rrhh-funcionarios.handler.ts:129+`:
1. Validar Persona, Cargo, Moneda existen.
2. Crear `Funcionario`.
3. Crear `HistoricoCargo` (fechaDesde=fechaIngreso, motivo="INGRESO").
4. Crear `HistoricoSalario` (salarioNuevo=salarioBase, fechaVigencia=fechaIngreso, motivo="INGRESO").
5. Commit.

Cambios de cargo/salario posteriores generan nuevos registros históricos con `fechaHasta` del anterior.

## FuncionarioDocumento

```typescript
{
  funcionario, tipo: FuncionarioDocumentoTipo  // CEDULA | CONTRATO | CERTIFICADO | CV | ANTECEDENTES | CARNET_SALUD | TITULO_ACADEMICO | OTRO
  rutaRelativa: string                          // dentro de userData/funcionario-documentos/{id}/
  vencimiento?: date
  observacion?
}
```

**Almacenamiento**: filesystem en `userData/funcionario-documentos/{funcionario_id}/`. SQLite no debe almacenar PDFs grandes. Helper `electron/utils/document-handler.utils.ts`.

⚠️ Backup: la BD `.db` no incluye los documentos. Backup completo debe abarcar `frc-gourmet.db` + carpeta `funcionario-documentos/`.

## Cargo

```typescript
{
  nombre: string             // "MOZO", "PARRILLERO", "GERENTE"
  salarioReferencia?: decimal
  activo: boolean
}
```

⚠️ **NO es Role del sistema**. Cargo es laboral (qué función desempeña). Role es de permisos.

## Turnos y Asistencias

### Turno

```typescript
{
  nombre: string                        // "MAÑANA", "TARDE", "NOCHE"
  horaEntrada: string ('HH:mm')         // '08:00'
  horaSalida: string                    // '16:00'
  toleranciaTardanzaMinutos: int default 5
  activo
}
```

### FuncionarioTurno

Asignación con vigencia (permite historial):

```typescript
{
  funcionario, turno
  fechaDesde, fechaHasta?: date
  activo
}
```

### Asistencia

```typescript
@Index(['funcionario', 'fecha'])
{
  funcionario, fecha
  estado: AsistenciaEstado     // PRESENTE | AUSENTE | TARDANZA | MEDIA_FALTA | JUSTIFICADO | FERIADO | VACACION
  horaEntrada?, horaSalida?
  minutosTardanza?: int
  horasTrabajadas?: decimal
  justificada: boolean
  observacion?
}
```

### Lógica al registrar asistencia

`asistencias.handler.ts` (`crearAsistenciaInterno`):

```
1. Validar funcionario + turno asignado
2. Si turno y horaEntrada:
   diff = diffMinutos(horaEntrada, turno.horaEntrada)
   if diff > turno.toleranciaTardanzaMinutos:
     estado = TARDANZA
     minutosTardanza = diff
3. Crear Asistencia
4. Si TARDANZA y NOT justificada:
   if config.PENALIZACION_AUTO_TARDANZA:
     montoFijo = config.PENALIZACION_MONTO_TARDANZA
     montoPorMin = config.PENALIZACION_MONTO_POR_MINUTO_TARDANZA
     monto = montoFijo + montoPorMin × minutosTardanza
     Crear Penalizacion (tipo=TARDANZA, autoGenerada=true, asistencia_id, monto)
```

### Justificar asistencia

`justificar-asistencia(asistenciaId)`:
- Cambia estado → JUSTIFICADO.
- Anula Penalizaciones auto asociadas (`auto_generada=1` con ese `asistencia_id`).

## Feriados

```typescript
@UNIQUE
{
  fecha: date                    // unique
  descripcion: string
  esNacional: boolean
  recargoPorcentaje: decimal default 100  // % recargo HE en feriado
  activo
}
```

Afecta cálculo de Hora Extra (recargoPorcentaje aplicable).

## Penalizaciones

```typescript
enum PenalizacionTipo {
  TARDANZA, AUSENCIA, QUEJA_CLIENTE, AMBIENTE_LABORAL, DANIO_MATERIAL,
  COMISION_DESCUENTO,    // resta de comisiones (no de sueldo)
  OTRO
}

Penalizacion {
  funcionario
  tipo: PenalizacionTipo
  monto: decimal
  fecha: date
  asistencia?: Asistencia       // si auto-generada por tardanza
  autoGenerada: boolean
  anulada: boolean
  observacion?
}
```

**Auto-generadas**: chip naranja "AUTO" en lista. Botón "Editar" oculto (mantiene trazabilidad), solo "Anular".

**Justificar asistencia anula la penalización auto** asociada.

**Configuración** (`configuraciones_rrhh`):
- `PENALIZACION_AUTO_TARDANZA` (BOOLEAN, default true)
- `PENALIZACION_MONTO_TARDANZA` (NUMBER, default 0): monto fijo PYG
- `PENALIZACION_MONTO_POR_MINUTO_TARDANZA` (NUMBER, default 0): por minuto

→ `project_penalizacion_tardanza_config`

## Horas Extra

```typescript
enum HoraExtraTipo {
  DIURNA      // recargo +50% default
  NOCTURNA    // recargo +100% default
  FERIADO     // recargo +100% default
}

HoraExtra {
  funcionario
  fecha: date
  horas: decimal
  tipo: HoraExtraTipo
  recargoPorcentaje: decimal default 50
  montoCalculado?: decimal
  anulada: boolean
  autorizadoPor?: Usuario
  observacion?
}
```

⚠️ `montoCalculado` no se calcula automáticamente al crear — debe ingresarse o calcularse aparte. En liquidación se suma como item HABER tipo HORA_EXTRA.

## Vales y Adelantos

`Vale` ciclo de vida:

```
SOLICITADO  ─┐  (creado, sin movimiento caja mayor)
             │
             ▼ confirmar-vale
CONFIRMADO  ─┐  (genera EGRESO_VALE en caja mayor, movimiento_id set)
             │
             ▼ cuando se paga liquidación que lo descuenta
DESCONTADO  ─┐  (vale.liquidacion_id set)
             │
             ▼ anular-vale (en cualquier estado)
ANULADO       (genera contra-mov AJUSTE_POSITIVO si estaba CONFIRMADO)
```

```typescript
Vale {
  funcionario, fecha
  monto: decimal
  estado: ValeEstado         // SOLICITADO | CONFIRMADO | DESCONTADO | ANULADO
  esAdelanto: boolean        // adelanto vs vale corriente
  motivoVale?: MotivoVale    // catálogo
  cajaMayor, moneda, formaPago  // requeridos al confirmar
  movimiento_id?: int        // FK plana a CajaMayorMovimiento
  liquidacion_id?: int       // FK plana, set cuando se descuenta en liq sueldo
  autorizadoPor?: Usuario
  comprobante_url?
}
```

### Confirmar vale (transacción)

`vales.handler.ts:112+`:
1. Validar vale en estado SOLICITADO.
2. Crear `CajaMayorMovimiento` tipo EGRESO_VALE, `valeId = vale.id`, monto, moneda, formaPago, observación "VALE #X — Funcionario".
3. `actualizarSaldoCajaMayor(qr, ..., EGRESO_VALE)` resta saldo.
4. `vale.estado = CONFIRMADO`, `movimiento_id = saved.id`.
5. Commit.

### Anular vale

`vales.handler.ts:177+`:
- Si CONFIRMADO: crear contra-mov AJUSTE_POSITIVO + revertir saldo.
- `vale.estado = ANULADO`.

### MotivoVale

Catálogo plano: ejemplo `nombre = "ANTICIPO SUELDO", "EMERGENCIA MEDICA", "PRESTAMO COMPRA INSUMOS"`.

## Vacaciones

```typescript
@Index(['funcionario', 'anioServicio'])
Vacacion {
  funcionario
  anioServicio: int                    // 1, 2, 3...
  diasGenerados: int
  diasGozados: int default 0
  fechaCorte: date                     // cuándo cumplió año
  prescrita: boolean default false
  activo
}

VacacionPeriodo {
  funcionario, vacacion?               // vacacion específica que consume
  fechaDesde, fechaHasta: date
  diasUsados: int
  estado: VacacionPeriodoEstado        // PROGRAMADA | EN_CURSO | GOZADA | CANCELADA
  autorizadoPor?: Usuario
  asistenciasGeneradas: boolean        // flag idempotencia
  observacion?
}
```

### Flujo

1. **Al ingreso** (auto): genera `Vacacion` para `anioServicio=1` con días según antigüedad:
   - <5 años: 12 días (`config.DIAS_VACACIONES_HASTA_5A`)
   - 5-10 años: 18 días
   - >10 años: 30 días
2. **Programar período**: crear `VacacionPeriodo` (PROGRAMADA). Validar `diasGozados + diasNuevos ≤ diasGenerados`.
3. **Marcar EN_CURSO** o **GOZADA**: si GOZADA + `asistenciasGeneradas=false`, generar Asistencia estado=VACACION para cada día del rango. `Vacacion.diasGozados += diasUsados`.
4. **Prescripción**: tras `config.PRESCRIPCION_VACACIONES_MESES` (default 24m) de fechaCorte, marca `prescrita=true`. No se pueden gozar.
5. **En liquidación final**: vacacionesNoGozadas (de no prescritas) se pagan a `salarioPromedio/30` por día.

## Aguinaldo y Bonos

```typescript
Aguinaldo {
  funcionario
  anio: int
  montoCalculado: decimal
  mesesTrabajados: int
  estado: AguinaldoEstado              // CALCULADO | APROBADO | PAGADO
  fechaPago?: date
  liquidacion_id?: int                 // si se pagó vía liquidación sueldo
}

Bono {
  funcionario
  tipo: BonoTipo                        // CUMPLEANIOS | NAVIDAD | DESEMPENIO | PRODUCTIVIDAD | OTRO
  monto: decimal
  fecha: date
  motivo?, observacion?
  esRecurrente: boolean
  frecuencia?: GastoFrecuencia          // SEMANAL | MENSUAL | TRIMESTRAL...
  anulado: boolean
}
```

**Aguinaldo**: 1/12 del total ganado en meses trabajados en el año. Generación configurable (`config.MES_AGUINALDO`, default 12 = diciembre). Puede pagarse junto a sueldo de diciembre o aparte.

**Bono**: si `esRecurrente=true`, se considera mensual recurrente. Anulado lo excluye de futuras liquidaciones.

## Notificaciones RRHH

```typescript
enum TipoNotificacionRrhh {
  PRESTAMO_VENCIDO, CUOTA_VENCIDA, CUMPLEANIOS, VACACION_PROXIMA,
  CONTRATO_VENCE, LIQUIDACION_PENDIENTE, COMISION_PENDIENTE, DOCUMENTO_VENCE
}

NotificacionRrhh {
  tipo, prioridad: ALTA | MEDIA | BAJA
  titulo, mensaje
  funcionario_id?, usuarioDestino_id?
  fechaGenerada, fechaLeida?
  accionUrl?
  claveDedupe?: string UNIQUE          // dedupe (ej: "CUMPLEANIOS-2026-05-05-3")
}
```

### Generación automática

`notificaciones-rrhh.handler.ts:19+`. Corre al startup + cada 24h (setInterval en main.ts):
1. **CUMPLEANIOS**: funcionarios cuya `persona.fechaNacimiento` mes/día = hoy.
2. **CUOTA_VENCIDA**: CuentaPorPagarCuota vencida de PRESTAMO_FUNCIONARIO.
3. **VACACION_PROXIMA**: VacacionPeriodo EN_CURSO próximas a término (±3 días).
4. **LIQUIDACION_PENDIENTE**: LiquidacionSueldo APROBADA no pagada > 5 días.
5. **COMISION_PENDIENTE**: LiquidacionComision APROBADA no integrada.
6. **DOCUMENTO_VENCE**: FuncionarioDocumento con vencimiento ≤ hoy+30 días.

**Deduplicación**: `claveDedupe` UNIQUE evita duplicados (regenerar es idempotente).

**UI**: badge en sidenav (count `notificacionesNoLeidas`, refresh cada 5 min). Tab "Notificaciones RRHH" con lista filtrable.

## Configuración RRHH

`ConfiguracionRrhh` — key/value:

```typescript
{
  clave: string UNIQUE UPPERCASE       // 'IPS_PORCENTAJE_FUNCIONARIO'
  valor: string
  tipo: NUMBER | STRING | BOOLEAN | DATE
  descripcion?
  activo
}
```

Helpers en handler: `getConfigNumber`, `getConfigBoolean`, `getConfigString`, `getConfigDate`.

### Seed inicial

`seedConfiguracionRrhh()` (configuracion-rrhh.handler.ts):

| Clave | Default | Tipo | Uso |
|---|---|---|---|
| IPS_PORCENTAJE_FUNCIONARIO | 9 | NUMBER | Aporte IPS funcionario |
| IPS_PORCENTAJE_PATRONAL | 16.5 | NUMBER | Aporte IPS empresa |
| SALARIO_MINIMO_LEGAL_PYG | varía | NUMBER | Salario mínimo PY |
| DIAS_VACACIONES_HASTA_5A | 12 | NUMBER | |
| DIAS_VACACIONES_5_10A | 18 | NUMBER | |
| DIAS_VACACIONES_MAS_10A | 30 | NUMBER | |
| INDEMNIZACION_DIAS_POR_ANIO | 15 | NUMBER | Despido injustificado |
| INDEMNIZACION_ANTIGUEDAD_MIN_DIAS | 90 | NUMBER | Antigüedad mínima |
| RECARGO_HE_DIURNA | 50 | NUMBER | % HE diurna |
| RECARGO_HE_NOCTURNA | 100 | NUMBER | % HE nocturna |
| RECARGO_HE_FERIADO | 100 | NUMBER | % HE feriado |
| TOLERANCIA_TARDANZA_MIN | 5 | NUMBER | Default tolerancia |
| PRESCRIPCION_VACACIONES_MESES | 24 | NUMBER | |
| DIA_CIERRE_MES | 30 | NUMBER | Cierre mensual liquidación |
| MES_AGUINALDO | 12 | NUMBER | Diciembre |
| PENALIZACION_AUTO_TARDANZA | true | BOOLEAN | Auto-generar |
| PENALIZACION_MONTO_TARDANZA | 0 | NUMBER | Monto fijo |
| PENALIZACION_MONTO_POR_MINUTO_TARDANZA | 0 | NUMBER | × minutos |

UI: `src/app/pages/rrhh/configuracion/list-configuracion-rrhh/`. CRUD con tipos.

## Permisos RRHH

→ Detalle en [architecture/auth-permissions.md](../architecture/auth-permissions.md).

Códigos relevantes: `RRHH_FUNCIONARIO_VER`, `RRHH_FUNCIONARIO_EDITAR`, `RRHH_VALE_CREAR`, `RRHH_VALE_CONFIRMAR`, `RRHH_LIQUIDACION_GENERAR`, `RRHH_LIQUIDACION_APROBAR`, `RRHH_LIQUIDACION_PAGAR`, `RRHH_VACACION_GESTIONAR`, `RRHH_ASISTENCIA_REGISTRAR`, `RRHH_DASHBOARD_VER`, `RRHH_REPORTES_EXPORTAR`, etc.

## Páginas

`src/app/pages/rrhh/`:
- `dashboard/` — Fase 8: KPIs, gráficos.
- `funcionarios/` — list + detalle (tabs: Datos, Cargos, Salarios, Documentos, Asistencia, Vales, Préstamos, Vacaciones, Liquidaciones).
- `cargos/`, `turnos/`, `asistencias/`, `feriados/`, `horas-extra/`, `vales/`, `motivos-vale/`, `bonos/`, `aguinaldos/`, `vacaciones/`, `penalizaciones/`, `prestamos-funcionarios/`.
- `liquidaciones-sueldo/` (list, generar, aprobar, pagar, anular).
- `liquidaciones-final/`.
- `notificaciones/` — listado con marcar leído.
- `reportes/` — selector + filtros + export PDF/Excel.
- `configuracion/` — Configuracion RRHH CRUD.

## Handlers (13)

`electron/handlers/`:
- `rrhh-funcionarios.handler.ts` — Cargo, Funcionario, históricos.
- `funcionario-documentos.handler.ts` — upload/delete files.
- `asistencias.handler.ts` — Turno, FuncionarioTurno, Asistencia, Penalizacion.
- `feriados.handler.ts`.
- `horas-extra.handler.ts`.
- `vales.handler.ts` — incluye MotivoVale.
- `liquidacion-sueldo.handler.ts` — incluye LiquidacionConcepto, Bono, Aguinaldo.
- `vacaciones.handler.ts`.
- `liquidacion-final.handler.ts`.
- `comisiones.handler.ts` — ReglaComision, FuncionarioReglaComision, motor de evaluación.
- `equipos-comision.handler.ts` — EquipoComision, EquipoComisionMiembro, EquipoComisionRegla.
- `configuracion-rrhh.handler.ts`.
- `dashboard-rrhh.handler.ts` — KPIs.
- `notificaciones-rrhh.handler.ts`.
- `reportes-rrhh.handler.ts` — exports PDF/Excel.

→ Liquidaciones y comisiones detalladas: [rrhh-liquidaciones.md](rrhh-liquidaciones.md).
