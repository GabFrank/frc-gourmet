# AUDIT-DIFF-249-TESTS.md

**Fecha:** 2026-09-09  
**Rama:** cursor/fix-249-reportes-sqlite-fecha-65c8  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/296  
**Auditor:** Claude (Cloud Agent)

---

## Contexto

El implementador afirma que el test E2E `scripts/test-reporte-filtro-dia-uno.ts` valida el fix del issue #249 (ventas del día 1 excluidas incorrectamente en SQLite) y comprueba tres escenarios:

1. Venta del día 1 del período → SÍ se incluye
2. Venta del día 1 del mes siguiente → NO se incluye
3. Venta a las 22:00 del 31 de julio → queda en julio (hora local)

Esta auditoría evalúa el **poder discriminante** del test: ¿realmente falla cuando se revierte el fix?

---

## Eje 1: ¿Falla si se revierte fechaParamSql y se vuelve a toISOString() con T?

### Hallazgo: **NO DISCRIMINA**

**Evidencia:**

```106:113:scripts/test-reporte-filtro-dia-uno.ts
// Importar fechaParamSql dinámicamente
const { fechaParamSql } = await import('../electron/utils/date.utils');

// Caso 1: Reporte de agosto completo (01-31)
const desdeAgosto = new Date(2026, 7, 1, 0, 0, 0, 0);
const hastaAgosto = new Date(2026, 7, 31, 23, 59, 59, 999);

const desdeSQL = fechaParamSql(ds, desdeAgosto);
const hastaSQL = fechaParamSql(ds, hastaAgosto);
```

El test **siempre invoca `fechaParamSql`** (línea 112-113). Si se revierte el formato interno de `fechaParamSql` a `return iso` (es decir, `toISOString()` sin reemplazar la `T` por espacio), el test **seguiría pasando** porque:

1. El test llama al helper, no construye el parámetro SQL directamente
2. La regresión solo ocurriría si el código de producción dejara de usar `fechaParamSql`, pero el test no verifica eso

**¿Qué debería hacer para discriminar?**

El test debería incluir un **contraejemplo explícito** que documente el bug original:

```typescript
// Demostrar el BUG: usar toISOString() directamente ROMPE la comparación
const buggyDesdeSQL = desdeAgosto.toISOString();
const buggyHastaSQL = hastaAgosto.toISOString();

const ventasBuggy: any[] = await ds.query(
  `SELECT id FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ?`,
  [buggyDesdeSQL, buggyHastaSQL]
);

// El bug hace que el día 1 NO se incluya
ok(ventasBuggy.length === 1, `Bug: toISOString() excluye día 1, solo cuenta venta B`);
ok(!ventasBuggy.some(v => v.id === 1), 'Bug: venta A (día 1) se perdió');
```

Sin este contraejemplo, el test solo valida que el helper funciona, pero **no valida que el bug existió ni que el fix lo corrige**.

---

## Eje 2: ¿Corre contra SQLite de verdad, o mockea el filtro?

### Hallazgo: **SÍ CORRE CONTRA SQLITE REAL**

**Evidencia:**

```34:41:scripts/test-reporte-filtro-dia-uno.ts
const tmpDir = path.resolve(__dirname, '../.tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const dbFile = path.join(tmpDir, 'test-reporte-filtro-dia-uno.db');
if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

const baseOptions = getDataSourceOptions(tmpDir);
const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
await ds.initialize();
await ds.runMigrations({ transaction: 'each' });
```

- Crea un archivo SQLite real en `.tmp/test-reporte-filtro-dia-uno.db` (línea 36)
- Ejecuta migraciones reales (línea 40)
- Los queries SQL se ejecutan contra la base real, no hay mocks

```117:120:scripts/test-reporte-filtro-dia-uno.ts
const ventasAgosto: any[] = await ds.query(
  `SELECT id, created_at FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ? ORDER BY id`,
  [desdeSQL, hastaSQL]
);
```

**Veredicto:** El test ejerce la comparación TEXT de SQLite, que es el núcleo del bug. ✅

