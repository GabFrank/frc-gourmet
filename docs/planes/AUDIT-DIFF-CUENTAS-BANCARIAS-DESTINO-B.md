# AUDIT-DIFF B: Cuentas Bancarias Destino — Correctitud contra código real

**Auditor:** Cloud Agent B (Claude Sonnet 4.5 default)  
**Fecha:** 2026-09-16  
**PR:** #307 / rama `cursor/analisis-cuentas-bancarias-destino-539d` vs `develop`  
**Commit:** HEAD al momento de auditoría  
**Enfoque:** Correctitud motor, ensurePermission, FKs, soft-delete, race conditions, migraciones dual-driver, UI, tests

---

## Veredicto

**APROBADO CON 6 HALLAZGOS (2 CRÍTICOS, 3 ALTOS, 1 MEDIO)**

El modelo híbrido (Persona → CuentaBancariaDestino ← Proveedor) es **arquitectónicamente sólido** y las migraciones están **correctamente dual-driver**. La separación empresa vs destino está bien documentada y el `ensurePermission` se aplica consistentemente en los handlers CRUD.

**Sin embargo**, hay **2 problemas críticos de correctitud**:
1. Búsqueda de proveedor **por nombre** (no por ID) vulnerable a duplicados y colisiones de normalización
2. Tests **no ejecutables en CI** (scripts `.js` manuales, no integrados a `npm run test`)

Y **3 problemas altos**:
3. Lectura pública de cuentas sin permiso (diseño declarado pero riesgoso en `/api/rpc` default-allow)
4. Handler de cuenta destino **no valida existencia de moneda** antes de crear
5. Falta validación en **cascada**: desactivar Persona no desactiva sus cuentas (huérfanas implícitas)

---

## Scope de la auditoría

Revisión línea por línea de:

1. **Entidades nuevas/modificadas** (4): `CuentaBancariaDestino`, `Proveedor`, `PagoConsolidadoDetalle`, `MovimientoBancario`
2. **Migraciones dual-driver** (4): timestamps reales, additive, FKs solo en Postgres
3. **Handler nuevo** (`cuentas-bancarias-destino.handler.ts`): CRUD + `ensurePermission`
4. **Handler modificado** (`pago-consolidado.handler.ts`): resolución de cuenta destino en líneas bancarias
5. **UI**: `selector-cuenta-destino.component`, `create-edit-cuenta-destino-dialog`, integración en `create-edit-proveedor`
6. **Tests**: `test-cuenta-destino-hibrido.js`, `diagnostico-proveedores-sin-persona.js`
7. **Soft-delete defaults**: validación de `activo=false` con referencias
8. **Race conditions**: locks en lectura/escritura concurrente

---

## Hallazgos

### 🔴 CRÍTICO #1: Búsqueda de proveedor por NOMBRE en pago consolidado

**Ubicación:** `electron/handlers/pago-consolidado.handler.ts:190-198`

```typescript
// Solución temporal: buscar proveedor por nombre (subóptimo pero funcional para MVP)
const nombreProveedor = meta[0].beneficiario;
if (!nombreProveedor) {
  throw new Error('No se pudo identificar el proveedor para resolver la cuenta de cobro.');
}
const proveedor = await queryRunner.manager.findOne(Proveedor, {
  where: { nombre: nombreProveedor, activo: true },
  relations: ['cuentaBancariaDefault', 'cuentaBancariaDefault.persona', 'persona'],
});
```

**Problema:**

1. **Colisión de duplicados**: Si hay 2 proveedores activos con el mismo nombre (`LA FAMILIA`, `LA FAMILIA 2` → ambos normalizados a `LA FAMILIA`), `.findOne()` devuelve el primero que encuentra (sin orden determinístico).

2. **Normalización inconsistente**: `meta[0].beneficiario` viene de `adapter.leerYBloquear()`, que deriva el nombre del `Gasto.proveedor` o `CuentaPorPagarCuota.compra.proveedor`. Si el nombre se editó después de crear el gasto, la búsqueda falla:
   - Se crea gasto: `proveedor.nombre = "LA FAMILIA"`
   - Se paga gasto, se guarda `GastoCaja.proveedor.nombre = "LA FAMILIA"` en el payload
   - Se edita proveedor: `proveedor.nombre = "LA FAMILIA SRL"`
   - Al pagar, busca por `"LA FAMILIA"` → **no encuentra** → error: `Proveedor "LA FAMILIA" no encontrado`

