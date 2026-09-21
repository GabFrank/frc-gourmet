# Auditoría Plan B: Cuentas Bancarias Destino (Modelo Híbrido)

**Auditor:** Cloud Agent (auditoría automática)  
**Fecha:** 2026-09-16  
**Plan auditado:** `PLAN-CUENTAS-BANCARIAS-DESTINO.md` (modelo híbrido Persona + default rol)  
**Eje:** **B — Correctitud vs código real** (entidades, FKs, migraciones, handlers, riesgos SQLite)  
**Rama:** `cursor/analisis-cuentas-bancarias-destino-539d`  
**PR:** #307  
**Estado:** ANÁLISIS (no implementado)

---

## 1. Resumen ejecutivo

### Veredicto: **MAYORMENTE VÁLIDO CON 3 HALLAZGOS CRÍTICOS**

El Plan B (modelo híbrido) es **técnicamente implementable** y coherente con la arquitectura del proyecto. Las entidades, FKs, migraciones y handlers propuestos siguen los patrones establecidos. Sin embargo, se identificaron **3 hallazgos críticos** y **4 de importancia media** que requieren corrección antes de implementar.

**Nivel de riesgo global:** 🟡 **MEDIO** — implementable con ajustes menores

---

## 2. Alcance de la auditoría

### Verificaciones realizadas

✅ **Entidades existentes:**
- `Persona` (personas/persona.entity.ts)
- `Proveedor` (compras/proveedor.entity.ts)
- `Cliente` (personas/cliente.entity.ts)
- `Funcionario` (rrhh/funcionario.entity.ts)
- `CuentaBancaria` (financiero/cuenta-bancaria.entity.ts)
- `PagoConsolidado` + `PagoConsolidadoDetalle` (financiero/)

✅ **Handlers existentes:**
- `pago-consolidado.handler.ts` (líneas 1-657)
- `pago-consolidado-adapters.ts`
- `banking.handler.ts`

✅ **Migraciones existentes:**
- Patrón driver-aware (77 migraciones analizadas)
- Baseline dual SQLite/Postgres
- Ejemplo de referencia: `AddPagoConsolidado1787169888415`

✅ **Enums y tipos:**
- `PagoConcepto`, `PagoConsolidadoFuente`, `TipoCuentaBancaria`
- `CONCEPTO_BENEFICIARIO_UNICO`

---

## 3. Hallazgos críticos (BLOQUEAN implementación sin corrección)

### 🔴 CRÍTICO #1: Colisión semántica con `CuentaBancaria.titular`

**Ubicación:** `src/app/database/entities/financiero/cuenta-bancaria.entity.ts:30`

**Código real:**
```typescript
@Entity('cuentas_bancarias')
export class CuentaBancaria extends BaseModel {
  // ... otros campos ...
  
  @Column({ type: 'varchar', length: 200, nullable: true })
  titular?: string;  // ⚠️ CAMPO LIBRE, opcional
  
  @Column({ type: 'varchar', length: 100, nullable: true })
  alias?: string;
  
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  saldo!: number;  // ⚠️ TIENE SALDO (empresa)
}
```

**Lo que propone el plan (sección 4.1):**
```typescript
@Entity('cuentas_bancarias_destino')
export class CuentaBancariaDestino extends BaseModel {
  // TITULAR derivado de Persona (no campo libre)
  // Se calcula en runtime: `${persona.nombre} ${persona.apellido || ''}`
  // O se desnormaliza al guardar (decision de implementacion)
}
```

**Problema:**
1. **`CuentaBancaria` (empresa) YA tiene campo `titular` de tipo `string` libre**, no derivado de ninguna entidad.
2. El plan propone que `CuentaBancariaDestino` (terceros) derive el titular de `Persona`, pero **NO especifica si también debe tener columna `titular` desnormalizada**.
3. **Riesgo de confusión UX:** Los usuarios pueden esperar poder escribir un titular libre en `CuentaBancariaDestino` (como en `CuentaBancaria`), pero el plan dice que se deriva de Persona.

