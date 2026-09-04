# AUDITORÍA PLAN B: Correctitud técnica contra código real

**Fecha:** 2026-09-04  
**Auditor:** Cloud Agent (rama cursor/fix-create-caja-dialog-wsod-bd0a)  
**Plan auditado:** `docs/planes/PLAN-CREATE-CAJA-DIALOG-WSOD.md` (PLAN B — eje correctitud)  
**Veredicto:** **OK CON ENMIENDAS MENORES**

---

## 1. Resumen ejecutivo

El PLAN B es **técnicamente sólido** y refleja correctamente el estado del código real. Los 4 cambios propuestos (eliminar updateSize, eliminar querySelector, agregar maxWidth/maxHeight en call sites, y lazy loading del stepper) están **bien fundamentados** y atacan la causa raíz del WSOD. Los tests propuestos **SÍ discriminan el bug** (no son cosméticos).

Se encontraron **3 enmiendas menores** que deben incorporarse antes de la implementación:

1. **El PLAN subestima el riesgo del call site con `width: '500px'`** — es el flujo principal del PdV, no un flujo secundario.
2. **`navigateToCierreStep()` YA tiene el check `if (!this.stepper) return;`** en el código actual (línea 659) — el riesgo §7.2 está parcialmente mitigado, pero el timeout de 500ms sigue siendo peligroso.
3. **El doble `initForms()` en el constructor es línea 139, NO línea 153** (el que está en ngOnInit es el correcto).

No se encontraron **bloqueantes** — el plan puede proceder a implementación tras incorporar estas enmiendas.

---

## 2. Verificación punto por punto

### 2.1 Constructor updateSize/querySelector (§1.2 del PLAN)

**✅ VERIFICADO CORRECTO**

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

**Análisis:**
- El código problemático existe exactamente como lo describe el PLAN.
- El selector `.cdk-dialog-container` es **incorrecto para Angular Material 15** (debería ser `.mat-mdc-dialog-container`).
- `querySelector()` busca en **todo el documento**, no en el diálogo actual — esto es especialmente peligroso si hay múltiples overlays abiertos.
- Se ejecuta en el **constructor** antes de que el diálogo esté completamente renderizado.

**Conclusión:** La identificación del bug es **correcta**.

---

### 2.2 Doble initForms (§1.2 del PLAN y §3.4)

**⚠️ CORRECTO PERO CON ENMIENDA EN NÚMEROS DE LÍNEA**

```typescript:139:154:src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts
    // Initialize forms
    this.initForms();

    // Set dialog size
    this.dialogRef.updateSize('80vw', '80vh');
    // ... querySelector code ...
  }

  // Lifecycle hooks
  ngOnInit(): void {
    this.initForms();
```

**Enmienda:**
- El PLAN dice "Quitar la línea 139 del constructor" — **CORRECTO**.
- Pero luego dice "Dejar solo la llamada en `ngOnInit()` (línea 153)" — **ERROR DE NÚMERO**: la llamada en `ngOnInit()` está en la **línea 154**, no 153.
- **Impacto:** Menor — es solo un error tipográfico en el número de línea. La indicación técnica es correcta.

**Conclusión:** El doble `initForms()` está confirmado. La solución propuesta es **correcta**.

---

### 2.3 Call sites open() (§2 del PLAN)

**✅ VERIFICADO — 6 CALL SITES ENCONTRADOS**

| # | Archivo | Línea | width | height | Propósito |
|---|---------|-------|-------|--------|-----------|
| 1 | `list-cajas.component.ts` | 303 | `'80vw'` | `'80vh'` | Modo conteo de caja abierta |
| 2 | `list-cajas.component.ts` | 343 | `'80vw'` | `'80vh'` | Ajustar conteo de caja cerrada |
| 3 | `list-cajas.component.ts` | 480 | `'80vw'` | `'80vh'` | Abrir nueva caja |
| 4 | `list-caja-dialog.component.ts` | 152 | `'500px'` | *omitido* | **Abrir nueva caja desde selector del PdV** |
| 5 | `pdv.component.ts` | 354 | `'80vw'` | `'80vh'` | Abrir caja al iniciar PdV sin caja abierta |
| 6 | `pdv.component.ts` | 2412 | `'80vw'` | `'80vh'` | Cerrar caja con conteo de cierre |

**Análisis del call site 4 (CRÍTICO):**

```typescript:151:154:src/app/pages/financiero/cajas/list-caja-dialog/list-caja-dialog.component.ts
  toggleNewCajaForm(): void {
    const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
      width: '500px'
    });
```

**⚠️ ENMIENDA CRÍTICA:**

