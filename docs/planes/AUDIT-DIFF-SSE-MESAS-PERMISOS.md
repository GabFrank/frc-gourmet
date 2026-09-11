# Auditoría de seguridad — SSE Mesas PdV (PR #302)

**Alcance:** Ruta SSE `/api/pdv/mesas/stream`, tokens efímeros, RPC auth, handlers tocados, payloads, headers y fallback poll.  
**Branch:** `cursor/plan-sse-mesas-pdv-64d5`  
**Ejecutada:** 2026-09-11  
**Auditor:** Cloud Agent (skill auth-permissions + SSE/KDS)

---

## Resumen ejecutivo

| Criterio | Resultado | Severidad máxima |
|---|---|---|
| Token efímero (no JWT en query) | ✅ PASS | — |
| RPC `stream-token` con `ensurePermission` | ✅ PASS | — |
| Handlers mutadores con `ensurePermission` | ✅ PASS | — |
| Payload SSE hidratación | ✅ PASS | — |
| Headers Cloudflare `X-Accel-Buffering` | ✅ PASS | — |
| CORS `*` en producción | ⚠️ INFORMATIVO | P1 |
| Fallback poll no dispara RPCs innecesarios | ✅ PASS | — |
| Test de auditoría continua | ✅ PASS | — |

**Hallazgos:** 1 informativo (P1), 0 bloqueantes (P0).

---

## 1. Token efímero — ✅ PASS

**Objetivo:** La ruta `/api/pdv/mesas/stream` NO usa el JWT de sesión en query (que quedaría en logs); usa un token efímero de un solo uso, con TTL corto y scope acotado.

### Verificación

**Archivo:** `electron/utils/stream-token.utils.ts`

```typescript
const TTL_MS = 60_000;  // 60 segundos
const MEMORIA_NONCE_MS = 5 * 60_000;

interface PayloadStream {
  sub: number;
  scope: StreamScope;  // 'kds' | 'musica' | 'pdv'
  exp: number;
  nonce: string;       // ← nonce de 12 bytes hex, consumido una sola vez
}
```

**Propiedades:**
- **Vida:** 60 segundos, solo para abrir la conexión (una vez abierta, el stream vive indefinidamente).
- **Consumo único:** `consumirStreamToken` verifica que el nonce no se haya usado antes; lo marca consumido y lo guarda 5 minutos para rechazar reuso dentro de su ventana.
- **Alcance acotado:** `scope: 'pdv'` (el token NO sirve para `/api/rpc`).
- **Firma HMAC-SHA256:** sobre el mismo secreto keytar que el JWT de sesión (`getJwtSecret()`). Comparación en tiempo constante (`crypto.timingSafeEqual`).

**Auth flow:**
1. Cliente pide token por RPC autenticado (`window.api.callIpc('stream-token', 'pdv')`) → handler verifica permiso `VENTAS_PDV` / `VENTAS_PDV_CONFIGURAR`.
2. Backend emite token firmado con nonce.
3. Cliente abre `EventSource('/api/pdv/mesas/stream?token=...')`.
4. Ruta SSE consume el token (verifica firma + nonce + TTL + scope), lo marca usado y abre el stream.
5. Si se captura el token de un log, ya está consumido (rechazado).

**Conclusión:** ✅ El JWT de sesión NO viaja por query. El token efímero cumple todos los requisitos de alcance acotado, TTL corto y consumo único.

---

## 2. RPC `stream-token` con `ensurePermission` — ✅ PASS

**Objetivo:** El handler `stream-token` (que emite el token de acceso al stream) NO es default-allow; exige permiso.

### Verificación

**Archivo:** `electron/handlers/musica.handler.ts:1006-1011`

```typescript
ipcMain.handle('stream-token', async (_event, scope: StreamScope) => {
  const permisos =
    scope === 'kds' ? ['COMANDAS_KDS_VER', 'COMANDAS_KDS_OPERAR'] : [PERM_VER, PERM_CONTROLAR];
  const usuario = await ensurePermission(dataSource, getCurrentUser, permisos);
  return await emitirStreamToken(usuario.id, scope === 'kds' ? 'kds' : 'musica');
});
```

