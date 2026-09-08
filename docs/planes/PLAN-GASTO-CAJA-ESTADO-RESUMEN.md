# Plan — Incluir `estado` en el payload de gastos del resumen de caja

> Branch: `cursor/gasto-caja-estado-resumen-cd00` · base `develop`
> Estado: **implementado** · PR #292 draft

## 1. Diagnóstico

### Bug verificado (QA local 2026-09-08, post PR #290)

En el **RESUMEN DE CAJA**, el botón de editar (lápiz) de un `GastoCaja` se ve pero
está deshabilitado y no responde al click. La causa está verificada en el código:

**Causa raíz:**

1. `electron/utils/resumen-caja.utils.ts` línea 166-188, función `computeResumenCaja`:
   - Ya filtra correctamente `GastoCaja` con `estado: 'ACTIVO'` en el `find()` (línea 166).
   - Pero el `map()` que construye el payload (líneas 172-188) **NO incluye `estado`** en el objeto retornado.
   - Solo incluye: `id`, `descripcion`, `monto`, `monedaId`, `monedaSimbolo`, `monedaDenominacion`, `formaPago`, `categoria`, `fecha`.

2. `src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.html` línea 175:
   ```html
   [disabled]="g.estado !== 'ACTIVO'"
   ```
   - Si `g.estado` es `undefined`, la condición `!== 'ACTIVO'` es `true` → botón queda disabled.

