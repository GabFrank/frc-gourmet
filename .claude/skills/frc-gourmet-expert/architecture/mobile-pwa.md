# Cliente Mobile (PWA)

Cliente web mobile/tablet en el **mismo workspace** (`projects/mobile`), que consume el backend
Fastify del **modo server** por HTTP. UI **100% nueva** mobile-first (no reutiliza nada del desktop);
sí reutiliza la **lógica de datos**. Branch de desarrollo: `feat/mobile-pwa-cliente`.

> Estado/bitácora viva: `docs/arquitectura/mobile-pwa-plan.md` y `docs/arquitectura/mobile-pwa-skill-notes.md`.
> README operativo: `projects/mobile/README.md`.

## Workspace multi-proyecto

`angular.json` tiene 2 apps: `frc-gourmet` (desktop, existente) y `mobile` (`projects/mobile`).
Código compartido vía **path-alias** `@frc/shared-core` → `src/app/shared-core/public-api.ts`
(barrel que re-exporta browser-safe: entities, enums, `RepositoryService` abstract,
`RepositoryIpcService`, `AuthService`, `PermissionService`, `ThemeService`, `AppModeService` como token).
Migración incremental: el desktop sigue importando por rutas relativas; el mobile SIEMPRE por el alias.

## Capa de datos (lo importante)

- **`repository-http.service.ts` quedó como skeleton y NO se usa.** El `mode=client` del desktop usa el
  **monkey-patch de `ipcRenderer.invoke` en `preload.ts`**. En browser puro no hay preload.
- **El mobile reutiliza `RepositoryIpcService`** (que lee `window.api`) y le inyecta un **shim HTTP**:
  `projects/mobile/src/app/core/data/api-http.ts` → `installApiHttp()` (llamado en `main.ts` ANTES del
  bootstrap) instala un `window.api` (Proxy) que rutea `método → canal → POST /api/rpc {method, params}`.
- **Mapa método→canal generado** de `preload.ts`: `scripts/generate-mobile-api-map.js`
  (`npm run generate:mobile-api`) → `api-channel-map.generated.ts` (~742 canales). Regenerar tras tocar preload.
- **Auth:** `login`/`logout` van a `/api/auth/*` (special-case en el shim); el resto a `/api/rpc` con
  `Authorization: Bearer`. Refresh automático en 401; tokens en `localStorage`. Si el refresh falla →
  `sessionExpired$` (`core/data/auth-events.ts`) → `AppComponent` hace logout + /login.
- **Same-origin por defecto** (Fastify sirve PWA+API). En dev: `localStorage.frc_mobile_server_url` o
  `window.__FRC_SERVER_URL__` para apuntar al server.
- **Modo:** `MobileAppModeService` reemplaza `AppModeService` (siempre `client`).
- **Conexión:** `ConnectionService` + `online$` (el shim lo flipea); `OfflineBannerComponent` global.

## UI / navegación

- `ShellComponent` (`core/shell/`): layout autenticado, nav-rail (≥768px) / bottom-nav (<768px) vía
  `BreakpointObserver`, toolbar con título dinámico (route.data.title) + theme toggle + logout.
- Navegación con **Angular Router** (no TabsService). Forms full-screen = rutas top-level (antes del shell);
  listas/índices = hijos del shell. `SectionIndexPage` genérico data-driven por dominio.
- Theme Material density 0 (touch), paleta FRC, dark/light vía `ThemeService` (`body.dark-theme`).
- **Cards, nunca tablas** (sin scroll horizontal). Clases CRUD globales en `projects/mobile/src/styles/_crud.scss`.
- `AppImagePipe` (`core/pipes/`): resuelve `app://…` → `/api/files/by-url?url=…&token=…` para `<img>`.

## Server (servir la PWA)

`electron/server/server.ts` acepta `staticRoot`; si existe `dist/mobile` lo sirve en `/` (raíz, no `/app`
→ base-href default) con SPA fallback (`setNotFoundHandler` GET no-/api → index.html). `main.ts` pasa
`path.join(__dirname,'dist/mobile')`. `dist/mobile/**` en `asarUnpack`. **TLS del mesh: pendiente**
(headscale `tailscale serve`/cert o Caddy/CA privada); por ahora HTTP plano en LAN, sin service worker.

## Cobertura (MVP administrativo, 2026-05-21)

CRUD: RRHH (Cargos, Turnos, MotivosVale, Feriados, Personas, Usuarios+roles, Funcionarios, Clientes,
TipoCliente), Productos (Familias, Subfamilias, Adicionales), Compras (Cat. compra), Financiero (Cat. gasto).
Read-only: Vales, Liquidaciones, Penalizaciones, Bonos, Aguinaldos, Asistencias, Horas extra, Permisos,
Notificaciones, Cajas, CxC, Compras, Proveedores, Productos, Comisiones (reglas/equipos/liq).
**Diferido:** Sabores/Recetas (variaciones), Caja Mayor (needs cajaMayorId), Monedas (sin handler create),
Préstamos, Config RRHH, Reportes, y workflows de escritura (confirmar vale, generar liquidación, etc.).

## Reglas al construir pantallas

1. **Verificar que exista el handler de escritura** (`create-X`/`update-X`/`delete-X`), no solo el método
   abstracto del repo. Ej: `Moneda`/`Proveedor` declaran create en el repo pero **no hay handler** → 404.
2. Permisos: grepear el `ensurePermission('CODIGO')` real del handler (nunca inventar; ver
   `feedback_permisos_nombres_reales`).
3. UPPERCASE: lo hace el handler en la mayoría; si no, aplicarlo en el componente.
4. El pre-commit de husky **solo** typechequea Electron; validar el mobile con `npx ng build mobile`.
5. Sufijo `Page` para componentes de página (configurado en `.eslintrc` del mobile).
