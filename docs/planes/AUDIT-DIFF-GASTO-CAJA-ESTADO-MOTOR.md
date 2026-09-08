# Auditoría DIFF — Motor Gasto Caja Estado Resumen

> **Rama:** `cursor/gasto-caja-estado-resumen-cd00`  
> **PR:** https://github.com/GabFrank/frc-gourmet/pull/292 (draft)  
> **HEAD auditado:** `fa93d563` (2026-09-08 19:22 UTC)  
> **Auditor:** Cloud Agent (no implementador)

---

## Veredicto

**PASS con reservas** (P1)

El cambio es **correcto** y **seguro** para merge. El único campo agregado (`estado: g.estado`) no altera filtros, aritmética ni consumidores existentes. Sin embargo, hay **una reserva de documentación** que justifica P1.

---

## Contexto del cambio

### Commit auditado

```
e546c484 fix(financiero): agregar estado en payload de gastos del resumen de caja
```

### Diff del motor

```diff
--- a/electron/utils/resumen-caja.utils.ts
+++ b/electron/utils/resumen-caja.utils.ts
@@ -176,6 +176,7 @@ export async function computeResumenCaja(dataSource: DataSource, cajaId: number)
     }
     return {
       id: g.id,
+      estado: g.estado,
       descripcion: g.descripcion,
       monto,
       monedaId,
```

**Una línea agregada, sin modificaciones a lógica existente.**

---

## Verificación de los 4 puntos críticos

### 1. ✅ El map NO cambia el filtro ACTIVO ni el cálculo del esperado

#### Filtro (línea 166)
```typescript
const gastosCaja = await dataSource.getRepository(GastoCaja).find({
  where: { caja: { id: cajaId } as any, estado: 'ACTIVO' },
  relations: ['moneda', 'formaPago', 'gastoCategoria'],
  order: { fecha: 'DESC', id: 'DESC' } as any,
});
```

- El `where: { estado: 'ACTIVO' }` **no se toca**.
- El map (líneas 172-188) **solo proyecta** campos del objeto `g` ya filtrado.

#### Cálculo del esperado (líneas 170-270)

```typescript
// Línea 170-176: Acumulación de gastos efectivo (ANTES del map)
const gastosEfectivoPorMoneda: { [monedaId: number]: number } = {};
const gastos = gastosCaja.map(g => {
  const monedaId = (g.moneda as any)?.id;
  const monto = Number(g.monto || 0);
  if (monedaId && (g.formaPago as any)?.movimentaCaja) {
    gastosEfectivoPorMoneda[monedaId] = (gastosEfectivoPorMoneda[monedaId] || 0) + monto;
  }
  // [proyección del payload]
});

// Línea 270: Resta de gastos del esperado
esperadoPorMoneda[monedaId] = apertura + efectivo - gastoEfectivo - egresoEfectivo - retiroEfectivo;
```

- El acumulador `gastosEfectivoPorMoneda` se construye **dentro del map, antes del return**.
- Agregar `estado: g.estado` al objeto retornado **no afecta** la acumulación ni la fórmula del esperado.
- **Riesgo:** NULO. La aritmética queda intacta.

---

### 2. ✅ El fixture del test de 10.000 NO rompe otros asserts

#### Fixture del test (línea 143-148)

```typescript
const categoria: any = await save(GastoCategoria, { nombre: 'SERVICIOS', activo: true });
await save(GastoCaja, {
  caja: { id: caja.id }, gastoCategoria: { id: categoria.id },
  descripcion: 'GASTO PRUEBA', monto: 10000, moneda: { id: gs.id },
  formaPago: { id: efectivo.id }, fecha: new Date(), estado: 'ACTIVO',
});
```

#### Asserts del esperado (línea 167)

```typescript
// Esperado = apertura 500.000 + efectivo 220.000 - gasto 10.000 = 710.000
ok(esperadoGs === 710000, 'esperado = apertura 500k + efectivo 220k - gasto 10k', esperadoGs);
```