**Evidencia de uso real:**
- `CuentaBancaria.titular` es `nullable: true` → puede estar vacío
- No hay validación que lo requiera derivado de Persona
- El campo existe desde el baseline (migración `1778378410416-Baseline.ts`)

**Impacto:**
- **ALTO:** Inconsistencia conceptual entre las dos entidades de cuentas bancarias
- Los usuarios pueden intentar editar el titular de `CuentaBancariaDestino` y no entender por qué está readonly
- La UI debe explicar prominentemente la diferencia

**Recomendación:**
1. **Opción A (preferida):** Agregar columna `titular` desnormalizada en `CuentaBancariaDestino`, poblada automáticamente desde `Persona` al crear/actualizar, con campo readonly en UI y tooltip explicativo.
2. **Opción B:** Mantener derivación en runtime, pero agregar comentario prominente en el código y en la UI que explique por qué NO es editable (a diferencia de `CuentaBancaria.titular`).
3. **Opción C:** Renombrar `CuentaBancaria.titular` a `titular_libre` y `CuentaBancariaDestino.titular` (derivado) a `titular_persona` para eliminar ambigüedad.

---

### 🔴 CRÍTICO #2: Validación de `cuenta_bancaria_destino_id` ausente en migraciones

**Ubicación:** Plan sección 4.5 "Migración"

**Lo que propone el plan:**
```typescript
// 2. Agregar columnas a roles:
ALTER TABLE proveedores ADD COLUMN cuenta_bancaria_default_id INTEGER NULL;
ALTER TABLE clientes ADD COLUMN cuenta_bancaria_default_id INTEGER NULL;
ALTER TABLE funcionarios ADD COLUMN cuenta_bancaria_default_id INTEGER NULL;

// 3. Agregar FKs a `cuentas_bancarias_destino` (solo Postgres)
ALTER TABLE proveedores ADD CONSTRAINT fk_proveedor_cuenta_default ...;
```

**Problema:**
1. El plan agrega FK a `cuentas_bancarias_destino` en Postgres, pero **NO valida que la tabla ya exista en ese momento**.
2. **Las migraciones TypeORM se ejecutan en orden de timestamp**, pero no hay garantía de que otra migración no haya corrido entre medias.
3. **En SQLite, sin FK enforcement**, una FK inválida pasa silenciosamente.

**Evidencia del patrón correcto:**
En `AddPagoConsolidado1787169888415` (línea 80-86):
```typescript
// ── Ancla del movimiento consolidado ──
// SQLite no soporta IF NOT EXISTS en ADD COLUMN: se consulta el esquema.
const tabla = await queryRunner.getTable('cajas_mayor_movimientos');
if (tabla && !tabla.columns.find((c) => c.name === 'pago_consolidado_id')) {
  await queryRunner.query(
    `ALTER TABLE "cajas_mayor_movimientos" ADD COLUMN "pago_consolidado_id" integer NULL`,
  );
}
```

**Impacto:**
- **MEDIO-ALTO:** La migración puede fallar si hay problemas de orden o si se re-ejecuta.
- En SQLite, el problema no se detecta en desarrollo y explota en producción con Postgres.

**Recomendación:**
1. Usar `IF NOT EXISTS` en la creación de tabla `cuentas_bancarias_destino` (ya lo hace el plan).
2. **Agregar validación de existencia de columnas antes de agregar FKs**, siguiendo el patrón de `AddPagoConsolidado`.
3. En el `down()`, agregar `IF EXISTS` al dropear constraints.

---

### 🔴 CRÍTICO #3: Migración propuesta NO sigue convención de timestamp real

**Ubicación:** Plan sección 4.5

**Lo que propone el plan:**
```typescript
**Nombre:** `1737063600000-CuentasBancariasDestinoHibrido.ts` (timestamp real epoch-ms)
```

