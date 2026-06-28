# Arquitectura — Visión general

## Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | Angular 15 (`15.2.9`) | Mix de standalone components + AppModule. Material Design 15. |
| Desktop shell | Electron 24 (`^24.3.0`) | `nodeIntegration: false`, `contextIsolation: true`. Una sola ventana frameless (titlebar custom) que arranca maximizada, con splash window. |
| Servidor cliente/servidor | Fastify 4.10 | Modo `server` expone los handlers IPC vía HTTP (`/api/*`). Ver [cliente-servidor.md](cliente-servidor.md). |
| Database | SQLite 5 (`sqlite3` ^5.1.6) **o** Postgres (`pg`) | Driver seleccionable en runtime. SQLite default = `frc-gourmet.db` en `app.getPath('userData')`. La app crea la BD Postgres (rol + database) automáticamente. |
| ORM | TypeORM 0.3.21 | `synchronize: false` — migraciones obligatorias, corren al arranque. Dual baseline SQLite + Postgres en `migrations/` (`getMigrations(driver)` elige). |
| Auth | bcryptjs + JWT (`jsonwebtoken` ^9.0.2, `@fastify/jwt`) | Passwords hasheadas con bcrypt. JWT secret en **keytar**. Refresh tokens. Permisos validados en backend. Ver [auth-permissions.md](auth-permissions.md). |
| Charts | Chart.js + ng2-charts | Dashboard RRHH y Financiero. |
| Currency input | `ngx-currency` | Configurado por moneda (PYG sin decimales, USD/BRL con 2). |
| PDF / Excel | `pdfmake` 0.2.10 + `exceljs` 4.4.0 | Reportes RRHH. |
| Impresora térmica | `node-thermal-printer` 4.4.4, `electron-pos-printer` | EPSON / STAR / network / USB / bluetooth / CUPS. |

## Estructura del repo

```
frc-gourmet/
├── main.ts                    # Bootstrap Electron + registro de handlers
├── preload.ts                 # ContextBridge: expone `window.api.*` al renderer (~780 métodos + callIpc genérico)
├── tsconfig.electron.json     # Compila main.ts + preload.ts → main.js + preload.js
├── package.json               # Scripts, deps, electron-builder config
├── electron/
│   ├── handlers/              # 54 handler files (`*.handler.ts`). Cada dominio = un archivo.
│   ├── server/               # Fastify (modo server): server.ts, rpc-router.ts, auth-*.ts, file-routes.ts, kds-sse-routes.ts
│   └── utils/
│       ├── entity.utils.ts    # setEntityUserTracking()
│       ├── auth.utils.ts      # checkPermission/ensurePermission + cache 30s + withRequestUser (AsyncLocalStorage)
│       ├── password.utils.ts  # bcryptjs hashPassword/verifyPassword
│       ├── jwt-secret.utils.ts# JWT secret en keytar (fallback filesystem)
│       ├── handler-registry.ts# Monkey-patch de ipcMain.handle → registry para /api/rpc
│       ├── seed-data.ts       # seedInitialData
│       ├── seed-system.ts     # seedSystemData (admin + catálogos operativos)
│       └── image-handler.utils.ts
├── src/
│   ├── main.ts                # Bootstrap Angular (bootstrapApplication)
│   ├── styles.scss            # Material themes (custom red palette)
│   ├── styles/
│   │   └── theme-variables.scss  # CSS vars para light/dark
│   └── app/
│       ├── app.module.ts          # AppModule (still used: registra GestionarProducto y subs)
│       ├── app-routing.module.ts  # SOLO ruta /login. Resto = tabs dinámicas.
│       ├── app.component.ts       # Layout: toolbar + sidenav + tab container
│       ├── auth/login/            # Componente de login (lazy-loaded)
│       ├── guards/auth.guard.ts   # CanActivate: solo chequea isLoggedIn
│       ├── components/
│       │   ├── tab-container/     # Contenedor de tabs dinámicas
│       │   ├── image-viewer/
│       │   └── printer-settings/
│       ├── shared/
│       │   ├── components/        # ~40 dialogs reusables (cobrar, descuento, etc.)
│       │   ├── services/          # CurrencyConfigService
│       │   └── utils/             # PaginatorIntlEs, saldo-negativo-confirm, etc.
│       ├── services/              # Servicios Angular: TabsService, AuthService, ThemeService, etc.
│       ├── core/
│       │   ├── enums/metodo-pago.enum.ts
│       │   └── services/          # comprasService, pagosService
│       ├── database/
│       │   ├── database.config.ts # DataSourceOptions con TODAS las entidades
│       │   ├── database.service.ts# Singleton wrapper de DataSource
│       │   ├── repository.service.ts # Clase abstracta canónica (~870 líneas)
│       │   ├── repository-ipc.service.ts # Impl IPC sobre window.api (~3900 líneas)
│       │   ├── repository-http.service.ts # Impl HTTP (skeleton, no usado)
│       │   └── entities/
│       │       ├── base.entity.ts # BaseModel (id, createdAt, updatedAt, createdBy, updatedBy)
│       │       ├── auth/
│       │       ├── personas/
│       │       ├── personalizacion/
│       │       ├── productos/   (33 entidades)
│       │       ├── ventas/      (24 entidades)
│       │       ├── compras/     (12 entidades)
│       │       ├── financiero/  (35 entidades)
│       │       ├── rrhh/        (34 entidades)
│       │       ├── ia/          (2 entidades — config OCR/IA)
│       │       └── ... (auth, personas, personalizacion, sistema, shared)
│       └── pages/
│           ├── home/                  # Dashboard con accesos rápidos
│           ├── productos/
│           ├── gestion-recetas/       # NgModule (declarado)
│           ├── gestion-sabores/
│           ├── ventas/                # incluye PdV componente principal
│           ├── compras/
│           ├── financiero/            # caja-mayor con muchos sub-componentes
│           ├── rrhh/
│           ├── comisiones/
│           ├── personas/
│           ├── pagos/
│           └── personalizacion/
└── docs/
    ├── arquitectura/
    ├── productos/
    ├── integraciones/
    ├── testing/
    └── legacy/
```

