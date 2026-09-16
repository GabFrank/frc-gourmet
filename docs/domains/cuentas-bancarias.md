# Dominio: Cuentas Bancarias (Empresa vs Destino)

**Fecha:** 2026-09-16  
**Fase:** 1 MVP (Proveedores)  
**Modelo:** HÍBRIDO (cuenta pertenece a Persona, rol la referencia)

---

## 1. Resumen ejecutivo

FRC Gourmet maneja **DOS tipos de cuentas bancarias separadas**:

1. **`CuentaBancaria` (EMPRESA)** — Activos con saldo propios de la empresa
2. **`CuentaBancariaDestino` (TERCEROS)** — Información de cobro sin saldo

**Diferencia crítica:**

| Aspecto | `CuentaBancaria` | `CuentaBancariaDestino` |
|---------|------------------|-------------------------|
| **Dueño** | Empresa (activo propio) | Persona externa (tercero) |
| **Saldo** | **SÍ** (`saldo`, `saldoReservado`) | **NO** (solo info destino) |
| **Uso** | Caja mayor, POS, transferencias internas | Destino de pagos a proveedores/clientes/funcionarios |
| **Movimientos** | `MovimientoBancario` modifica saldo | Solo se referencia, nunca se actualiza saldo |
| **Titular** | String libre editable (nombre empresa) | **READONLY**, derivado de `Persona` desnormalizado |

**Separación en código:**

- Handlers de `OperacionFinanciera` NO tocan `CuentaBancariaDestino`
- Handlers de pago consolidado NO tocan `CuentaBancaria` como destino (solo como origen)
- **Mundos totalmente separados** — no se cruzan

---

## 2. `CuentaBancaria` (EMPRESA, con saldo)

### Propósito

Representar activos bancarios de la empresa:

- Cuentas corrientes/ahorro/caja de ahorro
- Saldo actualizado en tiempo real
- Origen de transferencias a terceros
- Acreditaciones de POS (tarjetas de crédito)

### Campos clave

```typescript
@Entity('cuentas_bancarias')
export class CuentaBancaria extends BaseModel {
  nombre: string;               // Nombre interno ("Cuenta BNF principal")
  banco: string;                // Banco (UPPERCASE)
  numeroCuenta: string;         // Número de cuenta
  titular?: string;             // STRING LIBRE EDITABLE (ej. "EMPRESA FRC S.A.")
  saldo: number;                // Saldo actual (modificado por MovimientoBancario)
  saldoReservado: number;       // Reservas pendientes
  activo: boolean;
}
```

### Flujos que la usan

1. **Caja Mayor → Transferencia interna**
   - Origen: `CuentaBancaria` A (disminuye saldo)
   - Destino: `CuentaBancaria` B (aumenta saldo)
   - Handler: `OperacionFinanciera` tipo `TRANSFERENCIA_BANCARIA`

2. **POS → Acreditación**
   - `AcreditacionPos` genera `MovimientoBancario` que aumenta saldo de `CuentaBancaria`

3. **Pago consolidado → Origen de fondos**
   - Línea de pago con `fuente=CUENTA_BANCARIA` usa `CuentaBancaria` como **origen** de la transferencia
   - Disminuye saldo de la cuenta de la empresa

---

## 3. `CuentaBancariaDestino` (TERCEROS, sin saldo)

### Propósito

Registrar datos de cobro de terceros para:

- **Pago consolidado:** transferencias a proveedores/clientes/funcionarios
- **Match de comprobantes bancarios:** conciliación automática
- **Reportes:** a quién pagamos (por persona, no por rol)

### Modelo HÍBRIDO

**Dos niveles:**

1. **Cuenta pertenece a `Persona`** (titular real, `persona_id NOT NULL`)
2. **Roles la referencian opcionalmente** (`Proveedor.cuenta_bancaria_default_id`)

```
Persona (ej. "Elvia Ruiz Diaz")
  └─ CuentaBancariaDestino[] (1 a N cuentas)
       ├─ BNF 019-00-1921585 (PYG)
       └─ Banco Continental 567... (USD)

Proveedor (ej. "LA FAMILIA")
  ├─ persona_id → Persona "Elvia Ruiz Diaz"
  └─ cuenta_bancaria_default_id → CuentaBancariaDestino BNF 019...
```

**Justificación del híbrido:**

- Un proveedor puede cobrar en cuenta de otra persona (dueño, apoderado, cónyuge)
- Múltiples proveedores pueden cobrar en la MISMA cuenta (ej. matriz/sucursales)
- Una persona puede tener N cuentas (distintos bancos, monedas)

### Campos clave

