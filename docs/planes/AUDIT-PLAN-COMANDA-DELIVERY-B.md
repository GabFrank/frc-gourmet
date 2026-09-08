# Auditoría del Plan: Eje B (Correctitud contra código real)

**Plan auditado:** `docs/planes/PLAN-COMANDA-DELIVERY-RETIRO.md`  
**Fecha auditoría:** 2026-09-08  
**Auditor:** Claude (Cloud Agent)  
**Rama:** `cursor/comanda-delivery-retiro-bad4`  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/293

---

## Veredicto

**ESTADO:** ❌ **FAIL** — Diseño incorrecto con **un riesgo P0** que invalida la solución propuesta.

**Prioridad global:** **P0** — El diseño propuesto cambia la jerarquía visual de información crítica de ubicación en el ticket de cocina, suprimiendo referencias esenciales (mesa/comanda) en favor de información secundaria (modo de entrega).

---

## Verificación punto por punto

### 1. ¿`buildEncabezadoUbicacion` realmente no recibe `delivery.modo` hoy?

✅ **CORRECTO** — El helper recibe exactamente 3 parámetros:

```typescript
// electron/handlers/documentos-tickets.handler.ts:170
export function buildEncabezadoUbicacion(
  mesaNumero: number | null | undefined,
  comandaRef: string | null | undefined,
  ticketText: (t: string, o?: any) => any,
): any[]
```

No hay rastro de `delivery` ni `deliveryModo`.

---

### 2. ¿`printComandaInternal` ya carga la relación `delivery`? ¿Pasa modo al helper o hay que cargarlo?

✅ **CARGA SÍ** — Línea 438:

```typescript
const venta = await dataSource.getRepository(Venta).findOne({
  where: { id: ventaId },
  relations: ['mesa', 'comanda', 'delivery'],  // <-- delivery está cargado
});
```

❌ **PASA NO** — Línea 610 del mismo archivo:

```typescript
lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText));
```

Solo pasa `mesa?.numero` y `refComanda`. El `delivery` se carga pero no se usa para el encabezado.

**Plan correcto:** identifica que hay que pasar el modo.

---

### 3. ¿Un delivery/retiro de WhatsApp tiene comanda asociada?

🔴 **PROBLEMA CRÍTICO IDENTIFICADO**

**SÍ**, una venta puede tener **AMBOS** delivery y comanda (o mesa) al mismo tiempo.

Evidencia del código real (`src/app/database/entities/ventas/venta.entity.ts`):

```typescript
export class Venta extends BaseModel {
  // ...
  @ManyToOne(() => Delivery, { nullable: true })
  @JoinColumn({ name: 'delivery_id' })
  delivery?: Delivery;          // <-- Opcional

  @ManyToOne('PdvMesa', { nullable: true })
  @JoinColumn({ name: 'mesa_id' })
  mesa?: PdvMesa;               // <-- Opcional

  @ManyToOne('Comanda', { nullable: true })
  @JoinColumn({ name: 'comanda_id' })
  comanda?: any;                // <-- Opcional
```

**Las tres relaciones son opcionales e independientes.** Una venta puede tener:
- Solo delivery
- Solo mesa
- Solo comanda
- Delivery + mesa
- Delivery + comanda
- Mesa + comanda
- Delivery + mesa + comanda
- Ninguna (mostrador)

**El plan afirma** (línea 110):

> Los textos de delivery/retiro se **agregan además** de mesa/comanda si existen (no los reemplazan).

**PERO el código propuesto hace lo contrario** (líneas 134-149):

```typescript
if (hayDelivery) {
  const textoDelivery = deliveryModo === DeliveryModo.DELIVERY
    ? 'Delivery'
    : 'Retirar en local';
  lines.push(ticketText(textoDelivery, { align: 'C', bold: true, size: 'tall' }));  // <-- TALL = grande
  // Si además tiene mesa/comanda, las agrega abajo en tamaño normal
  if (hayMesa) {
    lines.push(ticketText('MESA', { align: 'C' }));
    lines.push(ticketText(String(mesaNumero), { align: 'C', bold: true, size: 'normal' }));  // <-- NORMAL = chico
  }
  if (hayComanda) {
    lines.push(ticketText('COMANDA', { align: 'C' }));
    lines.push(ticketText(String(comandaRef), { align: 'C', bold: true, size: 'normal' }));  // <-- NORMAL = chico
  }
  return lines;
}
```

