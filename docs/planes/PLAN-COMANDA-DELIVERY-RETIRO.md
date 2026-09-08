# Plan: Diferenciar Delivery y Retiro en ticket de cocina

**Fecha:** 2026-09-08  
**Autor:** Claude (Cloud Agent)  
**Estado:** PLAN (NO implementado)

---

## 1. Contexto y problema

Cuando un ticket de COCINA corresponde a un pedido del módulo delivery:
- Si `Delivery.modo === DELIVERY` (envío) → el ticket debe decir **"Delivery"**
- Si `Delivery.modo === RETIRO` → el ticket debe decir **"Retirar en local"**

**Es para que cocina empaque bien.** NO es el ticket del cliente (`printDeliveryTicketInternal`). Es la comanda de cocina que ve el cocinero.

### Estado actual verificado

`printComandaInternal` (en `documentos-tickets.handler.ts`) carga `delivery` solo para decidir SI imprime (gate: mesa || comanda || delivery || canalOrigen !== 'LOCAL').

El encabezado lo arma `buildEncabezadoUbicacion(mesa, comanda)`:
- Sin mesa ni comanda → imprime **`PARA LLEVAR`**
- NO lee `delivery.modo`
- Un delivery y un retiro salen **idénticos** en el papel

---

## 2. Call sites — TODOS los lugares que imprimen comanda

### Handlers y funciones de backend

| Archivo | Función/Handler | Descripción | ¿Usa `buildEncabezadoUbicacion`? |
|---------|----------------|-------------|----------------------------------|
| `documentos-tickets.handler.ts` | `printComandaInternal()` | **Builder real del ticket** — construye el `TicketSpec` completo | ✅ Sí (línea 610) |
| `documentos-tickets.handler.ts` | Handler IPC `print-comanda` | Wrapper con permiso, llama a `printComandaInternal` | No (delega al builder) |
| `ventas.handler.ts` | `autoPrintComandaIfNeeded()` | Auto-impresión al agregar ítems (delay 2500ms) | No (llama a `printComandaInternal`) |
| `ventas.handler.ts` | Worker retry comanda | `setInterval` 5s para items fallidos | No (llama a `printComandaInternal`) |
| `ventas.handler.ts` | Hook en `createVentaItem` | Dispara auto-impresión al crear ítem | No (llama a `autoPrintComandaIfNeeded`) |
| `ventas.handler.ts` | Hook en materializar pedido online | Tras crear items del pedido web | No (llama a `autoPrintComandaIfNeeded`) |

### Frontend

| Archivo | Línea/Función | Acción |
|---------|--------------|--------|
| `pdv.component.ts` | `reimprimirComanda()` | Botón "Reimprimir comanda" del PdV → `api.callIpc('print-comanda', {ventaId, forceReprint:true})` |

### KDS (NO imprime papel)

El KDS digital (`kds.component.ts`, `kds.handler.ts`) **NO** imprime: muestra en pantalla. Usa el mismo ruteo por sector (`ComandaItem`) pero no reutiliza el armado del ticket de papel. **Queda fuera del alcance** de este fix.

---

## 3. Causa raíz

`buildEncabezadoUbicacion` recibe **solo** `(mesaNumero, comandaRef)` y retorna las líneas de encabezado.

```typescript
// Código actual (líneas 170-196 de documentos-tickets.handler.ts):
export function buildEncabezadoUbicacion(
  mesaNumero: number | null | undefined,
  comandaRef: string | null | undefined,
  ticketText: (t: string, o?: any) => any,
): any[] {
  const lines: any[] = [];
  const hayMesa = mesaNumero !== null && mesaNumero !== undefined && `${mesaNumero}` !== '';
  const hayComanda = !!comandaRef;

  if (!hayMesa && !hayComanda) {
    lines.push(ticketText('PARA LLEVAR', { align: 'C', bold: true, size: 'tall' }));
    return lines;
  }
  // ... mesa y comanda en grande
  return lines;
}
```

**No recibe `delivery`.** El único lugar que arma el contenido es `printComandaInternal` (línea 610):

```typescript
lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText));
```

---

## 4. Alcance del fix

### Archivos a tocar

1. **`electron/handlers/documentos-tickets.handler.ts`**
   - Modificar la firma de `buildEncabezadoUbicacion` para recibir `deliveryModo?: DeliveryModo | null`
   - Ampliar la lógica interna para decidir qué texto mostrar según modo delivery
   - **Llamador:** `printComandaInternal` (línea ~610) — pasarle `delivery?.modo`

2. **`scripts/test-ticket-venta-e2e.ts`** (nuevo test)
   - Test de regresión: fixture con delivery DELIVERY → assert 'Delivery' en el contenido
   - Fixture con delivery RETIRO → assert 'Retirar en local'
   - Fixture sin delivery (mostrador) → assert 'PARA LLEVAR' (no cambió)
   - Fixture con mesa → assert 'MESA N' (no cambió)

