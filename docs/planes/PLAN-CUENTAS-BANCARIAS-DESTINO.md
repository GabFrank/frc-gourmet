# Plan: Cuentas Bancarias de Destino/Cobro (Modelo Híbrido Persona + Uso por Rol)

**Autor:** Cloud Agent (análisis solicitado por Gabriel)  
**Fecha:** 2026-09-16  
**Ticket:** WA DonFranco#n7jr  
**Rama:** `cursor/analisis-cuentas-bancarias-destino-539d`  
**Estado:** ENMENDADO CON AUDITS A+B (listo para implementar)  
**Decisión final:** Modelo HÍBRIDO aprobado por Gabriel 2026-09-16  
**Auditorías:** A (Alcance/Convenciones) + B (Correctitud/Entidad) — 3 P0 incorporados

**Cambios post-auditoría:**
1. **Titular desnormalizado** en `CuentaBancariaDestino` (readonly UI, derivado Persona) — vs `CuentaBancaria.titular` libre
2. **Timestamp migraciones:** NUNCA redondeado, generar epoch-ms real con `python3`
3. **Proveedor.persona nullable:** Query diagnóstico obligatorio, badge UI si falta, vincular en Fase 1 si >10%
4. **MovimientoBancario.cuenta_bancaria_destino_id:** FK además de descripción enriquecida (queryable)
5. **Lectura pública sin permiso:** Diseño documentado en `domains/cuentas-bancarias.md` (path evolución `_VER`)
6. **`domains/cuentas-bancarias.md`:** OBLIGATORIO ANTES DE MERGE (diferencia empresa vs destino)

---

## 1. Contexto / Why

### Problema operativo actual

Don Franco reporta que **al pagar proveedores**, el comprobante bancario va a un titular externo que **NO está en Gourmet**. Ejemplo concreto:

- Proveedor: **LA FAMILIA**
- Cuenta bancaria destino: **Elvia Ruiz Diaz, BNF 019-00-1921585**

**Estado actual del sistema (aclarado por Gabriel 2026-09-16):**

Las `cuentas_bancarias` existentes representan **ÚNICAMENTE cuentas de la EMPRESA** (no de terceros), usadas para:
- Transferencias internas entre cuentas propias
- Depósitos y retiros de caja mayor
- Acreditaciones de POS (tarjetas de crédito)
- Pagos consolidados (origen de fondos, nunca destino)

**Separación crítica empresa vs terceros:**
- `CuentaBancaria` = empresa, **CON saldo** (activo que controlamos)
- `CuentaBancariaDestino` (nueva) = terceros, **SIN saldo** (solo información de destino de transferencias)

**Estado greenfield:** Ningún proveedor/cliente/funcionario tiene cuenta bancaria configurada hoy. **NO hay migración** desde entidades existentes.

### Necesidad de negocio

Al pagar obligaciones (CPP de compras, gastos, sueldos, vales) vía **pago consolidado** desde caja mayor, se necesita:

1. **Vincular datos de cobro** del beneficiario (banco, número de cuenta, alias, titular) para:
   - Generar transferencias bancarias correctas
   - Matchear comprobantes bancarios con pagos registrados
   - Emitir órdenes de pago con datos completos
   - Auditar que cada pago va a la cuenta correcta

2. **Que el titular sea una persona física/jurídica**, pero:
   - Independiente de la razón social del proveedor (puede ser dueño, apoderado, cónyuge)
   - Una misma persona puede tener múltiples cuentas (distintos bancos, monedas)
   - Múltiples proveedores/clientes pueden cobrar en cuentas de la misma persona

3. **Que sea opcional**: no todos los beneficiarios tienen cuentas bancarias (algunos cobran efectivo en caja, otros con cheque).

---

## 2. Decisión de arquitectura: Modelo HÍBRIDO

### Arquitectura aprobada por Gabriel

**Dos niveles separados:**

1. **DUEÑO de la cuenta:** `Persona` (identidad física/jurídica que figura como titular en el banco)
2. **USO por rol:** `Proveedor/Cliente/Funcionario` referencian opcionalmente cuentas preferidas/default de cobro

**Por qué híbrido (no solo entidad ni solo persona):**

- **Por qué NO solo Proveedor/Cliente/Funcionario:**
  - Un proveedor puede cobrar en cuenta de otra persona (dueño, apoderado, cónyuge)
  - Múltiples proveedores distintos pueden cobrar en la MISMA cuenta (ej. matriz/sucursales, familia)
  - Proveedores sin `persona_id` quedarían excluidos (relación opcional)

- **Por qué NO solo Persona:**
  - Una persona puede tener múltiples cuentas (USD, PYG, distintos bancos)
  - Necesitamos marcar cuál es la cuenta **preferida para cada rol** (ej. LA FAMILIA cobra por defecto en cuenta X, pero tiene otra en USD)
  - Los flujos de pago trabajan con roles de negocio (proveedor), no identidades directas

**Beneficios del híbrido:**

- **Normalización:** Elvia Ruiz Diaz se registra UNA vez como `Persona`, sus cuentas una vez, y N proveedores pueden referenciarlas
- **Flexibilidad:** Un proveedor puede elegir cuenta default distinta sin duplicar datos de la persona
- **Trazabilidad:** Al pagar, sabemos a QUÉ persona real va el dinero (titular de la cuenta) y BAJO QUÉ rol (proveedor X)

---

## 3. Respuestas a las restricciones explícitas de Gabriel

### Restricción 1: ¿La cuenta se vincula a la *persona* o a otra entidad (proveedor/cliente/funcionario directo)?

**RESPUESTA: HÍBRIDO — la cuenta pertenece a PERSONA, el rol la REFERENCIA opcionalmente.**

**Justificación:**

- **Dueño real:** La cuenta bancaria es de una **persona** (física o jurídica) que figura como titular en el banco.
- **Uso operativo:** El **proveedor/cliente/funcionario** marca cuál(es) cuenta(s) de qué persona(s) usar para cobrar.
- **Evita duplicación:** "Elvia Ruiz Diaz" se carga una vez como `Persona`, sus dos cuentas (PYG, USD) se cargan una vez, y múltiples proveedores pueden referenciarlas.

**Implementación:**

Dos entidades:

1. **`CuentaBancariaDestino`** — pertenece a `Persona` (FK `persona_id` NOT NULL)
2. **Vínculo de uso desde roles:**
   - **Opción A:** Tabla intermedia `ProveedorCuentaBancaria` (M2M: un proveedor → N cuentas, una cuenta → N proveedores)
   - **Opción B:** FKs directas en `Proveedor/Cliente/Funcionario`: `cuenta_bancaria_default_id` (nullable)

**Decisión:** **Opción B (FKs directas)** es más simple para MVP. Si en el futuro se necesita M2M, se migra.