**Comparar con el comportamiento actual** (líneas 183-195 del código real):

```typescript
if (hayMesa) {
  lines.push(ticketText('MESA', { align: 'C' }));
  lines.push(ticketText(String(mesaNumero), { align: 'C', bold: true, size: 'big' }));  // <-- BIG = grande
}
if (hayComanda) {
  lines.push(ticketText('COMANDA', { align: 'C' }));
  lines.push(ticketText(String(comandaRef), {
    align: 'C', bold: true, size: hayMesa ? 'tall' : 'big',  // <-- TALL o BIG = grande
  }));
}
```

**Cambio de jerarquía:**
- **ANTES:** Mesa/Comanda en `big`/`tall` (grande)
- **DESPUÉS (con delivery):** Delivery en `tall`, Mesa/Comanda en `normal` (chico)

**Análisis de impacto:**

Mesa y comanda son referencias de **UBICACIÓN FÍSICA en el salón**. Son lo que el cocinero usa para saber **dónde poner el plato terminado**. El modo de delivery (envío vs retiro) es **información logística secundaria** para la cocina: lo que importa para empacar bien es que HAY un delivery (ya capturado por el gate de impresión), no si el cliente viene a buscarlo o se lo llevan.

**Escenario real no considerado:**
- Cliente en mesa 5 pide un plato para llevar → delivery con `modo = RETIRO` + `mesa = 5`
- Cliente hace pedido desde la mesa para delivery posterior → delivery + mesa/comanda
- Cliente retira un pedido pero espera en una mesa mientras se prepara → delivery + mesa

En estos casos, **suprimir la mesa/comanda a tamaño pequeño dificulta la operación de cocina**, que es el objetivo primario del ticket.

**Contradicción entre especificación y código:**

El plan textual (línea 110) dice que delivery se "agrega además" de mesa/comanda, pero el código propuesto los SUPLANTA en jerarquía visual. Esta contradicción indica que el diseño no fue pensado para el caso combinado.

**Conclusión:** El diseño propuesto es **arquitecturalmente incorrecto**. No respeta la semántica de la información ni el caso de uso real de la cocina.

---

### 4. ¿Hay otro builder de ticket de cocina además de `printComandaInternal`?

❌ **CALLER NO DOCUMENTADO**

El plan lista los call sites de `printComandaInternal` (correcto), pero `buildEncabezadoUbicacion` **tiene un segundo caller** que el plan NO menciona:

```typescript
// electron/handlers/documentos-tickets.handler.ts:898
// Dentro de buildVentaTicketLines() - Pre-cuenta / Comprobante del cliente
lines.push(...buildEncabezadoUbicacion(mesaNro, comandaRef, ticketText));
```

**Este caller construye la pre-cuenta y el comprobante del CLIENTE**, no el ticket de cocina.

**Impacto del cambio propuesto:**
- El comprobante del cliente también mostrará "Delivery"/"Retirar en local" en grande
- Mesa/Comanda irán en tamaño pequeño

**¿Es esto deseado?** El plan no lo analiza ni lo menciona. El alcance declarado (línea 10-11) es:

> **Es para que cocina empaque bien.** NO es el ticket del cliente (`printDeliveryTicketInternal`). Es la comanda de cocina que ve el cocinero.

**Pero el cambio afectará TAMBIÉN al ticket del cliente** (pre-cuenta/comprobante), que es un documento diferente con propósito distinto.

**Nota:** El plan menciona `printDeliveryTicketInternal` como fuera de alcance, pero NO menciona `buildVentaTicketLines`, que SÍ reutiliza el mismo helper.

---

### 5. ¿El test propuesto realmente importa el helper o solo el e2e que no arma el encabezado?

✅ **CORRECTO** — El test existente (`scripts/test-ticket-venta-e2e.ts`) SÍ importa y testea el helper directamente (líneas 213-230):

