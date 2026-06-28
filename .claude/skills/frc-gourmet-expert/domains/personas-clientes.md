# Dominio: Personas, Usuarios, Clientes

## Persona — entidad raíz

`src/app/database/entities/personas/persona.entity.ts`. Es la entidad raíz para Usuario, Cliente y Funcionario (RRHH).

| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | string req | UPPERCASE |
| `apellido` | string nullable | |
| `email`, `telefono`, `direccion` | nullable | |
| `fechaNacimiento` | date nullable | |
| `sexo` | enum SexoEnum | MASCULINO, FEMENINO, OTRO |
| `estadoCivil` | enum | SOLTERO, CASADO, UNION_LIBRE, DIVORCIADO, VIUDO |
| `tipoDocumento` | enum DocumentoTipo | CI, RUC, CPF, PASAPORTE (default CI) |
| `documento` | string nullable | Valor del documento — **opcional**. Solo se valida contextualmente en alta de funcionario, cliente con crédito, o facturación legal. El form lo permite vacío y guarda `null`. |
| `tipoPersona` | enum PersonaTipo | FISICA (default), JURIDICA |
| `imageUrl` | nullable | `app://profile-images/<file>` |
| `activo` | boolean | Soft delete |

Una Persona puede vincularse a múltiples contextos (1:1 lógicos): Usuario, Cliente, Funcionario, Proveedor.

## Usuario

`src/app/database/entities/personas/usuario.entity.ts`:

```typescript
{
  persona: Persona (M:1, JoinColumn persona_id)
  nickname: string UNIQUE
  password: string
  activo: boolean
  mustChangePassword: boolean default false  // col must_change_password
}
```

`mustChangePassword` (P0-3): si es `true`, el frontend abre un dialog bloqueante post-login que obliga a cambiar la password antes de cargar el dashboard. Se setea en `true` para el admin seedeado (admin/admin) y vuelve a `false` cuando el usuario completa el cambio.

→ Auth flow detallado en [architecture/auth-permissions.md](../architecture/auth-permissions.md).

### Roles

```typescript
Role {
  descripcion: string                  // 'Administrador', 'Cajero', 'Mozo', 'Gerente RRHH'
  activo
}

UsuarioRole {
  usuario, role                        // M:N tabla join
}

RolePermission {
  role, permission
}

Permission {
  codigo: string UNIQUE UPPERCASE
  descripcion?, modulo?
  activo
}
```

→ 56 permisos seed listos en [architecture/auth-permissions.md](../architecture/auth-permissions.md).

## Cliente

`src/app/database/entities/personas/cliente.entity.ts`:

```typescript
{
  persona: Persona (M:1, JoinColumn persona_id)
  tipo_cliente: TipoCliente (M:1, JoinColumn tipo_cliente_id)
  ruc?: string                         // RUC empresa (si juridica)
  razon_social?: string
  tributa: boolean default false
  activo
  credito: boolean default false       // ¿acepta crédito?
  limite_credito: decimal(18,2) default 0
  saldoActual: decimal(18,2) default 0 // col saldo_actual, deuda actual
  convenios?: Convenio[]               // M:N, tabla join cliente_convenios
}
```

`saldoActual` se actualiza con cada `MovimientoCliente` (en transacción).

### Convenio

`src/app/database/entities/personas/convenio.entity.ts`. Agrupa clientes que pertenecen a una empresa/entidad externa con acuerdo (ej. "FUNCIONARIOS BODEGA FRANCO"). A fin de mes la empresa puede pagar de forma consolidada la deuda de todos sus clientes y descontarla internamente.

```typescript
{
  nombre: string                       // varchar(160)
  descripcion?: string                 // varchar(300)
  ruc?: string                         // varchar(40), empresa que paga
  contacto?: string                    // varchar(160), col contacto
  activo: boolean default true
  clientes?: Cliente[]                 // M:N (lado dueño es Cliente.convenios)
}
```

Relación M:N con `Cliente` vía tabla `cliente_convenios`; el lado dueño del `JoinTable` es `Cliente`. Páginas en `src/app/pages/personas/convenios/`.

### TipoCliente

`src/app/database/entities/personas/tipo-cliente.entity.ts` (tabla `tipo_clientes`):

