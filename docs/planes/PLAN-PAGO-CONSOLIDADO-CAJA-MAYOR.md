# Plan: componente de pago genérico (pago consolidado) en Caja Mayor

Estado: **v2 — auditado por 2 agentes, correcciones aplicadas**. Listo para implementar.
Fecha: 2026-08-19.
Referencia externa: `frc-comercial/desktop` módulo `caja-virtual` + `frc-comercial/central`
`PagoProveedorService`. Se copia el diseño probado y se adapta al modelo de gourmet.

---

## 1. Problema

Hoy el pago de una obligación está disperso en 6 diálogos, cada uno con su propia
copia del bloque "elegir fuente / caja / moneda / forma de pago" y su propio
asiento contable:

| Flujo | Dónde se paga hoy | Multi-forma | Multi-ítem |
|---|---|---|---|
| Cuota CPP (compra) | `pagar-compras-dialog` (lote) | no (1 moneda + 1 forma para todo el lote) | sí |
| Cuota CPP (una) | `pago-mixto-cuota-dialog` | sí | no |
| Gasto | dentro del alta (`create-edit-gasto`) | sí, vía `GastoDetalle[]` | no |
| Vale | dentro del alta (`create-edit-vale`, `modoConfirmar`) | no | no |
| Liquidación de sueldo | pantalla propia de RRHH | no | no |
| Compra simplificada | dentro del alta | no (o abre el mixto) | no |

Consecuencias medidas en el código:

- El asiento "si CAJA_MAYOR {mov + saldo} else {debitar banco + mov bancario}" está
  escrito 4 veces (`create-gasto`, `crear-vale-confirmado`, `pagar-liquidacion-sueldo`,
  `aplicarPagoCpoCuota`).
- `cuentas-por-pagar.handler.ts:26-81` reimplementa `actualizarSaldoCajaMayor`
  **sin el lock pesimista de Postgres** que el helper canónico sí tiene
  (`caja-mayor-utils.ts:31-37`, fix "M-02"). Es un lost-update latente en modo server.
- La regla "por Caja Mayor sólo sale EFECTIVO" está repetida como
  `nombre.includes('EFECTIVO')` en 3 componentes, no centralizada.
- No se puede pagar 3 gastos con un solo egreso: son 3 movimientos sueltos.

## 2. Qué se construye

Un componente único de pago que:

1. lista las obligaciones **pendientes** de un concepto,
2. permite seleccionar varias (una sola en salarios),
3. cobra con **N líneas** de pago (multi-moneda × multi-forma × Caja Mayor/banco),
4. postea **un movimiento consolidado por grupo físico** y deja el desglose
   consultable,
5. permite crear la obligación (gasto / vale / compra simplificada) sin salir del
   componente,
6. se puede **anular entero**, revirtiendo movimientos y reabriendo las deudas.

### Decisiones cerradas con el usuario

- **Conceptos v1:** cuotas CPP de compra, gastos, vales, liquidación de sueldo.
- **Fuentes:** `CAJA_MAYOR` y `CUENTA_BANCARIA`. **Cheque queda fuera** (sigue por
  `emitir-cheque`).
- **Anulación:** entra en la v1.
- **Cajón del PdV (`EgresoCaja`): no se toca.** Es efectivo de la caja de venta y se
  rinde en su cierre; unificarlo cambiaría la operación del cajero.

### Decisiones de diseño (tomadas, no consultadas)

- **Un pago = un concepto.** No se mezclan gastos con vales en el mismo evento. Es
  lo que hace la referencia (`modo` del wizard) y evita inventar un
  `TipoMovimiento` genérico: el movimiento consolidado conserva el tipo real del
  concepto (`EGRESO_GASTO`, `EGRESO_VALE`, `EGRESO_SALARIO`, `EGRESO_CUOTA_COMPRA`),
  así los reportes por tipo siguen cuadrando.
- **Una sola moneda de deuda por evento** (y en compras, un solo proveedor). Es la
  restricción de la referencia y lo que hace que "total a pagar" sea un número.
- **El reparto entre ítems lo hace el backend**, no el renderer (la referencia lo
  hace en el frontend). El cliente manda ítems + líneas; el handler reparte FIFO,
  valida y asienta. Motivo: el backend es la única frontera real (`/api/rpc` es
  default-allow) y así el mobile puede reusar el mismo canal sin re-implementar la
  matemática.
- **Los handlers viejos no se borran.** El mobile PWA los consume por `/api/rpc`
  (pago mixto de cuota, pago de cuota, etc.). Se retira **la UI de desktop**, no la API.

## 3. Modelo de datos

Dos entidades nuevas, calcadas del precedente `CobroConsolidado` /
`CobroConsolidadoDetalle` que ya existe del lado CPC.

### `PagoConsolidado` — tabla `pagos_consolidados`

```ts
{
  fecha: Date
  concepto: PagoConcepto            // COMPRA | GASTO | VALE | LIQUIDACION_SUELDO
  descripcion: string               // "PAGO CONSOLIDADO DE 3 GASTOS" (compuesta al crear)
  monedaDeuda: Moneda               // moneda común de los ítems
  montoTotal: decimal(18,2)         // en monedaDeuda
  cantidadItems: int
  responsable?: Usuario
  observacion?: string
  estado: PagoConsolidadoEstado     // ACTIVO | ANULADO
  motivoAnulacion?: string
  fechaAnulacion?: Date
}
```

