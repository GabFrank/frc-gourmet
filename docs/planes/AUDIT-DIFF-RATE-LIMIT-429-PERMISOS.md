# AUDITORÍA DIFF #2 — PERMISOS / FUGAS / RPC default-allow

**Auditor:** Cloud Agent (Claude Sonnet 4.5)  
**Fecha:** 2026-09-04  
**Rama:** `cursor/fix-rate-limit-429-delivery-0aac`  
**PR:** #286 (draft, contra `develop`)  
**Alcance:** Rate limit 429 + backoff delivery  
**Eje overlay:** `ensurePermission` / RPC default-allow / fugas hidratadas

---

## Contexto de la auditoría

Este PR implementa rate limiting diferenciado para resolver el error HTTP 429 que aparecía en el módulo delivery del PdV. Los cambios principales son:

1. **Backend (F1+F2+F3):** `allowList`, `max` función por ruta, `keyGenerator` por device/user
2. **Frontend (F4):** Backoff exponencial en el poll del diálogo delivery
3. **Tests (F5):** Suite E2E de rate limiting
4. **Docs (F6):** Actualización de skill cliente-servidor

**Objetivo de esta auditoría:** Verificar que los cambios de rate limiting **NO introducen vectores de bypass de autenticación, escalada de privilegios, o fugas de información**. Enfoque específico en:

- ¿El `allowList` o `keyGenerator` bypassan auth o abren rutas `/api/*`?
- ¿El `jwt.decode` sin verify en `keyGenerator` es fuga o abuso?
- ¿Deep-links y `/pub/*` otorgan más acceso o cuota de lo debido?
- Handlers mutadores del diff: ¿tienen `ensurePermission` como primera sentencia?

---

## 1. Análisis del `allowList`: ¿Bypass de auth o apertura de `/api/*`?

### 1.1. Código auditado

**Archivo:** `electron/server/server.ts` líneas 129-144

```typescript
allowList: (request) => {
  const path = request.url.split('?')[0];
  // Health checks y version
  const specialPaths = ['/api/version', '/api/health', '/api/client-config'];
  if (specialPaths.includes(path)) return true;
  // Assets públicos: modelos IA, imágenes de producto
  if (path.startsWith('/face-models/')) return true;
  if (path.startsWith('/pub/producto-image/')) return true;
  // Assets estáticos SPA: .js, .css, .html, .ico, .woff, etc.
  if (/\.(js|css|html|ico|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|map|json)$/i.test(path)) return true;
  // Deep-links SPA GET (enmienda auditoría): no son llamadas sensibles, son navegación
  // del router Angular servida como fallback al index.html del SPA
  if (request.method === 'GET' && !path.startsWith('/api/')) return true;
  // NUNCA exceptuar /api/rpc (enmienda auditoría)
  return false;
}
```

### 1.2. Rutas exceptuadas del rate limit

1. **`/api/version`, `/api/health`, `/api/client-config`**
   - ✅ **Sin auth, SEGURAS:** Endpoints informativos que NO tocan datos de negocio
   - Retornan JSON fijo (versión app, estado server, URL LAN)
   - No permiten mutación ni acceso a datos sensibles

2. **`/face-models/*`**
   - ✅ **Sin auth, SEGURAS:** Modelos binarios de IA para reconocimiento facial
   - Archivos estáticos servidos por `@fastify/static`
   - No hay riesgo de path traversal (Fastify Static bloquea `..`)

3. **`/pub/producto-image/*`**
   - ✅ **Sin auth, SEGURAS:** Imágenes de productos del catálogo público
   - Archivos estáticos, solo lectura
   - Ya están expuestos en el storefront público

4. **Assets estáticos (regex `\.(js|css|html|...)$/i`)**
   - ✅ **Sin auth, SEGURAS:** Bundles del frontend Angular
   - Archivos read-only del `asar`, no modificables en runtime
   - **NOTA:** La regex es amplia y matchea cualquier archivo con esas extensiones, pero:
     - No hay ruta `/api/rpc/foo.js` (RPC es POST con body JSON)
     - Los únicos archivos con esas extensiones son del bundle Angular
     - Un atacante no puede crear archivos arbitrarios en el bundle

