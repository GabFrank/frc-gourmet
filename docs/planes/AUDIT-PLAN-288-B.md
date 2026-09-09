# AUDITORÍA PLAN-288-B: Correctitud contra código real (UI)

**Fecha:** 2026-09-09  
**Auditor:** Claude (Cloud Agent)  
**Plan auditado:** `docs/planes/PLAN-288-VALE-DIALOG-LAYOUT.md`  
**Issue:** [#288](https://github.com/GabFrank/frc-gourmet/issues/288)  
**Rama:** `cursor/fix-288-vale-dialog-layout-2582`  
**PR draft:** [#294](https://github.com/GabFrank/frc-gourmet/pull/294)

---

## VEREDICTO: PASS-with-fixes

El plan es técnicamente correcto en el diagnóstico de la causa raíz y la solución propuesta es válida, **PERO** tiene 3 hallazgos que deben corregirse antes de implementar:

1. **P0 (BLOQUEANTE):** Falta el tercer entry point en el alcance del plan
2. **P1 (CRÍTICO):** Error de cálculo en el margen de seguridad (8px real vs 40px declarado)
3. **P2 (MENOR):** Riesgo no documentado por estilo global que afecta mat-select-panel

---

## 1. Verificación de causa raíz (CONFIRMADA ✅)

### Diagnóstico del plan
El plan identifica que el overflow se produce porque:
- `.dialog-content { min-width: 720px; }` (línea 134 de `create-edit-vale-dialog.component.ts`)
- Dialog abierto con `width: '700px'` desde `pagar-obligaciones-dialog.component.ts` línea 712
- `720px > 700px` → **overflow horizontal**

### Verificación en código real

**Archivo:** `src/app/pages/rrhh/vales/create-edit-vale-dialog.component.ts`

**Líneas 133-140:**
```typescript
styles: [`
  .dialog-content { min-width: 720px; }
  .spinner { display: flex; justify-content: center; padding: 24px; }
  .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: center; }
  .full { grid-column: 1 / -1; }
  .fuente-toggle .mat-button-toggle { flex: 1; }
  .convertido { color: #1565c0; font-size: 14px; align-self: center; }
`],
```

✅ **CONFIRMADO:** `.dialog-content` tiene `min-width: 720px` tal como dice el plan.

**Template líneas 44-50:**
```html
<mat-form-field appearance="outline" class="full">
  <mat-label>Funcionario</mat-label>
  <mat-select formControlName="funcionarioId">
    <mat-option *ngFor="let f of funcionarios" [value]="f.id">
      {{ f.persona?.nombre }} {{ f.persona?.apellido || '' }}
    </mat-option>
  </mat-select>
</mat-form-field>
```

✅ **CONFIRMADO:** El campo Funcionario usa `mat-select` con clase `.full` (grid-column: 1 / -1).

### Padding de mat-dialog-content

**Archivo:** `src/styles.scss` línea 785-788
```scss
.mat-mdc-dialog-content {
  padding: 12px 16px !important;
  max-height: 70vh !important;
}
```

**Cálculo real del overflow:**
- Dialog con `width: '700px'`
- Padding horizontal del mat-dialog-content: 16px × 2 = **32px**
- Ancho disponible para contenido: 700px - 32px = **668px**
- Min-width del contenido: **720px**
- **Overflow:** 720px - 668px = **52px** 🚨

✅ **CAUSA RAÍZ CONFIRMADA:** El `min-width: 720px` excede el espacio disponible en el dialog de 700px, causando scroll horizontal de 52px.

---

## 2. Entry points del diálogo (HALLAZGO P0 ❌)

### Lo que dice el plan (sección 1, líneas 26-30)

> **Llamadas al diálogo:**
> - `list-vales.component.ts` línea 192: `width: '780px'` ✅ funciona (780 > 720)
> - `pagar-obligaciones-dialog.component.ts` línea 712: `width: '700px'` ❌ **overflow** (700 < 720)

El plan **solo menciona 2 entry points**.

### Verificación en código real

Búsqueda de `dialog.open(CreateEditValeDialogComponent`:

**Entry point 1:** `src/app/pages/rrhh/vales/list-vales.component.ts` línea 192
```typescript
const ref = this.dialog.open(CreateEditValeDialogComponent, { width: '780px' });
```
✅ Identificado en el plan.

**Entry point 2:** `src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.ts` línea 712
```typescript
ref = this.dialog.open(CreateEditValeDialogComponent, { width: '700px', maxHeight: '90vh', data: {} });
```
✅ Identificado en el plan.

**Entry point 3 (NO EN EL PLAN):** `src/app/pages/financiero/caja-mayor/registrar-egreso-dialog/registrar-egreso-dialog.component.ts` línea 303-307
```typescript
this.dialog.open(CreateEditValeDialogComponent, {
  width: '760px',
  maxWidth: '95vw',
  data: { cajaMayorId: this.cajaMayorId },
});
```

❌ **HALLAZGO P0:** Este tercer entry point **NO está documentado en el plan**.

**Impacto:**
- Ya usa `width: '760px'`, que es el valor objetivo del plan
- Incluye `maxWidth: '95vw'` (responsive en pantallas pequeñas)
- Pasa `cajaMayorId` en data (el diálogo lo usa para preseleccionar caja)

**Acción requerida:** El plan debe:
1. Documentar este tercer entry point en la sección "Llamadas al diálogo"
2. Confirmar que NO requiere cambios (ya tiene 760px)
3. Incluirlo en los escenarios de prueba (sección 4)

---

## 3. Solución propuesta: cambios en los callers (HALLAZGO P1 ⚠️)

### Lo que dice el plan (sección 2, fase 1, líneas 58-68)

> 1. **`list-vales.component.ts`** línea 192
>    - **Antes:** `width: '780px'`
>    - **Después:** `width: '760px'` (reducir a un valor más conservador y consistente)
>
> 2. **`pagar-obligaciones-dialog.component.ts`** línea 712
>    - **Antes:** `width: '700px'`
>    - **Después:** `width: '760px'` (igualar con el otro caller)
>
> **Justificación:** 760px es suficiente para el grid 2 columnas + gap + padding (≈350px por columna), y deja 40px de margen respecto al `min-width` que tendremos en el contenido.

### Verificación del cálculo

**Con la solución propuesta (`width: 760px` en dialog, `max-width: 720px` en contenido):**

- Ancho del dialog: **760px**
- Padding de mat-dialog-content: 16px × 2 = **32px**
- Ancho disponible para contenido: 760px - 32px = **728px**
- Max-width del contenido: **720px**
- **Margen real:** 728px - 720px = **8px**

❌ **HALLAZGO P1:** El plan dice "deja 40px de margen" (línea 68, también línea 325) pero el margen real es **solo 8px**.

**De dónde sale el error:**
El plan parece calcular: 760px - 720px = 40px, **olvidando restar el padding de 32px** del mat-dialog-content.

**Impacto:**
- **8px es suficiente** para evitar overflow (el contenido no tocará el borde del padding)
- Pero el cálculo erróneo podría generar confusión o falsa sensación de seguridad
- Si en el futuro se agrega padding al `.dialog-content` o `.form`, esos 8px se consumirán rápido

**Acción requerida:**
1. Corregir la justificación en líneas 68 y 325: "deja 8px de margen (760px dialog - 32px padding - 720px contenido)"
2. Evaluar si 8px es suficiente o si se debe aumentar el `width` del dialog a 780px para tener ~28px de margen (780 - 32 - 720 = 28px)

**Recomendación del auditor:** Dejar 760px (8px de margen es suficiente para este caso), pero **documentar correctamente** el cálculo.

---

## 4. Solución propuesta: estilos del contenido (VERIFICADO ✅ con 1 observación)

### Lo que dice el plan (sección 2, fase 2, líneas 73-111)

Cambio de:
```typescript
.dialog-content { min-width: 720px; }
```

A:
```typescript
.dialog-content { 
  width: 100%; 
  max-width: 720px; 
  box-sizing: border-box; 
}
.form { 
  display: grid; 
  grid-template-columns: 1fr 1fr; 
  gap: 12px; 
  align-items: center; 
  width: 100%; 
  box-sizing: border-box; 
}
.full { 
  grid-column: 1 / -1; 
  max-width: 100%; 
  box-sizing: border-box; 
}
.fuente-toggle { 
  width: 100%; 
  box-sizing: border-box; 
}
```

### Verificación

✅ **Solución correcta:**
- Elimina el `min-width: 720px` problemático
- Usa `width: 100%; max-width: 720px;` para que el contenido se ajuste al dialog sin excederlo
- Agrega `box-sizing: border-box` para incluir padding/border en el ancho calculado
- Agrega `max-width: 100%` a `.full` para evitar overflow en campos de ancho completo

✅ **Grid 2 columnas se mantiene:**
- Con 728px disponibles (760 - 32 padding) y `max-width: 720px` en contenido:
- Ancho por columna: (720px - 12px gap) / 2 = **354px por columna**
- Suficiente para mat-form-field con labels y controles

---

## 5. Campo Funcionario y mat-select panel (HALLAZGO P2 ⚠️)

### Lo que dice el plan (sección 2, fase 3, líneas 113-143)

> **Verificación:** El mat-select de Angular Material respeta el ancho del mat-form-field contenedor. Con `.full` teniendo `max-width: 100%` + `box-sizing: border-box`, el select no debería causar overflow.
>
> **Posible edge case:** Si un nombre de funcionario es extremadamente largo, el dropdown panel podría ser ancho, pero el **trigger** (campo visible en el form) respetará el ancho del contenedor.

### Verificación en código real

**Estilo global crítico (NO MENCIONADO EN EL PLAN):**

`src/styles.scss` línea 1190-1192:
```scss
.mat-mdc-select-panel {
  min-width: 100% !important;
}
```

❌ **HALLAZGO P2:** Hay un estilo global que fuerza `min-width: 100%` en **todos** los paneles de mat-select.

**Análisis del impacto:**

1. **Trigger del mat-select (campo visible):** Con `.full { max-width: 100%; box-sizing: border-box; }`, el trigger respetará el ancho del grid → **OK**

2. **Panel desplegable (overlay):** El panel se renderiza en un CDK overlay **fuera del dialog**, por lo que el `min-width: 100%` se refiere al 100% del trigger (el campo Funcionario).
   - Si el trigger tiene 720px de ancho (grid completo `.full`), el panel tendrá mínimo 720px
   - El panel no causa overflow EN EL DIALOG porque está en overlay
   - Pero podría ser visualmente inconsistente si el panel es más ancho que el dialog en pantalla

**Verificación adicional:**
- El trigger tiene clase `.full` → ocupa `grid-column: 1 / -1` → ancho completo del grid
- Con `max-width: 100%` en `.full`, el trigger no excede el contenedor
- El panel overlay respeta el ancho del trigger, no del dialog

✅ **Conclusión:** El estilo global `.mat-mdc-select-panel { min-width: 100% !important; }` **NO causa overflow en el dialog** porque el panel está en overlay. El trigger del campo Funcionario sí respetará el `max-width: 100%` de la clase `.full`.

**Acción requerida:**
1. Documentar en el plan (sección 5, "Qué NO tocar" o en una nota adicional) que existe este estilo global y por qué no interfiere
2. Incluir en los escenarios de prueba (sección 4) la verificación de que el panel del select no se ve "raro" (más ancho o más angosto que el trigger)

---

## 6. Verificación: NO toca handlers, entities ni permisos (VERIFICADO ✅)

### Permisos

El plan menciona permisos solo en:
- Sección 4 (Cómo probar), línea 177: "Login como admin con permiso `RRHH_VALE_CREAR`" → contexto de prueba, **OK**
- Sección 5 (Qué NO tocar), líneas 225-227: "NO tocar permisos (`RRHH_VALE_CREAR`, `RRHH_VALE_CONFIRMAR`)" → restricción explícita, **OK**

✅ **VERIFICADO:** El plan NO propone cambios en permisos.

### Handlers

El plan menciona handlers solo en:
- Sección 5, líneas 223 y 235: "NO cambiar el flujo de submit (handlers `createVale` / `crearValeConfirmado`)" y "NO tocar handlers (`electron/handlers/vales.handler.ts`)" → restricción explícita, **OK**

✅ **VERIFICADO:** El plan NO propone cambios en handlers.

### Entities

El plan menciona entities solo en:
- Sección 5, línea 236-237: "NO tocar entities (`vale.entity.ts`, `motivo-vale.entity.ts`)" y "NO requiere migración" → restricción explícita, **OK**

✅ **VERIFICADO:** El plan NO propone cambios en entidades ni requiere migración.

---

## 7. Verificación: width fijo en select/option panel (NO HAY ❌)

### Búsqueda en estilos

Se verificaron:
- Estilos inline del componente (líneas 133-140): **NO** hay width fijo en select
- Estilos globales (`src/styles.scss`): Solo `min-width: 100%` para `.mat-mdc-select-panel`, **NO** hay width fijo
- Estilos locales de otros componentes que usen `.full`: Usan `width: 100%`, no width fijo

✅ **CONFIRMADO:** NO hay width fijo en el select ni en el option panel que cause overflow. El overflow es **exclusivamente** por el `min-width: 720px` del contenedor vs el `width: 700px` del dialog.

---

## 8. Verificación: ¿760px + max-width 720px deja Funcionario dentro del panel?

### Cálculo paso a paso

**Escenario 1: list-vales.component.ts (después del fix, antes era 780px)**
- Dialog: `width: 760px`
- Padding mat-dialog-content: 32px
- Ancho disponible: 728px
- `.dialog-content`: `max-width: 720px` → ocupa 720px
- Margen: 728 - 720 = 8px
- Campo Funcionario: clase `.full` → `grid-column: 1 / -1` → ocupa los 720px del grid
- ✅ **DENTRO:** 720px < 728px

**Escenario 2: pagar-obligaciones-dialog.component.ts (después del fix, antes era 700px)**
- Dialog: `width: 760px`
- Padding: 32px
- Ancho disponible: 728px
- `.dialog-content`: `max-width: 720px` → ocupa 720px
- Margen: 8px
- Campo Funcionario: 720px
- ✅ **DENTRO:** 720px < 728px

**Escenario 3: registrar-egreso-dialog.component.ts (ya correcto, NO en el plan)**
- Dialog: `width: 760px, maxWidth: '95vw'`
- Igual que escenario 1 y 2
- ✅ **DENTRO:** 720px < 728px

**Con scrollbar del dialog (si existe):**
- La scrollbar vertical (si aparece por contenido largo) ocupa ~17px del ancho del mat-dialog-content
- Ancho disponible con scrollbar: 728 - 17 = 711px
- `.dialog-content`: `max-width: 720px` → pero se ajusta por `width: 100%` → ocupa 711px reales
- ✅ **DENTRO:** El contenido se ajusta automáticamente con `width: 100%`, el `max-width: 720px` solo impide que crezca MÁS allá de 720px cuando hay espacio

✅ **CONFIRMADO:** Con `width: 760px` en el dialog y `max-width: 720px` en el contenido, el campo Funcionario queda dentro del panel en **todos los entry points**, incluso con scrollbar vertical.

---

## 9. Estilos globales que ignoren width 100% en mat-form-field / mat-select (NO HAY ✅)

### Búsqueda exhaustiva

Se buscaron estilos que definan width en mat-form-field o mat-select:

**Estilos locales encontrados (NO GLOBALES):**
- `pagar-obligaciones-dialog.component.scss`: `mat-form-field { min-width: 150px; }` → solo afecta a ese diálogo
- Otros componentes: `min-width` en rangos 130-200px → todos locales

**Estilos globales encontrados:**
- `src/styles.scss` línea 1190: `.mat-mdc-select-panel { min-width: 100% !important; }` → afecta al **panel desplegable**, no al trigger (campo)
- **NO** hay estilos globales que fuercen width fijo en mat-form-field o mat-select trigger

✅ **CONFIRMADO:** NO hay estilos globales que ignoren `width: 100%` en mat-form-field o mat-select. La clase `.full` con `max-width: 100%; box-sizing: border-box;` será respetada.

---

## 10. Resumen de hallazgos

### P0 — BLOQUEANTE (debe corregirse antes de implementar)

**H1.** Falta el tercer entry point en el alcance del plan:
- **Archivo:** `src/app/pages/financiero/caja-mayor/registrar-egreso-dialog/registrar-egreso-dialog.component.ts` línea 303
- **Config actual:** `width: '760px', maxWidth: '95vw'`
- **Acción:** Documentar en el plan (sección 1 "Llamadas al diálogo" y sección 4 "Cómo probar")
- **Impacto:** Sin esta documentación, el plan está incompleto y podría generar confusión al implementador o dejar un caso de prueba sin verificar

### P1 — CRÍTICO (debe corregirse antes de implementar)

**H2.** Error de cálculo en el margen de seguridad:
- **Ubicación:** Líneas 68 y 325 del plan
- **Error:** Dice "deja 40px de margen" pero el margen real es **8px** (760px dialog - 32px padding - 720px contenido = 8px)
- **Acción:** Corregir el cálculo en ambas líneas, justificar por qué 8px es suficiente
- **Impacto:** Puede generar confusión o falsa sensación de seguridad. Si en el futuro se agregan paddings internos, esos 8px se consumirán rápido.

### P2 — MENOR (advertencia, no bloquea implementación)

**H3.** Estilo global `.mat-mdc-select-panel { min-width: 100% !important; }` no documentado:
- **Ubicación:** `src/styles.scss` línea 1190-1192
- **Impacto:** El panel del mat-select Funcionario tendrá mínimo el 100% del ancho del trigger (720px). Esto **NO causa overflow en el dialog** porque el panel está en overlay, pero podría verse visualmente inconsistente en pantallas pequeñas.
- **Acción:** Agregar nota en la sección 2 fase 3 (líneas 113-143) explicando que existe este estilo global y por qué no interfiere con el fix.
- **Impacto:** Sin esta nota, futuros mantenedores podrían confundirse al ver el panel más ancho que el dialog en algunos casos.

---

## 11. Verificación de riesgos

### Riesgo 1: El cambio de 780px a 760px hace el dialog más angosto

**Evaluación del plan (línea 260-262):**
> **Posible:** El cambio de `width: '780px'` a `'760px'` en `list-vales` hace el dialog 20px más angosto. Si algún campo muy largo estaba "justo" antes, podría verse apretado.

✅ **CORRECTO:** Este riesgo está bien identificado. La diferencia es mínima (20px) y el grid `1fr 1fr` se adapta proporcionalmente.

**Verificación adicional:**
- Antes: 780px dialog → 748px disponibles (780-32) → ~354px por columna con max-width 720px en contenido → (720-12)/2 = 354px
- Después: 760px dialog → 728px disponibles (760-32) → ~354px por columna con max-width 720px → (720-12)/2 = 354px
- **Impacto CERO en el ancho por columna** porque el `max-width: 720px` del contenido es el mismo

✅ **Riesgo MITIGADO:** El ancho por columna es idéntico antes y después del fix. El dialog es 20px más angosto pero el contenido mantiene el mismo tamaño.

### Riesgo 2: El select panel desborda en pantallas pequeñas

**NO está en el plan.**

Con `maxWidth: '95vw'` en `registrar-egreso-dialog` (entry point 3), el dialog se adapta a pantallas pequeñas. Pero `list-vales` y `pagar-obligaciones-dialog` **NO tienen maxWidth** en su config.

⚠️ **RIESGO REAL (no bloqueante):** En pantallas < 800px, el dialog de 760px fijo podría exceder el viewport. El usuario podría tener que hacer scroll horizontal en la **página**, no en el dialog.

**Acción requerida:** Considerar agregar `maxWidth: '95vw'` a los dos entry points para hacerlos responsive. **NO ES BLOQUEANTE** para este fix (el issue #288 es sobre overflow dentro del dialog, no en pantallas pequeñas), pero sería una mejora de UX.

---

## 12. Causa raíz: ¿Es solo min-width vs width, o hay otros factores?

### Análisis final

**Factores verificados:**

1. ✅ **min-width del contenido (720px) vs width del dialog (700px):** CAUSA PRINCIPAL confirmada
2. ✅ **Padding de mat-dialog-content (32px):** Reduce el espacio disponible, contribuye al overflow
3. ✅ **Clase `.full` en mat-select Funcionario:** Hereda el ancho del grid (grid-column: 1 / -1), no causa overflow por sí sola
4. ✅ **Estilo global `.mat-mdc-select-panel { min-width: 100% }`:** Afecta al panel overlay, **NO** al trigger del campo, **NO** causa overflow en el dialog
5. ✅ **NO hay width fijo en el select ni option panel**

**Conclusión:**
El overflow es **EXCLUSIVAMENTE** por:
- `min-width: 720px` en `.dialog-content` (componente)
- `width: '700px'` en el `dialog.open()` (pagar-obligaciones-dialog.component.ts)
- Padding de 32px en mat-dialog-content (global)

Resultado: 720px > (700px - 32px) = 720px > 668px → overflow de 52px

✅ **DIAGNÓSTICO DEL PLAN CONFIRMADO Y PRECISO.**

---

## 13. ¿Qué debe corregirse en el plan antes de codear?

### Correcciones OBLIGATORIAS (P0 y P1)

1. **Sección 1, después de línea 30:** Agregar entry point 3:
   ```markdown
   - `registrar-egreso-dialog.component.ts` línea 303: `width: '760px', maxWidth: '95vw'` ✅ funciona (760 > 720, ya correcto)
   ```

2. **Sección 2, línea 68:** Corregir cálculo del margen:
   - **Antes:** "y deja 40px de margen respecto al `min-width` que tendremos en el contenido."
   - **Después:** "y deja 8px de margen respecto al `max-width` que tendremos en el contenido (760px dialog - 32px padding de mat-dialog-content - 720px contenido = 8px). Este margen es suficiente para evitar overflow incluso con scrollbar vertical."

3. **Sección 3, fase 1:** Actualizar la lista de archivos:
   ```markdown
   ### Fase 1: Ajustar llamadas al dialog (2 archivos .ts)
   - Modificar width de `'780px'` a `'760px'` en `list-vales.component.ts`
   - Modificar width de `'700px'` a `'760px'` en `pagar-obligaciones-dialog.component.ts`
   - Verificar (sin modificar) que `registrar-egreso-dialog.component.ts` ya usa `'760px'` correctamente
   ```

4. **Sección 4, agregar escenario entre 2 y 3:**
   ```markdown
   ### Escenario 2b: Abrir desde hub de egresos de Caja Mayor
   1. Login como admin
   2. Navegar a **Financiero → Caja Mayor → Egresos** (o abrir el hub de operaciones)
   3. Click en **Registrar vale**
   4. **Verificar:**
      - ✅ No hay scrollbar horizontal
      - ✅ Campo Funcionario se ve completo sin desbordar
      - ✅ El dialog se adapta en pantallas < 800px (tiene maxWidth: '95vw')
   ```

5. **Sección 9, línea 325:** Corregir el mismo cálculo erróneo:
   - **Antes:** "- Margen de 40px respecto a `max-width: 720px` del contenido → evita que el contenido alcance el borde"
   - **Después:** "- Margen de 8px respecto a `max-width: 720px` del contenido (considerando padding de 32px) → evita que el contenido alcance el borde del padding"

### Correcciones RECOMENDADAS (P2)

6. **Sección 2, fase 3, después de línea 128:** Agregar nota sobre estilo global:
   ```markdown
   **Nota sobre estilo global:** Existe un estilo global en `src/styles.scss` línea 1190 que define `.mat-mdc-select-panel { min-width: 100% !important; }`. Esto hace que el panel desplegable del mat-select tenga mínimo el 100% del ancho del trigger. **NO causa overflow en el dialog** porque el panel se renderiza en un CDK overlay (fuera del dialog), y el trigger del campo Funcionario respetará el `max-width: 100%` de la clase `.full`.
   ```

7. **Sección 6, línea 260:** Aclarar que el riesgo de regresión es CERO:
   ```markdown
   ### Regresión potencial
   - **Ninguna esperada:** Aunque el dialog pasa de 780px a 760px en `list-vales`, el contenido mantiene el mismo ancho (720px máximo), por lo que el ancho por columna del grid es idéntico antes y después del fix (354px).
   ```

---

## VEREDICTO FINAL: PASS-with-fixes

### Resumen ejecutivo

El plan **PASS** la auditoría con **5 correcciones obligatorias** (P0/P1) y **2 recomendaciones** (P2).

✅ **Diagnóstico de causa raíz:** Correcto y preciso  
✅ **Solución propuesta:** Técnicamente válida y funcionará  
✅ **Alcance:** No toca handlers, entities ni permisos (correcto)  
❌ **Completitud:** Falta el tercer entry point (crítico)  
❌ **Precisión técnica:** Error de cálculo en el margen (8px ≠ 40px)  
⚠️ **Documentación:** Falta mencionar estilo global de mat-select-panel  

**Antes de implementar:**
1. Corregir líneas 30, 68, 150-151, 325 (cálculo del margen)
2. Agregar entry point 3 en secciones 1, 3 y 4
3. Agregar nota sobre estilo global (opcional pero recomendado)

**Después de corregir:** El plan estará listo para implementar con confianza.

---

**Fecha de auditoría:** 2026-09-09  
**Auditor:** Claude Sonnet 4.5 (Cloud Agent)  
**Estado:** COMPLETA
