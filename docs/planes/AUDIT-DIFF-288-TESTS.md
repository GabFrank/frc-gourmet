# AUDITORÍA DIFF PR #294 — EJE 3: PODER DISCRIMINANTE DE TESTS

**PR auditado:** [#294](https://github.com/GabFrank/frc-gourmet/pull/294)  
**Rama:** `cursor/fix-288-vale-dialog-layout-2582`  
**Issue:** [#288](https://github.com/GabFrank/frc-gourmet/issues/288) — Diálogo Crear vale/adelanto con overflow horizontal  
**Fecha de auditoría:** 2026-09-09  
**Auditor:** Claude (Cloud Agent)  
**Eje:** Poder discriminante de tests — ¿cubren el bug reportado?

---

## VEREDICTO: COBERTURA INSUFICIENTE PERO ACEPTABLE

**Resumen ejecutivo:**
- ❌ **No hay test nuevo** en el PR que valide el fix del overflow
- ❌ **No hay test existente** para el componente `CreateEditValeDialogComponent`
- ⚠️ **No es automatizable de forma práctica** — el bug es visual CSS (overflow horizontal)
- ✅ **Aceptable para CSS puro** — condicionado a verificación manual en los 3 callers

**Condición de cierre:** El merge y cierre del issue #288 depende de **prueba visual manual** en los 3 puntos de entrada del diálogo (list-vales, pagar-obligaciones-dialog, registrar-egreso-dialog).

---

## 1. ANÁLISIS DEL DIFF: ¿Hay tests nuevos?

### Archivos modificados en el PR

```
docs/planes/AUDIT-PLAN-288-A.md                 [NUEVO]
docs/planes/AUDIT-PLAN-288-B.md                 [NUEVO]
docs/planes/PLAN-288-VALE-DIALOG-LAYOUT.md      [NUEVO]
src/.../pagar-obligaciones-dialog.component.ts  [MODIFICADO]
src/.../create-edit-vale-dialog.component.ts    [MODIFICADO]
src/.../list-vales.component.ts                 [MODIFICADO]
```

### Cambios de código

**1. `pagar-obligaciones-dialog.component.ts` línea 712:**
```typescript
- ref = this.dialog.open(CreateEditValeDialogComponent, { width: '700px', maxHeight: '90vh', data: {} });
+ ref = this.dialog.open(CreateEditValeDialogComponent, { width: '760px', maxHeight: '90vh', data: {} });
```

**2. `create-edit-vale-dialog.component.ts` líneas 133-161:**
```typescript
// ANTES
styles: [`
  .dialog-content { min-width: 720px; }
  // ...
`],

// DESPUÉS
styles: [`
  .dialog-content { 
    width: 100%; 
    max-width: 720px; 
    box-sizing: border-box; 
  }
  // ... (agrega box-sizing y truncamiento de mat-select)
`],
```

**3. `list-vales.component.ts` línea 192:**
```typescript
- const ref = this.dialog.open(CreateEditValeDialogComponent, { width: '780px' });
+ const ref = this.dialog.open(CreateEditValeDialogComponent, { width: '760px' });
```

### Conclusión 1: ❌ NO hay tests nuevos

**Hallazgo:** El PR **NO incluye** archivos `*.spec.ts` nuevos ni modificaciones a tests existentes.

---

## 2. TESTS EXISTENTES: ¿Cubren el diálogo vale?

### Búsqueda de tests para `CreateEditValeDialogComponent`

**Glob pattern:** `**/*vale*spec.ts`, `**/*create-edit-vale*spec.ts`

**Resultado:**
- `projects/mobile/.../vale-nuevo.payload.spec.ts` — Mobile PWA, NO es el diálogo desktop
- `projects/mobile/.../confirmar-vale-dialog.spec.ts` — Mobile PWA, otro componente
- `projects/mobile/.../vales-list.spec.ts` — Mobile PWA, listado

**Grep:** `CreateEditValeDialogComponent` en archivos `*.spec.ts`

**Resultado:** ❌ **0 matches**

### Test E2E backend: `scripts/test-funcionario-vales-e2e.ts`

**Contenido:**
```typescript
/**
 * E2E: funcionario que también es cliente — impacto en liquidaciones.
 * Ejercita los handlers REALES contra SQLite, validando:
 *  A) Liquidación de sueldo descuenta el consumo a crédito (CPC)
 *  B) Liquidación final netea deudas en prioridad
 *  C) Handlers de resumen financiero y vínculo cliente->funcionario.
 */
```

**¿Cubre el diálogo UI?** ❌ **NO** — solo prueba handlers backend (`createVale`, `crearValeConfirmado`, etc.). No arranca Electron, no abre diálogos, no verifica layout.

### Test del caller: `pagar-obligaciones-dialog.component.spec.ts`

**Contenido:**
```typescript
describe('PagarObligacionesDialogComponent', () => {
  // ... tests de payload, descuento, filtros, etc.
});
```

**¿Cubre el diálogo vale?** ⚠️ **Parcial** — verifica que el **caller** abre el diálogo correctamente:

```typescript
it('el pago de un gasto manda el mismo payload de siempre', async () => {
  await crear(PagoConcepto.GASTO, GASTOS, []);
  // ...
  await component.confirmar();
  // Verifica payload del backend, NO el layout del diálogo
});
```

Usa `spyOn((component as any).dialog as MatDialog, 'open')` con stub → **NO renderiza el diálogo real**, solo verifica que se llama `dialog.open()` con los parámetros correctos.

**Conclusión parcial:** Este test **NO cubre** el overflow CSS del diálogo `CreateEditValeDialogComponent`.

### Conclusión 2: ❌ NO hay tests existentes que cubran el layout del diálogo

---

## 3. INFRAESTRUCTURA DE TESTS E2E: ¿Se puede automatizar?

### Playwright E2E

**Archivo:** `playwright.config.ts`

**Tests existentes:**
1. `e2e/smoke.spec.ts` — Verifica que Electron arranca y muestra el login
2. `e2e/window-chrome.spec.ts` — (inferido del config)

**Contenido de `smoke.spec.ts`:**
```typescript
test('Electron arranca y muestra el login', async () => {
  const electronApp = await electron.launch({ args: [path.join(__dirname, '..', 'main.js')] });
  const window = await electronApp.firstWindow({ timeout: 30_000 });
  await window.waitForLoadState('domcontentloaded');
  const title = await window.title();
  expect(title.length).toBeGreaterThan(0);
  // ...
});
```

**¿Hay tests E2E de diálogos?** ❌ **NO** — los 2 tests existentes son **smoke tests básicos** que solo verifican que la app arranca. No navegan a pantallas específicas, no abren diálogos, no verifican layout.

### ¿Se PODRÍA escribir un test E2E de layout?

**Técnicamente SÍ, pero:**

1. **Requeriría infraestructura nueva:**
   - Seed de BD para tener datos de prueba (funcionarios, cajas, etc.)
   - Login automatizado
   - Navegación a una de las 3 pantallas caller del diálogo
   - Apertura del diálogo
   - Verificación de overflow: `scrollWidth <= clientWidth` del contenedor `.dialog-content`

2. **El repo NO tiene este tipo de tests:**
   - Los 2 tests Playwright existentes son smoke tests mínimos
   - Los ~47 scripts `test-*-e2e.ts` prueban **handlers backend**, no UI
   - **NO existe precedente** de tests E2E de layout de diálogos en este repo

3. **Sería frágil:**
   - Dependería de resolución de pantalla configurada en Playwright
   - Requeriría zoom/scale específico
   - Podría fallar en CI con headless browser por diferencias de rendering
   - El overflow de 52px es pequeño — podría no detectarse si el viewport es más ancho

### Conclusión 3: ⚠️ Automatizar NO es práctico para este repo

**Justificación:**
- El bug es de **layout visual CSS puro** (overflow horizontal)
- El repo **NO tiene precedente** de tests E2E de layout de diálogos
- Crear la infraestructura desde cero para UN solo bug **no es proporcional**
- La verificación manual es más confiable para este caso (el usuario reportó el bug visualmente con captura de pantalla)

---

## 4. PODER DISCRIMINANTE: ¿Un test podría detectar regresión?

### Pregunta clave

> Un test que NO falle si vuelve el `min-width: 720px` contra un dialog de `700px` no cubre el bug.

### Análisis

**Si existiera un test automatizado de layout, ¿detectaría la regresión?**

**Hipotético test Playwright:**
```typescript
test('Diálogo vale no tiene overflow horizontal', async () => {
  // ... setup + login + navegar a pagar-obligaciones
  await page.click('button:has-text("+ Crear nuevo")'); // abre diálogo
  const dialogContent = await page.locator('.dialog-content');
  const clientWidth = await dialogContent.evaluate(el => el.clientWidth);
  const scrollWidth = await dialogContent.evaluate(el => el.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth); // FALLARÍA si overflow existe
});
```

**¿Detectaría la regresión?**
- ✅ **SÍ** — Si alguien revierte el fix y vuelve a poner `min-width: 720px` con dialog de `700px`, el test fallaría porque `scrollWidth > clientWidth` (overflow de 52px)

**¿Es un test "discriminante"?**
- ✅ **SÍ** — Detecta específicamente el síntoma del bug (overflow horizontal)
- ⚠️ **PERO** requiere infraestructura E2E que no existe en el repo para diálogos

### Conclusión 4: Un test E2E SÍ sería discriminante, pero NO es práctico escribirlo

---

## 5. ALTERNATIVAS DE VERIFICACIÓN

### Opción A: Test unitario de layout (Angular Testing Library)

**Ventaja:** Más rápido que E2E, no requiere Electron  
**Desventaja:** 
- `CreateEditValeDialogComponent` depende de datos reales (funcionarios, monedas, cajas, formas de pago)
- El test unitario tendría que mockear ~6 servicios + MatDialog + permisos
- El rendering del mat-dialog-container con padding real requiere TestBed complejo
- **NO hay precedente** de tests unitarios de layout en el repo (solo tests de lógica/payload)

**Viabilidad:** ⚠️ **Media** — posible pero trabajoso, sin precedente en el repo

### Opción B: Test visual de regresión (ej. Percy, Chromatic)

**Ventaja:** Detecta cambios visuales automáticamente  
**Desventaja:**
- Requiere servicio externo ($$$)
- Requiere configuración en CI
- **NO hay precedente** en el repo

**Viabilidad:** ❌ **Baja** — requiere infraestructura nueva + costo

### Opción C: Verificación manual documentada

**Ventaja:**
- No requiere código nuevo
- Es lo que el usuario ya hizo para reportar el bug (captura de pantalla)
- Confiable para bugs visuales

**Desventaja:**
- No automatizable
- Depende de que alguien pruebe manualmente antes del merge

**Viabilidad:** ✅ **Alta** — es lo que el usuario espera según la consigna

---

## 6. VERIFICACIÓN MANUAL REQUERIDA

### Escenarios de prueba (del PLAN-288)

**Escenario 1: Abrir desde lista de vales (desktop)**
- Navegar a **RRHH → Vales**
- Click en **Crear** (abre con `width: '760px'`)
- **Verificar:** ❌ No hay scrollbar horizontal

**Escenario 2: Abrir desde pago consolidado**
- Navegar a **Financiero → Caja Mayor → Pagar Obligaciones**
- Seleccionar concepto **VALE** → **+ Crear nuevo**
- **Verificar:** ❌ No hay scrollbar horizontal (este ERA el caso del bug)

**Escenario 3: Abrir desde hub de egresos (registrar-egreso-dialog)**
- Navegar a **Financiero → Caja Mayor → Registrar egreso**
- Seleccionar **REGISTRAR_VALE**
- **Verificar:** ❌ No hay scrollbar horizontal (este ya estaba bien con 760px)

**Escenario 4: Dark theme**
- Cambiar a dark theme
- Repetir escenarios 1, 2 y 3
- **Verificar:** ❌ No hay scrollbar horizontal en dark theme

**Escenario 5: Nombres largos**
- Funcionario con nombre + apellido muy largo (ej: "JUAN PABLO SEBASTIAN GONZALEZ RODRIGUEZ MARTINEZ")
- Abrir diálogo y seleccionar ese funcionario
- **Verificar:** 
  - ✅ Trigger del mat-select trunca con ellipsis (`...`)
  - ❌ NO causa overflow horizontal

### Evidencia requerida para cierre del issue

1. ✅ Capturas de pantalla de los 3 escenarios (light + dark theme)
2. ✅ Confirmación visual de que NO hay scrollbar horizontal
3. ✅ Verificación del truncamiento del mat-select con nombre largo
4. ✅ Prueba en resolución mínima del sistema (1366x768 o menor)

**Responsable:** Implementador del fix antes de marcar el PR como ready for review

---

## 7. IMPACTO DE LA AUSENCIA DE TESTS

### Riesgos sin test automatizado

**R1 — Regresión futura (MEDIO):**
- Si un desarrollador modifica los estilos del diálogo en el futuro (ej. agregar padding interno), podría reintroducir overflow
- **Mitigación:** Code review cuidadoso + verificación manual antes de mergear cambios en este componente

**R2 — Regresión en otros diálogos (BAJO):**
- Otros diálogos del repo podrían tener el mismo patrón `min-width` problemático
- **Mitigación:** Grep de `min-width.*px` en otros componentes de diálogo (fuera del scope de este PR)

**R3 — False positivo de "fix exitoso" (BAJO):**
- El fix podría NO funcionar en algún edge case (ej. zoom del navegador ≠ 100%, resolución < 1366x768)
- **Mitigación:** Verificación manual en múltiples resoluciones/zoom levels

### Riesgos aceptables para este tipo de bug

**Justificación de "COBERTURA INSUFICIENTE PERO ACEPTABLE":**

1. ✅ El bug es **CSS puro** (no afecta lógica de negocio, validaciones, backend)
2. ✅ El fix es **no invasivo** (solo estilos inline + valores de width del MatDialogConfig)
3. ✅ El repo **NO tiene precedente** de tests E2E de layout de diálogos
4. ✅ La verificación manual es **más confiable** para bugs visuales que un test E2E frágil
5. ✅ El costo de crear infraestructura nueva **NO es proporcional** al alcance del fix

**Precedente en el repo:**
- Los ~10 componentes de diálogo con `*.spec.ts` (ej. `pagar-obligaciones-dialog.component.spec.ts`) prueban **lógica/payload**, NO layout
- Los cambios de CSS en otros PRs (ej. theme, dark mode) se verificaron **manualmente**, no con tests automatizados

---

## 8. CONCLUSIÓN Y RECOMENDACIONES

### Veredicto: COBERTURA INSUFICIENTE PERO ACEPTABLE ✅

**Razones:**
1. ❌ No hay test nuevo que valide el fix
2. ❌ No hay test existente para el layout del diálogo
3. ⚠️ No es práctico automatizar para este repo (sin precedente de tests E2E de layout)
4. ✅ El bug es CSS puro → verificación manual es suficiente y más confiable
5. ✅ El plan incluye escenarios de prueba manual detallados

### Condición de cierre del issue #288

**El merge del PR #294 y cierre del issue #288 dependen de:**

✅ **Prueba visual manual exitosa** en los 3 puntos de entrada del diálogo:
   - `list-vales.component.ts` (RRHH → Vales → Crear)
   - `pagar-obligaciones-dialog.component.ts` (Financiero → Caja Mayor → Pagar Obligaciones → Vale → Crear nuevo)
   - `registrar-egreso-dialog.component.ts` (Financiero → Caja Mayor → Registrar egreso → Registrar Vale)

✅ **Verificación en ambos temas:**
   - Light theme
   - Dark theme (el usuario usa dark habitualmente según el issue #288)

✅ **Evidencia visual:**
   - Capturas de pantalla confirmando ausencia de scrollbar horizontal
   - Test con nombre de funcionario largo (truncamiento con ellipsis)

### ¿Bloquea el merge?

**NO** — La ausencia de tests automatizados **NO bloquea el merge** bajo estas condiciones:

1. ✅ Se completa la verificación manual documentada arriba
2. ✅ Las capturas/evidencia se adjuntan al PR o al issue antes del merge
3. ✅ El PR pasa code review confirmando que:
   - Los cambios coinciden con el plan enmendado
   - No introduce regresiones en otros diálogos
   - Los 3 callers usan consistentemente `width: '760px'`

### Recomendaciones futuras (fuera del scope del PR)

**Para el equipo:**
1. 🔍 Grep de `min-width.*px` en otros componentes de diálogo para detectar patrones similares
2. 📝 Agregar guía de layout de diálogos en `docs/` o `.claude/` (ej: "usar `max-width` en vez de `min-width` en contenido de diálogos")
3. 🧪 Considerar infraestructura de tests E2E de layout **solo si** aparecen múltiples bugs similares (no justificado por este caso aislado)

---

**Fecha de auditoría:** 2026-09-09  
**Auditor:** Claude Sonnet 4.5 (Cloud Agent)  
**Estado:** COMPLETA  
**Veredicto final:** ✅ COBERTURA INSUFICIENTE PERO ACEPTABLE — no bloquea merge con verificación manual
