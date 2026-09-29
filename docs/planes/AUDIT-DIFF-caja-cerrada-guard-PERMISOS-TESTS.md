# Auditoría de diff — PR 2 caja-cerrada-guard (Fijo 2 autorización/fugas + Fijo 3 tests)

**Auditor:** Diff — Permisos/fugas (parte A, sobre el diff de backend de 8ae84727) y poder discriminante de tests (parte B, sobre el diff de scripts de 6667c880)
**Modelo:** DeepSeek Flash (deepseek-flash vía heavy-llm, text-only, sin acceso al repo). Un solo auditor Flash en dos llamadas (el diff no entra en una).
**Fecha:** 2026-09-28

---


**Modelo:** DeepSeek Flash (deepseek-flash vía heavy-llm, text-only, sin acceso al repo)

## Veredicto parcial

**Aprobable con observaciones: requiere fixes antes del merge (P1/P2) y aclaraciones para P5.**

Lo que el PR **sí** hace bien y queda verificado en el diff:

- `ensurePermission` es la **primera sentencia** en `create-caja`, `update-caja`, `abrir-caja-desde-conteo` (se movió dentro del `try`, sigue primero) y `anular-gasto-caja`. El permiso operativo va antes que el `AJUSTAR` en `update-caja`, en el helper de ajuste y en `create-retiro-caja`.
- El segundo `ensurePermission('FINANCIERO_CAJA_AJUSTAR')` corre **después** del operativo y **dentro** de la transacción de `update-caja`; en gastos/retiros lo aplica el helper. No encontré un camino que ajuste una caja cerrada **sin** `AJUSTAR`. **Sí** encontré un camino que la ajusta **sin motivo ni traza** (`update-caja`, ver P4).
- La caja del `Pago` se deriva server-side de la venta cuando llega `ventaId` (`cajaDeVenta`), y `updateVenta` reimputa el pago a la caja de la venta; `createPagoDetalle` resuelve la caja desde el `Pago` (no del payload).
- Los guards nuevos usan `manager`/`queryRunner.manager` en los caminos transaccionales (`createVenta`, `materializarPedidoOnlineEnVenta`, `registrarCobroParcial`, `cobrar-venta-credito`, `delivery-crear`, `transferir-venta-pdv`).
- `emitCajaCambio` se llama **después del commit** en los tres canales de caja; migración e `indices-opcionales` **no borran filas**.

Lo que **no** cierra: whitelist de `update-caja`, `cajaActivaId` sin atar a dispositivo, posible bypass por FK crudo, TOCTOU donde se pasa `DataSource`, y traza/evento inconsistentes en los ajustes.

## Hallazgos

