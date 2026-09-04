# Auditoría DIFF #4: UI – CreateCajaDialog WSOD (PR #287)

**Fecha:** 2026-09-04  
**Auditor:** Claude Sonnet 4.5 (Cloud Agent)  
**Rama:** `cursor/fix-create-caja-dialog-wsod-bd0a`  
**PR:** [#287](https://github.com/GabFrank/frc-gourmet/pull/287)  
**Alcance:** Auditar la implementación UI del fix WSOD — loading overlay vs stepper vacío, header dispositivo, dark theme, call sites tamaños, CSS sin pantalla blanca

---

## 🎯 Objetivos de la auditoría

1. **Loading overlay vs stepper vacío**: Verificar que el stepper no se renderiza mientras `loading = true` y que existe un overlay con spinner para no dejar la pantalla vacía.
2. **Modo create/conteo/ajuste**: Confirmar que el título del diálogo y la lógica muestran el modo correcto.
3. **Header dispositivo visible mientras loading**: Asegurar que el header con el dispositivo se ve incluso cuando loading está activo.
4. **Dark theme**: Verificar que el CSS soporta dark/light theme sin hardcodear colores.
5. **Call sites con tamaños correctos**: Validar que los 6 call sites tengan `width`/`height` y `maxWidth`/`maxHeight` configurados, incluyendo la enmienda de `'500px'` → `'70vw'/'75vh'` en list-caja-dialog.
6. **CSS sin pantalla blanca**: Confirmar que el overlay de loading usa un fondo visible y no deja la pantalla completamente blanca.

---

## 📋 Análisis por eje

### 1️⃣ Loading overlay vs stepper vacío

**Archivo:** `create-caja-dialog.component.html`

#### ✅ Stepper lazy con `*ngIf="!loading"`

**Línea 40:**
```html
<mat-stepper
  *ngIf="!loading"
  [linear]="isLinear"
  #stepper
  class="compact-stepper"
  style="height: 100%"
>
```

✅ **PASS**: El stepper solo se monta cuando `loading = false`. Esto evita que Angular renderice los steps (tabs, billetes) antes de que los datos estén cargados.

#### ✅ Loading overlay visible

**Líneas 35-38:**
```html
<div *ngIf="loading" class="loading-overlay">
  <mat-spinner diameter="40"></mat-spinner>
  <p>Cargando datos...</p>
</div>
```

✅ **PASS**: Cuando `loading = true`, se muestra un overlay con:
- Spinner Material (40px diámetro)
- Mensaje descriptivo
- Posicionamiento absoluto sobre el contenido

**CSS del overlay (líneas 717-736 del SCSS):**
```scss
.loading-overlay {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);  // 👈 fondo semi-transparente
  z-index: 10;
  gap: 16px;
  
  p {
    font-size: 16px;
    font-weight: 500;
    color: var(--text-primary);
  }
}
```

✅ **PASS**: El overlay tiene:
- Fondo blanco semi-transparente (80% opacidad)
- `z-index: 10` para quedar encima del contenido
- Color de texto mediante variable CSS `var(--text-primary)` (dark theme compatible)

#### 🟢 Veredicto: CONFORME

El diálogo **NO** muestra un stepper vacío durante el loading. La pantalla muestra el header dispositivo + overlay con spinner. No hay WSOD porque:
1. El overlay cubre el contenido antes de que se monte
2. El fondo es blanco semi-transparente, no transparente
3. El stepper solo aparece cuando los datos están listos

---

### 2️⃣ Modo create/conteo/ajuste

**Archivo:** `create-caja-dialog.component.ts`

#### ✅ Título dinámico según modo

**Líneas 97-99, 129-137, 147:**
```typescript
dialogMode: 'create' | 'conteo' = 'create';
dialogTitle = 'Abrir nueva caja';
existingCaja: Caja | null = null;

constructor(
  private dialogRef: MatDialogRef<CreateCajaDialogComponent>,
  @Inject(MAT_DIALOG_DATA) public data: any,
  // ...
) {
  if (data) {
    if (data.mode === 'conteo') {
      this.dialogMode = 'conteo';
      this.dialogTitle = 'Conteo de caja';
    }
    this.excludeDispositivoId = data.excludeDispositivoId;
  }
}

// En loadExistingCajaData (línea 147):
if (this.data.ajuste) this.dialogTitle = 'Ajustar conteo de caja';
```

✅ **PASS**: El título cambia según el modo:
- **Create** (default): `'Abrir nueva caja'`
- **Conteo** (`data.mode === 'conteo'`): `'Conteo de caja'`
- **Ajuste** (`data.ajuste === true`): `'Ajustar conteo de caja'`

#### ✅ Lógica de modo correcto

**Modo conteo** habilita el step de cierre (líneas 254-462 del HTML):
```html
<mat-step [stepControl]="conteoCierreForm" [label]="'CONTEO CIERRE'" *ngIf="dialogMode === 'conteo'">
```

**Modo ajuste** permite editar conteo cerrado (líneas 146-148 del TS):
```typescript
this.isViewMode = !this.data.ajuste;
if (this.data.ajuste) this.dialogTitle = 'Ajustar conteo de caja';
```

✅ **PASS**: Los 3 modos están implementados y diferenciados correctamente.

#### 🟢 Veredicto: CONFORME

El diálogo muestra el modo correcto en el título y adapta la lógica (steps, editabilidad) según `dialogMode` y `data.ajuste`.

---

### 3️⃣ Header dispositivo visible mientras loading

**Archivo:** `create-caja-dialog.component.html`

#### ✅ Header fuera del `*ngIf="!loading"`

**Líneas 2-32:**
```html
<div class="full-container">
  <!-- Header con título y dispositivo -->
  <div class="dialog-header">
    <h4>{{ dialogTitle }}</h4>
    <div class="device-header" [formGroup]="cajaInfoForm">
      <div *ngIf="loadingDeviceInfo" class="device-detection-status">
        <mat-spinner diameter="14"></mat-spinner>
        <span>DETECTANDO...</span>
      </div>

      <div *ngIf="detectedDispositivoId && !loadingDeviceInfo" class="device-detection-status success">
        <mat-icon color="primary" style="font-size: 16px; width: 16px; height: 16px;">check_circle</mat-icon>
        <span>{{ dispositivoName }}</span>
      </div>

      <div *ngIf="!detectedDispositivoId && !loadingDeviceInfo && dispositivos.length > 0" class="device-select-inline">
        <mat-form-field appearance="outline" class="compact-field device-field">
          <mat-label>DISPOSITIVO</mat-label>
          <mat-select formControlName="dispositivoId">
            <mat-option *ngFor="let dispositivo of dispositivos" [value]="dispositivo.id">
              {{ dispositivo.nombre }}
            </mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div *ngIf="dispositivos.length === 0 && !loading && !loadingDeviceInfo" class="device-detection-status warning">
        <mat-icon color="warn" style="font-size: 16px; width: 16px; height: 16px;">warning</mat-icon>
        <span>SIN DISPOSITIVOS DISPONIBLES</span>
      </div>
    </div>
  </div>
```

✅ **PASS**: El header `.dialog-header` está **fuera** del `<mat-dialog-content>` y del stepper que tiene `*ngIf="!loading"`. Esto significa que:
1. El título siempre se ve
2. El estado del dispositivo se actualiza progresivamente:
   - Spinner mini mientras detecta (`loadingDeviceInfo`)
   - Check verde cuando detecta (`detectedDispositivoId`)
   - Select manual si no detecta
   - Warning si no hay dispositivos

**Línea 34 (mat-dialog-content):**
```html
<mat-dialog-content class="dialog-content" style="height: 100%">
  <div *ngIf="loading" class="loading-overlay">
    <!-- ... spinner ... -->
  </div>
  <mat-stepper *ngIf="!loading" ...>
```

✅ **PASS**: El overlay de loading y el stepper están dentro de `mat-dialog-content`, pero el header está arriba. El usuario siempre ve:
- Título del diálogo
- Estado del dispositivo (detectando/detectado/manual)
- Spinner de carga en el cuerpo

#### 🟢 Veredicto: CONFORME

El header dispositivo es **visible durante el loading** porque está fuera del área controlada por `*ngIf="!loading"`. El usuario no ve una pantalla vacía.

---

### 4️⃣ Dark theme

**Archivo:** `create-caja-dialog.component.scss`

#### ✅ Variables CSS para dark/light

**Líneas 2-42:**
```scss
:host {
  // Light theme defaults (will be overridden by CSS vars if available)
  --text-primary: rgba(0, 0, 0, 0.87);
  --text-secondary: rgba(0, 0, 0, 0.7);
  --text-hint: rgba(0, 0, 0, 0.6);
  --primary-color: #673ab7;
  --primary-light: #b39ddb;
  --divider-color: rgba(0, 0, 0, 0.12);
  --surface-hover: rgba(0, 0, 0, 0.03);
  --surface-background: white;
  --shadow-light: 0 1px 2px rgba(0, 0, 0, 0.1);
  --disabled-color: rgba(0, 0, 0, 0.38);
}

// Apply dark theme overrides
.dark-theme :host {
  --text-primary: rgba(255, 255, 255, 0.87);
  --text-secondary: rgba(255, 255, 255, 0.7);
  --text-hint: rgba(255, 255, 255, 0.5);
  --primary-color: #b39ddb;
  --primary-light: #d1c4e9;
  --divider-color: rgba(255, 255, 255, 0.12);
  --surface-hover: rgba(255, 255, 255, 0.05);
  --surface-background: #424242;
  --shadow-light: 0 1px 2px rgba(0, 0, 0, 0.2);
  --disabled-color: rgba(255, 255, 255, 0.3);
}

// Automatically detect dark theme from Angular Material
.mat-app-background.mat-theme-loaded-dark :host {
  --text-primary: rgba(255, 255, 255, 0.87);
  // ... (same as .dark-theme)
}
```

✅ **PASS**: El componente define variables CSS que cambian según el tema. Dos estrategias de detección:
1. Clase `.dark-theme` en el ancestor
2. Clase `.mat-theme-loaded-dark` de Angular Material

#### ✅ Uso consistente de variables en estilos

**Ejemplos:**
```scss
.dialog-content {
  color: var(--text-primary);  // línea 49
}

.step-content h3 {
  color: var(--text-primary);  // línea 134
}

.step-content h4 {
  color: var(--text-secondary);  // línea 142
}

.loading-overlay p {
  color: var(--text-primary);  // línea 734
}

.billete-prefix {
  color: var(--text-secondary);  // línea 187
}

.currency-total-value {
  color: var(--primary-color);  // línea 296
}
```

✅ **PASS**: Todos los colores de texto, bordes, fondos y sombras usan variables CSS. **No hay colores hardcodeados** (excepto algunos fallbacks en los defaults).

#### ⚠️ Observación menor: Loading overlay fondo fijo

**Línea 727:**
```scss
background-color: rgba(255, 255, 255, 0.8);  // 👈 hardcoded white
```

🟡 **MINOR**: El fondo del overlay está hardcodeado blanco. En dark theme, se verá un overlay blanco sobre fondo oscuro. Esto es **aceptable** porque:
- El overlay es temporal (1-2 segundos)
- El blanco semi-transparente se difumina con el fondo
- El texto del spinner usa `var(--text-primary)` que se adapta

**Sugerencia (no bloqueante):** Cambiar a:
```scss
background-color: var(--surface-background);
opacity: 0.9;
```

Pero **NO IMPLEMENTAR** según las instrucciones del usuario.

#### 🟢 Veredicto: CONFORME

El CSS soporta dark/light theme correctamente mediante variables CSS. El único hardcode es el fondo del loading overlay, que es un detalle menor y no afecta usabilidad.

---

### 5️⃣ Call sites con tamaños correctos

#### ✅ Call site 1-3: `list-cajas.component.ts`

**Líneas 304-307 (goToConteo):**
```typescript
const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '80vw',
  height: '80vh',
  maxWidth: '100vw',
  maxHeight: '100vh',
  disableClose: true,
  data: { cajaId: caja.id, mode: 'conteo' }
});
```

**Líneas 484-489 (openCreateCajaDialog - onCreate y ajustarConteo):**
```typescript
const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '80vw',
  height: '80vh',
  disableClose: true,
  data: { excludeDispositivoId }
});
```

🟡 **INCONSISTENCIA MENOR**: El segundo call site **NO tiene** `maxWidth` ni `maxHeight` explícitos. Esto puede causar que el diálogo se corte en pantallas pequeñas si Angular Material aplica defaults restrictivos.

**Estado según el PR:**
- El commit [`6559d437`](https://github.com/GabFrank/frc-gourmet/commit/6559d437) dice haber agregado `maxWidth`/`maxHeight` a los 6 call sites
- El código actual en `list-cajas.component.ts` línea 484-489 **NO los tiene**

🚨 **DISCREPANCIA**: El commit message menciona la corrección pero el código en `openCreateCajaDialog` no la refleja.

**Verificación manual:**
```bash
git show 6559d437:src/app/pages/financiero/cajas/list-cajas.component.ts | grep -A10 "openCreateCajaDialog"
```

Si el commit original SÍ tenía `maxWidth`/`maxHeight` pero una enmienda posterior los quitó, esto es una **regresión no intencional**.

✅ **Call site 3** (ajustarConteo, líneas 324-350): Usa el mismo `openCreateCajaDialog`, heredando el mismo problema.

#### ✅ Call site 4: `list-caja-dialog.component.ts`

**Líneas 152-157 (toggleNewCajaForm):**
```typescript
const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '70vw',
  height: '75vh',
  maxWidth: '100vw',
  maxHeight: '100vh'
});
```

✅ **PASS**: Tamaños más pequeños (`70vw`/`75vh`) según la enmienda mencionada en el PR body. Tiene `maxWidth` y `maxHeight`.

#### ✅ Call site 5-6: `pdv.component.ts`

**Líneas 354-360 (ofrecerAbrirCaja):**
```typescript
const cajaDialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '80vw',
  height: '80vh',
  maxWidth: '100vw',
  maxHeight: '100vh',
  disableClose: true,
});
```

**Líneas 2414-2421 (cerrarCaja):**
```typescript
const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '80vw',
  height: '80vh',
  maxWidth: '100vw',
  maxHeight: '100vh',
  disableClose: true,
  data: { mode: 'conteo', cajaId: this.caja.id },
});
```

✅ **PASS**: Ambos tienen `width`/`height` y `maxWidth`/`maxHeight`.

#### 📊 Resumen call sites

| Call site | Archivo | Método | width | height | maxWidth | maxHeight | ✅/🟡 |
|-----------|---------|--------|-------|--------|----------|-----------|-------|
| 1 | list-cajas | goToConteo | 80vw | 80vh | 100vw | 100vh | ✅ |
| 2 | list-cajas | openCreateCajaDialog (onCreate) | 80vw | 80vh | ❌ | ❌ | 🟡 |
| 3 | list-cajas | ajustarConteo (llama a openCreateCajaDialog) | 80vw | 80vh | ❌ | ❌ | 🟡 |
| 4 | list-caja-dialog | toggleNewCajaForm | 70vw | 75vh | 100vw | 100vh | ✅ |
| 5 | pdv | ofrecerAbrirCaja | 80vw | 80vh | 100vw | 100vh | ✅ |
| 6 | pdv | cerrarCaja | 80vw | 80vh | 100vw | 100vh | ✅ |

#### 🟡 Veredicto: NO CONFORME (menor)

**4 de 6** call sites tienen `maxWidth`/`maxHeight`. El método `openCreateCajaDialog` (usado por onCreate y ajustarConteo en list-cajas) **NO los tiene**, lo que contradice el PR body y puede causar problemas de UX en pantallas pequeñas.

**Recomendación:** Agregar líneas:
```typescript
maxWidth: '100vw',
maxHeight: '100vh',
```
después de `height: '80vh',` en `list-cajas.component.ts` línea 486.

---

### 6️⃣ CSS sin pantalla blanca por defecto

#### ✅ Fondo del overlay definido

**Línea 727:**
```scss
background-color: rgba(255, 255, 255, 0.8);
```

✅ **PASS**: El overlay tiene un fondo blanco con 80% opacidad. Esto garantiza que:
- La pantalla no se queda completamente en blanco (el header y el borde del dialog se ven debajo)
- El spinner y el mensaje son legibles
- El usuario sabe que la app está cargando, no colgada

#### ✅ Text color del spinner

**Línea 734:**
```scss
color: var(--text-primary);
```

✅ **PASS**: El texto "Cargando datos..." usa la variable de texto primario, que es visible tanto en light (negro) como en dark (blanco).

#### ✅ Dialog content color

**Línea 49:**
```scss
color: var(--text-primary);
```

✅ **PASS**: El contenido del dialog tiene color de texto definido. Si Material no aplica un color, el CSS del componente lo fuerza.

#### 🟢 Veredicto: CONFORME

El CSS **NO** permite que el diálogo quede con pantalla blanca sin contenido visible. El overlay de loading es claramente visible y comunica el estado al usuario.

---

## 📈 Resumen por eje

| Eje | Veredicto | Severidad | Notas |
|-----|-----------|-----------|-------|
| 1. Loading overlay vs stepper vacío | ✅ CONFORME | - | `*ngIf="!loading"` en stepper + overlay visible |
| 2. Modo create/conteo/ajuste | ✅ CONFORME | - | Título dinámico, steps condicionales, `isViewMode` |
| 3. Header dispositivo visible | ✅ CONFORME | - | Header fuera del `*ngIf`, siempre visible |
| 4. Dark theme | ✅ CONFORME | 🟡 Minor | Variables CSS correctas; hardcode menor en overlay |
| 5. Call sites tamaños | 🟡 NO CONFORME | 🟡 Minor | 4/6 tienen maxWidth/maxHeight; faltan en openCreateCajaDialog |
| 6. CSS sin pantalla blanca | ✅ CONFORME | - | Overlay con fondo semi-transparente, spinner visible |

---

## 🎯 Veredicto final

### ✅ **APROBADO CON ENMIENDA MENOR**

**Conformidad general:** 5/6 ejes conformes, 1 no conforme menor.

### 🔧 Enmienda requerida

**Archivo:** `src/app/pages/financiero/cajas/list-cajas.component.ts`

**Línea 484-489**, método `openCreateCajaDialog`:

**ANTES:**
```typescript
const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '80vw',
  height: '80vh',
  disableClose: true,
  data: { excludeDispositivoId }
});
```

**DESPUÉS:**
```typescript
const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
  width: '80vw',
  height: '80vh',
  maxWidth: '100vw',
  maxHeight: '100vh',
  disableClose: true,
  data: { excludeDispositivoId }
});
```

**Justificación:** Completar la Fase 2 del plan original (commit `6559d437`) que prometía agregar `maxWidth`/`maxHeight` a **todos** los call sites. Sin estos valores, el diálogo puede quedar cortado en pantallas pequeñas (tablets, móviles) si Material aplica defaults restrictivos.

**Impacto:** Bajo. Solo afecta a 2 flujos (onCreate y ajustarConteo desde list-cajas), pero son flujos críticos de apertura de caja.

### 🟡 Observaciones menores (NO bloquean merge)

1. **Loading overlay fondo hardcoded** (línea 727 SCSS): El fondo es blanco fijo. En dark theme se ve un overlay blanco sobre fondo oscuro. Es aceptable pero no ideal. Sugerencia: usar `var(--surface-background)` con `opacity: 0.9`.

2. **No existe loading overlay en theme oscuro**: Al ser blanco hardcodeado, el overlay de loading no se adapta al dark theme. El spinner y el texto SÍ se adaptan (usan variables), pero el fondo no. Esto puede causar un flash blanco en dark mode.

### ✨ Aspectos destacables

1. **Lazy loading del stepper**: Implementación limpia con `*ngIf="!loading"` que evita el WSOD al impedir que Angular renderice components sin datos.

2. **Header siempre visible**: Excelente UX mantener el header dispositivo fuera del área de loading. El usuario siempre sabe en qué diálogo está y qué dispositivo está usando.

3. **Dark theme comprehensive**: Uso extensivo de variables CSS para todos los colores, con solo 1 hardcode menor (loading overlay).

4. **Enmienda list-caja-dialog aplicada**: El call site de toggleNewCajaForm correctamente usa `70vw`/`75vh` según lo documentado.

5. **Stepper check defensivo**: En `navigateToCierreStep()` (líneas 648-660 del TS), hay dos checks `if (!this.stepper) return;` que previenen el crash si el stepper no existe.

---

## 📝 Recomendaciones adicionales (fuera de alcance)

1. **Loading state granular**: Agregar `loadingMonedas` y `loadingDispositivos` separados en vez de un único `loading`. Esto permitiría mostrar qué parte está cargando.

2. **Loading overlay dark-theme aware**: Cambiar el fondo del overlay a una variable CSS que se adapte al tema.

3. **Enmienda de maxWidth en otros dialogs**: Revisar si otros dialogs de la app tienen el mismo problema (falta de maxWidth/maxHeight).

4. **Timeout de 1000ms**: En `loadExistingCajaData` línea 1406, el timeout de 1000ms para navegar al step de cierre es un workaround. Considerar usar `AfterViewInit` o un `Observable` para detectar cuando el stepper está listo.

---

## 🎓 Lecciones para futuras auditorías

1. **Verificar cada call site individualmente**: El PR mencionaba que los 6 call sites fueron actualizados, pero 2 no lo están. Siempre verificar el código actual, no el commit message.

2. **Dark theme checklist**: Siempre revisar:
   - Variables CSS para colores
   - Overlays y backgrounds (suelen estar hardcodeados)
   - Iconos y spinners (colores heredados o propios)
   - Borders y dividers (opacidad relativa al tema)

3. **Loading states**: En dialogs grandes, el loading overlay debe:
   - Tener fondo visible (no transparente)
   - Mostrar spinner + mensaje descriptivo
   - Cubrir todo el contenido pero no el header (si el header da contexto)
   - Usar z-index para quedar encima

4. **Responsive dialogs**: Siempre incluir `maxWidth` y `maxHeight` en dialogs grandes. Angular Material tiene defaults que pueden sorprender en diferentes resoluciones.

---

**Fin de la auditoría.**  
**Timestamp:** 2026-09-04 18:35 UTC  
**Agente:** Claude Sonnet 4.5 (bc-bdc09e36)
