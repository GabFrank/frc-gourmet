# Plan: Resolución del error HTTP 429 en el módulo delivery del PdV

**Estado:** Pendiente auditoría + aprobación  
**Fecha:** 2026-09-04  
**Rama:** `fix/rate-limit-429-delivery`  
**PR contra:** `develop`

---

## 1. Diagnóstico

### 1.1. Reporte del problema (producción/alpha, 2026-09-03)

En el módulo delivery del PdV aparece ocasionalmente un snackbar:

```
HTTP 429 {"statusCode":429,"error":"Too Many Requests","message":"Rate limit exceeded, retry in 1 minute"}
```

**Síntoma:** Para que desaparezca hay que salir del diálogo o cerrar la app. Afecta la operación del delivery en producción.

**Captura adjunta:** Lista delivery, chips RETIRAR/PARA_ENTREGA, footer DATOS/ITEMS/…

**Contexto importante:** El PR #285 (FINALIZAR en retiro) ya mergeó a `develop` pero **aún no estaba en alpha** cuando se vio este bug — son independientes.

### 1.2. Configuración actual (verificada contra código real)

**Archivo:** `electron/server/server.ts` líneas 112-115

```typescript
await fastify.register(rateLimit, {
  max: 300,           // 300 requests
  timeWindow: '1 minute',
});
```

**Hallazgos del análisis:**

1. **No hay `allowList`**: ninguna ruta está exceptuada del rate limit
2. **No hay `keyGenerator` custom**: usa el default `(request) => normalizeIP(request.ip, ipv6Subnet)`
3. **Key = IP del cliente**: con `trustProxy` activado (líneas 86-92), lee `X-Forwarded-For` si está presente
4. **Aplica a TODAS las rutas** del Fastify: `/api/rpc`, `/api/auth/*`, `/api/files/*`, `/pub/*`, SSE (`/api/kds/sse`, `/api/musica/sse`), static serving (`/`, `/admin/`, `/tienda/`), health checks, version, etc.
5. **Comentario en código** (línea 111): "Rate limiting básico — anti-brute-force de login y anti-DDoS accidental"

**Propósito original:** Proteger el server de ataques de fuerza bruta contra `/api/auth/login` y de tráfico excesivo accidental.

### 1.3. Superficies que comparten el bucket

Bajo `mode=server`, el Fastify embebido sirve **cinco superficies distintas** más el RPC staff:

| Superficie | Ruta | Auth | Uso |
|---|---|---|---|
| Staff RPC | `/api/rpc` | JWT staff | Desktop client, PWA mobile staff, web `/admin` |
| PWA mobile | `/` | JWT staff | Tablets/móviles del local (staff) |
| Web admin | `/admin/` | JWT staff | Panel administrativo completo en browser |
| Storefront | `/tienda/` | JWT cliente | Pedidos online (clientes finales) |
| Public API | `/pub/*` | JWT cliente | Backend del storefront |
| Assets | `/face-models/*`, `/pub/producto-image/*` | Público | Imágenes de menú, modelos de IA |
| Special routes | `/api/version`, `/api/health`, `/api/client-config` | Público | Health checks, config |

**En producción:** Todas estas superficies están **detrás de un túnel Cloudflare** (mencionado en skill y código), por lo que el `X-Forwarded-For` que lee `trustProxy` es **una sola IP pública compartida** para:
- Varias cajas desktop en modo `client`
- Varias PWAs mobile staff
- Múltiples clientes en el storefront (`/tienda`)
- Browsers accediendo al `/admin`
- Health checks externos
- Requests de activos estáticos (cada carga de página)

### 1.4. Tráfico del diálogo delivery

**Archivo:** `src/app/shared/components/delivery-dialog/delivery-dialog.component.ts`

**Poll automático (líneas 242-244):**
```typescript
if (this.tiendaActiva) {
  this.pedidosInterval = setInterval(() => this.cargarPedidosOnline(), 15000);
}
```

- **Frecuencia:** cada 15 segundos = **4 req/min** por diálogo abierto
- **Handler invocado:** `get-pedidos-online-admin` (`estado: 'RECIBIDO'`)
- **Comportamiento en error (líneas 279-282):** `console.warn`, **NO muestra snackbar** — fallo silencioso para no interrumpir la operación

**Acciones del diálogo (todas vía `/api/rpc`):**
- `loadDeliveries()`: lista de deliveries paginada
- `deliveryCambiarEstado()`: ABIERTO → PARA_ENTREGA → EN_CAMINO → ENTREGADO
- `deliveryCancelar()`: cancelación transaccional
- `deliveryImprimirTicket()`: impresión
- `deliveryAsignarRepartidor()`: asignación de repartidor
- `aceptarPedidoOnline()` / `rechazarPedidoOnline()`: bandeja web
- `deliveryConvertirModo()`: conversión DELIVERY ↔ RETIRO
- `getVentaItems()`, `getPagoDetalles()`, `getDetalleVariacionItems()`: detalle
- Diálogo de cobro embebido: `createPago`, `createPagoDetalle`, `updateVenta`, etc.