## Comandos NPM

```bash
# Verificar compilación (USAR ESTE en lugar de npm start)
npm run build              # Compila electron + Angular

# Solo Angular (sin Electron)
npm run ng:serve           # Puerto 4201

# Solo TypeScript de Electron
npm run electron:serve-tsc # Compila main.ts + preload.ts

# Build prod
npm run build:prod
npm run electron:local     # Prod local
npm run electron:build     # Distributable (DMG/NSIS/AppImage)

# Lint y test
npm run lint
npm run test
npm run test:e2e           # Playwright

# ⚠️ NUNCA correr desde Claude Code:
# npm start                # El usuario lo corre manualmente
```

## Datos cuantitativos (snapshot 2026-06)

| Métrica | Cantidad |
|---|---|
| Entidades TypeORM totales | 157 (incluye `base.entity.ts` abstracto + `printer.entity.ts`) |
| Handlers IPC files (`*.handler.ts`) | 54 |
| Métodos expuestos en `window.api` (preload) | ~780 + `callIpc` genérico |
| Permisos seedeados (`SEED_PERMISOS`) | 94 |
| Componentes de página | 60+ |
| Dialogs compartidos | ~40 |
| Enums | 30+ |
| Migraciones | baseline dual (SQLite + Postgres) + incrementales |

## Bootstrap secuencia (Electron)

`main.ts` → `app.on('ready')` → `initializeDatabase()` → `createWindow()`:

1. `DatabaseService.getInstance().initialize(userDataPath, override)` — el override decide driver (SQLite o Postgres según `app-settings.json`). `initialize` corre las **migraciones** al arranque.
2. `runBootstrapMigrations(dataSource)` — SQL fixes idempotentes de boot.
3. `migratePlaintextPasswords(dataSource)` — hashea con bcrypt cualquier password en texto plano residual (idempotente).
4. `installHandlerRegistry()` — monkey-patchea `ipcMain.handle` para copiar cada canal en `handlerRegistry` (lo usa `/api/rpc` del modo server).
5. **Se registran TODOS los handlers** (orden importa: auth y permisos antes que el resto).
6. Migración 1-vez: `UPDATE ventas SET vendedor_id = created_by WHERE vendedor_id IS NULL` (idempotente, corre cada arranque).
7. `startAcreditacionesScheduler(dataSource, 5)` corre cada 5 min en main process.
8. Seeds idempotentes (en orden): `seedInitialData`, `seedPermissions`, `seedConfiguracionRrhh`, `seedLiquidacionConceptos`, `seedSystemData` (crea admin `admin/admin` + rol ADMINISTRADOR con todos los permisos).
9. `generarNotificacionesRrhh()` al startup + cada 24h.
10. `createWindow()`: splash window primero, luego BrowserWindow `1200×800` frameless (`frame:false` en Win/Linux con controles custom; `titleBarStyle:'hiddenInset'` en macOS) que se `maximize()` y se muestra al `did-finish-load`. Carga `http://localhost:4201` si `--serve`, sino `dist/index.html`.
11. Custom protocol `app://` registrado en `app.on('ready')`: sirve `profile-images/` y `producto-images/` desde `userData`.

Detalle completo → [electron-bootstrap.md](electron-bootstrap.md).

## Bootstrap secuencia (Angular)

- `src/main.ts` → `bootstrapApplication(AppComponent, { providers: [importProvidersFrom(AppModule)] })`.
- AppModule todavía aporta providers globales: `MatPaginatorIntl=PaginatorIntlEs`, `MAT_FORM_FIELD_DEFAULT_OPTIONS={subscriptSizing:'dynamic'}`, `DatabaseService`, `TabsService`, `DatePipe`.
- AppRoutingModule define **solo `/login`**. El resto de la nav es por **tabs dinámicas** (`TabsService`).
- AppComponent es **standalone** (importa Material modules + TabContainerComponent), pero sigue usando AppModule por declarations (componentes legacy).
