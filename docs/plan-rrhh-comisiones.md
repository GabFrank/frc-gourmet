# Plan de implementación — Módulo RRHH + Comisiones (Don Franco)

> Repo: `frc-gourmet-legacy` — Angular 15 standalone + Electron + TypeORM SQLite (`synchronize:true`).
> Este plan reemplaza la versión anterior (que mezclaba un análisis de PDFs externo). Aquí solo se trata el alcance de RRHH + Comisiones, integrando profundamente con el módulo Caja Mayor (Fase 1 ya en producción).

---

## Contexto

Restaurante Don Franco (Paraguay, guaraníes + IPS) necesita un módulo de RRHH integral. Al explorar el repo se detectó que el módulo financiero **Caja Mayor (Fase 1 completada)** ya implementa infraestructura crítica que el plan anterior duplicaba:

- Enum `TipoMovimiento` con `EGRESO_SALARIO`, `EGRESO_VALE`, `EGRESO_CUOTA_PRESTAMO` ya definidos.
- `CuentaPorPagar` + `CuentaPorPagarCuota` con tipo `PRESTAMO`.
- `Gasto` recurrente.
- Helpers transaccionales atómicos: `actualizarSaldo`, `esIngreso`.
- Anulación con contra-movimientos.
- `RetiroCaja` con responsable.

Además el plan anterior omitía piezas comunes de un módulo RRHH completo: vacaciones, aguinaldo, liquidación final / indemnización, adelanto distinto a vale, bonos no recurrentes, históricos cargo/salario, documentos del funcionario, feriados, horas extra, dashboard real con KPIs, exports PDF/Excel, recibos firmables, notificaciones, configuración de parámetros legales, comisión por equipo, vendedor explícito en `Venta`, permisos granulares, y créditos a clientes (`CuentaPorCobrar` espejo de `CuentaPorPagar`).

**Outcome esperado**: módulo RRHH+Comisiones implementable en 8 fases mergeables independientes, reutilizando todo lo viable del Caja Mayor, con justificación clara de cada decisión arquitectónica.

---

## 1. Decisiones arquitectónicas (8)

| # | Decisión | Recomendación | Justificación |
|---|---|---|---|
| **D1** | Préstamos a funcionarios | **EXTENDER `CuentaPorPagar`** (agregar `funcionario_id` nullable + nuevo enum `PRESTAMO_FUNCIONARIO`) | Reutiliza `pagar-cpp-cuota` (ya emite `EGRESO_CUOTA_PRESTAMO`), generación auto de cuotas mensuales, estados, UI `pagar-cuota-dialog`. Inventar `PrestamoFuncionario` paralelo duplica ~500 líneas. |
| **D2** | Atribución de venta | **Agregar `vendedor_id` FK Usuario explícito** en `Venta` y opcional en `VentaItem` | `createdBy` puede ser cajero/supervisor, no el mozo. Mesas con mozos rotativos exigen reasignación. Sin esto las comisiones son inverificables. Migración 1-vez: `vendedor_id = created_by` para ventas históricas. |
| **D3** | Vales | **Entidad `Vale` propia** que genera `CajaMayorMovimiento` al confirmar | Ciclo de vida (SOLICITADO→CONFIRMADO→DESCONTADO→ANULADO) no encaja en un movimiento simple. Permite "vales pendientes de descuento". Anulación reusa `anular-caja-mayor-movimiento`. |
| **D4** | Permisos | **Entidad `Permission` + `RolePermission`** consultable, no hardcoded en guards | `Role`+`UsuarioRole` está infrautilizado; esto los activa. Configurable por admin. ~25 codes seed. |
| **D5** | Documentos funcionario | **Filesystem en `userData/funcionario-documentos/{id}/`** + entidad `FuncionarioDocumento` | Patrón ya establecido (`profile-images/`, `producto-images/` en `image-handler.utils.ts`). SQLite no debe almacenar PDFs grandes. |
| **D6** | Adelanto de salario | **Caso especial de `Vale`** con flag `esAdelanto: boolean` | 95% del flujo es idéntico. Solo cambia categoría contable en liquidación. |
| **D7** | Liquidación de sueldo | **Entidad propia `LiquidacionSueldo`** (NO extender `Gasto`) | `Gasto` apunta a Proveedor, flujo distinto. Liquidación tiene N items haberes/descuentos, aprobación, recibo firmable, lote de pago. Sí reusa `EGRESO_SALARIO` + `actualizarSaldo()`. |
| **D8** | Categorías de vales/comisiones | **NO reutilizar `GastoCategoria`** (jerárquica para gastos contables); crear `MotivoVale`, `MotivoBono`, `LiquidacionConcepto` planos | `GastoCategoria` es para terceros/contabilidad operativa. Vales/bonos son transacciones a funcionarios con semántica distinta. |

