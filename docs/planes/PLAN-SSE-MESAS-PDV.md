# Plan: SSE para Mesas y Comandas del PdV

**Fecha:** 2026-09-11  
**Autor:** Cloud Agent (cursor/plan-sse-mesas-pdv-64d5)  
**Estado:** Draft → Enmendado (2026-09-11, auditorías A+B)  
**PR objetivo:** `develop` (#302)

---

## Enmiendas (post-auditorías A+B)

**Aplicadas 2026-09-11 antes de implementar:**

### P0/P1 Auditoría A

1. **✅ `delivery-convertir-modo` SÍ emite** — muta `venta.costoDelivery` (cambia total).
2. **✅ `registrarCobroParcial` NO emite** — solo taguea `PagoDetalle`; el creador de la línea (`createPagoDetalle`) ya emitió. **Aclarado en inventario.**
3. **✅ `anularCobroParcial` SÍ emite** — libera ítems (`montoCubierto` baja → estado PAGADO→PARCIAL/PENDIENTE).
4. **✅ Test de auditoría continua** — falla si un handler que muta Venta/PdvMesa/Comanda no llama `broadcastMesaEvent`, con allowlist explícita de los que NO deben (ej: `registrarCobroParcial`, CRUD config).

### P0/P1 Auditoría B

1. **✅ Inventario completado** — pagos (`compras.handler.ts`), cobro parcial, CPC (`cuentas-por-cobrar.handler.ts`).
2. **✅ Fase 5 mobile fuera** — mobile no lista mesas en vivo (carga al entrar + botón). Follow-up post-#302.
3. **✅ Línea `refreshMesasSilent` corregida** — 775, no 797. PR #300 mergeado en `9bb4cded`.
4. **✅ `seq` con índice** — migraciones SQLite+Postgres escriben `CREATE INDEX idx_seq_<tabla> ON <tabla>(seq)`. Emitir DENTRO de `withMesaLock` (orden garantizado).
5. **✅ Tests no tautológicos** — al menos un test de transporte SSE real (conectar + emitir + recibir), no solo mock de `broadcastMesaEvent`.
6. **✅ Cloudflare confirmado** — `X-Accel-Buffering: no` obligatorio; timeout idle ~60s → heartbeat 25s (como KDS).
7. **✅ Migraciones reales escritas** — SQLite + Postgres, no solo nombradas.

---

## Contexto / Problema

El PdV desktop actualmente refresca mesas y comandas con **polling cada 1 segundo** (`pdv.component.ts:567-569`):

```typescript
this.mesasRefreshInterval = setInterval(() => {
  this.refreshMesasSilent();
  this.refreshComandasSilent();
}, 1000);
```

**Impacto operativo:**
- Con **N terminales** en el mismo local, cada una genera **2 queries/seg** (mesas + comandas).
- 5 terminales = 10 queries/seg = 36.000 queries/hora solo del polling.
- `getPdvMesas` trae **todas las mesas con sus ventas y ítems** en cada poll (~220ms en instalaciones reales).
- Latencia de cambios: hasta 1 segundo entre que A cobra y B ve la mesa libre.
- **No escala:** agregar más terminales multiplica la carga sin beneficio; el cambio ya ocurrió.

**Por qué no es tolerable:**
- La carga del polling es **proporcional al número de cajas abiertas**, no al ritmo real de cambios.
- En una jornada tranquila (2 mesas ocupadas de 30), las terminales recargan las 30 cada segundo.
- El KDS **ya demostró** que SSE elimina este problema: desde F3 (2026-07) las pantallas de cocina operan con eventos puntuales y no tienen el polling de respaldo (solo al reconectar).

---

## Diseño

### Patrón KDS reutilizable

Replicar el flujo de `kds-sse-routes.ts` + `comanda-events.utils.ts`:

1. **Carga completa inicial** al abrir el PdV y al reconectar el stream:
   - `getPdvMesas` / `getComandas` (como hoy).
2. **Stream SSE** (`/api/mesas-pdv/stream`) que emite **eventos de cambio**:
   - Tipo: `'MESA'` o `'COMANDA'`.
   - Payload: `{ tipo, mesaId?, comandaId?, seq }`.
3. **Cliente recarga solo el ítem afectado**:
   - Evento con `mesaId` → `getPdvMesa(id)`.
   - Evento con `comandaId` → `getComanda(id)`.
4. **Coalescer de ráfagas** (varios ítems en 2s → un solo patch).
5. **Seq / updatedAt** para descartar eventos viejos.
6. **Fallback de 10–15s** solo si el stream está caído (no en paralelo con el SSE).

### Bus de eventos

**Nuevo `mesa-events.utils.ts`** (o generalizar `comanda-events.utils.ts`):

```typescript
export type MesaEventTipo = 'MESA_CAMBIO' | 'COMANDA_CAMBIO';

export interface MesaEventPayload {
  tipo: MesaEventTipo;
  mesaId?: number;
  comandaId?: number;
  seq: number;         // para orden
  updatedAt: string;   // ISO timestamp
}

export const mesaEvents = new EventEmitter();
mesaEvents.setMaxListeners(50);

export function broadcastMesaEvent(payload: MesaEventPayload): void {
  try {
    mesaEvents.emit('change', payload);
  } catch (e) {
    console.warn('[mesa-events] emit interno falló:', e);
  }
  // También por IPC para Electron desktop (futura expansión):
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

**Seq:** contador global incremental (puede ser `Date.now()` o un contador en memoria). Permite al cliente descartar un evento que llegó después de un refresh manual más reciente.

### Ruta SSE

**`electron/server/mesa-sse-routes.ts`:**

```typescript
export function registerMesaSseRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/mesas-pdv/stream', async (request, reply) => {
    const q = request.query as any;

    // Auth por token efímero (igual que KDS)
    const verificacion = await consumirStreamToken((q?.token || '').toString(), 'pdv');
    if (!verificacion.ok) {
      console.warn('[mesa-sse] conexión rechazada:', verificacion.motivo);
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    // Cabeceras SSE + control del socket
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',  // ← crucial para Cloudflare/nginx
    });
    reply.raw.write('retry: 3000\n\n');

    const onChange = (payload: MesaEventPayload) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch { /* socket cerrado */ }
    };
    mesaEvents.on('change', onChange);

    // Heartbeat cada ~25s (Cloudflare cierra conexiones idle ~100s)
    const ping = setInterval(() => {
      try { reply.raw.write(': ping\n\n'); } catch { /* noop */ }
    }, 25_000);

    const cleanup = () => {
      clearInterval(ping);
      mesaEvents.off('change', onChange);
    };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);

    reply.hijack();
  });
}
```

### Cloudflare / túnel

- **`X-Accel-Buffering: no`** es obligatorio: sin esto nginx bufferiza el stream y los eventos llegan en bloques cada ~60s.
- **Heartbeat de 25s** mantiene viva la conexión; Cloudflare cierra conexiones idle después de ~100s.
- El timeout largo (retry 3s, reconexión exponencial del cliente) es tolerable: el cambio ya ocurrió, el delay es solo visual.

### Mesa seleccionada en edición: NO pisar

**Regla existente en `refreshMesasSilent` (línea 775, PR #300 mergeado en `9bb4cded`):**

```typescript
// Actualizar venta solo si no es la mesa seleccionada (para no pisar datos en edición)
if (!this.selectedMesa || this.selectedMesa.id !== mesaLocal.id) {
  mesaLocal.venta = mesaFresca.venta;
}
```

**El SSE debe respetar esta regla:** al recibir un evento de la mesa seleccionada, aplicar el mismo merge parcial. El guard de `#300` (MESA_YA_TIENE_VENTA_ABIERTA) permanece inalterado.

