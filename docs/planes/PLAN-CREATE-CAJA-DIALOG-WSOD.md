# PLAN: Solución de WSOD en CreateCajaDialogComponent

**Fecha:** 2026-09-04  
**Responsable:** Cloud Agent (cursor/fix-create-caja-dialog-wsod-bd0a)  
**Tipo:** Bugfix (ALTA — renderer completamente blanco en producción)  
**Estado:** Draft — Solo planificación, sin implementación

---

## 1. Contexto del problema

### 1.1 Síntoma reportado por QA (Grok Bot, snapshot frc_gourmet_dev, Electron dark)

Al abrir el diálogo **Financiero → Cajas → ABRIR CAJA**, el **renderer completo queda en blanco** (WSOD — White Screen Of Death). Se pierde toda la UI de Electron, no solo el diálogo. El diálogo tiene `disableClose: true`, por lo que Escape no lo cierra. El problema ocurre tanto con `--disable-gpu` como sin él.

**Evidencia técnica:**
- `main.log` registra "Render frame was disposed" como síntoma (IPC de maximize/unmaximize enviado a un renderer que ya murió).
- **NO hay stack trace de Angular en los logs del renderer**.
- El IPC de MAC/deviceId **NO cuelga** — completa correctamente, por lo que no es un deadlock del proceso principal.

### 1.2 Causa raíz identificada (verificada contra código, commit abril 2025 "creacion de conteo y caja")

El problema está en el **constructor** de `CreateCajaDialogComponent` (líneas 142-149):

```typescript:142:149:src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts
    // Set dialog size
    this.dialogRef.updateSize('80vw', '80vh');

    // Remove the max-width and max-height restrictions
    const dialogContainer = document.querySelector('.cdk-dialog-container') as HTMLElement;
    if (dialogContainer) {
      dialogContainer.style.maxWidth = 'none';
      dialogContainer.style.maxHeight = 'none';
    }
```

**Problemas identificados:**

1. **`updateSize()` redundante**: Todos los call sites de `MatDialog.open(CreateCajaDialogComponent)` ya pasan `width: '80vw', height: '80vh'` en el config. Llamar `updateSize()` en el constructor sobrescribe esos valores de forma innecesaria.

2. **Selector CDK incorrecto y peligroso**: 
   - Usa `.cdk-dialog-container` (selector viejo de CDK), pero Angular Material 15 usa `.mat-mdc-dialog-container`.
   - `querySelector()` busca en **todo el documento**, no en el diálogo actual. Si hay múltiples overlays abiertos (por ejemplo, otro diálogo o un menú), el selector agarrará el **primer** elemento que encuentre, no necesariamente el diálogo de caja.
   - Se ejecuta en el constructor **antes** de que el diálogo esté completamente renderizado en el DOM.

3. **Doble inicialización de formularios**: `initForms()` se llama tanto en el constructor (línea 139) como en `ngOnInit()` (línea 153).

4. **Montaje sincrónico de UI compleja**: El template monta un `mat-stepper` con múltiples `mat-step`, cada uno conteniendo un `mat-tab-group` con tabs dinámicas (una por moneda) y dentro de cada tab, una grilla de `mat-form-field` (uno por denominación de billete). Todo esto se renderiza **antes** de que `loadDispositivos()` y `loadMonedas()` completen. En el template, las directivas estructurales `*ngIf="loading"` y `*ngIf="!loading"` se usan, pero el stepper completo está siempre montado.

**Motivo original del parche**: Necesitaban que el diálogo fuera más grande que el máximo por defecto de Material (`max-width: 80vw`, `max-height: 100vh`) para mostrar un stepper de conteo con muchas denominaciones de billetes.

---

## 2. Call sites identificados (6 totales)

Todos los lugares donde se abre `CreateCajaDialogComponent`:

### 2.1 `list-cajas.component.ts` (3 ocurrencias)

1. **Línea 303** — `onCreate()`: Abrir nueva caja
   ```typescript
   const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
     width: '80vw',
     height: '80vh',
     disableClose: true
   });
   ```