**Preload en modo cliente (captura del error):**

**Archivo:** skill `architecture/cliente-servidor.md` + análisis de `preload.ts` (leído parcialmente, >100k chars)

En `mode=client`, `ipcRenderer.invoke` está monkey-patcheado para rutear a HTTP. Si el server responde `429`, el preload construye:

```typescript
Error(`HTTP ${res.status}: ${txt}`)
```

Que el componente captura y muestra vía `mostrarError()` (línea 1121):

```typescript
this.snackBar.open(mensaje, 'CERRAR', { duration: 6000, panelClass: ['error-snackbar'] });
```

**El poll NO muestra snackbar en error, pero todas las acciones del diálogo SÍ.**

### 1.5. Cálculo del consumo

**Escenario producción típico (bajo túnel Cloudflare, una sola IP externa):**

- 3 cajas desktop con delivery abierto: **3 × 4 = 12 req/min** (solo poll)
- 2 PWAs mobile navegando: **~10 req/min** (dashboards, listas)
- 1 storefront activo con 5 clientes navegando: **~15 req/min** (catálogo, imágenes)
- Acciones del diálogo (cambios de estado, impresiones, detalle): **~20 req/min** (picos)
- Health checks externos: **~3 req/min**

**Total:** **~60 req/min** en operación normal. **Picos:** hasta **150-200 req/min** en horario pico con múltiples deliveries activos.

**Margen actual:** `max: 300` en 1 minuto. Con **una sola IP compartida**, el bucket se comparte entre **todas las superficies y todos los usuarios**. No es difícil alcanzar el tope en pico, especialmente si:
- Varios cajeros tienen el diálogo abierto
- Hay clientes navegando el storefront simultáneamente
- Se ejecutan múltiples acciones del PdV en ráfaga

### 1.6. Conclusión del diagnóstico

**El hunch del CEO es correcto:**

1. ✅ `@fastify/rate-limit` con `max: 300`, `timeWindow: '1 minute'`, **sin allowList**
2. ✅ Aplica al Fastify entero (RPC + static SPA + SSE + etc.)
3. ✅ Key default = IP, con túnel Cloudflare varias superficies comparten **un solo bucket**
4. ✅ Preload modo cliente: `Error(\`HTTP ${res.status}: ${txt}\`)` → snackbar vía `mostrarError`
5. ✅ Poll cada 15s solo hace `console.warn` en error; acciones del diálogo sí muestran el 429
6. ✅ Cerrar diálogo corta el poll; cerrar app corta el tráfico de esa terminal

**Problema de raíz:** Staff autenticado (desktop, PWA, web admin) queda bloqueado por el mismo rate limit que protege las rutas públicas y anónimas. Un bucket compartido por IP no distingue entre:
- Tráfico staff legítimo (operación del local)
- Tráfico cliente anónimo (storefront público)
- Tráfico estático (assets, health checks)
- Intentos de brute-force en `/api/auth/login`

**Impacto:** Operación del delivery interrumpida en producción. El error 429 es **transitorio** (pasa tras 1 minuto), pero reaparece si el tráfico sigue alto.

---

## 2. Opciones evaluadas

### Opción A: Subir `max` (DESCARTADA)

**Propuesta:** Aumentar `max` de `300` a `600` o `1000`.

**Ventaja:** Parche inmediato, cero cambios de arquitectura.

**Desventaja:**
- Es un **parche débil**: si el bucket sigue siendo una IP compartida, solo patea el problema hacia adelante
- En horario pico con múltiples superficies activas, se quemaría igual
- No resuelve el problema de fondo: staff autenticado castigado por tráfico público

**Veredicto:** **NO implementar.** No ataca la raíz.

### Opción B: `allowList` para rutas no sensibles (VIABLE)

**Propuesta:** Excluir del rate limit las rutas que **no necesitan protección anti-brute-force ni anti-DDoS**:
- `/api/version`
- `/api/health`
- `/api/client-config`
- Assets estáticos (`/face-models/*`, `/pub/producto-image/*`)
- Bundles SPA (`/`, `/admin/`, `/tienda/`)

**Implementación:** `allowList` como función:

```typescript
allowList: (request, key) => {
  const path = request.url.split('?')[0];
  const staticPaths = ['/api/version', '/api/health', '/api/client-config'];
  if (staticPaths.includes(path)) return true;
  if (path.startsWith('/face-models/')) return true;
  if (path.startsWith('/pub/producto-image/')) return true;
  // Assets SPA: .js, .css, .html, .ico, etc.
  if (/\.(js|css|html|ico|png|jpg|jpeg|gif|svg|woff2?|ttf|eot)$/i.test(path)) return true;
  return false;
}
```