### Coalescer

Implementar en el cliente (TypeScript):

```typescript
private pendingMesaRefreshes = new Set<number>();
private pendingComandaRefreshes = new Set<number>();
private coalesceTimer: any;

private scheduleMesaRefresh(mesaId: number) {
  this.pendingMesaRefreshes.add(mesaId);
  this.scheduleCoalesce();
}

private scheduleCoalesce() {
  if (this.coalesceTimer) return;
  this.coalesceTimer = setTimeout(() => {
    this.flushPendingRefreshes();
    this.coalesceTimer = null;
  }, 2000);
}

private async flushPendingRefreshes() {
  const mesaIds = Array.from(this.pendingMesaRefreshes);
  const comandaIds = Array.from(this.pendingComandaRefreshes);
  this.pendingMesaRefreshes.clear();
  this.pendingComandaRefreshes.clear();

  await Promise.all([
    ...mesaIds.map(id => this.refreshSingleMesa(id)),
    ...comandaIds.map(id => this.refreshSingleComanda(id)),
  ]);
}
```

---

## Inventario de mutadores que DEBEN emitir

**Método:** `grep -r "ipcMain.handle" electron/handlers/*.handler.ts` + revisión manual del código real.

### A. Handlers en `ventas.handler.ts`

| Handler | Línea | Emite | Razón |
|---------|-------|-------|-------|
| `createVenta` | 986 | `MESA_CAMBIO` | Marca la mesa OCUPADO |
| `updateVenta` | 1323 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Estado ABIERTA→CONCLUIDA, CANCELADA |
| `deleteVenta` | 1541 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Libera contenedor |
| `createVentaItem` | 1614 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Suma ítem → total cambia |
| `updateVentaItem` | 1662 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Cantidad/precio cambia → total |
| `deleteVentaItem` | 1695 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Resta ítem → total |
| `createVentaItemObservacion` | 1746 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Personalización visible |
| `deleteVentaItemObservacion` | 1771 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Idem |
| `createVentaItemAdicional` | 1802 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Precio adicional |
| `deleteVentaItemAdicional` | 1814 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Idem |
| `createVentaItemIngredienteModificacion` | 1842 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Personalización |
| `deleteVentaItemIngredienteModificacion` | 1854 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Idem |
| `cerrarVentasAbiertasMesa` | 882 | `MESA_CAMBIO` | Cierra venta + libera mesa |
| `transferir-venta-pdv` | 2937 | `MESA_CAMBIO` × 2 (origen y destino) | Mueve venta/ítems entre contenedores |
| `set-pdv-mesa-estado` | 2546 | `MESA_CAMBIO` | Ocupar/liberar manual |
| `registrarCobroParcial` | 4271 | **NO emite** | Solo taguea PagoDetalle; el creador (`createPagoDetalle`) ya emitió |
| `anularCobroParcial` | 4387 | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Libera ítems (montoCubierto baja) |
| `createPdvMesa` | 2503 | No emite (config) | — |
| `updatePdvMesa` | 2970 | No emite (config) | Solo renombrar/sector |
| `deletePdvMesa` | 2985 | No emite (config) | — |
| `createComanda` | 3064 | `COMANDA_CAMBIO` | Abre comanda nueva |
| `updateComanda` | 3082 | `COMANDA_CAMBIO` | Cambia observación/mesa |
| `deleteComanda` | 3140 | `COMANDA_CAMBIO` | — |
| `abrirComanda` | 3155 | `COMANDA_CAMBIO` + `MESA_CAMBIO` (si vinculada) | DISPONIBLE→OCUPADO |
| `cerrarComanda` | 3237 | `COMANDA_CAMBIO` + `MESA_CAMBIO` (si vinculada) | OCUPADO→DISPONIBLE |
| `materializar-pedido-online-en-venta` | 1657 | `MESA_CAMBIO` | Crea ítems de pedido web |

