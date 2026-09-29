# Plan — Guard de caja cerrada, una sola caja abierta por terminal y fuga de datos de usuario

> Branch: `fix/caja-cerrada-guard` · base `origin/develop` `a834cbef` (= `v1.21.0-alpha.165`, lo que corre hoy en Don Franco)
> Estado: **plan v2.1 — decisiones de Gabriel incorporadas** (2026-09-28) · implementación aprobada (ver §0)
> Investigación de origen: `/workspace/gourmet-investigacion-cajas-2026-09-25/INFORME.md` (solo lectura contra producción, 2026-09-28)
> Auditorías del paso 5 del ciclo: `docs/planes/AUDIT-PLAN-caja-cerrada-guard-A.md` (alcance y convenciones) y `docs/planes/AUDIT-PLAN-caja-cerrada-guard-B.md` (correctitud contra código). Las dos dieron **APROBADO CON CAMBIOS**; los dos bloqueantes de B están incorporados al cuerpo del plan (D4 y D9/D10) y el registro completo está en §15.

### Qué cambió en la v2 (resumen)

1. **D4 reescrito** (bloqueante B1): la derivación de la caja del pago no puede depender de un `ventaId` que hoy ningún call site manda. La Fase 1 pasa a incluir tres ediciones de frontend **y** una derivación server-side en `updateVenta` que funciona incluso con clientes viejos.
2. **D9/D10 corregidos** (bloqueante B2): el `FOR UPDATE` sobre cero filas **no** serializa. El **índice único parcial es el control primario** contra la doble apertura, no el cinturón. Se agrega un chequeo idempotente de arranque para que el índice se cree en cuanto la base queda limpia.
3. **Alcance de la transacción de `update-caja` acotado explícitamente** (B3): el retiro del cierre y el WhatsApp quedan **fuera**, después del commit, con test propio de no-regresión.
4. **Inventario de fuga ampliado** (B5) y **mapa de transportes corregido** (B6): en `mode=client` no hay notificación instantánea; es un riesgo aceptado y declarado.
5. **Q1 se decide antes de implementar la Fase 1** (A1), no en la Fase 3.

---

## 0. Decisiones de Gabriel (2026-09-28) — cierran §13

| # | Decisión | Efecto en el plan |
|---|---|---|
| **Q1** | Delivery vivo de una caja cerrada: **RECHAZAR**. Solo se puede cancelar y revender en la caja de hoy. | `createPago`/`createPagoDetalle`/`updateVenta{pago}` sobre una venta cuya caja está CERRADO → `CAJA_CERRADA`. `delivery-cancelar` sigue permitido (§5.2). `delivery-listar-pdv` marca la fila «caja cerrada: solo cancelar» y el PdV oculta «Cobrar» en esas filas. Manual (Fase 5): flujo cancelación + reventa. Assert 24 de `test:caja-cerrada` en su rama "rechazar". |
| **Q2** | Transferir mesa con caja de origen cerrada: **la venta nueva va a la caja activa**. | `transferir-venta-pdv` recibe un campo opcional `cajaActivaId` (el PdV manda `this.caja.id`, ya revalidada por `asegurarCajaAbierta`). Si `ventaOrigen.caja` está ABIERTO → comportamiento actual (hereda la caja de origen). Si está CERRADO → la venta destino **nueva** nace en `cajaActivaId` con `assertCajaAbierta(manager, cajaActivaId)`; en la rama "mover la venta entera" se reimputa `ventaOrigen.caja = cajaActivaId`. Los `Pago`/`CobroParcial` ya registrados **no** se mueven (quedan en la caja donde entró la plata). Cliente viejo sin `cajaActivaId` y origen cerrado → `CAJA_CERRADA` (el cajero actualiza o cancela). El test 11 de `test:caja-cerrada` pasa a: origen cerrado + `cajaActivaId` abierta → venta destino en la caja activa; origen cerrado sin `cajaActivaId` → `CAJA_CERRADA`; `cajaActivaId` cerrada → `CAJA_CERRADA`. R8 queda mitigado. |
| **Q3** | Aviso de jornada anterior: **corte por `PdvConfig.inicioJornadaHora`** (default 07:00). | D13 queda como está; sin umbral en horas. |
| **Q4** | Aviso de cajas duplicadas en *Sistema*: **no se incluye**. | Solo el reintento idempotente de arranque (D9/B4) + log. Se anota como deuda en `todos-pendientes.md` en el PR 2. |
| **Q5** | **Dos PRs**: primero **PR 1 = fuga de datos (Fase 4)**, después **PR 2 = guard de caja (Fases 1–3 y 5)**. | PR 1: rama `fix/usuario-password-select` desde `origin/develop`, independiente de este plan-branch; lleva su propio `test:sin-fuga-datos`, docs y test UI (login, cambio/guardado de contraseña, alta de usuario, caja/PdV básico). PR 2: `fix/caja-cerrada-guard` (esta rama), se rebasa sobre `develop` después del merge del PR 1; sus tests de caja no dependen de la Fase 4. |
| **Q6** | Cierre asistido de cajas abiertas varios días: **fuera de alcance**. | No se implementa; queda la advertencia de jornada anterior (D13). |

---

## 1. Contexto

El jueves 24/09 la caja **#122** se cerró a las 14:35 y la **#123** se abrió a las 14:39 desde *Caja Mayor → abrir caja desde conteo*. La pestaña PdV de la TERMINAL PRINCIPAL siguió con `this.caja = #122` (ya CERRADA) hasta la 01:54 del viernes, y el backend **aceptó todo**: 10 ventas nuevas, 52 cobros de ventas de la #123 con `pago.caja = 122`, 11 gastos por ₲1.111.000 y el retiro #155 — todo imputado a una caja cerrada. Después la #123 no se cerró a la noche y el viernes el PdV se unió a ella en silencio (era la única abierta), así que el almuerzo del viernes cayó dentro de la caja del jueves.

Resultado: **#122 sobrante +₲2.123.453 / +R$1.468**, **#123 faltante −₲2.092.850 / −R$1.451,75**. Juntas suman +₲30.603 / +R$16,25 — no falta plata, está mal imputada.

Nunca hubo dos cajas en estado `ABIERTO` a la vez: el solape fue **de hecho**, no de estado.

Como hallazgo separado, la misma investigación encontró que los RPC de lectura de caja (`get-caja`, `getResumenCaja`, `getVentasByDateRange`, `get-retiros-caja`, …) devuelven la relación `createdBy` hidratada entera, o sea el **hash bcrypt de la contraseña** del cajero y los datos personales de su `Persona`, a cualquier usuario con un JWT válido (`/api/rpc` es default-allow). Ya estaba anotado como deuda conocida en `.claude/skills/frc-gourmet-expert/reference/known-bugs.md:1085-1096`.

### Las cuatro causas, verificadas en el código de esta rama

| # | Causa | Evidencia |
|---|---|---|
| A | **El PdV resuelve la caja una sola vez y nunca la revalida.** | `src/app/pages/ventas/pdv/pdv.component.ts:327-355` (`inicializarCaja`, se une sola si hay 1 abierta en `:336-337`), `:410-427` (`aplicarCajaSeleccionada` → `this.caja = caja`). Desde ahí todo usa ese objeto: venta `:1996`, `:2018`, `:2311`; cobro `:2178`, `:2366`; delivery `:2490`; utilitarios `:2547`; cierre `:2447`, `:2471`. El único SSE que escucha es el de mesas/comandas (`:3185-3246`). |
| B | **Ningún handler que escribe con `caja` valida `caja.estado === ABIERTO`** (salvo los egresos del PdV). | `createVenta` `electron/handlers/ventas.handler.ts:997-1073`; `createPago` `electron/handlers/compras.handler.ts:1411-1443`; `createPagoDetalle` `:1484-1523`; `delivery-crear` `electron/handlers/delivery.handler.ts:293-322`; `create-gasto-caja` `electron/handlers/gastos-caja.handler.ts:18-40`; `create-retiro-caja` `electron/handlers/caja-mayor.handler.ts:1719-1747`. `evaluarTerminalCaja` **ya carga la Caja** y solo mira `dispositivo` (`electron/utils/terminal-caja.utils.ts:83-126`). |
| C | **`createPago` no exige `pago.caja === venta.caja`.** | `compras.handler.ts:1418-1422`: el gate de terminal lee `pagoData.caja` tal como vino del renderer; nadie compara contra la venta. Por eso hay 52 pagos con `caja=122` sobre ventas `caja=123`. |
| D | **Cerrar una caja ya cerrada no falla ni deja rastro.** | `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts:144-149` (`isViewMode = !data.ajuste`), `:1252-1254` (reutiliza `existingConteoCierre`), `:1316-1325` (**solo llama `updateCaja` si NO había conteo de cierre**). Sobre una caja cerrada muestra el cierre viejo y "completa" sin escribir nada. `update-caja` (`electron/handlers/financiero.handler.ts:686-754`) tampoco rechaza CERRADO→CERRADO. |

Y, latente (no fue la causa acá, pero es el mismo agujero):

| # | Causa | Evidencia |
|---|---|---|
| E | **La apertura es check-then-save sin transacción ni índice**, y el guard solo corre si `data.estado === 'ABIERTO'`. | `financiero.handler.ts:661-684`: `repo.count(...)` y después `repo.save(...)`, fuera de transacción; la condición `data?.estado === CajaEstado.ABIERTO` se saltea si el caller omite `estado` (la entidad tiene `default: CajaEstado.ABIERTO`, `src/app/database/entities/financiero/caja.entity.ts:37-42`). `abrir-caja-desde-conteo` (`caja-mayor.handler.ts:1938-1974`) tiene el mismo patrón con `findOne` en vez de `count`. |

---

## 2. Objetivo y no-objetivos

### Objetivo

1. Que el **backend** rechace con `CAJA_CERRADA` toda escritura de plata contra una caja que no está `ABIERTO`, salvo las excepciones legítimas enumeradas en §5, cada una con su llave explícita.
2. Que el **PdV** (y la PWA) detecte que su caja se cerró y deje de operar, en vez de seguir escribiendo contra ella.
3. Que la **base de datos** garantice una sola caja `ABIERTO` por dispositivo, y que cerrar una caja ya cerrada falle con un mensaje claro.
4. Que los RPC de lectura dejen de publicar el hash de contraseña y los datos personales innecesarios.

### No-objetivos (explícitos)

- **NO se corrigen retroactivamente los datos de producción.** Gabriel ya lo decidió: las cajas 122/123 quedan como están, y la reimputación propuesta en el §5 del informe **no** se ejecuta. Este PR no trae ningún script de corrección de datos ni ninguna migración que mueva filas de negocio.
- **NO se reabren cajas.** La única forma de tocar una caja cerrada sigue siendo el flujo de ajuste ya existente (`FINANCIERO_CAJA_AJUSTAR`).
- **NO se cierran cajas automáticamente**, ni en runtime ni en una migración. Si una base tiene dos cajas `ABIERTO` en el mismo dispositivo, se avisa y se deja la decisión a una persona (ver §7).
- **NO se cambia el modelo de caja compartida.** Una caja se abre en un dispositivo y cualquier otro se puede unir; eso sigue igual, y los flags `permitirPagosTerminalAjena` / `permitirFinalizarTerminalAjena` no se tocan.
- **NO se saneia toda la superficie de fuga de datos.** Hay ~30 canales que hidratan `createdBy.persona` (ver §9). En este PR entran el fix de raíz (`select: false` en `password`) y los 11 canales del dominio caja (10 de la v1 + `delivery-listar-pdv`, agregado por la auditoría); el resto queda anotado como deuda con su lista, en `known-bugs.md` **y** en `todos-pendientes.md`.
- **NO se agrega "una caja abierta por usuario"** — ver decisión D8.

---

## 3. Inventario verificado de escrituras con `caja`

Solo **cinco** entidades tienen FK a `cajas` (verificado con `grep -rln "caja_id" src/app/database/entities/`, descartando `caja_mayor_id` / `retiro_caja_id` / `egreso_caja_id`):

| Entidad | Archivo | Quién la escribe |
|---|---|---|
| `Venta` | `entities/ventas/venta.entity.ts` | `createVenta`, `materializarPedidoOnlineEnVenta`, `delivery-crear`, `transferir-venta-pdv` |
| `Pago` | `entities/compras/pago.entity.ts` | `createPago`, `cobrar-venta-credito` |
| `GastoCaja` | `entities/financiero/gasto-caja.entity.ts` | `create-gasto-caja` (único) |
| `EgresoCaja` | `entities/financiero/egreso-caja.entity.ts` | `pdv-egresos.handler.ts` (único creador; `vales.handler.ts:454-462` solo lo **anula**) |
| `RetiroCaja` | `entities/financiero/retiro-caja.entity.ts` | `create-retiro-caja`, `generarRetiroDelCierre` (`retiro-cierre.util.ts:71-89`) |

`PagoDetalle` no tiene `caja`: cuelga del `Pago`, y de ahí se deriva la caja (es el patrón que ya usa `createPagoDetalle` en `compras.handler.ts:1496-1503`).

**Dos canales que el inventario v1 no declaraba** (auditoría A2/A3), verificados en el código de esta rama y decididos en §5.2:

| Canal | Archivo:línea | Qué hace realmente | Decisión |
|---|---|---|---|
| `anularCobroParcial` | `ventas.handler.ts:4622` | Permiso `VENTAS_PDV`; solo opera sobre una venta **ABIERTA** y desactiva el `PagoDetalle` (no borra) | **Permitido** sobre caja cerrada: es una reversa, **resta** del arqueo. Ver §5.2 |
| `deleteVenta` | `ventas.handler.ts:1573` | Solo borra ventas **sin ítems** — o sea sin plata asociada | **Permitido**: no afecta el arqueo. Queda como caso de inventario, no de caja. Ver §5.2 |

**Verificado y ya correcto:** `electron/handlers/pdv-egresos.handler.ts:36-53` — la función `validarCaja` **ya exige `caja.estado === ABIERTO`** ("La caja no está abierta. No se pueden registrar egresos.") y la usan `crear-vale-caja` `:131`, `pagar-vale-caja` `:181`, `crear-compra-simplificada-caja` `:234`, `pagar-compra-cuota-caja` `:283` y `anular-egreso-caja` `:351`. O sea que los vales y compras del cajón **no** estaban rotos. Lo que este plan hace con ellos es unificarlos al helper central y al código de error `CAJA_CERRADA` para que el PdV los pueda tratar igual que los demás.

**Verificado y fuera de alcance:** `electron/handlers/facturacion.handler.ts` no menciona `caja` en ninguna línea (`grep -n "caja"` no devuelve nada) — emitir factura no imputa caja y no necesita guard.

---

## 4. Decisiones

### D1 — Código de error: `CAJA_CERRADA` como prefijo del mensaje

```ts
throw new Error(`CAJA_CERRADA: La caja #${cajaId} ya fue cerrada${cuando}. No se pueden registrar más operaciones en ella.`);
```

**Por qué un prefijo en el `message` y no una propiedad `err.code`:** los tres transportes degradan el error de forma distinta y solo el `message` sobrevive a todos:

- **IPC local:** Electron entrega `Error invoking remote method 'createVenta': Error: CAJA_CERRADA: …`. `mensajeDeError` (`src/app/shared/utils/error-message.util.ts:14-21`) ya le saca ese prefijo.
- **`/api/rpc`:** `electron/server/rpc-router.ts:181-184` responde `500 { error: msg }` — solo el string. `err.code` se pierde salvo que sea `FORBIDDEN`/`UNAUTHORIZED` (`:172-180`).
- **modo cliente:** `preload.ts:90-95` arma `new Error("HTTP 500: {\"error\":\"CAJA_CERRADA: …\"}")`.

En los tres casos `String(e?.message).includes('CAJA_CERRADA')` funciona. El frontend **no muestra ese string crudo** (en modo cliente saldría el JSON): mapea el código a su propio mensaje en español, igual que ya hace con `MESA_TIENE_OTRAS_VENTAS_ABIERTAS` en `pdv.component.ts:2207-2212`.

Se agrega además `err.code = 'CAJA_CERRADA'` para el consumo server-side, aunque no viaje.

**Alternativa descartada:** devolver 409 desde `/api/rpc` mapeando `err.code`. Requiere tocar el router para un caso, y no ayuda a IPC local ni a modo cliente, que es donde corre el PdV del local.

### D2 — El guard vive en un util nuevo, no dentro de `terminal-caja.utils.ts`

Archivo nuevo **`electron/utils/caja-abierta.utils.ts`**:

```ts
export const ERROR_CAJA_CERRADA = 'CAJA_CERRADA';

/** Estado mínimo de una caja, leído sin relaciones (ver D3). */
export async function leerEstadoCaja(
  ejecutor: DataSource | EntityManager,
  cajaId: number | null | undefined,
  opts?: { lock?: 'read' | 'write' },
): Promise<{ id: number; estado: CajaEstado; fechaCierre: Date | null } | null>;

/** Lanza CAJA_CERRADA si la caja no existe o no está ABIERTO. */
export async function assertCajaAbierta(
  ejecutor: DataSource | EntityManager,
  cajaId: number | null | undefined,
  opts?: { lock?: 'read' | 'write'; contexto?: string },
): Promise<void>;

/** Resuelve la caja de una venta server-side (nunca del payload). */
export async function cajaDeVenta(ejecutor, ventaId: number): Promise<number | null>;

/** Resuelve la caja de un pago server-side. */
export async function cajaDePago(ejecutor, pagoId: number): Promise<number | null>;
```

**Por qué no meterlo en `assertTerminalPuedeOperar`:** ese gate es **opt-in** (solo corre cuando el llamador manda `validarDispositivoCaja`) y su propio encabezado dice, en `terminal-caja.utils.ts:19-24`, que **no es una frontera de seguridad** sino un candado operativo. Colgar de ahí un invariante que tiene que correr *siempre* le haría heredar la semántica opt-in: bastaría con no mandar el flag para saltearlo. Son dos reglas distintas y conviene que se vean distintas en el código.

Costo: una lectura extra por PK en cada escritura. Se acepta; es el mismo orden que el `findOne` que ya hace `evaluarTerminalCaja` en `terminal-caja.utils.ts:93-97`.

### D3 — El guard corre DENTRO de la transacción de la escritura, con lock de fila en Postgres

`assertCajaAbierta` acepta un `EntityManager` para poder correr dentro de la misma transacción que la escritura. En Postgres toma lock de fila:

- **Escritores** (venta, pago, gasto, retiro, delivery): `pessimistic_read` → `SELECT … FOR SHARE`. No se bloquean entre sí; solo bloquean al que cierra.
- **`update-caja` al cerrar:** `pessimistic_write` → `SELECT … FOR UPDATE`. Espera a que terminen las escrituras en vuelo y después nadie más puede entrar.

Esto cierra el TOCTOU entre "leí ABIERTO" y "guardé la venta". Sin él, una venta que empezó 5 ms antes del cierre se persiste igual.

⚠️ **El lock va sin `relations`.** `findOne({ where, relations, lock })` genera LEFT JOIN y Postgres rechaza `FOR UPDATE`/`FOR SHARE` sobre el lado nulable de un outer join — es exactamente el bug del issue #258, documentado en `scripts/test-locks-postgres-e2e.ts:1-18`. Por eso `leerEstadoCaja` selecciona columnas escalares y nada más.

En SQLite hay un solo escritor y el driver ignora los locks: `opts.lock` se omite cuando `connection.options.type !== 'postgres'`. **Corolario:** la carrera no se puede probar en SQLite (misma lección que `test:delivery-conversion`, ver SKILL.md §4 sesión 2026-08-29) → el caso concurrente va a `test:locks-pg`.

#### Alcance exacto de la transacción de `update-caja` (agregado en v2 por el hallazgo B3)

Hoy `financiero.handler.ts:686-754` **no abre ninguna transacción**: es `findOne` → guards → `merge` → `save`, y después, fuera de todo, `generarRetiroDelCierre(dataSource, id, …)` (`:739`) y un `setImmediate` que dispara `enviarCierreCajaWhatsapp` (`:746-749`).

Meter el `FOR UPDATE` obliga a envolver el handler, y ahí aparece el riesgo: `generarRetiroDelCierre` recibe **el `DataSource`**, no un `EntityManager` (`retiro-cierre.util.ts:20-23`), y adentro toma cuatro repositorios de ahí (`:24`, `:35`, `:67`, `:87`), incluido un `cajaRepo.findOne` sobre la misma fila. En Postgres eso es una lectura **desde otra conexión**: no se bloquea, pero lee el estado **pre-commit** → vería la caja todavía `ABIERTO` y sin `conteoCierre`, devolvería `null` ("caja sin conteo de cierre") y **el retiro automático del cierre dejaría de generarse en silencio** (la función no lanza; el `catch` de `:740-742` solo loguea). Es RB-1 en §10.

Por eso el alcance queda fijado así, y no se negocia en la implementación:

```
await dataSource.transaction(async (manager) => {
  // 1. lock de la fila: findOne({ where: { id }, lock: FOR UPDATE }) SIN relations
  // 2. guards: estado (D7 regla 1), permisos (D7 regla 2), ventas abiertas
  // 3. merge + save  ← todo lo que persiste la Caja va acá
});
// ── fuera de la transacción, después del commit ──
if (seEstaCerrando) {
  await generarRetiroDelCierre(dataSource, id, uid);   // usa el DataSource, ve el commit
  setImmediate(() => enviarCierreCajaWhatsapp(...));   // como hoy
}
```

Dos motivos además del correctivo: el WhatsApp y el retiro tardan, y sostener el `FOR UPDATE` durante segundos hace esperar a cada venta nueva (no hay deadlock posible —`withMesaLock` es un candado en memoria del proceso, no de base, y el único recurso de base en juego es la fila de `cajas`— pero sí espera larga).

**No-regresión obligatoria:** un assert propio de que **cerrar una caja sigue generando el `RetiroCaja` de origen `CIERRE`**, con su `conteoCierre` visible (§11). Es la regresión más probable de todo el PR.

### D4 — La caja del `Pago` se deriva de la venta, en dos capas (reescrito en v2)

**Por qué se reescribió.** La v1 decía "si el payload trae `ventaId` … resolver `caja` server-side". La auditoría B verificó que **ningún** call site manda `ventaId` hoy, y que ninguna fase del plan lo agregaba:

| Call site | Payload real hoy |
|---|---|
| `src/app/shared/components/cobrar-venta-dialog/cobrar-venta-dialog.component.ts:908-912` | `{ estado, caja: this.data.caja, activo, validarDispositivoCaja: true }` |
| `cobrar-venta-dialog.component.ts:1088-1093` (ajuste descuento/aumento) | ídem |
| `src/app/pages/ventas/pdv/pdv.component.ts:2364-2369` (cobro rápido F2) | `{ estado, caja: this.caja!, activo, validarDispositivoCaja: true }` |
| `pago-dialog.component.ts:766`, `create-edit-pago.component.ts:500` | pago de **compra** — no lleva caja de venta, fuera de alcance |

Y `this.data.caja` del diálogo de cobro es **la caja del PdV**, no la de la venta: es exactamente el objeto colgado del bug. Con solo el guard de la rama "sin `ventaId`", si la caja del PdV está **abierta** y la venta es de otra caja (delivery pendiente de otro turno, venta de mesa de la caja vieja), el `Pago` se escribiría con la caja equivocada **igual que hoy** — o sea, la Fase 1 cerraría la causa B del §1 pero **no la causa C**, que es la de los 52 cobros cruzados.

También queda respondido cómo se vincula `Pago` ↔ `Venta`: **el `Pago` nace primero y la `Venta` lo adopta después** con `updateVenta(ventaId, { pago })`. Lo confirma que `createPago` ya hace `Venta.findOne({ where: { pago: { id } } })` después del save (`compras.handler.ts:1428-1436`) y siempre devuelve `null` para un pago nuevo. No hay forma de derivar la caja dentro de `createPago` sin que el cliente mande el `ventaId`.

#### Capa 1 — el cliente manda `ventaId` (entra en la Fase 1, no en la 3)

Tres ediciones de frontend, que son **parte del fix de raíz** y por eso van en la Fase 1 junto al backend:

| Archivo:línea | Cambio |
|---|---|
| `cobrar-venta-dialog.component.ts:908` | `ventaId: this.data.venta.id` en el payload de `createPago` |
| `cobrar-venta-dialog.component.ts:1088` | ídem (rama de ajuste por descuento/aumento) |
| `pdv.component.ts:2364` | `ventaId: venta.id` en el cobro rápido F2 |

Con eso `createPago` resuelve así:

1. Con `ventaId`: resolver `caja` **server-side** desde `venta.caja` y **sobrescribir** `pagoData.caja`. Si difieren, loguear `[createPago] caja del payload (X) ignorada; se usa la de la venta (Y)`. `assertCajaAbierta` sobre la caja **de la venta**.
2. Sin `ventaId` pero con `caja`: se conserva el comportamiento actual (es el pago de compra) y se aplica `assertCajaAbierta` sobre `pagoData.caja`.

#### Capa 2 — derivación server-side en `updateVenta`, independiente del cliente

§9 admite explícitamente clientes desactualizados (un desktop empaquetado en `mode=client` que no se actualizó). Para que el fix sea robusto contra ellos, **la derivación definitiva no vive en `createPago` sino en `updateVenta`**: cuando la venta adopta `data.pago`, el handler

1. resuelve `venta.caja` server-side (nunca del payload),
2. **sobrescribe `pago.caja`** con esa caja, y
3. corre `assertCajaAbierta` sobre ella.

Los tres caminos llaman `updateVenta(ventaId, { pago })` **inmediatamente después** del `createPago` — `cobrar-venta-dialog.component.ts:916-918`, `:1094-1096`, `pdv.component.ts:2380` — así que la ventana de inconsistencia es de milisegundos y se cierra sin que el renderer colabore. Un cliente viejo queda cubierto por esta capa sola.

**Criterio de aceptación de D4 (el que importa):** un cobro hecho por el **flujo real** (`createPago` sin `ventaId` + `updateVenta({ pago })`) deja `pago.caja === venta.caja`. El test con `ventaId` sintético **no** alcanza: pasaría aunque la capa 2 no exista (ver RB-3 en §10 y el test correspondiente en §11).

**Por qué derivar en vez de rechazar:** rechazar rompería el cobro para cualquier cliente viejo que mande la caja de su `this.caja` desactualizado, que es justamente el caso del bug. Derivar lo arregla correctamente y en silencio. El guard de caja cerrada actúa igual: si la caja de la **venta** está cerrada, se rechaza.

`createPagoDetalle` ya resuelve la caja server-side desde el `Pago` (`compras.handler.ts:1491-1503`) — se reusa esa resolución y se le agrega `assertCajaAbierta`.

**Alternativa descartada:** rechazar `pago.caja !== venta.caja` con error. Deja al cajero trabado sin poder cobrar y sin saber por qué, cuando el servidor tiene el dato correcto a mano.

### D5 — Las operaciones legítimas post-cierre necesitan una llave explícita

Tres familias, tres tratamientos (detalle canal por canal en §5):

- **Las que el propio cierre dispara** (`generarRetiroDelCierre` desde `update-caja`, `generar-retiro-cierre-caja` manual, `finalizar-ajuste-caja`): pasan por **dentro** del guard, no por afuera. `generarRetiroDelCierre` es una función interna que ya recibe el `cajaId`; **no** se le agrega `assertCajaAbierta`. Lo que se agrega es que `create-retiro-caja` —el canal expuesto— sí lo tenga, y que el retiro de cierre nunca pase por ese canal (hoy tampoco pasa: `retiro-cierre.util.ts:71-89` usa el repo directo).
- **Las de ajuste desde Financiero › Cajas** ("agregar gasto/retiro que faltó", ajustar conteo): se permiten con **flag explícito + permiso + motivo**. Ver D6.
- **Las que no tocan la caja de venta** (`ingresar-retiro-caja`, todo Caja Mayor): sin guard. Mover un retiro ya existente a Caja Mayor no cambia el arqueo de la caja de venta.

### D6 — Flag de ajuste: `{ ajuste: { motivo } }` + `FINANCIERO_CAJA_AJUSTAR` + traza

`create-gasto-caja` y `create-retiro-caja` aceptan un campo nuevo opcional:

```ts
ajuste?: { motivo: string }
```

Si la caja está `CERRADO`:
- sin `ajuste` → `CAJA_CERRADA`;
- con `ajuste` → se exige `FINANCIERO_CAJA_AJUSTAR` (segundo `ensurePermission`, después del operativo), `motivo` no vacío, y **la misma condición que `puede-ajustar-caja`** (`financiero.handler.ts:771-786`): el retiro del cierre no puede estar `INGRESADO`. Si pasa, se escribe y se estampa la traza en la `Caja` — `revisado = true`, `revisadoPor`, `motivoAjuste` (UPPERCASE, igual que `finalizar-ajuste-caja` en `:813-818`).

Si la caja está `ABIERTO`, el campo `ajuste` se **ignora** (no hay nada que ajustar) — así el frontend puede mandarlo siempre desde Financiero › Cajas sin ramificar.

El PdV **nunca** manda `ajuste`: sus utilitarios (`pdv.component.ts:2537-2549` → `utilitarios-dialog.component.ts:124-133`) abren los mismos diálogos que Financiero, así que el flag lo decide el **llamador del diálogo**, no el diálogo. Se pasa por `MAT_DIALOG_DATA` (`{ cajaId, cajaNombre, ajuste: true }`) y el diálogo pide el motivo con `PromptDialogComponent` — el mismo que ya usa `list-cajas.component.ts:324-337` para `ajustarConteo`.

**Por qué reusar los permisos existentes y no crear uno nuevo:** `FINANCIERO_CAJA_AJUSTAR` ya existe (`electron/handlers/permissions.handler.ts:133`), ya está descrito como "Ajustar una caja ya cerrada (corregir conteo, agregar gasto/retiro)" y ya se usa en `finalizar-ajuste-caja`. Este PR lo hace cumplir en los dos canales que la descripción ya prometía.

### D7 — `update-caja` sobre una caja `CERRADO`

Dos reglas nuevas en `financiero.handler.ts:686`, **en este orden y no en el inverso**:

1. `data.estado === CERRADO && entity.estado === CERRADO` → `CAJA_CERRADA: La caja #N ya fue cerrada el <fecha>.`
2. Cualquier `update-caja` sobre una caja `CERRADO` exige `FINANCIERO_CAJA_AJUSTAR` (además del `FINANCIERO_CAJA_OPERAR` que ya tiene).

