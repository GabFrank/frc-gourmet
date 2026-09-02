# Auditoría: Poder Discriminante de Tests — PR #278 (Fix #272)

**Rama auditada:** `cursor/descuento-tope-redondeo-9278`  
**Archivo de tests:** `src/app/shared/components/descuento-dialog/descuento-dialog.component.spec.ts`  
**Auditor:** Cloud Agent (eje 3 — poder discriminante)  
**Fecha:** 2026-09-02

---

## 1. Resumen Ejecutivo

**El test SÍ discrimina el bug**, pero con **tres debilidades arquitectónicas** que comprometen su confiabilidad y mantenibilidad:

1. **Flakiness por `setTimeout(100)`** — todos los tests críticos dependen de timing arbitrario
2. **Arquitectura dual de instanciación** — TestBed default + `dialog.open()` secundario ignoran el fixture principal
3. **Sin script npm específico** — hay `test:pagar-obligaciones-dialog` pero no `test:descuento-dialog`

**Veredicto:** ✅ **Los tests actuales detectarían la regresión**, pero ⚠️ **son frágiles y pueden fallar en CI lento**.

---

## 2. Análisis del Bug y el Fix

### 2.1. Diff del Fix

```diff
// ANTES (bug):
-      const f = Math.pow(10, this.decimalesMoneda);
-      this.maxMonto = Math.floor(Number(this.data.subtotal) * (Number(pctMax) / 100) * f) / f;
+      this.maxMonto = redondear(Number(this.data.subtotal) * (Number(pctMax) / 100), this.decimalesMoneda);

// Y en recalcular():
-      this.montoDescuento = this.data.subtotal * (pct / 100);
+      this.montoDescuento = redondear(this.data.subtotal * (pct / 100), this.decimalesMoneda);
```

### 2.2. Raíz del Problema

**Incoherencia de redondeo:** `maxMonto` usaba **`Math.floor`** (truncar hacia abajo), mientras que `montoDescuento` no redondeaba (punto flotante crudo). Con el caso **17550 × 5% = 877.5**:

- `Math.floor(877.5)` → **877**
- Punto flotante → **877.5** (luego comparado contra 877)
- **Resultado:** `excedeTope = true` ❌ (bloquea el botón APLICAR)

**Con el fix:** ambos usan `redondear()` (que hace `Math.round`), por lo que ambos dan **878** → `excedeTope = false` ✅

### 2.3. Poder Discriminante del Caso de Prueba

El test línea 42–72 reproduce **exactamente** este escenario:

```typescript
const subtotal = 17550;
const topePct = 5;
const esperado = 878; // redondear(17550 * 0.05, 0)
```

**Si se revierte el fix:**
- `maxMonto` volvería a ser **877** (Math.floor)
- `montoDescuento` sería **878** (o 877.5 sin redondear)
- `excedeTope` sería **true**
- `expect(instance.excedeTope).toBe(false)` ❌ **FALLARÍA**
- `expect(instance.form.valid).toBe(true)` ❌ **FALLARÍA**

**Conclusión:** ✅ **El test discrimina correctamente**.

---

## 3. Riesgos Identificados

### 3.1. ⚠️ Flakiness por `setTimeout(100)` — RIESGO MEDIO

**Problema:**  
Los 4 tests que ejercitan el path crítico (todos los que usan `dialog.open()`) dependen de un timeout arbitrario de **100ms** para esperar a que `ngOnInit` complete:

```typescript
setTimeout(() => {
  // Act + Assert
  expect(instance.excedeTope).toBe(false);
  done();
}, 100);
```

**Por qué es un riesgo:**
- CI lento (Ubuntu 22 con alta carga) puede tardar >100ms en ejecutar `ngOnInit`
- El test pasaría con la assertion sin esperar → **falso positivo**
- O fallaría con timeout → **falso negativo**