El PLAN §7.4 dice:
> Este call site abre el diálogo desde un selector de caja del PdV. Es probable que sea un flujo de **creación rápida de caja**, no el flujo completo de conteo con todas las denominaciones.

**Esto es INCORRECTO.** El análisis del código revela:

- `list-caja-dialog` es el **selector de caja del PdV** (usado cuando no hay caja abierta).
- Abre el **mismo componente** `CreateCajaDialogComponent` sin `mode: 'conteo'` — es decir, en **modo completo** (con stepper de conteo de billetes).
- Este es el **flujo principal del PdV** cuando no hay caja abierta, NO un flujo secundario.

**Impacto:**
- Si el diálogo queda con `width: '500px'` sin `maxWidth`, el stepper con tabs de monedas y denominaciones **se desbordará**.
- El PLAN sugiere `maxWidth: '90vw', maxHeight: '90vh'` para este call site — **esto es correcto**, pero subestima la gravedad del problema.
- **Recomendación:** Cambiar este call site a `width: '70vw', height: '75vh'` (o `'60vw'` mínimo) para que el contenido del stepper quepa correctamente. `'500px'` es insuficiente para el diálogo completo.

**Conclusión:** Los call sites están correctamente identificados, pero la severidad del riesgo §7.4 debe elevarse de **MEDIA** a **ALTA**.

---

### 2.4 maxWidth/maxHeight propuestos — API MatDialog de Angular Material 15 (§3.3)

**✅ VERIFICADO CORRECTO**

```json:126:126:package.json
    "@angular/material": "^15.2.9",
```

