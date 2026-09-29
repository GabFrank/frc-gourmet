# Auditoría del plan — `PLAN-caja-cerrada-guard.md`

> **Auditor: B — Correctitud contra código real / drivers / permisos / tests**
> **Modelo:** Claude Code (claude CLI local) — Opus 5 (1M context), id `claude-opus-5[1m]`
> **Fecha:** 2026-09-28
> **Commit auditado:** `be087b79` (rama `fix/caja-cerrada-guard`, base `a834cbef` = `v1.21.0-alpha.165`)
> **Método:** se abrió y leyó cada `archivo:línea` citado por el plan. Nada de lo que sigue viene de memoria de la skill; lo que no pude verificar está marcado como tal.

---

## Veredicto

### APROBADO CON CAMBIOS

El diagnóstico del plan es correcto y el inventario de canales es, en lo esencial, exacto: las **cinco** entidades con FK a `cajas` son las que dice, `pdv-egresos.validarCaja` ya exigía `ABIERTO`, `facturacion.handler.ts` no toca caja, y las ~35 referencias `archivo:línea` que verifiqué caen todas dentro de ±3 líneas. La arquitectura del fix (helper central, guard dentro de la transacción, lock sólo en Postgres, índice parcial, `select: false`) es la correcta para este repo y sigue convenciones que ya existen.

Pero hay **dos hallazgos bloqueantes** que hay que incorporar al plan antes de implementar, porque si se implementa tal como está escrito:

1. **B1** — el escenario que originó el bug (los 52 cobros con `pago.caja = 122` sobre ventas de la #123) **sigue pasando**. La derivación de D4 depende de un campo `ventaId` que **ningún** call site del frontend manda hoy, y ninguna fase del plan lo agrega.
2. **B2** — el `SELECT … FOR UPDATE` de D10 sobre "las cajas abiertas del dispositivo" **no serializa nada** cuando no hay filas (Postgres no toma gap locks en READ COMMITTED). La afirmación de D9 —"si el índice no se crea queda el guard transaccional, que en Postgres es suficiente"— es falsa, y se combina con B4 (el índice puede quedar sin crear para siempre).

Los demás hallazgos son correcciones de alcance, de riesgo mal estimado, o precisiones sobre transportes y tests.

---

## Tabla de hallazgos

| # | Sev. | Título |
|---|---|---|
| B1 | **BLOQUEANTE** | D4 no funciona con el frontend real: `createPago` nunca recibe `ventaId` |
| B2 | **BLOQUEANTE** | El `FOR UPDATE` de la apertura (D10) no protege nada; D9 da una garantía falsa |
| B3 | ALTA | `update-caja` no es transaccional hoy; meterle el lock arrastra el retiro de cierre y el WhatsApp adentro |
| B4 | ALTA | La migración con `return` temprano deja el índice sin crear **para siempre** |
| B5 | ALTA | Inventario de fuga incompleto: falta `caja.createdBy` en `getVentasByDateRange` (y `delivery-listar-pdv` entero) |
| B6 | MEDIA | D11: en **modo cliente** no llega ni el IPC ni el SSE; y el SSE del PdV desktop no conecta en **ningún** modo |
| B7 | MEDIA | `aceptar-pedido-online` se traga el error → pedido aceptado sin venta, invisible |
| B8 | MEDIA | `updateCaja` tiene **3** llamadores, no 2 |
| B9 | MEDIA | Cerrar una caja ya cerrada va a dejar `Conteo` + `ConteoDetalle` huérfanos (desktop y PWA) |
| B10 | MEDIA | `asegurarCajaAbierta` ⟂ `inicializarCaja`: el camino "no hay caja" no es esperable (`subscribe`, no `await`) |
| B11 | MEDIA | Reentrancia: 6 disparadores del mismo aviso, sin flag ni `distinctUntilChanged` |
| B12 | MEDIA | Tests de permisos: el patrón sirve, pero el plan no dice cómo, y el cache de permisos (TTL 30 s) puede falsear el assert |
| B13 | BAJA | `openUtilitarios` y `getVenta` no son `async`; D12 les cambia la firma |
| B14 | BAJA | `cajas` no tiene columna `seq` y `MesaEventPayload.seq` es obligatorio |
| B15 | BAJA | D13: `getPdvConfig()` puede devolver array |
| B16 | BAJA | Asimetría de permisos `create-caja` (OPERAR) vs `abrir-caja-desde-conteo` (GESTIONAR) sin decidir |
| B17 | BAJA | `anular-gasto-caja` / `edit-gasto-caja` cargan el gasto sin la relación `caja` |
| B18 | BAJA | §14 ítem 5 se puede cerrar: `transferir-venta-pdv` **sí** tiene `ensurePermission` |
| B19 | BAJA | `editarGasto` del resumen está gateado en el front por `GESTIONAR`; el back va a exigir `AJUSTAR` |

---

## B1 — BLOQUEANTE · D4 no funciona con el frontend real

**El plan dice** (D4, línea 145): *"Si el payload trae `ventaId` (lo agrega el diálogo de cobro): resolver `caja` server-side desde `venta.caja`"*. Y el criterio de aceptación de la Fase 1: *"`createPago({ ventaId, caja: <otra caja> })` persiste el `Pago` con la caja de la **venta**"*. Test #9 de `test:caja-cerrada` depende de lo mismo.

**Evidencia — ningún call site manda `ventaId`, y el plan no agrega ninguno:**

| Call site | Payload real |
|---|---|
| `src/app/shared/components/cobrar-venta-dialog/cobrar-venta-dialog.component.ts:908-912` | `{ estado, caja: this.data.caja, activo, validarDispositivoCaja: true }` |
| `cobrar-venta-dialog.component.ts:1088-1093` (ajuste descuento/aumento) | ídem |
| `src/app/pages/ventas/pdv/pdv.component.ts:2364-2369` (cobro rápido F2) | `{ estado, caja: this.caja!, activo, validarDispositivoCaja: true }` |
| `src/app/shared/components/pago-dialog/pago-dialog.component.ts:766` | pago de compra — sin caja de venta, fuera de alcance |
| `src/app/pages/pagos/pagos/create-edit-pago.component.ts:500` | ídem |

Y `electron/handlers/compras.handler.ts:1411-1426` persiste `pagoData.caja` tal cual (sólo descarta `validarDispositivoCaja`).

La Fase 1 (§6) sólo toca `electron/`. La Fase 3 lista `utilitarios-dialog`, `list-cajas`, `resumen-caja-dialog`, `gasto-caja-dialog`, `create-retiro-caja-dialog` y la PWA — **no** `cobrar-venta-dialog.component.ts` ni el bloque de `cobroRapido`.

**Por qué es bloqueante y no cosmético.** `this.data.caja` del `cobrar-venta-dialog` es **la caja del PdV**, no la de la venta: el diálogo la recibe de `pdv.component.ts` (`this.caja`). Ese es exactamente el objeto colgado del bug. En el escenario real del informe —PdV pegado a la #122 cerrada cobrando ventas de la #123 abierta, y su simétrico— el guard de la rama 2 de D4 mira `pagoData.caja`:

- Si la caja del PdV está **cerrada** → rechaza. Bien, pero eso ya lo cubre D12 desde el front.
- Si la caja del PdV está **abierta** y la venta es de otra caja (delivery pendiente de otro turno, `delivery.handler.ts:180-226` con `otraCaja` en `:225`; venta de mesa de la caja vieja; reapertura del diálogo de cobro) → **el guard pasa y el `Pago` se escribe con la caja equivocada, igual que hoy.**

O sea: la Fase 1 sola **no cierra la causa C** del propio plan (§1, tabla, fila C). Sólo cierra la B.

**Propuesta concreta (dos partes, las dos necesarias):**

1. **Mover a la Fase 1** la edición del frontend: agregar `ventaId: this.data.venta.id` en `cobrar-venta-dialog.component.ts:908` y `:1088`, y `ventaId: venta.id` en `pdv.component.ts:2364`. Son parte del fix de raíz, no de la capa de UI.
2. **Agregar una derivación server-side que no dependa del cliente**, porque §9 ("cliente nuevo contra servidor viejo / viejo contra nuevo") admite explícitamente clientes desactualizados: en `updateVenta`, cuando `data.pago` se asigna a una venta, resolver `venta.caja` server-side y **sobrescribir `pago.caja`** con ella (+ `assertCajaAbierta`). Los tres caminos llaman `updateVenta(ventaId, { pago })` **inmediatamente después** del `createPago` — `cobrar-venta-dialog.component.ts:916-918`, `:1094-1096`, `pdv.component.ts:2380` — así que la ventana de inconsistencia es de milisegundos y se cierra sin tocar el renderer. Esto es lo que hace el fix robusto contra el desktop empaquetado viejo en `mode=client`, que es justamente el caso que §9 no puede mitigar.

Nota menor derivada: `createPago` ya hace `Venta.findOne({ where: { pago: { id } } })` después del save (`compras.handler.ts:1428-1436`) y siempre devuelve `null` para un pago nuevo — confirma que el `Pago` nace antes que el vínculo. La pregunta 3 del encargo ("¿cómo se vincula Pago↔Venta?") queda respondida: **el Pago se crea primero y la Venta lo adopta después**; no hay forma de derivar la caja en `createPago` sin que el cliente mande el `ventaId`.

---

## B2 — BLOQUEANTE · El `FOR UPDATE` de la apertura no protege nada

**El plan dice** (D10.2): *"Guard + `save` dentro de `dataSource.transaction(...)`, con `SELECT … FOR UPDATE` sobre las cajas del dispositivo en Postgres"*. Y D9: *"**Qué pasa si el índice no se crea:** queda el guard transaccional de D3/D10, que en Postgres es suficiente (el `FOR UPDATE` serializa)."*

**Refutación.** El guard de apertura es `repo.count({ where: { dispositivo, estado: ABIERTO } })` (`electron/handlers/financiero.handler.ts:667-676`). En el caso que importa —el dispositivo **no** tiene caja abierta— ese `SELECT … FOR UPDATE` matchea **cero filas**. Postgres en `READ COMMITTED` no toma gap locks ni predicate locks: dos transacciones concurrentes leen cero las dos, las dos pasan el guard, y las dos insertan. Lo único que evita la doble apertura es el **índice único parcial**.

Consecuencia combinada con **B4**: si el pre-chequeo de duplicados aborta la creación del índice en una instalación, esa instalación queda **sin ninguna defensa** contra la doble apertura, y el plan afirma lo contrario.

En SQLite el argumento del plan ("un solo escritor") es correcto *dentro de un proceso* —el driver `sqlite3` de este repo (`package.json:164`, `database.config.ts:389`) usa una sola conexión y TypeORM serializa los query runners sobre ella— pero no entre dos instancias de Electron abiertas contra el mismo archivo. Ahí también el índice es la única defensa.

**Propuesta:**

- Reescribir D9 ("Qué pasa si el índice no se crea") diciendo la verdad: **sin el índice no hay defensa real contra la apertura concurrente**; el guard `count`+`save` sólo cubre la carrera lenta (dos clicks separados por más que la duración de la transacción).
- Reescribir D10.2: el `FOR UPDATE` sobre las cajas del dispositivo se deja porque **sí** sirve en el caso "ya hay una abierta" (bloquea a un cierre concurrente mientras se decide), pero **no** cierra la carrera de doble apertura. El que la cierra es el índice + la traducción del 23505 de D10.3, que pasa de "cinturón sobre los tirantes" a **control primario**.
- Elevar la prioridad del caso 1 y 2 de `test:locks-pg` (§11): son los únicos discriminantes reales de este invariante. El caso 4 de `test:caja-apertura` (`Promise.all` en SQLite) el plan ya lo admite como no discriminante — está bien admitido, pero entonces **no debería figurar como criterio de aceptación de la Fase 2** ("Dos `create-caja` concurrentes… uno gana, el otro recibe `CAJA_ABIERTA_DUPLICADA`"), porque en SQLite pasa aunque el fix no exista.

---

## B3 — ALTA · `update-caja` no es transaccional hoy

`electron/handlers/financiero.handler.ts:686-754` no abre ninguna transacción: es `findOne` → guards → `merge` → `save`, y después, **fuera de todo**, `generarRetiroDelCierre(dataSource, id, …)` (`:739`) y un `setImmediate` que dispara `enviarCierreCajaWhatsapp` (`:746-749`).

D3 pide `pessimistic_write` sobre la fila al cerrar, y D7 agrega dos reglas más. Eso obliga a envolver el handler en `dataSource.transaction(...)`, y ahí aparece el problema: `generarRetiroDelCierre` recibe **el `DataSource`**, no un `EntityManager` (`electron/handlers/retiro-cierre.util.ts:20-23`), y adentro toma cuatro repositorios del data source (`:24`, `:35`, `:67`, y el `save` de `:87`), incluido un `cajaRepo.findOne` sobre la misma fila que la transacción externa tendría bloqueada con `FOR UPDATE`. En Postgres eso es una **lectura desde otra conexión**: no se bloquea (un `SELECT` plano no espera a un `FOR UPDATE`), pero lee el estado **pre-commit**, o sea la caja todavía `ABIERTO`, y genera el retiro contra un `conteoCierre` que la transacción externa aún no comiteó → `generarRetiroDelCierre` devolvería `null` ("caja sin conteo de cierre") y **el retiro automático del cierre dejaría de generarse**. Eso rompe un flujo legítimo diario (R1 del plan, no contemplado en esta forma).

**Propuesta:** escribir explícitamente en D3/D7 el alcance de la transacción:

```
dataSource.transaction(async (manager) => {
  lock FOR UPDATE sobre cajas.id (sin relations)
  guard estado / permisos / ventas abiertas
  merge + save
})
// ── fuera de la transacción, después del commit ──
if (seEstaCerrando) { generarRetiroDelCierre(dataSource, id, uid); setImmediate(whatsapp); }
```

Y agregar al §11 un assert de que **cerrar una caja sigue generando el `RetiroCaja` de origen `CIERRE`** (el test #13 lo menciona de pasada; que sea un assert propio, porque es la regresión que este cambio puede introducir). El §14 debería además listar "el orden exacto commit ↔ retiro de cierre" como algo a validar en implementación.

---

## B4 — ALTA · La migración deja el índice sin crear para siempre

§7: si el pre-chequeo encuentra duplicados, hace `return` sin crear el índice. Pero TypeORM marca la migración como ejecutada en la tabla `migrations` igual (el `up()` no lanzó). La mitigación del log —*"Cerrá manualmente las sobrantes y volvé a aplicar"*— **no existe operativamente**: no hay nada que la vuelva a aplicar. R5 del plan dice "la migración no crea el índice y nadie se entera", pero subestima: el problema no es que nadie lea el log, es que **aunque lo lean y arreglen los duplicados, el índice no se crea nunca**.

El repo corre `ds.runMigrations({ transaction: 'each' })` en `src/app/database/database.service.ts:76`, una vez por arranque, sólo las pendientes.

**Propuesta:** dejar la migración como está (primer intento, best-effort) y agregar un **chequeo idempotente de arranque**: una función `asegurarIndicesOpcionales(ds)` llamada desde `DatabaseService` después de `runMigrations`, que intente el `CREATE UNIQUE INDEX IF NOT EXISTS` en cada boot y loguee si no pudo. Cuesta una query por arranque, es driver-agnóstico (la sentencia ya lo es) y convierte "arreglá los duplicados" en una instrucción que funciona. De paso, responde **Q4** sin necesidad de decidir la tarjeta roja en *Sistema*: si el índice se crea solo en cuanto el operador limpia, el aviso visible pasa a ser un nice-to-have.

Verificado y OK del resto de §7:
- `1790617935368` = **2026-09-28 17:52:15 UTC**, epoch-ms real (el reloj de la máquina daba `1790618606765` al momento de esta auditoría) y **mayor** que la última registrada, `1789587049751` (2026-09-16). ✅
- `getMigrations()` (`src/app/database/database.config.ts:644-651`) elige la baseline por driver y devuelve **un solo array de incrementales común a los dos**, así que agregar al final alcanza y corre en ambos. ✅
- `Caja.estado` es `@Column({ type: 'varchar', enum: CajaEstado })` (`src/app/database/entities/financiero/caja.entity.ts:37-42`), **no** un enum nativo de Postgres → el predicado `WHERE "estado" = 'ABIERTO'` es un literal de texto válido e inmutable en los dos drivers. ✅ Las comillas dobles son el quoting estándar de SQLite también. ✅ (R9 del plan queda cubierto por construcción.)

---

## B5 — ALTA · Inventario de fuga incompleto

**`getVentasByDateRange` hidrata TRES `Usuario`/`Persona`, no dos.** El plan (D14) lista `venta.createdBy` (`:1088-1089`) y `cliente.persona` (`:1086-1087`). Falta:

```
electron/handlers/ventas.handler.ts:1082   .leftJoinAndSelect('caja.createdBy', 'cajaCreatedBy')
electron/handlers/ventas.handler.ts:1083   .leftJoinAndSelect('cajaCreatedBy.persona', 'cajaCreatedByPersona')
```

Con `select: false` el hash desaparece, pero **el assert #2 de `test:sin-fuga-datos`** ("esas respuestas no contienen `documento`, `telefono`, `direccion`, `email` ni `fechaNacimiento` de la `Persona` del usuario") **falla**, porque la persona del cajero que abrió la caja sigue viniendo entera por este join.

**`delivery-listar-pdv` no está en los 10 canales y debería.** `electron/handlers/delivery.handler.ts:190-193` hace `leftJoinAndSelect` de `delivery.cliente` → `cliente.persona` **y** de `delivery.entregadoPorFuncionario` (`Funcionario`: `salarioBase`, `valorJornal`, `numeroIps`, `cuentaBancariaPropia`) → `repartidor.persona`. Es exactamente el patrón que `getVentasByDateRange` ya corrigió en `:1106-1108` y que la skill documenta como lección de la sesión 2026-08-28. Es un canal del dominio caja que el PdV invoca en cada apertura del diálogo de delivery.

**Propuesta:** agregar las dos filas a la tabla de D14 (`ventas.handler.ts:1082-1083` y `delivery.handler.ts:190-193`) y al §12 paso 15. Si `delivery-listar-pdv` se considera fuera de alcance, decirlo explícitamente en el "queda fuera de este PR" en vez de omitirlo.

**Lo que sí verifiqué y está bien:**
- Los **7 lectores** de `usuario.password` son exactamente esos, y no hay ninguno más: `auth.handler.ts:35` (login), `:102` (`validate-credentials`), `electron/server/auth-routes.ts:65` (login HTTP), `personas.handler.ts:327` (`change-password`), `onboarding-tasks.config.ts:57`, `seed-system.ts:97`, `migrate-passwords.ts:12-17`. ✅
- **No hay lectores en `src/`, `projects/` ni SQL crudo** sobre la columna (sólo las baselines la declaran, y `create-edit-usuario.component.ts:282-294` la *escribe* y ya hace `delete formData.password` si está vacía). ✅ Cierra el ítem 7 de §14 del plan.
- Las rutas de **refresh** (`auth-routes.ts`) y **`password-recovery.handler.ts`** **no leen** `usuario.password`: recovery sólo escribe (`:189`). ✅ `pedidos-online-auth.handler.ts` es otra tabla (`CuentaCliente.passwordHash`). ✅
- Los tres sanitizadores `{ ...user, password: undefined }` (`auth.handler.ts:77`, `:168`, `:207`, `personas.handler.ts:341`) siguen funcionando con `select: false` (el spread simplemente no trae la clave). ✅
- **Writes sobre entidad cargada sin la columna** (riesgo R3): son `personas.handler.ts:265` (`updateUsuario`), `:332` (`change-password`) y `password-recovery.handler.ts:189`. El plan lista dos de los tres — falta `personas.handler.ts:265`. Agregarlo al test.

---

## B6 — MEDIA · D11: el mapa de transportes está mal en dos casillas

La tabla de "orden de defensas" (D11) dice que el IPC `mesa-updates` cubre **"los 3"** modos y que el SSE cubre "tablets/PWA · server".

**Casilla 1 — modo cliente: no llega nada.** `broadcastMesaEvent` (`electron/utils/mesa-events.utils.ts:44-53`) hace `BrowserWindow.getAllWindows()` → `webContents.send('mesa-updates', …)` **en el proceso que ejecuta el handler**. En `mode=client` los handlers corren en el **servidor** (preload `invokeRouter` rutea por HTTP), en otra máquina: el desktop cliente no recibe ningún IPC. Y tampoco SSE (ver casilla 2). En modo cliente el PdV queda **sólo** con revalidación por foco/acción/polling — que es aceptable, pero hay que decirlo.

**Casilla 2 — el SSE de mesas del PdV desktop no conecta en NINGÚN modo.** `pdv.component.ts:3205-3206` arma `const url = \`/api/pdv/mesas/stream?token=…\`` — **relativa**. El renderer del desktop carga `http://localhost:4201` en dev (`main.ts:728`) o `file://` empaquetado (`main.ts:733`). No hay `proxy.conf.json` en el repo ni `proxyConfig` en `angular.json`, así que en dev resuelve contra el dev-server de Angular (404) y empaquetado contra `file:///api/...` (error). El SSE de mesas funciona sólo para `/admin` y la PWA, que se sirven desde el mismo origen que Fastify.

Esto **no invalida el diseño** —el plan ya activa el IPC porque el SSE no alcanzaba— pero sí invalida dos textos:

- La nota de D11 (línea 240) dice *"En **standalone**, el `EventSource` … falla y el PdV cae al polling"*: es cierto, pero pasa **también en server y en client**. La causa no es que Fastify no esté levantado, es el origen del renderer.
- El criterio de aceptación de la Fase 3 y el **paso 2 del §12** (*"En modo server: aviso inmediato «Esta caja ya fue cerrada» (SSE)"*) van a verificar algo que en realidad llega por IPC. Si alguien quiere probar el camino SSE de verdad, tiene que hacerlo desde `/admin` o la PWA, no desde la ventana de Electron.

**Propuesta:** corregir la tabla (IPC → `standalone` y `server`; SSE → `/admin` y PWA), corregir el paso 2 del §12 para que diga "por IPC" en el desktop y agregar un paso separado desde `/admin`, y agregar una fila de riesgo: **en `mode=client` no hay notificación instantánea posible sin trabajo extra** (un endpoint de eventos del que el cliente se suscriba con URL absoluta a `settings.network.serverUrl`). Si eso es aceptable, decirlo; si no, es scope nuevo.

Lo que sí verifiqué de D11 y **es correcto**:
- `grep -rn "mesa-updates" preload.ts src/ projects/ electron/` → **cero consumidores**; el canal es código muerto. ✅
- El SSE de `/api/pdv/mesas/stream` (`electron/server/mesa-sse-routes.ts:42-48`) reenvía **todo** lo que pasa por `mesaEvents`, sin filtrar por `tipo` ni por mesa → un `CAJA_CAMBIO` llegaría a `/admin` y a la PWA sin tocar el endpoint. ✅
- El `onmessage` del PdV (`pdv.component.ts:3218-3231`) filtra por `payload.tipo` y descarta lo desconocido → un cliente viejo ignora `CAJA_CAMBIO` sin romperse. ✅ (§9 correcto.)
- `onComandaEvent` (`preload.ts:4398-4402`) es el patrón exacto a copiar. ✅

---

## B7 — MEDIA · `aceptar-pedido-online` se traga el `CAJA_CERRADA`

`electron/handlers/pedidos-online-admin.handler.ts:147-160`:

```ts
try {
  const mat = await materializarPedidoOnlineEnVenta(dataSource, saved.id, data?.cajaId ? {...} : undefined, ...);
  ventaId = mat?.ventaId ?? null;
} catch (e) {
  errorMaterializacion = …;
  console.warn('[aceptar-pedido-online] materialización falló:', errorMaterializacion);
}
// … return { success: true, … }
```

Es best-effort **a propósito** (el comentario lo dice: *"un problema de caja no debe deshacer la aceptación, que ya es visible para el cliente"*). Con el guard de §5.1, aceptar un pedido contra una `cajaId` cerrada deja el pedido **ACEPTADO sin `Venta`**: no entra al tablero del PdV, no se puede cobrar ni imprimir, y el cliente ya fue notificado. Es el mismo modo de falla que el plan cita como lección de `delivery-listar-pdv` ("bloquearlo deja deliveries colgados para siempre").

**Propuesta:** agregar a §5.1 una nota para `materializarPedidoOnlineEnVenta`: cuando el rechazo sea `CAJA_CERRADA`, **reintentar con la única caja abierta** (el camino `:252-255` ya filtra por `ABIERTO` y es seguro), y sólo si tampoco hay, devolver `errorMaterializacion` con el texto en español para que la bandeja lo muestre. Y sumar el caso al §12 y a `test:pedido-online-materializacion`.

Nota: el otro llamador, `src/app/pages/ventas/pedidos-online/list-pedidos-online.component.ts:88`, invoca `materializar-pedido-online-en-venta` **sin `opts`** → usa la única abierta, no una caja rancia. Y `pedidos-online-pedidos.handler.ts:480` (alta pública) tampoco pasa `cajaId`. O sea que el único camino con `cajaId` explícito es el de `aceptar-pedido-online`, y el `cajaId` lo elige el cliente. Bien acotado el riesgo, pero hay que tratarlo.

---

## B8 — MEDIA · `updateCaja` tiene 3 llamadores

D7 afirma: *"Verificado: los únicos llamadores de `updateCaja` son `create-caja-dialog.component.ts:1323` y `projects/mobile/.../caja-cerrar.page.ts:96`"*. Hay un tercero:

```
src/app/shared/components/cierre-caja-dialog/cierre-caja-dialog.component.ts:112
  await firstValueFrom(this.repositoryService.updateCaja(this.data.caja.id, {
    estado: CajaEstado.CERRADO, fechaCierre: new Date(), conteoCierre: conteo,
  }));
```

Hoy es **código muerto** (`grep -rn "CierreCajaDialogComponent" src/ projects/` devuelve sólo su propia definición), pero compila y está en `shared/`, así que es un candidato a ser cableado por cualquiera. Si D7 va a describir el conjunto de llamadores, que sea el real.

**Propuesta:** corregir la afirmación, y aprovechar: o se borra el componente en este PR (está muerto y duplica el flujo de cierre), o se le aplica el mismo tratamiento de revalidación de B9. Recomiendo borrarlo — menos superficie para el próximo bug de caja.

(`src/app/database/repository-http.service.ts:384` también "llama" a `updateCaja`, pero es el esqueleto histórico que lanza "no implementado"; `app.module.ts:85-95` documenta que en los tres modos se usa `RepositoryIpcService`. No es un llamador real. ✅ Y eso también confirma que `getCaja` de D12 funciona en modo cliente, vía el monkey-patch del preload.)

---

## B9 — MEDIA · Conteos huérfanos al cerrar una caja ya cerrada

Los dos flujos de cierre **crean el `Conteo` y todos sus `ConteoDetalle` ANTES** de llamar `updateCaja`:

- `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts:1255-1325` (crea el conteo de cierre, después los detalles, y recién en `:1316-1325` el `updateCaja`).
- `projects/mobile/src/app/pages/financiero/cajas/caja-cerrar.page.ts:86-99` (idem, `createConteo` → N × `createConteoDetalle` → `updateCaja`).

Hoy eso no deja basura porque `update-caja` acepta CERRADO→CERRADO. Con la regla 1 de D7, **cada intento de cerrar una caja ya cerrada va a dejar un conteo + sus detalles huérfanos** en la base — que además son lo que `computeResumenCaja` y `generarRetiroDelCierre` buscan por FK, así que no son inertes.

Además, **el orden de los dos rechazos de D7 importa**: si el `ensurePermission('FINANCIERO_CAJA_AJUSTAR')` (regla 2) corre antes que el rechazo CERRADO→CERRADO (regla 1), un cajero que cierra dos veces recibe `PERMISO REQUERIDO: FINANCIERO_CAJA_AJUSTAR` en lugar de "la caja #N ya fue cerrada el …", que es incomprensible. El plan no fija el orden.

**Propuesta:** (a) fijar en D7 que la regla 1 se evalúa **antes** que la 2; (b) extender la revalidación de D12 al diálogo de Financiero › Cajas y a la página de la PWA: leer `get-caja` al abrir y, si ya está `CERRADO` y no es modo ajuste, mostrar el estado de error **antes** de crear ningún `Conteo` (el plan ya prevé el estado de error en `create-caja-dialog.component.ts:144-149`; falta decir que el chequeo va contra el backend, no contra el objeto que llegó por `MAT_DIALOG_DATA`); (c) agregar al §12 paso 7 el assert de que **no** quedó un conteo nuevo en la base.

---

## B10 — MEDIA · `asegurarCajaAbierta` vs. el camino "no hay caja" de `inicializarCaja`

D12 paso 1: *"Si `!this.caja` → `await this.inicializarCaja()`; devuelve `!!this.caja`"*. Paso 3: *"`this.caja = null`, `await this.inicializarCaja()`, devuelve `false`"*.

`inicializarCaja()` (`pdv.component.ts:327-354`) **no es esperable en todos sus caminos**:

| Caminos | ¿espera? |
|---|---|
| 1 caja abierta (`:336-337`) | sí, `aplicarCajaSeleccionada` es síncrono |
| varias (`:339-343`) | sí, `await firstValueFrom(dialogRef.afterClosed())` |
| **ninguna** (`:352` → `ofrecerAbrirCaja(true)`, `:357-405`) | **no** — usa `afterClosed().subscribe(...)` y la función retorna al instante |

Resultado: en el camino más probable después de un cierre (no queda ninguna caja abierta), `await this.inicializarCaja()` devuelve con `this.caja === null`, `asegurarCajaAbierta` devuelve `false`, y **la acción del cajero se descarta en silencio** aunque un segundo después abra la caja nueva en el diálogo que quedó arriba.

**Propuesta:** convertir `ofrecerAbrirCaja` en `async` que devuelva la caja resuelta (mismo patrón que `:342-343`), que `inicializarCaja` la `await`ee, y que `asegurarCajaAbierta` reintente la operación original si al volver hay caja. Si se prefiere no reintentar, al menos mostrar un aviso explícito ("abrí la caja y volvé a intentar") en vez de no hacer nada.

---

## B11 — MEDIA · Reentrancia y doble diálogo

D12 se dispara desde **seis** lugares: `window:focus`, `document.visibilitychange`, `tabsService.activeTab$`, el IPC `CAJA_CAMBIO`, el `onmessage` del SSE y el fallback de polling de 15 s (`pdv.component.ts:3328-3341`). El plan no define ninguna protección; R6 sólo cubre el loop por error de red.

Dos escenarios concretos:

1. Cerrar la caja desde otra tab del mismo Electron: llega el IPC **y** el `activeTab$` al volver a la tab **y** el `window:focus` → tres `ConfirmationDialogComponent` encadenados sobre el mismo hecho, y tres `inicializarCaja()` compitiendo (el tercero puede pisar la caja que el primero acaba de resolver).
2. `activeTab$` es un `BehaviorSubject` (`src/app/services/tabs.service.ts:20`, expuesto en `:28`): **emite al suscribirse**. Si la suscripción se arma en `ngOnInit`, va a disparar una revalidación inmediata además de la de `inicializarCaja`, en el arranque de cada PdV.

**Propuesta:** agregar a D12 un guard de reentrancia explícito —`private revalidandoCaja = false` + `private avisoCajaCerradaAbierto = false`— y que la suscripción a `activeTab$` use `.pipe(distinctUntilChanged(), filter(id => id === 'pdv'), skip(1))`. Y que la limpieza de `ngOnDestroy` (`:638-650`, no `:639`) incluya el `unsubscribe` del IPC y del `activeTab$`; hoy sólo limpia el SSE y cuatro timers.

Sobre el **fail-open** de D12 ante error de red: **estoy de acuerdo**, y el argumento del plan es correcto — el backend tiene la última palabra (D3) y bloquear el cobro porque no se pudo confirmar un estado deja al local sin facturar. Vale la pena agregar en el plan que el fail-open es seguro **precisamente porque** el guard de Fase 1 es server-side y no opt-in; si alguna vez se degrada el guard backend (R2: "se degrada a lectura sin lock"), el fail-open del front deja de ser gratis.

---

## B12 — MEDIA · Tests: sí se puede variar el usuario, pero no como sugiere el plan

Pregunta del encargo: *"¿el patrón `scripts/test-terminal-caja-e2e.ts` permite invocar handlers con usuario/permisos distintos?"*

**Sí, por dos vías, y el plan no dice ninguna.** El harness fija el usuario al registrar (`scripts/test-terminal-caja-e2e.ts:110-112`: `registerVentasHandlers(ds, () => cajero)`), y los handlers se registran una vez.

- **(a) closure mutable:** `let actual: any = cajero; registerFinancieroHandlers(ds, () => actual);` y después `actual = gerente`.
- **(b) `withRequestUser`:** `electron/utils/auth.utils.ts:65-67` lo exporta, y la resolución de autorización lo lee **antes** que el `getCurrentUser` global. Es lo que ya hace el `rpc-router` para cada request HTTP, así que ejercita el camino real de `/api/rpc`. Prefiero (b).

⚠️ **Trampa que hay que documentar en §11:** el cache de permisos es por `usuarioId`, con TTL de 30 s (`auth.utils.ts:36-43`). Una suite que le agrega o le quita `FINANCIERO_CAJA_AJUSTAR` al **mismo** usuario entre dos asserts va a leer el set viejo y el test va a pasar (o fallar) por el cache, no por el fix. Hay que llamar `clearPermissionCache()` entre asserts, o usar **dos usuarios distintos** (uno con el permiso y uno sin). El assert #13 de `test:caja-cerrada` ("sin el permiso → rechazo") es exactamente el que se puede falsear así.

**Sobre `run-all-tests.js`: el plan tiene razón.** `scripts/run-all-tests.js:31-34` toma todo `test:*` de `package.json` que contenga `ts-node`, excluyendo cuatro — las tres suites nuevas se recogen solas con sólo registrarlas. ✅

**Tests que faltan, ordenados por el riesgo R1 (bloquear una operación legítima):**

| Riesgo | Test que falta |
|---|---|
| Retiro automático del cierre (B3) | `update-caja(CERRADO)` genera el `RetiroCaja` origen `CIERRE` **después** del commit, con el `conteoCierre` visible. Es la regresión más probable del PR |
| Cobro de una venta **ABIERTA** de la **caja actual** | Assert positivo explícito: crear caja → venta ABIERTA → `createPago` + `createPagoDetalle` + `updateVenta(CONCLUIDA)` **sin ningún rechazo**. El §11 sólo tiene asserts negativos sobre caja cerrada; sin el positivo, un guard demasiado agresivo pasa la suite |
| Mesas abiertas por mozos desde la PWA | `createVenta` con `caja` abierta desde un `deviceId` ajeno (el harness ya sabe hacerlo, `comoTerminal`) sigue funcionando con el guard nuevo |
| Pedidos online materializados (B7) | `aceptar-pedido-online` con caja cerrada: assert de qué pasa (hoy: `success:true` + venta perdida) |
| Cobro de un delivery pendiente de otra caja | El caso de la Q1, en las dos ramas de la decisión |
| **B1** | Assert de que `pago.caja === venta.caja` tras el cobro completo desde el flujo real (crear pago + vincular venta), no sólo con `ventaId` sintético |
| Lock en SQLite | Llamar `leerEstadoCaja(ds, id, { lock: 'read' })` **en SQLite** y verificar que la rama de driver lo omite. El repo tiene dos comentarios contradictorios sobre si el driver ignora o rechaza el lock (`ventas.handler.ts:2943` dice "no está soportado"; `pago-consolidado-adapters.ts:123-125` dice "su driver ignora los locks"). Un assert lo cierra |

---

## B13..B19 — Hallazgos menores

**B13 (BAJA).** `openUtilitarios(): void` (`pdv.component.ts:2537`) y `getVenta(): Promise<Venta>` (`:1983`, no `async`) cambian de firma con D12. `getVenta` tiene varios llamadores — verificar que todos lo `await`ean antes de convertirlo. Listarlo en la Fase 3.

**B14 (BAJA).** `MesaEventPayload.seq` es **obligatorio** (`electron/utils/mesa-events.utils.ts:22-28`) y `emitMesaCambio`/`emitComandaCambio` lo sacan de la columna `seq` de la entidad (`mesa-emit.utils.ts:26-44`). **`cajas` no tiene columna `seq`** (`caja.entity.ts`). Definir en D11 que `CAJA_CAMBIO` va con `seq: Date.now()` y que el cliente **no** lo compara contra los seq de mesa/comanda (son secuencias distintas).

**B15 (BAJA).** El snippet de D13 hace `this.pdvConfig?.inicioJornadaHora`. `getPdvConfig()` puede devolver un array: el propio `refrescarGateTerminal` hace `const config = Array.isArray(cfg) ? cfg[0] : cfg` (`pdv.component.ts:486-487`). Copiar esa normalización.

**B16 (BAJA).** `create-caja` exige `FINANCIERO_CAJA_OPERAR` (`financiero.handler.ts:662`) y `abrir-caja-desde-conteo` exige `FINANCIERO_CAJA_GESTIONAR` (`caja-mayor.handler.ts:1939`). D10 unifica la **conducta** de los dos pero el plan no dice nada de los permisos. Decirlo explícitamente ("no se unifican, y por qué") para que el auditor de la implementación no lo "arregle" de un lado o del otro. Relacionado: la PWA abre caja por `create-caja` (`projects/mobile/.../caja-abrir.page.ts:100-107`) y cierra por `update-caja` (`caja-cerrar.page.ts:96`), los dos con `FINANCIERO_CAJA_OPERAR` — coherente.

**B17 (BAJA).** §5.1 dice que en `anular-gasto-caja` y `edit-gasto-caja` "la caja se resuelve de `gasto.caja`", pero los dos cargan la entidad con `findOneBy({ id })` (`gastos-caja.handler.ts:59` y `:73`), **sin** la relación. Hay que agregar `findOne({ where, relations: ['caja'] })` o resolverla por SQL. Trivial, pero si no se escribe, el guard sale como no-op silencioso (exactamente el modo de falla que el comentario de `createPagoDetalle` en `compras.handler.ts:1490-1493` ya documenta para `pago.caja`).

**B18 (BAJA) — se puede cerrar un ítem de §14.** El punto 5 ("no leí si `transferir-venta-pdv` tiene `ensurePermission`") queda resuelto: **sí lo tiene**, `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` en `electron/handlers/ventas.handler.ts:3116`, primera sentencia del `try` (el handler empieza en `:3115`). Sacarlo de §14 y de la fila "a verificar" de §8.

**B19 (BAJA).** `resumen-caja-dialog.editarGasto` está gateado en el front por `this.permissionService.has('FINANCIERO_CAJA_GESTIONAR')` (`src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.ts:99`). Con D6, sobre caja cerrada el backend va a exigir además `FINANCIERO_CAJA_AJUSTAR`: un usuario con `GESTIONAR` y sin `AJUSTAR` ve el botón y come un rechazo. Agregar el chequeo al front (el rol GERENTE del seed tiene los dos — `electron/utils/seed-system.ts:497-499` — así que sólo afecta a roles custom, pero es una llamada de un minuto).

---

## Riesgos que el §10 del plan no lista

**RB-1 — Pérdida del retiro automático del cierre.** Probabilidad **media**, impacto **alto**. Es el corolario de B3: si `generarRetiroDelCierre` queda dentro de la transacción de `update-caja` (o lee desde otra conexión antes del commit), el cierre deja de generar el `RetiroCaja` FLOTANTE y toda la cadena de Caja Mayor se rompe en silencio (la función devuelve `null` sin lanzar, y el `catch` de `financiero.handler.ts:740-742` sólo loguea). Mitigación: el alcance de transacción de B3 + el test dedicado.

**RB-2 — Instalaciones sin índice y sin guard.** Probabilidad **baja**, impacto **alto**. Combinación de B2 + B4: una base con dos cajas `ABIERTO` en el mismo dispositivo nunca crea el índice, y el `FOR UPDATE` no la protege. Queda peor que hoy, porque el plan declara el problema resuelto. Mitigación: el chequeo idempotente de arranque de B4.

**RB-3 — El PR deja el bug original vivo y parece arreglado.** Probabilidad **alta si B1 no se corrige**, impacto **alto**. Los tests del §11 pasarían (el #9 se escribiría con `ventaId` sintético, que sí funciona server-side), el manual del §12 no tiene ningún paso que cobre una venta de **otra** caja abierta desde el PdV, y la evidencia de producción no se puede rehacer. Mitigación: B1 + el test de "cobro completo por el flujo real" de B12.

---

## Afirmaciones del plan verificadas OK

Lista corta de lo que abrí y confirmé sin reservas:

1. **Inventario de 5 entidades con FK a `cajas`** — `grep -rln "caja_id" src/app/database/entities/` devuelve 8 archivos; los 3 extra matchean `egreso_caja_id` (`pago-cuota-cpp-detalle.entity.ts:59`), `retiro_caja_id` (`retiro-caja-detalle.entity.ts:7`, `caja-mayor-movimiento.entity.ts:47`). Las 5 reales son las que dice el plan.
2. **`pdv-egresos.validarCaja` ya exige `ABIERTO`** — `electron/handlers/pdv-egresos.handler.ts:36-53`, chequeo en `:43-45`, y la usan los 5 canales citados. Vales y compras del cajón **no** estaban rotos.
3. **`facturacion.handler.ts` no menciona `caja`** — confirmado, fuera de alcance.
4. **Líneas de los canales de escritura:** `createVenta` `ventas.handler.ts:997` + transacción `:1029` + `withMesaLock` `:1071`; `updateVenta` FK cruda `:1383-1385`, gate `:1390-1396`; `cerrarVentasAbiertasMesa` `:881`, gate `:905-910`; `registrarCobroParcial` `:4506`, `VENTA_NO_ABIERTA` `:4526` (sobre `queryRunner.manager`); `materializarPedidoOnlineEnVenta` `:249-256` (el camino "única abierta" ya filtra `estado: ABIERTO`); `transferir-venta-pdv` `:3115`, `caja: ventaOrigen.caja` `:3024`; `createPago` `compras.handler.ts:1411`; `createPagoDetalle` `:1484`, resolución server-side `:1490-1503`; `cobrar-venta-credito` `cuentas-por-cobrar.handler.ts:819`, `venta.caja` `:850-852`, `Pago` `:903-906`; `delivery-crear` `delivery.handler.ts:267`, transacción `:298`; `create-gasto-caja` `gastos-caja.handler.ts:18`; `create-retiro-caja` `caja-mayor.handler.ts:1719`; `create-caja` `financiero.handler.ts:661`; `update-caja` `:686`; `abrir-caja-desde-conteo` `caja-mayor.handler.ts:1938`. **Todas correctas.**
5. **No falta ningún canal de escritura con caja.** El barrido de `caja: {`, `caja_id`, `cajaId` sobre `electron/handlers/`, `electron/utils/` y `electron/server/` no devuelve ningún escritor fuera de la tabla del plan. Los dos `caja: { id: cajaId }` de `ventas.handler.ts:307` y `:326` son las dos ramas de `materializarPedidoOnlineEnVenta` (QR_MESA y WEB/PICKUP), las dos ya cubiertas por el guard propuesto.
6. **D9 — el índice parcial es válido tal cual en los dos drivers**, porque `Caja.estado` es `varchar`, no un enum nativo de Postgres (`caja.entity.ts:37-42`).
7. **D9 — el timestamp** `1790617935368` es epoch-ms real (2026-09-28 17:52:15 UTC) y mayor que la última migración registrada, `1789587049751`.
8. **D9 — el precedente citado es real:** `src/app/database/migrations/1787255528889-IndicesRucYReconciliarMesas.ts:11-14` dice textualmente lo que el plan cita sobre no abortar el arranque.
9. **D11 — `mesa-updates` no tiene ni un consumidor**, `broadcastMesaEvent` hace `webContents.send` a todos los renderers, y el SSE **no filtra por tipo** (así que `CAJA_CAMBIO` llegaría a `/admin` y la PWA).
10. **D1 — los tres transportes degradan como dice el plan:** `mensajeDeError` `src/app/shared/utils/error-message.util.ts:14-21` saca el prefijo de IPC; `electron/server/rpc-router.ts:172-184` devuelve `500 { error: msg }` y sólo mapea `FORBIDDEN`/`UNAUTHORIZED`; `preload.ts:90-95` arma `HTTP 500: {"error":"…"}`. `String(e?.message).includes('CAJA_CERRADA')` funciona en los tres. El precedente de mapeo por código existe: `pdv.component.ts:2206-2212` con `MESA_TIENE_OTRAS_VENTAS_ABIERTAS`.
11. **D3 — la convención de lock por driver ya existe** en cuatro lugares (`ventas.handler.ts:2947`, `delivery.handler.ts:482`, `venta-reversa.utils.ts:100-104`, `pago-consolidado-adapters.ts:127-134`), siempre como `...(esPostgres ? { lock } : {})`. Y `Caja` **no tiene relaciones eager**, así que `findOne({ where: { id }, lock })` sin `relations` no genera joins → no reincide en el issue #258. El harness de `scripts/test-locks-postgres-e2e.ts:49-54` se saltea con exit 0 sin Postgres, como dice el plan.
12. **D6 — el permiso existe y el rol lo tiene:** `FINANCIERO_CAJA_AJUSTAR` en `permissions.handler.ts:133` con la descripción que el plan cita, y el rol plantilla GERENTE lo incluye (`seed-system.ts:499`). Único consumidor actual: `finalizar-ajuste-caja` (`financiero.handler.ts:792`), que hace `cajaRepo.save` directo (`:818`) y **no** pasa por `update-caja` — correcto lo que dice D7.
13. **D6 — los llamadores de ajuste son los que dice:** `list-cajas.component.ts` (ruta real `src/app/pages/financiero/cajas/list-cajas.component.ts`) `ajustarConteo` con `PromptDialogComponent` `:331-345` y `agregarGasto`/`agregarRetiro` `:366-392`; `utilitarios-dialog.component.ts:119-133` abre los **mismos** dos diálogos que Financiero, así que el flag por `MAT_DIALOG_DATA` es la decisión correcta; `resumen-caja-dialog.component.ts:98-116`; `create-retiro-caja-dialog.component.ts:190-204`.
14. **D8 — `SeleccionarCajaDialogComponent` devuelve `{ caja }` o `{ abrirNueva }`** (`:57-66`) y ya muestra `createdBy.persona.nombre/apellido` con fallback a `createdBy.nickname` (`:40-45`) → es exactamente el conjunto que `selectUsuarioPublico` conservaría. Sin regresión visual.
15. **D13 — `anclaJornada` (`:67`) e `inicioDelDia` (`:74`) existen en `src/app/shared/utils/dashboard-rangos.util.ts`** y `tabsService.activeTab$` en `src/app/services/tabs.service.ts:28`.
16. **D14 — los 7 lectores de `password` son exactos** y no hay ninguno más en el repo (ver B5).
17. **§11 — `run-all-tests.js` recoge las suites nuevas automáticamente** (`scripts/run-all-tests.js:31-34`).
18. **§9 — el campo extra `ajuste` no rompe un servidor viejo:** `repo.create(plainObject)` de TypeORM mapea contra la metadata de la entidad y descarta claves desconocidas; es el mismo mecanismo por el que `validarDispositivoCaja` se descarta hoy en `createPago`. El plan ya lo destructura antes de crear, que es lo correcto igual. (Verificado por analogía con el código existente, no contra `node_modules` — no está instalado en este worktree.)

---

## Respuestas directas a las preguntas del encargo que no quedaron en un hallazgo

- **¿`pessimistic_read`/`FOR SHARE` es viable?** Sí, en Postgres, y sin joins es seguro respecto de #258. Dos escritores con `FOR SHARE` no se bloquean; el que cierra con `FOR UPDATE` espera. La contención de R2 está bien evaluada. **Pero** exige que la escritura y el guard compartan `EntityManager`: hay que pasar `manager` en `createVenta` (`ventas.handler.ts:1029`), `delivery-crear` (`delivery.handler.ts:298`), `registrarCobroParcial` (`queryRunner.manager`, `:4519`), `cobrar-venta-credito` (`queryRunner.manager`, `:836`), `materializarPedidoOnlineEnVenta` (`qr.manager`, `:263`) y `transferir-venta-pdv` (`manager`, dentro del `reduce` de `withMesaLock`/`withComandaLock`). El plan lo dice para D3 en general; conviene enumerarlo canal por canal en la Fase 1 porque pasar el `DataSource` por error convierte el guard en un no-op transaccional silencioso (lee fuera de la transacción).
- **¿Deadlock entre `update-caja` (FOR UPDATE) y `createVenta` (FOR SHARE + mesa lock)?** No hay inversión de orden: `withMesaLock` es un candado **en memoria del proceso**, no de base, y `update-caja` no lo toma. El orden de recursos de base es de un solo elemento (la fila de `cajas`) en los dos caminos. El riesgo real no es deadlock sino **espera larga**: si la transacción de cierre incluye `generarRetiroDelCierre` (B3) y el envío de WhatsApp, el `FOR UPDATE` se sostiene segundos y cada venta nueva espera. Otra razón para acotar la transacción.
- **¿SQLite serializa?** Dentro del proceso sí: el driver `sqlite3` de este repo usa una sola conexión y TypeORM serializa los query runners sobre ella. Entre dos procesos contra el mismo archivo, no de forma confiable (`SQLITE_BUSY`, no serialización limpia). Ver B2.
