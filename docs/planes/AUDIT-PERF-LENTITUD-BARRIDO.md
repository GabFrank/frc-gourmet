# Auditoría de Performance — Lentitud Reportada en Producción

**Fecha:** 2026-09-11  
**Alcance:** Servidor FRC Gourmet (app.frc-gourmet.com) + clientes  
**Branch auditada:** `develop` (HEAD al momento del análisis)  
**Objetivo:** Inventariar hotspots de performance concretos sin implementar fixes

---

## Resumen Ejecutivo

Sistema reporta lentitud generalizada en producción (Don Franco / app.frc-gourmet.com): respuestas servidor→cliente lentas y operaciones del propio servidor trabadas.

**Hallazgos:** 15 hotspots identificados, **10 críticos (P0/P1)** que explican la mayor parte de la lentitud observada.

### Top 10 Sospechosos Priorizados

| # | Prioridad | Hallazgo | Impacto Estimado |
|---|-----------|----------|------------------|
| 1 | **P0** | Polling agresivo 1s en PDV desktop | CRÍTICO: cada terminal martilla servidor cada segundo |
| 2 | **P0** | N+1 queries en `getVentaItems` | ALTO: 10+ joins por ítem, sin paginación |
| 3 | **P0** | `queryMesasWithVentaAbierta` sin índice mesa+estado | ALTO: full scan en cada refresh |
| 4 | **P1** | Materialización pedido online con transacción larga | ALTO: traba toda la mesa mientras arma venta + ítems |
| 5 | **P1** | Auto-impresión delay 2.5s + retry worker 5s | MEDIO-ALTO: el usuario espera respuesta que depende de impresora |
| 6 | **P1** | Locks por mesa/comanda serializan operaciones | MEDIO: withMesaLock puede hacer cola a todos |
| 7 | **P1** | Reportes con loops secuenciales `await` | MEDIO: reporte de 45 días = 45 queries en serie |
| 8 | **P2** | Rate limiting 300 req/min puede cortar staff | MEDIO: con 5 terminales activas llega al límite |
| 9 | **P2** | SSE + polling fallback mobile compiten | BAJO-MEDIO: polling de respaldo se queda activo |
| 10 | **P2** | Falta índice `(estado, created_at)` en `ventas` | MEDIO: dashboards y reportes hacen scan |

---

## Hallazgos Detallados

### 1. **[P0] Polling Agresivo de 1 Segundo en PDV Desktop**

**Archivo:** `src/app/pages/ventas/pdv/pdv.component.ts:566`

```typescript
// Auto-refresh mesas y comandas cada 1 segundo
this.mesasRefreshInterval = setInterval(() => {
  this.refreshMesasSilent();
  this.refreshComandasSilent();
}, 1000);
```