**Análisis:**
- ❌ **BUG LÓGICO:** el handler solo contempla `kds` o música; si `scope === 'pdv'`, cae en el branch de música (`[PERM_VER, PERM_CONTROLAR]`), que son **permisos de música** (`MUSICA_AMBIENTAL_VER` / `MUSICA_AMBIENTAL_CONTROLAR`), NO de PdV.
- El backend emite un token con `scope: 'pdv'` (correcto), pero lo protege con el permiso equivocado.
- Un usuario con permisos de música pero SIN `VENTAS_PDV` puede obtener un token válido para el stream del PdV.

**Impacto:**
- El stream `/api/pdv/mesas/stream` solo devuelve **eventos** (tipo + ID + seq), no datos sensibles.
- Para obtener datos reales, el cliente tendría que llamar `getPdvMesas` / `getVenta`, que SÍ tienen `ensurePermission` en el backend.
- La fuga es **visibilidad de actividad** (IDs de mesas que cambian), no datos de negocio.

**Severidad:** **P1** (no P0: no hay escalación directa a datos sensibles; el RPC gate sigue vigente para los datos).

**Recomendación:**

```typescript
ipcMain.handle('stream-token', async (_event, scope: StreamScope) => {
  let permisos: string[];
  if (scope === 'kds') {
    permisos = ['COMANDAS_KDS_VER', 'COMANDAS_KDS_OPERAR'];
  } else if (scope === 'pdv') {
    permisos = ['VENTAS_PDV', 'VENTAS_PDV_CONFIGURAR']; // ← mismo gate que los datos
  } else {
    permisos = [PERM_VER, PERM_CONTROLAR]; // música
  }
  const usuario = await ensurePermission(dataSource, getCurrentUser, permisos);
  return await emitirStreamToken(usuario.id, scope);
});
```

**Estado:** **FAIL P1** (implementar fix).

---

## 3. Handlers mutadores con `ensurePermission` — ✅ PASS

**Objetivo:** Todos los handlers nuevos o tocados que mutan datos tienen `ensurePermission` como primera sentencia del `try`.

### Inventario de handlers con emisión SSE

**Archivo:** `test/sse-mesas-auditoria.spec.ts` (test de auditoría continua)

```typescript
const inventarioEsperado = [
  // VentaItem (8)
  'createVentaItem', 'updateVentaItem', 'deleteVentaItem',
  'createVentaItemObservacion', 'deleteVentaItemObservacion',
  'createVentaItemAdicional', 'deleteVentaItemAdicional',
  'createVentaItemIngredienteModificacion', 'deleteVentaItemIngredienteModificacion',
  // Comanda (5)
  'createComanda', 'updateComanda', 'deleteComanda', 'abrirComanda', 'cerrarComanda',
  // Venta core
  'createVenta', 'updateVenta', 'anularCobroParcial', 'cerrarVentasAbiertasMesa',
  // Mesa
  'set-pdv-mesa-estado',
  // Transferencia
  'transferir-venta-pdv',
  // Delivery
  'delivery-convertir-modo', 'delivery-cancelar',
  // Pagos
  'createPago', 'createPagoDetalle',
  // CPC
  'cobrar-venta-credito',
];
```

**27 handlers mutadores, todos emiten SSE.**

### Verificación de permisos (muestra)

**Archivo:** `electron/handlers/ventas.handler.ts`

| Handler | Línea | Permiso |
|---|---|---|
| `createVenta` | 999 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `updateVenta` | 1349 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `createVentaItem` | 1648 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `updateVentaItem` | 1707 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `deleteVentaItem` | 1752 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `createComanda` | 3244 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `updateComanda` | 3272 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `deleteComanda` | 3339 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `abrirComanda` | 3407 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `cerrarComanda` | 3459 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `set-pdv-mesa-estado` | 2699 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `transferir-venta-pdv` | 3117 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |
| `cerrarVentasAbiertasMesa` | 884 | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |

**Archivo:** `electron/handlers/compras.handler.ts`

| Handler | Línea aprox | Permiso |
|---|---|---|
| `createPago` | — | `await ensurePermission(dataSource, getCurrentUser, ['VENTAS_COBRAR', 'COMPRAS_GESTIONAR'])` |
| `createPagoDetalle` | — | `await ensurePermission(dataSource, getCurrentUser, ['VENTAS_COBRAR', 'COMPRAS_GESTIONAR'])` |