### `PagoConsolidadoDetalle` — tabla `pagos_consolidados_detalles`

Una fila por **(ítem × línea de pago)** — producto cartesiano, igual que
`PagoSolicitudDetalle` en la referencia. Es lo que permite reconstruir a la vez
"cuánto recibió cada ítem" y "de dónde salió cada guaraní".

```ts
{
  pagoConsolidadoId: int
  // --- ítem pagado ---
  origenTipo: PagoOrigenTipo        // CPP_CUOTA | GASTO | VALE | LIQUIDACION_SUELDO
  origenId: int
  origenDescripcion: string         // snapshot legible ("GASTO #12 (ALQUILER)")
  origenBeneficiario?: string       // snapshot (proveedor / funcionario)
  // --- línea de pago ---
  fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA'
  moneda: Moneda                    // moneda de la línea (puede != monedaDeuda)
  formaPago?: FormasPago            // null si banco
  cajaMayorId?: int
  cuentaBancariaId?: int
  montoOrigen: decimal(18,2)        // en la moneda de la línea
  cotizacion: decimal(18,6)         // moneda línea -> monedaDeuda (1 si iguales)
  montoImputado: decimal(18,2)      // montoOrigen * cotizacion, en monedaDeuda
  cajaMayorMovimientoId?: int       // movimiento consolidado que cubre esta línea
  anulado: boolean default false
}
```

`montoOrigen` de una línea se **parte** entre varios ítems cuando la línea cubre a
más de uno; la suma de `montoOrigen` de las filas de una misma línea física es el
monto de esa línea. La suma de `montoImputado` por `origenId` es lo que se aplica a
esa deuda.

### Columna nueva en `cajas_mayor_movimientos`

```
pago_consolidado_id  int NULL
```

Ancla el movimiento consolidado al evento. Sirve para: componer la observación
legible, ofrecer "ver detalle", y **bloquear** la anulación individual desde Caja
Mayor (debe anularse el evento entero).

### Migración

Una sola, driver-aware, aditiva, con `IF NOT EXISTS`, timestamp real
(`date +%s%3N`): crea las 2 tablas + `ALTER TABLE cajas_mayor_movimientos ADD COLUMN`.
Sin `DROP`/`RENAME`. Todas las columnas con `type` explícito (pitfall del PR #234:
SQLite tolera `@Column({nullable:true})` sobre `string | null`, Postgres lo rechaza
al validar entidades).

## 4. Backend

### 4.1 Util puro compartido — `src/app/shared/utils/pago-consolidado.util.ts`

Re-exportado desde `electron/utils/pago-consolidado.util.ts` (patrón
`monto-letras.util.ts` / `dashboard-rangos.util.ts`). Sin dependencias de TypeORM,
testeable sin BD:

- `decimalesDeMoneda(m)` / `redondear(v, decimales)`
- `toleranciaDe(decimales)` → `0.005` con decimales, `0.5` en guaraníes
- `convertirLinea(montoOrigen, cotizacion, decimales)` → `montoImputado`
- `repartirFifo(items, lineas)` → filas `(itemIdx, lineaIdx, montoOrigen, montoImputado)`
  con **true-up**: el residuo de redondeo de cada ítem se absorbe en su última fila,
  para que un ítem no quede en `PARCIAL` por un centavo.
- `validarSeleccion({ concepto, items })` → errores de negocio: moneda única,
  proveedor único en compras, un solo ítem si `LIQUIDACION_SUELDO`, sin ítems
  bloqueados, monto ≤ saldo cuando el concepto no admite parcial.

### 4.2 Adaptadores por concepto — `electron/handlers/pago-consolidado-adapters.ts`

Un objeto por concepto con 4 funciones. Ninguna crea movimientos de caja: sólo
mueven **estado de dominio**. Así el asiento queda en un único lugar.

| Concepto | pendientes | aplicar | revertir | parcial | tipoMovimiento |
|---|---|---|---|---|---|
| `COMPRA` | cuotas `PENDIENTE/PARCIAL` de CPP `ACTIVO` tipo `COMPRA` | `aplicarEstadoPagoCuota` (ya existe) | `revertirEstadoPagoCuota` (ya existe) | **sí** | `EGRESO_CUOTA_COMPRA` |
| `GASTO` | `Gasto.estado = PENDIENTE` | `PENDIENTE → PAGADO` | `PAGADO → PENDIENTE` | no | `EGRESO_GASTO` |
| `VALE` | `Vale.estado = SOLICITADO` | `SOLICITADO → CONFIRMADO` | `CONFIRMADO → SOLICITADO` | no | `EGRESO_VALE` |
| `LIQUIDACION_SUELDO` | `LiquidacionSueldo.estado = APROBADA` | `aplicarEstadoPagoLiquidacion` (**a extraer**) | `revertirEstadoPagoLiquidacion` (**a extraer**) | no | `EGRESO_SALARIO` |

