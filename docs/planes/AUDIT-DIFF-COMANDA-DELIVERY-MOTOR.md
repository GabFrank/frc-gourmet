# Auditoría del DIFF: Motor de Delivery/Retiro en comandas de cocina

**Eje:** 1 — Motor (implementación core)  
**PR auditado:** [#293](https://github.com/GabFrank/frc-gourmet/pull/293) (draft, rama `cursor/comanda-delivery-retiro-bad4`)  
**Commits:** `50c46232` (plan), `25dea511` (feat+test), `6484547e` (docs)  
**Auditor:** Cloud Agent (audit-diff/comanda-delivery-motor)  
**Fecha:** 2026-09-08

---

## Veredicto: PASS con reservas P2

La implementación es **funcionalmente correcta**:
- ✅ Los textos son exactos (`'Delivery'` / `'Retirar en local'`)
- ✅ Mesa y comanda NO se reemplazan; las tres referencias coexisten en grande
- ✅ El ticket del cliente (`buildVentaTicketLines`) NO cambia
- ✅ Todos los caminos de papel delegan en `printComandaInternal`
- ✅ `modo null` o sin delivery no imprime líneas extra

**Reservas P2:**
1. **Redundancia de título**: Si delivery + mesa coexisten, se imprimirán ambos encabezados (`'Delivery'` + `'MESA'` + número), que puede ser verboso en impresoras de 58mm (ancho 32 cols). No es un blocker funcional, pero puede evaluarse en pruebas manuales si se desea consolidar (ej. `"Delivery - Mesa 5"`).
2. **Falta verificación con delivery sin mesa/comanda**: El test cubre delivery+mesa, pero no delivery como **único identificador** (sin mesa ni comanda). El código debería manejarlo correctamente (solo imprime `'Delivery'`/`'Retirar en local'`), pero no está cubierto por test explícito.

---

## 1. Textos exactos y no reemplazan mesa/comanda

### ✅ Textos literales verificados

**Código implementado** (`electron/handlers/documentos-tickets.handler.ts`, líneas 182-184):

```typescript
const textoDelivery = deliveryModo === DeliveryModo.DELIVERY
  ? 'Delivery'
  : 'Retirar en local';
```

**Verificación:**
- ✅ `DeliveryModo.DELIVERY` → texto exacto: `'Delivery'`
- ✅ `DeliveryModo.RETIRO` → texto exacto: `'Retirar en local'`
- ✅ Ambos en `size: 'big'` (línea 185)
- ✅ Alineación centrada (`align: 'C'`)
- ✅ Bold activado (`bold: true`)

**No hay texto hard-codeado alternativo** (ej. "DELIVERY", "Para retirar", etc.). Los strings coinciden **exactamente** con lo especificado.

### ✅ Mesa y comanda NO se reemplazan

**Código implementado** (líneas 186-194):

```typescript
if (hayMesa) {
  lines.push(ticketText('MESA', { align: 'C' }));
  lines.push(ticketText(String(mesaNumero), { align: 'C', bold: true, size: 'big' }));
}
if (hayComanda) {
  lines.push(ticketText('COMANDA', { align: 'C' }));
  lines.push(ticketText(String(comandaRef), { align: 'C', bold: true, size: 'big' }));
}
```

**Verificación:**
- ✅ Cuando `hayDelivery` es `true`, el bloque agrega delivery **Y LUEGO** agrega mesa (si existe) **Y LUEGO** comanda (si existe)
- ✅ Las **tres referencias coexisten** si las tres condiciones son verdaderas
- ✅ Mesa y comanda **también** quedan en `size: 'big'` (no se achican a `normal` o `small`)
- ✅ El `return lines;` (línea 195) sale temprano del caso delivery, pero **después** de agregar mesa y comanda

**Resultado:** NO hay reemplazo. Si una venta tiene delivery DELIVERY + mesa 5 + comanda #3, el ticket imprimirá:

```
        Delivery
         MESA
           5
       COMANDA
          #3
```

Todas en grande. ✅

### 🔶 Observación P2: Redundancia visual en tickets angostos

En impresoras de 58mm (32 columnas), 5 líneas de encabezado (delivery + label mesa + número + label comanda + ref) pueden ocupar espacio considerable antes de llegar a los ítems. En la práctica, **no afecta la funcionalidad** (cocina ve las tres referencias claramente), pero puede evaluarse en pruebas manuales si se prefiere un formato condensado (ej. `"Delivery - Mesa 5 - #3"` en una línea, si el ancho lo permite).

**No es un blocker:** el requisito era NO reemplazar, y eso se cumple. Prioridad **P2** (mejora futura opcional).

---

## 2. Ticket del cliente NO cambia

### ✅ `buildVentaTicketLines` NO recibe `deliveryModo`

**Código implementado** (línea 920 de `documentos-tickets.handler.ts`):

```typescript
lines.push(...buildEncabezadoUbicacion(mesaNro, comandaRef, ticketText));
```

**Verificación:**
- ✅ El call site de `buildVentaTicketLines` **NO pasa** el cuarto parámetro `deliveryModo`
- ✅ La firma del helper es `deliveryModo?: DeliveryModo | null` (parámetro **opcional**)
- ✅ Por lo tanto, `deliveryModo` queda `undefined` → el flujo cae en la rama "sin delivery" (línea 197 en adelante)
- ✅ El ticket del cliente imprime el mismo encabezado que antes: `"PARA LLEVAR"` / `"MESA"` / `"COMANDA"` según corresponda

**Confirmación adicional:**  
`buildVentaTicketLines` NO carga la relación `'delivery'` (línea 835, solo carga `['cliente', 'cliente.persona', 'mesa', 'comanda', 'formaPago', 'pago', 'delivery']` — sí la carga, pero **no la usa** en el encabezado porque no la pasa al helper).

**Resultado:** El ticket del cliente (`printVentaTicketInternal`) y la pre-cuenta (`printPrecuentaInternal`) **no cambian**. Solo la comanda de cocina (`printComandaInternal`) muestra el modo delivery. ✅

---

## 3. Todos los caminos de papel delegan en `printComandaInternal`

### ✅ Único punto de entrada para comandas de cocina

**Búsqueda exhaustiva:**

```bash
grep -r "printComanda" electron/handlers/ --include="*.ts"
```

**Resultado:**
- ✅ `documentos-tickets.handler.ts` línea 448: función `printComandaInternal`
- ✅ `documentos-tickets.handler.ts` línea 1251: handler IPC `'print-comanda'` → llama a `printComandaInternal` (línea 1258)
- ✅ `ventas.handler.ts` línea 4472: `autoPrintComandaIfNeeded` → llama al IPC `'print-comanda'` (línea 4510)
- ✅ `ventas.handler.ts` línea 4631: worker de retry `retryFailedPrintJobs` → llama al IPC `'print-comanda'` (línea 4688)

**Flujos identificados:**
1. **Reimpresión manual desde PdV** → botón "Imprimir comanda" → IPC `'print-comanda'` → `printComandaInternal`
2. **Auto-impresión al agregar ítems** → `autoPrintComandaIfNeeded` → IPC `'print-comanda'` → `printComandaInternal`
3. **Worker de retry** → `retryFailedPrintJobs` → IPC `'print-comanda'` → `printComandaInternal`

**Verificación:**
- ✅ NO existe función alternativa `printComandaPapel`, `printComandaDirecta`, etc.
- ✅ NO existe call directo a `buildEncabezadoUbicacion` desde otro handler que imprima comandas
- ✅ Todos los caminos convergen en `printComandaInternal`, que es el **único** que construye el `TicketSpec` con `buildEncabezadoUbicacion(..., deliveryModo)`

**Resultado:** El cambio en `printComandaInternal` cubre **todos** los casos de impresión de comandas. ✅

---

## 4. `modo null` o sin delivery no imprime líneas extra

### ✅ Guard clause correcta

**Código implementado** (líneas 178-180):

```typescript
const hayMesa = mesaNumero !== null && mesaNumero !== undefined && `${mesaNumero}` !== '';
const hayComanda = !!comandaRef;
const hayDelivery = !!deliveryModo;
```

**Lógica de branching** (líneas 182-196):

```typescript
if (hayDelivery) {
  // Caso delivery: imprime delivery + mesa + comanda (si existen)
  const textoDelivery = ...;
  lines.push(...);
  // ...
  return lines;
}

// Caso SIN delivery: lógica original sin cambios (línea 197+)
if (!hayMesa && !hayComanda) {
  lines.push(ticketText('PARA LLEVAR', { ... }));
  return lines;
}
// ... resto de lógica original
```

**Verificación:**
- ✅ `hayDelivery` es `!!deliveryModo` → si `deliveryModo` es `null`, `undefined`, o no se pasa, el valor es `false`
- ✅ El bloque `if (hayDelivery)` **NO se ejecuta** cuando `hayDelivery === false`
- ✅ El flujo cae en la rama "sin delivery" (línea 197), que es **idéntica** al código previo al cambio
- ✅ NO hay `else if` que pueda imprimir texto por defecto cuando `deliveryModo` es `null`

**Resultado:** Una venta sin delivery (ej. mostrador, o delivery con `modo = null`) imprime el mismo encabezado que antes. **No agrega líneas extra.** ✅

### ✅ Extracción de `deliveryModo` en el caller

**Código implementado** (`printComandaInternal`, línea 615):

```typescript
const deliveryModo = (venta as any).delivery?.modo ?? null;
```

**Verificación:**
- ✅ Usa optional chaining (`?.`) → si `delivery` es `null`/`undefined`, no arroja error
- ✅ Usa nullish coalescing (`?? null`) → si `modo` es `undefined`, se pasa `null` explícitamente
- ✅ `null` es uno de los valores aceptados por el tipo `deliveryModo?: DeliveryModo | null`

**Casos cubiertos:**
- `venta.delivery === null` → `deliveryModo = null` → no imprime líneas extra ✅
- `venta.delivery === undefined` → `deliveryModo = null` → no imprime líneas extra ✅
- `venta.delivery.modo === null` → `deliveryModo = null` → no imprime líneas extra ✅
- `venta.delivery.modo === undefined` → `deliveryModo = null` → no imprime líneas extra ✅
- `venta.delivery.modo === DeliveryModo.DELIVERY` → imprime `'Delivery'` ✅
- `venta.delivery.modo === DeliveryModo.RETIRO` → imprime `'Retirar en local'` ✅

**Resultado:** El handling de nulls es **robusto**. ✅

---

## 5. Riesgos y justificaciones

### 🔶 Riesgo P2: Orden de impresión en auto-print asíncrono

**Escenario:**  
Una venta tiene delivery DELIVERY + mesa 5. Cocina recibe el ticket. Mozo agrega más ítems → se dispara `autoPrintComandaIfNeeded` → se envía **solo la diff** (nuevos ítems) a la impresora del sector correspondiente.

**Riesgo:**  
El **segundo ticket** (auto-print de la diff) también llamará a `printComandaInternal` con la **misma venta** (venta no cambió, solo se agregaron ítems), por lo que **volverá a imprimir** el encabezado completo:

```
        Delivery
         MESA
           5
      -----------
      1x LOMO
```

**Justificación:**  
Este es el **comportamiento existente** del sistema. Cada impresión de comanda (reprint, auto-print, retry) **siempre** imprime el encabezado completo (mesa/comanda), para que el papel sea auto-contenido (cocina ve qué pedido es sin necesidad de juntar papeles previos).

**Por lo tanto:**  
- ✅ NO es un bug introducido por este cambio: la comanda **ya** re-imprimía mesa y comanda en cada auto-print
- ✅ Agregar delivery al encabezado **mantiene** esa lógica (auto-contenido)
- ✅ No requiere mitigación

**Prioridad P2:** Solo mencionar en la doc para que el usuario sepa que el delivery aparecerá en **todos** los tickets de esa venta (no solo el primero), igual que mesa/comanda.

### 🔶 Riesgo P2: Delivery cambia a RETIRO después de imprimir

**Escenario:**  
1. Venta creada con `delivery.modo = DELIVERY`
2. Cocina imprime comanda → dice `"Delivery"`
3. Cliente llama para retirar en local → usuario cambia `delivery.modo = RETIRO`
4. Mozo agrega ítem → auto-print envía diff a cocina → **ahora** dice `"Retirar en local"`

**Riesgo:**  
Cocina tiene **dos papeles contradictorios** para la misma venta (uno dice Delivery, el otro Retirar).

**Justificación:**  
- ✅ El cambio de modo delivery **después** de imprimir es un **caso de uso real** (clientes cambian de opinión)
- ✅ La comanda imprime el **estado actual** de `venta.delivery.modo` en cada impresión (no cachea el valor del primer ticket)
- ✅ Cocina debe leer el **último** papel recibido, que es el estado correcto

**Mitigación existente:**  
El sistema ya tiene **fecha y hora** en cada ticket (línea 627 de `printComandaInternal`). Cocina puede identificar el ticket más reciente por timestamp.

**Acción recomendada (fuera de alcance de este PR):**  
Si el cambio de modo delivery es frecuente, considerar:
1. **Notificación explícita** al mozo antes de auto-print si el modo cambió desde la última impresión
2. **Badge visual** en el segundo ticket (ej. `"*** MODO CAMBIADO A RETIRO ***"`)

**Prioridad P2:** No bloqueante, no degrada el comportamiento existente.

### ✅ Justificación: ¿Por qué `size: 'big'` para las tres?

**Decisión de diseño:**  
El código implementado pone delivery, mesa y comanda **todos** en `size: 'big'` cuando coexisten (líneas 185, 188, 193).

**Justificación:**  
1. **Consistencia visual:** Los tres identificadores tienen la misma importancia (todos distinguen el pedido)
2. **Lectura desde lejos:** Cocina debe ver el modo delivery de un vistazo (bolsa vs. bandeja), igual que la mesa
3. **Compatibilidad con lógica previa:** Mesa y comanda **ya** estaban en `size: 'big'` (código sin cambios en la rama sin delivery, línea 204)

**Contraejemplo rechazado:**  
Poner delivery en `big` y mesa/comanda en `normal` → **inconsistente**, y dificulta la lectura del número de mesa (que sigue siendo crítico para el mozo que retira el pedido).

**Resultado:** La decisión es **correcta** según los requisitos (no achicar mesa/comanda). ✅

---

## 6. Verificación de tipos y enums

### ✅ Enum `DeliveryModo` correctamente importado

**Import statement** (línea 42):

```typescript
import { Delivery, DeliveryModo } from '../../src/app/database/entities/ventas/delivery.entity';
```

**Definición del enum** (`src/app/database/entities/ventas/delivery.entity.ts`, líneas 29-32):

```typescript
export enum DeliveryModo {
  DELIVERY = 'DELIVERY',
  RETIRO = 'RETIRO',
}
```

**Verificación:**
- ✅ El enum tiene **exactamente dos valores**: `DELIVERY` y `RETIRO`
- ✅ No hay caso `AMBOS`, `PENDIENTE`, `null` en el enum (esos se manejan como `deliveryModo === null`)
- ✅ El código usa comparación estricta `===` (línea 183): `deliveryModo === DeliveryModo.DELIVERY`
- ✅ No hay typos en los strings (`'DELIVERY'` en el enum coincide con el valor almacenado en la DB)

**Resultado:** El tipo es **correcto** y el código es **type-safe**. ✅

---

## 7. Cobertura de tests

### ✅ Tests de regresión implementados

**Archivo:** `scripts/test-ticket-venta-e2e.ts`, líneas 410-453 (nuevo bloque).

**Escenarios cubiertos:**
1. ✅ Delivery DELIVERY → asserta que el ticket **contiene** `"Delivery"` y **NO contiene** `"PARA LLEVAR"`
2. ✅ Delivery RETIRO → asserta que el ticket **contiene** `"Retirar en local"` y **NO contiene** `"PARA LLEVAR"`
3. ✅ Mostrador sin delivery → asserta que el ticket **contiene** `"PARA LLEVAR"`
4. ✅ Mesa + delivery → asserta que el ticket **contiene ambos** textos (delivery NO reemplaza mesa)

**Método de verificación:**  
Los tests usan `renderTicketToPlainText(spec)` para convertir el `TicketSpec` a texto plano y assertar sobre el contenido **real** (no solo que `printed.length > 0`).

**Evaluación:**
- ✅ Los tests verifican el **texto exacto**, no solo que la función no arroje error
- ✅ Cubren los **tres casos de `deliveryModo`**: DELIVERY, RETIRO, null
- ✅ Cubren la **coexistencia** (delivery + mesa)

### 🔶 Falta test P2: Delivery como único identificador

**Escenario no cubierto explícitamente:**  
Venta con delivery DELIVERY, pero **sin mesa** y **sin comanda** → el ticket debería imprimir **solo** `"Delivery"` (sin `"PARA LLEVAR"`).

**Código que lo maneja:**  
Líneas 182-195 — el bloque `if (hayDelivery)` devuelve temprano con solo el texto delivery (líneas 185, sin agregar mesa ni comanda si no existen).

**Justificación de por qué falta:**  
El commit de tests (`25dea511`) se enfoca en los casos **más comunes** (delivery + mesa, mostrador sin delivery). Delivery sin mesa/comanda es **posible** (ej. delivery directo sin mesa asignada), pero menos frecuente en el flujo real del PdV.

**Acción recomendada:**  
Agregar test explícito:

```typescript
await testEncabezadoDelivery({
  mesaNumero: null,
  comandaRef: null,
  deliveryModo: DeliveryModo.DELIVERY,
  expected: ['Delivery'],  // Solo delivery, sin "PARA LLEVAR"
  notExpected: ['PARA LLEVAR', 'MESA', 'COMANDA'],
});
```

**Prioridad P2:** No es un bug (el código debería funcionar), pero el test explícito reduciría riesgo de regresión.

---

## 8. Dependencias y migraciones

### ✅ No requiere migración

**Verificación:**  
- ✅ El campo `Delivery.modo` **ya existe** en la entidad (línea 64 de `delivery.entity.ts`):
  ```typescript
  @Column({ type: 'varchar', nullable: true })
  modo: DeliveryModo | null;
  ```
- ✅ No se agregaron columnas nuevas
- ✅ No se cambió el tipo de `modo` (sigue siendo `varchar` nullable)

**Resultado:** El PR **no requiere** migración de base de datos. ✅

### ✅ No requiere cambios en el frontend

**Verificación:**  
- ✅ El cambio es **solo** en Electron (handler + helper)
- ✅ No se tocó ningún componente Angular (`src/app/pages/`, `src/app/shared/`)
- ✅ El delivery dialog (`delivery-dialog.component.ts`) ya permite setear `delivery.modo` (sin cambios)

**Resultado:** El frontend **no requiere** cambios. ✅

---

## 9. Convenciones del repo

### ✅ Strings uppercase

**Verificación de los strings literales:**

```typescript
const textoDelivery = deliveryModo === DeliveryModo.DELIVERY
  ? 'Delivery'      // <-- NO uppercase
  : 'Retirar en local';  // <-- NO uppercase
```

**Comparación con otros strings en el mismo archivo:**
- Línea 199: `'PARA LLEVAR'` — uppercase ✅
- Línea 205: `'MESA'` — uppercase ✅
- Línea 210: `'COMANDA'` — uppercase ✅

**Contradicción aparente:**  
El repo tiene la regla **"All strings must be saved UPPERCASE in the database"**, pero el código imprime `'Delivery'` (mixed case) y `'Retirar en local'` (lowercase inicial).

**Justificación:**  
1. **La regla aplica a la DB, no al ticket:** Los tickets **imprimen** strings legibles para humanos (ej. `'PARA LLEVAR'`, `'COMPROBANTE DE VENTA'`), que NO son los mismos valores que se guardan en la DB. El valor en la DB es `modo: 'DELIVERY'` (uppercase), pero el texto del ticket es `'Delivery'` (presentación).
2. **Consistencia con otros tickets del sistema:** Por ejemplo, `buildDeliveryTicketLines` (línea 1863) imprime `'Teléfono'`, `'Dirección'` (mixed case), y `buildVentaTicketLines` imprime `'COMPROBANTE DE VENTA'` (uppercase). El criterio es **legibilidad en papel**.
3. **El enum usa uppercase:** `DeliveryModo.DELIVERY = 'DELIVERY'` → la DB tiene `'DELIVERY'` y `'RETIRO'` (uppercase). El helper hace la conversión a texto legible.

**Evaluación:**  
- ✅ La DB guarda `modo: 'DELIVERY'` (uppercase) → regla cumplida
- ✅ El ticket imprime `'Delivery'` (mixed case) → decisión de UX, consistente con otros tickets
- ✅ No hay violación de convención

**Alternativa rechazada:**  
Imprimir `'DELIVERY'` / `'RETIRO'` en el ticket → técnicamente más "puro", pero menos legible (parece error/debug text en vez de indicación para cocina). La decisión de mixed case es **correcta**.

---

## 10. Conclusión

### ✅ Puntos fuertes

1. **Implementación mínima y correcta:** Un solo helper modificado, un solo caller actualizado, cero cambios en frontend
2. **Compatibilidad hacia atrás:** Parámetro opcional → el segundo call site (ticket de venta) no requiere cambios
3. **Robustez ante nulls:** Manejo explícito de `null`/`undefined` con optional chaining y nullish coalescing
4. **Tests de contenido:** No solo assertan que imprime, sino que **el texto es correcto** (usa `renderTicketToPlainText`)
5. **Cobertura completa de flujos:** Auto-print, retry, reprint manual — todos delegan en `printComandaInternal`

### 🔶 Reservas P2 (no bloqueantes)

1. **Verbosidad en tickets angostos:** 5 líneas de encabezado (delivery + mesa + comanda) puede ser mucho en 58mm. Evaluar en pruebas manuales si se prefiere formato condensado.
2. **Test de delivery sin mesa/comanda:** Caso edge (poco frecuente) no cubierto explícitamente, aunque el código debería manejarlo.

### ✅ Checklist final

- ✅ Textos exactos (`'Delivery'` / `'Retirar en local'`)
- ✅ Mesa y comanda NO reemplazadas (coexisten en grande)
- ✅ Ticket del cliente NO cambia (no se pasa `deliveryModo` a `buildVentaTicketLines`)
- ✅ Todos los caminos delegan en `printComandaInternal`
- ✅ `modo null` no imprime líneas extra (guard clause correcta)
- ✅ Enum correctamente importado y usado
- ✅ No requiere migración
- ✅ Strings en DB uppercase, strings en ticket legibles
- ✅ Tests verifican contenido real del ticket

---

## Veredicto final: **PASS con reservas P2**

La implementación cumple **todos** los requisitos funcionales. Las reservas son **mejoras opcionales** (verbosidad visual, test edge case) que no afectan la corrección del fix.

**Acción recomendada:**  
- ✅ Ejecutar `npm run test:ticket-venta` cuando el ambiente tenga dependencias instaladas
- ✅ Prueba manual de los 4 escenarios (delivery, retiro, mostrador, delivery+mesa)
- ✅ Evaluar en impresora de 58mm si el encabezado largo (5 líneas) es aceptable o se prefiere condensar
- ✅ Opcionalmente: agregar test de delivery sin mesa/comanda (P2)

Si las pruebas manuales confirman que el ticket es legible, el PR está **listo para merge**.