---

### Restricción 2: Debe ser *independiente del titular* (el nombre en el banco puede no coincidir 1:1 con la entidad)

**RESPUESTA: SÍ, el titular es la PERSONA dueña de la cuenta, INDEPENDIENTE de la razón social del proveedor.**

**Justificación:**

- Caso real: Proveedor "LA FAMILIA" (razón social) cobra en cuenta de "Elvia Ruiz Diaz" (persona, dueña).
- Un proveedor persona jurídica "ACME S.A." puede cobrar en cuenta de su apoderado "Juan Pérez".
- Un funcionario "María López" puede cobrar en cuenta de su cónyuge "Carlos Gómez" (con autorización firmada).

**Implementación:**

- `CuentaBancariaDestino.titular` se **deriva de `Persona.nombre` + `Persona.apellido`** (no es campo libre).
- La UI muestra prominentemente el titular (persona) al seleccionar cuenta destino de un proveedor.
- Si el proveedor necesita cobrar en cuenta de otra persona → se crea/vincula esa persona y su cuenta.

---

### Restricción 3: Debe ser *opcional* (no obligatorio cargar cuentas)

**RESPUESTA: SÍ, completamente opcional.**

**Justificación:**

- Proveedores que cobran efectivo en caja (pago consolidado con fuente `CAJA_MAYOR`, forma de pago `EFECTIVO`).
- Pagos con cheque (entrega física, no transferencia).
- Vales/adelantos que el funcionario retira en efectivo de caja.
- Gastos menores pagados en mano.

**Implementación:**

- `Proveedor/Cliente/Funcionario.cuenta_bancaria_default_id` es **nullable**.
- Al registrar un pago consolidado con `fuente=CUENTA_BANCARIA`, el handler **valida que exista cuenta destino para el beneficiario** (error temprano, transaccional).
- Si no hay cuenta bancaria registrada pero se intenta pagar vía transferencia → rechaza con mensaje claro: *"El proveedor X no tiene cuenta bancaria configurada. Creá una en su ficha o pagá con otra forma."*

---

## 4. Propuesta de modelo de datos (Modelo Híbrido)

### 4.1. Entidad nueva: `CuentaBancariaDestino`

**Propósito:** Información bancaria de una **persona física/jurídica** (no de la empresa) para recibir transferencias.

**Diferencia crítica con `CuentaBancaria`:**

| Aspecto | `CuentaBancaria` (empresa) | `CuentaBancariaDestino` (terceros) |
|---------|---------------------------|-----------------------------------|
| Dueño | Empresa (activo propio) | Persona externa |
| Saldo | SÍ (`saldo`, `saldoReservado`) | **NO** (solo info destino) |
| Uso | Caja mayor, POS, transferencias entre cuentas propias | Destino de pagos a proveedores/clientes/funcionarios |
| Movimientos | `MovimientoBancario` modifica saldo | Solo se referencia, nunca se actualiza saldo |

```typescript
@Entity('cuentas_bancarias_destino')
export class CuentaBancariaDestino extends BaseModel {
  // DUEÑO: Persona que figura como titular en el banco
  @ManyToOne(() => Persona, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'persona_id' })
  persona!: Persona;

  @Column({ type: 'int', name: 'persona_id' })
  personaId!: number;

  @Column({ type: 'varchar', length: 100 })
  banco!: string;

  @Column({ type: 'varchar', length: 50, name: 'numero_cuenta' })
  numeroCuenta!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  alias?: string;

  // TITULAR derivado de Persona (no campo libre) — READONLY en UI
  // IMPORTANTE: Distinto de CuentaBancaria.titular (empresa, string editable)
  // Se desnormaliza al guardar para consistencia con empresa
  @Column({ type: 'varchar', length: 200, name: 'titular' })
  titular!: string;  // Poblado automáticamente desde Persona

  @ManyToOne(() => Moneda, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({ type: 'int', name: 'moneda_id' })
  monedaId!: number;

  @Column({ 
    type: 'varchar', 
    length: 20, 
    name: 'tipo_cuenta', 
    enum: TipoCuentaBancaria, 
    default: TipoCuentaBancaria.CORRIENTE 
  })
  tipoCuenta!: TipoCuentaBancaria;

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'text', nullable: true })
  observacion?: string;
}
```

**Nota:** El campo `titular` NO se guarda explícitamente. Se deriva de `Persona` al leer. Si se necesita por performance, se desnormaliza en una migración posterior.

### 4.2. Modificación a entidades de rol: agregar FK a cuenta default

**`Proveedor`:**

```typescript
@Entity('proveedores')
export class Proveedor extends BaseModel {
  // ... campos existentes ...

  // Cuenta bancaria preferida para cobros a este proveedor
  @ManyToOne(() => CuentaBancariaDestino, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_bancaria_default_id' })
  cuentaBancariaDefault?: CuentaBancariaDestino;

  @Column({ type: 'int', name: 'cuenta_bancaria_default_id', nullable: true })
  cuentaBancariaDefaultId?: number;
}
```

**Idem para `Cliente` y `Funcionario`.**

**Ventaja de FK directa (vs tabla M2M):**
- Más simple para MVP (un rol → una cuenta default)
- Si se necesita M2M después (múltiples cuentas default por moneda/banco), se agrega tabla intermedia sin romper la FK existente

### 4.3. Validaciones y constraints

**A nivel entidad (backend handler):**

1. **`CuentaBancariaDestino.personaId` NOT NULL** — una cuenta SIEMPRE pertenece a una persona
2. **`Proveedor.cuentaBancariaDefaultId` debe apuntar a cuenta activa** (validar en handler)
3. **No se puede desactivar una cuenta si está marcada como default** en algún proveedor/cliente/funcionario ACTIVO (validar en `delete-cuenta-bancaria-destino`)

**Postgres (opcional, defensivo):**

```sql
-- En proveedores:
ALTER TABLE proveedores
ADD CONSTRAINT fk_proveedor_cuenta_default
FOREIGN KEY (cuenta_bancaria_default_id) 
REFERENCES cuentas_bancarias_destino(id)
ON DELETE SET NULL;

-- Idem clientes, funcionarios
```

**SQLite:** Sin FK enforcement. Validación solo en handlers.

### 4.4. Índices

```sql
CREATE INDEX idx_cta_dest_persona ON cuentas_bancarias_destino(persona_id);
CREATE INDEX idx_cta_dest_activo ON cuentas_bancarias_destino(activo);
CREATE INDEX idx_proveedor_cta_default ON proveedores(cuenta_bancaria_default_id) WHERE cuenta_bancaria_default_id IS NOT NULL;
CREATE INDEX idx_cliente_cta_default ON clientes(cuenta_bancaria_default_id) WHERE cuenta_bancaria_default_id IS NOT NULL;
CREATE INDEX idx_funcionario_cta_default ON funcionarios(cuenta_bancaria_default_id) WHERE cuenta_bancaria_default_id IS NOT NULL;
```