```typescript
const { buildEncabezadoUbicacion } = require('../electron/handlers/documentos-tickets.handler');
// ...
ok(textos(buildEncabezadoUbicacion(5, null, tt)) === 'MESA|5', 'ubicacion: solo mesa');
ok(textos(buildEncabezadoUbicacion(null, '#3', tt)) === 'COMANDA|#3', 'ubicacion: solo comanda');
ok(textos(buildEncabezadoUbicacion(5, '#3', tt)) === 'MESA|5|COMANDA|#3',
  'ubicacion: mesa Y comanda juntas (el bug reportado)',
  textos(buildEncabezadoUbicacion(5, '#3', tt)));
```

El plan propone agregar tests nuevos en este mismo archivo (correcto). El test no es "e2e puro": testea la función en aislamiento.

---

### 6. ¿`DeliveryModo` es `DELIVERY | RETIRO`? ¿Hay null/modo viejo?

✅ **CORRECTO** — Enum con exactamente dos valores:

```typescript
// src/app/database/entities/ventas/delivery.entity.ts:29
export enum DeliveryModo {
  DELIVERY = 'DELIVERY',
  RETIRO = 'RETIRO',
}
```

La columna tiene `default: DeliveryModo.DELIVERY` y **no es nullable**:

```typescript
@Column({
  name: 'modo',
  type: 'varchar',
  enum: DeliveryModo,
  default: DeliveryModo.DELIVERY,  // <-- default para registros viejos
})
modo!: DeliveryModo;
```

**No hay modo viejo ni null:** todo delivery existente tiene modo DELIVERY (el default de la migración).

---

### 7. Permisos: no aflojar. Sin migración.

✅ **CORRECTO** — El plan no toca permisos ni crea migraciones:

- No se agrega ningún permiso nuevo (sección 5, línea 253)
- No se modifica ninguna columna (sección 8.4, línea 250)
- `Delivery.modo` ya existe

**Sin riesgos de seguridad ni esquema.**

---

## Otros call sites verificados

Verificación completa de quién más puede armar tickets de cocina:

```bash
grep -r "printComandaInternal" electron/handlers/
```

**Resultado:**
- `ventas.handler.ts:4472` → `autoPrintComandaIfNeeded`
- `ventas.handler.ts:4631` → worker retry de impresión
- `documentos-tickets.handler.ts:1237` → handler IPC `print-comanda`

El plan los lista correctamente (sección 2). No hay callers ocultos.

**PWA mobile:**

```bash
grep -r "buildEncabezadoUbicacion\|printComandaInternal" projects/mobile/
```

**Resultado:** Sin matches. La PWA no reutiliza estos builders (correcto, el plan no la toca).

---

## Resumen de hallazgos

### ❌ P0 — Diseño incorrecto de jerarquía visual

**Descripción:** El plan suprime mesa/comanda (referencias de ubicación física) a tamaño pequeño cuando hay delivery, priorizando el modo de entrega (información logística secundaria).

**Impacto:**
- **Operación de cocina:** El cocinero pierde visibilidad de dónde poner el plato terminado
- **Caso combinado (delivery + mesa/comanda):** La jerarquía visual no refleja la importancia relativa de la información
- **Contradicción interna:** El texto del plan (línea 110) dice "además", el código hace "en vez de"

**Evidencia del error:**
1. Una venta SÍ puede tener delivery + mesa/comanda al mismo tiempo (relaciones opcionales independientes)
2. El código propuesto cambia tamaños: mesa/comanda de `big`/`tall` → `normal`
3. Caso de uso real no cubierto: cliente en mesa que pide para llevar

**Recomendación:** Rediseñar la lógica para que delivery, mesa y comanda **tengan igual prominencia**, o priorizar mesa/comanda (ubicación) sobre modo de entrega.

**Bloqueante:** SÍ — El fix propuesto **empeora** la experiencia de cocina en escenarios combinados.

---

### ⚠️ P1 — Caller no documentado: `buildVentaTicketLines`

**Descripción:** El plan no menciona que el helper también se usa en el comprobante del cliente (línea 898), solo habla del ticket de cocina.

**Impacto:**
- El cambio afectará TAMBIÉN a pre-cuenta y comprobante del cliente
- Estos tickets tienen propósito distinto (no son para cocina)
- No está claro si mostrar "Delivery"/"Retirar en local" en el comprobante es deseado

**Alcance declarado vs real:**
- Declarado (línea 10): "Es para que cocina empaque bien. NO es el ticket del cliente"
- Real: el helper se usa en ambos tickets