| ID | Severidad | Archivo | Hallazgo | Fix concreto |
|----|-----------|---------|----------|--------------|
| P1 | Alta | `electron/handlers/ventas.handler.ts` (`transferir-venta-pdv`, Q2) | `cajaActivaId` viene del payload y sólo se valida que la caja esté `ABIERTO` (`assertCajaAbierta`). Un cliente con `VENTAS_PDV` puede reimputar la cuenta destino a **cualquier** caja abierta —incluida la de **otro dispositivo**—, desviando el arqueo del turno. No se contrasta contra `resolveRequestDeviceId`. | Resolver la caja activa server-side desde el dispositivo de la request/usuario (no aceptarla del cliente), o exigir `dispositivo_id = requestDeviceId` antes de usarla. |
| P2 | Media-Alta | `electron/handlers/financiero.handler.ts` (`update-caja`) | El merge sólo excluye `dispositivo`; `createdBy`, `id`, `conteoApertura` y `fechaCierre` siguen siendo escribibles. Un usuario con sólo `FINANCIERO_CAJA_OPERAR` puede setear `createdBy = él` sobre una caja `ABIERTO` y **después** cerrarla, derrotando el guard «sólo el abridor puede cerrar» (se evalúa contra el `createdBy` ya reescrito). | Whitelist explícita de campos mergeables; descartar `id`, `createdBy`, `conteoApertura`, fechas de cierre. Nunca `merge` ciego del payload. |
| P3 | Media | `electron/handlers/financiero.handler.ts` (`update-caja`) | La regla 2 (`entity.estado === CERRADO` → exige `AJUSTAR`) no restringe **qué** se escribe. Con `FINANCIERO_CAJA_AJUSTAR` se puede mandar `estado: 'ABIERTO'` y **reabrir** una caja cerrada. El índice único parcial sólo lo impide si ya hay otra `ABIERTO` en el dispositivo. | Prohibir la transición `CERRADO → ABIERTO` en `update-caja` (validar contra `entity.estado`); reapertura sólo por canal dedicado y auditado. |
| P4 | Media | `electron/handlers/financiero.handler.ts` (`update-caja`) | Camino de ajuste **sin motivo ni traza**: la regla 2 exige `AJUSTAR` pero no `ajuste:{motivo}`, y `update-caja` no llama a `estamparTrazaAjuste`. A diferencia de gastos/retiros, se modifica una caja `CERRADO` sin dejar `motivoAjuste`/`revisado`/`revisadoPor`. Responde a «¿ajustar sin motivo?»: **sí, por este camino**. | Reusar `assertCajaOperableConAjuste`/exigir `ajuste.motivo` y estampar traza también en `update-caja` sobre `CERRADO`. |
| P5 | Media | `ventas.handler.ts` (`createVenta`), `compras.handler.ts` (`createPago`) | El guard lee `data?.caja?.id ?? data?.caja`, pero la persistencia es `repo.create(data)`. Si el cliente envía el **FK crudo** (`caja_id`) en lugar del objeto anidado, la lectura es `null` (guard `no-op` / `assertCajaAbiertaSiVino` no dispara) y `repo.create` podría honrar la columna → escritura contra caja cerrada. **No verificable sin probar el comportamiento de TypeORM 0.3.** | Normalizar la entrada a `caja:{id}` y **descartar** `caja_id`; o derivar la caja server-side y descartar cualquier caja del payload. |
| P6 | Media | `compras.handler.ts` (`createPago`, `createPagoDetalle`), `ventas.handler.ts` (`cerrarVentasAbiertasMesa`), `gastos-caja.handler.ts`, `caja-mayor.handler.ts` (`create-retiro-caja`) | Se pasa `dataSource` (no el `manager`/`queryRunner.manager`) al guard en canales cuya escritura no está envuelta en transacción → TOCTOU con un cierre concurrente. El propio helper documenta que pasar el `DataSource` convierte el guard en un no-op transaccional. | Envolver guard + `save` en una transacción y pasar el `manager`/`queryRunner.manager`, como ya se hizo en `createVenta`/`update-caja`. |
| P7 | Baja | `electron/utils/caja-abierta.utils.ts` (`estamparTrazaAjuste`) | La traza (`revisado`, `revisadoPor`, `motivoAjuste`) se estampa **fuera** de la transacción de la escritura. Si falla, queda el gasto/retiro ajustado **sin traza**. | Ejecutar la escritura del gasto/retiro y la estampación en la **misma** transacción. |
| P8 | Baja | `gastos-caja.handler.ts`, `caja-mayor.handler.ts` | Los ajustes (`create/edit/anular-gasto`, `create-retiro`) cambian el arqueo y `revisado` pero **no emiten** `CAJA_CAMBIO`; sólo lo hacen `create-caja`, `update-caja`, `abrir-caja-desde-conteo` y la estampación manual. Vistas del PdV/arqueo quedan rancias. | Emitir `CAJA_CAMBIO` post-commit también en esos canales. |
| P9 | Baja | `electron/handlers/financiero.handler.ts` (`create-caja`) | Si el payload trae `estado: 'CERRADO'`, se saltea el guard de duplicado (sólo corre para `ABIERTO`) y se crea una caja `CERRADO` con `dispositivo` elegido por el cliente. El índice parcial no la cubre. | Validar estado permitido y `dispositivo` en el create; no permitir crear `CERRADO` por este canal. |
| P10 | Baja | `electron/utils/mesa-emit.utils.ts` (`emitCajaCambio`) | El evento se difunde a **todas** las terminales sin filtrar por dispositivo/usuario (`broadcastMesaEvent`), exponiendo `cajaId`/`cajaEstado`/`dispositivoId` de cajas ajenas a clientes /admin y PWA. | Emitir por sala/dispositivo, o filtrar en el bus antes del broadcast. |

