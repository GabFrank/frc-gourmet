# Autenticación y permisos

## Modelo de identidad

```
Persona (entidad raíz, datos personales)
  ├─ Usuario (nickname + password + sesiones)  ──┬─► UsuarioRole ──► Role ──► RolePermission ──► Permission
  ├─ Cliente (datos comerciales: ruc, crédito, saldoActual)
  └─ Funcionario (datos laborales — ver dominio RRHH)
```

**Persona** (`src/app/database/entities/personas/persona.entity.ts`):
- `nombre` (req), `apellido`, `email`, `telefono`, `direccion`, `fechaNacimiento`
- `sexo` (MASCULINO/FEMENINO/OTRO), `estadoCivil` (SOLTERO/CASADO/UNION_LIBRE/DIVORCIADO/VIUDO)
- `tipoDocumento` (CI/RUC/CPF/PASAPORTE), `documento`
- `tipoPersona` (FISICA/JURIDICA)
- `imageUrl` (foto perfil, `app://profile-images/<file>`)
- `activo` (soft delete)

**Usuario** (`personas/usuario.entity.ts`):
- `persona_id` FK (M:1)
- `nickname` UNIQUE
- `password` ⚠️ **TEXTO PLANO** (línea 35 auth.handler: `password === usuario.password`). Comentario interno marca TODO bcrypt para producción.
- `activo`

**LoginSession** (`auth/login-session.entity.ts`):
- `usuario_id` FK
- `ip_address` (placeholder `127.0.0.1` en Electron)
- `user_agent`, `device_info` (JSON), `browser`, `os`
- `login_time`, `logout_time`, `is_active`, `last_activity_time`

## Flujo de login

`electron/handlers/auth.handler.ts`:

```
1. User envía { nickname, password, deviceInfo }
2. Handler:
   - SELECT WHERE LOWER(nickname) = LOWER(?)  (case-insensitive)
   - if (!usuario || !usuario.activo) → fail
   - if (password !== usuario.password) → fail   ⚠️ texto plano
   - jwt.sign({ id, nickname }, JWT_SECRET, { expiresIn: '7d' })
   - INSERT LoginSession (browser, os, login_time = now)
   - setCurrentUser(usuario)  // global en main process
   - return { success, usuario, token, sessionId }

3. Angular AuthService.login():
   - localStorage.setItem('auth_token', token)
   - localStorage.setItem('current_user', JSON.stringify(usuario))
   - localStorage.setItem('session_id', sessionId)
   - currentUserSubject.next(usuario)
   - repositoryService.setCurrentUser(usuario)  // sincroniza
```

**JWT secret hardcoded:** `'frc-gourmet-secret-key'` en `auth.handler.ts:9`. ⚠️ Mover a env en producción.

**Token:** generado pero **no validado** en cliente (Angular sólo lo guarda). El backend (handlers) tampoco lo verifica — confía en `getCurrentUser()` en main process.

## Sesión

`src/app/services/auth.service.ts`:

- `currentUser$: Observable<Usuario | null>` — todo el resto de la app se suscribe a esto.
- `isLoggedIn` getter.
- Carga desde localStorage al inicializar (`loadFromLocalStorage()`).
- `updateLastActivity()` cada 5 min (en `app.component.ts` con `setInterval`).
- `logout()`:
  - `repositoryService.logout(sessionId)` → handler marca `LoginSession.is_active = false`, `logout_time = now`.
  - Limpia localStorage.
  - `currentUserSubject.next(null)`.
  - `tabsService.removeAllTabs()`.
  - Navega a `/login`.

## Roles y permisos

### Modelo M:N triple

```
Usuario ─(UsuarioRole)─► Role ─(RolePermission)─► Permission
```

- **Role** (`personas/role.entity.ts`): `descripcion`, `activo`. Ej: "Administrador", "Mozo", "Cajero", "Gerente RRHH".
- **Permission** (`personas/permission.entity.ts`): `codigo` UNIQUE UPPERCASE, `descripcion`, `modulo`, `activo`. Ej: `RRHH_LIQUIDACION_APROBAR`.
- **RolePermission** y **UsuarioRole**: tablas join.

### Seed de permisos

`electron/handlers/permissions.handler.ts:10-72` define ~56 permisos pre-cargados al startup (idempotente — sólo inserta si la tabla está vacía).

