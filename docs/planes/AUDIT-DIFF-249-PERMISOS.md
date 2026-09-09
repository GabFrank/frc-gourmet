# AUDIT-DIFF-249-PERMISOS

**Fecha:** 2026-09-09  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/296  
**Rama:** `cursor/fix-249-reportes-sqlite-fecha-65c8`  
**Eje:** 2 — ensurePermission / RPC / fugas

---

## Objetivo de la auditoría

Verificar que el PR #296 **solo** modifica filtros de fecha en handlers de reportes, sin:
1. Abrir nuevos canales IPC (`ipcMain.handle`)
2. Quitar llamadas a `ensurePermission`
3. Hidratar DTOs de más

---

## Archivos modificados

### Handlers de dashboard/reportes (8 archivos)
- `electron/handlers/dashboard-caja-mayor.handler.ts`
- `electron/handlers/dashboard-compras.handler.ts`
- `electron/handlers/dashboard-financiero.handler.ts`
- `electron/handlers/dashboard-productos.handler.ts`
- `electron/handlers/dashboard-ventas.handler.ts`
- `electron/handlers/reportes-delivery.helper.ts`
- `electron/handlers/reportes-finanzas.helper.ts`
- `electron/handlers/reportes-ventas.helper.ts`

### Archivos de soporte
- `package.json` — agrega script `test:reporte-filtro-dia-uno`
- `scripts/test-reporte-filtro-dia-uno.ts` — script de test E2E (nuevo)
- Documentos de planificación (sin impacto en producción)

---

## Análisis detallado

### 1. ✅ NO se abrieron nuevos canales IPC

**Verificación:**
```bash
git diff origin/develop...cursor/fix-249-reportes-sqlite-fecha-65c8 -- 'electron/handlers/*.ts' | grep -E '^\+.*ipcMain\.handle'
```

**Resultado:** Sin coincidencias.

**Conclusión:** Ningún archivo del PR registra nuevos handlers IPC. Los canales existentes permanecen intactos.

---

### 2. ✅ NO se quitó ensurePermission

**Verificación:**
```bash
git diff origin/develop...cursor/fix-249-reportes-sqlite-fecha-65c8 -- 'electron/handlers/*.ts' | grep -E '^\-.*ensurePermission'
```

**Resultado:** Sin coincidencias.

**Conclusión:** No se eliminó ninguna verificación de permisos. La superficie de control de acceso no cambió.

---

### 3. ✅ NO se hidrata ningún DTO de más

**Verificación:**
```bash
git diff origin/develop...cursor/fix-249-reportes-sqlite-fecha-65c8 -- 'electron/handlers/*.ts' | grep -E '^\+.*(find|relations|leftJoin|innerJoin|select)'
```

**Resultado:** Sin coincidencias.

**Conclusión:** Cero cambios en hidratación de entidades TypeORM. No se agregaron `find`, `findOne`, `relations`, ni joins. Las queries siguen usando `dbQuery` (SQL crudo) tal como antes.

---

## 4. ✅ El diff es exclusivamente SQL de rango de fechas

### Patrón de cambio

**Antes:**
```typescript
const desde = bucket.desde.toISOString();
const hasta = bucket.hasta.toISOString();
// ... query SQL con `created_at >= ? AND created_at <= ?`
// params: [desde, hasta]
```

**Después:**
```typescript
const desde = fechaParamSql(dataSource, bucket.desde);
const hasta = fechaParamSql(dataSource, bucket.hasta);
// ... misma query SQL
// params: [desde, hasta]
```

### Función `fechaParamSql` (electron/utils/date.utils.ts)

```typescript
export function fechaParamSql(dataSource: { options: { type: string } }, fecha: Date): string {
  const iso = fecha.toISOString();
  if (dataSource?.options?.type === 'postgres') return iso;
  // '2026-08-01T18:00:00.000Z' → '2026-08-01 18:00:00.000'
  return iso.slice(0, 23).replace('T', ' ');
}
```

