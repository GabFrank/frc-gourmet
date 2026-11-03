# Auditoría PLAN-190 — Enfoque B (alcance, regresión, pruebas)

**Veredicto: APROBADO CON OBSERVACIONES**

## 1. Inventario

Grep sobre `.ts` (los `.js` están en `.gitignore`): **57 sitios**, coincide archivo por archivo con la tabla.
Todos van en transacción con queryRunner, `dataSource.transaction` o un helper que recibe el `queryRunner`
(CPC:100/177, CPP:229/346, caja-mayor:178-220, venta-reversa:183), **salvo dos**:

- `banking.handler.ts:526-527` `acreditar-transferencia-bancaria` (el cobro del PdV): usa `repo.save` fuera de transacción y el movimiento se registra aparte con `dataSource.manager` (:528).
- `cuentas-por-cobrar.handler.ts:823` `recalcular-saldo-cliente`.

Transacción confirmada en: banking 64/452/464/611/846/849/918/920/986; caja-mayor 1293…2653; CPC 347/424/554/585/667/695/773/1036; CPP 579/722/904; liq-sueldo 210/378 (repos de `queryRunner.manager`, :179/:352), 991/1105; liq-final 410 (:386); vales 216/317/409; convenios 458/497; pago-consolidado 404/684; acreditaciones-pos 197/247; ventas 1637.

**[ALTA] Falta un sitio:** `banking.handler.ts:164-181` `update-cuenta-bancaria` hace `Object.assign(existing, data)`, y el diálogo (`create-edit-cuenta-bancaria-dialog.component.ts:93,116`) siempre manda `saldo` con el valor que leyó al abrirse. Editar el nombre de una cuenta pisa el saldo con uno viejo. La ventana dura lo que el diálogo esté abierto, así que es peor que la carrera entre transacciones. Hay que ignorar `saldo`/`saldoReservado` en el update (cuidando que el alta siga recibiendo el saldo inicial). Puede ir en un PR aparte, pero tiene que quedar anotado en el plan.

`personas.handler.ts:776` `update-cliente` no toca `saldoActual`: está bien.

## 2. Casos especiales

- **CPP:229 (préstamo de funcionario):** delta con signo. El helper lo cubre sin problemas.
- **Math.max(0) (banking 918/986):** `GREATEST/MAX(0, ROUND(...))` da el mismo resultado.
- **toFixed/round2:** se reproducen. **[BAJA]** Hoy hay sitios que no redondean (caja-mayor, banking, vales, CPP 229/579/722, liq-sueldo 991/1105). En Postgres no cambia nada (columnas `decimal(18,2)`), pero en SQLite (REAL) ahora se redondea donde antes no. Es una mejora, pero conviene documentarlo.
- **[MEDIA] recalcular-saldo-cliente (CPC:811-824):** hoy lee los movimientos *antes* de leer el cliente. Con `FOR UPDATE`, el `SUM` tiene que ir **después** del lock y en la misma transacción. Si no, se fija un saldo que no ve un delta ya commiteado. En SQLite no existe `FOR UPDATE`: hace falta una rama por motor. El plan no dice ninguna de las dos cosas.
- **[MEDIA] La afirmación «no hay validaciones sobre la lectura» es falsa:** `cobrar-venta-credito` (CPC:889-901) compara `limite_credito` contra el `saldoAct` leído. Dos ventas a crédito al mismo tiempo pueden pasar el límite. Es una advertencia blanda (`forzar`), así que no bloquea, pero hay que corregir el plan y anotarlo como limitación conocida.
- **[BAJA] Plan y helper dicen cosas distintas:** el plan dice «delta 0 o no finito → no hace UPDATE». El helper (`saldo-atomico.utils.ts:60-64`) lanza error con NaN y con delta 0 hace el UPDATE igual (toma un lock que hoy no se toma). Hay que alinear el texto o el código.
- **[BAJA]** El plan habla de «better-sqlite3», pero la app usa `sqlite3` 5.1.6 (SQLite 3.44.2). El helper ya relee con `SELECT`, que es correcto. Hay que corregir el texto y el punto 2 de los tests.

## 3. Pruebas

- `scripts/test-saldos-atomicos.ts` (ya escrito) **sí discrimina**. El control A usa el patrón viejo con una pausa de 20 ms entre leer y escribir, y un pool de N conexiones, y comprueba que *pierde* updates. Sigue el modelo de `test-locks-postgres-e2e.ts:197-235`, que exige ver el bloqueo para no quedar en no-op. Si no hay PG, autosaltea.
- **[MEDIA]** Todo el test usa SQL crudo (`entities: []`). No prueba lo que sostiene el diseño: helper + `save()` de la entidad real (TypeORM recarga y compara, y no debería volver a escribir `saldo`). Falta un caso con la entidad `CuentaBancaria` y `save` concurrente.
- **[MEDIA]** Falta una **guarda estática** que falle si queda o vuelve a aparecer `\.(saldo|saldoReservado|saldoActual) = ` en `electron/handlers|utils`. Sin ella, nada detecta un sitio olvidado.
- `test:saldos-atomicos` todavía no está en `package.json` ni en la lista de los que necesitan PG en `run-all-tests.js:13`.
- Tests existentes que miran saldos (en SQLite, así que no detectan concurrencia): cobro-cpc-consolidado, funcionario-vales, pago-consolidado-e2e, cpc-cancelada-cuotas, ticket-venta, ticket-delivery-pagos, transferencia-bancaria, acreditaciones-pos-e2e. **Ningún test cubre** `acreditar-transferencia-bancaria`, cheques (`saldoReservado`) ni `update-cuenta-bancaria`.

## 4. Flujos de cobro, factura y PdV

Los que tocan saldos son: cobro con transferencia (banking:503), venta a crédito (CPC:835), anulación de venta (ventas:1637, venta-reversa:183), cobro de convenio (convenios:458/497) y conciliación POS. La prueba real propuesta no incluye **cerrar una venta a crédito** ni **cheques diferidos** (emitir/cobrar/anular), ni hace dos cobros simultáneos desde 2 PC sobre la misma cuenta, que es justamente el bug. Hay que agregarlos.

## 5. División

- **PR #190 (este):** helper, los 55 sitios que ya van en transacción, test de PG, guarda estática y ajustes al texto del plan.
- **PR aparte:** `update-cuenta-bancaria` (ALTA), meter `acreditar-transferencia-bancaria` en una transacción junto con su movimiento (hoy saldo y movimiento no son atómicos), y `recalcular-saldo-cliente` con su rama por motor.
