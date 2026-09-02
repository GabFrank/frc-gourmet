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
- `mustChangePassword` — fuerza cambio de password en el próximo login. Lo prende el admin default `admin/admin` del seed, la **creación rápida de usuario** y el **reset administrativo** (contraseña temporal). Ver "Contraseña temporal" abajo — la bandera **bloquea TODOS los handlers con `ensurePermission`**, no sólo la navegación.
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

## Contraseña temporal (`mustChangePassword`)

Se prende en tres lugares: el seed del admin (`seed-system.ts`), la **creación rápida de usuario** (`create-usuario-rapido-dialog`) y el **reset administrativo** (`reset-password-dialog`, que genera un código numérico temporal).

Mientras la bandera está prendida, `checkPermission` (`electron/utils/auth.utils.ts`) devuelve **FORBIDDEN `DEBE CAMBIAR SU CONTRASEÑA ANTES DE CONTINUAR`** en *todo* handler que llame `ensurePermission` — no es sólo una restricción de navegación. Un usuario en ese estado puede loguearse y ver la app, pero cada acción que muta datos falla (ej. `createVentaItem` → "no se pudo agregar el ítem"). `change-password` es self-service y no pasa por el guard, así que siempre puede cumplir.

Dónde se cambia:

| Cliente | Camino |
|---|---|
| Desktop / web `/admin` | Diálogo bloqueante post-login (`ForceChangePasswordDialogComponent`, `modo: 'forzado'`) **o** menú de usuario → "Cambiar mi contraseña" (`modo: 'self'`, también en el buscador global, hoja `cambiar-password`) |
| PWA mobile | `authGuard` redirige a `/cambiar-password` |

> **Bug corregido (2026-08):** `/api/auth/login` devolvía un `usuario` recortado **sin** `mustChangePassword`, así que en PWA mobile, web `/admin` y desktop en `mode=client` ni el guard ni el diálogo se disparaban. El usuario entraba normal y después TODO fallaba con un error genérico, porque el `rpc-router` sí carga el `Usuario` completo de la BD y el guard lo bloqueaba. La ruta ahora devuelve la bandera. Si tocás el payload de login, **no la saques**.

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

`electron/handlers/permissions.handler.ts` — el array `SEED_PERMISOS` define **101 permisos** pre-cargados al startup (`seedPermissions()`, idempotente por `codigo`). Agregar un permiso = añadirlo al array; al siguiente arranque se inserta y `syncAdminPermissions()` se lo asigna al rol ADMINISTRADOR.

Categorías (prefijos): `HOME_*`, `VENTAS_*`, `COMANDAS_KDS_*`, `FACTURACION_*` (VER, EMITIR, ANULAR, TIMBRADO_GESTIONAR, PLANTILLA_GESTIONAR, CONFIGURAR — agregados 2026-07 en el barrido P0), `RRHH_*`, `PERSONAS_*`, `USUARIOS_*`, `CLIENTES_*`, `COMISION_*`, `PRODUCTOS_*` / `RECETAS_*` / `SABORES_*` / `ADICIONALES_*` / `INGREDIENTES_*` / `STOCK_MOVIMIENTO_*` / `CATEGORIAS_*`, `COMPRAS_*`, `FINANCIERO_*` / `CAJA_MAYOR_*` / `MONEDAS_*` / `CPC_*`, `EMPRESA_*`, `IMPRESORAS_*` / `SECTORES_IMPRESORAS_*` / `DISPOSITIVOS_*`, `SISTEMA_*` (BACKUP, CONFIGURAR_IA, BD_CONFIGURAR, MODO_CONFIGURAR, PERMISO_GESTIONAR, ROL_GESTIONAR).

> **Barrido de guards backend P0 (2026-07):** una auditoría encontró ~172 handlers que mutan datos sin `ensurePermission` — dominios "legacy" enteros (ventas, compras, financiero, productos, recetas, facturación) nunca lo recibieron. Fase P0 (money/destructivo) ya remediada: **facturación** (12 handlers + 6 permisos `FACTURACION_*` nuevos), **ventas** (createVenta/items/comandas/delivery → `VENTAS_PDV`; `procesarStockVenta`/`revertirStockVenta` → `VENTAS_PDV` — NO `STOCK_MOVIMIENTO_REGISTRAR`, para no romper la venta del cajero), **compras** (pagos + CRUD compra/proveedor → `COMPRAS_GESTIONAR`/`PROVEEDORES_GESTIONAR`), **financiero** (monedas → `MONEDAS_GESTIONAR`, conteos/cajas → `FINANCIERO_CAJA_GESTIONAR`), **banking** acreditaciones, **backup** config/trigger, **files** save/delete. **P0b remediada** (mismo barrido): **productos** (16 → `PRODUCTOS_GESTIONAR`), **recetas** (17 → `RECETAS_GESTIONAR`/`ADICIONALES_GESTIONAR`/`SABORES_GESTIONAR`), **config del PdV** (40 → `VENTAS_PDV_CONFIGURAR` nuevo; reservas → `VENTAS_PDV`), personas (`crear-cliente-*` → any-of `[VENTAS_PDV, CLIENTES_GESTIONAR]`), imágenes de perfil (any-of), caja-mayor config, config RRHH, notificaciones RRHH, factura-import. **El backend de mutación queda cubierto.** **P2 (gating UI desktop) hecha:** ~50 listas/detalles envueltas con `*appHasPermission` (mismos códigos que enforca el backend), hojas de Facturación con `permiso`, Home con accesos rápidos filtrados. **P3 (gating PWA) hecha:** guard de ruta `permisoGuard` (`projects/mobile/src/app/core/guards/permiso.guard.ts`, lee `route.data.permiso`) aplicado a ~67 rutas + `SectionItem.permiso` con filtrado de tiles en `section-index.page` (antes las ~90 rutas eran deep-linkables). La defensa real sigue siendo el backend; P2/P3 son UX + defensa en profundidad. ⚠️ Los roles plantilla GERENTE/CAJERO se actualizaron con los permisos nuevos (`FACTURACION_*`, `VENTAS_PDV_CONFIGURAR`); **roles custom pueden necesitar grant manual**. Pendiente menor: gating de acciones de onboarding del Home y varios diálogos internos de la PWA.

