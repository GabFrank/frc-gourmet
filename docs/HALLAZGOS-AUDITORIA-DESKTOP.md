# Auditoría de bugs — Desktop / Handlers

Rama: `claude/desktop-forma-pago-efectivo` · PR **#181** (base `develop`).
Complemento desktop del PWA #180.

Este documento registra:

1. El **proceso de auditoría** (3 iteraciones de búsqueda + corrección).
2. Los **gotchas importantes** aprendidos durante el trabajo.
3. La **clasificación por severidad** de los bugs que quedaron **diferidos**
   (documentados, no corregidos, por requerir transacciones / locks /
   migraciones / decisiones de negocio).

---

## 1. Proceso — 3 iteraciones de búsqueda y corrección

Se hicieron 3 rondas de "buscar bug → corregir → verificar" además del fix
inicial de la regla de negocio de EFECTIVO. Todo se verificó con
`npm run check` (AOT producción, EXIT=0) y `npm run electron:serve-tsc`.

### Fix inicial — Regla EFECTIVO en Caja Mayor (`19fa808`)
Regla de negocio: **si la fuente de pago es Caja Mayor, la forma de pago debe
ser EFECTIVO**; si se elige una cuenta bancaria no se pide forma de pago (siempre
es transferencia y la moneda la define el banco).

Corregido en 7 componentes desktop: `create-edit-entrada-varia`,
`edit-movimiento-dialog`, `pagar-compras-dialog`, `pagar-cuota-dialog` (CxP),
`create-edit-gasto`, `create-operacion-financiera`, `create-retiro-caja`.
Patrón aplicado: se filtra `formasPago` a sólo las que contienen `"EFECTIVO"`
(`formasPagoEfectivo`) y se preselecciona. Además en `confirmar-vale-dialog` el
`<mat-button-toggle-group formControlName="fuente">` estaba **fuera** del
`[formGroup]` → el control nunca se enlazaba; se movió adentro del `<form>`.

### Iteración 1 — Bugs de anulación/saldo + filtros en tablas
Commits `c3f4db3`, `b9d43fb`, `a00a983`.

- **`anular-gasto` multi-detalle** (`c3f4db3`): usaba `findOne`, así que un gasto
  con varios detalles sólo revertía **uno**. Ahora recorre todos los movimientos
  y genera contra-movimiento + `actualizarSaldo` por cada detalle.
- **Anulación / validación** (`b9d43fb`):
  `anular-caja-mayor-movimiento` maneja el caso `retiroCaja` (revierte todos los
  `INGRESO_RETIRO_CAJA`/`INGRESO_CIERRE_CAJA` y devuelve el retiro a `FLOTANTE`);
  `create-caja-mayor-movimiento` valida `monto > 0` y `tipoMovimiento`;
  `verificar-acreditacion-pos` rechaza doble verificación;
  `cobrar-venta-credito` ahora exige permiso `VENTAS_PDV`.
- **Filtros en listados** (`a00a983`): `list-gastos` (fecha desde = mes actual),
  `list-retiros-caja` (rango de fecha client-side), `list-productos` (botón
  Filtrar en vez de filtrado en vivo), `list-gasto-categorias` / **tipos de
  gasto** (búsqueda por nombre con botón Filtrar/Limpiar).