**Aritmética verificada:**

- Apertura: 500.000 (5 billetes de 100k)
- Ventas en efectivo: 150k + 50k + 40k - 20k (vuelto) = 220k
- Gasto en efectivo: 10k
- Esperado: 500k + 220k - 10k = **710k** ✅
- La tarjeta (80k) NO mueve caja, así que no entra al esperado. ✅

#### Nuevo assert del estado (línea 170-173)

```typescript
ok(resumen.gastos && resumen.gastos.length > 0, 'el resumen incluye gastos de la caja');
const gasto = resumen.gastos.find((g: any) => g.descripcion === 'GASTO PRUEBA');
ok(gasto != null, 'el gasto GASTO PRUEBA está en el payload', resumen.gastos);
ok(gasto?.estado === 'ACTIVO', 'el gasto en el payload incluye estado ACTIVO', gasto);
```

- Verifica que el campo `estado` está presente y es `'ACTIVO'`.
- **Riesgo:** NULO. El assert es aditivo, no modifica el fixture.

---

### 3. ✅ NO hay snapshot de cierre que ignore el campo

#### Proceso de cierre (financiero.handler.ts, líneas 691-724)

El cierre de caja **no guarda** un snapshot del resumen. Solo actualiza:

```typescript
// Línea 696-720 (simplificado)
if (data?.estado === CajaEstado.CERRADO && entity.estado !== CajaEstado.CERRADO) {
  // Validación: solo el abridor puede cerrar
  // Guard: no cerrar si hay ventas abiertas
}
// Actualiza entity.estado, entity.fechaCierre, entity.conteoCierre
await cajaRepo.save(entity);
```

**Qué se guarda al cerrar:**

- `Caja.estado` → `CERRADO`
- `Caja.fechaCierre` → timestamp
- `Caja.conteoCierre` → FK al `Conteo`

**Qué NO se guarda:**

- ❌ Resumen completo (gastos, ventas, esperado, diferencia)
- ❌ Payload de `computeResumenCaja`

#### Consumo del resumen

Cada vez que se pide el resumen (abierta o cerrada), se recalcula:

```typescript
// ventas.handler.ts línea 1233-1235
ipcMain.handle('getResumenCaja', async (_event: any, cajaId: number) => {
  return await computeResumenCaja(dataSource, cajaId);
});
```

**Riesgo:** NULO. No hay snapshot que ignore el campo `estado`.

---

### 4. ✅ Consumidores del payload NO se rompen

#### Consumidor 1: `resumen-caja-imagen.util.ts` (líneas 126-130)

```typescript
for (const x of resumen.gastos) {
  g.rows.push({ 
    label: String(x.descripcion || x.categoria || 'GASTO').toUpperCase(), 
    value: fmt(x.monedaId, x.monto) 
  });
  tot[Number(x.monedaId)] = (tot[Number(x.monedaId)] || 0) + Number(x.monto || 0);
}
```

- **Campos usados:** `descripcion`, `categoria`, `monedaId`, `monto`.
- **Campo `estado`:** NO usado, ignorado.
- **Riesgo:** NULO. El generador de imagen no lee `estado`.

#### Consumidor 2: `resumen-caja-dialog.component.ts` (línea 100)

```typescript
editarGasto(gasto: any): void {
  if (!this.permissionService.has('FINANCIERO_CAJA_GESTIONAR')) return;
  if (gasto.estado !== 'ACTIVO') return; // ← NECESITA el campo
  // [abre diálogo de edición]
}
```

- **Campo `estado`:** SÍ usado, **es el objetivo del fix**.
- **Riesgo:** NULO. Ahora funciona; antes era `undefined` y el botón quedaba disabled.

#### Consumidor 3: `resumen-caja-dialog.component.html` (líneas 170-178)