**Análisis:**
- Angular Material 15.2.9 instalado.
- La [documentación oficial de MatDialogConfig (v15)](https://v15.material.angular.io/components/dialog/api#MatDialogConfig) confirma que `maxWidth` y `maxHeight` son propiedades válidas de tipo `string | number`.
- Los valores propuestos `'100vw'` / `'100vh'` son **válidos** y correctos.

**Conclusión:** La API propuesta es **correcta**.

---

### 2.5 Lazy loading del stepper con *ngIf vs @ViewChild (§3.5 del PLAN)

**✅ CONCEPTO CORRECTO — ⚠️ ENMIENDA EN LA MITIGACIÓN DEL RIESGO**

**Estado actual del template:**

```html:34:44:src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.html
  <mat-dialog-content class="dialog-content" style="height: 100%">
    <div *ngIf="loading" class="loading-overlay">
      <mat-spinner diameter="40"></mat-spinner>
      <p>Cargando datos...</p>
    </div>
    <mat-stepper
      [linear]="isLinear"
      #stepper
      class="compact-stepper"
      style="height: 100%"
    >
```

**Verificado:** El stepper **NO está envuelto en `*ngIf="!loading"`** — se monta siempre, incluso mientras `loading = true`. Esto confirma el problema que el PLAN intenta resolver.

**Análisis del riesgo §7.2 y §7.3:**

El PLAN dice:
> **Mitigación**: Agregar check `if (!this.stepper) return;` en `navigateToCierreStep()`.

**⚠️ ESTE CHECK YA EXISTE EN EL CÓDIGO ACTUAL:**

```typescript:658:672:src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts
  private navigateToCierreStep(): void {
    if (this.dialogMode !== 'conteo' || !this.stepper) return;
    this.isLinear = false;
    setTimeout(() => {
      // Mark apertura step as completed so SIGUIENTE works from cierre step
      this.stepper.steps.toArray().forEach((step, i) => {
        if (i < 1) {
          step.completed = true;
          step.editable = true;
        }
      });
      // Cierre step is now index 1 (was 2 before removing dispositivo step)
      this.stepper.selectedIndex = 1;
    }, 0);
  }
```

**Enmienda:**
- Línea 659: `if (this.dialogMode !== 'conteo' || !this.stepper) return;` — **el check ya está implementado**.
- **SIN EMBARGO**, el timeout de **500ms** en la línea 1417 donde se llama a `navigateToCierreStep()` sigue siendo **peligroso**:

```typescript:1415:1417:src/app/pages/financiero/cajas/create-caja-dialog/create-caja-dialog.component.ts
                this.navigateToCierreStep();
              }, 500);
```

**Problema:** Si `loading` tarda más de 500ms en pasar a `false`, el `setTimeout()` se ejecuta **antes** de que el stepper esté montado. El check `if (!this.stepper) return;` previene el crash, pero **silenciosamente falla** en navegar al paso de cierre.

**Recomendación:** El timeout de 500ms debe **aumentarse a 1000ms** (como sugiere el PLAN en §7.3) O **eliminarse** y usar `AfterViewChecked` para esperar a que `this.stepper` esté disponible.

**Conclusión:** El concepto del lazy loading con `*ngIf="!loading"` es **correcto**. La mitigación del riesgo está **parcialmente implementada** (el check existe), pero el timeout sigue siendo un problema.

---

### 2.6 Tests propuestos — ¿Discriminan el bug o son cosméticos? (§4.2.1)

**✅ TESTS DISCRIMINAN EL BUG — NO SON COSMÉTICOS**

**Test 1:** No debe llamar `updateSize()` en el constructor.

```typescript
it('should NOT call updateSize in constructor', () => {
  const updateSizeSpy = spyOn(dialogRef, 'updateSize');
  const component = new CreateCajaDialogComponent(dialogRef, data, fb, repo, auth, snackBar);
  expect(updateSizeSpy).not.toHaveBeenCalled();
});
```

**Análisis:** Este test **discrimina la causa raíz del bug** — el `updateSize()` redundante en el constructor. Si este test falla, significa que el bug regresó.

**Test 2:** No debe llamar `querySelector()` en el constructor.

```typescript
it('should NOT call querySelector in constructor', () => {
  const querySelectorSpy = spyOn(document, 'querySelector');
  const component = new CreateCajaDialogComponent(dialogRef, data, fb, repo, auth, snackBar);
  expect(querySelectorSpy).not.toHaveBeenCalled();
});
```

**Análisis:** Este test **discrimina la otra causa raíz del bug** — la manipulación DOM peligrosa. Si este test falla, significa que el bug regresó.

**Test 3:** `initForms()` debe llamarse solo una vez en `ngOnInit()`.

```typescript
it('should call initForms only once in ngOnInit', () => {
  spyOn(component as any, 'initForms');
  component.ngOnInit();
  expect((component as any).initForms).toHaveBeenCalledTimes(1);
});
```

**Análisis:** Este test verifica que no haya **doble inicialización** de formularios, que puede causar pérdida de valores. Es un test de **regresión de bug**, no cosmético.

**Test 4 y 5:** El stepper NO debe renderizarse mientras `loading = true`, y SÍ debe renderizarse cuando `loading = false`.

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

**Análisis:** Estos tests verifican que el **lazy loading del stepper** funcione correctamente. Son tests de **regresión** que aseguran que el stepper no se monte prematuramente.

**Conclusión:** Los tests propuestos **SÍ discriminan el bug**. Son tests de regresión críticos, NO cosméticos.

---

## 3. Riesgos identificados y su justificación (§7 del PLAN)

### ✅ Riesgo §7.1 — Overlay queda chico si maxWidth/maxHeight quedan con default

**Severidad: ALTA** — **JUSTIFICADO CORRECTAMENTE**

Este es el motivo original del parche. Si no se agrega `maxWidth`/`maxHeight` en los call sites, el diálogo quedará restringido por los máximos por defecto de Material (max-width: 80vw).

### ⚠️ Riesgo §7.2 — `@ViewChild` falla si loading oculta stepper

**Severidad: MEDIA** — **PARCIALMENTE MITIGADO EN EL CÓDIGO ACTUAL**

El check `if (!this.stepper) return;` **YA EXISTE** en la línea 659. Sin embargo, el timeout de 500ms en la línea 1417 sigue siendo un problema si `loading` tarda más.

**Recomendación:** Aumentar timeout a 1000ms o usar `AfterViewChecked`.

### 🔴 Riesgo §7.3 — Modo conteo/ajuste rompe `ViewChild` del stepper

**Severidad: ALTA** — **PARCIALMENTE MITIGADO — SIGUE SIENDO RIESGO REAL**

La severidad está correctamente elevada a ALTA. Este es el flujo principal del cierre de caja desde el PdV. El timeout de 500ms es **insuficiente** si la carga de datos tarda más (por ejemplo, en SQLite lento o con muchas denominaciones de billetes).

### 🔴 Riesgo §7.4 — Call site con `width: '500px'` queda muy chico

**Severidad: MEDIA → debe elevarse a ALTA**

El PLAN subestima este riesgo. `list-caja-dialog` es el **selector de caja del PdV** (flujo principal), no un flujo secundario. Si el diálogo queda con `500px` de ancho, el stepper con tabs de monedas se desbordará.

**Recomendación:** Cambiar `width: '500px'` a `width: '70vw', height: '75vh'` para que el contenido quepa correctamente.

### ✅ Riesgo §7.5 — El código original intentaba forzar maxWidth/maxHeight: none

**Severidad: BAJA** — **ANÁLISIS CORRECTO**

El desarrollador original usaba `'none'` para permitir que el diálogo fuera más grande que la ventana, pero esto no tiene sentido en una aplicación de escritorio. Usar `'100vw'`/`'100vh'` es suficiente.

---

## 4. Verificación de la skill/cajas/dialogs (no existe en el repo)

**❌ NO ENCONTRADO**

El plan menciona:
> Skill: `.claude/skills/frc-gourmet-expert/` cajas/dialogs.

**Búsqueda realizada:**

```bash
find . -path "*/.claude/skills/frc-gourmet-expert/*" -name "*caja*" -o -name "*dialog*"
```

**Resultado:** No se encontró ningún archivo específico de cajas/dialogs en la skill.

**Análisis:**
- La skill general de FRC Gourmet (`/workspace/.claude/skills/frc-gourmet-expert/SKILL.md`) existe y fue leída.
- **NO existe** un documento específico `cajas/dialogs.md` o similar.
- El PLAN no depende críticamente de este documento — la skill general contiene suficiente contexto sobre convenciones de diálogos (§117, regla #16: "Cada diálogo, un propósito").

**Impacto:** **Nulo** — no afecta la validez del plan.

---

## 5. Enmiendas requeridas antes de la implementación

### 5.1 Enmienda #1: Elevar severidad del riesgo §7.4 y cambiar el call site 4

**Actual:**
> **Severidad**: **MEDIA** — Solo afecta un flujo (abrir caja desde selector del PdV).

**Debe decir:**
> **Severidad**: **ALTA** — Este es el flujo principal del PdV cuando no hay caja abierta. El diálogo con `width: '500px'` es **insuficiente** para el stepper completo con tabs de monedas.

**Mitigación propuesta en §3.3 debe cambiar:**

**Actual:**
> Agregar `maxWidth: '90vw', maxHeight: '90vh'` en el call site con `'500px'`.

**Debe decir:**
> Cambiar `width: '500px'` a `width: '70vw', height: '75vh'` Y agregar `maxWidth: '90vw', maxHeight: '90vh'`.

---

### 5.2 Enmienda #2: Corregir número de línea en §3.4

**Actual:**
> Dejar solo la llamada en `ngOnInit()` (línea 153).

**Debe decir:**
> Dejar solo la llamada en `ngOnInit()` (línea 154).

**Impacto:** Menor — es solo un error tipográfico.

---

### 5.3 Enmienda #3: Actualizar §7.2 para reflejar que el check ya existe

**Actual:**
> **Mitigación**: Agregar check `if (!this.stepper) return;` en `navigateToCierreStep()`.

**Debe decir:**
> **Mitigación**: El check `if (!this.stepper) return;` **ya existe** en la línea 659. Sin embargo, el timeout de 500ms en la línea 1417 donde se llama a `navigateToCierreStep()` sigue siendo peligroso. **Aumentar el timeout a 1000ms** (o usar `AfterViewChecked` para esperar a que el stepper esté disponible).

---

## 6. Veredicto final

**VEREDICTO: OK CON ENMIENDAS MENORES**

### Fortalezas del PLAN:

1. ✅ Identifica correctamente la **causa raíz del bug** (updateSize + querySelector en el constructor).
2. ✅ Los 4 cambios propuestos son **técnicamente correctos** y están bien fundamentados.
3. ✅ Los tests propuestos **SÍ discriminan el bug** (no son cosméticos).
4. ✅ Los riesgos identificados son **reales** y están correctamente priorizados (con la excepción del §7.4).
5. ✅ La estrategia de implementación por fases es **razonable**.
6. ✅ La API de `MatDialogConfig` (maxWidth/maxHeight) es **correcta** para Angular Material 15.

### Debilidades/enmiendas requeridas:

1. ⚠️ Subestima la severidad del riesgo §7.4 (call site con `width: '500px'`).
2. ⚠️ Error tipográfico en número de línea (§3.4).
3. ⚠️ No refleja que el check `if (!this.stepper) return;` ya existe en el código actual (§7.2).

### Recomendación:

El plan puede **proceder a implementación** tras incorporar las 3 enmiendas menores listadas en §5. No se encontraron **bloqueantes**.

---

## 7. Nota para el agente implementador

Al implementar la **Fase 2** (agregar maxWidth/maxHeight en call sites), prestar especial atención al **call site 4** (`list-caja-dialog.component.ts:152`):

```typescript
// ANTES:
const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '500px'
});

// DEBE QUEDAR:
const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '70vw',
  height: '75vh',
  maxWidth: '90vw',
  maxHeight: '90vh'
});
```

Este cambio es **crítico** porque `500px` es insuficiente para el stepper completo.

---

**Fin de la auditoría.**