2. **Línea 343** — `goToConteo(caja)`: Modo conteo de caja abierta
   ```typescript
   const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
     width: '80vw',
     height: '80vh',
     disableClose: true,
     data: { cajaId: caja.id, mode: 'conteo' }
   });
   ```

3. **Línea 480** — `ajustarConteo(caja)`: Ajustar conteo de caja cerrada
   ```typescript
   const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
     width: '80vw',
     height: '80vh',
     disableClose: true,
     data: { cajaId: caja.id, mode: 'conteo', ajuste: true },
   });
   ```

### 2.2 `list-caja-dialog.component.ts` (1 ocurrencia)

4. **Línea 152** — `toggleNewCajaForm()`: Abrir nueva caja (desde selector de caja del PdV)
   ```typescript
   const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
     width: '500px'  // ⚠️ Este usa '500px', no '80vw'
   });
   ```

### 2.3 `pdv.component.ts` (2 ocurrencias)

5. **Línea 354** — `ofrecerAbrirCaja()`: Abrir caja al iniciar el PdV sin caja abierta
   ```typescript
   const cajaDialogRef = this.dialog.open(CreateCajaDialogComponent, {
     width: '80vw',
     height: '80vh',
     disableClose: true,
   });
   ```

6. **Línea 2412** — `cerrarCaja()`: Cerrar caja con conteo de cierre
   ```typescript
   const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
     width: '80vw',
     height: '80vh',
     disableClose: true,
     data: { mode: 'conteo', cajaId: this.caja.id },
   });
   ```

**Nota crítica sobre `list-caja-dialog`**: El call site 4 usa `width: '500px'` sin especificar `height`, lo que podría causar que el diálogo quede chico si se quitan los valores por defecto. **Este es un riesgo a documentar y testear**.

---

## 3. Solución propuesta (4 cambios obligatorios del alcance aprobado)

### 3.1 Eliminar `updateSize()` del constructor

**Archivo**: `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts`

**Cambio**: Quitar las líneas 142-143:
```typescript
// QUITAR estas 2 líneas:
this.dialogRef.updateSize('80vw', '80vh');
```

**Justificación**: Redundante con los `width`/`height` pasados en `MatDialog.open()`. Todos los call sites ya especifican el tamaño, excepto uno que usa `'500px'` intencionalmente.

### 3.2 Eliminar `querySelector('.cdk-dialog-container')` del constructor

**Archivo**: `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts`

**Cambio**: Quitar las líneas 145-149:
```typescript
// QUITAR estas 5 líneas:
const dialogContainer = document.querySelector('.cdk-dialog-container') as HTMLElement;
if (dialogContainer) {
  dialogContainer.style.maxWidth = 'none';
  dialogContainer.style.maxHeight = 'none';
}
```

**Justificación**: 
- El selector es incorrecto (`.cdk-dialog-container` ya no existe en Material 15).
- Manipula el **primer** overlay del documento, no necesariamente el diálogo actual.
- Se ejecuta antes de que el diálogo esté renderizado.
- La solución correcta es pasar `maxWidth` y `maxHeight` en el config de `MatDialog.open()`.

### 3.3 Agregar `maxWidth` y `maxHeight` en todos los call sites

**Archivos**: Los 6 call sites listados en §2.

**Cambio**: Agregar `maxWidth: '100vw', maxHeight: '100vh'` (o `'none'`) en el config de cada `MatDialog.open()`.

**Ejemplo** (call site 1 — `list-cajas.component.ts:303`):
```typescript
const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '80vw',
  height: '80vh',
  maxWidth: '100vw',   // NUEVO
  maxHeight: '100vh',  // NUEVO
  disableClose: true
});
```

**Valores recomendados**:
- **Para call sites con `width: '80vw', height: '80vh'`** (5 ocurrencias): `maxWidth: '100vw', maxHeight: '100vh'`.
- **Para call site con `width: '500px'`** (1 ocurrencia en `list-caja-dialog`): `maxWidth: '90vw', maxHeight: '90vh'` para que no quede demasiado chico en pantallas pequeñas, pero que tampoco se desborde.