⚠️ **El orden importa** (hallazgo B9). Si el `ensurePermission('FINANCIERO_CAJA_AJUSTAR')` de la regla 2 corriera antes del rechazo de la regla 1, un cajero que cierra dos veces recibiría `PERMISO REQUERIDO: FINANCIERO_CAJA_AJUSTAR` en lugar de «la caja #N ya fue cerrada el …», que es incomprensible y lo manda a pedir un permiso que no necesita. Regla 1 primero, siempre.

La regla 2 protege el caso raro pero real de una caja `CERRADO` **sin** `conteoCierre`: en modo ajuste el diálogo llegaría a `create-caja-dialog.component.ts:1316` con `existingConteoCierre === null` y llamaría `updateCaja`. Para que ese camino siga funcionando, el diálogo en modo `ajuste` **omite `estado`** del payload (manda solo `conteoCierre` + `fechaCierre`), con lo que esquiva la regla 1 y cae bajo la 2, que el ajustador cumple por definición.

`finalizar-ajuste-caja` no pasa por `update-caja` (hace `cajaRepo.save` directo en `:818`), así que no se ve afectado.

#### Revalidación en el front antes de crear el `Conteo` (agregado en v2 por B9 / A4)

Los **dos** flujos de cierre crean el `Conteo` y todos sus `ConteoDetalle` **antes** de llamar `updateCaja`:

- `create-caja-dialog.component.ts:1255-1325` (conteo → detalles → `updateCaja` en `:1316-1325`);
- `projects/mobile/src/app/pages/financiero/cajas/caja-cerrar.page.ts:86-99` (`createConteo` → N × `createConteoDetalle` → `updateCaja` en `:96`).

Hoy eso no deja basura porque `update-caja` acepta CERRADO→CERRADO. Con la regla 1, **cada intento de cerrar una caja ya cerrada dejaría un conteo + sus detalles huérfanos**, y no son inertes: `computeResumenCaja` y `generarRetiroDelCierre` los buscan por FK.

Por eso los dos flujos **revalidan contra el backend** (`get-caja`) al abrir, **no** contra el objeto que llegó por `MAT_DIALOG_DATA` / por la navegación:

- `create-caja-dialog.component.ts:144-149`: si `get-caja` devuelve `CERRADO` y no es modo ajuste → estado de error, sin botón de guardar, y **sin crear ningún `Conteo`**.
- `caja-cerrar.page.ts` (PWA): mismo chequeo, con mensaje en español, y manejo del error `CAJA_CERRADA` que pueda volver del backend igual (carrera). Esto cubre el hallazgo A4.

El §12 paso 7 lleva el assert explícito de que **no quedó un conteo nuevo** en la base.

#### Llamadores reales de `updateCaja`: son tres, no dos (B8)

| Llamador | Estado |
|---|---|
| `create-caja-dialog.component.ts:1323` | Vivo — cierre desde Financiero › Cajas |
| `projects/mobile/.../caja-cerrar.page.ts:96` | Vivo — cierre desde la PWA |
| `src/app/shared/components/cierre-caja-dialog/cierre-caja-dialog.component.ts:112` | **Código muerto**: `grep -rn "CierreCajaDialogComponent" src/ projects/` devuelve solo su propia definición |

`repository-http.service.ts:384` no cuenta: es el esqueleto histórico que lanza "no implementado" (en los tres modos se usa `RepositoryIpcService`, documentado en `app.module.ts:85-95`) — lo cual confirma de paso que el `getCaja` de D12 funciona también en modo cliente, vía el monkey-patch del preload.

**Decisión: `cierre-caja-dialog` se borra en este PR.** Está muerto, duplica el flujo de cierre y compila, así que es candidato a que alguien lo cablee sin las revalidaciones de arriba. Menos superficie para el próximo bug de caja.

### D8 — NO se agrega "una caja abierta por usuario"

Razones concretas:

- La caja es **explícitamente compartida**: `get-cajas-abiertas` (`financiero.handler.ts:877-892`) existe justamente para que otros usuarios y dispositivos se unan a una caja abierta, y el comentario del handler lo dice. Un único por usuario no describe el modelo.
- `get-caja-abierta-by-usuario` (`:867-875`) tiene un solo uso real: el PdV recarga la caja que **acaba** de abrir (`pdv.component.ts:372-374`). No es un invariante, es un `findOne` de conveniencia.
- Un supervisor que abre las dos cajas del local (barra y salón) es un caso legítimo que el único por usuario rompería.
- El cajón físico es del **dispositivo**. Ese es el recurso que no se puede duplicar, y es el invariante que sí se garantiza.

Lo que sí se corrige de `get-caja-abierta-by-usuario`: pasa a ordenar por `fechaApertura DESC, id DESC` para que, si hubiera varias, devuelva la más reciente y no una cualquiera. **Es una mejora colateral de una línea, aceptada a propósito** (hallazgo A14): hace determinista qué caja toma el PdV cuando recarga la que acaba de abrir (`pdv.component.ts:372-374`), lo cual está directamente relacionado con el bug — un `findOne` sin `order` es exactamente cómo el PdV puede quedarse pegado a la caja equivocada. Se anota como tal para que no se lea como scope creep.

### D9 — Índice único parcial: es el **control primario**, con pre-chequeo que NO aborta el arranque y reintento idempotente en cada boot

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cajas_abierta_por_dispositivo"
  ON "cajas" ("dispositivo_id") WHERE "estado" = 'ABIERTO';
```

La misma sentencia sirve en los dos drivers **sin ramificar**: SQLite soporta índices parciales desde 3.8.0 y Postgres desde 9.0, el quoting con comillas dobles es válido en los dos, y `Caja.estado` es `@Column({ type: 'varchar', enum: CajaEstado })` (`caja.entity.ts:37-42`) — **no** un enum nativo de Postgres —, así que el predicado `WHERE "estado" = 'ABIERTO'` es un literal de texto inmutable en ambos. El SQL es portable y por eso la migración **no** ramifica por `queryRunner.connection.options.type` (corrección del hallazgo A6: la v1 decía "la migración es driver-aware" y el snippet no tenía ningún branch; el pre-chequeo `COUNT/GROUP BY/HAVING` también es estándar).

`dispositivo_id` es **NOT NULL por diseño** — `Caja.dispositivo` es `@ManyToOne(..., { nullable: false })` (`caja.entity.ts:19-21`) — así que el caso "cajas `ABIERTO` con `dispositivo_id IS NULL` que el índice parcial no cubriría" no existe y no hace falta cubrirlo (hallazgo A5, descartado; ver §15).

**Si hay duplicados, la migración NO crea el índice.** Loguea `[migration] ...` con la lista de `(dispositivo_id, ids de caja)` y sigue. Nunca cierra una caja sola.

**Por qué no abortar:** las migraciones corren al arrancar la app (`DatabaseService.runMigrations`). Una migración que falla deja la instalación sin arrancar. Este repo ya tomó exactamente esta decisión para los índices de RUC — ver el comentario en `src/app/database/migrations/1787255528889-IndicesRucYReconciliarMesas.ts:11-14`: *"un UNIQUE fallaría y dejaría la app sin arrancar"*. No repetir el error opuesto.

**Producción está limpia:** verificado read-only el 2026-09-28 — 127 cajas, una sola `ABIERTO` (#129, dispositivo 1). El índice va a crearse sin problema. El pre-chequeo es para las SQLite de instalaciones standalone que nadie auditó.

#### Reintento idempotente de arranque (agregado en v2 por B4)

El `return` temprano del pre-chequeo tiene un problema que la v1 subestimaba: TypeORM **marca la migración como ejecutada igual** (el `up()` no lanzó), y `runMigrations({ transaction: 'each' })` corre solo las pendientes (`src/app/database/database.service.ts:76`). O sea que la instrucción del log —"cerrá las sobrantes y volvé a aplicar"— **no existe operativamente**: aunque el operador limpie los duplicados, el índice **no se crea nunca**.

Por eso la migración queda como está (primer intento, best-effort) y se agrega una función nueva:

```ts
// electron/utils/indices-opcionales.utils.ts (o src/app/database/)
export async function asegurarIndicesOpcionales(ds: DataSource): Promise<void>
```

- Se llama desde `DatabaseService` **inmediatamente después** de `runMigrations` (`database.service.ts:76`).
- Reintenta `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cajas_abierta_por_dispositivo" …` **solo si no hay duplicados** (mismo pre-chequeo), y si los hay loguea el detalle con los `(dispositivo_id, ids)`.
- Nunca lanza: un `try/catch` que loguea. Arrancar la app no puede depender de esto.
- Cuesta una o dos queries por arranque y es driver-agnóstico (la sentencia ya lo es).

Con esto, "arreglá los duplicados" vuelve a ser una instrucción que funciona: el próximo arranque crea el índice solo. Eso también baja **Q4** (tarjeta roja en *Sistema*) de decisión pendiente a **nice-to-have**, y reformula R5 en §10.

#### Qué pasa si el índice no se crea (corregido en v2 — hallazgo bloqueante B2)

La v1 afirmaba que "queda el guard transaccional de D3/D10, que en Postgres es suficiente porque el `FOR UPDATE` serializa". **Eso es falso.** El guard de apertura es `repo.count({ where: { dispositivo, estado: ABIERTO } })` (`financiero.handler.ts:667-676`); en el caso que importa —el dispositivo **no** tiene caja abierta— ese `SELECT … FOR UPDATE` matchea **cero filas**, y Postgres en `READ COMMITTED` no toma gap locks ni predicate locks: dos transacciones concurrentes leen cero las dos, pasan las dos, insertan las dos.

En SQLite el argumento "un solo escritor" vale **dentro de un proceso** (el driver `sqlite3`, `database.config.ts:389`, usa una sola conexión y TypeORM serializa los query runners), pero **no** entre dos instancias de Electron abiertas contra el mismo archivo.

La verdad, entonces:

| Control | Qué cubre realmente |
|---|---|
| **Índice único parcial** | **La carrera real de doble apertura, en los dos drivers. Es el control primario.** |
| `count` + `save` (+ `FOR UPDATE` cuando ya hay una caja abierta) | Solo la carrera **lenta**: dos clicks separados por más que la duración de la transacción. Y el `FOR UPDATE` sí sirve para no decidir contra un cierre concurrente cuando la fila existe |
| Traducción del 23505 / `SQLITE_CONSTRAINT` (D10.3) | Que el usuario vea «Ya hay una caja abierta en esta terminal» en vez de un error crudo de driver |

Corolario operativo: sin el índice **no hay defensa real** contra la apertura concurrente, y por eso el reintento idempotente de arranque de arriba no es un adorno (ver RB-2 en §10).

### D10 — Apertura dentro de transacción, guard sin depender de `data.estado`, y traducción de la violación de índice

En `create-caja` (`financiero.handler.ts:661`) y `abrir-caja-desde-conteo` (`caja-mayor.handler.ts:1938`):

1. El guard corre **siempre** que el estado resultante sea `ABIERTO`, incluyendo cuando `data.estado` viene vacío: `const estadoFinal = data?.estado ?? CajaEstado.ABIERTO`.
2. Guard + `save` dentro de `dataSource.transaction(...)`, con `SELECT … FOR UPDATE` sobre las cajas del dispositivo en Postgres. **Con el alcance corregido de B2:** ese lock se deja porque sirve en el caso "ya hay una caja abierta" (evita decidir contra un cierre concurrente mientras se lee la fila), pero **no cierra la carrera de doble apertura** cuando no hay ninguna abierta — cero filas no se pueden bloquear en `READ COMMITTED`. El que la cierra es el punto 3.
3. `try/catch` alrededor del `save` que traduce la violación del índice al **mismo** mensaje humano que el guard. **Esto no es un extra: es el control primario del invariante** (ver D9).
   - Postgres: `err.code === '23505'` o `/UQ_cajas_abierta_por_dispositivo/.test(err.message)`
   - SQLite: `/SQLITE_CONSTRAINT|UNIQUE constraint failed/.test(err.message)` + el nombre del índice

   → `CAJA_ABIERTA_DUPLICADA: Ya hay una caja abierta en esta terminal (caja #N). Cerrá esa caja antes de abrir otra.`

**Los permisos de los dos canales NO se unifican** (hallazgo B16, decisión explícita): `create-caja` exige `FINANCIERO_CAJA_OPERAR` (`financiero.handler.ts:662`) y `abrir-caja-desde-conteo` exige `FINANCIERO_CAJA_GESTIONAR` (`caja-mayor.handler.ts:1939`). D10 unifica la **conducta** (guard, transacción, traducción del error), no la autorización, porque son dos actos operativos distintos: abrir la caja del turno es rutina del cajero, y abrirla *desde un conteo de Caja Mayor* es una operación de gestión sobre el efectivo consolidado. Se declara acá para que el auditor de la implementación no lo "arregle" de un lado o del otro. Coherente con la PWA, que abre por `create-caja` (`caja-abrir.page.ts:100-107`) y cierra por `update-caja` (`caja-cerrar.page.ts:96`), los dos con `FINANCIERO_CAJA_OPERAR`.

### D11 — Evento SSE `CAJA_CAMBIO` reusando el bus y el endpoint que ya existen

Se agrega el tipo `'CAJA_CAMBIO'` a `MesaEventTipo` en `electron/utils/mesa-events.utils.ts:20` y un `emitCajaCambio(ds, cajaId, estado)` en `electron/utils/mesa-emit.utils.ts`, emitido desde `update-caja` (cierre), `create-caja`, `abrir-caja-desde-conteo` y **también `finalizar-ajuste-caja`** (hallazgo A13: hace `cajaRepo.save` directo en `financiero.handler.ts:818` y cambia `revisado`/`motivoAjuste` de una caja que el PdV o el resumen pueden estar mirando; emitir ahí cuesta una línea y evita una vista rancia).

⚠️ **`seq`**: `MesaEventPayload.seq` es **obligatorio** (`mesa-events.utils.ts:22-28`) y `emitMesaCambio`/`emitComandaCambio` lo sacan de la columna `seq` de su entidad (`mesa-emit.utils.ts:26-44`). **`cajas` no tiene columna `seq`** (`caja.entity.ts`), y no se le agrega. `CAJA_CAMBIO` va con **`seq: Date.now()`**, y el cliente **no** lo compara contra los `seq` de mesa/comanda — son secuencias distintas, y mezclarlas descartaría eventos válidos (hallazgo B14). Queda explícito en el comentario del emisor y en el `switch` del consumidor.

**Por qué reusar `/api/pdv/mesas/stream` y no crear un endpoint nuevo:** el PdV y la PWA ya están conectados a ese stream con su `stream-token` de contexto `'pdv'` (`pdv.component.ts:3191-3206`, `electron/server/mesa-sse-routes.ts:19-28`). Un stream nuevo serían dos conexiones, dos tokens y dos reconexiones por terminal, para un evento que ocurre dos veces por día.

⚠️ **Limitaciones verificadas de los transportes (corregidas en v2 por el hallazgo B6).** La v1 decía que el SSE "solo existe en `mode=server`" y que el IPC cubre "los 3" modos. Las dos casillas estaban mal:

1. **El SSE de mesas del PdV desktop no conecta en NINGÚN modo.** `pdv.component.ts:3205-3206` arma una URL **relativa** (`/api/pdv/mesas/stream?token=…`), y el renderer del desktop carga `http://localhost:4201` en dev (`main.ts:728`) o `file://` empaquetado (`main.ts:733`). No hay `proxy.conf.json` en el repo ni `proxyConfig` en `angular.json`: en dev resuelve contra el dev-server de Angular (404) y empaquetado contra `file:///api/...` (error). O sea que el SSE de mesas sirve para **`/admin` y la PWA**, que se cargan del mismo origen que Fastify — no para la ventana de Electron. La causa no es que Fastify no esté levantado, es el origen del renderer.
2. **El IPC `mesa-updates` llega solo en el proceso que ejecuta el handler.** `broadcastMesaEvent` (`mesa-events.utils.ts:44-53`) hace `BrowserWindow.getAllWindows()` → `webContents.send('mesa-updates', …)`. En **standalone** y en **server** el handler corre en la misma máquina que el PdV, así que llega. En **`mode=client`** los handlers corren en el **servidor**, en otra máquina: el desktop cliente **no recibe ningún IPC** — y tampoco SSE, por el punto 1.

Hoy ese canal IPC es **código muerto**: `grep -rn "mesa-updates" preload.ts src/ projects/ electron/` no devuelve ni un consumidor. El plan lo activa: se expone `onMesaEvent` en `preload.ts` siguiendo el patrón exacto de `onComandaEvent` (`preload.ts:4398-4402`) y el PdV se suscribe.

El orden de defensas, corregido:

| Capa | Cubre | Modos donde llega |
|---|---|---|
| Revalidación antes de cada operación de plata (D12) | Siempre, aunque falle todo lo demás | los 3 |
| Revalidación al recuperar foco / visibilidad / activar la tab | La pestaña colgada de fondo, que es el caso del bug | los 3 |
| IPC `mesa-updates` → `CAJA_CAMBIO` | Reacción instantánea en el desktop | **standalone y server** (el handler corre en la misma máquina). **No en client** |
| SSE `CAJA_CAMBIO` | Reacción instantánea en **`/admin` y la PWA** (mismo origen que Fastify) | server (y el nodo server de un despliegue client/server) |
| Manejo del error `CAJA_CERRADA` del backend | El caso que se escapó de todo lo anterior | los 3 |

**Riesgo aceptado y declarado:** en **`mode=client` no hay notificación instantánea posible** sin trabajo extra (haría falta un endpoint de eventos al que el cliente se suscriba con URL absoluta a `settings.network.serverUrl`). En ese modo el PdV queda con revalidación por **foco / acción / polling** más el rechazo del backend. Es aceptable —el backend nunca deja escribir contra la caja cerrada— y se asume así en este PR; el endpoint absoluto sería scope nuevo. Se anota en las notas de release (§9) y como RB-4 en §10.

### D12 — El PdV revalida contra `get-caja`, no contra su objeto en memoria

Método nuevo `private async asegurarCajaAbierta(accion: string): Promise<boolean>` en `pdv.component.ts`:

1. Si `!this.caja` → `await this.inicializarCaja()`; devuelve `!!this.caja`.
2. `const fresca = await firstValueFrom(this.repositoryService.getCaja(this.caja.id))`.
3. Si `fresca?.estado !== 'ABIERTO'` → diálogo `ConfirmationDialogComponent` «Esta caja ya fue cerrada», `this.caja = null`, `await this.inicializarCaja()`, devuelve `false`.
4. Si sigue abierta → actualiza `this.caja = fresca`, devuelve `true`.

Se llama **antes** de: `cobrarVenta()` `:2151`, `cobroRapido()` `:2326`, `getVenta()` `:1983` (crea ventas), `ventaRapida()` `:2305`, `openDelivery()` `:2482`, `openUtilitarios()` `:2537` y `cerrarCaja()` `:2443`. Es una lectura por PK; el costo es despreciable frente a lo que ya hace cada uno de esos caminos.

⚠️ **Dos firmas cambian** (hallazgo B13, a listar en la Fase 3): `openUtilitarios(): void` (`:2537`) pasa a `async`, y `getVenta(): Promise<Venta>` (`:1983`) **no es `async` hoy** — tiene varios llamadores y hay que verificar uno por uno que todos lo `await`ean antes de convertirlo. Un llamador que hoy ignora la promesa se rompería en silencio.

#### `inicializarCaja` tiene que ser esperable en sus tres caminos (hallazgo B10)

`inicializarCaja()` (`pdv.component.ts:327-354`) hoy **no** lo es:

| Camino | ¿espera? |
|---|---|
| 1 caja abierta (`:336-337`) | sí — `aplicarCajaSeleccionada` es síncrono |
| varias (`:339-343`) | sí — `await firstValueFrom(dialogRef.afterClosed())` |
| **ninguna** (`:352` → `ofrecerAbrirCaja(true)`, `:357-405`) | **no** — usa `afterClosed().subscribe(...)` y retorna al instante |

En el camino **más probable después de un cierre** (no queda ninguna caja abierta), `await this.inicializarCaja()` volvería con `this.caja === null`, `asegurarCajaAbierta` devolvería `false` y **la acción del cajero se descartaría en silencio** aunque un segundo después abriera la caja nueva en el diálogo que quedó arriba.

Por eso:

- `ofrecerAbrirCaja` pasa a ser **`async` y devuelve la caja resuelta** (mismo patrón que `:342-343`);
- `inicializarCaja` la **`await`ea** y deja `this.caja` seteada antes de retornar;
- **`asegurarCajaAbierta` NO reintenta automáticamente la acción original.** Si al volver hay caja nueva, muestra un aviso explícito: «Abriste/seleccionaste la caja #N, volvé a intentar». **Decisión deliberada:** reintentar solo sería cobrar contra una caja que el cajero acaba de elegir en un diálogo que apareció por sorpresa, sin haber confirmado que es la correcta. Un cobro imputado a la caja equivocada es justamente el bug que este PR arregla; un click extra no es un costo.

#### Guard de reentrancia (hallazgo B11)

D12 se dispara desde **seis** lugares: `window:focus`, `document.visibilitychange`, `tabsService.activeTab$`, el IPC `CAJA_CAMBIO`, el `onmessage` del SSE y el fallback de polling de 15 s (`pdv.component.ts:3328-3341`). Sin protección, cerrar la caja desde otra tab del mismo Electron encadena tres `ConfirmationDialogComponent` sobre el mismo hecho y tres `inicializarCaja()` compitiendo (el tercero puede pisar la caja que el primero resolvió).

