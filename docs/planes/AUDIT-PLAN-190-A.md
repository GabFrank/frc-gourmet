# Auditoría PLAN-190 — Enfoque A: corrección y concurrencia

**Veredicto: OBJETADO.** El UPDATE atómico funciona, pero el `save()` que el plan deja después del helper vuelve a abrir el lost update, y quedan fuera de alcance algunos sitios que pisan el saldo.

## Lo que se verificó y está bien

- **Atomicidad en READ COMMITTED:** correcta. Ninguna transacción cambia el nivel de aislamiento (no hay `startTransaction('…')`). En Postgres, `SET col = ROUND(col + $d, 2)` se vuelve a evaluar sobre la última versión commiteada de la fila.
- **Deadlocks:** el riesgo no sube. Hoy el `save()` ya hace un UPDATE de `saldo` en el mismo punto: en PG el decimal llega como string y la entidad tiene un number, así que la columna siempre se manda. El orden de los locks no cambia. Las transferencias A→B y B→A ya podían trabarse antes del cambio.
- **Helper (`electron/utils/saldo-atomico.utils.ts`):** en SQLite no usa RETURNING porque `run()` no devuelve filas. Está bien, y el plan dice "better-sqlite3" cuando la app usa `sqlite3`.

## Hallazgos

1. **CRÍTICO — el `save()` posterior pisa la otra columna de saldo.** En 0.3.21, `SubjectChangedColumnsComputer` vuelve a leer la fila y compara con `===` contra la entidad, que se cargó *antes* del UPDATE. Así quedan dos casos:
   - **Se ajusta `saldoReservado`:** el `cb.saldo` que quedó viejo se escribe encima de un delta concurrente que ya se commiteó. Pasa en `banking.handler.ts:846` (cheque diferido) y `:986` (anular diferido).
   - **Se ajusta `saldo`:** en los demás sitios de cuenta bancaria pasa lo mismo con un `saldoReservado` viejo.

   La frase del plan "TypeORM solo manda las columnas cambiadas" no evita esto: compara contra la base, no contra lo que se leyó.

   **Fix:** sacar el `save(CuentaBancaria|Cliente)` en todos los sitios. Revisé las líneas siguientes a cada asignación y ninguno cambia otras columnas, así que la afirmación del plan de que "varios sitios cambian otras columnas" no se sostiene. Si alguno las cambiara, usar `update()` solo con esas columnas.

2. **ALTO — `update-cuenta-bancaria` escribe un saldo absoluto viejo.** El diálogo de edición manda `saldo` con el valor que tenía al abrirse (`create-edit-cuenta-bancaria-dialog.component.ts:93,116`). Del lado del backend, `banking.handler.ts:176-180` hace `Object.assign(existing, {...data})` y `save`. Editar el nombre de una cuenta deshace todos los movimientos que entraron mientras el diálogo estaba abierto. No queda movimiento registrado. Esto no se encuentra con el grep del plan. **Fix:** ignorar `saldo` y `saldoReservado` en el update (ajustar el saldo solo por movimiento o ajuste) o hacer una lista blanca de campos.

3. **MEDIO — sí hay una validación contra la lectura previa.** `cobrar-venta-credito` (`cuentas-por-cobrar.handler.ts:889-901`) compara el límite de crédito contra el `saldoAct` leído. Dos ventas a crédito concurrentes pasan las dos. Además, `:1036` usa `saldoAct + montoTotal`, no `cliente.saldoActual`, y al convertirlo hay que pasar el delta `montoTotal`. **Fix:** con `ajustarSaldoCliente` devolviendo el saldo nuevo, volver a validar después del UPDATE y hacer rollback si se pasa del límite sin `forzar`. Otra opción es documentar que el límite es "blando".

4. **MEDIO — `recalcular-saldo-cliente` (`cuentas-por-cobrar.handler.ts:804-830`).** El orden tiene que ser: primero `SELECT … FOR UPDATE` del cliente y *después* sumar los movimientos, en la misma transacción. Si se leen antes del lock, se pierde un CARGO que se commitee en el medio. El plan no fija el orden.

5. **MEDIO — saves del Cliente entero fuera de transacción.** `personas.handler.ts:823` (update-cliente) y `:844` (soft delete) hacen `findOne` y después `save` del objeto completo. Si un delta se commitea entre esas dos operaciones, el `saldoActual` viejo lo pisa. La ventana es de milisegundos pero existe, y sale de la misma raíz que el hallazgo 1. **Fix:** `update()` solo con los campos editados.

6. **MEDIO — `acreditar-transferencia` está fuera de transacción** (`banking.handler.ts:511-535`, usa `dataSource.manager`). El plan lo cubre quitando `saldo` del save. Aun así, el saldo y el `MovimientoBancario` siguen sin ser atómicos entre sí, y conviene meterlos en una transacción porque se llama desde el cobro del PdV.

7. **BAJO — falta un archivo en el inventario.** `movimientos-cliente.handler.ts:53,88` aparece en el grep pero es solo lectura. No se encontraron `update()`, `increment`, `QueryBuilder.set` ni SQL crudo que toquen esas columnas, y `CuentaBancaria`/`Cliente` no tienen relaciones con cascade.

8. **BAJO — el plan y el helper no coinciden con delta 0.** El plan dice "delta 0 → no hace UPDATE"; el helper sí lo hace. Con delta no finito, el helper lanza error en lugar de devolver el saldo. Hay que alinear plan, tests y código.

9. **BAJO — el `.js` compilado está junto al `.ts`** en `electron/handlers`. Hay que confirmar que se regenera y no queda desfasado.

## Tests que hay que sumar

- Cheque diferido concurrente con un ingreso a la misma cuenta: tiene que fallar con el plan actual.
- Edición de cuenta concurrente con un movimiento.
