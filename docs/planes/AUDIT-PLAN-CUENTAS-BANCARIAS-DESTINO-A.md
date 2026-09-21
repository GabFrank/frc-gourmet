# Auditoría Plan A: Cuentas Bancarias Destino (Eje Alcance/Convenciones)

**Auditor:** Cloud Agent (modelo HÍBRIDO)  
**Fecha:** 2026-09-16  
**Plan auditado:** `PLAN-CUENTAS-BANCARIAS-DESTINO.md` (modelo híbrido)  
**Rama:** `cursor/analisis-cuentas-bancarias-destino-539d`  
**PR:** #307  
**Eje de auditoría:** A — Alcance y Convenciones  

---

## Alcance de esta auditoría

**Eje A verifica:**

1. **Cuenta en Persona + default en roles** — coherencia del modelo híbrido
2. **Separación de CuentaBancaria empresa** — distinción crítica con entidades existentes
3. **Greenfield** — ausencia de migración, validez del enfoque
4. **MVP proveedores** — faseado lógico y completo
5. **Permisos** — coherencia con patrón del sistema

**NO verifica:**
- Implementación técnica detallada (Eje B: Entidad)
- UI/UX específico (Eje C: Diseño)
- Rendimiento/índices (Eje D: Performance)

---

## Veredicto general: ✅ **APROBADO CON 3 OBSERVACIONES MENORES**

El plan híbrido es **coherente, completo y respeta las convenciones del sistema**. La arquitectura de dos niveles (cuenta pertenece a Persona, rol la referencia) resuelve correctamente las tres restricciones de Gabriel. La separación empresa vs terceros es clara y defendible. El alcance greenfield sin migración es válido. El faseado es lógico.

**Top 3 hallazgos:**

1. **🟡 MEDIA — Inconsistencia menor en nomenclatura:** El plan menciona renombrar `CuentaBancaria` a `CuentaBancariaEmpresa` como "Fase futura" pero esta distinción crítica necesita clarificarse ANTES de Fase 1 en documentación
2. **🟡 BAJA — Permiso de lectura no especificado:** Handlers `get-*` declarados como "lectura pública sin permiso" contradice patrón de algunos dominios que sí tienen `XXX_VER`
3. **🟡 BAJA — Test suite naming:** El plan propone `npm run test:cuenta-destino-hibrido` pero convención del proyecto usa guiones (ej. `test:cobro-cpc-consolidado`)

---

## 1. Cuenta en Persona + default en roles

### ✅ Coherencia del modelo híbrido

**Verificado:**

- **Separación clara de responsabilidades:**
  - `CuentaBancariaDestino` lleva `persona_id NOT NULL` (§4.1) ✅
  - `Proveedor/Cliente/Funcionario` llevan `cuenta_bancaria_default_id nullable` (§4.2) ✅
  - Justificación explícita del híbrido vs alternativas (§2) ✅

- **Responde correctamente a las 3 restricciones:**
  - R1 "persona o entidad" → HÍBRIDO declarado explícitamente (§3.1)
  - R2 "independiente del titular" → titular = persona dueña, NO razón social (§3.2)
  - R3 "opcional" → FK nullable + validación en handler (§3.3)

- **Normalización respetada:**
  - Una persona → N cuentas ✅
  - Una cuenta ← N proveedores (via FK, no M2M en Fase 1) ✅
  - Ejemplo "Elvia Ruiz Diaz" usado consistentemente en todo el plan ✅

**Decisión Opción B (FKs directas) es correcta para MVP:**
- Más simple que M2M (§3.1, §4.2)
- Path de evolución claro a Fase 4 sin breaking changes ✅

### ✅ Titular derivado correctamente

**Verificado:**

- No es campo libre sino derivado de `Persona.nombre + apellido` (§4.1, líneas 180-182) ✅
- Consideración explícita de desnormalización posterior si necesario (performance) ✅
- UI muestra titular prominentemente (§3.2, §6.1.3) ✅

**Sin hallazgos.**

---

## 2. Separación de CuentaBancaria empresa

### ✅ Distinción crítica documentada

**Verificado:**