## Riesgos

- **Fugas de PII:** `delivery-listar-pdv` sólo agrega `caja.estado` (no arrastra `createdBy`, correcto según el comentario). El payload de `CAJA_CAMBIO` no trae usuario/persona. **No veo fuga nueva de entidades completas con usuario/persona en este diff.** El `leftJoinAndSelect('venta.pago', 'pago')` ya existía y no fue tocado.
- **Mensajes de error:** `errorCajaCerrada`/`errorCajaAbiertaDuplicada` exponen `id` de caja y fecha de cierre; no son PII, riesgo bajo. El error de `materializarPedidoOnlineEnVenta` expone ids de caja. Aceptable.
- **Traza de ajuste débil:** aun con P4/P7 resueltos, `estamparTrazaAjuste` marca `revisado = true` en el primer ajuste, lo que puede «revisar» una caja que todavía tiene movimientos sin revisar. Verificar semántica con Financiero.
- **Reimputación de `Pago` en `updateVenta`:** el `update` directo de `pago.caja` no pasa por `bloquearSiPagoConsolidado`; si el pago ya está consolidado, se desincroniza. **No verificable** (no veo el resto del handler).
- **Reapertura (P3) + índice único:** si el índice no existe (instalación con duplicados que la migración saltó), una reapertura puede dejar dos cajas `ABIERTO` en el mismo dispositivo sin que nada lo impida.
- **`asegurarIndicesOpcionales`:** si hay duplicados, sólo loguea y deja la instalación **sin el control primario** del invariante hasta que un humano cierre las sobrantes. Documentado, pero es un residuo operativo que conviene monitorear/alarmar.
- **Migración/índice:** no borra ni modifica filas de negocio (bien). El `down` es `DROP INDEX IF EXISTS` limpio.

## No verificable

Sin acceso al repo, quedan fuera de verificación directa por el diff:

1. Que `ensurePermission` sea la **primera sentencia** en `create-gasto-caja`, `edit-gasto-caja`, `delivery-crear`, `createVenta`, `updateVenta`, `transferir-venta-pdv` y `registrarCobroParcial` (los hunks no muestran el inicio del handler).
2. El permiso exacto de `edit-gasto-caja` (comentario «solo admin y gerente») y del handler que estampa `motivoAjuste`/`revisado` a mano (`finalizar-ajuste-caja`, ~línea 898): el diff **no** muestra su `ensurePermission`. Si no exige `FINANCIERO_CAJA_AJUSTAR`, sería otro camino de ajuste sin el permiso. **Revisar.**
3. Si `updateVenta` hace `merge` de `caja` desde el payload (posible reimputación de la venta a una caja cerrada, ya que el guard mira la caja **original** de `filaVenta.c`).
4. Si TypeORM 0.3 honra un FK crudo (`caja_id`) en `repo.create(data)` — determina si P5 es explotable o sólo teórico.
5. Si `createPago`/`createPagoDetalle`/`cerrarVentasAbiertasMesa` corren dentro de alguna transacción no visible en el hunk.
6. Que `Caja.dispositivo` sea realmente `NOT NULL` (afecta a P9) y la semántica de `setEntityUserTracking(..., isUpdate=true)` respecto de `createdBy` (afecta a P2).
7. Que `filaVenta.c` se derive siempre server-side (si el cliente pudiera influir, cambiaría la lectura de la caja de la venta en `updateVenta`).
8. Comportamiento de `broadcastMesaEvent` respecto de autenticación/alcance del SSE hacia /admin y PWA (base de P10).

---


**Modelo:** DeepSeek Flash (deepseek-flash vía heavy-llm, text-only, sin acceso al repo)

## Veredicto parcial

La suite nueva es amplia y en su gran mayoría **discriminante**: casi todos los bloques nuevos fallan si se revierte su fix específico, hay positivos explícitos para las operaciones que el guard podría romper por exceso ([19], [22], [0], [9], [11], [23], [25]) y los negativos tocan el camino real (handler + `withRequestUser`), no sólo helpers. Tres matices bajan el poder discriminante sin invalidar el PR:

1. **El “después del commit” y el “scope de la transacción” no están gateados por ningún test que corra en CI sin Postgres.** Los propios comentarios del archivo (`test-caja-apertura-e2e.ts` [9] y [13]) reconocen que en SQLite una sola conexión los vuelve indiferentes; no hay un equivalente en `test-locks-postgres-e2e.ts` para el evento `CAJA_CAMBIO`.
2. **[20] (`caja-cerrada`) discrimina D4 capa 2 pero no reproduce la pre-condición exacta del incidente** (pago con `caja` CERRADA adoptado por `updateVenta`): usa `cajaAbierta` (ABIERTA) como caja del pago, porque el guard de [2] impediría crearla cerrada por el handler. El assert sigue discriminando la reimputación; no el estado “pago en caja cerrada”.
3. **Faltan positivos de algunas operaciones sensibles** (`cobrar-venta-credito`, `edit/anular-gasto-caja` con cajero sin AJUSTAR, retiro manual en caja abierta sin `ajuste`).

**Q2 — Escenario real del bug.** El flujo `createPago` **sin** `ventaId` + `updateVenta{pago}` está testeado en [20] y **discrimina** capa 2: sin la reimputación, `cajaDePago(pagoViejo)` se queda en `cajaAbierta` y el assert final cae. Lo que **no** está reproducido es que `pago.caja` apunte a una caja **CERRADA** en el momento de la adopción (el estado real de los 52 cobros del incidente): el test crea el pago con `cajaAbierta` (ABIERTA) porque el guard de `createPago` lo bloquea con la cerrada; para reproducirlo habría que sembrar el `Pago` por repositorio, burlando el handler, y no se hace. **Q2 ≈ sí en el discriminante de la capa 2; no en la fidelidad al estado pre-fix.**

**Q3 — Permisos y cache.** Se usan **dos usuarios distintos** (`cajero` sin AJUSTAR, `gerente` con AJUSTAR) en `test-caja-apertura-e2e.ts` [7]/[8]/[13] y en `test-caja-cerrada-e2e.ts` [13]/[15-16]; los asserts de con/sin permiso pasan por `withRequestUser`, el camino de `/api/rpc`. **No vi falsos verdes por cache**: no hay ningún lugar donde al mismo usuario se le cambie el permiso entre dos asserts del mismo bloque.

## Hallazgos — tabla `ID | Severidad | Archivo | Hallazgo | Fix concreto`