- Dos flags privados: **`private revalidandoCaja = false`** (una revalidación a la vez; los disparos concurrentes salen sin hacer nada) y **`private avisoCajaCerradaAbierto = false`** (un solo diálogo por hecho, se baja al cerrarlo).
- `activeTab$` es un **`BehaviorSubject`** (`src/app/services/tabs.service.ts:20`, expuesto en `:28`): **emite al suscribirse**. La suscripción va con `.pipe(distinctUntilChanged(), filter(id => id === 'pdv'), skip(1))` para no revalidar de arranque, encima de lo que ya hace `inicializarCaja`.
- **`ngOnDestroy` (`:638-650`, no `:639`) hoy solo limpia el SSE y cuatro timers.** Se le agrega el `unsubscribe` del listener IPC (`onMesaEvent` devuelve su función de desuscripción) y del `activeTab$`.

#### Fail-open ante error de red

Si falla la red, `asegurarCajaAbierta` devuelve `true` (**fail-open**) y loguea. Bloquear el cobro porque no se pudo confirmar un estado deja al local sin poder facturar; el backend tiene la última palabra igual (D3), y el error `CAJA_CERRADA` que vuelva se maneja en el paso siguiente.

El fail-open es seguro **precisamente porque** el guard de la Fase 1 es server-side y no opt-in. Corolario a tener presente: si alguna vez se degradara el guard backend (R2: "se degrada a lectura sin lock"), el fail-open del front **deja de ser gratis** y hay que revisarlo junto con esa degradación.

Método nuevo `private manejarErrorCajaCerrada(error: any): boolean` — si `String(error?.message).includes('CAJA_CERRADA')`, muestra el mensaje y reinicializa. Se engancha en los `catch` de cobro, cobro rápido, delivery y utilitarios.

### D13 — Caja de jornada anterior: avisar, no unirse en silencio

En `inicializarCaja()`, cuando hay exactamente una caja abierta (`pdv.component.ts:336-337`), antes de unirse:

```ts
const h = this.pdvConfig?.inicioJornadaHora ?? 7;
const corte = inicioDelDia(anclaJornada(new Date(), h), h);
if (new Date(caja.fechaApertura) < corte) { /* preguntar */ }
```

Se reusan `anclaJornada` e `inicioDelDia` de `src/app/shared/utils/dashboard-rangos.util.ts:67-78` — la **misma** fuente que usan los reportes y los dashboards. (El equivalente backend es `getInicioJornada` en `electron/handlers/dashboard-ventas.handler.ts:39-52`, con el mismo default 7 y cache de 60 s.) La lección de la sesión 2026-08-28 fue justamente que dos cálculos de jornada distintos ponen la misma venta en días distintos según la pantalla.

⚠️ `inicializarCaja()` corre en `ngOnInit` **antes** de `loadInitialData()`, así que `this.pdvConfig` todavía es `null`. Hay que leer la config antes: `await firstValueFrom(this.repositoryService.getPdvConfig())` al principio de `inicializarCaja`, o mover la resolución de caja después de la carga de config. Se elige lo primero (una fila, y ya se hace lo mismo en `refrescarGateTerminal` `:486-488`).

⚠️ **`getPdvConfig()` puede devolver un array** (hallazgo B15): hay que copiar la normalización que ya hace `refrescarGateTerminal` en `pdv.component.ts:486-487` — `const config = Array.isArray(cfg) ? cfg[0] : cfg` — antes de leer `inicioJornadaHora`. Sin eso, `config?.inicioJornadaHora` es `undefined`, cae al default 7 por casualidad y el chequeo deja de respetar la configuración del local.

Diálogo con tres salidas, con `ConfirmationDialogComponent` extendido a dos botones de confirmación… **no**: ese componente soporta confirmar/cancelar, no tres opciones. Se usa el patrón que ya existe: `SeleccionarCajaDialogComponent` devuelve `{ caja }` o `{ abrirNueva }` (`pdv.component.ts:344-351`, definición del resultado en `seleccionar-caja-dialog:57-66`). Se agrega un mensaje de advertencia a ese diálogo y se lo abre **también** en el caso de una sola caja cuando viene de la jornada anterior, con el texto «Caja #N abierta desde ayer 14:39 — ¿la usás igual o la cerrás antes de vender?» y los botones *Usar igual* / *Ir a cerrarla* / *Abrir una nueva*. Así no se inventa un diálogo nuevo ni se rompe la regla de "cada diálogo, un propósito".

**Contrato del resultado nuevo y su branch** (hallazgo A10 — la v1 agregaba el botón sin definir qué devuelve):

| Resultado del diálogo | Branch en `pdv.component.ts` |
|---|---|
| `{ caja }` | Como hoy: `aplicarCajaSeleccionada(caja)` |
| `{ abrirNueva: true }` | Como hoy: `ofrecerAbrirCaja()` (ahora `async`, D12) |
| **`{ cerrar: caja }`** (nuevo) | Si el usuario tiene `FINANCIERO_CAJA_OPERAR`: abrir `create-caja-dialog` **en modo cierre** sobre esa caja (el mismo diálogo de conteo que usa Financiero › Cajas, con la revalidación de D7). Al cerrarse, volver a `inicializarCaja()`. Si **no** tiene el permiso: aviso «Pedile a un encargado que cierre la caja #N» y no se abre nada |
| `undefined` (escape / cancelar) | Como hoy: se queda sin caja y el PdV no opera |

El tipo del resultado pasa a ser `{ caja?: Caja; abrirNueva?: boolean; cerrar?: Caja }` — aditivo, así que ningún consumidor actual se rompe.

### D14 — Fuga: `select: false` en `password` + recorte de los joins de caja. Sin sanitizador central.

**Fix de raíz:** `@Column({ select: false })` en `src/app/database/entities/personas/usuario.entity.ts:16-17`. Es una bandera de query, **no** un cambio de schema: no genera DDL ni necesita migración. Con eso el hash desaparece de **todas** las relaciones hidratadas del sistema de una sola vez, sin costo en runtime.

Los 7 caminos que sí necesitan el hash y hay que arreglar con `addSelect` / `select` explícito (verificados con `grep -rn "\.password"`):

| Archivo:línea | Qué hace | Cómo queda |
|---|---|---|
| `electron/handlers/auth.handler.ts:26-35` | login | `.addSelect('usuario.password')` en el QB |
| `electron/handlers/auth.handler.ts:~95-102` | `validate-credentials` | idem |
| `electron/server/auth-routes.ts:54-65` | login HTTP | idem |
| `electron/handlers/personas.handler.ts:322-327` | cambio de contraseña | `findOne` → QB con `addSelect` |
| `electron/handlers/onboarding-tasks.config.ts:53-57` | detecta admin con password default | idem |
| `electron/utils/seed-system.ts:95-97` | marca `mustChangePassword` al admin default | idem |
| `electron/utils/migrate-passwords.ts:12-17` | migración one-shot plaintext→bcrypt | `repo.find()` → QB con `addSelect`. **Sin esto se vuelve un no-op silencioso** (`if (!u.password) continue`) |

La lista de 7 está **verificada como completa**: no hay ningún otro lector de la columna en el repo, ni en `src/`, ni en `projects/`, ni en SQL crudo (solo las baselines la declaran, y `create-edit-usuario.component.ts:282-294` la *escribe*). Eso cierra el ítem 7 de §14. Las rutas de refresh de `auth-routes.ts` no la leen; `pedidos-online-auth.handler.ts` es otra tabla (`CuentaCliente.passwordHash`). Y los tres sanitizadores `{ ...user, password: undefined }` (`auth.handler.ts:77`, `:168`, `:207`, `personas.handler.ts:341`) siguen funcionando con `select: false` (el spread simplemente no trae la clave).

⚠️ **Riesgo a probar explícitamente — `save()` sobre una entidad cargada sin la columna.** Son **tres** los writes en esa situación, no dos: `personas.handler.ts:265` (**`updateUsuario`**, faltaba en la v1), `personas.handler.ts:332` (`change-password`) y `password-recovery.handler.ts:189`. TypeORM debería emitir el UPDATE igual (el valor pasa de `undefined` a un string), pero es exactamente la clase de detalle que hay que verificar con un test y no asumir: los **tres** van como casos de `test:sin-fuga-datos` (R3).

`password-recovery.handler.ts:189` **no necesita `addSelect`**: solo **escribe** el hash, no lo lee (verificado en las dos auditorías). Por eso no está en la tabla de los 7 lectores y sí en la lista de writes de R3 (hallazgo A7, descartado; ver §15).

**Recorte de `persona` en los 11 canales del dominio caja.** El patrón ya existe en este repo: `ventas.handler.ts:1106-1108` reemplaza `leftJoinAndSelect` del repartidor por `leftJoin` + `addSelect(['repartidor.id', 'repartidorPersona.id', 'repartidorPersona.nombre'])`. Se aplica el mismo tratamiento, con un helper compartido `selectUsuarioPublico(qb, alias)` que agrega `id`, `nickname`, `persona.id`, `persona.nombre`, `persona.apellido` y nada más:

| Canal | Archivo:línea |
|---|---|
| `get-cajas` | `financiero.handler.ts:566` |
| `get-caja` | `financiero.handler.ts:639` |
| `get-caja-by-dispositivo` | `financiero.handler.ts:652` |
| `get-cajas-abiertas` | `financiero.handler.ts:885` |
| `getResumenCaja` → `computeResumenCaja` | `electron/utils/resumen-caja.utils.ts:60` y `:224` |
| `getVentasByDateRange` | `ventas.handler.ts:1088-1089` (`venta.createdBy` + persona), `:1086-1087` (`cliente.persona`) y **`:1082-1083` (`caja.createdBy` + `cajaCreatedBy.persona`)** |
| `get-retiros-caja` | `caja-mayor.handler.ts:1676-1679` |
| `get-retiro-caja` | `caja-mayor.handler.ts:1706-1707` |
| `get-gastos-caja` | `gastos-caja.handler.ts:50` |
| `get-egresos-caja` | `pdv-egresos.handler.ts:398` |
| **`delivery-listar-pdv`** | **`delivery.handler.ts:190-193`** |

Dos filas se agregaron en la v2 por el hallazgo B5:

- **`getVentasByDateRange` hidrata TRES `Usuario`/`Persona`, no dos.** Además de `venta.createdBy` y `cliente.persona`, `ventas.handler.ts:1082-1083` hace `leftJoinAndSelect('caja.createdBy', 'cajaCreatedBy')` y `leftJoinAndSelect('cajaCreatedBy.persona', 'cajaCreatedByPersona')`. Con `select: false` el hash desaparece, pero **el assert #2 de `test:sin-fuga-datos` fallaría** porque la `Persona` del cajero que abrió la caja seguiría viniendo entera por este join. Sin esta fila, el recorte de `getVentasByDateRange` queda a medias.
- **`delivery-listar-pdv`** (`delivery.handler.ts:190-193`) hace `leftJoinAndSelect` de `delivery.cliente` → `cliente.persona` **y** de `delivery.entregadoPorFuncionario` → `repartidor.persona`. El `Funcionario` arrastra `salarioBase`, `valorJornal`, `numeroIps` y `cuentaBancariaPropia`: **datos de sueldo del repartidor**, expuestos a cualquier JWT válido. Es el mismo patrón que `getVentasByDateRange` ya corrigió en `:1106-1108` (lección documentada de la sesión 2026-08-28), y es un canal del dominio caja que el PdV invoca cada vez que se abre el diálogo de delivery. Se recorta a `id` + `persona.{id,nombre,apellido}` del funcionario, sin ninguna columna salarial.

`cliente.persona` en `getVentasByDateRange:1087` y en `delivery-listar-pdv` se recorta a `id, nombre, apellido, documento` — el documento sí lo usa la facturación desde el historial; dirección, teléfono, email y fecha de nacimiento no.

**Queda fuera de este PR** (anotado en `known-bugs.md` con su lista): ~20 canales más que hidratan `createdBy.persona` en Caja Mayor, bancos, compras y RRHH — `caja-mayor.handler.ts:1147, 1197, 2055, 2085, 2330, 2368`, `financiero.handler.ts:352, 362`, etc. Con `select: false` ya dejan de publicar el hash; lo que sigue expuesto ahí son datos personales (CI, teléfono, email), que es un grado menos grave y una superficie mucho más grande.

**Alternativa descartada — sanitizador central en `installHandlerRegistry`.** Era tentadora: el monkey-patch de `electron/utils/handler-registry.ts:27-34` es el único punto por el que pasan IPC local, `/api/rpc` y `/pub/*`, así que envolver ahí el listener cubriría todo de un saque. Se descarta por tres motivos concretos:

1. **Rompe canales legítimos.** `db-config.handler.ts:88-102` usa un campo `password` de verdad (con `PASSWORD_MASK`) para la configuración de Postgres. Un borrado ciego por nombre de clave rompe la pantalla de configuración de BD. Y `pedidos-online-auth.handler.ts` maneja `passwordHash` de clientes.
2. **Costo en runtime permanente por un problema que `select: false` ya elimina.** Un walk recursivo sobre cada respuesta —`getVentasByDateRange` devuelve miles de filas con sus ítems— se paga en cada request, para siempre, buscando una clave que ya no puede venir.
3. **Falsa sensación de cobertura.** No resuelve la parte de `persona`, que es la mitad del problema, y desalienta hacer el recorte fino donde importa.

En su lugar, la garantía de no-regresión va como **test** (`test:sin-fuga-datos`, §11), que cuesta cero en producción y falla en CI si alguien vuelve a hidratar un `Usuario` entero.

---

## 5. Tabla de canales: decisión por cada uno

Estado hoy verificado en el código de esta rama. "Guard" = `assertCajaAbierta` sobre la caja resuelta server-side.

### 5.1 — Canales que pasan a rechazar con `CAJA_CERRADA`

| Canal | Archivo:línea | Caja se resuelve de | Decisión |
|---|---|---|---|
| `createVenta` | `ventas.handler.ts:997` | `data.caja.id` | Guard dentro de la transacción de `crear()` (`:1029`), junto a `assertNoVentaAbiertaEnMesa` |
| `createPago` | `compras.handler.ts:1411` | **`venta.caja` si viene `ventaId`**; si no, `data.caja` | Guard + derivación, **capa 1** de D4 |
| `updateVenta` cuando adopta `data.pago` | `ventas.handler.ts` (rama del `pago`) | **`venta.caja`, siempre server-side** | **Capa 2 de D4**: sobrescribe `pago.caja` con la caja de la venta + guard. Es lo que cierra la causa C incluso con clientes viejos |
| `createPagoDetalle` | `compras.handler.ts:1484` | `pago.caja` (ya server-side, `:1497-1502`) | Guard; la resolución del pago deja de ser condicional al flag `validarDispositivoCaja` |
| `updateVenta` ABIERTA→CONCLUIDA | `ventas.handler.ts:1391-1397` | FK cruda `filaVenta.c` (`:1383-1385`) | Guard solo en la transición ABIERTA→CONCLUIDA. Las demás transiciones no imputan plata nueva |
| `cerrarVentasAbiertasMesa` con `CONCLUIDA` | `ventas.handler.ts:882-914` | `v.caja.id` (`:890`) | Guard por cada venta, mismo lugar que el gate de terminal (`:906-910`) |
| `cobrar-venta-credito` | `cuentas-por-cobrar.handler.ts:819` | `venta.caja` (`:850-852`) | Guard. Crea `Pago` con `caja: venta.caja` (`:903`) |
| `registrarCobroParcial` | `ventas.handler.ts:4506` | `venta` → su caja | Guard junto al `VENTA_NO_ABIERTA` de `:4526` |
| `delivery-crear` | `delivery.handler.ts:267-293` | `payload.cajaId` | Guard dentro de la transacción de `:298` |
| `create-gasto-caja` | `gastos-caja.handler.ts:18` | `data.cajaId` | Guard, **salvo** flag de ajuste (D6) |
| `create-retiro-caja` | `caja-mayor.handler.ts:1719` | `data.caja.id` | Guard, **salvo** flag de ajuste (D6) |
| `edit-gasto-caja` | `gastos-caja.handler.ts:68` | `gasto.caja` — **hay que cargar la relación** (ver nota) | Guard, **salvo** flag de ajuste. Cambia el monto → cambia el esperado del arqueo |
| `anular-gasto-caja` | `gastos-caja.handler.ts:56` | `gasto.caja` — **hay que cargar la relación** (ver nota) | Guard, **salvo** flag de ajuste. Ídem |
| `materializarPedidoOnlineEnVenta` | `ventas.handler.ts:249-256` | `opts.cajaId` o la única abierta | Guard sobre `cajaId` explícito, **con fallback** (ver nota B7). El camino "única abierta" (`:252-255`) ya filtra por `estado: ABIERTO` y no necesita más |
| `transferir-venta-pdv` | `ventas.handler.ts:3025` | `ventaOrigen.caja` | Guard sobre la caja de origen. Crear una venta destino nueva en una caja cerrada es exactamente el bug |

⚠️ **Nota B17 — `anular-gasto-caja` y `edit-gasto-caja` cargan el gasto SIN la relación `caja`.** Los dos usan `findOneBy({ id })` (`gastos-caja.handler.ts:59` y `:73`). Hay que pasarlos a `findOne({ where: { id }, relations: ['caja'] })` o resolver la caja por SQL/`cajaDeGasto`. Es trivial, pero si no se escribe explícitamente el guard sale como **no-op silencioso** — exactamente el modo de falla que el comentario de `createPagoDetalle` (`compras.handler.ts:1490-1493`) ya documenta para `pago.caja`.

⚠️ **Nota B7 — `aceptar-pedido-online` se traga el error y deja el pedido sin venta.** `electron/handlers/pedidos-online-admin.handler.ts:147-160` llama `materializarPedidoOnlineEnVenta` dentro de un `try/catch` que solo guarda `errorMaterializacion` y devuelve `success: true` — es best-effort **a propósito** (*"un problema de caja no debe deshacer la aceptación, que ya es visible para el cliente"*). Con el guard tal cual, aceptar un pedido contra una `cajaId` cerrada dejaría el pedido **ACEPTADO sin `Venta`**: no entra al tablero del PdV, no se puede cobrar ni imprimir, y el cliente ya fue notificado. Es el mismo modo de falla que la lección de `delivery-listar-pdv` ("bloquearlo deja deliveries colgados para siempre").

Por eso el guard de `materializarPedidoOnlineEnVenta` lleva **fallback**: cuando el rechazo sea `CAJA_CERRADA` y venía un `cajaId` **explícito**, **reintentar con la única caja abierta** (el camino `:252-255` ya filtra por `ABIERTO` y es seguro). Si tampoco hay ninguna abierta, devolver `errorMaterializacion` con **texto en español visible en la bandeja de pedidos online**, para que el operador sepa que tiene que abrir caja y volver a materializar — no un pedido aceptado que desaparece.

El riesgo está bien acotado: el único camino que pasa `cajaId` explícito (y lo elige el cliente) es `aceptar-pedido-online`. `list-pedidos-online.component.ts:88` invoca `materializar-pedido-online-en-venta` **sin `opts`** y `pedidos-online-pedidos.handler.ts:480` (alta pública) tampoco pasa `cajaId`: los dos usan la única abierta, no una caja rancia.

### 5.2 — Canales que siguen funcionando sobre caja cerrada, y por qué

| Canal / función | Archivo:línea | Decisión | Razón |
|---|---|---|---|
| `generarRetiroDelCierre` (auto, dentro de `update-caja`) | `retiro-cierre.util.ts:20-90`, llamada en `financiero.handler.ts:737-742` | **Sin guard** | Es *parte* del cierre. La caja acaba de pasar a CERRADO en la línea anterior; exigir ABIERTO se autobloquearía. Además es idempotente y no pasa por `create-retiro-caja` |
| `generar-retiro-cierre-caja` (manual) | `caja-mayor.handler.ts:1821-1834` | **Sin guard** | Solo tiene sentido sobre una caja cerrada; hoy falla si no hay conteo de cierre. Mantiene `CAJA_MAYOR_OPERAR` |
| `finalizar-ajuste-caja` | `financiero.handler.ts:791-820` | **Sin guard**; ya exige `caja.estado === CERRADO` (`:796`) y `FINANCIERO_CAJA_AJUSTAR` (`:792`) | Es el flujo de ajuste por definición |
| `puede-ajustar-caja` | `financiero.handler.ts:771-786` | Sin cambios (lectura) | — |
| `ingresar-retiro-caja` | `caja-mayor.handler.ts:1750-1813` | **Sin guard** | Mueve un retiro ya existente a Caja Mayor. No toca la caja de venta ni su arqueo |
| `create-gasto-caja` / `create-retiro-caja` con `ajuste` | ídem 5.1 | **Permitido** con `FINANCIERO_CAJA_AJUSTAR` + motivo + retiro de cierre no INGRESADO | Es el "agregar el gasto/retiro que faltó" de `list-cajas.component.ts:366-392` |
| `anular-egreso-caja` disparado desde `anular-vale` | `vales.handler.ts:451-462` | **Sin guard** | Es una **reversa** en cascada de una anulación de vale; bloquearla dejaría el vale anulado y el egreso vivo, que es peor que el descuadre. Se anota en el manual de pruebas |
| `anular-egreso-caja` directo | `pdv-egresos.handler.ts:336-351` | **Sin cambios** — ya exige caja abierta vía `validarCaja` (`:43-45`) | Ya estaba bien |
| `crear-vale-caja`, `pagar-vale-caja`, `crear-compra-simplificada-caja`, `pagar-compra-cuota-caja` | `pdv-egresos.handler.ts:124, 177, 231, 279` | **Solo se unifica el mensaje** al código `CAJA_CERRADA` | Ya validaban `estado !== ABIERTO` (`:43-45`); lo único que faltaba era que el PdV pudiera detectarlo por código |
| Cobrar un **delivery pendiente de otra caja** que muestra `delivery-listar-pdv` | `delivery.handler.ts:180-226` (`otraCaja` en `:225`) | **Rechazado si la caja de esa venta está cerrada** — ⚠️ **sujeto a Q1, que se decide ANTES de empezar la Fase 1** | Es el camino que generó los 52 cobros cruzados. El delivery sigue **visible** (ver la lista es lectura), pero cobrarlo requiere que su caja esté abierta. Alternativa evaluada: permitirlo imputando a la caja actual — mueve plata entre arqueos, y solo es aceptable con traza explícita. Si Q1 se resuelve "rechazar", `delivery-listar-pdv` muestra un **aviso en la fila** («caja cerrada — no se puede cobrar») y el manual documenta el flujo de **cancelación + reventa**, porque si no ese delivery no se puede cobrar nunca (no hay reapertura de cajas). Ver §13 Q1 |
| Cancelar / anular una venta de caja cerrada (`updateVenta → CANCELADA`, `delivery-cancelar`) | `ventas.handler.ts:1403-1416`, `venta-reversa.utils.ts` | **Permitido** | Cancelar **resta**, no agrega: deja el arqueo más cerca de la realidad, no más lejos. Y bloquearlo deja mesas y deliveries colgados para siempre (es la lección de `delivery-listar-pdv`, `delivery.handler.ts:175-179`). Se anota en el manual |
| `anularCobroParcial` | `ventas.handler.ts:4622` | **Permitido**, con assert propio en `test:caja-cerrada` | Mismo argumento que CANCELADA: es una **reversa que resta**. Ya exige `VENTAS_PDV`, solo opera sobre una venta **ABIERTA** y **desactiva** el `PagoDetalle` en vez de borrarlo, así que la traza queda. Bloquearlo dejaría un cobro parcial mal cargado imposible de deshacer. Hallazgo A2 |
| `deleteVenta` | `ventas.handler.ts:1573` | **Permitido** | Solo borra ventas **sin ítems** — o sea sin plata: no hay `Pago` ni arqueo que mover. Es un canal de limpieza de inventario/mesas, no de caja. Hallazgo A3 |
| Todo Caja Mayor (`create-gasto`, `create-entrada-varia`, `create-operacion-financiera`, pago consolidado) | `caja-mayor.handler.ts` | **Sin guard** | No tienen FK a `cajas` (verificado: solo `caja_mayor_id`) |
| `create-conteo`, `update-conteo`, `create-conteo-detalle`, `update-conteo-detalle` | `financiero.handler.ts:369, 387, 443, 456` | **Sin guard** | El conteo de cierre se crea *sobre* la caja que se está cerrando; y el ajuste corrige conteos de cajas cerradas a propósito. Los cuatro ya tienen `ensurePermission` (verificado) |
| `enviar-resumen-cierre-whatsapp`, `print-cierre-caja` | `financiero.handler.ts:830`, `documentos-tickets.handler.ts` | **Sin guard** | Lecturas/impresión |

---

## 6. Fases

