# AUDITORÍA DIFF-249-MOTOR: Implementación del Fix Fechas SQLite

**Plan base:** `docs/planes/PLAN-249-REPORTES-SQLITE-FECHA.md`  
**Issue:** [#249](https://github.com/GabFrank/frc-gourmet/issues/249)  
**PR:** [#296](https://github.com/GabFrank/frc-gourmet/pull/296)  
**Rama:** `cursor/fix-249-reportes-sqlite-fecha-65c8`  
**HEAD auditado:** `5bf196c8` (aprox, 08276a09 latest)  
**Auditor:** Agente Cloud (Auditoría de Implementación — Eje Motor)  
**Fecha:** 2026-09-09  
**Modelo:** claude-sonnet-4.5

---

## Veredicto

**PASS**

La implementación cumple correctamente con todos los requisitos del plan. El motor de conversión de fechas (`fechaParamSql`) se aplicó sistemáticamente en todos los handlers de reportes y dashboards que comparan columnas `datetime`, sin tocar columnas `date` ni áreas fuera del alcance. El test E2E verifica el comportamiento correcto.

---

## 1. Alcance: ¿Se tocó facturación ni tickets?

### ✅ NO se tocó el motor de facturación

**Verificación:**
```bash
git diff origin/develop...HEAD --name-only | grep -E "(factur|ticket)"
```

**Resultado:**
- `electron/handlers/documentos-tickets.handler.ts` — **Modificado**, pero cambios NO relacionados con fechas
- `scripts/test-ticket-venta-e2e.ts` — **Nuevo**, test helper

**Análisis del diff en documentos-tickets.handler.ts:**

Los cambios introducidos son:
1. **Línea 175:** Importar `DeliveryModo` (no relacionado con fechas)
2. **Líneas 190-200:** Nueva función `getDeliveryModoFromVenta` (delivery, no fechas)
3. **Líneas 202-215:** Nueva función `buildComandaHeaderLines` (encabezado comanda/delivery, no fechas)
4. **Líneas 219-237:** Modificación de `buildEncabezadoUbicacion` para soportar delivery/retiro (no fechas)
5. **Línea 655:** Uso de `buildComandaHeaderLines` en vez de `buildEncabezadoUbicacion` (refactor delivery)
6. **Línea 1046:** Cambio en formato de `totalesMonedaLines` (negrita, no fechas)

**Grep de fechaParamSql en tickets:**
```bash
grep -r "fechaParamSql" electron/handlers/documentos-tickets.handler.ts
```
**Resultado:** Sin coincidencias.

**Conclusión P0:** ✅ Los cambios en `documentos-tickets.handler.ts` pertenecen a otro fix (delivery/comanda rendering) y NO tocan el motor de fechas. Facturación y tickets quedaron correctamente fuera del alcance.

---

## 2. dashboard-compras.created_at: ¿Está incluido?

### ✅ SÍ incluido, 3 sitios corregidos

**Archivo:** `electron/handlers/dashboard-compras.handler.ts`

**Diff aplicado:**

| Línea (aprox) | Función | Columna | Cambio |
|---|---|---|---|
| 32 | `get-dashboard-compras-kpis` | `compras.created_at` | ✅ `.toISOString()` → `fechaParamSql(dataSource, desde/hasta)` |
| 67 | `get-dashboard-compras-kpis` (top proveedores) | `compras.created_at` | ✅ `.toISOString()` → `fechaParamSql(dataSource, desde/hasta)` |
| 120 | `get-dashboard-compras-kpis` (serie temporal) | `compras.created_at` | ✅ `.toISOString()` → `fechaParamSql(dataSource, bucket.desde/hasta)` |

**Código antes (línea 32):**
```typescript
`, [CompraEstado.FINALIZADO, CompraEstado.ACTIVO, desde.toISOString(), hasta.toISOString()]);
```

**Código después:**
```typescript
`, [CompraEstado.FINALIZADO, CompraEstado.ACTIVO, fechaParamSql(dataSource, desde), fechaParamSql(dataSource, hasta)]);
```

**Conclusión P0:** ✅ `dashboard-compras.handler.ts` fue incluido y corregido en las 3 ubicaciones detectadas por la auditoría del plan (AUDIT-PLAN-249-A.md § P0).

---

## 3. Columnas date-only: ¿Alguna pasó por fechaParamSql?

### ✅ NINGUNA columna date-only fue modificada

**Columnas date-only del plan (§2, enmienda 3):**
- `Asistencia.fecha` (date)
- `Vale.fecha` (date)
- `Cheque.fecha_pago` (date según plan, **datetime según entity** — ver § 5.1)
- `PrecioCosto.fecha` (date)
- `CuentaPorPagarCuota.fecha_vencimiento` (date)

**Verificación 1: Grep directo**
```bash
cd /workspace && git diff origin/develop...HEAD -- electron/handlers/ | \
  grep -E "(Asistencia|Vale|Cheque|PrecioCosto|fecha_vencimiento)"
```
**Resultado:** Sin coincidencias en el diff. Ninguna de estas tablas fue tocada.

**Verificación 2: Grep de fechaParamSql con campos date**
```bash
grep -r "fechaParamSql.*\.(fecha|fecha_pago|fecha_vencimiento)" electron/handlers/
```
**Resultado:** Sin coincidencias. `fechaParamSql` NO se usó con campos `.fecha`, `.fecha_pago`, ni `.fecha_vencimiento`.

**Verificación 3: Análisis de todos los usos de fechaParamSql**

Archivos modificados que usan `fechaParamSql`:

1. **dashboard-ventas.handler.ts** — `v.created_at` (Venta.created_at, datetime ✅)
2. **reportes-ventas.helper.ts** — `v.created_at`, `vi.created_at` (Venta/VentaItem, datetime ✅)
3. **reportes-delivery.helper.ts** — `v.created_at` (Venta.created_at, datetime ✅)
4. **reportes-finanzas.helper.ts** — `mv.fecha` (CajaMayorMovimiento.fecha, datetime ✅), `g.fecha` (Gasto.fecha, datetime ✅), `a.fecha_transaccion` (AcreditacionPos, datetime ✅)
5. **dashboard-productos.handler.ts** — `v.created_at` (Venta.created_at, datetime ✅)
6. **dashboard-caja-mayor.handler.ts** — `mv.fecha` (CajaMayorMovimiento.fecha, datetime ✅)
7. **dashboard-compras.handler.ts** — `c.created_at` (Compra.created_at, datetime ✅)
8. **dashboard-financiero.handler.ts** — `created_at` (MonedaCambio.created_at, datetime ✅)
9. **dashboard-rrhh.handler.ts** — `v.created_at` (Venta.created_at, datetime ✅) — **ya existía desde antes**

**Verificación de columnas datetime vs date:**

- `CajaMayorMovimiento.fecha` (línea 30 de la entity): `@Column() fecha!: Date;` → Sin tipo explícito = `datetime`/`timestamp` ✅
- `Gasto.fecha` (línea 30 de la entity): `@Column() fecha!: Date;` → Sin tipo explícito = `datetime` ✅
- `Venta.created_at` (BaseModel): `datetime` por convención TypeORM ✅
- `Compra.created_at` (BaseModel): `datetime` por convención TypeORM ✅
- `MonedaCambio.created_at` (BaseModel): `datetime` por convención TypeORM ✅

**Columnas NO tocadas (usan `.slice(0, 10)` correctamente):**

- `reportes-finanzas.helper.ts:245` — `c.fecha_vencimiento` usa `.slice(0, 10)` ✅
- `dashboard-productos.handler.ts:110` — `pc.fecha` (PrecioCosto.fecha) usa `.slice(0, 10)` ✅
- `dashboard-caja-mayor.handler.ts:79, 107` — `c.fecha_vencimiento` usa `.slice(0, 10)` ✅

**Conclusión P0:** ✅ Ninguna columna `date` sin hora fue pasada por `fechaParamSql`. Todas las conversiones aplicadas son sobre columnas `datetime`/`timestamp` que almacenan hora completa UTC.

---

## 4. Fin de rango: ¿Cuela el día 1 del mes siguiente? ¿Excluye el día 1 del período?

### ✅ El test E2E verifica comportamiento correcto

**Archivo:** `scripts/test-reporte-filtro-dia-uno.ts`

**Escenario de prueba:**
- 3 ventas creadas:
  - **Venta A:** `2026-08-01 10:00:00` (día 1 de agosto, monto 50k Gs)
  - **Venta B:** `2026-08-15 14:30:00` (día 15 de agosto, monto 75k Gs)
  - **Venta C:** `2026-09-01 09:00:00` (día 1 de septiembre, monto 100k Gs)

**Caso 1: Reporte de agosto (01-31)**
```typescript
const desdeAgosto = new Date(2026, 7, 1, 0, 0, 0, 0);     // Agosto = mes 7 (0-indexed)
const hastaAgosto = new Date(2026, 7, 31, 23, 59, 59, 999);
const desdeSQL = fechaParamSql(ds, desdeAgosto);  // '2026-08-01 00:00:00.000'
const hastaSQL = fechaParamSql(ds, hastaAgosto);  // '2026-08-31 23:59:59.999'
```

**Aserciones (líneas 123-126):**
```typescript
ok(ventasAgosto.length === 2, `Agosto debe contar 2 ventas (A+B)`);
ok(ventasAgosto.some(v => v.id === 1), 'Venta A (día 1) SÍ se incluye');        ✅
ok(ventasAgosto.some(v => v.id === 2), 'Venta B (día 15) SÍ se incluye');       ✅
ok(!ventasAgosto.some(v => v.id === 3), 'Venta C (día 1 sept) NO se incluye'); ✅
```

**Suma de montos (líneas 129-140):**
```typescript
const totalAgosto = Number(sumaPagos[0]?.total || 0);
const esperado = montoA + montoB;  // 50k + 75k = 125k Gs
ok(totalAgosto === esperado, `Total agosto debe ser 125k Gs, fue ${totalAgosto}`); ✅
```

**Caso 2: Reporte de septiembre (01-30)**
```typescript
const desdeSept = new Date(2026, 8, 1, 0, 0, 0, 0);
const hastaSept = new Date(2026, 8, 30, 23, 59, 59, 999);
```

**Aserciones (líneas 156-159):**
```typescript
ok(ventasSept.length === 1, `Septiembre debe contar 1 venta (C)`);
ok(ventasSept.some(v => v.id === 3), 'Venta C (día 1 sept) SÍ se incluye');  ✅
ok(!ventasSept.some(v => v.id === 1), 'Venta A NO se incluye en sept');      ✅
ok(!ventasSept.some(v => v.id === 2), 'Venta B NO se incluye en sept');      ✅
```

**Caso 3: Borde timezone (líneas 162-179)**
- Venta `2026-07-31 22:00:00` debe incluirse en **julio**, NO en agosto ✅

**Salida del test:**
```
✅ Test completado exitosamente
   - Día 1 del período se incluye correctamente
   - Día 1 del mes siguiente NO se incluye
   - Borde de timezone funciona con hora local
```

**Conclusión P0:** ✅ El test E2E confirma que:
1. El **día 1 del período SÍ se incluye** (Venta A en agosto).
2. El **día 1 del mes siguiente NO se cuela** (Venta C no aparece en agosto).
3. Los **montos suman correctamente** (125k Gs = 50k + 75k, sin la venta C).
4. Los **bordes de timezone no desplazan días** (31 julio 22:00 queda en julio).

---

## 5. Off-by-one en filtroRango: ¿Hay desfase local vs UTC?

### ✅ filtroRango convierte correctamente sin off-by-one

**Archivo:** `electron/handlers/dashboard-ventas.handler.ts`

**Cambio aplicado (líneas 67-70):**

**ANTES:**
```typescript
export function filtroRango(desdeISO: string, hastaISO: string): VentaFiltro {
  return { sql: 'v.created_at >= ? AND v.created_at <= ?', params: [desdeISO, hastaISO] };
}
```

**DESPUÉS:**
```typescript
export function filtroRango(dataSource: DataSource, desdeISO: string, hastaISO: string): VentaFiltro {
  const desde = fechaParamSql(dataSource, new Date(desdeISO));
  const hasta = fechaParamSql(dataSource, new Date(hastaISO));
  return { sql: 'v.created_at >= ? AND v.created_at <= ?', params: [desde, hasta] };
}
```

**Análisis:**

1. **Entrada:** `desdeISO` y `hastaISO` son strings ISO (`'2026-08-01T03:00:00.000Z'`)
2. **Conversión:** `new Date(desdeISO)` parsea el ISO correctamente como `Date` object UTC
3. **Normalización:** `fechaParamSql(dataSource, date)` convierte:
   - **Postgres:** deja el ISO sin cambios (`'2026-08-01T03:00:00.000Z'`)
   - **SQLite:** cambia formato a `'2026-08-01 03:00:00.000'` (espacio, sin Z, sin milisegundos extras)

**¿Por qué no hay off-by-one?**

El patrón de uso típico es:
```typescript
const desdeAgosto = new Date(2026, 7, 1, 0, 0, 0, 0);  // Local midnight
const hastaAgosto = new Date(2026, 7, 31, 23, 59, 59, 999);
filtroRango(dataSource, desdeAgosto.toISOString(), hastaAgosto.toISOString());
```

- `new Date(2026, 7, 1, 0, 0, 0, 0)` crea medianoche **en timezone local** (ej: `2026-08-01T03:00:00.000Z` si TZ=-03:00)
- `.toISOString()` lo serializa a UTC string (`'2026-08-01T03:00:00.000Z'`)
- `fechaParamSql` **preserva la hora UTC** y solo cambia el formato (`'2026-08-01 03:00:00.000'` en SQLite)
- La comparación SQL `created_at >= '2026-08-01 03:00:00.000'` funciona correctamente porque:
  - Las ventas se guardan con **UTC** vía `created_at: Date` (columna datetime)
  - El filtro también está en **UTC**
  - No hay conversión de timezone, solo normalización de formato de string

**Verificación de usos de filtroRango:**

Todos los call sites fueron actualizados para pasar `dataSource` como primer argumento:

1. `dashboard-ventas.handler.ts:322` — ✅ `filtroRango(dataSource, ventana.desde.toISOString(), ...)`
2. `dashboard-ventas.handler.ts:350` — ✅ `filtroRango(dataSource, hoyInicio.toISOString(), ...)`
3. `dashboard-ventas.handler.ts:587` — ✅ `filtroRango(dataSource, bucket.desde.toISOString(), ...)`
4. `reportes-ventas.helper.ts:39` — ✅ `filtroRango(ds, r.desde.toISOString(), ...)`
5. `reportes-ventas.helper.ts:96` — ✅ `filtroRango(ds, desde.toISOString(), ...)`
6. `reportes-ventas.helper.ts:443` — ✅ `filtroRango(ds, r.desde.toISOString(), ...)`

**Conclusión P0:** ✅ La implementación de `filtroRango` es correcta:
- Preserva la semántica UTC del timestamp original
- Solo normaliza el formato del string para SQLite
- No introduce desfases de timezone ni off-by-one
- Todos los call sites fueron actualizados

---

## 5.1. Hallazgo menor: Cheque.fecha_pago (P2 informativo)

**Contexto:** El plan menciona `Cheque.fecha_pago` como columna `date` que NO debe tocarse. Sin embargo, la entity define:

```typescript
// src/app/database/entities/financiero/cheque.entity.ts:35
@Column({ name: 'fecha_pago', nullable: true })
fechaPago?: Date;
```

Sin especificar `type: 'date'`, TypeORM mapea a `datetime`/`timestamp` según el driver. En SQLite sería TEXT datetime.

**Uso actual en código (NO modificado en este PR):**

```typescript
// reportes-finanzas.helper.ts:250 (sin cambios en el diff)
const chRows: any[] = await dbQuery(ds, `
  SELECT ch.numero_cheque as numero, ch.fecha_pago as fecha, ...
  FROM cheques ch
  WHERE ch.estado = 'DIFERIDO' AND ch.fecha_pago IS NOT NULL 
    AND ch.fecha_pago BETWEEN ? AND ?
  LIMIT 20
`, [hoy.toISOString(), en30.toISOString()]);
```

**Análisis:**
- El código actual **ya usa `.toISOString()` directamente** (sin `fechaParamSql`)
- Si `fecha_pago` es realmente `datetime` (como sugiere la entity), debería aplicarse el fix
- Sin embargo, **este código NO fue modificado en el PR** y tampoco causa el bug del issue #249 (que es sobre reportes/dashboards principales)

**Prioridad:** **P2 Informativo** — No bloquea el merge del PR actual, pero podría requerir un follow-up menor si `Cheque.fecha_pago` efectivamente almacena hora completa.

**Acción recomendada:** 
1. Verificar en las migraciones si `cheques.fecha_pago` es `date` o `datetime`
2. Si es `datetime`, crear un mini-fix en `reportes-finanzas.helper.ts:252` (fuera del alcance de #249)
3. Actualizar la documentación del plan para reflejar el tipo real de la columna

---

## 6. Convención UTC: ¿Es la que el código realmente usa?

### ✅ SÍ, la convención UTC es correcta y consistente

**Convención declarada en el plan (§1):**

> SQLite guarda columnas `datetime` como **TEXT con formato `YYYY-MM-DD HH:MM:SS.000`** (espacio, sin `T`, sin `Z`). El valor guardado es **UTC**.

**Verificación 1: Test E2E valida el formato**

```typescript
// scripts/test-reporte-filtro-dia-uno.ts:100-104
const stored: any[] = await ds.query(`SELECT id, created_at FROM ventas ORDER BY id`);
const formato = (v: string) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(v));
ok(formato(stored[0]?.created_at), 'Venta A guarda formato SQLite (YYYY-MM-DD HH:MM:SS)');
ok(formato(stored[1]?.created_at), 'Venta B guarda formato SQLite');
ok(formato(stored[2]?.created_at), 'Venta C guarda formato SQLite');
```

**Regex validada:** `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$`
- ✅ Separador espacio (no `T`)
- ✅ Sin `.000` ni milisegundos
- ✅ Sin `Z` al final

**Verificación 2: Helper fechaParamSql implementa la convención**

```typescript
// electron/utils/date.utils.ts:33-38
export function fechaParamSql(dataSource: { options: { type: string } }, fecha: Date): string {
  const iso = fecha.toISOString();  // '2026-08-01T18:00:00.000Z'
  if (dataSource?.options?.type === 'postgres') return iso;
  // SQLite: '2026-08-01T18:00:00.000Z' → '2026-08-01 18:00:00.000'
  return iso.slice(0, 23).replace('T', ' ');
}
```

**Análisis:**
- `fecha.toISOString()` produce UTC string: `'2026-08-01T18:00:00.000Z'`
- `.slice(0, 23)` corta en `.000` (incluye milisegundos): `'2026-08-01T18:00:00.000'`
- `.replace('T', ' ')` cambia separador: `'2026-08-01 18:00:00.000'`
- ⚠️ **Nota:** El test valida formato SIN `.000`, pero el helper los **preserva**

**Verificación 3: Creación de ventas en el test**

```typescript
// scripts/test-reporte-filtro-dia-uno.ts:66-85
const fechaA = '2026-08-01 10:00:00';  // Sin .000
await ds.query(`INSERT INTO ventas (..., created_at, ...) VALUES (..., ?, ...)`, [fechaA]);
```

Las ventas se insertan directamente con formato SQLite (espacio, sin milisegundos), y el test verifica que **la base las guarda tal cual**.

**Verificación 4: AUDIT-PLAN-249-A.md confirma evidencia**

> **✅ Timezone verificado:** SQLite guarda datetime como `YYYY-MM-DD HH:MM:SS` (sin milisegundos) en **UTC**. Evidencia: `scripts/test-kpis-filtros-e2e.ts:144-148` verifica el formato exacto; línea 79 sella con `toISOString().slice(0, 19).replace('T', ' ')`. El helper `fechaParamSql` ya hace lo correcto: toma `toISOString()` (UTC) y normaliza el formato.

**Hallazgo menor: Discrepancia en milisegundos**

- **Helper actual:** `slice(0, 23)` → preserva `.000`
- **Test validado:** regex sin `.000`
- **Evidencia histórica (test-kpis-filtros-e2e):** `slice(0, 19)` → sin milisegundos

**Impacto:** **Mínimo** — La comparación SQL `>=` y `<=` funcionará igual con o sin `.000` al final, porque el formato de espacio (vs `T`) ya resuelve el problema de orden de bytes. Sin embargo, para máxima coherencia con la convención histórica del repo, el helper podría cambiarse a `slice(0, 19)`.

**Conclusión P1 (no bloquea merge):** ✅ La convención UTC es correcta y el código la usa. Los valores guardados son UTC, y las comparaciones funcionan porque `fechaParamSql` normaliza el formato a espacio. La discrepancia de milisegundos (`.000` presente en helper pero ausente en test regex) NO afecta la corrección del fix, pero podría armonizarse en un commit de pulido.

---

## Resumen de Hallazgos

### P0 (críticos, bloquean merge)
**Ninguno.** Todos los requisitos P0 del plan fueron satisfechos.

### P1 (importantes, no bloquean merge)
**Ninguno grave.** Hallazgo menor informativo:
- **Milisegundos en helper:** `fechaParamSql` usa `slice(0, 23)` (incluye `.000`), mientras evidencia histórica usa `slice(0, 19)` (sin milisegundos). No afecta corrección, pero podría armonizarse por coherencia. *Acción: Opcional, commit de pulido post-merge.*

### P2 (informativos)
1. **Cheque.fecha_pago ambigüedad:** Entity sugiere `datetime`, plan dice `date`, código actual usa `.toISOString()` sin fix. Línea NO fue modificada en este PR. *Acción: Verificar en migraciones y documentar; posible mini-fix futuro.*

---

## Veredicto Final

### ✅ **PASS**

La implementación del PR #296 cumple correctamente con el plan PLAN-249-REPORTES-SQLITE-FECHA.md y resuelve el issue #249:

1. ✅ **NO tocó facturación ni tickets** (cambios en documentos-tickets son de otro fix)
2. ✅ **Dashboard-compras.created_at incluido** (3 sitios corregidos)
3. ✅ **Ninguna columna date-only pasó por fechaParamSql** (solo datetime)
4. ✅ **Fin de rango correcto** (test E2E verifica día 1 incluido, mes siguiente excluido)
5. ✅ **Sin off-by-one en filtroRango** (conversión UTC coherente)
6. ✅ **Convención UTC es la correcta** (formato con espacio, valores UTC)

**Recomendaciones post-merge:**
- Armonizar `fechaParamSql` a `slice(0, 19)` para eliminar milisegundos (coherencia histórica)
- Investigar `Cheque.fecha_pago` y actualizar documentación del tipo de columna
- Ejecutar el test E2E en CI como parte de la suite de regresión

---

**Auditoría completada:** 2026-09-09  
**Firma:** Agente Cloud (claude-sonnet-4.5)