| ID | Severidad | Archivo | Hallazgo | Fix concreto |
|----|-----------|---------|----------|--------------|
| D1 | Alta | `test-caja-apertura-e2e.ts` [13] | El assert “al emitirse, la base ya tenía la caja CERRADO (el evento va después del commit)” **no discrimina en SQLite** (una sola conexión) y **no existe un equivalente en `test-locks-postgres-e2e.ts`**. El claim “post-commit” queda sin gate real. | Añadir a `[F]` de `test-locks-pg` un listener que, al recibir `CAJA_CAMBIO`, ejecute `SELECT estado FROM cajas` en una **segunda conexión** y afirme `CERRADO`. Sin eso, mover el `emit` adentro de la transacción no rompe ningún test. |
| D2 | Alta | `test-locks-postgres-e2e.ts` [F] | El único gate real del invariante “una sola ABIERTO por dispositivo” **se saltea sin Postgres**; en la mayoría de CI no corre. | Marcar el workflow de PR como bloqueante con Postgres service o un job dedicado; de lo contrario, el invariante no está gateado por CI por defecto. |
| D3 | Media | `test-caja-cerrada-e2e.ts` [20] | Aproxima, no reproduce, la pre-condición real de D4 capa 2 (`pago.caja` = caja CERRADA). No se cubre el caso “el PdV manda un pago con `caja` cerrada y recién `updateVenta` lo adopta”. | Sembrar el `Pago` por `R(Pago).save` con `caja: cajaCerrada` y luego `updateVenta(ventaDeOtraCaja, { pago })`; verificar reimputación a `cajaOtra`. O documentar la aproximación como tal en el header. |
| D4 | Media | `test-caja-apertura-e2e.ts` [9] y [13] | Asserts de “scope de transacción” (retiro del cierre dentro vs. fuera) documentados como no discriminantes en SQLite; no hay replicación en la suite PG. | Añadir en `[F]` un cierre/envío de retiro en dos conexiones (patrón `F3`) que verifique que el `RetiroCaja` no ve la tx sin commitear. |
| D5 | Media | `test-caja-apertura-e2e.ts` [2] | `guardarAperturaTraduciendoDuplicado` se prueba llamando al **helper directo**, no al handler `create-caja` (documentado). En SQLite, el guard + lock atajan todos los caminos por handler y la traducción sólo queda cubierta por PG. | Aceptable **siempre que corra `[F2]` en PG**. Añadir una nota al job: “sin PG, la traducción no está gateada”. |
| D6 | Media | `test-caja-cerrada-e2e.ts` [10] | `cobrar-venta-credito` sólo se prueba como **negativo** (caja cerrada). No hay positivo en caja abierta → riesgo de que un guard over-broad rompa el flujo legítimo sin que se detecte. | Añadir bloque positivo: cliente + venta + caja abierta + `cobrar-venta-credito` → concluye. |
| D7 | Media | `test-caja-cerrada-e2e.ts` [15/16] | `edit-gasto-caja` y `anular-gasto-caja` sobre caja cerrada sólo se prueban con `gerente` (que tiene AJUSTAR). No hay caso cajero-sin-AJUSTAR que verifique que el rechazo es por permiso y no por caja, ni el orden de las reglas. | Añadir rechazo con `cajero` y assert de que el mensaje es de permiso (no `CAJA_CERRADA`). |
| D8 | Media | `test-caja-cerrada-e2e.ts` [8] | `crear-vale-caja` y `pagar-compra-cuota-caja` usan `funcionarioId: 1` y `cuotaId: 1` **inexistentes**. El assert sólo discrimina si el guard de caja corre **antes** que la validación de FK. | Sembrar un funcionario y una cuota reales o aseverar explícitamente el orden de validación en un comentario, para que no dependa de la implementación interna del handler. |
| D9 | Baja | `test-caja-apertura-e2e.ts` [13], `test-caja-cerrada-e2e.ts` [17] | Espera de eventos con `setTimeout(50ms/100ms)`. Flaky en CI lento o máquinas cargadas. | Usar un poll `waitFor(pred, { timeout: 2s, interval: 20 })` sobre `eventos.length`. |
| D10 | Baja | `test-caja-cerrada-e2e.ts` [17] | Cierra **globalmente** todas las cajas ABIERTO y las repone al final del bloque, **sin `try/finally`**. Si algo entre medio lanza (una `save` con FK rota, por ejemplo), el estado compartido queda contaminado y los bloques siguientes operan contra una base distinta a la esperada. | Envolver el cierre/reposición en `try/finally` y hacer `await reponer()` antes de cada assert que dependa del estado. |
| D11 | Baja | `test-caja-apertura-e2e.ts` [14] | El bloque depende de fechas futuras inyectadas (`Date.now() + 1h/2h`) para que `get-caja-abierta-by-usuario` devuelva la correcta pese a las cajas creadas antes. Dependencia del reloj del sistema y de la composición previa de la base. | Congelar reloj con `fake-timers` o exponer el set de cajas como fixture determinista (`fechaApertura` con offset fijo desde una base acordada). |
| D12 | Baja | `test-caja-apertura-e2e.ts:197` (aprox.) | `DELETE FROM typeorm_migrations WHERE name = 'CajaUnicaAbiertaPorDispositivo1790617935368'` tiene el **timestamp del nombre hardcodeado**. Si el timestamp de la migración cambia, el DELETE no matchea, la migración no se re-ejecuta y el bloque queda tautológico (el pre-chequeo no se ejerce). | Exportar el nombre desde el módulo de migración y usarlo en el test. |
| D13 | Baja | `test-caja-cerrada-e2e.ts` [22] | “deviceId ajeno” sólo se prueba con `createVenta`. No se prueba el mismo contexto para `createPago`/`createPagoDetalle`, que es donde el pago quedaba imputado a la caja equivocada. | Añadir un positivo `createPago` con `deviceId: tablet.id` y `caja: cajaAbierta` y verificar que `pago.caja === cajaAbierta.id` (la del payload, si no vino `ventaId`). |
| D14 | Informativa | `test-delivery-e2e.ts`, `test-integridad-cobro-e2e.ts`, `test-terminal-caja-e2e.ts` | Los cambios son **sólo de fixture** (una terminal por caja, cerrar la anterior antes de abrir la nueva). No añaden poder discriminante al guard ni al índice; acomodan al nuevo invariante. | Nada; sólo dejar constancia de que la cobertura del fix no está acá. |
| D15 | Baja | ambos tests nuevos | `nuevaDb` hace `unlink` **antes** de crear la base, pero **no limpia al terminar**. Se acumulan `.tmp/*.db` entre corridas. | Añadir `unlink(dbFile)`/`unlink(dbDup)` en `finally`. |
| D16 | Baja | `test-caja-cerrada-e2e.ts` [13] | El bloque de “retiro CIERRE INGRESADO bloquea ajuste” sólo prueba con `gerente` (con AJUSTAR). No se cubre que, con cajero sin permiso, el rechazo sea *por permiso* antes de llegar al chequeo del retiro: la precedencia declarada queda sin gate. | Añadir un assert con `cajero` y verificar el código de permiso. |