```typescript
@Entity('cuentas_bancarias_destino')
export class CuentaBancariaDestino extends BaseModel {
  personaId: number;            // FK a Persona (NOT NULL, dueño real)
  banco: string;                // Banco (UPPERCASE)
  numeroCuenta: string;         // Número de cuenta (UPPERCASE)
  alias?: string;               // Alias opcional (UPPERCASE, ej. "Cuenta LA FAMILIA")
  titular: string;              // READONLY, derivado de Persona (desnormalizado)
  monedaId: number;             // Moneda de la cuenta
  tipoCuenta: TipoCuentaBancaria; // CORRIENTE / AHORRO / CAJA
  activo: boolean;
  observacion?: string;
  // SIN SALDO (no tiene columnas saldo/saldoReservado)
}
```

### Diferencia clave: TITULAR

- **`CuentaBancaria.titular`**: String libre editable (nombre de la empresa como aparece en el banco)
- **`CuentaBancariaDestino.titular`**: **READONLY en UI**, desnormalizado desde `Persona.nombre + apellido`

**Razón:** El titular de una cuenta destino es **la persona real** que figura en el banco, no un nombre libre.

Al crear/actualizar `CuentaBancariaDestino`, el handler:

```typescript
const titular = `${persona.nombre || ''} ${persona.apellido || ''}`.trim().toUpperCase();
cuenta.titular = titular; // Poblado automáticamente
```

UI muestra el titular readonly + tooltip: *"Derivado de Persona (readonly). Para cambiar, editá los datos de la persona."*

### Flujos que la usan

1. **Pago consolidado a proveedor**
   - Usuario paga 3 gastos al proveedor "LA FAMILIA"
   - Línea: *"Gs 1.000.000 desde cuenta BNF 123-456"* (origen)
   - Sistema resuelve:
     - Beneficiario = proveedor
     - Cuenta destino = `proveedor.cuentaBancariaDefault` (hidrata `persona`)
     - Si null → error: *"Proveedor sin cuenta configurada"*
   - Registra:
     - `PagoConsolidadoDetalle.cuenta_bancaria_destino_id`
     - `MovimientoBancario` con descripción enriquecida + FK `cuenta_bancaria_destino_id`

2. **Match de comprobantes bancarios (Fase 5 futura)**
   - Usuario importa extracto CSV/PDF:
     ```
     Fecha       | Concepto                    | Débito      | Crédito
     2026-09-15  | TRANSFER. A 019-00-1921585  | 1.000.000   | -
     ```
   - Sistema busca `MovimientoBancario` por:
     - Fecha ± 2 días
     - Monto exacto
     - FK `cuenta_bancaria_destino_id` (queryable, no solo string)
   - Presenta: *"PAGO CONSOLIDADO #123 → Elvia Ruiz Diaz (BNF 019-00-1921585)"*

3. **Reportes de pagos por persona**
   - *"¿Cuánto pagamos a Elvia Ruiz Diaz?"* (independiente del proveedor)
   - Útil cuando una misma persona cobra por múltiples proveedores

---

## 4. Handlers y permisos

### `CuentaBancaria` (empresa)

**Handlers:** `banking.handler.ts`

- `create-cuenta-bancaria`
- `update-cuenta-bancaria`
- `delete-cuenta-bancaria`
- `get-cuenta-bancaria`
- `list-cuentas-bancarias`

**Permisos:** NO tiene permisos dedicados (hereda de caja mayor / financiero general).

### `CuentaBancariaDestino` (terceros)

**Handlers:** `cuentas-bancarias-destino.handler.ts`

- `create-cuenta-bancaria-destino` — `FINANCIERO_CTA_BANCARIA_DESTINO_CREAR`
- `update-cuenta-bancaria-destino` — `FINANCIERO_CTA_BANCARIA_DESTINO_ACTUALIZAR`
- `delete-cuenta-bancaria-destino` — `FINANCIERO_CTA_BANCARIA_DESTINO_ELIMINAR`
- `get-cuentas-bancarias-destino-by-persona` — **LECTURA PÚBLICA** (sin permiso)
- `get-cuenta-bancaria-destino` — **LECTURA PÚBLICA**

**Permisos seed:**

```typescript
{ codigo: 'FINANCIERO_CTA_BANCARIA_DESTINO_CREAR', modulo: 'FINANCIERO' },
{ codigo: 'FINANCIERO_CTA_BANCARIA_DESTINO_ACTUALIZAR', modulo: 'FINANCIERO' },
{ codigo: 'FINANCIERO_CTA_BANCARIA_DESTINO_ELIMINAR', modulo: 'FINANCIERO' },
```

Asignados por default a: **GERENTE/ADMIN**. Cajero/Mozo NO (no gestionan proveedores).

**Lectura pública:** Diseño deliberado, consistente con mayoría de catálogos (ej. `get-producto`).

**Path de evolución:** Si se detecta necesidad de restricción, agregar `FINANCIERO_CTA_BANCARIA_DESTINO_VER` en fase futura.

---

## 5. Migraciones

