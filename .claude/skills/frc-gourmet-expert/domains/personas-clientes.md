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
| `documento` | string nullable | Valor del documento |
| `tipoPersona` | enum PersonaTipo | FISICA (default), JURIDICA |
| `imageUrl` | nullable | `app://profile-images/<file>` |
| `activo` | boolean | Soft delete |

Una Persona puede vincularse a múltiples contextos (1:1 lógicos): Usuario, Cliente, Funcionario, Proveedor.

## Usuario

```typescript
{
  persona: Persona (M:1, nullable en algunos contextos legacy)
  nickname: string UNIQUE
  password: string                     // ⚠️ TEXTO PLANO (TODO bcrypt)
  activo: boolean
}
```

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

```typescript
{
  persona: Persona (M:1)
  tipo_cliente: TipoCliente (M:1)
  ruc?: string                         // RUC empresa (si juridica)
  razon_social?: string
  tributa: boolean default false
  activo
  credito: boolean default false       // ¿acepta crédito?
  limite_credito: float default 0
  saldoActual: decimal(18,2) default 0 // saldo deuda actual del cliente
}
```

`saldoActual` se actualiza con cada `MovimientoCliente` (en transacción).

### TipoCliente

```typescript
{
  descripcion: string                  // 'Mayorista', 'Minorista', 'Delivery'
  activo
  credito: boolean default false       // tipo permite crédito
  descuento: boolean default false     // aplica descuento
  porcentaje_descuento: float default 0
}
```

Política de tipo aplica como default a todos los clientes de ese tipo.

## LoginSession

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
- `buscar-cliente-por-telefono(telefono)`: 1 cliente o null.
- `buscar-clientes-por-telefono(telefono)`: max 15, ordenado por nombre. Usado por autocomplete en `crear-delivery-dialog`.
- `crear-cliente-rapido({ telefono, nombre?, direccion? })`: crea Persona + Cliente con datos mínimos. Útil cuando llega un delivery de cliente nuevo.

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
- `rrhhDash/`: placeholder legacy (a reemplazar por `pages/rrhh/dashboard/`).

`src/app/pages/personalizacion/permisos/`:
- `list-permisos/`: CRUD permisos.
- `assign-permisos-role-dialog/`: asigna permisos a un rol.
- `list-roles/`: CRUD roles.

`src/app/pages/home/`:
- `home.component.ts`: dashboard principal con accesos rápidos estáticos + shortcuts dinámicos.

## Handlers

`electron/handlers/`:
- `personas.handler.ts` (~758 líneas): Persona, Usuario, Role, UsuarioRole, TipoCliente, Cliente.
- `auth.handler.ts` (~164 líneas): login, logout, validate-credentials, sessionId, getCurrentUser, setCurrentUser, getLoginSessions, updateSessionActivity.
- `permissions.handler.ts` (~241 líneas): Permission CRUD, RolePermission CRUD, get-permissions-by-user, seed-permissions.
- `dashboard-shortcuts.handler.ts` (~78 líneas): get/create/update/delete dashboard shortcuts.

## Pendientes

- Hash de passwords (bcrypt).
- JWT secret en env.
- Validación de permisos en handlers (no solo frontend).
- Recuperación contraseña, bloqueo cuenta, MFA.
- Crear Persona inline desde dialogs (botón "+" junto al select).

→ [workflows/todos-pendientes.md](../workflows/todos-pendientes.md) sección Seguridad.