**Alternativa**: Usar `maxWidth: 'none', maxHeight: 'none'` si se quiere permitir que el diálogo sea más grande que la ventana (no recomendado, pero es lo que el código original intentaba hacer).

### 3.4 Dejar un solo `initForms()` (quitar el del constructor)

**Archivo**: `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts`

**Cambio**: Quitar la línea 139 del constructor:
```typescript
// QUITAR esta línea del constructor:
this.initForms();
```

Dejar solo la llamada en `ngOnInit()` (línea 153).

**Justificación**: Los formularios deben inicializarse en `ngOnInit()`, no en el constructor. Llamarlo dos veces puede causar que los `FormControl` se recreen y se pierdan valores.

### 3.5 NO montar stepper/tabs/billetes hasta que terminen dispositivos/monedas

**Archivo**: `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.html`

**Cambio**: Envolver el `<mat-stepper>` completo (línea 39) en un `*ngIf="!loading"`:

```html
<!-- CAMBIAR la línea 34-39: -->
<mat-dialog-content class="dialog-content" style="height: 100%">
  <div *ngIf="loading" class="loading-overlay">
    <mat-spinner diameter="40"></mat-spinner>
    <p>Cargando datos...</p>
  </div>
  
  <!-- AGREGAR *ngIf aquí: -->
  <mat-stepper
    *ngIf="!loading"
    [linear]="isLinear"
    #stepper
    class="compact-stepper"
    style="height: 100%"
  >
    <!-- ... resto del stepper ... -->
  </mat-stepper>
</mat-dialog-content>
```

**Justificación**: El stepper contiene referencias a `@ViewChild` (línea 58) que Angular trata de resolver antes de que los datos estén listos. Si `monedasConfig` está vacío o `activeCurrency` es `null`, los `*ngFor` de las tabs y los billetes fallarán o renderizarán vacíos. El diálogo ya tiene una capa de loading (`<div *ngIf="loading">`) pero el stepper estaba siempre montado debajo.

**Efecto**: El stepper completo solo se monta **después** de que `loadMonedas()` complete (lo cual también espera `loadDispositivos()`). El `@ViewChild('stepper') stepper!: MatStepper;` solo estará disponible después del primer `AfterViewInit` con `loading = false`.

**Riesgo**: Si algún código en el componente intenta acceder a `this.stepper` antes de que esté disponible, fallará. Revisar todas las referencias a `this.stepper` (7 ocurrencias en el .ts) y asegurar que estén protegidas con checks `if (!this.stepper) return;` o solo se llamen después de que el loading haya terminado.

---

## 4. Testing

### 4.1 Tests existentes (estado actual)

**Búsqueda realizada**: 
- `grep -r "describe.*[Cc]aja" *.spec.ts` → No hay tests de frontend para `CreateCajaDialogComponent`.
- `npm run` → Tests backend relacionados con cajas:
  - `test:config-caja-mayor`
  - `test:terminal-caja` (guarda relación con el gate de terminal ajena)
  - `test:resumen-caja-numeros`

**Ninguno de estos tests cubre el flujo de UI del diálogo de apertura/cierre de caja.**

### 4.2 Estrategia de testing para este bugfix

#### 4.2.1 Test unitario del componente (recomendado, no obligatorio)

**Archivo nuevo**: `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.spec.ts`

**Qué debe cubrir**:
1. **Test de regresión del bug**: El constructor NO debe llamar `updateSize()`.
   ```typescript
   it('should NOT call updateSize in constructor', () => {
     const updateSizeSpy = spyOn(dialogRef, 'updateSize');
     const component = new CreateCajaDialogComponent(dialogRef, data, fb, repo, auth, snackBar);
     expect(updateSizeSpy).not.toHaveBeenCalled();
   });
   ```

2. **Test de regresión del bug**: El constructor NO debe manipular el DOM con `querySelector`.
   ```typescript
   it('should NOT call querySelector in constructor', () => {
     const querySelectorSpy = spyOn(document, 'querySelector');
     const component = new CreateCajaDialogComponent(dialogRef, data, fb, repo, auth, snackBar);
     expect(querySelectorSpy).not.toHaveBeenCalled();
   });
   ```

