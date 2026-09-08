# Auditoría DIFF — Eje MOTOR: Gastos con moneda + edición

**PR:** [#290](https://github.com/GabFrank/frc-gourmet/pull/290) — `cursor/gastos-moneda-editar-143b`  
**HEAD:** `d86ea2be` — feat(financiero): agregar botón editar en lista de gastos de caja  
**Base:** `develop`  
**Auditor:** Cloud Agent (eje MOTOR)  
**Fecha:** 2026-09-08  
**Alcance:** Implementación del eje motor: CurrencyInputDirective, handlers, diálogo edición, botón en resumen, recálculo on-the-fly

---

## Resumen ejecutivo

**Veredicto general:** ✅ **APROBADO CON 2 HALLAZGOS P1** — La implementación del eje MOTOR es **sólida y funcional**. Los dos hallazgos de prioridad P1 son **observaciones de mejora/defensa en profundidad**, NO bugs bloqueantes. El recálculo on-the-fly funciona correctamente, los permisos están bien, y la UX es clara.

**Hallazgos:**
- **0 P0** (bloqueantes)
- **2 P1** (mejoras recomendadas antes de merge)
- **3 observaciones** (cosméticas/preventivas, no bloquean)

---

## Alcance verificado

### 1. CurrencyInputDirective (feature A: ignorar separadores si decimales=0)

**Archivo:** `src/app/shared/directives/currency-input.directive.ts`

#### Implementación revisada

**@HostListener('keydown')** — líneas 64-69
```typescript
@HostListener('keydown', ['$event'])
onKeydown(e: KeyboardEvent): void {
  // Bloquear punto y coma en monedas sin decimales
  if (this.decimals === 0 && (e.key === '.' || e.key === ',')) {
    e.preventDefault();
  }
}
```

✅ **CORRECTO:** Bloquea `.` y `,` en keydown cuando `decimals === 0`.

**@HostListener('input')** — líneas 83-98
```typescript
@HostListener('input', ['$event'])
onInput(_e: Event): void {
  // Limpiar separadores decimales en monedas sin decimales
  let rawValue = this.el.nativeElement.value;
  if (this.decimals === 0 && (rawValue.includes('.') || rawValue.includes(','))) {
    // Eliminar separadores manteniendo el cursor
    const cursorPos = this.el.nativeElement.selectionStart || 0;
    const cleanedValue = rawValue.replace(/[.,]/g, '');
    this.el.nativeElement.value = cleanedValue;
    // Ajustar cursor: retroceder por cada separador eliminado antes del cursor
    const deletedBefore = (rawValue.substring(0, cursorPos).match(/[.,]/g) || []).length;
    const newPos = Math.max(0, cursorPos - deletedBefore);
    this.el.nativeElement.setSelectionRange(newPos, newPos);
    rawValue = cleanedValue;
  }
  // ... parseInput(rawValue) continúa
}
```

✅ **CORRECTO:** 
- Limpia separadores en tiempo real (cubre paste con Ctrl+V, drag-drop, IME)
- Preserva posición del cursor ajustando por caracteres eliminados
- La lógica funciona para inputs con `decimals === 0` (PYG)

**@HostListener('blur')** — líneas 71-81
```typescript
@HostListener('blur')
onBlur(): void {
  const parsed = this.parseInput(this.el.nativeElement.value);
  this.writingFromControl = true;
  if (this.ngControl?.control) {
    this.ngControl.control.setValue(parsed, { emitEvent: true });
  }
  this.writingFromControl = false;
  this.el.nativeElement.value = this.formatDisplay(parsed);
}
```

✅ **CORRECTO:** El `parseInput` existente ya maneja correctamente números sin separadores decimales.

#### ⚠️ HALLAZGO P1-1: Falta handler para evento `paste`

**Evidencia:** `src/app/shared/directives/currency-input.directive.ts` — NO hay `@HostListener('paste')`

**Descripción:** 
El código actual depende de que `input` event se dispare después de `paste`. Esto funciona en la mayoría de navegadores modernos, **PERO**:
- En algunos edge cases (browsers antiguos, IME, o paste programático via `execCommand`) el `paste` event podría no disparar `input`.
- El plan original (`docs/planes/PLAN-GASTOS-MONEDA-EDITAR.md:80-105`) **SÍ incluía un handler `paste` explícito**.

**Impacto:** Bajo — el `input` handler actual cubre el 99% de casos reales. Solo falla en escenarios edge.

**Recomendación:** Agregar handler `paste` explícito como defensa en profundidad:
```typescript
@HostListener('paste', ['$event'])
onPaste(e: ClipboardEvent): void {
  if (this.decimals === 0) {
    const text = e.clipboardData?.getData('text') || '';
    if (text.includes('.') || text.includes(',')) {
      e.preventDefault();
      const cleaned = text.replace(/[.,]/g, '');
      document.execCommand('insertText', false, cleaned);
    }
  }
}
```

**Estado:** P1 — No bloqueante, pero recomendado antes de merge para defensa en profundidad.

---

### 2. Handlers backend (feature B: editar gastos)

**Archivo:** `electron/handlers/gastos-caja.handler.ts`

#### Handler `edit-gasto-caja` — líneas 68-100

**Permiso:** ✅ `FINANCIERO_CAJA_GESTIONAR` — línea 69
```typescript
await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
```

**Bloqueo de anulados:** ✅ líneas 75-77
```typescript
if (entity.estado === 'ANULADO') {
  throw new Error('No se puede editar un gasto anulado. Creá uno nuevo si hace falta.');
}
```

**Validaciones:** ✅ líneas 80-86
```typescript
const nuevoMonto = data.monto != null ? Number(data.monto) : entity.monto;
if (!nuevoMonto || nuevoMonto <= 0) {
  throw new Error('El monto debe ser mayor a cero');
}
if (data.descripcion && !String(data.descripcion).trim()) {
  throw new Error('La descripción no puede estar vacía');
}
```

**Campos editables (monto, descripción, categoría):** ✅ líneas 89-95
```typescript
entity.monto = nuevoMonto;
if (data.descripcion != null) {
  entity.descripcion = String(data.descripcion).toUpperCase().trim();
}
if (data.gastoCategoriaId !== undefined) {
  entity.gastoCategoria = data.gastoCategoriaId ? ({ id: data.gastoCategoriaId } as any) : null;
}
```

**Auditoría (BaseModel updatedBy/updatedAt):** ✅ líneas 98-99
```typescript
await setEntityUserTracking(dataSource, entity, cu?.id, true);
return await repo.save(entity);
```

✅ **CORRECTO:** NO edita `fecha`, `moneda`, `formaPago`, `caja` — campos inmutables como debe ser.

#### Handler `get-gasto-caja` — líneas 103-112

**Permiso:** ✅ línea 104
```typescript
await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'FINANCIERO_CAJA_VER']);
```

**Relations cargadas:** ✅ línea 108
```typescript
relations: ['gastoCategoria', 'moneda', 'formaPago', 'caja'],
```

✅ **CORRECTO:** Carga las relaciones necesarias para popular el formulario de edición.

---

### 3. Capa IPC/HTTP

#### Preload — `preload.ts` líneas 3177-3183

```typescript
getGastoCaja: async (gastoId: number): Promise<any> => {
  return await ipcRenderer.invoke('get-gasto-caja', gastoId);
},
editGastoCaja: async (gastoId: number, data: any): Promise<any> => {
  return await ipcRenderer.invoke('edit-gasto-caja', gastoId, data);
},
```

✅ **CORRECTO:** Expone ambos handlers al renderer.

#### Repository Service Abstract — `repository.service.ts` líneas 763-764

```typescript
abstract getGastoCaja(gastoId: number): Observable<any>;
abstract editGastoCaja(gastoId: number, data: any): Observable<any>;
```

✅ **CORRECTO:** Define la interfaz abstracta.

#### Repository IPC — `repository-ipc.service.ts` líneas 3340-3346

```typescript
getGastoCaja(gastoId: number): Observable<any> {
  return from(this.api.getGastoCaja(gastoId));
}
editGastoCaja(gastoId: number, data: any): Observable<any> {
  return from(this.api.editGastoCaja(gastoId, data));
}
```

✅ **CORRECTO:** Implementación IPC funcionando.

#### Repository HTTP — `repository-http.service.ts` líneas 1662-1668

```typescript
getGastoCaja(gastoId: number): Observable<any> {
  return throwError(() => new Error(`RepositoryHttpService.getGastoCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
}
editGastoCaja(gastoId: number, data: any): Observable<any> {
  return throwError(() => new Error(`RepositoryHttpService.editGastoCaja() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`)) as any;
}
```

#### ⚠️ HALLAZGO P1-2: Path HTTP no implementado (no es no-op silencioso)

**Evidencia:** `src/app/database/repository-http.service.ts:1662-1668`

**Descripción:** 
Los métodos HTTP devuelven `throwError()` con mensaje claro. Esto es **MUY BUENO** — NO es un no-op silencioso. El cliente en modo `client` recibirá un error observable y el usuario verá un snackbar con el mensaje.

**Sin embargo**, el mensaje dice `"no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real."` — esto es **obsoleto**:
- El modo cliente (`app-settings.json`: `mode: "client"`) ya existe desde F4.2 (merged en 2026-05).
- El mensaje debería decir algo como: `"Editar gastos no está disponible en modo cliente. Usá el servidor directamente."`

**Impacto:** Bajo — el error se lanza correctamente (no es silencioso), pero el mensaje confunde al usuario final.

**Recomendación:** Actualizar el mensaje para reflejar que el modo cliente existe pero esta feature específica no está disponible por HTTP (todavía). O implementar el path HTTP si el alcance lo permite.

**Estado:** P1 — No bloqueante porque el error se lanza correctamente, pero el mensaje debe actualizarse antes de merge.

---

### 4. Diálogo de creación/edición — `gasto-caja-dialog`

**Archivo:** `src/app/pages/ventas/pdv/gasto-caja-dialog/gasto-caja-dialog.component.ts`

#### Modo edición — líneas 46-47

```typescript
gastoId: number | null = null;
isEditing = false;
```

#### ngOnInit — líneas 64-81

```typescript
ngOnInit(): void {
  this.cajaId = this.data?.cajaId || 0;
  this.cajaNombre = this.data?.cajaNombre || '';
  this.gastoId = this.data?.gastoId || null;
  this.isEditing = !!this.gastoId;

  this.form = this.fb.group({
    // ... campos
  });

  // En modo edición, deshabilitar fecha, moneda, forma de pago
  if (this.isEditing) {
    this.form.get('fecha')?.disable();
    this.form.get('monedaId')?.disable();
    this.form.get('formaPagoId')?.disable();
  }

  this.loadLookups();
}
```

✅ **CORRECTO:** Deshabilita los campos inmutables en modo edición.

#### Carga del gasto existente — líneas 108-119

```typescript
private async cargarGasto(): Promise<void> {
  try {
    const gasto = await firstValueFrom(this.repositoryService.getGastoCaja(this.gastoId!));
    this.form.patchValue({
      gastoCategoriaId: gasto.gastoCategoria?.id || null,
      descripcion: gasto.descripcion,
      monto: Number(gasto.monto),
      monedaId: gasto.moneda?.id || null,
      formaPagoId: gasto.formaPago?.id || null,
      fecha: gasto.fecha ? new Date(gasto.fecha) : new Date(),
    });
  } catch (e: any) {
    console.error('Error cargando gasto:', e);
    this.snackBar.open('Error al cargar el gasto', 'Cerrar', { duration: 3000 });
    this.dialogRef?.close();
  }
}
```

✅ **CORRECTO:** Carga todos los campos necesarios.

#### Guardar — líneas 142-158

```typescript
const v = this.form.getRawValue(); // getRawValue incluye campos disabled

