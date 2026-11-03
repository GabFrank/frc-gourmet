# Checklist de pruebas: arreglos de la carga inicial (#329–#340)

Bugs encontrados al relevar el alta por API para el runbook de instalación
(`docs/runbooks/RUNBOOK-INSTALACION-Y-CARGA-INICIAL.md`). Van en la misma rama
que las fichas de cantina (PR GabFrank/frc-gourmet#327).

> ⚠️ **Hay que reiniciar la app.** Hay handlers nuevos, una migración
> (`CajaMayorMontosAmplios`, sólo hace algo en Postgres) y un seed.

Tests automáticos: `npm run test:alta-inicial` (26) y `npm run test:pago-consolidado-e2e`.

---

| # | Issue | Paso | Esperado |
|---|---|---|---|
| 1 | #336 | Producto → desactivar **Requiere comanda** → guardar → reabrir | Sigue desactivado |
| 2 | #336 | Vender ese producto en una mesa | **No** sale comanda ni aparece en el KDS |
| 3 | #337 | Crear un usuario con *debe cambiar contraseña*. Entrar con él desde **otra terminal (modo cliente), `/admin` o la PWA**, con otro usuario logueado en la consola del servidor | El diálogo de cambio **funciona** (antes: "NO AUTORIZADO") y después opera normal |
| 4 | #337 | Desde `/admin`, intentar cambiar la contraseña de otro usuario por el canal de cambio propio | No se puede |
| 5 | #338 | *Personas → Usuarios → Nuevo*, con 2 roles elegidos → guardar → reabrir | Los dos roles aparecen asignados |
| 6 | #338 | Lo mismo con el alta rápida de usuario | Roles asignados |
| 7 | #339 | Base nueva (o existente): *Tipos de cliente* | Aparece **CONVENIADO** (con crédito); CONSUMIDOR FINAL no se duplica |
| 8 | #339 | Alta de funcionario con "crear cliente conveniado" activo | Se crea el funcionario y su cliente CONVENIADO |
| 9 | #340 | **Postgres:** Caja Mayor → ingreso de **150.000.000 Gs** | Se registra, y el saldo lo refleja (antes: error de overflow) |
| 10 | #329 | Cobrar normal con F10, F11, F2 y a crédito | Todo concluye como siempre |
| 11 | #329 | Historial → rehabilitar una venta cancelada | Funciona (no pide pago nuevo) |
| 12 | #330 | (API) `updateVenta` sobre una venta CONCLUIDA con `{ mesa:{id}, canalOrigen:'WEB' }` | La mesa y el canal **no** cambian; el resto del payload sí |
| 13 | #332 | Caja Mayor → pago consolidado de un gasto en **USD** pagado con **guaraníes** | El monto en Gs que pide es deuda × cotización (20 USD × 7.500 = 150.000 Gs), no un número gigante |
| 14 | #332 | Lo mismo con una cotización cargada al revés (origen GUARANI, destino DOLAR) | Mismo resultado |

## Si algo falla

Anotá el número de fila, el modo (standalone / server / cliente), el driver
(SQLite / Postgres) y el mensaje exacto. Comentalo en el PR #327.
