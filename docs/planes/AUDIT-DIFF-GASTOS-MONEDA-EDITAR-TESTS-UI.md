# AUDITORÍA: DIFF PR #290 — Tests + UI

**Rama:** `cursor/gastos-moneda-editar-143b` (HEAD ~d86ea2be)  
**Fecha:** 2026-09-08  
**Alcance:** Tests (specs) + UI (resumen-caja-dialog, gasto-caja-dialog)

---

## 1. TESTS — Cobertura y Riesgo de CI

### 1.1. Búsqueda de specs

**Comando ejecutado:**
```bash
find . -name "*.spec.ts" -path "*/shared/directives/*" -o -name "*.spec.ts" -path "*gasto*"
```

**Resultado:**
- **CurrencyInputDirective**: ❌ **NO existe spec** (`currency-input.directive.spec.ts`)
- **edit-gasto-caja** (handler): ❌ **NO existe spec**
- **gasto-caja-dialog** (componente): ❌ **NO existe spec** (`gasto-caja-dialog.component.spec.ts`)

**Specs encontrados relacionados (mobile):**
- `projects/mobile/src/app/pages/financiero/caja-mayor/ops/gasto-form.payload.spec.ts`
- `projects/mobile/src/app/pages/financiero/gastos/gastos-list.spec.ts`

→ **Ninguno cubre el código nuevo del PR.**

---

### 1.2. Cambios en el código sin specs

#### a) `CurrencyInputDirective` (diff)

**Archivo:** `src/app/shared/directives/currency-input.directive.ts`

**Cambios:**
1. **`@HostListener('keydown')`** (líneas 64-70): bloquea `.` y `,` en monedas sin decimales
2. **`@HostListener('input')`** (líneas 85-98): limpia separadores decimales **en tiempo real** si `decimals === 0`, ajustando la posición del cursor

**Lógica crítica:**
- Eliminación de separadores con `replace(/[.,]/g, '')`
- Cálculo de nueva posición del cursor: `cursorPos - deletedBefore`
- Dos caminos de entrada: `keydown` (previene) + `input` (limpia si se coló, ej. paste)

**Riesgo:** Si falla el ajuste del cursor, el usuario pierde la posición al escribir. Si falla el limpiado, se guarda un valor con separadores que el backend no espera.

#### b) `edit-gasto-caja` (handler nuevo)

**Archivo:** `electron/handlers/gastos-caja.handler.ts` (líneas 68-100)

**Responsabilidades:**
1. `ensurePermission('FINANCIERO_CAJA_GESTIONAR')`
2. Validar que el gasto exista y NO esté `ANULADO`
3. Validar que `monto > 0` y `descripcion` no esté vacía
4. Actualizar campos editables: `monto`, `descripcion`, `gastoCategoria`
5. Auditoría: `setEntityUserTracking` (updatedBy/updatedAt)

**Invariantes NO verificados:**
- ¿Qué pasa si la caja ya está cerrada? (El plan menciona que solo se pueden editar gastos de cajas ACTIVAS, pero el handler NO valida `caja.estado`)
- ¿Se puede editar un gasto de otra caja? (El handler NO valida `cajaId`)

#### c) `get-gasto-caja` (handler nuevo)

**Archivo:** `electron/handlers/gastos-caja.handler.ts` (líneas 103-112)

**Responsabilidades:**
1. `ensurePermission(['VENTAS_PDV', 'FINANCIERO_CAJA_VER'])` — permite OR, no requiere ambos
2. Cargar el gasto con relaciones: `gastoCategoria`, `moneda`, `formaPago`, `caja`

**Sin validaciones de estado:** cualquier gasto (ACTIVO o ANULADO) se devuelve.

---

### 1.3. ¿Fallaría el cambio en CI sin specs?

**CI actual:** `.github/workflows/ci.yml`

**Jobs:**
1. **lint-and-build** (ubuntu + windows):
   - `tsc -p tsconfig.electron.json --noEmit` — typecheck Electron
   - `npm run lint` — continue-on-error: true (⚠️ **no bloquea**)
   - `npm run build:prod` — AOT Angular

2. **migrate-postgres** — valida schema, no ejecuta specs

3. **commitlint** — valida mensajes de commit

**Respuesta:** ❌ **NO fallaría** si:
- El código compila sin errores de TypeScript
- El build de producción (AOT) no encuentra errores en templates