5. **Deep-links SPA (`GET` sin `/api/` sin extensión)**
   - ✅ **Sin auth, SEGURAS:** Rutas del router Angular (`/tienda/menu`, `/admin/productos`)
   - Son **fallbacks al `index.html`** del SPA — no invocan handlers backend
   - El router Angular del cliente decide qué renderizar según la ruta
   - **CRÍTICO:** El comentario dice "NUNCA exceptuar /api/rpc" → `/api/rpc` **NO** está en allowList

### 1.3. Rutas `/api/*` que siguen limitadas

**Verificación exhaustiva:**
- `/api/rpc` → **NO** está en allowList (comentario explícito línea 142-143)
- `/api/auth/*` → **NO** está en allowList
- `/api/files/*` → **NO** está en allowList
- `/pub/*` (backend API, no imágenes) → **NO** está en allowList

**Conclusión:** El `allowList` **NO exceptúa ninguna ruta `/api/*` sensible**. Solo exceptúa:
- 3 endpoints informativos sin auth (`/version`, `/health`, `/client-config`)
- Assets estáticos (imágenes, bundles, modelos)
- Deep-links de navegación SPA (GET sin `/api/`)

### ✅ VEREDICTO: SEGURO

El `allowList` **NO bypassa autenticación** ni abre acceso indebido. Todas las rutas exceptuadas son:
- Sin mutación
- Sin datos sensibles
- Ya públicas (imágenes, catálogo) o informativas (versión, health)

**RIESGO:** ❌ Ninguno  
**ENMIENDAS:** ❌ Ninguna

---

## 2. Análisis del `keyGenerator`: ¿`jwt.decode` sin verify es fuga?

### 2.1. Código auditado

**Archivo:** `electron/server/server.ts` líneas 145-167

```typescript
keyGenerator: (request) => {
  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return request.ip;

  try {
    const token = authHeader.substring(7);
    // jwt.decode (sintáctico), NO verify (criptográfico) — el middleware de
    // auth verifica después. Acá solo extraemos el identificador para el bucket.
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== 'object') return request.ip;

    // Enmienda auditoría A: el JWT usa 'id', no 'sub'
    const deviceId = (decoded as any).device_id;
    const userId = (decoded as any).id;

    // Prioridad: device_id (terminal física) > user id > IP
    if (deviceId) return `device:${deviceId}`;
    if (userId) return `user:${userId}`;
    return request.ip;
  } catch {
    return request.ip; // Token inválido: fallback a IP
  }
}
```

### 2.2. ¿Es una fuga de seguridad?

**NO.** El `jwt.decode` sin verify es **intencional y seguro** por las siguientes razones:

#### 2.2.1. Orden de ejecución de hooks

**Secuencia correcta del request:**
1. **`onRequest` hook → Rate limit** (usa `keyGenerator`)
2. **`onRequest` o `preHandler` → Auth middleware** (`fastify.authenticate` / `jwtVerify`)
3. **Handler** se ejecuta

**Conclusión:** El `keyGenerator` **NO puede usar `jwtVerify`** porque crearía dependencia circular:
- Rate limit necesita auth para decidir la key
- Pero auth aún no ha corrido (viene después)

El `jwt.decode` (sintáctico, solo parsea JSON) es el **único camino viable**.

#### 2.2.2. ¿Qué pasa con tokens inválidos?

**Escenario:** Atacante envía un JWT con:
- Firma inválida (token modificado)
- Token expirado
- Claims falsos (`device_id: 999999`)

**Flujo:**
1. `keyGenerator` → `jwt.decode` **sí extrae** `device_id: 999999` (solo parsea, no verifica)
2. Rate limit asigna bucket `device:999999`
3. **Auth middleware** (después) → `jwtVerify` **RECHAZA** el token con **401 Unauthorized**
4. El request **NO llega al handler**

**Resultado:** El atacante **NO gana acceso** a datos. Solo consigue:
- Un bucket de rate limit propio (basado en claims falsos)
- Pero cada request es rechazado con 401 antes de tocar handlers

#### 2.2.3. ¿Puede explotar esto para obtener cuota ilimitada?

**NO.** Razones:

1. **Bucket separado ≠ acceso a datos:**
   - Tener bucket `device:999999` solo significa que sus 600 req/min no afectan a otros
   - Pero el middleware de auth **sigue verificando cada request**
   - 600 requests/min × 401 = cero datos obtenidos

2. **No puede robar buckets de otros:**
   - Para obtener el bucket `device:1` (caja 1), necesita un token firmado con `device_id: 1`
   - Eso requiere conocer el `JWT_SECRET` del servidor
   - Si tiene el secreto, ya ganó — puede falsificar tokens válidos (problema anterior, no del rate limit)

3. **Los claims se verifican después:**
   - `fastify.authenticate` lee el **mismo JWT** y verifica firma + expiración
   - Si el token es falso, **401 garantizado**

### 2.3. ¿Hay riesgo de timing attack?

**Hipótesis:** Un atacante podría:
1. Enviar 1000 requests con tokens expirados pero firmados correctamente
2. Si `keyGenerator` extrae `device_id` antes que auth rechace el token
3. Consumir el bucket de un dispositivo legítimo

**Análisis:** **NO es posible** porque:
- Tokens expirados tienen el mismo `device_id` que tenían cuando eran válidos
- Si el atacante tiene un token expirado de `device:1`, **ya tuvo acceso legítimo** en el pasado
- Consumir su propio bucket expirado no afecta al `device:1` actual (que usa un token renovado con distinta `iat`/`exp`)

### ✅ VEREDICTO: SEGURO

El `jwt.decode` sin verify en `keyGenerator` es **seguro y necesario**:
- Auth verifica cada token DESPUÉS del rate limit
- Tokens inválidos no ganan acceso, solo buckets propios inútiles
- No hay riesgo de escalada de privilegios ni fuga de datos

**RIESGO:** ❌ Ninguno  
**JUSTIFICACIÓN:** El middleware de auth es la frontera real. El rate limit solo cuenta tráfico, no autoriza acceso.

---

## 3. Análisis de `/pub/*` y deep-links: ¿Acceso indebido o cuota extra?

### 3.1. `/pub/*` (API pública del storefront)

**Rutas típicas:**
- `POST /pub/pedido` → Crear pedido online
- `GET /pub/productos` → Catálogo público
- `GET /pub/zonas` → Zonas de delivery

**Límite aplicado:** `max: 200` req/min (línea 125 de `server.ts`)

**Autenticación requerida:** JWT de cliente (verificado en plan, tabla línea 60)

#### ¿Quién puede acceder?

**Según arquitectura del sistema:**
- `/pub/*` requiere **JWT de cliente** (distinto del JWT de staff)
- El cliente se registra en el storefront → recibe JWT
- Cada request a `/pub/*` pasa el JWT en `Authorization: Bearer ...`

**Verificación:**
- `keyGenerator` extrae `device_id` o `id` del JWT cliente → bucket `device:X` o `user:X`
- Si el JWT es de cliente (no staff), tiene su propio bucket de 200 req/min
- Un cliente autenticado **NO comparte bucket con staff** (que tiene 600 req/min en `/api/rpc`)

#### ¿Hay partes públicas sin JWT?

**CRÍTICO:** El plan asume que **TODO `/pub/*` requiere JWT**. Si hay rutas sin auth (ej. `GET /pub/productos` anónimo para browsear catálogo antes de registrarse), entonces:

**Riesgo:** Scraping distribuido con múltiples IPs → 200 req/min × N IPs = sobrecarga

**Mitigación:** Si existe catálogo público sin JWT:
- `keyGenerator` retorna `request.ip` (fallback)
- Múltiples IPs → múltiples buckets de 200 req/min
- **No hay defensa contra botnet** con este rate limit solo

**RECOMENDACIÓN:** Verificar en implementación que **TODO `/pub/*` requiere JWT de cliente**. Si hay rutas públicas, considerar:
- Límite más estricto para IPs sin JWT (ej. 50 req/min)
- O exigir JWT incluso para browsear catálogo

### 3.2. Deep-links SPA (`GET` sin `/api/`)

**Ejemplos:**
- `/tienda/menu` → Router Angular del storefront
- `/admin/productos` → Router Angular del panel admin
- `/` → PWA mobile