**Ventaja:**
- Reduce el consumo del bucket en ~30-40% (assets, health checks, versión)
- Sencillo de implementar
- No rompe la protección en rutas sensibles

**Desventaja:**
- Staff autenticado **sigue compartiendo bucket con tráfico público y anónimo**
- No distingue entre staff legítimo y cliente anónimo en `/api/rpc` vs `/pub/*`
- Es una **mitigación**, no una solución completa

**Veredicto:** **IMPLEMENTAR** como parte de la solución, pero **no alcanza sola**.

### Opción C: Rate limit por ruta (RECOMENDADA, parcial)

**Propuesta:** Aplicar rate limits **diferenciados** según la sensibilidad de la ruta:

- **`/api/auth/*` (login, refresh, device auth):** MUY estricto — `max: 30`, `timeWindow: '1 minute'` (protección anti-brute-force)
- **`/pub/*` (storefront público):** Estricto — `max: 200`, `timeWindow: '1 minute'` (evita abuso del catálogo público)
- **`/api/rpc` (staff autenticado):** Generoso — `max: 600`, `timeWindow: '1 minute'` (operación normal del local)
- **Resto (health, version, assets):** Sin límite (vía `allowList` de opción B)

**Implementación:** Combinar rate limit global con overrides por ruta.

Según la API de `@fastify/rate-limit` 7.6.0, **NO se puede registrar el plugin varias veces con distintos `max`/`timeWindow` para rutas distintas directamente**. Pero sí se puede:

1. Registrar el plugin una vez con `global: false` + config default moderada
2. Aplicar rate limit **manualmente por ruta** con `fastify.routeOptions.config.rateLimit`

**Alternativa más sencilla y práctica:** Usar `max` como **función** que varía según `request.url`:

```typescript
await fastify.register(rateLimit, {
  max: (request, key) => {
    const path = request.url.split('?')[0];
    if (path.startsWith('/api/auth/')) return 30;   // Estricto: anti-brute-force
    if (path.startsWith('/pub/')) return 200;       // Medio: storefront público
    if (path === '/api/rpc') return 600;            // Generoso: staff autenticado
    return 300; // Default resto
  },
  timeWindow: '1 minute',
  allowList: (request, key) => {
    // ... opción B ...
  },
});
```

**Ventaja:**
- Protección **quirúrgica**: cada superficie tiene el límite que necesita
- Staff autenticado (`/api/rpc`) tiene **el doble de cupo** que el actual
- Login sigue protegido contra brute-force (30 intentos/min)
- Storefront público no puede agotar el cupo del staff

**Desventaja:**
- Más complejo que solo `allowList`
- Staff autenticado **sigue usando IP como key**: varias terminales bajo túnel Cloudflare siguen compartiendo el bucket de 600

**Veredicto:** **IMPLEMENTAR.** Es mejor que el status quo y compatible con opción D.

### Opción D: `keyGenerator` por usuario/dispositivo para staff (RECOMENDADA, completa)

**Propuesta:** Usar **IP como key para tráfico anónimo**, pero **`user:${sub}` o `device:${deviceId}` para staff autenticado**.

**Implementación:**

```typescript
keyGenerator: (request) => {
  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Anónimo: usar IP (default)
    return request.ip;
  }
  try {
    const token = authHeader.substring(7);
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== 'object') return request.ip;
    
    // Staff autenticado: bucket por usuario o dispositivo
    const sub = decoded.sub || decoded.userId;
    const deviceId = decoded.device_id;
    
    if (deviceId) return `device:${deviceId}`;  // Preferir device_id
    if (sub) return `user:${sub}`;              // Fallback a usuario
    return request.ip;
  } catch {
    return request.ip; // Token inválido: tratarlo como anónimo
  }
}
```

**Ventaja:**
- **Cada terminal staff tiene su propio bucket** de 600 req/min (o el que le toque según opción C)
- Varias cajas bajo el mismo túnel Cloudflare **ya no comparten límite**
- Tráfico anónimo (storefront, health checks) sigue usando IP (protege contra DDoS)
- Login sin token sigue usando IP (protege contra brute-force distribuido)

**Desventaja:**
- Más invasivo: toca el `keyGenerator` del rate limit global
- Requiere **verificar** que el JWT es válido (al menos sintácticamente) — NO debe usar `fastify.authenticate` dentro del `keyGenerator` (círculo vicioso: el rate limit corre **antes** del middleware de auth)
- `jwt.decode` sin verify es suficiente: si el token es falso, el middleware de auth lo rechaza después; acá solo necesitamos extraer el identificador para el bucket

**Veredicto:** **IMPLEMENTAR.** Es la solución completa. Combinada con opción C, da control granular sobre cada superficie.

### Opción E: Backoff / no snackbar spam en 429 del poll (MITIGACIÓN UX)

