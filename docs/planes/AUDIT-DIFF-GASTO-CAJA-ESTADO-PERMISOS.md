# Auditoría de Diff — Gasto Caja: Estado en Resumen (Eje 2: Permisos)

> **Repo:** GabFrank/frc-gourmet  
> **Rama:** `cursor/gasto-caja-estado-resumen-cd00`  
> **PR:** [#292](https://github.com/GabFrank/frc-gourmet/pull/292) (draft)  
> **Base:** `develop`  
> **Fecha auditoría:** 2026-09-08  
> **Auditor:** Cloud Agent (Claude Sonnet 4.5)

---

## 1. Objetivo de la auditoría

Verificar que el fix que agrega `estado` al payload de gastos en `computeResumenCaja`:

1. **NO aflojó permisos** en los handlers `get-gasto-caja` ni `edit-gasto-caja`
2. Mantiene el requisito de permiso `FINANCIERO_CAJA_GESTIONAR` para lectura y edición por ID
3. Un cajero con solo `VENTAS_PDV` NO puede leer ni editar un gasto por ID
4. El botón Editar sigue protegido con `*appHasPermission="'FINANCIERO_CAJA_GESTIONAR'"`
5. El botón Editar sigue deshabilitado si `estado !== 'ACTIVO'`

---

## 2. Archivos auditados

| Archivo | Propósito en la auditoría |
|---------|---------------------------|
| `electron/utils/resumen-caja.utils.ts` | Verificar el cambio de payload (solo agregar `estado`) |
| `electron/handlers/gastos-caja.handler.ts` | Verificar `ensurePermission` en handlers nuevos y existentes |
| `src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.html` | Verificar `*appHasPermission` y `[disabled]` en botón Editar |
| `src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.ts` | Verificar `permissionService.has()` en `editarGasto()` |
| `src/app/pages/ventas/pdv/gasto-caja-dialog/gasto-caja-dialog.component.ts` | Verificar que modo edición llama a los handlers correctos |
| `src/app/database/repository*.service.ts` | Verificar firma de los métodos `getGastoCaja` y `editGastoCaja` |
| `preload.ts` | Verificar que los canales IPC expuestos corresponden a los handlers |

---

## 3. Hallazgos

### 3.1 Payload de `computeResumenCaja` (✓ CORRECTO)

**Archivo:** `electron/utils/resumen-caja.utils.ts` línea 178

**Diff:**
```diff
  return {
    id: g.id,
+   estado: g.estado,
    descripcion: g.descripcion,
    monto,
    // ...
  };
```

**Verificación:**
- ✅ Solo se agregó el campo `estado`
- ✅ No se modificó el filtro `where: { caja: { id: cajaId }, estado: 'ACTIVO' }` (línea 166)
- ✅ No se cambió la lógica de cálculo de `gastosEfectivoPorMoneda`
- ✅ No se alteraron permisos (este util no tiene `ensurePermission`)

**Conclusión:** El cambio es quirúrgico y solo expone un campo existente de la entidad.

---

### 3.2 Handlers de backend (✓ CORRECTOS — NO SE AFLOJARON PERMISOS)

**Archivo:** `electron/handlers/gastos-caja.handler.ts`

#### 3.2.1 Handlers NUEVOS (agregados en este PR)

**a) `get-gasto-caja` (lectura de un gasto por ID para edición)**

```typescript
// Línea 103 del diff
ipcMain.handle('get-gasto-caja', async (_event, gastoId: number) => {
  await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
  // ...
});
```

**Verificación:**
- ✅ **Permiso requerido:** `FINANCIERO_CAJA_GESTIONAR`
- ✅ El cajero con solo `VENTAS_PDV` **NO** puede invocar este handler
- ✅ Retorna el gasto completo con relaciones (categoría, moneda, forma de pago, caja)
- ✅ Lanza error si el gasto no existe

**b) `edit-gasto-caja` (modificación de un gasto activo)**

```typescript
// Línea 68 del diff
ipcMain.handle('edit-gasto-caja', async (_event, gastoId: number, data: any) => {
  await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
  // ...
  if (entity.estado === 'ANULADO') {
    throw new Error('No se puede editar un gasto anulado. Creá uno nuevo si hace falta.');
  }
  // ...
});
```