## Matriz resumida (bloque → fix que lo sostiene → ¿discrimina?)

| Bloque | Fix que lo sostiene | ¿Discrimina? |
|--------|--------------------|--------------|
| apert [1] índice existe | `CajaUnicaAbiertaPorDispositivo` en migraciones | **sí** |
| apert [2] INSERT crudo / matcher / traducción | índice + `esViolacionCajaUnicaAbierta` + `guardarAperturaTraduciendoDuplicado` | **dudoso** (helper directo; sin PG, traducción huérfana — D5) |
| apert [3] create-caja duplicada (con y sin `estado`) | guard de `create-caja` + traducción | **sí** |
| apert [4] abrir-caja-desde-conteo ocupado | guard del handler | **sí** |
| apert [5] mensaje idéntico en ambos canales | traducción + texto | **sí** |
| apert [6] dos CERRADAS conviven | parcialidad del índice | **sí** |
| apert [7] update-caja CERRADO→CERRADO | regla 1 de D7 (orden antes del permiso) | **sí** |
| apert [8] update sobre CERRADO exige AJUSTAR | regla 2 + dos usuarios | **sí** |
| apert [9] retiro del cierre | `generarRetiroDelCierre` fuera de la tx (SQLite no lo discrimina) | **sí** para la regresión “existe el retiro”; **dudoso** para el scope |
| apert [10] `Promise.all` | `withAperturaCajaLock` | **dudoso** (documentado como no-criterio; cubre interleaving SQLite) |
| apert [11] migración con duplicados | pre-chequeo + `return` en lugar de throw | **sí** |
| apert [12] `asegurarIndicesOpcionales` | reintento idempotente | **sí** |
| apert [13] CAJA_CAMBIO | `emitCajaCambio` post-commit + no-emisión si falla | **sí** para emisión/payload; **dudoso** para “post-commit” (D1) |
| apert [14] get-caja-abierta-by-usuario | `order { fechaApertura: DESC, id: DESC }` | **sí** (con dependencia de fechas futuras — D11) |
| cerrada [0] fixture normal | “no-cerrar por exceso” | **sí** (positivo) |
| cerrada [1]–[7], [10], [12] individuales | `assertCajaAbiertaSiVino` por handler | **sí** (uno por canal) |
| cerrada [8] mensaje unificado de pdv-egresos | `errorCajaCerrada` en `validarCaja` | **dudoso** (IDs inválidos — D8) |
| cerrada [9] D4 capa 1 | derivación de `pago.caja` desde `ventaId` | **sí** |
| cerrada [11] Q2 transferencia | bloque “Invariante de caja” (Q2) | **sí** (incluye control con origen abierto) |
| cerrada [13] ajuste post-cierre | permiso + motivo + retiro INGRESADO | **sí** para permiso/motivo; **dudoso** para precedencia con cajero (D16) |
| cerrada [14] CANCELADA sobre cerrada | exención §5.2 | **sí** |
| cerrada [15/16] edit/anular gasto | guard + ajuste | **sí** como bloque; cajero-negativo faltante (D7) |
| cerrada [17] materializar con fallback | B7 fallback a única abierta | **sí** (con manipulación global — D10) |
| cerrada [18] cerrarVentasAbiertasMesa | guard + exención CANCELADA | **sí** |
| cerrada [19] cobro completo en abierta | “no-cerrar por exceso” | **sí** |
| cerrada [20] flujo D4 capa 2 sin `ventaId` | reimputación en `updateVenta` | **sí** para capa 2; **dudoso** para el estado pre-fix (D3) |
| cerrada [21] Q1 delivery de caja cerrada | guard de `createPago` + `lista.cajaCerrada` | **sí** |
| cerrada [22] deviceId ajeno sobre abierta | “no confundir otra terminal con cerrada” | **sí** (parcial — D13) |
| cerrada [23] anularCobroParcial con cerrada | exención §5.2 | **sí** |
| cerrada [24] helper lock en SQLite | `leerEstadoCaja` + `assertCajaAbierta` | **sí** |
| cerrada [25] exenciones restantes | `deleteVenta`, `delivery-cancelar`, `generar-retiro-cierre-caja`, cascada `anular-vale` | **sí** (incluye el contraste directo vs. cascada) |
| PG [F1] índice en Postgres | índice + matcher `23505` | **sí** (pero skip sin PG — D2) |
| PG [F2] dos `create-caja` concurrentes | índice + traducción | **sí** — es el único gate real |
| PG [F3] `FOR UPDATE` vs `FOR SHARE` | `lock: 'write'` / `lock: 'read'` | **sí** |
| PG [F4] lock del helper vs. outer join | columnas escalares en `leerEstadoCaja` | **sí** |
| SSE test 4 (CAJA_CAMBIO) | `emitCajaCambio` + payload | **sí** para contrato; **no** para “post-commit” (emite directo por helper) |