3. **Test de inicialización**: `initForms()` debe llamarse **solo una vez** en `ngOnInit()`, no en el constructor.
   ```typescript
   it('should call initForms only once in ngOnInit', () => {
     spyOn(component as any, 'initForms');
     component.ngOnInit();
     expect((component as any).initForms).toHaveBeenCalledTimes(1);
   });
   ```

4. **Test de loading**: El stepper NO debe estar en el DOM mientras `loading = true`.
   ```typescript
   it('should not render stepper while loading', () => {
     component.loading = true;
     fixture.detectChanges();
     const stepper = fixture.nativeElement.querySelector('mat-stepper');
     expect(stepper).toBeNull();
   });
   
   it('should render stepper after loading completes', () => {
     component.loading = false;
     fixture.detectChanges();
     const stepper = fixture.nativeElement.querySelector('mat-stepper');
     expect(stepper).not.toBeNull();
   });
   ```

**Complejidad estimada**: Media — requiere mockear `RepositoryService`, `AuthService`, `MatDialogRef`, `MatSnackBar`, y varios Observables de TypeORM.

**Prioridad**: **Alta** — Los tests 1 y 2 son **tests de regresión del bug** que aseguran que no vuelva a introducirse.

#### 4.2.2 Checklist de QA manual (obligatorio)

**Archivo nuevo**: `docs/testing/TESTING-CHECKLIST-CREATE-CAJA-DIALOG.md`

**Escenarios mínimos** (a ejecutar en la VM de QA — Grok Bot, snapshot frc_gourmet_dev):

| # | Escenario | Esperado | Notas |
|---|-----------|----------|-------|
| 1 | **Abrir caja nueva** desde Financiero → Cajas → ABRIR CAJA | El diálogo se abre correctamente, no WSOD. Stepper visible. | Call site 1 |
| 2 | **Abrir caja nueva** desde PdV sin caja abierta | El diálogo se abre correctamente, no WSOD. | Call site 5 |
| 3 | **Abrir caja nueva** desde selector de caja del PdV (diálogo pequeño) | El diálogo se abre con `width: '500px'`. No debe quedar demasiado chico. | Call site 4 |
| 4 | **Conteo de caja abierta** desde Financiero → Cajas → (caja abierta) → CONTEO | El diálogo se abre en modo conteo, no WSOD. Valores de apertura precargados. | Call site 2 |
| 5 | **Cerrar caja** desde PdV → botón Cerrar Caja | El diálogo se abre en modo conteo de cierre, no WSOD. Paso de cierre visible. | Call site 6 |
| 6 | **Ajustar conteo de caja cerrada** desde Financiero → Cajas → (caja cerrada) → AJUSTAR | El diálogo se abre en modo ajuste, no WSOD. Valores editables. | Call site 3 |
| 7 | **Múltiples monedas** | Si el sistema tiene USD + PYG habilitados, las tabs de monedas deben aparecer correctamente. | Probar con 2-3 monedas activas |
| 8 | **Conteo resumido** | Activar `conteoResumido` y verificar que solo pide totales por moneda, no por denominación. | Modo resumido desde 2026-08 |
| 9 | **Diálogo pequeño no se desborda** | El call site 4 (`width: '500px'`) no debe hacer que el contenido se desborde. | Risk: overlay chico |
| 10 | **Escape no cierra** (regresión) | Con `disableClose: true`, Escape no debe cerrar el diálogo. | No debe cambiar |

**Responsable de QA**: El Asistente general (Grok Bot) refilmará en la VM después de la implementación.

#### 4.2.3 Test E2E (no obligatorio, pero recomendable)

**Archivo nuevo**: `scripts/test-create-caja-dialog-e2e.ts`

**Qué debe cubrir**:
- Crear una caja nueva con conteo inicial (modo completo y resumido).
- Abrir el diálogo de cierre de caja y verificar que los totales coincidan.
- Verificar que el diálogo no lance excepciones en consola.

**Complejidad estimada**: Alta — requiere interactuar con la UI de Electron (Spectron o Playwright).