### 4.5. Migración

**IMPORTANTE:** Timestamp DEBE ser epoch-ms REAL (no redondeado). Generar con:
```bash
python3 -c "import time;print(int(time.time()*1000))"
```
**NUNCA usar números redondeados** (ej. `1737063600000`) — causan colisiones entre branches.

**Nombre:** `<TIMESTAMP_REAL>-CuentasBancariasDestinoHibrido.ts` (timestamp generado al crear archivo)

**up (driver-aware):**

1. Crear tabla `cuentas_bancarias_destino`:
   - Columnas: `persona_id` (NOT NULL), `banco`, `numero_cuenta`, `alias`, `moneda_id`, `tipo_cuenta`, `activo`, `observacion`
   - FK a `personas` y `monedas` (Postgres; sin FK en SQLite)
   - Índices

2. Agregar columnas a roles:
   ```sql
   ALTER TABLE proveedores ADD COLUMN cuenta_bancaria_default_id INTEGER NULL;
   ALTER TABLE clientes ADD COLUMN cuenta_bancaria_default_id INTEGER NULL;
   ALTER TABLE funcionarios ADD COLUMN cuenta_bancaria_default_id INTEGER NULL;
   ```

3. Agregar FKs a `cuentas_bancarias_destino` (solo Postgres):
   ```sql
   ALTER TABLE proveedores ADD CONSTRAINT fk_proveedor_cuenta_default ...;
   -- idem clientes, funcionarios
   ```

4. Índices en FKs de default

**down:**
- Drop FKs de roles
- Drop columnas `cuenta_bancaria_default_id` de roles
- Drop índices
- Drop tabla `cuentas_bancarias_destino`

**Datos iniciales:** NINGUNO. Es greenfield — no hay cuentas destino legacy.

---

## 5. Handlers IPC + Permisos

### 5.1. Handlers nuevos

**Archivo:** `electron/handlers/cuentas-bancarias-destino.handler.ts`

#### 5.1.1. CRUD de `CuentaBancariaDestino`

**`create-cuenta-bancaria-destino`**
- **Permiso:** `FINANCIERO_CTA_BANCARIA_DESTINO_CREAR`
- **Input:** `{ personaId, banco, numeroCuenta, alias?, monedaId, tipoCuenta?, observacion? }`
- **Validaciones:**
  - `personaId` debe existir y estar activo
  - `banco`, `numeroCuenta`, `monedaId` obligatorios
  - Strings a UPPERCASE (convención del sistema)
- **Output:** `CuentaBancariaDestino` creada
- `ensurePermission` primera línea

**`update-cuenta-bancaria-destino`**
- **Permiso:** `FINANCIERO_CTA_BANCARIA_DESTINO_ACTUALIZAR`
- **Validaciones:**
  - NO permite cambiar `personaId` una vez creada (inmutable)
- `ensurePermission` primera línea

**`delete-cuenta-bancaria-destino`** (soft delete)
- **Permiso:** `FINANCIERO_CTA_BANCARIA_DESTINO_ELIMINAR`
- **Validaciones:**
  - Si está referenciada como `cuenta_bancaria_default_id` en algún proveedor/cliente/funcionario ACTIVO → rechazar con mensaje: *"No se puede desactivar: está marcada como cuenta preferida de [PROVEEDOR X]. Desmarcá primero."*
  - Si está en `PagoConsolidadoDetalle.cuentaBancariaDestinoId` de pagos activos → permitir (datos históricos), pero advertir
- Setea `activo=false`
- `ensurePermission` primera línea

**`get-cuentas-bancarias-destino-by-persona`**
- **Lectura pública** (sin permiso)
- **DECISIÓN AUDIT A:** Consistente con mayoría de catálogos (ej. `get-producto`).
  Documentar en `domains/cuentas-bancarias.md` que es lectura pública por diseño.
  Path de evolución: agregar `FINANCIERO_CTA_BANCARIA_DESTINO_VER` en fase futura si se necesita restricción.
- **Input:** `{ personaId, incluirInactivas? }`
- **Output:** Array de cuentas de esa persona
- Útil para cargar dropdown al vincular proveedor → cuenta

**`get-cuenta-bancaria-destino`**
- **Lectura pública**
- **Input:** `{ id }`
- **Output:** Una cuenta con `persona` hidratada (para mostrar titular)

#### 5.1.2. Gestión de cuenta default en roles

**Estos handlers se agregan a los existentes de proveedor/cliente/funcionario:**

**En `proveedores.handler.ts` → `update-proveedor`:**
- Aceptar campo `cuentaBancariaDefaultId` (nullable)
- Validar que la cuenta exista, esté activa y pertenezca a una persona activa
- Permitir `null` (desmarcar default)

**Idem en `clientes.handler.ts` y `funcionarios.handler.ts`.**

**Nuevo handler helper compartido:**

```typescript
// electron/handlers/cuenta-destino-validacion.util.ts
export async function validarCuentaDestino(
  dataSource: DataSource,
  cuentaId: number | null,
  contexto: string
): Promise<void> {
  if (!cuentaId) return; // null = OK
  const cuenta = await dataSource.getRepository(CuentaBancariaDestino).findOne({
    where: { id: cuentaId },
    relations: ['persona']
  });
  if (!cuenta) throw new Error(`${contexto}: cuenta bancaria ${cuentaId} no encontrada`);
  if (!cuenta.activo) throw new Error(`${contexto}: la cuenta está desactivada`);
  if (!cuenta.persona?.activo) throw new Error(`${contexto}: la persona titular está desactivada`);
}
```

### 5.2. Modificaciones a handlers existentes

**`pago-consolidado.handler.ts` → `registrar-pago-consolidado`:**

Cuando una línea de pago tiene `fuente=CUENTA_BANCARIA`:

1. **Identificar beneficiario único:**
   - Por concepto: CPP → proveedor, CPC → cliente, liquidación/vale → funcionario
   - Validar que **todas las obligaciones del payload sean del mismo beneficiario** (ya existe `CONCEPTO_BENEFICIARIO_UNICO`)

2. **Resolver cuenta destino:**
   - Cargar `beneficiario.cuentaBancariaDefault` (con `persona` hidratada)
   - Si `cuentaBancariaDefaultId` es null → error: *"El proveedor X no tiene cuenta bancaria configurada. Agregá una en su ficha o pagá con otra forma."*
   - Si la cuenta está desactivada o su persona desactivada → error con detalle