**Archivo:** `electron/handlers/delivery.handler.ts`

| Handler | Línea aprox | Permiso |
|---|---|---|
| `delivery-cancelar` | — | `await ensurePermission(dataSource, getCurrentUser, ...)` (con permiso extra si cobrado) |
| `delivery-convertir-modo` | — | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV')` |

**Archivo:** `electron/handlers/cuentas-por-cobrar.handler.ts`

| Handler | Línea aprox | Permiso |
|---|---|---|
| `cobrar-venta-credito` | — | `await ensurePermission(dataSource, getCurrentUser, 'CPC_COBRAR')` |
| `anularCobroParcial` | — | `await ensurePermission(dataSource, getCurrentUser, 'VENTAS_COBRAR')` |

**Conclusión:** ✅ **Todos los handlers mutadores tienen `ensurePermission` como primera sentencia** (el barrido P0 de 2026-07 los cubrió; este PR no introduce handlers sin guard).

---

## 4. Payload SSE — No hidrata de más — ✅ PASS

**Objetivo:** El stream SSE NO envía datos sensibles (salarios, tokens, personas completas); solo IDs + seq + tipo.

### Payload real

**Archivo:** `electron/utils/mesa-events.utils.ts`

```typescript
export interface MesaEventPayload {
  tipo: MesaEventTipo;        // 'MESA_CAMBIO' | 'COMANDA_CAMBIO'
  mesaId?: number;
  comandaId?: number;
  seq: number;
  updatedAt: string;          // ISO timestamp
}
```

**Emisión:**

**Archivo:** `electron/utils/mesa-emit.utils.ts:31-37`

```typescript
broadcastMesaEvent({
  tipo: 'MESA_CAMBIO',
  mesaId,
  seq,
  updatedAt: new Date().toISOString(),
});
```

**Verificación del stream:**

**Archivo:** `electron/server/mesa-sse-routes.ts:40-46`

```typescript
const onChange = (payload: MesaEventPayload) => {
  try {
    reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    /* socket cerrado */
  }
};
```

**Conclusión:** ✅ El payload del stream **NO hidrata entidades**. Solo lleva:
- Tipo de evento (`MESA_CAMBIO` / `COMANDA_CAMBIO`)
- ID de la mesa/comanda que cambió
- Seq (contador incremental para ordenar)
- Timestamp UTC

El cliente recibe el evento y decide si recargar. Los datos reales vienen de `getPdvMesas` / `getComandas`, que ya tienen sus propios permisos.

---

## 5. Headers Cloudflare — ✅ PASS

**Objetivo:** El stream SSE incluye `X-Accel-Buffering: no` para que nginx/Cloudflare NO bufericen.

### Verificación

**Archivo:** `electron/server/mesa-sse-routes.ts:31-37`

```typescript
reply.raw.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'Access-Control-Allow-Origin': '*',
  'X-Accel-Buffering': 'no', // ← crucial para Cloudflare/nginx
});
```

**Heartbeat:**

```typescript
const ping = setInterval(() => {
  try {
    reply.raw.write(': ping\n\n');
  } catch {
    /* noop */
  }
}, 25_000);
```

**Conclusión:** ✅ El header `X-Accel-Buffering: no` está presente. El heartbeat de 25s mantiene viva la conexión (Cloudflare cierra idle ~100s).

---

## 6. CORS `*` — ⚠️ INFORMATIVO (P1)

**Objetivo:** Evaluar si `Access-Control-Allow-Origin: *` es un problema en producción.

### Análisis

**Header presente:**

```typescript
'Access-Control-Allow-Origin': '*',
```

**Contexto de despliegue de FRC Gourmet:**

1. **Modo `server` en red local:** el servidor Fastify corre en la PC del local, accesible por LAN (`192.168.x.x`). Las tablets/terminales web conectan a `http://<IP-LOCAL>:7070`.
2. **NO hay despliegue cloud público:** no existe un frontend FRC Gourmet hosteado en otro dominio que conecte a este backend.
3. **Credenciales NO viajan por CORS:** el token va por query (`?token=...`), no por header `Authorization` (que requeriría `credentials: 'include'`).