### B. Handlers en `delivery.handler.ts`

| Handler | Emite | Razón |
|---------|-------|-------|
| `delivery-crear` | `MESA_CAMBIO` (si tiene mesa) | Crea venta + vincula a mesa (modo RETIRO con mesa) |
| `delivery-actualizar-datos` | No emite | Solo datos del cliente (nombre/teléfono/dirección) |
| `delivery-cambiar-estado` | No emite | Estado interno del delivery (timestamps) |
| `delivery-asignar-repartidor` | No emite | — |
| `delivery-cancelar` | `MESA_CAMBIO` (si tiene mesa) | Venta→CANCELADA (libera mesa) |
| `delivery-convertir-modo` | `MESA_CAMBIO` (si tiene mesa) | **Muta `venta.costoDelivery`** → total cambia |

### C. Handlers en `compras.handler.ts`

| Handler | Emite | Razón |
|---------|-------|-------|
| `createPago` | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Registra dinero cobrado |
| `updatePago` | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Ajuste/anulación |
| `createPagoDetalle` | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Línea de cobro |
| `updatePagoDetalle` | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Editar línea |
| `deletePagoDetalle` | `MESA_CAMBIO` o `COMANDA_CAMBIO` | Borrar línea |

### D. Handlers en `cuentas-por-cobrar.handler.ts`

| Handler | Emite | Razón |
|---------|-------|-------|
| `cobrarVentaCredito` | `MESA_CAMBIO` | Cierra venta (CONCLUIDA) + crea CPC |

### E. Handlers en `convenios.handler.ts` / `pago-consolidado.handler.ts`

No tocan mesas del PdV directamente (operan sobre Caja Mayor).

### F. Helper transaccional: `transferirVentaPdvEnTx`

**`electron/utils/transferencia-pdv.utils.ts` (inferido del código):**

Llama `sincronizarEstadoMesaEnTx` al final → ya emite indirectamente si ese helper se actualiza para emitir.

### G. Funciones internas que sincronizan estado

- **`sincronizarEstadoMesaEnTx`** (`electron/utils/mesa-estado.utils.ts`): debe emitir `MESA_CAMBIO` al final de la transacción si el estado derivado cambió.
- **`cerrarComandaEnTx`**: debe emitir `COMANDA_CAMBIO` + `MESA_CAMBIO` (si vinculada).