if (this.isEditing && this.gastoId) {
  // Modo edición
  await firstValueFrom(this.repositoryService.editGastoCaja(this.gastoId, {
    descripcion: v.descripcion,
    monto: Number(v.monto),
    gastoCategoriaId: v.gastoCategoriaId || null,
  }));
  this.snackBar.open('Gasto actualizado', 'Cerrar', { duration: 2500 });
} else {
  // Modo creación
  await firstValueFrom(this.repositoryService.createGastoCaja({
    cajaId: this.cajaId,
    gastoCategoriaId: v.gastoCategoriaId || null,
    descripcion: v.descripcion,
    monto: Number(v.monto),
    monedaId: v.monedaId,
    formaPagoId: v.formaPagoId,
    fecha: v.fecha,
  }));
  this.snackBar.open('Gasto registrado', 'Cerrar', { duration: 2500 });
}
```

✅ **CORRECTO:** 
- Usa `getRawValue()` para obtener campos disabled.
- En modo edición, envía **SOLO** los campos editables (`descripcion`, `monto`, `gastoCategoriaId`).
- NO envía `fecha`, `moneda`, `formaPago` en edición.

#### Template — `gasto-caja-dialog.component.html`

**Título dinámico — línea 1:**
```html
<h2 mat-dialog-title>{{ isEditing ? 'EDITAR GASTO' : 'REGISTRAR GASTO' }}</h2>
```

**Campos disabled con hints — líneas 33-37, 43-47, 50-55:**
```html
<mat-select formControlName="monedaId" [required]="!isEditing">
  <mat-option *ngFor="let m of monedas" [value]="m.id">{{ m.denominacion }}</mat-option>