---

## Eje 3: El caso 22:00 local – ¿el assert documenta la convención o está al revés?

### Hallazgo: **DOCUMENTA CORRECTAMENTE**

**Evidencia:**

```160:174:scripts/test-reporte-filtro-dia-uno.ts
// Caso 3: Borde de timezone - venta a las 22:00 del 31 de julio
// Debe INCLUIRSE en agosto (es hora local, no UTC)
await ds.query(`INSERT INTO pagos (id, estado, activo, created_at, updated_at, created_by)
                VALUES (4, 'CONCLUIDO', 1, datetime('now'), datetime('now'), 1)`);
await ds.query(`INSERT INTO ventas (id, estado, caja_id, pago_id, created_at, updated_at, created_by)
                VALUES (4, 'CONCLUIDA', 1, 4, '2026-07-31 22:00:00', datetime('now'), 1)`);
await ds.query(`INSERT INTO pagos_detalles (id, pago_id, valor, tipo, activo, forma_pago_id, moneda_id, created_at, updated_at)
                VALUES (4, 4, 25000, 'PAGO', 1, 1, 1, datetime('now'), datetime('now'))`);

const ventasJulio: any[] = await ds.query(
  `SELECT id FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ?`,
  [fechaParamSql(ds, new Date(2026, 6, 1, 0, 0, 0)), fechaParamSql(ds, new Date(2026, 6, 31, 23, 59, 59, 999))]
);
ok(ventasJulio.some(v => v.id === 4), 'Venta 22:00 del 31 julio SÍ se incluye en julio (hora local)');
```

**Correcto:**
- La venta se guarda como `'2026-07-31 22:00:00'` (línea 165) – hora local sin timezone
- El assert espera que **SÍ** se incluya en el reporte de julio (línea 173)
- Paraguay (PYG) está en UTC-4 / UTC-3. Las 22:00 locales del 31 de julio son todavía el 31 de julio, no el 1 de agosto

**Veredicto:** El comentario y assert documentan la convención correcta (hora local). ✅

---

## Eje 4: ¿Cubre al menos un handler del diff, no solo el helper suelto?

### Hallazgo: **NO CUBRE NINGÚN HANDLER DEL DIFF**

El diff modifica ~13 archivos de handlers/helpers:

```diff
electron/handlers/dashboard-caja-mayor.handler.ts
electron/handlers/dashboard-compras.handler.ts
electron/handlers/dashboard-financiero.handler.ts
electron/handlers/dashboard-productos.handler.ts
electron/handlers/dashboard-ventas.handler.ts
electron/handlers/documentos-tickets.handler.ts
electron/handlers/gastos-caja.handler.ts
electron/handlers/reportes-delivery.helper.ts
electron/handlers/reportes-finanzas.helper.ts
electron/handlers/reportes-ventas.helper.ts
```

**¿El test llama alguno de estos handlers?**

**NO.** El test:

1. Importa `fechaParamSql` directamente (línea 106)
2. Construye queries SQL raw (líneas 117-120, 150-153, 170-172)
3. **Nunca** invoca `ipcMain.handle()` ni ningún handler

**Comparación con tests anteriores:**

El commit `5eaad750` (que introdujo `fechaParamSql`) sí incluía un test que llamaba al handler real:

> "El test ahora ejercita el handler real `get-dashboard-rrhh-kpis` con una venta el dia 1, otra a mitad de mes y otra del mes siguiente: 17 asserts."

**¿Por qué importa?**

Porque el fix del PR #296 no es "crear `fechaParamSql`" (que ya existía en master desde 5eaad750), sino **aplicar `fechaParamSql` en 10+ lugares** donde antes se usaba `toISOString()` directo. El test debería invocar al menos **uno** de esos handlers para validar que el fix está conectado.

**Ejemplo de handler modificado:**