**Extracción crítica (liquidación).** `pagar-liquidacion-sueldo`
(`liquidacion-sueldo.handler.ts:601-831`) no es un pago simple: en la misma
transacción salda vales (`→DESCONTADO`), cuotas CPP de préstamo, cuotas CPC de
consumo (bajando `Cliente.saldoActual` y creando `MovimientoCliente`), aguinaldos,
comisiones y venta de vacaciones — todo **neteado dentro del `EGRESO_SALARIO`**.
No se reimplementa: se extrae ese bloque a `aplicarEstadoPagoLiquidacion(qr, liqId,
user, ds)` (todo menos el asiento de caja) y el handler viejo pasa a llamarlo. Ídem
`anular-liquidacion-sueldo` (833-1062) → `revertirEstadoPagoLiquidacion`. El handler
viejo sigue existiendo y funcionando igual (lo usa el mobile).

### 4.3 Handler nuevo — `electron/handlers/pago-consolidado.handler.ts`

**`get-obligaciones-pendientes(concepto, filtros?)`** (lectura, sin permiso).
Devuelve filas normalizadas: `{ origenTipo, origenId, numero, descripcion,
beneficiario, beneficiarioId, monedaId, monedaSimbolo, decimales, saldoPendiente,
permiteParcial, bloqueado?, bloqueoMotivo? }`. Bloqueadas: sin moneda, saldo ≤ 0.

**`registrar-pago-consolidado(payload)`** — el núcleo. Permiso **por concepto**:

| concepto | `ensurePermission` |
|---|---|
| COMPRA | `COMPRAS_GESTIONAR` |
| GASTO | `CAJA_MAYOR_OPERAR` |
| VALE | `RRHH_VALE_CONFIRMAR` |
| LIQUIDACION_SUELDO | `RRHH_LIQUIDACION_PAGAR` |

```
payload = {
  concepto,
  items:  [{ origenTipo, origenId, monto }],       // monto en monedaDeuda
  lineas: [{ fuente, monedaId, formaPagoId?, cajaMayorId?, cuentaBancariaId?,
             monto, cotizacion? }],
  observacion?
}
```

Todo en **una sola transacción** (`QueryRunner`), en este orden:

1. **Validar** con el util puro (moneda única, proveedor único, 1 salario, parcial
   permitido, ítems no bloqueados). Releer cada ítem de la BD y verificar que sigue
   pendiente y que `monto ≤ saldoPendiente + tolerancia` — **nunca confiar en el
   saldo que mandó el cliente**.
2. **Resolver cotizaciones** faltantes con `getCotizacionCompraLocal`; si falta,
   error explícito (no asumir 1).
3. Validar que `Σ montoImputado` de las líneas iguala `Σ monto` de los ítems dentro
   de la tolerancia de la moneda.
4. Crear `PagoConsolidado`.
5. **Agrupar líneas** por `(fuente, cajaMayorId|cuentaBancariaId, monedaId, formaPagoId)`
   y por cada grupo postear **un** asiento:
   - `CAJA_MAYOR`: un `CajaMayorMovimiento` con el `tipoMovimiento` del concepto,
     `pagoConsolidadoId` seteado, observación compuesta; luego
     **`actualizarSaldoCajaMayor`** — el helper canónico de `caja-mayor-utils.ts`,
     con lock. No se usan las copias locales de `cuentas-por-pagar.handler.ts`.
   - `CUENTA_BANCARIA`: debitar `CuentaBancaria.saldo` + `registrarMovimientoBancario`
     (`SALIDA_MANUAL`).
6. **Repartir FIFO** y crear las filas de `PagoConsolidadoDetalle`, cada una
   apuntando al movimiento de su grupo.
7. Por cada ítem, llamar al `aplicar` de su adaptador con la suma imputada.
8. Confirmar saldos negativos: el frontend ya pregunta; el backend **no** bloquea
   (la caja puede quedar en rojo a propósito), igual que hoy.

**`get-pago-consolidado-detalle(pagoId)`** → cabecera + ítems agrupados
(`origenTipo`, `origenId`, descripción, beneficiario, `montoImputado`, estado actual
del ítem releído) + líneas de pago con su conversión. Es lo que alimenta el diálogo
de detalle.

**`anular-pago-consolidado(pagoId, motivo)`** — mismo permiso por concepto. En una
transacción:

1. Rechazar si ya está `ANULADO`.
2. Por cada `cajaMayorMovimientoId` **distinto** (un `Set`: un movimiento cubre
   varias filas de detalle) crear el contra-movimiento `ANULACION` con
   `referenciaAnulacion` y revertir el saldo con el tipo contrario
   (`AJUSTE_POSITIVO`), igual que `anular-caja-mayor-movimiento`.
3. Por cada cuenta bancaria tocada, acreditar y registrar `ENTRADA_MANUAL`.
4. Por cada ítem, `revertir` del adaptador con su `Σ montoImputado`.
5. Marcar detalles `anulado = true` y el evento `ANULADO`.

### 4.4 Bloqueos que hay que agregar

Sin esto se puede revertir dos veces la misma plata:

- `anular-caja-mayor-movimiento`: si `pagoConsolidadoId != null` → error
  "Anular desde el pago consolidado #N".
- `anular-vale`: si el vale fue confirmado por un pago consolidado (existe detalle
  activo `origenTipo=VALE, origenId=vale.id`) → bloquear con el mismo mensaje.
- `anular-gasto`: ídem.
- `anular-liquidacion-sueldo`: ídem.

### 4.5 Deuda técnica que se salda de paso

`descontarSaldoCajaMayor` / `sumarSaldoCajaMayor` (`cuentas-por-pagar.handler.ts:26-81`)
se reemplazan por `actualizarSaldoCajaMayor` de `caja-mayor-utils.ts`, que sí toma
`SELECT … FOR UPDATE` en Postgres. Es un cambio de 3 llamadas y elimina un
lost-update latente en modo server. Se hace en la misma fase que el handler nuevo.

## 5. Frontend

### 5.1 `pagar-obligaciones-dialog` (nuevo)

`src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/`. `mat-stepper` de
3 pasos, parametrizado por `data.concepto` y opcional `data.origenIdsPreseleccionados`.

**Paso 1 — Seleccionar.** Tabla con checkbox, filtro por beneficiario, "marcar
todo", columna "Monto a pagar" editable **sólo si el concepto admite parcial**.
Al tildar el primer ítem se fija la moneda de deuda (y el proveedor en compras) y
se deshabilitan los que no coinciden. En `LIQUIDACION_SUELDO`, tildar uno destilda
el resto. Botón `+ Nuevo gasto` / `+ Nuevo vale` / `+ Nueva compra` que abre el alta
existente (ya sin pago) y recarga la lista. Avanza si hay selección.

**Paso 2 — Formas de pago.** Línea borrador (fuente → caja/cuenta → moneda → forma
→ monto) + `Agregar`; lista de líneas con edición/borrado. Si la moneda de la línea
≠ moneda de deuda aparece el campo cotización, precargado con
`getCotizacionCompraLocal` y editable. Barra fija con `TOTAL A PAGAR` vs
`TOTAL FORMAS DE PAGO` y un check verde cuando cuadran dentro de la tolerancia.
Avanza sólo si cuadra.

**Paso 3 — Revisar y confirmar.** Beneficiario, ítems con su monto, líneas con su
conversión, total. `Confirmar pago` → `registrar-pago-consolidado`. Antes de
confirmar, `confirmarSaldosNegativos` (el helper compartido que ya existe).

Convenciones: sin llamadas a función ni getters en el template (todo precomputado
en `recalcular()`), montos con `| number:'1.0-2'`, colores por variables de tema,
acciones por fila en `mat-menu`, confirmaciones con `ConfirmationDialogComponent`,
strings a BD en UPPERCASE.

### 5.2 `detalle-pago-consolidado-dialog` (nuevo)

Qué ítems recibieron el pago (N°, tipo, descripción, beneficiario, imputado, estado
actual) y con qué líneas se pagó. Se abre desde la tabla de movimientos de
`caja-mayor-detalle` (columna "detalle", ya existe) cuando el movimiento tiene
`pagoConsolidadoId`. Botón `Anular pago` gated por permiso.

### 5.3 `registrar-egreso-dialog` — tarjetas

| Antes | Después |
|---|---|
| Pagar Compras → `pagar-compras-dialog` | **Pagar compras** → genérico (`COMPRA`) |
| Compra Simplificada → alta con pago | **Compra simplificada** → alta **sin** pago |
| Gasto → alta con pago | **Gasto** → alta **sin** pago (nace `PENDIENTE`) |
| Registrar Vale → alta + confirmación | **Registrar vale** → alta (`SOLICITADO`), sin pago |
| — | **Pagar gastos** → genérico (`GASTO`) *(nueva)* |
| — | **Pagar vales** → genérico (`VALE`) *(nueva)* |
| — | **Pagar salarios** → genérico (`LIQUIDACION_SUELDO`) *(nueva)* |
| Operación Financiera / Emitir Cheque / Ajuste | sin cambios |

### 5.4 Pagos inline que se retiran (UI desktop)

- `crear-compra-simplificada-dialog`: fuera `pagarAhora` y `pagoMixto`. La compra
  siempre queda con su CPP pendiente. Se mantiene `credito` (define las cuotas).
- `create-edit-gasto-dialog`: fuera fuente/caja/forma/cuenta. `create-gasto` recibe
  `estado: PENDIENTE` y **no** asienta nada. El camino
  `destinoTipo = CUENTA_BANCARIA` también pasa a diferido.
- `create-edit-vale-dialog`: fuera `modoConfirmar`. Queda sólo el alta `SOLICITADO`.
- `pagar-compras-dialog`: se elimina el componente; su entrada apunta al genérico.
  (`pago-mixto-cuota-dialog` **se mantiene**: lo usan el detalle de CPP y el cajón
  del PdV.)
- Pantalla de liquidación de sueldo (RRHH): el botón `Pagar` abre el genérico en
  modo `LIQUIDACION_SUELDO` con esa liquidación preseleccionada.

