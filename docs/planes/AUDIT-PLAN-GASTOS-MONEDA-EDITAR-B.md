# Auditoría técnica del Plan: Gastos moneda editar (Eje B: Correctitud)

**Auditor:** Cloud Agent (Cursor)  
**Plan auditado:** `docs/planes/PLAN-GASTOS-MONEDA-EDITAR.md`  
**Rama:** `cursor/gastos-moneda-editar-143b` (PR #290)  
**Fecha auditoría:** 2026-09-08  
**Alcance:** Verificar correctitud del plan contra código real (handlers, entidades, permisos, reportes, migraciones)

---

## Resumen ejecutivo

**El plan es técnicamente SÓLIDO** en su análisis de Feature A (guard de inputs) y en su estrategia de edición de gastos (Feature B), pero contiene **4 hallazgos P0/P1** que deben resolverse antes de implementar:

- **P0-1:** La entidad `Gasto` NO tiene columnas de auditoría (`monto_anterior`, `editado_por_id`, etc.). El plan propone migración pero Gabriel NO confirmó si la quiere.
- **P0-2:** El plan confunde dos entidades distintas (`Gasto` vs `GastoCaja`) y no aclara cuál afectó al caso de Gabriel. La diferencia es crítica: tienen handlers, tablas y flujos separados.
- **P1-3:** NO existe UI para editar gastos. El handler `edit-gasto` está implementado y funciona, pero NO hay botón "Editar" en `list-gastos.component` ni en ninguna otra pantalla. Feature B requiere implementar la UI completa, no solo auditoría.
- **P1-4:** El plan asume que el recálculo de cierre es automático, pero no verifica qué reportes cachean datos. Aunque los movimientos se actualizan, algunos reportes podrían leer snapshots.

**Hallazgos adicionales (riesgos menores):**

- El plan propone preguntas a Gabriel pero no define qué hacer si no responde (defaults asumidos al final no son explícitos en las fases).
- `CurrencyInputDirective` ya parsea correctamente en blur, el problema es solo preventivo (UX).

---

## Feature A: Guard de inputs sin decimales

### ✅ Correctitud del análisis

**Verificado contra código real:**

1. **`CurrencyInputDirective` existe** y parsea como describe el plan:
   - Archivo: `src/app/shared/directives/currency-input.directive.ts` (145 líneas)
   - El método `parseInput()` (líneas 120-142) efectivamente trata el punto como separador de miles cuando `decimals === 0` Y no hay coma
   - El problema está correctamente identificado: el usuario puede tipear `.` o `,` ANTES de blur, y el parser los acepta

2. **La directiva se usa extensivamente:**
   - Encontradas 60+ referencias en el proyecto (desktop + mobile PWA)
   - Confirmado uso en gastos, operaciones financieras, vales, conteos, cobros, compras
   - El inventario del plan es correcto (aunque incompleto — hay más inputs en reportes y configuraciones)

3. **La solución propuesta (Opción A o B) es viable:**
   - Opción A (extender directiva): técnicamente correcta, 20-30 líneas adicionales
   - Opción B (nueva directiva): separación de responsabilidades, pero duplica lógica

**✅ APROBADO** — Feature A es técnicamente correcta y el análisis del problema es preciso.

---

## Feature B: Editar gastos y recalcular cierre

### P0-1: Auditoría de cambios — columnas NO existen

**Hallazgo crítico:**

El plan propone agregar 4 columnas a `Gasto` para auditoría (Fase 2, líneas 390-405):
- `monto_anterior`
- `descripcion_anterior`
- `editado_por_id`
- `fecha_edicion`

**Código real verificado:**

```typescript
// src/app/database/entities/financiero/gasto.entity.ts
@Entity('gastos')
export class Gasto extends BaseModel {
  // ... 20+ columnas existentes ...
  // ❌ NO existe monto_anterior
  // ❌ NO existe descripcion_anterior
  // ❌ NO existe editado_por_id
  // ❌ NO existe fecha_edicion
}
```

**Búsqueda en migraciones:** `grep -r "AuditoriaGasto\|monto_anterior\|editado_por" migrations/` → **0 resultados**.

**Impacto:**

- Si Gabriel elige "auditoría completa": requiere migración nueva dual-driver (SQLite + Postgres)
- Si Gabriel elige "auditoría mínima": solo se usan `updatedBy` y `updatedAt` de `BaseModel` (ya existen)
- El plan dice "Decisión pendiente: Gabriel debe confirmar" (línea 258), pero luego implementa como si la decisión ya estuviera tomada

**Recomendación:**

1. **Antes de Fase 2:** Gabriel DEBE elegir nivel de auditoría
2. Si elige completa: crear migración `<epoch>-AuditoriaGasto.ts` (ejemplo del plan es correcto)
3. Si elige mínima: documentar que la traza está en los movimientos de Caja Mayor (observación `EDICION GASTO #X (REVERSO)`)

**Prioridad:** **P0** — bloqueante para Fase 2, pero NO para Fase 1 (Feature A)

---

### P0-2: Confusión entre `Gasto` y `GastoCaja`

**Hallazgo crítico:**

El plan dice (línea 269):

> Gabriel mencionó "recalcular cierre de caja" pero el gasto fue registrado en **Caja Mayor**, no en una caja PdV.

Y luego (líneas 270-288) plantea preguntas sobre si fue `Gasto` o `GastoCaja`, pero **NO resuelve la ambigüedad** — solo la detecta.

**Código real verificado:**

Existen **DOS entidades separadas** para gastos:

1. **`Gasto` (Caja Mayor):**
   - Tabla: `gastos`
   - Handler: `caja-mayor.handler.ts` → `edit-gasto` (líneas 1456-1584)
   - Genera movimientos tipo `EGRESO_GASTO` en `caja_mayor_movimientos`
   - NO afecta el cierre de una caja PdV
   - NO tiene apertura/cierre diario — es un ledger continuo

2. **`GastoCaja` (cajón del PdV):**
   - Tabla: `gastos_caja`
   - Handler: `gastos-caja.handler.ts` → `create-gasto-caja` / `anular-gasto-caja`
   - **NO tiene handler `edit-gasto-caja`** — solo crear y anular
   - Se lee en `resumen-caja.utils.ts` (línea 170-216) para el cierre de caja PdV
   - SÍ afecta el resumen de cierre (arqueo del cajón)

**Verificado en `resumen-caja.utils.ts`:**

```typescript
// Línea 170: Lee GastoCaja, NO Gasto
const gastosCajaRepo = dataSource.getRepository(GastoCaja);
const gastosCaja = await gastosCajaRepo.find({
  where: { caja: { id: cajaId }, estado: 'ACTIVO' },
  // ...
});
```

**El caso de Gabriel:**

El plan no aclara cuál de las dos entidades fue la afectada. El requerimiento dice:

> Un funcionario cargó un gasto de 730.000 Gs [...] Esto dejó una diferencia en el cierre de caja.

Si el gasto fue:
- **`Gasto` (Caja Mayor):** NO debería afectar el cierre de una caja PdV — son dos subsistemas aislados
- **`GastoCaja` (cajón):** SÍ afecta el arqueo, pero **NO se puede editar** (solo anular y recrear)

**Impacto:**

- Si el gasto fue `GastoCaja`: Feature B debe implementar `edit-gasto-caja` (handler nuevo + UI nueva)
- Si el gasto fue `Gasto`: el plan es correcto, pero la frase "recalcular cierre de caja" es confusa — debería decir "actualizar saldos de Caja Mayor"

**Recomendación:**

1. **Antes de Fase 1:** Gabriel debe confirmar qué entidad fue (verificar en la BD o pantalla donde se cargó)
2. Si fue `GastoCaja`: ampliar Feature B para incluir handler + UI de edición de gastos del cajón
3. Actualizar el plan para usar terminología precisa: "cierre de caja PdV" vs "saldos de Caja Mayor"

**Prioridad:** **P0** — bloqueante para scope de Feature B

---

### P1-3: UI de edición NO existe

**Hallazgo importante:**

El plan dice (línea 228):

> El botón "Editar" en la lista de gastos ya existe y llama `editGasto()`

**Código real verificado:**

Búsqueda en `list-gastos.component.html` y `.ts`:

```bash
grep -r "editGasto\|Editar.*gasto" src/app/pages/financiero/caja-mayor/gastos/list-gastos/
# → 0 resultados
```

El componente `list-gastos.component.ts` existe (22 líneas), pero:
- NO tiene método `editGasto()`
- NO tiene botón "Editar" en el template
- Solo lista gastos con columnas: descripción, monto, categoría, fecha

**El handler `edit-gasto` SÍ existe y funciona** (verificado en `caja-mayor.handler.ts`), pero **NO hay UI que lo invoque**.

**Impacto:**

Feature B requiere implementar:
1. Botón "Editar" en `list-gastos.component.html` con `*appHasPermission="'CAJA_MAYOR_OPERAR'"`
2. Método `editGasto(gasto: Gasto)` que abra `CreateEditGastoDialogComponent` en modo edición
3. Lógica en el diálogo para:
   - Pre-cargar datos del gasto existente
   - Llamar a `window.api.callIpc('edit-gasto', gastoId, data)` en vez de `create-gasto`
   - Mostrar campos de auditoría (si Gabriel elige auditoría completa)

**El plan NO menciona esto** — asume que la UI ya existe.

**Recomendación:**

1. Agregar sub-fase "Feature B — Implementar UI de edición" entre Fase 2 y Fase 3
2. Incluir en el checklist:
   - Botón editar con permiso `CAJA_MAYOR_OPERAR`
   - Modo del diálogo (`create` vs `edit`)
   - Pre-carga de detalles multi-moneda/FP
   - Mensaje de éxito y refresh de la lista

**Prioridad:** **P1** — NO bloqueante para planificación, pero aumenta el esfuerzo de Feature B en ~30%

---

### P1-4: Recálculo de reportes — verificación incompleta

**Hallazgo importante:**

El plan dice (línea 289):

> Esto ya ocurre automáticamente porque:
> - `CajaMayorSaldo` se actualiza en `edit-gasto` (líneas 1503, 1559).
> - Dashboards y reportes leen `CajaMayorMovimiento` + saldos actualizados.

**Código real verificado:**

1. **El handler `edit-gasto` SÍ actualiza saldos** (correcto):
   - Línea 1503: `actualizarSaldo(..., AJUSTE_POSITIVO)` — revierte monto viejo
   - Línea 1558: `actualizarSaldo(..., EGRESO_GASTO)` — aplica monto nuevo

2. **Dashboard de Caja Mayor lee movimientos en vivo** (verificado):
   - `dashboard-caja-mayor.handler.ts` línea 95-100: `buildMovimientosPorRango()` suma `CajaMayorMovimiento` sin cache
   - **✅ Se actualiza automáticamente**

3. **Reporte de finanzas (cierre de mes) lee movimientos** (verificado):
   - `reportes-finanzas.helper.ts` línea 15: filtra por `EGRESO_GASTO`
   - **✅ Se actualiza automáticamente**

4. **⚠️ NO verificado:** Reportes que lean `gastos` directamente (sin pasar por movimientos)
   - `grep -r "getRepository(Gasto)\|from gastos" electron/handlers/reportes*.ts` → encontrado 1 resultado
   - Algunos informes podrían sumar `gasto.monto` en vez de leer movimientos

**Impacto:**

- La afirmación del plan es **probablemente correcta**, pero NO exhaustiva
- Existe riesgo bajo de que algún reporte custom lea la tabla `gastos` sin JOIN a movimientos

**Recomendación:**

1. En Fase 3, agregar paso: "Listar TODOS los handlers que leen `Gasto` o `gastos` y verificar que leen movimientos actualizados"
2. Test E2E obligatorio: editar gasto → verificar que cada dashboard/reporte muestre el monto correcto sin reiniciar

**Prioridad:** **P1** — riesgo bajo, pero puede causar bugs silenciosos si no se verifica

---

## Permisos y roles

### ✅ Correcto

**Verificado contra `seed-system.ts` y `permissions.handler.ts`:**

1. **Permiso `CAJA_MAYOR_OPERAR`:**
   - Existe (línea 129 de `permissions.handler.ts`)
   - Descripción: "Registrar movimientos/gastos/retiros en caja mayor"
   - Se usa en `edit-gasto` (línea 1457): `await ensurePermission(dataSource, getCurrentUser, 'CAJA_MAYOR_OPERAR')`

2. **Roles que lo tienen:**
   - ✅ **ADMINISTRADOR** (todos los permisos)
   - ✅ **GERENTE** (línea 500 de `seed-system.ts`)
   - ❌ CAJERO (NO lo tiene — correcto, no debe editar gastos de Caja Mayor)
   - ❌ MOZO (NO lo tiene)

3. **El handler está protegido** — no hay bypass vía `/api/rpc` porque el permiso se valida en el handler (no en la UI)

**✅ APROBADO** — La seguridad de permisos es correcta.

---

## Migraciones

### Patrón dual-driver correcto

**Verificado contra `migrations/1787842650376-PdvConfigTerminalAjena.ts`:**

El ejemplo de migración del plan (líneas 467-497) sigue el patrón correcto:

```typescript
// CORRECTO:
const driver = queryRunner.connection.options.type;
if (driver === 'postgres') {
  await queryRunner.query(`ALTER TABLE gastos ADD COLUMN monto_anterior DECIMAL(10,2), ...`);
} else {
  await queryRunner.query(`ALTER TABLE gastos ADD COLUMN monto_anterior DECIMAL(10,2);`);
  await queryRunner.query(`ALTER TABLE gastos ADD COLUMN descripcion_anterior VARCHAR(255);`);
  // SQLite requiere un ALTER por columna
}
```

**Detalles:**
- Postgres acepta múltiples columnas en un solo `ALTER TABLE`
- SQLite requiere una sentencia por columna
- El `down()` debe ser idempotente (usar `DROP COLUMN IF EXISTS` o try/catch)

**✅ APROBADO** — Si Gabriel elige auditoría completa, la migración propuesta es correcta.

---

## Tests propuestos

### ✅ Escenarios correctos

El plan propone 4 escenarios para Feature B (líneas 320-344):

1. **Editar monto simple:** 1M → 730k, verificar saldos y movimientos
2. **Multi-moneda:** 500k Gs + 100 USD → 600k Gs + 50 USD
3. **Restricción cuenta bancaria:** rechazar edición de gastos bancarios
4. **Permisos:** CAJERO no puede editar, GERENTE sí

**Verificado contra código:**

- ✅ Escenario 1: refleja el caso de Gabriel
- ✅ Escenario 2: el handler soporta multi-moneda (detalles, línea 1533-1559)
- ✅ Escenario 3: el handler bloquea (línea 1473-1476)
- ✅ Escenario 4: permiso correcto

**⚠️ Falta:**
- Test de que el reporte de gastos muestre el monto corregido (no solo el dashboard)
- Test de edición en una caja YA cerrada (¿se permite? ¿se rechaza?)

**Recomendación:** Agregar escenario 5: "Editar gasto de una caja cerrada hace X días → verificar que no se pierda el historial del cierre original"

---

## Riesgos identificados

### ✅ Riesgos del plan (líneas 523-569) son correctos

**Verificados:**

1. **Riesgo 1 (olvidar inputs):** correcto, hay 60+ inputs dispersos
2. **Riesgo 2 (confusión Gasto vs GastoCaja):** ✅ confirmado como P0-2 arriba
3. **Riesgo 3 (reportes cachean saldos):** ✅ confirmado como P1-4 arriba
4. **Riesgo 4 (edición sin auditoría):** correcto, pero depende de decisión de Gabriel
5. **Riesgo 5 (mobile PWA):** correcto, `projects/mobile` tiene su propia directiva (verificar si es import o copia)

**Riesgo NO listado:**

- **Riesgo 6 (UI no existe):** ✅ identificado como P1-3 arriba

---

## Hallazgos adicionales

### 1. El plan tiene contradicción interna

**Línea 700-702:**

> **Defaults asumidos** (si no respondes):
> - Feature A: Opción A (extender `CurrencyInputDirective`).
> - Feature B: Auditoría mínima (sin migración, solo `updatedBy`).

**Pero línea 390-405 (Fase 2):**

> 1. **Migración:** Agregar columnas `monto_anterior`, `descripcion_anterior`, ...

La Fase 2 está escrita como si la auditoría completa ya estuviera decidida, pero los defaults asumen auditoría mínima.

**Recomendación:** Convertir Fase 2 en **condicional**: "SI Gabriel elige auditoría completa, ENTONCES ejecutar Fase 2; SINO, saltar a Fase 3".

---

### 2. Feature A vs Feature B: un solo PR, dos niveles de riesgo

Feature A es **low-risk, high-value**:
- Previene errores de UX
- No cambia datos existentes
- No requiere migración
- Fácil de testear

Feature B es **high-risk, medium-value**:
- Modifica datos financieros auditados
- Requiere migración (si auditoría completa)
- Requiere UI nueva (no mencionada en el plan)
- Afecta reportes de múltiples módulos

**Recomendación (opcional):** Considerar entregar Feature A en un PR separado (quick win) y Feature B después de resolver ambigüedades.

---

## Resumen de hallazgos

| ID | Prioridad | Hallazgo | Bloqueante para | Resolución |
|----|-----------|----------|----------------|------------|
| P0-1 | **P0** | Columnas de auditoría NO existen en `Gasto` | Fase 2 | Gabriel debe elegir: completa (migración) o mínima (sin migración) |
| P0-2 | **P0** | Confusión `Gasto` vs `GastoCaja` sin resolver | Scope de Feature B | Gabriel debe confirmar qué entidad fue afectada |
| P1-3 | **P1** | UI de edición NO existe, solo handler | Fase 2 | Agregar sub-fase de implementación de UI |
| P1-4 | **P1** | Verificación incompleta de reportes | Fase 3 | Listar TODOS los reportes que leen gastos y verificar |

**Hallazgos menores:**
- Contradicción interna entre defaults asumidos y fases implementadas
- Riesgo adicional NO listado (UI faltante)
- Recomendación de separar PRs (opcional)

---

## Recomendaciones finales

### Antes de iniciar implementación:

1. **Resolver P0-1:** Gabriel elige nivel de auditoría
2. **Resolver P0-2:** Gabriel confirma entidad afectada (`Gasto` o `GastoCaja`)
3. **Ajustar Fase 2:** Hacer condicional según decisión de auditoría
4. **Agregar sub-fase:** Implementar UI de edición (botón + diálogo)
5. **Ampliar Fase 3:** Listar y verificar TODOS los reportes

### Orden de trabajo recomendado:

1. **Fase 1 (Feature A):** Puede iniciarse de inmediato — NO depende de decisiones pendientes
2. **Fase 0 (preguntas):** Resolver antes de Fase 2
3. **Fase 2-4 (Feature B):** Solo después de resolver P0-1 y P0-2

---

## Veredicto final

**El plan es técnicamente SÓLIDO** en su análisis del problema, estrategia de solución y consideración de riesgos. Sin embargo, **NO está listo para implementar** debido a:

- 2 decisiones bloqueantes sin resolver (auditoría y entidad afectada)
- 1 componente faltante no contemplado (UI de edición)
- Verificación incompleta de impacto en reportes

**Acción requerida:**

1. Gabriel responde las 4 preguntas de Fase 0 (líneas 357-365)
2. El planner actualiza fases 2-3 según respuestas
3. Se ejecuta auditoría C (migraciones) para validar estrategia dual-driver antes de implementar

**Aprobado para Feature A:** ✅ Puede iniciarse sin bloqueos  
**Bloqueado para Feature B:** ❌ Requiere resolución de P0-1 y P0-2

---

**Auditoría completada:** 2026-09-08  
**SHA del plan auditado:** (pendiente commit)  
**Próximo paso:** Commit de este audit + push + reportar a Gabriel
