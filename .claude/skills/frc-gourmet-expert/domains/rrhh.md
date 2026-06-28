# Dominio: RRHH (Recursos Humanos)

Sistema integral de gestión de empleados. ~40 entidades, 15 handlers. Implementado en 8 fases.

→ Plan original: `docs/plan-rrhh-comisiones.md`.

⚠️ Las entidades de RRHH y de **comisiones** viven todas en `src/app/database/entities/rrhh/` (no hay carpeta `entities/comisiones/`). Las **páginas** de comisiones, en cambio, están en `src/app/pages/comisiones/` (`reglas/`, `equipos/`, `liquidaciones/`), separadas de `src/app/pages/rrhh/`.

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
       │   ├─ VacacionPeriodo (período de goce)
       │   └─ VacacionVenta (días vendidos)
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
| `ipsActivo`, `numeroIps` | bool, string | Aporte IPS Paraguay (IPS solo se descuenta en liquidación si `ipsActivo=true`) |
| `cuentaBancariaPropia?` | string | Datos cuenta cobro (texto libre) |
| `observacion?` | string | |
| `fechaIngreso` | date | |
| `fechaEgreso?` | date | Si egresó |
| `motivoEgreso?` | enum MotivoEgreso | RENUNCIA, DESPIDO_JUSTIFICADO, DESPIDO_INJUSTIFICADO, MUTUO_ACUERDO, JUBILACION, FALLECIMIENTO, OTRO |
| `codigoInterno?` | string UNIQUE | Código interno opcional |
| `activo` | boolean | Soft delete |

### Crear funcionario (transacción)

`rrhh-funcionarios.handler.ts` — `create-funcionario` (permiso `RRHH_FUNCIONARIO_EDITAR`):
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
  nombreArchivo: string
  rutaRelativa: string                          // dentro de userData/funcionario-documentos/{id}/
  mimeType?, tamanoBytes?
  fechaSubida: date
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
  descripcion?: string
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
  descripcion?: string
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
  funcionario, turno?
  fecha
  estado: AsistenciaEstado     // PRESENTE | AUSENTE | TARDANZA | MEDIA_FALTA | JUSTIFICADO | FERIADO | VACACION
  horaEntrada?, horaSalida?
  minutosTardanza: int default 0
  horasTrabajadas?: decimal
  justificada: boolean
  observacion?
  registradoPor?: Usuario
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
  autoGenerada: boolean         // columna `auto_generada`
  anulada: boolean
  descripcion?: string
  registradoPor?: Usuario
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
  montoCalculado: decimal default 0
  asistencia?: Asistencia
  anulada: boolean
  autorizadoPor?: Usuario
  observacion?
}
```

`recargoPorcentaje` y `montoCalculado` se calculan en el handler al crear si no se envían (`horas-extra.handler.ts`):
- `recargoPorcentaje`: si no viene, toma el default de config según `tipo` (`RECARGO_HE_DIURNA`/`NOCTURNA`/`FERIADO`).
- `montoCalculado`: si no viene, monto sugerido = `salarioBase / 200` (jornada 200 hrs/mes) `× (1 + recargo/100) × horas`. Puede ingresarse manualmente.

En liquidación se suma como item HABER tipo HORA_EXTRA.

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
  descripcion?
  estado: ValeEstado         // SOLICITADO | CONFIRMADO | DESCONTADO | ANULADO
  esAdelanto: boolean        // adelanto vs vale corriente (columna default false; el form envía true)
  motivo?: MotivoVale        // FK `motivo_id` al catálogo MotivoVale
  cajaMayor?, moneda, formaPago?  // cajaMayor/formaPago requeridos al confirmar por Caja Mayor
  movimientoId?: int         // FK plana a CajaMayorMovimiento (`movimiento_id`)
  liquidacionId?: int        // FK plana (`liquidacion_id`), set cuando se descuenta en liq sueldo
  cuentaBancariaId?: int     // si el egreso fue desde cuenta bancaria (excluyente con cajaMayor)
  montoCuentaBancaria?, cotizacion?  // monto debitado + cotización si la cuenta está en otra moneda
  autorizadoPor?: Usuario
  comprobanteUrl?
}
```

> El egreso del vale puede salir de **Caja Mayor** o de una **cuenta bancaria** (`cuentaBancariaId`). La anulación revierte el saldo en la fuente correspondiente.

### Confirmar vale (transacción)

