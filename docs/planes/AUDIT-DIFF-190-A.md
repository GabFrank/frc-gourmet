# Auditoría diff #190 (A): ajustes atómicos de saldo

Rama `bot/ceo-frc-gourmet/fix-190-saldos-atomicos`, commit 1ac65219 contra origin/develop. 13 archivos, unos 50 sitios.

## Veredicto: APROBADO CON OBSERVACIONES

No encontré nada que bloquee.

## Revisión sitio por sitio

**(1) Signo y valor del delta.** Comparé cada sitio con la expresión vieja y coinciden todos. Revisé con más cuidado:
- Los condicionales: banking.handler.ts:610, cuentas-por-pagar.handler.ts:230, pago-consolidado.handler.ts:405 y :684.
- La diferencia ±: banking.handler.ts:452.
- Las liberaciones con `Math.max(0, …)`, que ahora pasan `minCero`: banking.handler.ts:914 y :981.

El `toFixed(2)` y `redondear(...,2)` de antes queda reemplazado por `ROUND(...,2)`. Equivale porque la columna es decimal(14|18, 2). En los sitios que antes no redondeaban, ahora se redondea a 2 decimales, cosa que Postgres ya hacía al guardar.

**(2) Manager.** Todos los sitios con transacción usan `queryRunner.manager` o el `m`/`manager` de la transacción. Es el mismo con que se cargó la entidad y con que se registra el movimiento. Los repos `clienteRepo`, `clienteRepoPago` y `clienteRepoAnular` salen de `queryRunner.manager` (liquidacion-final.handler.ts:387, liquidacion-sueldo.handler.ts:180 y :352), así que su `.manager` es el de la transacción. La única excepción es `acreditar-transferencia-bancaria`, en banking.handler.ts:528: usa `repo.manager`, que es `dataSource.manager`. Igual es consistente, porque ese handler ya no tenía transacción y el movimiento también va por `dataSource.manager`.

**(3) Columnas que dependían del save() quitado.** Entre la carga y el ajuste no se asigna ningún otro campo `cb.*` ni `cliente.*` en ningún sitio. Revisé en particular `cobrar-venta-credito` (cuentas-por-cobrar.handler.ts:873-1030), donde solo se leen `activo`, `credito`, `limite_credito` y `saldoActual`, y `convenios` (:399-459). Ninguna relación hacia CuentaBancaria o Cliente tiene `cascade`, así que ningún otro save() persistía la entidad indirectamente.

**(4) Re-save posterior.** No queda ningún `save(CuentaBancaria|Cliente)` en los flujos tocados. Con grep, lo único que sigue guardando el cliente entero está en personas.handler.ts:816/932/969, cuentas-por-cobrar.handler.ts:816 (recalcular) y rrhh-funcionarios.handler.ts:248, que crea clientes nuevos. Todos están fuera de alcance y documentados en el punto 5 del plan.

**(5) SQL del helper** (electron/utils/saldo-atomico.utils.ts):
- Tablas `cuentas_bancarias` y `clientes`, columnas `saldo`, `saldo_reservado` y `saldo_actual`: coinciden con las entidades.
- Son identificadores en minúscula sin comillas, así que no hay problema en Postgres. Son constantes internas, así que tampoco hay riesgo de inyección.
- Postgres: `$1`/`$2`, `CAST(... AS numeric)`, `ROUND(numeric, 2)`, `GREATEST` y `RETURNING` son correctos. `filasDe` contempla el `[rows, rowCount]` que devuelve TypeORM 0.3 en un UPDATE.
- SQLite: `?`, `ROUND(x, 2)` y `MAX(0, x)` escalar son correctos. El SELECT posterior va por la misma conexión o queryRunner.
- Si la fila no existe, tira error; antes el save() la habría insertado.

## Observaciones

- **Baja: `updated_at`.** El save() de antes actualizaba solo el `updated_at` (`UpdateDateColumn`) de `cuentas_bancarias` y `clientes`. El UPDATE crudo ya no lo toca. No encontré nada que dependa de ese campo, pero si importa para auditoría, habría que agregar `updated_at = CURRENT_TIMESTAMP` al UPDATE.
- **Baja, a favor: misma cuenta como origen y destino.** En la transferencia bancaria de caja-mayor.handler.ts:2630/2640, si origen y destino son la misma cuenta, antes el segundo save() con el objeto viejo dejaba +monto neto. Ahora queda en 0, que es lo correcto. Conviene validar que origen ≠ destino, aparte de este cambio.
- **Info: cheque diferido.** Al cobrar un cheque diferido (banking.handler.ts:914-916), donde antes había un solo save() ahora hay dos UPDATE sobre la misma fila en la misma transacción. Es inofensivo: el lock ya es propio.
- **Info: pendientes del plan.** Lo que el plan dejó fuera (`update-cuenta-bancaria`, edición de cliente, envolver `acreditar-transferencia` en transacción, recalcular saldo) sigue igual. Falta crear la issue de seguimiento.