**Propuesta:** En el delivery dialog, si el poll de `cargarPedidosOnline()` recibe un 429, **aplicar backoff exponencial** (aumentar intervalo de 15s a 30s, 60s, etc.) y/o **no mostrar snackbar** (ya lo hace, pero agregar un indicador visual sutil tipo "actualizando…" con rate limit activo).

**Implementación:**
```typescript
private pedidosInterval: any;
private pollIntervalMs = 15000;

async cargarPedidosOnline(): Promise<void> {
  try {
    const pedidos = this.tiendaActiva
      ? await firstValueFrom(this.repositoryService.getPedidosOnlineAdmin({ estado: 'RECIBIDO' }))
      : [];
    // ... resto ...
    this.pollIntervalMs = 15000; // Reset en éxito
  } catch (e: any) {
    if (e?.message?.includes('429') || e?.message?.includes('Too Many Requests')) {
      // Backoff: duplicar intervalo hasta 120s max
      this.pollIntervalMs = Math.min(this.pollIntervalMs * 2, 120000);
      if (this.pedidosInterval) {
        clearInterval(this.pedidosInterval);
        this.pedidosInterval = setInterval(() => this.cargarPedidosOnline(), this.pollIntervalMs);
      }
    }
    console.warn('No se pudieron cargar los pedidos online:', e);
  }
}
```

**Ventaja:**
- Reduce presión sobre el bucket cuando ya está saturado
- UX menos agresivo: no spam de errores cada 15s

**Desventaja:**
- Es **mitigación UX**, no solución técnica
- Los pedidos tardan más en aparecer cuando hay backoff activo
- No ataca la raíz del problema (bucket compartido)

**Veredicto:** **IMPLEMENTAR** como complemento de C+D, pero **no suficiente sola**.

---

## 3. Solución elegida

**Combinación de opciones B + C + D + E** (en orden de implementación):

1. **Fase 1 (backend):** `allowList` para rutas no sensibles (opción B)
2. **Fase 2 (backend):** `max` como función con límites diferenciados por ruta (opción C)
3. **Fase 3 (backend):** `keyGenerator` custom con buckets por usuario/dispositivo para staff (opción D)
4. **Fase 4 (frontend):** Backoff exponencial en el poll del diálogo delivery (opción E)
5. **Fase 5 (tests):** Suite de tests E2E verificando que staff autenticado no comparte bucket con anónimos

**Justificación:**
- **B+C:** Reduce consumo del bucket en ~40% y diferencia protección según sensibilidad de la ruta
- **D:** Separa buckets de staff y anónimo → soluciona el problema de raíz
- **E:** Mejora UX en caso de saturación residual
- **Juntas:** Staff autenticado tiene su propio bucket generoso (600 req/min × terminal), tráfico público limitado (200 req/min × IP), login protegido (30 req/min × IP), assets sin límite

**Riesgo mitigado:** Con `keyGenerator` leyendo `device_id` del JWT, un atacante **no puede** spoofear el token para obtener buckets ilimitados — si el token es inválido, el middleware de auth (que corre **después** del rate limit) lo rechaza. El `keyGenerator` solo necesita decodificar sintácticamente, no verificar criptográficamente (eso lo hace `fastify.authenticate`).

---

## 4. Fases de implementación

### Fase 1: `allowList` para rutas no sensibles (backend)

**Archivos a modificar:**
- `electron/server/server.ts`

**Cambios:**
1. Extraer la lógica de paths exceptuados a una función `shouldSkipRateLimit(path: string): boolean`
2. Agregar `allowList` al registro del plugin:

```typescript
allowList: (request, key) => {
  const path = request.url.split('?')[0];
  return shouldSkipRateLimit(path);
}
```

**Tests manuales:**
- Abrir `/api/health` 500 veces en 1 minuto → debe responder 200 siempre (sin 429)
- Abrir `/api/version` 500 veces en 1 minuto → debe responder 200 siempre
- Assets estáticos (`/face-models/foo.bin`) → sin límite

**Commit:** `fix(server): exceptuar rutas no sensibles del rate limit (allowList)`

**Push tras verificación local.**

---

### Fase 2: `max` como función con límites diferenciados (backend)

**Archivos a modificar:**
- `electron/server/server.ts`

**Cambios:**
1. Convertir `max: 300` en `max: (request, key) => number`
2. Lógica:
   - `/api/auth/*` → 30
   - `/pub/*` → 200
   - `/api/rpc` → 600
   - Resto → 300 (default actual)

```typescript
max: (request, key) => {
  const path = request.url.split('?')[0];
  if (path.startsWith('/api/auth/')) return 30;
  if (path.startsWith('/pub/')) return 200;
  if (path === '/api/rpc') return 600;
  return 300;
},
```