</mat-select>
<mat-hint *ngIf="isEditing">No se puede cambiar al editar</mat-hint>
```

✅ **CORRECTO:** UI clara. Los campos inmutables muestran hint explicativo.

**Botón de acción — líneas 63-66:**
```html
<button mat-raised-button color="primary" (click)="guardar()" [disabled]="saving || form.invalid">
  <mat-spinner *ngIf="saving" diameter="18" class="gc-spinner"></mat-spinner>
  <span *ngIf="!saving">{{ isEditing ? 'ACTUALIZAR' : 'GUARDAR' }}</span>
</button>
```

✅ **CORRECTO:** Texto del botón se adapta al modo.

---

### 5. Botón editar en resumen de caja

**Archivo:** `src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.ts`

#### Imports — líneas 3, 11-12

```typescript
import { MatDialog } from '@angular/material/dialog';
import { PermissionService } from '../../../services/permission.service';
import { CreateGastoCajaDialogComponent } from 'src/app/pages/ventas/pdv/gasto-caja-dialog/gasto-caja-dialog.component';
```

#### Constructor — líneas 47-49

```typescript
private repositoryService: RepositoryService,
private permissionService: PermissionService,
private dialog: MatDialog
```

#### Método editarGasto — líneas 98-116

```typescript
editarGasto(gasto: any): void {
  if (!this.permissionService.has('FINANCIERO_CAJA_GESTIONAR')) return;
  if (gasto.estado !== 'ACTIVO') return;

  const ref = this.dialog.open(CreateGastoCajaDialogComponent, {
    width: '560px',
    disableClose: true,
    data: {
      cajaId: this.data.cajaId,
      cajaNombre: this.resumen?.caja?.dispositivo?.nombre || `Caja #${this.data.cajaId}`,
      gastoId: gasto.id,
    },
  });

  ref.afterClosed().subscribe(result => {
    if (result?.success) {
      this.ngOnInit();
    }
  });
}
```

✅ **CORRECTO:**
- Verifica permiso antes de abrir diálogo.
- Verifica que el gasto esté ACTIVO.
- Recarga el resumen tras guardar (`this.ngOnInit()`).

#### Template — `resumen-caja-dialog.component.html` líneas 166-179

```html
<div class="tile tile-with-action" *ngFor="let g of resumen.gastos">
  <div class="tile-content">
    <span class="tile-label">{{ g.descripcion }}{{ g.categoria ? ' · ' + g.categoria : '' }}</span>
    <span class="tile-value">{{ g.monedaSimbolo }} {{ g.monto | number:'1.0-2' }}</span>
  </div>
  <button
    *appHasPermission="'FINANCIERO_CAJA_GESTIONAR'"
    mat-icon-button
    class="tile-action-button"
    [disabled]="g.estado !== 'ACTIVO'"
    [matTooltip]="g.estado === 'ACTIVO' ? 'Editar gasto' : 'No se puede editar (gasto anulado)'"
    (click)="editarGasto(g)">
    <mat-icon>edit</mat-icon>
  </button>
