# AUDITORÍA DE PERMISOS: PR #290 (gastos-moneda-editar-143b)

**Rama:** `cursor/gastos-moneda-editar-143b`  
**HEAD:** `d86ea2be`  
**Base:** `origin/develop`  
**Fecha:** 2026-09-08  
**Auditor:** Claude (Bot de auditoría)  
**Eje:** Permisos y seguridad de acceso

---

## Resumen Ejecutivo

**HALLAZGOS CRÍTICOS (P0):** 1  
**HALLAZGOS ALTOS (P1):** 1  
**OBSERVACIONES:** 3

El PR implementa la edición de gastos de caja con protección de permisos **parcialmente correcta**. El handler de **edición** (`edit-gasto-caja`) está bien protegido, pero el handler de **lectura** (`get-gasto-caja`) tiene un **problema P0** que permite a un cajero leer gastos arbitrarios por ID sin restricción de caja.

---

## 1. Archivos Auditados

```
electron/handlers/gastos-caja.handler.ts      ← Handlers nuevos con ensurePermission
preload.ts                                     ← Nuevos canales IPC
src/app/database/repository.service.ts         ← Abstract methods
src/app/database/repository-ipc.service.ts     ← Implementación IPC
src/app/database/repository-http.service.ts    ← Stubs HTTP (sin implementar)
src/app/shared/components/resumen-caja-dialog/ ← UI con *appHasPermission
src/app/pages/ventas/pdv/gasto-caja-dialog/    ← Diálogo de edición
```

---

## 2. Hallazgos Críticos (P0)

### P0-1: `get-gasto-caja` acepta `VENTAS_PDV` — fuga de datos

**Archivo:** `electron/handlers/gastos-caja.handler.ts:103`

```typescript
ipcMain.handle('get-gasto-caja', async (_event, gastoId: number) => {
  await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'FINANCIERO_CAJA_VER']);
  const repo = dataSource.getRepository(GastoCaja);
  const entity = await repo.findOne({
    where: { id: gastoId },
    relations: ['gastoCategoria', 'moneda', 'formaPago', 'caja'],
  });
  if (!entity) throw new Error(`Gasto de caja ${gastoId} no encontrado`);
  return entity;
});
```

**Problema:**

- El handler acepta **`VENTAS_PDV`** como permiso válido
- `VENTAS_PDV` es el permiso **básico del cajero** (lo tiene TODO el personal de ventas)
- El handler NO valida que el gasto pertenezca a la caja del usuario actual
- Un cajero puede leer **CUALQUIER gasto por ID**, de **cualquier caja**, de **cualquier turno**
- Aunque el frontend solo muestre gastos de la caja actual, `/api/rpc` es **default-allow**: un cliente con JWT válido puede invocar `get-gasto-caja(X)` con cualquier ID

**Contexto de la implementación:**

El handler `get-gasto-caja` se usa para **cargar el gasto en el diálogo de edición**. Ese diálogo se abre desde dos lugares:

1. **Resumen de caja** (componente `resumen-caja-dialog.component.ts`):
   - El botón "Editar" está protegido con `*appHasPermission="'FINANCIERO_CAJA_GESTIONAR'"`
   - Solo gerentes/admins ven el botón
   - Correcto para este flujo

2. **Potenciales llamadas directas** (no implementadas aún pero posibles):
   - Un cajero con `VENTAS_PDV` podría llamar directamente al handler
   - Aunque no tenga el botón en la UI, puede invocar el canal IPC
   - En modo `client`, puede llamar a `/api/rpc` con `{"method": "get-gasto-caja", "params": [X]}`

**Impacto:**

- **Confidencialidad:** Un cajero puede enumerar IDs y leer todos los gastos registrados (descripciones, montos, fechas, categorías)
- **Contexto de negocio:** Los gastos pueden contener información sensible (salarios, proveedores, montos estratégicos)
- **Superficie de ataque:** 100% de usuarios con `VENTAS_PDV` (todos los cajeros)

**Recomendación P0:**