## Riesgos

- **Alta**: por D1, un refactor que mueva `emitCajaCambio` adentro de la transacción no romperá `test:caja-apertura` en CI sin Postgres. El incidente fue justamente PdV soltando cajas viejas; el “después del commit” es la garantía declarada y no está gateada.
- **Alta**: por D2, sin Postgres en CI, `Promise.all` (apert [10]) sigue en verde aunque se elimine `withAperturaCajaLock` o el índice, y toda la concurrencia real depende de que alguien corra `test:locks-pg` a mano.
- **Media**: por D3, la combinación “pago nace en caja cerrada y recién después se adopta” no está reproducida. Es la variante de D4 capa 2 que puede aparecer con desktops viejos extremos.
- **Media**: por D6, no hay positivos para `cobrar-venta-credito` sobre caja abierta; un guard over-broad pasaría inadvertido.
- **Baja**: robustez (D9, D10, D11, D15) — probable que aparezca flakiness esporádica en CI sin que se correlacione con commits reales.

## No verificable

- Que `assertCajaAbiertaSiVino` / `assertCajaOperableConAjuste` estén efectivamente aplicados en **todos** los write paths mencionados por el PR: el diff sólo muestra tests, no el código de producción.
- Que el cache de permisos sea realmente *per-user + TTL 30 s* (el header lo afirma, no lo puedo comprobar). Si fuera global o por proceso, los asserts con dos usuarios no protegerían contra cross-contaminación.
- Que `mesaEvents.on('change')` sea el mismo canal consumido por el PdV (ni el filtro por `tipo`/`cajaId` del cliente).
- Que `get-caja-abierta-by-usuario` sea la llamada real que hace el PdV para recargar su caja (el comentario dice `pdv.component.ts:372-374`, pero no tengo el archivo).
- Que el nombre exacto de la migración a borrar en `test-caja-apertura` [11] sea `CajaUnicaAbiertaPorDispositivo1790617935368` (no puedo comprobarlo sin el repo).
- Que el driver `sqlite3` con TypeORM sobre una sola conexión realmente comparta tx entre `dataSource.transaction()` invocadas en paralelo (los tests [10]/[17] lo asumen vía comentario; no lo puedo reproducir).
- Que el orden de validación en `crear-vale-caja` / `pagar-compra-cuota-caja` sea “guard de caja antes de FK” (D8), ni el de reglas D7 en `update-caja`.