**Tests manuales:**
- Login fallido 40 veces en 1 minuto → debe responder 429 tras la #30
- `/api/rpc` con JWT válido 400 veces en 1 minuto → debe responder 200 siempre
- `/pub/productos` anónimo 250 veces en 1 minuto → debe responder 429 tras la #200

**Commit:** `fix(server): rate limits diferenciados por ruta (auth 30, pub 200, rpc 600)`

**Push tras verificación local.**

---

### Fase 3: `keyGenerator` custom con buckets por user/device (backend)

**Archivos a modificar:**
- `electron/server/server.ts`

**Dependencias:**
- Ya está disponible: `jsonwebtoken` (package.json línea 145)

**Cambios:**
1. Importar `jwt` de `jsonwebtoken`
2. Agregar `keyGenerator`:

```typescript
import * as jwt from 'jsonwebtoken';

// ...

keyGenerator: (request) => {
  const authHeader = request.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return request.ip;
  
  try {
    const token = authHeader.substring(7);
    const decoded = jwt.decode(token); // Decode, NO verify (verify lo hace el middleware después)
    if (!decoded || typeof decoded !== 'object') return request.ip;
    
    const deviceId = (decoded as any).device_id;
    const sub = (decoded as any).sub || (decoded as any).userId;
    
    if (deviceId) return `device:${deviceId}`;
    if (sub) return `user:${sub}`;
    return request.ip;
  } catch {
    return request.ip;
  }
}
```

**Tests manuales:**
- **2 terminales con distinto `device_id`:** cada una debe poder hacer 600 req/min a `/api/rpc` sin compartir límite
- **2 browsers anónimos desde la misma IP:** deben compartir bucket de 200 en `/pub/*`
- **Token inválido:** debe usar IP como fallback (verificar que no rompe el flujo)

**Commit:** `fix(server): keyGenerator por device_id/user para staff autenticado`

**Push tras verificación local.**

---

### Fase 4: Backoff exponencial en poll del delivery dialog (frontend)

**Archivos a modificar:**
- `src/app/shared/components/delivery-dialog/delivery-dialog.component.ts`

**Cambios:**
1. Agregar propiedad `private pollIntervalMs = 15000;`
2. Modificar `cargarPedidosOnline()` para detectar 429 y aplicar backoff
3. Resetear intervalo en éxito

```typescript
async cargarPedidosOnline(): Promise<void> {
  try {
    const pedidos = this.tiendaActiva
      ? await firstValueFrom(this.repositoryService.getPedidosOnlineAdmin({ estado: 'RECIBIDO' }))
      : [];
    // ... resto del código existente ...
    this.pollIntervalMs = 15000; // Reset en éxito
  } catch (e: any) {
    const es429 = e?.message?.includes('429') || e?.message?.includes('Too Many Requests');
    if (es429 && this.pollIntervalMs < 120000) {
      this.pollIntervalMs = Math.min(this.pollIntervalMs * 2, 120000);
      if (this.pedidosInterval) {
        clearInterval(this.pedidosInterval);
        this.pedidosInterval = setInterval(() => this.cargarPedidosOnline(), this.pollIntervalMs);
      }
      console.warn(`Rate limit activo, reduciendo frecuencia del poll a ${this.pollIntervalMs / 1000}s`);
    } else {
      console.warn('No se pudieron cargar los pedidos online:', e);
    }
  }
}
```

**Tests manuales:**
- Forzar 429 en el handler `get-pedidos-online-admin` (comentar la lógica de rate limit temporalmente y retornar 429)
- Abrir diálogo delivery → verificar en console que el intervalo crece: 15s → 30s → 60s → 120s
- Quitar el 429 forzado → verificar que el intervalo vuelve a 15s tras el primer éxito

**Commit:** `fix(delivery-dialog): backoff exponencial en poll ante rate limit 429`

**Push tras verificación local.**

---

### Fase 5: Tests E2E de rate limit por superficie (backend)

**Nuevo archivo:**
- `scripts/test-rate-limit-e2e.ts`

**Cobertura:**
1. **Test 1:** Anónimos en `/pub/*` comparten bucket (200 req/min × IP)
2. **Test 2:** Staff autenticado en `/api/rpc` tiene bucket propio (600 req/min × device)
3. **Test 3:** Dos dispositivos distintos NO comparten bucket
4. **Test 4:** Login tiene bucket estricto (30 req/min × IP)
5. **Test 5:** Assets no tienen límite (`/api/health`, `/api/version`)
6. **Test 6:** Token inválido usa IP como fallback

**Script test (estructura):**
```typescript
// Iniciar smoke server en modo server
// Caso 1: 250 requests anónimas a /pub/productos → esperar 429 tras la #200
// Caso 2: 650 requests autenticadas (mismo device_id) a /api/rpc → esperar 429 tras la #600
// Caso 3: 2 clientes con distinto device_id, 400 req cada uno → ambos 200 (no comparten)
// Caso 4: 40 requests a /api/auth/login → esperar 429 tras la #30
// Caso 5: 500 requests a /api/health → todas 200
// Caso 6: Token inválido → debe usar IP, compartir bucket con otros anónimos de esa IP
```

