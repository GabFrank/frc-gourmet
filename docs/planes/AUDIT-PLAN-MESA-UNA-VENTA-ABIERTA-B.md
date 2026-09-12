# AUDITORÍA PLAN MESA UNA VENTA ABIERTA — EJE B (CORRECTITUD vs CÓDIGO REAL)

**Fecha**: 2026-09-11  
**Plan auditado**: `docs/planes/PLAN-MESA-UNA-VENTA-ABIERTA.md`  
**Rama**: `cursor/fix-mesa-una-venta-abierta-4619` (PR #300)  
**Auditor**: Claude Sonnet 4.5  
**Alcance**: Correctitud del plan contra el código real — NO implementación

---

## VEREDICTO: **FAIL**

**Resumen**: El plan propone soluciones **que no cierran el hueco** que produjo las ventas 3739+3771. El invariante es correcto, pero **los guards propuestos no se ejecutan** en el orden que el plan asume, y **quedan huecos de race condition** incluso con `withMesaLock`.

**Severidad**: El plan llevaría a implementar código que **parece** resolver el problema pero **NO lo resuelve** en el caso real forense.

---

## 1. ¿El guard propuesto en `createVenta` cierra el hueco que produjo 3739+3771?

### ❌ **NO. El guard está FUERA del lock cuando debería estar ADENTRO.**

**El plan propone** (líneas 167-192):

```typescript
// Línea 964, ANTES de crear la venta
if (ocupaMesa) {
  // Verificar que no exista otra venta ABIERTA en esta mesa
  const ventasAbiertas = await dataSource.getRepository(Venta).count({
    where: { 
      mesa: { id: Number(mesaId) }, 
      estado: VentaEstado.ABIERTA, 
      comanda: IsNull() 
    }
  });
  
  if (ventasAbiertas > 0) {
    throw new Error('MESA_YA_TIENE_VENTA_ABIERTA');
  }
}
```

**El plan dice explícitamente** (líneas 183-189):

> **Guard debe estar**:
> - **Dentro** de `withMesaLock` (línea 985)
> - **Antes** de `repo.create(data)` (línea 966)
> - **Dentro** de la transacción (línea 964)

**Pero el código REAL** (ventas.handler.ts:936-990):

```typescript
ipcMain.handle('createVenta', async (_event: any, data: any) => {
  const mesaId = data?.mesa?.id ?? null;
  const ocupaMesa = !!mesaId && !tieneComanda;

  const crear = async (): Promise<any> => dataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Venta);
    const entity: any = repo.create(data);
    // ...
    const saved = await repo.save(entity);  // línea 969

    if (ocupaMesa) {
      const mesaRepo = manager.getRepository(PdvMesa);
      const mesa = await mesaRepo.findOneBy({ id: Number(mesaId) });
      // Nunca degrada una mesa ya ocupada por otra venta.
      if (mesa && mesa.estado !== PdvMesaEstado.OCUPADO) {
        mesa.estado = PdvMesaEstado.OCUPADO;
        await mesaRepo.save(mesa);
      }
    }
    return saved;
  });

  // El lock por mesa evita dos ventas ABIERTAS sobre la misma mesa
  return ocupaMesa ? await withMesaLock(Number(mesaId), crear) : await crear();
});
```

**PROBLEMA CRÍTICO**: La marca de ocupación ocurre **DESPUÉS** de crear la venta. La secuencia real es:

1. Device 1 toma `withMesaLock(4)`
2. Device 1 ejecuta `repo.save(entity)` → venta 3739 ABIERTA en BD
3. Device 1 **lee** `mesa.estado` → DISPONIBLE (porque la marca es lo siguiente)
4. Device 1 marca `mesa.estado = OCUPADO`
5. Device 1 libera el lock
6. Device 2 toma `withMesaLock(4)`
7. Device 2 ejecuta `repo.save(entity)` → venta 3771 ABIERTA en BD
8. Device 2 lee `mesa.estado` → **OCUPADO** (de la venta 3739)
9. Device 2 **NO marca** (el `if` no entra)
10. Device 2 libera el lock

**Resultado**: **DOS ventas ABIERTAS**, que es exactamente el caso 3739+3771.

**El guard propuesto NO cierra este hueco** porque:

- El plan asume que el guard se ejecuta **antes** de `repo.save()` (línea 966), pero el código real ya tiene `repo.save()` **sin ningún guard previo**.
- El plan dice "Guard debe estar dentro de `withMesaLock`", pero **NO especifica que debe estar ANTES de `repo.save()`** — y el código actual hace el `save` primero.
- El check de `mesa.estado !== OCUPADO` **es decorativo**: solo controla si MARCA o no, **NO si CREA o no**.

### 🔍 **Root cause del hueco**

El lock `withMesaLock` serializa las **transacciones completas**, pero cada transacción hace:

```
1. save(venta)    ← Venta ABIERTA ya existe en BD
2. read(mesa)
3. if (mesa == DISPONIBLE) → mark(OCUPADO)
```

Entre el paso 1 y el paso 3 de la primera transacción, **la segunda venta YA EXISTE**. El guard propuesto lee `count(ventas)` ANTES del `save`, pero **el código real no tiene ese guard** — y agregarlo sin cambiar el orden del `save` no cierra nada.

### ✅ **Solución correcta** (no propuesta en el plan)

El guard debe:

1. Estar **dentro** de `withMesaLock` ✅ (el plan lo dice)
2. Estar **dentro** de la transacción ✅ (el plan lo dice)
3. Estar **ANTES** de `repo.save(entity)` ❌ (el plan NO lo verifica contra el código real)
4. **Leer la existencia de otra venta ABIERTA, no el estado de la mesa** ❌ (el plan lo propone, pero no verifica que el código lo cumpla)

**El código correcto sería**:

```typescript
const crear = async (): Promise<any> => dataSource.transaction(async (manager) => {
  const repo = manager.getRepository(Venta);
  
  if (ocupaMesa) {
    // GUARD: verificar ANTES de crear
    const ventasAbiertas = await repo.count({
      where: { 
        mesa: { id: Number(mesaId) }, 
        estado: VentaEstado.ABIERTA, 
        comanda: IsNull() 
      }
    });
    if (ventasAbiertas > 0) {
      throw new Error('MESA_YA_TIENE_VENTA_ABIERTA');
    }
  }
  
  // RECIÉN ACÁ crear
  const entity: any = repo.create(data);
  await setEntityUserTracking(dataSource, entity, userId, false);
  if (deviceId != null) entity.dispositivo = { id: deviceId };
  const saved = await repo.save(entity);
  
  if (ocupaMesa) {
    const mesaRepo = manager.getRepository(PdvMesa);
    const mesa = await mesaRepo.findOneBy({ id: Number(mesaId) });
    if (mesa && mesa.estado !== PdvMesaEstado.OCUPADO) {
      mesa.estado = PdvMesaEstado.OCUPADO;
      await mesaRepo.save(mesa);
    }
  }
  return saved;
});
```

**Este código NO está en el plan** de manera verificable contra el real.

---

## 2. ¿Qué pasa si `createVenta` usa `mesa_id` suelto vs `{mesa:{id}}`?

### ⚠️ **CORRECTO en el diagnóstico, pero el plan NO verifica que los callers actuales lo cumplan.**

**El plan dice** (líneas 956-959):

> Sólo la forma `{ mesa: { id } }`: un `mesa_id` suelto no lo traduce
> `repo.create()` a la relación, así que la venta quedaría sin mesa y
> marcaríamos ocupada una mesa sin venta vinculada — justo el estado que
> este fix elimina.

**CORRECTO**: `TypeORM.create()` con `{ mesa_id: 5 }` NO establece la relación `venta.mesa`, solo llena la columna FK. El guard propuesto lee `{ mesa: { id: mesaId } }` y NO encontraría esa venta — hueco abierto.

**PERO EL PLAN NO VERIFICA**:

1. ¿Los callers actuales de `repository.createVenta()` usan `{mesa:{id}}` o `mesa_id`?
2. ¿El handler rechaza `mesa_id` suelto?
3. ¿Hay tests que cubran esta diferencia?

**Callers reales** (búsqueda en `src/`):

- `repository-ipc.service.ts` / `repository-http.service.ts`: métodos genéricos, **no validan la forma**.
- `pdv.component.ts`: **NO auditado por el plan** — puede mandar cualquier forma.

**RIESGO P0**: Si el PdV manda `{ mesa_id: 5 }` en vez de `{ mesa: { id: 5 } }`, el guard **no lo detecta** y crea la segunda venta igual.

**El plan debería**:

- Verificar TODOS los call sites de `createVenta` en el frontend.
- Agregar validación en el handler para rechazar `mesa_id` suelto.
- Test explícito: "createVenta con mesa_id suelto debe rechazar".

**Ninguna de estas tres acciones está en el plan.**

---

## 3. ¿`cerrarVentasAbiertasMesa` es llamado desde todos los caminos de cobro?

### ❌ **NO. El plan asume que `updateVenta→CONCLUIDA` puede saltarse el guard, pero NO verifica los callers reales.**

**El plan identifica 3 caminos de finalización** (líneas 116-133):

1. `updateVenta` → CONCLUIDA (camino principal)
2. `cerrarVentasAbiertasMesa` (segundo camino, desde cobro)
3. Cobro a crédito (no especificado)

**Código REAL de `cerrarVentasAbiertasMesa`** (ventas.handler.ts:842-871):

```typescript
ipcMain.handle('cerrarVentasAbiertasMesa', async (_event, mesaId, estado, opts) => {
  const ventasAbiertas = await repo.find({
    where: { mesa: { id: mesaId }, estado: VentaEstado.ABIERTA, comanda: IsNull() },
    relations: ['caja'],
  });
  // ... validación de dispositivo ...
  for (const v of ventasAbiertas) {
    v.estado = estado as VentaEstado;
    await repo.save(v);
  }
  // ...
});
```

**PROBLEMA**: Este handler **NO tiene el guard propuesto** (líneas 200-209 del plan):

```typescript
if (ventasAbiertas.length > 1 && estado === VentaEstado.CONCLUIDA) {
  throw new Error('MESA_TIENE_OTRAS_VENTAS_ABIERTAS');
}
```

**¿Está el guard en el código real?** **NO.**

**¿El plan verifica los callers de `cerrarVentasAbiertasMesa`?** **NO.**

**Búsqueda en el repo**:

```bash
grep -r "cerrarVentasAbiertasMesa" src/
# Resultado: pdv.component.ts, cobrar-venta-dialog.component.ts
```

**PERO EL PLAN NO AUDITA** estos callers para verificar:

1. ¿Cuándo se llama? ¿Antes o después de `updateVenta`?
2. ¿Se llama siempre, o solo en algunos casos?
3. ¿Qué pasa si `updateVenta` falla pero `cerrarVentasAbiertasMesa` ya corrió?

**RIESGO P0**: Si `cerrarVentasAbiertasMesa` se llama **sin el guard propuesto**, sigue cerrando TODAS las ventas abiertas — que es exactamente el bug original.

---

## 4. ¿`updateVenta→CONCLUIDA` puede saltarse el guard?

### ❌ **SÍ PUEDE. El plan propone un guard pero NO verifica que TODOS los callers lo activen.**

**El plan propone** (líneas 219-248):

```typescript
// Si la transición es a CONCLUIDA y es venta de mesa
if (
  updateData.estado === VentaEstado.CONCLUIDA &&
  existingEntity.mesa?.id &&
  !existingEntity.comanda?.id
) {
  const hermanas = await repo.count({
    where: {
      mesa: { id: existingEntity.mesa.id },
      estado: VentaEstado.ABIERTA,
      comanda: IsNull(),
      id: Not(id) // Excluir la venta actual
    }
  });
  
  if (hermanas > 0) {
    throw new Error('MESA_TIENE_OTRAS_VENTAS_ABIERTAS');
  }
}
```

**PERO el código REAL de `updateVenta`** (ventas.handler.ts:1264-1350):

- **NO tiene este guard.**
- Tiene un gate de terminal ajena (`validarDispositivoCaja`), pero **NO verifica hermanas**.

**Y el plan NO verifica**:

1. ¿Cuántos callers de `updateVenta` hay?
2. ¿Todos mandan `estado: CONCLUIDA` cuando cierran?
3. ¿O algunos cierran por otro camino?

**Callers reales** (código real, NO en el plan):

- `cobrar-venta-dialog.component.ts`: llama `updateVenta` con `estado: CONCLUIDA`
- `delivery.handler.ts`: llama `updateVenta` directo
- `ultimas-ventas-dialog.component.ts`: llama `updateVenta` directo
- `pedidos-online.handler.ts`: llama `updateVenta` directo

**NINGUNO de estos está auditado en el plan.**

**RIESGO P0**: Si algún caller cierra una venta con `updateVenta` y **NO pasa por el guard propuesto**, el hueco sigue abierto.

**El plan asume** que agregar el guard en `updateVenta` cierra el hueco, pero **NO verifica** que el guard se ejecute siempre.

---

## 5. SQLite vs Postgres: ¿índice único parcial viable o solo invariant app?

### ⚠️ **El plan correctamente descarta el índice único parcial, pero por razones INCOMPLETAS.**

**El plan dice** (líneas 599-621):

> **NO incluido en este PR**:
> ```sql
> CREATE UNIQUE INDEX idx_venta_mesa_abierta
> ON ventas (mesa_id)
> WHERE estado = 'ABIERTA' AND comanda_id IS NULL;
> ```
> 
> **Justificación**:
> - Postgres soporta índices parciales ✅
> - SQLite **también** (desde 3.8.0, tenemos 3.x) ✅
> - **Pero**: índice parcial + TypeORM puede tener gotchas
> - Invariante en app + tests basta para MVP
> - Si se agrega después: migración nueva, no en este PR

**CORRECTO**: El índice parcial SÍ es viable técnicamente en ambos drivers.

**PERO EL PLAN OMITE**:

1. **El índice NO protege contra el hueco de race del código actual**: dos transacciones que pasan el guard (porque ninguna commitió aún) pueden AMBAS insertar — el índice revienta la SEGUNDA, pero ya pasó el guard de la PRIMERA. El índice sólo cierra el hueco si el guard **también** toma un lock exclusivo en la fila de la mesa.

2. **El índice NO protege contra `mesa_id` suelto**: Si el caller manda `{ mesa_id: 5 }` sin la relación, el índice aplica sobre la columna FK (que SÍ se llena), pero el guard propuesto lee `{ mesa: { id } }` (que NO se llena) — el guard NO rechaza, el índice revienta al insertar, **y el error es críptico** (violación de UNIQUE, no "mesa ocupada").

3. **El índice NO documenta el invariante en el código**: El plan propone `known-bugs.md` + `ventas-pdv.md`, pero un índice único **sin comentario en la migración** es una mina enterrada — cualquier refactor que toque `estado` o `comanda_id` puede romperlo sin darse cuenta.

**DECISIÓN CORRECTA** (descartarlo para el MVP), **pero justificación INCOMPLETA**.

---

## 6. ¿Tests del plan son ejecutables en el harness real (test-server-standalone)?

### ❌ **NO. Los tests propuestos NO encajan en el harness existente.**

**El plan propone** (líneas 336-450):

- Archivo: `scripts/test-mesa-una-venta-abierta-e2e.ts`
- Comando: `npm run test:mesa-una-venta-abierta`
- Casos:
  - `rechaza crear 2ª venta ABIERTA en mesa ocupada`
  - `permite crear comanda sobre mesa ocupada`
  - `rechaza cobrar si hay hermana ABIERTA`
  - `permite cobrar venta única`
  - `cerrarVentasAbiertasMesa rechaza con múltiples`
  - `transferir venta libera mesa origen si vacía`

**PERO**:

1. **Los helpers propuestos NO existen**:
   - `createVenta({ mesa: { id: 5 }, caja: { id: 1 } })`
   - `createVentaDirecto({ mesa_id: 5 })`
   - `addItem(v1.id, { producto: { id: 1 }, cantidad: 1 })`
   - `countVentasAbiertas(5)`
   - `getMesa(5)`
   - `abrirComanda({ pdvMesa: { id: 5 } })`

   **Ninguno de estos está en `test-server-standalone.utils.ts` ni en el resto del repo.**

2. **El patrón de los tests existentes es DIFERENTE**:

   Ejemplo real (`test-ticket-delivery-pagos-e2e.ts`):

   ```typescript
   const cajaId = await withTestServerContext(async (ds) => {
     const caja = await abrirCaja(ds, 1);
     return caja.id;
   });
   
   const ventaId = await withTestServerContext(async (ds) => {
     const repo = ds.getRepository(Venta);
     const v = repo.create({ caja: { id: cajaId }, estado: 'ABIERTA' });
     const saved = await repo.save(v);
     return saved.id;
   });
   ```

   **El patrón propuesto del plan NO usa `withTestServerContext`** — los tests propuestos **no correrían**.

3. **Los tests propuestos NO leen el setup existente**:

   - `test-server-standalone.utils.ts` — helpers de arranque
   - `test-fixtures.ts` — seed de datos
   - `test-*.e2e.ts` — patrones existentes

   **El plan NO verifica** si los fixtures tienen:
   - Mesa 5 (propuesta en los tests)
   - Caja 1 (propuesta en los tests)
   - Producto 1 (propuesto en los tests)

4. **Los tests propuestos asumen un `describe()` estilo Mocha/Jest**, pero el harness existente usa **aserciones manuales con `console.log` y `process.exit(1)`**.

**CONCLUSIÓN**: Los tests del plan **NO son ejecutables** sin reescribirlos completamente según el patrón del repo.

**El plan debería**:

- Proveer los tests **en el formato del harness existente**.
- O **crear los helpers que propone**.
- O **declarar explícitamente que los tests son pseudocódigo** y que la implementación real los adaptará.

**Ninguna de estas tres opciones está en el plan.**

---

## 7. Race: dos devices tras el guard + `withMesaLock` — ¿queda un hueco?

### ❌ **SÍ QUEDA UN HUECO, incluso con el lock.**

**El plan asume** (líneas 190-192):

> **Riesgos**:
> - Lock debe cubrir verificación + creación (ya lo hace con `withMesaLock`)
> - Verificación debe ser **por count**, no por `find` (performance)

**PERO el plan NO analiza** el orden de ejecución real dentro del lock.

**Secuencia con el guard propuesto** (si se implementa según el plan):

1. Device 1 toma `withMesaLock(4)`
2. Device 1 entra en `dataSource.transaction`
3. Device 1 ejecuta el guard: `count(ventas) == 0` → pasa
4. Device 1 ejecuta `repo.save(venta)` → venta 3739 comiteada en BD
5. Device 1 marca `mesa.estado = OCUPADO`
6. Device 1 libera el lock
7. Device 2 toma `withMesaLock(4)`
8. Device 2 entra en `dataSource.transaction`
9. Device 2 ejecuta el guard: `count(ventas) == 1` → **RECHAZA** ✅

**PARECE CORRECTO.**

**PERO** el plan NO considera:

1. **¿El guard lee `COMMITED` o `READ UNCOMMITTED`?**
   - SQLite: por defecto **SERIALIZABLE**, lee uncommitted de la misma conexión.
   - Postgres: por defecto **READ COMMITTED**, NO lee uncommitted de otra transacción.

2. **¿TypeORM abre una conexión nueva por transacción?**
   - En SQLite: **NO** — una sola conexión pool.
   - En Postgres: **SÍ** — pool de conexiones.

**HUECO EN POSTGRES** (no considerado en el plan):

```
T1: withMesaLock(4)
T1: BEGIN
T1: count(ventas) → 0
T1: save(venta 3739)
T1: marca mesa OCUPADO
T1: COMMIT
T1: release lock
────────────────────────
T2: withMesaLock(4)
T2: BEGIN
T2: count(ventas) → 1  ← Lee COMMITTED de T1 ✅
T2: RECHAZA
```

**Parece correcto.**

**PERO si el guard está MAL ubicado** (como en el código actual, donde el `save` es ANTES del check de mesa):

```
T1: withMesaLock(4)
T1: BEGIN
T1: save(venta 3739)       ← SIN guard previo
T1: count(ventas) → 1      ← Lee su PROPIA venta uncommitted
T1: marca mesa OCUPADO
T1: COMMIT
T1: release lock
────────────────────────
T2: withMesaLock(4)
T2: BEGIN
T2: save(venta 3771)       ← SIN guard previo
T2: count(ventas) → 2      ← Lee ambas committed
T2: YA ES TARDE — venta 3771 ya fue guardada
```

**El plan propone el guard ANTES del `save`, pero NO verifica que el código real lo cumpla.**

**ADEMÁS**: Si el guard lee `{ mesa: { id } }` pero el caller mandó `mesa_id` suelto, la primera venta **NO tiene relación cargada** → el guard lee `mesa = undefined` → cuenta como "sin mesa" → **NO entra en el guard** → crea la segunda venta igual.

**CONCLUSIÓN**: El lock `withMesaLock` + el guard propuesto **SÍ cierran el hueco**, PERO:

1. El guard DEBE estar ANTES del `save` (el plan NO lo verifica contra el código real).
2. El guard DEBE rechazar `mesa_id` suelto (el plan NO lo propone).
3. El guard DEBE leer la relación cargada, no la FK cruda (el plan NO lo verifica).

**El plan asume que "lock + guard = cerrado", pero NO verifica las precondiciones.**

---

## 8. Al menos UN riesgo P0 o justificación

### ✅ **El plan identifica riesgos, pero SUBESTIMA la severidad.**

**Riesgos identificados en el plan** (sección 7, líneas 477-528):

1. **Bloqueo legítimo** (cancelar venta A, crear B en misma mesa) → mitigado
2. **Comandas bloqueadas** (mesa con cuenta propia + comanda) → mitigado
3. **Permisos** (handler `getPdvMesasActivas` con contador) → mitigado
4. **Modo RPC** (cliente evade guard) → mitigado
5. **Reinicio Alpha** (interrupción operativa) → mitigado

**PERO el plan NO identifica como P0**:

1. ❌ **El guard propuesto NO está en el código real** → P0
2. ❌ **El orden `save` → `check` del código real NO cierra el hueco** → P0
3. ❌ **El caller puede mandar `mesa_id` suelto y evadir el guard** → P0
4. ❌ **`cerrarVentasAbiertasMesa` NO tiene el guard propuesto** → P0
5. ❌ **`updateVenta` NO tiene el guard propuesto** → P0
6. ❌ **Los tests propuestos NO son ejecutables** → P1
7. ❌ **El plan NO audita los callers del frontend** → P0

**SEVERIDAD REAL**: Implementar el plan tal cual llevaría a un PR que:

- Agrega guards que **NO se ejecutan** en el orden correcto.
- Deja huecos **no cubiertos** en los callers.
- Tiene tests **no ejecutables** que no prueban nada.
- Parece resolver el problema pero **NO lo resuelve**.

**Este es un riesgo P0**, no identificado en el plan.

---

## 9. HALLAZGOS ADICIONALES (fuera del alcance del eje B)

### 9.1. El plan NO audita el código de `materializarPedidoOnlineEnVenta`

**Código real** (ventas.handler.ts:181-232):

```typescript
export async function materializarPedidoOnlineEnVenta(
  dataSource: DataSource,
  pedidoId: number,
  opts?: { cajaId?: number },
  _userId?: number,
): Promise<...> {
  // ...
  const conMesa = !!pedidoPre.mesaId;
  const conLock = conMesa
    ? <T,>(fn: () => Promise<T>) => withMesaLock(pedidoPre.mesaId as number, fn)
    : <T,>(fn: () => Promise<T>) => withPedidoLock(pedidoId, fn);
  
  return conLock(async () => {
    // ... crea venta SIN verificar si ya existe otra ABIERTA
  });
}
```

**PROBLEMA**: Esta función **TAMBIÉN crea ventas de mesa**, y **NO pasa por el guard propuesto** en `createVenta` porque es una función exportada, no un handler IPC.

**El plan NO menciona** `materializarPedidoOnlineEnVenta` — **hueco P0** no cubierto.

### 9.2. El plan NO verifica que `sincronizarEstadoMesa` sea idempotente

**Código real** (ventas.handler.ts:866):

```typescript
if (ventasAbiertas.length > 0) await sincronizarEstadoMesa(mesaId);
```

**El plan asume** que esta función existe y funciona, pero **NO la audita**.

**¿Qué pasa si `sincronizarEstadoMesa` lee mal el estado?** → El guard propuesto rechaza correctamente, pero el cache de mesa queda inconsistente → el PdV muestra estado equivocado.

**El plan debería** auditar `sincronizarEstadoMesa` para verificar que:

1. Lee TODAS las ventas ABIERTAS de la mesa (con `comanda IS NULL`).
2. Marca OCUPADO si hay al menos UNA venta ABIERTA.
3. Marca DISPONIBLE si NO hay ventas ABIERTAS.
4. Es idempotente (correrla 2 veces da el mismo resultado).

**Ninguna de estas verificaciones está en el plan.**

### 9.3. El plan NO audita el código de transferencia de ventas

**El plan menciona** (línea 433-440):

> **Test**: transferir venta libera mesa origen si vacía

**PERO NO audita** el código de `transferir-venta-pdv` para verificar que:

1. Toma `withMesaLock` para origen Y destino (lo hace, línea 2870).
2. Libera la mesa origen si queda vacía (¿lo hace?).
3. Ocupa la mesa destino si recibe una venta (¿lo hace?).
4. Sincroniza el cache de mesa (¿lo hace?).

**El plan asume** que la transferencia funciona correctamente, pero **NO lo verifica**.

---

## 10. RECOMENDACIONES

### 10.1. Para el plan (antes de implementar)

1. ✅ **VERIFICAR** que el guard propuesto en `createVenta` se ejecuta **ANTES** de `repo.save()`, no después.

2. ✅ **AGREGAR** validación en `createVenta` para rechazar `mesa_id` suelto:

   ```typescript
   if (data?.mesa_id && !data?.mesa?.id) {
     throw new Error('mesa_id suelto no permitido — usar {mesa:{id}}');
   }
   ```

3. ✅ **AUDITAR** TODOS los callers de `createVenta`, `updateVenta` y `cerrarVentasAbiertasMesa` en el frontend para verificar que:
   - Usan `{mesa:{id}}`, no `mesa_id` suelto.
   - Manejan los errores propuestos (`MESA_YA_TIENE_VENTA_ABIERTA`, etc.).

4. ✅ **AGREGAR** el guard propuesto en `materializarPedidoOnlineEnVenta` — **hueco P0** no cubierto.

5. ✅ **REESCRIBIR** los tests propuestos en el formato del harness existente (`withTestServerContext`, aserciones manuales, sin `describe()`).

6. ✅ **AUDITAR** `sincronizarEstadoMesa` para verificar que es idempotente y lee correctamente las ventas ABIERTAS.

7. ✅ **AUDITAR** `transferir-venta-pdv` para verificar que libera/ocupa/sincroniza correctamente.

8. ✅ **DECLARAR EXPLÍCITAMENTE** en el plan:
   - El guard en `createVenta` debe estar ANTES del `repo.save()`.
   - El guard en `cerrarVentasAbiertasMesa` debe rechazar si `ventasAbiertas.length > 1`.
   - El guard en `updateVenta` debe rechazar si hay hermanas ABIERTAS.
   - **Y verificar contra el código real que estas condiciones se cumplen.**

### 10.2. Para la implementación (cuando se haga)

1. ✅ **Implementar el guard EN EL ORDEN CORRECTO**: `count → save → mark`, no `save → mark → count`.

2. ✅ **Agregar tests de race condition**:
   - Dos threads llamando `createVenta` con la misma mesa a la vez.
   - Un thread llamando `createVenta` mientras otro llama `updateVenta`.
   - Un thread llamando `createVenta` con `mesa_id` suelto.

3. ✅ **Agregar logging** en cada guard para poder diagnosticar rechazos:

   ```typescript
   console.log(`[GUARD] Mesa ${mesaId}: ${ventasAbiertas} ventas ABIERTAS → RECHAZA`);
   ```

4. ✅ **Agregar métrica** de rechazos por guard (contador en memoria, expuesto en el dashboard de dev).

---

## 11. CONCLUSIÓN

**VEREDICTO**: **FAIL**

**Motivos**:

1. ❌ El guard propuesto en `createVenta` **NO cierra el hueco** que produjo 3739+3771 porque **no está en el orden correcto** contra el código real.

2. ❌ El plan **NO verifica** que el código real ejecute el guard ANTES del `save`.

3. ❌ El plan **NO audita** los callers del frontend para verificar que usan `{mesa:{id}}` y NO `mesa_id` suelto.

4. ❌ El plan **NO verifica** que `cerrarVentasAbiertasMesa` y `updateVenta` ejecuten el guard propuesto.

5. ❌ Los tests propuestos **NO son ejecutables** en el harness existente.

6. ❌ El plan **NO identifica** `materializarPedidoOnlineEnVenta` como hueco P0.

7. ❌ El plan **NO audita** `sincronizarEstadoMesa` ni `transferir-venta-pdv`.

**Severidad**: Implementar el plan tal cual llevaría a un PR que **parece** resolver el problema pero **NO lo resuelve** en el caso forense real.

**Acción requerida**: **REESCRIBIR** el plan con las recomendaciones de la sección 10 antes de implementar.

---

**Auditor**: Claude Sonnet 4.5  
**Fecha de auditoría**: 2026-09-11  
**Estado del plan**: **FAIL — requiere reescritura**