→ Lista exacta: array `SEED_PERMISOS` en `permissions.handler.ts`. **Grepear el código real antes de usarlo** — no inventar nombres.

### Auditoría de roles ejecutada (2026-08-21)

El barrido de 2026-07 se preguntó *"¿este handler tiene guard?"*. Esta auditoría se pregunta otra cosa: **"¿el rol que hace esta operación tiene el permiso que el handler pide?"** — y ahí aparecieron ocho operaciones cotidianas bloqueadas para el rol que las hace.

`npm run test:roles-pdv` (`scripts/test-roles-pdv-e2e.ts`) es la forma de responderla: siembra los roles REALES con `seedSystemData` e **invoca los canales IPC reales** con un usuario de cada rol. Un canal cuenta como permitido si el error no es `FORBIDDEN` — las validaciones de payload corren después de `ensurePermission`, así que sirven igual para distinguir "no tiene permiso" de "no pudo hacerlo". La matriz de expectativas está en el propio archivo; si un rol no puede lo que le toca, el test falla y el fix va en `ROLES_PLANTILLA`.

**El patrón detrás de los ocho hallazgos: el permiso equivocado por proximidad.** Se eligió el que estaba a mano en el archivo, no el que describe la operación. Ninguno se nota probando como admin.

| Operación | Pedía | Problema |
|---|---|---|
| Abrir/cerrar la caja del turno (`create-conteo`, `create-conteo-detalle`, `create-caja`, `update-caja`) | `FINANCIERO_CAJA_GESTIONAR` | El CAJERO no lo tiene: no podía ni empezar el turno |
| Agregar una línea de cobro (`createPago`, `createPagoDetalle`, …) | `COMPRAS_GESTIONAR` | `Pago`/`PagoDetalle` son legacy de compras pero son el libro de pagos de las **ventas** |
| Cobrar con tarjeta / transferencia (`create-acreditacion-pos`, `acreditar-transferencia-bancaria`) | `BANCOS_GESTIONAR` | Ídem: acreditar es parte de cobrar |
| Pagar vale/compra desde el cajón, anular egreso | `PDV_PAGAR_*`, `PDV_ANULAR_EGRESO` | El GERENTE no los tenía. `PDV_ANULAR_EGRESO` no lo tenía **nadie** salvo ADMINISTRADOR |
| Ajustar una caja cerrada | `FINANCIERO_CAJA_AJUSTAR` | Existía en el catálogo, sin rol asignado |

**Dos permisos nuevos**, ambos partiendo uno existente en vez de ensancharlo — mismo padrón que `set-pdv-mesa-estado` vs `updatePdvMesa`:

- **`FINANCIERO_CAJA_OPERAR`** — abrir/cerrar la caja del turno y cargar sus conteos. CAJERO + GERENTE. `FINANCIERO_CAJA_GESTIONAR` queda para `delete-caja`, `delete-conteo` y el CRUD de `cajas_monedas`, que es **configuración global** de los formularios de conteo (qué monedas se habilitan), no parte del cierre: el cajero sólo la lee.
- **`VENTAS_COBRAR`** — registrar pagos, vuelto y acreditaciones. CAJERO + GERENTE, **no MOZO**. Antes nada decía "puede cobrar": el mozo no cobraba sólo porque le faltaba un permiso de COMPRAS. Los handlers de `Pago`/`PagoDetalle` piden `[VENTAS_COBRAR, COMPRAS_GESTIONAR]` y los de acreditación `[VENTAS_COBRAR, BANCOS_GESTIONAR]`, porque los dos flujos siguen vivos. `registrarCobroParcial` pasó de `VENTAS_PDV` a `VENTAS_COBRAR`.

⚠️ **`updateVenta` sigue en `VENTAS_PDV`**: un mozo puede marcar una venta CONCLUIDA. Es deliberado — el guard selectivo por `estado` rompería flujos de sistema (delivery, `cerrarVentasAbiertasMesa`) — y sin poder registrar una línea de pago el caso queda degenerado. Si hace falta cerrarlo, va con el escaneo completo de roles del backlog.

**Sin migración:** `seedPermissions` crea los permisos nuevos y `seedRolesPlantilla` agrega los faltantes a los roles existentes en cada arranque. Las instalaciones desplegadas se corrigen solas. ⚠️ Pero `seedRolesPlantilla` **nunca quita** permisos: los **roles custom** que alguien haya creado a mano no reciben nada y siguen rotos hasta que se los revise.

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
| Cambio de contraseña self-service | ✅ menú de usuario → "Cambiar mi contraseña" (desktop/web) y `/cambiar-password` (PWA) |
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