**Total estimado:** ~27 puntos de emisión (algunos condicionales: solo si la venta tiene mesa/comanda).

**Allowlist de NO-emisión (verificada por test de auditoría continua):**
- `registrarCobroParcial` — solo taguea; el creador de la línea ya emitió.
- CRUD de config (createPdvMesa, updatePdvMesa, deletePdvMesa, createPdvConfig, updatePdvConfig) — no afectan estado operativo de mesas.
- Getters (getPdvMesas, getVenta, etc.) — solo lectura.

---

## Fases de implementación

### Fase 1: Infraestructura base (sin romper nada)

**Archivos:**
- `electron/utils/mesa-events.utils.ts` — bus de eventos + `broadcastMesaEvent`.
- `electron/server/mesa-sse-routes.ts` — ruta SSE (`/api/pdv/mesas/stream`, token contexto `'pdv'`).
- `electron/utils/stream-token.utils.ts` — agregar contexto `'pdv'` (ya existe para `'kds'`).
- `src/app/database/entities/ventas/venta.entity.ts` — agregar `seq: number` (nullable, default null).
- `src/app/database/entities/ventas/pdv-mesa.entity.ts` — agregar `seq: number` (nullable, default null).
- `src/app/database/entities/ventas/comanda.entity.ts` — agregar `seq: number` (nullable, default null).
- **Migraciones SQLite+Postgres:**
  - `AddSeqToVenta` — columna + índice `idx_seq_venta`.
  - `AddSeqToPdvMesa` — columna + índice `idx_seq_pdv_mesa`.
  - `AddSeqToComanda` — columna + índice `idx_seq_comanda`.
- Registrar ruta SSE en `main.ts` (después de `registerKdsSseRoutes`).

**Test:**
- Verificar que el stream se abre y envía heartbeats.
- Emitir manualmente un evento y verificar que llega al cliente.

**Criterio de done:** Stream SSE funcional sin consumidores reales.

---

### Fase 2: Emisión desde ~5 mutadores clave

**Prioridad:** handlers más frecuentes.

| Handler | Dónde emitir |
|---------|--------------|
| `createVentaItem` | Al final del `try`, tras `autoPrintComandaIfNeeded` |
| `updateVenta` (CONCLUIDA) | Al final del `try`, tras hook KDS |
| `cerrarVentasAbiertasMesa` | Al final del `try`, tras liberar mesa |
| `transferir-venta-pdv` | Al final del `try`, tras commit |
| `set-pdv-mesa-estado` | Al final del `try`, tras `sincronizarEstadoMesaEnTx` |

**Lógica de emisión (ejemplo en `createVentaItem`):**

```typescript
// Al final del try, justo antes del return
const venta = await repoVenta.findOne({ where: { id: data.venta }, relations: ['mesa', 'comanda'] });
if (venta?.mesa) {
  await incrementarSeq(dataSource, 'pdv_mesas', venta.mesa.id);
  broadcastMesaEvent({
    tipo: 'MESA_CAMBIO',
    mesaId: venta.mesa.id,
    seq: Date.now(),
    updatedAt: new Date().toISOString(),
  });
} else if (venta?.comanda) {
  await incrementarSeq(dataSource, 'comandas', venta.comanda.id);
  broadcastMesaEvent({
    tipo: 'COMANDA_CAMBIO',
    comandaId: venta.comanda.id,
    seq: Date.now(),
    updatedAt: new Date().toISOString(),
  });
}
```

Helper `incrementarSeq`:

```typescript
async function incrementarSeq(ds: DataSource, tabla: string, id: number): Promise<void> {
  await ds.query(`UPDATE ${tabla} SET seq = COALESCE(seq, 0) + 1, updated_at = NOW() WHERE id = ?`, [id]);
}
```

**Test:**
- Agregar un ítem → verificar que el evento llega.
- Verificar que el `seq` se incrementa en BD.

**Criterio de done:** Los 5 handlers emiten correctamente.

---

### Fase 3: Completar emisión (~20 puntos restantes)

Aplicar el mismo patrón a todos los handlers del inventario.

**Casos especiales:**

- **Transferir venta:** emite 2 eventos (origen + destino).
- **Materializar pedido online:** emite 1 evento (la mesa destino).
- **Cobro:** `createPago` / `createPagoDetalle` deben leer `venta.mesa` / `venta.comanda` (no siempre están cargadas).
- **Delivery:** solo emitir si `delivery.modo === 'RETIRO'` y tiene mesa vinculada (un delivery puro no tiene mesa).

**Test por cada handler:** verificar que la mutación emite el evento esperado.