3. **Agregar campo al payload:**
   - `LineaPayload` gana campo opcional `cuentaBancariaDestinoId`
   - En MVP, se **deriva automáticamente** del beneficiario (no lo elige el usuario)
   - Fase 2: si beneficiario tiene múltiples cuentas, permitir selección manual

4. **Registrar en `PagoConsolidadoDetalle`:**
   - Agregar columna `cuenta_bancaria_destino_id` (FK opcional)
   - Persistir en cada detalle de la línea bancaria

5. **Descripción de movimiento bancario:**
   - Antes: *"PAGO CONSOLIDADO #123 DE 3 GASTOS"*
   - Ahora: *"TRANSF. A [NOMBRE PERSONA] ([BANCO] [NRO]) - PAGO #123"*
   - Ejemplo: *"TRANSF. A ELVIA RUIZ DIAZ (BNF 019-00-1921585) - PAGO CONSOLIDADO #123"*

**Entidad `PagoConsolidadoDetalle` gana columna:**

```typescript
@ManyToOne(() => CuentaBancariaDestino, { nullable: true, createForeignKeyConstraints: false })
@JoinColumn({ name: 'cuenta_bancaria_destino_id' })
cuentaBancariaDestino?: CuentaBancariaDestino;

@Column({ type: 'int', name: 'cuenta_bancaria_destino_id', nullable: true })
cuentaBancariaDestinoId?: number;
```

**Migración aparte:** `<TIMESTAMP_REAL>-PagoConsolidadoDetalleCuentaDestino.ts` — agrega columna + índice.

**HALLAZGO AUDIT B #4:** Entidad `MovimientoBancario` también debe ganar columna FK:

```typescript
@ManyToOne(() => CuentaBancariaDestino, { nullable: true, createForeignKeyConstraints: false })
@JoinColumn({ name: 'cuenta_bancaria_destino_id' })
cuentaBancariaDestino?: CuentaBancariaDestino;

@Column({ type: 'int', name: 'cuenta_bancaria_destino_id', nullable: true })
cuentaBancariaDestinoId?: number;
```

**Justificación:**
- Solo enriquecer `observacion` (string) no es queryable para match de comprobantes
- FK permite búsquedas eficientes de movimientos por cuenta destino
- Descripción enriquecida se mantiene para legibilidad humana
- Índice: `idx_mov_bancario_destino ON movimientos_bancarios(cuenta_bancaria_destino_id)`

**Migración aparte:** `<TIMESTAMP_REAL>-MovimientoBancarioCuentaDestino.ts` — agrega columna + índice.

### 5.3. Permisos nuevos

Registrar en `SEED_PERMISOS` (`permissions.handler.ts`):

```typescript
{ 
  codigo: 'FINANCIERO_CTA_BANCARIA_DESTINO_CREAR', 
  nombre: 'Crear cuenta bancaria destino', 
  seccion: 'FINANCIERO' 
},
{ 
  codigo: 'FINANCIERO_CTA_BANCARIA_DESTINO_ACTUALIZAR', 
  nombre: 'Actualizar cuenta bancaria destino', 
  seccion: 'FINANCIERO' 
},
{ 
  codigo: 'FINANCIERO_CTA_BANCARIA_DESTINO_ELIMINAR', 
  nombre: 'Eliminar cuenta bancaria destino', 
  seccion: 'FINANCIERO' 
},
```

**Asignación a roles plantilla:**

- **GERENTE/ADMIN:** los 3 permisos
- **CAJERO/MOZO:** ninguno (no gestionan proveedores/funcionarios)

---

## 6. UI Desktop + Mobile

### 6.1. Desktop (Angular)

#### 6.1.1. Nuevo componente compartido: `selector-cuenta-destino.component`

**Ubicación:** `src/app/shared/components/selector-cuenta-destino/`

**Propósito:** Dropdown reutilizable para elegir cuenta bancaria destino de una persona.

**Inputs:**
- `personaId: number` (obligatorio)
- `cuentaSeleccionadaId?: number` (para preseleccionar)
- `placeholder?: string`

**Output:**
- `cuentaChange: EventEmitter<CuentaBancariaDestino | null>`

**Funcionamiento:**
1. Al recibir `personaId`, llama `get-cuentas-bancarias-destino-by-persona`
2. Muestra dropdown: `{{ cuenta.banco }} - {{ cuenta.numeroCuenta }} ({{ cuenta.moneda.simbolo }}) [{{ cuenta.alias }}]`
3. Si solo hay una cuenta activa → autoselecciona
4. Si hay cero → muestra mensaje: *"Esta persona no tiene cuentas bancarias. Agregá una en Personas → [NOMBRE]."*

#### 6.1.2. Nuevo diálogo: `create-edit-cuenta-destino-dialog.component`

**Ubicación:** `src/app/shared/dialogs/cuenta-destino/`

**Modo:** Crear / Editar

**Inputs:**
- `personaId: number` (obligatorio en modo crear)
- `cuentaId?: number` (si edición)

**Formulario (Reactive Forms):**
- **Titular (readonly, derivado):** Muestra `${persona.nombre} ${persona.apellido}` en chip destacado
- Banco (text, obligatorio)
- Número de cuenta (text, obligatorio)
- Tipo de cuenta (dropdown: CORRIENTE / AHORRO / CAJA)
- Alias (text opcional) — ej. "Cuenta LA FAMILIA", "Cuenta USD exportación"
- Moneda (dropdown, obligatorio)
- Observación (textarea opcional)

**Validaciones:**
- Todos los campos obligatorios
- Strings a UPPERCASE al guardar (banco, numeroCuenta, alias)
- Titular NO es editable (se deriva de persona)

**Botón secundario:**
- "Editar persona" → abre `create-edit-persona-dialog` en modo edición (por si el nombre está mal)

#### 6.1.3. Integración en fichas de roles existentes

**`create-edit-proveedor.component`:**

Agregar sección dentro del mat-tab "Datos Generales" (o tab aparte si hay espacio):

**Subsección "Cuenta bancaria de cobro":**

```
┌─────────────────────────────────────────────┐
│ 👤 Persona vinculada: [Elvia Ruiz Diaz]   │
│    (de la relación proveedor.persona)       │
│                                             │
│ 💳 Cuenta preferida para cobros:           │
│    [Dropdown selector-cuenta-destino]      │
│    Muestra cuentas de la persona vinculada │
│                                             │
│    [Botón: Nueva cuenta para esta persona] │
│    [Botón: Ver todas las cuentas]          │
└─────────────────────────────────────────────┘
```