### Iteración 2 — no-op de comisiones + validación de precios (`8a253ce`)
- **`generar-liquidaciones-comision-mes` era un no-op silencioso**: invocaba otro
  handler vía `ipcMain.listeners('generar-liquidacion-comision')[0]?.(...)`, que
  siempre es `undefined` porque los handlers se registran por monkey-patch (ver
  Gotcha #1). Ahora usa `invokeHandler('generar-liquidacion-comision', ...)`.
- `create-precio-venta` / `create-precio-costo` validan `valor > 0`.

### Iteración 3 — Control de permisos en handlers de sistema (`0936ec7`)
Handlers que mutaban permisos, roles y backups no verificaban autorización;
cualquier sesión con un JWT válido los alcanzaba vía `/api/rpc`.

- `create/update/delete-permission` + `set-role-permissions` → `SISTEMA_PERMISO_GESTIONAR`.
- `assign/remove-role-to-usuario` → `USUARIOS_GESTIONAR`.
- `backup-clear-images` → `SISTEMA_BACKUP` (`backup-db-reset` ya lo tenía).

---

## 2. Gotchas importantes

Cosas no obvias que costaron tiempo o que hay que recordar al tocar estos módulos:

1. **Los handlers NO quedan como listeners de `ipcMain`.**
   `handler-registry.ts` hace monkey-patch de `ipcMain.handle` y guarda cada
   canal en un registro propio. Por eso `ipcMain.listeners('canal')` devuelve
   `[]` y llamar `ipcMain.listeners(...)[0]?.(...)` es un no-op silencioso. Para
   invocar otro handler internamente **usar `invokeHandler(canal, ...args)`**
   (de `../utils/handler-registry`).

2. **`/api/rpc` es default-allow.** En modo server expone **todos** los handlers
   con sólo un JWT; `BLOCKED_CHANNELS` bloquea apenas 3 canales. Cada handler
   sensible debe traer su propio `ensurePermission(dataSource, getCurrentUser,
   'CODIGO')`; no se puede asumir que la capa de transporte protege nada. (El
   arreglo estructural — pasar a default-deny — sigue pendiente, ver bug A-01.)

3. **Payload de cuenta bancaria anidado.** Los handlers que reciben una cuenta
   bancaria esperan `{ cuentaBancaria: { id } }`, **no** un `cuentaBancariaId`
   plano (lo descartan al desestructurar). Un error de este tipo se coló en el
   PWA y se corrigió en revisión.

4. **Regla de fuente Caja Mayor ⇒ EFECTIVO.** Vale para todo formulario con
   selector de fuente de pago. Si la fuente es una cuenta bancaria, **no** se pide
   forma de pago (es transferencia; la moneda la define el banco).

5. **Anulaciones deben ser multi-detalle.** Varios documentos (gasto, retiro,
   etc.) generan **N** movimientos de caja mayor. Anular debe recorrer **todos**
   con `find(...)`, nunca `findOne(...)`, y contra-balancear cada uno.

6. **Convenciones que el AOT sí exige** (no el dev build): strings en UPPERCASE,
   sin funciones/getters en templates, sin colores hardcodeados, filtros con
   botón explícito (sin filtrado en vivo). `npm run check` es el que las caza.

7. **Nulear relaciones/campos** para TypeORM: usar `(entity as any).campo = null`
   (el tipo no admite `null` directo pero la columna sí).

---

## 3. Bugs diferidos — clasificación por severidad

18 hallazgos que **no** se corrigieron porque implican transacciones, locks,
migraciones o decisiones de negocio; parchearlos a ciegas era más riesgoso que
documentarlos. `ID` es una etiqueta estable para referirlos en tickets.

**Severidad:**
**CRÍTICO** = corrupción de datos / dinero mal contabilizado / hueco de seguridad ·
**ALTO** = inconsistencia de estado visible al usuario ·
**MEDIO** = caso borde, carrera poco frecuente o falta de idempotencia.

### 🔴 CRÍTICO (5)

| ID | Dominio | Bug | Qué ocasiona |
|----|---------|-----|--------------|
| C-01 | Financiero | Doble conteo en el libro mayor bancario (`movimientos-bancarios.ts`, tramos 2/5/6/8) | El mismo movimiento se cuenta más de una vez → **saldo bancario inflado/erróneo** que no cuadra con la realidad. |
| C-02 | Productos | Descuento de stock de pizza multi-sabor ignora `VentaItemSabor` | Vender una pizza de varios sabores **descuenta stock del sabor equivocado** (o de más/menos) → inventario desviado. |
| C-03 | Seguridad | Handlers de stock/precio sin `ensurePermission` | Cualquier sesión con JWT puede **crear/alterar precios y stock** vía `/api/rpc` sin permiso. |
| C-04 | RRHH | Vale CONFIRMADO + `VacacionVenta` se descuentan en dos periodos | El mismo monto se **descuenta dos veces** al funcionario (en periodos distintos) → liquidación incorrecta. |
| C-05 | Seguridad | `/api/rpc` es default-allow (`BLOCKED_CHANNELS` sólo cubre 3) | **Toda** la superficie de handlers queda expuesta con un JWT válido; un permiso olvidado = acceso total a ese handler. **Resuelto parcialmente:** el mapeo mostró que la allowlist para default-deny sería ~830 canales (casi todo el registro), alto costo/riesgo y poco valor marginal. Se optó por ampliar `BLOCKED_CHANNELS` a ~30 canales de infraestructura (backups/reset BD, config/reinicio, secretos, seeds, túnel/MAC del servidor). El default-deny estructural queda como follow-up (requiere fase fail-open + prueba en cliente/PWA). |

### 🟠 ALTO (5)

| ID | Dominio | Bug | Qué ocasiona |
|----|---------|-----|--------------|
| A-01 | Financiero | Cancelar venta no revierte CPC ni `cliente.saldoActual` | Tras cancelar una venta a crédito el cliente **sigue debiendo** y la CPC queda viva → cobros fantasma. |
| A-02 | Productos | Cálculo de costo ignora `rendimiento` de la receta | **Sobreestima el costo unitario** de elaborados → márgenes y precios sugeridos mal calculados. |
| A-03 | Productos | Anular compra no revierte stock ni costo | El stock queda **inflado** y el costo promedio **desactualizado** tras anular una compra. |
| A-04 | RRHH | `evaluar-equipo-periodo` puede duplicar registros | Reejecutar la evaluación del periodo **crea duplicados** → comisiones contadas dos veces. |
| A-05 | RRHH | `cpp.montoPagado` se sobre-suma | Acumulación repetida sin idempotencia → la cuenta figura **más pagada de lo real**. |

### 🟡 MEDIO (8)

| ID | Dominio | Bug | Qué ocasiona |
|----|---------|-----|--------------|
| M-01 | Financiero | `anular-cobro-cpc` no es idempotente | Anular dos veces el mismo cobro **vuelve a ajustar saldos** → descuadre. |
| M-02 | Financiero | Carreras de saldo (`saldoActual`) sin lock | En modo server, dos operaciones simultáneas pueden **perder una actualización** de saldo. |
| M-03 | Productos | Margen calculado sin `precio_ajuste` (3 componentes) | La UI **muestra un margen distinto al real**; sólo visual, no corrompe datos. |
| M-04 | Productos | TOCTOU en `procesarStockVenta` | Dos ventas simultáneas del mismo producto pueden **sobrevender** (lee-luego-escribe sin lock). |
| M-05 | RRHH | Batch de handlers RRHH sin `ensurePermission` | Varios handlers RRHH invocables vía `/api/rpc` **sin control de permiso**. |
| M-06 | RRHH | Reglas de comisión por equipo no validan suma = 100% | Se puede guardar una distribución que **no suma 100%** → comisiones mal repartidas. |
| M-07 | Seguridad | `must_change_password` sólo se respeta en el frontend | El backend **no rechaza** otras llamadas mientras el flag está activo → se puede saltar el cambio forzado. |
| M-08 | Seguridad | Hash de contraseña llega al renderer / HTTP | Respuestas de usuario incluyen el hash; debería **filtrarse** antes de serializar. |

> Nota: `change-password` que depende del contexto `getCurrentUser` en modo
> HTTP se agrupa dentro de M-07/M-08 (mismo origen: la sesión no resuelve igual
> por IPC que por HTTP). Priorizar la fila de seguridad estructural **C-05**:
> resolverla (default-deny + allowlist) reduce el impacto de C-03, M-05 y M-08.

---

## Verificación

- Todos los fixes de este PR: `npm run check` (AOT) → **EXIT=0**, sin errores;
  `npm run electron:serve-tsc` compila limpio.
- No hay migraciones nuevas.