3. El handler de edición (`edit-gasto-caja`) y el diálogo (`CreateGastoCajaDialogComponent` con `gastoId`) ya existen y funcionan (PR #290).
   - Tras guardar, `editarGasto()` llama `ngOnInit()` si `result.success`, lo que recarga el resumen completo.

**Contexto de caja abierta:**

- Si la caja está **abierta**, no hay card de DIFERENCIAS (solo aparece si `conteoCierre.length > 0`).
- Lo que debe actualizarse al guardar la edición: la **fila del gasto** con el nuevo monto, y si el resumen expone el **esperado/total**, ese número debe reflejar el cambio.
- `computeResumenCaja` ya recalcula `esperadoPorMoneda` acumulando `gastosEfectivoPorMoneda` (líneas 254-270) con los gastos ACTIVOS.
- NO hay snapshot de cierre congelado: el resumen lee en vivo los gastos de la caja. Esto es correcto.

## 2. Alcance del fix

### 2.1 Campos faltantes en el payload

- **Campo principal:** `estado` (`'ACTIVO' | 'ANULADO'`).
- **Revisar otros campos que el botón o el diálogo puedan necesitar:**
  - El HTML solo chequea `g.estado !== 'ACTIVO'` para disabled.
  - El tooltip usa `g.estado === 'ACTIVO'` para determinar el mensaje.
  - `editarGasto()` (línea 98-116 del TS) solo pasa `gasto.id` al diálogo.
  - El diálogo de edición (`gasto-caja-dialog.component.ts`) llama `getGastoCaja(gastoId)`, que ya tiene `ensurePermission` desde PR #290.
- **Conclusión:** solo falta `estado` en el payload del resumen.

### 2.2 Regla de negocio (sin cambios)

- **ACTIVO:** botón Editar habilitado (caja abierta o cerrada).
- **ANULADO:** botón Editar deshabilitado, tooltip "No se puede editar (gasto anulado)".
- Esta regla ya está en el HTML (línea 176) y en el TS (línea 100): no requiere cambio.

### 2.3 Recálculo del esperado tras edición

- Al guardar la edición, `ngOnInit()` recarga el resumen completo vía `getResumenCaja()`.
- `computeResumenCaja` ya suma los gastos activos en `gastosEfectivoPorMoneda` (líneas 170-187) y los usa para calcular `esperadoPorMoneda` (línea 270).
- **No se necesita ajuste adicional:** el mecanismo de recarga ya garantiza que el esperado refleje el nuevo monto.

### 2.4 Exclusiones explícitas

| Qué NO entra | Por qué |
|---|---|
| PWA mobile | Sin pantalla de gastos de caja (fuera de alcance del PR #290 original) |
| Shared component nuevo | El diálogo ya existe (`CreateGastoCajaDialogComponent`) y es reutilizable |
| Migración | No hay cambio de esquema, solo de payload runtime |
| `npm start` para probar | Se ejecutará en la fase de testing manual, no antes |
| Editar `.html` del resumen | El `[disabled]` ya está correcto; solo faltaba el campo en el payload |
| Aflojar permisos | `get-gasto-caja` ya requiere `FINANCIERO_CAJA_GESTIONAR` (PR #290, commit b13fce01) |

## 3. Fases de implementación

### Fase 0: Editar `resumen-caja.utils.ts`

**Archivo:** `electron/utils/resumen-caja.utils.ts` línea 172-188

**Cambio:**

```diff
  const gastos = gastosCaja.map(g => {
    const monedaId = (g.moneda as any)?.id;
    const monto = Number(g.monto || 0);
    if (monedaId && (g.formaPago as any)?.movimentaCaja) {
      gastosEfectivoPorMoneda[monedaId] = (gastosEfectivoPorMoneda[monedaId] || 0) + monto;
    }
    return {
      id: g.id,
+     estado: g.estado,
      descripcion: g.descripcion,
      monto,
      monedaId,
      monedaSimbolo: (g.moneda as any)?.simbolo || '',
      monedaDenominacion: (g.moneda as any)?.denominacion || '',
      formaPago: (g.formaPago as any)?.nombre || '',
      categoria: (g.gastoCategoria as any)?.nombre || '',
      fecha: g.fecha,
    };
  });
```

**Resultado:**

- El payload de `resumen.gastos[]` ahora incluye `estado: 'ACTIVO'` para cada gasto.
- El HTML puede evaluar `g.estado !== 'ACTIVO'` correctamente.
- Botón Editar se habilita para gastos activos.

### Fase 1: Test de regresión

**Objetivo:** Asegurar que un cambio futuro no vuelva a omitir el campo `estado`.

**Archivo:** `scripts/test-resumen-caja-numeros.ts`

**Estrategia:**

- Este test ya verifica la aritmética del resumen (efectivo, esperado, diferencia) en modo "Postgres" (decimales como string).
- **Agregar un assert:** `ok(resumen.gastos[0]?.estado === 'ACTIVO', 'el gasto en el payload incluye estado ACTIVO', resumen.gastos[0])`.
- El gasto ya se crea con `estado: 'ACTIVO'` por defecto en `create-gasto-caja` (línea 37 del handler).

**Implementación:**

```diff
  console.log('\n[1] Resumen con decimales como string (Postgres)');
  const resumen: any = await computeResumenCaja(comoPostgres(ds), caja.id);

  const efectivoGs = resumen.efectivoPorMoneda[gs.id];
  const esperadoGs = resumen.esperadoPorMoneda[gs.id];
  const totalGs = resumen.ventasTotalPorMoneda.find((t: any) => t.monedaId === gs.id)?.total;
  const aperturaGs = resumen.conteoApertura.find((c: any) => c.monedaId === gs.id)?.total;

+ ok(resumen.gastos?.length > 0, 'el resumen incluye gastos de la caja');
+ ok(resumen.gastos[0]?.estado === 'ACTIVO', 'cada gasto en el payload incluye estado ACTIVO', resumen.gastos[0]);

  ok(typeof efectivoGs === 'number' && Number.isFinite(efectivoGs),
    'el efectivo es un número finito, no una concatenación', efectivoGs);
  // [resto del test sin cambios]
```

**Si el fix se revierte:** el test falla con `✗ cada gasto en el payload incluye estado ACTIVO {"id":1,"descripcion":"GASTO PRUEBA",...,"estado":undefined}`.

### Fase 2: Testing manual

**Ambiente:** Desktop en desarrollo (`npm start`).

**Pasos:**

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Abrir una caja PdV (`F9`) | Caja abierta |
| 2 | Registrar un gasto de 50.000 Gs, categoría SERVICIOS, descripción "LUZ" | Gasto creado |
| 3 | Abrir el resumen de caja (lista de cajas, botón Ver) | Card GASTOS con fila "LUZ · SERVICIOS Gs 50.000", botón lápiz **habilitado** |
| 4 | Click en lápiz | Diálogo "EDITAR GASTO DE CAJA" se abre |
| 5 | Cambiar monto a 60.000, guardar | "Gasto actualizado", diálogo se cierra |
| 6 | Verificar fila en el resumen | Fila ahora muestra "Gs 60.000" |
| 7 | Verificar esperado de Gs | Si la apertura era 500.000 y no hay otros movimientos, esperado = 440.000 (500k - 60k) |
| 8 | Cerrar caja, abrir resumen de nuevo | Card DIFERENCIAS aparece; gasto sigue con lápiz habilitado |
| 9 | Desde la lista de gastos de caja (fuera del resumen), anular el gasto | Gasto queda ANULADO |
| 10 | Reabrir el resumen de caja cerrada | Gasto ya NO aparece (filtro `estado: 'ACTIVO'` en el `find()`) |

**Verificación adicional (opcional):**

- Con dev tools, inspeccionar `resumen.gastos` en `ResumenCajaDialogComponent.resumen` → cada objeto debe tener `estado: 'ACTIVO'`.

### Fase 3: Documentación

**Archivo:** `docs/GASTOS-CAJA-Y-MONEDA.md`

**Cambio:**

```diff
  ## Edición de Gastos en Resumen de Caja

  El botón de editar en el listado de gastos:

  - Solo se muestra para gastos con estado `ACTIVO`
  - Está disponible incluso cuando la caja está cerrada
- - El resumen de caja lee los gastos `ACTIVO` de forma dinámica (on-the-fly) desde la base de datos
+ - El resumen de caja lee los gastos `ACTIVO` de forma dinámica desde la base de datos
+ - El payload del resumen **incluye el campo `estado`** para habilitar/deshabilitar el botón de edición correctamente
```

**Motivo:** Registrar que el fix cerró el bug de que el botón se veía pero no funcionaba.

## 4. Archivos tocados

| Archivo | Cambio | Tipo |
|---|---|---|
| `electron/utils/resumen-caja.utils.ts` | Agregar `estado: g.estado` en el map de gastos (línea ~178) | `.ts` |
| `scripts/test-resumen-caja-numeros.ts` | Assert de que `resumen.gastos[0].estado === 'ACTIVO'` | `.ts` |
| `docs/GASTOS-CAJA-Y-MONEDA.md` | Nota de que el payload incluye `estado` | `.md` |
| `docs/planes/PLAN-GASTO-CAJA-ESTADO-RESUMEN.md` | Este plan (se borra al cerrar el ciclo) | `.md` (temporal) |

**NO se toca:**

- `src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.html` — el `[disabled]` ya es correcto.
- `src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.ts` — el `editarGasto()` ya funciona.
- `electron/handlers/gastos-caja.handler.ts` — el `edit-gasto-caja` ya tiene `ensurePermission` (PR #290).
- Ningún archivo de preload, main, ni entidad: no requiere reinicio.

## 5. Riesgos y consideraciones

### 5.1 Riesgo de regresión

**Bajo.** Solo se agrega un campo al payload; no se cambia lógica de filtrado ni cálculo.

**Mitigación:** El test de la Fase 1 falla si se omite el campo de nuevo.

### 5.2 Migración

**NO aplica.** El campo `GastoCaja.estado` ya existe en la entidad (de origen, antes del PR #290). Este fix solo lo expone en el payload del resumen.

### 5.3 Permisos

**Sin cambios.** El flujo de edición ya requiere `FINANCIERO_CAJA_GESTIONAR` (commit b13fce01 del PR #290). No se afloja.

### 5.4 Testing de la aritmética

**Ya cubierto.** `test:resumen-caja-numeros` verifica que el esperado recalcula correctamente tras agregar gastos. No se necesita nuevo test de aritmética.

## 6. Convención de commits

**Patrón observado en `git log --oneline develop`:**

- `fix(financiero): agregar estado en payload de gastos del resumen`
- `test(resumen-caja): verificar que gastos incluyen estado`
- `docs: cerrar bug del botón editar gastos en resumen de caja`

**Estrategia de commits:**

- Fase 0: `fix(financiero): agregar estado en payload de gastos del resumen de caja`
- Fase 1: `test(resumen-caja): assert de estado en gastos del payload`
- Fase 3: `docs: actualizar GASTOS-CAJA-Y-MONEDA con fix del estado`

**NO se batchean** salvo que el fix sea trivial y el test quepa en el mismo commit. En este caso, se mantienen separados para claridad.

## 7. Checklist de terminado

- [ ] Fase 0: `estado` incluido en el map de gastos del resumen
- [ ] Fase 1: Assert agregado a `test:resumen-caja-numeros`
- [ ] Test pasa: `npm run test:resumen-caja-numeros`
- [ ] Fase 2: Testing manual completo (10 pasos)
- [ ] Fase 3: Doc actualizada
- [ ] Commits pusheados a `fix/gasto-caja-estado-resumen-cd00`
- [ ] PR draft creado contra `develop`
- [ ] Título PR: `fix(financiero): habilitar edición de gastos desde resumen de caja`
- [ ] Descripción PR: enlace a este plan + línea "Cierra el bug de que el lápiz de editar GastoCaja se ve pero no abre"

## 8. Apéndice: Código relevante

### Filtro de gastos activos (ya correcto)

```typescript
// electron/utils/resumen-caja.utils.ts línea 165-169
const gastosCaja = await dataSource.getRepository(GastoCaja).find({
  where: { caja: { id: cajaId } as any, estado: 'ACTIVO' },
  relations: ['moneda', 'formaPago', 'gastoCategoria'],
  order: { fecha: 'DESC', id: 'DESC' } as any,
});
```

### Botón de editar en el HTML (ya correcto)

```html
<!-- src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component.html línea 172-179 -->
<button
  *appHasPermission="'FINANCIERO_CAJA_GESTIONAR'"
  mat-icon-button
  class="tile-action-button"
  [disabled]="g.estado !== 'ACTIVO'"
  [matTooltip]="g.estado === 'ACTIVO' ? 'Editar gasto' : 'No se puede editar (gasto anulado)'"
  (click)="editarGasto(g)">
  <mat-icon>edit</mat-icon>
</button>
```

### Handler de edición (ya completo desde PR #290)

```typescript
// electron/handlers/gastos-caja.handler.ts línea 68-100
ipcMain.handle('edit-gasto-caja', async (_event, gastoId: number, data: any) => {
  await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
  // [resto del handler sin cambios]
});
```

---

**Este plan se borrará al cerrar el ciclo** (cuando el PR se mergee a `develop`). No se mergea con el código.
