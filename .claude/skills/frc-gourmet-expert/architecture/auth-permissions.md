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
- `password` — **hash bcrypt** (`bcryptjs`). El login compara con `verifyPassword(plain, stored)` (`electron/utils/password.utils.ts`). Al arranque `migratePlaintextPasswords()` re-hashea cualquier password plano residual.
- `mustChangePassword` — fuerza cambio de password en el próximo login (el admin default `admin/admin` arranca con este flag).
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
2. Handler (auth.handler.ts):
   - SELECT WHERE LOWER(nickname) = LOWER(?)  (case-insensitive)
   - if (!usuario || !usuario.activo) → fail
   - const ok = await verifyPassword(password, usuario.password)  // bcrypt
   - if (!ok) → fail
   - jwt.sign({ id, nickname }, await getJwtSecret(), { ... })
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

**JWT secret en keytar:** `getJwtSecret()` (`electron/utils/jwt-secret.utils.ts`) lee/genera el secret en el keychain del SO (`service: com.frcgourmet.app`, `account: jwt-secret`), con fallback a filesystem si keytar no está disponible. **No hay secret hardcodeado.**

**Refresh tokens:** el modo server (Fastify + `@fastify/jwt`) emite access + refresh tokens. En modo `client`/PWA el access token va en `Authorization: Bearer` a `/api/rpc` y el shim hace refresh automático ante 401.

**Validación en backend:** en modo server, el `jwt.verify` corre en el middleware de Fastify y el usuario del token se propaga vía `withRequestUser(...)` (AsyncLocalStorage) a los handlers. En desktop standalone el handler confía en `getCurrentUser()` del main process. En ambos casos, los handlers sensibles **revalidan permisos** (`ensurePermission`).

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

`electron/handlers/permissions.handler.ts` — el array `SEED_PERMISOS` define **94 permisos** pre-cargados al startup (`seedPermissions()`, idempotente por `codigo`). Agregar un permiso = añadirlo al array; al siguiente arranque se inserta y `syncAdminPermissions()` se lo asigna al rol ADMINISTRADOR.

Categorías (prefijos): `HOME_*`, `VENTAS_*`, `COMANDAS_KDS_*`, `RRHH_*`, `PERSONAS_*`, `USUARIOS_*`, `CLIENTES_*`, `COMISION_*`, `PRODUCTOS_*` / `RECETAS_*` / `SABORES_*` / `ADICIONALES_*` / `INGREDIENTES_*` / `STOCK_MOVIMIENTO_*` / `CATEGORIAS_*`, `COMPRAS_*`, `FINANCIERO_*` / `CAJA_MAYOR_*` / `MONEDAS_*` / `CPC_*`, `EMPRESA_*`, `IMPRESORAS_*` / `SECTORES_IMPRESORAS_*` / `DISPOSITIVOS_*`, `SISTEMA_*` (BACKUP, CONFIGURAR_IA, BD_CONFIGURAR, MODO_CONFIGURAR, PERMISO_GESTIONAR, ROL_GESTIONAR).

→ Lista exacta: array `SEED_PERMISOS` en `permissions.handler.ts`. **Grepear el código real antes de usarlo** — no inventar nombres.

### Permisos en frontend

`src/app/services/permission.service.ts` — `PermissionService` cachea los códigos del usuario actual en un `Set<string>` (`BehaviorSubject codigos$`). Se suscribe a `currentUser$` y carga permisos al login (`get-permissions-by-user` resuelve UsuarioRole → RolePermission → Permission). API: `has(codigo)`, `hasAny(codigos[])`, `hasAll(codigos[])` (comparan en UPPERCASE).

**Directivas estructurales** (`src/app/shared/directives/has-permission.directive.ts`):
- `*appHasPermission="'CODIGO'"` — muestra el elemento si el usuario tiene ese permiso.
- `*appHasAnyPermission="['A','B']"` — muestra si tiene alguno (se usa en los headers de sección del sidenav).

```html
<button mat-button *appHasPermission="'RRHH_LIQUIDACION_PAGAR'" (click)="aprobar()">Pagar</button>
```

El rol ADMINISTRADOR se auto-sincroniza con todos los permisos al arranque, así que ve todo.

### Validación en backend (activa)

Los handlers sensibles **SÍ** validan permisos del usuario efectivo vía `ensurePermission(dataSource, getCurrentUser, 'CODIGO')` / `checkPermission(...)` (`electron/utils/auth.utils.ts`). El frontend ya no es la única frontera. Detalles:
- **Cache** de permisos por usuario con TTL 30s (un cambio de rol surte efecto en ≤30s).
- **`withRequestUser` (AsyncLocalStorage):** en modo server el rpc-router envuelve cada invocación con el usuario del JWT; `checkPermission` lee de ahí primero, cayendo a `getCurrentUser()` en standalone/desktop.
- `clearPermissionCache(usuarioId?)` invalida manualmente.

> Riesgo residual: el IPC `setCurrentUser` sigue existiendo y un usuario autenticado podría intentar spoofear a otro. Mitigado porque cada handler revalida permisos contra el usuario efectivo. Ver [reference/known-bugs.md](../reference/known-bugs.md).

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

## Estado de features de seguridad

| Feature | Estado |
|---|---|
| Hash de contraseña (bcryptjs) | ✅ implementado |
| JWT secret en keytar (no hardcodeado) | ✅ implementado |
| Refresh tokens | ✅ en modo server/client |
| Validación de permisos en backend | ✅ `ensurePermission`/`checkPermission` en handlers sensibles |
| Forzar cambio de password (admin default) | ✅ `mustChangePassword` + dialog bloqueante post-login |
| Recuperación de contraseña | ❌ |
| Bloqueo por intentos fallidos | ❌ |
| 2FA / MFA | ❌ |
| Audit log de operaciones sensibles | Parcial (BaseModel.createdBy/updatedBy) |

## Usuario administrador inicial (seed automático)

`seedSystemData` → `seedAdminUserAndRole` crea (solo si la tabla `usuarios` está vacía):
1. Persona "ADMINISTRADOR SISTEMA"
2. Usuario `admin` / password `admin` (bcrypt) con `mustChangePassword = true`
3. Rol ADMINISTRADOR vinculado a TODOS los permisos.

En el primer login con `admin/admin`, un dialog bloqueante obliga a cambiar la password antes de cargar el dashboard. `syncAdminPermissions` corre en cada arranque para que el rol ADMINISTRADOR siempre tenga todos los permisos (clave al agregar permisos nuevos). También hay roles plantilla (`GERENTE`, `CAJERO`, `MOZO`) seedeados con permisos curados. Ver [seed-system.md](seed-system.md).

## Dashboard shortcuts (personalización)

`src/app/database/entities/personalizacion/dashboard-shortcut.entity.ts`:
- `dashboardKey` (HOME, FINANCIERO, VENTAS, etc.) — qué dashboard contiene este shortcut
- `titulo`, `icono`, `color`, `orden`
- `targetType` (CAJA_MAYOR_DETALLE, ACREDITACIONES_POS, etc.) + `targetData` (JSON con params)
- `usuario_id` nullable: si null = global, si tiene = personal

`HomeComponent` los carga y permite al usuario armar su pantalla de inicio personalizada. Routing por `targetType` está en `src/app/shared/utils/dashboard-shortcut-router.ts`.