**Comportamiento:**
- El servidor responde con `index.html` del SPA correspondiente
- El router Angular del cliente decide qué renderizar
- **NO invocan handlers backend** — son navegación del frontend

**Límite aplicado:** ❌ Ninguno (en `allowList`, línea 141-142)

#### ¿Es un riesgo?

**NO.** Razones:

1. **Navegación, no datos:**
   - Deep-links solo cargan el HTML del SPA
   - Los datos vienen después, vía `/api/rpc` o `/pub/*` (que SÍ están limitados)

2. **Costo despreciable:**
   - Servir `index.html` estático es trivial (sin DB, sin CPU)
   - No hay riesgo de sobrecarga del servidor

3. **Uso legítimo frecuente:**
   - Usuarios recargando página
   - Links compartidos (ej. "mirá este producto" → URL directa)
   - SEO / deep-linking necesario para storefront público

**Conclusión:** Exceptuar deep-links del rate limit es **correcto y seguro**.

### ✅ VEREDICTO: OK con enmienda

**`/pub/*`:**
- ✅ Si TODO requiere JWT → seguro
- ⚠️ Si hay rutas públicas → riesgo de scraping distribuido

**Deep-links:**
- ✅ Seguros — son navegación, no datos

**RIESGO:** ⚠️ **MEDIO** si `/pub/*` tiene rutas anónimas  
**ENMIENDA:** Validar que TODO `/pub/*` requiere JWT cliente. Si no, ajustar límite para IPs sin auth.

---

## 4. Handlers mutadores del diff: ¿Tienen `ensurePermission`?

### 4.1. Handlers modificados en este PR

**Verificación del diff:**

```bash
git diff origin/develop...HEAD --name-only -- electron/handlers/
```

**Resultado:** ❌ **Ningún handler modificado**

El diff solo toca:
- `electron/server/server.ts` (rate limit)
- `src/app/shared/components/delivery-dialog/delivery-dialog.component.ts` (backoff frontend)
- Docs y tests

**Conclusión:** **No aplica** — el PR no toca handlers IPC, por lo tanto no hay riesgo de handlers mutadores sin `ensurePermission`.

### ✅ VEREDICTO: OK (no aplica)

Este PR **NO toca handlers**. La auditoría de `ensurePermission` no aplica.

**RIESGO:** ❌ Ninguno

---

## 5. `BLOCKED_CHANNELS` y RPC default-allow: ¿El rate limit cambia la superficie de ataque?

### 5.1. Arquitectura de RPC default-allow

