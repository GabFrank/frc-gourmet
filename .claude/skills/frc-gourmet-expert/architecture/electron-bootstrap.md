# Electron — Bootstrap, ciclo de vida y custom protocols

## main.ts

`main.ts` (~301 líneas tras quitar comentarios). Compila a `main.js` ~17 KB.

### Variables globales

```typescript
let win: BrowserWindow | null;        // Una sola ventana
let dbService: DatabaseService;
let currentUser: Usuario | null;      // Sesión actual

function getCurrentUser(): Usuario | null { return currentUser; }
function setCurrentUser(user: Usuario | null): void { currentUser = user; }
```

### Ciclo de vida

```
app.on('ready')
  ├─ protocol.registerFileProtocol('app', ...)
  ├─ initializeDatabase()
  │   └─ DatabaseService.getInstance().initialize(userDataPath)
  │       └─ .then(dataSource => {
  │            registerXxxHandlers(dataSource, getCurrentUser);  // ← orden importa
  │            startAcreditacionesScheduler(dataSource, 5);
  │            seedXxx(dataSource);
  │            generarNotificacionesRrhh();
  │            setInterval(generarNotif..., 24h);
  │          })
  └─ createWindow()
       └─ new BrowserWindow({
            width: 1200, height: 800, fullscreen: true,
            webPreferences: { nodeIntegration: false, contextIsolation: true, preload: 'preload.js' }
          })
          .loadURL('http://localhost:4201' if --serve else 'dist/index.html')

app.on('window-all-closed')
  └─ if (platform !== 'darwin') { dbService.close(); app.quit(); }

app.on('activate')   // macOS
  └─ if (win === null) createWindow();
```

### Orden de registro de handlers

`main.ts:90-122`. El orden importa porque algunos handlers dependen de seeds o de `getCurrentUser` ya configurado.

```typescript
registerPrinterHandlers(dataSource);
registerPersonasHandlers(dataSource, getCurrentUser);
registerAuthHandlers(dataSource, getCurrentUser, setCurrentUser);
registerImageHandlers(dataSource);
registerProductosHandlers(dataSource, getCurrentUser);
registerFinancieroHandlers(dataSource, getCurrentUser);
registerComprasHandlers(dataSource, getCurrentUser);
registerSystemHandlers();              // No necesita DB
registerVentasHandlers(dataSource, getCurrentUser);
registerRecetasHandlers(dataSource, getCurrentUser);  // Unificado: recetas + sabores + variaciones
registerCajaMayorHandlers(dataSource, getCurrentUser);
registerBankingHandlers(dataSource, getCurrentUser);
registerCuentasPorPagarHandlers(dataSource, getCurrentUser);
registerDashboardShortcutsHandlers(dataSource, getCurrentUser);
registerPermissionsHandlers(dataSource, getCurrentUser);
registerConfiguracionRrhhHandlers(dataSource, getCurrentUser);
registerRrhhFuncionariosHandlers(dataSource, getCurrentUser);
registerFuncionarioDocumentosHandlers(dataSource, getCurrentUser);
registerAsistenciasHandlers(dataSource, getCurrentUser);
registerFeriadosHandlers(dataSource, getCurrentUser);
registerHorasExtraHandlers(dataSource, getCurrentUser);
registerValesHandlers(dataSource, getCurrentUser);
registerLiquidacionSueldoHandlers(dataSource, getCurrentUser);
registerVacacionesHandlers(dataSource, getCurrentUser);
registerLiquidacionFinalHandlers(dataSource, getCurrentUser);
registerComisionesHandlers(dataSource, getCurrentUser);
registerEquiposComisionHandlers(dataSource, getCurrentUser);
registerCuentasPorCobrarHandlers(dataSource, getCurrentUser);
registerMovimientosClienteHandlers(dataSource, getCurrentUser);
registerNotificacionesRrhhHandlers(dataSource, getCurrentUser);
registerDashboardRrhhHandlers(dataSource, getCurrentUser);
registerReportesRrhhHandlers(dataSource, getCurrentUser);

// Migración 1-vez:
dataSource.query(`UPDATE ventas SET vendedor_id = created_by WHERE vendedor_id IS NULL AND created_by IS NOT NULL`);

// Scheduler en main process: cada 5 min procesa AcreditacionPos PENDIENTE vencida
startAcreditacionesScheduler(dataSource, 5);

// Seeds idempotentes (chequean si tabla está vacía antes de insertar)
seedInitialData(dataSource);
seedPermissions(dataSource);
seedConfiguracionRrhh(dataSource);
seedLiquidacionConceptos(dataSource);

// RRHH notificaciones: al startup + cada 24h
generarNotificacionesRrhh();
setInterval(() => generarNotificacionesRrhh(), 24 * 60 * 60 * 1000);
```