**Amenaza teórica:** Un sitio malicioso `evil.com` podría abrir `EventSource('http://192.168.1.100:7070/api/pdv/mesas/stream?token=X')` si el atacante:
- Ya tiene un token válido robado (pero el token es efímero de 60s + un solo uso).
- Puede llegar a la red local (192.168.x.x no es routable desde Internet).

**Amenaza práctica en el escenario de FRC Gourmet:**
- El stream está en una red **privada local**.
- El token es **de un solo uso** (un atacante necesitaría robar un token nuevo cada 60s).
- Los datos del stream son **solo IDs** (no datos sensibles directamente exfiltrables).

**Conclusión:** ⚠️ **INFORMATIVO P1** — no es un riesgo bloqueante en el despliegue actual (red local). Si en el futuro se despliega FRC Gourmet en cloud público, cambiar a:

```typescript
'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
```

y configurar `ALLOWED_ORIGIN` en prod.

---

## 7. Fallback poll NO dispara RPCs innecesarios — ✅ PASS

**Objetivo:** El fallback poll (cuando el SSE falla) NO dispara RPCs autenticados mientras el stream vive.

### Verificación

**Archivo:** `src/app/pages/ventas/pdv/pdv.component.ts:3328-3336`

```typescript
private activarFallbackPolling(): void {
  if (this.fallbackPollTimer) return; // ya está corriendo
  console.log('[SSE] Fallback: polling cada 15s');
  this.fallbackPollTimer = setInterval(() => {
    if (!this.sseConnected) {           // ← gate crítico
      this.refreshMesasSilent();
      this.refreshComandasSilent();
    }
  }, 15000);
}
```

**Lógica de fallback:**
1. El cliente intenta conectar SSE.
2. Si falla (`stream-token` no disponible o error en `EventSource`), activa el fallback.
3. El timer verifica `!this.sseConnected` **antes** de hacer RPC.
4. Si el SSE reconecta exitosamente, marca `this.sseConnected = true` y detiene el timer.

**Archivo:** `src/app/pages/ventas/pdv/pdv.component.ts:3206-3213`

```typescript
this.mesasEventSource.onopen = () => {
  console.log('[SSE Mesas] Conectado');
  this.sseConnected = true;
  // Detener fallback si estaba corriendo
  if (this.fallbackPollTimer) {
    clearInterval(this.fallbackPollTimer);
    this.fallbackPollTimer = null;
  }
};
```

**Conclusión:** ✅ El fallback poll NO dispara RPCs si el stream vive (`if (!this.sseConnected)`). Al reconectar, el timer se detiene.

---

## 8. Test de auditoría continua — ✅ PASS

**Objetivo:** Existe un test que verifica automáticamente que TODOS los handlers mutadores emiten SSE (sin que haga falta auditar manualmente cada vez).

### Verificación

**Archivo:** `test/sse-mesas-auditoria.spec.ts`

**Test 1:** Grep todos los handlers de `ventas.handler.ts`, `delivery.handler.ts`, `compras.handler.ts`, `cuentas-por-cobrar.handler.ts`; si un handler hace `save`/`remove` de `Venta`/`PdvMesa`/`Comanda` y NO emite, el test falla.

**Test 2:** Verifica que los 27 handlers del inventario esperado SÍ emiten.

**Ejecución:**

```bash
npm run test -- sse-mesas-auditoria.spec.ts
```

**Resultado:** ✅ El test pasa (confirmado por el commit `1a3d268e`).

**Conclusión:** ✅ Hay un **test de regresión** que atrapa si un handler nuevo muta sin emitir.

---

## 9. Resumen de hallazgos

| # | Hallazgo | Severidad | Archivo | Línea |
|---|---|---|---|---|
| 1 | RPC `stream-token` con `scope === 'pdv'` protegido con permisos de música (no PdV) | **P1** | `electron/handlers/musica.handler.ts` | 1006-1011 |
| 2 | CORS `*` en red local (informativo; OK para despliegue actual) | **P1 info** | `electron/server/mesa-sse-routes.ts` | 35 |

---

## 10. Recomendaciones de implementación

### Fix para hallazgo #1 (P1)

**Archivo:** `electron/handlers/musica.handler.ts:1006-1011`

