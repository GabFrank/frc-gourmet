# Auditoría Plan A — caja cerrada guard (eje Alcance y Convenciones)

**Auditor:** A — Alcance y convenciones
**Modelo:** DeepSeek Flash (deepseek-flash vía harness heavy-llm, text-only, sin acceso al repo)
**Fecha:** 2026-09-28
**Plan auditado:** docs/planes/PLAN-caja-cerrada-guard.md (commit be087b79)

## Veredicto

**APROBADO CON CAMBIOS.** El plan cubre los cuatro frentes del pedido con decisiones explícitas, un helper central bien ubicado y una matriz de tests discriminantes (con columna "qué revertir para que falle") que es lo mejor del documento. La disciplina de "no corrección retroactiva" está clara y la migración no toca datos de negocio. Los hallazgos ALTA no invalidan el plan pero deben resolverse antes de implementar: dos canales de escritura quedaron fuera del inventario (§3), la PWA `caja-cerrar` no aparece con manejo del nuevo error, y Q1 (cobrar un delivery de una caja cerrada) es una pregunta que en la práctica decide si ese delivery puede cobrarse alguna vez. Ningún hallazgo es BLOQUEANTE.

## Hallazgos

| ID | Severidad | Sección del plan | Hallazgo | Propuesta concreta |
|---|---|---|---|---|
| A1 | ALTA | §5.2 / §13 Q1 | Rechazar el cobro de un delivery pendiente de caja cerrada implica que ese delivery **sólo se puede cancelar, nunca cobrar** (no hay reapertura en el plan). Es una pregunta abierta que decide operación del turno. | Cerrar Q1 **antes** de implementar la Fase 3. Si se rechaza, documentar en el manual el flujo de cancelación + reventa, y añadir un aviso en `delivery-listar-pdv` cuando la caja de la venta está cerrada. |
| A2 | ALTA | §3 / §5.1 / §5.2 | `anularCobroParcial` (canal real según el índice) no aparece en el inventario ni en las tablas de canales. Anular un cobro parcial sobre una venta de caja cerrada no tiene decisión explícita. | Incorporarlo a §5.2 como **permitido** (resta, mismo argumento que CANCELADA), con su guard de permisos y su assert en `test:caja-cerrada`. |
| A3 | ALTA | §3 | `deleteVenta` no figura en el inventario de escrituras que tocan `caja_id`. Si borra una venta CONCLUIDA con `caja_id` de una caja cerrada, no tiene decisión. | Sumarlo al inventario y decidir explícitamente (probablemente "permitido con permiso + traza", como CANCELADA) o excluirlo documentando por qué no afecta el arqueo. |
| A4 | ALTA | Fase 2 / §9 | El plan declara que `projects/mobile/.../caja-cerrar.page.ts:96` es uno de los dos únicos llamadores de `updateCaja`, pero **no lo lista en ninguna fase** con manejo del nuevo error `CAJA_CERRADA`/`CAJA_ABIERTA_DUPLICADA`. | Agregar la página de la PWA a la Fase 2/3 con mensaje en español y revalidación de caja, igual que `caja-abrir.page.ts:100`. |
| A5 | MEDIA | §7 | El índice parcial `UNIQUE (dispositivo_id) WHERE estado='ABIERTO'` **no cubre** cajas con `dispositivo_id IS NULL` (NULL no colisiona consigo mismo en Postgres ni SQLite). El pre-chequeo agrupa sólo por `dispositivo_id` y tampoco detecta ese caso. | Verificar si `dispositivo_id` es NOT NULL por diseño. Si puede ser NULL, agregar al pre-chequeo un conteo de cajas ABIERTO con `dispositivo_id IS NULL` y decidir (fail o log). Documentar la limitación del índice. |
| A6 | MEDIA | §7 | Contradicción interna: el texto dice que "la migración es driver-aware, porque el pre-chequeo y el mensaje de log lo son", pero el snippet no tiene ningún branch por `queryRunner.connection.options.type`. | O agregar el branch explícito (aunque el SQL sea portable), o reformular el texto a "el SQL es portable entre ambos drivers y por eso no ramifica". |
| A7 | MEDIA | D14 / R3 | `password-recovery.handler.ts:189` aparece en R3 como riesgo de `save()` sobre entidad sin columna, pero **no está en la tabla de los 7 caminos que necesitan `addSelect`**. Si ese handler lee el hash, falta el `addSelect`; si no lo lee, el riesgo R3 no aplica ahí. | Revisar el handler; si lee el hash, agregarlo a la tabla D14 y al test `test:sin-fuga-datos` (caso 5). |
| A8 | MEDIA | Fase 5 | No se actualiza el **manual de usuario** (PdV, Financiero, Caja Mayor) pese a que el PR cambia UX visible (aviso de caja cerrada, jornada anterior, cierre de caja cerrada, motivo de ajuste). Tampoco se menciona `todos-pendientes.md` para las deudas residuales (los ~20 canales `persona`). | Agregar ambos a la Fase 5. La deuda residual de `persona` debería vivir en `todos-pendientes.md` además del `known-bugs.md`. |
| A9 | MEDIA | §11 / §12 | No hay test automatizado del **componente PdV** que reproduzca "PdV con caja vieja en memoria + Financiero cierra". El test del backend cubre el guard; el escenario del bug en el front queda sólo en el sandbox manual §12. | Proponer un spec de componente (Karma/Jasmine) que simule el `CAJA_CAMBIO`/`CAJA_CERRADA` y verifique el bloqueo y el reinicio de caja. Si no es viable, documentarlo como decisión explícita en el plan. |
| A10 | MEDIA | D13 | El contrato de `SeleccionarCajaDialogComponent` devuelve hoy `{ caja }` o `{ abrirNueva }`; el plan le agrega la salida "Ir a cerrarla" pero no define el resultado ni el branch correspondiente en `pdv.component.ts`. | Definir en D13 el nuevo resultado (p. ej. `{ cerrar }`) y el handler asociado en `pdv.component`. |
| A11 | MEDIA | D4 / §9 | Un cliente viejo en `mode=client` que cobra **sin `ventaId`** y con `caja` desactualizada sigue pasando el guard contra la caja equivocada (sólo el camino con `ventaId` deriva de la venta). | El plan lo menciona en §9 pero sin decisión. O aceptar explícitamente el riesgo residual (con nota en release) o exigir `ventaId` cuando el cobro viene del diálogo de cobro de venta. |
| A12 | BAJA | §11 | El test `test:caja-cerrada` no cubre explícitamente `anular-gasto-caja`, `edit-gasto-caja`, `materializarPedidoOnlineEnVenta` ni `cerrarVentasAbiertasMesa`, aunque sí están en §5.1. La matriz "revertir para que falle" no es 1:1 con la tabla de canales. | Agregar asserts por canal faltante para que ningún guard quede sin su test discriminante. |
| A13 | BAJA | D11 / §5.2 | `finalizar-ajuste-caja` hace `cajaRepo.save` directo y no emite `CAJA_CAMBIO`. El plan sólo lista `update-caja`, `create-caja` y `abrir-caja-desde-conteo`. | Emitir `CAJA_CAMBIO` también desde `finalizar-ajuste-caja` (o justificar por qué no hace falta). |
| A14 | BAJA | D8 | El `order: { fechaApertura: DESC, id: DESC }` en `get-caja-abierta-by-usuario` es una mejora no pedida. Scope creep menor, justificado pero fuera del eje del bug. | Mencionarlo como mejora colateral aceptada o sacarlo del PR. |
| A15 | BAJA | §13 Q5 | El pedido original pide **un solo plan**. Q5 ofrece partir la Fuga en otro PR, lo cual es razonable de ejecución pero puede leerse como cambio de alcance. | Reformular Q5 como "un plan, uno o dos PRs de ejecución", aclarando que el plan sigue cubriendo los cuatro frentes. |