**Flujo:**
1. Si `proveedor.persona` es null → mensaje: *"Vinculá una persona primero para asignar cuenta bancaria."* + botón para abrir selector de persona
2. Si `proveedor.persona` existe:
   - Cargar cuentas de esa persona con `get-cuentas-bancarias-destino-by-persona`
   - Dropdown con `<app-selector-cuenta-destino [personaId]="proveedor.personaId">`
   - Pre-seleccionar `proveedor.cuentaBancariaDefaultId` si existe
   - Botón "Nueva cuenta" → abre `create-edit-cuenta-destino-dialog` con `personaId` prestablecido

**Al guardar proveedor:**
- Enviar `cuentaBancariaDefaultId` seleccionada (o null) en el payload
- Handler valida que la cuenta exista y esté activa

**`create-edit-cliente.component`** y **`create-edit-funcionario.component`:**

Idem, misma estructura.

**Nota:** Si el rol NO tiene persona vinculada, la UI debe permitir:
1. Crear persona nueva en línea (quick-create)
2. O vincular persona existente
3. O dejar sin cuenta (opcional)

#### 6.1.4. Nuevo listado: `list-cuentas-persona-dialog.component`

**Propósito:** Ver todas las cuentas bancarias de una persona (lectura + CRUD).

**Inputs:**
- `personaId: number`

**Layout:**

```
┌──────────────────────────────────────────────────────┐
│ Cuentas bancarias de [NOMBRE PERSONA]              │
│                                                      │
│ [Botón: Nueva cuenta]                                │
│                                                      │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Banco | Número | Alias | Moneda | Tipo | Activo │ │
│ │ BNF   | 019... | LA... | PYG    | CTE  | ✅      │ │
│ │ Acciones: Editar / Desactivar                    │ │
│ └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Acciones por fila (mat-menu):**
- Editar (requiere `FINANCIERO_CTA_BANCARIA_DESTINO_ACTUALIZAR`)
- Desactivar/Activar (requiere `ELIMINAR`)
- Ver usos (dónde está marcada como default)

#### 6.1.5. Modificar diálogo de pago consolidado

**`pagar-obligaciones-dialog.component`:**

**Fase 1 (MVP):** Sin selector manual. La cuenta destino se **deriva automáticamente** del beneficiario.

**Confirmación final enriquecida:**

```
╔════════════════════════════════════════════════╗
║ PAGAR 3 GASTOS A PROVEEDOR "LA FAMILIA"       ║
╠════════════════════════════════════════════════╣
║ Monto total: Gs 1.500.000                      ║
║                                                 ║
║ Formas de pago:                                 ║
║   💵 Gs 500.000 desde Caja Mayor (efectivo)    ║
║   🏦 Gs 1.000.000 desde Cuenta BNF 123-456     ║
║                                                 ║
║ ┌──────────────────────────────────────────┐  ║
║ │ 📤 DESTINO DE TRANSFERENCIA:             │  ║
║ │                                            │  ║
║ │ 👤 Titular: ELVIA RUIZ DIAZ               │  ║
║ │ 🏦 Banco: BNF                             │  ║
║ │ 💳 Cuenta: 019-00-1921585                 │  ║
║ │ 💰 Moneda: PYG - Corriente                │  ║
║ │ 🔖 Alias: Cuenta LA FAMILIA               │  ║
║ └──────────────────────────────────────────┘  ║
║                                                 ║
║ ¿Confirmar pago?                                ║
║ [Cancelar] [Confirmar]                          ║
╚════════════════════════════════════════════════╝
```

**Fase 2 (futura):** Si el beneficiario tiene múltiples cuentas, agregar selector manual arriba del resumen.

### 6.2. Mobile (PWA)

**Alcance Fase 1:** **SOLO lectura** (consistente con alcance administrativo actual).

**Pantallas afectadas:**

**Proveedor/Cliente/Funcionario detalle:**

Agregar sección:

```
┌────────────────────────────────────┐
│ 💳 Cuenta de cobro preferida       │
│                                    │
│ [Card]                             │
│   👤 Titular: ELVIA RUIZ DIAZ     │
│   🏦 Banco: BNF                   │
│   💳 Cuenta: 019-00-1921585       │
│   💰 Moneda: PYG - Corriente      │
│   🔖 Alias: Cuenta LA FAMILIA     │
│   [Chip: ACTIVA]                   │
│                                    │
│ [Botón: Ver todas las cuentas]    │
│ (abre modal con lista read-only)  │
└────────────────────────────────────┘
```

**Persona detalle (nueva pantalla o expandir existente):**

Lista read-only de cuentas bancarias de esa persona:

```
🏦 Cuentas bancarias

[Card por cada cuenta]
  Banco: BNF
  Número: 019-00-1921585
  Tipo: Corriente
  Moneda: PYG
  Alias: Cuenta LA FAMILIA
  [Chip: ACTIVA]

  Usada por:
  - Proveedor: LA FAMILIA (default)
  - Proveedor: DISTRIBUIDORA X