### BrowserWindow

```typescript
new BrowserWindow({
  width: 1200, height: 800,
  webPreferences: {
    nodeIntegration: false,         // Renderer no tiene acceso a Node directo
    contextIsolation: true,         // World contextual aislado
    preload: path.join(__dirname, 'preload.js'),
  },
  fullscreen: true,                 // Inicia maximizada
});
```

**Una sola ventana**. No hay multi-window. `win.on('closed') => win = null`.

**Dev vs prod load:**
- Dev: `--serve` → `win.loadURL('http://localhost:4201')` + `openDevTools()`.
- Prod: `win.loadURL(file://dist/index.html)`.

## Custom protocol `app://`

Registrado en `app.on('ready')` ANTES de cargar la app. Sirve archivos locales **sin CORS**.

| URL | Resuelve a |
|---|---|
| `app://profile-images/<file>` | `${userData}/profile-images/<file>` |
| `app://producto-images/<file>` | `${userData}/producto-images/<file>` |
| `app://<other>` | Primero busca en `app.getAppPath()/<other>`, luego en `${userData}/<other>` |

**Crea el directorio si no existe** (`mkdirSync(imagesDir, { recursive: true })`).

Si el archivo no existe → `callback({ error: -2 })` (ENOENT).

**Imágenes de producto** comentadas en `images.handler.ts` (líneas 31-121) — funcionalidad parcialmente desactivada en el refactor de productos. Sólo perfiles activos.

## DataSource singleton

`src/app/database/database.service.ts`:

```typescript
class DatabaseService {
  private static instance: DatabaseService;
  private dataSource: DataSource | null = null;

  static getInstance(): DatabaseService { /* singleton */ }

  async initialize(userDataPath: string): Promise<DataSource> {
    if (!this.dataSource) {
      this.dataSource = await createDataSource(userDataPath);
    }
    return this.dataSource;
  }

  async close(): Promise<void> {
    if (this.dataSource) {
      await this.dataSource.destroy();
      this.dataSource = null;
    }
  }
}
```

## Auto-reload en dev

`electron-reloader` está en `package.json` pero **NO está activo** (no hay `require('electron-reloader')` en `main.ts`). Cambios en main process requieren reinicio manual.

Cambios en Angular sí se hot-reloadean (`ng serve`). Cambios en `electron/handlers/`, `preload.ts`, `main.ts`, entidades, `database.config.ts` → **reinicio obligatorio**.

## Build

`tsconfig.electron.json`:
```json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "commonjs",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "noImplicitAny": false,
    "types": ["node"]
  },
  "include": ["main.ts", "preload.ts"],
  "exclude": ["node_modules", "**/*.spec.ts"]
}
```

`npm run build` corre primero `tsc -p tsconfig.electron.json` (genera `main.js` + `preload.js`) y luego `ng build --base-href ./`.

## Distributable

`electron-builder` config en `package.json`:
```json
{
  "appId": "com.frcgourmet.app",
  "productName": "FRC Gourmet",
  "directories": { "output": "release/" },
  "files": ["dist", "main.js", "preload.js"],
  "mac": { "icon": "dist/assets/icons/icon.icns", "target": ["dmg"] },
  "win": { "icon": "dist/assets/icons/icon.ico", "target": ["nsis"] },
  "linux": { "icon": "dist/assets/icons", "target": ["AppImage"] }
}
```

`npm run electron:build` → produce DMG / NSIS / AppImage en `release/`.

## menu.json

⚠️ **No es el menú nativo Electron** (no hay `Menu.setApplicationMenu()`). Es **datos de menú gastronómico** (RESTAURANT_NAME, MENU_ITEMS con hamburguesas, ingredientes, precio). Probablemente legacy o seed data.
