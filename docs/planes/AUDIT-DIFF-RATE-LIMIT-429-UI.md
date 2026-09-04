# Auditoría DIFF #4 — UI (delivery-dialog.component.ts)

**Rama:** `cursor/fix-rate-limit-429-delivery-0aac` (PR #286)  
**Commit auditado:** `1b835680` (F4: backoff exponencial en poll ante rate limit 429)  
**Archivo:** `src/app/shared/components/delivery-dialog/delivery-dialog.component.ts`  
**Fecha auditoría:** 2026-09-04

---

## Resumen ejecutivo

**VEREDICTO: BLOQUEANTE**

El mecanismo de backoff exponencial presenta un **defecto crítico** que impide la recuperación del intervalo de polling al valor normal (15s) después de que el servidor se recupere del rate limit. El intervalo queda atascado en el último valor de backoff (hasta 120s), degradando permanentemente la experiencia hasta que se cierre y reabra el diálogo.

**Severidad:** Alta — El sistema no recupera su cadencia normal de polling después de un evento de rate limit, causando demoras prolongadas innecesarias en la actualización de pedidos web incluso cuando el servidor ya está respondiendo normalmente.

---

## Cambios introducidos (DIFF)

### Nuevas propiedades

```typescript
private pollIntervalMs = 15000;
private needsIntervalUpdate = false;
```

### Lógica modificada en `cargarPedidosOnline()`

**Try exitoso:**
```typescript
// Reset en éxito (F4)
this.pollIntervalMs = 15000;
if (this.needsIntervalUpdate) {
  this.needsIntervalUpdate = false;
  this.recreatePollInterval();
}
```

**Catch (429):**
```typescript
const es429 = (e as any)?.message?.includes('429') || (e as any)?.message?.includes('Too Many Requests');
if (es429) {
  const nuevoIntervalo = Math.min(this.pollIntervalMs * 2, 120000);
  if (nuevoIntervalo !== this.pollIntervalMs) {
    this.pollIntervalMs = nuevoIntervalo;
    this.needsIntervalUpdate = true;
    console.warn(`[delivery-dialog] Rate limit 429, backoff a ${this.pollIntervalMs / 1000}s`);
  }
}
```

**Finally:**
```typescript
if (this.needsIntervalUpdate) {
  this.needsIntervalUpdate = false;
  this.recreatePollInterval();
}
```

### Nuevo método

```typescript
private recreatePollInterval(): void {
  if (this.pedidosInterval) {
    clearInterval(this.pedidosInterval);
    this.pedidosInterval = null;
  }
  if (this.tiendaActiva) {
    this.pedidosInterval = setInterval(() => this.cargarPedidosOnline(), this.pollIntervalMs);
  }
}
```

---

## Análisis por eje

### ✅ 1. ngOnDestroy limpia intervals correctamente

**Estado:** OK

```typescript
ngOnDestroy(): void {
  if (this.timerInterval) clearInterval(this.timerInterval);
  if (this.pedidosInterval) clearInterval(this.pedidosInterval);
}
```

- Limpia ambos intervals (`timerInterval` para esperas, `pedidosInterval` para poll de pedidos web).
- Sin leaks de memoria.
- No afectado por los cambios del backoff.

---

### ✅ 2. Método recreatePollInterval evita timers huérfanos

**Estado:** OK

El método `recreatePollInterval()` es correcto:

1. Limpia el interval anterior con `clearInterval()` antes de crear uno nuevo.
2. Setea a `null` explícitamente para evitar referencias colgadas.
3. Respeta el flag `tiendaActiva` (aunque no debería cambiar en tiempo de ejecución, según comentarios del código).
4. Usa `this.pollIntervalMs` actual, reflejando el backoff vigente.

**No hay riesgo de múltiples intervals corriendo simultáneamente** en el sentido de timers duplicados, porque siempre limpia el anterior.

---

### ❌ 3. **DEFECTO CRÍTICO: Reset en éxito no recrea el interval**

**Estado:** BLOQUEANTE

#### Descripción del problema

El código intenta resetear el intervalo a 15s cuando una llamada tiene éxito después de un 429:

```typescript
// Reset en éxito (F4)
this.pollIntervalMs = 15000;
if (this.needsIntervalUpdate) {
  this.needsIntervalUpdate = false;
  this.recreatePollInterval();
}
```

**El problema:** `needsIntervalUpdate` ya fue reseteado a `false` por el `finally` del 429 anterior, por lo que el `if` nunca se ejecuta.

#### Flujo que demuestra el bug

```
T=0s:   ngOnInit → crea interval de 15s

T=15s:  Primera llamada → éxito
        - pollIntervalMs = 15000
        - needsIntervalUpdate = false
        - Interval: 15s ✓

T=30s:  Segunda llamada → 429
        - catch: pollIntervalMs = 30000, needsIntervalUpdate = true
        - finally: needsIntervalUpdate → false, recrea con 30s
        - Interval: 30s ✓

T=60s:  Tercera llamada → ÉXITO
        - try: pollIntervalMs = 15000
        - try: if (needsIntervalUpdate) → FALSE (ya está en false del finally anterior)
        - NO recrea el interval
        - Interval: SIGUE EN 30s ✗✗✗

T=90s:  Cuarta llamada → éxito
        - Interval: SIGUE EN 30s ✗✗✗
```

#### Impacto

- El intervalo de polling **queda atascado** en el último valor de backoff (puede ser 30s, 60s, o incluso 120s).
- Los pedidos web se actualizan con la cadencia degradada **permanentemente**, incluso después de que el servidor vuelva a responder normalmente.
- El único recovery es **cerrar y reabrir el diálogo completo**.
- Los cajeros experimentarán demoras innecesarias en ver nuevos pedidos (hasta 2 minutos vs los 15 segundos normales).

#### Escenario real

1. Pico de tráfico de 5 minutos causa 429s → backoff llega a 120s.
2. El tráfico baja, servidor responde normalmente.
3. El diálogo sigue pollando cada 120 segundos durante **horas**, hasta que se cierre.
4. Pedidos web esperan hasta 2 minutos en mostrarse en el panel del cajero.

---

### ✅ 4. 429 no spamea snackbar

**Estado:** OK

Ante un 429, el código solo emite:

```typescript
console.warn(`[delivery-dialog] Rate limit 429, backoff a ${this.pollIntervalMs / 1000}s`);
```

Y luego el catch general:

```typescript
console.warn('No se pudieron cargar los pedidos online:', e);
```

**No se muestra snackbar al usuario.** Esto es correcto: el poll es background y sus fallos no deben interrumpir al cajero. Los pedidos existentes siguen visibles y operables.

---

### ✅ 5. No rompe flujos ENVIAR/FINALIZAR ni otros estados

**Estado:** OK

Los cambios están completamente aislados en:
- La declaración de dos propiedades privadas (`pollIntervalMs`, `needsIntervalUpdate`).
- El método `cargarPedidosOnline()` (polling de pedidos web).
- Un nuevo método privado `recreatePollInterval()`.

**Ninguno de estos cambios afecta:**
- Selección de deliveries (`selectDelivery`, `selectedDelivery`).
- Cambios de estado (`cambiarEstado`, transiciones ABIERTO → PARA_ENTREGA → EN_CAMINO → ENTREGADO).
- Flujo ENVIAR (`enviar()`, selector de repartidor).
- Flujo FINALIZAR (`finalizar()`, `editarPago()`, detección de venta cobrada).
- Flujo CONVERTIR (retiro ↔ delivery).
- Acciones de pedidos web (aceptar/rechazar).

**El bug de reset no afecta la operación del delivery,** solo degrada la velocidad de actualización de la lista de pedidos web.

---

## Riesgos adicionales

### ⚠️ Riesgo menor: Posible spam de console.warn

Si el servidor responde consistentemente con 429 durante un periodo prolongado, cada fallo emitirá:

```typescript
console.warn(`[delivery-dialog] Rate limit 429, backoff a ${X}s`);
console.warn('No se pudieron cargar los pedidos online:', e);
```

Esto podría llenar la consola en entornos de desarrollo/debug, pero **no afecta al usuario final** (la consola no es visible en producción para cajeros).

**Mitigación existente:** El backoff exponencial reduce la frecuencia de intentos, por lo que el spam se auto-limita.

**Severidad:** Muy baja — Solo afecta debugging, no funcionalidad.

---

### ⚠️ Riesgo menor: Coincidencia de "429" en mensajes de error no-HTTP

La detección de 429 es por substring:

```typescript
const es429 = (e as any)?.message?.includes('429') || (e as any)?.message?.includes('Too Many Requests');
```

**Falso positivo hipotético:** Un error de negocio del backend que incluya "429" en el mensaje (ej: "El pedido #429 ya fue cancelado") dispararía el backoff exponencial.

**Probabilidad:** Muy baja — Los mensajes de negocio no suelen incluir códigos HTTP, y "Too Many Requests" es específico.

**Severidad:** Muy baja — En el peor caso, se activa backoff innecesariamente (no destructivo).

---

## Corrección recomendada

### Opción 1: Detectar cambio y recrear en éxito (más simple)

```typescript
// Reset en éxito (F4)
const habiaBefore = this.pollIntervalMs !== 15000;
this.pollIntervalMs = 15000;
if (habiaBefore) {
  this.recreatePollInterval();
}
```

### Opción 2: Setear flag explícitamente en éxito

```typescript
// Reset en éxito (F4)
if (this.pollIntervalMs !== 15000) {
  this.pollIntervalMs = 15000;
  this.needsIntervalUpdate = true;
}
// El finally se encarga de recrear
```

### Opción 3: Mover recreación al try (evitar finally)

```typescript
// Reset en éxito (F4)
const necesitaReset = this.pollIntervalMs !== 15000;
this.pollIntervalMs = 15000;
if (necesitaReset) {
  this.recreatePollInterval();
}
// Quitar el check del finally, dejar solo para 429
```

**Recomendación:** Opción 1 — Es la más explícita y no depende del flag `needsIntervalUpdate`, evitando confusión futura.

---

## Verificación sugerida

### Test manual

1. **Setup:** Configurar rate limit bajo en el servidor (ej: 5 req/min en `/pedidos-online`).
2. **Trigger 429:** Con el diálogo abierto, esperar que se dispare backoff (observar console.warn).
3. **Verificar backoff:** Confirmar que el intervalo crece (30s → 60s → 120s) mediante console.log del intervalo.
4. **Recuperación:** Aumentar el rate limit o esperar cooldown.
5. **Bug actual:** Siguiente éxito → el intervalo NO vuelve a 15s.
6. **Con fix:** Siguiente éxito → el intervalo vuelve a 15s.

### Test automatizado (E2E sugerido)

```typescript
// Pseudocódigo
it('debe resetear intervalo a 15s después de recuperarse de 429', async () => {
  // 1. Mock del repositoryService para simular 429
  spyOn(repositoryService, 'getPedidosOnlineAdmin').and.returnValue(throwError({ message: '429 Too Many Requests' }));
  
  // 2. Abrir diálogo (con tiendaActiva=true)
  // 3. Esperar que pollIntervalMs crezca a 30s
  // 4. Cambiar mock a éxito
  repositoryService.getPedidosOnlineAdmin.and.returnValue(of([]));
  
  // 5. Esperar siguiente llamada
  // 6. Verificar que pollIntervalMs === 15000 Y que el interval real es de 15s
});
```

---

## Conclusión

El mecanismo de backoff está **casi correcto** en su diseño:
- La limpieza de intervals es sólida.
- El método `recreatePollInterval()` evita leaks.
- La detección de 429 y el incremento exponencial funcionan.
- No interfiere con los flujos de negocio del delivery.

**Sin embargo, presenta un defecto crítico de recuperación** que degrada permanentemente el polling después de un evento de rate limit, causando demoras operativas significativas (hasta 2 minutos vs 15 segundos) para los cajeros que atienden pedidos web.

**Este bug es BLOQUEANTE para el merge del PR,** porque el objetivo de F4 era implementar un backoff que se adapte dinámicamente, y el código actual falla en la recuperación (half del ciclo).

---

**Auditor:** Claude (Cursor Cloud Agent)  
**Solicitante:** Usuario FRC Gourmet  
**Estado final:** BLOQUEANTE — Requiere corrección antes de merge.