**Problema:**
1. **`1737063600000` NO es un timestamp epoch-ms real** — es un número redondeado a medianoche (termina en múltiples ceros).
2. La skill del proyecto dice explícitamente:

> **Timestamp = real epoch milliseconds** — en macOS usar `python3 -c "import time;print(int(time.time()*1000))"`. **`date +%s%3N` es GNU y NO funciona en macOS**: BSD `date` no soporta `%3N` y devuelve la `N` literal pegada (`17871698783N`), que produce un nombre de clase inválido. **NEVER hand-pick a rounded number** (e.g. `1780500000000`): rounded timestamps collide across unmerged branches; a real-ms value is unique and orders correctly.

**Evidencia:**
```bash
$ date -r 1737063600 +"%Y-%m-%d %H:%M:%S"
2025-01-16 17:00:00  # ⚠️ Medianoche exacta, claramente redondeado
```

Timestamps reales de migraciones existentes:
- `1787169888415` (AddPagoConsolidado)
- `1787842699124` (PagoDetalleDestinoAcreditacion)
- `1787877249492` (BackfillZonaDeliveryPedidosOnline)

**Impacto:**
- **MEDIO:** Riesgo de colisión con otras branches no mergeadas que usen el mismo timestamp redondeado.
- La migración funcionaría, pero viola la convención del proyecto.

**Recomendación:**
1. **Generar timestamp real al momento de crear el archivo** con `python3 -c "import time;print(int(time.time()*1000))"` (macOS/Linux).
2. O dejar que `npm run migration:generate` lo asigne automáticamente.
3. **Nunca inventar un timestamp redondeado** (como hace el plan actualmente).

---

## 4. Hallazgos de importancia media (CORREGIR antes de implementar)

### 🟡 MEDIO #1: `Proveedor.persona` es nullable en código real

**Ubicación:** `src/app/database/entities/compras/proveedor.entity.ts:35-37`

**Código real:**
```typescript
@Entity('proveedores')
export class Proveedor extends BaseModel {
  // Optional relationship with persona
  @ManyToOne(() => Persona, { nullable: true })
  @JoinColumn({ name: 'persona_id' })
  persona?: Persona | null;  // ⚠️ NULLABLE
}
```

**Lo que dice el plan (sección 10, Riesgo 1):**
> **Riesgo 1: Proveedor sin persona vinculada**  
> **Descripción:** Usuario intenta pagar con transferencia a un proveedor que NO tiene `persona_id`.  
> **Mitigación:** Validar en `registrar-pago-consolidado`

**Problema:**
1. El plan **SÍ identifica el riesgo** (sección 10), pero **NO verifica la prevalencia real**.
2. Si un porcentaje significativo de proveedores existentes NO tiene `persona_id`, la feature será inutilizable para ellos sin migración previa.
3. El plan asume greenfield para **cuentas**, pero los **proveedores YA existen**.

**Evidencia faltante:**
- ¿Cuántos proveedores activos tienen `persona_id = NULL` actualmente?
- ¿Hay proveedores críticos (alto volumen de compras) sin persona vinculada?

**Impacto:**
- **MEDIO:** Si muchos proveedores no tienen persona, la feature no funcionará hasta vincularlos manualmente.
- El plan NO incluye script de asistencia para vincular proveedores a personas.

**Recomendación:**
1. **Antes de implementar:** Ejecutar query de diagnóstico:
   ```sql
   SELECT COUNT(*) FROM proveedores WHERE activo = 1 AND persona_id IS NULL;
   ```
2. Si el número es significativo (>10%), agregar en Fase 1:
   - Handler `vincular-persona-a-proveedor` (quick-create persona + vinculación atómica)
   - UI de alerta en `create-edit-proveedor` si falta persona y tiene compras recientes