**Gap de cobertura:**
- ✅ Errores de compilación: detectados
- ✅ Errores de AOT (ej. property no existe en template): detectados
- ❌ **Lógica del cursor** en `CurrencyInputDirective`: NO detectado
- ❌ **Invariantes de negocio** en handlers: NO detectado
- ❌ **Permisos mal configurados**: NO detectado (no hay test de permisos)

---

## 2. UI — Resumen de Caja + Gasto Dialog

### 2.1. `resumen-caja-dialog` (lista de gastos)

**Archivo:** `src/app/shared/components/resumen-caja-dialog/`

**Cambios:**

#### HTML (resumen-caja-dialog.component.html)
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

**Verificación de requisitos:**

| Requisito | Implementado | Observación |
|-----------|--------------|-------------|
| Botón Editar presente | ✅ | `<button mat-icon-button>` con icono `edit` |
| Permiso `FINANCIERO_CAJA_GESTIONAR` | ✅ | `*appHasPermission="'FINANCIERO_CAJA_GESTIONAR'"` |
| Disabled si NO ACTIVO | ✅ | `[disabled]="g.estado !== 'ACTIVO'"` |
| Tooltip descriptivo | ✅ | Diferencia entre ACTIVO y ANULADO |

#### SCSS (resumen-caja-dialog.component.scss)
```scss
.tile-with-action {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 4px 4px 10px;

  .tile-content { ... }
  
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

**Verificación:**
- ✅ Layout horizontal (row) con `space-between`
- ✅ Botón de tamaño fijo 32×32 px, no colapsa (flex-shrink: 0)
- ✅ Icono 18×18 px (proporcional)

#### TypeScript (resumen-caja-dialog.component.ts)

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

**Verificación:**
- ✅ Guard doble: `permissionService.has` + `estado !== 'ACTIVO'`
- ✅ Pasa `gastoId` al dialog (modo edición)
- ✅ Recarga el resumen si el diálogo cierra con éxito

**⚠️ Hallazgo:** El guard de `estado !== 'ACTIVO'` ya está en el template (`[disabled]`), pero el TS lo repite. Esto es **redundancia defensiva** (correcto), aunque podría omitirse si se confía en el template.

---

### 2.2. `gasto-caja-dialog` (formulario de edición)

**Archivo:** `src/app/pages/ventas/pdv/gasto-caja-dialog/`

#### HTML (gasto-caja-dialog.component.html)

**Título dinámico:**
```html
<h2 mat-dialog-title>{{ isEditing ? 'EDITAR GASTO' : 'REGISTRAR GASTO' }}</h2>
```
✅ Correcto

**Campo Moneda:**
```html
<mat-select formControlName="monedaId" [required]="!isEditing">
  <mat-option *ngFor="let m of monedas" [value]="m.id">{{ m.denominacion }}</mat-option>
</mat-select>
<mat-hint *ngIf="isEditing">No se puede cambiar al editar</mat-hint>
```
- ✅ **Hint visible** en modo edición
- ⚠️ **NO está deshabilitado** — solo el `required` cambia
- ❌ **HALLAZGO P1**: El campo se puede cambiar en la UI, aunque el backend NO lo persiste

**Campo Forma de Pago:**
```html
<mat-select formControlName="formaPagoId" [required]="!isEditing">
  <mat-option *ngFor="let f of formasPago" [value]="f.id">{{ f.nombre }}</mat-option>
</mat-select>
<mat-hint *ngIf="isEditing">No se puede cambiar al editar</mat-hint>
```
- ✅ Hint visible
- ❌ **HALLAZGO P1**: Mismo problema que moneda

**Campo Fecha:**
```html
<input matInput 
  [matDatepicker]="picker" 
  formControlName="fecha" 
  [required]="!isEditing" 
  [readonly]="isEditing" />