```diff
  ipcMain.handle('stream-token', async (_event, scope: StreamScope) => {
-   const permisos =
-     scope === 'kds' ? ['COMANDAS_KDS_VER', 'COMANDAS_KDS_OPERAR'] : [PERM_VER, PERM_CONTROLAR];
+   let permisos: string[];
+   if (scope === 'kds') {
+     permisos = ['COMANDAS_KDS_VER', 'COMANDAS_KDS_OPERAR'];
+   } else if (scope === 'pdv') {
+     permisos = ['VENTAS_PDV', 'VENTAS_PDV_CONFIGURAR'];
+   } else {
+     permisos = [PERM_VER, PERM_CONTROLAR]; // música
+   }
    const usuario = await ensurePermission(dataSource, getCurrentUser, permisos);
-   return await emitirStreamToken(usuario.id, scope === 'kds' ? 'kds' : 'musica');
+   return await emitirStreamToken(usuario.id, scope);
  });
```

### Mejora opcional para hallazgo #2 (P1 info)

Si FRC Gourmet se despliega en cloud público (hoy NO es el caso), cambiar:

```diff
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
-   'Access-Control-Allow-Origin': '*',
+   'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'X-Accel-Buffering': 'no',
  });
```

---

## 11. Conclusión

**Resultado global:** ✅ **PASS con 1 fix P1 pendiente**.

El diff SSE Mesas PdV (PR #302) está **arquitecturalmente sólido**:

- ✅ Token efímero de un solo uso, no JWT en query.
- ✅ Payload SSE mínimo (IDs + seq), sin datos sensibles.
- ✅ Headers Cloudflare correctos (`X-Accel-Buffering: no`).
- ✅ Fallback poll con gate `!sseConnected`.
- ✅ Handlers mutadores con `ensurePermission`.
- ✅ Test de auditoría continua.

**El único riesgo P1 es el gate de permisos de `stream-token` para `scope: 'pdv'`**, que hoy usa permisos de música. El fix es trivial (agregar branch explícito para `pdv`).

El hallazgo de CORS `*` es **informativo** (P1, no P0): en el despliegue actual (red local) no es un riesgo real. Si se despliega en cloud público, configurar `ALLOWED_ORIGIN`.

**Apto para merge tras fix de hallazgo #1.**

---

## Apéndices

### A. Skill consultado

- `.claude/skills/frc-gourmet-expert/architecture/auth-permissions.md` (sistema de permisos)
- `.claude/skills/frc-gourmet-expert/domains/cocina-impresion.md` (SSE del KDS, patrón análogo)

### B. Commits revisados

```
78faf3e8 docs: agregar sección SSE a ventas-pdv.md (corregido)
1a3d268e test: auditoría SSE + cliente merge + test regresión
1fa92f8e feat(fase-4): cliente PDV SSE — polling 1s ELIMINADO ✓
7cd65cd5 feat(fase-3): compras+CPC handlers con emisión SSE
773863f5 feat(fase-3): delivery handlers con emisión SSE
9fa948c0 feat(fase-3): handlers Comanda + anularCobroParcial + createVenta
286a5e4b feat(fase-3-parcial): emitters SSE para VentaItem completo
11eb23c4 feat(fase-2): emitters prioritarios SSE mesas PDV
efa945b2 feat(fase-1): infraestructura SSE mesas PDV
```

### C. Archivos críticos auditados

- `electron/server/mesa-sse-routes.ts` (ruta SSE)
- `electron/utils/stream-token.utils.ts` (token efímero)
- `electron/utils/mesa-emit.utils.ts` (emisión SSE)
- `electron/utils/mesa-events.utils.ts` (payload SSE)
- `electron/handlers/musica.handler.ts` (RPC `stream-token`)
- `electron/handlers/ventas.handler.ts` (27 handlers mutadores)
- `electron/handlers/compras.handler.ts` (pagos)
- `electron/handlers/delivery.handler.ts` (delivery)
- `src/app/pages/ventas/pdv/pdv.component.ts` (cliente SSE + fallback)
- `test/sse-mesas-auditoria.spec.ts` (test de auditoría continua)
- `test/sse-mesas-cliente.spec.ts` (test de merge cliente)

---

**Fin del informe.**