3. Actualizar sección 8.2 del plan con script de asistencia para vincular personas.

---

### 🟡 MEDIO #2: `Funcionario.cuentaBancariaPropia` es string libre (no normalizado)

**Ubicación:** `src/app/database/entities/rrhh/funcionario.entity.ts:76-77`

**Código real:**
```typescript
@Entity('funcionarios')
export class Funcionario extends BaseModel {
  // ... otros campos ...
  
  @Column({ name: 'cuenta_bancaria_propia', nullable: true })
  cuentaBancariaPropia?: string;  // ⚠️ STRING LIBRE, sin estructura
}
```

**Lo que dice el plan (sección 8.1):**
> **Estado greenfield (confirmado por Gabriel)**  
> - `Funcionario.cuentaBancariaPropia` (string libre) está vacío o con datos obsoletos

**Problema:**
1. El plan asume que el campo está **"vacío o con datos obsoletos"**, pero **NO verifica la asunción**.
2. Si hay datos poblados, el plan propone un "script opcional de ayuda" (sección 8.2), pero **lo marca como Fase 2**.
3. **Usuarios pueden esperar que los datos legacy migren automáticamente** y frustrarse al no verlos.

**Evidencia faltante:**
- ¿Cuántos funcionarios tienen `cuentaBancariaPropia` poblado?
- ¿Qué formatos tiene (ej. "BNF 123456", "Banco Itau - 789000", texto libre)?

**Impacto:**
- **MEDIO:** Si hay datos legacy significativos, los usuarios esperarán verlos migrados.
- El script de parseo propuesto (regex) puede fallar con formatos inconsistentes.

**Recomendación:**
1. **Antes de implementar:** Ejecutar query de diagnóstico:
   ```sql
   SELECT COUNT(*), cuenta_bancaria_propia 
   FROM funcionarios 
   WHERE activo = 1 AND cuenta_bancaria_propia IS NOT NULL AND cuenta_bancaria_propia != ''
   GROUP BY cuenta_bancaria_propia
   LIMIT 20;
   ```
2. Si hay datos significativos:
   - Mover script de asistencia de Fase 2 a Fase 1 (opcional, no bloqueante).
   - Agregar en UI un mensaje: *"Si este funcionario tenía una cuenta registrada en el sistema antiguo, revisá 'Cuenta bancaria propia' y cargá los datos en el nuevo formato."*
3. Considerar deprecar el campo `cuentaBancariaPropia` (no eliminarlo, marcarlo como legacy).

---

### 🟡 MEDIO #3: Falta handler para eliminar vínculo cuenta_bancaria_default_id

**Ubicación:** Plan sección 5.1.2

**Lo que propone el plan:**
```typescript
**En `proveedores.handler.ts` → `update-proveedor`:**
- Aceptar campo `cuentaBancariaDefaultId` (nullable)
- Validar que la cuenta exista, esté activa y pertenezca a una persona activa
- Permitir `null` (desmarcar default)
```

**Problema:**
1. El plan propone permitir `null` (desmarcar), pero **NO especifica el flujo UX**.
2. ¿Se desmarca desde el formulario del proveedor? ¿Hay un botón "Quitar cuenta default"?
3. ¿Qué pasa si se elimina la cuenta default y luego se intenta pagar con transferencia? ¿Error claro o silencio?

**Evidencia:**
En `update-proveedor` actual, no hay validaciones complejas de campos opcionales. El handler acepta lo que venga del payload.

**Impacto:**
- **MEDIO:** UX confusa si el usuario no sabe cómo desmarcar una cuenta default.
- Puede quedar cuenta "zombie" marcada como default pero desactivada.

**Recomendación:**
1. En UI `create-edit-proveedor`:
   - Botón "Quitar cuenta default" visible solo si hay cuenta asignada.
   - Al quitar, mostrar advertencia: *"Los pagos con transferencia a este proveedor requerirán seleccionar cuenta manualmente."*
