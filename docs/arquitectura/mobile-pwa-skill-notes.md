# Notas para la skill `frc-gourmet-expert` — Iniciativa Mobile PWA

> Acumulador de todo lo que, al terminar la iniciativa mobile, hay que **agregar a la skill**
> (`.claude/skills/frc-gourmet-expert/`). También sirve de **tracker de progreso** del run autónomo
> (sobrevive a compactación de contexto). Branch: `feat/mobile-pwa-cliente`.

---

## A. Tracker de progreso (estado vivo)

Leyenda: ⬜ pendiente · 🟦 en progreso · ✅ hecho · ⛔ bloqueado (acción manual del usuario)

### F0 — Cimientos ✅
- ✅ Branch `feat/mobile-pwa-cliente` creada
- ✅ Plan persistido (`docs/arquitectura/mobile-pwa-plan.md`)
- ✅ Este doc de notas creado
- ✅ `projects/mobile` (application) scaffold — standalone bootstrap, sin NgModule
- ✅ Path-alias `@frc/shared-core` + barrel `src/app/shared-core/public-api.ts`
- ✅ PWA shell mínimo (HomePage lazy standalone) que inyecta `ThemeService` y usa enum compartido
- ✅ Build mobile dev OK + desktop dev OK (sin regresión)
- ✅ Commit F0

### F1 — Capa de datos + auth ✅ (código; E2E runtime depende de server del usuario)
- ✅ Generador `scripts/generate-mobile-api-map.js` → `api-channel-map.generated.ts` (742 métodos)
- ✅ Transporte RPC HTTP `api-http.ts` (Proxy `window.api` + Bearer + refresh 401 + tokens en localStorage)
- ✅ Reuso de `RepositoryIpcService` como repo HTTP (vía el shim `window.api`)
- ✅ Login HTTP (`/api/auth/login` + refresh + logout) adaptado al shape del renderer
- ✅ Estado "sin conexión" (`connection-state.ts` + `ConnectionService`)
- ✅ AuthService/PermissionService reusados; `MobileAppModeService` (modo siempre 'client')
- ✅ Login page (Reactive Forms) + authGuard + HomePage smoke (lista monedas vía RPC)
- ✅ Build mobile dev + prod OK (prod 660 KB raw / 156 KB transferido)
- ✅ Commit F1
- ✅ **Validación E2E del contrato (2026-05-21)** vía `scripts/test-server-standalone.ts` (Fastify real,
  SQLite tmp, admin/admin): health, version (705 handlers), `POST /api/auth/login` devuelve
  `{accessToken, refreshToken, sessionId, usuario}` (exacto lo que espera el shim), `POST /api/rpc`
  con Bearer → `{result}` 200, sin Bearer → 401. **El shim HTTP coincide 100% con el server real.**
- ✅ **Validación del camino de ESCRITURA (2026-05-21):** `create-permission` (write no-gateado con objeto
  param) → `{result:{...}}` persistido con `createdBy`; `get-permissions` lo devuelve. `create-cargo`
  (gateado, admin sin permisos) → **403 `PERMISO REQUERIDO: RRHH_CONFIG_EDITAR`** (enforcement OK, la UI lo
  detecta con `/PERMISO/`). ⇒ con un usuario con permisos reales, las altas/ediciones funcionarán.
- ✅ **Build desktop sin regresión (2026-05-21):** `ng build frc-gourmet` verde tras toda la iniciativa.

### F2 — Infra server 🟦 (servir PWA ✅ · TLS ⛔)
- ✅ `@fastify/static` sirviendo `dist/mobile` en **`/`** (raíz, no `/app` — evita base-href) + SPA fallback
- ✅ `staticRoot` en `ServerOptions`; `main.ts` pasa `path.join(__dirname,'dist/mobile')`
- ✅ `dist/mobile/**` agregado a `asarUnpack` (compat `@fastify/static` con asar en prod)
- ✅ Electron tsc OK · Commit F2 (parte servir)
- ⛔ **TLS del mesh** — necesita datos de tu headscale (`tailscale serve`/cert vs Caddy/CA privada)
- ⏳ Validación: con `mode=server` + `ng build mobile`, abrir `http://<server>:7070/` desde otro dispositivo