**Verificación:**
- ✅ **Permiso requerido:** `FINANCIERO_CAJA_GESTIONAR`
- ✅ Bloquea edición de gastos anulados a nivel de handler
- ✅ Valida monto > 0 y descripción no vacía
- ✅ Auditoría: actualiza `updatedBy` y `updatedAt` vía `setEntityUserTracking`

#### 3.2.2 Handlers EXISTENTES (sin cambios en el PR)

**Comparación con `develop` (commit base):**

| Handler | Permiso en `develop` | Permiso en este PR | Cambió? |
|---------|---------------------|-------------------|---------|
| `create-gasto-caja` | `VENTAS_PDV` | `VENTAS_PDV` | ❌ No |
| `get-gastos-caja` | `['VENTAS_PDV', 'FINANCIERO_CAJA_VER']` | `['VENTAS_PDV', 'FINANCIERO_CAJA_VER']` | ❌ No |
| `anular-gasto-caja` | `VENTAS_PDV` | `VENTAS_PDV` | ❌ No |

**Verificación:**
- ✅ Los handlers existentes **NO se tocaron** en este PR
- ✅ **NO se aflojaron permisos** en ningún handler preexistente

---

### 3.3 Frontend — Botón Editar (✓ CORRECTAMENTE PROTEGIDO)

#### 3.3.1 Template HTML

**Archivo:** `src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.html` líneas 172-179

```html
<button
  *appHasPermission="'FINANCIERO_CAJA_GESTIONAR'"
  mat-icon-button
  class="tile-action-button"
  [disabled]="g.estado !== 'ACTIVO'"
  [matTooltip]="g.estado === 'ACTIVO' ? 'Editar gasto' : 'No se puede editar (gasto anulado)'"
  (click)="editarGasto(g)">
  <mat-icon>edit</mat-icon>
</button>
```

**Verificación:**
- ✅ **Directiva `*appHasPermission`:** El botón **NO se renderiza** si el usuario no tiene `FINANCIERO_CAJA_GESTIONAR`
- ✅ **Atributo `[disabled]`:** Deshabilitado si `estado !== 'ACTIVO'` (para gastos anulados)
- ✅ **Tooltip condicional:** Explica por qué está deshabilitado
- ✅ Un cajero con solo `VENTAS_PDV` **NO VE** el botón (se remueve del DOM por `*appHasPermission`)

#### 3.3.2 Componente TypeScript

**Archivo:** `src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.ts` líneas 98-116

```typescript
editarGasto(gasto: any): void {
  if (!this.permissionService.has('FINANCIERO_CAJA_GESTIONAR')) return;
  if (gasto.estado !== 'ACTIVO') return;

  const ref = this.dialog.open(CreateGastoCajaDialogComponent, {
    // ...
    data: { cajaId: this.data.cajaId, cajaNombre: '...', gastoId: gasto.id },
  });

  ref.afterClosed().subscribe(result => {
    if (result?.success) { this.ngOnInit(); } // Recarga resumen
  });
}
```

**Verificación:**
- ✅ **Primera línea:** Verifica permiso con `permissionService.has()` (guard programático)
- ✅ **Segunda línea:** Verifica `estado === 'ACTIVO'` (guard de estado)
- ✅ Pasa `gastoId` al diálogo, que llama a `getGastoCaja(gastoId)` (handler protegido)
- ✅ Recarga el resumen tras guardar (`ngOnInit()` llama a `getResumenCaja()`)

---

### 3.4 Diálogo de edición (✓ CORRECTO)

**Archivo:** `src/app/pages/ventas/pdv/gasto-caja-dialog/gasto-caja-dialog.component.ts`

**Flujo de edición:**

1. **Carga del gasto** (línea 122):
   ```typescript
   const gasto = await firstValueFrom(this.repositoryService.getGastoCaja(this.gastoId!));
   ```
   - Llama al método `getGastoCaja()` del `RepositoryService`
   - Este invoca el handler `get-gasto-caja` (protegido con `FINANCIERO_CAJA_GESTIONAR`)

2. **Guardado del gasto** (línea 158):
   ```typescript
   await firstValueFrom(this.repositoryService.editGastoCaja(this.gastoId, {
     descripcion: v.descripcion,
     monto: Number(v.monto),
     gastoCategoriaId: v.gastoCategoriaId || null,
   }));
   ```
   - Llama al método `editGastoCaja()` del `RepositoryService`
   - Este invoca el handler `edit-gasto-caja` (protegido con `FINANCIERO_CAJA_GESTIONAR`)