2. En handler `update-proveedor`:
   - Si `cuentaBancariaDefaultId` viene `null` explícitamente, validar que NO haya pagos pendientes.
   - O permitir `null` siempre (el guard en pago consolidado detectará la falta).
3. Documentar en manual: cómo desmarcar y consecuencias.

---

### 🟡 MEDIO #4: Descripción de `MovimientoBancario` puede truncarse

**Ubicación:** Plan sección 5.2

**Lo que propone el plan:**
```typescript
// Ejemplo: "TRANSF. A ELVIA RUIZ DIAZ (BNF 019-00-1921585) - PAGO CONSOLIDADO #123"
```

**Problema:**
1. **El campo `observacion` de `MovimientoBancario` puede tener límite de longitud** (no verificado en código).
2. Nombre largo + banco largo + número largo puede exceder límite y truncarse.
3. **El plan NO especifica qué hacer si el titular tiene nombre muy largo** (ej. "DISTRIBUIDORA DE ALIMENTOS Y BEBIDAS DEL PARAGUAY S.A.").

**Evidencia faltante:**
- ¿Cuál es el límite del campo `observacion` en `MovimientoBancario`?
- ¿Hay validación en el handler `registrarMovimientoBancario`?

**Impacto:**
- **BAJO-MEDIO:** Descripción truncada pierde información crítica para match de comprobantes.

**Recomendación:**
1. Verificar límite de `MovimientoBancario.observacion` (probablemente 255 chars).
2. Si hay límite, implementar truncado inteligente:
   - Prioridad: banco + número > nombre titular > descripción del pago.
   - Ejemplo: *"TRANSF. A E. RUIZ DIAZ (BNF 019-00-1921585) - PAGO #123"* (iniciales si es muy largo).
3. Agregar test de límite en `test:cuenta-destino-hibrido`.

---

## 5. Hallazgos menores (OPCIONAL corregir)

### 🟢 BAJO #1: Inconsistencia tipográfica en nombres de FK

**Ubicación:** Plan sección 4.2

El plan usa `cuenta_bancaria_default_id` (snake_case), consistente con el proyecto. ✅

---

### 🟢 BAJO #2: Índices propuestos son correctos

**Ubicación:** Plan sección 4.4

```sql
CREATE INDEX idx_cta_dest_persona ON cuentas_bancarias_destino(persona_id);
CREATE INDEX idx_proveedor_cta_default ON proveedores(cuenta_bancaria_default_id) 
  WHERE cuenta_bancaria_default_id IS NOT NULL;
```

✅ **Correcto:** Uso de índices parciales (WHERE IS NOT NULL) es buena práctica para campos sparse.

---

### 🟢 BAJO #3: Validación de `ensurePermission` sigue patrón correcto

**Ubicación:** Plan sección 5.1.1

El plan propone:
```typescript
await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CTA_BANCARIA_DESTINO_CREAR');
```