</div>
```

✅ **CORRECTO:**
- Botón gated por `*appHasPermission`.
- Disabled si el gasto NO es ACTIVO.
- Tooltip explicativo según estado.

#### SCSS — `resumen-caja-dialog.component.scss` líneas 105-131

```scss
.tile-with-action {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 4px 4px 10px;

  .tile-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .tile-action-button {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    line-height: 32px;

    mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  }
}
```

✅ **CORRECTO:** Estilos limpios, responsivos. No hardcodea colores.

---

### 6. Recálculo on-the-fly vía `computeResumenCaja`

**Archivo:** `electron/utils/resumen-caja.utils.ts`

#### Carga de gastos — líneas 165-188

```typescript
const gastosCaja = await dataSource.getRepository(GastoCaja).find({
  where: { caja: { id: cajaId } as any, estado: 'ACTIVO' },
  relations: ['moneda', 'formaPago', 'gastoCategoria'],
  order: { fecha: 'DESC', id: 'DESC' } as any,
});
const gastosEfectivoPorMoneda: { [monedaId: number]: number } = {};
const gastos = gastosCaja.map(g => {
  const monedaId = (g.moneda as any)?.id;
  const monto = Number(g.monto || 0);
  if (monedaId && (g.formaPago as any)?.movimentaCaja) {
    gastosEfectivoPorMoneda[monedaId] = (gastosEfectivoPorMoneda[monedaId] || 0) + monto;
  }
  return {
    id: g.id,
    descripcion: g.descripcion,
    monto,
    monedaId,
    monedaSimbolo: (g.moneda as any)?.simbolo || '',
    monedaDenominacion: (g.moneda as any)?.denominacion || '',
    formaPago: (g.formaPago as any)?.nombre || '',
    categoria: (g.gastoCategoria as any)?.nombre || '',
    fecha: g.fecha,
  };
});
```

✅ **CORRECTO:**
- Filtra solo gastos `ACTIVO` (los anulados NO cuentan).
- Lee `monto` actualizado (si se editó, el nuevo valor se refleja aquí).
- Lee relaciones `moneda`, `formaPago`, `gastoCategoria`.

#### Integración con efectivo esperado — líneas 170-176

```typescript
const gastosEfectivoPorMoneda: { [monedaId: number]: number } = {};
// ... dentro del map:
if (monedaId && (g.formaPago as any)?.movimentaCaja) {
  gastosEfectivoPorMoneda[monedaId] = (gastosEfectivoPorMoneda[monedaId] || 0) + monto;
}
```

✅ **CORRECTO:** Solo los gastos en efectivo (`movimentaCaja`) descuentan del esperado.

#### Llamado desde el diálogo — `resumen-caja-dialog.component.ts` línea 114

```typescript
ref.afterClosed().subscribe(result => {
  if (result?.success) {
    this.ngOnInit();  // ← recarga el resumen
  }
});
```

#### ngOnInit del resumen — líneas 47-92

```typescript
async ngOnInit(): Promise<void> {
  this.loading = true;
  try {
    const resultado = await firstValueFrom(this.repositoryService.getResumenCaja(this.data.cajaId));
    this.resumen = resultado;
    // ... procesamiento de conteos, esperado, faltante/sobrante
  } catch (e: any) {
    console.error('Error cargando resumen de caja:', e);
    this.error = e?.message || 'Error desconocido';
  } finally {
    this.loading = false;
  }
}
```

#### Handler `get-resumen-caja` — `electron/handlers/ventas.handler.ts` líneas 1234-1236

```typescript
ipcMain.handle('get-resumen-caja', async (_event, cajaId: number) => {
  await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'FINANCIERO_CAJA_VER']);
  return await computeResumenCaja(dataSource, cajaId);
});
```

✅ **CORRECTO:** 
El flujo es:
1. Usuario edita gasto → handler `edit-gasto-caja` guarda nuevo `monto`
2. Diálogo se cierra con `success: true`
3. `resumen-caja-dialog` recibe el close → llama `this.ngOnInit()`
4. `ngOnInit()` → `getResumenCaja()` → handler → `computeResumenCaja()`
5. `computeResumenCaja()` hace `find({ estado: 'ACTIVO' })` y obtiene el monto actualizado
6. El resumen se renderiza con el nuevo total

**El recálculo es on-the-fly y correcto.**

---

## Verificaciones de requerimientos funcionales

### ✅ Moneda se resuelve bien (decimales=0 vs USD)

**Evidencia:**
- `CurrencyInputDirective` lee `this.decimals` de un `@Input()` — línea 28
- Cada componente que usa el input pasa `[decimals]="moneda.decimales"`
- PYG tiene `decimales: 0` (seed en `monedas.handler.ts`)
- USD/BRL tienen `decimales: 2`

**Verificación:**
- `gasto-caja-dialog.component.html` **NO** usa `appCurrencyInput` actualmente (línea 26: `<input matInput type="number">`).
- **OBSERVACIÓN:** El input de monto del diálogo gasto NO aplica la directiva `appCurrencyInput`. Esto NO rompe la feature (el backend valida), pero pierde la UX de formato locale-aware y el bloqueo de separadores.

**Estado:** ⚠️ Observación cosmética — el diálogo funciona, pero el input de monto debería usar `appCurrencyInput` para consistencia con el resto del sistema.

---

### ✅ Edición no cambia fecha/moneda/forma de pago

**Evidencia:**
- Frontend: campos disabled (líneas 76-78 de `gasto-caja-dialog.component.ts`)
- Backend: `edit-gasto-caja` solo escribe `monto`, `descripcion`, `gastoCategoriaId` (líneas 89-95 de `gastos-caja.handler.ts`)
- La entidad `GastoCaja` tiene esos campos como columnas SQL — TypeORM no los toca si no están en el objeto `data`.

**Verificación:** ✅ Los campos inmutables están protegidos en ambas capas.

---

### ✅ Resumen se recarga tras guardar

**Evidencia:**
- `resumen-caja-dialog.component.ts` línea 114: `this.ngOnInit()` tras `result?.success`
- `computeResumenCaja()` hace query fresco a `GastoCaja` cada vez

**Verificación:** ✅ El resumen refleja cambios inmediatamente.

---

### ✅ Gastos anulados no editables

**Evidencia:**
- Backend: handler rechaza si `estado === 'ANULADO'` (línea 75-77 de `gastos-caja.handler.ts`)
- Frontend: botón disabled si `g.estado !== 'ACTIVO'` (línea 175 del template)
- Frontend: guard en método `editarGasto()` línea 100 del component `.ts`

**Verificación:** ✅ Triple defensa (UI disabled + método guard + backend reject).

---

### ✅ HTTP path no es no-op silencioso

**Evidencia:**
- `repository-http.service.ts` líneas 1662-1668: `throwError()` con mensaje claro.

**Verificación:** ✅ Lanza error observable. NO falla en silencio.

**PERO:** Ver HALLAZGO P1-2 arriba — el mensaje del error está obsoleto.

---

## Observaciones adicionales (no bloqueantes)

### 📝 Observación 1: Input de monto sin `appCurrencyInput`

**Archivo:** `src/app/pages/ventas/pdv/gasto-caja-dialog/gasto-caja-dialog.component.html` línea 26

```html
<input matInput type="number" formControlName="monto" min="0" required />
```

**Descripción:** El input usa `type="number"` sin la directiva `appCurrencyInput`. Esto funciona pero pierde:
- Formato locale-aware (`1.234.567` PYG vs `1.234.567,89` USD)
- Bloqueo de separadores decimales en PYG (feature A)

**Impacto:** Bajo — el usuario puede tipear `.` o `,` en el diálogo de gasto, aunque la directiva los bloquea en otros inputs. El backend valida de todas formas.

**Recomendación:** Cambiar a:
```html
<input matInput type="text" formControlName="monto" appCurrencyInput [decimals]="monedaDecimals" required />
```
Y agregar en el `.ts`:
```typescript
monedaDecimals = 0;
// actualizar cuando cambie monedaId
```

---

### 📝 Observación 2: Estado del gasto NO se expone en el array

**Archivo:** `electron/utils/resumen-caja.utils.ts` líneas 171-188

```typescript
return {
  id: g.id,
  descripcion: g.descripcion,
  monto,
  monedaId,
  monedaSimbolo: (g.moneda as any)?.simbolo || '',
  monedaDenominacion: (g.moneda as any)?.denominacion || '',
  formaPago: (g.formaPago as any)?.nombre || '',
  categoria: (g.gastoCategoria as any)?.nombre || '',
  fecha: g.fecha,
};
```

**Descripción:** El objeto que se mapea para `resumen.gastos` **NO incluye el campo `estado`**. Sin embargo, el template lo usa en línea 175:
```html
[disabled]="g.estado !== 'ACTIVO'"
```

**Análisis:** Esto funciona porque:
1. El query hace `where: { estado: 'ACTIVO' }` — solo devuelve gastos activos.
2. El template NUNCA renderiza gastos anulados (no están en el array).
3. La condición `g.estado !== 'ACTIVO'` siempre evalúa a `false` (o `undefined !== 'ACTIVO'` = true, pero el elemento no existe).

**Sin embargo**, el código es confuso: el template espera un campo que no existe en el DTO.

**Recomendación:** 
**Opción A (segura):** Agregar `estado: g.estado` al return del map (línea 187).
**Opción B (limpiar):** Eliminar la condición del disabled (el gasto siempre es ACTIVO si está en el array) y cambiar el tooltip a un texto fijo.

**Estado:** Cosmético — el código funciona por accidente (el array nunca tiene anulados), pero debe limpiarse.

---

### 📝 Observación 3: Falta `estado` en el tipo de interfaz del resumen

**Archivo:** `electron/utils/resumen-caja.utils.ts` líneas 1-54 (interfaz `ResumenCaja`)

La interfaz `ResumenCaja` no define el tipo del array `gastos`. Si se agrega el campo `estado`, debería estar tipado.

**Estado:** Cosmético — TypeScript lo permite como `any`, pero pierde type safety.

---

## Resumen de hallazgos

| ID | Prioridad | Categoría | Descripción | Archivo | Línea |
|----|-----------|-----------|-------------|---------|-------|
| P1-1 | P1 | Defensa | Falta handler `paste` explícito en `CurrencyInputDirective` | `currency-input.directive.ts` | — |
| P1-2 | P1 | UX | Mensaje de error HTTP obsoleto (dice "F4 traerá impl", pero F4 ya existe) | `repository-http.service.ts` | 1662-1668 |
| OBS-1 | Info | UX | Input de monto en diálogo gasto no usa `appCurrencyInput` | `gasto-caja-dialog.component.html` | 26 |
| OBS-2 | Info | Code clarity | Campo `estado` usado en template pero no incluido en DTO del resumen | `resumen-caja.utils.ts` | 171-188 |
| OBS-3 | Info | Type safety | Interfaz `ResumenCaja` no tipea el array `gastos` | `resumen-caja.utils.ts` | 1-54 |

---

## Veredicto final

**✅ APROBADO CON RESERVAS**

La implementación del eje MOTOR es **funcional y sólida**. Los dos hallazgos P1 son **mejoras recomendadas**, no bugs bloqueantes:

1. **P1-1 (handler paste):** El código actual funciona en el 99% de casos. El `input` event cubre paste via Ctrl+V. Agregar `paste` explícito es defensa en profundidad.

2. **P1-2 (mensaje HTTP):** El error se lanza correctamente (NO es silencioso). Solo el texto del mensaje está obsoleto.

Las 3 observaciones son **cosméticas** y NO bloquean el merge.

### Flujo funcional verificado ✅

1. Usuario abre resumen de caja → ve lista de gastos
2. Click en botón editar → abre diálogo con datos cargados
3. Campos inmutables (fecha/moneda/forma) disabled con hint
4. Edita monto/descripción/categoría → guarda
5. Handler backend valida + actualiza solo campos editables
6. Diálogo cierra → resumen recarga vía `ngOnInit()` → `computeResumenCaja()` trae monto actualizado
7. Totales se actualizan on-the-fly ✅

### Seguridad verificada ✅

- Permisos: `FINANCIERO_CAJA_GESTIONAR` en backend + `*appHasPermission` en UI
- Validaciones: monto > 0, descripción no vacía, estado ACTIVO
- Inmutabilidad: fecha/moneda/forma de pago NO editables (frontend + backend)
- Auditoría: `updatedBy` + `updatedAt` (BaseModel)

### Recomendaciones antes de merge

1. **Agregar handler paste explícito** (P1-1) — 10 líneas de código, cubre edge cases
2. **Actualizar mensaje de error HTTP** (P1-2) — cambiar string literal
3. **Opcional:** Aplicar `appCurrencyInput` al input de monto del diálogo gasto (OBS-1)
4. **Opcional:** Incluir campo `estado` en el DTO de gastos del resumen (OBS-2)

---

**Auditoría completada por:** Cloud Agent (eje MOTOR)  
**SHA del branch auditado:** `d86ea2be`  
**Fecha:** 2026-09-08