**Criterio de done:** Todos los mutadores del inventario emiten.

---

### Fase 4: Cliente SSE en `pdv.component.ts`

**Cambios:**

1. **Reemplazar el `setInterval` de 1s:**

```typescript
// BORRAR (líneas 566-569):
// this.mesasRefreshInterval = setInterval(() => {
//   this.refreshMesasSilent();
//   this.refreshComandasSilent();
// }, 1000);

// AGREGAR:
this.connectMesaStream();

// Fallback de 10s solo si el stream muere:
this.mesasFallbackInterval = setInterval(() => {
  if (!this.mesaStreamConnected) {
    console.warn('[pdv] Stream SSE caído, polling fallback');
    this.refreshMesasSilent();
    this.refreshComandasSilent();
  }
}, 10_000);
```

2. **Conexión SSE:**

```typescript
private mesaStreamConnected = false;
private mesaEventSource: EventSource | null = null;

private async connectMesaStream(): Promise<void> {
  const token = await firstValueFrom(this.repositoryService.getStreamToken('pdv'));
  const url = `${this.apiBaseUrl}/api/mesas-pdv/stream?token=${token}`;

  this.mesaEventSource = new EventSource(url);

  this.mesaEventSource.onopen = () => {
    console.log('[pdv] Stream SSE conectado');
    this.mesaStreamConnected = true;
  };

  this.mesaEventSource.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data);
      this.handleMesaEvent(payload);
    } catch (err) {
      console.error('[pdv] Error parseando evento SSE:', err);
    }
  };

  this.mesaEventSource.onerror = () => {
    console.warn('[pdv] Stream SSE error, reconectando...');
    this.mesaStreamConnected = false;
    this.mesaEventSource?.close();
    setTimeout(() => this.connectMesaStream(), 3000);
  };
}

private handleMesaEvent(payload: MesaEventPayload): void {
  if (payload.tipo === 'MESA_CAMBIO' && payload.mesaId) {
    this.scheduleMesaRefresh(payload.mesaId);
  } else if (payload.tipo === 'COMANDA_CAMBIO' && payload.comandaId) {
    this.scheduleComandaRefresh(payload.comandaId);
  }
}
```

3. **Coalescer** (como diseñado arriba).

4. **`refreshSingleMesa(id)`:**

```typescript
private async refreshSingleMesa(mesaId: number): Promise<void> {
  try {
    const mesaFresca = await firstValueFrom(this.repositoryService.getPdvMesa(mesaId));
    const idx = this.mesas.findIndex(m => m.id === mesaId);
    if (idx === -1) {
      // Mesa nueva, agregar
      this.mesas.push(mesaFresca);
    } else {
      // Mesa existente, merge
      if (this.selectedPdvMesa?.id === mesaId) {
        // NO pisar venta de la mesa seleccionada
        const ventaActual = this.selectedPdvMesa.venta;
        Object.assign(this.selectedPdvMesa, mesaFresca);
        this.selectedPdvMesa.venta = ventaActual;
        this.estamparMesa(this.selectedPdvMesa);
      } else {
        this.mesas[idx] = mesaFresca;
      }
    }
    this.mesas.sort((a, b) => a.numero - b.numero);
    this.estamparMesa(mesaFresca);
  } catch (err) {
    console.error('[pdv] Error refrescando mesa:', err);
  }
}
```

5. **Idem para comandas.**

6. **Cleanup en `ngOnDestroy`:**

```typescript
ngOnDestroy() {
  if (this.mesasRefreshInterval) clearInterval(this.mesasRefreshInterval);
  if (this.mesasFallbackInterval) clearInterval(this.mesasFallbackInterval);
  if (this.mesaEventSource) this.mesaEventSource.close();
  // ...
}
```

**Test:**
- Abrir 2 terminales del PdV.
- En A: agregar ítem a mesa 5.
- En B: verificar que mesa 5 se actualiza en <3s (sin esperar al próximo poll).
- Apagar el server Fastify, verificar que entra el fallback de 10s.
- Reencender, verificar que el stream se reconecta.

**Criterio de done:** El polling de 1s ya no existe; el SSE es el camino principal.

---

### Fase 5: Mobile PWA (si ya lista mesas en vivo)

El cliente mobile (`projects/mobile`) **también tiene polling** si ya implementó listas de mesas en vivo (a verificar).

Si no, **anotar como follow-up** y completar desktop primero.

**Diferencias:**
- `EventSource` es nativo del browser (funciona igual).
- La ruta `/api/mesas-pdv/stream` es accesible vía HTTP (mismo que el RPC).
- El coalescer es el mismo patrón TypeScript.

---