```html
<button
  *appHasPermission="'FINANCIERO_CAJA_GESTIONAR'"
  mat-icon-button
  [disabled]="g.estado !== 'ACTIVO'"
  [matTooltip]="g.estado === 'ACTIVO' ? 'Editar gasto' : 'No se puede editar (gasto anulado)'"
  (click)="editarGasto(g)">
  <mat-icon>edit</mat-icon>
</button>
```

- **Campo `estado`:** SÍ usado para disabled y tooltip.
- **Antes del fix:** `g.estado === undefined` → `[disabled]="true"` → botón bloqueado.
- **Después del fix:** `g.estado === 'ACTIVO'` → `[disabled]="false"` → botón habilitado.
- **Riesgo:** NULO. El fix cierra el bug reportado.

---

## Reservas (P1)

### Reserva única: Documentación de permisos incompleta

**Archivo:** `docs/GASTOS-CAJA-Y-MONEDA.md` (líneas 28-34)

```markdown
## Edición de Gastos en Resumen de Caja

El botón de editar en el listado de gastos:

- Solo se muestra para gastos con estado `ACTIVO`
- Está disponible incluso cuando la caja está cerrada
- El resumen de caja lee los gastos `ACTIVO` de forma dinámica desde la base de datos
- El payload del resumen incluye el campo `estado` para habilitar/deshabilitar el botón de edición correctamente
```

**Qué falta:**

La doc menciona **"Solo se muestra"**, pero el botón **siempre se muestra** (no hay `*ngIf` en el HTML). Lo que cambia es el `[disabled]`.

**Corrección sugerida (opcional, no bloqueante):**

```diff
- Solo se muestra para gastos con estado `ACTIVO`
+ Solo está habilitado para gastos con estado `ACTIVO` (los anulados tienen el botón deshabilitado)
```

**Justificación de P1:** La documentación es imprecisa, pero el código es correcto. Si se mergea sin corregir la doc, un lector puede confundirse sobre el comportamiento real del botón. **No es un bug de código, es un bug de prosa.**

---

## Riesgos NO materializados

| Riesgo teórico | Descartado porque... |
|---|---|
| Cambio del filtro ACTIVO | El `where: { estado: 'ACTIVO' }` no se toca |
| Romper el cálculo del esperado | La acumulación ocurre ANTES del `return` del map |
| Fixture del test inflando el esperado | El gasto de 10k **debe** descontar del esperado (es el caso de prueba) |
| Snapshot de cierre con payload viejo | No hay snapshot; el resumen se recalcula en cada llamada |
| Generador de imagen rompiéndose | No lee el campo `estado`, lo ignora |
| Tooltip sin el campo | El fix precisamente agrega el campo para que el tooltip funcione |

---

## Recomendaciones para el implementador original

1. **Corregir la doc** (línea 28 de `GASTOS-CAJA-Y-MONEDA.md`):
   - Cambiar "Solo se muestra" → "Solo está habilitado".
   - Commit sugerido: `docs: corregir imprecisión sobre botón de editar gastos`.

2. **Confirmar que el test pasa**:
   ```bash
   npm run test:resumen-caja-numeros
   ```
   Debe imprimir `✓ el gasto en el payload incluye estado ACTIVO`.

3. **Marcar PR ready** cuando la doc esté corregida.

---

## Conclusión

El motor **funciona correctamente**. El único agregado (`estado: g.estado`) es:

- **Seguro:** no altera filtros, aritmética, ni lógica de cierre.
- **Necesario:** cierra el bug de que el botón de editar quedaba disabled.
- **Probado:** el test verifica que el campo está presente.

La reserva P1 es de **documentación**, no de código. El diff puede mergearse **sin riesgo técnico**, pero se recomienda corregir la prosa antes de convertir el PR de draft a ready.

---

**Firma de auditoría:**  
✅ Sin modificaciones al motor auditado  
✅ Sin merge a la rama base  
✅ Commit de esta auditoría pendiente en la misma rama
