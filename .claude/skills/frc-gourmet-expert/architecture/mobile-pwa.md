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

## Subida por QR desde el celular (2026-07-10)

Ruta **pública** `/upload?session=<id>` (sin `authGuard`) → `pages/upload/qr-upload.page.ts`. Se abre al
escanear el QR mostrado en el desktop. El token de sesión es la credencial (sin login). Sube via **fetch
same-origin** a `/api/qr-upload/:id` (NO usa el shim RPC). 3 acciones: escanear documento / tomar foto
(`<input capture>`) / elegir archivo. **`document-scanner.component.ts`:** cámara + ajuste de 4 esquinas +
corrección de perspectiva (homografía + bilineal en canvas puro, sin OpenCV) + realce; requiere HTTPS
(`getUserMedia`). **FAB de QR en la home** (`home.page.ts:scanQr()`) reusa `BarcodeScannerDialogComponent`
para leer el QR del desktop y navegar a `/upload`. Contraparte desktop/server → [domains/archivos-y-adjuntos.md](../domains/archivos-y-adjuntos.md) §9.

## Cobertura (MVP administrativo, 2026-05-21)

CRUD: RRHH (Cargos, Turnos, MotivosVale, Feriados, Personas, Usuarios+roles, Funcionarios, Clientes,
TipoCliente), Productos (Familias, Subfamilias, Adicionales), Compras (Cat. compra), Financiero (Cat. gasto).
Read-only: Vales, Liquidaciones, Penalizaciones, Bonos, Aguinaldos, Asistencias, Horas extra, Permisos,
Notificaciones, Cajas, CxC, Compras, Proveedores, Productos, Comisiones (reglas/equipos/liq).
**Diferido:** Sabores/Recetas (variaciones), Monedas (sin handler create),
Préstamos, Config RRHH, Reportes.

## Cobertura Caja Mayor mobile (actualizado 2026-07-28)

> **La snapshot de mayo decía "Caja Mayor diferida" — YA NO es cierto.** El código mobile
> (`projects/mobile/src/app/pages/financiero/caja-mayor/`) tiene el módulo operativo construido y
> el manual de usuario (`manual-usuario/mobile/05-modulo-finanzas.md`) lo refleja. El gap real es
> el subconjunto "avanzado" del desktop, no el módulo entero.

**Implementado en mobile:**
- `caja-mayor-list.page` — lista de cajas mayor como cards con saldo resumido por moneda + estado.
- `caja-mayor-detalle.page` — detalle operativo: saldos por moneda×formaPago, cards de cuentas
  bancarias visibles (lee `getCajaMayorConfiguracion` para filtrar), historial de movimientos
  paginado (PAGE_SIZE=15, "Cargar más"), toggle "Ver anulaciones", menú Ingreso/Egreso, y anular
  movimiento (gate `CAJA_MAYOR_OPERAR`).
- Operaciones full-screen en `caja-mayor/ops/`: **gasto** (`gasto-form.page`), **entrada varia**,
  **ajuste +/−** (`ajuste-nuevo.page` por `:signo`), **vale confirmado** (`vale-nuevo.page`),
  **ingresar retiro** (`ingresar-retiro.page`), **pagar compras en lote** (`pagar-compras.page`).
- Home muestra accesos directos a las cajas mayor ABIERTAS (`FINANCIERO_CAJA_VER`).
- Diseño: 1 moneda + 1 forma de pago por operación (el reparto multi-moneda queda en desktop).

**NO implementado en mobile (canales disponibles vía shim HTTP, falta UI):**
1. Operaciones financieras (`create/anular-operacion-financiera`): cambio divisa, depósito/retiro
   bancario, transferencia entre cajas, transferencia bancaria.
2. Cheques / chequeras (`emitir/cobrar/anular-cheque`, `create-chequera`).
3. Cobro de CxC (`cobrar-cpc-cuota`) — mobile tiene CxC solo lectura.
4. Pago de CxP genérico (`pagar-cpp-cuota`) + resúmenes `get-caja-mayor-cpp/cpc-resumen` en el
   sidebar del detalle (mobile solo tiene el pago de cuotas de **compras** en lote).
5. POS / acreditaciones bancarias (`create-acreditacion-pos`, `acreditar-transferencia-bancaria`,
   `create-maquina-pos`).
6. Ciclo de vida de la Caja Mayor: crear (`create-caja-mayor`) y cerrar (`cerrar-caja-mayor`).
7. Editar config de caja mayor (`save-caja-mayor-configuracion`) — mobile solo la lee.
8. Egreso caja inicial (`egreso-caja-inicial`) + abrir caja desde conteo.
9. Editar movimiento (`edit-caja-mayor-movimiento`) — mobile solo anula.
10. Dashboard/KPIs de caja mayor (`get-dashboard-caja-mayor-kpis`).

## Reglas al construir pantallas

1. **Verificar que exista el handler de escritura** (`create-X`/`update-X`/`delete-X`), no solo el método
   abstracto del repo. Ej: `Moneda`/`Proveedor` declaran create en el repo pero **no hay handler** → 404.
2. Permisos: grepear el `ensurePermission('CODIGO')` real del handler (nunca inventar; ver
   `feedback_permisos_nombres_reales`).
3. UPPERCASE: lo hace el handler en la mayoría; si no, aplicarlo en el componente.
4. El pre-commit de husky **solo** typechequea Electron; validar el mobile con `npx ng build mobile`.
5. Sufijo `Page` para componentes de página (configurado en `.eslintrc` del mobile).
