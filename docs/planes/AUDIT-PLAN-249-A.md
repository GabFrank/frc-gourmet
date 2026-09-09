# AUDITORÍA PLAN-249-A: Alcance y Convenciones

**Plan auditado:** `docs/planes/PLAN-249-REPORTES-SQLITE-FECHA.md`  
**Issue:** [#249](https://github.com/GabFrank/frc-gourmet/issues/249)  
**PR:** [#296](https://github.com/GabFrank/frc-gourmet/pull/296)  
**Auditor:** Agente Cloud (Eje A — Alcance y Convenciones)  
**Fecha:** 2026-09-09  
**Modelo:** claude-sonnet-4.5

---

## Veredicto

**PASS CON RESERVAS (P0 + P1 a resolver antes de implementar)**

El plan aborda correctamente el bug del issue #249 sin inflarse en alcance ni meter áreas no solicitadas. La estrategia técnica es sólida y el helper `fechaParamSql` ya existe y está bien implementado. Sin embargo:

- **Omite un handler crítico** (dashboard-compras) que tiene el mismo patrón y debe incluirse.
- **Falta un riesgo explícito** en el tratamiento de columnas `date` vs `datetime` en reportes RRHH.
- **No documenta el impacto en la skill** de este pitfall ya conocido.

---

## 1. Alcance del plan vs issue #249

### ✅ Cobertura correcta del bug

El plan identifica correctamente:

- **Causa raíz:** SQLite guarda `datetime` como TEXT con formato `YYYY-MM-DD HH:MM:SS.000` (espacio), mientras los handlers comparan contra `Date.toISOString()` que produce `YYYY-MM-DDTHH:MM:SS.000Z` (con `T`). La comparación byte a byte hace que el espacio ordene antes que `T`, excluyendo el día 1 del período.

- **Alcance declarado (§2):**
  - SÍ: handlers de reportes (ventas, finanzas, delivery) y dashboards (ventas, productos, caja mayor, financiero).
  - NO: facturación, tickets, ni rediseño de reportes.
  
  Esto coincide **exactamente** con lo pedido en el issue #249.

- **Helper existente:** El plan confirma que `fechaParamSql(dataSource, fecha)` ya existe en `electron/utils/date.utils.ts` y fue agregado en PR #239. Revisado el código: la implementación es correcta y maneja ambos drivers.

### ⚠️ P0: Handler crítico omitido

**Archivo:** `electron/handlers/dashboard-compras.handler.ts`

**Hallazgo:** El plan NO menciona este handler, pero tiene **3 sitios** con el mismo bug:

| Línea | Query | Columna | Acción requerida |
|---|---|---|---|
| 30 | `WHERE ... AND created_at >= ? AND created_at <= ?` | `compras.created_at` (datetime) | ✅ Aplicar `fechaParamSql` |
| 62 | `WHERE ... AND c.created_at >= ? AND c.created_at <= ?` | `compras.created_at` (datetime) | ✅ Aplicar `fechaParamSql` |
| 118 | `WHERE ... AND created_at >= ? AND created_at <= ?` | `compras.created_at` (datetime) | ✅ Aplicar `fechaParamSql` |

Las líneas 40 y 85 comparan contra `fecha_vencimiento` de `cuentas_por_pagar_cuotas`, que es columna `date` (sin hora) → NO tocar (el plan ya usa `.slice(0, 10)` correctamente en esos casos).

**Por qué es P0:**

- Dashboard de compras **es un dashboard de dominio**, igual que dashboard-ventas/productos/financiero que el plan sí incluye.
- Usa el mismo patrón `rangoToFechas(rango, now, inicioJornada)` que los otros dashboards.
- En SQLite standalone, el dashboard de compras pierde el día 1 del período (mismo síntoma que ventas/finanzas).

**Recomendación:** Agregar `dashboard-compras.handler.ts` al §3 del plan con sus 3 sitios, y una fase explícita (o ampliar fase 6) para aplicar el fix ahí.

---

## 2. Convenciones del proyecto

### ✅ Respeta las reglas duras de `.claude/skills/frc-gourmet-expert/SKILL.md` §3

| Regla | Estado |
|---|---|
| **Editar solo `.ts`** | ✅ Plan solo toca handlers `.ts`, no `.js` |
| **Strings UPPERCASE en BD** | N/A (no aplica, el plan no guarda strings de usuario) |
| **No funciones en templates** | N/A (no toca templates Angular) |
| **Reinicio requerido** | ✅ Mencionado explícitamente en §8 (handlers requieren reinicio) |
| **Separar columnas `date` vs `datetime`** | ✅ El plan distingue correctamente (§6.4) |
| **Seguir el ciclo de implementación** | ✅ Plan por fases + tests + commit/push al cerrar cada fase |

### ✅ Fases bien estructuradas

El plan divide el trabajo en 7 fases (§4):

1. **Preparación del helper** (ya existe, solo verificar exportación)
2. **Fix de `filtroRango` central** → actualiza 4 call sites en `dashboard-ventas.handler.ts`
3. **`reportes-ventas.helper.ts`** → 10 sitios
4. **`reportes-delivery.helper.ts`** → 1 sitio (función local redeclarada)
5. **`reportes-finanzas.helper.ts`** → 7 sitios
6. **Dashboards productos/caja-mayor/financiero** → 4 sitios
7. **Verificar `reportes-rrhh.handler.ts`** → condicional según tipo de columna

**Observación:** La fase 7 es correcta (verificar antes de tocar), pero debería ser más explícita sobre qué columnas verificar.

### ⚠️ P1: Ambigüedad en reportes-rrhh

**§3.8 del plan dice:**

> #### `reportes-rrhh.handler.ts` (líneas 101-102, 121-122, 148-149, 168-169)
> - **Similar:** todos usan `.slice(0, 10)` para `Asistencia.fecha` y `Vale.created_at`.
> - **Revisar:** `Vale.created_at` podría ser `datetime`. Si es así, aplicar fix.

**Código real revisado:**

- `Vale` hereda de `BaseModel` → tiene `createdAt: Date` con decorador `@CreateDateColumn` → **ES `datetime`**.
- `Vale` también tiene una columna propia `fecha: Date` con decorador `@Column({ type: 'date' })` → **ES `date` sin hora**.

**El problema:** El handler `reportes-rrhh.handler.ts` NO usa `Vale` directamente en ninguna query (revisado). Usa `Asistencia.fecha` (que es `date`). Entonces:

- **Si el plan se refiere a `Vale.created_at`**: debería buscarse en otros handlers (no en reportes-rrhh).
- **Si se refiere a `Vale.fecha`**: es columna `date`, NO tocar.

**Recomendación:** Aclarar en el plan que `Vale.created_at` (heredado de `BaseModel`) es `datetime`, pero `Vale.fecha` es `date`. Y verificar si hay handlers que filtren por `Vale.created_at` (no encontrados en mi grep, pero el plan debería confirmarlo explícitamente).

---

## 3. Hallazgos por nivel

### P0 (bloqueantes, deben resolverse antes de implementar)

1. **`dashboard-compras.handler.ts` omitido**
   - **Archivo:** `electron/handlers/dashboard-compras.handler.ts`
   - **Líneas:** 30, 62, 118
   - **Síntoma:** Mismo bug que el resto (pierde día 1 en SQLite)
   - **Acción:** Agregar al plan en §3 y en la fase correspondiente (ampliar fase 6 o crear fase 6b)

### P1 (alta, resolver antes de implementar o documentar excepción)

2. **Ambigüedad en `Vale.created_at` vs `Vale.fecha`**
   - **Archivo plan:** §3.8, §7 fase 7
   - **Problema:** El plan dice "revisar si `Vale.created_at` es datetime", pero:
     - `Vale.created_at` (heredado) SÍ es datetime
     - `Vale.fecha` (propia) es date
     - El handler `reportes-rrhh.handler.ts` NO parece usar ninguno de los dos en queries de rango (usa `Asistencia.fecha` que es `date`)
   - **Acción:** Aclarar explícitamente en §3.8 del plan qué columnas son qué tipo, y confirmar que no hay queries por `Vale.created_at` en handlers de reportes.

3. **Documentación de la skill no actualizada**
   - **Archivo:** `.claude/skills/frc-gourmet-expert/conventions/pitfalls-typeorm-electron.md`
   - **Problema:** El plan no menciona que debe actualizar la skill. Este pitfall (comparación de fechas en SQLite) ya está documentado en ese archivo, pero el plan no contempla agregar una entrada sobre la solución aplicada.
   - **Acción:** Agregar al checklist del §9 (Definition of Done) que debe actualizarse `conventions/pitfalls-typeorm-electron.md` con la solución canónica (`fechaParamSql`) y un ejemplo de antes/después.

4. **Aviso de cambio de números no está en el PR**
   - **Archivo:** PR #296 body
   - **Problema:** El plan (§7) menciona explícitamente que "los números van a cambiar" y que hay que avisar. El body del PR draft sí lo menciona en la sección "## Impacto", pero **sin ejemplos concretos**.
   - **Acción:** El plan debería enfatizar que el aviso debe incluir un ejemplo numérico (ej: "agosto 2026 mostraba 29 ventas, ahora mostrará 31 porque incluye el día 1"). Eso lo hace más concreto para el usuario.

5. **`CHANGELOG-REPORTES-FILTRO.md` innecesario**
   - **Archivo:** §9 del plan, checklist línea 356
   - **Problema:** El plan contempla crear `docs/CHANGELOG-REPORTES-FILTRO.md`, pero eso duplica información que ya va en:
     - El commit convencional
     - El PR description
     - La skill (si se actualiza)
   - **Acción:** Reconsiderar si ese archivo agrega valor o es redundante. Si se mantiene, debe ser la fuente de verdad de la explicación del cambio (no el 4to lugar donde aparece).

### P2 (media, no bloqueante pero mejora calidad)

6. **Test de regresión Postgres no explícito**
   - **Archivo:** §5 del plan (test E2E nuevo)
   - **Problema:** El plan crea un test E2E que verifica que el día 1 se incluye correctamente en SQLite. Pero no menciona explícitamente que debe correr **también en Postgres** para verificar que el fix no lo rompe.
   - **Acción:** Agregar al test E2E un switch por driver, o agregar una línea en el §9 checklist que diga "test pasando en SQLite Y Postgres".

7. **Conteo de sitios inflado**
   - **Archivo:** §10 del plan
   - **Problema:** El plan dice "~35-40 sitios de comparación de fecha". Mi conteo manual:
     - dashboard-ventas: 4 (vía `filtroRango`)
     - reportes-ventas: 10
     - reportes-delivery: 1
     - reportes-finanzas: 7
     - dashboard-productos: 1
     - dashboard-caja-mayor: 1
     - dashboard-financiero: 2
     - dashboard-compras (omitido): 3
     - **Total: 29 sitios**
   - El plan no está "inflado" en alcance (no toca cosas de más), pero el número estimado es alto. Puede ser que cuente call sites indirectos o que haya una discrepancia menor.
   - **Acción:** Recalcular en el plan o aclarar qué se cuenta (¿líneas de código con `.toISOString()` o puntos de decisión únicos?).

8. **Fases 2-6: dependencia de orden no documentada**
   - **Archivo:** §4 fases 2-6
   - **Problema:** La fase 2 cambia la firma de `filtroRango` a incluir `dataSource` como 1er parámetro. Las fases 3-5 dependen de ese cambio (varios helpers importan `filtroRango`). Si se implementan fuera de orden, se rompe.
   - El plan lo implica ("actualizar call sites tras cambio de firma"), pero no lo hace explícito.
   - **Acción:** Agregar una nota en §4 de que las fases 3-5 **dependen** de que la fase 2 esté completa y pusheada primero. O alternativamente, fusionar fases 2-5 en una sola fase "Backend reportes" para que el commit sea atómico.

---

## 4. Riesgos explícitos

El plan identifica 4 riesgos en §6:

| Riesgo | ¿Es real? | Mitigación adecuada |
|---|---|---|
| **Doble aplicación del helper** | ✅ Real pero bajo | Mitigación correcta: auditar call sites + helper idempotente en Postgres |
| **Firmas de funciones exportadas** | ✅ Real y alto | Mitigación correcta: listar TODOS los call sites antes de cambiar, commit atómico |
| **QueryBuilder vs raw SQL** | ✅ Real | Mitigación correcta: aplicar `fechaParamSql` manualmente en parámetros de `.where()` |
| **Columnas `date` vs `datetime`** | ✅ Real y recurrente | Mitigación correcta: tabla en §6.4 con la lista de columnas relevantes |

**Justificación explícita de por qué NO hay más riesgos P0:**

- **Dual driver SQLite/Postgres:** El helper `fechaParamSql` ya maneja ambos correctamente. El plan lo verifica en §11.
- **Permisos:** Los handlers de reportes/dashboards ya tienen o no requieren `ensurePermission` (son de solo lectura). No aplica este fix.
- **Migraciones:** El plan NO toca entidades ni columnas, solo los parámetros de queries. No requiere migración.
- **UI:** El plan NO toca templates Angular. Solo backend. No aplica convenciones de UI.

---

## 5. Respecto de los procesos

### ✅ Fases, tests y commits

- **Fases:** 7 fases bien delimitadas (§4), cada una con un alcance claro.
- **Commit por fase:** §8 del plan dice explícitamente "Commit y push al cerrar cada fase" (regla del ciclo de implementación).
- **Conventional commit:** §9 checklist incluye `fix(reportes): normalizar formato de fecha en filtros SQLite (#249)`.
- **Test E2E nuevo:** §5 del plan detalla `scripts/test-reporte-filtro-dia-uno.ts` con datos de prueba y casos específicos.
- **Tests existentes:** §9 checklist lista 5 tests a correr (kpis-filtros, reporte-ventas, reporte-finanzas, reporte-delivery, dashboard-rangos).

### ✅ Reinicio de handlers

§8 del plan menciona explícitamente que cambios en `electron/handlers/*` requieren reinicio, y que el agente puede reiniciar `npm start` (regla actualizada 2026-08-11).

### ⚠️ P1: PR sin `Closes`

El plan (§9 checklist) dice:

> **PR draft** creado contra `develop` citando `#249` (NO `Closes` hasta pasar CI).

El PR #296 actual tiene:

> Relacionado con #249

Esto es correcto. Sin embargo, el plan no menciona **cuándo** agregar el `Closes #249`. ¿Al marcar el PR como ready? ¿Al mergear? ¿Nunca?

**Recomendación:** Aclarar en el plan que el `Closes` se agrega cuando el CI esté en verde y el PR esté listo para merge (o seguir la política del repo si hay una establecida).

---

## 6. Comparación con backlog y bugs conocidos

### ✅ No contradice `known-bugs.md`

Revisado `.claude/skills/frc-gourmet-expert/reference/known-bugs.md`: no hay entrada para este bug. El plan (§9 checklist) contempla agregarlo si estaba listado, pero como no está, no aplica.

### ✅ No contradice `todos-pendientes.md`

El plan no duplica ni contradice ítems del backlog. El issue #249 es el registro de este bug.

### ⚠️ P2: Skill no se actualiza

El plan no menciona que debe actualizar la skill (`.claude/skills/frc-gourmet-expert/`) para reflejar:

- Que este pitfall conocido ya tiene solución canónica (`fechaParamSql`).
- Dónde está documentado el helper y cómo usarlo en queries nuevas.

**Recomendación:** Agregar al checklist de Definition of Done (§9) que debe actualizarse `conventions/pitfalls-typeorm-electron.md` con un ejemplo de antes/después y la referencia al helper.

---

## 7. Resumen ejecutivo

### ¿El alcance cubre el bug del issue sin inflarse?

**SÍ.** El plan ataca exactamente el bug del issue #249 (filtros de fecha en reportes/dashboards SQLite) sin meter facturación, tickets ni rediseño de reportes.

**PERO:** Omite `dashboard-compras.handler.ts`, que tiene el mismo bug (3 sitios). Esto no es "inflarse", es un **subcobertura**.

### ¿El plan lista ~35 sitios correctos?

**CASI.** Mi conteo da 29 sitios en los handlers listados + 3 en el omitido = 32 sitios. El plan dice "~35-40", lo cual es razonable si cuenta call sites indirectos o pequeñas variaciones. No está inflado, pero debería recalcular o aclarar qué se cuenta.

### ¿Hay sitios del mismo bug omitidos en esos módulos?

**SÍ (P0).** `dashboard-compras.handler.ts` tiene 3 sitios con el mismo patrón y debe incluirse.

### ¿El aviso de cambio de números está en el plan y en el PR?

**SÍ en el plan (§7), SÍ en el PR (sección Impacto).** Pero podría ser más concreto con un ejemplo numérico.

### ¿Fases, tests, conventional commits, reinicio?

**SÍ a todo.** El plan sigue correctamente el ciclo de implementación de `.claude/skills/frc-gourmet-expert/workflows/ciclo-implementacion.md`.

---

## 8. Recomendaciones para el plan antes de implementar

1. **P0: Agregar `dashboard-compras.handler.ts`** con sus 3 sitios (líneas 30, 62, 118).
2. **P1: Aclarar `Vale.created_at` vs `Vale.fecha`** y confirmar que no hay queries por `created_at` en reportes RRHH.
3. **P1: Agregar al checklist** actualizar `conventions/pitfalls-typeorm-electron.md` con la solución.
4. **P2: Hacer explícito** que el test E2E debe pasar en SQLite Y Postgres.
5. **P2: Recalcular** el conteo de sitios o aclarar qué se cuenta (29 vs 35-40).

---

## 9. Archivos del plan que necesitan ajuste

| Sección | Ajuste requerido | Prioridad |
|---|---|---|
| §3 (Sitios afectados) | Agregar §3.9 con `dashboard-compras.handler.ts` (3 sitios) | P0 |
| §4 (Estrategia) | Ampliar fase 6 o crear fase 6b para dashboard-compras | P0 |
| §3.8 (Otros handlers) | Aclarar tipos de columnas de Vale (fecha vs created_at) | P1 |
| §9 (Definition of Done) | Agregar "actualizar skill conventions/pitfalls-typeorm-electron.md" | P1 |
| §5 (Test E2E) | Aclarar que debe pasar en SQLite Y Postgres | P2 |
| §10 (Archivos que el plan toca) | Agregar `dashboard-compras.handler.ts` | P0 |

---

## Veredicto final

**PASS CON RESERVAS.**

El plan es técnicamente sólido, bien estructurado y respeta las convenciones del proyecto. La estrategia de usar el helper existente `fechaParamSql` es correcta y evita duplicación.

**Sin embargo, antes de implementar:**

- Resolver el **P0** (dashboard-compras omitido).
- Resolver los **P1** (ambigüedad Vale, skill sin actualizar).

**Con esos ajustes, el plan está listo para implementar.**

---

**Fin de la auditoría del eje A.**
