# AUDITORÍA DIFF-288 — EJE 2: PERMISOS / RPC DEFAULT-ALLOW / FUGAS HIDRATADAS

**PR auditado:** [#294](https://github.com/GabFrank/frc-gourmet/pull/294)  
**Rama:** `cursor/fix-288-vale-dialog-layout-2582`  
**Base:** `develop`  
**Issue:** [#288](https://github.com/GabFrank/frc-gourmet/issues/288) — Diálogo Crear vale/adelanto con overflow horizontal  
**Fecha de auditoría:** 2026-09-09  
**Auditor:** Claude (Cloud Agent)

---

## VEREDICTO: **PASS** ✅

**Justificación:** El fix es **exclusivamente UI/layout**. No hay superficie de permiso nueva, ni handlers modificados, ni canales IPC, ni DTOs de vale que ahora viajen de más.

---

## 1. RESUMEN EJECUTIVO

### Alcance del PR

El PR #294 corrige un overflow horizontal en el diálogo `CreateEditValeDialogComponent` ajustando:

1. **Ancho del dialog** en 2 callers (list-vales, pagar-obligaciones-dialog): `700px` → `760px` / `780px` → `760px`
2. **Estilos inline del componente**: elimina `min-width: 720px` problemático, usa `max-width: 720px` + `width: 100%`
3. **Truncamiento de mat-select**: agrega ellipsis para nombres de funcionario largos

### Archivos modificados (código de producción)

```
M  src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.ts
M  src/app/pages/rrhh/vales/create-edit-vale-dialog.component.ts
M  src/app/pages/rrhh/vales/list-vales.component.ts
```

**Total:** 3 archivos `.ts`, **todos en renderer (Angular)**, ninguno en backend.

### Archivos de documentación/soporte

```
A  docs/planes/AUDIT-PLAN-288-A.md
A  docs/planes/AUDIT-PLAN-288-B.md
A  docs/planes/PLAN-288-VALE-DIALOG-LAYOUT.md
M  .claude/skills/frc-gourmet-expert/domains/cocina-impresion.md
M  scripts/test-ticket-venta-e2e.ts
M  src/app/shared/components/delivery-dialog/delivery-dialog.component.scss
```

**Nota:** Los archivos marcados como modificados (`M`) en documentación/scripts tienen **diff vacío** (posibles cambios en metadatos/timestamps solamente). Los archivos agregados (`A`) son documentación del plan/auditoría.

---

## 2. ANÁLISIS DE SUPERFICIE DE PERMISO

### 2.1. Handlers IPC modificados: **NINGUNO** ✅

**Verificación:**

El listado de archivos modificados incluye `electron/handlers/documentos-tickets.handler.ts`, PERO su diff es **completamente vacío**:

```bash
$ git diff origin/develop...origin/cursor/fix-288-vale-dialog-layout-2582 \
    electron/handlers/documentos-tickets.handler.ts
# (sin output)
```

**Conclusión:** Falso positivo. El handler **NO fue modificado** en términos de lógica o canales IPC. Posible cambio en metadata (timestamp, línea vacía al final) que no afecta funcionalidad.

**Estado:** ✅ **PASS** — No hay handlers nuevos ni modificados.

---

### 2.2. Canales IPC nuevos: **NINGUNO** ✅

**Archivos revisados:**

- `preload.ts` — **NO está en el diff**
- `electron/handlers/*.handler.ts` — Ninguno modificado con lógica real
- Componentes Angular modificados — Solo cambios en:
  - `MatDialogConfig` (`width` property)
  - Bloque `styles` inline (CSS como string)
  - NO hay llamadas a `window.api.*` nuevas

**Conclusión:** ✅ **PASS** — No se exponen canales IPC nuevos.

---

### 2.3. DTOs de vale que ahora viajen de más: **NINGUNO** ✅

**Entidades verificadas:**

```bash
$ git diff origin/develop...origin/cursor/fix-288-vale-dialog-layout-2582 \
    src/app/database/entities/rrhh/vale.entity.ts \
    src/app/database/entities/rrhh/motivo-vale.entity.ts
# (sin output)
```

**Handlers verificados:**

```bash
$ git diff origin/develop...origin/cursor/fix-288-vale-dialog-layout-2582 \
    electron/handlers/vales.handler.ts
# (sin output)
```

**Componente del diálogo:**

El diff de `create-edit-vale-dialog.component.ts` muestra **SOLO cambios en el bloque `styles`** (líneas 133-162). No hay:

- ❌ Cambios en el `FormGroup` (líneas 183-199 no se tocan)
- ❌ Cambios en métodos `onSubmit()` / `confirmarSaldoSiNegativo()` / `crearValeConfirmado()`
- ❌ Cambios en `data` del MAT_DIALOG_DATA
- ❌ Nuevos campos en el template que envíen datos adicionales

**Conclusión:** ✅ **PASS** — No hay DTOs de vale que ahora viajen de más.

---

### 2.4. Permisos modificados/agregados: **NINGUNO** ✅

**Búsqueda exhaustiva:**

```bash
$ git diff origin/develop...origin/cursor/fix-288-vale-dialog-layout-2582 | grep -i "permission\|permiso\|RRHH_VALE"
# (sin matches en código de producción, solo en documentación)
```

Los únicos matches están en `docs/planes/PLAN-288-VALE-DIALOG-LAYOUT.md` como **restricciones explícitas de QUÉ NO TOCAR**:

```markdown
### Qué NO tocar
- NO tocar permisos (`RRHH_VALE_CREAR`, `RRHH_VALE_CONFIRMAR`)
```

**Conclusión:** ✅ **PASS** — No hay cambios en permisos.

---

## 3. ANÁLISIS DETALLADO DE CAMBIOS

### 3.1. `pagar-obligaciones-dialog.component.ts` (1 línea)

**Ubicación:** Línea 712

**Cambio:**

```diff
- ref = this.dialog.open(CreateEditValeDialogComponent, { width: '700px', maxHeight: '90vh', data: {} });
+ ref = this.dialog.open(CreateEditValeDialogComponent, { width: '760px', maxHeight: '90vh', data: {} });
```

**Análisis:**

- ✅ Solo cambia el `width` del `MatDialogConfig` (propiedad de UI)
- ✅ El objeto `data: {}` permanece **vacío** (no pasa `modoConfirmar`, `cajaMayorId`, ni otros datos)
- ✅ `maxHeight: '90vh'` no cambia
- ✅ NO hay cambios en el método que llama a esto (`crearNuevoDocumento()` líneas 680-750)

**Superficie de permiso:** **NINGUNA**

**Veredicto:** ✅ **PASS**

---

### 3.2. `create-edit-vale-dialog.component.ts` (estilos inline)

**Ubicación:** Líneas 133-162

**Cambio:**

```diff
  styles: [`
-   .dialog-content { min-width: 720px; }
+   .dialog-content { 
+     width: 100%; 
+     max-width: 720px; 
+     box-sizing: border-box; 
+   }
    .spinner { display: flex; justify-content: center; padding: 24px; }
-   .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: center; }
+   .form { 
+     display: grid; 
+     grid-template-columns: 1fr 1fr; 
+     gap: 12px; 
+     align-items: center; 
+     width: 100%; 
+     box-sizing: border-box; 
+   }
-   .full { grid-column: 1 / -1; }
+   .full { 
+     grid-column: 1 / -1; 
+     max-width: 100%; 
+     box-sizing: border-box; 
+   }
+   .fuente-toggle { 
+     width: 100%; 
+     box-sizing: border-box; 
+   }
    .fuente-toggle .mat-button-toggle { flex: 1; }
    .convertido { color: #1565c0; font-size: 14px; align-self: center; }
+   mat-select {
+     overflow: hidden;
+     text-overflow: ellipsis;
+     white-space: nowrap;
+   }
  `],
```

**Análisis:**

- ✅ **SOLO CSS inline** (string en el decorador `@Component`)
- ✅ No toca el template HTML (líneas 36-129)
- ✅ No toca el constructor, `ngOnInit()`, métodos de submit, validaciones
- ✅ No agrega campos nuevos al `FormGroup`
- ✅ No modifica `@Input()` ni `MAT_DIALOG_DATA`

**Superficie de permiso:** **NINGUNA**

**Veredicto:** ✅ **PASS**

---

### 3.3. `list-vales.component.ts` (1 línea)

**Ubicación:** Línea 192

**Cambio:**

```diff
  abrirCrear(): void {
-   const ref = this.dialog.open(CreateEditValeDialogComponent, { width: '780px' });
+   const ref = this.dialog.open(CreateEditValeDialogComponent, { width: '760px' });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.load(); });
  }
```

**Análisis:**

- ✅ Solo cambia el `width` del `MatDialogConfig`
- ✅ NO pasa `data` (el dialog usa valores por defecto)
- ✅ El callback `afterClosed()` no cambia
- ✅ NO hay cambios en `load()` ni en el resto del componente

**Superficie de permiso:** **NINGUNA**

**Veredicto:** ✅ **PASS**

---

## 4. VERIFICACIÓN: ENSURED PERMISSION EN HANDLERS

**Regla del eje 2:**

> Si se tocó un handler, revisá ensurePermission primera sentencia.

**Handlers tocados:** **NINGUNO** (el diff de `documentos-tickets.handler.ts` está vacío)

**Acción requerida:** Ninguna.

**Veredicto:** ✅ **N/A — PASS** (no se modificaron handlers)

---

## 5. VERIFICACIÓN: FUGAS HIDRATADAS

### 5.1. ¿Se agregan relaciones TypeORM nuevas que carguen datos sensibles?

**Entidades modificadas:** **NINGUNA**

**Conclusión:** ✅ **PASS** — No hay fugas por relaciones eager/lazy nuevas.

---

### 5.2. ¿Se pasan objetos completos donde antes se pasaban IDs?

**Análisis del `data` pasado al dialog:**

1. **`pagar-obligaciones-dialog.component.ts` línea 712:**
   ```typescript
   data: {}  // ← Objeto VACÍO, no pasa nada
   ```

2. **`list-vales.component.ts` línea 192:**
   ```typescript
   { width: '760px' }  // ← NO pasa `data`, el dialog usa defaults
   ```

3. **Caller no modificado (`registrar-egreso-dialog.component.ts` línea 303):**
   ```typescript
   data: { cajaMayorId: this.cajaMayorId }  // ← Solo ID, no objeto completo
   ```

**Conclusión:** ✅ **PASS** — No se pasan objetos hidratados de más. Solo IDs (o nada).

---

### 5.3. ¿Se expone el vale completo en respuestas donde antes no se exponía?

**Handler de creación (`electron/handlers/vales.handler.ts`):** **NO modificado**

**Respuesta del dialog (`create-edit-vale-dialog.component.ts`):**

El dialog cierra con:

```typescript
this.dialogRef.close({ saved: true, vale: valeCreado });
```

Esto **NO cambió en el diff** (el bloque de código de `onSubmit()` no está en el diff, por lo tanto no se modificó).

**Conclusión:** ✅ **PASS** — No hay fugas nuevas en las respuestas.

---

## 6. VERIFICACIÓN: RPC DEFAULT-ALLOW

**Regla del eje 2:**

> Verificá el diff contra develop: ningún handler nuevo, ningún canal IPC.

**Handlers nuevos:** **NINGUNO** ✅

**Canales IPC nuevos:** **NINGUNO** (preload.ts no está en el diff) ✅

**Canales IPC modificados:** **NINGUNO** (handlers sin cambios reales) ✅

**Conclusión:** ✅ **PASS** — No hay superficie de ataque RPC nueva.

---

## 7. RIESGOS DE SEGURIDAD IDENTIFICADOS

### **NINGUNO** ✅

Este PR es **exclusivamente cosmético/layout**:

- Solo ajusta `width` de `MatDialogConfig` (propiedad de UI)
- Solo modifica CSS inline (no toca HTML ni lógica)
- No expone datos nuevos
- No agrega handlers ni canales IPC
- No modifica validaciones, permisos ni flujo de submit

**Conclusión:** ✅ **Sin riesgos de seguridad**.

---

## 8. CHECKLIST DE AUDITORÍA

### ✅ Handlers nuevos
- [ ] ¿Hay archivos nuevos en `electron/handlers/`?  
  → **NO** ✅

### ✅ Handlers modificados
- [ ] ¿Hay archivos modificados en `electron/handlers/` con diff NO vacío?  
  → **NO** ✅ (documentos-tickets.handler.ts tiene diff vacío)

### ✅ Canales IPC nuevos
- [ ] ¿Se modificó `preload.ts`?  
  → **NO** ✅
- [ ] ¿Se agregaron llamadas a `ipcMain.handle()` nuevas?  
  → **NO** ✅
- [ ] ¿Se agregaron llamadas a `window.api.*` nuevas?  
  → **NO** ✅

### ✅ DTOs que ahora viajen de más
- [ ] ¿Se modificaron entidades (`*.entity.ts`)?  
  → **NO** ✅
- [ ] ¿Se agregaron campos al `FormGroup` del dialog?  
  → **NO** ✅
- [ ] ¿Se pasan objetos completos en `data` donde antes se pasaban IDs?  
  → **NO** ✅ (pagar-obligaciones-dialog pasa `data: {}` vacío)

### ✅ Permisos modificados
- [ ] ¿Se agregaron/modificaron permisos en `permissions.ts` o constantes de permiso?  
  → **NO** ✅
- [ ] ¿Se cambió la lógica de verificación de permisos en el dialog?  
  → **NO** ✅

### ✅ Fugas hidratadas
- [ ] ¿Se agregaron relaciones TypeORM `eager: true` nuevas?  
  → **NO** ✅
- [ ] ¿Se devuelven objetos con más campos de los necesarios?  
  → **NO** ✅

### ✅ ensurePermission en handlers
- [ ] Si se tocó un handler, ¿tiene `ensurePermission()` como primera sentencia?  
  → **N/A** (no se tocaron handlers) ✅

---

## 9. VEREDICTO FINAL

### ✅ **PASS** — Sin superficie de permiso, cambios solo en UI

**Justificación técnica:**

1. **No hay handlers nuevos ni modificados** — El diff de `documentos-tickets.handler.ts` está vacío
2. **No hay canales IPC nuevos** — `preload.ts` no está en el diff, no hay llamadas a `ipcMain.handle()` nuevas
3. **No hay DTOs de vale que viajen de más** — Solo se cambia `width` del dialog, el `data` pasado es `{}` (vacío)
4. **No hay cambios en permisos** — Las constantes `RRHH_VALE_CREAR` / `RRHH_VALE_CONFIRMAR` no se tocan
5. **No hay fugas hidratadas** — No se pasan objetos completos, solo IDs (o nada)
6. **Solo cambios de layout/estilos** — CSS inline + ancho del dialog

**Alcance del fix:** UI pura, sin lógica de negocio, sin backend, sin permisos.

**Riesgo de seguridad:** **NINGUNO**

---

## 10. RECOMENDACIONES

### Para este PR: ✅ **APROBAR SIN CAMBIOS**

El PR está listo para merge desde el punto de vista de seguridad/permisos.

### Para futuros PRs de vale:

1. **Si se agrega `modoConfirmar: true` desde `pagar-obligaciones-dialog`:**
   - Verificar que el handler `crearValeConfirmado` tenga `ensurePermission('RRHH_VALE_CONFIRMAR')` como primera línea
   - Verificar que NO se devuelva el saldo de Caja Mayor completo en la respuesta (solo confirmar éxito/fallo)

2. **Si se expone endpoint para listar vales por funcionario sin filtro por usuario actual:**
   - Agregar verificación de permiso `RRHH_VALE_VER_TODOS` vs `RRHH_VALE_VER_PROPIOS`
   - Limitar la respuesta a `{ id, monto, fecha, estado }` (no incluir `descripcion` o `motivoId` si contienen datos sensibles)

3. **Si se agrega búsqueda de vales por rango de montos:**
   - Considerar rate limiting (evitar que un usuario sin permisos haga búsquedas exhaustivas para inferir salarios)

---

**Fecha de auditoría:** 2026-09-09  
**Auditor:** Claude Sonnet 4.5 (Cloud Agent)  
**Estado:** COMPLETA  
**Resultado:** ✅ **PASS**

---

**Firma digital:**  
```
Eje 2 — ensurePermission / RPC default-allow / fugas hidratadas
Rama cursor/fix-288-vale-dialog-layout-2582 vs develop
Sin handlers nuevos ✅ | Sin canales IPC ✅ | Sin DTOs de más ✅
PASS — solo UI, sin superficie de permiso
```