Cada fase cierra con **commit + push**. Todas tocan backend/entidades/DB → **la app requiere reinicio** (aviso obligatorio, regla dura §3 #14).

### Fase 1 — Helper central, guard en los canales de escritura y derivación de la caja del pago

> **Prerrequisito:** Q1 (§13) tiene que estar decidida antes de empezar (hallazgo A1): cambia el guard de `createPago`/`createPagoDetalle` para el delivery de otra caja y el aviso de `delivery-listar-pdv`.

**Archivos — backend**

| Archivo | Cambio |
|---|---|
| `electron/utils/caja-abierta.utils.ts` | **NUEVO**. `ERROR_CAJA_CERRADA`, `leerEstadoCaja`, `assertCajaAbierta`, `cajaDeVenta`, `cajaDePago` (D2, D3) |
| `electron/handlers/ventas.handler.ts:1029` | Guard en la transacción de `createVenta`, junto a `assertNoVentaAbiertaEnMesa` |
| `electron/handlers/ventas.handler.ts:1391` | Guard en `updateVenta` ABIERTA→CONCLUIDA |
| `electron/handlers/ventas.handler.ts` (`updateVenta`, rama que adopta `data.pago`) | **D4 capa 2**: resolver `venta.caja` server-side, **sobrescribir `pago.caja`** y `assertCajaAbierta` sobre ella. Es lo que hace el fix robusto contra clientes viejos |
| `electron/handlers/ventas.handler.ts:906` | Guard en `cerrarVentasAbiertasMesa` para `CONCLUIDA` |
| `electron/handlers/ventas.handler.ts:4526` | Guard en `registrarCobroParcial` |
| `electron/handlers/ventas.handler.ts:249` | Guard en `materializarPedidoOnlineEnVenta` cuando viene `opts.cajaId`, **con el fallback a la única caja abierta** y el `errorMaterializacion` en español (nota B7 de §5.1) |
| `electron/handlers/ventas.handler.ts:3025` | Guard sobre `ventaOrigen.caja` en `transferir-venta-pdv` |
| `electron/handlers/compras.handler.ts:1411` | `createPago`: derivar caja de la venta cuando viene `ventaId`; si no, guard sobre `pagoData.caja` (D4 capa 1) |
| `electron/handlers/compras.handler.ts:1484` | `createPagoDetalle`: resolución del pago incondicional + guard |
| `electron/handlers/cuentas-por-cobrar.handler.ts:836` | Guard en `cobrar-venta-credito` |
| `electron/handlers/delivery.handler.ts:298` | Guard en `delivery-crear`, dentro de la transacción |
| `electron/handlers/gastos-caja.handler.ts:18, 56, 68` | Guard + flag de ajuste (D6) en create/anular/edit. **`anular`/`edit` pasan a cargar la relación `caja`** (`findOne({ where, relations: ['caja'] })`, hoy `findOneBy` en `:59` y `:73`) — sin eso el guard es un no-op |
| `electron/handlers/caja-mayor.handler.ts:1719` | Guard + flag de ajuste en `create-retiro-caja` |
| `electron/handlers/pdv-egresos.handler.ts:43-45` | El mensaje pasa a `CAJA_CERRADA: La caja #N ya fue cerrada…` usando el helper |
| `electron/handlers/pedidos-online-admin.handler.ts:147-160` | `errorMaterializacion` con el texto en español que la bandeja muestra (nota B7) |

**Archivos — frontend (parte del fix de raíz, D4 capa 1; NO se posterga a la Fase 3)**

| Archivo:línea | Cambio |
|---|---|
| `src/app/shared/components/cobrar-venta-dialog/cobrar-venta-dialog.component.ts:908` | agregar `ventaId: this.data.venta.id` al payload de `createPago` |
| `cobrar-venta-dialog.component.ts:1088` | ídem (rama de ajuste por descuento/aumento) |
| `src/app/pages/ventas/pdv/pdv.component.ts:2364` | agregar `ventaId: venta.id` en el cobro rápido F2 |

**Qué `manager` recibe `assertCajaAbierta` en cada canal.** Se enumera canal por canal porque pasar el `DataSource` por error convierte el guard en un **no-op transaccional silencioso**: lee fuera de la transacción de la escritura y el TOCTOU de D3 queda abierto.

| Canal | Ejecutor que hay que pasar |
|---|---|
| `createVenta` | el `manager` de la transacción de `crear()` — `ventas.handler.ts:1029` |
| `delivery-crear` | el `manager` de la transacción — `delivery.handler.ts:298` |
| `registrarCobroParcial` | `queryRunner.manager` — `ventas.handler.ts:4519` |
| `cobrar-venta-credito` | `queryRunner.manager` — `cuentas-por-cobrar.handler.ts:836` |
| `materializarPedidoOnlineEnVenta` | `qr.manager` — `ventas.handler.ts:263` |
| `transferir-venta-pdv` | el `manager` de la transacción (dentro del `reduce` de `withMesaLock`/`withComandaLock`) |
| `updateVenta`, `cerrarVentasAbiertasMesa`, `createPago`, `createPagoDetalle`, gastos, retiros | el `EntityManager`/`queryRunner` que ya usa la escritura en cada uno; si el handler no abre transacción, el `DataSource` (no hay nada que serializar) |

**Criterio de aceptación**
- Crear venta, cobrar, agregar línea de pago, crear delivery, gasto o retiro sobre una caja `CERRADO` lanza un error que contiene `CAJA_CERRADA`.
- **Un cobro hecho por el flujo real** (`createPago` **sin** `ventaId` + `updateVenta({ pago })`, que es lo que manda un cliente viejo) deja `pago.caja === venta.caja`. Este es el criterio que cierra la causa C; el test con `ventaId` sintético no alcanza.
- `createPago({ ventaId, caja: <otra caja> })` persiste el `Pago` con la caja de la **venta**.
- Cobrar una venta **ABIERTA de la caja actual** sigue funcionando sin ningún rechazo (assert positivo, §11).
- Los flujos de 5.2 siguen funcionando sin cambios.
- `npm run build` verde.

### Fase 2 — Apertura atómica, índice único y cierre de caja cerrada

**Archivos**

| Archivo | Cambio |
|---|---|
| `src/app/database/migrations/1790617935368-CajaUnicaAbiertaPorDispositivo.ts` | **NUEVO** (§7) |
| `src/app/database/database.config.ts` | Import + alta en `getMigrations()` (línea ~644, al final del array) |
| `electron/utils/indices-opcionales.utils.ts` | **NUEVO**: `asegurarIndicesOpcionales(ds)` — reintento idempotente del índice único (D9, B4) |
| `src/app/database/database.service.ts:76` | Llamar `asegurarIndicesOpcionales(ds)` **después** de `runMigrations`, en `try/catch` que solo loguea |
| `electron/handlers/financiero.handler.ts:661-684` | `create-caja`: `ensurePermission` como primera sentencia del `try`; guard sobre `estadoFinal`; transacción + `FOR UPDATE`; traducción de 23505 / SQLITE_CONSTRAINT (D10) |
| `electron/handlers/financiero.handler.ts:686-754` | `update-caja`: rechazo CERRADO→CERRADO **antes** del chequeo de permiso de ajuste (D7 regla 1 → regla 2); `FINANCIERO_CAJA_AJUSTAR` para cualquier update sobre caja CERRADO; transacción con `FOR UPDATE` sobre la fila **con el alcance acotado de D3** (retiro de cierre y WhatsApp **fuera**, después del commit) |
| `electron/handlers/financiero.handler.ts:867-875` | `get-caja-abierta-by-usuario`: `order: { fechaApertura: 'DESC', id: 'DESC' }` (D8) |
| `electron/handlers/caja-mayor.handler.ts:1938-1974` | `abrir-caja-desde-conteo`: mismo tratamiento que `create-caja` (**sin** unificar el permiso, D10) |
| `create-caja-dialog.component.ts:144-149` | Revalidar con `get-caja` **contra el backend** al abrir: si está `CERRADO` y **no** es modo ajuste → estado de error, sin botón de guardar y **sin crear ningún `Conteo`** (D7, B9) |
| `create-caja-dialog.component.ts:1316-1325` | En modo ajuste, omitir `estado` del payload de `updateCaja` (D7) |
| `projects/mobile/.../caja-cerrar.page.ts:86-99` | Misma revalidación con `get-caja` antes de `createConteo`, y manejo de `CAJA_CERRADA` si vuelve del backend por carrera (D7, A4) |
| `src/app/shared/components/cierre-caja-dialog/` | **Borrar el componente** — código muerto que duplica el flujo de cierre y llama `updateCaja` sin revalidación (B8) |

**Criterio de aceptación**
- `create-caja` sin `estado` en el payload también queda gateado.
- `update-caja(id, { estado: 'CERRADO' })` sobre una caja ya cerrada → `CAJA_CERRADA`, **con ese mensaje** y no con «PERMISO REQUERIDO» (orden de reglas de D7).
- Intentar cerrar una caja ya cerrada **no deja un `Conteo` ni `ConteoDetalle` nuevos** en la base.
- Cerrar una caja **sigue generando el `RetiroCaja` de origen `CIERRE`** (no-regresión de B3/RB-1).
- Ajustar el conteo de una caja cerrada sigue funcionando de punta a punta.
- La migración corre en SQLite y en Postgres; con duplicados no aborta, y el arranque siguiente crea el índice solo en cuanto la base queda limpia.
- **Concurrencia (solo Postgres):** dos `create-caja` concurrentes sobre el mismo dispositivo → uno gana, el otro recibe `CAJA_ABIERTA_DUPLICADA` (no un 23505 crudo). Se valida con **`npm run test:locks-pg`**. ⚠️ **El `Promise.all` en SQLite NO es criterio de aceptación**: el driver serializa igual y el caso pasaría aunque el fix no existiera (misma trampa de `test:delivery-conversion`). Queda en la suite como humo, no como gate.

### Fase 3 — PdV: revalidación, eventos y jornada anterior

**Archivos**

| Archivo | Cambio |
|---|---|
| `electron/utils/mesa-events.utils.ts:20-28` | `MesaEventTipo` += `'CAJA_CAMBIO'`; payload += `cajaId?`, `cajaEstado?`; `seq: Date.now()` para este tipo (B14) |
| `electron/utils/mesa-emit.utils.ts` | `emitCajaCambio(ds, cajaId, estado)` |
| `electron/handlers/financiero.handler.ts:731, 679` | Emitir `CAJA_CAMBIO` al cerrar y al crear |
| `electron/handlers/financiero.handler.ts:818` | Emitir `CAJA_CAMBIO` también en `finalizar-ajuste-caja` (A13) |
| `electron/handlers/caja-mayor.handler.ts:1968` | Emitir `CAJA_CAMBIO` al abrir desde conteo |
| `preload.ts` (junto a `onComandaEvent`, `:4398`) | `onMesaEvent(handler)` sobre el canal `mesa-updates`, devolviendo la función de desuscripción |
| `src/app/pages/ventas/pdv/pdv.component.ts:327` | `inicializarCaja`: leer `PdvConfig` primero **normalizando el array** (`Array.isArray(cfg) ? cfg[0] : cfg`, B15); chequeo de jornada anterior (D13); `await` del camino "ninguna caja" (B10) |
| `pdv.component.ts:357-405` | `ofrecerAbrirCaja` pasa a `async` y **devuelve la caja resuelta** (B10) |
| `pdv.component.ts` (nuevo) | `asegurarCajaAbierta(accion)` y `manejarErrorCajaCerrada(error)` (D12), con los flags `revalidandoCaja` y `avisoCajaCerradaAbierto` (B11) |
| `pdv.component.ts:1983, 2151, 2305, 2326, 2482, 2537, 2443` | Llamada a `asegurarCajaAbierta` antes de cada operación. ⚠️ **`getVenta()` (`:1983`) y `openUtilitarios()` (`:2537`) cambian de firma a `async`** — revisar todos los llamadores de `getVenta` y que lo `await`een (B13) |
| `pdv.component.ts:573` | Suscripción a `window.api.onMesaEvent` + manejo de `CAJA_CAMBIO` en `onmessage` del SSE (`:3218-3231`), **sin comparar `seq` contra los de mesa/comanda** (B14) |
| `pdv.component.ts:291` | `@HostListener('window:focus')` + `document.visibilitychange` + `tabsService.activeTab$` con `.pipe(distinctUntilChanged(), filter(id => id === 'pdv'), skip(1))` (B11) → revalidar |
| `pdv.component.ts:638-650` | Limpieza en `ngOnDestroy`: se agregan el `unsubscribe` del IPC `onMesaEvent` y del `activeTab$` (hoy solo limpia el SSE y cuatro timers) |
| `pdv.component.ts:3328-3333` | El fallback de polling también revalida la caja |
| `seleccionar-caja-dialog` | Mensaje de advertencia de jornada anterior + botón *Ir a cerrarla*; resultado `{ caja?, abrirNueva?, cerrar? }` (D13) |
| `pdv.component.ts:344-351` | Branch del resultado `{ cerrar: caja }`: abrir `create-caja-dialog` en modo cierre si tiene `FINANCIERO_CAJA_OPERAR`, si no aviso «pedile a un encargado» (D13) |
| `utilitarios-dialog.component.ts:124-133` | No manda `ajuste` (explícito, con comentario) |
| `list-cajas.component.ts:366-392` | `agregarGasto` / `agregarRetiro` piden motivo con `PromptDialogComponent` y pasan `ajuste: true` |
| `resumen-caja-dialog.component.ts:99, 102-110` | `editarGasto` pasa `ajuste: true` + motivo si la caja está cerrada, y **el gate del front chequea también `FINANCIERO_CAJA_AJUSTAR`** cuando la caja está cerrada: hoy solo pide `FINANCIERO_CAJA_GESTIONAR` (`:99`), así que un rol custom con `GESTIONAR` y sin `AJUSTAR` vería el botón y comería un rechazo del backend (B19; el GERENTE del seed tiene los dos, `seed-system.ts:497-499`) |
| `gasto-caja-dialog.component.ts`, `create-retiro-caja-dialog.component.ts:192` | Reenvían `ajuste` al handler |
| `projects/mobile/.../tomar-pedido.page.ts:373-400, 509` | Revalidar la caja antes de crear la venta; manejar `CAJA_CERRADA` |
| `projects/mobile/.../caja-abrir.page.ts:100` | Mensaje de `CAJA_ABIERTA_DUPLICADA` |
| `projects/mobile/.../caja-cerrar.page.ts` | (ya listado en la Fase 2) manejo de `CAJA_CERRADA` en español + revalidación previa (A4) |
| `delivery-listar-pdv` (front del diálogo de delivery del PdV) | Si Q1 = "rechazar": aviso en la fila cuando la caja de esa venta está cerrada, para que el cajero no intente cobrar (A1) |

**Criterio de aceptación**
- Con el PdV abierto, cerrar la caja desde Financiero › Cajas: el PdV avisa «Esta caja ya fue cerrada» sin que el usuario toque nada **en standalone y en server (por IPC)**, y al primer foco/acción/polling **en `mode=client`** (donde no hay transporte instantáneo, D11), y vuelve a `inicializarCaja`.
- Venta, cobro, cobro rápido, delivery, gasto, retiro y vale quedan bloqueados con el mismo mensaje.
- Un solo aviso y una sola reinicialización aunque disparen el foco, el `activeTab$` y el IPC a la vez (B11).
- Al entrar al PdV con la única caja abierta de ayer, aparece el aviso con las tres opciones, y *Ir a cerrarla* abre el diálogo de cierre.
- Sin regresiones en el gate de terminal ajena (`npm run test:terminal-caja`).

### Fase 4 — Fuga de datos

**Archivos**

| Archivo | Cambio |
|---|---|
| `src/app/database/entities/personas/usuario.entity.ts:16-17` | `@Column({ select: false })` |
| Los 7 lectores de la tabla en D14 | `addSelect` / `select` explícito |
| `electron/utils/select-usuario-publico.util.ts` | **NUEVO**: helper de recorte para QB y para `relations`/`select` de `find` |
| Los **11** canales de la tabla en D14 | `leftJoin` + `addSelect` acotado — incluidos `ventas.handler.ts:1082-1083` (`caja.createdBy`) y `delivery.handler.ts:190-193` (`delivery-listar-pdv`), agregados en la v2 por B5 |

**Criterio de aceptación**
- Ningún JSON devuelto por los 11 canales contiene la clave `password`.
- Ninguno trae `documento`/`telefono`/`direccion`/`email`/`fechaNacimiento` de la `Persona` del **cajero** (incluido el de `caja.createdBy` de `getVentasByDateRange`) ni columnas salariales del `Funcionario` repartidor en `delivery-listar-pdv`.
- Login, `validate-credentials`, cambio de contraseña, **`updateUsuario`**, recuperación por código, onboarding y seed del admin siguen funcionando (los tres writes de R3).
- La UI que muestra nombres de cajero (lista de cajas, resumen, retiros, gastos, historial) sigue mostrándolos.

### Fase 5 — Tests, documentación y manual de pruebas

Ver §11 y §12. Además:

- **Docs de la skill:** `domains/ventas-pdv.md` (sección Cajas), `domains/financiero-caja-mayor.md`, `reference/handlers-index.md` (canales con comportamiento nuevo), `reference/known-bugs.md` (marcar RESUELTO lo de `getVentasByDateRange` + anotar la deuda residual de `persona`).
- **Manual de usuario** (agregado en v2 por A8 — el PR cambia UX visible): sección de **PdV uso diario** (aviso de caja cerrada y qué hacer, aviso de caja de jornada anterior con las tres opciones, qué significa que un delivery de otra caja no se pueda cobrar) y sección de **Caja Mayor / Financiero** (cerrar una caja ya cerrada ahora da error, "agregar el gasto/retiro que faltó" ahora pide motivo y permiso de ajuste).
- **`todos-pendientes.md`** (A8): la deuda residual de los ~20 canales que siguen hidratando `createdBy.persona` va ahí **además** de `known-bugs.md`, con el grep que la reproduce. En `known-bugs.md` sola se pierde: nadie la lee como backlog.
- `docs/testing/TESTING-CHECKLIST-CAJA-CERRADA.md`.

---

## 7. Migraciones

Una sola: **`src/app/database/migrations/1790617935368-CajaUnicaAbiertaPorDispositivo.ts`**, clase `CajaUnicaAbiertaPorDispositivo1790617935368`.

Timestamp generado con `date +%s%3N` en Linux el 2026-09-28 (epoch-ms real, no redondeado). Es mayor que la última migración registrada (`1789587049751-MovimientoBancarioCuentaDestino`), así que ordena al final.

```ts
export class CajaUnicaAbiertaPorDispositivo1790617935368 implements MigrationInterface {
  name = 'CajaUnicaAbiertaPorDispositivo1790617935368';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pre-chequeo: si ya hay dos cajas ABIERTO en el mismo dispositivo, el índice
    // no se puede crear. NO se aborta la migración (corre al arrancar la app: un
    // fallo deja la instalación sin arrancar — mismo criterio que
    // 1787255528889-IndicesRucYReconciliarMesas) y NO se cierra ninguna caja sola.
    const dups: any[] = await queryRunner.query(`
      SELECT dispositivo_id, COUNT(*) AS n
        FROM cajas
       WHERE estado = 'ABIERTO'
       GROUP BY dispositivo_id
      HAVING COUNT(*) > 1
    `);
    if (dups.length > 0) {
      console.error(
        '[migration CajaUnicaAbiertaPorDispositivo] NO se creó el índice único: hay dispositivos con más de una caja ABIERTO. ' +
        'Cerrá manualmente las sobrantes y volvé a aplicar. Dispositivos: ' +
        dups.map((d) => `${d.dispositivo_id} (${d.n})`).join(', '),
      );
      return;
    }

    // Índice parcial: válido tal cual en SQLite (>= 3.8.0) y en Postgres (>= 9.0).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cajas_abierta_por_dispositivo"
        ON "cajas" ("dispositivo_id") WHERE "estado" = 'ABIERTO'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cajas_abierta_por_dispositivo"`);
  }
}
```

**El `return` temprano no es la mitigación completa** (hallazgo B4): TypeORM marca la migración como ejecutada igual, así que el índice no se crearía nunca más. Por eso el mismo `CREATE UNIQUE INDEX IF NOT EXISTS` se reintenta en cada arranque desde `asegurarIndicesOpcionales(ds)`, llamada después de `runMigrations` en `src/app/database/database.service.ts:76` (ver D9). El texto del log de la migración debe decir eso: *"cerrá manualmente las sobrantes; el próximo arranque crea el índice solo"*.

Alta en `src/app/database/database.config.ts`: import + última posición del array de `getMigrations()` (~línea 644). Verificado que `getMigrations()` (`:644-651`) elige la baseline por driver y devuelve **un solo array de incrementales común a los dos**, así que agregar al final alcanza y corre en ambos.

**No hay migración para `select: false`** — es una bandera de query de TypeORM, no DDL. Verificar igual con `npm run migration:generate` en seco que no produce diff (si lo produjera, es señal de que TypeORM lo interpreta distinto de lo esperado y hay que revisar).

**No hay entidad nueva ni columna nueva.** El índice no se declara con `@Index` en la entidad porque TypeORM 0.3 no expresa índices parciales de forma portable entre los dos drivers; queda solo en la migración, con el comentario correspondiente en `caja.entity.ts`.

**Compatibilidad del pre-chequeo con los dos drivers:** `COUNT(*)`, `GROUP BY` y `HAVING` son estándar; en Postgres `n` vuelve como string (`bigint`), pero solo se usa para el mensaje. **La migración no ramifica por driver** — corrección del hallazgo A6: el SQL (índice parcial + pre-chequeo) es portable tal cual entre SQLite ≥ 3.8.0 y Postgres ≥ 9.0, y `Caja.estado` es `varchar`, no un enum nativo, así que el predicado `WHERE "estado" = 'ABIERTO'` es válido en los dos. La v1 decía "la migración es driver-aware" sin que el snippet tuviera ningún branch; la frase se corrigió en vez de agregar un branch inútil.

**Sin `UPDATE` ni `DELETE`:** la migración no toca ni una fila de negocio. Es la restricción dura de §2 (no corrección retroactiva).

---

## 8. Permisos

No se crea ningún permiso nuevo. Se hacen cumplir dos que ya existen en `SEED_PERMISOS` (`electron/handlers/permissions.handler.ts:130-133`):

| Permiso | Dónde se agrega | Por qué |
|---|---|---|
| `FINANCIERO_CAJA_AJUSTAR` | `create-gasto-caja`, `edit-gasto-caja`, `anular-gasto-caja`, `create-retiro-caja` cuando la caja está CERRADA y viene `ajuste`; `update-caja` sobre caja CERRADA | Su propia descripción ya dice "agregar gasto/retiro"; hasta hoy solo lo exigía `finalizar-ajuste-caja` |
| `FINANCIERO_CAJA_OPERAR` | Ya presente en `create-caja` y `update-caja`; se mueve a primera sentencia del `try` | Regla dura §3 #22 |

**Handlers tocados y estado de `ensurePermission` (verificado uno por uno):**

| Handler | Hoy | Acción |
|---|---|---|
| `create-caja` `financiero.handler.ts:662` | Presente, **antes** del `try` | Mover a primera sentencia del `try` |
| `update-caja` `:688` | Presente, primera del `try` | OK; se le suma el de ajuste |
| `abrir-caja-desde-conteo` `caja-mayor.handler.ts:1939` | Presente, antes del `try` | Mover adentro |
| `create-retiro-caja` `:1721` | Presente, primera del `try` | OK |
| `createVenta` `ventas.handler.ts:999` | Presente | OK |
| `createPago` / `createPagoDetalle` `compras.handler.ts:1412, 1485` | Presente (sin `try`) | OK |
| `create-gasto-caja` / `anular-gasto-caja` / `edit-gasto-caja` `gastos-caja.handler.ts:19, 57, 69` | Presente | OK |
| `delivery-crear` `delivery.handler.ts:268` | Presente | OK |
| `cobrar-venta-credito` `cuentas-por-cobrar.handler.ts:820` | Presente | OK |
| `cerrarVentasAbiertasMesa` `ventas.handler.ts:884` | Presente | OK |
| `registrarCobroParcial` `ventas.handler.ts:4507` | Presente | OK |
| `transferir-venta-pdv` `ventas.handler.ts:3115` | **Presente y verificado**: `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` en `:3116`, primera sentencia del `try` | Sin cambios (B18 cerró este ítem) |
| `anularCobroParcial` `ventas.handler.ts:4622` | Presente (`VENTAS_PDV`) | Sin cambios — canal permitido de §5.2 |
| `create-conteo` / `update-conteo` / `create-conteo-detalle` / `update-conteo-detalle` / `delete-conteo-detalle` | Presentes (`FINANCIERO_CAJA_OPERAR` / `_GESTIONAR`) | Sin cambios |

`puede-ajustar-caja` (`financiero.handler.ts:771`) y `get-caja*` son lecturas: no llevan `ensurePermission` por convención.

**Lo que NO se unifica** (B16): `create-caja` sigue con `FINANCIERO_CAJA_OPERAR` y `abrir-caja-desde-conteo` con `FINANCIERO_CAJA_GESTIONAR`, con la justificación de D10. Escrito acá también para que quede en el lugar donde el auditor de la implementación va a mirar los permisos.

---

## 9. Compatibilidad y rollback

### Cliente viejo contra servidor nuevo

Aplica a un desktop empaquetado en `mode=client` que no se actualizó. (`/admin` y la PWA los sirve el propio nodo servidor, así que se actualizan con él.)

| Situación | Efecto | Mitigación |
|---|---|---|
| El PdV viejo opera sobre una caja cerrada | El servidor rechaza con `CAJA_CERRADA: …`. El cliente viejo no conoce el código, así que muestra `HTTP 500: {"error":"CAJA_CERRADA: La caja #N ya fue cerrada…"}` | Feo pero **correcto**: es justamente la operación que hay que impedir, y el texto en español está adentro. Es el único caso donde la UX degrada, y es por diseño |
| "Agregar retiro/gasto que faltó" desde un `/admin` viejo | Falla con `CAJA_CERRADA` porque no manda `ajuste` | `/admin` se sirve del bundle del servidor → se actualiza junto. Solo afectaría a un cliente empaquetado viejo. Se avisa en las notas de release |
| Apertura doble desde un cliente viejo | Recibe `CAJA_ABIERTA_DUPLICADA` en vez del mensaje anterior | Ambos son texto en español; sin impacto |
| SSE `CAJA_CAMBIO` | El cliente viejo ignora el tipo desconocido en `onmessage` (`pdv.component.ts:3218-3231` filtra por `payload.tipo`) | Ninguna |
| **Cliente nuevo o viejo en `mode=client`: no recibe `CAJA_CAMBIO` por ningún transporte** (D11) | El aviso de caja cerrada llega al primer foco / acción / polling, no al instante | Riesgo aceptado y declarado en las notas de release (RB-4 en §10). El backend rechaza igual, así que no hay escritura mal imputada; lo que se pierde es la inmediatez del aviso |

### Cliente nuevo contra servidor viejo

| Situación | Efecto |
|---|---|
| El PdV manda `ajuste` en gasto/retiro | El handler viejo hace `repo.create(data)` con un campo que no es columna → TypeORM lo ignora. **Verificar en implementación** que no rompa; si rompiera, extraerlo con destructuring antes de crear (que es lo que hará el handler nuevo igual) |
| `CAJA_CAMBIO` nunca llega | El PdV cae en la revalidación por foco/acción, que solo usa `get-caja` — existe desde siempre. **Funciona** |
| `createPago` sin derivación server-side | El servidor viejo persiste la caja del payload. El cliente nuevo manda la caja que revalidó hace milisegundos, así que el riesgo baja pero no desaparece |

### Rollback

- **Código:** `git revert` del PR. No hay estado persistido que dependa de él salvo `Caja.motivoAjuste`/`revisado`, que ya existían.
- **Índice:** sobrevive al revert y es **inocuo** — lo único que impide es una segunda caja `ABIERTO` en el mismo dispositivo, que el código viejo tampoco quería crear (`financiero.handler.ts:669-676`). Si aun así hay que sacarlo: `DROP INDEX IF EXISTS "UQ_cajas_abierta_por_dispositivo";` o `npm run migration:revert`.
- **`select: false`:** revertir la entidad devuelve el hash a las respuestas. No hay datos migrados.

---

## 10. Riesgos

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | **El guard bloquea una operación legítima en plena noche de servicio** y el local no puede cobrar | Media | Alto | La tabla §5 enumera cada canal con su decisión; el manual de pruebas de §12 recorre los flujos legítimos uno por uno antes de mergear; el mensaje siempre dice qué hacer ("abrí o seleccioná una caja abierta") |
| R2 | **`FOR SHARE` sobre la fila de la caja genera contención** en hora pico | Baja | Medio | `FOR SHARE` no bloquea a otros lectores; solo el cierre (`FOR UPDATE`) espera. En SQLite no aplica. Si apareciera, se degrada a lectura sin lock: el índice + el guard fuera de transacción siguen cubriendo el 99 % |
| R3 | **`select: false` rompe el cambio de contraseña** porque el `save` no emite la columna | Media | Alto | Test dedicado en `test:sin-fuga-datos` que cambia la contraseña y vuelve a loguear con la nueva. Si TypeORM no emite el UPDATE, se pasa a `repo.update(id, { password })` |
| R4 | **`migrate-passwords` se vuelve un no-op silencioso** | Alta si se olvida | Bajo (una sola vez, en bases muy viejas) | Está en la tabla de D14 con su `addSelect`; test que siembra un password plaintext y verifica que se hashea |
| R5 | **La migración no crea el índice** en alguna base de cliente y nadie se entera | Media | Medio | El `console.error` es explícito **y el índice se reintenta en cada arranque** con `asegurarIndicesOpcionales` (D9/B4): en cuanto el operador cierra las cajas sobrantes, el próximo boot lo crea solo. Con eso Q4 (tarjeta roja en *Sistema*) baja a **nice-to-have** en vez de ser la única mitigación |
| R6 | **El PdV entra en loop** de reinicialización si `get-caja` falla | Baja | Medio | `asegurarCajaAbierta` es fail-open ante error de red (D12); solo reinicializa cuando el backend confirma `estado !== ABIERTO` |
| R7 | **El aviso de jornada anterior molesta todos los días** en locales que abren caja una vez cada 24 h | Media | Bajo | Solo aparece si la caja se abrió **antes** del corte de la jornada actual. Con `inicioJornadaHora = 7` y cierre nocturno normal, no dispara. Pregunta abierta Q3 |
| R8 | **Las transferencias entre mesas quedan bloqueadas** con la caja cerrada y una mesa colgada | Baja | Medio | Cancelar sigue permitido (§5.2), así que siempre hay una salida. Se anota en el manual |
| R9 | **Postgres devuelve el `estado` con otro casing** y el índice parcial no matchea | Muy baja | Alto | `CajaEstado.ABIERTO = 'ABIERTO'` y la regla de UPPERCASE en BD lo garantizan. El test de Postgres (§11) verifica que el índice efectivamente rechaza el duplicado |
| R10 | **El PR es grande** (4 frentes) y la auditoría se diluye | Alta | Medio | Las fases son independientes y commiteables por separado; si Gabriel prefiere, la Fase 4 (fuga) sale en su propio PR — pregunta abierta Q5 |

### Riesgos agregados por la auditoría B

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| RB-1 | **Se pierde el retiro automático del cierre.** Si `generarRetiroDelCierre` queda dentro de la transacción de `update-caja` —o lee desde otra conexión antes del commit— no encuentra el `conteoCierre`, devuelve `null` **sin lanzar** (el `catch` de `financiero.handler.ts:740-742` solo loguea) y toda la cadena de Caja Mayor se rompe en silencio | Media | **Alto** | El alcance de transacción fijado en D3 (retiro y WhatsApp **fuera**, después del commit) + assert propio en §11 de que cerrar sigue generando el `RetiroCaja` origen `CIERRE` |
| RB-2 | **Instalaciones sin índice y sin guard real.** Combinación de B2 + B4: una base con dos cajas `ABIERTO` en el mismo dispositivo no crea el índice, y el `FOR UPDATE` no la protege (cero filas no se bloquean). Queda **peor que hoy**, porque el plan declararía el problema resuelto | Baja | **Alto** | D9 corregido (el índice es el control primario, dicho explícitamente) + `asegurarIndicesOpcionales` en cada arranque + los casos 1-2 de `test:locks-pg` como únicos discriminantes |
| RB-3 | **El PR deja el bug original vivo y parece arreglado.** Con la D4 de la v1, los tests pasarían (el #9 escrito con `ventaId` sintético funciona server-side), el manual no tenía ningún paso que cobre una venta de **otra caja abierta** desde el PdV, y la evidencia de producción no se puede rehacer | Alta si no se aplica D4 v2 | **Alto** | D4 reescrito (capa 1 frontend + capa 2 en `updateVenta`) + el test de "cobro completo por el flujo real" de §11 + el paso nuevo de §12 |
| RB-4 | **En `mode=client` no hay aviso instantáneo de caja cerrada** por ningún transporte (D11): ni IPC (los handlers corren en el servidor) ni SSE (URL relativa contra un renderer `file://`/`:4201`) | Alta (es estructural) | Bajo | Aceptado: el backend rechaza igual, así que no hay plata mal imputada; el aviso llega al primer foco/acción/polling. Se declara en §9 y en las notas de release. Resolverlo requeriría un endpoint de eventos con URL absoluta a `settings.network.serverUrl` → **scope nuevo**, no entra |