## Cobertura del alcance

Checklist contra el pedido original de Gabriel:

**Frente 1 — Backend rechaza operaciones sobre caja no ABIERTA**

| Ítem | Estado |
|---|---|
| `createVenta` con guard en transacción | Cubierto (§5.1, D2, D3) |
| `createPago` + líneas de pago con caja derivada de la venta | Cubierto (D4, §5.1) — incluye `createPagoDetalle` server-side |
| `delivery-crear` | Cubierto (§5.1, transacción) |
| `create-gasto-caja` / `create-retiro-caja` | Cubierto con flag de ajuste (D6, §5.2) |
| Vales/adelantos si imputan caja | **Parcial**: se unifica mensaje a `CAJA_CERRADA`; el plan verifica que ya validaban `estado`. `anular-egreso-caja` desde `anular-vale` queda sin guard, justificado |
| "Cualquier otro handler que escriba con `caja_id`" | **Parcial**: inventario de 5 entidades correcto, pero faltan `anularCobroParcial` (A2) y `deleteVenta` (A3) |
| Decisión explícita retiros/ajustes post-cierre sin romper cierre/Caja Mayor | Cubierto: D5 + D6 + §5.2 |
| Helper central | Cubierto: `electron/utils/caja-abierta.utils.ts` (D2), con justificación de por qué no va en `terminal-caja.utils.ts` |