### F3 — Shell mobile + theming ✅ (imágenes diferidas a la 1ª ola que las use)
- ✅ `ShellComponent` responsive: nav-rail en tablet/desktop, bottom-nav en teléfono (BreakpointObserver)
- ✅ Toolbar con título dinámico (route data) + theme toggle + menú usuario/logout
- ✅ Theme Material (paleta FRC rojo, density 0 touch) dark/light vía `ThemeService` (`body.dark-theme`)
- ✅ `OfflineBannerComponent` global (estado sin conexión)
- ✅ `PlaceholderPage` data-driven para secciones pendientes; HomePage dashboard con accesos rápidos
- ✅ Rutas con shell como layout + hijos (Inicio/RRHH/Financiero/Compras/Productos)
- ✅ Build dev + prod OK (prod 882 KB raw / 176 KB gz)
- ⏳ Resolución de imágenes vía `/api/files` (fetch→blobURL) → se hace en la 1ª ola que muestre imágenes
- ✅ Commit F3

### F4..Fn — Olas administrativas
- 🟦 **Ola 1 RRHH** — patrón CRUD EJEMPLAR establecido con **Cargos** (lista + form full-screen):
  - `ConfirmDialogComponent` reutilizable (MatDialog)
  - `SectionIndexPage` genérico data-driven (índice de sub-módulos por dominio)
  - `CargosListPage` (búsqueda+Filtrar, cards, mat-menu acciones, FAB, permisos reactivos)
  - `CargoEditPage` (Reactive Forms, form full-screen con toolbar back+guardar)
  - permisos: `get-cargos` abierto; create/update/delete requieren `RRHH_CONFIG_EDITAR`
  - **El resto de RRHH y las olas 2-5 replican este patrón.**
- ⏳ **GATE antes de producir en masa:** validar E2E el patrón (login + Cargos CRUD) contra el server real.
- 🟦 **Ola 4 Productos** (catálogos): **Familias**, **Subfamilias** (FK-select → Familia), **Adicionales**.
  Sección Productos activada. Permisos `CATEGORIAS_GESTIONAR` / `ADICIONALES_GESTIONAR`. UPPERCASE en componente
  (estos handlers NO uppercasean). Establece el **patrón FK-select** (cargar `getFamilias` + `mat-select`).
- 🟦 **Ola 3 Compras**: Categorías de compra (`COMPRAS_GESTIONAR`). Sección Compras activada.
- 🟦 **Ola 2 Financiero**: Categorías de gasto (`CAJA_MAYOR_OPERAR`). Sección Financiero activada.
  (NOTA: `Moneda` NO tiene handler create → descartada; Cajas/Caja Mayor pendientes, más complejos.)
- **Las 4 secciones del bottom-nav ya tienen contenido real** (RRHH×4, Productos×3, Compras×1, Financiero×1).
- ⬜ Ola 1 resto RRHH (Personas/Usuarios/Funcionarios/Vales...) · ⬜ resto Financiero/Compras/Productos · ⬜ Clientes/Comisiones

> **LECCIÓN:** verificar que exista el **handler de escritura** (`create-X`/`update-X`/`delete-X` en
> `electron/handlers/`), no solo el método abstracto del repo. Ej: `Moneda` declara createMoneda en el
> repo pero **no hay handler `create-moneda`** → calzaría 404. Confirmar antes de construir el CRUD.

### Worklist desatendido (2026-05-21, "no parar hasta terminar") — COMPLETADO el grueso
Estrategia: **CRUD completo** donde el handler de escritura existe y el form es manejable; **lista/vista**
donde el alta es un workflow complejo (no construir a ciegas). Commit por batch.
- [x] RRHH CRUD: Personas, Usuarios (password+roles diff), Funcionarios (create full/edit parcial), + Cargos/Turnos/MotivosVale/Feriados
- [x] RRHH vistas: Vales, Liquidaciones, Penalizaciones, Bonos, Aguinaldos, Asistencias, Horas extra, Permisos
- [x] Clientes: TipoCliente (CRUD), Clientes (CRUD doble FK)
- [x] Financiero: Categorías de gasto (CRUD), Cajas (vista), CxC (vista)
- [x] Compras: Categorías de compra (CRUD), Compras (vista), Proveedores (vista)
- [x] Productos: Familias/Subfamilias/Adicionales (CRUD), Productos (vista)
- [x] Comisiones: Reglas/Equipos/Liquidaciones (vista, bajo Financiero)
- **Diferido (complejo/sin handler, requiere sesión atendida):** Sabores/Recetas (variaciones), Caja Mayor
  (requiere cajaMayorId), Monedas (sin handler create), Notificaciones (shape distinto), Préstamos,
  Config RRHH, Reportes, y los workflows de escritura (confirmar vale, generar liquidación, cambiar
  cargo/salario de funcionario, cobrar/pagar).