**Los handlers viejos siguen registrados** — `crear-vale-confirmado`,
`pagar-cuotas-compras-lote`, `pagar-cpp-cuota-mixto`, `pagar-liquidacion-sueldo`,
`create-gasto` con pago — porque el mobile PWA los consume por `/api/rpc`.

### 5.5 Capas IPC

`preload.ts` + `repository.service.ts` (abstracta) + `repository-ipc.service.ts` +
`repository-http.service.ts`: 4 métodos nuevos. Entidades registradas en
`database.config.ts` (`getEntitiesList`) y migración en `getMigrations()`.

## 6. Tests

**`npm run test:pago-consolidado`** — util puro, sin BD:
reparto FIFO 1→N y N→1 · true-up de redondeo (ningún ítem queda `PARCIAL` por
centavos) · tolerancia guaraní (0.5) vs moneda con decimales (0.005) · conversión
multi-moneda · rechazo de moneda mezclada · rechazo de proveedor mezclado ·
rechazo de 2 liquidaciones · rechazo de parcial donde no se admite · sobrepago.

**`npm run test:pago-consolidado-flujo`** — SQLite temporal, extremo a extremo:
1. Sembrar caja mayor, monedas, formas de pago, cuenta bancaria, gasto `PENDIENTE`,
   vale `SOLICITADO`, cuota CPP.
2. Pagar 2 gastos con 2 líneas (PYG efectivo + USD efectivo con cotización) →
   verificar: 2 movimientos consolidados (uno por moneda), saldos por
   `(moneda, formaPago)`, gastos en `PAGADO`, filas de detalle = 2 ítems × 2 líneas.
3. Pagar una cuota CPP en parcial → `PARCIAL`, `montoPagado` correcto.
4. Anular el pago de gastos → contra-movimientos, saldos restituidos al valor
   exacto previo, gastos de vuelta en `PENDIENTE`, detalles `anulado`.
5. Verificar que `anular-caja-mayor-movimiento` **rechaza** el movimiento
   consolidado y que `anular-gasto` rechaza un gasto pagado por el evento.

Y la batería completa del repo (`test:*`) + `npm run check` (AOT) antes del PR.

## 7. Fases