**Frente 2 — PdV revalida la caja**

| Ítem | Estado |
|---|---|
| Revalidar al volver foco/visibilidad/activar tab | Cubierto (D11, Fase 3) |
| Revalidar antes de cobro/venta/delivery | Cubierto (D12) |
| SSE al cerrar una caja | Cubierto con limitación declarada (SSE sólo en `server`) y mitigación por IPC `mesa-updates` (D11) |
| Bloquear + avisar «Esta caja ya fue cerrada» + volver a elegir/abrir | Cubierto (D12) |
| Aviso al entrar si la única caja abierta es de jornada anterior | Cubierto (D13, con PdvConfig leído antes de `inicializarCaja`) |

**Frente 3 — Cierre**

| Ítem | Estado |
|---|---|
| Cerrar caja sobre caja cerrada da error claro | Cubierto (D7, con las dos reglas) |
| Índice único parcial en Postgres + equivalente SQLite | Cubierto (D9) — con salvedad NULL (A5) |
| Migración desde el diseño | Cubierto (§7, alta en `database.config.ts`) |
| Control de apertura en transacción (`create-caja` y `abrir-caja-desde-conteo`) | Cubierto (D10) |
| Verificar duplicados existentes y cómo los maneja la migración | Cubierto: pre-chequeo, no aborta, no cierra cajas, log explícito (§7) |

**Frente 4 — Fuga de datos**

| Ítem | Estado |
|---|---|
| `get-caja`, `getResumenCaja`, `getVentasByDateRange`, `get-retiros-caja` sin hash ni datos personales | Cubierto (D14 + recorte de 10 canales) |
| "Cualquier otro RPC que hidrate usuario/persona" | **Parcial**: `select:false` lo resuelve sistémicamente para el hash; los datos de `persona` se recortan en 10 canales y los ~20 restantes quedan como deuda anotada |
| Patrón general + fix sistémico | **Parcial**: el fix sistémico existe para el hash (`select:false`); para `persona` el plan opta por recorte por canal y descarta el sanitizador central con tres razones concretas (rompe `db-config`, costo runtime, falsa cobertura). La decisión está argumentada, pero conviene señalar que no es "sistémico" en el sentido estricto del pedido |

**Restricciones**

| Restricción | Estado |
|---|---|
| No corrección retroactiva / no scripts de reimputación | Cubierto explícito (§2 no-objetivos, §7 migración sin `UPDATE`/`DELETE`) |
| El planner no implementa | Cubierto (el plan es plan) |
| `ensurePermission` primera sentencia en handlers que mutan | Cubierto (§8 uno por uno; "mover a primera sentencia del try" en `create-caja` y `abrir-caja-desde-conteo`) |
| Tests que reproduzcan el bug y sean discriminantes | Cubierto en backend (§11 con columna "qué revertir"). **Parcial** en el front del PdV (A9: sólo sandbox manual) |
| Plan de test UI sandbox PdV (abrir, vender, cobrar, facturar, cerrar desde Financiero con PdV abierto, jornada anterior) | Cubierto (§12 pasos 1-18) |
| Convenciones de repo (rama, gates, docs, estilo) | Cubierto salvo manual de usuario y `todos-pendientes.md` (A8) |