3. **Vulnerabilidad a inyección de nombres**: Si un `GastoCaja` tiene un string libre en `descripcion` que se usa como beneficiario, y ese string coincide con otro proveedor, se resuelve la cuenta del proveedor equivocado.

**Evidencia en código real:**

- El comentario del implementador es explícito: `"Solución temporal: buscar proveedor por nombre (subóptimo pero funcional para MVP)"`
- El `TODO` en línea 184 admite el problema: `"TODO: Extender adapter para devolver beneficiarioId en leerYBloquear"`

**Solución correcta:**

El adapter **debe devolver `beneficiarioId`** (no `beneficiario` string), y el handler debe buscar por ID:

```typescript
// adapter.leerYBloquear() devuelve { ..., beneficiarioId: number }
const proveedorId = items[0].beneficiarioId; // No meta[0].beneficiario
if (!proveedorId) {
  throw new Error('No se pudo identificar el proveedor (beneficiarioId faltante)');
}
const proveedor = await queryRunner.manager.findOne(Proveedor, {
  where: { id: proveedorId, activo: true },
  relations: ['cuentaBancariaDefault', 'cuentaBancariaDefault.persona', 'persona'],
});
if (!proveedor) {
  throw new Error(`Proveedor ${proveedorId} no encontrado o inactivo`);
}
```

**Impacto si no se corrige:**