---

## 2. Patrones de integración con Caja Mayor

**Helpers reutilizables (no duplicar)**:
- `actualizarSaldo(qr, cajaMayorId, monedaId, formaPagoId, monto, tipo)` en `electron/handlers/caja-mayor.handler.ts:29`.
- `esIngreso(tipo)` en `electron/handlers/caja-mayor.handler.ts:16`.
- `setEntityUserTracking(...)` en `electron/utils/entity.utils.ts`.
- `anular-caja-mayor-movimiento` en `electron/handlers/caja-mayor.handler.ts:291` — genera contra-movimiento con `referenciaAnulacion`.
- `pagar-cpp-cuota` en `electron/handlers/cuentas-por-pagar.handler.ts:414` — pago atómico de cuota + movimiento `EGRESO_CUOTA_PRESTAMO`.
- `confirmarSaldosNegativos` en `src/app/shared/utils/saldo-negativo-confirm.ts`.

**Trazabilidad bidireccional** — agregar columnas `int nullable` en `caja-mayor-movimiento.entity.ts`:
```ts
@Column({ name: 'vale_id', type: 'int', nullable: true }) valeId?: number;
@Column({ name: 'liquidacion_sueldo_id', type: 'int', nullable: true }) liquidacionSueldoId?: number;
@Column({ name: 'liquidacion_comision_id', type: 'int', nullable: true }) liquidacionComisionId?: number;
@Column({ name: 'cuenta_por_cobrar_cuota_id', type: 'int', nullable: true }) cuentaPorCobrarCuotaId?: number;
```

**Pseudocódigo flujo VALE (egreso desde caja mayor)**:
```
async confirmarVale(valeId, userId):
  qr = dataSource.createQueryRunner(); await qr.startTransaction()
  vale = qr.findOne(Vale, { id, relations: ['funcionario','cajaMayor','moneda','formaPago'] })
  if vale.estado != 'SOLICITADO': throw
  movimiento = qr.create(CajaMayorMovimiento, {
    cajaMayor, tipoMovimiento: EGRESO_VALE, moneda, formaPago, monto: vale.monto,
    fecha: now, observacion: `VALE #${vale.id} — ${funcionario.nombre}`,
    valeId: vale.id
  })
  setEntityUserTracking(dataSource, movimiento, userId)
  saved = qr.save(movimiento)
  await actualizarSaldo(qr, cajaMayorId, monedaId, formaPagoId, monto, EGRESO_VALE)
  vale.estado = 'CONFIRMADO'; vale.movimiento_id = saved.id
  qr.save(vale); qr.commitTransaction()