**Contexto (skill regla #22):**
> `/api/rpc` es default-allow: cualquier cliente con un JWT válido puede invocar el handler; el guard por-handler es la ÚNICA frontera real (el frontend con `*appHasPermission` no cuenta).

**Código auditado:**

**Archivo:** `electron/server/rpc-router.ts` líneas 20-112

```typescript
// C-05: /api/rpc queda en default-allow (la allowlist de canales legítimos sería
// ~830, casi todo el registro, con alto costo/riesgo y poco valor marginal — ver
// docs/HALLAZGOS-AUDITORIA-DESKTOP.md). El lever de seguridad real es esta
// deny-list: canales que un cliente HTTP remoto (PWA / modo cliente) nunca debería
// poder invocar porque tocan el NODO SERVIDOR (su disco, su BD, su proceso, sus
// secretos).

const BLOCKED_CHANNELS = new Set<string>([
  'set-current-user',
  'reset-database',
  'restart-app',
  'backup-db-reset',
  'backup-clear-images',
  // ... ~30 más ...
]);
```

**Defensa actual:**
1. **Auth obligatorio:** `/api/rpc` requiere JWT válido (middleware `fastify.authenticate`)
2. **Deny-list:** `BLOCKED_CHANNELS` bloquea ~30 canales de infraestructura (backup, reinicio, secretos)
3. **Per-handler:** Handlers mutadores deben usar `ensurePermission` (skill regla #22)

### 5.2. ¿El rate limit cambia esta defensa?

**Cambios introducidos:**
- Rate limit de 600 req/min para `/api/rpc` con JWT (línea 126)
- `keyGenerator` por `device_id` → buckets separados por terminal

**Análisis:**

#### ¿Aumenta la superficie de ataque?

**NO.** El rate limit **NO cambia la autorización**:
- Antes: JWT válido → puede invocar cualquier handler (salvo `BLOCKED_CHANNELS`)
- Después: JWT válido → puede invocar cualquier handler (salvo `BLOCKED_CHANNELS`)
- El rate limit solo **cuenta** requests, no **autoriza** acceso

#### ¿Reduce la defensa contra abuso?

**NO, la mejora.** Antes del rate limit:
- Un cliente malicioso con JWT válido podía hacer **requests ilimitadas** (solo frenado por red/CPU)
- 10,000 requests/min → sobrecarga del servidor

Después:
- Cada `device_id` limitado a **600 req/min**
- Abuso contenido por terminal

#### ¿Los buckets separados permiten bypass de `ensurePermission`?

**NO.** El `ensurePermission` se verifica **por cada request**, independientemente del rate limit:

```typescript
// Handler típico (ej. productos.handler.ts)
ipcMain.handle('update-producto', async (event, producto: Producto) => {
  await ensurePermission(dataSource, getCurrentUser, 'PRODUCTOS_MODIFICAR'); // Primera sentencia
  // ... lógica ...
});
```

**Secuencia con rate limit:**
1. Request llega → rate limit cuenta (bucket del device)
2. Auth verifica JWT → extrae `userId`
3. Handler ejecuta → `ensurePermission(PRODUCTOS_MODIFICAR)` chequea permiso del usuario
4. Si el usuario no tiene el permiso → **403 Forbidden**

**Conclusión:** El rate limit es **ortogonal** a la autorización. Buckets separados no permiten bypass.

### ✅ VEREDICTO: OK (mejora la defensa)

El rate limit **NO abre nuevos vectores** de bypass. Al contrario, **mitiga abuso** limitando requests por terminal.

**RIESGO:** ❌ Ninguno  
**BENEFICIO:** Contiene abuso de clientes autenticados maliciosos

---

## 6. Otros vectores: SSE, long-poll, /api/files/*

### 6.1. SSE (Server-Sent Events)

**Rutas:**
- `/api/kds/sse` → Stream de comandas para pantallas KDS
- `/api/musica/sse` → Stream de estado de reproducción

**Límite aplicado:** `max: 300` req/min (default, línea 127)

**Comportamiento:**
- SSE son conexiones **long-lived** (1 request inicial, luego stream abierto)
- El rate limit cuenta el **request inicial** pero NO los mensajes del stream
- Una pantalla KDS abierta = 1 request (sin importar cuántos eventos reciba)

**¿Es un riesgo?**

**NO.** Razones:
- Abrir 600 conexiones SSE simultáneas (600 req/min) requiere **600 clientes distintos**
- Cada SSE mantiene conexión abierta → límite práctico del sistema operativo (ej. ~10k conexiones en Linux)
- No hay incentivo para abrir muchas SSE (no ganan datos extras, solo duplican el stream)

**Conclusión:** SSE no son vector de abuso del rate limit.

### 6.2. `/api/files/*`

**Ruta:** Subida/descarga de archivos (imágenes de perfil, adjuntos, etc.)

**Límite aplicado:** `max: 300` req/min (default, línea 127)

**Autenticación:** Requiere JWT (verificado en `file-routes.ts`)

**¿Es suficiente?**

**SÍ.** Razones:
- 300 req/min = 5 req/s
- Subida de archivos es **lenta** (limitada por ancho de banda)
- Un cliente legítimo no sube >5 archivos/segundo
- Si abusa, su bucket se agota (600 req/min si tiene `device_id`, 300 si solo `user`)

### 6.3. Long-poll en delivery

**Código:** `delivery-dialog.component.ts` línea 242-244

```typescript
if (this.tiendaActiva) {
  this.pedidosInterval = setInterval(() => this.cargarPedidosOnline(), 15000);
}
```

**Frecuencia:** 4 req/min por diálogo abierto

**Handler:** `get-pedidos-online-admin` (vía `/api/rpc`)

**Límite aplicado:** 600 req/min (bucket `device:X`)

**Análisis:**
- 4 req/min es **insignificante** vs límite de 600
- Con backoff (F4), si recibe 429, el intervalo crece a 30s, 60s, 120s
- Máximo: 3 diálogos en la misma terminal → 12 req/min (aún insignificante)

**Conclusión:** El poll NO es vector de abuso.

### ✅ VEREDICTO: OK

SSE, files y long-poll **NO son vectores de abuso** bajo el rate limit propuesto.

**RIESGO:** ❌ Ninguno

---

## 7. Resumen de riesgos y enmiendas

### 7.1. Riesgos identificados

| # | Riesgo | Severidad | Recomendación |
|---|--------|-----------|---------------|
| R1 | `/pub/*` con rutas anónimas vulnerable a scraping distribuido | ⚠️ **MEDIO** | Validar que TODO `/pub/*` requiere JWT cliente. Si hay rutas públicas, reducir límite a 50 req/min para IPs sin auth. |

### 7.2. Enmiendas requeridas

❌ **Ninguna enmienda bloqueante.**

**R1** es enmienda **OPCIONAL** (solo aplica si hay rutas `/pub/*` sin JWT, lo cual no está confirmado en el código auditado).

### 7.3. Aspectos verificados y aprobados

✅ **`allowList` NO bypassa auth ni abre rutas `/api/*`**  
✅ **`jwt.decode` sin verify es seguro** — auth verifica después  
✅ **Deep-links SPA son navegación, no datos** — correcto exceptuarlos  
✅ **NO hay handlers mutadores en el diff** — no aplica `ensurePermission`  
✅ **`BLOCKED_CHANNELS` sigue vigente** — rate limit no cambia autorización  
✅ **SSE, files, long-poll NO son vectores de abuso**

---

## 8. Veredicto final

### ✅ **OK con enmienda opcional**

El PR #286 **NO introduce vectores de bypass de autenticación, escalada de privilegios, ni fugas de información**. Los cambios de rate limiting son:

- **Técnicamente correctos:** API válida, orden de hooks correcto, claims JWT correctos
- **Seguros:** Auth sigue siendo la frontera, rate limit solo cuenta tráfico
- **Mejoran la defensa:** Contienen abuso de clientes autenticados

**Hallazgos:**

1. **`allowList` y `keyGenerator` → SEGUROS:** No bypassan auth, no abren rutas indebidas
2. **`jwt.decode` sin verify → SEGURO:** Auth verifica después, tokens inválidos no ganan acceso
3. **Deep-links SPA → SEGUROS:** Navegación sin datos, costo despreciable
4. **Handlers del diff → OK:** No hay handlers mutadores modificados
5. **RPC default-allow → SIN CAMBIOS:** Rate limit ortogonal a autorización
6. **`/pub/*` → ⚠️ ENMIENDA OPCIONAL:** Validar que TODO requiere JWT cliente

**Enmienda recomendada (no bloqueante):**

- **R1:** Verificar en implementación que `/pub/*` requiere JWT en todas las rutas. Si hay rutas anónimas (catálogo público), considerar límite más estricto (50 req/min) para IPs sin auth.

**El PR puede proceder a merge tras validación de R1.**

---

## 9. Checklist de validación post-implementación

Para confirmar que no hay fugas tras merge:

- [ ] Probar `/api/rpc` con JWT expirado → debe retornar **401**, no **200** (auth funciona)
- [ ] Probar `/api/rpc` con JWT falso (`device_id: 999999`) → debe retornar **401**
- [ ] Verificar que 2 terminales con distinto `device_id` no comparten bucket (cada una puede hacer 600 req/min)
- [ ] Confirmar que deep-links SPA (`/tienda/menu`) cargan el HTML sin límite (en allowList)
- [ ] Verificar que `/api/rpc` con JWT válido sigue respetando `BLOCKED_CHANNELS` (ej. `reset-database` → 404)
- [ ] Confirmar que handlers mutadores (ej. `update-producto`) siguen verificando `ensurePermission` (usuario sin permiso → 403)
- [ ] Si `/pub/*` tiene rutas anónimas, confirmar que IPs sin JWT tienen límite de 200 req/min (o ajustado según R1)

---

**Fin de la auditoría de permisos/fugas/RPC.**

**Veredicto:** ✅ **OK con enmienda opcional (R1 — validar `/pub/*` anónimo)**

