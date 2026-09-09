# Auditoría: Poder Discriminante de Tests - PR #293 Comanda Delivery/Retiro

**Fecha:** 2026-09-08  
**Rama:** `cursor/comanda-delivery-retiro-bad4`  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/293  
**Auditor:** Cloud Agent  
**Eje de auditoría:** Eje 3 - Poder discriminante de tests

---

## 1. Resumen Ejecutivo

**VEREDICTO: COBERTURA INSUFICIENTE - P1**

El test en `scripts/test-ticket-venta-e2e.ts` cubre correctamente la **lógica del helper** `buildEncabezadoUbicacion`, pero **NO cubre el callsite crítico** en `printComandaInternal` donde se debe pasar el parámetro `deliveryModo`. 

**Regresión NO detectada:** Si en producción se olvida pasar el parámetro `deliveryModo` en la línea 631 de `documentos-tickets.handler.ts`, el test seguiría pasando porque llama directamente al helper con el parámetro explícito.

---

## 2. Cambios del Diff Auditados

### 2.1. Cambios en Producción

**Archivo:** `electron/handlers/documentos-tickets.handler.ts`

1. **Línea 174:** Se agregó parámetro opcional `deliveryModo?: DeliveryModo | null` a `buildEncabezadoUbicacion`
2. **Líneas 182-196:** Lógica nueva que renderiza "Delivery" o "Retirar en local" según el modo
3. **Línea 615:** Se extrae `deliveryModo` de `venta.delivery?.modo`
4. **Línea 631:** **CALLSITE CRÍTICO** - Se pasa `deliveryModo` a `buildEncabezadoUbicacion`

```typescript
// Línea 615
const deliveryModo = (venta as any).delivery?.modo ?? null;

// Línea 631 - CALLSITE CRÍTICO
lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText, deliveryModo));
```

### 2.2. Cambios en Tests

**Archivo:** `scripts/test-ticket-venta-e2e.ts`

**Líneas 410-453:** Bloque nuevo de tests para delivery/retiro

**Tests incluidos:**
- ✅ Caso 1: delivery DELIVERY → asserta "Delivery"
- ✅ Caso 2: delivery RETIRO → asserta "Retirar en local"  
- ✅ Caso 3: mostrador sin delivery → asserta "PARA LLEVAR" (no cambió)
- ✅ Caso 4: mesa + delivery DELIVERY → asserta ambos textos sin degradar mesa

---

## 3. Verificación de Criterios

### 3.1. ✅ Asserta el texto renderizado "Delivery" y "Retirar en local"

**Estado:** **PASS**

```typescript
// Línea 428
ok(txtDelivery.includes('Delivery'), 'delivery DELIVERY: el ticket dice "Delivery"', txtDelivery);

// Línea 438
ok(txtRetiro.includes('Retirar en local'), 'delivery RETIRO: el ticket dice "Retirar en local"', txtRetiro);
```

El test verifica correctamente la presencia de ambos textos en el output renderizado.

---

### 3.2. ❌ Falla si se quita el modo del helper

**Estado:** **FAIL** - **PROBLEMA CRÍTICO**

**Problema identificado:**

El test llama **directamente** a `buildEncabezadoUbicacion` pasando el `deliveryModo` explícitamente:

```typescript
// Línea 426 del test
const linesDelivery = buildEncabezadoUbicacion(null, null, ticketText, delDelivery.modo);
                                                                        ^^^^^^^^^^^^^^^^
                                                                        Pasa el modo explícitamente
```

Si el código de producción **olvida pasar el parámetro** en `printComandaInternal` (línea 631), el test **NO lo detectaría**:

```typescript
// Regresión NO detectada:
// Si alguien cambia la línea 631 de esto:
lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText, deliveryModo));

// A esto (olvida el parámetro):
lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText));
                                                                              ^
                                                                              Sin deliveryModo
```

**El test seguiría pasando** porque:
1. El test llama directamente al helper, NO a `printComandaInternal`
2. El test pasa el `deliveryModo` explícitamente
3. NO hay test que verifique el flujo completo desde `printComandaInternal`

**Tipo de test:** Unit test del helper (granular), NO integration test del flujo completo.

**Gap de cobertura:** El callsite crítico (línea 631 de `printComandaInternal`) NO está cubierto.

---

### 3.3. ✅ No es tautológico

**Estado:** **PASS**

El test compara contra **strings literales hardcodeados**, NO contra el resultado de la misma función:

```typescript
// ✅ Correcto: compara contra literal
ok(txtDelivery.includes('Delivery'), ...);

// ❌ Sería tautológico (NO es el caso):
// const expectedText = deliveryModo === 'DELIVERY' ? 'Delivery' : 'Retirar en local';
// ok(txtDelivery.includes(expectedText), ...);
```

Los strings `'Delivery'`, `'Retirar en local'`, `'PARA LLEVAR'` son valores literales independientes de la implementación.

---

### 3.4. ✅ Cubre mesa+delivery sin degradar mesa

**Estado:** **PASS**

```typescript
// Líneas 449-452
const linesMesaDelivery = buildEncabezadoUbicacion(5, null, ticketText, delDelivery.modo);
const txtMesaDelivery = render(linesMesaDelivery, WIDTH);
ok(txtMesaDelivery.includes('Delivery'), 'mesa+delivery: incluye "Delivery"', txtMesaDelivery);
ok(txtMesaDelivery.includes('MESA') && txtMesaDelivery.includes('5'), 'mesa+delivery: incluye "MESA 5"', txtMesaDelivery);
ok(!txtMesaDelivery.includes('PARA LLEVAR'), 'mesa+delivery: NO dice "PARA LLEVAR"', txtMesaDelivery);
```

El test verifica correctamente que:
- Con mesa + delivery, aparecen AMBOS textos
- El texto "MESA 5" NO se degrada ni desaparece
- "PARA LLEVAR" NO aparece cuando hay delivery

---

### 3.5. ✅ El ticket del cliente no queda cubierto (y no debe cambiar)

**Estado:** **PASS** - Comportamiento correcto según el plan

**Verificación:**

1. **Alcance del cambio:** Según `docs/planes/PLAN-COMANDA-DELIVERY-RETIRO.md`, el cambio es **SOLO para comandas de cocina** (`printComandaInternal`), NO para tickets de cliente.

2. **Tickets de cliente:** La función `buildVentaTicketLines` (línea 919 del handler) llama a `buildEncabezadoUbicacion` **SIN el parámetro `deliveryModo`**:

```typescript
// Línea 919 de buildVentaTicketLines (tickets de cliente)
lines.push(...buildEncabezadoUbicacion(mesaNro, comandaRef, ticketText));
                                                                         ^
                                                                         Sin deliveryModo
```

Esto es **correcto** porque:
- El ticket del cliente NO debe mostrar "Delivery" o "Retirar en local" según el plan
- Solo las comandas de cocina necesitan esa diferenciación
- El parámetro es **opcional** (`deliveryModo?`) por compatibilidad hacia atrás

3. **Cobertura de tests:** El test NO cubre `buildVentaTicketLines` para delivery, lo cual es correcto porque ese flujo NO debe cambiar.

---

## 4. Análisis de Poder Discriminante

### 4.1. ¿El test detectaría la regresión?

**NO - Poder discriminante INSUFICIENTE**

**Escenario de regresión:**

Un desarrollador refactoriza `printComandaInternal` y olvida pasar el `deliveryModo`:

```typescript
// ANTES (correcto):
const deliveryModo = (venta as any).delivery?.modo ?? null;
lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText, deliveryModo));

// DESPUÉS (regresión):
lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText));
// Olvidó pasar deliveryModo, o lo comentó durante debugging
```

**Resultado:** El test **NO falla** porque:
1. El test llama directamente a `buildEncabezadoUbicacion`, NO a `printComandaInternal`
2. El test construye sus propios fixtures y pasa el modo explícitamente
3. NO hay test de integración que verifique el flujo completo desde la venta hasta el ticket

**Síntoma en producción:** Las comandas de cocina para delivery/retiro volverían a decir "PARA LLEVAR" en lugar de "Delivery"/"Retirar en local".

---

### 4.2. Arquitectura del Test

**Nivel actual:** Unit test (helper aislado)

```
Test → buildEncabezadoUbicacion()
       (pasa deliveryModo explícitamente)
```

**Nivel requerido:** Integration test (flujo completo)

```
Test → Venta con delivery 
     → printComandaInternal()
          → buildEncabezadoUbicacion(... deliveryModo)
               → Assert en el output final
```

**Diferencia crítica:** El test actual valida que el helper **funciona correctamente cuando se le pasa el parámetro**, pero NO valida que el **callsite de producción realmente lo pase**.

---

## 5. Recomendaciones de Remediación

### 5.1. Test de Integración Requerido (Prioridad P1)

Agregar un test que verifique el flujo completo desde `printComandaInternal`:

```typescript
// Test propuesto (agregar después de la línea 453):
{
  console.log('\n[integracion printComandaInternal con delivery]');
  
  // Crear venta completa con delivery DELIVERY
  const vDelivery = await ds.getRepository(Venta).save(
    ds.getRepository(Venta).create({ estado: 'ABIERTA' } as any)
  );
  const delInt: any = await ds.getRepository(Delivery).save(
    ds.getRepository(Delivery).create({
      estado: 'ABIERTO', modo: 'DELIVERY', telefono: '0981333333', fechaAbierto: new Date(),
    } as any)
  );
  await ds.getRepository(Venta).update(vDelivery.id, { delivery: { id: delInt.id } } as any);
  
  const pProd = await ds.getRepository(Producto).save(
    ds.getRepository(Producto).create({ 
      nombre: 'PRODUCTO DELIVERY TEST', tipo: 'RETAIL', activo: true, requiereComanda: true 
    } as any)
  );
  
  await ds.getRepository(VentaItem).save(ds.getRepository(VentaItem).create({
    venta: { id: vDelivery.id }, producto: { id: pProd.id },
    cantidad: 1, precioVentaUnitario: 10000, precioCostoUnitario: 0, estado: 'ACTIVO',
  } as any));
  
  // Llamar a printComandaInternal (NO al helper directo)
  const resultComanda = await printComandaInternal(ds, vDelivery.id);
  
  // Este test NO puede verificar el output directo sin impresora configurada,
  // pero sí puede verificar que el flujo pasa sin errores y que el spec 
  // construido (si se expone) contiene el texto esperado.
  // 
  // ALTERNATIVA: Verificar mediante un mock de la impresora o exportando
  // el spec construido antes de imprimir.
  
  ok(resultComanda.ok || resultComanda.errors.some(e => e.message.includes('impresora')),
     'printComandaInternal procesa delivery sin errores de lógica');
     
  // NOTA: Este test quedaría incompleto sin acceso al spec construido.
  // Se requiere refactorizar printComandaInternal para exponer el spec
  // antes de imprimir, similar a como buildVentaTicketLines devuelve el contenido.
}
```

**Limitación identificada:** `printComandaInternal` NO expone el contenido construido (solo imprime), a diferencia de `buildVentaTicketLines` que devuelve las líneas. 

**Opción de refactorización (fuera de alcance):**
- Extraer `buildComandaTicketLines` (similar a `buildVentaTicketLines`)
- Que `printComandaInternal` llame al builder y luego imprima
- Testear el builder con fixtures completos

---

### 5.2. Tests Complementarios (Prioridad P2)

1. **Test con mesa + comanda + delivery:**
   ```typescript
   const linesMesaComandaDelivery = buildEncabezadoUbicacion(5, '#3', ticketText, 'DELIVERY');
   // Verificar que aparecen los tres textos
   ```

2. **Test con delivery NULL vs undefined:**
   ```typescript
   const linesNull = buildEncabezadoUbicacion(null, null, ticketText, null);
   const linesUndef = buildEncabezadoUbicacion(null, null, ticketText, undefined);
   // Ambos deben comportarse igual (PARA LLEVAR)
   ```

---

### 5.3. Documentación del Test (Prioridad P2)