`vales.handler.ts` — `confirmar-vale(id, payload)` (permiso `RRHH_VALE_CONFIRMAR`):
1. Validar vale en estado SOLICITADO.
2. Crear `CajaMayorMovimiento` tipo EGRESO_VALE, `valeId = vale.id`, monto, moneda, formaPago, observación "VALE #X — Funcionario".
3. `actualizarSaldoCajaMayor(qr, ..., EGRESO_VALE)` resta saldo.
4. `vale.estado = CONFIRMADO`, `movimiento_id = saved.id`.
5. Commit.

### Crear vale ya confirmado desde Caja Mayor (atajo, v1.5.0)

`vales.handler.ts` — handler `crear-vale-confirmado`. Para registrar un vale como **egreso directo** sin pasar por el flujo SOLICITADO → CONFIRMADO. Disparado desde la card **"Registrar Vale"** en `registrar-egreso-dialog` de Caja Mayor.

Una sola transacción:
1. Valida funcionario + moneda + cajaMayor + formaPago (todos obligatorios) + monto > 0.
2. Crea `Vale` directamente con `estado = CONFIRMADO`, `autorizadoPor = currentUser`.
3. Crea `CajaMayorMovimiento` EGRESO_VALE con `valeId` apuntando.
4. `actualizarSaldoCajaMayor(...)` resta saldo.
5. `vale.movimientoId = movimiento.id` y guarda.

Permisos requeridos: `RRHH_VALE_CREAR` **+** `RRHH_VALE_CONFIRMAR` (doble check).

UI: `create-edit-vale-dialog` en modo `mode = 'confirmar'` con caja preseleccionada. Caja Mayor y Forma de Pago vuelven obligatorias en ese modo.

### Anular vale

`vales.handler.ts` — `anular-vale(id, motivo)` (permiso `RRHH_VALE_CONFIRMAR`):
- Si CONFIRMADO: crear contra-mov AJUSTE_POSITIVO (o reacreditar la cuenta bancaria si el egreso salió de allí) + revertir saldo.
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
  observacion?
  prescrita: boolean default false
}

VacacionPeriodo {
  vacacion                             // vacacion específica que consume (requerida)
  fechaDesde, fechaHasta: date
  diasUsados: int
  estado: VacacionPeriodoEstado        // PROGRAMADA | EN_CURSO | GOZADA | CANCELADA
  autorizadoPor?: Usuario
  asistenciasGeneradas: boolean        // flag idempotencia
  observacion?
}

// Venta de días de vacaciones no gozados (se cobran como HABER en liquidación)
VacacionVenta {
  vacacion                             // vacacion de la que se venden días (requerida)
  dias: int
  monto: decimal
  fecha: date
  estado: VacacionVentaEstado          // PENDIENTE | PAGADO | ANULADO
  liquidacionId?: int                  // set al pagar la liquidación de sueldo que la integra
  observacion?
}
```

### Flujo

1. **Generar acumulado** (`generar-vacaciones-funcionario`, handler `vacaciones.handler.ts`): NO es automático al ingreso; se dispara explícitamente. Calcula los años completos trabajados desde `fechaIngreso` y genera un `Vacacion` por cada `anioServicio` faltante (1..N), con `fechaCorte` = ingreso + n años y días según antigüedad de ese año:
   - <5 años: 12 días (`config.DIAS_VACACIONES_HASTA_5A`)
   - 5-10 años: 18 días (`DIAS_VACACIONES_5_10A`)
   - >10 años: 30 días (`DIAS_VACACIONES_MAS_10A`)
   Marca `prescrita=true` si ya pasaron `PRESCRIPCION_VACACIONES_MESES` desde `fechaCorte`.
2. **Programar período**: crear `VacacionPeriodo` (PROGRAMADA). Valida que los días disponibles (`diasGenerados − diasGozados − vendidos − ya programados`) alcancen.
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
  motivo?
  autorizadoPor?: Usuario
  liquidacionId?: int                   // FK plana (`liquidacion_id`)
  esRecurrente: boolean
  frecuencia?: GastoFrecuencia          // SEMANAL | MENSUAL | TRIMESTRAL...
  anulado: boolean
}
```

**Aguinaldo**: 1/12 del total de haberes ganado en el año (suma `totalHaberes` de liquidaciones APROBADA/PAGADA del año). Se genera al liquidar el período de **diciembre** (la liquidación de sueldo agrega el item AGUINALDO cuando `periodo` termina en `-12`; lógica **hardcodeada a diciembre**, no configurable). También puede calcularse en lote con `calcular-aguinaldos-anio`. La clave `MES_AGUINALDO` aparece en un comentario del código pero **no existe en el seed ni se lee**.

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