```

**Creación/edición:** NO en Fase 1. Mensaje: *"Para agregar o editar cuentas bancarias, usá la versión desktop."*

---

## 7. Impacto en Pago Consolidado / Transferencias / Match de Comprobantes

### 7.1. Pago consolidado

**Antes:**
- Línea con `fuente=CUENTA_BANCARIA` solo indicaba origen de fondos (nuestra cuenta)
- No sabíamos A QUIÉN transferir (destino faltaba)

**Después (modelo híbrido):**
- Línea con `fuente=CUENTA_BANCARIA` resuelve destino desde `beneficiario.cuentaBancariaDefault`
- `PagoConsolidadoDetalle` persiste `cuenta_bancaria_destino_id` → FK a `CuentaBancariaDestino` → FK a `Persona`
- El movimiento bancario (`MovimientoBancario`) describe destino completo: titular (persona), banco, cuenta

**Flujo completo:**

1. Usuario selecciona obligaciones de UN proveedor (ej. 3 gastos)
2. Agrega línea: *"Gs 500.000 desde cuenta BNF 123-456"*
3. Sistema resuelve:
   - Beneficiario = proveedor de los gastos
   - Cuenta destino = `proveedor.cuentaBancariaDefault` (hidrata `persona`)
   - Si null → error temprano: *"Proveedor sin cuenta configurada"*
4. Usuario confirma (ve datos de destino en modal)
5. Al confirmar:
   - `PagoConsolidado` con N `PagoConsolidadoDetalle`
   - Cada detalle con línea bancaria lleva `cuenta_bancaria_destino_id`
   - Se crea `MovimientoBancario` con descripción: *"TRANSF. A ELVIA RUIZ DIAZ (BNF 019-00-1921585) - PAGO CONSOLIDADO #123"*
   - Saldo de nuestra cuenta disminuye (egreso)
   - **NO se toca saldo de la cuenta destino** (es de tercero, no la controlamos)

### 7.2. Transferencias internas (NO afectadas)

Las transferencias entre cuentas propias de la empresa usan `OperacionFinanciera` con `tipo=TRANSFERENCIA_BANCARIA`, que mueve fondos entre dos `CuentaBancaria` (ambas CON saldo).

`CuentaBancariaDestino` NO participa en este flujo. Son mundos separados:
- `CuentaBancaria` = empresa, con saldo, para caja mayor y movimientos internos
- `CuentaBancariaDestino` = terceros, sin saldo, solo info de destino de pagos

**Separación en código:**
- Handlers de `OperacionFinanciera` NO tocan `CuentaBancariaDestino`
- Handlers de pago consolidado NO tocan `CuentaBancaria` como destino (solo como origen)

### 7.3. Match de comprobantes bancarios

**Caso de uso:** Don Franco importa extracto bancario (CSV/PDF):

```
Fecha       | Concepto                    | Débito      | Crédito
2026-09-15  | TRANSFER. A 019-00-1921585  | 1.000.000   | -
```

**Match manual/automático (Fase 5 futura):**

1. Módulo Bancos → Conciliación (a implementar)
2. Buscar `MovimientoBancario` por:
   - Fecha ± 2 días
   - Monto exacto
   - Cuenta origen = nuestra
   - Número de cuenta destino en descripción (regex o campo dedicado)
3. **Presentar:**
   ```
   Movimiento encontrado:
   PAGO CONSOLIDADO #123
   Destino: ELVIA RUIZ DIAZ (BNF 019-00-1921585)
   Beneficiario: Proveedor LA FAMILIA
   ```
4. Usuario confirma match → marca movimiento como conciliado

**Este plan NO implementa conciliación**, solo garantiza que el dato esté persistido para cuando se implemente.

### 7.4. Reportes de pagos

**Dashboard Financiero → "Pagos a Proveedores":**

Agregar columnas: **Titular Destino** | **Cuenta Destino**

```sql
SELECT 
  pc.id,
  pc.fecha,
  pc.descripcion,
  pc.monto_total,
  STRING_AGG(DISTINCT p.nombre || ' ' || COALESCE(p.apellido, ''), '; ') as titulares_destino,
  STRING_AGG(DISTINCT cbd.banco || ' - ' || cbd.numero_cuenta, '; ') as cuentas_destino
FROM pagos_consolidados pc
LEFT JOIN pagos_consolidados_detalles pcd ON pcd.pago_consolidado_id = pc.id
LEFT JOIN cuentas_bancarias_destino cbd ON cbd.id = pcd.cuenta_bancaria_destino_id
LEFT JOIN personas p ON p.id = cbd.persona_id
WHERE pc.concepto = 'COMPRA'
GROUP BY pc.id
ORDER BY pc.fecha DESC
```

**Reporte de pagos por persona:**

Nuevo reporte: *"¿Cuánto pagamos a Elvia Ruiz Diaz?"* (independiente del proveedor).

Útil cuando una misma persona cobra por múltiples proveedores.

---

## 8. Migración desde el diseño actual

### 8.1. Estado greenfield (confirmado por Gabriel)

**NO hay datos legacy que migrar:**
- Ningún proveedor/cliente/funcionario tiene cuenta bancaria configurada
- `CuentaBancaria` existentes son **solo de la empresa** (caja mayor, POS)
- `Funcionario.cuentaBancariaPropia` (string libre) está vacío o con datos obsoletos

**Decisión:** Fase 1 sin migración automática. Los usuarios cargan cuentas a medida que las necesitan.

### 8.2. Script opcional de ayuda (Fase 2)

Si en el futuro se quiere ayudar a cargar datos legacy:

**Script manual (`scripts/migrar-cuentas-funcionarios.ts`):**

1. Parsear `Funcionario.cuentaBancariaPropia` (formato libre) con regex: banco + número
2. Si el funcionario tiene `persona_id`:
   - Crear borrador de `CuentaBancariaDestino` (titular = persona vinculada)
   - Marcar como `activo=false` inicialmente
3. Generar CSV para revisión:
   ```csv
   FuncionarioID,PersonaID,BancoParsed,NumeroParsed,CuentaPropia,AccionSugerida
   123,456,BNF,019-123456,"BNF 019-123456",CREAR
   124,NULL,,,,"VINCULAR_PERSONA_PRIMERO"
   ```
4. RRHH revisa, corrige y activa las correctas manualmente

**NO automatizar** — riesgo de datos incorrectos persistidos.

### 8.3. Compatibilidad con SQLite

**Diferencias driver:**

1. **FKs:** Postgres las enforza, SQLite no (config `createForeignKeyConstraints: false`). Validar en handlers.
2. **Agregación `STRING_AGG`:** Postgres. En SQLite usar `GROUP_CONCAT`.
3. **Tipos:** `NUMERIC(18,2)` en Postgres, `REAL` en SQLite (migrations driver-aware).
4. **Constraint CHECK:** No en SQLite. Validar en handler.

**Baseline dual:** Ya existe patrón en el proyecto (migrations con `queryRunner.connection.options.type === 'postgres'`).

---

## 9. Fases sugeridas

### Fase 1: Fundamentos (MVP) — Proveedores únicamente
**Alcance:**

- Entidad `CuentaBancariaDestino` (FK a `Persona`, titular desnormalizado) + migración dual
- Columna `cuenta_bancaria_default_id` en `Proveedor` + migración
- Columna `cuenta_bancaria_destino_id` en `PagoConsolidadoDetalle` + migración
- Columna `cuenta_bancaria_destino_id` en `MovimientoBancario` + migración (AUDIT B #4)
- Handlers CRUD + permisos (3 nuevos, seed)
- Modificar `update-proveedor` para aceptar `cuentaBancariaDefaultId`
- Modificar `registrar-pago-consolidado` para resolver destino y validar
- UI desktop:
  - Componente `selector-cuenta-destino`
  - Diálogo `create-edit-cuenta-destino` (titular readonly, derivado de Persona)
  - Diálogo `list-cuentas-persona`
  - Integración en `create-edit-proveedor` (subsección cuenta de cobro + badge si falta persona)
  - Confirmación enriquecida en `pagar-obligaciones-dialog`
- Mobile: Solo lectura (mostrar cuenta default en proveedor detalle)
- Descripción enriquecida en `MovimientoBancario` + FK `cuenta_bancaria_destino_id`
- **Query diagnóstico documentado** para proveedores sin persona (ver Riesgo 1)

**Entregables:**
- Migraciones OK en ambos drivers (4 migraciones: entidad + 3 FKs con timestamp REAL)
- Tests: `npm run test:cuenta-destino-hibrido` (mínimo 20 asserts):
  - Crear cuenta para persona (titular se deriva)
  - Vincular cuenta a proveedor como default
  - Pago consolidado con validación de destino
  - Desactivar cuenta rechaza si es default de proveedor activo
  - Titular se deriva de persona (readonly en UI)
  - UPPERCASE aplicado
  - MovimientoBancario persiste FK cuenta_bancaria_destino_id
- Manual: `docs/testing/TESTING-CHECKLIST-CUENTAS-DESTINO.md`
- Actualizar docs:
  - `reference/entities-index.md` (agregar `CuentaBancariaDestino`)
  - `reference/handlers-index.md` (agregar 5 handlers)
  - `domains/financiero-caja-mayor.md` (sección pago consolidado + destinos)
  - `domains/compras-cpp.md` (mencionar cuentas destino)
  - **OBLIGATORIO ANTES DE MERGE:** Nuevo `domains/cuentas-bancarias.md` (AUDIT A #1):
    - Diferencia CRÍTICA empresa vs destino (tabla comparativa)
    - Titular: empresa=string libre editable, destino=derivado Persona readonly
    - Lectura pública sin permiso: diseño documentado (AUDIT A #2)
    - Comentarios en entidades: `// EMPRESA (activo con saldo)` vs `// DESTINO terceros (sin saldo)`