Categorías:
- **RRHH**: 18+ permisos (`RRHH_FUNCIONARIO_VER`, `RRHH_FUNCIONARIO_EDITAR`, `RRHH_VALE_CREAR`, `RRHH_VALE_CONFIRMAR`, `RRHH_LIQUIDACION_GENERAR`, `RRHH_LIQUIDACION_APROBAR`, `RRHH_LIQUIDACION_PAGAR`, `RRHH_VACACION_GESTIONAR`, `RRHH_ASISTENCIA_REGISTRAR`, etc.)
- **COMISIONES**: 7 (`COMISION_REGLA_VER`, `COMISION_REGLA_GESTIONAR`, `COMISION_LIQUIDACION_APROBAR`, etc.)
- **SISTEMA**: `SISTEMA_PERMISO_GESTIONAR`, `SISTEMA_ROL_GESTIONAR`
- **FINANCIERO**: `CPC_GESTIONAR`, `CPC_COBRAR`, `CPC_ANULAR`, etc.
- **RRHH Fase 8**: `RRHH_DASHBOARD_VER`, `RRHH_REPORTES_EXPORTAR`, etc.

→ Lista completa al ejecutar `seedPermissions(dataSource)` en main.ts.

### Permisos en frontend

`src/app/services/permission.service.ts`:

```typescript
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private codigosSubject = new BehaviorSubject<Set<string>>(new Set());

  // Suscribe a currentUser$ y carga permisos al login
  // (`get-permissions-by-user` en personas.handler resuelve UsuarioRole → RolePermission → Permission)

  has(codigo: string): boolean {
    return this.codigosSubject.value.has(codigo.toUpperCase());
  }
  hasAny(codigos: string[]): boolean { /* OR */ }
  hasAll(codigos: string[]): boolean { /* AND */ }
}
```

Uso en componentes:

```html
<button mat-button *ngIf="permService.has('RRHH_LIQUIDACION_APROBAR')" (click)="aprobar()">Aprobar</button>
```

```typescript
if (!this.permService.has('RRHH_LIQUIDACION_PAGAR')) {
  this.snackBar.open('Sin permiso para pagar liquidaciones', 'Cerrar', { duration: 3000 });
  return;
}
```

### ⚠️ Validación en backend: parcial

Los handlers **NO** validan permisos del `getCurrentUser()`. Sólo el frontend lo hace. Significa:
- Un usuario malicioso con DevTools puede invocar `window.api.deleteFuncionario(id)` saltándose el check del componente.
- TODO de seguridad: agregar middleware de permisos en cada handler sensible.

## Auth Guard

`src/app/guards/auth.guard.ts`:

```typescript
canActivate(route, state): boolean {
  if (this.authService.isLoggedIn) return true;
  this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
  return false;
}
```

Sólo chequea login, no permisos. Aplicado al routing (que sólo es `/login`, así que técnicamente no protege nada — la app entera está bloqueada vía `*ngIf="isAuthenticated"` en `app.component.html`).

## getCurrentUser (main process)

```typescript
// main.ts líneas 69-78
let currentUser: Usuario | null = null;
function getCurrentUser(): Usuario | null { return currentUser; }
function setCurrentUser(user: Usuario | null): void { currentUser = user; }
```

Pasada como callback a cada handler. Los handlers la usan para popular `createdBy` / `updatedBy` vía `setEntityUserTracking()`.

**Inconsistencia:** el renderer puede invocar `setCurrentUser` (handler `setCurrentUser`). Eso permite "spoofing" de usuario desde DevTools. El handler tiene un `console.warn` señalando el riesgo, pero no rechaza.

## Lo que NO está implementado

| Feature | Estado |
|---|---|
| Hash de contraseña (bcrypt) | ❌ texto plano |
| Refresh tokens | ❌ token único 7d |
| Recuperación de contraseña | ❌ |
| Bloqueo por intentos fallidos | ❌ |
| 2FA / MFA | ❌ |
| Idle timeout server-side | ❌ (solo activity tracking) |
| Validación de permisos en backend | ❌ solo frontend |
| Audit log de operaciones sensibles | Parcial (BaseModel.createdBy/updatedBy) |
| Captcha en login | ❌ |

Estos son todos TODOs conocidos para producción.

## Crear usuario administrador (manual)

No hay seed de usuarios iniciales (`seedInitialData` no crea Usuario/Persona). El primer admin debe crearse manualmente:
1. Crear Persona → 2. Crear Usuario vinculado → 3. Crear Role "Administrador" → 4. Crear UsuarioRole → 5. (opcional) Asignar todos los permisos al Role.

Hay UI para esto: Personas → Crear Persona → Usuarios → Crear Usuario → Roles → Asignar Permisos.

## Dashboard shortcuts (personalización)

`src/app/database/entities/personalizacion/dashboard-shortcut.entity.ts`:
- `dashboardKey` (HOME, FINANCIERO, VENTAS, etc.) — qué dashboard contiene este shortcut
- `titulo`, `icono`, `color`, `orden`
- `targetType` (CAJA_MAYOR_DETALLE, ACREDITACIONES_POS, etc.) + `targetData` (JSON con params)
- `usuario_id` nullable: si null = global, si tiene = personal

`HomeComponent` los carga y permite al usuario armar su pantalla de inicio personalizada. Routing por `targetType` está en `src/app/shared/utils/dashboard-shortcut-router.ts`.
