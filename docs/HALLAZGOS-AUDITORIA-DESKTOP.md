# Hallazgos de auditoría — Desktop / Handlers (bugs diferidos)

> Documento generado durante la ronda de auditoría de bugs (3 iteraciones de
> búsqueda + corrección) sobre la rama `claude/desktop-forma-pago-efectivo`.
>
> Los bugs **corregidos** en esa rama están en los commits `19fa808`, `c3f4db3`,
> `b9d43fb`, `a00a983`, `8a253ce` y `0936ec7`.
>
> Este archivo lista los hallazgos que **NO se corrigieron** porque requieren
> cambios transaccionales, migraciones o decisiones de negocio, y arreglarlos a
> ciegas era más riesgoso que documentarlos. Cada uno necesita revisión humana
> antes de tocarse.

## Convención de severidad

- **CRÍTICO** — corrupción de datos / dinero mal contabilizado / hueco de seguridad.
- **ALTO** — inconsistencia de estado recuperable, pero visible para el usuario.
- **MEDIO** — caso borde, condición de carrera poco frecuente, o falta de idempotencia.

---

## Financiero

### ALTO — Cancelar venta no revierte CPC ni `cliente.saldoActual`
Al cancelar una venta a crédito, no se reversa la cuenta por cobrar generada ni
el saldo acumulado del cliente. Requiere un handler `cancelar-venta`
transaccional que deshaga CPC + saldo + stock en una sola transacción.

### CRÍTICO — Doble conteo en el libro mayor de movimientos bancarios
En `movimientos-bancarios.ts` las secciones 2/5/6/8 pueden contar el mismo
movimiento más de una vez al construir el ledger. Necesita revisar la fuente de
cada tramo para no solapar rangos.

### MEDIO — `anular-cobro-cpc` no es idempotente (M1)
Anular dos veces el mismo cobro vuelve a sumar/restar. Falta un marcador
`anulado` que corte la segunda ejecución.

### MEDIO — Carreras de saldo (M4) en caja mayor / cuentas
Varias operaciones leen-modifican-escriben `saldoActual` sin lock. Bajo
concurrencia real (modo server) pueden perder actualizaciones. Requiere
`SELECT ... FOR UPDATE` (Postgres) / transacción serializada.

---

## Ventas / Productos

### CRÍTICO — Pizza multi-sabor ignora `VentaItemSabor` al descontar stock
El descuento de stock de una pizza de varios sabores no recorre
`VentaItemSabor`, por lo que descuenta de más/menos según el sabor base.

### ALTO — Costo ignora `rendimiento` de la receta
El cálculo de costo no divide por el rendimiento, sobreestimando el costo
unitario de productos elaborados.

### MEDIO — Margen vs `precio_ajuste` (3 componentes frontend)
Tres componentes calculan margen sobre el precio sin considerar `precio_ajuste`,
mostrando un margen distinto al real.

### MEDIO — Carrera de stock (TOCTOU) en `procesarStockVenta`
Lectura y escritura de stock separadas; dos ventas simultáneas del mismo
producto pueden sobrevender.

### CRÍTICO — Handlers de stock/precio sin `ensurePermission`
`create-precio-venta`/`create-precio-costo` recibieron validación de valor > 0
(commit `8a253ce`) pero varios handlers de stock/precio siguen sin control de
permisos vía `/api/rpc`. Requiere barrido y asignación de códigos.

### ALTO — Anular compra no revierte stock ni costo
La anulación de una compra no deshace el movimiento de stock ni el costo
promedio recalculado.

---

## RRHH

### CRÍTICO — Vales CONFIRMADO + VacacionVenta: doble descuento entre periodos
Un vale confirmado y una venta de vacaciones pueden descontarse en dos periodos
distintos. Requiere selección por periodo (no por estado global).

### ALTO — `evaluar-equipo-periodo` puede duplicar (RRHH #4)
Reejecutar la evaluación del periodo crea registros duplicados. Falta
upsert/unique por (equipo, periodo).

### ALTO — `cpp.montoPagado` se sobre-suma (RRHH #5)
Acumulación repetida sobre `montoPagado` sin idempotencia.

### MEDIO — Batch de handlers RRHH sin `ensurePermission` (RRHH #6)

### MEDIO — Falta validar distribución 100% (RRHH #7)
Las reglas de comisión por equipo no validan que la suma de porcentajes sea 100%.

---

## Auth / Seguridad (iteración 3)

Corregidos en `0936ec7`:
- `create/update/delete-permission`, `set-role-permissions` → `SISTEMA_PERMISO_GESTIONAR`.
- `assign/remove-role-to-usuario` → `USUARIOS_GESTIONAR`.
- `backup-clear-images` → `SISTEMA_BACKUP`.

Pendientes (estructurales, no corregidos):

### CRÍTICO — `/api/rpc` es default-allow (Auth #4)
`BLOCKED_CHANNELS` sólo bloquea 3 canales; todo lo demás queda expuesto con
sólo un JWT válido. Debería ser **default-deny** con allowlist explícita, y cada
handler sensible con su propio `ensurePermission`.

### MEDIO — `must_change_password` se puede saltar por backend (Auth #6)
El flag se respeta en el frontend pero el backend no rechaza otras llamadas
mientras esté activo.

### MEDIO — `change-password` depende del contexto `getCurrentUser` (Auth #7)
En modo server/HTTP el usuario actual puede no resolverse igual que en IPC.

### MEDIO — Hash de contraseña llega al renderer (Auth #8)
Algunas respuestas de usuario incluyen el hash; debería filtrarse antes de
serializar hacia el renderer/HTTP.

---

## Notas

- Todos los hallazgos marcados como corregidos fueron verificados con
  `npm run check` (AOT, EXIT=0) y `npm run electron:serve-tsc`.
- Los pendientes se dejan documentados a propósito: implican transacciones,
  locks, migraciones o decisiones de negocio que exceden un fix mecánico seguro.