### Fase 2: Expansión a Funcionarios
**Alcance:**

- Columna `cuenta_bancaria_default_id` en `Funcionario`
- Modificar `update-funcionario`
- UI desktop: tab en funcionario
- Integración en pago consolidado (liquidaciones de sueldo + vales)
- Script opcional de ayuda (parseo de `cuentaBancariaPropia` → CSV para revisión)

### Fase 3: Expansión a Clientes
**Alcance:**

- Columna `cuenta_bancaria_default_id` en `Cliente`
- Modificar `update-cliente`
- UI desktop: tab en cliente
- Integración en **cobro consolidado** de CPC (sentido inverso: ingreso)
- Dashboard CPC: mostrar cuenta desde la que el cliente suele pagar

### Fase 4: Múltiples cuentas default por rol (M2M)
**Alcance:**

Si se necesita que un proveedor tenga cuentas default DISTINTAS por moneda (ej. PYG → cuenta A, USD → cuenta B):

- Tabla intermedia `ProveedorCuentaBancaria` (M2M)
- Campo `es_default_para_moneda_id` en la relación
- Modificar selector de cuenta destino en pago consolidado (elegir por moneda de la línea)
- Migrar FKs directas existentes a la tabla intermedia

### Fase 5: Mobile CRUD
**Alcance:**

- Formulario mobile para agregar/editar cuentas destino
- Vincular cuenta default desde mobile
- Sincronización offline (si aplica)

### Fase 6: Conciliación bancaria (Futura)
**Alcance:**

- Importador de extractos bancarios (CSV/OFX/PDF)
- Motor de match por fecha+monto+cuenta destino
- UI de conciliación con sugerencias

---

## 10. Riesgos y mitigaciones

### Riesgo 1: Proveedor sin persona vinculada
**Descripción:** Usuario intenta pagar con transferencia a un proveedor que NO tiene `persona_id`.

**Impacto:** No se puede derivar cuenta destino → error.

**HALLAZGO AUDIT B:** `Proveedor.persona` es nullable en código real. Diagnóstico previo OBLIGATORIO.

**Mitigación:**
- **ANTES de Fase 1:** Ejecutar query diagnóstico documentado:
  ```sql
  SELECT COUNT(*) FROM proveedores WHERE activo = 1 AND persona_id IS NULL;
  ```
- En `registrar-pago-consolidado`: cuenta destino es **opcional**. Si línea es bancaria y hay persona+cuenta default válida → adjuntar `cuentaBancariaDestinoId`. Si falta persona/cuenta → warn y el pago continúa (Gabriel 2026-09-18).
- UI de proveedor: mostrar prominentemente si falta persona (badge ROJO: "SIN PERSONA VINCULADA")
- Si diagnóstico revela >10% proveedores sin persona: agregar handler `vincular-persona-a-proveedor` (quick-create) en Fase 1

### Riesgo 2: Desactivar persona desactiva sus cuentas implícitamente
**Descripción:** Usuario desactiva `Persona` → sus cuentas quedan "huérfanas" (activas pero con persona inactiva).

**Impacto:** Validaciones de cuenta destino fallan.

**Mitigación:**
- En handler `update-persona`, si `activo` pasa a `false`:
  - Advertir: *"Esta persona tiene N cuentas bancarias. ¿Desactivarlas también?"*
  - Opción 1: Desactivar automáticamente todas sus cuentas
  - Opción 2: Dejar activas pero validar en pago consolidado (rechazar si persona inactiva)
- **Decisión MVP:** Validar en pago consolidado (rechazar cuenta con persona inactiva). Desactivación en cascada queda para Fase 2.

### Riesgo 3: Beneficiario cambia de cuenta después de pago registrado
**Descripción:** Proveedor cambia `cuentaBancariaDefaultId` o desactiva la cuenta que se usó en pagos históricos.

**Impacto:** `PagoConsolidadoDetalle.cuenta_bancaria_destino_id` apunta a registro desactivado o cambiado.

**Mitigación:**
- Soft delete (`activo=false`), nunca hard delete
- UI de detalle de pago consolidado muestra datos históricos (snapshot inmutable):
  - Si `cuentaBancariaDestinoId` es null → *"(sin destino registrado)"* (pagos legacy)
  - Si cuenta fue desactivada → mostrar igual con badge *"[DESACTIVADA]"*
  - Join LEFT opcional, graceful si fue eliminada físicamente

### Riesgo 4: Duplicación de personas
**Descripción:** Usuario crea "Elvia Ruiz Diaz" dos veces (typos, espacios extra) → dos personas, dos conjuntos de cuentas.

**Impacto:** Confusión, pagos van a persona equivocada.

**Mitigación:**
- Validación en `create-persona`: buscar similares por nombre+documento
- Sugerencia: *"Ya existe 'ELVIA RUIZ DIAS'. ¿Es la misma persona?"* (fuzzy match, Fase 2)
- Herramienta de merge de personas duplicadas (Fase 3)

### Riesgo 5: Concurrencia al cambiar cuenta default
**Descripción:** Dos usuarios cambian `cuentaBancariaDefaultId` del mismo proveedor simultáneamente.

**Impacto:** Última escritura gana (last-write-wins), no hay inconsistencia pero puede sorprender.

**Mitigación:**
- Aceptable en MVP (optimistic locking implícito)
- Si se vuelve problema: agregar `version` en `Proveedor` (optimistic locking explícito, TypeORM `@VersionColumn`)

### Riesgo 6: Confusión empresa vs destino
**Descripción:** Usuario intenta usar `CuentaBancaria` (empresa) como destino, o viceversa.

**Impacto:** Error de tipos, FK inválida.