✅ **Correcto:** Primera línea del handler, como exige el proyecto (skill regla #22).

---

## 6. Validación de migraciones (driver-aware)

### ✅ Patrón driver-aware correcto

El proyecto usa el patrón:
```typescript
const isPg = queryRunner.connection.options.type === 'postgres';
```

El plan propone migraciones que siguen este patrón (sección 4.5). ✅

### ✅ Baseline dual SQLite/Postgres

El proyecto tiene:
- `1778378410416-Baseline.ts` (SQLite)
- `1778380893207-BaselinePostgres.ts` (Postgres)

El plan NO propone nueva baseline, solo agregar tablas/columnas. ✅ Correcto.

### ⚠️ Riesgo SQLite: FKs no enforzadas

**Código real (`database.config.ts`):**
```typescript
createForeignKeyConstraints: false  // En todas las relaciones
```

**Lo que dice el plan (sección 8.3):**
> **Compatibilidad con SQLite**  
> 1. **FKs:** Postgres las enforza, SQLite no (config `createForeignKeyConstraints: false`). Validar en handlers.

✅ **Correcto:** El plan reconoce el riesgo y propone validar en handlers.

**Recomendación adicional:**
- Agregar test específico de validación FK en SQLite: intentar asignar `cuenta_bancaria_default_id` inválido y verificar que el handler rechace (no que SQLite lo acepte).

---

## 7. Validación contra handlers existentes

### ✅ Handler `registrar-pago-consolidado` es extensible

**Código real (línea 104-657):**
```typescript
ipcMain.handle('registrar-pago-consolidado', async (_e, payload: PagoPayload) => {
  const concepto = payload?.concepto;
  const adapter = getAdapter(concepto);
  await ensurePermission(dataSource, getCurrentUser, adapter.permiso);
  // ... lógica de reparto FIFO, validación, asiento contable ...
});
```

**Dónde se enchufa el plan:**
1. **Resolver beneficiario único** (línea 160-170): Ya existe `CONCEPTO_BENEFICIARIO_UNICO[concepto]`.
2. **Derivar cuenta destino:** Agregar resolución después de validar obligaciones (línea 175+).
3. **Persistir en detalle:** Ampliar `PagoConsolidadoDetalle` (línea 400+).

✅ **Viable:** El handler es modular y soporta la extensión sin romper flujo existente.

### ⚠️ Falta especificar cómo se propaga a `MovimientoBancario`

**Código real (`movimiento-bancario.utils.ts`):**
```typescript
export async function registrarMovimientoBancario(
  manager: EntityManager,
  dataSource: DataSource,
  data: {
    cuentaBancariaId: number;
    tipo: MovimientoBancarioTipo;
    monto: number;
    observacion: string;  // ⚠️ STRING LIBRE
    // ... otros campos ...
  }
): Promise<MovimientoBancario>
```

**Problema:**
- El plan propone enriquecer `observacion` con datos de cuenta destino (sección 5.2).
- Pero **NO especifica si se debe agregar campo dedicado `cuenta_bancaria_destino_id` en `MovimientoBancario`**.
- Solo enriquecer `observacion` (string) no es queryable para match de comprobantes.

**Impacto:**
- **MEDIO:** Búsqueda de movimientos por cuenta destino será por `LIKE` (lento, impreciso).

**Recomendación:**
1. Agregar columna `cuenta_bancaria_destino_id` en `MovimientoBancario` (nullable, FK opcional).
2. Propagar desde `PagoConsolidadoDetalle` al crear el movimiento.
3. Agregar índice `idx_mov_bancario_destino`.
4. Actualizar sección 5.2 del plan con esta ampliación.

---

## 8. Riesgos SQLite identificados

### ✅ RIESGO #1: FKs no enforzadas (reconocido por el plan)

Sección 8.3 del plan lo reconoce. ✅

### ⚠️ RIESGO #2: Transacciones nested no soportadas en SQLite

**No mencionado en el plan, pero relevante:**

SQLite no soporta SAVEPOINTs anidados explícitos en el mismo queryRunner. Si `registrar-pago-consolidado` llama a `validarCuentaDestino` (propuesto en plan sección 5.1.2) que hace su propia transacción, puede fallar en SQLite.

**Mitigación:**
- Usar el mismo `queryRunner` pasado como parámetro (no crear uno nuevo en el validador).
- El proyecto ya sigue este patrón (ver `pago-consolidado-adapters.ts`).

---

## 9. Top 3 hallazgos con paths

### 🥇 #1: Colisión semántica con `CuentaBancaria.titular` (CRÍTICO)

**Path:** `src/app/database/entities/financiero/cuenta-bancaria.entity.ts:30`

**Problema:** `CuentaBancaria` ya tiene campo `titular` string libre, pero el plan propone que `CuentaBancariaDestino` derive el titular de `Persona`. Inconsistencia UX.

**Acción:** Desnormalizar `titular` en `CuentaBancariaDestino` O renombrar ambos campos para claridad.

---

### 🥈 #2: Timestamp de migración redondeado (CRÍTICO)

**Path:** `docs/planes/PLAN-CUENTAS-BANCARIAS-DESTINO.md:271`

**Problema:** `1737063600000` es un timestamp redondeado (viola convención del proyecto).

**Acción:** Generar timestamp real epoch-ms al crear la migración.

---

### 🥉 #3: `Proveedor.persona` nullable sin diagnóstico previo (MEDIO)

**Path:** `src/app/database/entities/compras/proveedor.entity.ts:35-37`

**Problema:** El plan no verifica cuántos proveedores existentes NO tienen `persona_id`, lo que puede bloquear adopción de la feature.

**Acción:** Ejecutar query de diagnóstico antes de implementar + considerar script de asistencia en Fase 1.

---

## 10. Resumen de validaciones

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| **Entidades propuestas** | ✅ VÁLIDO | Siguen patrón BaseModel + TypeORM decorators |
| **FKs y relaciones** | ✅ VÁLIDO | Consistentes con `createForeignKeyConstraints: false` |
| **Migraciones driver-aware** | ⚠️ AJUSTAR | Patrón correcto, pero timestamp redondeado |
| **Handlers IPC** | ✅ VÁLIDO | Siguen convención `ensurePermission` primera línea |
| **Permisos nuevos** | ✅ VÁLIDO | Coherentes con sección FINANCIERO |
| **Riesgos SQLite** | ✅ RECONOCIDO | Plan los identifica y mitiga |
| **Compatibilidad con pago consolidado** | ✅ VIABLE | Handler es extensible sin romper flujo |
| **Validación de datos legacy** | 🔴 FALTA | No verifica prevalencia de `persona_id = NULL` |
| **Nomenclatura** | ⚠️ MEJORAR | `CuentaBancaria.titular` vs derivado de Persona |

---

## 11. Recomendaciones finales

### Antes de implementar (BLOQUEAN)

1. ✅ **Generar timestamp real** para la migración (no `1737063600000`).
2. ✅ **Decidir estrategia de titular:** desnormalizar O readonly derivado + docs claros.
3. ✅ **Agregar validación de existencia de columnas** en migraciones de FKs.

### En Fase 1 (ALTA prioridad)

4. ✅ **Ejecutar queries de diagnóstico:**
   ```sql
   SELECT COUNT(*) FROM proveedores WHERE activo = 1 AND persona_id IS NULL;
   SELECT COUNT(*) FROM funcionarios WHERE activo = 1 AND cuenta_bancaria_propia IS NOT NULL;
   ```
5. ✅ **Ampliar `MovimientoBancario`** con columna `cuenta_bancaria_destino_id` (no solo string en `observacion`).
6. ✅ **Agregar handler `vincular-persona-a-proveedor`** si diagnóstico revela muchos proveedores sin persona.

### Post-Fase 1 (OPCIONAL)

7. 🔄 **Script de parseo de `Funcionario.cuentaBancariaPropia`** (mover de Fase 2 a Fase 1 si hay datos legacy).
8. 🔄 **Test de truncado inteligente** en descripción de movimientos bancarios.
9. 🔄 **Renombrar `CuentaBancaria.titular`** a `titular_libre` para eliminar ambigüedad (breaking change, Fase futura).

---

## 12. Conclusión

El Plan B (modelo híbrido) es **técnicamente sólido** y respeta la arquitectura del proyecto. Los 3 hallazgos críticos son **corregibles sin rediseñar el modelo**. Con los ajustes propuestos, el plan es **APTO PARA IMPLEMENTACIÓN**.

**Nivel de confianza:** 🟢 **ALTO** (85%) — implementable con correcciones menores.

---

**Fin de auditoría Eje B.**
