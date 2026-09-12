# Auditoría del Diff — SSE Mesas PDV: Tests + Migraciones

**Fecha:** 2026-09-11  
**Branch:** `cursor/plan-sse-mesas-pdv-64d5` (PR #302)  
**Auditor:** Cloud Agent (solo-lectura)  
**Alcance:** Eje TESTS (poder discriminante) + Migraciones

---

## Resumen Ejecutivo

**Estado:** 🔴 **FAIL** — Los tests NO corren y NO discriminan.  
**Severidad:** **P0** — Los tests son la única garantía de que el SSE funciona; sin ellos el PR entrega código no verificable.

### Hallazgos Críticos

1. **P0-1:** Los tests "conceptuales" en `test/*.spec.ts` son huérfanos — no tienen jest.config.js ni script npm que los ejecute.
2. **P0-2:** El único test E2E real (`test:mesa-una-venta-abierta`) NO puede correr — ts-node falta como dependencia.
3. **P0-3:** NO existe test de transporte SSE real — el test de cliente es unitario puro (mock de merge, no de EventSource).
4. **P0-4:** El test de auditoría continua usa regex sobre código fuente, NO ejecuta handlers reales — un mock de broadcast que siempre "pasa" pasaría el test.
5. **P1-1:** Migraciones SQLite: el `down` NO es reversible (solo quita índice, no la columna).

---

## 1. Tests: ¿Corren de Verdad?

### 1.1. Archivos Huérfanos: `test/*.spec.ts`

**Ubicación:**
- `/workspace/test/sse-mesas-auditoria.spec.ts` (186 líneas)
- `/workspace/test/sse-mesas-cliente.spec.ts` (98 líneas)

**Hallazgo P0-1:** 🔴 **NO corren**

**Evidencia:**

```bash
$ ls -la test/*.spec.ts
-rw-r--r-- 1 ubuntu ubuntu 6708 Sep 11 18:46 test/sse-mesas-auditoria.spec.ts
-rw-r--r-- 1 ubuntu ubuntu 2856 Sep 11 18:46 test/sse-mesas-cliente.spec.ts

$ cat jest.config.js
cat: jest.config.js: No such file or directory

$ grep -r "test.*sse-mesas" package.json
(sin resultados)
```

**Implicaciones:**
1. Los archivos existen pero **no hay framework** (jest) ni **script npm** que los ejecute.
2. El implementador dice "tests verdes (conceptuales)" — esto es una **bandera roja**: un test que no se ejecuta no puede estar verde.
3. Estos tests nunca se van a correr en CI ni localmente a menos que alguien los conecte manualmente.

**Recomendación:** 
- Instalar jest (`npm i -D jest @types/jest ts-jest`)
- Crear `jest.config.js` apuntando a `test/**/*.spec.ts`
- Agregar script `"test:sse-mesas": "jest test/sse-mesas-*.spec.ts"`
- O bien **eliminar estos archivos** si no van a usarse y confiar solo en el E2E de `scripts/`.

---

### 1.2. El Test E2E Real: `test:mesa-una-venta-abierta`

**Ubicación:** `scripts/test-mesa-una-venta-abierta-e2e.ts` (250 líneas)

**Hallazgo P0-2:** 🔴 **NO puede correr** — dependencia faltante.

**Evidencia:**

```bash
$ npm run test:mesa-una-venta-abierta

> ts-node --transpile-only --prefer-ts-exts --project tsconfig.typeorm.json scripts/test-mesa-una-venta-abierta-e2e.ts

sh: 1: ts-node: not found

$ npm ls ts-node
frc-gourmet@1.0.0 /workspace
├── UNMET DEPENDENCY ts-node@10.9.1
npm error missing: ts-node@10.9.1, required by frc-gourmet@1.0.0
```

**Análisis:**
- El script **SÍ está registrado** en `package.json:101`.
- Pero `ts-node` está como **UNMET DEPENDENCY** — no instalado en node_modules.
- Esto significa que **nunca se ejecutó** en este entorno (ni en local ni en CI probablemente).

**Contenido del Test:**
Este test SÍ es valioso — verifica el invariante "máximo 1 venta ABIERTA por mesa" con 5 escenarios P0:
- P0-1: `createVenta` rechaza 2ª venta ABIERTA de la misma mesa ✓
- P0-2: `cerrarVentasAbiertasMesa` rechaza si hay >1 ABIERTA ✓
- P0-3: `updateVenta`→CONCLUIDA rechaza con hermanas ABIERTAS ✓
- P0-4: `createVenta` rechaza `mesa_id` suelto ✓
- P0-5: pedido online REUSA venta existente ✓

**Recomendación:**
```bash
npm install --save-dev ts-node@10.9.1
npm run test:mesa-una-venta-abierta  # Debe pasar
```

---

## 2. Tests: ¿Discriminan?

### 2.1. Test de Auditoría Continua (Regex, No Runtime)

**Ubicación:** `test/sse-mesas-auditoria.spec.ts:83-124`

**Hallazgo P0-4:** 🔴 **NO discrimina** — usa grep de código, no ejecuta handlers.

**Código:**

```typescript
function handlerEmite(contenido: string, handlerNombre: string): boolean {
  const inicioRegex = new RegExp(`ipcMain\\.handle\\('${handlerNombre}'`, 'g');
  // ... extrae bloque del handler ...
  return /emit(Venta|Mesa|Comanda)Cambio/.test(bloqueHandler);
}
```

**Análisis:**
1. El test **parsea archivos .ts con regex** buscando llamadas a `emitVentaCambio|emitMesaCambio`.
2. **NO invoca** los handlers reales.
3. **NO verifica** que el broadcast llegue al EventSource del cliente.
4. **Pasa si:** el handler tiene la línea `await emitVentaCambio(...)`, **incluso si:**
   - La línea está comentada
   - Está dentro de un `if (false)`
   - El handler tiene un bug que lo hace fallar antes
   - El broadcast está mockeado y no emite nada

**Escenario que pasa el test pero falla en producción:**

```typescript
ipcMain.handle('updateVenta', async (event, id, data) => {
  await repo.save(venta);  // Mutación
  // await emitVentaCambio(venta.id);  // ← COMENTADO
  return venta;
});
```

El regex encuentra la línea comentada → test **PASS** ✅  
Pero en runtime **no emite nada** → producción **FAIL** ❌

**Recomendación:**
Reemplazar por un test de integración que:
1. Levante el DataSource
2. Registre los handlers reales
3. Se suscriba al bus `mesaEvents.on('change', ...)`
4. Invoque un handler mutador con `invokeHandler('updateVenta', ...)`
5. Verifique que el listener recibió el evento esperado

---

### 2.2. Test de Cliente SSE (Mock Unitario, No Transporte)

**Ubicación:** `test/sse-mesas-cliente.spec.ts`

**Hallazgo P0-3:** 🔴 **NO hay test de transporte SSE real**.

**Código:**

```typescript
function mergeMesaSelectiva(actual: MesaStub, nueva: MesaStub, esSeleccionada: boolean): MesaStub {
  if (esSeleccionada) {
    const { venta: _ventaIgnorada, ...sinVenta } = nueva;
    return { ...actual, ...sinVenta };
  } else {
    return { ...nueva };
  }
}

it('NO pisa .venta de la mesa seleccionada', () => {
  const mesaSeleccionada = { id: 1, estado: 'OCUPADO', venta: { ... } };
  const mesaNueva = { id: 1, estado: 'DISPONIBLE', venta: undefined };
  const resultado = mergeMesaSelectiva(mesaSeleccionada, mesaNueva, true);
  expect(resultado.venta).toEqual(mesaSeleccionada.venta); // ✓
});
```

**Análisis:**
1. Es un test **unitario puro** de la función de merge — válido, pero **insuficiente**.
2. **NO testea:**
   - Que el EventSource se conecte a `/api/pdv/mesas/stream`
   - Que reciba eventos del formato correcto (`{ tipo, mesaId, seq }`)
   - Que el coalescer agrupe eventos rápidos
   - Que el seq se use para descartar eventos viejos
   - Que el fallback de 10s se active si SSE cae
   - Que el heartbeat mantenga viva la conexión

3. **Faltante crítico:** No hay test de **contrato de secuencia** — si un cliente con `seq=5` recibe un evento con `seq=3`, ¿lo descarta?

**Lo que el test SÍ hace bien:**
- Verifica que la lógica de merge no pisa `.venta` de la mesa seleccionada ✓
- Verifica el coalescer de eventos ✓

**Recomendación:**
Agregar test E2E de transporte SSE:

```typescript
// Pseudocódigo
it('E2E: recibe eventos SSE y descarta seq viejos', async () => {
  const server = await startTestServer();  // Levanta Fastify + handlers
  const token = await generarStreamToken('pdv');
  const eventSource = new EventSource(`http://localhost:7070/api/pdv/mesas/stream?token=${token}`);
  
  const eventos: any[] = [];
  eventSource.onmessage = (e) => eventos.push(JSON.parse(e.data));
  
  // Esperar conexión
  await waitFor(() => eventSource.readyState === EventSource.OPEN);
  
  // Mutar una mesa → debe emitir
  await invokeHandler('set-pdv-mesa-estado', 1, 'OCUPADO');
  await waitFor(() => eventos.length > 0);
  
  expect(eventos[0]).toMatchObject({ tipo: 'MESA_CAMBIO', mesaId: 1, seq: expect.any(Number) });
  
  eventSource.close();
  await server.close();
});
```

---

## 3. Migraciones: Correctitud y Reversibilidad

### 3.1. Estructura y Registro

**Archivos:**
- `1789151316209-AddSeqToVenta.ts` (40 líneas)
- `1789151316210-AddSeqToPdvMesa.ts` (38 líneas)
- `1789151316211-AddSeqToComanda.ts` (38 líneas)

**Verificaciones PASS:**

✅ **Nombres correctos:** Timestamps reales epoch-ms (1789151316xxx = 2026-09-11), no redondeados.  
✅ **Dual-driver:** Branch `if (driverType === 'postgres')` vs SQLite.  
✅ **Índices:** `CREATE INDEX IF NOT EXISTS idx_seq_<tabla> ON <tabla>(seq)` en ambos drivers.  
✅ **Registradas:** Importadas y agregadas en `database.config.ts:294-296` y `723-725`.  
✅ **Nullable:** `seq INTEGER NULL` — registros legacy sin seq hasta que muten.  
✅ **Default:** `COALESCE(seq, 0) + 1` en el UPDATE — funciona con null.

---

### 3.2. Reversibilidad SQLite (P1)

**Hallazgo P1-1:** 🟡 **PARCIAL** — El `down` de SQLite NO quita la columna.

**Código:**

```typescript
public async down(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`DROP INDEX IF EXISTS "idx_seq_venta"`);
  
  const driverType = queryRunner.connection.options.type;
  if (driverType === 'postgres') {
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "seq"`);
  } else {
    // SQLite no soporta DROP COLUMN, se necesitaría recrear la tabla
    // Para down basta con eliminar el índice
  }
}
```

**Análisis:**
1. **Postgres:** `DROP COLUMN` funciona → reversible ✓
2. **SQLite:** Solo quita el índice, **la columna `seq` queda** → NO reversible ✗

**Contexto:**
- SQLite **SÍ soporta** `DROP COLUMN` desde la versión 3.35.0 (2021-03-12).
- El proyecto usa una versión moderna de SQLite (via better-sqlite3).
- Pero el comando requiere sintaxis especial o recrear la tabla.

**Estrategia SQLite para DROP COLUMN reversible:**

```sql
-- Opción 1: DROP COLUMN directo (requiere SQLite ≥3.35)
PRAGMA foreign_keys=off;
ALTER TABLE ventas DROP COLUMN seq;
PRAGMA foreign_keys=on;

-- Opción 2: Recrear tabla (compatible con cualquier versión)
BEGIN TRANSACTION;
CREATE TABLE ventas_new AS SELECT id, estado, ..., (todos menos seq) FROM ventas;
DROP TABLE ventas;
ALTER TABLE ventas_new RENAME TO ventas;
COMMIT;
```

**Recomendación:**
- Si el down **nunca se va a usar en producción** (política de solo-forward), dejar como está y documentar: "down no implementado para SQLite — solo Postgres".
- Si el down **debe funcionar** (para testing o rollback local), implementar la opción 2 (recrear tabla).

**Severidad:** P1 (no P0) porque:
- Las migraciones de este proyecto son **aditivas** (agregan columnas, no quitan).
- En producción **nunca se hace rollback de migraciones** (política establecida en `docs/MIGRATIONS.md`).
- El down sirve solo para **testing local** o limpiar bases de dev.

---

## 4. Inventario de Emitters: ¿Completo?

**Del test de auditoría (`test/sse-mesas-auditoria.spec.ts:126-148`):**

Lista esperada de 27 emitters:

```typescript
const inventarioEsperado = [
  // VentaItem (8)
  'createVentaItem', 'updateVentaItem', 'deleteVentaItem',
  'createVentaItemObservacion', 'deleteVentaItemObservacion',
  'createVentaItemAdicional', 'deleteVentaItemAdicional',
  'createVentaItemIngredienteModificacion', 'deleteVentaItemIngredienteModificacion',
  
  // Comanda (5)
  'createComanda', 'updateComanda', 'deleteComanda', 'abrirComanda', 'cerrarComanda',
  
  // Venta core (4)
  'createVenta', 'updateVenta', 'anularCobroParcial', 'cerrarVentasAbiertasMesa',
  
  // Mesa (1)
  'set-pdv-mesa-estado',
  
  // Transferencia (1)
  'transferir-venta-pdv',
  
  // Delivery (2)
  'delivery-convertir-modo', 'delivery-cancelar',
  
  // Pagos (2)
  'createPago', 'createPagoDetalle',
  
  // CPC (1)
  'cobrar-venta-credito',
];
```

**Verificación contra código real:**

```bash
$ grep -n "emitVentaCambio\|emitMesaCambio\|emitComandaCambio" electron/handlers/ventas.handler.ts
921:  await emitMesaCambio(dataSource, mesaId);          # set-pdv-mesa-estado
1055: await emitMesaCambio(manager, Number(mesaId));     # createVenta
1057: await emitComandaCambio(manager, data.comanda.id); # createVenta (comanda)
1471: await emitVentaCambio(dataSource, id);             # updateVenta
1684: await emitVentaCambio(dataSource, ventaId);        # createVentaItem
1736: await emitVentaCambio(dataSource, ventaId);        # updateVentaItem
1772: await emitVentaCambio(dataSource, ventaId);        # deleteVentaItem
1840: await emitVentaCambio(dataSource, (vItem.venta as any).id);  # createVentaItemObservacion
1867: await emitVentaCambio(dataSource, ventaId);        # deleteVentaItemObservacion
1911: await emitVentaCambio(dataSource, (vItem.venta as any).id);  # createVentaItemAdicional
(... continúa ...)
```

**Hallazgo:** ✅ **PASS** — Los emitters listados están presentes en el código.

**PERO:** Este inventario **asume** que el test de auditoría de regex es válido. Como vimos en §2.1, el test NO ejecuta los handlers → un emitter comentado pasaría igual.

---

## 5. Conclusión y Recomendaciones

### 5.1. Estado General: FAIL

| Componente | Estado | Prioridad | Bloqueante |
|------------|--------|-----------|------------|
| Tests conceptuales (`test/*.spec.ts`) | 🔴 No corren | P0 | ✅ SÍ |
| Test E2E (`test:mesa-una-venta-abierta`) | 🔴 Dependencia faltante | P0 | ✅ SÍ |
| Test de auditoría (regex) | 🔴 No discrimina | P0 | ✅ SÍ |
| Test de transporte SSE | 🔴 No existe | P0 | ✅ SÍ |
| Migraciones dual-driver | ✅ Correctas | — | ❌ NO |
| Migraciones SQLite `down` | 🟡 No reversible | P1 | ❌ NO |

**Veredict final:** 🔴 **NO APTO PARA MERGE** sin resolver los P0 de tests.

---

### 5.2. Plan de Remediación (Orden de Prioridad)

#### P0-1: Instalar ts-node y Verificar Test E2E Real

```bash
npm install --save-dev ts-node@10.9.1
npm run test:mesa-una-venta-abierta
```

**Resultado esperado:** `✓ 11   ✗ 0   Total: 11`

**Si falla:** Arreglar los guards que protegen el invariante.

---

#### P0-2: Escribir Test de Transporte SSE Real

Crear `scripts/test-sse-transport-e2e.ts`:

```typescript
/**
 * E2E: transporte SSE — conectar, emitir, recibir, seq.
 */
import 'reflect-metadata';
import { EventSource } from 'eventsource';  // npm i eventsource
import { startTestServer } from './_test-server-helper';

async function main() {
  const { server, ds, token } = await startTestServer();
  
  const eventos: any[] = [];
  const eventSource = new EventSource(`http://localhost:7070/api/pdv/mesas/stream?token=${token}`);
  
  eventSource.onmessage = (e) => eventos.push(JSON.parse(e.data));
  
  // Esperar conexión (readyState === 1)
  await waitForConnection(eventSource);
  
  // 1. Mutar mesa → debe emitir
  await invokeHandler('set-pdv-mesa-estado', 1, 'OCUPADO');
  await waitFor(() => eventos.length > 0);
  
  const evento1 = eventos[0];
  ok(evento1.tipo === 'MESA_CAMBIO', 'Tipo correcto');
  ok(evento1.mesaId === 1, 'Mesa ID correcto');
  ok(typeof evento1.seq === 'number', 'Seq presente');
  
  // 2. Mutar venta → debe emitir
  const venta = await invokeHandler('createVenta', { estado: 'ABIERTA', caja: { id: cajaId }, mesa: { id: 1 } });
  await waitFor(() => eventos.length > 1);
  
  const evento2 = eventos[1];
  ok(evento2.tipo === 'MESA_CAMBIO', 'Venta también emite MESA_CAMBIO');
  ok(evento2.mesaId === 1, 'Mismo mesaId');
  ok(evento2.seq > evento1.seq, 'Seq incrementa');
  
  // 3. Heartbeat: debe llegar : ping cada 25s (no testear los 25s, solo que el stream siga vivo)
  // (omitir por tiempo — confiar en el código de KDS que ya funciona)
  
  eventSource.close();
  await server.close();
  await ds.destroy();
  
  console.log('✅ SSE transport: PASS');
}

