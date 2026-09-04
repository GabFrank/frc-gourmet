# Auditoría A — Plan Rate Limit 429 (alcance y convenciones)

**Auditor:** Cloud Agent (Sonnet)  
**Fecha:** 2026-09-04  
**Plan auditado:** `docs/planes/PLAN-RATE-LIMIT-429.md`  
**Rama:** `cursor/fix-rate-limit-429-delivery-0aac`  
**Eje:** Alcance y convenciones (NO implementación)

---

## 1. ¿El plan toca de más o de menos? ¿6 fases vs 5 commits coherentes?

### Análisis del alcance

El plan propone **6 fases** (allowList, max función, keyGenerator, backoff frontend, tests E2E, docs). La propuesta de **5 commits** (§12) agrupa F1+F2 en uno. Esto es **coherente y razonable**:

- **F1 (allowList) y F2 (max función)** tocan **el mismo bloque de código** (líneas 112-115 de `server.ts`). Agruparlas en un solo commit evita churn innecesario y el diff es legible.
- **F3 (keyGenerator)** es crítica y debe ser atómica — toca JWT decode, puede romper auth si se hace mal. ✅ Correcto que esté sola.
- **F5 (tests)** cubre F1+F2+F3 juntas → debe venir **después** de las tres. ✅ Secuencia correcta.
- **F4 (backoff frontend)** es independiente del backend, puede ir en paralelo o después. ✅ Correcto que esté aparte.
- **F6 (docs)** es el commit final antes del PR. ✅ Estándar del repo.

**Alcance de cada fase:**

| Fase | Scope | Justificación |
|------|-------|---------------|
| F1+F2 | `allowList` + `max` función | Mismo archivo, mismo bloque, complementarias |
| F3 | `keyGenerator` | Cambio crítico de auth, requiere pruebas aisladas |
| F5 | Tests E2E | Verifica F1+F2+F3 como un todo |
| F4 | Backoff frontend | Independiente del backend, mejora UX |
| F6 | Docs | Cierre obligatorio del ciclo |

### ¿Toca de más?

**NO.** Cada fase ataca un aspecto del problema:
- F1+F2: reduce consumo del bucket + diferencia protección
- F3: separa buckets staff/anónimo → solución de raíz
- F4: mitigación UX ante saturación residual
- F5: validación automatizada
- F6: registro obligatorio (skill + arquitectura)

No hay trabajo cosmético ni refactors ajenos al bug. **Alcance ceñido al problema.**

### ¿Toca de menos?

**Hay UN hueco potencial:** El plan menciona "verificar que tests E2E existentes pasen JWT con `device_id`" (§7.4), pero **NO lo incluye como fase obligatoria**. Si hay tests que hacen >300 req/min sin JWT, van a empezar a fallar tras F2 y **no se van a detectar hasta que reviente el CI**.

**Recomendación:** Agregar a F5 (o antes de F5) una **verificación explícita de los tests existentes** que hablan con el smoke server. Si alguno falla por 429, arreglar el test (agregar JWT mock) **dentro de la misma fase de tests**. Alternativamente, correr `npm run test:all` **antes de F5** y documentar qué tests se tocaron.

Sin esto, el plan está **casi completo** pero con riesgo de romper CI en silencio.

---

## 2. ¿allowList de static/SPA es seguro? (path traversal, no exceptuar /api/rpc por error)

### Análisis de seguridad de `allowList`

El código propuesto (§2, Opción B) es:

```typescript
allowList: (request, key) => {
  const path = request.url.split('?')[0];
  const staticPaths = ['/api/version', '/api/health', '/api/client-config'];
  if (staticPaths.includes(path)) return true;
  if (path.startsWith('/face-models/')) return true;
  if (path.startsWith('/pub/producto-image/')) return true;
  if (/\.(js|css|html|ico|png|jpg|jpeg|gif|svg|woff2?|ttf|eot)$/i.test(path)) return true;
  return false;
}
```

### Path traversal

**EVALUACIÓN: SEGURO** contra path traversal. Razones:

1. **Los assets estáticos (`/face-models`, `/pub/producto-image`) YA están servidos por `@fastify/static`** (líneas 160-189 de `server.ts` actual). Fastify Static **bloquea path traversal** internamente (normaliza paths, rechaza `..`, etc.). El `allowList` solo los exceptúa del rate limit, no implementa el serving.

2. **La regex de extensiones** (`/\.(js|css|...)$/i`) matchea contra **`request.url`**, que Fastify ya parseó y normalizó. Un intento de traversal como `/../../etc/passwd` **no pasa la regex** (no termina en extensión de asset).

3. **Los paths explícitos** (`/api/version`, `/api/health`, `/api/client-config`) son **rutas registradas** que solo devuelven JSON fijo. No hay filesystem access.

**NO hay vector de path traversal.** ✅

### ¿Exceptúa `/api/rpc` por error?

**EVALUACIÓN: NO.** La lógica es explícitamente **whitelist positiva**: solo retorna `true` para las rutas enumeradas. `/api/rpc` **NO está en la lista** → devuelve `false` → **sigue limitado**. ✅ Correcto.

### Riesgo residual: regex demasiado amplia

La regex `\.(js|css|html|...)$/i` exceptúa **cualquier archivo con esas extensiones**, sin importar la ruta. Ejemplos:

- `/api/rpc/foo.js` → **excepted** (no es asset, pero la regex matchea)
- `/algo/malicioso.html` → **excepted**

**¿Es un problema?** En este caso **NO**, porque:

1. El servidor **NO tiene** una ruta `/api/rpc/foo.js`. El RPC es un POST a `/api/rpc` con body JSON.
2. Los únicos `.js`/`.css`/`.html` que existen son los del bundle Angular (servidos por el `@fastify/static` de líneas 226-256).
3. Un atacante no puede crear archivos arbitrarios en el bundle (el bundle es read-only, viene del `asar`).

**Pero sería más seguro** reescribir el allowList para que los assets **solo apliquen si vienen de rutas conocidas**:

```typescript
allowList: (request, key) => {
  const path = request.url.split('?')[0];
  
  // Rutas fijas sin rate limit
  const staticPaths = ['/api/version', '/api/health', '/api/client-config'];
  if (staticPaths.includes(path)) return true;
  
  // Assets de directorios públicos específicos
  if (path.startsWith('/face-models/')) return true;
  if (path.startsWith('/pub/producto-image/')) return true;
  
  // Assets del bundle SPA (servidos en /, /admin/, /tienda/)
  if (path.startsWith('/assets/')) return true;
  if (path.startsWith('/admin/assets/')) return true;
  if (path.startsWith('/tienda/assets/')) return true;
  
  // Bundles JS/CSS del SPA (root, admin, storefront)
  if (/^\/(admin\/|tienda\/)?(main|polyfills|runtime|styles|scripts)\.[a-z0-9]+\.(js|css)$/i.test(path)) return true;
  if (path === '/index.html' || path === '/admin/index.html' || path === '/tienda/index.html') return true;
  if (path === '/favicon.ico') return true;
  
  return false;
}
```

**Recomendación:** El allowList propuesto es **funcionalmente seguro** pero **podría ser más defensivo**. Si se quiere máxima paranoia, usar la versión reescrita de arriba (paths específicos en vez de regex global). Pero **NO es un blocker** — el plan puede proceder con la versión original.

---

## 3. ¿Docs/tests en fases propias?

**EVALUACIÓN: SÍ, y es correcto.**