**Recomendación:** Ampliar el análisis de alcance. Si el comprobante del cliente NO debe cambiar, el helper debe parametrizar este comportamiento (ej. `esTicketCocina?: boolean`).

**Bloqueante:** NO, pero requiere decisión de producto.

---

### ⚠️ P2 — Contradicción entre especificación textual y código

**Descripción:** El plan textual (línea 110) dice que delivery se "agrega además" de mesa/comanda, pero el código propuesto cambia la jerarquía visual (delivery en grande, mesa/comanda en chico).

**Impacto:**
- Confusión sobre el comportamiento esperado
- Indica que el caso combinado no fue analizado en detalle

**Recomendación:** Alinear texto y código. Si el diseño es "delivery suplanta a mesa/comanda en tamaño", el texto debe decirlo explícitamente.

**Bloqueante:** NO, pero es síntoma del problema P0.

---

## Verificación de riesgos del plan

El plan lista dos riesgos (sección 7):

### Riesgo 1: "Que el fix se revierta silenciosamente"

✅ **Mitigación correcta** — Test de regresión que asserta el texto específico.

### Riesgo 2: "PWA/mobile arma tickets igual"

✅ **Verificado** — PWA NO reutiliza estos builders (grep sin matches). Fuera de alcance correctamente.

**Riesgo NO listado pero presente:**
- Cambio de jerarquía visual en tickets de cocina (P0)
- Impacto en comprobante del cliente (P1)

---

## Conclusión y recomendaciones

**El plan NO está listo para implementar.** Tiene un error de diseño P0 que invalida la solución propuesta.

### Para aprobar el plan, se requiere:

1. **Rediseñar la lógica de jerarquía visual** (P0):
   - **Opción A (recomendada):** Mostrar delivery, mesa y comanda **todos en grande** cuando coexisten. Ej:
     ```
     DELIVERY            (tall)
     MESA 5              (tall)
     ```
   - **Opción B:** Mantener mesa/comanda en grande, agregar delivery como subtítulo en normal:
     ```
     MESA 5              (tall)
     Para delivery       (normal)
     ```
   - **Opción C:** Decidir jerarquía por contexto (ej: si hay mesa, ella manda; si no, delivery manda). Requiere análisis de casos de uso.

2. **Documentar y validar el impacto en `buildVentaTicketLines`** (P1):
   - ¿El comprobante del cliente debe mostrar modo delivery?
   - Si NO, parametrizar el helper para distinguir ticket de cocina vs cliente
   - Si SÍ, agregar esta función a la sección de alcance y tests

3. **Resolver la contradicción texto vs código** (P2):
   - Alinear la especificación textual con el comportamiento del código
   - Explicitar el caso delivery + mesa/comanda en el diseño

4. **Agregar tests para casos combinados:**
   - Delivery DELIVERY + mesa → ¿qué texto sale?
   - Delivery RETIRO + comanda → ¿qué texto sale?
   - Delivery + mesa + comanda → ¿qué texto sale? (caso extremo, pero posible)

5. **Documentar call sites completos:**
   - Agregar `buildVentaTicketLines` (línea 898) a la tabla de callers
   - Aclarar si el cambio aplica a ambos o solo a comanda de cocina

---

## Apéndice: Código real verificado

**Archivos leídos:**
- `electron/handlers/documentos-tickets.handler.ts` (líneas 170-196, 428-480, 600-630, 890-910)
- `src/app/database/entities/ventas/venta.entity.ts` (líneas 24-104)
- `src/app/database/entities/ventas/delivery.entity.ts` (completo)
- `electron/handlers/ventas.handler.ts` (imports y call sites de printComandaInternal)
- `scripts/test-ticket-venta-e2e.ts` (líneas 213-230)
- `.claude/skills/frc-gourmet-expert/domains/ventas-pdv.md` (líneas 125-165)

**Búsquedas exhaustivas:**
- `grep -r "buildEncabezadoUbicacion" electron/` → 2 callers (líneas 610, 898)
- `grep -r "printComandaInternal" electron/handlers/` → 3 call sites (documentados)
- `grep -r "buildEncabezadoUbicacion\|printComandaInternal" projects/mobile/` → sin matches

**El código real gana** — esta auditoría se basa en lectura directa del código, no en documentación.

---

**FIN DEL INFORME**