**Propósito:**  
Corregir el formato de fecha para SQLite. TypeORM persiste `datetime` como `2026-08-01 18:00:00.000` (espacio, sin `Z`). Pasarle `toISOString()` (`2026-08-01T18:00:00.000Z`) rompe la comparación lexicográfica:
- `' '` (0x20) < `'T'` (0x54) → las filas del día 1 quedan fuera del `>=`
- Las del día 1 del mes siguiente se cuelan en el `<=`

En Postgres, el driver parsea ISO nativo correctamente, así que se usa `toISOString()` sin modificar.

---

## Alcance de los cambios

### Handlers modificados
Todos los cambios siguen el mismo patrón:

1. **dashboard-caja-mayor.handler.ts** — `buildMovimientosPorRango`: 2 reemplazos en bucle de buckets
2. **dashboard-compras.handler.ts** — 3 queries (totalMes, top proveedores, timeline): 3 reemplazos
3. **dashboard-financiero.handler.ts** — `buildHistoricoCotizaciones`: 2 reemplazos (USD, BRL)
4. **dashboard-productos.handler.ts** — query top vendidos: 1 reemplazo
5. **dashboard-ventas.handler.ts** — función `filtroRango` + 3 llamadas: cambio de firma + 3 sitios de invocación
6. **reportes-delivery.helper.ts** — función `filtroDeRango` + 2 llamadas: cambio de firma + 2 sitios
7. **reportes-finanzas.helper.ts** — 5 queries (gastos, flujo, composición, gastos por categoría, comisiones POS)
8. **reportes-ventas.helper.ts** — 8 queries (KPIs, márgenes, mesas, tramos, día semana, horas pico, productos, combinaciones, meseros)

### Funciones auxiliares
- `filtroRango(dataSource, desdeISO, hastaISO)` en `dashboard-ventas.handler.ts` — ahora recibe `dataSource`
- `filtroDeRango(ds, r)` en `reportes-delivery.helper.ts` — ahora recibe `DataSource`

**Ningún cambio** en:
- Estructura de DTOs devueltos
- Lógica de negocio
- Relaciones TypeORM
- Permisos o autenticación
- Canales IPC

---

## Archivos de soporte

### package.json
```diff
+    "test:reporte-filtro-dia-uno": "ts-node ... scripts/test-reporte-filtro-dia-uno.ts",
```
Solo agrega un script de test E2E. Sin impacto en runtime.

### scripts/test-reporte-filtro-dia-uno.ts
Test E2E que verifica el fix:
- Crea 3 ventas: día 1 agosto, día 15 agosto, día 1 septiembre
- Filtra por agosto 2026
- Valida que se incluyen las 2 ventas de agosto y NO la de septiembre

**Sin impacto en producción.** Es un script de validación.

---

## Conclusión

### ✅ PASS — El PR cumple todos los requisitos del eje 2

| Criterio                            | Estado | Detalle                                                                 |
|-------------------------------------|--------|-------------------------------------------------------------------------|
| No se abrieron canales IPC          | ✅ PASS | Cero `ipcMain.handle` nuevos                                            |
| No se quitó `ensurePermission`      | ✅ PASS | Cero eliminaciones de verificaciones de permisos                        |
| No se hidrata ningún DTO de más     | ✅ PASS | Cero cambios en `find`, `findOne`, `relations`, joins                   |
| El diff es solo SQL de rango        | ✅ PASS | 100% de los cambios son reemplazos `.toISOString()` → `fechaParamSql()` |

### Justificación técnica

El PR #296 es un **parche quirúrgico** que corrige la comparación de fechas en SQLite sin tocar:
- La superficie de ataque (canales IPC)
- El modelo de seguridad (permisos)
- La hidratación de datos (DTOs)

**Naturaleza del cambio:** Normalización de formato de fecha según el driver de base de datos (SQLite vs. Postgres) en queries SQL crudas de reportes y dashboards.

**Riesgo de seguridad:** Nulo.  
**Riesgo de fugas de datos:** Nulo.  
**Impacto en permisos:** Ninguno.

---

**Auditoría realizada por:** Cloud Agent  
**Fecha:** 2026-09-09  
**Veredicto:** ✅ PASS
