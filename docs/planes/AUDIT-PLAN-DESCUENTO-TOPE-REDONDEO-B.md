# Auditoría del Plan: Fix redondeo del tope de descuento (Eje B)

**Plan auditado:** `docs/planes/PLAN-DESCUENTO-TOPE-REDONDEO.md`  
**Issue:** [#272](https://github.com/GabFrank/frc-gourmet/issues/272)  
**PR del plan:** [#278](https://github.com/GabFrank/frc-gourmet/pull/278)  
**Fecha auditoría:** 2026-09-02  
**Auditor:** Cloud Agent (eje B — correctitud contra código real, drivers, permisos, tests)

---

## Veredicto

**⚠️ OBSERVACIONES** — El plan es correcto en su diagnóstico y fix propuesto, pero el test tiene un error crítico que lo haría fallar al ejecutarse.

---

## Hallazgos numerados

### 1. ✅ Frontend: confirmado el uso de `Math.floor` (bloqueante)

**Ubicación:** `src/app/shared/components/descuento-dialog/descuento-dialog.component.ts:75`

```typescript
const f = Math.pow(10, this.decimalesMoneda);
this.maxMonto = Math.floor(Number(this.data.subtotal) * (Number(pctMax) / 100) * f) / f;
```

**Verificación:** Con `subtotal=17550`, `pctMax=5`, `decimales=0`:
- `Math.floor(17550 * 0.05 * 1) / 1 = Math.floor(877.5) = 877`

**Impacto:** El tope calculado es **877**, mientras el backend espera **878** (`redondear(877.5, 0) = 878`).

---

### 2. ✅ Frontend: confirmado que `montoDescuento` NO se redondea

**Ubicación:** `src/app/shared/components/descuento-dialog/descuento-dialog.component.ts:93-98`

```typescript
recalcular(): void {
  if (this.tipoDescuento === 'porcentaje') {
    const pct = this.form.get('porcentaje')?.value || 0;
    this.montoDescuento = this.data.subtotal * (pct / 100);  // ← SIN redondear
  } else {
    this.montoDescuento = this.form.get('monto')?.value || 0;
  }
```

**Verificación:** Con `subtotal=17550`, `pct=5`:
- `montoDescuento = 17550 * 0.05 = 877.5` (valor crudo, no redondeado)

**Impacto:** La comparación `877.5 > 877` bloquea el botón APLICAR. Además, el template muestra `−877,5` en guaraníes (moneda de 0 decimales).

---

### 3. ✅ Backend: confirmado el uso de `redondear` (correcto)

**Ubicación:** `electron/handlers/pago-consolidado.handler.ts:231`

```typescript
if (topePct != null) {
  const maximo = redondear(totalDeuda * (topePct / 100), decDeuda);
  if (montoDescuento > maximo) {
    throw new Error(`El descuento supera el tope configurado (${topePct}% = ${maximo}).`);
  }
}
```

**Verificación:** Con `totalDeuda=17550`, `topePct=5`, `decDeuda=0`:
- `redondear(17550 * 0.05, 0) = redondear(877.5, 0) = 878`

**Conclusión:** El backend **SÍ** aceptaría un descuento de 878, pero el frontend lo bloquea en 877.

---

### 4. ✅ La función `redondear` es LA MISMA en ambos lados

**Fuente única (shared):** `src/app/shared/utils/pago-consolidado.util.ts:33-38`

```typescript
export function redondear(valor: number, decimales: number): number {
  const f = Math.pow(10, decimales);
  // Redondeo sobre el entero escalado: evita que 1.005 caiga para abajo por el
  // error binario de coma flotante.
  return Math.round((valor + Number.EPSILON) * f) / f;
}
```

**Re-exportada en backend:** `electron/utils/pago-consolidado.util.ts`  
**Grep confirmó:** ambos archivos contienen la misma implementación.

**Conclusión:** NO hay dos funciones `redondear` distintas. Es la misma lógica, TS puro, compartida entre frontend y backend. El plan dice correctamente que es "TS puro re-exportado".

---

### 5. ✅ SQLite vs Postgres: bug de JS rounding, NO de driver

**Análisis:**
- El bug ocurre en **cálculo de JavaScript** (`Math.floor` vs `Math.round`), no en consultas SQL.
- El issue reporta haberlo encontrado en Postgres: "probando a mano […] sobre Postgres, con datos de producción".
- La función `redondear` opera sobre `number` de JS, antes de cualquier persistencia.
- Las columnas de moneda (`NUMERIC` en Postgres, `REAL` en SQLite) NO participan en este cálculo — el tope se valida en memoria contra el draft del usuario.

**Conclusión:** Este bug es **independiente del driver**. Afecta a ambos (SQLite y Postgres) por igual. El plan lo diagnostica correctamente como un problema de redondeo de JS.

---

### 6. ⚠️ Permisos: N/A pero el wizard ya verifica `CPC_DESCUENTO`

**Ubicación:** El descuento en el cobro consolidado de CPC requiere el permiso `CPC_DESCUENTO`.

**Verificado en:**
- `src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.spec.ts:286-287`

```typescript
it('sólo se ofrece con el permiso, aunque el concepto lo admita', async () => {
  await crear(PagoConcepto.COBRO_CLIENTE, CUOTAS_CPC, []);  // ← SIN el permiso
  expect(component.puedeAplicarDescuento).toBeFalse();
});
```

**El diálogo `DescuentoDialogComponent`:**
- Es un componente **presentacional** (standalone, recibe `maxPorcentaje` por data).
- NO verifica permisos directamente (es correcto: la verificación está en el wizard que lo abre).
- El wizard (`pagar-obligaciones-dialog`) es quien consulta el permiso antes de habilitar el botón "Aplicar descuento".

**Conclusión:** Este fix NO requiere agregar `ensurePermission`. El descuento ya está protegido por:
1. Frontend: el wizard verifica `CPC_DESCUENTO` antes de mostrar el botón.
2. Backend: el handler `pago-consolidado.handler.ts` valida el tope (líneas 220-235), pero el permiso para el concepto `COBRO_CLIENTE` se valida en la entrada del handler (`ensurePermission('CPC_COBRAR')` esperado, aunque no lo vi en el código — posible gap de auditoría anterior, pero NO de este fix).

---

### 7. ⚠️ El test propuesto tiene un ERROR crítico (bloqueante)

**Ubicación del test propuesto:** Plan sección §5, línea 149-174

El plan propone este test en `pagar-obligaciones-dialog.component.spec.ts`:

```typescript
it('debe habilitar APLICAR cuando el descuento es exactamente el tope (caso no entero)', () => {
  // ...
  const dialogRef = fixture.componentInstance.openDescuentoDialog({  // ← ESTO NO EXISTE
    subtotal,
    decimales: 0,
    maxPorcentaje: topePct,
  });
  
  const instance = dialogRef.componentInstance;
  // ...
```

**Problema:**
- `PagarObligacionesDialogComponent` **NO tiene** un método `openDescuentoDialog()`.
- Grep confirmó que `openDescuentoDialog()` existe en `pago-dialog.component.ts:1274` (componente del PdV), NO en el wizard de cobro consolidado.
- El wizard usa `MatDialog.open()` internamente para abrir `DescuentoDialogComponent`, y el spec actual lo mockea con `responderDescuento()` (línea 140):

```typescript
function responderDescuento(res: any): void {
  dialogOpen.and.returnValue({ afterClosed: () => of(res) } as any);
}
```

**Resultado esperado:** El test propuesto **fallaría con error de compilación** al intentar llamar a un método que no existe.

**Fix requerido:** El test debe:
1. Usar `responderDescuento({ descuentoPorcentaje: 5, descuentoMotivo: 'PRUEBA' })` para mockear la respuesta del diálogo.
2. Llamar a `component.aplicarDescuento()` (el método que abre el diálogo).
3. Verificar que la línea de descuento resultante tenga `monto: 878` (no el `montoDescuento` interno del diálogo, que no es accesible desde el spec del wizard).

**Test correcto sería:**

```typescript
it('debe habilitar APLICAR cuando el descuento es exactamente el tope (caso no entero)', async () => {
  await crear(PagoConcepto.COBRO_CLIENTE, [
    { origenId: 101, saldoPendiente: 17550, montoTotal: 17550, 
      monedaId: 1, decimales: 0, /* ... resto de campos ... */ }
  ], ['CPC_DESCUENTO'], { descuentoCpcMaxPorcentaje: 5 });
  
  seleccionar(101);
  responderDescuento({ descuentoPorcentaje: 5, descuentoMotivo: 'PRUEBA' });
  
  await component.aplicarDescuento();
  
  const lineaDesc = component.lineas.find((l) => l.fuente === 'DESCUENTO')!;
  expect(lineaDesc).toBeDefined();
  expect(lineaDesc.monto).toBe(878); // redondear(17550 * 0.05, 0)
  
  agregarEfectivo(17550 - 878);
  expect(component.cuadra).toBeTrue();
});
```

**Impacto:** El test propuesto NO ejercitaría el diálogo de descuento directamente (no es posible desde el spec del wizard). Ejercita el **resultado** del diálogo: que la línea de descuento aplicada tenga el monto correcto.

---

### 8. ⚠️ El test propuesto NO fallaría hoy (no apunta al riesgo)

**Razón:**
- El test propuesto (incluso corregido) verifica el comportamiento **del wizard**, que recibe el resultado del diálogo como un número ya calculado.
- El wizard aplica el descuento **sin volver a verificar el tope** — confía en que el diálogo ya lo validó.
- El **bug actual** está dentro del diálogo (`DescuentoDialogComponent`): el botón APLICAR queda deshabilitado y el diálogo se cierra con `null`, antes de que el wizard vea nada.

**Para que el test apunte al riesgo real:**
- Debería testear **`DescuentoDialogComponent` directamente** (no el wizard).
- O mockear el `MatDialog` para que devuelva el descuento del 5% (como hace el test corregido arriba), y verificar que el wizard lo acepta — lo cual **pasaría hoy** porque el wizard no re-valida el tope.

**Conclusión:** El test propuesto (corregido) **NO fallaría hoy** y **SÍ pasaría después del fix**, pero NO por la razón correcta: no ejercita el bug del diálogo. Es un test de **regresión del wizard**, no del diálogo.

---

## Riesgos identificados

### Riesgo 1: El fix podría permitir descuentos mayores al tope en edge cases

**Probabilidad:** Muy baja  
**Severidad:** Media

**Escenario:** Si el plan implementa mal el redondeo (ej. usa `Math.ceil` en vez de `redondear`), el frontend podría calcular un `maxMonto` de 878 pero el backend validar con 877, permitiendo superar el tope.

**Mitigación actual:**
- El backend **SÍ** valida el tope (línea 231 del handler).
- El backend es la frontera real (`/api/rpc` es default-allow según el skill).
- El fix propuesto usa la MISMA función `redondear` que el backend → invariante garantizado.

**Mitigación recomendada:** Agregar un test E2E que:
1. Configure tope 5%.
2. Intente aplicar un descuento de 878 (redondeado) con subtotal 17550.
3. Verifique que el backend lo **acepte** (HTTP 200, no error).
4. Intente aplicar 879 (1 más que el tope).
5. Verifique que el backend lo **rechace** con el mensaje de error esperado.

---

### Riesgo 2: El test propuesto no cubre el bug real (calidad del test)

**Probabilidad:** Alta (confirmado)  
**Severidad:** Baja (el bug se detectó manualmente, no por falta de tests)

**Impacto:** El test propuesto (incluso corregido) pasaría hoy y pasaría después del fix, pero NO porque ejercita el bug del diálogo. Es un **falso positivo de cobertura**.

**Mitigación recomendada:**
1. Crear `descuento-dialog.component.spec.ts` (no existe hoy).
2. Testear el diálogo directamente:

```typescript
it('maxMonto debe coincidir con el backend cuando el tope no es entero', () => {
  const data: DescuentoDialogData = {
    subtotal: 17550,
    decimales: 0,
    maxPorcentaje: 5,
  };
  const dialogRef = TestBed.get(MatDialog).open(DescuentoDialogComponent, { data });
  const instance = dialogRef.componentInstance;
  
  // El maxMonto debe ser redondear(17550 * 0.05, 0) = 878
  expect(instance.maxMonto).toBe(878);
  
  // Pedir exactamente el 5%
  instance.form.patchValue({ porcentaje: 5, motivo: 'PRUEBA' });
  instance.recalcular();
  
  // montoDescuento debe ser 878 (redondeado), no 877.5
  expect(instance.montoDescuento).toBe(878);
  expect(instance.excedeTope).toBe(false); // ← El bug actual hace que sea true
  expect(instance.form.valid).toBe(true);
});
```

Este test **SÍ fallaría hoy** (esperado `excedeTope=false`, actual `true`) y pasaría después del fix.

---

### Riesgo 3: Romper el descuento en el PdV (regresión)

**Probabilidad:** Baja  
**Severidad:** Media

**Escenario:** El plan dice que el diálogo se usa "también en el PdV para descuento global de venta", pero el PdV no manda `maxPorcentaje`. El fix de redondeo podría cambiar el comportamiento del PdV si:
- El PdV manda `decimales` distintos de 0.
- El PdV tiene algún edge case de redondeo que hoy funciona "de suerte" con `Math.floor`.

**Mitigación actual:**
- El PdV no usa `maxPorcentaje` (el plan lo confirma).
- El fix solo afecta el cálculo de `maxMonto` (que es `null` en el PdV) y el redondeo de `montoDescuento` (mejora la consistencia visual).

**Mitigación recomendada:** Prueba manual del descuento en el PdV:
1. Venta de ₲ 17.550.
2. Aplicar descuento del 5% (modo porcentaje).
3. Verificar que muestre **−878** (no −877,5).
4. Confirmar el cobro → verificar que la venta quede en ₲ 16.672.

---

## Calidad del plan

### Puntos fuertes

1. **Diagnóstico exacto:** El plan identifica correctamente las dos incoherencias (`Math.floor` vs `redondear` y `montoDescuento` sin redondear).
2. **Causa verificada:** La sección §2 explica el desempate de 1 unidad con ejemplos numéricos.
3. **Alcance claro:** Distingue lo que toca (el diálogo) de lo que NO (backend, otros flujos).
4. **Fix correcto:** Usar `redondear` en ambos lados garantiza coherencia.
5. **Documentación completa:** Referencias a archivos, líneas, ejemplos de código.

### Debilidades

1. **Test propuesto con error crítico:** Llama a un método que no existe (`openDescuentoDialog`).
2. **Test no apunta al riesgo:** Verifica el wizard (que pasaría hoy), no el diálogo (que fallaría hoy).
3. **Falta test unitario del diálogo:** `descuento-dialog.component.spec.ts` no existe. El test propuesto asume que existe un spec del wizard, pero no propone crear el spec del componente real.

---

## Recomendaciones

1. **Corregir el test propuesto** como se muestra en el hallazgo 7.
2. **Crear `descuento-dialog.component.spec.ts`** con al menos el caso "tope no entero" (hallazgo 8).
3. **Agregar test E2E del backend** que valide el tope con un caso no entero (riesgo 1).
4. **Prueba manual del PdV** después del fix (riesgo 3).
5. **Considerar agregar `ensurePermission('CPC_COBRAR')` al handler** si no existe (comentario en hallazgo 6 — out of scope de este fix, pero posible gap de auditoría previa).

---

## Conclusión

El plan es **técnicamente correcto** en su diagnóstico y fix propuesto. Las dos incoherencias existen como se describe, y el uso de `redondear` es la solución correcta. El backend ya usa `redondear`, y la función es la misma en ambos lados (confirmado).

El **test propuesto tiene un error crítico** que haría fallar la compilación, y (aun corregido) no ejercita el bug real del diálogo. Esto NO invalida el fix, pero SÍ requiere ajustar la Fase 2 del plan.

El bug es de **JS rounding**, independiente del driver (SQLite/Postgres). Los permisos están cubiertos por el wizard; el diálogo no necesita verificarlos directamente.

**Veredicto final: OBSERVACIONES** — Proceder con el fix propuesto, pero reemplazar el test de la Fase 2 por los tests recomendados en los hallazgos 7 y 8.

---

## Snippets de código verificados

- `src/app/shared/components/descuento-dialog/descuento-dialog.component.ts:75` (Math.floor)
- `src/app/shared/components/descuento-dialog/descuento-dialog.component.ts:93-98` (sin redondear)
- `electron/handlers/pago-consolidado.handler.ts:231` (redondear backend)
- `src/app/shared/utils/pago-consolidado.util.ts:33-38` (función redondear)
- `electron/utils/pago-consolidado.util.ts` (misma función, confirmado por grep)
- `src/app/pages/financiero/caja-mayor/pagar-obligaciones-dialog/pagar-obligaciones-dialog.component.spec.ts:140` (responderDescuento)
- `src/app/shared/components/pago-dialog/pago-dialog.component.ts:1274` (openDescuentoDialog del PdV, NO del wizard)
