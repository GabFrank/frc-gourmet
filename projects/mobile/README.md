# FRC Gourmet — Cliente Mobile (PWA)

Cliente web mobile/tablet de FRC Gourmet. Vive en el **mismo workspace** que el desktop
(Electron) y consume el **mismo backend** (Fastify del modo `server`) por HTTP.

> Plan y bitácora completos: [`../../docs/arquitectura/mobile-pwa-plan.md`](../../docs/arquitectura/mobile-pwa-plan.md)
> y [`../../docs/arquitectura/mobile-pwa-skill-notes.md`](../../docs/arquitectura/mobile-pwa-skill-notes.md).

## Arquitectura en una imagen

```
PWA (projects/mobile, Angular standalone)
  UI mobile-first (cards, bottom-nav/nav-rail)  — NO reutiliza UI del desktop
   └─ RepositoryService (abstract, @frc/shared-core)
        └─ RepositoryIpcService (reusado) que lee window.api
             └─ window.api = shim HTTP (core/data/api-http.ts)
                  └─ POST /api/rpc {method, params}  + Bearer + refresh 401
                     login/logout → /api/auth/*
   HTTPS (mesh headscale, LAN-first)  →  Fastify (modo server) en el PC local
```

- **Datos:** se reutiliza `RepositoryIpcService` del desktop. En vez del `window.api` de
  Electron, en mobile se instala un **shim HTTP** (`installApiHttp()` en `main.ts`) que rutea
  cada método a `POST /api/rpc`. El mapa método→canal se genera de `preload.ts`.
- **Auth:** login a `/api/auth/login`, access+refresh tokens en `localStorage`, refresh
  automático en 401, logout automático si el refresh falla (`sessionExpired$`).
- **Navegación:** Angular Router (NO el TabsService del desktop). `ShellComponent` = layout
  autenticado con nav-rail (tablet) / bottom-nav (teléfono).
- **Código compartido:** `@frc/shared-core` (path-alias a `src/app/shared-core/public-api.ts`):
  entities/enums/`RepositoryService`/`AuthService`/`PermissionService`/`ThemeService`.

## Correr en desarrollo

El backend debe estar en **modo server** (Sistema → Modo de operación → Servidor, puerto 7070).

```bash
# Servidor de dev de la PWA (puerto aparte del desktop)
npx ng serve mobile --port 4202
```

Como en dev la PWA corre en `:4202` y la API en `:7070` (distinto origen), apuntá el cliente
al server **antes de loguear** (consola del navegador):

```js
localStorage.setItem('frc_mobile_server_url', 'http://localhost:7070');
location.reload();
```

(En producción la PWA la sirve el propio Fastify en `/`, mismo origen → no hace falta esto.)

### Validar el backend sin la app desktop

```bash
npx ts-node --project tsconfig.typeorm.json scripts/test-server-standalone.ts
# Fastify real en :7070 con SQLite temporal + usuario admin/admin
```

## Build y deploy

```bash
npm run build:mobile                # = ng build mobile → genera dist/mobile (base-href "/")
npm run generate:mobile-api         # regenerar el mapa de canales tras tocar preload.ts
```

`npm run build:mobile` es el alias de `ng build mobile` declarado en el `package.json` raíz.
También se ejecuta como parte de `npm run build:dev` y `npm run build:prod` (que primero
buildean el desktop y luego la PWA).

El Fastify (modo server) sirve `dist/mobile` en `/` automáticamente (ver `electron/server/server.ts`,
opción `staticRoot`). En empaquetado, `dist/mobile/**` está en `asarUnpack`.

> **TLS:** la PWA "de verdad" (service worker / instalable) requiere HTTPS. Pendiente: TLS del
> mesh headscale (`tailscale serve`/cert, o Caddy/CA privada). Por ahora se usa HTTP plano en LAN.

## Cómo agregar una pantalla CRUD

1. **Verificar el backend:** que exista el handler de escritura real
   (`ipcMain.handle('create-X' …)` en `electron/handlers/`), no solo el método del repo.
   Grepear el `ensurePermission('CODIGO')` para el permiso (nunca inventarlo).
2. **Lista** (`pages/<dominio>/<x>/<x>-list.page.ts`): usa clases globales `_crud.scss`
   (`crud-page`, `crud-list`, `crud-card`, `crud-chip`, `crud-fab`), búsqueda + botón Filtrar
   (sin live), acciones en `mat-menu`, `canEdit` reactivo desde `PermissionService.codigos$`.
3. **Form** (`<x>-edit.page.ts`): ruta **top-level** (full-screen, ANTES del shell en
   `app.routes.ts`), Reactive Forms, toolbar back+guardar, `location.back()`.
4. **Rutas:** lista como hijo del shell; form como ruta top-level. Registrar el sub-módulo en
   el `SectionIndexPage` del dominio (`enabled: true`).
5. **UPPERCASE:** lo hace el handler en la mayoría; si no, aplicarlo en el componente.
6. `npx ng build mobile` para validar (el pre-commit de husky NO chequea el proyecto mobile).

## Convenciones

- Componentes **standalone**, lazy-loaded. Sufijo `Page` para páginas ruteadas.
- Cards, nunca tablas (sin scroll horizontal). Solo scroll vertical.
- Colores por variables de tema (dark/light). Estados verde/naranja/gris.
- `| number:'1.0-2'` para montos. Sin funciones en templates (pre-computar / pipes).
