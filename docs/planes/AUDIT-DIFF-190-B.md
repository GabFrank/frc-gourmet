# Auditoría #190 — diff B (tests y regresiones)

Rama `bot/ceo-frc-gourmet/fix-190-saldos-atomicos`, commit 1ac65219.

**Veredicto: APROBADO CON OBSERVACIONES** (no hay bloqueantes).

## Qué se corrió
- `test:saldos-atomicos`: verde, 19/19, con Postgres local. A perdió 180 de 200 y F-control pisó `saldo_reservado`, así que los dos controles discriminan.
- Suites que tocan los handlers cambiados, todas en verde: acreditaciones-pos-e2e, cobro-cpc-consolidado, cobro-parcial, cpc-cancelada-cuotas, funcionario-vales, integridad-cobro, locks-pg, operacion-financiera, transferencia-bancaria, transferencia-pdv, config-caja-mayor, resumen-multimoneda y reporte-finanzas. Seis de ellas verifican saldos de cuenta o cliente.
- `pago-consolidado-e2e` (falla «E: Gs→USD invierte la tasa») y `pago-consolidado` («Electron failed to install») **fallan igual en origin/develop** (lo verifiqué con `git archive`): son fallas previas, no las trae este cambio.
- No hay managers falsos ni mocks sin `.query`/`connection` en scripts/ ni en specs. Ningún test espera un `save()` de CuentaBancaria/Cliente después del ajuste.

## Hallazgos
1. **MEDIA — G no protege la regla crítica (no hacer `save()` después del helper).** `scripts/test-saldos-atomicos.ts:74` deja pasar cualquier `x.saldo = await ajustarSaldo…`. Si alguien después agrega `manager.save(CuentaBancaria, cb)`, vuelve el problema de F y G no lo ve. Sugerencia: marcar `save(CuentaBancaria|Cliente, …)`/`repo.save(cb|cliente)` en las ~6 líneas siguientes a un `ajustarSaldo`.
2. **MEDIA — G tiene otros huecos** (regex en `:67`): no ve `cb.saldo += x` ni `-=` (exige `=` justo después del nombre), `Object.assign(cb, {saldo})`, `manager.update(CuentaBancaria, id, {saldo: …})`, `.set({ saldoActual: … })`, SQL crudo `SET saldo = …`, `cb['saldo'] =`. Hoy no hay casos así (lo revisé con grep), pero la guardia es más débil de lo que dice. La excepción `saldo.saldo` (`:73`) aplica a cualquier variable que se llame `saldo`.
3. **MEDIA (residual, fuera del diff) — quedan lecturas viejas que se guardan enteras.** `update-cliente` (`electron/handlers/personas.handler.ts:784→823`, varios `await` en el medio) y `update-cuenta-bancaria` (`electron/handlers/banking.handler.ts:168→180`, con `Object.assign(existing, data)`, que además acepta `saldo` en `data`) pueden pisar un ajuste concurrente, con el mismo mecanismo de F. Conviene anotarlo en la issue o excluir las columnas de saldo de esos `save`.
4. **BAJA — E casi no discrimina.** Corrió con 19 de 20 transacciones abortadas por deadlock (`:183-194`): commitea una sola, y con el patrón viejo la suma también se conservaría. El comentario `:18-19` («cae B, C y E») exagera. Sugerencia: N impar en un solo sentido, o reintentar los deadlocks y verificar el saldo exacto.
5. **BAJA — limpieza de la base de prueba.** `CREATE DATABASE` (`:129`) y `ds.initialize()` (`:132`) quedan fuera del `try/finally`. Si falla la conexión a la base nueva, la base queda creada. Sin permiso CREATEDB el test falla en vez de saltearse. Sin Postgres se saltea entero y dice «OK»: A/B/C/E/F no corren (como en locks-pg).
6. **BAJA — `electron/utils/saldo-atomico.utils.ts:62`:** con `delta` null o "" queda `Number(...) = 0` y no hace nada sin avisar (igual que antes). Con `undefined` ahora lanza y aborta la transacción; antes guardaba NaN. El cambio de comportamiento es para mejor. Sin `manager.connection` (un mock) cae en la rama SQLite con `?`, y en un pg real eso rompería. Hoy no hay mocks así.
7. **OK — casos borde del helper.** Un id string se normaliza con `Number`. El decimal que vuelve como string se convierte con `Number(valor)`. `filasDe` maneja bien el `[rows, rowCount]` de pg. SQLite relee en la misma conexión. Una columna NULL no se da (NOT NULL default 0 en `cuenta-bancaria.entity.ts:35-39` y `cliente.entity.ts:38`); un `COALESCE` sería defensa barata.
8. **OK — sin cambios perdidos al quitar los `save()`.** En los ~8 renglones antes de cada `= await ajustarSaldo` no se asigna otro campo de `cb`/`cliente` ni se llama a `setEntityUserTracking`, y no queda ningún `save` de esas entidades después.