**Evidencia del código:**
- `ngOnInit()` hace cálculos síncronos simples (líneas 68-89)
- NO hay llamadas asíncronas (HTTP, setTimeout, Promise)
- La espera NO es necesaria técnicamente

**Alternativa correcta:**  
Usar `fixture.whenStable()` + `fakeAsync/tick` o simplemente `fixture.detectChanges()` + assertion directa (el cálculo es síncrono).

```typescript
// SIN setTimeout:
const dialogRef = dialog.open(DescuentoDialogComponent, { data });
const instance = dialogRef.componentInstance;
// ngOnInit ya corrió porque MatDialog es síncrono hasta el primer detectChanges
expect(instance.maxMonto).toBe(878);
```

### 3.2. ⚠️ Arquitectura Dual de Instanciación — RIESGO BAJO (confusión)

**Problema:**  
El `beforeEach` crea un componente con `TestBed.createComponent()` (línea 32-35):

```typescript
fixture = TestBed.createComponent(DescuentoDialogComponent);
component = fixture.componentInstance;
fixture.detectChanges();
```

Pero **ningún test usa `component` ni `fixture`**. Todos los tests que importan abren una **segunda instancia** con `dialog.open()` (líneas 48, 75, 96, 119).

**Consecuencias:**
1. El fixture default tiene `subtotal: 10000, decimales: 0` **sin `maxPorcentaje`** → NO ejercita el path del bug
2. El único test que usa el fixture es `'should create'` (línea 38) — trivial
3. Los tests funcionales ignoran el componente "principal" → confusión al leer el código

**Justificación técnica:**  
`MatDialog` inyecta `MAT_DIALOG_DATA` via DI. Para probar distintos inputs, la forma canónica es abrir múltiples diálogos. **PERO** el fixture default no aporta cobertura.

**Recomendación (no bloqueante):**  
Eliminar el `beforeEach` fixture o cambiar el mock data a un caso con `maxPorcentaje` para que al menos el test `'should create'` valide la lógica de tope.

### 3.3. ℹ️ Falta Script NPM Específico — RIESGO BAJO

**Hallazgo:**  
Existe `npm run test:pagar-obligaciones-dialog` (que usa `ng test` filtrado por archivo), pero **no** `test:descuento-dialog`.

**Impacto:**  
- Para correr estos tests en aislamiento hay que usar:
  ```bash
  ng test frc-gourmet --watch=false --include='**/descuento-dialog.component.spec.ts'
  ```
- No es bloqueante, pero el patrón del resto del proyecto es tener scripts dedicados.

**Recomendación (opcional):**  
Agregar en `package.json`:
```json
"test:descuento-dialog": "ng test frc-gourmet --watch=false --include='**/descuento-dialog.component.spec.ts'"
```

---

## 4. Cobertura de Casos

### 4.1. Casos Cubiertos ✅

| Test | Línea | Caso | Discrimina el Bug |
|------|-------|------|-------------------|
| **"debe habilitar APLICAR cuando el descuento es exactamente el tope (caso no entero)"** | 42-72 | 17550 × 5% = 878 | ✅ **SÍ** — el caso crítico |
| "debe calcular maxMonto correctamente con tope porcentual" | 74-93 | 20000 × 10% = 2000 | ⚠️ Parcial (verifica `maxMonto` pero no `excedeTope`) |
| "debe redondear montoDescuento a decimales de la moneda" | 95-116 | 15000 × 3.5% = 525 (sin tope) | ❌ NO — sin `maxPorcentaje` |
| "debe bloquear APLICAR cuando el descuento supera el tope" | 118-140 | 10000 × 6% > 5% (600 > 500) | ✅ Complementario (límite superior) |

**Conclusión de cobertura:** El test línea 42–72 es el **único que discrimina la regresión exacta del bug**. Los demás son auxiliares.

### 4.2. Casos NO Cubiertos ❌

