# AUDITORÍA DEL PLAN-288 — EJE A: ALCANCE Y CONVENCIONES

**Plan auditado:** `docs/planes/PLAN-288-VALE-DIALOG-LAYOUT.md`  
**Issue:** [#288](https://github.com/GabFrank/frc-gourmet/issues/288) — Diálogo Crear vale/adelanto con overflow horizontal  
**PR:** [#294](https://github.com/GabFrank/frc-gourmet/pull/294) (draft)  
**Rama:** `cursor/fix-288-vale-dialog-layout-2582`  
**Fecha de auditoría:** 2026-09-09  
**Auditor:** Claude (Cloud Agent)

---

## 1. VEREDICTO

**PASS-with-fixes**

El plan es **técnicamente correcto** y la solución propuesta resuelve el problema raíz. Sin embargo, presenta **dos omisiones** que deben corregirse antes de implementar:

1. **Análisis incompleto de callers** (P1) — omite un tercer punto de entrada
2. **Evaluación parcial del overflow del mat-select** (P2) — no considera un escenario edge case documentado en el issue

---

## 2. RESUMEN EJECUTIVO

### ✅ Aciertos principales

1. **Diagnóstico correcto de la causa raíz:** `min-width: 720px` en `.dialog-content` excede el `width: '700px'` del MatDialogConfig desde `pagar-obligaciones-dialog`.
2. **Solución apropiada:** Unificar a 760px y usar `max-width` en vez de `min-width` es la aproximación correcta.
3. **Alcance bien delimitado:** Solo layout UI, sin tocar validaciones, permisos ni backend.
4. **Hot reload suficiente:** Cambios en renderer Angular no requieren reinicio de Electron. ✅
5. **Criterios de aceptación completos:** Incluye verificación en light/dark theme, ambos puntos de entrada, y nombres largos.
6. **Conventional commit correcto:** Formato `fix(rrhh): ...` es apropiado.
7. **Sin `Closes` prematuro:** El PR usa "Relacionado con #288", no "Closes #288". ✅

### ❌ Puntos a corregir

1. **Caller omitido** (P1): El plan identifica solo 2 callers, pero existen 3.
2. **Análisis parcial del mat-select** (P2): El plan menciona el overflow del panel como "edge case" pero no lo resuelve definitivamente.

---

## 3. HALLAZGOS DETALLADOS

### P1 — CALLER OMITIDO: `registrar-egreso-dialog`

**Archivo:** Plan §1, §2  
**Problema:** El plan afirma que hay 2 callers del dialog, pero en realidad son **3**.

**Callers reales:**

```typescript
// ✅ Identificado en el plan
// src/app/pages/rrhh/vales/list-vales.component.ts:192
const ref = this.dialog.open(CreateEditValeDialogComponent, { width: '780px' });

// ✅ Identificado en el plan
// src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.ts:712
ref = this.dialog.open(CreateEditValeDialogComponent, { width: '700px', maxHeight: '90vh', data: {} });

// ❌ NO identificado en el plan
// src/app/pages/financiero/caja-mayor/registrar-egreso-dialog/registrar-egreso-dialog.component.ts:303-305
this.dialog.open(CreateEditValeDialogComponent, {
  width: '760px',
  maxWidth: '95vw',
  data: { modoConfirmar: true, cajaMayorId: this.cajaMayorId },
});
```

**Impacto:**
- El tercer caller **YA usa 760px**, que es justamente el ancho que el plan propone unificar.
- Esto **valida la solución** (760px es el valor correcto, ya está en producción en uno de los flujos).
- **No afecta la implementación** — ese caller ya está bien y no necesita modificación.
- **Pero demuestra análisis incompleto** — el plan no identificó todos los puntos de entrada.

**Recomendación:**  
Actualizar el plan §2 para mencionar el tercer caller con una nota aclaratoria:

```markdown
**Archivos a modificar:**

1. `src/app/pages/rrhh/vales/list-vales.component.ts` línea 192
   - **Antes:** `width: '780px'`
   - **Después:** `width: '760px'`

2. `src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.ts` línea 712
   - **Antes:** `width: '700px'`
   - **Después:** `width: '760px'`

**Caller adicional (ya correcto, no requiere cambio):**

3. `src/app/pages/financiero/caja-mayor/registrar-egreso-dialog/registrar-egreso-dialog.component.ts` línea 303
   - **Actual:** `width: '760px'` ✅ (ya usa el ancho unificado)
   - Este flujo abre el diálogo en `modoConfirmar: true` desde el hub de egresos de Caja Mayor.
   - **No requiere modificación**, pero valida que 760px es el valor correcto en producción.
```

---

### P2 — OVERFLOW DEL MAT-SELECT: ANÁLISIS PARCIAL

**Archivo:** Plan §2 "Fase 3: Verificar mat-select no causa overflow"  
**Problema:** El plan menciona que el panel del `mat-select` "podría ser ancho" si un nombre de funcionario es extremadamente largo, pero **deja la solución como condicional** ("si se observa el problema durante pruebas").

**Evidencia del issue #288:**  
La captura muestra el campo **Funcionario** con un borde rojo que **parece más ancho que el contenedor**. Esto sugiere que el problema NO es solo el `min-width: 720px` del contenedor, sino también el **ancho intrínseco del mat-select**.

**Análisis:**

1. **El trigger del mat-select respetará el ancho del contenedor** con `.full { max-width: 100%; box-sizing: border-box; }`. ✅
2. **El dropdown panel se renderiza en overlay** y puede exceder el ancho del dialog sin causar scroll horizontal en el form. ✅
3. **PERO:** Si el texto del trigger es muy largo, el `mat-select` puede intentar expandirse para mostrarlo completo, empujando el form más allá del ancho disponible.

**Solución proactiva:**

Agregar truncamiento con ellipsis al trigger del mat-select:

```typescript
// En el bloque styles del componente, agregar:
.full mat-select {
  max-width: 100%;
  box-sizing: border-box;
}
.full .mat-mdc-select-trigger {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**Justificación:**  
El plan deja esto como "si se observa el problema", pero la evidencia visual del issue #288 sugiere que el campo Funcionario **ya presenta este síntoma**. Es preferible incluir el truncamiento de entrada en vez de dejarlo como condicional post-pruebas.

**Recomendación:**  
Actualizar el plan §2 "Fase 2" para incluir estilos específicos del mat-select:

```markdown
### Fase 2: Ajustar estilos del contenido

**Archivo:** `src/app/pages/rrhh/vales/create-edit-vale-dialog.component.ts` líneas 133-140

**Cambio en el bloque `styles`:**

```typescript
styles: [`
  .dialog-content { 
    width: 100%; 
    max-width: 720px; 
    box-sizing: border-box; 
  }
  .spinner { display: flex; justify-content: center; padding: 24px; }
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
  /* Truncar texto del mat-select si el nombre es muy largo */
  .full mat-select {
    max-width: 100%;
    box-sizing: border-box;
  }
  .full ::ng-deep .mat-mdc-select-trigger {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fuente-toggle { 
    width: 100%; 
    box-sizing: border-box; 
  }
  .fuente-toggle .mat-button-toggle { flex: 1; }
  .convertido { color: #1565c0; font-size: 14px; align-self: center; }
`],
```

**Nota:** El `::ng-deep` es necesario porque `.mat-mdc-select-trigger` vive dentro del ViewEncapsulation del MatSelect. Angular Material 15 requiere este selector para sobrescribir estilos internos.
```

---

### ✅ VERIFICACIÓN: Alcance solo layout

**Pregunta:** ¿El plan realmente solo toca layout, sin modificar validaciones, permisos, backend ni flujo de vale?

**Respuesta:** **SÍ**. ✅

**Archivos modificados:**
1. `list-vales.component.ts` — Solo el objeto `MatDialogConfig` (width)
2. `pagar-obligaciones-dialog.component.ts` — Solo el objeto `MatDialogConfig` (width)
3. `create-edit-vale-dialog.component.ts` — Solo el bloque `styles: [...]` (string inline)

**NO se toca:**
- ❌ FormGroup validators
- ❌ Handlers IPC (`electron/handlers/vales.handler.ts`)
- ❌ Entities (`vale.entity.ts`)
- ❌ Lógica de submit (`confirmarSaldoSiNegativo`, `crearValeConfirmado`)
- ❌ Permisos (`RRHH_VALE_CREAR`, `RRHH_VALE_CONFIRMAR`)
- ❌ Backend (`vales.handler.ts`, `createVale`, `crearValeConfirmado`)

**Conclusión:** El alcance está bien delimitado. ✅

---

### ✅ VERIFICACIÓN: Convenciones del proyecto

**1. Strings en UPPERCASE en BD**  
No aplica — el plan solo modifica CSS inline y width del dialog. ✅

**2. No funciones en templates**  
No aplica — el plan no toca el template HTML inline del componente. ✅

**3. No colores hardcoded**  
No aplica — el plan no introduce colores nuevos. El color `#1565c0` del `.convertido` ya existe en el componente y no se modifica. ✅

**4. Number formatting: `| number:'1.0-2'`**  
No aplica — el plan no modifica pipes de formato. ✅

**5. No live filtering**  
No aplica — el plan no modifica filtros. ✅

**6. No `mat-sort-header` sin pedido explícito**  
No aplica — el componente no tiene tabla. ✅

**7. Componente de tabla con scroll local (patrón full-height)**  
No aplica — este diálogo no contiene tabla paginada. ✅

**8. Si el componente es muy grande para mat-dialog → convertir a híbrido tab/dialog**  
**Evaluación:** El diálogo `create-edit-vale-dialog` tiene 350 líneas y un formulario de ~10 campos. No es "muy grande" según los criterios de `.claude/skills/frc-gourmet-expert/conventions/ui-patterns.md` §"Componente híbrido tab/dialog" (ese patrón es para tablas con muchas columnas + filtros + paginación).  
**Conclusión:** No se justifica convertir a híbrido tab/dialog. ✅

**9. Confirmaciones: usar `ConfirmationDialogComponent`**  
No aplica — el plan no modifica la lógica de confirmación de saldo negativo. ✅

**10. Acciones en tablas: `mat-menu` + `more_vert`**  
No aplica — este componente no tiene tabla. ✅

**11. Editar solo `.ts`, nunca `.js`**  
✅ El plan solo modifica `.ts`. Los `.js` son autogenerados.

**12. Probar en light y dark theme**  
✅ El plan incluye "Escenario 3: Dark theme" en §4 "Cómo probar".

**13. Avisar si requiere reiniciar la app**  
✅ El plan dice explícitamente "No requiere reinicio (Angular renderer, hot reload suficiente)" en §7.

**14. Conventional commits**  
✅ El plan propone `fix(rrhh): eliminar overflow horizontal en diálogo crear vale/adelanto`.

**Conclusión:** El plan respeta las convenciones del proyecto. ✅

---

### ✅ VERIFICACIÓN: Unificar a 760px es suficiente

**Pregunta:** ¿El plan de unificar a 760px y eliminar `min-width: 720px` es suficiente, o el overflow también viene de mat-select / panelClass / dark theme?

**Respuesta:** **Es suficiente CON el fix del mat-select (hallazgo P2).**

**Análisis:**

1. **Causa raíz confirmada:**  
   `min-width: 720px` (contenido) > `width: 700px` (dialog) → overflow horizontal. ✅

2. **Solución de ancho:**  
   Unificar a 760px elimina la discrepancia. 760px > 720px (max-width del contenido). ✅

3. **Dark theme:**  
   Los estilos globales de `styles.scss` ya manejan `.dark-theme .mat-mdc-dialog-container`. El plan no introduce colores hardcoded. ✅

4. **mat-select panel:**  
   El panel del mat-select se renderiza en **overlay** (`position: absolute` en `cdk-overlay-pane`), NO dentro del `.dialog-content`. Por lo tanto, **no causa scroll horizontal en el form**.  
   PERO: el **trigger** del mat-select (la parte visible en el form) sí puede expandirse si el texto es largo → requiere truncamiento con ellipsis (hallazgo P2). ⚠️

5. **Validación empírica:**  
   `registrar-egreso-dialog.component.ts` YA usa `width: '760px'` en producción sin reportes de overflow. Esto valida que 760px es el valor correcto. ✅

**Conclusión:** 760px es suficiente, PERO debe incluirse el truncamiento del mat-select (hallazgo P2). Con ese fix, la solución es completa.

---

### ✅ VERIFICACIÓN: Criterios de aceptación

**Plan §8:**

1. ✅ No hay scrollbar horizontal en ninguno de los 2 puntos de entrada (lista de vales, pago consolidado)
2. ✅ El campo Funcionario se ve completo sin desbordar el panel
3. ✅ El grid de 2 columnas se mantiene alineado
4. ✅ Los campos `.full` ocupan el ancho completo sin causar overflow
5. ✅ Funciona en light theme y dark theme
6. ✅ El diálogo es visualmente consistente desde ambos puntos de entrada

**No debe romper:**

1. ✅ Validaciones del form
2. ✅ Modo confirmar (campos condicionales)
3. ✅ Submit del form
4. ✅ Confirmación de saldo negativo
5. ✅ Recálculo de cotización

**Conclusión:** Los criterios de aceptación son completos y apropiados. ✅

---

### ✅ VERIFICACIÓN: Pruebas en ambos temas

**Plan §4 "Cómo probar" incluye:**

- Escenario 1: Abrir desde lista de vales (desktop)
- Escenario 2: Abrir desde pago consolidado
- **Escenario 3: Dark theme** — Cambiar a dark theme y repetir escenarios 1 y 2
- Escenario 4: Nombres largos
- Escenario 5: Modo confirmar (temporal, sin caller en desktop actualmente)

**Conclusión:** Las pruebas manuales cubren ambos temas. ✅

---

### ✅ VERIFICACIÓN: Hot reload suficiente

**Plan §7:**

> **Hot reload suficiente**  
> ✅ **SÍ** — Solo se modifican templates inline + estilos inline de un componente Angular standalone.
> 
> **No requiere:**  
> - Reiniciar Electron  
> - Rebuild de TypeScript  
> - Migración de BD  
> 
> **Suficiente con:**  
> - `npm start` corriendo  
> - Guardar los archivos → Angular CLI detecta cambios y recompila  
> - Reabrir el dialog

**Validación contra reglas del repo (CLAUDE.md §14):**

> **Avisar siempre si el cambio requiere reiniciar la app**: backend (`electron/handlers/`, `preload.ts`, `main.ts`, nuevas entidades, `database.config.ts`) → reinicio. Solo Angular templates/scss/ts → hot reload.

**Análisis:**
- ❌ No se toca `electron/handlers/`
- ❌ No se toca `preload.ts`
- ❌ No se toca `main.ts`
- ❌ No se agregan/modifican entidades
- ❌ No se toca `database.config.ts`
- ✅ Solo se modifican estilos inline de un componente Angular

**Conclusión:** Hot reload es suficiente. ✅

---

### ✅ VERIFICACIÓN: Conventional commits

**Plan §3 "Fase 3: Commit + Push":**

```
fix(rrhh): eliminar overflow horizontal en diálogo crear vale/adelanto
```

**Formato correcto:**
- ✅ Tipo: `fix` (corrige un bug)
- ✅ Scope: `rrhh` (el módulo de RRHH, donde vive el componente de vales)
- ✅ Descripción: clara, en español, sin mayúscula inicial, sin punto final

**Alternativa válida:**  
`fix(ui): eliminar overflow horizontal en diálogo crear vale/adelanto`  
(Scope `ui` también es apropiado porque es un fix de layout)

**Conclusión:** El mensaje de commit es correcto. ✅

---

### ✅ VERIFICACIÓN: Sin `Closes` prematuro

**PR #294 body (según `gh pr view 294`):**

```markdown
## Relacionado con

Relacionado con #288
```

**Análisis:**
- ✅ Usa "Relacionado con #288", no "Closes #288"
- ✅ El issue permanecerá abierto hasta que el fix se verifique en pruebas manuales y se mergee a `develop`

**Conclusión:** El PR no cierra el issue prematuramente. ✅

---

## 4. RIESGOS IDENTIFICADOS

### Riesgo R1 — MEDIO: Nombres de funcionarios muy largos

**Descripción:**  
Si un funcionario tiene nombre + apellido > 100 caracteres, el mat-select podría intentar expandir el trigger para mostrarlo completo, causando overflow horizontal.

**Probabilidad:** Media (depende de los datos reales en producción)  
**Impacto:** Bajo (el overflow sería menor, y el dropdown mostraría el texto completo)

**Mitigación:**  
Incluir el truncamiento del mat-select con ellipsis (hallazgo P2). Esto previene el overflow y el texto completo sigue visible en el dropdown.

**Estado:** Identificado en hallazgo P2. ⚠️

---

### Riesgo R2 — BAJO: Resolución de pantalla muy pequeña (< 800px)

**Descripción:**  
En una pantalla < 800px de ancho, el dialog de 760px forzará scroll horizontal en la VENTANA (no en el dialog).

**Probabilidad:** Baja (la app está diseñada para desktop, resolución mínima esperada ~1366x768)  
**Impacto:** Bajo (el dialog sigue siendo usable, solo requiere scroll de ventana)

**Mitigación:**  
El dialog ya tiene `maxWidth: '95vw'` en el tercer caller (`registrar-egreso-dialog`). Considerar agregar `maxWidth: '95vw'` a los otros dos callers si se detecta este problema en pruebas.

**Estado:** Documentado. No requiere acción inmediata. ✅

---

### Riesgo R3 — BAJO: Regresión en `registrar-egreso-dialog`

**Descripción:**  
El tercer caller (`registrar-egreso-dialog`) YA usa 760px. Si el fix rompe algo, afectaría un flujo en producción.

**Probabilidad:** Muy baja (el fix no toca la lógica del componente, solo estilos inline)  
**Impacto:** Medio (afectaría el flujo de registro de egreso desde Caja Mayor)

**Mitigación:**  
Incluir en las pruebas manuales el escenario de abrir el diálogo desde `registrar-egreso-dialog` (hub de egresos de Caja Mayor).

**Estado:** Documentado. Agregar al plan de pruebas. ⚠️

---

## 5. ACCIONES REQUERIDAS ANTES DE IMPLEMENTAR

### Acción A1 — P1: Actualizar el plan con el tercer caller

**Responsable:** Agente implementador  
**Archivo:** `docs/planes/PLAN-288-VALE-DIALOG-LAYOUT.md` §2  
**Cambio:**

Agregar el tercer caller a la sección "Fase 1: Ajustar ancho del dialog (callers)" con la nota de que NO requiere modificación:

```markdown
**Caller adicional (ya correcto, no requiere cambio):**

3. `src/app/pages/financiero/caja-mayor/registrar-egreso-dialog/registrar-egreso-dialog.component.ts` línea 303
   - **Actual:** `width: '760px'` ✅ (ya usa el ancho unificado)
   - Este flujo abre el diálogo en `modoConfirmar: true` desde el hub de egresos de Caja Mayor.
   - **No requiere modificación**, pero valida que 760px es el valor correcto en producción.
```

---

### Acción A2 — P2: Agregar truncamiento del mat-select

**Responsable:** Agente implementador  
**Archivo:** `docs/planes/PLAN-288-VALE-DIALOG-LAYOUT.md` §2  
**Cambio:**

Actualizar el bloque de estilos en "Fase 2" para incluir:

```typescript
  /* Truncar texto del mat-select si el nombre es muy largo */
  .full mat-select {
    max-width: 100%;
    box-sizing: border-box;
  }
  .full ::ng-deep .mat-mdc-select-trigger {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
```

Y agregar una nota explicativa:

```markdown
**Nota sobre `::ng-deep`:** Angular Material 15 encapsula los estilos del `.mat-mdc-select-trigger` dentro del ViewEncapsulation del componente. El `::ng-deep` es necesario para sobrescribir esos estilos internos. Este selector está deprecado pero Angular Material aún lo requiere para este tipo de customización. La alternativa (aplicar estilos globales en `styles.scss`) contaminaría TODOS los mat-select de la app, no solo los de este diálogo.
```

---

### Acción A3 — P2: Agregar escenario de prueba desde `registrar-egreso-dialog`

**Responsable:** Agente implementador  
**Archivo:** `docs/planes/PLAN-288-VALE-DIALOG-LAYOUT.md` §4  
**Cambio:**

Agregar un sexto escenario de prueba:

```markdown
### Escenario 6: Abrir desde hub de egresos (registrar-egreso-dialog)
1. Login como admin con permiso `FINANCIERO_CAJA_MAYOR`
2. Navegar a **Financiero → Caja Mayor → [Seleccionar una caja] → Egresos → Registrar egreso**
3. En el selector de tipo de egreso, elegir **"Registrar Vale"**
4. Click en el botón correspondiente (abre con `width: '760px'` y `modoConfirmar: true`)
5. **Verificar:**
   - ✅ No hay scrollbar horizontal
   - ✅ Campo Funcionario se ve completo sin desbordar
   - ✅ Todos los campos alineados en grid 2 columnas
   - ✅ Campos condicionales (Caja Mayor, Forma de pago) se muestran correctamente en modo confirmar

**Nota:** Este caller YA usa `width: '760px'` en producción. Esta prueba verifica que el fix en los estilos internos del componente no rompe un flujo que ya funcionaba.
```

---

## 6. CONCLUSIÓN

### Veredicto: **PASS-with-fixes**

El plan es **sólido en su núcleo técnico** y la solución propuesta (unificar a 760px + usar `max-width` en vez de `min-width`) resolverá el overflow horizontal reportado en el issue #288.

**Aciertos principales:**
- ✅ Diagnóstico correcto de la causa raíz
- ✅ Solución apropiada y no invasiva
- ✅ Alcance bien delimitado (solo layout UI)
- ✅ Criterios de aceptación completos
- ✅ Respeta convenciones del proyecto
- ✅ Hot reload suficiente
- ✅ Conventional commit correcto
- ✅ Sin `Closes` prematuro

**Correcciones requeridas:**
1. **P1:** Agregar el tercer caller (`registrar-egreso-dialog`) al análisis
2. **P2:** Incluir truncamiento del mat-select con ellipsis para prevenir overflow por nombres largos
3. **P2:** Agregar escenario de prueba desde `registrar-egreso-dialog`

**Riesgos:**
- R1 (MEDIO): Nombres de funcionarios muy largos → mitigado con truncamiento del mat-select
- R2 (BAJO): Resolución de pantalla < 800px → documentado, no requiere acción
- R3 (BAJO): Regresión en `registrar-egreso-dialog` → mitigado con pruebas manuales

### ¿Se puede codear así?

**SÍ**, con las **3 acciones correctivas** (A1, A2, A3) aplicadas antes de implementar.

El plan es ejecutable y la solución es correcta. Las omisiones identificadas son subsanables y no invalidan el enfoque general.

---

**Firmado:**  
Claude (Cloud Agent)  
Auditoría Eje A — Alcance y convenciones  
2026-09-09
