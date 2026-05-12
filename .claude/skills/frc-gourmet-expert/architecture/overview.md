# Arquitectura — Visión general

## Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | Angular 15 (`15.2.9`) | Mix de standalone components + AppModule. Material Design 15. |
| Desktop shell | Electron 24 | `nodeIntegration: false`, `contextIsolation: true`. Una sola ventana en fullscreen. |
| Database | SQLite 5 (`sqlite3` ^5.1.6) **o** Postgres (`pg` optional) | Driver seleccionable en runtime. SQLite default = `frc-gourmet.db` en `app.getPath('userData')`. Postgres requiere DB pre-creada. |
| ORM | TypeORM 0.3.21 | `synchronize: false` desde F1.5 — migrations obligatorias. Dual baseline SQLite + Postgres en `migrations/` (`getMigrations(driver)` elige). |
| Auth | JWT (`jsonwebtoken` ^9.0.2) | Token 7 días, secret hardcoded `'frc-gourmet-secret-key'`. ⚠️ Passwords en texto plano. |
| Charts | Chart.js + ng2-charts | Dashboard RRHH y Financiero. |
| Currency input | `ngx-currency` | Configurado por moneda (PYG sin decimales, USD/BRL con 2). |
| PDF / Excel | `pdfmake` 0.2.10 + `exceljs` 4.4.0 | Reportes RRHH. |
| Impresora térmica | `node-thermal-printer` 4.4.4, `electron-pos-printer` | EPSON / STAR / network / USB / bluetooth / CUPS. |

## Estructura del repo

```
frc-gourmet-legacy/
├── main.ts                    # Bootstrap Electron + registro de handlers
├── preload.ts                 # ContextBridge: expone `window.api.*` al renderer
├── tsconfig.electron.json     # Compila main.ts + preload.ts → main.js + preload.js
├── package.json               # Scripts, deps, electron-builder config
├── menu.json                  # Datos de menú (NO menú nativo Electron)
├── electron/
│   ├── handlers/              # ~35 handler files. Cada dominio = un archivo.
│   └── utils/
│       ├── entity.utils.ts    # setEntityUserTracking()
│       ├── image-handler.utils.ts
│       ├── seed-data.ts
│       └── document-handler.utils.ts
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
│       │   ├── repository.service.ts # ~3700 líneas. Wrapper de window.api
│       │   └── entities/
│       │       ├── base.entity.ts # BaseModel (id, createdAt, updatedAt, createdBy, updatedBy)
│       │       ├── auth/
│       │       ├── personas/
│       │       ├── personalizacion/
│       │       ├── productos/   (~30 entidades)
│       │       ├── ventas/      (22 entidades)
│       │       ├── compras/     (10 entidades)
│       │       ├── financiero/  (~30 entidades)
│       │       └── rrhh/        (~40 entidades)
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

## Datos cuantitativos (snapshot 2026-05-05)

| Métrica | Cantidad |
|---|---|
| Entidades TypeORM totales | ~170 |
| Handlers IPC files | 35 |
| Líneas en handlers | ~20.000 |
| Canales IPC | 400+ |
| Métodos en RepositoryService | 400+ |
| Componentes de página | 60+ |
| Dialogs compartidos | ~40 |
| Servicios Angular | 14 |
| Enums | 30+ |

## Bootstrap secuencia (Electron)

`main.ts` → `app.on('ready')` → `initializeDatabase()` → `createWindow()`:

1. `DatabaseService.getInstance().initialize(userDataPath)` crea el DataSource SQLite.
2. **Tras `dataSource.initialize()` se registran TODOS los handlers** (orden importa: auth antes que entities que usan `getCurrentUser`).
3. Migración 1-vez: `UPDATE ventas SET vendedor_id = created_by WHERE vendedor_id IS NULL`.
4. `startAcreditacionesScheduler(dataSource, 5)` corre cada 5 min en main process.
5. Seeds idempotentes: `seedInitialData`, `seedPermissions`, `seedConfiguracionRrhh`, `seedLiquidacionConceptos`.
6. `generarNotificacionesRrhh()` al startup + cada 24h.
7. `createWindow()`: BrowserWindow `1200×800` + `fullscreen: true`. Carga `http://localhost:4201` si `--serve`, sino `dist/index.html`.
8. Custom protocol `app://` registrado en `app.on('ready')`: sirve `profile-images/` y `producto-images/` desde `userData`.

Detalle completo → [electron-bootstrap.md](electron-bootstrap.md).

## Bootstrap secuencia (Angular)

- `src/main.ts` → `bootstrapApplication(AppComponent, { providers: [importProvidersFrom(AppModule)] })`.
- AppModule todavía aporta providers globales: `MatPaginatorIntl=PaginatorIntlEs`, `MAT_FORM_FIELD_DEFAULT_OPTIONS={subscriptSizing:'dynamic'}`, `DatabaseService`, `TabsService`, `DatePipe`.
- AppRoutingModule define **solo `/login`**. El resto de la nav es por **tabs dinámicas** (`TabsService`).
- AppComponent es **standalone** (importa Material modules + TabContainerComponent), pero sigue usando AppModule por declarations (componentes legacy).