### Fase 1 (MVP Proveedores)

4 migraciones dual driver (SQLite/Postgres), timestamps REALES epoch-ms:

1. **`1789586966573-CuentasBancariasDestinoHibrido.ts`**
   - Tabla `cuentas_bancarias_destino`
   - FKs a `personas` y `monedas` (solo Postgres)
   - Índices: `persona_id`, `activo`, `moneda_id`

2. **`1789587015222-ProveedorCuentaBancariaDefault.ts`**
   - Columna `cuenta_bancaria_default_id` en `proveedores` (nullable)
   - FK a `cuentas_bancarias_destino` (solo Postgres)
   - Índice parcial (WHERE IS NOT NULL)

3. **`1789587032713-PagoConsolidadoDetalleCuentaDestino.ts`**
   - Columna `cuenta_bancaria_destino_id` en `pagos_consolidados_detalles` (nullable)
   - FK a `cuentas_bancarias_destino` (solo Postgres)
   - Índice parcial

4. **`1789587049751-MovimientoBancarioCuentaDestino.ts`**
   - Columna `cuenta_bancaria_destino_id` en `movimientos_bancarios` (nullable)
   - FK a `cuentas_bancarias_destino` (solo Postgres)
   - Índice parcial
   - **Justificación (AUDIT B #4):** Solo enriquecer `observacion` no es queryable. FK permite búsquedas eficientes.

### Estado greenfield

**NO hay migración de datos:**

- Ningún proveedor/cliente/funcionario tiene cuenta bancaria configurada HOY
- `CuentaBancaria` existentes son **solo de la empresa**
- `Funcionario.cuentaBancariaPropia` (string libre) está vacío/obsoleto

**Script opcional de ayuda (Fase 2):**

- Parsear `Funcionario.cuentaBancariaPropia` con regex → CSV para revisión manual
- **NO automatizar** — riesgo de datos incorrectos persistidos

---

## 6. UI Desktop

### Componente compartido: `selector-cuenta-destino`

**Ubicación:** `src/app/shared/components/selector-cuenta-destino/`

**Propósito:** Dropdown reutilizable para elegir cuenta bancaria destino de una persona.

**Inputs:**
- `personaId: number` (obligatorio)
- `cuentaSeleccionadaId?: number` (preseleccionar)

**Output:**
- `cuentaChange: EventEmitter<CuentaBancariaDestino | null>`

**Funcionamiento:**
- Llama `get-cuentas-bancarias-destino-by-persona`
- Si solo hay una cuenta activa → autoselecciona
- Si hay cero → mensaje: *"Esta persona no tiene cuentas bancarias. Agregá una."*

### Diálogo: `create-edit-cuenta-destino-dialog`

**Ubicación:** `src/app/shared/dialogs/cuenta-destino/`

**Formulario (Reactive Forms):**

- **Titular (readonly chip destacado):** `${persona.nombre} ${persona.apellido}` — **NO EDITABLE**
- Banco (text, obligatorio)
- Número de cuenta (text, obligatorio)
- Tipo de cuenta (dropdown: CORRIENTE / AHORRO / CAJA)
- Alias (text opcional)
- Moneda (dropdown, obligatorio)
- Observación (textarea opcional)

**Validaciones:**

- Todos los campos obligatorios
- Strings a UPPERCASE al guardar
- Titular NO es editable (tooltip: *"Derivado de Persona (readonly). Para cambiar, editá los datos de la persona."*)

### Integración en fichas de roles

**`create-edit-proveedor.component`:**

Subsección "Cuenta bancaria de cobro":

```
┌─────────────────────────────────────────────┐
│ 👤 Persona vinculada: [Elvia Ruiz Diaz]   │
│                                             │
│ 💳 Cuenta preferida para cobros:           │
│    [Dropdown selector-cuenta-destino]      │
│                                             │
│    [Botón: Nueva cuenta para esta persona] │
│    [Botón: Ver todas las cuentas]          │
└─────────────────────────────────────────────┘
```

**Flujo:**
1. Si `proveedor.persona` es null → badge ROJO: *"SIN PERSONA VINCULADA"* + botón vincular
2. Si `proveedor.persona` existe:
   - Cargar cuentas con `selector-cuenta-destino`
   - Pre-seleccionar `proveedor.cuentaBancariaDefaultId` si existe
   - Botón "Nueva cuenta" → abre diálogo con `personaId` prestablecido

### Confirmación enriquecida en pago consolidado

**`pagar-obligaciones-dialog.component`:**

Bloque destacado:

```
╔════════════════════════════════════════════════╗
║ 📤 DESTINO DE TRANSFERENCIA:                   ║
║                                                 ║
║ 👤 Titular: ELVIA RUIZ DIAZ                   ║
║ 🏦 Banco: BNF                                 ║
║ 💳 Cuenta: 019-00-1921585                     ║
║ 💰 Moneda: PYG - Corriente                    ║
║ 🔖 Alias: Cuenta LA FAMILIA                   ║
╚════════════════════════════════════════════════╝
```

**Fase 1 MVP:** Sin selector manual. La cuenta destino se **deriva automáticamente** del beneficiario.

**Fase 4 futura:** Si beneficiario tiene múltiples cuentas, agregar selector manual.

---

## 7. UI Mobile (PWA)

**Alcance Fase 1:** **SOLO lectura** (consistente con alcance administrativo actual).

**Proveedor/Cliente/Funcionario detalle:**

Card destacado:

```
┌────────────────────────────────────┐
│ 💳 Cuenta de cobro preferida       │
│                                    │
│ [Card]                             │
│   👤 Titular: ELVIA RUIZ DIAZ     │
│   🏦 Banco: BNF                   │
│   💳 Cuenta: 019-00-1921585       │
│   🔖 Alias: Cuenta LA FAMILIA     │
│   [Chip: ACTIVA]                   │
│                                    │
│ [Botón: Ver todas las cuentas]    │
└────────────────────────────────────┘
```

**Creación/edición:** NO en Fase 1. Mensaje: *"Para agregar o editar cuentas bancarias, usá la versión desktop."*

---

## 8. Fases futuras

### Fase 2: Funcionarios

- Columna `cuenta_bancaria_default_id` en `Funcionario`
- UI desktop: tab en funcionario
- Integración en pago consolidado (liquidaciones de sueldo + vales)

### Fase 3: Clientes

- Columna `cuenta_bancaria_default_id` en `Cliente`
- UI desktop: tab en cliente
- Integración en **cobro consolidado** de CPC (sentido inverso: ingreso)

### Fase 4: Múltiples cuentas default por rol (M2M)

- Tabla intermedia `ProveedorCuentaBancaria` (M2M)
- Campo `es_default_para_moneda_id` en la relación
- Selector de cuenta destino en pago consolidado por moneda de la línea

### Fase 5: Mobile CRUD

- Formulario mobile para agregar/editar cuentas destino
- Vincular cuenta default desde mobile

### Fase 6: Conciliación bancaria

- Importador de extractos (CSV/OFX/PDF)
- Motor de match por fecha+monto+cuenta destino
- UI de conciliación con sugerencias

---

## 9. Riesgos y mitigaciones

### Riesgo 1: Proveedor sin persona vinculada

**Query diagnóstico obligatorio ANTES de Fase 1:**

```sql
SELECT COUNT(*) FROM proveedores WHERE activo = 1 AND persona_id IS NULL;
```

Si >10% proveedores sin persona → agregar handler `vincular-persona-a-proveedor` (quick-create) en Fase 1.

### Riesgo 2: Confusión empresa vs destino

**Mitigación:**

- Comentarios en código de entidades:
  - `CuentaBancaria`: `// EMPRESA (activo con saldo)`
  - `CuentaBancariaDestino`: `// TERCEROS (sin saldo, info de cobro)`
- UI separada: "Bancos / Cuentas propias" vs "Personas / Cuentas de terceros"
- Este documento (`docs/domains/cuentas-bancarias.md`) OBLIGATORIO ANTES DE MERGE

### Riesgo 3: Desactivar persona desactiva sus cuentas implícitamente

**Mitigación MVP:**

- Validar en pago consolidado (rechazar cuenta con persona inactiva)
- Desactivación en cascada queda para Fase 2

---

## 10. Comentarios en entidades (código)

**`CuentaBancaria` (empresa):**

```typescript
/**
 * Cuenta bancaria DE LA EMPRESA (activo con saldo).
 * 
 * Uso: Caja mayor, POS, transferencias internas entre cuentas propias.
 * 
 * DISTINTA de CuentaBancariaDestino (terceros, sin saldo).
 */
@Entity('cuentas_bancarias')
export class CuentaBancaria extends BaseModel {
  // ...
  titular?: string; // STRING LIBRE EDITABLE (nombre empresa)
  saldo: number;    // Saldo actualizado por MovimientoBancario
}
```

**`CuentaBancariaDestino` (terceros):**

```typescript
/**
 * Cuenta bancaria de DESTINO/COBRO (terceros, SIN saldo).
 * 
 * IMPORTANTE: Distinta de CuentaBancaria (EMPRESA, CON saldo).
 * 
 * El titular se DERIVA de Persona (readonly en UI), a diferencia de
 * CuentaBancaria.titular que es string libre editable.
 */
@Entity('cuentas_bancarias_destino')
export class CuentaBancariaDestino extends BaseModel {
  // ...
  titular!: string; // READONLY, derivado de Persona (desnormalizado)
  // SIN SALDO (no tiene columnas saldo/saldoReservado)
}
```

---

**Fin del documento.**