**Mitigación:**
- **Nomenclatura clara:**
  - `CuentaBancaria` → renombrar a `CuentaBancariaEmpresa` (breaking change, Fase futura)
  - `CuentaBancariaDestino` → mantener nombre explícito
- UI separada: módulo "Bancos / Cuentas propias" vs "Personas / Cuentas de terceros"
- Documentación explícita en skill y comments de código

---

## 11. Fuera de alcance (NO en este plan)

### Excluido explícitamente:

1. **Transferencias automáticas bancarias:** NO se ejecutan transferencias reales vía API bancaria. Solo se registra el mandato con datos completos.

2. **Conciliación bancaria:** Match automático de comprobantes queda para Fase 6.

3. **Validación real de cuenta:** NO se valida con API del banco si la cuenta existe/está activa. Responsabilidad del usuario.

4. **CBU/IBAN/SWIFT:** Campos opcionales para Paraguay. Si se expande a otros países, agregar en Fase N.

5. **Workflow de aprobación de cuenta nueva:** En Fase 1, cualquier usuario con permiso puede crear. Aprobación de Gerencia → Fase N.

6. **Notificaciones al beneficiario:** El sistema NO notifica a la persona cuando se le asigna una cuenta o se le paga.

7. **Múltiples cuentas default por moneda:** Fase 4 (tabla M2M).

8. **Merge de personas duplicadas:** Fase 3.

9. **Cambio de titular de cuenta:** Si el titular cambia, crear cuenta nueva y desactivar la vieja (inmutabilidad histórica).

10. **Saldo de cuenta destino:** NUNCA. `CuentaBancariaDestino` NO tiene saldo ni movimientos. Es solo información de destino.

---

## 12. Documentación a actualizar

### Skill (`.claude/skills/frc-gourmet-expert/`)

- **`domains/financiero-caja-mayor.md`:**
  - Sección "Pago consolidado" → agregar "Cuentas destino de transferencias (modelo híbrido)"
  - Explicar resolución de destino desde `beneficiario.cuentaBancariaDefault`

- **`domains/compras-cpp.md`:**
  - Mencionar cuentas destino al pagar CPP de compras

- **`domains/rrhh-liquidaciones.md`:**
  - Mencionar cuentas destino al pagar liquidaciones/vales (Fase 2)

### Reference

- **`reference/entities-index.md`:**
  - Agregar `CuentaBancariaDestino` en dominio `financiero/` con nota: *"(terceros, sin saldo; distinta de `CuentaBancaria` empresa)"*

- **`reference/handlers-index.md`:**
  - Agregar handlers:
    - `create-cuenta-bancaria-destino`
    - `update-cuenta-bancaria-destino`
    - `delete-cuenta-bancaria-destino`
    - `get-cuentas-bancarias-destino-by-persona`
    - `get-cuenta-bancaria-destino`

### Nuevo documento

- **`domains/cuentas-bancarias.md`:**
  - Doc dedicado explicando:
    - **Diferencia crítica:** `CuentaBancaria` (empresa, con saldo) vs `CuentaBancariaDestino` (terceros, sin saldo)
    - **Modelo híbrido:** Cuenta pertenece a `Persona`, roles la referencian
    - **Flujos:** Cómo se usa en pago consolidado, caja mayor, transferencias internas, reportes
    - **Cuándo usar cuál**

---

## 13. Resumen ejecutivo para Gabriel (Modelo Híbrido)

### Decisión arquitectónica: HÍBRIDO aprobado 2026-09-16

**Dos niveles:**
1. **Cuenta pertenece a PERSONA** (`CuentaBancariaDestino.persona_id` NOT NULL)
2. **Rol la referencia opcionalmente** (`Proveedor.cuenta_bancaria_default_id` nullable)

### Respuestas cortas a las 3 preguntas:

1. **¿Persona o entidad?** → **HÍBRIDO:** cuenta de Persona, usada por roles.

2. **¿Independiente del titular?** → **SÍ:** titular = persona dueña de la cuenta, independiente de razón social del proveedor.

3. **¿Opcional?** → **SÍ:** `cuentaBancariaDefaultId` es nullable. Solo se valida al elegir transferencia bancaria.

### Modelo de datos resumido:

```
Persona (ej. "Elvia Ruiz Diaz")
  └─ CuentaBancariaDestino[] (1 a N cuentas)
       ├─ BNF 019-00-1921585 (PYG)
       └─ Banco Continental 567... (USD)

Proveedor (ej. "LA FAMILIA")
  ├─ persona_id → Persona "Elvia Ruiz Diaz"
  └─ cuenta_bancaria_default_id → CuentaBancariaDestino BNF 019...

Cliente / Funcionario → idem
```

### Separación dura empresa vs terceros:

| Aspecto | `CuentaBancaria` | `CuentaBancariaDestino` |
|---------|------------------|-------------------------|
| Dueño | Empresa | Persona (tercero) |
| Saldo | **SÍ** | **NO** |
| Uso | Caja mayor, POS, transf. internas | Destino de pagos a proveedores/clientes/funcionarios |

### Flujo de pago consolidado:

1. Usuario paga 3 gastos al proveedor "LA FAMILIA"
2. Línea: *"Gs 500.000 desde cuenta BNF 123-456"* (origen)
3. Sistema resuelve:
   - Destino = `proveedor.cuentaBancariaDefault`
   - Titular = `cuenta.persona` ("Elvia Ruiz Diaz")
4. Registra:
   - `PagoConsolidadoDetalle.cuenta_bancaria_destino_id`
   - `MovimientoBancario` con descripción: *"TRANSF. A ELVIA RUIZ DIAZ (BNF 019-00-1921585) - PAGO #123"*

### Fases:

1. **MVP:** Proveedores únicamente
2. Funcionarios (liquidaciones/vales)
3. Clientes (cobro consolidado CPC)
4. M2M (múltiples cuentas default por moneda)
5. Mobile CRUD
6. Conciliación bancaria

### Top riesgos:

1. Proveedor sin persona vinculada → error temprano con mensaje claro
2. Desactivar persona → validar cuenta con persona inactiva en pago
3. Confusión empresa vs destino → nomenclatura clara + docs

### Estado greenfield (confirmado):

- **NO hay migración** de datos legacy
- Ningún proveedor/cliente/funcionario tiene cuenta configurada
- `CuentaBancaria` existentes son SOLO de la empresa

---

## 14. Próximos pasos

- [ ] Revisar plan híbrido con Don Franco (validar caso de uso real)
- [ ] Aprobar Fase 1 (MVP proveedores)
- [ ] Decidir si expandir a funcionarios desde el inicio o mantener solo proveedores
- [ ] Asignar implementación

---

**Este PR contiene SOLO el análisis del modelo híbrido. Sin código de implementación.**

**Fin del plan.**