Agregar comentario al inicio del bloque de tests (línea 410):

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Test delivery/retiro en encabezado de comanda
//
// SCOPE: Valida el HELPER buildEncabezadoUbicacion() aislado.
// NO cubre el callsite en printComandaInternal — ese callsite debe pasar
// deliveryModo en la línea 631 del handler, pero este test no lo verifica.
//
// REGRESIÓN NO DETECTADA: Si printComandaInternal olvida pasar deliveryModo,
// este test seguirá pasando porque llama directamente al helper.
//
// Ver AUDIT-DIFF-COMANDA-DELIVERY-TESTS.md para análisis completo.
// ═══════════════════════════════════════════════════════════════════════════
```

---

## 6. Gaps de Cobertura Identificados

| # | Gap | Impacto | Prioridad | Estado |
|---|-----|---------|-----------|---------|
| 1 | Callsite en `printComandaInternal` (línea 631) NO está cubierto | **ALTO** - Regresión silenciosa si se olvida pasar el parámetro | **P1** | ❌ Descubierto |
| 2 | NO hay test de integración extremo a extremo (venta → comanda → texto) | MEDIO - Test actual es demasiado granular | **P1** | ❌ Descubierto |
| 3 | `printComandaInternal` NO expone el spec construido para testing | MEDIO - Limita testing sin hardware | **P2** | ❌ Arquitectura |
| 4 | Caso mesa + comanda + delivery juntos | BAJO - Caso de borde poco común | **P2** | ⚠️ Parcialmente cubierto |

---

## 7. Cobertura Existente (Lo Que SÍ Funciona)

✅ **Aspectos correctamente cubiertos:**

1. La lógica interna de `buildEncabezadoUbicacion` está bien testeada
2. Los textos renderizados son los correctos ("Delivery", "Retirar en local")
3. No es tautológico (compara contra literales independientes)
4. Mesa + delivery no degrada la visualización de mesa
5. Mostrador sin delivery sigue funcionando (no hay regresión en caso base)
6. Correcto que tickets de cliente NO estén cubiertos (no deben cambiar)

---

## 8. Análisis de Riesgo

### 8.1. Riesgo Actual (con este test)

**Probabilidad de regresión:** MEDIA-ALTA
- Un refactor de `printComandaInternal` podría eliminar el parámetro
- Un merge conflict podría resolverse mal y perder el parámetro
- Un developer nuevo podría no entender el parámetro opcional

**Detección:** El test NO detectaría la regresión

**Síntoma:** Comandas vuelven a decir "PARA LLEVAR" en todos los casos

**Impacto en producción:** MEDIO
- Cocina no diferencia delivery de retiro
- Puede causar errores de empaque/preparación
- NO afecta cobro ni datos (solo visualización en comanda)

---

### 8.2. Riesgo con Test de Integración (recomendado)

**Probabilidad de regresión:** BAJA
- El test fallaría inmediatamente si se olvida pasar el parámetro
- Cualquier cambio en el flujo completo sería detectado

**Detección:** ✅ Inmediata en CI

---

## 9. Conclusiones

### 9.1. Veredicto Final

**COBERTURA INSUFICIENTE - Prioridad P1**

El test cubre correctamente la **lógica del helper** pero falla en cubrir el **callsite crítico de producción**. Es un unit test bien escrito pero insuficiente para prevenir regresiones en el flujo completo.

---

### 9.2. ¿Atraparía la Regresión?

**NO** - El test NO detectaría si se olvida pasar `deliveryModo` en `printComandaInternal`.

**Razón:** El test llama directamente al helper con el parámetro explícito, sin verificar que el código de producción realmente lo pase.

---

### 9.3. Tests Existentes vs Requeridos

| Aspecto | Estado Actual | Requerido |
|---------|---------------|-----------|
| Unit test del helper | ✅ Implementado | ✅ OK |
| Callsite coverage | ❌ No cubierto | ⚠️ **CRÍTICO** |
| Integration test E2E | ❌ No existe | ⚠️ **RECOMENDADO** |
| Textos correctos | ✅ Verificado | ✅ OK |
| No tautológico | ✅ Correcto | ✅ OK |
| Mesa no degradada | ✅ Verificado | ✅ OK |

---

### 9.4. Acción Requerida

**ANTES de mergear:**
1. ✅ Revisar manualmente que línea 631 de `printComandaInternal` pasa `deliveryModo`
2. ⚠️ Considerar agregar test de integración (ver sección 5.1)
3. ⚠️ Documentar limitación del test actual (ver sección 5.3)

**DESPUÉS de mergear:**
1. Refactorizar `printComandaInternal` para exponer el spec construido
2. Implementar test de integración completo
3. Migrar otros tests similares al mismo patrón

---

### 9.5. Clasificación Final

**Resultado:** COBERTURA INSUFICIENTE  
**Prioridad:** P1 (Alta)  
**Bloqueante para merge:** NO (el cambio es correcto, solo falta cobertura completa)  
**Recomendación:** Mergear con revisión manual del callsite + agregar test de integración en follow-up

---

## 10. Referencias

- **PR:** https://github.com/GabFrank/frc-gourmet/pull/293
- **Rama:** `cursor/comanda-delivery-retiro-bad4`
- **Plan original:** `docs/planes/PLAN-COMANDA-DELIVERY-RETIRO.md`
- **Test auditado:** `scripts/test-ticket-venta-e2e.ts` (líneas 410-453)
- **Código de producción:** `electron/handlers/documentos-tickets.handler.ts`
  - Helper: líneas 170-216 (`buildEncabezadoUbicacion`)
  - Callsite: líneas 615, 631 (`printComandaInternal`)

---

**Fin de la auditoría.**