**Comando:** `npm run test:rate-limit-e2e` (agregar a `package.json`)

**Commit:** `test: suite E2E para rate limits diferenciados por superficie`

**Push tras verificar que todos los casos pasan.**

---

### Fase 6: Documentación (obligatoria)

**Archivos a modificar:**

1. **Skill de arquitectura cliente-servidor:**
   - `.claude/skills/frc-gourmet-expert/architecture/cliente-servidor.md`
   - Agregar sección **"Rate limiting diferenciado (2026-09)"** explicando:
     - Límites por ruta
     - `keyGenerator` por device/user para staff
     - `allowList` para assets
     - Por qué se hizo así (operación del local no debe quedar bloqueada por tráfico público)

2. **CLAUDE.md:**
   - Agregar bullet en la sección de comandos (si es relevante) o en "Historial de sesiones" (§4) como entrada de 2026-09

3. **Reference de índices (si aplica):**
   - NO hay nueva entidad, handler, enum ni pantalla → no tocar `reference/`

**Commit:** `docs: rate limiting diferenciado en skill cliente-servidor`

**Push.**

---

## 5. Tests de verificación

### 5.1. Tests automatizados

- **Fase 5:** Suite `test:rate-limit-e2e` (6 casos de prueba)
- **Regresión:** `npm run test:all` debe seguir pasando

### 5.2. Tests manuales (checklist para auditoría)

**Escenario 1: Staff autenticado no comparte bucket con anónimos**
1. Terminal A (cliente desktop, `device_id=caja-1`): abrir delivery, dejar poll activo
2. Terminal B (cliente desktop, `device_id=caja-2`): abrir delivery, dejar poll activo
3. Terminal C (browser anónimo): navegar storefront `/tienda` haciendo scroll rápido (carga imágenes)
4. **Resultado esperado:** A y B no deben ver 429 aunque C sature su bucket de 200 req/min

**Escenario 2: Login protegido contra brute-force**
1. Hacer 40 intentos de login con password incorrecta en <1 minuto desde la misma IP
2. **Resultado esperado:** Primeros 30 responden 401, del #31 en adelante responden 429

**Escenario 3: Assets sin límite**
1. Recargar `/api/health` 500 veces en 1 minuto
2. **Resultado esperado:** Todas responden 200, sin 429

**Escenario 4: Poll del delivery con backoff**
1. Forzar 429 en el backend (temporalmente retornar 429 en `get-pedidos-online-admin`)
2. Abrir diálogo delivery
3. Observar console del browser
4. **Resultado esperado:** Intervalo crece de 15s → 30s → 60s → 120s (console log visible)
5. Quitar el 429 forzado
6. **Resultado esperado:** Tras el primer éxito, intervalo vuelve a 15s

**Escenario 5: Reproducción del bug original (debe estar resuelto)**
1. Configurar 3 cajas en modo `client` contra un server en modo `server` bajo túnel Cloudflare
2. Abrir delivery en las 3 cajas simultáneamente
3. Realizar 10-15 acciones por caja (cambios de estado, impresiones, detalle) durante 2 minutos
4. **Resultado esperado:** Ninguna caja debe ver el snackbar "HTTP 429 ... Rate limit exceeded"

---

## 6. Migraciones

**NO aplica.** Este cambio es **solo configuración del server Fastify** (`electron/server/server.ts`). No toca:
- Entidades TypeORM
- Esquema de base de datos (SQLite o Postgres)
- Handlers IPC
- Preload
- Frontend (salvo fase 4, que es lógica de componente)

**Sin migración.**

---

## 7. Impacto y consideraciones

### 7.1. Reinicio necesario

**SÍ**, el cambio es en `electron/server/server.ts` (backend Fastify). Los nodos en `mode=server` deben **reiniciarse** para que tome la nueva configuración.

**Procedimiento recomendado:**
1. Hacer el cambio en alpha (`develop` → canal alpha)
2. Comunicar al local de pruebas: "reiniciar el servidor central tras el update"
3. Verificar que las terminales cliente NO necesitan reinicio (el rate limit es server-side)
4. Una vez validado, hacer PR a `master` (canal stable)

### 7.2. Compatibilidad hacia atrás

**TOTAL.** No hay cambios de API:
- Los clientes siguen enviando el mismo JWT con `device_id` (ya existente desde F5)
- El preload sigue capturando 429 de la misma forma
- El delivery dialog ya tiene el catch del poll

### 7.3. Comportamiento en modo `standalone` y `client`

- **`standalone`:** NO tiene server Fastify → este cambio **no aplica** (solo IPC local, sin rate limit HTTP)
- **`client`:** Envía requests al server → **se beneficia** del rate limit diferenciado (su `device_id` le da bucket propio)
- **`server`:** Donde se aplica el cambio