## Tests

### Unit tests (Jest)

**`electron/utils/mesa-events.utils.spec.ts`:**
- Emitir evento → verificar que llega al listener.
- Múltiples listeners → todos reciben el evento.
- Listener con error → no rompe a los demás.

**`electron/server/mesa-sse-routes.spec.ts`:**
- Conectar sin token → 401.
- Conectar con token válido → 200 + Content-Type text/event-stream.
- **Emitir evento → llega por el stream (transporte SSE real, NO solo mock).**
- Heartbeat → llega cada ~25s.
- `X-Accel-Buffering: no` presente en headers.

### Integration tests (handler-level)

**`npm run test:mesa-sse-emision`** (nuevo):

Para cada handler del inventario:
- Ejecutar la mutación.
- Verificar que `broadcastMesaEvent` fue llamado con el payload correcto.
- Verificar que `seq` se incrementó en BD.

Casos:
- `createVentaItem` en venta con mesa → evento `MESA_CAMBIO`.
- `createVentaItem` en venta con comanda → evento `COMANDA_CAMBIO`.
- `transferir-venta-pdv` → 2 eventos (origen + destino).
- `updateVenta` ABIERTA→CONCLUIDA → evento con el contenedor correcto.
- `set-pdv-mesa-estado` DISPONIBLE→OCUPADO → evento.
- `anularCobroParcial` → evento (libera ítems).
- `delivery-convertir-modo` → evento (muta costoDelivery).
- **`registrarCobroParcial` NO emite** (solo taguea).

**Test de auditoría continua (`npm run test:auditoria-emitters`):**
- Escanea todos los handlers que mutan `Venta`, `PdvMesa`, `Comanda`.
- Verifica que llaman `broadcastMesaEvent` **O** están en la allowlist.
- **Falla si un mutador nuevo no emite y no está en allowlist** (auditoría automática).

**Cobertura esperada:** ≥85%.

### E2E tests

**Manual (checklist en `docs/testing/TESTING-CHECKLIST-SSE-MESAS-PDV.md`):**

1. **Latencia de cambios:**
   - Terminal A: agregar ítem a mesa 5.
   - Terminal B: verificar que mesa 5 se actualiza en <3s.
   - Medir con cronómetro: A → acción; B → cambio visible.

2. **Coalescer:**
   - Terminal A: agregar 5 ítems rápido (dentro de 2s).
   - Terminal B: verificar que recibe 1 solo refresh (no 5).

3. **Mesa seleccionada:**
   - Terminal A: seleccionar mesa 3, editar ítems (sin guardar).
   - Terminal B: cobrar mesa 3.
   - Terminal A: verificar que los cambios locales NO se pierden (la venta sigue en edición).

4. **Fallback:**
   - Apagar Fastify.
   - Verificar que el PdV sigue funcionando (fallback de 10s).
   - Reencender, verificar reconexión.

5. **Reconexión:**
   - Desconectar WiFi de una terminal por 10s.
   - Reconectar, verificar que el stream se restablece automáticamente.

6. **No reabrir hueco #300:**
   - Mesa 10 con venta ABIERTA.
   - Terminal A: crear venta en mesa 10 → rechazado con `MESA_YA_TIENE_VENTA_ABIERTA`.
   - Verificar que el SSE no debilita este guard.

### Regresión

**Verificar que el comportamiento actual NO cambia:**

- Mesa con venta ABIERTA → color naranja (no verde ni amarillo).
- Mesa sin venta + comandas → badge con número de comandas.
- Transferir ítems de mesa 3 a mesa 8 → mesa 3 sigue ocupada (la gente sigue sentada).
- Cobro en terminal ajena (si permitido por config) → evento se propaga.

---

## Permisos

### Token de stream

El stream usa **`stream-token`** (token efímero de un solo uso) en vez del JWT de sesión:

- **Por qué:** `EventSource` del navegador no permite mandar headers custom. El token va en query string (`?token=...`), que queda en logs de acceso, historial del navegador y proxies.
- **Mecanismo:** RPC `stream-token` emite un token válido por 5 minutos con contexto `'pdv'`. `consumirStreamToken` lo valida y lo marca usado (un solo uso).
- **Quién puede:** cualquier usuario autenticado con `VENTAS_PDV` puede obtener un token.

### RPC vs stream

- **`/api/rpc` es default-allow:** con un JWT válido de `VENTAS_PDV`, el cliente puede invocar cualquier handler de mesas/ventas.
- **Los handlers llevan `ensurePermission('VENTAS_PDV')`** como primera línea del `try`. Esa es la ÚNICA frontera real.
- **El stream NO hace control de permisos adicional:** solo valida el token efímero. Una vez conectado, el cliente recibe TODOS los eventos de mesas/comandas (no filtra por caja ni sector).

