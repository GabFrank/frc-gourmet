# Auditoría DIFF: Permisos en Comanda Delivery/Retiro (Eje 2)

**PR auditado:** [#293](https://github.com/GabFrank/frc-gourmet/pull/293)  
**Rama:** `cursor/comanda-delivery-retiro-bad4`  
**Commits del fix:**
- `50c46232` — Plan documentado
- `25dea511` — Implementación (feat + test)
- `6484547e` — Actualización de skill

**Auditor:** Cloud Agent  
**Fecha:** 2026-09-08  
**Alcance:** Verificar que el diff NO aflojó controles de permisos en `print-comanda` ni en hooks que disparan impresión de cocina

---

## Veredicto: ✅ PASS

**Síntesis:** El diff NO toca ningún `ensurePermission`. Los únicos cambios son:
1. Agregar parámetro opcional `deliveryModo` a `buildEncabezadoUbicacion`
2. Extraer `delivery?.modo` en `printComandaInternal` y pasarlo al builder
3. Lógica interna del builder para renderizar "Delivery"/"Retirar en local"
4. Tests de regresión

**Ningún control de permisos fue removido, relajado ni bypasseado.**

---

## 1. Handler IPC `print-comanda`: permiso intacto

### ✅ Estado PRE-diff (master)

```typescript
// electron/handlers/documentos-tickets.handler.ts:1251
ipcMain.handle('print-comanda', async (_event, params: {
  ventaId: number;
  soloItemsNoImpresos?: boolean;
  sectorIdFilter?: number;
  forceReprint?: boolean;
}) => {
  await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET']);
  return await printComandaInternal(dataSource, params.ventaId, {
    soloItemsNoImpresos: params.soloItemsNoImpresos,
    sectorIdFilter: params.sectorIdFilter,
    forceReprint: params.forceReprint,
  });
});
```

**Permisos requeridos:** `VENTAS_PDV` **OR** `DOCUMENTOS_IMPRIMIR_TICKET`

### ✅ Estado POST-diff (rama PR)

**Verificación:**
```bash
git diff origin/master...HEAD -- electron/handlers/documentos-tickets.handler.ts | grep -E "ensurePermission|print-comanda"
```

**Resultado:** Ninguna línea modificada. El handler mantiene exactamente el mismo `ensurePermission` en la línea 1257.

**Conclusión:** ✅ El permiso NO fue tocado.

---

## 2. Función `printComandaInternal`: cambios no afectan flujo de autorización

### Diff aplicado

```diff
@@ -592,6 +612,7 @@ export async function printComandaInternal(
   const refMesa = mesa?.numero ? `MESA ${mesa.numero}` : null;
   const refComanda = comanda?.codigo || (comanda?.numero ? `#${comanda.numero}` : null);
   const refStr = refMesa || (refComanda ? `COMANDA ${refComanda}` : 'PARA LLEVAR');
+  const deliveryModo = (venta as any).delivery?.modo ?? null;
 
   // 5. Por cada job: construir spec, imprimir, registrar
   for (const job of jobsByPrinter.values()) {
@@ -607,7 +628,7 @@ export async function printComandaInternal(
       ticketText(ticketFmtFechaHora(new Date()), { align: 'C' }),
       ticketSeparador('='),
     ];
-    lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText));
+    lines.push(...buildEncabezadoUbicacion(mesa?.numero, refComanda, ticketText, deliveryModo));
     lines.push(ticketText(`TICKET #${ventaId}`, { align: 'C', bold: true, size: 'tall' }));
     lines.push(ticketSeparador('='));