```typescript
{
  descripcion: string                  // 'Mayorista', 'Minorista', 'Delivery'
  activo
  credito: boolean default false       // tipo permite crédito
  descuento: boolean default false     // aplica descuento
  porcentaje_descuento: decimal(5,2) default 0
}
```

Política de tipo aplica como default a todos los clientes de ese tipo.

## LoginSession

`src/app/database/entities/auth/login-session.entity.ts`:

```typescript
{
  usuario_id
  ip_address: string                   // '127.0.0.1' placeholder en Electron
  user_agent, device_info (JSON)
  login_time: datetime
  logout_time?: datetime
  is_active: boolean
  last_activity_time?: datetime
  location?, browser?, os?
}
```

`updateLastActivity` cada 5 min via setInterval en `app.component.ts`.

`LoginSession.is_active = false` indica logout.

## Búsqueda especializada de clientes

`personas.handler.ts`:
- `get-clientes(filters?)`: filtros opcionales `{ nombre, ruc, tipoClienteId, activo, conCredito }` — usa queryBuilder con LIKE UPPER en `persona.nombre + apellido + cliente.razon_social` y joins relevantes. Backward-compat: sin filtros devuelve todo.
- `buscar-cliente-por-telefono(telefono)`: 1 cliente o null.
- `buscar-clientes-por-telefono(telefono)`: max 15, ordenado por nombre. Usado por autocomplete en `crear-delivery-dialog`.
- `crear-cliente-rapido({ telefono, nombre?, direccion? })`: crea Persona + Cliente con datos mínimos. Útil cuando llega un delivery de cliente nuevo.

## Estado de cuenta del cliente (F2)

`movimientos-cliente.handler.ts`:
- `get-saldo-cliente(clienteId)`: devuelve `saldoActual` del cliente.
- `get-cliente-estado-cuenta(clienteId)`: cliente + saldoActual + cuotasVencidas + `kpis` del mes (`movsMesCount`, `cargosMesTotal`, `pagosMesTotal`, `netoMes`) + CPC abiertas (estado ACTIVO, con cuotas y moneda) + últimas 10 ventas CONCLUIDA.
- `get-movimientos-cliente-stats(clienteId)`: agregados por mes (12 últimos, inicializados a 0 para chart continuo) y composición por tipo (CARGO/PAGO/AJUSTE_POSITIVO/AJUSTE_NEGATIVO). Para los charts de `cliente-detalle`.
- `get-movimientos-cliente(clienteId, filtros?)`: paginado con filtros `{ fechaInicio, fechaFin, tipo, page, pageSize }`.
- `recalcular-saldo-cliente(clienteId)` (en `cuentas-por-cobrar.handler.ts`): suma todos los movimientos del cliente y sobreescribe `saldoActual`. Safety net expuesto en mat-menu del detalle.

## Venta a crédito (PdV → CPC)

Flujo end-to-end implementado 2026-05-12:
1. **PdV → "Cobrar a crédito"** (botón naranja en `cobrar-venta-dialog`, habilitado solo si la venta tiene cliente con `credito=true` y saldo pendiente > 0). Tooltip indica la razón si está deshabilitado.
2. **Dialog `cobrar-credito-dialog`** configura cantidad de cuotas, frecuencia (mensual/quincenal/semanal), fecha inicio, descripción. Muestra saldo proyectado color-coded y vista previa de cuotas en vivo. Si saldo proyectado excede límite, pide confirmación adicional.
3. **Handler `cobrar-venta-credito`** (en `cuentas-por-cobrar.handler.ts`, atómico):
   - Valida cliente con crédito habilitado y límite (devuelve `requiereConfirmacion` si excede).
   - **Get-or-create FormaPago "CUENTA CORRIENTE"** (`movimentaCaja: false`, orden 99) si no existe.
   - Cierra venta CONCLUIDA con esa forma de pago + `fechaCierre = now`.
   - Crea/reutiliza `Pago` (PAGADO) + nuevo `PagoDetalle` con la forma "CUENTA CORRIENTE" y monto.
   - Crea `CuentaPorCobrar` tipo `CREDITO_VENTA` con N cuotas según frecuencia.
   - Crea `MovimientoCliente` CARGO con `ventaId + cuentaPorCobrarId` → actualiza `cliente.saldoActual`.