- **F5 (tests):** fase propia, corre **después** de F1+F2+F3. ✅ Estándar del repo (ver skill `workflows/ciclo-implementacion.md` paso 10).
- **F6 (docs):** fase propia, **último commit antes del PR**. ✅ Mandatorio (skill regla #24).

El plan sigue las convenciones del repo. **No hay problema.**

---

## 4. Reinicio server anotado; sin migración OK?

### Reinicio server

**EVALUACIÓN: SÍ, está anotado.** El plan dice explícitamente (§7.1):

> **SÍ**, el cambio es en `electron/server/server.ts` (backend Fastify). Los nodos en `mode=server` deben **reiniciarse** para que tome la nueva configuración.

También da el procedimiento recomendado (alpha → comunicar → validar → master). ✅ Correcto.

Además, el skill (regla #14) exige avisar si el cambio requiere reinicio. El plan lo cumple. ✅

### Sin migración

**EVALUACIÓN: SÍ, OK.** El plan justifica explícitamente (§6):

> **NO aplica.** Este cambio es **solo configuración del server Fastify** (`electron/server/server.ts`). No toca:
> - Entidades TypeORM
> - Esquema de base de datos (SQLite o Postgres)
> - Handlers IPC
> - Preload
> - Frontend (salvo fase 4, que es lógica de componente)

Esto es **correcto**. El rate limit de Fastify es **runtime config**, no estado persistido. No hay columnas nuevas, no hay datos legacy que migrar. ✅ Justificación sólida.

---

## 5. Ambigüedades §10 — ¿están bien planteadas o el plan debería decidir defaults?

El plan lista **5 preguntas para Gabriel** (§10). Analizo cada una:

### 5.1. `TRUST_PROXY` en producción

> ¿Está seteado en el server que corre detrás de Cloudflare? Si no, el `keyGenerator` va a ver siempre la misma IP (la del proxy, no la del cliente) y la separación de buckets no va a funcionar.

**EVALUACIÓN: Bien planteada.** Esta NO es una decisión del plan — es un **estado del entorno actual** que el plan necesita verificar. Si `TRUST_PROXY` no está seteado, **F3 no va a funcionar** (todos los clientes verían la misma key = IP del proxy). Es una **precondición del plan**, no una ambigüedad de diseño.

**Acción recomendada:** Verificar el estado de `TRUST_PROXY` **antes de implementar F3**. Si no está seteado, agregarlo al `.env` del server de producción. Esto puede ir en F3 (commit + docs de setup) o como paso previo.

### 5.2. Límites propuestos (30/200/600)

> ¿Te parecen razonables o querés ajustarlos?

**EVALUACIÓN: Bien planteada.** El plan **propone valores justificados** (login 30 = generoso pero anti-brute-force; público 200 = 3 req/s suficiente; staff 600 = doble del actual). Pero son **números mágicos** que dependen del tráfico real del local.

**Podría decidir:** El plan podría **hardcodear los valores propuestos** y decir "si no andan, se ajustan post-deploy". Esto es lo que haría cualquier otro cambio de config.

**Por qué no lo hace:** Porque el CEO (Gabriel) **ya tiene intuición del tráfico real** (el bug apareció en producción). Es más eficiente preguntarle que adivinar.

**Veredicto:** La pregunta es **razonable**. No es una ambigüedad del diseño — es una **calibración de parámetros** que se beneficia de input del usuario.

### 5.3. Backoff en el poll (120s tope)

> ¿120s de intervalo máximo te parece mucho? Alternativamente puedo dejarlo en 60s (1 minuto) como tope.

**EVALUACIÓN: Debería decidir.** El plan ya analizó el trade-off (§2, Opción E):

> intervalo más largo = menos presión sobre el server, pero los pedidos nuevos tardan más en aparecer.

Con esa info, el plan **puede y debe decidir un default razonable**. 120s es un tope conservador (solo se alcanza tras 3 rate limits consecutivos: 15s → 30s → 60s → 120s). El riesgo de que un pedido tarde 2 minutos en aparecer es **menor** que el riesgo de seguir saturando el bucket.

**Recomendación:** Decidir 120s (o 60s) en el plan. Si Gabriel quiere cambiarlo, lo puede pedir post-review. No es una decisión arquitectónica.

### 5.4. Prioridad `device_id` vs `sub`

> El `keyGenerator` propuesto prefiere `device_id` sobre `sub` (usuario). ¿Es correcto?

**EVALUACIÓN: Debería decidir.** El plan ya justifica la elección:

> La razón es que una terminal física (caja) debería tener su cupo, incluso si varios usuarios rotan en ella.

Esto es **correcto** para el modelo de negocio de un restaurante (las cajas son dispositivos físicos compartidos, no laptops personales). El plan **ya tiene la respuesta** — no necesita confirmarla.

**Recomendación:** Quitar la pregunta, afirmar la decisión. Si Gabriel no está de acuerdo, lo dirá en la review.

### 5.5. Tests de regresión

> Algunos tests E2E pueden estar haciendo >300 req/min sin JWT. ¿Los revisamos juntos o lo hago como parte de esta fase?

**EVALUACIÓN: Debería decidir.** Este es **trabajo del plan**, no una consulta al usuario. El plan ya identificó el problema (§7.4) — debe **incluir la verificación en F5** y arreglar los tests que fallen.

**Recomendación:** Cambiar la pregunta por una **tarea en F5**: "Verificar que `npm run test:all` pasa. Si algún test falla por 429, agregarle JWT mock en esta fase."

---

### Resumen §10

| Pregunta | Veredicto | Justificación |
|----------|-----------|---------------|
| 5.1. TRUST_PROXY | ✅ Bien planteada | Precondición del entorno, no decisión de diseño |
| 5.2. Límites (30/200/600) | ✅ Razonable | Calibración con input del usuario |
| 5.3. Backoff (120s) | ⚠️ Debería decidir | El trade-off ya está analizado, elegir un default |
| 5.4. device_id vs sub | ⚠️ Debería decidir | Ya está justificado, afirmarlo |
| 5.5. Tests regresión | ⚠️ Debería decidir | Es trabajo del plan, no consulta |

**3 de 5 preguntas deberían convertirse en decisiones.** Pero ninguna **bloquea** el plan — son más bien oportunidades de ser más asertivo.

---

## 6. Al menos UN riesgo concreto o justificación de que no hay

### Riesgos identificados por el plan

El plan menciona varios riesgos **mitigados** pero **no lista riesgos residuales** explícitamente. Busco en el documento:

- **§2 (Opción D):** "Riesgo mitigado: Con `keyGenerator` leyendo `device_id` del JWT, un atacante **no puede** spoofear el token..." ✅ Habla de un riesgo que **la solución cierra**.
- **§3:** "Riesgo mitigado: ... Staff autenticado tiene su propio bucket..." ✅ Justifica que la solución es completa.
- **§13, nota 5:** "Si en la auditoría querés validar que 600 req/min no se queda corto, podés simular carga pesada..." ⚠️ Sugiere que **600 podría no alcanzar** en picos extremos, pero no lo lista como riesgo formal.

### Riesgos NO mencionados

1. **Riesgo: `TRUST_PROXY` no seteado en producción**
   - **Impacto:** F3 no funciona — todos los clientes comparten bucket (IP del proxy).
   - **Probabilidad:** MEDIA (el plan pregunta en §10.1, señal de que no está confirmado).
   - **Mitigación:** Verificar antes de F3, documentar en docs de setup.

2. **Riesgo: Limits (600/200/30) insuficientes en horario pico**
   - **Impacto:** Staff sigue viendo 429 en picos de actividad (el problema original no se resuelve del todo).
   - **Probabilidad:** BAJA (el plan calcula ~60 req/min normal, 150-200 pico; 600 es margen 3-4x).
   - **Mitigación:** Monitoreo post-deploy (§7.6), ajustar si es necesario.

3. **Riesgo: Tests E2E existentes rompen por 429**
   - **Impacto:** CI en rojo post-merge, frena otros PRs.
   - **Probabilidad:** MEDIA (el plan lo menciona en §7.4 pero no lo incluye en F5).
   - **Mitigación:** Verificación explícita en F5 (ver punto 1 de esta auditoría).

4. **Riesgo: `jwt.decode` sin verify acepta tokens sintácticamente válidos pero expirados**
   - **Impacto:** Un cliente con token expirado sigue obteniendo bucket generoso (device_id) hasta que el middleware de auth lo rechace. Esto es **intencional** (el `keyGenerator` NO debe verificar), pero podría verse como "regalo de bucket a tokens expirados".
   - **Probabilidad:** NO ES UN PROBLEMA — el middleware de auth rechaza el request de todas formas. El rate limit solo limita **tráfico**, no autoriza **acceso**.
   - **Mitigación:** Ninguna necesaria. El plan ya lo justifica (§13, nota 1).

5. **Riesgo: Backoff frontend descoordinado entre tabs**
   - **Impacto:** Si el usuario abre 2 tabs del delivery dialog, cada uno tiene su propio `pollIntervalMs` — uno puede estar en 15s y el otro en 120s, confusión en la UI.
   - **Probabilidad:** BAJA (abrir 2 tabs del mismo dialog es raro en Electron).
   - **Mitigación:** Ninguna necesaria (edge case, no justifica complejidad de sincronizar).

### Veredicto

El plan identifica y mitiga los riesgos **principales** (spoofing de token, bucket compartido). Los riesgos **residuales** son:

- **R1 (TRUST_PROXY):** Debe verificarse antes de F3. ⚠️ MENCIONAR explícitamente.
- **R2 (Limits insuficientes):** Mitigado con monitoreo post-deploy. ✅ Cubierto.
- **R3 (Tests E2E):** Debe incluirse en F5. ⚠️ AGREGAR a la fase de tests.

**R1 y R3 deben aparecer en una sección "Riesgos residuales" del plan.**

---

## Veredicto final

### Alcance y estructura

✅ **El plan toca lo justo y necesario.** Cada fase tiene un propósito claro, las 6 fases son coherentes con 5 commits, no hay trabajo de más ni de menos (salvo el hueco de verificar tests E2E existentes).

### Seguridad del allowList

✅ **Seguro contra path traversal.** No exceptúa `/api/rpc` por error. La regex de extensiones es **amplia pero inofensiva** en este contexto (los únicos archivos con esas extensiones son assets del bundle, que son read-only).

### Docs y tests

✅ **En fases propias, como exige el repo.** F5 (tests) corre después de F1+F2+F3. F6 (docs) es el commit final. Estándar.

### Reinicio y migración

✅ **Reinicio anotado, sin migración justificado.** El plan lo explica claramente: es runtime config, no schema change.

### Ambigüedades (§10)

⚠️ **3 de 5 preguntas deberían ser decisiones del plan** (backoff 120s, prioridad device_id, tests de regresión). Las otras 2 (TRUST_PROXY, límites 30/200/600) son razonables como consultas al usuario.

### Riesgos

⚠️ **Faltan 2 riesgos residuales explícitos**: (R1) verificar TRUST_PROXY antes de F3, (R3) verificar tests E2E en F5. Ambos son **no-blocker** pero deben mencionarse.

---

## Recomendaciones (enmiendas menores)

1. **Agregar a F5 (o pre-F5):** "Verificar `npm run test:all`. Si algún test falla por 429, arreglar agregando JWT mock en esta fase."

2. **Agregar sección "Riesgos residuales" tras §10:**
   ```markdown
   ## 10.5. Riesgos residuales
   
   1. **TRUST_PROXY no seteado en producción:** Verificar antes de F3. Si no está, el `keyGenerator` verá siempre la IP del proxy y F3 no funcionará.
   2. **Tests E2E sin JWT:** Verificar en F5. Si rompen por 429, arreglar en la misma fase.
   3. **Limits 600/200/30 insuficientes en pico:** Mitigado con monitoreo post-deploy (§7.6). Ajustar si es necesario.
   ```

3. **Opcional (no crítico):** Convertir las preguntas §10.3, §10.4, §10.5 en decisiones afirmadas. Ejemplo:
   - §10.3: "El tope de backoff se fija en **120s** (trade-off razonable entre latencia de pedidos y presión del bucket)."
   - §10.4: "El `keyGenerator` prioriza `device_id` sobre `sub` (una terminal física debe tener su cupo)."
   - §10.5: "Los tests E2E se verifican en F5 (si fallan por 429, se arreglan en esa fase)."

---

## Veredicto

**✅ OK con enmiendas menores.**

El plan es **sólido, bien estructurado y seguro**. Las 6 fases son coherentes, el alcance es apropiado, la seguridad del `allowList` es correcta, y los docs/tests están en fases propias como exige el repo.

**Enmiendas recomendadas** (no bloqueantes):
- Agregar verificación explícita de tests E2E a F5
- Agregar sección "Riesgos residuales" con R1 (TRUST_PROXY) y R3 (tests E2E)
- Opcionalmente, convertir 3 preguntas de §10 en decisiones afirmadas

Con o sin las enmiendas, el plan puede proceder a implementación. Las enmiendas solo lo hacen **más completo y menos ambiguo**.