## Riesgos

1. **Fail-open de `asegurarCajaAbierta` en hora pico.** D12 devuelve `true` si falla `get-caja`. Combinado con un cliente en `mode=client` y servidor caído, el PdV cobrará contra la caja en memoria hasta que el servidor vuelva, y recién entonces el usuario verá un `CAJA_CERRADA` (o `HTTP 500` crudo). El riesgo es aceptable, pero debe estar en las notas de release y en el manual para que el cajero no entre en pánico.
2. **Preguntas abiertas durante el rollout.** Q1 (cobrar delivery de caja cerrada) y Q2 (transferencia de mesa con caja origen cerrada) son decisiones operativas, no técnicas. Si se aprueban con la respuesta "rechazar", hay que entrenar al personal sobre los flujos alternos antes del deploy; si se deciden distinto, cambia el código de Fase 1 y 3.
3. **Migración silenciosa.** El pre-chequeo de D9 no aborta y sólo loguea `console.error`. En una instalación standalone de cliente nadie lee logs. La propuesta del plan de "no dejar la app sin arrancar" es correcta, pero el riesgo de "índice ausente y nadie se enteró" queda vivo. Q4 lo reconoce; **recomiendo resolverlo en este PR** con un aviso visible en Sistema en vez de dejarlo como pregunta abierta.
4. **Cajas ABIERTO con `dispositivo_id` NULL.** Si el diseño permite ese caso, el índice no protege y el guard transaccional del backend no está probado para esa ruta (ver A5). Bajo probabilidad, impacto medio.
5. **Clientes viejos en modo `client`.** UX degradada con `HTTP 500 {"error":"CAJA_CERRADA: ..."}`. El plan lo acepta y lo justifica, pero conviene una nota de release explícita sobre qué terminales hay que actualizar primero.
6. **Deuda residual invisible.** Si no se actualiza `todos-pendientes.md` (A8), los ~20 canales que siguen publicando datos personales se pierden.
7. **PWA y service worker.** El plan asume que la PWA se actualiza junto al nodo servidor. Si el service worker cachea el bundle viejo, la PWA podría seguir operando con el cliente previo. No verificable con el material, pero conviene un bump de versión explícito.

## Lo que no pude verificar

Sin acceso al repo, sólo puedo auditar contra el material aportado. Quedan como no verificables:

1. La existencia y semántica real de `deleteVenta` y `anularCobroParcial` respecto de `caja_id` (A2, A3): el plan no las menciona; puede que no toquen caja, pero el inventario no las declara.
2. Si `Caja.dispositivo_id` es nullable y si existen cajas ABIERTO con NULL en alguna instalación (A5).
3. El contenido real de `password-recovery.handler.ts` y si efectivamente requiere leer el hash (A7).
4. Si existen otros puntos de la PWA (fuera de `tomar-pedido.page.ts` y `caja-abrir.page.ts`) que creen ventas, pagos o deliveries con `caja_id`.
5. La lista completa de canales que hidratan `createdBy.persona` (~30 según el plan): sólo puedo auditar los 10 enumerados.
6. El comportamiento exacto de TypeORM 0.3 al `save()` sobre una columna `select:false` que no fue cargada (R3): el plan lo reconoce como riesgo y lo cubre con test, no con lectura.
7. Si el service worker de la PWA cachea el bundle (riesgo 7).
8. Si `SeleccionarCajaDialogComponent` está preparado para devolver una tercera salida (`cerrar`) sin refactor (A10).
9. Si `finalizar-ajuste-caja` u otros flujos de cierre alternativos emiten o deberían emitir `CAJA_CAMBIO` (A13).
10. Si hay otros llamadores de `update-caja` distintos de `create-caja-dialog.component.ts:1323` y `projects/mobile/.../caja-cerrar.page.ts:96`.