---

## 11. Tests

Todos en `scripts/`, registrados en `package.json` y recogidos automáticamente por `scripts/run-all-tests.js` (toma todo `test:*` que invoque `ts-node`, verificado en `:31-34`). Patrón: `scripts/test-terminal-caja-e2e.ts` (helpers `ok` / `rechaza` / `permite`, SQLite en `.tmp/`, `ds.runMigrations`, handlers reales vía `invokeHandlerWithContext`).

#### Cómo se varía el usuario y el permiso en los tests (agregado en v2 por B12)

El harness fija el usuario al **registrar** los handlers (`scripts/test-terminal-caja-e2e.ts:110-112`: `registerVentasHandlers(ds, () => cajero)`), y los handlers se registran una vez. Hay dos formas de variarlo y **se elige la segunda**:

- (a) closure mutable: `let actual: any = cajero; registerFinancieroHandlers(ds, () => actual);` y después `actual = gerente`.
- (b) **`withRequestUser`** (`electron/utils/auth.utils.ts:65-67`): lo exporta el propio repo y la resolución de autorización lo lee **antes** que el `getCurrentUser` global. Es lo que ya hace el `rpc-router` en cada request HTTP, así que ejercita el camino real de `/api/rpc`. **Se usa esta.**

⚠️ **Trampa del cache de permisos.** El cache es por `usuarioId` con **TTL de 30 s** (`auth.utils.ts:36-43`). Una suite que le agrega o le quita `FINANCIERO_CAJA_AJUSTAR` al **mismo** usuario entre dos asserts va a leer el set viejo, y el test pasa (o falla) **por el cache, no por el fix** — el assert 13 de `test:caja-cerrada` ("sin el permiso → rechazo") es exactamente el que se puede falsear así. Regla para estas suites: **dos usuarios distintos** (uno con el permiso, uno sin) o `clearPermissionCache()` entre asserts.

### `npm run test:caja-cerrada` → `scripts/test-caja-cerrada-e2e.ts`

**Reproduce el bug.** Fixture: dispositivo, caja #1 ABIERTA, venta + cobro OK, se cierra la caja, y desde ahí:

| # | Assert | Qué revertir para que falle |
|---|---|---|
| 1 | `createVenta({ caja: cerrada })` → `CAJA_CERRADA` | el guard de `createVenta` |
| 2 | `createPago({ caja: cerrada })` → `CAJA_CERRADA` | el guard de `createPago` |
| 3 | `createPagoDetalle` sobre un pago de caja cerrada → `CAJA_CERRADA` | el guard de `createPagoDetalle` |
| 4 | `updateVenta(id, { estado: CONCLUIDA })` sobre venta de caja cerrada → `CAJA_CERRADA` | el guard de `updateVenta` |
| 5 | `delivery-crear({ cajaId: cerrada })` → `CAJA_CERRADA` | el guard de `delivery-crear` |
| 6 | `create-gasto-caja({ cajaId: cerrada })` → `CAJA_CERRADA` | el guard de `create-gasto-caja` |
| 7 | `create-retiro-caja({ caja: cerrada })` → `CAJA_CERRADA` | el guard de `create-retiro-caja` |
| 8 | `crear-vale-caja` / `pagar-compra-cuota-caja` sobre caja cerrada → `CAJA_CERRADA` | el mensaje unificado de `pdv-egresos` |
| 9 | **`createPago({ ventaId: v, caja: otraCaja })` persiste `pago.caja === venta.caja`** | la derivación de D4 |
| 10 | `cobrar-venta-credito` sobre venta de caja cerrada → `CAJA_CERRADA` | su guard |
| 11 | `transferir-venta-pdv` con origen en caja cerrada → `CAJA_CERRADA` | su guard |
| 12 | `registrarCobroParcial` sobre caja cerrada → `CAJA_CERRADA` | su guard |
| 13 | **Flujos legítimos siguen verdes:** `generar-retiro-cierre-caja` es idempotente; `ingresar-retiro-caja` funciona sobre caja cerrada; `create-gasto-caja` con `ajuste:{motivo}` + `FINANCIERO_CAJA_AJUSTAR` escribe **y** deja `revisado/motivoAjuste`; sin el permiso → rechazo (**con dos usuarios distintos o `clearPermissionCache()`**, ver arriba); con el retiro de cierre ya `INGRESADO` → rechazo | cualquier exención de §5.2 |
| 14 | `updateVenta(id, { estado: CANCELADA })` sobre venta de caja cerrada **funciona** | si alguien mete el guard donde no va |

**Asserts agregados en la v2** — cierran la matriz 1:1 con §5.1 (A12) y los faltantes de B12:

| # | Assert | Qué revertir para que falle |
|---|---|---|
| 15 | `edit-gasto-caja` sobre caja cerrada → `CAJA_CERRADA`; con `ajuste:{motivo}` + permiso → escribe | su guard, o la carga de `relations: ['caja']` (B17: sin ella el guard es no-op) |
| 16 | `anular-gasto-caja` sobre caja cerrada → `CAJA_CERRADA`; con `ajuste` + permiso → anula | ídem |
| 17 | `materializarPedidoOnlineEnVenta` con `cajaId` **cerrada** y **otra caja abierta** → materializa contra la abierta (fallback de B7); con `cajaId` cerrada y **ninguna** abierta → no materializa y devuelve `errorMaterializacion` en español | el fallback de B7 |
| 18 | `cerrarVentasAbiertasMesa` con `CONCLUIDA` sobre ventas de caja cerrada → `CAJA_CERRADA` por cada venta, y ninguna queda CONCLUIDA | su guard |
| 19 | **Positivo (anti-guard-demasiado-agresivo):** caja abierta → venta ABIERTA → `createPago` + `createPagoDetalle` + `updateVenta(CONCLUIDA)` **sin ningún rechazo** | un guard que mire la caja equivocada o compare mal el estado |
| 20 | **B1 / RB-3, el assert central:** cobro por el **flujo real** — `createPago` **sin** `ventaId` con `caja` distinta + `updateVenta(ventaId, { pago })` → `pago.caja === venta.caja` | la derivación de la capa 2 en `updateVenta` (D4). Con `ventaId` sintético este caso pasaría igual: por eso se escribe **sin** `ventaId` |
| 21 | **RB-1:** `update-caja(id, { estado: CERRADO })` genera el `RetiroCaja` de origen `CIERRE` **después** del commit, con su `conteoCierre` visible | meter `generarRetiroDelCierre` dentro de la transacción (D3) |
| 22 | `createVenta` con caja abierta desde un **`deviceId` ajeno** (mozo de la PWA, `comoTerminal` del harness) sigue funcionando con el guard nuevo | un guard que confunda "caja de otra terminal" con "caja cerrada" |
| 23 | `anularCobroParcial` sobre una venta de **caja cerrada** funciona (§5.2, A2) | si alguien le mete el guard |
| 24 | Cobrar un **delivery pendiente de otra caja**: el assert se escribe en la rama que decida **Q1** (rechazo con `CAJA_CERRADA`, o imputación a la caja actual con su traza). Sin Q1 decidida este test no se puede escribir — de ahí que Q1 sea prerrequisito de la Fase 1 | el guard / la reimputación, según la rama |
| 25 | **Lock en SQLite:** `leerEstadoCaja(ds, id, { lock: 'read' })` en SQLite **no** lanza y la rama de driver omite el lock. El repo tiene dos comentarios contradictorios sobre si el driver ignora o rechaza los locks (`ventas.handler.ts:2943` dice "no está soportado"; `pago-consolidado-adapters.ts:123-125` dice "su driver ignora los locks") — este assert lo cierra | el `...(esPostgres ? { lock } : {})` del helper |

### `npm run test:caja-apertura` → `scripts/test-caja-apertura-e2e.ts`

| # | Assert |
|---|---|
| 1 | Segunda `create-caja` en el mismo dispositivo → rechazo con mensaje claro |
| 2 | **`create-caja` sin `estado` en el payload también es rechazada** (el agujero de `financiero.handler.ts:669`) |
| 3 | `abrir-caja-desde-conteo` sobre dispositivo ocupado → rechazo |
| 4 | `Promise.all([create-caja, create-caja])` → exactamente 1 éxito, 1 rechazo, y **1 sola fila `ABIERTO`** en la base. **Humo, NO criterio de aceptación** (ver abajo) |
| 5 | `update-caja(id, { estado: CERRADO })` sobre caja ya cerrada → `CAJA_CERRADA` |
| 6 | `update-caja` sobre caja cerrada sin `FINANCIERO_CAJA_AJUSTAR` → rechazo; con el permiso y sin `estado` → OK |
| 7 | El índice `UQ_cajas_abierta_por_dispositivo` existe tras correr las migraciones (`PRAGMA index_list('cajas')`) |
| 8 | Dos cajas CERRADAS en el mismo dispositivo conviven sin problema (el índice es parcial, no total) |

⚠️ **El caso 4 NO tiene poder discriminante en SQLite y NO es criterio de aceptación de la Fase 2** (precisión de B2). SQLite tiene un solo escritor y el `Promise.all` de ts-node serializa igual: el test pasaría aunque el guard no fuera transaccional y aunque el índice no existiera. Es la misma trampa de `test:delivery-conversion` documentada en SKILL.md §4 (sesión 2026-08-29). Queda en la suite como humo. El caso de carrera **real** —y el único gate del invariante de apertura— va a Postgres:

### `npm run test:locks-pg` (suite existente, `scripts/test-locks-postgres-e2e.ts`) — se le agregan casos

Ya tiene el harness: levanta Postgres real, corre migraciones y **se saltea con exit 0** si no hay Postgres (`:49-54`). Se agrega:

| # | Assert |
|---|---|
| 1 | El índice parcial existe en Postgres (`pg_indexes`) y un `INSERT` directo de una segunda caja `ABIERTO` falla con **23505** |
| 2 | `Promise.all` de dos `create-caja` concurrentes → 1 éxito, 1 rechazo con mensaje traducido (no el `duplicate key value violates unique constraint` crudo) |
| 3 | `create-caja` concurrente con `update-caja` que cierra → no queda una venta escrita contra la caja recién cerrada |
| 4 | `leerEstadoCaja` con lock **no** genera `FOR SHARE` sobre un outer join (el bug #258): la consulta no lanza `FOR UPDATE no puede ser aplicado al lado nulable de un outer join` |

`npm run test:sse-emit-postgres` (existente) se extiende con el evento `CAJA_CAMBIO` para verificar que se emite en Postgres igual que en SQLite.

### `npm run test:sin-fuga-datos` → `scripts/test-sin-fuga-datos-e2e.ts`

| # | Assert | Qué revertir para que falle |
|---|---|---|
| 1 | La respuesta de `get-caja`, `get-cajas`, `get-cajas-abiertas`, `get-caja-by-dispositivo`, `getResumenCaja`, `getVentasByDateRange`, `get-retiros-caja`, `get-retiro-caja`, `get-gastos-caja`, `get-egresos-caja` **y `delivery-listar-pdv`** (11 canales) **no contiene la clave `password`** en ningún nivel (walk recursivo) | `select: false` |
| 2 | Esas respuestas no contienen `documento`, `telefono`, `direccion`, `email` ni `fechaNacimiento` de la `Persona` del usuario — **incluido el `caja.createdBy` de `getVentasByDateRange`** (`ventas.handler.ts:1082-1083`, el join que la v1 no listaba: sin recortarlo este assert falla) | el recorte de los joins |
| 2b | `delivery-listar-pdv` no devuelve `salarioBase`, `valorJornal`, `numeroIps` ni `cuentaBancariaPropia` del `Funcionario` repartidor | el recorte de `delivery.handler.ts:190-193` |
| 3 | **Sí** contienen `nickname` y `persona.nombre` del creador (la UI los muestra; `seleccionar-caja-dialog:40-45` los usa con fallback) | un recorte de más |
| 4 | **Login funciona** tras `select: false` (`auth.handler` login + `/api/auth/login` vía `auth-routes`) | el `addSelect` del login |
| 5 | **Cambio de contraseña funciona y el login con la nueva también** (riesgo R3) | el `addSelect` de `change-password` o el `save` |
| 5b | **`updateUsuario` (`personas.handler.ts:265`) no borra ni corrompe el hash** al guardar una entidad cargada sin la columna: editar el nickname de un usuario y volver a loguear con su contraseña de antes (R3, faltaba en la v1 — B5) | el manejo del `password` en `updateUsuario` |
| 5c | **Recuperación por código** (`password-recovery.handler.ts:189`) setea el hash nuevo y el login con la nueva funciona. No necesita `addSelect` porque solo escribe (A7) | el `save` de recovery |
| 6 | `validate-credentials` sigue devolviendo `success: true` con la contraseña correcta | su `addSelect` |
| 7 | `migratePlaintextPasswords` hashea un usuario sembrado en plaintext (riesgo R4) | su `addSelect` |
| 8 | El seed `markDefaultAdminMustChangePassword` sigue detectando el admin con password default | su `addSelect` |

### El escenario del front: decisión explícita (hallazgo A9)

No hay test automatizado que reproduzca "PdV con la caja vieja en memoria + Financiero la cierra". **Decisión: ese escenario se cubre con el sandbox UI de §12, y eso es el gate** — pasos 2, 3, 5 y 8, que recorren el bug tal como ocurrió, con verificación en la base entre pasos. Motivos: el bug es de integración entre tabs, transportes (IPC/SSE) y diálogos de Material; un spec de componente que mockea el repositorio y el bus verificaría el mock, no el camino.

**Opcional, no gate:** un spec de Karma de `asegurarCajaAbierta` / `manejarErrorCajaCerrada` en aislamiento (caja fresca `CERRADO` → devuelve `false` y limpia `this.caja`; error con `CAJA_CERRADA` en el mensaje → lo reconoce; error de red → fail-open `true`), **si el harness de specs del repo lo permite sin armar infraestructura nueva**. Si armarlo cuesta más que eso, se deja anotado en `todos-pendientes.md` y no se bloquea el PR.

### Suites existentes que hay que volver a correr y no romper

`test:terminal-caja`, `test:integridad-cobro`, `test:resumen-caja-numeros`, `test:cobro-parcial`, `test:delivery`, `test:delivery-conversion`, `test:mesa-una-venta-abierta`, `test:transferencia-pdv`, `test:pedido-online-materializacion`, `test:permisos`, `test:roles-pdv`. Todas crean cajas y ventas en sus fixtures: si alguna abre la caja sin `estado` o cierra y sigue escribiendo, este PR la va a romper — **eso es señal, no ruido**, y hay que arreglar el fixture, no el guard.

`test:pedido-online-materializacion` además se **extiende** con el caso de `aceptar-pedido-online` sobre una caja cerrada y su fallback a la única caja abierta (B7).

### Gates

- `npm run build`
- `npm run test:all` (recoge las tres suites nuevas automáticamente)
- `npm run check` (AOT de producción)
- `npx ng build mobile` (la Fase 3 toca `projects/mobile`)
- `npm run test:mobile` con `CHROME_BIN` (hay specs en `projects/mobile/.../financiero/`)
- CI: *Lint + Build* ubuntu y windows, y **Migration run (Postgres baseline + incrementales)** — es el único job que ejercita Postgres de verdad y el que va a validar el índice parcial contra el driver real.

**Regla del ciclo, paso 7:** cada test nuevo se verifica revirtiendo el fix. La columna "qué revertir para que falle" de cada tabla es esa lista, y hay que ejecutarla, no solo escribirla.

---

## 12. Plan de prueba UI en sandbox Electron (obligatorio) — guion definitivo del PR 2

Sandbox: `npm start` con SQLite local (matar el Electron previo antes, `lsof -ti:7070`). Dos ventanas donde haga falta.

> **Alcance:** este guion cubre **PR 2 (Fases 1–3 y 5)**. Los pasos de la **Fase 4 (fuga de datos)** que traía la v2.1 —RPC sin `password`, UI de nombres de cajero, login/cambio de contraseña— **se movieron al PR 1** (`fix/usuario-password-select`), que lleva su propio guion. Acá no se repiten.
>
> Los 16 pasos de UI que la Fase 3 verificó durante la implementación están **integrados** en esta tabla (pasos 2, 2b, 2c, 3, 5, 6, 8, 13, 15, 19, 20, 21 y los sub-asserts de reentrancia), en vez de vivir sueltos en el commit.
>
> Los pasos **23–26** los agregó la **ronda de fixes post-auditoría** y verifican M2, M3, M4 y M6 de §17. Van al final para no renumerar el guion, pero se corren en el mismo pasaje: el 23 y el 24 encadenan con el paso 2, y el 26 con el 12.

| # | Paso | Evidencia esperada |
|---|---|---|
| 1 | **Happy path completo.** Abrir PdV → abrir caja con conteo → cargar 2 ítems en una mesa → F1 Cobrar → efectivo → Finalizar → **Facturar** (emitir factura legal) | Venta CONCLUIDA, ticket impreso/preview, factura emitida con su numeración. Nada cambia respecto de hoy. ⚠️ Es el paso que detecta un guard puesto de más: si el turno normal no se puede cobrar, nada de lo demás importa |
| 2 | **El bug, reproducido.** Con el PdV abierto y su caja activa, en otra tab: Financiero › Cajas › Conteo → cerrar esa caja. Volver al PdV **sin recargar** | Aviso inmediato «Esta caja ya fue cerrada», que en el desktop llega **por IPC `mesa-updates`** (standalone **y** server: el SSE de la ventana de Electron no conecta en ningún modo, D11). Si el IPC no estuviera, el aviso llega al recuperar el foco o al activar la tab. En los dos casos el PdV vuelve a `inicializarCaja` y ofrece elegir/abrir caja. **Un solo aviso**, aunque disparen el foco, el `activeTab$` y el IPC juntos |
| 2b | **El camino SSE, de verdad.** Con la app en `mode=server`: abrir el PdV desde **`/admin`** en el navegador (o la PWA en el celular) y cerrar la caja desde el desktop | El aviso llega por SSE sin tocar nada. Es el único lugar donde se prueba el transporte SSE; probarlo desde la ventana de Electron no ejercita ese camino |
| 2c | **RB-3 / causa C: cobrar una venta de OTRA caja abierta.** Con la caja A abierta en el PdV, dejar una venta ABIERTA de la caja A; cerrar A y abrir B; volver al PdV (queda en B) y cobrar esa venta de A desde el Historial / el diálogo de cobro | El cobro se rechaza con «Esta caja ya fue cerrada» **y**, en el caso simétrico (venta de una caja **abierta** distinta de la del PdV), el `Pago` queda con **`caja_id` = la caja de la venta**, no la del PdV. Verificar con sqlite3: `SELECT p.id, p.caja_id, v.caja_id FROM pagos p JOIN ventas v ON v.pago_id = p.id` → las dos columnas iguales en todas las filas |
| 3 | **Bloqueo por operación.** Repetir el paso 2 pero interceptando el aviso: intentar F1 Cobrar, F2 cobro rápido, Delivery, Utilitarios › Gasto, Utilitarios › Retiro, Utilitarios › Vale, y agregar un ítem a una mesa | Los 7 caminos muestran «Esta caja ya fue cerrada». **Ningún registro nuevo** en `ventas`, `pagos`, `pago_detalles`, `gastos_caja`, `retiros_caja`, `egresos_caja`, `deliveries` con `caja_id` de la caja cerrada (verificar con sqlite3 entre pasos) |
| 4 | **Apertura desde Caja Mayor con el PdV abierto.** Caja Mayor → Egreso de caja inicial → abrir caja desde ese conteo, en el mismo dispositivo del PdV | Rechazo: «Ya hay una caja abierta en esta terminal». Cerrar la del PdV primero y repetir → abre, y el PdV se entera del `CAJA_CAMBIO` |
| 5 | **Foco / visibilidad.** Cerrar la caja desde la PWA (celular) mientras el PdV está en segundo plano. Traer el PdV al frente | Aviso al recuperar el foco, sin tocar nada |
| 6 | **Caja de jornada anterior.** Poner `PdvConfig.inicioJornadaHora = 7`. Dejar una caja abierta, adelantar el reloj del sistema al día siguiente 10:00 (o editar `fecha_apertura` a ayer), cerrar y reabrir la tab del PdV | Diálogo «Caja #N abierta desde ayer HH:mm» con *Usar igual* / *Ir a cerrarla* / *Abrir una nueva*. *Ir a cerrarla* abre el diálogo de cierre; *Usar igual* entra al PdV normalmente |
| 7 | **Cerrar una caja ya cerrada.** Financiero › Cajas → sobre una caja CERRADO → Conteo. Contar antes las filas: `SELECT COUNT(*) FROM conteos; SELECT COUNT(*) FROM conteo_detalles;` | El diálogo abre en estado de aviso: «La caja #N ya fue cerrada el <fecha>», sin botón de guardar (hoy muestra el conteo viejo y deja "completar"). **Y los dos COUNT no cambian**: no quedó ningún `Conteo` ni `ConteoDetalle` huérfano (B9). Repetir el mismo assert desde la **PWA** (`caja-cerrar`) |
| 8 | **Cerrar desde el PdV una caja que se cerró por afuera.** PdV › Cerrar caja, con la caja ya cerrada desde Financiero | Aviso y reinicialización, **sin** abrir el diálogo de conteo |
| 9 | **Ajuste post-cierre con permiso.** Con un usuario que tenga `FINANCIERO_CAJA_AJUSTAR`: Financiero › Cajas → caja CERRADA → «Agregar gasto que faltó» → pide motivo → guarda | El gasto se crea; la caja queda `revisado = 1`, `revisado_por` y `motivo_ajuste` con el texto en MAYÚSCULAS. El resumen de la caja refleja el gasto nuevo |
| 10 | **Ajuste sin permiso.** Mismo paso con un CAJERO | Rechazo con mensaje de permiso, sin escribir nada |
| 11 | **Ajuste bloqueado.** Ingresar a Caja Mayor el retiro del cierre de esa caja y repetir el paso 9 | «El retiro del cierre ya fue ingresado a Caja Mayor…». Mismo texto que ya devuelve `puede-ajustar-caja` |
| 12 | **Doble click en abrir caja.** En el diálogo de apertura, doble click rápido en Guardar | Una sola caja creada. El segundo intento muestra «Ya hay una caja abierta en esta terminal» o no dispara (botón deshabilitado durante el guardado) |
| 13 | **Cobrar un delivery pendiente de una caja cerrada.** Dejar un delivery EN_CAMINO sin cobrar, cerrar su caja, abrir una nueva, abrir el diálogo de Delivery en el PdV | El delivery **se ve** en la lista, con el chip **«CAJA CERRADA»** (no el ícono de "otra caja") y el botón **PAGO deshabilitado con tooltip**, así que el cajero se entera *antes* de cargar el cobro y no al confirmarlo. **Cancelarlo sí funciona**, y después se puede volver a cargar el pedido en la caja de hoy (flujo de cancelación + reventa del manual, Q1) |
| 14 | **Cancelar una venta de caja cerrada** desde el Historial | Funciona (no se bloquea). La CPC se revierte si la había |
| 15 | **Transferir una mesa con la caja de origen cerrada** (Q2). Dejar una mesa con cuenta abierta en la caja A; cerrar A y abrir B; desde el PdV (ya en B) transferir esa mesa a otra libre | La transferencia **pasa** y la venta queda imputada a **B**, no a A: `SELECT caja_id FROM ventas WHERE id = <venta>` → B. Los `pagos` que ya existían **siguen en A** (la plata entró ahí). Repetir con el PdV sin caja seleccionada → rechazo con «Esta caja ya fue cerrada» |
| 16 | **Pedido online con caja cerrada** (B7). Aceptar un pedido online eligiendo una `cajaId` **cerrada**, con otra caja abierta en el local. Repetir **sin ninguna caja abierta** | Primer caso: el pedido se acepta **y se materializa contra la caja abierta** (aparece en el tablero del PdV). Segundo caso: el pedido queda aceptado **con un mensaje en español en la bandeja** («no se pudo crear la venta: no hay ninguna caja abierta»), no desaparecido en silencio |
| 17 | **Cerrar el turno completo, con retiro** (RB-1). Abrir caja, vender, cobrar, cerrar con conteo | El cierre genera el `RetiroCaja` de origen `CIERRE` con su monto, y el resumen/Caja Mayor lo ven. **Es la regresión más probable del PR**: el retiro se genera *después* del commit, y si alguien lo mete dentro de la transacción deja de generarse **en silencio** |
| 18 | **Ajuste de caja cerrada con un rol custom** (B19). Usuario con `FINANCIERO_CAJA_GESTIONAR` y **sin** `FINANCIERO_CAJA_AJUSTAR`: abrir el Resumen de una caja cerrada | El botón de editar gasto **no aparece** (o aparece deshabilitado con tooltip), en vez de aparecer y comer un rechazo del backend |
| 19 | **PWA · tomar pedido mientras se cierra la caja.** Desde el celular: cargar ítems en una mesa mientras se cierra la caja desde el desktop | La PWA avisa en español y **no** crea la venta contra la caja cerrada. El aviso llega por SSE (mismo origen que Fastify), sin recargar |
| 20 | **PWA · abrir una segunda caja en la misma terminal.** `caja-abrir` desde el celular apuntando a un dispositivo que ya tiene caja abierta | «Ya hay una caja abierta en esta terminal. Cerrá esa caja antes de abrir otra.» — **nunca** el error crudo del driver (`SQLITE_CONSTRAINT` / `duplicate key value violates…`) |
| 21 | **Reentrancia: un solo aviso.** Con el PdV en segundo plano y la tab de Financiero activa, cerrar la caja; después volver al PdV clickeando la tab **y** dándole foco a la ventana a la vez | **Un solo** diálogo «Esta caja ya fue cerrada» y **una sola** reinicialización, aunque disparen el IPC, el `activeTab$`, el `window:focus` y el polling juntos (B11). Dos diálogos encadenados = falta un flag |
| 22 | **Editar / anular un gasto de una caja cerrada** desde el Resumen de caja, con `FINANCIERO_CAJA_AJUSTAR` | Pide motivo, guarda, y el resumen refleja el monto nuevo. Sin el permiso: el botón no está. ⚠️ Verificar que el gasto **realmente cambió** en la base: si el handler cargara el gasto sin la relación `caja`, el guard sería un no-op y esto pasaría igual estando roto (B17) |
| 23 | **El diálogo de cobro traduce el rechazo** (M2). PdV con la caja A; cerrar A desde otra terminal (o desde Financiero › Cajas); en el PdV abrir **COBRAR** sobre una cuenta y agregar una línea de pago, o finalizar. Repetir entrando por **COBRAR A CRÉDITO** y por un **cobro parcial** | Snackbar «Esta caja ya fue cerrada: no se pueden registrar más operaciones…», **el diálogo se cierra solo** y detrás aparece el aviso del PdV «ESTA CAJA YA FUE CERRADA» con la reelección de caja. ⚠️ Antes de M2 el rechazo caía en el fallback genérico («No se pudo finalizar el cobro») y el PdV **no se enteraba**: si ves ese texto, el `esCajaCerrada` del diálogo dejó de matchear |
| 24 | **La cuenta de una caja cerrada queda marcada** (M3). PdV con la caja A y una mesa con ítems. Cerrar A desde otra terminal y reelegir la caja B en el PdV. Volver a esa mesa | Arriba de los botones: «Cuenta de una caja cerrada #A: transferila (pasa a la caja activa) o cancelala». **COBRAR y COBRO RÁPIDO grises** con el motivo en el tooltip; **agregar ítems sigue funcionando** (a propósito). F1 y F2 muestran el mismo aviso **sin abrir el diálogo** (F2 llega por atajo, el botón deshabilitado no alcanza). Con una **venta rápida** o un **delivery** en edición el texto cambia a «cancelala y volvé a cargarla en la caja activa», porque ahí no existe TRANSFERIR. Seleccionar otra cuenta de la caja B → el aviso desaparece. ⚠️ **La grilla de mesas NO está marcada** (deuda de §17): la fila sigue mostrando su total |
| 25 | **La pestaña del PdV se cierra, venga de donde venga** (M4). Abrir el PdV **desde el menú lateral** (*Ventas › Punto de Venta*, tab `pdv-tab`) sin ninguna caja abierta y **cancelar** el diálogo de apertura. Repetir desde el botón «Abrir PdV» del home (tab `pdv`). Y con caja abierta, **CERRAR CAJA** desde el PdV | La pestaña se cierra en los tres casos. ⚠️ Antes quedaba abierta con `caja === null` y cada click reabría el diálogo — y **sólo** cuando se había abierto desde el menú, que es el camino más común |
| 26 | **La apertura rechazada no deja conteo huérfano** (M6). Desktop: con la terminal T ya con caja abierta, *Financiero › Cajas › NUEVA CAJA*, elegir T, cargar el conteo y confirmar. Contar antes y después: `SELECT COUNT(*) FROM conteos; SELECT COUNT(*) FROM conteo_detalles;` | Snackbar «LA TERMINAL T YA TIENE UNA CAJA ABIERTA (CAJA #n)…» y **los dos COUNT no cambian**. Repetir en la **PWA**: abrir *Financiero › Cajas › Abrir* y dejar la pantalla quieta, abrir la caja de esa misma terminal desde el desktop, y recién entonces tocar ABRIR en el celular → mismo mensaje, sin conteo huérfano (el filtro de terminales libres de la PWA es un snapshot de minutos antes; esto revalida al tocar el botón) |

---

## 13. Preguntas abiertas para Gabriel — ✅ **CERRADA: las seis están respondidas en §0**

> **Estado: sección histórica.** Q1–Q6 fueron respondidas por Gabriel el 2026-09-28 y **la tabla de §0 es la que manda**; lo de abajo se conserva sólo como el contexto que se le presentó para decidir. Resumen de las decisiones, con dónde quedaron implementadas:
>
> | | Decisión | Dónde |
> |---|---|---|
> | **Q1** | Rechazar el cobro del delivery de caja cerrada; sólo cancelar y revender | Fase 1 (guard de `createPago`) + Fase 3 (chip `cajaCerrada` y botón PAGO apagado) + manual |
> | **Q2** | La venta transferida va a la **caja activa** (`cajaActivaId`) | Fase 1 (`transferir-venta-pdv`) |
> | **Q3** | Corte por `PdvConfig.inicioJornadaHora` (default 7), sin umbral en horas | Fase 3 (D13) |
> | **Q4** | **Sin** tarjeta de cajas duplicadas en *Sistema* | No se implementó; queda como deuda en `todos-pendientes.md` |
> | **Q5** | Dos PRs: PR 1 = fuga de datos, PR 2 = guard de caja | PR 2 es esta rama; la Fase 4 **no** está acá |
> | **Q6** | Cierre asistido de cajas de varios días: **fuera de alcance** | No se implementó; queda el aviso de jornada anterior (D13) y la anotación en `todos-pendientes.md` |

*(Texto original de las preguntas, tal como se le plantearon:)*

Solo decisiones reales; nada que se pueda resolver leyendo el código. Las auditorías filtraron esta lista: Q4 bajó de decisión a nice-to-have y Q1 pasó a ser **prerrequisito**, no pregunta paralela.

**Q1 — Cobrar un delivery que quedó vivo de una caja cerrada. ⚠️ Hay que decidirla ANTES de empezar la Fase 1** (hallazgo A1): cambia el guard de `createPago`/`createPagoDetalle`, el aviso de `delivery-listar-pdv` y el assert 24 de `test:caja-cerrada`. Decidirla en la Fase 3, como decía la v1, obligaría a rehacer la Fase 1.

El plan **recomienda rechazar** (§5.2): imputar la plata a la caja actual mueve el arqueo entre cajas, que es justamente la clase de descuadre que originó este PR. Pero hay que asumir la consecuencia: como no hay reapertura de cajas, ese delivery **solo se puede cancelar**, nunca cobrar — y entonces el manual tiene que documentar el flujo de **cancelación + reventa en la caja de hoy**, y `delivery-listar-pdv` avisar en la fila para que el cajero no lo descubra en el momento de cobrar.

La alternativa es cobrarlo imputándolo a la **caja actual** (la plata entra al cajón de hoy, que es lo que pasa físicamente) con traza explícita de que la venta es de otra caja. ¿Rechazar (recomendado) o reimputar? Afecta directo al turno.

**Q2 — Transferencia de mesa con la caja de origen cerrada.** Hoy la venta nueva hereda `ventaOrigen.caja` (`ventas.handler.ts:3025`). El plan lo bloquea. ¿Preferís bloquear, o que la venta destino nazca en la **caja activa** del que transfiere?

**Q3 — Umbral del aviso de jornada anterior.** El plan usa `fechaApertura < inicio de la jornada actual` (`inicioJornadaHora`, default 7). Con cierre nocturno normal no dispara nunca; con una caja que se deja abierta 30 h dispara al día siguiente. ¿Alcanza, o preferís un umbral en horas (p. ej. "más de 18 h abierta") que es más fácil de explicar al cajero?

**Q4 — Bases con cajas duplicadas (bajada a *nice-to-have*).** Ya no es una decisión bloqueante: con el reintento idempotente de arranque (D9/B4), en cuanto el operador cierra las cajas sobrantes el próximo boot crea el índice solo, sin que nadie tenga que leer un log ni volver a aplicar nada. La pregunta que queda es opcional: ¿querés **además** un aviso visible en *Sistema* (una tarjeta roja "hay N cajas abiertas en la misma terminal") o alcanza con el log + el reintento? Si no contestás, va sin la tarjeta.

**Q5 — Un plan, ¿uno o dos PRs de ejecución?** El plan es **uno** y cubre los cuatro frentes; la pregunta es solo de ejecución (aclaración del hallazgo A15). La fuga de datos (Fase 4) es ortogonal a las otras tres y toca `Usuario`, login y seeds — el área más delicada del sistema —, así que partirla en su propio PR hace las dos auditorías mucho más filosas. ¿La separo en un segundo PR, con este mismo plan como referencia de los dos?

**Q6 — Cajas que quedan abiertas varios días.** Este plan impide seguir operando sobre una caja **cerrada**, pero no impide que una caja siga **abierta** indefinidamente (que es lo que pasó con la #123 el viernes). ¿Querés además un cierre asistido —al entrar al PdV con una caja de más de N horas, empujar el cierre— o eso es una feature aparte?

---

## 14. Lo que NO pude verificar

Se declara explícitamente, en vez de afirmarlo. **La lista se acortó en la v2:** las auditorías cerraron tres ítems de la v1 (ver al final).

1. **Si el jueves 24/09 se usó "Cerrar caja" desde el PdV.** El informe lo marca como hipótesis con confianza MEDIA-BAJA (§3.C): el conteo 376 no fue modificado. El fix de la Fase 2 cierra ese camino igual, pero no puedo confirmar que haya sido el que se recorrió.
2. **El comportamiento exacto de TypeORM al guardar una columna `select: false`** que no fue cargada. Es el riesgo R3, en sus **tres** writes (`updateUsuario`, `change-password`, recovery), y va cubierto por test, no por lectura.
3. **Si `repo.create(data)` con un campo extra (`ajuste`) rompe en el servidor viejo.** La auditoría B lo verificó por analogía con el código existente (es el mismo mecanismo por el que `validarDispositivoCaja` se descarta hoy en `createPago`), pero **no contra `node_modules`**. Hay que probarlo contra un binario de alpha.165 real antes de afirmarlo en las notas de release (§9). El handler nuevo lo destructura antes de crear igual, así que el riesgo es solo del cliente nuevo contra servidor viejo.
4. **El costo real del `FOR SHARE` en la caja registradora de Don Franco.** No tengo forma de medirlo desde acá; el plan asume que es despreciable porque los lectores no se bloquean entre sí, y deja la degradación como salida (R2). Sí quedó verificado que **no hay riesgo de deadlock**: `withMesaLock` es un candado en memoria del proceso, no de base, y el único recurso de base en juego es la fila de `cajas`. El riesgo es espera larga, y por eso D3 acota la transacción del cierre.
5. **El orden exacto commit ↔ retiro de cierre** en la implementación de `update-caja`. D3 lo fija por escrito, pero hay que validarlo con el test de RB-1 corriendo, no por lectura: es la regresión más probable del PR.
6. **La superficie completa de canales que hidratan `createdBy.persona`.** Conté ~30 archivos con el patrón, y las auditorías agregaron dos que faltaban (`ventas.handler.ts:1082-1083` y `delivery-listar-pdv`). Los 11 del dominio caja están enumerados y verificados; el resto va como deuda con su grep, no como lista cerrada.
7. **Si el service worker de la PWA puede quedar sirviendo el bundle viejo** después de actualizar el nodo servidor (riesgo señalado por la auditoría A). Conviene un bump de versión explícito al publicar; no está verificado en este plan.

**Cerrado por las auditorías (ya no está en esta lista):**

- *"Si `transferir-venta-pdv` tiene `ensurePermission`"* → **sí lo tiene**: `ventas.handler.ts:3116`, primera sentencia del `try` (B18). Sacado también de la fila "a verificar" de §8.
- *"Si algún consumidor del frontend depende de `usuario.password` en la respuesta"* → **no hay ninguno**: no hay lectores de la columna en `src/`, `projects/` ni SQL crudo; `create-edit-usuario.component.ts:282-294` la escribe y ya hace `delete formData.password` si viene vacía (B5).
- *"Si `Caja.dispositivo_id` puede ser NULL"* (planteado por A5) → **no puede**: `@ManyToOne(..., { nullable: false })` en `caja.entity.ts:19-21`. El índice parcial cubre el 100 % de las cajas `ABIERTO`.

---

## 15. Registro de auditoría del plan

Las dos auditorías del paso 5 del ciclo se corrieron el **2026-09-28** sobre el commit `be087b79`:

| Auditor | Eje | Modelo | Veredicto |
|---|---|---|---|
| **A** | Alcance y convenciones | **DeepSeek Flash** (`deepseek-flash` vía harness heavy-llm, text-only, **sin acceso al repo**) | **APROBADO CON CAMBIOS** — 15 hallazgos, ninguno bloqueante |
| **B** | Correctitud contra código real / drivers / permisos / tests | **Claude Code Opus 5** (`claude-opus-5[1m]`, leyó cada `archivo:línea` citado) | **APROBADO CON CAMBIOS** — 19 hallazgos, **2 bloqueantes** (B1, B2) |

Informes completos: `docs/planes/AUDIT-PLAN-caja-cerrada-guard-A.md` y `docs/planes/AUDIT-PLAN-caja-cerrada-guard-B.md`. **Todos los hallazgos de B fueron verificados por el orquestador contra el código antes de aplicarse.** Los tres hallazgos descartados se dejan registrados con su razón: la razón por la que algo no se hizo vale tanto como lo que se hizo.

| ID | Veredicto | Dónde se aplicó (sección) | Nota / verificación |
|---|---|---|---|
| **B1** | **Aplicado** | **D4 reescrito**, Fase 1 (tabla de frontend + criterio de aceptación), §11 assert 20, §12 paso 2c, §10 RB-3 | Bloqueante. Verificado: ningún call site manda `ventaId` (`cobrar-venta-dialog.component.ts:908`, `:1088`, `pdv.component.ts:2364`). Se aplican las **dos** partes: las tres ediciones de frontend entran en la **Fase 1**, y la derivación server-side en `updateVenta` al adoptar `data.pago` (resolver `venta.caja` → sobrescribir `pago.caja` → `assertCajaAbierta`) cubre a los clientes viejos. `createPago` con `ventaId` deriva; sin `ventaId` aplica el guard a `pagoData.caja`. El criterio de aceptación exige el **flujo real** (sin `ventaId`). Cubre también **A11** |
| **B2** | **Aplicado** | **D9** ("Qué pasa si el índice no se crea", reescrito), **D10.2/D10.3**, Fase 2 (criterio de aceptación), §11 (caso 4 de `test:caja-apertura`), §10 RB-2 | Bloqueante. Verificado: el guard es `repo.count(...)` (`financiero.handler.ts:667-676`) y un `FOR UPDATE` sobre **cero filas** no serializa en `READ COMMITTED`. El **índice único parcial pasa a control primario**; el `count`+`save` cubre solo la carrera lenta. El criterio concurrente de la Fase 2 es **solo Postgres** (`test:locks-pg`); el `Promise.all` en SQLite queda como humo, **no** como criterio |
| **B3** | **Aplicado** | **D3** (bloque nuevo "Alcance exacto de la transacción de `update-caja`"), Fase 2, §11 assert 21, §12 paso 20, §10 RB-1, §14 ítem 5 | Verificado: `update-caja` no es transaccional hoy (`financiero.handler.ts:686-754`) y `generarRetiroDelCierre` recibe el `DataSource` (`retiro-cierre.util.ts:20-23`). Alcance fijado: lock `FOR UPDATE` **sin relations** + guards + `merge`+`save` **dentro**; retiro de cierre y WhatsApp **fuera**, después del commit. Test propio de que cerrar sigue generando el `RetiroCaja` origen `CIERRE` |
| **B4** | **Aplicado** | **D9** (reintento idempotente), §7, Fase 2 (archivos), §10 R5, §13 Q4 | Verificado: `runMigrations({ transaction: 'each' })` en `database.service.ts:76` marca la migración como ejecutada aunque el `up()` haga `return`. Se agrega `asegurarIndicesOpcionales(ds)` llamada tras `runMigrations`, que reintenta `CREATE UNIQUE INDEX IF NOT EXISTS` si no hay duplicados y loguea si los hay. **Q4 pasa a nice-to-have** |
| **B5** | **Aplicado** | **D14** (tabla de 11 canales + nota de writes), Fase 4, §11 asserts 1/2/2b/5b, §12 paso 15, §2 | Verificado los cuatro puntos: `ventas.handler.ts:1082-1083` (`caja.createdBy` + persona) y `delivery-listar-pdv` (`delivery.handler.ts:190-193`, con `entregadoPorFuncionario` y sus columnas salariales) entran al recorte; `personas.handler.ts:265` (`updateUsuario`) se suma a los writes de R3 |
| **B6** | **Aplicado** | **D11** (limitaciones + tabla de transportes), Fase 3 (criterio), §9, §12 pasos 2 y 2b, §10 RB-4 | Verificado: el SSE del PdV desktop usa URL **relativa** (`pdv.component.ts:3205-3206`) y no conecta en ningún modo; el IPC llega solo en el proceso que ejecuta el handler → standalone y server, **no** client. Tabla corregida, paso 2 dice "por IPC" y se agregó el paso 2b desde `/admin` o la PWA. La falta de aviso instantáneo en `mode=client` queda como **riesgo aceptado** (RB-4) |
| **B7** | **Aplicado** | §5.1 (nota B7 + fila de `materializarPedidoOnlineEnVenta`), Fase 1, §11 assert 17, §12 paso 19 | Verificado: `pedidos-online-admin.handler.ts:147-160` es best-effort a propósito. Con `CAJA_CERRADA` y `cajaId` explícito → **reintentar con la única caja abierta**; si no hay ninguna → `errorMaterializacion` en español visible en la bandeja |
| **B8** | **Aplicado** | **D7** (tabla de llamadores), Fase 2 (archivos) | Verificado el tercer llamador: `cierre-caja-dialog.component.ts:112`, **código muerto** (`grep` de `CierreCajaDialogComponent` devuelve solo su definición). Decisión tomada: **se borra en este PR** |
| **B9** | **Aplicado** | **D7** (orden de reglas + revalidación antes del `Conteo`), Fase 2, §12 paso 7 | Verificado: los dos flujos crean el `Conteo` antes de `updateCaja` (`create-caja-dialog.component.ts:1255-1325`, `caja-cerrar.page.ts:86-99`). Regla 1 (CERRADO→CERRADO, mensaje claro) va **antes** de la regla 2 (permiso de ajuste). Los dos front revalidan con `get-caja` contra el backend antes de crear nada; §12 paso 7 lleva el assert de "sin conteo huérfano". Cubre también **A4** |
| **B10** | **Aplicado** | **D12** (bloque "`inicializarCaja` tiene que ser esperable"), Fase 3 | Verificado: el camino "ninguna caja" usa `afterClosed().subscribe(...)` (`pdv.component.ts:352`, `:357-405`). `ofrecerAbrirCaja` pasa a `async` devolviendo la caja; `inicializarCaja` la `await`ea. **Decisión: `asegurarCajaAbierta` NO reintenta** la acción — aviso «Abriste/seleccionaste la caja #N, volvé a intentar», para no cobrar contra una caja que el cajero no confirmó |
| **B11** | **Aplicado** | **D12** (bloque "Guard de reentrancia"), Fase 3 | Verificado los seis disparadores y que `activeTab$` es un `BehaviorSubject` (`tabs.service.ts:20`, `:28`). Se agregan `revalidandoCaja` y `avisoCajaCerradaAbierto`, el pipe `distinctUntilChanged()/filter()/skip(1)`, y la limpieza del IPC y del `activeTab$` en `ngOnDestroy` (`:638-650`) |
| **B12** | **Aplicado** | §11 (bloque "Cómo se varía el usuario…" + asserts 15-25) | Verificado `withRequestUser` (`auth.utils.ts:65-67`) y el cache de permisos con TTL 30 s (`:36-43`). Se adopta `withRequestUser`, con **dos usuarios distintos o `clearPermissionCache()`**. Se agregaron los tests de su tabla: positivo de cobro sobre venta ABIERTA de la caja actual (19), mozo PWA con `deviceId` ajeno (22), pedido online con caja cerrada (17), delivery de otra caja según Q1 (24), `pago.caja === venta.caja` por el flujo real (20), retiro de cierre (21) y lock omitido en SQLite (25) |
| **B13** | **Aplicado** | **D12** (nota de firmas), Fase 3 | `getVenta` (`:1983`) y `openUtilitarios` (`:2537`) cambian de firma a `async`; queda escrito que hay que revisar todos los llamadores de `getVenta` |
| **B14** | **Aplicado** | **D11** (nota de `seq`), Fase 3 | Verificado que `MesaEventPayload.seq` es obligatorio y `cajas` no tiene columna `seq`. `CAJA_CAMBIO` va con `seq: Date.now()` y **no** se compara contra los `seq` de mesa/comanda |
| **B15** | **Aplicado** | **D13** (nota de normalización), Fase 3 | Se copia `Array.isArray(cfg) ? cfg[0] : cfg` de `pdv.component.ts:486-487` antes de leer `inicioJornadaHora` |
| **B16** | **Aplicado** | **D10** (párrafo final), §8 | Declarado explícito: `create-caja` (OPERAR) y `abrir-caja-desde-conteo` (GESTIONAR) **no se unifican**, con la razón (rutina del cajero vs. operación sobre el efectivo consolidado) |
| **B17** | **Aplicado** | §5.1 (nota B17 + filas de gastos), Fase 1, §11 asserts 15-16 | Verificado: `gastos-caja.handler.ts:59` y `:73` usan `findOneBy` sin la relación → hay que cargar `relations: ['caja']` o el guard es un no-op silencioso |
| **B18** | **Aplicado** | §8 (fila de `transferir-venta-pdv`), §14 ("cerrado por las auditorías") | Verificado: `ensurePermission(..., 'VENTAS_PDV')` en `ventas.handler.ts:3116`. Ítem 5 de §14 cerrado y saco de la fila "a verificar" |
| **B19** | **Aplicado** | Fase 3 (`resumen-caja-dialog`), §12 paso 21 | Verificado el gate por `FINANCIERO_CAJA_GESTIONAR` en `resumen-caja-dialog.component.ts:99`. El front chequea **también `AJUSTAR`** sobre caja cerrada, para no mostrar un botón que el backend va a rechazar |
| **B (respuesta sobre `manager`)** | **Aplicado** | Fase 1 (tabla "Qué `manager` recibe `assertCajaAbierta`") | Enumerado canal por canal: `createVenta` `:1029`, `delivery-crear` `:298`, `registrarCobroParcial` `queryRunner.manager` `:4519`, `cobrar-venta-credito` `queryRunner.manager` `:836`, `materializar` `qr.manager` `:263`, `transferir-venta-pdv` `manager`. Pasar el `DataSource` por error convierte el guard en no-op transaccional |
| **A1** | **Aplicado** | §13 Q1, §5.2 (fila del delivery), Fase 1 (prerrequisito), Fase 3, §11 assert 24 | Q1 pasa a decidirse **antes** de la Fase 1 (no en la Fase 3), se mantiene como pregunta a Gabriel **con recomendación** (rechazar) y, si se rechaza, se agregan el aviso en `delivery-listar-pdv` y el flujo de cancelación + reventa en el manual |
| **A2** | **Aplicado** | §3 (tabla nueva), §5.2 (fila), §11 assert 23 | Verificado: `anularCobroParcial` (`ventas.handler.ts:4622`) exige `VENTAS_PDV`, solo opera sobre venta **ABIERTA** y desactiva el `PagoDetalle`. Queda **permitido** sobre caja cerrada (reversa, resta), con assert propio |
| **A3** | **Aplicado** | §3 (tabla nueva), §5.2 (fila) | Verificado: `deleteVenta` (`ventas.handler.ts:1573`) solo borra ventas **sin ítems** → sin plata. Permitido; es inventario, no afecta el arqueo |
| **A6** | **Aplicado** | **D9** (primer párrafo), §7 (compatibilidad) | Se quitó la frase contradictoria: el SQL del índice parcial y del pre-chequeo es **portable** y la migración **no ramifica** por driver. Se explica por qué (índices parciales en ambos, `estado` es `varchar` y no enum nativo) |
| **A8** | **Aplicado** | **Fase 5**, §2 | Se agregan a la Fase 5 el **manual de usuario** (PdV uso diario + Caja Mayor/Financiero) y `todos-pendientes.md` con la deuda de ~20 canales `persona`, además de `known-bugs.md` |
| **A9** | **Aplicado** | §11 (bloque "El escenario del front: decisión explícita") | Decisión escrita: el escenario del front se cubre con el **sandbox UI de §12 como gate**; un spec de Karma de `asegurarCajaAbierta`/`manejarErrorCajaCerrada` queda **opcional**, solo si el harness de specs del repo lo permite sin infraestructura nueva, y **no es gate** |
| **A10** | **Aplicado** | **D13** (tabla de resultados del diálogo), Fase 3 | Definido el resultado nuevo `{ cerrar: caja }` y su branch en `pdv.component`: abrir `create-caja-dialog` en modo cierre si tiene permiso, si no aviso. El tipo es aditivo, no rompe consumidores |
| **A11** | **Aplicado** (vía B1) | **D4 capa 2** | El cobro sin `ventaId` de un cliente viejo queda cubierto por la derivación server-side en `updateVenta`, no como riesgo residual aceptado |
| **A12** | **Aplicado** | §11 asserts 15-18 | La matriz queda 1:1 con §5.1: `anular-gasto-caja`, `edit-gasto-caja`, `materializarPedidoOnlineEnVenta` y `cerrarVentasAbiertasMesa` tienen su assert discriminante |
| **A13** | **Aplicado** | **D11**, Fase 3 | `CAJA_CAMBIO` se emite **también** desde `finalizar-ajuste-caja` (`financiero.handler.ts:818`), que hace `cajaRepo.save` directo |
| **A15** | **Aplicado** | §13 Q5 | Reformulada como "**un plan**, uno o dos PRs de ejecución"; el plan sigue cubriendo los cuatro frentes |
| **A5** | **Descartado** | Registrado en **D9** | **Motivo: el caso no existe.** `Caja.dispositivo` es `@ManyToOne(..., { nullable: false })` (`caja.entity.ts:19-21`), así que no hay cajas `ABIERTO` con `dispositivo_id IS NULL` y el índice parcial cubre el 100 %. No hace falta ampliar el pre-chequeo ni documentar una limitación inexistente. La suposición de A venía de no tener acceso al repo |
| **A7** | **Descartado** | Registrado en **D14** | **Motivo: `password-recovery.handler.ts:189` solo ESCRIBE el hash**, no lo lee (verificado por A y confirmado por B5). No necesita `addSelect` y por eso no va en la tabla de los 7 lectores; el riesgo que sí aplica es el del `save` sobre entidad sin la columna, y ya estaba en R3 (ahora con los tres writes, incluido `updateUsuario`) |
| **A14** | **Descartado como objeción** (la mejora se mantiene) | Registrado en **D8** | **Motivo: no es scope creep, es parte del bug.** El `order: { fechaApertura: DESC, id: DESC }` de `get-caja-abierta-by-usuario` es **una línea** y hace **determinista** qué caja toma el PdV al recargar la que acaba de abrir (`pdv.component.ts:372-374`) — un `findOne` sin `order` es exactamente cómo el PdV puede quedar pegado a la caja equivocada. Se mantiene, anotado como mejora colateral aceptada |

### Contradicciones entre auditores elevadas a Gabriel

Ninguna. Los dos auditores coinciden en el diagnóstico y en la arquitectura del fix. Donde se superponen, B (con acceso al código) precisa o cierra lo que A (text-only) marcó como no verificable:

- **A11 ⊂ B1:** A lo dejaba como riesgo residual a aceptar; B mostró que el camino con `ventaId` no existe siquiera, y la solución de B (capa 2 en `updateVenta`) resuelve los dos.
- **A4 ⊂ B9:** A pedía manejo del error nuevo en la PWA `caja-cerrar`; B mostró además que sin revalidación previa ese flujo deja conteos huérfanos.
- **A5 y A7** eran hipótesis de A que B refutó leyendo el código; quedan descartadas arriba con su evidencia.
- **A9 / Q4:** A recomendaba resolver el aviso visible de *Sistema* en este PR; el `asegurarIndicesOpcionales` de B4 ataca la causa (el índice se crea solo en cuanto la base queda limpia), así que el aviso baja a nice-to-have en vez de ser la única mitigación. No es contradicción: es la misma preocupación con una respuesta mejor.

---

## 16. Estado de implementación

Rama **`fix/caja-cerrada-guard`** (PR 2). La **Fase 4 (fuga de datos)** **no está acá**: salió por separado en `fix/usuario-password-select` (decisión Q5), y su documentación es de ese PR.

| Fase | Commit | Estado |
|---|---|---|
| **Fase 1** — helper central, guard en los canales de escritura, caja del pago derivada de la venta | `83ea45ac` | ✅ completa |
| **Fase 2** — apertura atómica, índice único por dispositivo, cierre de caja cerrada | `c291461b` | ✅ completa |
| **Fase 3** — PdV: revalidación, `CAJA_CAMBIO`, jornada anterior, ajuste post-cierre en la UI | `8ae84727` | ✅ completa |
| **Fase 4** — fuga de datos | — | ⛔ **fuera de este PR** (rama `fix/usuario-password-select`) |
| **Fase 5** — tests, docs de la skill, manual de usuario, plan | `6667c880` | ✅ completa |
| **Ronda de fixes post-auditoría** — disposición de M1–M13 / P1–P10 / D1–D16 (§17) | *commit de fixes post-auditoría* | ✅ completa |
| **Fix UX-1 del sandbox UI** — el PdV ignora su propio `CAJA_CAMBIO` mientras cierra la caja (§17, «Hallazgos del sandbox UI») | *commit UX-1* | ✅ completa |
| **Fix UX-1b del sandbox UI** — el cierre desde el PdV termina en el paso RESUMEN y un SALIR post-cierre cuenta como éxito (§17, «Hallazgos del sandbox UI») | *commit UX-1b* | ✅ completa |
| **Sandbox UI de §12** — pase completo sobre `6da0192e` (ver «Resultado del sandbox UI») | *commit de docs* | ✅ PASS (con pasos no ejecutables documentados) |

**Tests al cierre de la Fase 5 (`6667c880`):** `test:caja-cerrada` **97 asserts**, `test:caja-apertura` **67 asserts**, `test:mesa-sse` y `test:terminal-caja` verdes. `test:locks-pg` se salteaba con exit 0 por falta de Postgres.

**Tests al cierre de la ronda de fixes post-auditoría:**

```
tsc electron --noEmit        OK        tsc app --noEmit             OK
caja-cerrada    129/0        caja-apertura   105/0     mesa-sse        OK
terminal-caja    30/0        transferencia-pdv 71/0    delivery        55/0
integridad-cobro 21/0        locks-pg (Postgres 17 real) 33/0
sse-emit-postgres: PASS en Postgres y en SQLite
```

✅ **El gate de §11 quedó cumplido:** `test:locks-pg` **se corrió contra un Postgres 17 real (33 asserts, 0 fallidos)**, con los bloques nuevos F5 (`CAJA_CAMBIO` post-commit leído desde una segunda conexión), F6/F6b (alcance de la transacción del cierre) y F7 (ajuste de gasto concurrente con un cierre en vuelo). Necesita `FRC_PG_USERNAME` / `FRC_PG_PASSWORD` o toma `$USER`. ⚠️ Lo que **no** está resuelto es el gate en **CI**, que no tiene servicio Postgres: deuda D2 en §17.

⚠️ `test:mesa-una-venta-abierta` **no se corrió** en esta ronda: no termina el proceso por sí solo (bug preexistente de tooling, ver `reference/known-bugs.md`).

### Resultado del sandbox UI (§12) — 2026-09-29

Sandbox **Electron standalone + SQLite**, 2026-09-29 (hora PYT), HEAD **`6da0192e`** (incluye los fixes UX-1 y UX-1b de §17). Datos de prueba sembrados por los handlers reales (productos, mesas, timbrado, usuarios CAJERO / GESTOR / AJUSTA).

> **Método para 13, 14, 15, 23 y 24:** como el cierre de una caja **con ventas abiertas se rechaza en la UI** (ver la última fila de PASS), el *cierre concurrente* (otra terminal / cliente viejo) se simuló poniendo `cajas.estado = 'CERRADO'` directo en la base del sandbox, con el PdV abierto.

| Paso | Resultado | Evidencia |
|---|---|---|
| 1 | ✅ PASS | Cobro + factura legal **001-001-0000001** |
| 2 | ✅ PASS | Cierre desde Financiero con el PdV abierto → **exactamente 1** aviso «ESTA CAJA YA FUE CERRADA» |
| 2c | ✅ PASS (parcial) | Verificado el invariante en la base: `pagos.caja_id == ventas.caja_id` en **todas** las filas (sqlite) |
| 3 | ✅ PASS | Con la caja del PdV cerrada, el PdV no deja F1, agregar ítem, gasto ni retiro |
| 6 | ✅ PASS | Diálogo de jornada anterior: *Usar igual* entra al PdV; *Ir a cerrarla* abre el conteo y SALIR cierra la pestaña |
| 7 | ✅ PASS | Conteo sobre caja cerrada: aviso «LA CAJA #4 YA FUE CERRADA… USÁ AJUSTAR CONTEO», sin botón de guardar; `COUNT(*) FROM conteos` sin cambio |
| 9 | ✅ PASS | Gasto faltante con motivo; la caja queda `revisado = 1`, `revisado_por` y `motivo_ajuste` en MAYÚSCULAS |
| 10 | ✅ PASS | El CAJERO no ve agregar/editar gasto |
| 12 | ✅ PASS | Evidencia esperada de §12 |
| 13 | ✅ PASS | Delivery de caja cerrada: chip «CAJA CERRADA: SOLO CANCELAR», PAGO deshabilitado, cancelar OK |
| 14 | ✅ PASS | Cancelar una venta de caja cerrada funciona |
| 15 | ✅ PASS | Transferir una mesa de caja cerrada → la venta pasa a la caja activa y se cobra ahí |
| 17 | ✅ PASS | Evidencia esperada de §12 |
| 18 | ✅ PASS | GESTOR sin `AJUSTAR` no ve editar/agregar gasto |
| 22 | ✅ PASS | Editar gasto 5.000 → 7.000 con motivo, verificado en la base |
| 23 (M2) | ✅ PASS (con nota) | El polling del PdV detectó el cierre **antes** de finalizar el cobro → 1 aviso «ESTA CAJA YA FUE CERRADA», **sin** «No se pudo finalizar el cobro». La rama de traducción del propio diálogo de cobro no llegó a ejercitarse en UI; queda cubierta por código (`mostrarErrorCobro` → `esCajaCerrada`) y tests |
| 24 (M3) | ✅ PASS | Aviso en la cuenta, COBRAR / COBRO RÁPIDO grises, F1 bloqueado; **agregar ítems permitido a propósito** (decisión de producto pendiente, §17) |
| 25 | ✅ PASS | Evidencia esperada de §12 |
| 26 (M6) | ✅ PASS | «LA TERMINAL TERMINAL PRINCIPAL YA TIENE UNA CAJA ABIERTA (CAJA #6)…», sin conteo huérfano |
| Cierre desde el PdV | ✅ PASS | Sin aviso tras el fix `6da0192e` (UX-1 + UX-1b): el diálogo termina en «CAJA CERRADA EXITOSAMENTE» y la pestaña se cierra |
| Cierre con ventas abiertas | ✅ PASS | Rechazo: «No se puede cerrar la caja: tiene 1 venta(s) abierta(s)…» |

**No ejecutables en este sandbox** (quedan documentados, no son fallas):

| Paso | Motivo |
|---|---|
| 4, 11 | Caja Mayor sin configurar («No hay cajas mayor registradas»). El guard de terminal del 4 es el mismo que ejercita el 26 |
| 2b, 5, 16, 19, 20 | Necesitan PWA / `mode=server` |
| 8, 21 | Cubiertos por el paso 2 (un solo aviso) y el fix del cierre desde el PdV |

**Observaciones menores (deuda, no bloquean el merge):**

- El **tooltip del botón PAGO deshabilitado** del delivery (paso 13) no aparece al pasar el mouse: un botón `disabled` no recibe eventos. Se resuelve envolviendo el botón en un `<span>` con el `matTooltip`.
- El **diálogo de jornada anterior** muestra la fecha en formato en-US («9/28/2026, 1:00:00 AM») y con **1 h de diferencia** respecto de la hora guardada. Revisar el locale y la zona horaria del formateo.

### Desvíos respecto del plan, registrados por los implementadores

Ninguno cambia una decisión del plan; todos son cosas que el plan no podía prever sin escribir el código. Se anotan porque **la razón por la que algo salió distinto vale tanto como lo que salió**.

#### Fase 1

| Desvío | Por qué |
|---|---|
| **`assertCajaAbiertaSiVino(ejecutor, cajaId, opts)`**, además de `assertCajaAbierta` | Varios canales reciben la caja como **opcional**. `assertCajaAbierta(null)` rechaza a propósito (una caja inexistente no es una caja abierta), así que usarlo donde el `cajaId` puede venir vacío rompería flujos legítimos. La variante "si vino" hace explícito cuál de las dos semánticas quiere cada call site, en vez de dejarlo a un `if` suelto que el próximo lector borra |
| **`anular-gasto-caja` pasó a `(_event, gastoId, motivo?, opts?)`** — un cuarto parámetro | El flag de ajuste (`{ ajuste: { motivo } }`) no entraba en la firma existente, que no tiene objeto de datos. Se agregó como último parámetro **opcional** para no romper a ningún llamador viejo: un `/admin` desactualizado sigue llamándolo con dos argumentos |
| **Los códigos de error de pedidos online se conservaron tal cual** | La tentación era unificar todo a `CAJA_CERRADA`. `materializarPedidoOnlineEnVenta` tiene su propio contrato de mensajes que la bandeja de pedidos **muestra al operador**; pisarlo con el código genérico habría degradado la UI del canal justo donde el plan pedía un mensaje **en español y accionable** (nota B7) |
| **Q2 · sub-caso "el destino ya tiene cuenta abierta"** | El plan describía las dos ramas de `transferir-venta-pdv` (re-apunte y venta destino nueva), pero no el tercer caso real: el destino **ya** tiene una venta abierta, así que los ítems se mueven a esa cuenta y no nace ninguna venta. Ahí no hay nada que reimputar — la cuenta destino ya es de la caja activa — y `cajaActivaId` no se aplica. Está cubierto con assert propio en `test:caja-cerrada` [11] |

#### Fase 2

| Desvío | Por qué |
|---|---|
| **`withAperturaCajaLock`: un candado en memoria además del índice** | Descubierto **midiendo**, no razonando: en SQLite dos `dataSource.transaction()` intercalados **comparten la misma transacción física**, así que el ROLLBACK de la apertura perdedora borraba el INSERT de la ganadora. Un doble click dejaba **cero** cajas abiertas y el mensaje «ya hay una caja abierta», que encima era falso. El candado serializa las dos aperturas dentro del proceso. **No reemplaza al índice** (no protege entre procesos ni entre nodos); es lo que hace que el caso [10] de `test:caja-apertura` valga algo en SQLite |
| **`esViolacionCajaUnicaAbierta` es un matcher estricto, no "cualquier UNIQUE"** | `cajas` tiene **otro** único: `conteo_apertura_id`, por el `@OneToOne`. Traducir cualquier violación a «ya hay una caja abierta en esta terminal» sería **mentirle al cajero** con un mensaje que lo manda a cerrar una caja que no tiene nada que ver. El matcher mira el nombre del índice (Postgres) o `cajas.dispositivo_id` (SQLite nombra la **columna**, no el índice). Los dos casos están asertados, en positivo y en negativo |
| **Snackbar de error en `create-caja-dialog`** | El plan pedía "estado de error sin botón de guardar" al revalidar contra `get-caja`. En la práctica el diálogo ya estaba abierto cuando llega la respuesta, y dejarlo mudo se leía como que la app se colgó. Se agregó el aviso explícito además del estado |
| **`indices-opcionales.ts` vive en `src/app/database/`, no en `electron/utils/`** | El plan ofrecía las dos ubicaciones. Se eligió `src/app/database/` porque es donde vive `database.service.ts`, que es quien lo llama, y porque así los **tests** lo importan por el mismo camino que el runtime (`scripts/test-caja-apertura-e2e.ts`) sin cruzar la frontera `electron/` ↔ `src/` |

#### Fase 3

| Desvío | Por qué |
|---|---|
| **`cajaEstado` (y `dispositivoId`) en el payload de `CAJA_CAMBIO`** | El plan sólo fijaba `cajaId`. Sin el estado, el cliente tiene que ir a buscarlo con un `get-caja` por cada evento, incluso cuando el evento es una **apertura** que no le importa. Con `cajaEstado` el PdV descarta lo irrelevante sin tocar la red, y `dispositivoId` le deja ignorar las cajas de otras terminales |
| **El motivo del ajuste lo pide el LLAMADOR, no el diálogo** | Igual que el flag `ajuste`. El mismo `gasto-caja-dialog` se abre desde los Utilitarios del PdV (donde **nunca** hay ajuste) y desde Financiero › Cajas (donde sí). Si el diálogo decidiera, habría que pasarle igual de dónde viene: es la misma información, con un lugar más donde equivocarse |
| **`onMesaEvent: undefined` en `src/app/web/api-http.ts`** | En `/admin` y en la PWA **no hay canal IPC**: exponer una función que invoca un canal inexistente daría un error en runtime en vez de "esta capacidad no está". Dejarlo `undefined` hace que el consumidor lo detecte con `window.api?.onMesaEvent?.(…)` y caiga solo al SSE, que es el transporte correcto en ese origen |
| **`src/app/shared/utils/caja-error.util.ts`** (no estaba en el plan) | La traducción de `CAJA_CERRADA` / `CAJA_ABIERTA_DUPLICADA` hacía falta en **seis** lugares del desktop y dos de la PWA. Repetir el `includes(...)` en cada `catch` garantizaba que alguno quedara mostrando el JSON crudo del 500 en modo cliente, que es exactamente lo que D1 prohíbe |
| **El filtro de `activeTab$` acepta `'pdv'` **y** `'pdv-tab'`** | Los dos ids conviven: la hoja del menú abre la tab como `pdv-tab` y los demás caminos como `pdv`. Filtrar sólo por `'pdv'` dejaba **sin revalidación por activación de tab** justo al PdV abierto desde el menú, que es el camino más común |
| **Guards extra de reentrancia y "un solo SSE"** | El plan preveía `revalidandoCaja` y `avisoCajaCerradaAbierto`. Al implementarlo aparecieron dos más: `revalidacionEnCurso` (una **promesa** compartida, para que un click del cajero se cuelgue de la revalidación en vuelo en vez de salir con `false`) y el guard de conexión SSE única (la suscripción se re-disparaba al reactivar la tab y dejaba dos `EventSource` abiertos) |
| **`update-caja` emite `CAJA_CAMBIO` en cualquier update, no sólo al cerrar** | Un ajuste que cambia `conteoCierre` o `revisado` también deja rancia la vista del PdV y del resumen. Emitir sólo en el cierre obligaba a acordarse de agregar el emisor cada vez que alguien tocara otro campo; emitir siempre es una línea y no se olvida. El evento es barato (dos veces por día en el peor caso) y el cliente ya filtra por `cajaId` |

### Deuda anotada, no implementada

- **Q4** — aviso visible en *Sistema* de cajas duplicadas / índice no creado: **no va** en este PR (decisión de Gabriel). Queda el `console.error` de la migración + el reintento de `asegurarIndicesOpcionales` en cada arranque. Anotado en `.claude/skills/frc-gourmet-expert/workflows/todos-pendientes.md`.
- **Q6** — cierre asistido de cajas abiertas varios días: **fuera de alcance**. Queda el aviso de jornada anterior (D13). Anotado en `todos-pendientes.md`.
- **`test:sse-emit-postgres`** no se extendió con `CAJA_CAMBIO`: el contrato del payload ya lo cubre `test:mesa-sse` y el emisor lo cubre `test:caja-apertura` [13]. Lo que faltaría es verificar el emisor **sobre Postgres**, que es el único delta. Anotado.
- **Spec de Karma de `asegurarCajaAbierta` / `manejarErrorCajaCerrada`**: explícitamente **no gate** (§11, hallazgo A9). El escenario del front se cubre con el sandbox de §12.
- **`removeTabById('pdv')`** era un no-op cuando la tab se abrió desde el menú como `pdv-tab` — bug **preexistente**, no introducido acá. ✅ **Resuelto en la ronda de fixes post-auditoría** (M4 de §17): el helper `cerrarPestanaPdv()` borra los dos ids.
- **`test:sse-emit-postgres`** sigue sin extenderse con `CAJA_CAMBIO`, pero su **modo Postgres pasó a funcionar**: estaba roto desde antes del PR (corría el baseline SQLite contra PG) y se arregló en la ronda de fixes. Ver §17.
- **Observaciones menores del sandbox UI** (tooltip de PAGO deshabilitado en delivery; fecha en-US y con 1 h de diferencia en el diálogo de jornada anterior): ver «Resultado del sandbox UI» arriba.
- La deuda nueva que dejó la ronda de fixes está en **§17**: P4 (`update-caja` sobre `CERRADO` sin motivo), M3 (marcar la grilla de mesas), M8 (`puede-ajustar-caja`/`finalizar-ajuste-caja` con `CANCELADO`), D2 (Postgres en CI) y el `getCurrentUser()` del guard «sólo quien abrió cierra».

---

## 17. Auditoría de diff — disposición de hallazgos

Las dos auditorías del diff (paso 7 del ciclo) corrieron sobre `8ae84727` + `6667c880`:

- **`AUDIT-DIFF-caja-cerrada-guard-MOTOR-UI.md`** — motor / SQLite-PG / UI, Claude Opus 5 con el repo a mano. Veredicto **APROBADO CON CAMBIOS**. Hallazgos **M1–M13** + riesgos R-A…R-F.
- **`AUDIT-DIFF-caja-cerrada-guard-PERMISOS-TESTS.md`** — permisos/fugas y poder discriminante de los tests, DeepSeek Flash sobre el diff en texto, **sin acceso al repo**. Hallazgos **P1–P10** (permisos) y **D1–D16** (tests).

Disposición de los **39** hallazgos (13 + 10 + 16), verificada contra el código de la ronda de fixes:

| Disposición | Cuántos | Cuáles |
|---|---|---|
| **Aplicado** | 31 | M1, M2, **M3**, M4, M5, M6, M7, **M8**, M10–M13 · P1, P2, P3, P6, P7, P8, P9 · D1, D3, D4, D6, D7, D8, D9, D10, D12, D13, D15, D16 |
| **Descartado** | 4 | M9 (premisa falsa, con fix defensivo igual), P5, P10, D11 |
| **Deuda** | 4 | P4, D2 · y el resto residual de **M3** (marcar la grilla) y **M8** (`puede-ajustar-caja`/`finalizar-ajuste-caja` con `CANCELADO`), que se aplicaron en parte |
| **Sin acción** | 2 | D5 (queda cubierto por `[F2]` en Postgres), D14 (informativa) |

M3 y M8 cuentan en las dos primeras filas a propósito: la parte que importaba está aplicada y el resto quedó anotado. Además de los 39, la ronda dejó **una deuda propia** (`getCurrentUser()` en el guard «sólo quien abrió cierra») y **un arreglo fuera de lista** (`test-sse-emit-postgres`).

### M1–M13 (motor / SQLite-PG / UI)

| ID | Sev | Disposición | Cómo / por qué (archivo) |
|---|---|---|---|
| **M1** | ALTA | **aplicado** | `transferir-venta-pdv`: cuando el destino **ya tiene** cuenta abierta y la caja de *esa* venta no está `ABIERTO`, la venta destino se **reimputa** a la `cajaActivaId` validada, mismo criterio que Q2 (`ventas.handler.ts`, bloque «M1» tras `buscarVentaAbiertaDe`). Los `Pago`/`CobroParcial` ya registrados no se mueven. Asserts `[11c]` en `test:caja-cerrada` |
| **M2** | ALTA | **aplicado** | `mostrarErrorCobro` ramifica con `esCajaCerrada(error)`, muestra `mensajeDeErrorCaja(...)` y cierra el diálogo con `{ success: false, cajaCerrada: true }` (`cobrar-venta-dialog.component.ts:1265`). El cobro parcial dejó su snackbar propio y pasó por el mismo helper (`:1603`); el sub-diálogo de crédito traduce y propaga (`cobrar-credito-dialog.component.ts:194` → `cobrar-venta-dialog.component.ts:1546`). El PdV consume `cajaCerrada` con `revalidarCaja()` + `evaluarCuentaDeCajaCerrada(venta.id)` (`pdv.component.ts:2739`) |
| **M3** | MEDIA | **aplicado** (cuenta seleccionada) + **deuda** (grilla) | Aplicado: aviso/chip en el panel de venta (`pdv.component.html:629`, `pdv.component.scss`), `cuentaDeCajaCerrada` en el `[disabled]` de COBRAR y COBRO RÁPIDO con el motivo en el tooltip, y chequeo en runtime también en `cobroRapido()` (F2 llega por atajo). El texto se adapta a la salida que existe: «transferila (pasa a la caja activa) o cancelala» sólo si `resolverOrigenTransferencia()` da algo. **Deuda:** marcar la **grilla** de mesas/comandas necesita un campo nuevo en `getPdvMesas`, que hoy no joinea `venta.caja` (`ventas.handler.ts:2680-2690`). **Decisión de producto abierta (Gabriel):** ver más abajo |
| **M4** | MEDIA | **aplicado** | Helper `cerrarPestanaPdv()` que borra los **dos** ids (`pdv` del home/dashboard y `pdv-tab` del menú), usado en los 7 caminos (`pdv.component.ts:397`, call sites `:471 :538 :551 :565 :589 :608 :3055`). `removeTabById` es inocuo si el id no existe y `addTab` deduplica por título, así que los dos ids no coexisten |
| **M5** | MEDIA | **aplicado** | `update-caja` pasa por **`enTransaccionSiPostgres`** (`electron/utils/tx.utils.ts`): transacción sólo en Postgres —donde el `FOR UPDATE` sirve— y en SQLite el mismo cuerpo sin transacción, que es el comportamiento pre-PR. Assert de humo `[18]` en `test:caja-apertura` (cierre vs. `createVenta` concurrente) y `[20]`, que mide la transacción compartida de SQLite que hasta ahora vivía sólo en comentarios. ⚠️ `[18]` está documentado en el propio test como **no discriminante** |
| **M6** | MEDIA | **aplicado** | Desktop: `onSubmit` delega en `crearCajaConConteoApertura()`, que revalida con `cajaAbiertaDelDispositivo()` **antes** del `createConteo` (`create-caja-dialog.component.ts:830, 843, 1482`). PWA: `caja-abrir.page.ts:95` + `cajaAbiertaDeTerminal()` (`:144`), que revalida al tocar ABRIR (el filtro de terminales libres de `ngOnInit` es un snapshot de minutos antes). Fail-open explícito si la consulta falla (en modo cliente `getCajasAbiertas` todavía lanza): decide el índice único, que es el control primario |
| **M7** | MEDIA | **aplicado** | Los cuatro canales de ajuste (`create`/`edit`/`anular-gasto-caja`, `create-retiro-caja`) corren guard + `save` + `estamparTrazaAjuste` dentro de `enTransaccionSiPostgres`, con `lock: 'read'` y el `manager` de la transacción. El emit queda post-commit |
| **M8** | BAJA | **aplicado** (front + `delivery.handler`) + **deuda** (pre-chequeos de ajuste) | Front: `esEstadoCajaNoOperable` / `esEstadoCajaCancelada` en `caja-error.util.ts` y los cuatro sitios pasados a `!== ABIERTO` (`list-cajas.component.ts:388/420/440`, `create-caja-dialog.component.ts:1502`, `resumen-caja-dialog.component.ts:115`, `caja-cerrar.page.ts`), con texto distinto para `CANCELADO`. Backend: `delivery.handler.ts:233` pasó a `!== ABIERTO` (aplicado por el orquestador). **Deuda:** `puede-ajustar-caja` (`financiero.handler.ts:927`) y `finalizar-ajuste-caja` (`:949`) siguen exigiendo `CERRADO`, así que con `CANCELADO` el ajuste muere en el pre-chequeo. No urge: **ningún código escribe `CajaEstado.CANCELADO` hoy** (verificado con grep sobre `src`, `electron` y `projects`) |
| **M9** | BAJA | **descartado** (premisa falsa) **con fix defensivo** | La premisa —que la columna podría ser nulable— es falsa: `cajas.dispositivo_id` es **NOT NULL en las dos baselines** (`1778378410416-Baseline.ts:104` SQLite, `1778380893207-BaselinePostgres.ts:104` Postgres) y ninguna migración la afloja, así que la fila que dispararía el falso positivo no puede existir. Se aplicó igual el `AND dispositivo_id IS NOT NULL` en la migración y en `dispositivosConCajasDuplicadas()` (el `GROUP BY` sin él es incorrecto aunque hoy no tenga filas que agrupar) y se **corrigieron los comentarios** que afirmaban lo contrario. Assert `[19]` en `test:caja-apertura` |
| **M10** | BAJA | **aplicado** | `skip(1) → distinctUntilChanged() → filter` (`pdv.component.ts:953`): el `skip` descarta el valor inicial del `BehaviorSubject`, no la primera activación real del PdV |
| **M11** | BAJA | **aplicado** | Contador de generación `sseGen` (`pdv.component.ts:150`, `const gen = ++this.sseGen` al entrar en `conectarSSEMesas`), cortes en los tres `await` y antes de asignar, `es.close()` si quedó obsoleto, y `sseGen++` en `ngOnDestroy` |
| **M12** | BAJA | **aplicado** | `.aviso-jornada` pasó a `var(--warning-color)` sin fallback + `background-color: color-mix(in srgb, var(--warning-color) 12%, transparent)` (`seleccionar-caja-dialog.component.scss`). `--warning-color` está definida para los dos temas (`src/styles/theme-variables.scss`) |
| **M13** | BAJA | **aplicado** | `opts` de `anular-gasto-caja` cableado de punta a punta: `preload.ts:3183`, `repository.service.ts` (abstracto), `repository-ipc.service.ts`, `repository-http.service.ts`. Tercer parámetro opcional, retrocompatible con los llamadores de dos argumentos |

### P1–P10 (permisos, autorización y fugas)

| ID | Sev | Disposición | Cómo / por qué (archivo) |
|---|---|---|---|
| **P1** | Alta | **aplicado** (opt-in) | `cajaActivaId` viene del payload, así que pasa el **mismo gate de terminal que el cobro**: `assertTerminalPuedeOperar(dataSource, event, id, 'PAGO')` dentro de `resolverCajaActiva` (`ventas.handler.ts:3118`), **sólo si** el llamador manda `validarDispositivoCaja` — el mismo opt-in que `createPago`/`createPagoDetalle`. Inventar acá una política obligatoria habría bloqueado la transferencia en instalaciones donde el cobro entre terminales sí está permitido. El PdV desktop lo manda (`pdv.component.ts:3240`) y el campo está declarado en `TransferirVentaPdvPayload` (`repository.service.ts:89`). ⚠️ **La PWA no manda `cajaActivaId`** (`projects/mobile/.../mesa-detalle.page.ts:619, 689`): su transferencia con caja de origen cerrada se **rechaza con `CAJA_CERRADA`**, y la salida es cancelar y volver a cargar. Aceptado y documentado en el manual |
| **P2** | Media-Alta | **aplicado** | `update-caja` descarta del merge `id`, `dispositivo`, `createdBy`, `createdAt`, `conteoApertura` y `fechaApertura` (`financiero.handler.ts`, bloque «Campos NO editables»). Sin `createdBy` fuera del merge, un usuario con sólo `FINANCIERO_CAJA_OPERAR` podía escribirse como abridor y después cerrar la caja: el guard comparaba contra el valor que él mismo acababa de poner. Assert `[15]` en `test:caja-apertura` (revirtiendo sólo `createdBy` caen 5 asserts) |
| **P3** | Media | **aplicado** | Regla **1b**: `CERRADO → ABIERTO` se rechaza con mensaje propio, **antes** del permiso de ajuste (mismo criterio de orden que la regla 1: el mensaje tiene que explicar qué pasó, no mandar a pedir un permiso que no arregla nada). «No se reabren cajas» es no-objetivo explícito del plan. Assert `[16]` |
| **P4** | Media | **deuda (leve)** | `update-caja` sobre una caja `CERRADO` exige `FINANCIERO_CAJA_AJUSTAR` pero **no** `ajuste: { motivo }` ni estampa traza. Se deja así: la traza del ajuste de conteo la deja **`finalizar-ajuste-caja`** (que sí exige el permiso, pide motivo y lo guarda en `motivoAjuste`/`revisado`/`revisadoPor`), y mientras tanto `updatedBy` registra el autor del update vía `setEntityUserTracking(..., isUpdate=true)`. Los canales que agregan plata a una caja cerrada —gastos y retiros— **sí** exigen motivo (D6) |
| **P5** | Media | **descartado** | La premisa no se sostiene: **`caja_id` no es una propiedad de la entidad.** La relación se declara como `caja` con `@JoinColumn({ name: 'caja_id' })` (`venta.entity.ts:43-45`, `pago.entity.ts:23-25`), y `repo.create()`/`repo.merge()` de TypeORM sólo mapean propiedades presentes en la metadata: un `caja_id` crudo en el payload se **ignora**, no llega a la columna. Verificado leyendo las dos entidades. No hay bypass por FK crudo |
| **P6** | Media | **aplicado** | Mismo fix que M7, extendido a `createPago`, `createPagoDetalle` y **`cerrarVentasAbiertasMesa`** (`ventas.handler.ts:960-982`: los guards de las ventas de la mesa y sus `save` adentro; `sincronizarEstadoMesa` y el emit afuera) |
| **P7** | Baja | **aplicado** | `estamparTrazaAjuste` corre en la **misma transacción** que la escritura del gasto/retiro (encabezado del helper actualizado). En SQLite no hay transacción a propósito, así que ahí sigue siendo "primero la escritura, después la traza" |
| **P8** | Baja | **aplicado** | `emitirCambioDeCajaAjustada(ejecutor, cajaId)` (`caja-abierta.utils.ts`) se llama **post-commit** en los cuatro canales de ajuste. Relee el estado de la base en vez de asumir `CERRADO`, porque el payload de `CAJA_CAMBIO` declara `cajaEstado`. Never-throws. Sólo se emite en el **ajuste**: un gasto del turno normal no mueve el estado de la caja y no vale spamear el bus |
| **P9** | Baja | **aplicado** | `create-caja` rechaza cualquier `estadoFinal !== ABIERTO`: «este canal solo abre cajas». Antes, con `estado: 'CERRADO'` se salteaba el guard de duplicado (que sólo corre para `ABIERTO`) y nacía una caja cerrada, con `dispositivo` elegido por el cliente, que el índice parcial tampoco cubre. Verificado que ningún llamador lo hace. Assert `[17]` |
| **P10** | Baja | **descartado** | El payload de `CAJA_CAMBIO` lleva **sólo ids y estado** (`cajaId`, `cajaEstado`, `dispositivoId`, `seq`): ni usuario, ni persona, ni montos. Y el stream SSE `/api/pdv/mesas/stream` es **autenticado**, igual que el resto de `/api`. No hay dato sensible que segmentar por sala; hacerlo agregaría un mapa de suscripciones por dispositivo para no ganar nada |

### D1–D16 (poder discriminante de los tests)

| ID | Sev | Disposición | Cómo / por qué (archivo) |
|---|---|---|---|
| **D1** | Alta | **aplicado** | `test-locks-postgres-e2e.ts` bloque **F5**: al recibir `CAJA_CAMBIO`, un listener lee `SELECT estado FROM cajas` desde una **segunda conexión física** y afirma `CERRADO`. Discrimina: moviendo el `emit` adentro de la transacción, F5 lee `ABIERTO` |
| **D2** | Alta | **deuda (CI)** | `test:locks-pg` **se corrió contra un Postgres 17 real en esta caja: 33 asserts, 0 fallidos** (`FRC_PG_USERNAME=postgres FRC_PG_PASSWORD=postgres`), que es el gate de §11. Lo que falta es **CI**: el workflow de PR no tiene servicio Postgres, así que la suite se saltea con exit 0 y el invariante de apertura no queda gateado por defecto. Anotado como deuda de infraestructura |
| **D3** | Media | **aplicado** | Bloque `[20]` de `test:caja-cerrada`: la pre-condición real ahora se **siembra por repositorio** (`R(Pago).save` con `caja: cajaCerrada`, burlando el handler que la bloquearía) y recién después `updateVenta(venta, { pago })` verifica la reimputación |
| **D4** | Media | **aplicado** | `test-locks-pg` **F6** (dos conexiones: el retiro del cierre no ve la transacción sin commitear) y **F6b**, el mismo caso por el **handler real**, que es lo que discrimina el revert |
| **D5** | Media | **cubierto** | La traducción de `guardarAperturaTraduciendoDuplicado` queda gateada por **F2** en Postgres (dos `create-caja` concurrentes), que es la suite que se corrió contra PG real. En SQLite el guard + el candado atajan todos los caminos por handler, así que ahí la traducción no es alcanzable: está documentado en el encabezado del test |
| **D6** | Media | **aplicado** | Positivo de `cobrar-venta-credito` sobre caja **abierta** (`test-caja-cerrada-e2e.ts:427`), que es la red contra un guard over-broad |
| **D7** | Media | **aplicado** | `edit`/`anular-gasto-caja` sobre caja cerrada también con **cajero sin `AJUSTAR`**, asertando que el mensaje es **de permiso** y no `CAJA_CERRADA` (`:792`) |
| **D8** | Media | **aplicado** | El bloque `[8]` siembra un **funcionario y una cuota de compra reales** (`:240`), así que el assert ya no depende de que el guard de caja corra antes que la validación de FK |
| **D9** | Baja | **aplicado** | `esperarA` / `reposo` (poll con timeout) en vez de los `setTimeout(50/100)` fijos, en las dos suites |
| **D10** | Baja | **aplicado** | El cierre global de cajas del bloque `[17]` y su reposición quedaron en `try/finally` (`:854`) |
| **D11** | Baja | **descartado** | El bloque `[14]` inyecta `fechaApertura` relativa (`Date.now() + 1h/2h`) sobre una **base efímera creada por el propio test**, no sobre una base compartida: no hay composición previa que lo contamine ni dependencia del calendario. Congelar el reloj agregaría una dependencia (`fake-timers`) para proteger de nada |
| **D12** | Baja | **aplicado** | La migración **exporta su nombre** (`NOMBRE_MIGRACION_CAJA_UNICA_ABIERTA`) y el test lo importa, así que un cambio de timestamp no vuelve a dejar el `DELETE FROM typeorm_migrations` sin matchear (que dejaba el bloque tautológico) |
| **D13** | Baja | **aplicado** | Sub-assert de `createPago` con `deviceId` ajeno sobre caja abierta, en el bloque `[22]` |
| **D14** | Informativa | **sin acción** | Correcto: los cambios de `test-delivery`, `test-integridad-cobro` y `test-terminal-caja` son **sólo de fixture** (una terminal por caja). No agregan ni quitan poder discriminante; queda constancia de que la cobertura del fix no está ahí |
| **D15** | Baja | **aplicado** | `nuevaDb` borra el archivo también al terminar, así que `.tmp/*.db` no se acumula entre corridas |
| **D16** | Baja | **aplicado** | Precedencia del permiso sobre el chequeo del retiro `INGRESADO`, asertada con el **cajero** (`:737`) |

### Hallazgos propios de la ronda de fixes

| Tema | Disposición | Detalle |
|---|---|---|
| «Sólo quien abrió la caja puede cerrarla» usa `getCurrentUser()` | **deuda** | El guard de `update-caja` compara `entity.createdBy.id` contra `getCurrentUser()?.id`, no contra `getEffectiveUser` — o sea que en **modo servidor / PWA** compara contra el usuario del desktop, justo el caso para el que se escribió el guard. No se tocó porque arreglar un lado solo lo rompe: `createdBy` se estampa con el **mismo** `getCurrentUser()` en `create-caja`. **Hay que mover los dos juntos**, en un PR propio y con un assert por `withRequestUser`. Anotado en el bloque `[15]` de `test:caja-apertura` |
| `scripts/test-sse-emit-postgres.ts` (fuera de la lista de hallazgos) | **arreglado** | Su modo Postgres estaba **roto desde antes de este PR**: pisaba `type` por spread sobre el resultado de `getDataSourceOptions` en vez de pasarlo como override, así que `getMigrations()` ya había devuelto el **baseline de SQLite** y la corrida moría con `syntax error at or near "AUTOINCREMENT"`. Con el override por parámetro, el test pasa en Postgres **y** en SQLite |

### Hallazgos del sandbox UI (§12)

| ID | Disposición | Detalle |
|---|---|---|
| **UX-1** — cerrar la caja **desde el PdV** mostraba «ESTA CAJA YA FUE CERRADA» antes de cerrar la pestaña | **aplicado** | El `update-caja` del cierre emite `CAJA_CAMBIO` (IPC `mesa-updates`) mientras `create-caja-dialog` sigue abierto en el paso final; `manejarEventoCajaCambio` veía su propia caja, `revalidarCaja` la leía `CERRADO` y disparaba `avisarCajaCerrada` + `inicializarCaja()` encima del diálogo. Fix: `cierrePropioCajaId` se marca en `cerrarCaja()` antes de abrir el diálogo y `revalidarCajaEnFondo()` (IPC, SSE, foco, visibilidad, tab, polling) ignora esa caja mientras dure; al cerrar el diálogo se limpia y, si no hubo éxito, se revalida para recuperar lo ignorado. Las acciones del cajero (`asegurarCajaAbierta`) no pasan por el filtro. `ofrecerCerrarCaja` no lo necesita: corre con `this.caja === null` |
| **UX-1b** — tras UX-1 el aviso «ESTA CAJA YA FUE CERRADA» + «Caja abierta no encontrada» seguía apareciendo (retest 00:41) | **aplicado** | El renderer **no** estaba rancio (live-reload de `ng serve` recargó la ventana). Causa real, preexistente en `create-caja-dialog`: el `mat-stepper` vive bajo `*ngIf="!loading"`, así que al guardar el cierre se destruye y renace en el **paso 0** (CONTEO APERTURA, con SALIR/SIGUIENTE) en vez del paso RESUMEN «CAJA CERRADA EXITOSAMENTE». El cajero ve el diálogo «como si no hubiera cerrado» y pulsa SALIR (`mat-dialog-close` → `undefined`); el PdV lo tomaba como cancelación → `revalidarCajaEnFondo()` → caja `CERRADO` → aviso + `inicializarCaja()`. En develop no se veía porque no había watcher (el PdV quedaba rancio en silencio). Fix: (1) `irAlResumenFinal()` lleva el stepper al último paso tras `cierreCompleted = true` (ambas ramas); (2) los SALIR llaman `onCancel()`, que con el cierre ya hecho cierra con `{ success: true }`; (3) defensa en el PdV: si el diálogo vuelve sin `success` ni `error`, `cajaDejoDeEstarAbierta(id)` consulta la caja y, si ya no está `ABIERTO`, se trata como cierre propio (caja = null + cerrar pestaña, sin aviso). Verificado en el sandbox: abrir caja #3 → CERRAR CAJA → guardar → queda en «CAJA CERRADA EXITOSAMENTE», sin aviso durante 6 s, CERRAR cierra la pestaña |
| «SIN RETIROS REGISTRADOS» en Financiero › Cajas › resumen de una caja **cerrada** aunque exista el retiro `CIERRE` (FLOTANTE) | **sin acción (preexistente, por diseño)** | `electron/utils/resumen-caja.utils.ts` (sin cambios en PR2) lista solo retiros `origen: MANUAL`: el retiro del cierre no se descuenta del esperado. Viene de develop (`2504b928` «considerar retiros manuales en el esperado del cierre»). Mostrar el retiro de cierre como línea informativa aparte sería un issue separado |
| «SIN RETIROS REGISTRADOS» en el resumen previo al cierre | **sin acción (preexistente)** | En `create-caja-dialog.component.html` es un **placeholder estático**, no lee datos. El retiro del cierre (`generarRetiroDelCierre`) se genera **después** de confirmar, por el **total de efectivo contado** en el conteo de cierre (sin restar fondo); con conteo de cierre en 0 no hay retiro, que es lo que pasó en la caja #1 del sandbox (conteo de cierre sin detalles) |

### Riesgos de la auditoría MOTOR-UI: qué pasó con cada uno

- **R-A (Postgres sin verificar)** — **cerrado**: `test:locks-pg` corrió contra Postgres 17 real, 33/0, más los bloques F5–F7 nuevos. Queda la deuda de CI (D2).
- **R-B (`withAperturaCajaLock` sin timeout)** — **abierto, aceptado**. No se agregó `lock_timeout`/`Promise.race`; es deuda anotada, fuera del alcance de la ronda de fixes.
- **R-C (D4 cambia el flujo con dos cajas ABIERTAS)** — **documentado**, que es lo que pedía la auditoría: cobrar desde el PdV de hoy una cuenta de **otra caja abierta** acredita la plata a la caja de la venta. Está en el manual (`manual-usuario/06-pdv-uso-diario.md`) y en `domains/ventas-pdv.md`.
- **R-D (fail-open del front)** — **abierto por diseño**, documentado en el código y en la skill: bloquear el cobro porque no se pudo confirmar un estado deja el local sin facturar.
- **R-E (el índice puede no existir y nadie se entera)** — **abierto**: es Q4, decisión de Gabriel. Queda el `console.error` + el reintento de arranque, anotado en `todos-pendientes.md`.
- **R-F (orden de mensajes en `createPago`)** — **abierto, aceptado**: cobrar un delivery de una caja cerrada **de otra terminal** devuelve primero «el cobro se hace en X». Las dos cosas son verdad; el mensaje manda a la terminal equivocada pero no autoriza nada.

### Decisión de producto abierta para Gabriel — mesas abiertas al cerrar la caja

Sale de M3 y hay que decidirla antes de cerrar la deuda de la grilla. Hoy el backend **no deja cerrar una caja con ventas `ABIERTA`** (guard de `update-caja`), así que el cajero tiene que resolverlas antes; pero si la caja se cierra desde otra terminal mientras esas cuentas existían —o si quedaron de un cierre anterior—, las cuentas sobreviven en una caja cerrada y las salidas son dos: **transferirlas** (pasan a la caja activa, Q2) o **cancelarlas**. Alternativas a evaluar:

1. **Dejarlo como está** (transferir o cancelar, con el aviso de M3 en la cuenta seleccionada) y sumar la marca en la grilla de mesas.
2. **Avisar en el cierre**: listar las cuentas abiertas y ofrecer transferirlas/cancelarlas desde ahí, en vez de sólo bloquear el cierre.
3. **Reimputar automáticamente** las cuentas abiertas a la caja que quede activa al cerrar. Es lo más cómodo y lo más riesgoso: mueve cuentas entre arqueos sin que nadie lo decida.

La 1 es lo implementado; la 3 necesita política contable, no UI.