```

**Flujo CUOTA PRÉSTAMO FUNCIONARIO** — 100% reutiliza `pagar-cpp-cuota`. Solo extender el switch para que `PRESTAMO_FUNCIONARIO` también emita `EGRESO_CUOTA_PRESTAMO`.

**Flujo PAGO LIQUIDACIÓN SUELDO** — análogo a Vale pero con `tipoMovimiento: EGRESO_SALARIO` y `liquidacionSueldoId`. Tras commit: marcar vales asociados como `DESCONTADO`, comisiones como `INTEGRADA`.

**Anulación de cualquier egreso RRHH**: llamar `anular-caja-mayor-movimiento(id, motivo)` y revertir estado de la entidad origen.

---

## 3. Fases de implementación

### Fase 0 — Fundamentos (Persona+, Permisos, ConfiguracionRrhh)

**Modificaciones**: `persona.entity.ts` (+ `apellido`, `email`, `fechaNacimiento`, `sexo` enum M/F/OTRO, `estadoCivil` enum SOLTERO/CASADO/UNION_LIBRE/DIVORCIADO/VIUDO, todos nullable).

**Entidades nuevas**:
- `Permission` (codigo UPPERCASE UNIQUE, descripcion, modulo, activo)
- `RolePermission` (role_id, permission_id)
- `ConfiguracionRrhh` (clave UNIQUE, valor string, tipo NUMBER/STRING/BOOLEAN/DATE, descripcion). Seed inicial con valores PY (ver §5).

**Handlers**: `electron/handlers/permissions.handler.ts`, `electron/handlers/configuracion-rrhh.handler.ts`. Helper `getConfig(clave)`.

**UI**: `src/app/pages/personalizacion/permisos/{list-permisos,assign-permisos-role-dialog}`, `src/app/pages/rrhh/configuracion/list-configuracion-rrhh`.

**Aceptación**: CRUD permisos, `PermissionService.has('RRHH_VALE_CREAR')` correcto, editar IPS% persiste, alta Persona con campos nuevos no rompe Cliente/Usuario existente.

### Fase 1 — Funcionarios (catálogo + legajo)

**Entidades nuevas**: `Cargo`, `Funcionario` (persona_id FK + cargo_id + fechaIngreso + fechaEgreso nullable + motivoEgreso enum + salarioBase + monedaSalario_id + esJornalero + valorJornal + usuario_id nullable + ipsActivo + numeroIps + cuentaBancariaPropia + activo), `HistoricoCargo`, `HistoricoSalario`, `FuncionarioDocumento` (tipo CEDULA/CONTRATO/CERTIFICADO/OTRO + rutaRelativa + vencimiento nullable).

**Handlers**: `electron/handlers/rrhh-funcionarios.handler.ts`, `electron/handlers/funcionario-documentos.handler.ts` (upload base64 al filesystem). Crear `electron/utils/document-handler.utils.ts`.

**UI**: `src/app/pages/rrhh/{cargos,funcionarios}/...` — `funcionario-detalle` con tabs: Datos, Historial Cargo, Historial Salario, Documentos, Asistencia, Vales, Préstamos, Vacaciones, Liquidaciones.

### Fase 2 — Turnos, Asistencia, Penalizaciones, Feriados, Horas extra

**Entidades nuevas**: `Turno`, `FuncionarioTurno`, `Asistencia` (estado PRESENTE/AUSENTE/TARDANZA/MEDIA_FALTA/JUSTIFICADO/FERIADO + minutosTardanza + horasTrabajadas + justificada), `Penalizacion`, `Feriado`, `HoraExtra` (DIURNA/NOCTURNA/FERIADO + recargoPorcentaje + montoCalculado).

**Handlers**: `electron/handlers/{asistencias,feriados,horas-extra}.handler.ts`. Tardanza > tolerancia genera `Penalizacion` automática.

### Fase 3 — Vales, Adelantos, Préstamos

**Modificaciones**:
- `cuenta-por-pagar.entity.ts`: `+ funcionario_id` FK nullable; `+ PRESTAMO_FUNCIONARIO` en enum.
- `caja-mayor-movimiento.entity.ts`: `+ vale_id` int nullable.
- `cuentas-por-pagar.handler.ts:307` acepta `funcionarioId`; switch en `:457` extender.

**Entidades nuevas**: `Vale` (estado SOLICITADO/CONFIRMADO/DESCONTADO/ANULADO + esAdelanto + liquidacion_id nullable + movimiento_id nullable + autorizadoPor + comprobante_url), `MotivoVale`.

**Handlers**: `electron/handlers/vales.handler.ts`.

### Fase 4 — Liquidación de Sueldo + IPS + Aguinaldo + Bonos

**Entidades nuevas**: `LiquidacionSueldo`, `LiquidacionItem`, `LiquidacionConcepto`, `Bono`, `Aguinaldo`.

**Modificación**: `caja-mayor-movimiento.entity.ts` `+ liquidacion_sueldo_id`.

**Handlers**: `electron/handlers/liquidacion-sueldo.handler.ts` con:
- `generar-liquidacion-borrador(funcionarioId, periodo)` → query asistencia + penalizaciones + horas extra + vales pendientes + cuotas préstamo + comisión APROBADA → items auto.
- `aprobar-liquidacion(id)` (permiso `RRHH_LIQUIDACION_APROBAR`).
- `pagar-liquidacion(id, cajaMayorId, monedaId, formaPagoId)` transaccional → `EGRESO_SALARIO` + marcar vales DESCONTADO + cuotas PAGADA + comisión INTEGRADA.
- `generar-liquidaciones-mes(periodo)` batch.
- `calcular-aguinaldo(anio)` → 1/12 del total ganado.

### Fase 5 — Vacaciones + Liquidación Final

**Entidades nuevas**: `Vacacion`, `VacacionPeriodo`, `LiquidacionFinal` (motivoEgreso + antiguedadDias/Meses/Anios + salarioPromedioUltimos6Meses + indemnizacionMonto + indemnizacionAplica + vacacionesNoGozadas + montoVacacionesNoGozadas + aguinaldoProporcional + totalLiquidado + estado), `LiquidacionFinalItem`.

**Handlers**: `electron/handlers/vacaciones.handler.ts` (auto-genera al aniversario según escala PY), `electron/handlers/liquidacion-final.handler.ts`.

### Fase 6 — Comisiones (reglas, motor, liquidación, equipos)

**Modificaciones**: `venta.entity.ts` `+ vendedor_id`, `venta-item.entity.ts` `+ vendedor_id`, `caja-mayor-movimiento.entity.ts` `+ liquidacion_comision_id`. Migración 1-vez startup: `UPDATE ventas SET vendedor_id = created_by WHERE vendedor_id IS NULL`.

**Entidades nuevas**: `ReglaComision` (tipo META_UNIDADES/PORCENTAJE_VENTA/META_VENTA_LOCAL/EXTRA_MANUAL/PENALIZACION_MANUAL/EQUIPO_PORCENTAJE), `ReglaComisionProducto`, `ReglaComisionRequisito`, `FuncionarioReglaComision`, `EquipoComision`, `EquipoComisionMiembro`, `EquipoComisionRegla`, `LiquidacionComision`, `LiquidacionComisionItem`.

**Motor de evaluación** (por `FuncionarioReglaComision` activa):
1. Query `VentaItem JOIN Venta` con `venta.estado=CONCLUIDA`, `ventaItem.estado != CANCELADO`, `COALESCE(ventaItem.vendedor_id, venta.vendedor_id) = funcionario.usuario_id`, `producto_id IN reglaProductos`, fecha en periodo.
2. Métricas: unidades, montoProductos, montoVentaTotalLocal.
3. Evaluar requisitos contra Penalizacion+Asistencia.
4. Aplicar `modoValidacion`: TODO_O_NADA / PROPORCIONAL.
5. Calcular monto según tipo (fijo o %).
6. Restar penalizaciones manuales tipo COMISION_DESCUENTO.
7. Para `EQUIPO_PORCENTAJE`: distribuir según `porcentajeReparto`.
8. Snapshot de parámetros en `LiquidacionComisionItem.observacion`.

### Fase 7 — CuentaPorCobrar + Movimientos Cliente

**Modificaciones**: `cliente.entity.ts` `+ saldoActual`. `caja-mayor-enums.ts` `+ INGRESO_COBRO_CLIENTE` y agregar a `esIngreso()`. `caja-mayor-movimiento.entity.ts` `+ cuenta_por_cobrar_cuota_id`.

**Entidades nuevas**: `CuentaPorCobrar`, `CuentaPorCobrarCuota`, `MovimientoCliente`.

### Fase 8 — Dashboard RRHH + Reportes + Exports + Notificaciones

**Entidades nuevas**: `NotificacionRrhh`.

**Librerías a agregar a `package.json`**: `pdfmake`, `exceljs`. Chart.js ya disponible.

**UI**:
- `src/app/pages/rrhh/dashboard/rrhh-dashboard` (REEMPLAZA `rrhhDash` placeholder). KPIs: total nómina mes, % asistencia, vales pendientes, préstamos activos, próximos cumpleaños, vacaciones próximas (30d), top 5 vendedores. Sección Atajos integrando con `dashboard-shortcuts.handler.ts`.
- `src/app/pages/rrhh/notificaciones/list-notificaciones-rrhh` + badge en sidenav.
- `src/app/pages/rrhh/reportes/reportes-rrhh-page` con selector + filtros + export PDF/Excel.

---

## 4. Modelo de datos resumen — 38 entidades nuevas

| # | Entidad | Propósito |
|---|---|---|
| 1 | `Permission` | Catálogo de permisos granulares |
| 2 | `RolePermission` | Asignación N:M Role↔Permission |
| 3 | `ConfiguracionRrhh` | Parámetros configurables (IPS%, vacaciones, salario mínimo) |
| 4 | `Cargo` | Cargo laboral (≠ Role de sistema) |
| 5 | `Funcionario` | Empleado (FK Persona+Cargo+Usuario opcional) |
| 6 | `HistoricoCargo` | Trazabilidad cambios de cargo |
| 7 | `HistoricoSalario` | Trazabilidad cambios salariales |
| 8 | `FuncionarioDocumento` | Metadata documentos (filesystem) |
| 9 | `Turno` | Definición de turnos |
| 10 | `FuncionarioTurno` | Asignación funcionario→turno |
| 11 | `Asistencia` | Fichaje diario |
| 12 | `Penalizacion` | Sanciones (manual o auto) |
| 13 | `Feriado` | Días no laborables con recargo |
| 14 | `HoraExtra` | Horas extra con recargo |
| 15 | `Vale` | Adelanto/préstamo corto |
| 16 | `MotivoVale` | Catálogo motivos |
| 17 | `LiquidacionSueldo` | Cabecera mensual |
| 18 | `LiquidacionItem` | Detalle haberes/descuentos |
| 19 | `LiquidacionConcepto` | Catálogo conceptos |
| 20 | `Bono` | Bonos manuales o recurrentes |
| 21 | `Aguinaldo` | 13° salario |
| 22 | `Vacacion` | Días por año de servicio |
| 23 | `VacacionPeriodo` | Período de goce |
| 24 | `LiquidacionFinal` | Liquidación al egreso |
| 25 | `LiquidacionFinalItem` | Detalle |
| 26 | `ReglaComision` | Definición de regla |
| 27 | `ReglaComisionProducto` | Productos efectivos |
| 28 | `ReglaComisionRequisito` | Requisitos cumplibles |
| 29 | `FuncionarioReglaComision` | Asignación funcionario→regla |
| 30 | `EquipoComision` | Agrupación grupal |
| 31 | `EquipoComisionMiembro` | Miembros con % reparto |
| 32 | `EquipoComisionRegla` | Reglas del equipo |
| 33 | `LiquidacionComision` | Cabecera mensual comisión |
| 34 | `LiquidacionComisionItem` | Detalle por regla |
| 35 | `CuentaPorCobrar` | Crédito pendiente cliente |
| 36 | `CuentaPorCobrarCuota` | Cuota de cobro |
| 37 | `MovimientoCliente` | Histórico cargos/pagos |
| 38 | `NotificacionRrhh` | Notificaciones del módulo |

---

## 5. Gaps regulatorios Paraguay (configurables en `ConfiguracionRrhh`)

| Concepto | Default | Clave config |
|---|---|---|
| IPS aporte funcionario | 9% | `IPS_PORCENTAJE_FUNCIONARIO` |
| IPS aporte patronal | 16.5% | `IPS_PORCENTAJE_PATRONAL` |
| Salario mínimo legal | (PYG) | `SALARIO_MINIMO_LEGAL_PYG` |
| Vacaciones <5 años | 12 hábiles | `DIAS_VACACIONES_HASTA_5A` |
| Vacaciones 5-10 años | 18 hábiles | `DIAS_VACACIONES_5_10A` |
| Vacaciones >10 años | 30 hábiles | `DIAS_VACACIONES_MAS_10A` |
| Aguinaldo | 1/12 anual | hardcoded fórmula |
| Indemnización despido injustif. | 15 jornales/año | `INDEMNIZACION_DIAS_POR_ANIO` |
| Antigüedad mínima indemnización | 90 días | `INDEMNIZACION_ANTIGUEDAD_MIN_DIAS` |
| HE diurna recargo | +50% | `RECARGO_HE_DIURNA` |
| HE nocturna recargo | +100% | `RECARGO_HE_NOCTURNA` |
| HE feriado recargo | +100% | `RECARGO_HE_FERIADO` |
| Tolerancia tardanza | 5 min | `TOLERANCIA_TARDANZA_MIN` |
| Prescripción vacaciones | 24 meses | `PRESCRIPCION_VACACIONES_MESES` |
| Día cierre mes | 30 | `DIA_CIERRE_MES` |

---

## 6. Verificación end-to-end

Setup: 2 funcionarios, 1 cargo, 1 turno, caja mayor abierta con saldo PYG EFECTIVO.

| # | Acción | Validación |
|---|---|---|
| 1 | Seed permisos + asignar a role ADMIN | Permission ≥ 25 |
| 2 | Alta Funcionario A (MOZO, 2.500.000) | HistoricoCargo + HistoricoSalario auto |
| 3 | Subir cédula PDF | Archivo en `userData/funcionario-documentos/{id}/` |
| 4 | Asistencia día 1 PRESENTE, día 2 TARDANZA 15min | Penalizacion auto |
| 5 | Crear Vale 200k SOLICITADO | Saldo CajaMayor sin cambios |
| 6 | Confirmar Vale | Saldo -200k, mov EGRESO_VALE |
| 7 | Préstamo CPP 600k/6 cuotas | 6 cuotas 100k |
| 8 | Pagar cuota 1 | Saldo -100k, mov EGRESO_CUOTA_PRESTAMO |
| 9 | Regla META_UNIDADES PARRILLA 50u=150k | FuncionarioReglaComision activa |
| 10 | 60 ventas vendedor=A producto PARRILLA | Datos para evaluar |
| 11 | Generar liquidación comisión | Item COMISION 150k |
| 12 | Aprobar liquidación comisión | estado APROBADA |
| 13 | Generar liquidación sueldo BORRADOR | Items: SALARIO 2.500k, COMISION 150k, IPS -225k, VALE -200k, PRESTAMO_CUOTA -100k, PENAL -X |
| 14 | Agregar Bono Manual 50k | Item BONO 50k |
| 15 | Aprobar liquidación sueldo | APROBADA |
| 16 | Pagar liquidación | Saldo -neto, EGRESO_SALARIO, vale DESCONTADO, comisión INTEGRADA, recibo PDF |
| 17 | Export Excel "Liquidaciones del mes" | Archivo con formato |
| 18 | Anular liquidación pagada | Contra-mov ANULACION, saldo revertido |
| 19 | Egreso Funcionario A motivo DESPIDO_INJUSTIFICADO | Wizard liquidación final |
| 20 | Pagar liquidación final | EGRESO_SALARIO obs "LIQUIDACION FINAL" |

---

## 7. Riesgos transversales

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Modificar `Persona` rompe Cliente/Usuario/Proveedor | Campos nuevos `nullable`. Smoke test alta Cliente, login, alta Proveedor |
| R2 | `vendedor_id` requiere refactor flujos POS | Migración 1-vez startup `UPDATE ventas SET vendedor_id=created_by`. Default = `getCurrentUser()`. Tocar `ventas.handler.ts` + componente POS |
| R3 | `synchronize:true` puede alterar columnas | Backup obligatorio antes de cada deploy |
| R4 | Filesystem documentos no en backup DB | Tab "Backup completo" futuro empacar `frc-gourmet.db + funcionario-documentos/` |
| R5 | Concurrencia: dos cajeros confirman mismo vale | Estado SOLICITADO→CONFIRMADO con check + transacción atómica |
| R6 | Penalización auto duplicada al regenerar liquidación | Idempotencia: borrar items auto al regenerar BORRADOR; preservar `manual=true` |
| R7 | Liquidación comisión aprobada sin liq. sueldo | Auto-generar BORRADOR de sueldo si no existe |
| R8 | Tipos de cambio multi-moneda | Convertir a `monedaPago` con `MonedaCambio` activo del día gen.; persistir ratio en LiquidacionItem |
| R9 | Regla comisión modificada con período en curso | Snapshot parámetros en `LiquidacionComisionItem.observacion` |
| R10 | Funcionario sin `usuario_id` en regla comisión | Validar `usuario_id IS NOT NULL` al asignar |
| R11 | Performance: asistencia 5+ años | Index en `Asistencia(funcionario_id, fecha)` |
| R12 | UI POS asume `createdBy`=vendedor | Refactor componentes que muestran "Vendedor" → usar `Venta.vendedor` con fallback `createdBy` |

---

## 8. Modificaciones priorizadas a entidades existentes

| Prio | Archivo | Cambio | Bloquea fase |
|---|---|---|---|
| 1 | `persona.entity.ts` | + apellido, email, fechaNacimiento, sexo, estadoCivil | Fase 0 (todas) |
| 2 | `caja-mayor-movimiento.entity.ts` | + valeId, liquidacionSueldoId, liquidacionComisionId, cuentaPorCobrarCuotaId | Fase 3, 4, 6, 7 |
| 3 | `cuenta-por-pagar.entity.ts` | + funcionario_id; nuevo enum PRESTAMO_FUNCIONARIO | Fase 3 |
| 4 | `caja-mayor-enums.ts` | + INGRESO_COBRO_CLIENTE; agregar a esIngreso() | Fase 7 |
| 5 | `cliente.entity.ts` | + saldoActual | Fase 7 |
| 6 | `venta.entity.ts` | + vendedor_id FK Usuario nullable | Fase 6 |
| 7 | `venta-item.entity.ts` | + vendedor_id FK Usuario nullable | Fase 6 |
| 8 | `cuentas-por-pagar.handler.ts:307,457` | aceptar funcionarioId; switch para PRESTAMO_FUNCIONARIO | Fase 3 |
| 9 | `ventas.handler.ts` | aceptar vendedorId default getCurrentUser().id | Fase 6 |
| 10 | `app.component.ts` + html | nuevos `openXxxTab()` agrupados sidenav RRHH y Comisiones | Cada fase |
| 11 | `database.config.ts` | registrar 38 entidades | Cada fase |
| 12 | `preload.ts` + `repository.service.ts` | interfaces + métodos Observable | Cada fase |
| 13 | `main.ts` | `registerXxxHandlers(...)` por handler | Cada fase |
| 14 | `image-handler.utils.ts` o nuevo `document-handler.utils.ts` | saveDocumento/deleteDocumento | Fase 1 |
| 15 | `package.json` | + pdfmake, exceljs | Fase 8 |
| 16 | `src/app/pages/personas/rrhhDash/` | reemplazar placeholder por nuevo `RrhhDashboardComponent` | Fase 8 |

---

## 9. Orden de ejecución

1. **Backup DB de prod** (obligatorio, `frc-gourmet.db` en `userData`).
2. Branch `feature/rrhh-fase-0` → modificar Persona, agregar Permission/RolePermission/ConfiguracionRrhh, registrar en `database.config.ts`, handler+preload+repo. Seed permisos + valores PY. Smoke test (alta cliente, login). Merge.
3. Iterar Fases 1→8. Cada fase mergeable independiente, respetando orden de bloqueos.
4. Antes de Fase 6: correr migración 1-vez `UPDATE ventas SET vendedor_id = created_by`.
5. Tras Fase 8: deprecar `RrhhDashComponent` (placeholder), apuntar `openRrhhDashTab()` al nuevo.
6. Cada merge a main: smoke test E2E de la fase + verificar que el resto de la app siga funcionando.