3. **Documentación**
   - `.claude/skills/frc-gourmet-expert/domains/cocina-impresion.md`: actualizar sección de estructura de comanda
   - `.claude/skills/frc-gourmet-expert/domains/ventas-pdv.md`: actualizar sección de delivery si menciona el ticket

### Textos exactos

- Delivery (modo DELIVERY): **`"Delivery"`** (mayúscula inicial, sin acento)
- Retiro (modo RETIRO): **`"Retirar en local"`**
- Sin delivery ni mesa/comanda (mostrador): **`"PARA LLEVAR"`** (sin cambios)

Los textos de delivery/retiro se **agregan además** de mesa/comanda si existen (no los reemplazan). Mesa/mostrador sin delivery **no cambian**.

---

## 5. Diseño de la solución

### Opción elegida: UN helper compartido, parámetro opcional

**No** copiar el texto en cada caller. **Un solo lugar** decide el encabezado:

```typescript
// Nueva firma:
export function buildEncabezadoUbicacion(
  mesaNumero: number | null | undefined,
  comandaRef: string | null | undefined,
  ticketText: (t: string, o?: any) => any,
  deliveryModo?: DeliveryModo | null,  // <-- NUEVO parámetro opcional
): any[] {
  const lines: any[] = [];
  const hayMesa = mesaNumero !== null && mesaNumero !== undefined && `${mesaNumero}` !== '';
  const hayComanda = !!comandaRef;
  const hayDelivery = !!deliveryModo;

  // LÓGICA NUEVA: si hay delivery, el texto grande depende del modo
  if (hayDelivery) {
    const textoDelivery = deliveryModo === DeliveryModo.DELIVERY
      ? 'Delivery'
      : 'Retirar en local';
    lines.push(ticketText(textoDelivery, { align: 'C', bold: true, size: 'tall' }));
    // Si además tiene mesa/comanda, las agrega abajo en tamaño normal
    if (hayMesa) {
      lines.push(ticketText('MESA', { align: 'C' }));
      lines.push(ticketText(String(mesaNumero), { align: 'C', bold: true, size: 'normal' }));
    }
    if (hayComanda) {
      lines.push(ticketText('COMANDA', { align: 'C' }));
      lines.push(ticketText(String(comandaRef), { align: 'C', bold: true, size: 'normal' }));
    }
    return lines;
  }

  // LÓGICA ORIGINAL: sin delivery, se mantiene igual
  if (!hayMesa && !hayComanda) {
    lines.push(ticketText('PARA LLEVAR', { align: 'C', bold: true, size: 'tall' }));
    return lines;
  }
  if (hayMesa) {
    lines.push(ticketText('MESA', { align: 'C' }));
    lines.push(ticketText(String(mesaNumero), { align: 'C', bold: true, size: 'big' }));
  }
  if (hayComanda) {
    lines.push(ticketText('COMANDA', { align: 'C' }));
    lines.push(ticketText(String(comandaRef), {
      align: 'C', bold: true, size: hayMesa ? 'tall' : 'big',
    }));
  }
  return lines;
}
```

**Único callsite:** `printComandaInternal` (línea ~610):

```typescript
// Antes:
lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText));

// Después:
const deliveryModo = (venta as any).delivery?.modo ?? null;
lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText, deliveryModo));
```

**Nota importante:** `printComandaInternal` **ya carga** la relación `'delivery'` (línea 438):

```typescript
const venta = await dataSource.getRepository(Venta).findOne({
  where: { id: ventaId },
  relations: ['mesa', 'comanda', 'delivery'],  // <-- ya está
});
```

Así que **no hay que tocar la consulta**, sólo pasar el campo.

---

## 6. Criterios de terminado (checklist)

### Código
- [ ] `buildEncabezadoUbicacion` acepta `deliveryModo?: DeliveryModo | null` como 4º parámetro
- [ ] Lógica interna distingue los tres casos: DELIVERY, RETIRO, sin delivery
- [ ] Textos exactos: `"Delivery"` y `"Retirar en local"`
- [ ] Parámetro es **opcional** (compatibilidad hacia atrás)
- [ ] `printComandaInternal` pasa `delivery?.modo` al llamar al helper

### Tests
- [ ] Test de regresión: delivery DELIVERY → contiene "Delivery"
- [ ] Test de regresión: delivery RETIRO → contiene "Retirar en local"
- [ ] Test de regresión: venta sin delivery (mostrador) → sigue diciendo "PARA LLEVAR"
- [ ] Test de regresión: venta con mesa → sigue mostrando "MESA N" (sin delivery, sin cambios)
- [ ] `npm run build` (compila sin errores)
- [ ] `npm run check` (AOT production build, detecta errores de template)
- [ ] Test nuevo pasa en SQLite (CI)