```typescript
// Opción A: Permiso más restrictivo (solo lectura financiera)
await ensurePermission(dataSource, getCurrentUser, ['FINANCIERO_CAJA_VER', 'FINANCIERO_CAJA_GESTIONAR']);

// Opción B: Permiso + validación de caja del usuario (más complejo)
await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'FINANCIERO_CAJA_VER']);
const cajaUsuario = await obtenerCajaActualDelUsuario(dataSource, getCurrentUser);
if (entity.caja.id !== cajaUsuario?.id && !tienePermiso('FINANCIERO_CAJA_VER')) {
  throw new Error('No tenés permiso para ver gastos de otras cajas');
}
```

**Recomendación final:** **Opción A** (más simple y segura). Si un cajero necesita ver el detalle de un gasto, lo verá en la lista `get-gastos-caja` (que SÍ filtra por caja). No hay caso de uso legítimo para que un cajero lea un gasto por ID sin saber su caja.

---

## 3. Hallazgos Altos (P1)

### P1-1: `repository-http.service.ts` expone métodos sin implementación

**Archivo:** `src/app/database/repository-http.service.ts`

```typescript
getGastoCaja(gastoId: number): Observable<any> {
  return throwError(() => new Error(`RepositoryHttpService.getGastoCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
}
editGastoCaja(gastoId: number, data: any): Observable<any> {
  return throwError(() => new Error(`RepositoryHttpService.editGastoCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
}
```

**Problema:**

- En modo `client`, estos métodos lanzan error porque no están implementados
- Cuando se implemente la versión HTTP real (probablemente como `callIpc` genérico), el único gate será el del **handler backend**
- Si el frontend llama a estos métodos sin verificar permisos localmente, un usuario malicioso podría modificar el código del cliente y llamar directamente al endpoint

**Contexto:**

- El componente `resumen-caja-dialog` SÍ verifica `permissionService.has('FINANCIERO_CAJA_GESTIONAR')` antes de abrir el diálogo
- El componente `gasto-caja-dialog` NO verifica permisos (delega al backend)
- Esto es **correcto** en el diseño actual: el frontend es una guía, el backend es el gate real

**Impacto:**

- **Medio:** El handler `edit-gasto-caja` SÍ tiene `ensurePermission` correcto, así que el riesgo es bajo
- **Pero:** El handler `get-gasto-caja` tiene el problema P0-1, que se amplifica en modo HTTP

**Recomendación P1:**

1. Corregir P0-1 primero (el permiso de `get-gasto-caja`)
2. Cuando se implemente la versión HTTP, verificar que:
   - El componente `gasto-caja-dialog` NO se pueda abrir sin `FINANCIERO_CAJA_GESTIONAR`
   - O agregar validación explícita en `ngOnInit` del componente

**Código sugerido para el componente:**

```typescript
ngOnInit(): void {
  // Validación temprana en modo edición
  if (this.isEditing && !this.permissionService.has('FINANCIERO_CAJA_GESTIONAR')) {
    this.snackBar.open('No tenés permiso para editar gastos', 'Cerrar', { duration: 3000 });
    this.dialogRef?.close();
    return;
  }
  // ... resto del código
}
```

---

## 4. Observaciones (Correctas ✅)

### OBS-1: `edit-gasto-caja` tiene `ensurePermission` correcto ✅

**Archivo:** `electron/handlers/gastos-caja.handler.ts:68`

```typescript
ipcMain.handle('edit-gasto-caja', async (_event, gastoId: number, data: any) => {
  await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
  // ...
});
```

✅ **Correcto:**
- `ensurePermission` es la **primera sentencia** del handler
- Usa `FINANCIERO_CAJA_GESTIONAR` (permiso restrictivo, solo gerentes/admins)
- No acepta `VENTAS_PDV`

### OBS-2: UI usa `*appHasPermission` correctamente ✅

**Archivo:** `src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.html`

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

✅ **Correcto:**
- El botón está oculto para usuarios sin `FINANCIERO_CAJA_GESTIONAR`
- Está deshabilitado si el gasto está ANULADO
- El método `editarGasto` verifica `permissionService.has('FINANCIERO_CAJA_GESTIONAR')` antes de abrir el diálogo

### OBS-3: Nuevos canales IPC NO están en `BLOCKED_CHANNELS` ✅

**Archivo:** `electron/server/rpc-router.ts`

✅ **Correcto:**
- `get-gasto-caja` y `edit-gasto-caja` NO están en la lista de canales bloqueados
- Esto es **correcto**: deben estar accesibles por `/api/rpc`
- El gate de seguridad es el `ensurePermission` del handler, no la deny-list
- La deny-list solo bloquea canales de infraestructura (reiniciar app, backups, secretos, etc.)

---

## 5. Análisis de Superficie de Ataque

### Modo `standalone` (SQLite local):
- **Riesgo P0-1:** MEDIO
- Un cajero malintencionado podría invocar `window.api.getGastoCaja(X)` desde DevTools
- Requiere acceso físico a la terminal y conocer IDs de gastos
- Impacto limitado a la sesión local

### Modo `server` (Fastify + `/api/rpc`):
- **Riesgo P0-1:** ALTO
- Cualquier cliente autenticado (PWA mobile, otro nodo en modo `client`) puede invocar:
  ```json
  POST /api/rpc
  { "method": "get-gasto-caja", "params": [123] }
  ```
- El JWT solo requiere `VENTAS_PDV` (permiso básico)
- Un cajero puede enumerar IDs y leer todos los gastos sin restricción

### Modo `client` (proxy HTTP):
- **Riesgo P0-1:** ALTO
- Mismo riesgo que `server`
- El cliente en modo HTTP NO implementa validación local (stubs con `throwError`)
- Cuando se implemente, dependerá 100% del gate del handler

---

## 6. Comparación con Handlers Existentes

### Handler `create-gasto-caja` (línea 19):
```typescript
await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
```
✅ **Correcto:** Los cajeros deben poder crear gastos en su propia caja

### Handler `anular-gasto-caja` (línea 56):
```typescript
await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
```
✅ **Correcto:** Los cajeros deben poder anular gastos que crearon

### Handler `get-gastos-caja` (línea 43):
```typescript
await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'FINANCIERO_CAJA_VER']);
const where: any = { caja: { id: cajaId } };
```
✅ **Correcto:** 
- Acepta `VENTAS_PDV` PERO filtra por `cajaId` (parámetro del usuario)
- Un cajero solo puede listar gastos de la caja que él especifica
- Para ver gastos de otras cajas, necesita `FINANCIERO_CAJA_VER`

### Handler `get-gasto-caja` (NUEVO, línea 103):
```typescript
await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'FINANCIERO_CAJA_VER']);
const entity = await repo.findOne({ where: { id: gastoId } });
```
❌ **INCORRECTO:**
- Acepta `VENTAS_PDV` pero NO filtra por caja
- Busca directamente por `gastoId` sin validar propiedad
- **Inconsistente** con el patrón de `get-gastos-caja`

---

## 7. Plan de Remediación

### Acción Inmediata (P0):

1. **Modificar `get-gasto-caja` para rechazar `VENTAS_PDV`:**

```typescript
// electron/handlers/gastos-caja.handler.ts:103
ipcMain.handle('get-gasto-caja', async (_event, gastoId: number) => {
  // Solo lectura financiera o gestión, NO acceso básico de cajero
  await ensurePermission(dataSource, getCurrentUser, ['FINANCIERO_CAJA_VER', 'FINANCIERO_CAJA_GESTIONAR']);
  const repo = dataSource.getRepository(GastoCaja);
  const entity = await repo.findOne({
    where: { id: gastoId },
    relations: ['gastoCategoria', 'moneda', 'formaPago', 'caja'],
  });
  if (!entity) throw new Error(`Gasto de caja ${gastoId} no encontrado`);
  return entity;
});
```

2. **Actualizar test (si existe) para verificar el rechazo:**

```typescript
it('debería rechazar get-gasto-caja con VENTAS_PDV', async () => {
  const usuario = { id: 1, roles: [{ permissions: ['VENTAS_PDV'] }] };
  await expect(handler('get-gasto-caja', 123)).rejects.toThrow('permiso');
});
```

### Acción Preventiva (P1):

3. **Agregar validación de permisos en el componente de edición:**

```typescript
// src/app/pages/ventas/pdv/gasto-caja-dialog/gasto-caja-dialog.component.ts
ngOnInit(): void {
  if (this.isEditing && !this.permissionService.has('FINANCIERO_CAJA_GESTIONAR')) {
    this.snackBar.open('No tenés permiso para editar gastos', 'Cerrar', { duration: 3000 });
    this.dialogRef?.close();
    return;
  }
  // ... resto del código
}
```

### Verificación:

4. **Probar manualmente:**
   - Loguear como cajero (solo `VENTAS_PDV`)
   - Intentar invocar `window.api.getGastoCaja(1)` desde DevTools
   - **Debe rechazar** con error de permiso

5. **Probar en modo `server`:**
   - Hacer POST a `/api/rpc` con JWT de cajero:
     ```bash
     curl -X POST http://localhost:7070/api/rpc \
       -H "Authorization: Bearer <token-cajero>" \
       -H "Content-Type: application/json" \
       -d '{"method":"get-gasto-caja","params":[1]}'
     ```
   - **Debe retornar 500** con mensaje de permiso denegado

---

## 8. Resumen de Permisos Involucrados

| Permiso | Otorgado a | Uso en este PR |
|---------|-----------|----------------|
| `VENTAS_PDV` | Cajeros (todos) | ❌ Acepta `get-gasto-caja` (P0) |
| `FINANCIERO_CAJA_VER` | Gerentes, Supervisores | ✅ Acepta `get-gasto-caja` (correcto) |
| `FINANCIERO_CAJA_GESTIONAR` | Gerentes, Admins | ✅ Requerido para `edit-gasto-caja` |

**Regla esperada:**
- **Crear/Anular gasto:** `VENTAS_PDV` (cajero en su propia caja)
- **Listar gastos de una caja:** `VENTAS_PDV` o `FINANCIERO_CAJA_VER`
- **Leer gasto por ID:** Solo `FINANCIERO_CAJA_VER` o `FINANCIERO_CAJA_GESTIONAR`
- **Editar gasto:** Solo `FINANCIERO_CAJA_GESTIONAR`

---

## 9. Checklist de Auditoría

- [x] Handlers nuevos tienen `ensurePermission` como primera sentencia
- [x] `edit-gasto-caja` usa permiso restrictivo (`FINANCIERO_CAJA_GESTIONAR`)
- [❌] `get-gasto-caja` usa permiso restrictivo (P0: acepta `VENTAS_PDV`)
- [x] Canales IPC nuevos registrados en `preload.ts`
- [x] Repository abstract declara los métodos
- [x] Repository IPC implementa los métodos
- [⚠️] Repository HTTP tiene stubs (P1: sin implementación)
- [x] UI usa `*appHasPermission` en botones sensibles
- [x] Componente verifica permisos antes de llamar al backend
- [x] Nuevos canales NO están en `BLOCKED_CHANNELS` (correcto)
- [❌] No hay fugas de datos sensibles (P0: `get-gasto-caja` fuga a cajeros)

---

## 10. Conclusión

El PR implementa correctamente el **handler de edición** (`edit-gasto-caja`) con protección de permisos adecuada. Sin embargo, el **handler de lectura** (`get-gasto-caja`) tiene un **problema P0 crítico** que permite a cualquier cajero leer gastos arbitrarios sin restricción de caja.

**Recomendación:** **Bloquear el merge** hasta corregir P0-1. El fix es trivial (cambiar el array de permisos en una línea) pero el impacto de seguridad es alto.

**Riesgo si se mergea sin corregir:**
- Fuga de información financiera sensible a personal no autorizado
- Enumeración de gastos de todas las cajas (presente y pasado)
- Pérdida de confidencialidad de salarios, proveedores y estrategia de costos

---

**Fin de la auditoría**  
**Estado:** ❌ **NO APROBAR** hasta corregir P0-1  
**Próximo paso:** Implementar el fix recomendado en la sección 7 y re-auditar
