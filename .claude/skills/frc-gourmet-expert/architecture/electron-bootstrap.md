# Electron — Bootstrap, ciclo de vida y custom protocols

## main.ts

`main.ts` es el bootstrap de Electron: inicializa la BD, registra los 54 handlers, dispara seeds y schedulers, y crea las ventanas (splash + principal).

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
  │   └─ buildDbOverride() → DatabaseService.initialize(userDataPath, override)  // corre migraciones
  │       └─ .then(async dataSource => {
  │            await runBootstrapMigrations(dataSource);        // SQL fixes idempotentes
  │            await migratePlaintextPasswords(dataSource);     // bcrypt
  │            installHandlerRegistry();                        // monkey-patch ipcMain.handle → /api/rpc
  │            registerXxxHandlers(dataSource, getCurrentUser); // ← orden importa (54 handlers)
  │            dataSource.query('UPDATE ventas SET vendedor_id ...'); // migración 1-vez idempotente
  │            startAcreditacionesScheduler(dataSource, 5);
  │            registerBackupHandlers / registerDbConfigHandlers / registerAppModeHandlers / registerFacturaImportHandlers
  │            // seeds idempotentes (en orden):
  │            await seedInitialData; seedPermissions; seedConfiguracionRrhh; seedLiquidacionConceptos; seedSystemData;
  │            generarNotificacionesRrhh(); setInterval(..., 24h);
  │          })
  └─ createWindow()  // splash + ventana frameless maximizada

app.on('window-all-closed')
  └─ if (platform !== 'darwin') { dbService.close(); app.quit(); }

app.on('activate')   // macOS
  └─ if (win === null) createWindow();
```

### Orden de registro de handlers

El orden importa porque algunos handlers dependen de seeds o de `getCurrentUser` ya configurado, y `installHandlerRegistry()` debe correr **antes** del primer `registerXxxHandlers` para capturar todos los canales. Bloque real (54 handlers + helpers):

```typescript
installHandlerRegistry();   // monkey-patch ipcMain.handle

registerPrinterHandlers(dataSource, getCurrentUser);
registerPersonasHandlers(dataSource, getCurrentUser);
registerAuthHandlers(dataSource, getCurrentUser, setCurrentUser);
registerImageHandlers(dataSource);
registerFilesHandlers();                 // IPCs genéricos de archivos
registerAdjuntosHandlers(...);           // adjuntos polimórficos
registerDocumentosTicketsHandlers(...);  // tickets térmicos
registerSectoresImpresorasHandlers(...); // M2M Sector↔Printer
registerProductoSectoresHandlers(...);   // M2M Producto↔Sector (routing comanda)
registerProductosHandlers(...);
registerFinancieroHandlers(...);
registerComprasHandlers(...);
registerSystemHandlers();                // no necesita DB
registerRemoteTunnelHandlers();          // acceso remoto vía cloudflare quick tunnel
registerVentasHandlers(...);
registerKdsHandlers(...);                // KDS cocina (estado por sector)
registerRecetasHandlers(...);            // recetas + sabores + variaciones (unificado)
registerCajaMayorHandlers(...);
registerBankingHandlers(...);
registerCuentasPorPagarHandlers(...);
registerDashboardShortcutsHandlers(...);
registerOnboardingHandlers(...);         // tareas guiadas en Home
registerEmpresaHandlers(...);            // Empresa singleton (datos + branding)
registerCotizacionMercadoHandlers();     // scraping de cotizaciones on-demand
registerPermissionsHandlers(...);
registerConfiguracionRrhhHandlers(...);
// ... handlers RRHH (funcionarios, asistencias, vales, liquidaciones, vacaciones, comisiones, etc.)
registerConveniosHandlers(...);          // convenios + cobro consolidado
registerNotificacionesRrhhHandlers(...);
registerDashboardRrhhHandlers(...);
registerReportesRrhhHandlers(...);
// dashboards por dominio:
registerDashboardVentasHandlers(...); registerDashboardComprasHandlers(...);
registerDashboardProductosHandlers(...); registerDashboardFinancieroHandlers(...);
registerDashboardCajaMayorHandlers(...);

// Migración 1-vez (idempotente):
dataSource.query(`UPDATE ventas SET vendedor_id = created_by WHERE vendedor_id IS NULL AND created_by IS NOT NULL`);

startAcreditacionesScheduler(dataSource, 5);   // AcreditacionPos PENDIENTE vencida, cada 5 min

registerBackupHandlers(dataSource, getCurrentUser);   // + startAutoBackupScheduler
registerDbConfigHandlers(dataSource, getCurrentUser); // configuración de BD (sqlite/postgres)
registerAppModeHandlers(dataSource, getCurrentUser);  // standalone/server/client
registerFacturaImportHandlers(dataSource, getCurrentUser); // OCR + IA

// Seeds idempotentes (en orden):
await seedInitialData(dataSource);
await seedPermissions(dataSource);
await seedConfiguracionRrhh(dataSource);
await seedLiquidacionConceptos(dataSource);
await seedSystemData(dataSource);   // admin + catálogos operativos

generarNotificacionesRrhh();
setInterval(() => generarNotificacionesRrhh(), 24 * 60 * 60 * 1000);
```

→ Índice completo de handlers en [reference/handlers-index.md](../reference/handlers-index.md).

### BrowserWindow

```typescript
new BrowserWindow({
  width: 1200, height: 800,
  show: false,                                // se muestra en did-finish-load (cierra splash)
  frame: isMac ? true : false,                // Win/Linux: frameless con controles custom
  titleBarStyle: isMac ? 'hiddenInset' : 'default',
  icon: iconPath,
  webPreferences: {
    nodeIntegration: false,         // Renderer no tiene acceso a Node directo
    contextIsolation: true,         // World contextual aislado
    preload: path.join(__dirname, 'preload.js'),
  },
});
win.maximize();                     // arranca maximizada (NO fullscreen)
```

**Una sola ventana principal** + un **splash window** (`520×360`, `frame:false`) que se cierra al `did-finish-load`. No hay multi-window. `win.on('closed') => win = null`.

**Titlebar custom:** en Win/Linux la ventana es frameless y el toolbar de Angular dibuja los controles (minimizar / maximizar-restaurar / cerrar), conectados por IPC (`window:minimize`, `window:maximize`, `window:close`, evento `window:state-changed`). En macOS se usa `titleBarStyle:'hiddenInset'`.

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

**`images.handler.ts`** ahora solo expone imágenes de perfil (`save-profile-image` / `delete-profile-image`), mantenidas por compat con `create-edit-persona.component.ts`. Los consumidores nuevos (incluidas imágenes de producto) usan el **`files.handler.ts` genérico** (`save-file` / `delete-file`, con thumbnails automáticos).

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