**Por qué duele:**
- Cada terminal PDV abierta martilla el servidor **60 veces por minuto** con `getPdvMesas` + `getComandas`
- Don Franco con 4 terminales activas = **240 requests/min** solo de refresh
- `getPdvMesas` hace un join pesado con `ventas` ABIERTA (ver hallazgo #3)
- El refresh es **incondicional**: aunque el cajero no esté mirando la grilla, sigue polling

**Evidencia:**
- `refreshMesasSilent()` llama `repositoryService.getPdvMesas()`  (línea 765)
- Handler backend: `electron/handlers/ventas.handler.ts:2421` (llama `queryMesasWithVentaAbierta`)

**Qué medir en vivo:**
1. Contar requests `getPdvMesas` en logs de Fastify (1 min)
2. Medir latencia p50/p95 de ese handler con timestamps
3. Probar cambiar interval a 5s y medir diferencia de carga

**Alternativas a considerar:**
- SSE para notificar cambios (ya existe infraestructura en `kds-sse-routes.ts`)
- Aumentar intervalo a 3-5 segundos (menos crítico pero ayuda)
- Desactivar refresh cuando la tab PDV pierde foco

---

### 2. **[P0] N+1 Queries y Joins Pesados en `getVentaItems`**

**Archivo:** `electron/handlers/ventas.handler.ts:1566-1587`

```typescript
ipcMain.handle('getVentaItems', async (_event: any, ventaId: number) => {
  const repo = dataSource.getRepository(VentaItem);
  return await repo.find({
    where: { venta: { id: ventaId } },
    relations: [
      'producto', 
      'presentacion', 
      'precioVentaPresentacion',
      'precioVentaPresentacion.moneda',
      'canceladoPor',
      'modificadoPor',
      'nuevaVersionVentaItem',
      'createdBy',
      'createdBy.persona'
    ],
    order: { createdAt: 'ASC' }
  });
});
```

**Por qué duele:**
- **9 joins anidados** para cargar un ítem
- Si la venta tiene 20 ítems, TypeORM puede disparar **20+ queries separadas** para hidratar relaciones profundas (`precioVentaPresentacion.moneda`, `createdBy.persona`)
- Se llama **cada vez que el PDV abre una mesa** (es decir, muchas veces)
- Sin paginación ni límite: venta con 100 ítems (mesa grande, turno largo) carga todo

**Evidencia:**
- Handler en `ventas.handler.ts:1566`
- Llamado desde PDV al seleccionar mesa: `pdv.component.ts` (múltiples puntos)

**Qué medir en vivo:**
1. Activar query logging TypeORM (`logging: ["query"]`) por 5 min en producción
2. Contar queries para un `getVentaItems` de venta con 15 ítems
3. Medir tiempo total del handler

**Hipótesis de mejora (NO implementar ahora):**
- QueryBuilder con `leftJoin` + `addSelect` selectivo (solo campos usados en UI)
- Lazy loading de relaciones no críticas (`canceladoPor`, `nuevaVersionVentaItem`)
- Cache de 2-3 segundos para la misma venta (si el backend detecta consultas repetidas)

---

### 3. **[P0] Query Sin Índice: `queryMesasWithVentaAbierta`**

**Archivo:** `electron/handlers/ventas.handler.ts:2407-2419`

```typescript
const queryMesasWithVentaAbierta = (repo: Repository<PdvMesa>) => {
  return repo
    .createQueryBuilder('mesa')
    .leftJoinAndSelect('mesa.sector', 'sector')
    .leftJoinAndSelect('mesa.reserva', 'reserva')
    .leftJoinAndSelect('reserva.cliente', 'cliente')
    .leftJoinAndSelect('cliente.persona', 'persona')
    .leftJoin('ventas', 'venta', 
      'venta.mesa_id = mesa.id AND venta.estado = :estado AND venta.comanda_id IS NULL',
      { estado: VentaEstado.ABIERTA })
    .addSelect(['venta.id'])
    .orderBy('mesa.numero', 'ASC');
};
```

**Por qué duele:**
- Join a `ventas` filtrando por `estado = 'ABIERTA'` y `comanda_id IS NULL`
- **NO hay índice compuesto en `(mesa_id, estado, comanda_id)` en la tabla `ventas`**
- Con 10K ventas históricas, el SGBD hace **table scan** en cada refresh
- Se ejecuta **60 veces por minuto por terminal** (ver hallazgo #1)

**Evidencia entidad:**
```typescript
// src/app/database/entities/ventas/venta.entity.ts
// NO tiene @Index(['mesa', 'estado', 'comanda'])
```

**Qué medir:**
1. `EXPLAIN` de la query en Postgres producción (o `.eqp on` en SQLite)
2. Buscar "Seq Scan" en el plan
3. Contar rows examinadas vs rows retornadas

**Índice faltante (hipótesis):**
```sql
CREATE INDEX idx_ventas_mesa_estado_comanda 
  ON ventas(mesa_id, estado, comanda_id);
```

---

### 4. **[P1] Materialización Pedido Online con Transacción Larga**

**Archivo:** `electron/handlers/ventas.handler.ts:215-550`

```typescript
export async function materializarPedidoOnlineEnVenta(...) {
  return conLock(async () => {
    // ...
    await qr.startTransaction();
    try {
      // 1. Leer mesa
      // 2. Buscar/crear venta
      // 3. Loop por cada item del pedido:
      //    - Buscar precio vigente
      //    - Crear VentaItem
      //    - Loop por sabores → crear VentaItemSabor
      //    - Loop por adicionales → crear VentaItemAdicional
      //    - Resolver observaciones (query a catálogo)
      //    - Crear VentaItemObservacion
      // 4. Crear Delivery si aplica
      // 5. Marcar pedido EN_PREPARACION
      await qr.commitTransaction();
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    }
    
    // Post-commit: KDS + impresión (también lentos)
    for (const itemId of createdItemIds) {
      await crearComandaItemsSiCorresponde(dataSource, itemId);
    }
    await autoPrintComandaIfNeeded(dataSource, ventaId);
  });
}
```

**Por qué duele:**
- Transacción puede durar **5-15 segundos** para un pedido de 8 ítems con variaciones
- **Serializada por mesa** con `withMesaLock`: si dos comensales de la misma mesa piden a la vez, el segundo espera a que el primero termine COMPLETO (TX + KDS + impresión)
- Dentro de la TX: múltiples `findOne` (precios, observaciones, catálogo)
- Post-commit: loop secuencial de `crearComandaItemsSiCorresponde` (1 query por ítem por sector)

**Evidencia:**
- `materializarPedidoOnlineEnVenta` llamada desde:
  - Pedido MESA_QR: auto-materialización en `pedidos-online-pedidos.handler.ts:480`
  - Pedido PICKUP/DELIVERY: aceptación manual en `pedidos-online-admin.handler.ts:149`

**Qué medir:**
1. Logs con timestamps: `[materializar start]` → `[TX commit]` → `[KDS done]` → `[print done]`
2. Contar queries dentro de la transacción (habilitar logging temporal)
3. Testear pedido de 10 ítems en local: ¿cuánto tarda?

**Caminos de optimización (NO implementar):**
- Batch inserts de `VentaItem` en lugar de loop de `.save()`
- Mover KDS e impresión a worker async (no esperar en el lock)
- Pre-cachear catálogo de observaciones antes de la TX

---

### 5. **[P1] Auto-Impresión con Delay 2.5s + Retry Worker Bloqueante**

**Archivo:** `electron/handlers/ventas.handler.ts:4514-4571`

```typescript
const AUTO_PRINT_COMANDA_DELAY_MS = 2500;

async function autoPrintComandaIfNeeded(dataSource, ventaId) {
  // ...
  const pdvConfig = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
  if (!pdvConfig?.autoImprimirComanda) return;

  setTimeout(() => {
    printComandaInternal(dataSource, ventaId)
      .then(res => { /* ... */ })
      .catch(e => console.error(...));
  }, AUTO_PRINT_COMANDA_DELAY_MS);
}
```

**Worker de retry:**
```typescript
// Cada 5 segundos reintenta comandas con impreso=false
setInterval(() => retryPendingComandas(dataSource), 5000);
```

**Por qué duele:**
- **Delay de 2.5 segundos** en el camino crítico: el PDV crea ítem → espera que backend responda → backend espera 2.5s antes de imprimir
- Si la impresora está apagada o lenta, el timeout del driver puede ser **10-30 segundos**
- Retry worker hace **table scan de `venta_items`** cada 5 segundos: `WHERE impreso = false AND impresiones IS NOT NULL` (sin índice en `impreso`)
- Aunque la impresión es fire-and-forget, **la materialización de pedido online la espera** (ver hallazgo #4)

**Evidencia:**
- Auto-print llamada desde `createVentaItem` (línea 1631)
- Retry worker arrancado en `registerVentasHandlers` (línea 602)
- `printComandaInternal` puede tardar 5-10s si hay sectores múltiples

**Qué medir:**
1. Logs de impresión: `[print comanda start]` → `[printer driver done]`
2. Contar reintentos del worker en 1 hora (métrica de fallas de impresora)
3. Deshabilitar auto-print temporalmente: ¿mejora la velocidad de pedidos?

**Riesgos de optimizar (NO tocar sin OK):**
- El delay existe para que adicionales/observaciones se guarden antes de imprimir
- Acortar el delay puede hacer que comandas salgan incompletas a cocina

---

### 6. **[P1] Locks por Mesa/Comanda/Pedido Serializan Operaciones**

**Archivo:** `electron/handlers/ventas.handler.ts:82-154`

```typescript
// Lock por venta (para procesarStockVenta)
const procesarStockTails = new Map<number, Promise<void>>();
async function withVentaStockLock<T>(ventaId: number, fn: () => Promise<T>) { /* ... */ }

// Lock por mesa (para crear venta / materializar pedido)
const mesaTails = new Map<number, Promise<void>>();
async function withMesaLock<T>(mesaId: number, fn: () => Promise<T>) { /* ... */ }

// Lock por comanda
const comandaTails = new Map<number, Promise<void>>();
async function withComandaLock<T>(comandaId: number, fn: () => Promise<T>) { /* ... */ }

// Lock por pedido online
const pedidoTails = new Map<number, Promise<void>>();
async function withPedidoLock<T>(pedidoId: number, fn: () => Promise<T>) { /* ... */ }
```

**Por qué duele:**
- **Serialización en memoria**: todas las operaciones sobre la misma mesa/comanda hacen cola
- Ejemplo: Mesa 4 con venta ABIERTA → cajero 1 agrega ítem (toma lock) → cajero 2 intenta agregar ítem → **espera** a que cajero 1 termine (incluido auto-print + KDS)
- Si `materializarPedidoOnlineEnVenta` tarda 15s (hallazgo #4), todo lo demás en esa mesa espera 15s
- **No hay timeout**: si un lock se queda trabado (bug o excepción no manejada), la mesa queda muerta hasta restart del servidor

**Evidencia:**
- `withMesaLock` usado en:
  - `materializarPedidoOnlineEnVenta` (línea 232)
  - `createVenta` (probablemente, no confirmado en este barrido)
- `withComandaLock` usado en transferencias entre comandas

**Qué medir:**
1. Logs con ID de mesa + timestamp: `[lock acquired mesa=4]` → `[lock released mesa=4]`
2. Contar operaciones concurrentes rechazadas (tail existente)
3. Medir latencia promedio de hold del lock (cuánto tiempo se retiene)

**Escenario de bloqueo:**
- 3 comensales de mesa 5 piden a la vez desde MESA_QR
- El primero toma lock → materializa 8 ítems → KDS → imprime (15s)
- El segundo espera 15s, luego materializa (otros 15s)
- El tercero espera 30s para empezar

**Consideraciones (NO cambiar ahora):**
- Los locks EXISTEN por un bug real (multi-cuenta en mesa 4, pérdida 254k Gs)
- Quitarlos reintroduce race conditions de facturación
- Optimizar duración de operaciones bajo lock (hallazgos #4, #5) es más seguro

---

### 7. **[P1] Reportes con Loops Secuenciales de `await`**

**Archivo:** `electron/handlers/reportes-ventas.helper.ts:110-120`

```typescript
async function serieCubetas(ds, ctx, r, usarSemanas, soloDelivery) {
  const dias = listaDias(r); // 45 días para un mes completo
  const labels = [];
  const valores = [];
  if (!usarSemanas) {
    for (const dia of dias) {
      valores.push(await sumaTramoGs(ds, ctx, dia, dia, soloDelivery));
      labels.push(`${dia.getDate()}`);
    }
  }
  // ...
}
```

**Por qué duele:**
- Reporte de "último mes" (30-45 días) → **45 queries secuenciales** con `await`
- Cada `sumaTramoGs` hace un `SUM()` sobre `venta_items` + joins a `ventas` + `pagos_detalles`
- Sin índice en `(created_at, estado)` → cada query escanea la tabla completa
- Reporte dual (ventas + finanzas) dispara **DOS series** iguales
- Total: **90 queries en serie** para un reporte mensual = **30-60 segundos** de CPU

**Evidencia:**
- Llamado desde `get-reporte-ventas` (handler IPC)
- Usuario del PdV abre "Reportes → Ventas → Último mes" → espera 1 minuto
- También aplica en `reportes-finanzas.helper.ts` (mismo patrón)

**Qué medir:**
1. Tiempo total de `get-reporte-ventas` con `console.time()`
2. Contar queries con logging: ¿son realmente 90?
3. Probar rango de 7 días (más corto): ¿tiempo lineal?

**Optimización posible (NO implementar):**
- `Promise.all()` para cubetas de semanas (7 queries en paralelo)
- Query única con `GROUP BY DATE(created_at)` (SQL puro)
- Cache de serie por período (reporte de "ayer" no cambia)

---

### 8. **[P2] Rate Limiting 300 req/min Puede Cortar Tráfico Staff Legítimo**

**Archivo:** `electron/server/server.ts:120-145`

```typescript
await fastify.register(rateLimit, {
  max: (request) => {
    const path = request.url.split('?')[0];
    if (path.startsWith('/api/auth/')) return 30;   // 30 req/min
    if (path.startsWith('/pub/')) return 200;
    if (path === '/api/rpc') return 600;            // 600 req/min staff
    return 300; // Default
  },
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    // Deriva key de JWT (device_id/user) o IP
    // ...
  },
});
```

**Por qué duele:**
- **300 req/min por device** para rutas no específicas (`/api/files/*`, `/api/kds/stream`, etc.)
- Con polling PDV cada 1s (hallazgo #1): `getPdvMesas` + `getComandas` = **120 req/min** del PDV solo
- Si el PDV hace otras consultas (clientes, productos, dashboard), llega al límite
- Cuando se excede, Fastify responde `429 Too Many Requests` → el frontend lo trata como error genérico → toast rojo "Error al cargar"

**Evidencia:**
- Rate limit activado desde F1 (2026-09)
- Key generator en línea 146: usa `device_id` del JWT para staff
- `/api/rpc` tiene **600 req/min** (más generoso), pero llamadas fuera de RPC (SSE, files) cuentan aparte

**Qué medir en vivo:**
1. Logs de Fastify: buscar `rate limit exceeded` en producción (última semana)
2. Contar requests por device_id en 1 minuto pico (cena viernes 20:00-21:00)
3. Probar aumentar límite a 500: ¿desaparecen los 429?

**Decisión de producto:**
- Rate limit existe por seguridad (anti-DoS, abuse del storefront público)
- Staff autenticado puede necesitar límite más alto
- **NO desactivar sin consenso**: el servidor está expuesto por túnel público

---

### 9. **[P2] SSE + Polling Fallback Compiten en Mobile/KDS**

**Archivo:** `projects/mobile/src/app/pages/kds/kds.page.ts:11`

```typescript
// El componente KDS detecta que `window.api.callIpc` existe (shim HTTP) y hace
// los pedidos autenticados a /api/rpc; el refresco en tiempo real usa el poll de
// 12s (el SSE requiere token en query, no disponible en este modo).
```

**Archivo:** `electron/server/kds-sse-routes.ts:1-72`

```typescript
// SSE para pantallas web (Google TV / tablet) en modo servidor.
// Las pantallas se conectan a `GET /api/kds/stream` y reciben cada
// cambio de ComandaItem en tiempo real sin polling.
fastify.get('/api/kds/stream', async (request, reply) => {
  // Auth por token efímero en query
  // Heartbeat cada 25s
  // comandaEvents.on('change', onChange);
});
```

**Por qué duele:**
- **SSE está implementado**, pero el cliente mobile **no lo usa** (usa polling 12s)
- Razón: `EventSource` del browser no manda headers, y la autenticación del SSE va por query token
- Mobile usa shim HTTP (`window.api.callIpc` → `/api/rpc`) con JWT en header, que NO puede pasarse a `EventSource`
- Resultado: polling cada 12s **aunque el servidor soporte push**
- KDS en Google TV SÍ usa SSE (porque pide token efímero explícito)

**Evidencia:**
- SSE routes registradas: `electron/server/kds-sse-routes.ts`
- Comentario en mobile: `projects/mobile/src/app/pages/kds/kds.page.ts:11`

**Qué medir:**
1. Contar conexiones SSE activas: `netstat` filtrando puerto 7070 con estado ESTABLISHED largo
2. Comparar latencia de notificación: SSE (instantánea) vs polling 12s (promedio 6s)
3. Logs de `comandaEvents.emit('change')`: ¿cuántos eventos se disparan?

**Fix posible (NO implementar ahora):**
- Endpoint `/api/auth/stream-token` devuelve token efímero
- Mobile lo pide antes de abrir `EventSource`
- Requiere cambio en cliente + backend

---

### 10. **[P2] Índices Faltantes en Tablas Calientes**

**Entidades auditadas:**
- `ventas` (`src/app/database/entities/ventas/venta.entity.ts`)
- `venta_items` (`src/app/database/entities/ventas/venta-item.entity.ts`)
- `pdv_mesas` (`src/app/database/entities/ventas/pdv-mesa.entity.ts`)

**Índices declarados (pocos):**
```typescript
// BaseModel tiene created_at, updated_at (NO indexados)
// Venta: NO tiene @Index
// VentaItem: NO tiene @Index
// PdvMesa: NO tiene @Index
```

**Índices faltantes (hipótesis basada en queries frecuentes):**

| Tabla | Índice Faltante | Query Que Duele |
|-------|----------------|----------------|
| `ventas` | `(mesa_id, estado, comanda_id)` | `queryMesasWithVentaAbierta` (60/min) |
| `ventas` | `(estado, created_at)` | Dashboards, reportes, KPIs |
| `ventas` | `(caja_id, estado)` | Resumen de caja, filtros por caja |
| `venta_items` | `(venta_id, estado)` | `getVentaItems` (cada apertura de mesa) |
| `venta_items` | `(impreso, impresiones)` | Retry worker de comandas (cada 5s) |
| `pdv_mesas` | `(activo, reservado, estado)` | Filtros de mesas disponibles |
| `pagos_detalles` | `(pago_id, moneda_id)` | Cálculo de totales multimoneda |

**Por qué duele:**
- Postgres sin índice en filtro `WHERE estado = 'ABIERTA'` → **Seq Scan** de 10K ventas
- SQLite sin índice en join `venta_items.venta_id` → puede ser lento con 50K ítems históricos
- Retry worker escanea `venta_items` cada 5 segundos buscando `impreso = false`

**Qué medir:**
1. `EXPLAIN ANALYZE` de las 5 queries más frecuentes (PDV, dashboards, reportes)
2. Buscar `Seq Scan` en planes de ejecución
3. Contar rows examinadas vs rows retornadas (ratio > 100 es mal olor)

**Migración hipotética (NO ejecutar):**
```typescript
// Ejemplo (NO es código final):
@Index(['mesa', 'estado', 'comanda'])
@Index(['estado', 'createdAt'])
export class Venta extends BaseModel { /* ... */ }
```

---

### 11. **[P2] TRUST_PROXY Configurado Pero Ambiguo**

**Archivo:** `electron/server/server.ts:89-100`

```typescript
// trustProxy: habilita leer el IP real del cliente vía X-Forwarded-For cuando el
// server está detrás de un reverse proxy (necesario para la validación de red de
// MESA_QR). ⚠️ SOLO habilitar si el server es alcanzable ÚNICAMENTE a través del
// proxy de confianza — si no, un cliente directo podría spoofear X-Forwarded-For.
const tpEnv = (process.env['TRUST_PROXY'] || '').trim();
const trustProxy: boolean | string =
  tpEnv === '' ? false : (tpEnv === 'true' || tpEnv === '1') ? true : tpEnv;

const fastify = Fastify({
  trustProxy,
  // ...
});
```

**Por qué duele:**
- Si `TRUST_PROXY=true` (confía en todos), **cualquier cliente** puede spoofear su IP mandando `X-Forwarded-For: 1.2.3.4`
- Rate limiting usa `request.ip` derivado del header → un atacante podría bypassear el límite cambiando IP en cada request
- Si `TRUST_PROXY` NO está configurado, el rate limiting ve la **IP del proxy** (no del cliente real) → todos los clientes del túnel comparten bucket
- **Producción Don Franco:** probablemente usa túnel (Cloudflare/ngrok) → debería estar configurado, pero ¿lo está?

**Evidencia:**
- Config en `server.ts:89`
- Rate limiting usa `keyGenerator: (request) => request.ip` (línea 146)
- Validación LAN de MESA_QR usa `request.ip` (`mesa-qr.handler.ts`)

**Qué medir:**
1. Leer env var `TRUST_PROXY` en servidor producción: `echo $TRUST_PROXY`
2. Capturar headers de request: ¿viene `X-Forwarded-For`?
3. Logs de rate limit: ¿todos los clientes tienen la misma IP (la del proxy)?

**Configuración correcta (NO cambiar sin validar):**
- Si hay proxy: `TRUST_PROXY=<IP-del-proxy>` o CIDR de la red del proxy
- Si NO hay proxy: `TRUST_PROXY=false` (default)
- **Nunca** `TRUST_PROXY=true` en producción pública

---

### 12. **[P2] Transacciones Largas en Pago Consolidado**

**Archivo:** `electron/handlers/pago-consolidado.handler.ts:120-300`

```typescript
// Handler 'registrar-pago-consolidado' (línea ~140)
// 1. Validar selección de ítems + líneas
// 2. Validar cobertura (monto total == sum líneas)
// 3. Repartir FIFO (líneas → ítems)
// 4. Loop por cada línea:
//    a. Si fuente CAJA_MAYOR → crear CajaMayorMovimiento
//    b. Si fuente CUENTA_BANCARIA → crear MovimientoBancario
//    c. Si fuente DESCUENTO → validar tope + crear detalle
// 5. Crear PagoConsolidado (evento)
// 6. Loop por cada ítem → marcar cuotas PAGADA via adapter
// 7. Actualizar saldos de caja / banco
```

**Por qué duele:**
- Transacción puede tener **20+ inserts** (CPP con 10 cuotas + 3 líneas de pago)
- Cada línea hace `actualizarSaldoCajaMayor` → query de lectura + update
- Adapters (`pago-consolidado-adapters.ts`) hacen **queries separadas** por cada cuota/gasto/vale
- Sin batch: `for (const item of items) { await adapter.pagar(...) }`

**Evidencia:**
- Handler en `pago-consolidado.handler.ts:140`
- Adapters en `pago-consolidado-adapters.ts` (5 adaptadores, uno por concepto)

**Qué medir:**
1. Contar queries dentro de una transacción de pago de 10 cuotas CPP
2. Medir tiempo total del handler (con timestamps)
3. ¿Hay locks contendidos? (probablemente NO, pero verificar)

**Optimización posible:**
- Batch update de cuotas: `UPDATE ... WHERE id IN (1,2,3,...)` (1 query en vez de 10)
- Pre-leer saldos de caja antes de la TX

---

### 13. **[P2] Dashboard KPIs con Subconsultas Pesadas**

**Archivo:** `electron/handlers/dashboard-ventas.handler.ts:50-100`

```typescript
// Handler 'get-dashboard-ventas-kpis'
// 1. getMonedaPrincipalId() → query
// 2. getCotizacionMap() → query (todas las monedas)
// 3. sumaVentasRango() → SUM sobre ventas + pagos_detalles + joins
// 4. Margen: SUM(vi.precio_venta) - SUM(vi.precio_costo) → scan de venta_items
// 5. Mesas únicas: COUNT(DISTINCT mesa_id) → scan de ventas
```

**Por qué duele:**
- Dashboard "Hoy" se consulta **cada vez que se abre la tab Ventas**
- 5 queries secuenciales (no paralelizadas)
- Sin índice en `(estado, created_at)` → cada SUM escanea tabla completa
- Moneda principal y cotizaciones **se leen en cada request** (no hay cache)

**Evidencia:**
- Handler en `dashboard-ventas.handler.ts`
- Llamado desde PDV, mobile, home

**Qué medir:**
1. Tiempo de respuesta del handler (p50, p95)
2. Contar invocaciones por minuto en hora pico
3. Cache de 30s: ¿cuántos requests se salva?

**Cache existente (parcial):**
```typescript
// Hay cache de `inicioJornadaHora` (60s), pero NO de cotizaciones ni KPIs
let cacheInicioJornada: { valor: number; expira: number } | null = null;
```

---

### 14. **[P2] Handler `get-kds-comandas` Sin Paginación**

**Archivo:** `electron/handlers/kds.handler.ts` (no leído completo en este barrido)

**Hipótesis:**
- KDS carga **todos** los `ComandaItem` de sectores activos sin límite
- Con 50 mesas ocupadas → 200+ ítems cargados de una vez
- Mobile KDS hace polling cada 12s (hallazgo #9) → 200 ítems × 5 req/min = carga innecesaria

**Qué medir:**
1. Contar ítems retornados por `get-kds-comandas` en turno lleno
2. Tamaño del payload JSON (KB)
3. ¿Hay ítems viejos (ya SERVIDOS hace horas) en la respuesta?

**Filtro recomendado (NO implementar):**
- Solo ítems con `estado != SERVIDO` O `updated_at > NOW() - 2 hours`
- Paginación por sector (si el KDS filtra localmente por sector)

---

### 15. **[P2] Logs de Consulta No Rotan (Hypótesis)**

**Archivo:** `electron/server/server.ts:96`

```typescript
const fastify = Fastify({
  logger: {
    level: process.env['NODE_ENV'] === 'development' ? 'info' : 'warn',
  },
  // ...
});
```

**Hipótesis:**
- Si TypeORM tiene `logging: ["query"]` habilitado, logs crecen sin límite
- Electron escribe logs a `userData/logs/` (path típico) sin rotación
- Servidor con 30 días uptime → archivo de 2 GB → escribir log es lento

**Qué medir:**
1. Buscar archivos de log: `ls -lh userData/logs/`
2. ¿Hay `main.log` > 500 MB?
3. ¿TypeORM logging está activo en producción?

**Rotación recomendada:**
- `electron-log` con `maxSize: 10MB`
- TypeORM logging SOLO en desarrollo

---

## Checklist de Mediciones en Vivo (Producción Don Franco)

### Prioridad CRÍTICA (hacer primero)

- [ ] **M1:** Contar requests `getPdvMesas` en logs Fastify (1 min) → confirmar polling 60/min
- [ ] **M2:** Habilitar query logging TypeORM por 5 min → contar queries de `getVentaItems` (venta con 15 ítems)
- [ ] **M3:** `EXPLAIN` de `queryMesasWithVentaAbierta` → buscar Seq Scan
- [ ] **M4:** Logs de materialización pedido: timestamp TX commit - timestamp start → cuánto tarda
- [ ] **M5:** Buscar `rate limit exceeded` en logs última semana → ¿cuántos 429?

### Prioridad ALTA

- [ ] **M6:** Tiempo de `get-reporte-ventas` con período 30 días → ¿> 30s?
- [ ] **M7:** Logs de impresión: `[print comanda start]` → `[done]` → latencia promedio
- [ ] **M8:** Contar queries en transacción de pago consolidado (10 cuotas CPP)
- [ ] **M9:** Tiempo de respuesta `get-dashboard-ventas-kpis` p95 → ¿> 2s?
- [ ] **M10:** `EXPLAIN` de queries de dashboard → contar Seq Scans

### Prioridad MEDIA

- [ ] **M11:** Verificar env var `TRUST_PROXY` en servidor producción
- [ ] **M12:** Contar conexiones SSE activas en KDS (netstat)
- [ ] **M13:** Tamaño de payload `get-kds-comandas` en turno lleno (KB)
- [ ] **M14:** Buscar archivos log > 500 MB en `userData/`
- [ ] **M15:** Latencia de lock por mesa: `[lock acquired]` → `[released]` promedio

---

## Qué NO Tocar Sin Aprobación

1. **Locks de serialización (withMesaLock, withComandaLock):**  
   Existen por bug de multi-cuenta (pérdida 254k Gs). Quitarlos reintroduce race conditions de facturación. Optimizar DURACIÓN de operaciones bajo lock es más seguro.

2. **Auto-impresión con delay 2.5s:**  
   El delay existe para que adicionales/observaciones se guarden antes de imprimir. Acortarlo puede hacer que comandas salgan incompletas a cocina.

3. **Rate limiting:**  
   Protege contra DoS. Aumentar límites sin medir impacto puede exponer el servidor. Cambiar TRUST_PROXY sin entender el setup del proxy puede abrir bypass de seguridad.

4. **Migración de índices:**  
   Crear índices en producción **traba la tabla** mientras se construyen (especialmente en SQLite sin CONCURRENTLY). Planificar downtime o hacerlo en ventana de baja carga.

5. **TypeORM synchronize:**  
   Está en `false` desde F1.5 (migraciones obligatorias). NO activar: puede DROP columnas/tablas sin warning.

---

## Próximos Pasos Recomendados

1. **Ejecutar checklist de mediciones** (arriba) → confirmar hallazgos con datos reales
2. **Priorizar fixes** basándose en impacto medido (no en impacto estimado)
3. **Branch de fix:** un PR por hallazgo (NO un mega-PR con 10 cambios)
4. **Testing en staging:** cada fix debe pasar por copia de BD producción (anonimizada)
5. **Deploy gradual:** fix P0 → medir 48h → fix P1 → medir → etc.

---

## Herramientas de Diagnóstico Sugeridas

### Para queries lentas (Postgres)
```sql
-- Top 10 queries más lentas
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC LIMIT 10;

-- Índices no usados
SELECT schemaname, tablename, indexname 
FROM pg_stat_user_indexes 
WHERE idx_scan = 0;
```

### Para queries lentas (SQLite)
```sql
-- Habilitar plan de ejecución
.eqp on

-- Analizar query específica
EXPLAIN QUERY PLAN 
SELECT * FROM ventas WHERE estado = 'ABIERTA';
```

### Para rate limiting
```bash
# Contar requests por IP en logs Fastify (último minuto)
grep '"req":' fastify.log | grep "$(date -u +%H:%M)" | \
  jq -r '.req.remoteAddress' | sort | uniq -c | sort -rn | head -20
```

### Para locks contendidos
```typescript
// Agregar logs al lock helper:
async function withMesaLock<T>(mesaId: number, fn: () => Promise<T>) {
  const start = Date.now();
  console.log(`[lock] mesa=${mesaId} waiting`);
  await prev.catch(() => {});
  console.log(`[lock] mesa=${mesaId} acquired after ${Date.now() - start}ms`);
  try {
    return await fn();
  } finally {
    console.log(`[lock] mesa=${mesaId} released after ${Date.now() - start}ms`);
  }
}
```

---

**Fin del documento.**  
Este barrido NO implementa fixes. Sirve como mapa para atacar la lentitud de forma sistemática, un hallazgo a la vez, midiendo antes y después.