**Prioridad**: **Media** — No es crítico para cerrar este bugfix, pero ayudaría a prevenir regresiones futuras.

---

## 5. Migraciones

**No aplica.** Este bugfix no toca entidades de TypeORM ni el esquema de la base de datos.

**Justificación**: Los cambios son únicamente en el componente Angular y en los call sites de `MatDialog.open()`. Las entidades `Caja`, `Conteo`, `ConteoDetalle` ya existen y no se modifican.

---

## 6. Reinicio de la aplicación

**NO requiere reinicio de la app completa (Electron).**

**Justificación**: Los cambios son solo en archivos `.ts`, `.html` del renderer (Angular). El **hot reload de Angular** (ng serve) es suficiente para aplicar los cambios.

**Nota para el operador**: Si se están corrigiendo múltiples issues y alguno requiere reinicio (por ejemplo, cambios en handlers IPC), entonces sí hay que reiniciar. Pero este bugfix en particular **no** requiere reinicio.

---

## 7. Riesgos identificados y mitigaciones

### 7.1 Overlay queda chico si maxWidth/maxHeight quedan con default

**Riesgo**: Si solo se quita el `querySelector()` sin agregar `maxWidth`/`maxHeight` en los call sites, el diálogo podría quedar restringido por los máximos por defecto de Material (`max-width: 80vw`, `max-height: 100vh`), que pueden ser más chicos que `width: '80vw', height: '80vh'` en ventanas muy grandes.

**Mitigación**: Agregar explícitamente `maxWidth: '100vw', maxHeight: '100vh'` en los 5 call sites que usan `'80vw'/'80vh'`.

**Severidad**: **ALTA** — Este es el motivo original del parche. Si no se mitiga, el diálogo quedará chico y volverán a reportar el bug.

### 7.2 Loading spinner oculta stepper pero `@ViewChild` falla

**Riesgo**: El componente tiene un `@ViewChild('stepper') stepper!: MatStepper;` (línea 58). Si se envuelve el stepper en `*ngIf="!loading"`, el `stepper` será `undefined` hasta que `loading = false`. Cualquier código que intente acceder a `this.stepper` antes de ese momento fallará.

**Análisis de referencias a `this.stepper` en el .ts**:
- Línea 660: `navigateToCierreStep()` — llama `this.stepper.steps.toArray()` y `this.stepper.selectedIndex = 1`.
- Ninguna otra referencia directa encontrada en búsqueda rápida.

**Mitigación**: 
1. En `navigateToCierreStep()`, agregar check al inicio:
   ```typescript
   if (!this.stepper) return;
   ```
2. Este método solo se llama desde `loadExistingCajaData()` **después** de que `loadMonedas()` complete, por lo que `loading` debería ser `false` en ese momento. Verificar que la llamada no ocurra prematuramente.

**Severidad**: **MEDIA** — Puede causar `TypeError: Cannot read property 'steps' of undefined` en modo conteo/ajuste.

### 7.3 Modo conteo/ajuste rompe `ViewChild` del stepper

**Riesgo**: En modo `conteo`/`ajuste`, el diálogo carga una caja existente con `loadExistingCajaData()`, que a su vez llama `navigateToCierreStep()` para saltar al paso de cierre. Si el stepper no está montado aún (`loading = true`), esto fallará.

**Análisis del flujo**:
```typescript
ngOnInit() {
  if (this.dialogMode === 'conteo' && this.data && this.data.cajaId) {
    this.loadExistingCajaData(this.data.cajaId);  // Inicia carga asincrónica
  } else {
    this.loadDispositivos();  // Inicia carga asincrónica
  }
}
```

`loadExistingCajaData()` llama a:
1. `repositoryService.getCaja()` → asincrónico
2. `loadMonedas(true, conteoId)` → asincrónico
3. `loadConteoCierreData()` → asincrónico
4. `navigateToCierreStep()` → intenta acceder a `this.stepper`

La carga es **asincrónica**, por lo que `loading` debería ser `false` cuando `navigateToCierreStep()` se ejecuta. **Sin embargo**, hay un `setTimeout(() => { this.navigateToCierreStep(); }, 500)` en la línea 1417 que podría ejecutarse antes de que el stepper esté renderizado.