**Implicación:** un mozo con acceso al PdV ve cambios en todas las mesas del local, no solo las de su sector. Eso ya es así hoy (el poll no filtra), y es correcto operativamente: si la mesa 12 (sector Terraza) se libera, el mozo de Salón debe verlo para reasignar al cliente que espera.

---

## Cloudflare / SSE gotchas

### 1. Buffer de proxy

**Problema:** nginx (y otros proxies inversos) bufferiza las respuestas por defecto. Un SSE bufferizado acumula eventos por ~60s y luego los envía en ráfagas.

**Solución:** `X-Accel-Buffering: no` en las cabeceras de respuesta. Cloudflare y nginx lo respetan.

### 2. Timeout de conexión idle

**Problema:** Cloudflare cierra conexiones TCP idle después de ~100s. Sin tráfico, el stream muere y el cliente no se entera hasta el próximo evento (que nunca llega).

**Solución:** Heartbeat cada 25s (comentario SSE `: ping\n\n`). Mantiene viva la conexión sin payload útil.

### 3. Cliente reconecta automáticamente

`EventSource` del navegador reconecta automáticamente tras un error de red, pero con **backoff exponencial** (empieza en 3s, puede llegar a 30s+). El PdV debe:
- Detectar la desconexión (`onerror`).
- Cerrar el `EventSource` viejo.
- Crear uno nuevo con `setTimeout` de 3s.

### 4. Carga inicial tras reconexión

Al reconectar, el cliente perdió eventos. **Solución:** el `onopen` del stream dispara un `refreshMesasSilent` + `refreshComandasSilent` completo (carga todo de nuevo). Después vuelve al flujo de eventos puntuales.

### 5. Cors

La ruta `/api/mesas-pdv/stream` debe tener `Access-Control-Allow-Origin: *` (o el origin del cliente). El servidor Fastify ya lo hace para `/api/rpc`, aplicar lo mismo al stream.

---

## Docs a actualizar

### 1. `domains/ventas-pdv.md`

Agregar sección **"Actualización en tiempo real (SSE)"** después de "Utilitarios PdV":

```markdown
## Actualización en tiempo real (SSE) (2026-09)

El PdV desktop (y PWA) usa **Server-Sent Events** para recibir cambios de mesas y comandas sin polling.

### Flujo

1. **Carga inicial:** `getPdvMesas` / `getComandas` al abrir el PdV.
2. **Stream SSE:** `GET /api/mesas-pdv/stream?token=...` (token efímero).
3. **Eventos:** cada mutación que afecta una mesa/comanda emite un evento con `{ tipo, mesaId?, comandaId?, seq }`.
4. **Cliente recarga el ítem:** `getPdvMesa(id)` o `getComanda(id)` (~220ms).
5. **Coalescer:** varios eventos en 2s → un solo patch.
6. **Fallback:** si el stream cae, poll de 10s como respaldo.

### Por qué no más polling de 1s

- 5 terminales × 2 queries/seg = 36.000 queries/hora sin cambios reales.
- Latencia de hasta 1s entre acción y visibilidad.
- No escala: más terminales = más carga, sin beneficio.

### Regla: mesa seleccionada NO se pisa

Al recibir un evento de la mesa seleccionada, el merge es parcial (no se sobreescribe `.venta`). El cajero puede estar editando y un refresh concurrente borraría cambios no guardados.

Ver `pdv.component.ts:797` (`refreshMesasSilent`).
```

### 2. `domains/kds.md` (cocina-impresion.md)

Agregar referencia cruzada:

```markdown
El patrón SSE del KDS (Fase 3, `kds-sse-routes.ts` + `comanda-events.utils.ts`) fue la base para el sistema de actualización en tiempo real del PdV (2026-09). Ver `domains/ventas-pdv.md`.
```

### 3. `architecture/cliente-servidor.md`

Actualizar sección **"Rutas Fastify"** para incluir `/api/mesas-pdv/stream`.

### 4. `reference/known-bugs.md`

**Si se detecta un bug durante la implementación**, agregarlo con:
- Descripción.
- Impacto (C/M/A/B).
- Workaround (si existe).
- Issue de GitHub (si aplica).

---

## Reinicio de la app

**SÍ, reinicio obligatorio.**

Los cambios tocan:
- `electron/handlers/ventas.handler.ts` (emisión en ~20 handlers).
- `electron/server/mesa-sse-routes.ts` (nueva ruta Fastify).
- `electron/utils/mesa-events.utils.ts` (nuevo bus de eventos).
- `main.ts` (registrar la ruta SSE en el servidor Fastify).