**Verificación:**
- ✅ No hay bypass de permisos: todo pasa por los handlers protegidos
- ✅ Deshabilita campos críticos en modo edición: `fecha`, `monedaId`, `formaPagoId`
- ✅ Solo permite editar: `monto`, `descripcion`, `gastoCategoriaId`

---

### 3.5 Capa IPC y Repository (✓ CORRECTOS)

#### 3.5.1 Preload.ts

```typescript
// Líneas 3177-3183 del diff
getGastoCaja: async (gastoId: number): Promise<any> => {
  return await ipcRenderer.invoke('get-gasto-caja', gastoId);
},
editGastoCaja: async (gastoId: number, data: any): Promise<any> => {
  return await ipcRenderer.invoke('edit-gasto-caja', gastoId, data);
},
```

**Verificación:**
- ✅ Los métodos expuestos en `window.api` invocan los canales IPC correctos
- ✅ No hay manipulación de permisos en esta capa (capa de transporte pura)

#### 3.5.2 RepositoryService

**Abstract service:**
```typescript
// src/app/database/repository.service.ts líneas 763-764
abstract getGastoCaja(gastoId: number): Observable<any>;
abstract editGastoCaja(gastoId: number, data: any): Observable<any>;
```

**Implementación IPC:**
```typescript
// src/app/database/repository-ipc.service.ts líneas 3340-3346
getGastoCaja(gastoId: number): Observable<any> {
  return from(this.api.getGastoCaja(gastoId));
}
editGastoCaja(gastoId: number, data: any): Observable<any> {
  return from(this.api.editGastoCaja(gastoId, data));
}
```