main().catch(e => { console.error('FAIL:', e); process.exit(1); });
```

Agregar script en `package.json`:

```json
"test:sse-transport": "ts-node --transpile-only --prefer-ts-exts --project tsconfig.typeorm.json scripts/test-sse-transport-e2e.ts"
```

---

#### P0-3: Convertir Test de Auditoría de Regex a Runtime

Reemplazar `test/sse-mesas-auditoria.spec.ts` por test de integración que:

1. Levante DataSource + handlers reales
2. Se suscriba a `mesaEvents.on('change', (payload) => eventos.push(payload))`
3. Invoque cada handler mutador del inventario
4. Verifique que el evento esperado llegó al listener

**No usar regex sobre código fuente.**

---

#### P0-4: Correr o Eliminar Tests Conceptuales

Dos opciones:

**Opción A:** Conectar a jest (recomendado si los tests aportan valor único).

```bash
npm install --save-dev jest @types/jest ts-jest
npx ts-jest config:init
```

`jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts'],
};
```

Agregar script:

```json
"test:sse-conceptual": "jest test/sse-mesas-*.spec.ts"
```

**Opción B:** Eliminar `test/*.spec.ts` si los tests E2E de `scripts/` cubren lo mismo.

---

#### P1-1: Documentar o Implementar Down SQLite (Opcional)

**Si down nunca se usa en prod:**

Agregar comentario en las 3 migraciones:

```typescript
// SQLite no soporta DROP COLUMN sin recrear la tabla.
// Como esta migración es aditiva y nunca se revierte en producción,
// el down solo quita el índice. Para rollback completo en dev, recrear la BD.
```

**Si down debe funcionar:**

Implementar la opción 2 (recrear tabla) en el `else` de SQLite.

---

### 5.3. Checklist para el Implementador

Antes de volver a pedir aprobación:

- [ ] `npm install --save-dev ts-node@10.9.1`
- [ ] `npm run test:mesa-una-venta-abierta` → ✅ PASS (11/11)
- [ ] Escribir `test:sse-transport` → ✅ PASS (conectar + emitir + recibir + seq)
- [ ] Convertir test de auditoría de regex a runtime con `mesaEvents.on('change', ...)`
- [ ] Eliminar o conectar `test/*.spec.ts` (jest.config.js + script npm)
- [ ] Documentar down SQLite no reversible (o implementar recrear tabla)
- [ ] Correr `npm run test:all` → ✅ todos verdes
- [ ] Re-auditar con agentes independientes

---

## 6. Contexto del Implementador

> "tests verdes (conceptuales)"

Esta frase apareció en la descripción del PR. **Un test que no se ejecuta no puede estar verde.** Los tests "conceptuales" que no corren son **código muerto** que da falsa sensación de cobertura.

**Regla de oro:** Si el test no está en CI (o al menos en `npm run test:all`), **no existe**.

---

## Anexo: Fragmentos de Código Relevantes

### A1. Test de Auditoría (Regex, No Runtime)

```typescript:83:124:test/sse-mesas-auditoria.spec.ts
it('Todos los handlers mutadores emiten SSE o están allowlisteados', () => {
  const archivos = [
    'ventas.handler.ts',
    'delivery.handler.ts',
    'compras.handler.ts',
    'cuentas-por-cobrar.handler.ts',
  ];

  const violaciones: string[] = [];

  for (const archivo of archivos) {
    const rutaCompleta = path.join(handlersPath, archivo);
    if (!fs.existsSync(rutaCompleta)) {
      console.warn(`⚠️  Archivo no encontrado: ${archivo}`);
      continue;
    }

    const contenido = fs.readFileSync(rutaCompleta, 'utf-8');
    const handlers = extraerHandlers(contenido);

    for (const handler of handlers) {
      if (ALLOWLIST.includes(handler)) continue;

      const muta = handlerMuta(contenido, handler);
      const emite = handlerEmite(contenido, handler);

      if (muta && !emite) {
        violaciones.push(`${archivo}::${handler}`);
      }
    }
  }

  if (violaciones.length > 0) {
    fail(
      `❌ Handlers mutadores SIN emisión SSE:\n` +
      violaciones.map(v => `  - ${v}`).join('\n') +
      `\n\n📋 Agregar emitVentaCambio/emitMesaCambio/emitComandaCambio o allowlistear.`
    );
  }

  console.log(`✅ Auditoría SSE: todos los mutadores emiten o están allowlisteados`);
});
```

**Problema:** Usa `fs.readFileSync` + regex `/emit(Venta|Mesa|Comanda)Cambio/.test(bloqueHandler)` — NO ejecuta el handler.

---

### A2. Test de Cliente (Mock Unitario)

```typescript:18:32:test/sse-mesas-cliente.spec.ts
function mergeMesaSelectiva(
  actual: MesaStub,
  nueva: MesaStub,
  esSeleccionada: boolean
): MesaStub {
  if (esSeleccionada) {
    // Merge parcial: actualizar estado pero NO .venta
    const { venta: _ventaIgnorada, ...sinVenta } = nueva;
    return { ...actual, ...sinVenta };
  } else {
    // Merge completo
    return { ...nueva };
  }
}
```

**Problema:** Mock de la lógica de merge — válido, pero **no testea transporte SSE**.

---

### A3. Migración AddSeqToVenta (Down Parcial)

```typescript:30:40:src/app/database/migrations/1789151316209-AddSeqToVenta.ts
public async down(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`DROP INDEX IF EXISTS "idx_seq_venta"`);
  
  const driverType = queryRunner.connection.options.type;
  if (driverType === 'postgres') {
    await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "seq"`);
  } else {
    // SQLite no soporta DROP COLUMN, se necesitaría recrear la tabla
    // Para down basta con eliminar el índice
  }
}
```

**Problema:** En SQLite, la columna `seq` **queda** tras el down.

---

### A4. Cliente PDV: Merge Selectivo de Mesa Seleccionada

```typescript:3286:3298:src/app/pages/ventas/pdv/pdv.component.ts
if (idx >= 0) {
  // NO pisar .venta de selectedPdvMesa (ref línea ~775)
  if (this.selectedPdvMesa?.id === id) {
    // Merge parcial: actualizar estado, número, etc. pero NO .venta
    const { venta: _ventaIgnorada, ...sinVenta } = nueva as any;
    Object.assign(this.mesas[idx], sinVenta);
    this.selectedPdvMesa = this.mesas[idx];
  } else {
    this.mesas[idx] = this.derivarEstadoVisual(nueva);
    if (this.selectedMesa?.id === id) {
      this.selectedMesa = this.mesas[idx];
    }
  }
}
```

**Análisis:** La lógica está implementada correctamente en el código real. El test unitario la verifica. **Falta:** test E2E que conecte EventSource y reciba eventos reales.

---

### A5. Emitir SSE: `mesa-emit.utils.ts`

```typescript:17:37:electron/utils/mesa-emit.utils.ts
export async function emitMesaCambio(
  ds: DataSource | EntityManager,
  mesaId: number,
): Promise<void> {
  const manager = ds instanceof DataSource ? ds.manager : ds;

  // Incrementar seq
  await manager.query(
    `UPDATE pdv_mesas SET seq = COALESCE(seq, 0) + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [mesaId],
  );

  // Leer el seq actualizado para el evento
  const result = await manager.query(`SELECT seq FROM pdv_mesas WHERE id = ?`, [mesaId]);
  const seq = result[0]?.seq ?? Date.now();

  broadcastMesaEvent({
    tipo: 'MESA_CAMBIO',
    mesaId,
    seq,
    updatedAt: new Date().toISOString(),
  });
}
```

**Análisis:** Implementación correcta del incremento de `seq` + broadcast. **Falta:** test que verifique que `broadcastMesaEvent` llega al cliente.

---

### A6. Broadcast a IPC + EventEmitter

```typescript:42:56:electron/utils/mesa-events.utils.ts
export function broadcastMesaEvent(payload: MesaEventPayload): void {
  try {
    mesaEvents.emit('change', payload);
  } catch (e) {
    console.warn('[mesa-events] emit interno falló:', e);
  }
  try {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send('mesa-updates', payload);
      }
    }
  } catch (e) {
    console.warn('[mesa-events] broadcast IPC falló:', e);
  }
}
```

**Análisis:** Dual broadcast (IPC + EventEmitter). **Falta:** test que verifique:
1. El EventEmitter llega al stream SSE de Fastify
2. El IPC llega a los renderers Electron

---

## Cierre

Este documento identifica **4 bloqueantes P0** en el eje de tests:

1. Tests conceptuales no corren (sin jest.config ni script npm)
2. Test E2E real no corre (ts-node faltante)
3. Test de auditoría no discrimina (regex sobre código, no runtime)
4. No existe test de transporte SSE (EventSource real)

Y **1 hallazgo P1** en migraciones:

5. Down SQLite no reversible (solo quita índice, no columna)

**Recomendación final:** Resolver los P0 antes de aprobar el merge. Los tests son la única garantía de que el SSE funciona; sin ellos, el PR entrega código no verificable.

---

**Firmado:** Cloud Agent (solo-lectura)  
**Fecha:** 2026-09-11 18:46 UTC