**Hot reload de Angular NO alcanza:** los handlers y el servidor Fastify viven en el main process de Electron.

**Instrucción al usuario:**
> "Este cambio modifica el backend (handlers + servidor Fastify). Reiniciá la app para aplicar los cambios. Si usás `npm start`, matá el proceso y volvé a lanzarlo. Si el puerto 7070 queda retenido, ejecutá `lsof -ti:7070 | xargs kill -9`."

---

## Criterios de done

### Fase 1
- [ ] Stream SSE abre y envía heartbeats.
- [ ] Emitir evento manualmente → llega al cliente conectado.
- [ ] Migraciones aplicadas (seq en Venta/PdvMesa/Comanda).

### Fase 2
- [ ] Los 5 handlers prioritarios emiten eventos.
- [ ] `seq` se incrementa en BD tras cada mutación.
- [ ] Test manual: agregar ítem → evento llega.

### Fase 3
- [ ] Todos los handlers del inventario emiten (~25 puntos).
- [ ] Tests unitarios de emisión ≥85% cobertura.

### Fase 4
- [ ] Polling de 1s eliminado de `pdv.component.ts`.
- [ ] Stream SSE conecta al abrir el PdV.
- [ ] Coalescer funciona (5 ítems rápido → 1 refresh).
- [ ] Fallback de 10s entra solo si stream muere.
- [ ] Reconexión automática tras pérdida de red.
- [ ] Mesa seleccionada NO se pisa (regla existente respetada).

### Fase 5 (mobile — FUERA de este PR)
- Mobile no lista mesas en vivo (carga al entrar + botón, sin polling).
- Follow-up post-#302.

### Regresión
- [ ] Mesa con venta ABIERTA → color naranja.
- [ ] Guard #300 (MESA_YA_TIENE_VENTA_ABIERTA) sigue vigente.
- [ ] Transferir ítems no libera mesa origen (gente sentada).
- [ ] Cobro en terminal ajena (si permitido) → evento se propaga.

### E2E
- [ ] Latencia A→B < 3s (medido con cronómetro).
- [ ] Coalescer: 5 acciones rápidas → 1 refresh.
- [ ] Mesa seleccionada en edición: cambios locales NO se pierden.
- [ ] Fallback: con server apagado, PdV sigue (poll 10s).
- [ ] Reconexión: tras corte de red, stream restablecido.

### Docs
- [ ] `domains/ventas-pdv.md` actualizado (sección SSE).
- [ ] `domains/kds.md` con referencia cruzada.
- [ ] `architecture/cliente-servidor.md` incluye `/api/mesas-pdv/stream`.
- [ ] `docs/testing/TESTING-CHECKLIST-SSE-MESAS-PDV.md` creado.

---

## Notas finales

### Complejidad estimada

- **Backend (handlers + bus + ruta SSE):** ~800 líneas (emisión en 25 puntos + helpers + tests).
- **Frontend (cliente SSE + coalescer):** ~300 líneas.
- **Tests:** ~500 líneas (unit + integration).
- **Docs:** ~200 líneas (ventas-pdv.md + checklist).

**Total:** ~1.800 líneas. **Tiempo estimado:** se entrega en fases; cada fase es validable independientemente.

### Riesgos

1. **Olvidar un mutador:** si un handler NO emite, esa mesa/comanda se queda vieja hasta el fallback de 10s. **Mitigación:** inventario exhaustivo + cobertura de tests.

2. **Pisar mesa seleccionada:** si el merge no respeta la regla existente, el cajero pierde cambios no guardados. **Mitigación:** reusar la lógica de `refreshMesasSilent` (línea 797).

3. **Carrera en transferencia:** si origen y destino emiten eventos casi simultáneamente, el cliente puede recibir estados intermedios inconsistentes. **Mitigación:** el coalescer de 2s suaviza esto; además, `transferir-venta-pdv` es transaccional (ambos cambios son atómicos en BD).

4. **Cloudflare bufferiza SSE:** sin `X-Accel-Buffering: no`, los eventos llegan en ráfagas de 60s. **Mitigación:** header obligatorio + test manual con proxy en medio.

### Métricas de éxito

- **Reducción de queries:** de 2 queries/seg/terminal a ~0,02 queries/seg (1 evento cada 50s en promedio en un local tranquilo).
- **Latencia:** de máx 1s a promedio <2s (tiempo de red + 220ms del `getPdvMesa`).
- **Escalabilidad:** agregar 10 terminales más NO aumenta la carga del servidor (vs +20 queries/seg con polling).

---

**Fin del plan.**