## Cobro de CPC desde Caja Mayor

Dialog rápido `cobrar-cpc-rapido-dialog` (en `caja-mayor/cuentas-por-cobrar/`):
- Acceso: botón **"Cobrar a cliente"** en `caja-mayor-detalle` (al lado de Registrar Ingreso/Egreso, solo si caja ABIERTA).
- Autocomplete sobre todas las CPC ACTIVAS (label compuesto: cliente + venta + pendiente + moneda).
- Al elegir, muestra resumen + tabla de cuotas con estado. Cada cuota pendiente/parcial tiene botón "Cobrar" que abre el `cobrar-cuota-dialog` existente con `cajaMayorId` ya pre-seteado.
- `cobrar-cuota-dialog` aplica pre-selecciones automáticas: caja (de `data.cajaMayorId` o única abierta), moneda (la de la CPC > principal > única), forma de pago (principal > única).

## Cliente asignable desde cobrar-venta-dialog

Header del dialog tiene autocomplete de Cliente + botón "Nuevo cliente" (reusa `CreateEditClienteDialogComponent`). Al elegir/cambiar, llama `updateVenta({ cliente })` y refresca el flag `canCobrarCredito`. Chip verde si el cliente tiene crédito habilitado.

## DashboardShortcut (personalización)

`src/app/database/entities/personalizacion/dashboard-shortcut.entity.ts`:

```typescript
{
  dashboardKey: varchar(50)            // HOME | FINANCIERO | VENTAS | COMPRAS | CAJA_MAYOR | RRHH
  titulo: varchar(150)
  icono: varchar(50) default 'star'
  color: varchar(20) default '#1976d2'
  targetType: varchar(80)              // CAJA_MAYOR_DETALLE | ACREDITACIONES_POS | CUENTAS_POR_PAGAR | etc.
  targetData?: text                    // JSON: { cajaMayorId: 1, estado: "ABIERTA" }
  orden: int default 0
  usuario?: Usuario                    // null = global, no null = personal
  activo
}
```

`HomeComponent` carga shortcuts globales + personales del usuario actual. Click → `abrirShortcut(s)` (en `src/app/shared/utils/dashboard-shortcut-router.ts`) routea según `targetType`.

## Páginas

`src/app/pages/personas/`:
- `personas/list-personas.component`: tabla con filtros, CRUD.
- `usuarios/list-usuarios.component`: tabla con paginación, asignación de roles.
- `clientes/list-clientes.component`: tabla con saldoActual, crédito.
- `clientes/cliente-detalle/`: detalle con histórico de movimientos.
- `convenios/`: CRUD de convenios (agrupación de clientes por empresa/acuerdo).
- `rrhhDash/`: placeholder legacy. El dashboard real de RRHH ya existe en `pages/rrhh/dashboard/`.

`src/app/pages/personalizacion/permisos/`:
- `list-permisos/`: CRUD permisos.
- `assign-permisos-role-dialog/`: asigna permisos a un rol.
- `list-roles/`: CRUD roles.

`src/app/pages/home/`:
- `home.component.ts`: dashboard principal con accesos rápidos estáticos + shortcuts dinámicos.

## Handlers

`electron/handlers/`:
- `personas.handler.ts` (~927 líneas): Persona, Usuario, Role, UsuarioRole, TipoCliente, Cliente.
- `auth.handler.ts` (~212 líneas): login, logout, validate-credentials, sessionId, getCurrentUser, setCurrentUser, getLoginSessions, updateSessionActivity.
- `permissions.handler.ts` (~313 líneas): Permission CRUD, RolePermission CRUD, get-permissions-by-user, seed-permissions.
- `dashboard-shortcuts.handler.ts` (~78 líneas): get/create/update/delete dashboard shortcuts.

## Pendientes

- Hash de passwords (bcrypt). Hoy se guardan en texto plano; ya existe el flujo `mustChangePassword` (P0-3) que fuerza el cambio post-login del admin seedeado, pero no hay hashing aún.
- JWT secret en env.
- Validación de permisos en handlers (no solo frontend).
- Recuperación contraseña, bloqueo cuenta, MFA.
- Crear Persona inline desde dialogs (botón "+" junto al select).

→ [workflows/todos-pendientes.md](../workflows/todos-pendientes.md) sección Seguridad.