| # | Contenido | Cierra con |
|---|---|---|
| **F1** | Entidades + enums + migración driver-aware + registro en `database.config.ts` | commit + push |
| **F2** | Util puro `pago-consolidado.util.ts` (+ re-export) + `test:pago-consolidado` | commit + push |
| **F3** | Extracción de `aplicarEstadoPagoLiquidacion` / `revertirEstadoPagoLiquidacion`; unificación de `descontarSaldoCajaMayor` → `actualizarSaldoCajaMayor` | commit + push |
| **F4** | Adaptadores + `pago-consolidado.handler.ts` (4 canales) + preload + repository (3 impls) | commit + push |
| **F5** | Bloqueos de anulación cruzada (movimiento, vale, gasto, liquidación) + observación compuesta y "ver detalle" en la tabla de movimientos | commit + push |
| **F6** | `pagar-obligaciones-dialog` + `detalle-pago-consolidado-dialog` + tarjetas de `registrar-egreso-dialog` | commit + push |
| **F7** | Retiro de los pagos inline (compra simplificada, gasto, vale, `pagar-compras-dialog`, botón de liquidación) | commit + push |
| **F8** | `test:pago-consolidado-flujo`, batería completa, AOT, auditoría por agentes, manual de pruebas + docs + skill + backlog, PR a `develop` | PR + CI verde |

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| La extracción del netting de liquidación rompe el pago de sueldos (toca vales, CPP, CPC, aguinaldo, comisiones, vacaciones) | Extracción **sin cambios de comportamiento**: el handler viejo pasa a llamar a la función extraída y sus tests actuales deben seguir pasando tal cual |
| Doble reversa (anular el movimiento por un lado y el evento por otro) | Bloqueos de 4.4 + test que los verifica |
| Gastos que hoy nacen `PAGADO` pasan a requerir un segundo paso | Es lo pedido; el botón `+ Nuevo gasto` dentro del componente lo deja como un flujo continuo. Los gastos ya existentes no se migran |
| Postgres rechaza algo que SQLite tolera (PR #234) | `type` explícito en toda columna nueva; el job *Migration run (Postgres)* del CI es el gate real |
| Concurrencia sobre el saldo en modo server | Se usa el helper con lock; se elimina la copia sin lock |
| El mobile PWA depende de handlers que se retiran de la UI | No se borra ningún canal; sólo se retira UI de desktop |

---

# v2 — Correcciones de la auditoría

Dos agentes auditaron la v1: uno convenciones/alcance, otro correctitud. Verifiqué
cada hallazgo contra el código antes de aceptarlo. Lo que sigue **reemplaza** lo que
contradiga de las secciones anteriores.

## C1 [ALTA] `create-gasto` es un canal compartido: el mobile se rompía en silencio

`projects/mobile/src/app/pages/financiero/caja-mayor/ops/gasto-form.page.ts:355-378`
manda `detalles[]` con `formaPagoId` de EFECTIVO y `cajaMayor`, esperando que el
egreso se asiente al instante. La PWA **no tiene** pantalla de pago diferido. Si
`create-gasto` pasara a dejar todo en `PENDIENTE`, el mobile mostraría "Gasto
registrado" sin descontar un guaraní.

**Corrección — `create-gasto` decide por el payload, no por una constante:**

- payload **con** datos de pago (`detalles[]` con `formaPagoId`, o `cuentaBancaria`)
  → comportamiento actual intacto: `PAGADO` + asiento. Es lo que manda el mobile.
- payload **sin** datos de pago (nuevo flag explícito `diferido: true` desde el
  diálogo de desktop) → `PENDIENTE`, sin asiento.

El desktop deja de mandar los datos de pago; el mobile no se toca. Retirar la UI de
pago del desktop **no** implica cambiarle el contrato al handler.

## C2 [ALTA] Un quinto lugar con el asiento duplicado: `confirmar-vale`

`electron/handlers/vales.handler.ts:254-352`, invocado desde la acción "Confirmar"
de la fila en `src/app/pages/rrhh/vales/list-vales.component.ts:198` **y** desde
`projects/mobile/src/app/pages/rrhh/vales/vales-list.page.ts:203-208`. La §1 contaba
4 copias del asiento; son 5.

**Corrección:** se retira la acción "Confirmar" de la lista de vales **de desktop**
(el pago pasa por Caja Mayor). El handler `confirmar-vale` y el camino del mobile
quedan intactos. Se agrega a F7.

## C3 [ALTA] Gastos pendientes inflarían el reporte de Finanzas

`electron/handlers/reportes-finanzas.helper.ts:66-72` (`gastosRango`) y `149-156`
(`gastosPorCategoria`) suman por `g.estado != 'CANCELADO'`, no por movimiento de
caja. Hoy da igual porque todo gasto nace `PAGADO`; con gastos `PENDIENTE` el
reporte de cierre de mes mostraría gasto que nunca salió de la caja, rompiendo la
reconciliación con el flujo de caja (que sí es movimiento-based).

**Corrección:** ambas consultas excluyen `PENDIENTE`. **No** se toca `PROGRAMADO`,
que ya se cuenta hoy — esa rareza es preexistente y se anota en `known-bugs.md`,
no se arregla acá. Va en F7, junto con el retiro del pago inline de gastos.

## C4 [ALTA] La extracción del netting de liquidación NO es "todo menos el asiento"

`liquidacion-sueldo.handler.ts:640` (`liq.cuentaBancariaId = cuentaBancariaId`) y
`:818` (`if (movId) liq.movimientoId = movId`) guardan en la liquidación el id del
asiento recién creado, y `anular-liquidacion-sueldo:1000-1045` **revierte leyendo
esos campos**. Es decir: `LiquidacionSueldo` asume **un solo** movimiento de caja,
lo que choca de frente con un pago de N líneas.

**Corrección — el corte exacto:**

| Líneas | Queda en | Nota |
|---|---|---|
| 601-665 | cada caller | asiento de caja/banco + `liq.cuentaBancariaId` |
| **666-814** | **`aplicarEstadoPagoLiquidacion(qr, liqId, user, ds)`** | el netting puro: vales, cuotas CPP, cuotas CPC + `Cliente.saldoActual` + `MovimientoCliente`, aguinaldos, comisiones, venta de vacaciones. **Verificado: no toca caja.** |
| 816-822 | cada caller | `estado = PAGADA`, `fechaPago`, `movimientoId` |
| 852-998 | **`revertirEstadoPagoLiquidacion(...)`** | reversa del netting |
| 1000-1045 | **se queda donde está** | reversa de caja/banco vía `liq.movimientoId`; moverla rompería la anulación de las liquidaciones que NO se pagaron por el evento consolidado |

Cuando la liquidación se paga por pago consolidado, `liq.movimientoId` y
`liq.cuentaBancariaId` quedan **`null` a propósito**: la reversa es responsabilidad
de `anular-pago-consolidado`, y `anular-liquidacion-sueldo` queda bloqueado (§4.4).
Sin esto, una liquidación pagada con 2 líneas dejaría 1 movimiento sin revertir.

## C5 [ALTA] Sin lock sobre los ítems: doble egreso posible

`grep -rl "pessimistic_write" electron/` devuelve **un solo** archivo,
`caja-mayor-utils.ts`. El lock protege el saldo agregado, no impide que dos requests
concurrentes lean el mismo gasto/vale/cuota en estado pendiente y ambos lo paguen.
La referencia en frc-comercial usa `lockById` pesimista por fila justamente por esto.

**Corrección:** al releer cada ítem en el paso 1 del handler, tomarlo con
`lock: { mode: 'pessimistic_write' }` en Postgres (y confiar en la transacción
serializada de SQLite en dev), dentro de la misma transacción, **antes** de validar
el saldo. Se cubre con un test de doble pago concurrente.

## C6 [ALTA] `anular-vale` puede marcar ANULADO sin revertir un guaraní

`vales.handler.ts:354-436` revierte condicionado a `vale.movimientoId` /
`vale.cuentaBancariaId`, campos que **sólo** setea `crear-vale-confirmado`. Un vale
pagado por el evento consolidado los tiene en `null` → los dos `if` no entran → el
vale queda `ANULADO` y la plata nunca vuelve.

**Corrección:** el bloqueo por detalle activo (`origenTipo=VALE, origenId=vale.id`)
va como **primera sentencia** del `try`, antes de cualquier otra validación. Mismo
criterio en `anular-gasto` y `anular-liquidacion-sueldo`. Y en
`anular-caja-mayor-movimiento`, el chequeo de `pagoConsolidadoId` va **antes** de la
rama `valeId` (que hoy revierte directo en vez de bloquear).

## C7 [ALTA] Falta cubrir el caso mixto de anulación de cuota CPP

`anular-pago-mixto-cuota` (`cuentas-por-pagar.handler.ts:896`) revierte por cuota
leyendo `PagoCuotaCppDetalle`. Como `PagoConsolidadoDetalle` es otra tabla, cada
mecanismo revierte sólo lo suyo y **no hay doble reversa**. Pero una cuota pagada
50% por `pago-mixto-cuota-dialog` y 50% por el componente nuevo es posible (COMPRA
admite parcial).

**Corrección:** no hace falta código nuevo, pero **sí un test** que verifique que,
tras anular uno de los dos pagos, la cuota y el CPP quedan consistentes (estado y
`montoPagado`) y el otro pago sigue en pie. Va a §6.

## C8 [MEDIA] La cotización sólo existe en un sentido

`create-edit-moneda-cambio-dialog.component.ts:122-127` sólo genera filas
**extranjera → PYG**. `getCotizacionCompraLocal(linea, deuda)` funciona para pagar
una deuda en PYG con USD, pero **falla con error duro** al pagar una deuda en USD
con una línea en PYG. No es un cálculo incorrecto — es un "Falta la cotización" —
pero deja un caso legítimo sin camino.

**Corrección:** `getCotizacionCompraLocal` obtiene un fallback: si no existe la fila
directa, busca la inversa y devuelve `1 / tasa`. Se implementa en un helper nuevo
`getCotizacionBidireccional` en `electron/utils/moneda.utils.ts` (no se cambia la
función existente, para no alterar a sus consumidores actuales), y el pago
consolidado usa ese. Con test de ida y vuelta.

> Aparte, no se toca: `financiero.handler.ts:1006,1025` usa la convención **inversa**
> (origen=principal). Hay dos convenciones conviviendo en el repo. Se anota en
> `known-bugs.md`; arreglarlo no es de este PR.

## C9 [MEDIA] Falta `movimientoBancarioId` en el detalle

`registrarMovimientoBancario` (`electron/utils/movimiento-bancario.utils.ts:52`)
devuelve el movimiento con su `id`, así que el dato está disponible. Sin guardarlo,
la reversa bancaria sólo puede reconstruirse sumando montos por `cuentaBancariaId`
— funciona, pero es menos auditable que el lado caja mayor.

**Corrección:** `PagoConsolidadoDetalle` suma la columna `movimiento_bancario_id`.

## C10 [MEDIA] Ambigüedad entre `item.monto` y el reparto FIFO

La v1 validaba que `Σ montoImputado ≈ Σ item.monto` **dentro de tolerancia**, sin
decir dónde cae el residuo. En manejo de plata eso deja un ítem pagado de más o en
`PARCIAL` por un centavo.

**Corrección, sin ambigüedad:**

1. El reparto FIFO tiene como target **exacto** `Σ item.monto` (no un rango).
2. La tolerancia se usa **sólo** para aceptar/rechazar el evento antes de repartir;
   una vez aceptado, el residuo se absorbe en la **última fila de la última línea**,
   de modo que `Σ montoImputado == Σ item.monto` exactamente.
3. El `aplicar` de cada adaptador recibe **la suma imputada del reparto**, nunca el
   `monto` del payload. Así las dos cifras coinciden por construcción.

## C11 [MEDIA] ¿De dónde salen moneda y monto de un gasto que nace PENDIENTE?

Hoy `Gasto.moneda` se deriva de `detalles[0].monedaId` (`caja-mayor.handler.ts:1223`)
y `Gasto.monto` es la suma **cruda** de los detalles, sin convertir (línea 1214) —
o sea que ya hoy suma monedas distintas como iguales si el usuario carga detalles
mixtos. Los `GastoDetalle` son "cómo se pagó": un gasto pendiente no tiene ninguno.

**Corrección:** el alta diferida manda `monedaId` + `monto` **directos**, no
derivados de `detalles[]`. `destinoTipo` no se setea (queda en su default) porque la
fuente se decide recién al pagar. La rama con pago (mobile) no cambia.

> El bug de sumar monedas distintas en `Gasto.monto` es **preexistente** y queda
> anotado en `known-bugs.md`; no se arregla en este PR.

## C12 [MEDIA] `ADD COLUMN … IF NOT EXISTS` no es válido en SQLite

La migración más reciente (`1786804287491-MusicaPreferenciaEstilo.ts:30-35`) lo dice
en su propio comentario y usa `queryRunner.getTable(tabla)` + buscar la columna antes
del `ALTER TABLE ADD COLUMN`.

**Corrección:** las 2 tablas nuevas con `CREATE TABLE IF NOT EXISTS` (válido en
ambos motores); la columna `pago_consolidado_id` con el patrón `getTable` +
`columns.find(...)`. Sin `IF NOT EXISTS` en el `ADD COLUMN`.

## C13 [ALTA] El componente va híbrido tab/dialog (regla 18)

El paso 1 lista obligaciones que pueden ser decenas. Se construye con
`@Optional() dialogRef` + flag `isTab` y el patrón full-height de scroll local de
`conventions/ui-patterns.md`, como `caja-mayor-detalle`. Se abre como diálogo desde
el hub de egresos; queda listo para abrirse como tab.

## C14 [MEDIA] Un solo ítem: setear también la columna de referencia clásica

Si el evento cubre **exactamente 1 ítem**, el movimiento consolidado además setea la
columna clásica (`gasto`, `valeId`, `cuentaPorPagarCuotaId`, `liquidacionSueldoId`).
Motivo: `get-movimientos-caja-mayor-consolidados` filtra por proveedor con
`gasto.proveedor_id` (`caja-mayor.handler.ts:592`) y compone la observación rica con
`m.gasto`. Sin esto, filtrar movimientos por proveedor devolvería resultados
incompletos para todo gasto pagado por el flujo nuevo.

Esto es seguro **porque** el chequeo de `pagoConsolidadoId` va primero en
`anular-caja-mayor-movimiento` (C6): las ramas viejas nunca se activan para un
movimiento consolidado.

## C15 [MEDIA] Registrar el handler en `main.ts`

Paso obligatorio de `workflows/add-new-entity.md` que la v1 omitía. Va explícito en F4.

## C16 [BAJA] Los `get-*` van gateados por el permiso del concepto

`get-obligaciones-pendientes(LIQUIDACION_SUELDO)` expone la nómina completa. Aunque
la convención del repo es que los `get-*` no llevan `ensurePermission`, acá el dato
es sensible y el permiso del concepto ya existe. Ambos canales de lectura
(`get-obligaciones-pendientes`, `get-pago-consolidado-detalle`) validan el permiso
del concepto.

## C17 [BAJA] Docs concretos a actualizar (F8)

`domains/financiero-caja-mayor.md` (flujo nuevo + tarjetas del hub de egresos),
`domains/compras-cpp.md` (desaparece `pagar-compras-dialog`),
`domains/rrhh.md` (vales: se retira "Confirmar" de la lista de desktop),
`domains/rrhh-liquidaciones.md` (el botón Pagar abre el genérico), más
`reference/known-bugs.md` (M-02 a "parcialmente resuelto"; entradas nuevas: gastos
`PROGRAMADO` contados en el reporte, `Gasto.monto` sumando monedas distintas, dos
convenciones de dirección de cotización) y `workflows/todos-pendientes.md`.

## C18 — Verificado OK por los auditores (no requiere cambios)

- El filtro `cpp.tipo = COMPRA` excluye correctamente `PRESTAMO_FUNCIONARIO`, que
  invierte el signo del movimiento.
- Agrupar por `(fuente, caja|cuenta, moneda, formaPago)` separa bien dos cajas
  mayor distintas.
- `actualizarSaldoCajaMayor` sí tiene el lock Postgres: la deuda técnica de §4.5 es
  real y vale saldarla.
- `anular-caja-mayor-movimiento` ya tiene el patrón de bloqueo por columna de
  referencia; agregar `pagoConsolidadoId` es consistente.
- Los 4 permisos reusados existen en `SEED_PERMISOS`.
- Ni `pagar-obligaciones-dialog` ni `detalle-pago-consolidado-dialog` necesitan hoja
  en `MENU_TREE`: son diálogos contextuales, igual que todo lo que hoy cuelga del
  hub de egresos.
- `get-gastos-programados` filtra `PROGRAMADO`, no colisiona con el listado de
  pendientes.

## Fases (v2)

Sin cambios de estructura; se suman los ítems nuevos:

- **F1** — + `movimiento_bancario_id` en el detalle (C9); migración con `getTable`
  para el `ADD COLUMN` (C12).
- **F2** — + reparto FIFO con target exacto y residuo determinístico (C10).
- **F3** — + corte exacto de la extracción de liquidación (C4); +
  `getCotizacionBidireccional` (C8).
- **F4** — + lock pesimista sobre los ítems (C5); + registro en `main.ts` (C15); +
  `get-*` gateados (C16); + columna de referencia clásica cuando hay 1 solo ítem (C14).
- **F5** — + orden de los bloqueos: `pagoConsolidadoId` primero, y el bloqueo como
  primera sentencia en `anular-vale`/`anular-gasto`/`anular-liquidacion-sueldo` (C6).
- **F6** — + componente híbrido tab/dialog (C13).
- **F7** — + `create-gasto` condicional al payload (C1); + retiro de "Confirmar" de
  la lista de vales de desktop (C2); + `reportes-finanzas.helper.ts` excluye
  `PENDIENTE` (C3); + alta diferida de gasto con moneda/monto directos (C11).
- **F8** — + tests de: doble pago concurrente (C5), anulación mixta de cuota (C7),
  cotización invertida (C8); + docs de C17.
