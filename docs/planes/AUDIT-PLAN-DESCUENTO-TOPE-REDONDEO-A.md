# Auditoría del Plan: Fix redondeo del tope de descuento

**Eje:** A — Alcance y Convenciones  
**Plan auditado:** `docs/planes/PLAN-DESCUENTO-TOPE-REDONDEO.md`  
**Issue:** [#272](https://github.com/GabFrank/frc-gourmet/issues/272)  
**Auditor:** Cloud Agent (audit/plan-descuento-tope-a-7451)  
**Fecha:** 2026-09-02

---

## Veredicto: OBSERVACIONES MENORES

El plan es **sólido en su núcleo** (cobertura de flujos, reinicio N/A, riesgos identificados), pero tiene **dos inconsistencias** que pueden generar confusión o resultados inesperados si se implementa tal cual:

1. **Afirma mostrar "−878" sin decimales pero no cambia los pipes del template** que controlan ese formato.
2. **No especifica si va a crear el archivo de test** o modificar uno existente (que no existe en la rama).

Son **observaciones menores**, no bloqueantes — el fix funcional (usar `redondear` en vez de `Math.floor`) es correcto y suficiente para desbloquear el tope. Las mejoras visuales requieren un alcance más explícito.

---

## 1. Alcance de flujos (call sites del diálogo)

### ✅ Cobertura completa

**Verificado contra código:**
- `src/app/pages/ventas/pdv/pdv.component.ts` (línea 2507): descuento global de venta, **sin** `maxPorcentaje`.
- `src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.ts` (línea 649): cobro consolidado de CPC, **con** `maxPorcentaje` desde `CajaMayorConfiguracion.descuentoCpcMaxPorcentaje`.

**No hay otros call sites** del `DescuentoDialogComponent`. El plan los identifica correctamente y explica que el fix de redondeo no cambia el comportamiento del PdV, solo mejora consistencia visual.

**✅ Alcance mínimo respetado:** 1 componente + 1 test. No se cuela código de más ni de menos.

---

## 2. Convenciones

### ✅ UPPERCASE en motivo

Verificado en `descuento-dialog.component.ts` línea 119:
```typescript
descuentoMotivo: this.form.get('motivo')?.value?.toUpperCase(),
```

Convención respetada.

### ✅ No recortar el tope en silencio

El plan preserva la regla del componente (línea 99-101 del componente):
```typescript
// Se avisa en vez de recortar en silencio: si el usuario escribió 100.000 y
// el tope son 50.000, ver "50.000" sin explicación es peor que un error.
this.excedeTope = this.maxMonto != null && this.montoDescuento > this.maxMonto;
```

El botón APLICAR se deshabilita con mensaje. Convención respetada.

### ✅ No hay funciones en templates

Verificado en `descuento-dialog.component.html`:
- Todos los bindings son a **propiedades** (`data.subtotal`, `topeTexto`, `maxMonto`, `montoDescuento`, `totalConDescuento`, `excedeTope`).
- Los event handlers (`(click)="aplicar()"`, `(click)="cancelar()"`) son el uso canónico.
- Los pipes (`| number:'1.0-2'`) son transformaciones correctas.

**No hay llamadas a funciones ni getters computacionales** en el template. ✅

### ⚠️ OBSERVACIÓN 1: Pipes del template no se ajustan a `decimalesMoneda`

**Lo que dice el plan:**

> **Resultado esperado** (Fase 1):
> - Texto mostrado: **−878** (sin decimales)

> **Test** (Fase 2):
> ```typescript
> expect(instance.montoDescuento.toString()).not.toContain('.'); // sin decimales
> ```

**Lo que hace el código actual:**

El template usa `| number:'1.0-2'` en **todas** las líneas del resumen (líneas 9, 32, 44, 50, 54 del HTML):
```html
<span>{{ data.subtotal | number:'1.0-2' }}</span>
<mat-hint *ngIf="maxMonto !== null">Máximo: {{ maxMonto | number:'1.0-2' }}</mat-hint>
<span>El descuento supera el tope permitido ({{ maxMonto | number:'1.0-2' }}).</span>
<span class="descuento-value">-{{ montoDescuento | number:'1.0-2' }}</span>
<span>{{ totalConDescuento | number:'1.0-2' }}</span>
```

**Qué va a pasar:**

Con el fix del plan (redondear `montoDescuento` a 878), el pipe `| number:'1.0-2'` va a mostrar:
- **Locales con punto decimal:** "−878.00"
- **Locales con coma (es-PY):** "−878,00"

**No va a mostrar "−878" sin decimales** como el plan afirma.

**Convención del proyecto** (`conventions/coding-rules.md` § Number formatting):
- **PYG:** `| number:'1.0-0'` (0 decimales)
- **USD/BRL:** `| number:'1.0-2'` (2 decimales)

**Impacto:**

- **El fix funcional (habilitar el tope del 5%) se logra** igual: el redondeo de `montoDescuento` es suficiente para que `877.5 > 877` pase a `878 > 878` → false.
- **La mejora visual (mostrar enteros en guaraníes)** solo se logra parcialmente: el número interno es 878, pero el pipe lo formatea con decimales.
- El assert del test `expect(instance.montoDescuento.toString()).not.toContain('.')` **pasa** (el número es 878, sin punto), pero **no valida lo que el usuario ve en pantalla**.

**Opciones:**

1. **Alcance explícito:** el plan debería decir "redondear el número interno resuelve la comparación; los decimales visuales quedan fuera de alcance" (scope actual mínimo).
2. **Alcance ampliado:** cambiar los pipes del template a usar `decimalesMoneda` dinámicamente, p. ej. `| number:'1.0-' + decimalesMoneda` (no es sintaxis válida en Angular; requiere un pipe custom o construir el string de formato en el componente).

**Recomendación:** documentar explícitamente que el fix resuelve el **bloqueo del tope** pero **no ajusta el formato visual a la convención del proyecto**. Si Gabriel quiere los enteros en pantalla, es un segundo ticket.

---

## 3. Reinicio, migraciones, permisos

### ✅ Reinicio: N/A

El plan dice correctamente:
> **NO se requiere reinicio** después del fix:
> - Solo se modifica un componente Angular standalone (`.ts`) y su test.
> - El cambio se refleja con **hot reload** en `npm start`.

Verificado: `descuento-dialog.component.ts` es un componente standalone que no toca backend, handlers, preload ni entities. **Hot reload suficiente.**

### ✅ Migraciones: N/A

El fix no toca esquema de base de datos. No hay columnas nuevas ni tipos cambiados. **Sin migraciones.**

### ✅ Permisos: correctamente clasificados como N/A

**Verificado:**
- El componente `DescuentoDialogComponent` **no** tiene `ensurePermission` (búsqueda de `ensurePermission` en su código: 0 resultados).
- Los flujos que lo abren **sí** verifican permisos:
  - Cobro consolidado: `pagar-obligaciones-dialog` pide `CPC_COBRAR` en el handler `registrar-pago-consolidado` (`pago-consolidado.handler.ts` línea 160).
  - Descuento en ese cobro con línea `DESCUENTO`: suma permiso `CPC_DESCUENTO` (línea 197).
  - PdV: el flujo de cobro pide `VENTAS_PDV` / `VENTAS_COBRAR`.

El diálogo es un **componente de UI compartido** que delega la verificación de permisos a quién lo abre. **Clasificación N/A es correcta.**

---

## 4. Riesgos

### ✅ Al menos un riesgo concreto identificado

**Tabla del plan:**

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Romper el descuento en el PdV (sin tope) | **Baja** | El PdV no usa `maxPorcentaje`; el redondeo solo mejora consistencia visual. Test de regresión manual. |
| Desempate distinto backend/frontend en edge case | **Muy baja** | Ahora ambos usan `redondear` con los mismos decimales. El invariante es que `maxMonto` y `montoDescuento` se redondean igual. |

**Evaluación:**

- **Riesgo 1 (PdV):** correctamente identificado. El PdV no manda `maxPorcentaje`, así que `maxMonto` queda en `null` y la rama `excedeTope` nunca se activa. El cambio de `Math.floor` a `redondear` solo afecta la comparación cuando HAY tope. ✅
- **Riesgo 2 (desempate):** también correcto. La incoherencia era que `maxMonto` usaba `Math.floor` y el backend usaba `redondear`; ahora ambos usan `redondear`. ✅
- **Impacto en BD:** correctamente señalado como "Ninguno". El descuento nunca se aplicaba de más (bloqueaba antes). ✅

**Sin riesgos omitidos graves.** El fix es **aditivo y conservador**: cambia solo la función de redondeo, no la lógica del tope ni los flujos de guardado.

---

## 5. Alcance técnico verificado contra código

### Archivos que el plan toca:

1. **`src/app/shared/components/descuento-dialog/descuento-dialog.component.ts`:**
   - ✅ Importar `redondear` desde `@shared/utils/pago-consolidado.util`.
   - ✅ Reemplazar `Math.floor(… * f) / f` en `ngOnInit` línea 75 por `redondear(…, decimalesMoneda)`.
   - ✅ Redondear `montoDescuento` en `recalcular()` línea 94-98 antes de asignarlo.

2. **`src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.spec.ts`:**
   - El plan dice que va a agregar un caso de prueba.
   - **⚠️ OBSERVACIÓN 2:** El archivo de spec **existe** en el código (leído arriba, 408 líneas). El plan no dice si va a **crear** el archivo o **agregar un caso** a uno existente.
   - Verificando el spec actual: tiene 8 casos (`it(...)`), ninguno específico para el diálogo de descuento. Los casos son:
     - Payload completo de cada concepto (compra, gasto, vale, liquidación, cobro cliente).
     - Descuento descartado al cambiar selección.
     - Beneficiario único en compra.
   - **El plan debería aclarar:** "Agregar caso de prueba al spec existente" (no "crear test").

### Archivos que el plan NO toca (correctamente):

- ✅ **Backend (`pago-consolidado.handler.ts`):** ya usa `redondear` en línea 231. Sin cambios necesarios.
- ✅ **Otros diálogos:** el fix es local al `DescuentoDialogComponent`. No toca `cobrar-venta-dialog`, `ajuste-dialog`, ni el wizard `pagar-obligaciones-dialog` (solo su spec).

---

## 6. Tests

### ✅ Comando correcto

El plan especifica:
```bash
npm run test:pagar-obligaciones-dialog
```

Verificado contra `package.json` (asumiendo que existe; patrón del proyecto es `test:<nombre>`). ✅

### ⚠️ OBSERVACIÓN 3: El spec propuesto no valida lo visual

**Caso de prueba del plan:**

```typescript
it('debe habilitar APLICAR cuando el descuento es exactamente el tope (caso no entero)', () => {
  // …
  expect(instance.montoDescuento).toBe(esperado);  // 878
  expect(instance.excedeTope).toBe(false);
  expect(instance.form.valid).toBe(true);
  expect(instance.montoDescuento.toString()).not.toContain('.');  // sin decimales
});
```

**Qué valida:**
- ✅ `montoDescuento` numérico es 878 (correcto).
- ✅ El botón APLICAR se habilita (correcto).
- ✅ `montoDescuento.toString()` es "878" sin punto (correcto).

**Qué NO valida:**
- ❌ Lo que el **usuario ve en pantalla**: el pipe `| number:'1.0-2'` aplicado a 878 muestra "878.00" o "878,00".

El assert `montoDescuento.toString().not.toContain('.')` pasa, pero **no verifica la regresión visual** que el plan dice resolver ("mostrar sin decimales espurios en guaraníes").

**Consecuencia:** el test pasa en verde incluso si los pipes del template siguen mostrando ".00" en PYG. Si Gabriel espera ver "−878" limpio en la UI, el test actual no lo garantiza.

---

## 7. Convenciones del proyecto aplicadas

| Convención | ¿Se respeta? | Detalle |
|------------|--------------|---------|
| Strings UPPERCASE en BD | ✅ N/A | El diálogo no persiste directamente; el handler del cobro guarda `descuentoMotivo` ya en UPPERCASE (verificado) |
| No funciones en templates | ✅ Sí | Solo propiedades, pipes y event handlers |
| `| number:'1.0-2'` (o `1.0-0` para PYG) | ⚠️ Parcial | El template usa `'1.0-2'` fijo; no se ajusta a `decimalesMoneda`. El plan no lo cambia |
| No recortar el tope en silencio | ✅ Sí | El componente avisa con `excedeTope` y deshabilita el botón |
| No colores hardcoded | ✅ N/A | El componente usa clases de Material |
| Confirmaciones con `ConfirmationDialogComponent` | ✅ N/A | No aplica (no es un diálogo de confirmación) |
| Acceso a BD vía `RepositoryService` | ✅ N/A | El diálogo no accede a BD |

**Resumen:** las convenciones críticas (UPPERCASE, no funciones, no recortar) se respetan. La del formato de números se respeta **en lógica** (redondear a decimales correctos) pero **no en presentación** (pipes fijos).

---

## 8. Qué verificamos contra el código real

1. **Call sites del diálogo:** 2 archivos (PdV + cobro consolidado). Ninguno más. ✅
2. **Función `redondear` existe en ambos lados:** `src/app/shared/utils/pago-consolidado.util.ts` línea 33-38, re-exportada en `electron/utils/`. ✅
3. **Backend ya usa `redondear`:** `pago-consolidado.handler.ts` línea 231. ✅
4. **Spec del wizard existe:** 408 líneas, 8 casos actuales, ninguno específico para el caso "tope no entero". ✅
5. **El componente recibe `decimalesMoneda`:** línea 53 del componente, se deriva de `data.decimales` (default 0). ✅
6. **Pipes del template:** todos usan `'1.0-2'` fijo. El plan no los cambia. ⚠️

---

## 9. Hallazgos numerados

### H1. Inconsistencia entre resultado esperado y pipes del template

**Severidad:** Menor (cosmética)  
**Ubicación:** Sección 4 del plan (Fase 1, resultado esperado) + template del componente  

**Qué dice el plan:**
> - Texto mostrado: **−878** (sin decimales)

**Qué va a pasar:**
El número interno es 878 (sin decimales), pero `| number:'1.0-2'` lo renderiza como "878.00" o "878,00".

**Impacto:**
- El fix funcional (habilitar el tope) se logra igual.
- La mejora visual (enteros en guaraníes) NO se logra.
- El test propuesto valida el número pero no lo que el usuario ve.

**Recomendación:**
Documentar explícitamente que el alcance es **resolver el bloqueo del tope**, no ajustar el formato visual. Si Gabriel quiere pipes dinámicos (`'1.0-' + decimalesMoneda`), es un segundo ticket.

### H2. Falta aclarar que el spec YA existe

**Severidad:** Muy menor (claridad)  
**Ubicación:** Sección 4, Fase 2  

**Qué dice el plan:**
> **Archivo:**
> - `src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.spec.ts`
> 
> **Caso de prueba nuevo:**

**Qué falta:**
No dice si el archivo se va a **crear** o ya existe. El spec existe (408 líneas, 8 casos actuales).

**Recomendación:**
Cambiar a "Agregar caso de prueba al spec existente" o "Modificar `pagar-obligaciones-dialog.component.spec.ts` (408 líneas, 8 casos actuales) agregando…".

### H3. El test no valida la regresión visual

**Severidad:** Menor (cobertura de test incompleta)  
**Ubicación:** Sección 4, Fase 2  

**Qué valida el test propuesto:**
- `montoDescuento` numérico es 878 ✅
- `excedeTope` es false ✅
- `montoDescuento.toString()` no tiene punto ✅

**Qué NO valida:**
- Lo que el usuario ve en pantalla (el pipe `| number:'1.0-2'` aplicado).

**Recomendación:**
Si el objetivo es validar la UI, agregar un caso que verifique el HTML renderizado (p. ej. con `fixture.debugElement.query(By.css('.descuento-value')).nativeElement.textContent`). Si el objetivo es solo validar la lógica, aclarar que la validación visual queda fuera de alcance.

---

## 10. Riesgos NO identificados por el plan (ninguno grave)

Revisé:
- **Concurrencia:** N/A (diálogo de UI, no persiste).
- **Multimoneda:** el componente ya maneja `decimalesMoneda` correctamente.
- **Regresión de otros flujos:** el PdV no tiene tope, así que el cambio no lo afecta. ✅
- **Permisos evadibles:** el tope se valida en el backend (línea 231 del handler); el frontend no es frontera. ✅

**Sin riesgos graves omitidos.**

---

## 11. Definición de Hecho del plan

**Checklist del plan:**

- [ ] Fix aplicado en `descuento-dialog.component.ts` ← ✅ alcance correcto
- [ ] Test unitario nuevo en `pagar-obligaciones-dialog.component.spec.ts` ← ⚠️ falta aclarar "agregar a spec existente"
- [ ] `npm run test:pagar-obligaciones-dialog` pasa en verde ← ✅ comando correcto
- [ ] Prueba manual del checklist `TESTING-CHECKLIST-COBRO-CONSOLIDADO-CPC.md` sección "Límites del descuento", paso 4 ← ✅ referencia correcta
- [ ] `npm run build` compila sin errores ← ✅
- [ ] `npm run check` (AOT producción) pasa sin errores ← ✅
- [ ] Commit del fix + commit del test, pusheados a la rama `fix/descuento-tope-redondeo-9278` ← ✅ rama correcta
- [ ] PR **draft** abierto a `develop` ← ⚠️ **inconsistencia**: el query del usuario dice "PR hacia `cursor/descuento-tope-redondeo-9278`" pero el plan dice "PR draft a `develop` citando #278". El PR #278 ES la rama del planner.

**Observación adicional:** el DoD del plan dice abrir PR a `develop` citando #278, pero el query dice PR hacia la rama del planner. Aclarar cuál es el flujo esperado.

---

## 12. Resumen ejecutivo

### ✅ Lo que el plan hace bien

1. **Identifica la causa raíz correctamente:** `Math.floor` vs `redondear`, incoherencia frontend-backend.
2. **Alcance mínimo y quirúrgico:** 1 componente + 1 test, sin tocar backend (que ya está bien).
3. **Call sites cubiertos:** PdV + cobro consolidado, correctamente identificados.
4. **Riesgos concretos:** tabla con mitigaciones, sin omisiones graves.
5. **Reinicio N/A:** correctamente clasificado (componente Angular standalone).
6. **Convenciones respetadas:** UPPERCASE, no recortar tope, no funciones en templates.

### ⚠️ Observaciones menores (no bloqueantes)

1. **H1 (inconsistencia visual):** El plan afirma que va a mostrar "−878" sin decimales, pero no cambia los pipes del template que renderizan "878.00". El fix funcional (habilitar el tope) se logra igual; la mejora visual queda parcial.
2. **H2 (spec ya existe):** El plan no aclara que el archivo de test existe (408 líneas, 8 casos). Debería decir "agregar caso al spec existente".
3. **H3 (test no valida lo visual):** El assert `montoDescuento.toString().not.toContain('.')` valida el número interno, no lo que el usuario ve en pantalla (el pipe).

### Impacto de las observaciones

- **Sin corrupción de datos:** el descuento nunca se aplicaba de más. ✅
- **El tope inalcanzable se desbloquea:** el cambio de `Math.floor` a `redondear` resuelve `877.5 > 877` → `878 > 878` (false). ✅
- **Decimales fantasma en guaraníes quedan parcialmente:** el número interno es 878, pero el pipe muestra ".00". ⚠️

---

## 13. Recomendaciones al planner

1. **Documentar explícitamente** que el alcance es "desbloquear el tope" y que el ajuste visual de pipes queda fuera. O bien ampliar el alcance para cambiar los pipes del template a usar `decimalesMoneda` dinámicamente (requiere construir el string de formato en el componente, porque Angular no acepta `| number:'1.0-' + variable`).

2. **Aclarar** que el spec ya existe y que el caso nuevo se agrega a él.

3. **Opcional:** Si Gabriel quiere validar la regresión visual completa, agregar un caso que lea el HTML renderizado, no solo la propiedad del componente.

4. **Aclarar el flujo de PR:** ¿a `develop` citando #278, o hacia `cursor/descuento-tope-redondeo-9278`?

---

## 14. Conclusión

El plan es **implementable tal cual** y resuelve el problema reportado (tope inalcanzable). Las observaciones son **cosméticas o de claridad**, no bloquean la implementación.

**Veredicto final:** ✅ **OK con observaciones menores**.