<mat-datepicker-toggle matIconSuffix [for]="picker" [disabled]="isEditing"></mat-datepicker-toggle>
<mat-datepicker #picker [disabled]="isEditing"></mat-datepicker>
<mat-hint *ngIf="isEditing">No se puede cambiar al editar</mat-hint>
```
- ✅ **`readonly`** en el input
- ✅ **`disabled`** en el datepicker-toggle y datepicker
- ✅ Hint visible
- ✅ **CORRECTO** — el campo está bloqueado de verdad

**Botón de acción:**
```html
<span *ngIf="!saving">{{ isEditing ? 'ACTUALIZAR' : 'GUARDAR' }}</span>
```
✅ Texto dinámico

---

#### TypeScript (gasto-caja-dialog.component.ts)

**Modo edición:**
```typescript
ngOnInit(): void {
  this.gastoId = this.data?.gastoId || null;
  this.isEditing = !!this.gastoId;

  this.form = this.fb.group({
    gastoCategoriaId: [null],
    descripcion: ['', Validators.required],
    monto: [0, Validators.required],
    monedaId: [null, Validators.required],
    formaPagoId: [null, Validators.required],
    fecha: [new Date(), Validators.required],
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

✅ **CORRECTO** — `disable()` se llama en el TS

**⚠️ HALLAZGO P0 — Race condition potencial:**
- `loadLookups()` llama a `cargarGasto()` si `isEditing`
- `cargarGasto()` hace `form.patchValue()` con valores del backend
- **Si el `patchValue()` llega ANTES del `disable()`**, los campos quedarían habilitados

**Análisis del código:**
```typescript
async loadLookups(): Promise<void> {
  try {
    // ... carga lookups
    if (this.isEditing && this.gastoId) {
      await this.cargarGasto();  // ← async
    } else {
      this.preseleccionar();
    }
  } catch (e) { ... }
}
```

**Orden real:**
1. `ngOnInit()` crea el form
2. `ngOnInit()` deshabilita campos **sincrónicamente**
3. `ngOnInit()` llama a `loadLookups()` — **no espera**
4. `loadLookups()` es async, pero NO se espera en `ngOnInit()`
5. `cargarGasto()` se ejecuta **después**, cuando la promesa se resuelve

**Conclusión:** ✅ **NO hay race condition** — el `disable()` es síncrono y se ejecuta ANTES del `await cargarGasto()`.

---

**Guardar:**
```typescript
async guardar(): Promise<void> {
  if (this.form.invalid) return;
  this.saving = true;
  try {
    const v = this.form.getRawValue(); // ← incluye campos disabled

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
    this.dialogRef?.close({ success: true });
  } catch (e: any) { ... }
}
```

✅ **CORRECTO:**
- Usa `getRawValue()` para leer campos disabled
- Solo envía campos editables al backend en modo edición: `descripcion`, `monto`, `gastoCategoriaId`
- NO envía `monedaId`, `formaPagoId`, `fecha` al editar

---

## 3. HALLAZGOS

### P0 (Bloqueantes)

Ninguno.

---

### P1 (Alta prioridad)

#### P1-1: Campos moneda/formaPago se ven editables pero no lo son

**Ubicación:** `gasto-caja-dialog.component.html`

**Problema:**
- Los campos `monedaId` y `formaPagoId` NO tienen `[disabled]="isEditing"` en el HTML
- Solo el TS llama a `.disable()` después de crear el form
- **Visualmente parecen editables** (dropdown funciona), pero el backend NO los persiste
- **UX confuso**: el usuario puede cambiar el valor, pero al guardar se ignora

**Comparación con Fecha:**
- La fecha SÍ tiene `[readonly]="isEditing"` en el HTML
- El datepicker SÍ tiene `[disabled]="isEditing"`
- **Fecha está correctamente bloqueada**

**Impacto:**
- **Usabilidad**: usuario pierde tiempo editando algo que no se guardará
- **Expectativa vs realidad**: el form dice "puedes cambiar esto" pero el backend dice "no"

**Solución recomendada:**
```html
<mat-select formControlName="monedaId" [required]="!isEditing" [disabled]="isEditing">
  ...
</mat-select>

<mat-select formControlName="formaPagoId" [required]="!isEditing" [disabled]="isEditing">
  ...
</mat-select>
```

**Gap mínimo:** Agregar `[disabled]="isEditing"` en ambos `<mat-select>`.

---

#### P1-2: Handler `edit-gasto-caja` NO valida estado de la caja

**Ubicación:** `electron/handlers/gastos-caja.handler.ts` (líneas 68-100)

**Problema:**
- El handler valida que `gasto.estado !== 'ANULADO'`
- **NO valida** que `gasto.caja.estado === 'ACTIVO'`
- El plan de auditoría A menciona: "solo gastos de cajas ACTIVAS pueden ser editados"
- **Inconsistencia:** la UI bloquea el botón si `gasto.estado !== 'ACTIVO'`, pero NO valida `caja.estado`

**Escenario:**
1. Admin abre el resumen de una caja CERRADA
2. Los gastos ACTIVOS muestran el botón Editar habilitado
3. Admin edita un gasto
4. El backend NO valida `caja.estado`, entonces **acepta la edición**

**Impacto:**
- **Integridad de datos**: un gasto de una caja cerrada puede ser modificado después del arqueo
- **Auditoría**: los totales del cierre no coinciden con los gastos actuales

**Solución recomendada:**
```typescript
const entity = await repo.findOne({
  where: { id: gastoId },
  relations: ['caja']
});
if (!entity) throw new Error(`Gasto de caja ${gastoId} no encontrado`);
if (entity.estado === 'ANULADO') {
  throw new Error('No se puede editar un gasto anulado. Creá uno nuevo si hace falta.');
}
if (entity.caja?.estado !== 'ACTIVO') {
  throw new Error('No se puede editar un gasto de una caja cerrada.');
}
```

**Gap mínimo:** Agregar validación `entity.caja?.estado === 'ACTIVO'` antes de permitir la edición.

---

### P2 (Media prioridad)

#### P2-1: Sin spec de `CurrencyInputDirective`

**Problema:**
- La directiva tiene lógica compleja de manejo de cursor (líneas 85-98)
- Cambio crítico: elimina separadores decimales **en tiempo real**
- **Sin spec**: si se rompe el cursor, nadie lo detecta hasta producción

**Impacto:**
- **UX**: cursor salta a posiciones incorrectas al escribir
- **Regresión silenciosa**: el CI no detecta bugs de cursor

**Gap mínimo:**
- Spec que verifique:
  1. `decimals=0` bloquea `.` y `,` en `keydown`
  2. `decimals=0` limpia `.` y `,` en `input` (paste)
  3. Posición del cursor se ajusta correctamente después del limpiado

---

#### P2-2: Sin spec de `edit-gasto-caja` handler

**Problema:**
- Handler nuevo sin cobertura de tests
- Valida permisos, estado, monto, descripción
- **Sin spec**: cambios futuros pueden romper validaciones

**Impacto:**
- **Regresión**: refactor puede quitar validaciones sin que el CI falle
- **Permisos**: cambio de permiso puede no detectarse

**Gap mínimo:**
- Spec que verifique:
  1. Requiere `FINANCIERO_CAJA_GESTIONAR`
  2. Rechaza gastos `ANULADO`
  3. Rechaza `monto <= 0`
  4. Rechaza `descripcion` vacía
  5. Actualiza `updatedBy` / `updatedAt`

---

#### P2-3: Sin spec de `gasto-caja-dialog.component`

**Problema:**
- Componente modificado sin spec
- Lógica de modo edición: campos disabled, carga de gasto existente

**Impacto:**
- **Regresión**: cambio en el form puede romper la carga de datos

**Gap mínimo:**
- Spec que verifique:
  1. Modo creación: todos los campos habilitados
  2. Modo edición: fecha/moneda/formaPago disabled
  3. Modo edición: carga valores del gasto existente
  4. Modo edición: `guardar()` solo envía campos editables

---

## 4. RESUMEN

### Tests
- ❌ **CurrencyInputDirective**: sin spec
- ❌ **edit-gasto-caja**: sin spec
- ❌ **gasto-caja-dialog**: sin spec
- ✅ **CI pasa** si no hay errores de compilación/AOT

### UI
- ✅ **resumen-caja-dialog**: botón Editar correcto, permiso OK, disabled OK
- ⚠️ **gasto-caja-dialog**: moneda/formaPago NO visualmente disabled (P1-1)
- ✅ **gasto-caja-dialog**: fecha correctamente bloqueada

### Hallazgos críticos
- **P1-1**: Campos moneda/formaPago se ven editables (UX confuso)
- **P1-2**: Handler NO valida estado de caja (integridad)

### Gap mínimo
1. Agregar `[disabled]="isEditing"` en moneda y formaPago
2. Agregar validación `caja.estado === 'ACTIVO'` en handler
3. (Opcional P2) Agregar specs de directiva, handler y componente

---

**Fin del audit.**