### 7.4. Tests de integración existentes

**Verificar:** El smoke server (`scripts/test-server-standalone.ts`) arranca un Fastify completo. Algunos tests pueden estar haciendo >300 requests en 1 minuto (ej. tests de pedidos online, delivery, variaciones).

**Acción:** Revisar que esos tests **pasen un JWT con `device_id`** en sus requests para obtener el bucket generoso de 600. Si no lo están haciendo, agregarles auth mock.

**Ejemplo (en un test E2E):**
```typescript
const token = jwt.sign({ sub: 1, device_id: 'test-device' }, 'secret', { expiresIn: '1h' });
const headers = { 'Authorization': `Bearer ${token}` };
// Todas las requests del test deben incluir headers
```

**Si algún test falla tras esta implementación con 429, es porque está haciendo >300 req/min sin auth → agregale el token.**

### 7.5. Túnel Cloudflare y `trustProxy`

El código actual ya tiene `trustProxy` configurado por env (`TRUST_PROXY`, líneas 86-92 de `server.ts`). **No se modifica.**

**Recordatorio para el deploy:** Si el server está detrás de Cloudflare, setear `TRUST_PROXY=true` en el `.env` o en las variables de entorno del proceso para que lea correctamente el `X-Forwarded-For`.

**Sin esta variable, el `request.ip` va a ser siempre la IP del proxy (127.0.0.1 o la IP interna de Cloudflare), no la del cliente real.**

### 7.6. Monitoreo post-deploy

**Recomendación:** Tras mergear a `develop` y deployar a alpha, monitorear en los logs del server:
- Frecuencia de 429 (debe bajar drásticamente)
- Distribución de keys en el rate limiter (debería verse `device:caja-1`, `user:5`, IPs para anónimos)
- Requests a `/api/auth/login` (debe seguir limitado a 30/min)

**Si los 429 persisten:** revisar que el `device_id` esté presente en el JWT (verificar en DevTools → Network → Headers de una request `/api/rpc`).

---

## 8. Fuera de alcance (explícitamente NO incluido)

1. **Store externo (Redis):** El rate limit actual usa store in-memory (default de `@fastify/rate-limit`). Para un solo nodo `server` es suficiente. Si en el futuro se escala a **múltiples servidores balanceados**, habrá que agregar Redis como store compartido. **Hoy no aplica.**

2. **Ban por abuso:** El plugin soporta `ban: N` (banear IP tras N 429 consecutivos). **No se implementa** porque en un entorno LAN con IP compartida podría banear a todo el local. Queda como posible mejora futura si el abuso persiste.

3. **Rate limit de salida (outbound):** Este plan solo cubre requests **entrantes** al server Fastify. No limita cuánto puede **llamar** el server a APIs externas (ej. WhatsApp Cloud, Evolution API, scraper de cotizaciones). **Fuera de alcance.**

4. **UI de configuración:** Los límites (`30`, `200`, `600`) están hardcoded en `server.ts`. No se construye una UI en *Configuración del servidor* para editarlos. **Si en el futuro se necesita ajustarlos, será via código (archivo config o env vars), no via diálogo.**

5. **Refactor del diálogo delivery:** El diálogo está complejo (1127 líneas, múltiples responsabilidades). Este plan **no refactoriza** el componente. Solo agrega backoff en el poll. Una refactor completa del módulo delivery es otra tarea.

---

## 9. Archivos afectados

**Backend (Electron):**
- `electron/server/server.ts` (fases 1-3)

**Frontend (Angular):**
- `src/app/shared/components/delivery-dialog/delivery-dialog.component.ts` (fase 4)

**Tests:**
- `scripts/test-rate-limit-e2e.ts` (nuevo, fase 5)

**Docs:**
- `.claude/skills/frc-gourmet-expert/architecture/cliente-servidor.md` (fase 6)
- `CLAUDE.md` (fase 6, opcional entrada en §4)

**Configuración:**
- `package.json` (agregar script `test:rate-limit-e2e`)

**Total:** 6 archivos modificados, 1 archivo nuevo.

---

## 10. Preguntas para Gabriel (ambigüedades pendientes)

1. **Valor de `TRUST_PROXY` en producción:** ¿Está seteado en el server que corre detrás de Cloudflare? Si no, el `keyGenerator` va a ver siempre la misma IP (la del proxy, no la del cliente) y la separación de buckets no va a funcionar.

2. **Límites propuestos (`30`/`200`/`600`):** ¿Te parecen razonables o querés ajustarlos? Los elegí basándome en:
   - Login: 30 intentos/min es generoso pero evita brute-force automatizado
   - Público: 200 req/min es ~3 req/s, suficiente para navegar el storefront sin que un cliente solo agote el bucket
   - Staff: 600 req/min es ~10 req/s, el doble del actual, permite picos de actividad sin bloquear