```diff
// electron/handlers/dashboard-ventas.handler.ts
-export function filtroRango(desdeISO: string, hastaISO: string): VentaFiltro {
-  return { sql: 'v.created_at >= ? AND v.created_at <= ?', params: [desdeISO, hastaISO] };
+export function filtroRango(dataSource: DataSource, desdeISO: string, hastaISO: string): VentaFiltro {
+  const desde = fechaParamSql(dataSource, new Date(desdeISO));
+  const hasta = fechaParamSql(dataSource, new Date(hastaISO));
+  return { sql: 'v.created_at >= ? AND v.created_at <= ?', params: [desde, hasta] };
}
```

El test debería invocar un handler de dashboard/reporte que use `filtroRango` y verificar que:
- Con el fix: venta del día 1 se incluye
- Sin el fix: venta del día 1 se excluye

**Veredicto:** El test es **unitario del helper**, no integra ninguno de los ~13 archivos modificados. ❌

---

## Resumen

| Pregunta | Veredicto | Nota |
|----------|-----------|------|
| 1. ¿Falla si se revierte fechaParamSql? | ❌ **NO** | El test siempre llama al helper; no incluye contraejemplo |
| 2. ¿Corre contra SQLite real? | ✅ **SÍ** | Crea DB real, ejecuta migraciones, queries reales |
| 3. ¿Assert 22:00 correcto? | ✅ **SÍ** | Documenta correctamente hora local |
| 4. ¿Cubre handler del diff? | ❌ **NO** | Solo testea el helper, no invoca ningún handler |

---

## Veredicto Final

**El test es necesario pero insuficiente.**

### ✅ Lo que hace bien:

1. **Reproduce el escenario del bug** (día 1 incluido/excluido) contra SQLite real
2. **Documenta la convención de hora local** con un caso borde (22:00 del 31)
3. **Es reproducible** (seed mínimo + queries directos)

### ❌ Limitaciones críticas:

1. **No tiene poder discriminante**: Si se revierte `fechaParamSql` a `return iso`, el test sigue pasando porque nunca usa `toISOString()` directamente
2. **No cubre los handlers del diff**: El PR modifica 13 archivos, el test no llama a ninguno. Es un test unitario del helper, no de integración del fix
3. **No valida que el bug existió**: Falta un contraejemplo que use `toISOString()` y falle

### ¿Atrapa el bug original (#249)?

**SÍ, parcialmente.** Si se borra `fechaParamSql` del codebase, el test **compilará con error** (import roto). Pero si se revierte solo el **contenido** de `fechaParamSql` (cambiar `replace('T', ' ')` por `return iso`), el test **pasa** porque nunca construye el parámetro SQL buggy.

Para poder discriminante real, el test necesitaría:

```typescript
// CONTRAEJEMPLO: demostrar el bug
const desBuggy = desdeAgosto.toISOString();
const hasBuggy = hastaAgosto.toISOString();
const ventasBuggy = await ds.query(`... WHERE created_at >= ? AND created_at <= ?`, [desBuggy, hasBuggy]);
ok(ventasBuggy.length === 1, 'Bug: toISOString() excluye día 1');

// CASO CORRECTO: demostrar el fix
const desFix = fechaParamSql(ds, desdeAgosto);
const hasFix = fechaParamSql(ds, hastaAgosto);
const ventasFix = await ds.query(`... WHERE created_at >= ? AND created_at <= ?`, [desFix, hasFix]);
ok(ventasFix.length === 2, 'Fix: fechaParamSql() incluye día 1');
```

Y debería invocar al menos un handler real modificado en el diff, como:

```typescript
// Llamar handler real que fue modificado
const resultado = await ipcMain.emit('get-dashboard-ventas', { 
  desde: desdeAgosto, 
  hasta: hastaAgosto 
});
ok(resultado.ventasDelMes.includes(ventaA), 'Handler real incluye día 1');
```

---

## Recomendación

**Agregar:**
1. Un contraejemplo que use `toISOString()` y documente el bug
2. Un caso que invoque `get-dashboard-ventas` o `get-reporte-periodo` (handlers del diff) y valide el flujo completo

**Sin estos cambios**, el test valida que el helper existe y funciona, pero no valida que el bug se corrigió en los 13 lugares del diff.