```

**Análisis:**
- Línea +615: Extrae `delivery?.modo` de la venta ya cargada (la relación `'delivery'` ya estaba en el `findOne` desde antes, línea 458)
- Línea +631: Pasa el modo como 4º parámetro opcional al builder

**No hay:**
- ❌ Llamadas nuevas a `printComandaInternal` que bypasseen el handler IPC
- ❌ Condiciones que salten el `ensurePermission`
- ❌ Early returns que eviten el chequeo

**Conclusión:** ✅ La función sigue siendo llamada exclusivamente desde contextos autorizados.

---

## 3. Builder `buildEncabezadoUbicacion`: sin lógica de autorización

### Diff aplicado

```diff
@@ -171,11 +171,31 @@ export function buildEncabezadoUbicacion(
   mesaNumero: number | null | undefined,
   comandaRef: string | null | undefined,
   ticketText: (t: string, o?: any) => any,
+  deliveryModo?: DeliveryModo | null,
 ): any[] {
   const lines: any[] = [];
   const hayMesa = mesaNumero !== null && mesaNumero !== undefined && `${mesaNumero}` !== '';
   const hayComanda = !!comandaRef;
+  const hayDelivery = !!deliveryModo;
+
+  // Caso DELIVERY o RETIRO: las tres referencias van en grande si coexisten
+  if (hayDelivery) {
+    const textoDelivery = deliveryModo === DeliveryModo.DELIVERY
+      ? 'Delivery'
+      : 'Retirar en local';
+    lines.push(ticketText(textoDelivery, { align: 'C', bold: true, size: 'big' }));
+    if (hayMesa) {
+      lines.push(ticketText('MESA', { align: 'C' }));
+      lines.push(ticketText(String(mesaNumero), { align: 'C', bold: true, size: 'big' }));
+    }
+    if (hayComanda) {
+      lines.push(ticketText('COMANDA', { align: 'C' }));
+      lines.push(ticketText(String(comandaRef), { align: 'C', bold: true, size: 'big' }));
+    }
+    return lines;
+  }
 
+  // Caso SIN delivery: lógica original sin cambios
   if (!hayMesa && !hayComanda) {
     lines.push(ticketText('PARA LLEVAR', { align: 'C', bold: true, size: 'tall' }));
     return lines;
```

**Análisis:**
- Esta función es un **pure builder**: recibe datos primitivos y devuelve líneas de ticket
- NO hace llamadas IPC, NO consulta la DB, NO valida permisos
- Su responsabilidad es **solo rendering**

**Callers de este builder:**
1. `printComandaInternal` (línea 631) — función interna que solo se llama desde handler autorizado
2. `buildVentaTicketLines` (línea 898) — usado por `printVentaTicketInternal`, que tiene su propio `ensurePermission` (línea 1270: `['VENTAS_PDV', 'DOCUMENTOS_REIMPRIMIR_TICKET_VENTA']`)

**Conclusión:** ✅ El builder NO es un punto de autorización. Sus callers sí lo son, y no fueron modificados.

---

## 4. Hooks que disparan `printComandaInternal`: verificación de cadena de permisos

### 4.1 Hook auto-impresión: `autoPrintComandaIfNeeded`

**Caller indirecto:** `createVentaItem` (handler IPC)

```typescript
// electron/handlers/ventas.handler.ts:1523
ipcMain.handle('createVentaItem', async (_event: any, data: any) => {
  try {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');  // ✅ PERMISO INTACTO
    await validarVariacionDelItem(dataSource, data);
    const repo = dataSource.getRepository(VentaItem);
    const entity = repo.create(data);
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    const saved = await repo.save(entity);

    // Hook auto-imprimir (línea 1540)
    try {
      const ventaId = savedAny.venta?.id ?? savedAny.venta_id ?? savedAny.ventaId;
      if (ventaId) {
        await autoPrintComandaIfNeeded(dataSource, ventaId);  // <-- Dispara printComandaInternal
      }
    } catch (e) {
      console.warn('[createVentaItem] hook auto-imprimir comanda falló:', e);
    }
    // ...
```

**Verificación del diff:**
```bash
git diff origin/master...HEAD -- electron/handlers/ventas.handler.ts | grep -E "ensurePermission|autoPrintComanda"
```

**Resultado:** Sin cambios. El handler `createVentaItem` mantiene `ensurePermission('VENTAS_PDV')`.

**Flujo de autorización:**
1. Usuario llama `window.api.createVentaItem(...)` (frontend)
2. IPC handler verifica `VENTAS_PDV` ✅
3. Si pasa, crea el item y dispara hook
4. Hook llama `printComandaInternal` internamente (NO vía IPC)

**Conclusión:** ✅ La auto-impresión sigue protegida por el permiso de crear items. Un usuario sin `VENTAS_PDV` NO puede disparar la impresión.

---

### 4.2 Worker retry de impresión: `retryPendingComandas`

**Ubicación:** `electron/handlers/ventas.handler.ts:4608`

```typescript
async function retryPendingComandas(dataSource: DataSource): Promise<void> {
  if (_retryComandaRunning) return;
  _retryComandaRunning = true;
  try {
    const pdvConfig = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
    if (!pdvConfig?.autoImprimirComanda) return;

    // Buscar items con impresión fallida y reintentar
    const rows = await dataSource.getRepository(VentaItem)
      .createQueryBuilder('vi')
      .innerJoin('vi.venta', 'venta')
      .select('DISTINCT venta.id', 'venta_id')
      .where('vi.impreso = false')
      .andWhere('vi.impresiones IS NOT NULL')
      .andWhere(`LENGTH(vi.impresiones) > 2`)
      .andWhere('venta.estado = :estado', { estado: VentaEstado.ABIERTA })
      .getRawMany();

    for (const row of rows) {
      const ventaId = Number((row as any).venta_id);
      if (!ventaId) continue;
      try {
        const res = await printComandaInternal(dataSource, ventaId, {
          soloItemsNoImpresos: true,
          retryFailed: true,
          silent: true,
        });
        // ...
```

**Análisis:**
- Este worker NO es un handler IPC: se inicia en `ventas.handler.ts:560` al arrancar el servidor
- NO hay entrada IPC `retry-comanda` ni similar
- Solo reintenta items que **YA fueron creados** (y que al crearse pasaron por `ensurePermission('VENTAS_PDV')`)
- Es un mecanismo de **recuperación técnica ante fallos de impresora**, no un punto de entrada para operaciones nuevas

**Verificación del diff:**
```bash
git diff origin/master...HEAD -- electron/handlers/ventas.handler.ts | grep -E "retryPendingComandas|startRetryComandaWorker"
```

**Resultado:** Sin cambios.

**Conclusión:** ✅ El worker NO introduce un bypass. Solo reintenta operaciones ya autorizadas.

---

### 4.3 Reimpresión manual desde PdV: `reimprimirComanda()`

**Frontend:** `src/app/pages/ventas/pdv/pdv.component.ts:2649`

```typescript
reimprimirComanda(): void {
  if (!this.hasActiveVenta) return;
  const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
  if (!venta?.id) return;

  const api: any = (window as any).api;
  if (!api?.callIpc) return;
  api.callIpc('print-comanda', { ventaId: venta.id, forceReprint: true })  // <-- Va por IPC
    .then((res: any) => {
      if (res?.ok) {
        this.snackBar.open('Comanda reenviada a cocina', 'CERRAR', { duration: 2500 });
      } else {
        const msg = res?.errors?.[0]?.message || 'No se pudo reimprimir la comanda';
        this.snackBar.open(msg, 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
      }
    })
    .catch((err: any) => {
      console.error('Error reimprimir comanda:', err);
      this.snackBar.open('Error al reimprimir la comanda', 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
    });
}
```

**Verificación del diff:**
```bash
git diff origin/master...HEAD -- src/app/pages/ventas/pdv/pdv.component.ts
```

**Resultado:** Sin cambios en el archivo.

**Flujo de autorización:**
1. Usuario hace clic en botón "Reimprimir comanda" del PdV (componente protegido)
2. Frontend llama `window.api.callIpc('print-comanda', ...)`
3. IPC handler verifica `ensurePermission(['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET'])` ✅
4. Si pasa, ejecuta `printComandaInternal`

**Notas sobre protección del componente:**
- El `pdv.component.ts` es accesible solo desde el menú PdV, que está protegido por rutas/permisos de Angular
- El usuario debe tener acceso al módulo de ventas para llegar a esta función
- La doble protección (frontend + backend `ensurePermission`) es correcta

**Conclusión:** ✅ La reimpresión manual sigue protegida. Un usuario sin `VENTAS_PDV` ni `DOCUMENTOS_IMPRIMIR_TICKET` NO puede reimprimir comandas.

---

## 5. Búsqueda exhaustiva de nuevos callers

### Verificación 1: Nuevos call sites de `printComandaInternal`

```bash
git diff origin/master...HEAD -- electron/ | grep -E "^\+.*printComandaInternal\("
```

**Resultado:** Sin matches. No se agregaron nuevas llamadas.

### Verificación 2: Nuevos handlers IPC relacionados con comandas

```bash
git diff origin/master...HEAD -- electron/ | grep -E "ipcMain\.handle.*comanda"
```

**Resultado:** Sin matches. No se agregaron handlers IPC.

### Verificación 3: Modificaciones en `preload.ts` (API expuesta al frontend)

```bash
git diff origin/master...HEAD -- preload.ts | grep -E "print.*comanda|printComanda" -i
```

**Resultado:** Sin matches. El diff de `preload.ts` solo toca `getGastoCaja` y `editGastoCaja`, no comandas.

**Conclusión:** ✅ NO hay nuevos puntos de entrada que bypasseen el permiso existente.

---

## 6. Archivos modificados: análisis de impacto en permisos

### Archivos del diff (según PR #293)

```
.claude/skills/frc-gourmet-expert/domains/cocina-impresion.md  | +8   (docs)
docs/planes/AUDIT-PLAN-COMANDA-DELIVERY-A.md                   | +459 (audit)
docs/planes/AUDIT-PLAN-COMANDA-DELIVERY-B.md                   | +400 (audit)
docs/planes/PLAN-COMANDA-DELIVERY-RETIRO.md                    | +334 (plan)
electron/handlers/documentos-tickets.handler.ts                | +23 -2 (código)
scripts/test-ticket-venta-e2e.ts                               | +45 (tests)
```

**Análisis por archivo:**

| Archivo | Toca permisos? | Toca handlers IPC? | Riesgo |
|---------|----------------|--------------------| -------|
| `cocina-impresion.md` | ❌ NO | ❌ NO | ✅ Ninguno (documentación) |
| `AUDIT-*.md` | ❌ NO | ❌ NO | ✅ Ninguno (auditorías) |
| `PLAN-*.md` | ❌ NO | ❌ NO | ✅ Ninguno (plan) |
| `documentos-tickets.handler.ts` | ❌ NO | ❌ NO¹ | ✅ Ninguno (solo rendering) |
| `test-ticket-venta-e2e.ts` | ❌ NO | ❌ NO | ✅ Ninguno (tests) |

**Nota 1:** El handler `print-comanda` está en este archivo, pero NO fue modificado (ver §1).

**Conclusión:** ✅ Ningún archivo del diff introduce, modifica o elimina controles de permisos.

---

## 7. Casos de prueba de autorización

### Escenario 1: Usuario SIN permisos intenta imprimir comanda directamente

**Setup:**
- Usuario con rol sin `VENTAS_PDV` ni `DOCUMENTOS_IMPRIMIR_TICKET`
- Intenta llamar `window.api.callIpc('print-comanda', { ventaId: 123 })`

**Resultado esperado:**
- El handler rechaza en línea 1257: `ensurePermission` lanza excepción
- La comanda NO se imprime

**Estado post-diff:** ✅ SIN CAMBIOS. El `ensurePermission` sigue en su lugar.

---

### Escenario 2: Usuario SIN permisos intenta crear VentaItem (dispara auto-impresión)

**Setup:**
- Usuario con rol sin `VENTAS_PDV`
- Intenta llamar `window.api.createVentaItem({ ventaId: 123, productoId: 456, ... })`

**Resultado esperado:**
- El handler rechaza en línea 1525: `ensurePermission('VENTAS_PDV')` lanza excepción
- El item NO se crea, la auto-impresión NO se dispara

**Estado post-diff:** ✅ SIN CAMBIOS. El `ensurePermission` sigue en su lugar.

---

### Escenario 3: Usuario CON permisos, delivery sin modo (edge case)

**Setup:**
- Usuario con `VENTAS_PDV`
- Venta tiene delivery con `modo = null` (teórico: la columna tiene default `DELIVERY`)

**Resultado esperado:**
- El handler acepta (tiene el permiso)
- `printComandaInternal` extrae `delivery?.modo ?? null` → `null`
- `buildEncabezadoUbicacion` recibe `deliveryModo = null` → branch `if (hayDelivery)` NO se activa (falsy)
- El ticket usa lógica sin delivery (comportamiento original)

**Estado post-diff:** ✅ CORRECTO. El parámetro opcional NO cambia el flujo de autorización.

---

## 8. Verificación contra reglas del proyecto

### Regla: Permisos en handlers IPC

> Todo `ipcMain.handle` que modifique datos o ejecute operaciones sensibles debe tener `ensurePermission` en la primera línea ejecutable.

**Verificación:**
```typescript
// Línea 1251-1263 de documentos-tickets.handler.ts (SIN CAMBIOS)
ipcMain.handle('print-comanda', async (_event, params: {...}) => {
  await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET']);
  return await printComandaInternal(dataSource, params.ventaId, {...});
});
```

✅ Cumple: `ensurePermission` está en línea 1257, antes de cualquier operación.

---

### Regla: Hooks internos NO bypassean permisos

> Funciones internas (no expuestas por IPC) que ejecutan operaciones sensibles solo deben ser llamadas desde handlers autorizados.

**Verificación:**
- `printComandaInternal` NO está en `preload.ts` → NO expuesta al frontend directamente
- Solo se llama desde:
  1. Handler IPC `print-comanda` (con permiso)
  2. Hook `autoPrintComandaIfNeeded` (desde handler con permiso)
  3. Worker retry (solo reintenta operaciones ya autorizadas)

✅ Cumple: NO hay bypass.

---

## 9. Priorización de hallazgos

| Hallazgo | Severidad | Estado |
|----------|-----------|--------|
| Handler `print-comanda` mantiene `ensurePermission` intacto | — | ✅ OK |
| Ningún archivo del diff toca permisos | — | ✅ OK |
| NO hay nuevos callers de `printComandaInternal` | — | ✅ OK |
| Hook auto-impresión sigue protegido por `createVentaItem` | — | ✅ OK |
| Worker retry NO introduce bypass | — | ✅ OK |
| Frontend `pdv.component.ts` sigue usando IPC autorizado | — | ✅ OK |
| Búsqueda exhaustiva NO encontró nuevos handlers IPC | — | ✅ OK |

**Total de problemas de seguridad:** 0  
**Total de relajaciones de permisos:** 0  
**Total de bypasses introducidos:** 0

---

## 10. Conclusión y recomendaciones

### Veredicto final: ✅ **PASS sin reservas**

**El diff NO aflojó ningún control de permisos.**

**Evidencia:**
1. ✅ El `ensurePermission` en `print-comanda` (línea 1257) NO fue modificado
2. ✅ Los hooks que disparan `printComandaInternal` siguen protegidos por handlers con permisos
3. ✅ NO se agregaron nuevos call sites que bypasseen autorización
4. ✅ El parámetro opcional `deliveryModo` es solo rendering: NO afecta flujo de seguridad
5. ✅ Ningún archivo del diff introduce, modifica o elimina `ensurePermission`

**Un caller nuevo NO puede imprimir cocina sin el permiso que ya tenía.**

---

### Recomendaciones (fuera del alcance de esta auditoría)

**Nota:** Estas recomendaciones son **generales** (no hallazgos de esta auditoría), ya que el diff PASS sin problemas:

1. **Test de autorización automatizado (nice-to-have):**
   - Agregar test que verifique rechazo de `print-comanda` con usuario sin permisos
   - Actualmente los tests verifican correctitud funcional, no controles de acceso

2. **Documentación de permisos (opcional):**
   - La skill `cocina-impresion.md` podría mencionar qué permisos se requieren para imprimir
   - Facilita onboarding de devs nuevos

---

## Apéndice: Comandos de verificación ejecutados

```bash
# Estado del repo
git status
git diff origin/master...HEAD -- electron/handlers/documentos-tickets.handler.ts

# Búsqueda de ensurePermission en handler
grep -n "ensurePermission" electron/handlers/documentos-tickets.handler.ts

# Búsqueda de callers de printComandaInternal
grep -rn "printComandaInternal" electron/handlers/

# Verificación de cambios en permisos
git diff origin/master...HEAD -- electron/handlers/ | grep -E "ensurePermission|printComanda"

# Verificación de nuevos handlers IPC
git diff origin/master...HEAD -- electron/ | grep -E "ipcMain\.handle.*comanda"

# Verificación de cambios en preload
git diff origin/master...HEAD -- preload.ts | grep -E "print.*comanda" -i

# Verificación de cambios en frontend
git diff origin/master...HEAD -- src/app/pages/ventas/pdv/pdv.component.ts

# Búsqueda de nuevos call sites
git diff origin/master...HEAD -- electron/ | grep -E "^\+.*printComandaInternal\("
```

**Todos los comandos ejecutados el 2026-09-08.**

---

**FIN DEL INFORME**