**Mitigación**:
1. Aumentar el timeout de 500ms a 1000ms (o usar `AfterViewChecked` para esperar a que el stepper esté disponible).
2. Agregar check `if (!this.stepper) return;` en `navigateToCierreStep()`.

**Severidad**: **ALTA** en modo conteo — Este es el flujo principal del cierre de caja desde el PdV.

### 7.4 Call site con `width: '500px'` queda muy chico

**Riesgo**: El call site 4 (`list-caja-dialog.component.ts:152`) usa `width: '500px'` sin especificar `height`. Si el contenido del diálogo no cabe en 500px de ancho, se desbordará o aparecerá scroll horizontal.

**Análisis**: Este call site abre el diálogo desde un selector de caja del PdV. Es probable que sea un flujo de creación rápida de caja, no el flujo completo de conteo con todas las denominaciones.

**Mitigación**:
1. Agregar `maxWidth: '90vw', maxHeight: '90vh'` para que en pantallas pequeñas no quede demasiado chico.
2. Verificar en QA que el contenido del diálogo cabe en 500px de ancho (o expandir a `'60vw'` si es necesario).

**Severidad**: **MEDIA** — Solo afecta un flujo (abrir caja desde selector del PdV).

### 7.5 El código original intentaba forzar `maxWidth/maxHeight: none` por alguna razón

**Riesgo**: El desarrollador original puso el `querySelector()` por algo. Es posible que en **ciertos casos** (por ejemplo, pantallas muy pequeñas o con muchas denominaciones de billetes), el diálogo necesite ser más grande que `100vw`/`100vh`.

**Análisis**: No hay evidencia de que el diálogo necesite ser más grande que la ventana. El código original usaba `'none'`, lo cual permitiría que el diálogo se desbordara fuera de la ventana, pero eso no tiene sentido en una aplicación de escritorio.

**Mitigación**: Usar `'100vw'`/`'100vh'` en lugar de `'none'`. Si en QA se reporta que el diálogo queda chico, se puede cambiar a valores más grandes (e.g., `'95vw'`/`'95vh'`) o agregar scroll interno al stepper.

**Severidad**: **BAJA** — El valor `'100vw'`/`'100vh'` es más que suficiente para cualquier contenido razonable.

---

## 8. Fases de implementación y commits previstos

### Fase 1: Limpieza del constructor
**Commit**: `fix(caja): remove updateSize and querySelector from CreateCajaDialog constructor`

**Cambios**:
- Quitar líneas 142-143 (`updateSize()`).
- Quitar líneas 145-149 (`querySelector()`).
- Quitar línea 139 (`initForms()` duplicado del constructor).

**Archivos modificados**: 
- `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts`

**Verificación**: `npm run build` debe compilar sin errores.

---

### Fase 2: Agregar maxWidth/maxHeight en call sites
**Commit**: `fix(caja): add maxWidth/maxHeight to all CreateCajaDialog.open() calls`

**Cambios**:
- Agregar `maxWidth: '100vw', maxHeight: '100vh'` en los 5 call sites con `'80vw'/'80vh'`.
- Agregar `maxWidth: '90vw', maxHeight: '90vh'` en el call site con `'500px'`.

**Archivos modificados**:
- `src/app/pages/financiero/cajas/list-cajas.component.ts` (3 ocurrencias)
- `src/app/pages/financiero/cajas/list-caja-dialog/list-caja-dialog.component.ts` (1 ocurrencia)
- `src/app/pages/ventas/pdv/pdv.component.ts` (2 ocurrencias)

**Verificación**: `npm run build` debe compilar sin errores.

---

### Fase 3: Lazy loading del stepper
**Commit**: `fix(caja): defer stepper mount until dispositivos/monedas load`

**Cambios**:
- Envolver `<mat-stepper>` en `*ngIf="!loading"` en el template.
- Agregar check `if (!this.stepper) return;` en `navigateToCierreStep()`.

**Archivos modificados**:
- `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.html`
- `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts`