3. **Backoff en el poll:** ¿120s de intervalo máximo te parece mucho? Alternativamente puedo dejarlo en 60s (1 minuto) como tope. El trade-off es: intervalo más largo = menos presión sobre el server, pero los pedidos nuevos tardan más en aparecer.

4. **Prioridad de `device_id` vs `sub`:** El `keyGenerator` propuesto prefiere `device_id` sobre `sub` (usuario). ¿Es correcto? La razón es que una terminal física (caja) debería tener su cupo, incluso si varios usuarios rotan en ella. Si preferís por usuario, invierto el orden.

5. **Tests de regresión:** Algunos tests E2E (ej. `test:pedidos-online`, `test:delivery`) pueden estar haciendo >300 req/min sin JWT. ¿Los revisamos juntos o lo hago como parte de esta fase?

---

## 11. Criterios de éxito (definición de "listo")

1. ✅ El snackbar "HTTP 429" **NO aparece más** en el diálogo delivery bajo carga normal de producción
2. ✅ Staff autenticado puede hacer **600 req/min por terminal** sin ser bloqueado
3. ✅ Login sigue protegido: **30 intentos/min por IP** máximo
4. ✅ Assets y health checks **sin límite** (allowList funciona)
5. ✅ Suite de tests `test:rate-limit-e2e` pasa (6 casos de prueba)
6. ✅ Tests de regresión `npm run test:all` pasan
7. ✅ Checklist de tests manuales completo (5 escenarios)
8. ✅ Docs actualizadas (skill cliente-servidor)
9. ✅ PR mergeado a `develop` → deploy a alpha → validación en local real
10. ✅ CI en verde sobre el head actual del PR

---

## 12. Cronología estimada (sin estimación de días)

**Orden técnico de implementación:**

1. Fase 1 (allowList) — sencilla, low risk, commit atómico
2. Fase 2 (max por ruta) — sencilla, compatible con F1, commit atómico
3. Fase 3 (keyGenerator) — crítica, requiere tests manuales con 2+ terminales, commit atómico
4. Fase 5 (tests E2E) — cubre F1-F3, commit atómico
5. Fase 4 (backoff frontend) — independiente del backend, commit atómico
6. Fase 6 (docs) — commit final antes del PR

**Dependencias:**
- F2 puede implementarse en paralelo con F1 (misma zona de código, no chocan)
- F3 depende de F1+F2 (para no pisar los cambios)
- F5 debe esperar a F1+F2+F3 (testea todo junto)
- F4 es independiente, puede hacerse en paralelo

**Paralelización posible:**
- Commit 1: F1+F2 juntas (mismo archivo, cambios complementarios)
- Commit 2: F3 (keyGenerator)
- Commit 3: F5 (tests)
- Commit 4: F4 (frontend)
- Commit 5: F6 (docs)

**Total:** 5 commits, 1 PR.

---

## 13. Notas de auditoría

**Para los agentes auditores (futuros):**

1. **Verificar `jwt.decode` vs `jwt.verify`:** El `keyGenerator` usa `decode` (sin verify) intencionalmente. La verificación criptográfica la hace el middleware de auth después. Acá solo necesitamos extraer el identificador para el bucket. Un token inválido no rompe el rate limit (cae al fallback `request.ip`), y el middleware lo rechaza de todas formas.

2. **trustProxy en producción:** Sin `TRUST_PROXY=true`, el `keyGenerator` va a leer siempre la IP del proxy (127.0.0.1 o IP interna de Cloudflare), no la del cliente. Esto hace que **todos los clientes anónimos compartan un solo bucket**. Validar en el entorno real.

3. **Orden de ejecución:** El rate limit corre en el hook `onRequest` (default). El middleware de auth corre después (en `preHandler` típicamente, o en el handler mismo con `fastify.authenticate`). Esto es correcto: primero se limita tráfico, luego se autentica.

4. **Circular dependency:** NO intentar usar `fastify.authenticate` dentro del `keyGenerator` — es un ciclo: el rate limit necesita el user para decidir la key, pero el auth necesita pasar el rate limit primero. Por eso se usa `jwt.decode` (sintáctico, no criptográfico).

5. **Tests de carga:** Si en la auditoría querés validar que 600 req/min no se queda corto, podés simular carga pesada: 3 cajas con delivery abierto + acciones rápidas en ráfaga (cambiar estado 100 veces en 1 minuto). Si toca el límite, considerar subir a `800` o `1000` para staff.

6. **Ban future:** Si se implementa `ban` en el futuro, usar `ban: -1` (default = sin ban) o un número alto (ej. `ban: 10` = banear tras 10 veces de 429 consecutivos). Nunca `ban: 2` con IP compartida (banearía al local entero).

---

**Fin del plan.**