- Acciones manuales del usuario: TLS headscale, mode=server real, testing visual, validar handlers de
  escritura en runtime (la validación E2E cubrió login+RPC; las altas concretas se prueban con tu server).

### Patrón CRUD a replicar (referencia para nuevas pantallas)
1. **Lista** (hijo del shell): `getX()` → cards; búsqueda con botón Filtrar (sin live); acciones en
   `mat-menu` (`more_vert`); FAB crear; `canEdit` reactivo desde `PermissionService.codigos$`.
2. **Form** (ruta top-level full-screen, ANTES del shell): Reactive Forms; toolbar back+guardar;
   `getX(id)` patch en edición; `createX`/`updateX`; snackbar; `location.back()`.
3. **Eliminar:** `ConfirmDialogComponent` → `deleteX` → recargar.
4. **Permisos:** grepear el código real del handler (`ensurePermission`), nunca inventar.
5. **UPPERCASE:** lo aplica el handler; no duplicar en el componente salvo necesidad.
6. **Sección:** registrar el sub-módulo en el `SectionIndexPage` del dominio (`enabled:true`) + rutas.

---

## B. Contenido a agregar a la skill (se va llenando durante la ejecución)

### B.1 Nuevo doc propuesto: `architecture/mobile-pwa.md`
- Estructura multi-proyecto del workspace (`projects/mobile` + `@frc/shared-core`).
- Diagrama de capas PWA → `/api/rpc`.
- Cómo funciona el shim `apiHttp` y el generador desde `preload.ts`.
- Auth HTTP (login/refresh, Bearer, manejo de 401).
- Hosting por Fastify (`/app`) + TLS del mesh.
- Política offline (network-only para data, SW solo app-shell).

### B.2 Correcciones a docs existentes de la skill
- `architecture/cliente-servidor.md`: aclarar que **`repository-http.service.ts` quedó como skeleton**
  y que el `mode=client` real usa el **monkey-patch de `ipcRenderer.invoke` en preload**, NO la clase HTTP.
  (La sección "F6 Mobile (fuera de scope)" pasa a apuntar a `architecture/mobile-pwa.md`.)
- `architecture/overview.md`: "Passwords en texto plano" está **desactualizado** — el server usa
  `bcrypt` (`verifyPassword`). Revisar también el estado de auth en `auth-permissions.md`.

### B.3 Quick-facts a actualizar en el índice de la skill
- Agregar un 4º modo conceptual: PWA mobile (browser) que habla al `mode=server` por HTTP.
- Nota: la PWA reutiliza `@frc/shared-core` (entities/enums/abstract repo/servicios browser-safe) y
  **no** reutiliza UI del desktop.

### B.4 Reglas/convenciones nuevas detectadas (candidatas a memoria + skill)
- **UI mobile = 100% nueva** (no se reutiliza nada del desktop), Material 15 con density 0 (touch),
  paleta FRC (rojo primario). Componentes standalone + lazy routes.
- **Navegación:** Angular Router (NO TabsService). Shell responsive: nav-rail ≥768px / bottom-nav <768px
  (`BreakpointObserver.observe('(max-width: 767px)')`). Destinos en `core/shell/nav.ts`.
- **Theming:** reusa `ThemeService` (togglea `body.dark-theme`) + `theme-variables.scss` (CSS vars). Mobile
  define su propio theme Material en `projects/mobile/src/styles.scss` (density 0, no -3 del desktop).
- **Título de página:** vía `route.data.title` leído por el shell en NavigationEnd.
- **Offline:** `ConnectionService` (envuelve `online$` que flipea el transporte) + `OfflineBannerComponent`.
- **Estructura de carpetas mobile:** `core/` (data, shell, guards, services, components), `pages/` (features),
  `@frc/shared-core` para lo compartido.

---

## C. Decisiones técnicas tomadas durante la ejecución (bitácora)

- 2026-05-20 — `projects/mobile` se generó con `ng g application` (no soporta `--standalone` en
  Angular CLI 15.2) y se convirtió a **standalone bootstrap** a mano (borrados `app.module.ts`,
  `app-routing.module.ts`; `main.ts` usa `bootstrapApplication` + `provideRouter` + `provideHttpClient`).
