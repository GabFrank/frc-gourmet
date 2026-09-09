# PLAN-249: Fix filtros de fecha en reportes/dashboards (SQLite)

**Issue:** [#249](https://github.com/GabFrank/frc-gourmet/issues/249)  
**Rama:** `fix/249-reportes-sqlite-fecha`  
**Base:** `develop`  
**Autor:** Cloud Agent  
**Fecha:** 2026-09-09

---

## 1. Problema

SQLite guarda columnas `datetime` (como `ventas.created_at`, `cajas_mayor_movimientos.fecha`) como **TEXT con formato `YYYY-MM-DD HH:MM:SS`** (espacio, sin `.000`, sin `T`, sin `Z`). El valor guardado es **UTC**. 

Los handlers de reportes y dashboards comparan estas columnas contra límites generados con `Date.toISOString()`, que produce formato **`YYYY-MM-DDTHH:MM:SS.000Z`** (con `T` mayúscula).

SQLite compara estos strings **byte a byte** como texto. El espacio `' '` (0x20) ordena **antes** que `'T'` (0x54), por lo que:

```sql
'2026-08-01 18:00:00.000' >= '2026-08-01T03:00:00.000Z'   -- FALSO (debería ser VERDADERO)
```

**Consecuencias:**
- En filtros `created_at >= inicio AND created_at <= fin`, el **día 1 del período se excluye** completamente (todas las filas del día 1 quedan fuera del `>=`).
- Las filas del **día 1 del mes siguiente se cuelan** en el período anterior (pasan el `<=` cuando no deberían).
- En modo standalone (SQLite), los reportes mensuales pierden el día 1 y suman basura del mes siguiente.
- En Postgres no ocurre: la columna es `timestamp` nativo y el driver parsea el ISO correctamente.

**Helper existente:** `electron/utils/date.utils.ts` → `fechaParamSql(dataSource, fecha: Date)` ya normaliza el formato según el driver:
- SQLite: convierte `'2026-08-01T18:00:00.000Z'` → `'2026-08-01 18:00:00.000'` (espacio, sin Z)
- Postgres: devuelve el ISO sin cambios

Este helper **solo se usa en `dashboard-rrhh.handler.ts`** (líneas 154, 158). El resto de los ~65 sitios que comparan fechas **no lo usan**.

---

## 2. Alcance del fix

**SÍ tocar:**
- Handlers de reportes: `reportes-ventas.helper.ts`, `reportes-finanzas.helper.ts`, `reportes-delivery.helper.ts`
- Handlers de dashboards: `dashboard-ventas.handler.ts`, `dashboard-productos.handler.ts`, `dashboard-caja-mayor.handler.ts`, `dashboard-financiero.handler.ts`, **`dashboard-compras.handler.ts`** (enmienda auditoría A)
- Cualquier otro handler de reportes/dashboards que el grep demuestre con el mismo patrón

**NO tocar:**
- Facturación ni tickets (fuera del alcance del issue)
- Uso de `.toISOString()` que NO compare contra columnas datetime (ej: timestamps de log, serialización JSON)
- **Columnas `date` sin hora:** `Asistencia.fecha`, `Vale.fecha`, `Cheque.fecha_pago`, `PrecioCosto.fecha`, `CuentaPorPagarCuota.fecha_vencimiento` (enmienda 3)
- Comparaciones que ya usan `fechaParamSql` correctamente

---

## 3. Sitios afectados (listado completo)

### 3.1. `electron/handlers/dashboard-ventas.handler.ts`

| Línea | Función | Uso | Acción |
|---|---|---|---|
| 66-67 | `filtroRango(desdeISO, hastaISO)` | Devuelve `{ sql: 'v.created_at >= ? AND v.created_at <= ?', params: [desdeISO, hastaISO] }` | **Modificar:** los parámetros deben pasar por `fechaParamSql` antes de incluirse |
| 319-320 | `get-dashboard-ventas-kpis` | Llama `filtroRango(ventana.desde.toISOString(), ventana.hasta.toISOString())` | Se arregla cambiando `filtroRango` |
| 347 | `get-dashboard-ventas-kpis` | Llama `filtroRango(hoyInicio.toISOString(), hoyFin.toISOString())` | Se arregla cambiando `filtroRango` |
| 584 | `buildVentasPorPeriodo` | Llama `filtroY(filtroRango(bucket.desde.toISOString(), bucket.hasta.toISOString()), ...)` | Se arregla cambiando `filtroRango` |

**Plan:** 
1. Modificar la **firma** de `filtroRango` para recibir el `dataSource` como primer parámetro.
2. Dentro de `filtroRango`, aplicar `fechaParamSql(dataSource, new Date(desdeISO))` y `fechaParamSql(dataSource, new Date(hastaISO))` a los límites.
3. Actualizar todos los **call sites** (4 en este handler + los de otros helpers).

**Riesgo:** `filtroRango` se exporta y lo reusan `reportes-ventas.helper.ts` y otros. Hay que actualizar TODOS los call sites.

---

### 3.2. `electron/handlers/reportes-ventas.helper.ts`

| Línea | Función | Uso | Acción |
|---|---|---|---|
| 6-7 | import | Importa `filtroRango` de `dashboard-ventas.handler` | Actualizar llamadas tras cambio de firma |
| 38 | `kpisVentas` | `filtroRango(r.desde.toISOString(), r.hasta.toISOString())` | Pasar `dataSource` como 1er arg |
| 47 | `kpisVentas` | Comparación directa en SQL: `v.created_at >= ? AND v.created_at <= ?` con `r.desde.toISOString(), r.hasta.toISOString()` | Aplicar `fechaParamSql` a los dos límites |
| 55 | `kpisVentas` | Similar: `v.created_at >= ? AND v.created_at <= ?` con `.toISOString()` | Aplicar `fechaParamSql` |
| 95-96 | `sumaPorCanalVenta` | `filtroY(filtroRango(desde.toISOString(), hasta.toISOString()), canal)` | Pasar `dataSource` |
| 161 | `ventasPorDiaSemana` | `v.created_at >= ? AND v.created_at <= ?` con `.toISOString()` | Aplicar `fechaParamSql` |
| 182 | `heatmapHoras` | Similar | Aplicar `fechaParamSql` |
| 213 | `topProductos` | Similar | Aplicar `fechaParamSql` |
| 229 | `mixPago` | `filtroRango(...)` | Pasar `dataSource` |
| 251 | `combinaciones` | `v.created_at >= ? AND v.created_at <= ?` con `.toISOString()` | Aplicar `fechaParamSql` |
| 266, 284 | `meseros` | Similar (2 queries) | Aplicar `fechaParamSql` |

**Total:** 10 sitios en este archivo.

---

### 3.3. `electron/handlers/reportes-delivery.helper.ts`

| Línea | Función | Uso | Acción |
|---|---|---|---|
| 82-83 | `filtroRango` (local, redeclarado) | Devuelve `{ sql: 'v.created_at >= ? AND v.created_at <= ?', params: [r.desde.toISOString(), r.hasta.toISOString()] }` | **Modificar:** aplicar `fechaParamSql` antes de meter en `params` |

**Nota:** Este helper **redeclara** su propia función `filtroRango` (línea ~75-84) porque no quiere cerrar un ciclo de imports con `dashboard-ventas.handler`. Hay que aplicar el mismo fix aquí.

**Total:** 1 sitio (pero crítico, afecta todo el módulo de delivery).

---

### 3.4. `electron/handlers/reportes-finanzas.helper.ts`

| Línea | Función | Uso | Acción |
|---|---|---|---|
| 59 | `kpisFinanzas` | `mv.fecha >= ? AND mv.fecha <= ?` con `r.desde.toISOString(), r.hasta.toISOString()` | Aplicar `fechaParamSql` |
| 83 | `gastosOperativos` | Similar: `g.fecha >= ? AND g.fecha <= ?` | Aplicar `fechaParamSql` |
| 121 | `flujoCaja` (bucle por tramo) | `mv.fecha >= ? AND mv.fecha <= ?` con `desde.toISOString(), hasta.toISOString()` | Aplicar `fechaParamSql` |
| 139 | `composicionIngresos` | Similar | Aplicar `fechaParamSql` |
| 165 | `gastosPorCategoria` | Similar: `g.fecha >= ? AND g.fecha <= ?` | Aplicar `fechaParamSql` |
| 222 | `comisionesPOS` | Similar | Aplicar `fechaParamSql` |
| 234 | `vencimientos` | `fecha_vencimiento >= ? AND fecha_vencimiento <= ?` — pero usa `.slice(0, 10)` (solo fecha DATE, no datetime) | **NO tocar** (columna `date`, no `datetime`) |
| 251 | `vencimientos` (cheques) | `fecha_pago BETWEEN ? AND ?` con `.toISOString()` | Aplicar `fechaParamSql` |

**Total:** 7 sitios de `datetime`, 1 de `date` (ignorar).

---

### 3.5. `electron/handlers/dashboard-productos.handler.ts`

| Línea | Función | Uso | Acción |
|---|---|---|---|
| 110 | `get-dashboard-productos-kpis` | `pc.fecha` usa `.slice(0, 10)` → columna `date` (PrecioCosto.fecha) | **NO tocar** (sin hora) |
| 136 | `get-dashboard-productos-kpis` | `v.created_at >= ? AND v.created_at <= ?` con `.toISOString()` | Aplicar `fechaParamSql` |

**Total:** 1 sitio.

---

### 3.5b. `electron/handlers/dashboard-compras.handler.ts` (ENMIENDA AUDITORÍA A)

| Línea | Función | Uso | Acción |
|---|---|---|---|
| ~30 | `get-dashboard-compras-kpis` | Comparaciones contra `compras.created_at` | Aplicar `fechaParamSql` |
| ~62 | Similar | Similar | Aplicar `fechaParamSql` |
| ~118 | Similar | Similar | Aplicar `fechaParamSql` |

**Total:** ~3 sitios (verificar líneas exactas).

---

### 3.6. `electron/handlers/dashboard-caja-mayor.handler.ts`

| Línea | Función | Uso | Acción |
|---|---|---|---|
| 70 | `get-dashboard-caja-mayor-kpis` | `fecha_vencimiento` usa `.slice(0, 10)` → columna `date` | **NO tocar** |
| 88, 116 | `get-dashboard-caja-mayor-kpis` | `fecha_pago BETWEEN ? AND ?` con `.toISOString()` (Cheque.fecha_pago es `date`) | **NO tocar** (sin hora) |
| 107 | Similar | `.slice(0, 10)` | **NO tocar** |
| 171-172 | `buildMovimientos30d` | `mv.fecha >= ? AND mv.fecha <= ?` con `.toISOString()` | **Aplicar `fechaParamSql`** (CajaMayorMovimiento.fecha es `datetime`) |

**Total:** 1 sitio (`mv.fecha` línea 171-172).

---

### 3.7. `electron/handlers/dashboard-financiero.handler.ts`

| Línea | Función | Uso | Acción |
|---|---|---|---|
| 161, 173 | `buildCotizaciones30d` | `created_at <= ?` con `d.toISOString()` | Aplicar `fechaParamSql` (MonedaCambio.created_at es `datetime`) |

**Total:** 2 sitios (1 por moneda).

---

### 3.8. Otros handlers mencionados por el grep

#### `dashboard-rrhh.handler.ts` (líneas 65-66, 70-71)
- **Ya usa `fechaInicio.toISOString().slice(0, 10)`** para comparar contra `Asistencia.fecha`, que es columna `date` (sin hora).
- **NO tocar** (funcionamiento correcto).

#### `reportes-rrhh.handler.ts` (líneas 101-102, 121-122, 148-149, 168-169)
- **Similar:** todos usan `.slice(0, 10)` para `Asistencia.fecha` y `Vale.created_at`.
- **Revisar:** `Vale.created_at` podría ser `datetime`. Si es así, aplicar fix.

#### `movimientos-cliente.handler.ts` (líneas 56, 90-92, 166)
- Compara fechas pero usa `.split('T')[0]` y `.slice(0, 10)` → columnas `date`.
- **NO tocar** (ya normalizadas).

#### `comisiones.handler.ts` (línea 37)
- Función helper `isoDate(d)` que devuelve `.slice(0, 10)`.
- **NO tocar** (para columnas `date`).

#### `backup.handler.ts`, `documentos-tickets.handler.ts`, `vacaciones.handler.ts`
- Usos de `.toISOString()` para timestamps de log, serialización JSON, no comparaciones SQL.
- **NO tocar**.

---

## 4. Estrategia de implementación

### ENMIENDAS (2026-09-09)

1. **✅ Timezone verificado:** SQLite guarda datetime como `YYYY-MM-DD HH:MM:SS` (sin milisegundos) en **UTC**. Evidencia: `scripts/test-kpis-filtros-e2e.ts:144-148` verifica el formato exacto; línea 79 sella con `toISOString().slice(0, 19).replace('T', ' ')`. El helper `fechaParamSql` ya hace lo correcto: toma `toISOString()` (UTC) y normaliza el formato.
2. **Incluir `dashboard-compras.handler.ts`** (~3 sitios, auditoría A).
3. **NO tocar columnas `date`:** Asistencia.fecha, Vale.fecha, Cheque.fecha_pago, PrecioCosto.fecha, CuentaPorPagarCuota.fecha_vencimiento.
4. **Preferir fin exclusivo:** `>= inicio AND < inicioDíaSiguiente`, salvo query existente con test que dependa del inclusivo.
5. **Test E2E:** venta día 1, mitad de mes, día 1 del mes siguiente. Reporte cuenta exactamente las dos primeras.
6. **NO tocar facturación ni tickets.**
7. **Aviso en PR body:** Los números de reportes SQLite van a cambiar (incluyen día 1, dejan de incluir arrastre).
8. **`npm run build` al cierre.** Correr test nuevo.

### Fase 1: Preparación del helper centralizado

**Objetivo:** Evitar duplicar la lógica en cada query.

**Acción:**
1. **✅ `fechaParamSql` ya está correcto** — toma Date (construido en hora local), lo convierte a UTC con `toISOString()`, y normaliza el formato para SQLite.
2. **✅ Ya está exportado** desde `date.utils.ts`.

### Fase 2: Fix de `filtroRango` en `dashboard-ventas.handler.ts`

**Acción:**
1. Cambiar firma de `filtroRango` a:
   ```typescript
   export function filtroRango(dataSource: DataSource, desdeISO: string, hastaISO: string): VentaFiltro
   ```
2. Dentro, aplicar:
   ```typescript
   const desde = fechaParamSql(dataSource, new Date(desdeISO));
   const hasta = fechaParamSql(dataSource, new Date(hastaISO));
   return { sql: 'v.created_at >= ? AND v.created_at <= ?', params: [desde, hasta] };
   ```
3. Actualizar los **4 call sites** en el mismo handler.
4. **Test:** `npm run test:kpis-filtros` (debe pasar; actualmente falla en SQLite).

### Fase 3: Actualizar `reportes-ventas.helper.ts`

**Acción:**
1. Actualizar los 4 call sites de `filtroRango` para pasar `dataSource` como 1er arg.
2. Para las 6 comparaciones directas en SQL (`v.created_at >= ? AND v.created_at <= ?`):
   - Aplicar `fechaParamSql(ds, r.desde)` y `fechaParamSql(ds, r.hasta)` antes de pasarlos a `dbQuery`.
3. **Test:** `npm run test:reporte-ventas` (debe pasar).

### Fase 4: Actualizar `reportes-delivery.helper.ts`

**Acción:**
1. Modificar la función `filtroRango` local (redeclarada en este helper) para aplicar `fechaParamSql`.
2. **Test:** `npm run test:reporte-delivery` (debe pasar).

### Fase 5: Actualizar `reportes-finanzas.helper.ts`

**Acción:**
1. Aplicar `fechaParamSql` a los 7 sitios de comparaciones contra `mv.fecha` y `g.fecha`.
2. **NO tocar** las comparaciones contra `fecha_vencimiento` (columna `date`).
3. **Test:** `npm run test:reporte-finanzas` (debe pasar).

### Fase 6: Actualizar dashboards productos/caja-mayor/financiero

**Acción:**
1. `dashboard-productos.handler.ts` → línea 136
2. `dashboard-caja-mayor.handler.ts` → líneas 171-172
3. `dashboard-financiero.handler.ts` → líneas 161, 173
4. **Test:** `npm run test:dashboard-rangos` (debe pasar en SQLite).

### Fase 7: Verificar `reportes-rrhh.handler.ts`

**Acción:**
1. Inspeccionar `Vale.created_at` en la entidad: si es `datetime`, aplicar fix.
2. Si es `date`, dejar como está.
3. **Test:** E2E de reportes RRHH (si se tocó).

---

## 5. Test E2E nuevo

**Archivo:** `scripts/test-reporte-filtro-dia-uno.ts`

**Objetivo:** Verificar que el filtro de un mes **SÍ incluye el día 1** y **NO incluye el día 1 del mes siguiente**.

**Datos de prueba:**
- Venta A: `2026-08-01 10:00:00` (día 1 del período)
- Venta B: `2026-08-15 14:30:00` (mitad del mes)
- Venta C: `2026-09-01 09:00:00` (día 1 del mes siguiente, fuera del período)

**Casos de prueba:**
1. Reporte de ventas del mes agosto → debe contar A y B, **NO** C.
2. Dashboard de ventas con rango "mes" en agosto → mismo resultado.
3. Reporte de finanzas con movimientos de caja mayor en las mismas fechas.
4. Dashboard de productos con ventas en esas fechas.

**Verificación:**
- `totalVentas === 2` (A + B)
- `facturacion === sumaA + sumaB`
- Venta C no aparece en la lista.

**Modo:** SQLite (el que falla).

**Comando:** `npm run test:reporte-filtro-dia-uno`

---

## 6. Riesgos y consideraciones

### 6.1. Doble aplicación del helper

**Riesgo:** Si un call site ya recibe un parámetro normalizado y lo vuelve a pasar por `fechaParamSql`, podría romper.

**Mitigación:**
- Auditar cada call site antes de aplicar el fix.
- El helper es idempotente para Postgres (devuelve ISO tal cual).
- Para SQLite, aplicarlo dos veces reemplazaría `T` por ` ` dos veces → error si el string ya tiene espacio.
- **Convención:** el helper se aplica **una sola vez, lo más cerca posible del `dbQuery` o del `filtroRango`**.

### 6.2. Firmas de funciones exportadas

**Riesgo:** Cambiar la firma de `filtroRango` rompe todos los call sites.

**Mitigación:**
- Listar TODOS los call sites antes de cambiar (ya listados en §3).
- Cambiarlos en la misma fase.
- **No hacer commit parcial** de la firma sin los call sites.

### 6.3. Queries con QueryBuilder vs raw SQL

**Observación:** Los handlers con QueryBuilder (`.where('a.fecha >= :fi', { fi: ... })`) NO pasan por `dbQuery`, así que el helper de `dbQuery` no los arregla automáticamente.

**Solución:** Aplicar `fechaParamSql` manualmente en esos parámetros (ej: `dashboard-rrhh.handler.ts` ya lo hace con `.slice(0, 10)`; si fuera `datetime`, debería usar `fechaParamSql`).

### 6.4. Columnas `date` vs `datetime`

**Convención:**
- `date` (YYYY-MM-DD, sin hora): comparar con `.slice(0, 10)` → **NO tocar**.
- `datetime`/`timestamp` (con hora): comparar con `fechaParamSql` → **SÍ tocar**.

**Columnas relevantes:**
- `ventas.created_at` → `datetime` ✅
- `cajas_mayor_movimientos.fecha` → `datetime` ✅
- `monedas_cambio.created_at` → `datetime` ✅
- `asistencias.fecha` → `date` ❌
- `vales.created_at` → revisar entity (probablemente `datetime`) ⚠️
- `cuentas_por_pagar_cuotas.fecha_vencimiento` → `date` ❌
- `cheques.fecha_pago` → `date` ❌
- `precios_costo.fecha` → `date` ❌

---

## 7. Impacto en datos históricos

**IMPORTANTE:** Este fix **NO cambia datos históricos**. Los datos están bien guardados; el problema es el **filtro** que los lee.

**Lo que va a cambiar:**
- Los reportes de agosto que antes mostraban 29 ventas (perdían el día 1, sumaban el 1/09) ahora mostrarán 30 o 28 ventas correctamente.
- Los números van a **aumentar** al incluir el día 1, y **bajar** al dejar de incluir el arrastre del mes siguiente.
- No es un "bug de datos históricos", es que el filtro estaba mal. Los datos siempre estuvieron completos.

**Comunicación al usuario:**
- Avisar explícitamente en el commit message y en la skill que **los números van a cambiar**.
- Documentar en `docs/CHANGELOG-REPORTES-FILTRO.md` el antes/después con ejemplo.

---

## 8. Reinicio requerido

**SÍ:** Cambios en handlers (`electron/handlers/*`) requieren reinicio de la app.

**Plan:**
- Hacer commit + push al cerrar cada fase.
- Avisar al final: "Los cambios requieren reiniciar la app para aplicarse."
- El agente puede reiniciar `npm start` si ya está corriendo (regla actualizada 2026-08-11).

---

## 9. Checklist de terminado (Definition of Done)

- [ ] **Fase 1:** Helper `fechaParamSql` revisado y exportado.
- [ ] **Fase 2:** `filtroRango` modificado y call sites actualizados.
- [ ] **Fase 3:** `reportes-ventas.helper.ts` actualizado (10 sitios).
- [ ] **Fase 4:** `reportes-delivery.helper.ts` actualizado (1 sitio).
- [ ] **Fase 5:** `reportes-finanzas.helper.ts` actualizado (7 sitios).
- [ ] **Fase 6:** Dashboards productos/caja-mayor/financiero actualizados (4 sitios).
- [ ] **Fase 7:** `reportes-rrhh.handler.ts` verificado y ajustado si aplica.
- [ ] **Test E2E nuevo:** `scripts/test-reporte-filtro-dia-uno.ts` creado y pasando.
- [ ] **Tests existentes pasando:** `test:kpis-filtros`, `test:reporte-ventas`, `test:reporte-finanzas`, `test:reporte-delivery`, `test:dashboard-rangos`.
- [ ] **`npm run check`** (AOT build) pasa sin errores.
- [ ] **Documentación:** `docs/CHANGELOG-REPORTES-FILTRO.md` creado explicando el cambio y el impacto en números.
- [ ] **Skill actualizada:** Agregar entrada en `.claude/skills/frc-gourmet-expert/reference/known-bugs.md` moviendo el ítem de "pendiente" a "resuelto" (si estaba listado).
- [ ] **Commit convencional:** `fix(reportes): normalizar formato de fecha en filtros SQLite (#249)`
- [ ] **PR draft** creado contra `develop` citando `#249` (NO `Closes` hasta pasar CI).

---

## 10. Archivos que el plan va a tocar

### Modificados:
1. `electron/utils/date.utils.ts` — revisar/exportar `fechaParamSql`, agregar `fechasParamSql` (opcional)
2. `electron/handlers/dashboard-ventas.handler.ts` — cambiar firma `filtroRango` + 4 call sites
3. `electron/handlers/reportes-ventas.helper.ts` — 10 sitios
4. `electron/handlers/reportes-delivery.helper.ts` — 1 sitio (función local)
5. `electron/handlers/reportes-finanzas.helper.ts` — 7 sitios
6. `electron/handlers/dashboard-productos.handler.ts` — 1 sitio
7. `electron/handlers/dashboard-caja-mayor.handler.ts` — 1 sitio
8. `electron/handlers/dashboard-financiero.handler.ts` — 2 sitios
9. `electron/handlers/reportes-rrhh.handler.ts` — verificar, posiblemente tocar

### Creados:
1. `scripts/test-reporte-filtro-dia-uno.ts` — test E2E nuevo
2. `docs/CHANGELOG-REPORTES-FILTRO.md` — explicación del cambio
3. `docs/planes/PLAN-249-REPORTES-SQLITE-FECHA.md` — este archivo

### Posiblemente actualizados:
1. `.claude/skills/frc-gourmet-expert/reference/known-bugs.md` — si el bug estaba listado

**Total archivos modificados:** 10-11 (+ dashboard-compras)  
**Total archivos creados:** 2 (test E2E + este plan; NO crear CHANGELOG inventado)  
**Total líneas de código afectadas:** ~38-43 sitios de comparación de fecha

---

## 11. Respuesta a la pregunta del user

**¿`fechaParamSql` ya cubre SQLite y Postgres sin romper a uno de los dos?**

**SÍ.** La función `fechaParamSql` en `electron/utils/date.utils.ts` (líneas 32-38) ya implementa correctamente la normalización para ambos drivers:

```typescript
export function fechaParamSql(dataSource: { options: { type: string } }, fecha: Date): string {
  const iso = fecha.toISOString();
  if (dataSource?.options?.type === 'postgres') return iso;
  // '2026-08-01T18:00:00.000Z' → '2026-08-01 18:00:00.000'
  return iso.slice(0, 23).replace('T', ' ');
}
```

- **Postgres:** Devuelve el ISO sin cambios (`YYYY-MM-DDTHH:MM:SS.000Z`) → el driver parsea correctamente.
- **SQLite:** Convierte a `YYYY-MM-DD HH:MM:SS.000` (espacio, sin Z) → coincide con el formato que TypeORM persiste.

**El helper es correcto y está listo para usar.** Solo falta aplicarlo consistentemente en todos los sitios.

---

## 12. Próximos pasos (después de este plan)

1. **Implementar el fix** siguiendo las fases 1-7.
2. **Correr tests** y verificar que todo pasa en SQLite.
3. **Commit + push** al cerrar cada fase.
4. **PR draft** contra `develop`.
5. **Esperar CI** en verde antes de marcar listo para merge.
6. **NO mergear** todavía (solo el plan va en este commit).

---

**Fin del plan.**
