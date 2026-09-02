# Auditoría del Motor de Redondeo — PR #278 (Issue #272)

**Auditor:** Cloud Agent (audit/motor-redondeo-descuento-272)  
**Fecha:** 2026-09-02  
**Rama auditada:** `cursor/descuento-tope-redondeo-9278` (HEAD: `053e6404`)  
**Alcance:** Correctitud del motor de redondeo en el cálculo del tope de descuento

---

## Resumen ejecutivo

✅ **APROBADO CON OBSERVACIONES MENORES**

El fix corrige el bug reportado (#272) y establece coherencia entre frontend y backend. La implementación usa la misma función `redondear` compartida, el caso crítico 17550×5%=878 pasa los tests, y el comportamiento ante exceso de tope es explícito (bloquea con mensaje, no recorta en silencio).

**Riesgos identificados:**
- **[BAJO]** Re-export indirecto en Electron puede fallar silenciosamente si el path cambia
- **[INFO]** La validación de tope es solo frontend (el backend NO valida `maxPorcentaje`)

---

## 1. Coherencia del motor: ¿Frontend = Backend?

### ✅ Confirmado: Usan la misma función `redondear`

**Frontend** (`descuento-dialog.component.ts`):
```typescript
import { redondear } from '../../utils/pago-consolidado.util';
// → /workspace/src/app/shared/utils/pago-consolidado.util.ts
```

**Backend** (`pago-consolidado.handler.ts` línea 46):
```typescript
import { redondear } from '../utils/pago-consolidado.util';
// → /workspace/electron/utils/pago-consolidado.util.ts
```

**Archivo Electron** (`electron/utils/pago-consolidado.util.ts`):
```typescript
/**
 * Re-export del util de pago consolidado para el lado Electron.
 *
 * La logica vive en `src/app/shared/utils/` para que el handler y el componente
 * Angular compartan exactamente la misma aritmetica
 */
export { redondear } from '../../src/app/shared/utils/pago-consolidado.util';
```

**Conclusión:** El archivo de Electron es un **re-export transparente** del archivo de Angular. Ambos lados ejecutan el MISMO código fuente, no implementaciones paralelas.

---

## 2. Implementación de `redondear`

**Archivo único:** `src/app/shared/utils/pago-consolidado.util.ts` (líneas 34-38)

```typescript
export function redondear(valor: number, decimales: number): number {
  const f = Math.pow(10, decimales);
  // Redondeo sobre el entero escalado: evita que 1.005 caiga para abajo por el
  // error binario de coma flotante.
  return Math.round((valor + Number.EPSILON) * f) / f;
}
```

**Algoritmo:**
1. Escala el valor: `(valor + Number.EPSILON) * 10^decimales`
2. Redondea al entero más cercano: `Math.round(...)`
3. Desescala: `/ 10^decimales`

**`Number.EPSILON`** compensa error de coma flotante. Ejemplo: `1.005 * 100` puede dar `100.49999...` en binario; el EPSILON lo corrige a `100.50000...` antes del `Math.round`.

**Cambio del fix:**
- Antes: `Math.floor(subtotal * pct / 100 * f) / f` → **trunca** hacia abajo
- Ahora: `redondear(subtotal * pct / 100, decimales)` → **redondea** al más cercano

---

## 3. Caso crítico: 17550 × 5% = ¿877 o 878?

### Test unitario (líneas 42-72 del spec):

```typescript
it('debe habilitar APLICAR cuando el descuento es exactamente el tope (caso no entero)', (done) => {
  const subtotal = 17550;
  const topePct = 5;
  const esperado = 878; // redondear(17550 * 0.05, 0)

  // ...
  instance.form.patchValue({ porcentaje: 5, motivo: 'PRUEBA' });
  instance.recalcular();

  expect(instance.montoDescuento).toBe(esperado);
  expect(instance.excedeTope).toBe(false); // ← NO bloquea
  expect(instance.form.valid).toBe(true);
});
```

**Aritmética manual:**
```
17550 × 0.05 = 877.5
redondear(877.5, 0) → Math.round(877.5) = 878 ✅
```

**Comportamiento del fix:**
1. `maxMonto = redondear(17550 × 0.05, 0) = 878`
2. `montoDescuento = redondear(17550 × 0.05, 0) = 878`
3. Comparación: `878 > 878` → **false** → `excedeTope = false` ✅

**Antes del fix:**
- `maxMonto = Math.floor(17550 × 0.05) = 877` (truncaba)
- `montoDescuento = 877.5` (sin redondear)
- `877.5 > 877` → **true** → bloqueaba ❌

---

## 4. ¿Se recorta el tope en silencio?

**NO.** El componente BLOQUEA con advertencia explícita:

```typescript
// línea 101: se avisa en vez de recortar en silencio
this.excedeTope = this.maxMonto != null && this.montoDescuento > this.maxMonto;
```

**UI (template):**
```html
<mat-error *ngIf="excedeTope">
  El descuento supera el tope permitido ({{maxMonto | number:'1.0-2'}})
</mat-error>
```

**Método `aplicar()` (línea 113):**
```typescript
aplicar(): void {
  if (!this.form.get('motivo')?.valid || this.excedeTope) return; // ← bloquea
  // ...
}
```

**Comportamiento:** Si `montoDescuento > maxMonto`, el botón `APLICAR` queda deshabilitado y se muestra el mensaje. El usuario NO puede confirmar el descuento excesivo.

---

## 5. Desempate: ¿Floor vs Round residual?

**No aplica.** El fix eliminó el desempate:

**Antes:**
- `maxMonto` usaba `Math.floor` (truncar)
- `montoDescuento` no se redondeaba (podía tener decimales)
- Comparaban magnitudes diferentes → bug

**Ahora:**
- Ambos usan `redondear(valor, decimalesMoneda)` con el mismo `decimales`
- El redondeo es simétrico: misma función, mismos parámetros
- No hay desempate porque no hay operaciones distintas

**Propiedad del redondeo:**
```
redondear(A, d) == redondear(B, d)  ⟺  A y B redondean al mismo valor
```

El frontend y backend toman decisiones idénticas porque ejecutan la misma función con los mismos inputs.

---

## 6. Import path: ¿Correcto?

### ✅ Correcto pero frágil

**Path del componente:**
```typescript
import { redondear } from '../../utils/pago-consolidado.util';
// Ubicación del componente: src/app/shared/components/descuento-dialog/
// Resuelve a: src/app/shared/utils/pago-consolidado.util.ts ✅
```

**Path del handler:**
```typescript
import { redondear } from '../utils/pago-consolidado.util';
// Ubicación del handler: electron/handlers/
// Resuelve a: electron/utils/pago-consolidado.util.ts ✅
```

**Path del re-export:**
```typescript
export { redondear } from '../../src/app/shared/utils/pago-consolidado.util';
// Ubicación del re-export: electron/utils/
// Resuelve a: src/app/shared/utils/pago-consolidado.util.ts ✅
```

**Riesgo menor:** Si se mueve `src/app/shared/utils/pago-consolidado.util.ts`, el re-export en `electron/utils/` falla en **compilación**, NO en runtime silencioso. TypeScript detecta el path roto.

**Justificación del patrón:**
> "La logica vive en `src/app/shared/utils/` para que el handler y el componente Angular compartan exactamente la misma aritmetica (mismo patron que `monto-letras.util.ts` y `dashboard-rangos.util.ts`)."

Es una decisión arquitectónica del proyecto, no una chapuza del fix.

---

## 7. Prueba del caso reportado

**Manual (según checklist `TESTING-CHECKLIST-COBRO-CONSOLIDADO-CPC.md`):**

1. *Configurar Caja Mayor* → Descuento máximo = **5%** → Guardar
2. Crear cliente con cuota CPC pendiente de **₲ 17.550**
3. *Registrar Ingreso → Cobrar a Cliente* → tildar la cuota → Siguiente
4. **Aplicar descuento** → Porcentaje = **5**, motivo cualquiera
5. ✅ Botón `APLICAR` debe estar **habilitado**
6. ✅ Backend acepta sin error (validación coherente)

**Automatizado:**
```bash
./node_modules/.bin/ng test --watch=false \
  --include='**/descuento-dialog.component.spec.ts'
# → 5 tests, todos ✅
```

**Test específico del caso (spec línea 42):**
```typescript
it('debe habilitar APLICAR cuando el descuento es exactamente el tope (caso no entero)')
// Subtotal: 17550, Tope: 5%, Esperado: 878
// Resultado: excedeTope = false ✅
```

---

## 8. Riesgo: Backend NO valida `maxPorcentaje`

**OBSERVACIÓN CRÍTICA:**

El handler `registrar-pago-consolidado` (electron) **NO recibe** ni valida el `maxPorcentaje` del `DescuentoDialogData`. Solo valida:

1. Que el descuento esté en la moneda de la deuda (línea 196-199 del handler)
2. Que las formas de pago cubran la deuda dentro de la tolerancia (línea 216-218)
3. Que el motivo esté presente si hay descuento (línea 273-278)

**El tope porcentual solo se valida en el frontend.**

**Implicación:**
- La UI bloquea descuentos > tope configurado
- Pero un cliente malicioso que invoque `/api/rpc` directamente puede enviar un descuento ilimitado
- **Esto NO es un bug del fix #272**: es una decisión preexistente del sistema

**Comentario del código (línea 99-100 del componente):**
```typescript
// Se avisa en vez de recortar en silencio: si el usuario escribió 100.000 y
// el tope son 50.000, ver "50.000" sin explicación es peor que un error.
```

La validación de UX (no permitir que el usuario confirme) está cumplida. La validación de seguridad (que el backend rechace payload manipulado) **no existe**, pero tampoco estaba en el alcance del fix.

**Recomendación:** Si se considera que el tope de descuento es una política de negocio crítica (auditoría, control financiero), el handler debería:
1. Recibir `cajaMayorContextoId` (ya lo recibe desde 2026-08-27)
2. Leer `CajaMayorConfiguracion.descuentoMaximoPorcentaje`
3. Rechazar la transacción si `(descuento / deuda) > tope`

Pero esto excede el alcance de la auditoría del motor de redondeo.

---

## 9. Cobertura de tests

**Archivo de tests:** `descuento-dialog.component.spec.ts` (creado en el fix)

### Tests incluidos (5 specs):

1. ✅ **`should create`** — smoke test básico
2. ✅ **`debe habilitar APLICAR cuando el descuento es exactamente el tope`** — caso del bug (#272)
3. ✅ **`debe calcular maxMonto correctamente con tope porcentual`** — redondeo del tope
4. ✅ **`debe redondear montoDescuento a decimales de la moneda`** — caso no entero 3.5%
5. ✅ **`debe bloquear APLICAR cuando el descuento supera el tope`** — validación del tope

**Casos cubiertos:**
- Moneda sin decimales (PYG, `decimales: 0`)
- Moneda con decimales (USD/BRL, `decimales: 2`)
- Tope no entero (17550 × 5% = 878)
- Exceso de tope (600 > 500 → bloquea)

**Tests de regresión mencionados en el PR:**
- `npm run test:cobro-cpc-consolidado` (63 tests)
- `npm run test:pago-consolidado` (90 tests)
- `npm run build` ✅
- `npm run check` ✅ (AOT estricto)

**Cobertura:** Adecuada para el alcance del fix. Los tests unitarios aíslan el componente y los E2E verifican la integración completa.

---

## 10. Regresión: ¿Afecta al PdV?

**Del PR:**
> "El diálogo se usa también en el PdV para descuento global de venta, pero ahí no hay `maxPorcentaje`. El fix no cambia su comportamiento funcional, solo mejora la consistencia de redondeo interno."

**Verificación:**

El componente acepta `maxPorcentaje?: number | null` (opcional). Si no se pasa o es `null`:

```typescript
if (pctMax != null && Number(pctMax) >= 0) {
  this.maxMonto = redondear(...);  // Solo se ejecuta si pctMax existe
}
// Si no hay tope, maxMonto queda null y excedeTope siempre es false
```

**En el PdV:**
- Se abre el diálogo sin `maxPorcentaje`
- No hay validación de tope
- Solo se redondea `montoDescuento` a `decimalesMoneda`

**Impacto del fix en el PdV:**
- Antes: `montoDescuento = subtotal * (pct / 100)` → podía tener decimales residuales en moneda sin decimales
- Ahora: `montoDescuento = redondear(subtotal * (pct / 100), decimalesMoneda)` → siempre entero para PYG

**Conclusión:** Es una MEJORA (coherencia), no una regresión.

---

## 11. Documentación actualizada

**Archivo:** `.claude/skills/frc-gourmet-expert/domains/financiero-caja-mayor.md`

**Diff aplicado:**
```diff
+### Redondeo del tope de descuento
+
+El tope de descuento (`CajaMayorConfiguracion.descuentoMaximoPorcentaje`) se calcula
+y compara usando la **misma función `redondear()`** que el backend:
+
+```typescript
+import { redondear } from '@shared/utils/pago-consolidado.util';
+maxMonto = redondear(subtotal * (topePct / 100), decimalesMoneda);
+montoDescuento = redondear(subtotal * (pct / 100), decimalesMoneda);
+```
+
+**Invariante:** ambos valores se redondean con los mismos `decimalesMoneda`, así que
+la comparación `montoDescuento > maxMonto` es coherente con lo que el backend aceptaría.
+
+**Ejemplo del bug que corregía:** cuota ₲17.550, tope 5% → 877.5 → `redondear(..., 0) = 878`.
+Si `maxMonto` usara `Math.floor` (877) y `montoDescuento` quedara en 877.5, la validación
+rechazaría el 5% exacto aunque el backend lo aceptaría.
```

**Evaluación:** La doc agrega el invariante y el ejemplo del bug. Suficiente para que el próximo desarrollador entienda por qué ambos usan `redondear`.

---

## 12. Conclusión y recomendaciones

### ✅ Aprobado

El fix cumple con el objetivo: elimina la incoherencia entre frontend y backend que bloqueaba el descuento máximo configurado. La implementación es correcta, los tests cubren el caso crítico, y el comportamiento ante exceso de tope es explícito.

### Riesgos identificados

1. **[BAJO] Re-export indirecto en Electron**
   - **Contexto:** El handler importa desde `electron/utils/pago-consolidado.util.ts`, que re-exporta desde `src/app/shared/utils/`.
   - **Riesgo:** Si alguien mueve el archivo fuente, el re-export se rompe.
   - **Mitigación:** TypeScript detecta el error en compilación. No es un fallo silencioso.
   - **Justificación:** Es un patrón establecido del proyecto (también usado en `monto-letras.util.ts`, `dashboard-rangos.util.ts`).

2. **[INFO] El backend NO valida el tope de descuento**
   - **Contexto:** El handler `registrar-pago-consolidado` acepta cualquier monto de descuento, sin chequear el `maxPorcentaje` de la configuración.
   - **Riesgo:** Un cliente que llame a `/api/rpc` directamente puede aplicar descuentos ilimitados.
   - **Estado:** Preexistente, no introducido por el fix.
   - **Alcance:** Fuera del scope de esta auditoría (motor de redondeo frontend).
   - **Recomendación:** Evaluar en auditoría de seguridad si el tope debe ser server-authoritative.

### Hallazgos positivos

- ✅ Coherencia frontend-backend garantizada por código compartido
- ✅ Caso crítico 17550×5%=878 funciona correctamente
- ✅ Comportamiento explícito (bloquea, no recorta en silencio)
- ✅ Tests unitarios del caso del bug
- ✅ Sin regresión en el PdV (uso sin tope)
- ✅ Documentación actualizada con el invariante

---

**Firma:** Cloud Agent · audit/motor-redondeo-descuento-272 · 2026-09-02