- **Pago al proveedor equivocado** (si hay duplicados de nombre)
- **Pago rechazado** (si el nombre cambió después de crear el gasto)
- **Silencioso**: no hay test que cubra este path (ver Hallazgo #2)

**Severidad:** CRÍTICO  
**Recomendación:** **BLOQUEA MERGE**. Extender adapters para devolver `beneficiarioId` antes de Fase 1.

---

### 🔴 CRÍTICO #2: Tests no ejecutables en CI

**Ubicación:** `scripts/test-cuenta-destino-hibrido.js`, `scripts/diagnostico-proveedores-sin-persona.js`

**Problema:**

Los tests están implementados como **scripts `.js` manuales**, NO como tests de Jest/Mocha integrados a `npm run test`. Consecuencias:

1. **No se ejecutan en CI** (GitHub Actions `Lint + Build` no los corre)
2. **No bloquean PR** con bugs (el Hallazgo #1 pasaría sin detectarse)
3. **No tienen cobertura** (el test de "pago consolidado valida cuenta destino" está en la descripción del script pero **no implementado**)
4. **Dependencia manual** de que el desarrollador recuerde correr `node scripts/test-cuenta-destino-hibrido.js`

**Evidencia:**

```bash
$ grep -r "test-cuenta-destino" package.json
# Resultado: VACÍO (no existe el script en package.json)
```

El archivo `scripts/test-cuenta-destino-hibrido.js` tiene 336 líneas, pero:

- **Falta el test de pago consolidado** (líneas 6-8 prometen "Pago consolidado valida cuenta destino", pero no hay función `test9_PagoConsolidado()`)
- **No cubre el Hallazgo #1** (búsqueda por nombre con duplicados)

**Solución:**

1. Mover tests a `src/app/database/entities/financiero/__tests__/cuenta-destino.spec.ts` (Jest)
2. Agregar a `npm run test`:
   ```json
   "test:cuenta-destino": "jest cuenta-destino.spec.ts"
   ```
3. **Casos discriminantes faltantes**:
   - Proveedor con nombre duplicado → debe fallar con error claro
   - Pago consolidado con línea bancaria → verifica que se persiste `cuentaBancariaDestinoId` y se enriquece descripción
   - Desactivar persona → verifica que sus cuentas quedan "huérfanas" (ver Hallazgo #5)

**Impacto:**

- **Regresiones silenciosas** en Fase 2-3 (cuando se agregue cliente/funcionario)
- **No hay verificación** de que las migraciones corren OK en ambos drivers

**Severidad:** CRÍTICO  
**Recomendación:** **BLOQUEA MERGE**. Reescribir tests como Jest + agregar casos discriminantes.

---

### 🟠 ALTO #3: Lectura pública de cuentas sin permiso

**Ubicación:** `electron/handlers/cuentas-bancarias-destino.handler.ts:156-173`, línea 177

**Problema:**

Los handlers de lectura **NO tienen `ensurePermission`**:

```typescript
ipcMain.handle(
  'get-cuentas-bancarias-destino-by-persona',
  async (_event, payload: { personaId: number; incluirInactivas?: boolean }) => {
    // LECTURA PÚBLICA (sin permiso) — diseño documentado en domains/cuentas-bancarias.md
    const repo = dataSource.getRepository(CuentaBancariaDestino);
    // ...
  }
);
```

**Diseño declarado en docs** (`docs/domains/cuentas-bancarias.md:1050-1060`):

> **Decisión:** Lectura pública (sin permiso) consistente con catálogos (ej. `get-producto`).  
> **Path de evolución:** Agregar `FINANCIERO_CTA_BANCARIA_DESTINO_VER` en fase futura si se necesita restricción.

**Análisis de riesgo:**

1. **Contexto `/api/rpc` default-allow**: Cualquier cliente con JWT válido (cajero, mozo, repartidor, kiosco PWA) puede llamar `get-cuentas-bancarias-destino-by-persona` y obtener:
   - Banco, número de cuenta, titular (nombre de la persona)
   - Alias (ej. "CUENTA PERSONAL GERENTE")
   - Moneda, tipo de cuenta

2. **Sensibilidad de los datos**:
   - Las cuentas bancarias de terceros (proveedores, clientes, funcionarios) **NO son catálogos públicos**
   - Comparación con `get-producto`: un producto es información pública del negocio. Una cuenta bancaria de un proveedor/funcionario es **dato financiero privado del tercero**
   - Un mozo podría consultar las cuentas bancarias de todos los funcionarios (incluido el gerente)

3. **Inconsistencia con el resto del sistema**:
   - `get-cuenta-bancaria` (empresa) tiene `FINANCIERO_CUENTA_BANCARIA_VER` (línea 456 de `banking.handler.ts`)
   - `get-caja-mayor` tiene `FINANCIERO_CAJA_MAYOR_VER`
   - Los adapters de pago consolidado todos tienen `ensurePermission` en `listarPendientes` (línea 96 de `pago-consolidado.handler.ts`)

**Justificación del diseño declarado:**

El plan dice "consistente con `get-producto`", pero `get-producto` NO tiene permiso porque es un **catálogo operativo** (el mozo necesita ver productos para vender). Las cuentas bancarias destino NO son operativas para un mozo: solo las consulta gerencia al registrar pagos.

**Solución:**

Agregar permiso **ahora** (no "en fase futura"):

```typescript
ipcMain.handle('get-cuentas-bancarias-destino-by-persona', async (_event, payload) => {
  await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CTA_BANCARIA_DESTINO_VER');
  // ...
});
```

Y agregar a seed de permisos:

```typescript
{
  codigo: 'FINANCIERO_CTA_BANCARIA_DESTINO_VER',
  nombre: 'Ver cuentas bancarias de terceros',
  seccion: 'FINANCIERO',
}
```

Asignado a: GERENTE, ADMIN (NO a CAJERO/MOZO).

**Contraargumento del diseño:**

Si el selector de cuenta destino (`selector-cuenta-destino.component`) necesita lectura sin permiso para funcionar, entonces el **diseño del flujo es incorrecto**: el selector debería recibir las cuentas **ya filtradas** desde el componente padre (que tiene permiso para editar proveedor), no consultar directamente desde el renderer.

**Impacto:**

- **Exposición de datos financieros** de proveedores/funcionarios a roles no autorizados
- **Auditoría de seguridad fallida** (pentest mostraría que un mozo puede listar todas las cuentas del sistema)

**Severidad:** ALTO  
**Recomendación:** Agregar permiso antes de merge. Si esto rompe el selector, rediseñar flujo UI (pasar cuentas como Input, no consultar desde hijo).

---

### 🟠 ALTO #4: Handler no valida existencia de `monedaId` antes de crear

**Ubicación:** `electron/handlers/cuentas-bancarias-destino.handler.ts:45`

**Problema:**

El handler valida que `personaId` existe y está activo (líneas 34-41), pero **NO valida `monedaId`**:

```typescript
if (!payload.banco) throw new Error('banco es requerido');
if (!payload.numeroCuenta) throw new Error('numeroCuenta es requerido');
if (!payload.monedaId) throw new Error('monedaId es requerido');

// Derivar titular de persona (desnormalizado, readonly en UI)
const titular = `${persona.nombre || ''} ${persona.apellido || ''}`.trim().toUpperCase();
```

Si `payload.monedaId = 9999` (no existe), la cuenta se crea **con FK inválida**:

- En **SQLite**: se guarda (no enforza FKs), pero la hidratación con `relations: ['moneda']` devuelve `null` → la UI revienta con `cuenta.moneda.codigo is undefined`
- En **Postgres**: falla con `constraint violation: FK_cbd_moneda` → **peor**, porque el error es críptico para el usuario

**Solución:**

Agregar validación antes de derivar titular (línea 46):

```typescript
if (!payload.monedaId) throw new Error('monedaId es requerido');

const monedaRepo = dataSource.getRepository('Moneda');
const moneda = await monedaRepo.findOne({ where: { id: payload.monedaId } });
if (!moneda) {
  throw new Error(`Moneda ${payload.monedaId} no encontrada`);
}
if (!moneda.activo) {
  throw new Error('La moneda está desactivada');
}
```

**Impacto:**

- **Error críptico** en Postgres (el usuario no sabe qué hacer)
- **Inconsistencia** con validación de `personaId` (se valida una FK pero no la otra)

**Severidad:** ALTO  
**Recomendación:** Agregar validación antes de merge (5 líneas).

---

### 🟠 ALTO #5: Desactivar persona no desactiva sus cuentas en cascada

**Ubicación:** Falta handler o validación en `personas.handler.ts`

**Problema:**

El plan (`PLAN-CUENTAS-BANCARIAS-DESTINO.md:948-963`) documenta el riesgo:

> **Riesgo 2:** Usuario desactiva `Persona` → sus cuentas quedan "huérfanas" (activas pero con persona inactiva).
> **Decisión MVP:** Validar en pago consolidado (rechazar cuenta con persona inactiva).

Pero **no hay implementación** de esa validación en cascada. Actualmente:

1. Se desactiva persona (desde `update-persona`, no auditado en este PR)
2. Sus cuentas quedan `activo=true` pero con `persona.activo=false`
3. El handler de pago consolidado **sí valida** (líneas 218-222):

```typescript
if (!cuenta.persona || !cuenta.persona.activo) {
  throw new Error(
    `El titular de la cuenta bancaria del proveedor "${nombreProveedor}" está desactivado.`
  );
}
```

**Pero falta:**

- Validar en `delete-cuenta-bancaria-destino` que si la cuenta está activa, su persona también debe estarlo (defensa en profundidad)
- Handler o UI que **advierta** al desactivar persona: *"Esta persona tiene N cuentas bancarias activas. ¿Desactivarlas también?"*

**Escenario de falla:**

1. Proveedor "LA FAMILIA" tiene persona "Elvia Ruiz Diaz" con cuenta activa
2. RRHH desactiva persona "Elvia Ruiz Diaz" (porque dejó de ser contacto del proveedor)
3. La cuenta queda `activo=true` con `persona.activo=false`
4. El proveedor sigue con `cuentaBancariaDefaultId` apuntando a esa cuenta
5. Al pagar, rechaza con *"El titular está desactivado"* → el usuario no entiende por qué (la **cuenta** está activa en la UI)

**Solución:**

1. **Validación en `delete-cuenta-bancaria-destino`** (línea 130 del handler):

```typescript
// Validar que NO esté marcada como default...
if (proveedorConCuenta) { ... }

// NUEVO: Validar que la persona esté activa
const persona = await queryRunner.manager.findOne(Persona, { where: { id: cuenta.personaId } });
if (!persona?.activo) {
  throw new Error(
    'No se puede desactivar: el titular (persona) ya está desactivado. ' +
    'Primero reactivá la persona o vinculá otra cuenta al proveedor.'
  );
}
```

2. **Handler `update-persona`** (fuera de scope de este PR, pero documentar):

```typescript
if (payload.activo === false && existente.activo === true) {
  // Persona se desactiva
  const cuentasActivas = await dataSource.getRepository(CuentaBancariaDestino).count({
    where: { personaId: id, activo: true },
  });
  if (cuentasActivas > 0) {
    // Opción A: rechazar
    throw new Error(
      `No se puede desactivar: la persona tiene ${cuentasActivas} cuentas bancarias activas. ` +
      `Desactivalas primero desde Proveedores → [NOMBRE] → Cuentas.`
    );
    // Opción B: advertir y desactivar en cascada (requiere UX approval)
  }
}
```

**Impacto:**

- **Inconsistencia de estado** (cuenta activa con persona inactiva)
- **Mensaje de error confuso** para el usuario

**Severidad:** ALTO  
**Recomendación:** Agregar validación #1 antes de merge (5 líneas). Documentar handler `update-persona` en el plan como deuda técnica Fase 2.

---

### 🟡 MEDIO #6: Migración `ProveedorCuentaBancariaDefault` no valida si tabla ya tiene columna en Postgres

**Ubicación:** `src/app/database/migrations/1789587015222-ProveedorCuentaBancariaDefault.ts:20-25`

**Problema:**

La migración valida columna existente **solo en SQLite**, pero no en Postgres:

```typescript
const tabla = await queryRunner.getTable('proveedores');
if (tabla && !tabla.columns.find((c) => c.name === 'cuenta_bancaria_default_id')) {
  await queryRunner.query(
    `ALTER TABLE "proveedores" ADD COLUMN "cuenta_bancaria_default_id" integer NULL`
  );
}
```

Después del `if`, en Postgres continúa directo a crear el índice y FK **sin validar si ya existen**:

```typescript
// Índice parcial (solo filas con cuenta asignada)
await queryRunner.query(`
  CREATE INDEX IF NOT EXISTS "IDX_proveedor_cta_default"
  ON "proveedores" ("cuenta_bancaria_default_id")
  WHERE "cuenta_bancaria_default_id" IS NOT NULL
`);

// FK solo en Postgres
if (isPg) {
  await queryRunner.query(`
    ALTER TABLE "proveedores"
    ADD CONSTRAINT "FK_proveedor_cuenta_default"
    FOREIGN KEY ("cuenta_bancaria_default_id")
    REFERENCES "cuentas_bancarias_destino"("id")
    ON DELETE SET NULL
  `);
}
```

**Escenario de falla:**

Si la migración se corre **dos veces** en Postgres (ej. rollback manual + re-run), la FK falla con:

```
ERROR: constraint "FK_proveedor_cuenta_default" already exists
```

**Buenas prácticas del proyecto:**

Otras migraciones duales usan `IF NOT EXISTS` en FKs también (ejemplo de `CuentasBancariasDestinoHibrido1789586966573:64-73`):

```typescript
if (isPg) {
  await queryRunner.query(`
    ALTER TABLE "cuentas_bancarias_destino"
    ADD CONSTRAINT IF NOT EXISTS "FK_cbd_persona"  // ← IF NOT EXISTS
    FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT
  `);
}
```

**Problema:** Postgres **no soporta `IF NOT EXISTS` en `ALTER TABLE ... ADD CONSTRAINT`** (es sintaxis de Postgres 9.5+, pero no con `ADD CONSTRAINT`).

**Solución correcta:**

Envolver en `DO` block (PL/pgSQL) o verificar existencia antes:

```typescript
if (isPg) {
  // Verificar si FK ya existe
  const fkExists = await queryRunner.query(`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'FK_proveedor_cuenta_default'
  `);
  if (!fkExists || fkExists.length === 0) {
    await queryRunner.query(`
      ALTER TABLE "proveedores"
      ADD CONSTRAINT "FK_proveedor_cuenta_default"
      FOREIGN KEY ("cuenta_bancaria_default_id")
      REFERENCES "cuentas_bancarias_destino"("id")
      ON DELETE SET NULL
    `);
  }
}
```

**Idem** para las otras 3 migraciones (`PagoConsolidadoDetalleCuentaDestino`, `MovimientoBancarioCuentaDestino`).

**Impacto:**

- **Falla de re-run** de migraciones en Postgres (no es idempotente)
- **Menor severidad** porque es infrecuente (solo en rollback manual)

**Severidad:** MEDIO  
**Recomendación:** Corregir antes de merge (agregar verificación de FK existente en las 3 migraciones afectadas).

---

## Motor de pago consolidado: Correctitud

**Revisión del path crítico** (`registrar-pago-consolidado`):

1. **Lock de obligaciones en orden de ID** (línea 139): ✅ Correcto (previene deadlocks)
2. **Validación de beneficiario único** (línea 170): ✅ Correcto (contra datos releídos, no payload del cliente)
3. **Resolución de cuenta destino** (líneas 176-224): ⚠️ **Hallazgo #1** (búsqueda por nombre)
4. **Validación de descuento + tope** (líneas 236-291): ✅ Correcto (tope es el mínimo entre contexto y cajas involucradas, no evadible)
5. **Enriquecimiento de descripción bancaria** (líneas 423-427): ✅ Correcto (titular + banco + nro cuenta)
6. **FK `cuentaBancariaDestinoId` en `PagoConsolidadoDetalle`** (línea 471): ✅ Persistida correctamente
7. **FK `cuentaBancariaDestinoId` en `MovimientoBancario`** (línea 436): ✅ Persistida correctamente

**No se encontraron problemas** adicionales en el motor más allá del Hallazgo #1.

---

## `ensurePermission`: Cumplimiento

| Handler | Método | Permiso | Estado |
|---------|--------|---------|--------|
| `cuentas-bancarias-destino` | `create` | `FINANCIERO_CTA_BANCARIA_DESTINO_CREAR` | ✅ Línea 27 |
| | `update` | `FINANCIERO_CTA_BANCARIA_DESTINO_ACTUALIZAR` | ✅ Línea 77 |
| | `delete` | `FINANCIERO_CTA_BANCARIA_DESTINO_ELIMINAR` | ✅ Línea 125 |
| | `get-by-persona` | (ninguno) | ⚠️ **Hallazgo #3** |
| | `get-one` | (ninguno) | ⚠️ **Hallazgo #3** |
| `pago-consolidado` | `registrar` | `adapter.permiso` (derivado de concepto) | ✅ Línea 109 |
| | + descuento | `CPC_DESCUENTO` | ✅ Línea 247 |
| `pago-consolidado` | `get-pago` | `adapter.permiso` | ✅ Línea 515 (refactor de QueryBuilder a `ensurePermission`) |

**Permisos agregados al seed** (`permissions.handler.ts:77-91`): ✅ Los 3 permisos CRUD + asignación a roles GERENTE/ADMIN

**Conclusión:** Cumplimiento **parcial** (falta permiso de lectura, ver Hallazgo #3).

---

## Migraciones dual-driver: Validación técnica

| Migración | Timestamp | Aditivo | Driver-aware | FKs solo Pg | Índices | Idempotente |
|-----------|-----------|---------|--------------|-------------|---------|-------------|
| `CuentasBancariasDestinoHibrido` | `1789586966573` | ✅ | ✅ | ✅ | ✅ | ⚠️ Ver #6 |
| `ProveedorCuentaBancariaDefault` | `1789587015222` | ✅ | ✅ | ✅ | ✅ | ⚠️ Ver #6 |
| `PagoConsolidadoDetalleCuentaDestino` | `1789587032713` | ✅ | ✅ | ✅ | ✅ | ⚠️ Ver #6 |
| `MovimientoBancarioCuentaDestino` | `1789587049751` | ✅ | ✅ | ✅ | ✅ | ⚠️ Ver #6 |

**Timestamps:**

- ✅ Todos son epoch-ms **reales** (no redondeados)
- ✅ Generados con `python3 -c "import time;print(int(time.time()*1000))"` (buena práctica del proyecto)
- ✅ Espaciados ~16 segundos entre sí (único, no colisionan)

**Driver-awareness:**

- ✅ Branching correcto: `queryRunner.connection.options.type === 'postgres'`
- ✅ Tipos SQL: `pk`, `ts`, `bool` adaptados a SQLite/Postgres
- ✅ FKs solo en Postgres (`createForeignKeyConstraints: false` en entities)

**Additive:**

- ✅ Solo `ADD COLUMN` (nullable), no `DROP` ni `RENAME`
- ✅ Índices con `IF NOT EXISTS`
- ⚠️ FKs sin validación de existencia previa (Hallazgo #6)

**down():**

- ✅ Implementado en las 4 migraciones
- ✅ Orden inverso: FKs → índices → columnas → tabla
- ⚠️ SQLite: no dropea columnas (comentario dice "requiere recrear tabla, pero para down es aceptable no hacerlo")

---

## Soft-delete: Comportamiento y validaciones

**Default en entidad:**

```typescript
@Column({ default: true })
activo!: boolean;
```

✅ Correcto: `activo=true` por defecto.

**Validación de desactivación** (`delete-cuenta-bancaria-destino`, línea 136-145):

```typescript
const proveedorConCuenta = await proveedorRepo
  .createQueryBuilder('p')
  .where('p.cuenta_bancaria_default_id = :cuentaId', { cuentaId: id })
  .andWhere('p.activo = :activo', { activo: true })
  .getOne();

if (proveedorConCuenta) {
  throw new Error(
    `No se puede desactivar: está marcada como cuenta preferida del proveedor "${(proveedorConCuenta as any).nombre}". Desmarcá primero.`
  );
}
```

✅ Correcto: rechaza si está referenciada como default de proveedor **activo**.

**Falta validación:** Cascada de persona inactiva → cuentas huérfanas (Hallazgo #5).

---

## UI: Correctitud de integración

### `selector-cuenta-destino.component.ts`

**Inputs:**

- `personaId` (obligatorio)
- `cuentaSeleccionadaId` (opcional, para preseleccionar)

**Funcionamiento:**

1. `ngOnInit` → `loadCuentas()` si `personaId` existe ✅
2. `ngOnChanges` → reload si `personaId` cambia ✅
3. Autoselección si hay **una sola cuenta** (línea 120): ✅ Correcto
4. Mensaje si **cero cuentas** (línea 60): ✅ Correcto

**Problema de diseño:** Llama `getCuentasBancariasDestinoByPersona()` directamente desde el componente hijo → expuesto al **Hallazgo #3** (lectura sin permiso).

**Solución de diseño:** El selector debería recibir `cuentas: CuentaBancariaDestino[]` como `@Input`, no consultar:

```typescript
@Input() cuentas: CuentaBancariaDestino[] = [];
@Input() cuentaSeleccionadaId?: number | null;
@Output() cuentaChange = new EventEmitter<CuentaBancariaDestino | null>();

// NO llama repository.service, solo filtra/renderiza el array recibido
```

Y el componente padre (`create-edit-proveedor`) hace la carga con su permiso de edición.

---

### `create-edit-proveedor.component.ts`

**Integración de cuenta destino** (líneas 350-450):

1. Carga persona vinculada (línea 380) ✅
2. Carga cuentas de esa persona (línea 390) ✅
3. Badge si falta persona (línea 420): ✅ Correcto
4. Selector de cuenta (línea 440): ✅ Integrado

**Validación al guardar** (línea 500+):

- Se envía `cuentaBancariaDefaultId` en el payload ✅
- El handler `update-proveedor` valida que la cuenta existe y está activa (no auditado en este PR, pero referenciado en el plan)

---

## Tests: Cobertura y discriminantes

**Tests implementados** (`scripts/test-cuenta-destino-hibrido.js`):

1. ✅ Crear cuenta para persona (titular derivado)
2. ✅ UPPERCASE aplicado
3. ✅ Vincular cuenta a proveedor como default
4. ✅ Desactivar cuenta rechaza si es default de proveedor activo
5. ✅ Proveedor sin persona valida
6. ✅ Proveedor sin cuenta bancaria valida
7. ✅ Titular desnormalizado (readonly)
8. ✅ personaId inmutable

**Total asserts:** ~20 (cumple objetivo)

**Faltantes críticos:**

❌ **No hay test de pago consolidado** (prometido en línea 6, no implementado)  
❌ **No cubre Hallazgo #1** (búsqueda por nombre con duplicados)  
❌ **No cubre Hallazgo #5** (cascada persona inactiva)  
❌ **No integrado a CI** (Hallazgo #2)

**Diagnóstico de proveedores sin persona** (`scripts/diagnostico-proveedores-sin-persona.js`):

✅ Bien diseñado: query + recomendación por porcentaje  
❌ Script manual (no integrado a pre-commit hooks)

---

## Race conditions: Análisis de concurrencia

**Path crítico revisado:** `registrar-pago-consolidado`

1. **Lock de obligaciones** (línea 141): ✅ `leerYBloquear()` usa `FOR UPDATE` (Postgres) o transacción serializable (SQLite)
2. **Lock de cuenta destino:** ❌ **NO** se lockea (la búsqueda en línea 193 es simple `findOne`, no `FOR UPDATE`)

**Escenario de race:**

1. Usuario A inicia pago consolidado a proveedor X (línea bancaria)
2. Usuario B desactiva la cuenta default del proveedor X **justo después** de que A validó en línea 213
3. Usuario A continúa y registra el pago con cuenta inactiva

**Impacto:** Bajo (ventana de race estrecha, y el handler de desactivar cuenta ya rechaza si está en uso)

**Pero defensivo:** Lockear la cuenta antes de validar:

```typescript
const proveedor = await queryRunner.manager.findOne(Proveedor, {
  where: { nombre: nombreProveedor, activo: true },
  relations: ['cuentaBancariaDefault', 'cuentaBancariaDefault.persona', 'persona'],
  lock: { mode: 'pessimistic_read' }, // ← Agregar lock
});
```

**Severidad:** Baja (por ventana estrecha)  
**Recomendación:** Opcional (nice-to-have, no bloquea merge).

---

## Documentación: Calidad y completitud

**Nuevo documento:** `docs/domains/cuentas-bancarias.md` (478 líneas)

✅ Tabla comparativa empresa vs destino  
✅ Diferencia titular: empresa=string libre, destino=derivado Persona readonly  
✅ Lectura pública documentada (aunque riesgosa, ver Hallazgo #3)  
✅ Flujos de uso: pago consolidado, reportes, match de comprobantes  

**Plan original actualizado:** `PLAN-CUENTAS-BANCARIAS-DESTINO.md` (1151 líneas)

✅ Modelo híbrido aprobado por Gabriel  
✅ Respuestas a 3 restricciones explícitas  
✅ Riesgos documentados (5)  
✅ Fases 1-6 detalladas  
✅ Auditorías A+B incorporadas (hallazgos integrados al plan)  

**Skill actualizada:** `.claude/skills/frc-gourmet-expert/architecture/mobile-pwa.md`

✅ Limpieza de referencias a deep-links (fuera de scope de este PR)

---

## Comparativa con auditoría A

**Auditor A** (Alcance/Convenciones) encontró:

1. ⚠️ Titular desnormalizado (resuelto: se documenta que es readonly)
2. ⚠️ Timestamp migraciones (resuelto: son epoch-ms reales)
3. ⚠️ Proveedor.persona nullable (resuelto: script diagnóstico obligatorio)

**Auditor B** (Correctitud) encontró:

1. 🔴 Búsqueda por nombre (nuevo, no detectado por A)
2. 🔴 Tests no en CI (nuevo, no detectado por A)
3. 🟠 Lectura pública sin permiso (nuevo, A dijo "documentado", B dice "riesgoso")
4. 🟠 Validación monedaId falta (nuevo)
5. 🟠 Cascada persona inactiva (nuevo)
6. 🟡 Migración Postgres no idempotente (nuevo)

**Overlap:** 0 hallazgos duplicados (buenos ejes complementarios)

---

## Veredicto final

**APROBADO CON CONDICIONES:**

**Bloquea merge:**

1. ✋ **Hallazgo #1**: Extender adapters para devolver `beneficiarioId` + buscar por ID
2. ✋ **Hallazgo #2**: Reescribir tests como Jest + integrar a `npm run test` + casos discriminantes

**Antes de merge:**

3. ✋ **Hallazgo #3**: Agregar `FINANCIERO_CTA_BANCARIA_DESTINO_VER` + rediseñar selector UI
4. ✋ **Hallazgo #4**: Validar existencia de `monedaId` en handler
5. ✋ **Hallazgo #5**: Validar cascada persona inactiva
6. ✋ **Hallazgo #6**: Idempotencia de FKs en migraciones Postgres

**Post-merge (Fase 2):**

- Race condition de cuenta destino (nice-to-have, no crítico)
- Handler `update-persona` con advertencia de cuentas en cascada

---

## Top hallazgos con path:línea

| Sev | Hallazgo | Path:línea |
|-----|----------|-----------|
| 🔴 CRÍTICO | Búsqueda proveedor por nombre vulnerable a duplicados | `electron/handlers/pago-consolidado.handler.ts:190-198` |
| 🔴 CRÍTICO | Tests no ejecutables en CI | `scripts/test-cuenta-destino-hibrido.js:1` (no en `package.json`) |
| 🟠 ALTO | Lectura pública sin permiso | `electron/handlers/cuentas-bancarias-destino.handler.ts:156` |
| 🟠 ALTO | No valida `monedaId` antes de crear | `electron/handlers/cuentas-bancarias-destino.handler.ts:45` |
| 🟠 ALTO | Falta validación cascada persona inactiva | `electron/handlers/cuentas-bancarias-destino.handler.ts:130` |
| 🟡 MEDIO | Migración Postgres no idempotente (FKs) | `src/app/database/migrations/1789587015222-ProveedorCuentaBancariaDefault.ts:36` |

---

**Auditor:** Cloud Agent B  
**Modelo:** Claude Sonnet 4.5 (default cloud agent)  
**Fecha de reporte:** 2026-09-16  
**Líneas de código auditadas:** ~2400 (nuevo/modificado)  
**Tiempo de auditoría:** 1 pase completo + verificación cruzada con plan

---

**FIN DEL REPORTE**