1. **Moneda con decimales (USD, BRL):**  
   El bug también aplica con `decimales: 2`, pero todos los tests usan `decimales: 0` o sin especificar. Ejemplo no cubierto:
   ```typescript
   subtotal: 123.45, maxPorcentaje: 7, decimales: 2
   // 123.45 × 0.07 = 8.6415 → redondear(8.6415, 2) = 8.64
   // Con Math.floor: 8.64; con sin redondear: 8.6415 (pero acá el bug es menos obvio)
   ```

2. **Tope en `0` o `null`:**  
   `maxPorcentaje: 0` debería bloquear todo descuento, `maxPorcentaje: null` debería deshabilitarlo. No se verifica.

3. **Edición del descuento (caso `monto`):**  
   Todos los tests usan `tipoDescuento: 'porcentaje'`. El path de `monto` también llama a `redondear()` pero no se testea con tope.

---

## 5. Verificación del Código Real

### 5.1. Función `redondear` (pago-consolidado.util.ts:33-38)

```typescript
export function redondear(valor: number, decimales: number): number {
  const f = Math.pow(10, decimales);
  // Redondeo sobre el entero escalado: evita que 1.005 caiga para abajo por el
  // error binario de coma flotante.
  return Math.round((valor + Number.EPSILON) * f) / f;
}
```

**Confirmación:** Usa `Math.round()`, no `Math.floor()`. **El fix es correcto**.

### 5.2. Uso en Producción

El componente se abre desde:
1. **`pdv.component.ts:2507`** — descuento global del PdV (el caso real reportado)
2. **`pagar-obligaciones-dialog.component.ts:649`** — descuento en pago consolidado de Caja Mayor

Ambos pasan `maxPorcentaje` (si la caja lo tiene configurado), por lo que el bug los afectaba a los dos.

---

## 6. Recomendaciones

### 6.1. Críticas (bloquean confianza del test)

❌ **Ninguna** — el test actual **SÍ detectaría la regresión**.

### 6.2. Mejoras Recomendadas

1. **Eliminar `setTimeout(100)` y usar aserciones síncronas:**
   ```typescript
   const dialogRef = dialog.open(DescuentoDialogComponent, { data });
   const instance = dialogRef.componentInstance;
   // ngOnInit ya corrió, el cálculo es síncrono
   expect(instance.maxMonto).toBe(878);
   expect(instance.excedeTope).toBe(false);
   dialogRef.close();
   ```

2. **Agregar caso con `decimales: 2`** para verificar que el redondeo funciona en USD/BRL.

3. **Agregar script npm:**
   ```json
   "test:descuento-dialog": "ng test frc-gourmet --watch=false --include='**/descuento-dialog.component.spec.ts'"
   ```

4. **Simplificar el `beforeEach`:** o eliminarlo (si no se usa), o cambiar `mockDialogData` a un caso con `maxPorcentaje` para que `'should create'` tenga valor.

---

## 7. Conclusión

**El test línea 42–72 (`"debe habilitar APLICAR cuando el descuento es exactamente el tope (caso no entero)"`) DISCRIMINA CORRECTAMENTE el bug:**

- ✅ Reproduce el caso exacto (17550 × 5% = 878)
- ✅ Verifica `excedeTope === false` (el síntoma del bug era `true`)
- ✅ Si se revierte el fix → `Math.floor(877.5) = 877` vs `redondear(877.5) = 878` → test falla

**Debilidad principal:** `setTimeout(100)` introduce riesgo de flakiness en CI lento. **No es bloqueante** (el código bajo test es síncrono), pero reduce la confiabilidad del test.

**Acción sugerida:**  
Refactorizar el test para eliminar `setTimeout` y usar aserciones directas. Agregar caso con `decimales: 2` para monedas con centavos.

---

**Firma del auditor:**  
Este informe fue generado por revisión automatizada del código. Los hallazgos se basan en análisis estático y conocimiento de las convenciones del proyecto (skill `.claude/skills/frc-gourmet-expert`).