La tabla comparativa (§1, §4.1) es **clara y defendible:**

| Aspecto | `CuentaBancaria` | `CuentaBancariaDestino` |
|---------|------------------|-------------------------|
| Dueño | Empresa (activo propio) | Persona (tercero) |
| Saldo | **SÍ** (`saldo`, `saldoReservado`) | **NO** (solo info destino) |
| Uso | Caja mayor, POS, transferencias internas | Destino de pagos a terceros |
| Movimientos | `MovimientoBancario` modifica saldo | Solo se referencia, nunca se actualiza saldo |

**Separación en flujos respetada:**

- `OperacionFinanciera` (transferencias internas) NO toca `CuentaBancariaDestino` (§7.2) ✅
- Pago consolidado usa `CuentaBancaria` como ORIGEN, `CuentaBancariaDestino` como DESTINO (§7.1) ✅
- Mundos separados en código (handlers distintos) ✅

### 🟡 Hallazgo #1 (MEDIA): Inconsistencia menor en nomenclatura

**Línea:** §9, Riesgo 6 (línea 946):

> Nomenclatura clara: `CuentaBancaria` → renombrar a `CuentaBancariaEmpresa` (breaking change, Fase futura)

**Problema:**

El plan declara la distinción empresa vs terceros como **crítica** (§1, §4.1) pero relega la clarificación en nomenclatura a "Fase futura". Esto crea:

1. **Confusión temporal:** Durante Fase 1-3, ambas entidades coexisten con nombres ambiguos
2. **Inconsistencia con skill:** La skill debe documentar la diferencia ANTES de que el código se mergee (regla #24 del skill)
3. **Riesgo de mal uso:** Desarrolladores pueden intentar usar `CuentaBancaria` como destino

**Recomendación:**

- **Fase 1 debe incluir:**
  - Actualizar comentarios de código en `CuentaBancaria` entity: `// Cuenta bancaria DE LA EMPRESA (activo con saldo)`
  - Crear `domains/cuentas-bancarias.md` (§12, ya propuesto) ANTES de mergear, no después
  - Agregar nota destacada en `reference/entities-index.md` al listar ambas entidades

- **Fase futura (opcional, no bloqueante):**
  - Renombrar clase `CuentaBancaria` → `CuentaBancariaEmpresa` (requiere migración de nombre de tabla, breaking en SQLite)

**Impacto:** MEDIO — no bloquea Fase 1 pero aumenta riesgo de confusión.

**Resolución sugerida:** Agregar a checklist de Fase 1 (§9, paso "Actualizar docs") la creación de `domains/cuentas-bancarias.md` ANTES del PR, no después.

---

## 3. Greenfield

### ✅ Ausencia de migración es válida

**Verificado:**

- Estado greenfield confirmado por Gabriel 2026-09-16 (§1, §8.1) ✅
- Ningún proveedor/cliente/funcionario tiene cuenta bancaria configurada HOY ✅
- `CuentaBancaria` existentes son SOLO de la empresa ✅
- Migración explícitamente declarada como NO NECESARIA (§4.5, línea 300) ✅

**Justificación de greenfield correcta:**

- No hay datos legacy que transformar (§8.1)
- `Funcionario.cuentaBancariaPropia` (string libre) está vacío/obsoleto (§8.1, línea 767)
- Script opcional de ayuda relegado a Fase 2 con warnings de "NO automatizar" (§8.2) ✅

### ✅ Migración técnica (tablas) es suficiente

**Verificado:**

La migración propuesta (§4.5) crea:

1. Tabla `cuentas_bancarias_destino` (nueva, vacía) ✅
2. Columnas `cuenta_bancaria_default_id` en roles (nuevas, nullable, vacías) ✅
3. Columna `cuenta_bancaria_destino_id` en `PagoConsolidadoDetalle` (nueva, nullable) ✅

**Compatibilidad con datos existentes:**

- Pagos consolidados históricos (si existen) tienen `cuenta_bancaria_destino_id = NULL` → graceful (§10, Riesgo 3) ✅
- UI muestra "(sin destino registrado)" en pagos legacy (§10, línea 913) ✅

**Sin hallazgos.**

---

## 4. MVP proveedores

### ✅ Faseado lógico y completo

**Verificado:**

Fase 1 incluye TODO lo necesario para caso de uso inicial (pagar proveedores):

- ✅ Entidad `CuentaBancariaDestino` + migración dual (SQLite/Postgres)
- ✅ FK en `Proveedor` + migración
- ✅ FK en `PagoConsolidadoDetalle` + migración
- ✅ Handlers CRUD completos (5 handlers, §5.1.1)
- ✅ Modificación de handlers existentes (`update-proveedor`, `registrar-pago-consolidado`, §5.1.2, §5.2)
- ✅ Permisos (3 nuevos, seed, §5.3)
- ✅ UI desktop completa (3 componentes nuevos + integración en proveedor + confirmación enriquecida, §6.1)
- ✅ Mobile read-only (consistente con alcance administrativo actual, §6.2)
- ✅ Descripción enriquecida en `MovimientoBancario` (§5.2, línea 405)
- ✅ Tests (suite con 20 asserts, §9)
- ✅ Manual de pruebas (§9)
- ✅ Actualización de docs (§12)

**Fase 1 NO incluye funcionarios/clientes:**

- Correcto: evita scope creep ✅
- Fase 2-3 expanden sin romper Fase 1 ✅
- Tabla M2M relegada a Fase 4 (no necesaria para MVP) ✅

### ✅ Alcance de modificación a handlers existentes es correcto

**`registrar-pago-consolidado` (§5.2, líneas 380-417):**

1. Validar beneficiario único (ya existe `CONCEPTO_BENEFICIARIO_UNICO`) ✅
2. Resolver cuenta destino desde `beneficiario.cuentaBancariaDefault` ✅
3. Error temprano si null + fuente bancaria ✅
4. Persistir `cuenta_bancaria_destino_id` en detalle ✅
5. Descripción enriquecida de movimiento bancario ✅

**Validaciones en lugar correcto:**

- `validarCuentaDestino` helper compartido (§5.1.2, línea 362) ✅
- Validación de cuenta activa + persona activa (§5.1.2, líneas 374-375) ✅
- Validación transaccional en handler (no solo UI) ✅

### ✅ Sin scope creep

**Fuera de alcance explícito (§11):**

- ✅ Transferencias automáticas bancarias (NO ejecuta vía API)
- ✅ Conciliación bancaria (Fase 6)
- ✅ Validación real de cuenta con banco (responsabilidad del usuario)
- ✅ CBU/IBAN/SWIFT (opcional para Paraguay)
- ✅ Workflow de aprobación (Fase N)
- ✅ Notificaciones al beneficiario
- ✅ Múltiples cuentas default por moneda (Fase 4, M2M)
- ✅ Merge de personas duplicadas (Fase 3)

**Sin hallazgos.**

---

## 5. Permisos

### ✅ Coherencia con patrón del sistema

**Verificado:**

- 3 permisos nuevos con convención `{SECCION}_{ENTIDAD}_{ACCION}` (§5.3) ✅
  - `FINANCIERO_CTA_BANCARIA_DESTINO_CREAR`
  - `FINANCIERO_CTA_BANCARIA_DESTINO_ACTUALIZAR`
  - `FINANCIERO_CTA_BANCARIA_DESTINO_ELIMINAR`
- Sección `FINANCIERO` correcta (cuentas bancarias son dominio financiero) ✅
- Handlers CRUD con `ensurePermission` primera línea (§5.1.1) ✅
- Asignación a roles plantilla (§5.3, línea 442):
  - GERENTE/ADMIN → los 3 ✅
  - CAJERO/MOZO → ninguno (no gestionan proveedores) ✅

### 🟡 Hallazgo #2 (BAJA): Permiso de lectura no especificado

**Línea:** §5.1.1 (línea 338), handlers `get-cuentas-bancarias-destino-by-persona` y `get-cuenta-bancaria-destino`:

> Lectura pública (sin permiso)

**Problema:**

1. **Inconsistencia con algunos dominios:**
   - Dashboard de ventas tiene `VENTAS_DASHBOARD_VER` (skill §4, línea 346)
   - Reportes tienen `VENTAS_REPORTES_VER` / `FINANCIERO_REPORTES_VER` (skill §4, línea 252)
   - Pero otros handlers `get-*` sí son públicos (ej. `get-producto`)

2. **Datos sensibles:**
   - Cuentas bancarias de personas son **datos financieros personales**
   - En un contexto multi-tenant o con roles restrictivos, podrían necesitar permiso de lectura

**Contraargumento:**

- El sistema actual NO tiene permiso `FINANCIERO_CTA_BANCARIA_VER` (ni empresa ni destino)
- `get-cuenta-bancaria` (empresa) tampoco tiene permiso (lectura implícita para caja mayor)
- Consistente con la mayoría de handlers de catálogos

**Recomendación:**

- **Para MVP (Fase 1):** Mantener sin permiso (consistente con mayoría)
- **Fase futura (si se detecta necesidad):** Agregar `FINANCIERO_CTA_BANCARIA_DESTINO_VER` y gate en handlers de lectura

**Impacto:** BAJO — no es error, solo inconsistencia menor con subset de dominios. No bloquea Fase 1.

**Resolución sugerida:** Documentar en `domains/cuentas-bancarias.md` (nuevo) que la lectura es pública por diseño (consistente con catálogos), y que un permiso `_VER` se puede agregar en fases posteriores si se necesita restricción.

---

## 6. Convenciones del sistema

### ✅ Strings UPPERCASE respetado

**Verificado:**

- Validaciones en handlers: "Strings a UPPERCASE (convención del sistema)" (§5.1.1, línea 318) ✅
- Campos afectados: `banco`, `numeroCuenta`, `alias` (§6.1.2, línea 498) ✅
- Consistente con regla #3 del skill ✅

### ✅ BaseModel heredado

**Verificado:**

- `CuentaBancariaDestino extends BaseModel` (§4.1, línea 162) ✅
- Garantiza `id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` (skill, arquitectura) ✅

### ✅ Dual driver (SQLite/Postgres) respetado

**Verificado:**

- Migración driver-aware con branch por `queryRunner.connection.options.type === 'postgres'` (§4.5, líneas 272, 286) ✅
- Índices condicionales (WHERE clause) solo en Postgres (§4.4, líneas 263-265) ✅
- FK enforcement solo en Postgres, validación en handlers para SQLite (§4.3, §8.3) ✅
- Timestamp epoch-ms real en nombre de migración (§4.5, línea 270) ✅
- Consistente con patrón actual (skill, §1, líneas 25-26) ✅

### ✅ Handlers con `ensurePermission` primera línea

**Verificado:**

- Declaración explícita en cada handler CRUD (§5.1.1, líneas 320, 326, 337) ✅
- Consistente con regla #22 del skill ✅

### 🟡 Hallazgo #3 (BAJA): Test suite naming

**Línea:** §9, Fase 1, entregables (línea 824):

> Tests: `npm run test:cuenta-destino-hibrido` (20 asserts)

**Problema:**

Convención del proyecto usa **guiones, no underscores** en nombres de test suites:

- Existentes en skill: `test:cobro-cpc-consolidado`, `test:pago-consolidado`, `test:delivery-conversion`, `test:canal-venta` (skill §4)
- Script propuesto: `test:cuenta-destino-hibrido` ✅ CORRECTO (usa guiones)

**Espera, reviso...**

Ah, el script SÍ usa guiones. Pero el NOMBRE interno podría ser inconsistente. Verifico descripción del test...

En realidad el script está bien (`test:cuenta-destino-hibrido`). **Retiro este hallazgo — no hay inconsistencia.**

### ✅ Confirmaciones con `ConfirmationDialogComponent`

**Verificado:**

- Plan menciona "modal" y "confirmación final enriquecida" (§6.1.5) pero no especifica componente
- Consistente con regla #8 del skill (usar `ConfirmationDialogComponent`) ✅
- Asumimos que implementación usará el componente estándar (no se contradice) ✅

### ✅ Reactive Forms (no ngModel)

**Verificado:**

- Formulario declarado explícitamente como "Reactive Forms" (§6.1.2, línea 482) ✅
- Consistente con patrón actual del proyecto ✅

**Sin hallazgos adicionales en convenciones.**

---

## 7. Verificación de completitud de Fase 1

### ✅ Checklist de terminado

Comparando con `workflows/definition-of-done.md` (skill §2, regla #24):

- ✅ Migración dual (SQLite/Postgres) presente (§4.5)
- ✅ Handlers con `ensurePermission` (§5.1.1)
- ✅ Permisos en `SEED_PERMISOS` (§5.3)
- ✅ Tests con suite nombrada (§9, línea 824)
- ✅ Manual de pruebas (§9, línea 831)
- ✅ Actualizar `reference/entities-index.md` (§12)
- ✅ Actualizar `reference/handlers-index.md` (§12)
- ✅ Actualizar/crear docs de dominio (§12):
  - `domains/financiero-caja-mayor.md`
  - `domains/compras-cpp.md`
  - Nuevo: `domains/cuentas-bancarias.md`
- ✅ Actualizar skill si cambia convención (ver Hallazgo #1)

### ✅ Componente en menú único

**Verificado:**

- Plan NO propone pantalla navegable nueva de nivel raíz (solo diálogos y componentes integrados en fichas existentes) ✅
- Diálogos contextuales NO van en `MENU_TREE` (skill §2, regla #23) ✅
- Consistente con skill ✅

---

## 8. Riesgos y mitigaciones

### ✅ Riesgos bien identificados

**Verificado (§10):**

1. Proveedor sin persona vinculada → validación + mensaje claro ✅
2. Desactivar persona → validación en pago (cascada para Fase 2) ✅
3. Beneficiario cambia cuenta → soft delete + snapshot inmutable ✅
4. Duplicación de personas → fuzzy match Fase 2 (no MVP) ✅
5. Concurrencia → optimistic locking implícito OK para MVP ✅
6. Confusión empresa vs destino → **ver Hallazgo #1**

**Mitigaciones realistas:**

- No pretenden resolver todo en Fase 1 ✅
- Faseado de mitigaciones avanzadas ✅
- Validaciones defensivas en handlers ✅

**Sin hallazgos adicionales.**

---

## 9. Documentación propuesta

### ✅ Docs de dominio

**Propuesto actualizar (§12):**

- `domains/financiero-caja-mayor.md` → sección pago consolidado ✅
- `domains/compras-cpp.md` → mencionar cuentas destino ✅
- `domains/rrhh-liquidaciones.md` → mencionar (Fase 2) ✅

**Propuesto crear:**

- `domains/cuentas-bancarias.md` → **NUEVO, crítico** (ver Hallazgo #1) ✅

### ✅ Reference

**Propuesto actualizar (§12):**

- `reference/entities-index.md` → agregar `CuentaBancariaDestino` con nota ✅
- `reference/handlers-index.md` → agregar 5 handlers ✅

### ✅ Skill

**Propuesto actualizar:**

- Secciones de dominio financiero ✅
- Índice §2 con nuevo `domains/cuentas-bancarias.md` ✅

**Consistente con regla #24 del skill.**

---

## 10. Tests propuestos

### ✅ Suite de tests suficiente

**Propuesto (§9, línea 824):**

```
npm run test:cuenta-destino-hibrido (20 asserts):
  - Crear cuenta para persona ✅
  - Vincular cuenta a proveedor como default ✅
  - Pago consolidado con validación de destino ✅
  - Desactivar cuenta rechaza si es default de proveedor activo ✅
  - Titular se deriva de persona ✅
  - UPPERCASE aplicado ✅
```

**Cobertura adecuada:**

- CRUD básico ✅
- Validaciones de negocio ✅
- Integración con pago consolidado ✅
- Constraints (desactivar cuenta en uso) ✅
- Convenciones (titular derivado, UPPERCASE) ✅

**Comparado con tests existentes:**

- Similar a `test:cobro-cpc-consolidado` (63 asserts) — 20 es razonable para MVP ✅
- Cubre flujo E2E (crear cuenta → vincular → pagar → validar rechazo) ✅

**Sin hallazgos.**

---

## Resumen de hallazgos

### 🟡 Hallazgo #1 (MEDIA): Inconsistencia menor en nomenclatura

**Ubicación:** §9, Riesgo 6 (línea 946)

**Descripción:** Distinción empresa vs terceros es crítica pero clarificación en docs relegada a "Fase futura".

**Impacto:** MEDIO — aumenta riesgo de confusión, pero no bloquea Fase 1.

**Recomendación:**

1. Crear `domains/cuentas-bancarias.md` en Fase 1 (ANTES de mergear PR), no después
2. Agregar comentarios en código de `CuentaBancaria` entity: `// Cuenta DE LA EMPRESA (activo con saldo)`
3. Agregar nota destacada en `reference/entities-index.md` al listar ambas entidades
4. Renombrar clase a `CuentaBancariaEmpresa` sigue siendo opcional para fase futura

**Acción:** Mover creación de `domains/cuentas-bancarias.md` de "Actualizar docs" a "Entregables obligatorios Fase 1".

---

### 🟡 Hallazgo #2 (BAJA): Permiso de lectura no especificado

**Ubicación:** §5.1.1 (línea 338)

**Descripción:** Handlers `get-*` declarados sin permiso, inconsistente con subset de dominios que tienen `XXX_VER`.

**Impacto:** BAJO — no es error, solo inconsistencia menor. Datos financieros personales podrían justificar permiso.

**Recomendación:**

1. Mantener sin permiso en Fase 1 (consistente con mayoría de catálogos)
2. Documentar en `domains/cuentas-bancarias.md` que lectura es pública por diseño
3. Considerar `FINANCIERO_CTA_BANCARIA_DESTINO_VER` en fase futura si se detecta necesidad de restricción

**Acción:** Agregar nota en `domains/cuentas-bancarias.md` sobre lectura pública + path de evolución.

---

### ~~🟡 Hallazgo #3 (BAJA): Test suite naming~~

**RETIRADO** — script `test:cuenta-destino-hibrido` SÍ usa guiones, consistente con convención.

---

## Veredicto final

### ✅ APROBADO PARA IMPLEMENTACIÓN

**El plan híbrido es coherente, completo y sigue las convenciones del sistema.**

**Fortalezas:**

1. Modelo híbrido resuelve correctamente las 3 restricciones de Gabriel
2. Separación empresa vs terceros es clara y defendible
3. Estado greenfield sin migración es válido y bien justificado
4. Faseado lógico sin scope creep
5. Permisos coherentes con patrón del sistema
6. Riesgos bien identificados y mitigaciones realistas
7. Tests suficientes para MVP
8. Documentación propuesta completa

**Observaciones menores (no bloqueantes):**

1. 🟡 Crear `domains/cuentas-bancarias.md` en Fase 1, no después (clarificar distinción empresa vs terceros)
2. 🟡 Documentar que lectura es pública por diseño + path de evolución a permiso `_VER` si necesario
3. *(Hallazgo 3 retirado — no había inconsistencia)*

**Recomendación:** Proceder con Fase 1 incorporando las dos observaciones menores en el checklist de entregables.

---

**Fin de Auditoría A.**

---

## Nota sobre reemplazo de auditoría de Entidad

**¿Este audit reemplaza una auditoría de Entidad?**

**NO.** Esta es auditoría de **Eje A (Alcance/Convenciones)**.

El plan completo requiere **auditoría de Eje B (Entidad/Implementación técnica)** que verificará:

- Estructura de columnas TypeORM
- Constraints de BD (FKs, índices, tipos)
- Lógica de handlers (transacciones, validaciones, edge cases)
- Integración con entidades existentes (PagoConsolidadoDetalle, MovimientoBancario)
- Dual driver SQLite/Postgres en detalle
- UI/UX (Reactive Forms, validaciones, accesibilidad)

**Ambas auditorías son complementarias, no reemplazan una a la otra.**

---

**Auditor:** Cloud Agent  
**Fecha:** 2026-09-16  
**Firma:** ✅ Plan híbrido aprobado con observaciones menores incorporables en Fase 1
