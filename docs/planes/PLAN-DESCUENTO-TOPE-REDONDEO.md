# Plan: Fix redondeo del tope de descuento en diálogo de descuento

**Issue:** [#272](https://github.com/GabFrank/frc-gourmet/issues/272)  
**Fecha:** 2026-09-02  
**Estado:** Planificación

---

## 1. Contexto

El diálogo de descuento (`descuento-dialog.component.ts`) se usa en el wizard de **cobro consolidado de CPC** (Cuentas Por Cobrar) para condonar deuda con límite porcentual configurable por caja (`CajaMayorConfiguracion.descuentoCpcMaxPorcentaje`).

Detectado durante pruebas manuales del checklist de PR #271 sobre Postgres con datos de producción:
- Caja Mayor con **descuento máximo = 5%**
- Cuota CPC pendiente de **₲ 17.550**
- Al pedir **exactamente 5%** (el tope configurado), el botón `APLICAR` queda **deshabilitado** con el mensaje *"El descuento supera el tope permitido (877)"*.
- El tope configurado es **inalcanzable** por el camino natural; hay que tantear 4,99%.

### Flujo actual

**Diálogo (frontend):**
```typescript
// ngOnInit
this.maxMonto = Math.floor(Number(this.data.subtotal) * (Number(pctMax) / 100) * f) / f;
// Con subtotal=17550, pctMax=5, decimales=0 (PYG):
// Math.floor(17550 * 0.05) = 877

// recalcular()
this.montoDescuento = this.data.subtotal * (pct / 100);
// 17550 * 0.05 = 877.5 (sin redondear)

this.excedeTope = this.maxMonto != null && this.montoDescuento > this.maxMonto;
// 877.5 > 877 → true (bloqueado)
```

**Backend (`pago-consolidado.handler.ts`, línea 231):**
```typescript
const maximo = redondear(totalDeuda * (topePct / 100), decDeuda);
// redondear(17550 * 0.05, 0) → Math.round(877.5) = 878
```

El backend **SÍ** lo aceptaría (con 878), pero el frontend bloquea antes.

### Síntomas adicionales

El diálogo muestra **"−877,5"** y **"16.672,5"** en guaraníes (moneda de 0 decimales), violando la convención del proyecto (`| number:'1.0-0'` para PYG).

---

## 2. Causa verificada

Dos incoherencias en `descuento-dialog.component.ts`:

1. **`maxMonto` usa `Math.floor`** en vez de `redondear`:
   - Frontend: `Math.floor(17550 * 0.05) = 877`
   - Backend: `redondear(17550 * 0.05, 0) = 878`
   - Desempate en 1 unidad → tope inalcanzable.

2. **`montoDescuento` no se redondea** a `decimalesMoneda` en `recalcular()`:
   - Resultado: 877.5 mostrado en una moneda de 0 decimales.
   - Comparación: `877.5 > 877` → bloqueado.

El handler backend ya usa la función correcta (`redondear` de `pago-consolidado.util.ts`), que **existe en ambos lados** (electron + shared) porque la aritmética es TS puro re-exportado.

---

## 3. Alcance

### Lo que toca

- **`src/app/shared/components/descuento-dialog/descuento-dialog.component.ts`:**
  - Importar `redondear` desde `@shared/utils/pago-consolidado.util` (ya se re-exporta para consumo Angular).
  - Reemplazar `Math.floor` en `ngOnInit` por `redondear(..., this.decimalesMoneda)`.
  - Redondear `montoDescuento` a `decimalesMoneda` en `recalcular()` antes de asignarlo.

- **Test `test:pagar-obligaciones-dialog`** (archivo `src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.spec.ts`):
  - Agregar caso con **tope no entero**: cuota ₲17.550, tope 5%, verificar que el descuento del 5% (878) quede habilitado.
  - Verificar que el texto mostrado **no tenga decimales** (−878, no −877,5).

### Lo que NO toca

- **Backend:** ya usa `redondear` correctamente (`pago-consolidado.handler.ts` línea 231). No requiere cambios.
- **Otros flujos:** el diálogo se usa **también** en el PdV para descuento global de venta, pero el tope porcentual es **exclusivo del cobro consolidado de CPC**. El fix de redondeo mejora la consistencia visual en todos los flujos (PYG siempre mostrará enteros).
- **Diálogo de descuento del PdV:** el fix no cambia su comportamiento funcional (ahí no hay tope configurable, solo `maxPorcentaje` fijo si lo mandan).

---

## 4. Fases de implementación

### Fase 1: Fix del componente

**Archivos:**
- `src/app/shared/components/descuento-dialog/descuento-dialog.component.ts`

**Cambios:**

1. Importar `redondear`:
```typescript
import { redondear } from '@shared/utils/pago-consolidado.util';
```

2. En `ngOnInit`, reemplazar:
```typescript
// ANTES:
this.maxMonto = Math.floor(Number(this.data.subtotal) * (Number(pctMax) / 100) * f) / f;

// DESPUÉS:
this.maxMonto = redondear(Number(this.data.subtotal) * (Number(pctMax) / 100), this.decimalesMoneda);
```

3. En `recalcular()`, redondear `montoDescuento`:
```typescript
// ANTES:
if (this.tipoDescuento === 'porcentaje') {
  const pct = this.form.get('porcentaje')?.value || 0;
  this.montoDescuento = this.data.subtotal * (pct / 100);
} else {
  this.montoDescuento = this.form.get('monto')?.value || 0;
}

// DESPUÉS:
if (this.tipoDescuento === 'porcentaje') {
  const pct = this.form.get('porcentaje')?.value || 0;
  this.montoDescuento = redondear(this.data.subtotal * (pct / 100), this.decimalesMoneda);
} else {
  this.montoDescuento = redondear(this.form.get('monto')?.value || 0, this.decimalesMoneda);
}
```

**Resultado esperado:**
- Con subtotal ₲17.550, tope 5%, decimales 0:
  - `maxMonto = redondear(17550 * 0.05, 0) = 878`
  - `montoDescuento (5%) = redondear(17550 * 0.05, 0) = 878`
  - `excedeTope = 878 > 878` → false (habilitado)
  - Texto mostrado: **−878** (sin decimales)

**Commit:** `fix(financiero): redondear tope de descuento coherente con backend (#272)`

---

### Fase 2: Test del caso tope no entero

**Archivo:**
- `src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.spec.ts`

**Caso de prueba nuevo:**

```typescript
it('debe habilitar APLICAR cuando el descuento es exactamente el tope (caso no entero)', () => {
  // Arrange: cuota ₲17.550, tope 5% → 878 redondeado
  const subtotal = 17550;
  const topePct = 5;
  const esperado = 878; // redondear(17550 * 0.05, 0)
  
  // Abrir diálogo con tope
  const dialogRef = fixture.componentInstance.openDescuentoDialog({
    subtotal,
    decimales: 0,
    maxPorcentaje: topePct,
  });
  
  const instance = dialogRef.componentInstance;
  
  // Act: pedir exactamente el 5%
  instance.form.patchValue({ tipoDescuento: 'porcentaje', porcentaje: 5, motivo: 'PRUEBA' });
  instance.recalcular();
  
  // Assert
  expect(instance.montoDescuento).toBe(esperado);
  expect(instance.excedeTope).toBe(false);
  expect(instance.form.valid).toBe(true);
  expect(instance.montoDescuento.toString()).not.toContain('.'); // sin decimales
});
```

**Comando:** `npm run test:pagar-obligaciones-dialog`

**Commit:** `test(financiero): caso tope de descuento no entero (#272)`

---

## 5. Tests

### Tests de unidad (Angular)

- **Comando:** `npm run test:pagar-obligaciones-dialog`
- **Cubre:**
  - Caso existente: descuento sin tope.
  - **Caso nuevo:** descuento con tope no entero (₲17.550, 5%).
  - Redondeo a decimales de la moneda (0 para PYG, 2 para USD).

### Tests E2E existentes (no requieren cambios)

- **`npm run test:cobro-cpc-consolidado`** (63 asserts):
  - Ya cubre el flujo completo de cobro consolidado con descuento.
  - El fix es **transparente** para el backend: el handler ya esperaba valores redondeados.

- **`npm run test:pago-consolidado`** (90 asserts):
  - Aritmética del reparto FIFO, no toca el diálogo.

### Regresión manual

Usar el checklist existente: `docs/testing/TESTING-CHECKLIST-COBRO-CONSOLIDADO-CPC.md`, sección **"Límites del descuento"**, específicamente:

1. Configurar tope 5% en Caja Mayor.
2. Crear cuota CPC de ₲17.550.
3. Abrir *Ingreso → Cobrar a Cliente*, seleccionar la cuota.
4. **Aplicar descuento 5%.**
5. ✅ El botón `APLICAR` debe estar **habilitado**.
6. ✅ El resumen debe mostrar **−878** (sin decimales) y total **16.672**.
7. Aplicar → el backend debe aceptar sin error.

---

## 6. Riesgos e impacto

### Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Romper el descuento en el PdV (sin tope) | **Baja** | El PdV no usa `maxPorcentaje`; el redondeo solo mejora consistencia visual. Test de regresión manual. |
| Desempate distinto backend/frontend en edge case | **Muy baja** | Ahora ambos usan `redondear` con los mismos decimales. El invariante es que `maxMonto` y `montoDescuento` se redondean igual. |

### Impacto

- **En base de datos:** Ninguno. El descuento nunca se aplicaba de más (bloqueaba antes).
- **En usuarios:** Desbloquea un caso válido (pedir el tope exacto) que hoy obliga a tantear.
- **Cambio de UX:** Los montos se muestran sin decimales espurios en guaraníes (mejora).

---

## 7. Reinicio de la aplicación

**NO se requiere reinicio** después del fix:
- Solo se modifica un componente Angular standalone (`.ts`) y su test.
- El cambio se refleja con **hot reload** en `npm start`.

Si el usuario ya tiene la app abierta en modo producción, verá el fix en el próximo arranque natural o con *Recargar la aplicación* (Herramientas de ventana).

---

## 8. Definición de Hecho

- [ ] Fix aplicado en `descuento-dialog.component.ts` (importar `redondear`, usarlo en `maxMonto` y `montoDescuento`).
- [ ] Test unitario nuevo en `pagar-obligaciones-dialog.component.spec.ts` (caso tope no entero).
- [ ] `npm run test:pagar-obligaciones-dialog` pasa en verde.
- [ ] Prueba manual del checklist `TESTING-CHECKLIST-COBRO-CONSOLIDADO-CPC.md` sección "Límites del descuento", paso 4 (tope exacto 5% habilitado).
- [ ] `npm run build` compila sin errores.
- [ ] `npm run check` (AOT producción) pasa sin errores.
- [ ] Commit del fix + commit del test, pusheados a la rama `fix/descuento-tope-redondeo-9278`.
- [ ] PR **draft** abierto a `develop` con:
  - Título: `fix(financiero): redondear tope de descuento coherente con backend (#272)`
  - Descripción: enlace al issue #272, qué resuelve, cómo probarlo, impacto (sin corrupción).
  - Checklist: ✅ compilación, ✅ tests unitarios, ✅ manual.
  - `Closes #272` en la descripción (se activa al merge final).

---

## 9. Notas adicionales

### Dónde vive `redondear`

- **Fuente única:** `src/app/shared/utils/pago-consolidado.util.ts` (línea 33-38).
- **Re-exportado en backend:** `electron/utils/pago-consolidado.util.ts` (mismo archivo copiado, patrón del proyecto).
- **Usado en:**
  - Backend: `pago-consolidado.handler.ts` (validación del tope, línea 231).
  - Frontend: `pagar-obligaciones-dialog.component.ts` (aritmética del wizard).
  - **Pendiente hasta este fix:** `descuento-dialog.component.ts` (ahora lo importará).

### Convención de redondeo del proyecto

De `conventions/coding-rules.md`:
- **PYG:** 0 decimales (`| number:'1.0-0'`).
- **USD/BRL:** 2 decimales (`| number:'1.0-2'`).
- **Lógica:** usar `redondear(valor, decimalesMoneda)` antes de comparar o mostrar.

El diálogo ya recibe `decimales` en `data.decimales` (default 0), pero no lo usaba para redondear los cálculos internos — solo para configurar `appCurrencyInput`.

### Ambigüedades resueltas

- **¿El diálogo se usa fuera del cobro consolidado?** Sí, en el PdV para descuento global de venta. El `maxPorcentaje` (tope configurable) es **exclusivo** del cobro consolidado de CPC; el PdV no lo manda. El fix de redondeo no cambia el comportamiento funcional del PdV, solo mejora la consistencia visual (ya no mostrará decimales fantasma en PYG).

- **¿Hay dos funciones `redondear` distintas?** No. Existe una sola en `shared/utils/pago-consolidado.util.ts`, re-exportada en `electron/utils/` para el backend. Misma implementación, mismo nombre.

---

## 10. Referencias

- **Issue:** https://github.com/GabFrank/frc-gourmet/issues/272
- **PR que lo encontró:** #271 (TESTING-CHECKLIST-COBRO-CONSOLIDADO-CPC.md)
- **Archivos clave:**
  - `src/app/shared/components/descuento-dialog/descuento-dialog.component.ts` (UI)
  - `electron/handlers/pago-consolidado.handler.ts` (backend, línea 218-236)
  - `src/app/shared/utils/pago-consolidado.util.ts` (función `redondear`)
- **Docs:**
  - `.claude/skills/frc-gourmet-expert/domains/financiero-caja-mayor.md` §Pago consolidado
  - `.claude/skills/frc-gourmet-expert/domains/financiero-cpp-cpc.md` §Cobro consolidado
  - `.claude/skills/frc-gourmet-expert/conventions/coding-rules.md` §Number formatting