`generarNotificacionesRrhh()` en `notificaciones-rrhh.handler.ts`. Corre al startup + cada 24h (`setInterval` en `main.ts`):
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

Helpers exportados en `configuracion-rrhh.handler.ts`: `getConfig` (string crudo), `getConfigNumber`, `getConfigBoolean`. (No hay `getConfigString` ni `getConfigDate`.)

### Seed inicial

`seedConfiguracionRrhh()` (configuracion-rrhh.handler.ts):

| Clave | Default | Tipo | Uso |
|---|---|---|---|
| IPS_PORCENTAJE_FUNCIONARIO | 9 | NUMBER | Aporte IPS funcionario |
| IPS_PORCENTAJE_PATRONAL | 16.5 | NUMBER | Aporte IPS empresa |
| SALARIO_MINIMO_LEGAL_PYG | 2798309 | NUMBER | Salario mínimo PY (referencia 2026 — actualizar) |
| DIAS_VACACIONES_HASTA_5A | 12 | NUMBER | |
| DIAS_VACACIONES_5_10A | 18 | NUMBER | |
| DIAS_VACACIONES_MAS_10A | 30 | NUMBER | |
| PRESCRIPCION_VACACIONES_MESES | 24 | NUMBER | |
| INDEMNIZACION_DIAS_POR_ANIO | 15 | NUMBER | Despido injustificado |
| INDEMNIZACION_ANTIGUEDAD_MIN_DIAS | 90 | NUMBER | Antigüedad mínima |
| RECARGO_HE_DIURNA | 50 | NUMBER | % HE diurna |
| RECARGO_HE_NOCTURNA | 100 | NUMBER | % HE nocturna |
| RECARGO_HE_FERIADO | 100 | NUMBER | % HE feriado |
| TOLERANCIA_TARDANZA_MIN | 5 | NUMBER | Default tolerancia |
| PENALIZACION_AUTO_TARDANZA | true | BOOLEAN | Auto-generar |
| PENALIZACION_MONTO_TARDANZA | 0 | NUMBER | Monto fijo |
| PENALIZACION_MONTO_POR_MINUTO_TARDANZA | 0 | NUMBER | × minutos |
| DIA_CIERRE_MES | 30 | NUMBER | Cierre mensual liquidación |
| PORCENTAJE_COSTO_SUGERIDO | 35 | NUMBER | % del precio que representa el costo (sugerencia de precio en recetas) |

> No hay `MES_AGUINALDO` en el seed (el aguinaldo está hardcodeado a diciembre).

UI: `src/app/pages/rrhh/configuracion/list-configuracion-rrhh/`. CRUD con tipos. Permiso de edición: `RRHH_CONFIG_EDITAR`.

## Permisos RRHH

→ Detalle en [architecture/auth-permissions.md](../architecture/auth-permissions.md).

Códigos RRHH seedeados (`seed-system.ts`): `RRHH_FUNCIONARIO_VER`, `RRHH_FUNCIONARIO_EDITAR`, `RRHH_ASISTENCIA_REGISTRAR`, `RRHH_ASISTENCIA_JUSTIFICAR`, `RRHH_VALE_CREAR`, `RRHH_VALE_CONFIRMAR`, `RRHH_PENALIZACION_REGISTRAR`, `RRHH_BONO_OTORGAR`, `RRHH_PRESTAMO_OTORGAR`, `RRHH_VACACION_GESTIONAR`, `RRHH_LIQUIDACION_GENERAR`, `RRHH_LIQUIDACION_APROBAR`, `RRHH_LIQUIDACION_PAGAR`, `RRHH_LIQUIDACION_FINAL_GENERAR`, `RRHH_CONFIG_EDITAR`, `RRHH_DASHBOARD_VER`, `RRHH_REPORTE_GENERAR`, `RRHH_NOTIFICACIONES_VER`.

Comisiones: `COMISION_REGLA_VER`, `COMISION_REGLA_EDITAR`, `COMISION_REGLA_GESTIONAR`, `COMISION_EQUIPO_GESTIONAR`, `COMISION_LIQUIDACION_GENERAR`, `COMISION_LIQUIDACION_APROBAR`.

⚠️ `RRHH_LIQUIDACION_GENERAR` está seedeado pero el handler `generar-liquidacion-borrador` **no** valida permiso actualmente.

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

## Handlers (15)

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