**Verificación**: `npm run build` debe compilar sin errores.

---

### Fase 4: Tests de regresión
**Commit**: `test(caja): add unit tests for CreateCajaDialog bugfix`

**Cambios**:
- Crear `create-caja-dialog.component.spec.ts` con los 4 tests descritos en §4.2.1.

**Archivos nuevos**:
- `src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.spec.ts`

**Verificación**: `npm run test` debe pasar todos los tests.

---

### Fase 5: Checklist de QA
**Commit**: `docs(testing): add manual QA checklist for CreateCajaDialog`

**Cambios**:
- Crear `docs/testing/TESTING-CHECKLIST-CREATE-CAJA-DIALOG.md` con los 10 escenarios de §4.2.2.

**Archivos nuevos**:
- `docs/testing/TESTING-CHECKLIST-CREATE-CAJA-DIALOG.md`

**Verificación**: N/A (solo docs).

---

### Fase 6: Documentación del plan (ESTA FASE)
**Commit**: `docs(planes): add PLAN-CREATE-CAJA-DIALOG-WSOD.md`

**Cambios**:
- Crear este archivo de plan.

**Archivos nuevos**:
- `docs/planes/PLAN-CREATE-CAJA-DIALOG-WSOD.md`

**Verificación**: N/A (solo docs).

---

## 9. Checklist de terminado (Definition of Done)

Según `workflows/ciclo-implementacion.md` y `workflows/definition-of-done.md`:

- [ ] **Plan escrito y auditado** (este archivo)
- [ ] Código implementado en 3 fases (commits separados)
- [ ] `npm run build` pasa sin errores
- [ ] `npm run check` (AOT) pasa sin errores
- [ ] Tests unitarios creados y pasando (`npm run test`)
- [ ] Checklist de QA manual creado
- [ ] **QA manual ejecutado por Asistente general (Grok Bot en la VM)** — con video de evidencia
- [ ] Skill actualizada si aplica (NO aplica — el bug no cambia convenciones)
- [ ] Docs de dominio actualizados si aplica (NO aplica — no cambia lógica de negocio)
- [ ] `reference/known-bugs.md` actualizado (quitar el ítem del WSOD si existía)
- [ ] PR creado a `develop` con título `fix(caja): resolve WSOD when opening CreateCajaDialog`
- [ ] CI pasa en verde sobre el head del PR
- [ ] No hay conflictos con `develop`

---

## 10. Notas adicionales

### 10.1 Por qué el código original tenía ese parche

El desarrollador original (commit abril 2025 "creacion de conteo y caja") necesitaba que el diálogo fuera más grande que el máximo por defecto de Material. En ese momento, probablemente:
- No sabía que `MatDialog.open()` acepta `maxWidth`/`maxHeight` en el config.
- O el componente ya estaba creado y no quería cambiar todos los call sites.
- Así que puso el parche en el constructor para que funcionara sin importar cómo se llamara.

**El parche funcionó en desarrollo**, pero falló en producción por las razones descritas en §1.2.

### 10.2 Por qué el bug no se detectó en desarrollo

- El bug es **intermitente** — depende del timing del navegador y de cuántos overlays haya en el DOM en ese momento.
- En desarrollo, con DevTools abiertos y hot reload frecuente, el timing es diferente que en producción.
- El selector `.cdk-dialog-container` puede haber agarrado el overlay correcto **por suerte** en los tests manuales.
- El WSOD solo ocurre cuando el selector agarra el **overlay equivocado** (por ejemplo, un menú o un snackbar que estaba abierto antes).

### 10.3 Código gana a skill

Si el skill afirma algo diferente sobre cómo funcionan los diálogos de Material, **este plan y el código real ganan**. El skill fue escrito antes de este bugfix y puede estar desactualizado.

---

## 11. Aprobación para implementación

**PENDIENTE**: Este plan debe ser auditado por 2 agentes (ejes distintos) antes de proceder a implementación. Ver `workflows/ciclo-implementacion.md` §4 (Auditoría del plan).

Una vez aprobado, se procede con las fases 1-6 en el orden listado.

---

**Fin del plan.**