### Documentación
- [ ] `.claude/skills/frc-gourmet-expert/domains/cocina-impresion.md` actualizado (sección estructura comanda)
- [ ] Skill menciona que el encabezado ahora distingue modo delivery
- [ ] Plan commiteado en `docs/planes/PLAN-COMANDA-DELIVERY-RETIRO.md`

---

## 7. Riesgos y mitigaciones

### Riesgo: Que el fix se revierta silenciosamente

**Impacto:** MEDIO — si alguien refactoriza el helper y borra el parámetro, el texto vuelve a ser genérico.

**Mitigación:** Test de regresión en `test-ticket-venta-e2e.ts` que asserta el texto específico. Si falla, el CI lo atrapa.

### Riesgo: PWA/mobile arma tickets igual (si reutiliza el builder)

**Impacto:** BAJO — el alcance dice "no tocar PWA salvo que use el mismo builder".

**Verificación previa:** Buscar en `projects/mobile/` si hay referencias a `buildEncabezadoUbicacion` o `printComandaInternal`.

```bash
grep -r "buildEncabezadoUbicacion" projects/mobile/
grep -r "printComandaInternal" projects/mobile/
```

Si no hay matches → **PWA queda afuera** (no arma tickets de cocina, o lo hace por otro camino).

---

## 8. Qué NO entra en este plan

1. **KDS digital** — NO imprime papel, muestra en pantalla. Puede o no necesitar el cambio, pero **no está en el alcance**. Si se desea, es otro task.

2. **Ticket del cliente** (`printDeliveryTicketInternal`) — ese ya tiene lógica propia de delivery y NO reutiliza `buildEncabezadoUbicacion`. No se toca.

3. **PWA mobile** — a menos que se confirme que reutiliza el builder de tickets de cocina (verificación previa arriba). Si no, queda fuera.

4. **Migración de base de datos** — no se agrega/modifica ninguna columna. El campo `Delivery.modo` ya existe.

5. **Permisos nuevos** — no se agrega ningún permiso. La impresión de comanda ya tiene `VENTAS_PDV` o `DOCUMENTOS_IMPRIMIR_TICKET`.

6. **Formato del ticket** — SÓLO cambia el texto del encabezado. No se modifica:
   - Fuente/estilo de otros bloques
   - Lista de ítems
   - Ingredientes removidos/adicionales
   - Footer del ticket

---

## 9. Fases de implementación

### Fase 1: Modificar el helper (core)
- Cambiar firma de `buildEncabezadoUbicacion`
- Implementar lógica de decisión por modo
- **Commit:** `feat(cocina): distinguir delivery/retiro en ticket de cocina`

### Fase 2: Actualizar el único caller
- `printComandaInternal` → pasar `delivery?.modo`
- Verificar que la relación ya se carga (línea 438)
- **Commit:** `feat(cocina): pasar modo delivery al builder de encabezado`

### Fase 3: Tests de regresión
- Agregar bloque de tests en `test-ticket-venta-e2e.ts`
- Fixtures: delivery DELIVERY, RETIRO, sin delivery, con mesa
- Assert sobre el contenido renderizado (texto plano via `renderTicketToPlainText`)
- **Commit:** `test(cocina): regresión tickets delivery/retiro`

### Fase 4: Documentación
- Actualizar skill `cocina-impresion.md`
- Mencionar el cambio en `ventas-pdv.md` si aplica
- **Commit:** `docs: actualizar skill con encabezado delivery/retiro`

---

## 10. Validación manual (después de implementar)

1. Crear delivery con modo **DELIVERY**
2. Agregar un producto con `requiereComanda = true`
3. Verificar que se dispara auto-impresión
4. **Assert:** el ticket dice **"Delivery"** en grande (no "PARA LLEVAR")

5. Crear delivery con modo **RETIRO**
6. Agregar producto
7. **Assert:** el ticket dice **"Retirar en local"**

8. Crear venta de mostrador (sin mesa, sin comanda, sin delivery)
9. Agregar producto
10. **Assert:** el ticket dice **"PARA LLEVAR"** (sin cambios)

11. Crear venta con mesa 5 (sin delivery)
12. Agregar producto
13. **Assert:** el ticket dice **"MESA 5"** (sin cambios)

---

## 11. Rollback

Si tras desplegar hay un problema:

1. **Revertir el commit de la Fase 1** (cambio en el helper)
2. **Revertir el commit de la Fase 2** (caller)
3. El sistema vuelve al estado anterior: todos los tickets dicen "PARA LLEVAR" si no hay mesa/comanda

**No hay migración que revertir** (no tocamos esquema de BD).

---

## 12. Próximos pasos

Una vez aprobado este plan:

1. **Verificación previa:** buscar en PWA si reutiliza el builder (grep arriba)
2. **Implementar Fase 1-4**
3. **`npm run build && npm run check`** local
4. **Commit + push**
5. **PR a `develop` en draft** (para revisión)
6. **CI pasa** → manual de pruebas
7. **Marcar PR ready for review**

---

**Fin del plan.**
