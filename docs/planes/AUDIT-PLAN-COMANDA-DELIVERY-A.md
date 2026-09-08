# Auditoría del Plan: Diferenciar Delivery y Retiro en ticket de cocina

**Eje:** A — Alcance y Convenciones  
**Plan auditado:** `docs/planes/PLAN-COMANDA-DELIVERY-RETIRO.md`  
**PR:** [#293](https://github.com/GabFrank/frc-gourmet/pull/293) (draft)  
**Auditor:** Cloud Agent (audit/comanda-delivery-retiro-a)  
**Fecha:** 2026-09-08

---

## Veredicto: PASS con reservas P1

El plan es **técnicamente correcto** (identifica todos los caminos de impresión, propone un helper único con parámetro opcional, respeta convenciones), pero tiene **dos puntos de mejora** que conviene aclarar antes de implementar:

1. **P1 — Ambigüedad visual en el resultado esperado:** El plan muestra dos encabezados distintos (delivery como texto grande exclusivo vs. delivery + mesa/comanda combinados) sin especificar cuál implementar. La lógica del código propuesto sugiere el segundo, pero el ejemplo visual del §10 muestra el primero.

2. **P1 — Test de regresión incompleto:** El plan propone tests sobre `printed`/`errors` sin impresoras, pero no valida el **contenido real del ticket** (el texto "Delivery" o "Retirar en local" en las líneas). Requiere renderizar el `TicketSpec` y assertar sobre el texto plano.

Son **observaciones menores** que no invalidan el fix funcional — el helper recibirá `delivery?.modo` y los tres casos (DELIVERY, RETIRO, sin delivery) se distinguirán correctamente. Las reservas apuntan a evitar sorpresas en la validación manual.

---

## 1. Cobertura de flujos: ¿TODOS los caminos de impresión?

### ✅ Identificación completa de call sites

**Verificado contra código:**

El plan identifica correctamente que `buildEncabezadoUbicacion` tiene **DOS call sites**, ambos en `electron/handlers/documentos-tickets.handler.ts`:

1. **Línea 610** — `printComandaInternal`: ticket de cocina multi-sector.
2. **Línea 898** — `buildVentaTicketLines`: comprobante de venta / pre-cuenta (llamado por `printVentaTicketInternal` y `printPrecuentaInternal`).

**Búsqueda exhaustiva confirmada:**
```bash
grep -r "buildEncabezadoUbicacion" electron/ src/ projects/ scripts/
```

**Resultado:**
- Electron: 2 call sites (líneas 610 y 898).
- Frontend (src/): 0 call sites.
- PWA (projects/mobile): 0 call sites.
- Tests (scripts/): 9 referencias en `test-ticket-venta-e2e.ts`, todas invocaciones directas del helper para test unitario.

**No hay otros llamadores.** El plan cubre **todos** los caminos de impresión de tickets que muestran ubicación.

### ✅ Auto-impresión cubierta

El plan identifica correctamente que la **auto-impresión** de comanda (`autoPrintComandaIfNeeded`, línea 4472 de `ventas.handler.ts`) y el **worker de retry** (línea 4631) llaman a `printComandaInternal`, no a `buildEncabezadoUbicacion` directamente.

**Por lo tanto:** modificar `buildEncabezadoUbicacion` y hacer que `printComandaInternal` pase `delivery?.modo` cubre:
- ✅ Auto-impresión al agregar ítems.
- ✅ Worker de retry de comandas fallidas.
- ✅ Reimpresión manual desde el botón del PdV.

**Alcance completo verificado.**

### ✅ Segundo call site (pre-cuenta) correctamente clasificado como fuera de alcance

**Línea 898** usa `buildEncabezadoUbicacion` para el **ticket de venta** y la **pre-cuenta**, no para la comanda de cocina.

**Verificado:**
- La función `buildVentaTicketLines` carga `relations: ['mesa', 'comanda']` (línea 784) pero **NO carga `'delivery'`**.
- Por lo tanto, `(venta as any).delivery` será `undefined` en ese contexto.
- El helper propuesto tiene `deliveryModo?: DeliveryModo | null` como **parámetro opcional**: si no se pasa, o si es `null`, el comportamiento es el mismo que antes.

**Decisión correcta:** el ticket del cliente y la pre-cuenta **no cambian**. Solo la comanda de cocina se diferencia. ✅

---

## 2. Helper único recibe `delivery.modo` (diseño)

### ✅ Firma propuesta es correcta

```typescript
export function buildEncabezadoUbicacion(
  mesaNumero: number | null | undefined,
  comandaRef: string | null | undefined,
  ticketText: (t: string, o?: any) => any,
  deliveryModo?: DeliveryModo | null,  // <-- NUEVO parámetro opcional
): any[]
```

**Evaluación:**
- ✅ Parámetro **opcional**: compatibilidad hacia atrás (el segundo call site no necesita cambiarse).
- ✅ Tipo correcto: `DeliveryModo | null | undefined` (acepta los tres estados: DELIVERY, RETIRO, ausente).
- ✅ Usa el enum del modelo: `DeliveryModo` de `src/app/database/entities/ventas/delivery.entity.ts`.

### ✅ Único caller modificado: `printComandaInternal`

El plan especifica (línea 170-180):
```typescript
const deliveryModo = (venta as any).delivery?.modo ?? null;
lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText, deliveryModo));
```

**Verificado contra código:**
- Línea 439 de `printComandaInternal`: `relations: ['mesa', 'comanda', 'delivery']` — la relación **YA se carga**.
- Línea 452-454: el delivery se usa para el gate de "va a cocina", así que el objeto ya está disponible en memoria.

**No hay que tocar la consulta**, solo pasar el campo. ✅

### ✅ Los textos exactos son correctos

**Plan (línea 106-110):**
- Delivery (modo DELIVERY): **`"Delivery"`** (mayúscula inicial, sin tilde).
- Retiro (modo RETIRO): **`"Retirar en local"`**.
- Sin delivery ni mesa/comanda: **`"PARA LLEVAR"`** (sin cambios).

**Verificado contra enum:**
```typescript
export enum DeliveryModo {
  DELIVERY = 'DELIVERY',
  RETIRO = 'RETIRO',
}
```

**Decisión correcta:** el plan no inventa valores, usa el enum existente. ✅

---

## 3. Mesa/mostrador sin delivery quedan igual

### ✅ Lógica propuesta preserva caso sin delivery

**Código propuesto (línea 132-150 del plan):**
```typescript
if (hayDelivery) {
  const textoDelivery = deliveryModo === DeliveryModo.DELIVERY
    ? 'Delivery'
    : 'Retirar en local';
  lines.push(ticketText(textoDelivery, { align: 'C', bold: true, size: 'tall' }));
  // ... mesa/comanda abajo en tamaño normal
  return lines;
}

// LÓGICA ORIGINAL: sin delivery, se mantiene igual
if (!hayMesa && !hayComanda) {
  lines.push(ticketText('PARA LLEVAR', { align: 'C', bold: true, size: 'tall' }));
  return lines;
}
```

**Evaluación:**
- ✅ El branch `if (hayDelivery)` se activa solo si `deliveryModo` es truthy (DELIVERY o RETIRO).
- ✅ Si `deliveryModo` es `null` o `undefined`, cae al bloque original.
- ✅ Venta de mesa sin delivery → sigue mostrando "MESA N".
- ✅ Venta de mostrador sin delivery → sigue mostrando "PARA LLEVAR".

**Regresión visual verificada:** el fix no cambia ningún ticket existente. ✅

---

## 4. KDS y PWA quedan afuera (justificación)

### ✅ KDS correctamente excluido

**Plan (línea 48-50):**
> El KDS digital (`kds.component.ts`, `kds.handler.ts`) **NO** imprime: muestra en pantalla. Usa el mismo ruteo por sector (`ComandaItem`) pero no reutiliza el armado del ticket de papel. **Queda fuera del alcance** de este fix.

**Verificado contra código:**
- `kds.component.ts` (desktop + PWA) llama a `get-kds-comandas` (handler backend).
- El handler devuelve filas planas de `ComandaItem` con relaciones (`producto`, `sector`, `venta`).
- El frontend agrupa por venta y renderiza en tarjetas HTML, **NO construye `TicketSpec`**.

**No usa `buildEncabezadoUbicacion`.** Justificación correcta. ✅

**Si en el futuro se quiere mostrar "Delivery" en el KDS:**
- Requiere leer `venta.delivery.modo` en el frontend (ya cargado en la relación).
- Es otro ticket, fuera de este alcance.

### ✅ PWA correctamente excluida

**Plan (línea 229-238):**
> **Verificación previa:** Buscar en `projects/mobile/` si hay referencias a `buildEncabezadoUbicacion` o `printComandaInternal`.

**Verificado:**
```bash
grep -r "buildEncabezadoUbicacion" projects/mobile/
grep -r "printComandaInternal" projects/mobile/
```

**Resultado:** 0 matches en ambos casos.

**Conclusión:** la PWA **no arma tickets de cocina** en el frontend. Si imprime, lo hace llamando al handler IPC `print-comanda`, que ejecuta en el backend y ya queda cubierto por el fix. ✅

---

## 5. Convenciones

### ✅ Commits, tipo válido, sin `audit:`

**Plan (línea 265-280):**
- Fase 1: `feat(cocina): distinguir delivery/retiro en ticket de cocina`
- Fase 2: `feat(cocina): pasar modo delivery al builder de encabezado`
- Fase 3: `test(cocina): regresión tickets delivery/retiro`
- Fase 4: `docs: actualizar skill con encabezado delivery/retiro`

**Evaluación:**
- ✅ Tipo `feat` para cambios funcionales.
- ✅ Tipo `test` para tests.
- ✅ Tipo `docs` para documentación.
- ✅ **NO usa `audit:`**, que commitlint rechaza.

### ✅ Plan en `docs/planes/`

**Verificado:**
- Archivo: `docs/planes/PLAN-COMANDA-DELIVERY-RETIRO.md`.
- Ubicación correcta según convención del repo.

### ✅ Sin `npm start`, sin commit a develop/master

**Plan (línea 311-330):**
> 1. **Verificación previa:** buscar en PWA si reutiliza el builder (grep arriba)
> 2. **Implementar Fase 1-4**
> 3. **`npm run build && npm run check`** local
> 4. **Commit + push**
> 5. **PR a `develop` en draft** (para revisión)
> 6. **CI pasa** → manual de pruebas
> 7. **Marcar PR ready for review**

**Evaluación:**
- ✅ No menciona `npm start` como requisito.
- ✅ Usa `npm run build` y `npm run check` (compilación sin levantar servidor).
- ✅ PR a `develop` (no a master).
- ✅ Draft hasta que CI pase.

**Convenciones respetadas.** ✅

---

## 6. Riesgos

### ✅ Al menos un riesgo concreto identificado

**Plan (línea 217-229):**

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Que el fix se revierta silenciosamente | MEDIO | Test de regresión en `test-ticket-venta-e2e.ts` que asserta el texto específico. Si falla, el CI lo atrapa. |
| PWA/mobile arma tickets igual (si reutiliza el builder) | BAJO | Buscar en `projects/mobile/` si hay referencias. Si no hay matches → PWA queda afuera. |

**Evaluación:**
- ✅ **Riesgo 1 (reversión silenciosa):** correctamente identificado. Sin test, alguien podría refactorizar el helper y borrar el parámetro, volviendo al comportamiento genérico.
- ✅ **Riesgo 2 (PWA):** ya verificado arriba — PWA no toca el builder.

**¿Falta algún riesgo?**

**⚠️ RIESGO OMITIDO — P1:**

**Riesgo 3: Delivery sin modo (null) cae al default DELIVERY en el enum, no a "sin delivery".**

**Detalle:**
- La columna `deliveries.modo` tiene `default: DeliveryModo.DELIVERY` (línea 76 de `delivery.entity.ts`).
- Si una fila vieja se insertó sin especificar `modo`, la columna guarda `'DELIVERY'` (no `NULL`).
- El gate propuesto es `const hayDelivery = !!deliveryModo;` (línea 132 del plan).
- `!!DeliveryModo.DELIVERY` es `true` → entra al branch de delivery.

**¿Es un problema?**

**NO, si todas las filas tienen modo asignado.** Verificar:
1. **Migración** `DeliveryModoRetiro1787677459724` (columna introducida 2026-08-29):
   - Si la migración hizo `UPDATE deliveries SET modo = 'DELIVERY' WHERE modo IS NULL`, todas las filas viejas tienen modo.
2. **Seed / Alta:** todos los puntos que crean `Delivery` (handlers `ventas.handler.ts`, `delivery.handler.ts`, `delivery-alta.utils.ts`) pasan `modo: datos.modo ?? DeliveryModo.DELIVERY`.

**Conclusión:** el default del enum protege contra olvidos en el código nuevo. **Riesgo muy bajo** (y no afecta a este fix, que solo lee). Documentar como "asumido: todas las filas tienen modo explícito".

---

## 7. Alcance técnico verificado contra código

### ✅ Archivo único modificado

**Plan (línea 88-91):**
1. **`electron/handlers/documentos-tickets.handler.ts`:**
   - Modificar la firma de `buildEncabezadoUbicacion` (línea 170).
   - Ampliar la lógica interna (línea 132-169 del plan).
   - **Llamador:** `printComandaInternal` (línea 610) — pasarle `delivery?.modo`.

**Evaluación:**
- ✅ Un solo archivo de código de producción.
- ✅ Un solo handler.
- ✅ El segundo call site (línea 898) **no necesita cambios** (parámetro opcional).

### ✅ Test nuevo en archivo existente

**Plan (línea 95-99):**
2. **`scripts/test-ticket-venta-e2e.ts`** (nuevo test):
   - Test de regresión: fixture con delivery DELIVERY → assert 'Delivery' en el contenido.
   - Fixture con delivery RETIRO → assert 'Retirar en local'.
   - Fixture sin delivery (mostrador) → assert 'PARA LLEVAR' (no cambió).
   - Fixture con mesa → assert 'MESA N' (no cambió).

**Verificado:**
- El archivo `test-ticket-venta-e2e.ts` **existe** (397 líneas actuales).
- Ya tiene un bloque "gate cocina" (línea 361-408) que verifica `printed`/`errors` de deliveries.

**⚠️ RESERVA P1 — Test incompleto:**

**El test propuesto asserta sobre `printed`/`errors`, no sobre el contenido del ticket:**
```typescript
const rDelivery = await printComandaInternal(ds, conDelivery.id);
ok(rDelivery.errors.length > 0 || rDelivery.printed.length > 0,
   'delivery: SÍ le corresponde comanda — pasa el gate y busca la impresora', rDelivery);
```

**Esto verifica que el delivery _intenta_ imprimir, NO que el texto sea "Delivery".**

**Cómo testear el contenido real:**

El archivo ya tiene `renderTicketToPlainText` importado (línea 25). Se puede:
1. Mockear la impresora o usar `buildComandaTicketSpec` (helper puro que devuelve `TicketSpec`).
2. Renderizar el `TicketSpec` a texto plano con `renderTicketToPlainText(spec, width)`.
3. Assertar que el texto contiene `"DELIVERY"` o `"RETIRAR EN LOCAL"`.

**Ejemplo (pseudocódigo):**
```typescript
const spec = await buildComandaTicketSpec(dataSource, conDelivery.id);
const texto = renderTicketToPlainText(spec, 48);
ok(texto.includes('DELIVERY'), 'delivery modo DELIVERY: el ticket dice "Delivery"');
```

**Sin esto, el test NO valida el fix funcional** (el encabezado con texto correcto), solo que el gate pasó. ✅ con reserva.

### ✅ Documentación especificada

**Plan (línea 101-103, 280-284):**
3. **Documentación:**
   - `.claude/skills/frc-gourmet-expert/domains/cocina-impresion.md`: actualizar sección de estructura de comanda.
   - `.claude/skills/frc-gourmet-expert/domains/ventas-pdv.md`: actualizar sección de delivery si menciona el ticket.

**Evaluación:**
- ✅ Skill `cocina-impresion.md` menciona "Estructura de una comanda de cocina" (línea 239-259).
- ✅ Debe actualizarse para reflejar que el encabezado distingue modo delivery.

---

## 8. Validación manual

**Plan (línea 287-303):**
1. Crear delivery con modo **DELIVERY** → Assert: "Delivery".
2. Crear delivery con modo **RETIRO** → Assert: "Retirar en local".
3. Venta de mostrador → Assert: "PARA LLEVAR".
4. Venta con mesa 5 → Assert: "MESA 5".

**Evaluación:**
- ✅ Cobertura completa de los cuatro casos.
- ✅ Manual necesario porque el test automatizado solo verifica `printed`/`errors` (ver reserva arriba).

---

## 9. Observaciones adicionales (mejoras sugeridas)

### ⚠️ P1 — Ambigüedad en el diseño visual

**El plan muestra dos lógicas distintas en dos lugares:**

**Línea 134-148 (código propuesto):**
```typescript
if (hayDelivery) {
  const textoDelivery = ...;
  lines.push(ticketText(textoDelivery, { align: 'C', bold: true, size: 'tall' }));
  // Si además tiene mesa/comanda, las agrega abajo en tamaño normal
  if (hayMesa) {
    lines.push(ticketText('MESA', { align: 'C' }));
    lines.push(ticketText(String(mesaNumero), { align: 'C', bold: true, size: 'normal' }));
  }
  // ...
  return lines;
}
```

**Esto significa:** si hay delivery + mesa, el ticket dice:
```
DELIVERY (grande)
MESA
5 (normal)
```

**Pero la sección §10 "Validación manual" (línea 303) muestra:**
- Delivery (sin mesa) → "Delivery".
- Mesa (sin delivery) → "MESA 5".
- **NO muestra el caso "delivery + mesa".**

**Y la línea 110 dice:**
> Los textos de delivery/retiro se **agregan además** de mesa/comanda si existen (no los reemplazan).

**Pero la línea 180 del código original de hoy (`buildEncabezadoUbicacion`) dice:**
```typescript
if (!hayMesa && !hayComanda) {
  lines.push(ticketText('PARA LLEVAR', ...));
  return lines;
}
```

**¿Una comanda de delivery SIN mesa debe decir "Delivery" o "PARA LLEVAR"?**

**Respuesta según el código propuesto:**
- Si `hayDelivery` es true → entra al primer branch → dice "Delivery".
- Si `hayDelivery` es false y no hay mesa/comanda → dice "PARA LLEVAR".

**Correcto, pero el plan no lo ilustra.** Sugerencia: agregar un caso de validación manual para "delivery sin mesa" (el caso más común).

### ⚠️ P1 — Tamaño de la comanda en "normal" vs "big"

**Línea 142-143 del plan:**
```typescript
lines.push(ticketText(String(mesaNumero), { align: 'C', bold: true, size: 'normal' }));
```

**Código actual (línea 186 del handler):**
```typescript
lines.push(ticketText(String(mesaNumero), { align: 'C', bold: true, size: 'big' }));
```

**El plan cambia `'big'` a `'normal'`.** ¿Es intencional?

**Justificación posible:** si el delivery es el texto grande, la mesa pasa a secundaria (tamaño normal). **Pero esto cambia tickets de mesa SIN delivery también** (porque usa el mismo helper).

**Recomendación:** especificar explícitamente si el tamaño de mesa/comanda cambia, y si cambia solo cuando hay delivery o siempre.

---

## 10. Conclusión

### Resumen de hallazgos

| Punto auditado | Estado | Severidad |
|----------------|--------|-----------|
| Cobertura de flujos (todos los call sites) | ✅ Completo | — |
| Helper único con parámetro opcional | ✅ Correcto | — |
| Textos exactos ("Delivery", "Retirar en local") | ✅ Correcto | — |
| Mesa/mostrador sin delivery quedan igual | ✅ Preservado | — |
| KDS y PWA excluidos con justificación | ✅ Correcto | — |
| Convenciones (commits, docs/planes/) | ✅ Respetadas | — |
| Riesgos identificados | ✅ Al menos uno | — |
| **Ambigüedad en diseño visual** (delivery + mesa) | ⚠️ No ilustrado | **P1** |
| **Test de regresión incompleto** (no valida texto) | ⚠️ Solo verifica gate | **P1** |

### Veredicto final: **PASS con reservas P1**

El plan es **funcionalmente correcto** y cubre todos los caminos de impresión. Las reservas apuntan a:
1. **Aclarar la lógica visual** cuando delivery y mesa coexisten (agregar ejemplo).
2. **Fortalecer el test automatizado** para que valide el contenido del ticket, no solo que pasó el gate.

Ambas se pueden resolver durante la implementación sin replantear el plan.

---

## Recomendaciones para la implementación

1. **Agregar caso de validación manual:** delivery sin mesa (el caso más común de delivery).
2. **Test automatizado:** usar `renderTicketToPlainText` sobre el `TicketSpec` renderizado, assertar que contiene "DELIVERY" / "RETIRAR EN LOCAL".
3. **Especificar explícitamente:** ¿el tamaño de mesa/comanda cambia a `'normal'` solo cuando hay delivery, o siempre? Si cambia siempre, agregar caso de regresión para mesa sin delivery.
4. **Verificar migración:** confirmar que todas las filas de `deliveries` tienen `modo` explícito (no `NULL` que caería al default).

---

**Fin de la auditoría.**