- 2026-05-20 — `withComponentInputBinding` es de Angular 16; en 15.2 NO existe. Usar `provideRouter(routes)` pelado.
- 2026-05-20 — El build mobile **requiere `"types": ["node"]`** en `projects/mobile/tsconfig.app.json`
  porque los `.d.ts` de `typeorm` (que llegan vía las entities del repo abstracto) referencian
  `Buffer`/`fs`/`stream`/`events`. Son type-only ⇒ no se bundlean en runtime. Mismo criterio que el desktop.
- 2026-05-20 — Compartir código se hace por **path-alias** en root `tsconfig.json`
  (`@frc/shared-core` → `src/app/shared-core/public-api`), NO moviendo archivos todavía. El desktop
  queda intacto (no importa el alias). El barrel solo re-exporta código browser-safe.
- 2026-05-20 — El pre-commit de husky **solo** typechequea `tsconfig.electron.json` (no toca el
  proyecto mobile). Validar el mobile siempre con `npx ng build mobile` a mano.
- 2026-05-20 — **Diseño del data layer mobile (F1):** se reusa `RepositoryIpcService` tal cual; el
  truco es que `installApiHttp()` setea un `window.api` (Proxy) ANTES del bootstrap. El Proxy mapea
  `método → canal` (mapa generado de preload.ts) → `POST /api/rpc {method, params}`. login/logout van
  a `/api/auth/*`. Refresh JWT automático en 401. Tokens en localStorage (persisten reload, a
  diferencia del preload que los tiene en memoria). Same-origin por defecto (Fastify sirve PWA+API).
- 2026-05-20 — `getCurrentUser/setCurrentUser/getCurrentUserId` de `RepositoryIpcService` usan un
  `BehaviorSubject` interno (no `window.api`) ⇒ funcionan en mobile sin tocar el shim.
- 2026-05-20 — **typeorm runtime se bundlea en mobile** porque `RepositoryIpcService` importa enums
  que viven en archivos `*.entity.ts` (con `@Entity`). En dev infla vendor (~4MB) pero en **prod se
  tree-shakea** (total 660 KB raw / 156 KB gz). Deuda futura: separar enums de las entities para no
  arrastrar typeorm al browser.
- 2026-05-20 — `AppModeService` se exporta del barrel SOLO como token DI; mobile lo reemplaza con
  `MobileAppModeService` (devuelve `mode:'client'`). La clase original (con `window.api`) nunca se
  construye. `AuthService` en client-mode restaura sesión desde localStorage (no llama restoreSession).
- 2026-05-20 — Para regenerar el mapa de canales tras tocar `preload.ts`: `npm run generate:mobile-api`.
- 2026-05-21 — **Cómo validar F1 sin tocar la app del usuario:** `npx ts-node --project tsconfig.typeorm.json
  scripts/test-server-standalone.ts` levanta Fastify real en :7070 con SQLite tmp + admin/admin (no toca
  Postgres ni `app-settings.json`). Curl health/version/login/rpc. Para curl al puerto: usar
  `dangerouslyDisableSandbox` en Bash.
- 2026-05-21 — **app-settings.json** vive en `~/Library/Application Support/frc-gourmet/`. El modo
  (standalone/server/client) se cambia ahí (`"mode"`). El server start usa `settings.network?.serverPort
  || 7070`. **El harness BLOQUEA editar este archivo (fuera del repo)** — para ponerlo en server hay que
  hacerlo desde la UI (Sistema → Modo de operación) o con autorización explícita del usuario.
- 2026-05-21 — DB real del usuario: **Postgres** (`frc_gourmet@localhost`, user `franco`), deviceId 2.
- 2026-05-20 — **F2 servir PWA:** se sirve en la **raíz `/`** del Fastify (no `/app`) porque el server
  solo atiende clientes remotos (el operador del PC usa el desktop local con `loadFile`). Raíz ⇒ base-href
  default `/` sin cambios. La API queda en `/api/*` (rutas específicas matchean antes que el estático).
  SPA fallback vía `setNotFoundHandler` (GET no-/api → index.html). `@fastify/static@6` (compat fastify 4.10).
- 2026-05-20 — Para servir bajo un subpath en el futuro habría que buildear el mobile con `--base-href /sub/`.
- 2026-05-20 — Prod packaging: `dist/mobile/**` en `asarUnpack` para que `@fastify/static` lea archivos
  reales (asar + `send` puede fallar). Validar al primer `electron:build` con mobile incluido.