**Implementación HTTP (modo cliente):**
```typescript
// src/app/database/repository-http.service.ts líneas 1662-1668
getGastoCaja(gastoId: number): Observable<any> {
  return throwError(() => new Error(`RepositoryHttpService.getGastoCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
}
editGastoCaja(gastoId: number, data: any): Observable<any> {
  return throwError(() => new Error(`RepositoryHttpService.editGastoCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
}
```

**Verificación:**
- ✅ IPC: llama directamente a `window.api` (que invoca los handlers protegidos)
- ✅ HTTP: lanza error (no implementado); cuando se implemente, pasará por `/api/rpc` que re-invoca los mismos handlers con sus `ensurePermission`
- ✅ No hay bypass de permisos en ninguna de las dos implementaciones

---

## 4. Análisis de riesgos

### 4.1 Riesgo P0: ¿Se aflojaron permisos en `get-gasto-caja` o `edit-gasto-caja`? (❌ NO)

**Evidencia:**
- Ambos handlers **nuevos** tienen `ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR')`
- Los handlers **existentes** (`create-gasto-caja`, `get-gastos-caja`, `anular-gasto-caja`) **NO se modificaron**
- No se cambió `ensurePermission` en ningún archivo del PR

**Conclusión:** **PASS** — No se aflojaron permisos.

---

### 4.2 Riesgo P1: ¿Un cajero con solo `VENTAS_PDV` puede leer o editar un gasto por ID? (❌ NO)

**Evidencia:**

| Acción | Handler invocado | Permiso requerido | Cajero con `VENTAS_PDV` |
|--------|------------------|-------------------|------------------------|
| Leer gasto por ID | `get-gasto-caja` | `FINANCIERO_CAJA_GESTIONAR` | ❌ **Bloqueado** |
| Editar gasto por ID | `edit-gasto-caja` | `FINANCIERO_CAJA_GESTIONAR` | ❌ **Bloqueado** |
| Ver botón Editar | N/A (frontend) | `*appHasPermission="'FINANCIERO_CAJA_GESTIONAR'"` | ❌ **No se renderiza** |

**Prueba de concepto (hipotética):**

Si un cajero con solo `VENTAS_PDV` intenta:
```javascript
window.api.getGastoCaja(123)
```
**Respuesta esperada:**
```
Error: No tienes permiso para realizar esta operación (requiere FINANCIERO_CAJA_GESTIONAR)
```

**Conclusión:** **PASS** — El cajero NO puede leer ni editar gastos por ID.

---

### 4.3 Riesgo P2: ¿El botón Editar sigue protegido correctamente? (✅ SÍ)

**Capas de protección:**

| Capa | Mecanismo | Estado |
|------|-----------|--------|
| **Renderizado** | `*appHasPermission="'FINANCIERO_CAJA_GESTIONAR'"` | ✅ Protegido |
| **Habilitación** | `[disabled]="g.estado !== 'ACTIVO'"` | ✅ Protegido |
| **Evento click** | `if (!this.permissionService.has('FINANCIERO_CAJA_GESTIONAR')) return;` | ✅ Protegido |
| **Estado del gasto** | `if (gasto.estado !== 'ACTIVO') return;` | ✅ Protegido |
| **Handler GET** | `ensurePermission(..., 'FINANCIERO_CAJA_GESTIONAR')` | ✅ Protegido |
| **Handler EDIT** | `ensurePermission(..., 'FINANCIERO_CAJA_GESTIONAR')` | ✅ Protegido |

**Conclusión:** **PASS** — 6 capas de protección. El botón está correctamente protegido.

---

### 4.4 Observación P2: Vulnerabilidad preexistente (NO introducida por este PR)

**Handler:** `get-gastos-caja` (listar gastos de una caja)

**Permiso actual (en `develop` y en este PR):**
```typescript
await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'FINANCIERO_CAJA_VER']);
```

**Implicación:**
- Un cajero con solo `VENTAS_PDV` **PUEDE** listar todos los gastos de una caja (incluyendo IDs)
- Sin embargo, **NO PUEDE** leer un gasto individual por ID ni editarlo (requieren `FINANCIERO_CAJA_GESTIONAR`)
- Esta decisión de diseño **es preexistente** (presente antes del PR #290 y este fix)

**Justificación posible (inferida):**
- Los cajeros necesitan **ver** los gastos en el resumen de caja para validar el esperado al cerrar
- Pero **no deben editar** gastos (eso requiere permisos de gerente/admin)

**Riesgo residual:**
- **Bajo:** El cajero puede ver montos/descripciones de gastos en el resumen, pero esto es funcional (el resumen es visible para el cajero)
- **Medio:** Si un cajero intenta llamar `window.api.getGastosCaja(otraCajaId)`, puede listar gastos de cajas ajenas
  - Mitigación: La UI del PdV solo pasa `cajaId` de la caja actual del usuario
  - Mitigación: El handler `create-gasto-caja` valida que la caja exista, pero no valida ownership (riesgo menor)

**Recomendación (fuera del alcance de este PR):**
- Considerar un permiso más granular: `VENTAS_PDV_CAJA_PROPIA` que solo permita listar gastos de la caja asignada al usuario
- O agregar un filtro `where: { caja: { id: cajaId, responsable: { id: userId } } }` en el handler `get-gastos-caja` para usuarios con solo `VENTAS_PDV`

**Conclusión:** **OBSERVACIÓN** — Vulnerabilidad preexistente, no introducida por este PR. Riesgo P2 (no crítico).

---

## 5. Verificación de test de regresión

**Archivo:** `scripts/test-resumen-caja-numeros.ts` líneas 129-130

```diff
+ ok(resumen.gastos?.length > 0, 'el resumen incluye gastos de la caja');
+ ok(resumen.gastos[0]?.estado === 'ACTIVO', 'cada gasto en el payload incluye estado ACTIVO', resumen.gastos[0]);
```

**Verificación:**
- ✅ Se agregó un assert de regresión para garantizar que `estado` está presente en el payload
- ✅ Si un cambio futuro omite el campo `estado`, el test fallará con un mensaje claro
- ✅ El test cubre el caso de uso principal (resumen con gastos activos)

**Limitación:**
- No cubre el caso de un gasto anulado (el test solo crea gastos activos)
- Recomendación: Agregar un test que anule un gasto y verifique que NO aparece en `resumen.gastos` (fuera del alcance de este PR)

---

## 6. Tabla de permisos (resumen)

| Operación | Handler | Canal IPC | Permiso requerido | Cajero `VENTAS_PDV` | Admin `FINANCIERO_CAJA_GESTIONAR` |
|-----------|---------|-----------|-------------------|---------------------|----------------------------------|
| Crear gasto | `create-gasto-caja` | `create-gasto-caja` | `VENTAS_PDV` | ✅ Permitido | ✅ Permitido |
| Listar gastos de una caja | `get-gastos-caja` | `get-gastos-caja` | `['VENTAS_PDV', 'FINANCIERO_CAJA_VER']` | ✅ Permitido | ✅ Permitido |
| Leer gasto por ID | **`get-gasto-caja`** | **`get-gasto-caja`** | **`FINANCIERO_CAJA_GESTIONAR`** | ❌ **Bloqueado** | ✅ Permitido |
| Editar gasto por ID | **`edit-gasto-caja`** | **`edit-gasto-caja`** | **`FINANCIERO_CAJA_GESTIONAR`** | ❌ **Bloqueado** | ✅ Permitido |
| Anular gasto | `anular-gasto-caja` | `anular-gasto-caja` | `VENTAS_PDV` | ✅ Permitido | ✅ Permitido |

**Los handlers en negrita son nuevos en este PR.**

---

## 7. Reporte final

### Estado: **PASS** ✅

**Resumen:**

| Criterio | Estado | Detalle |
|----------|--------|---------|
| El fix solo agrega `estado` al payload | ✅ PASS | Cambio quirúrgico en línea 178 de `resumen-caja.utils.ts` |
| No se aflojó `ensurePermission` en `get-gasto-caja` | ✅ PASS | Handler nuevo con `FINANCIERO_CAJA_GESTIONAR` |
| No se aflojó `ensurePermission` en `edit-gasto-caja` | ✅ PASS | Handler nuevo con `FINANCIERO_CAJA_GESTIONAR` |
| Cajero con solo `VENTAS_PDV` NO puede leer gasto por ID | ✅ PASS | Handler `get-gasto-caja` requiere `FINANCIERO_CAJA_GESTIONAR` |
| Cajero con solo `VENTAS_PDV` NO puede editar gasto por ID | ✅ PASS | Handler `edit-gasto-caja` requiere `FINANCIERO_CAJA_GESTIONAR` |
| Botón Editar detrás de `*appHasPermission` | ✅ PASS | Línea 172 del template (directiva correcta) |
| Botón Editar `disabled` si `estado !== 'ACTIVO'` | ✅ PASS | Línea 175 del template (binding correcto) |
| Test de regresión agregado | ✅ PASS | Assert en `test-resumen-caja-numeros.ts` |

**Observación P2:**
- Existe una vulnerabilidad **preexistente** (no introducida por este PR): un cajero con `VENTAS_PDV` puede listar gastos de cualquier caja vía `get-gastos-caja`
- Riesgo: **P2** (bajo-medio, no crítico)
- Justificación: Funcional para el resumen de caja visible al cajero; la UI solo pasa la caja actual
- Recomendación: Considerar validación de ownership en `get-gastos-caja` en un PR futuro

---

### Prioridad de riesgos

| Riesgo | Prioridad | Estado | Acción requerida |
|--------|-----------|--------|------------------|
| Permisos aflojados en `get-gasto-caja` | P0 | ✅ PASS | Ninguna |
| Permisos aflojados en `edit-gasto-caja` | P0 | ✅ PASS | Ninguna |
| Cajero puede leer/editar gasto por ID | P0 | ✅ PASS | Ninguna |
| Botón Editar sin protección | P1 | ✅ PASS | Ninguna |
| `get-gastos-caja` permite listar gastos de otras cajas | P2 | ⚠️ OBSERVACIÓN | Opcional: validar ownership en futuro PR |

---

## 8. Conclusión

**El fix es seguro y NO introduce regresiones de permisos.**

- Los handlers nuevos (`get-gasto-caja`, `edit-gasto-caja`) están correctamente protegidos con `FINANCIERO_CAJA_GESTIONAR`
- Los handlers existentes NO se modificaron (no se aflojaron permisos)
- El botón Editar tiene 6 capas de protección (frontend + backend)
- El test de regresión garantiza que el campo `estado` no se omitirá en el futuro
- La única observación (P2) es una vulnerabilidad preexistente de bajo riesgo, fuera del alcance de este PR

**Aprobación:** ✅ **PASS** — El PR puede continuar con el flujo de review/merge.

---

**Auditor:** Cloud Agent Sonnet 4.5  
**Fecha:** 2026-09-08 19:23 UTC  
**Rama auditada:** `cursor/gasto-caja-estado-resumen-cd00` @ commit HEAD  
**Base:** `develop`
