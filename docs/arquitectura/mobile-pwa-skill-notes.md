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
- ⏳ Validación E2E real (login contra server) → requiere `mode=server` levantado por el usuario

### F2 — Infra server 🟦 (servir PWA ✅ · TLS ⛔)
- ✅ `@fastify/static` sirviendo `dist/mobile` en **`/`** (raíz, no `/app` — evita base-href) + SPA fallback
- ✅ `staticRoot` en `ServerOptions`; `main.ts` pasa `path.join(__dirname,'dist/mobile')`
- ✅ `dist/mobile/**` agregado a `asarUnpack` (compat `@fastify/static` con asar en prod)
- ✅ Electron tsc OK · Commit F2 (parte servir)
- ⛔ **TLS del mesh** — necesita datos de tu headscale (`tailscale serve`/cert vs Caddy/CA privada)
- ⏳ Validación: con `mode=server` + `ng build mobile`, abrir `http://<server>:7070/` desde otro dispositivo

### F3 — Shell mobile + imágenes
- ⬜ Navegación mobile (bottom-nav / drawer)
- ⬜ Theming dark/light
- ⬜ Resolución de imágenes vía `/api/files` (fetch→blobURL)
- ⬜ Commit F3

### F4..Fn — Olas administrativas
- ⬜ Ola 1 RRHH · ⬜ Ola 2 Financiero · ⬜ Ola 3 Compras · ⬜ Ola 4 Productos · ⬜ Ola 5 Clientes/Comisiones

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
- (se irá llenando: patrones UI mobile elegidos, librerías, breakpoints tablet/phone, etc.)

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
- 2026-05-20 — **F2 servir PWA:** se sirve en la **raíz `/`** del Fastify (no `/app`) porque el server
  solo atiende clientes remotos (el operador del PC usa el desktop local con `loadFile`). Raíz ⇒ base-href
  default `/` sin cambios. La API queda en `/api/*` (rutas específicas matchean antes que el estático).
  SPA fallback vía `setNotFoundHandler` (GET no-/api → index.html). `@fastify/static@6` (compat fastify 4.10).
- 2026-05-20 — Para servir bajo un subpath en el futuro habría que buildear el mobile con `--base-href /sub/`.
- 2026-05-20 — Prod packaging: `dist/mobile/**` en `asarUnpack` para que `@fastify/static` lea archivos
  reales (asar + `send` puede fallar). Validar al primer `electron:build` con mobile incluido.
