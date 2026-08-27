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
  │            registerAllAppHandlers({ dataSource, getCurrentUser, setCurrentUser }); // fuente ÚNICA (todos los handlers)
  │            dataSource.query('UPDATE ventas SET vendedor_id ...'); // migración 1-vez idempotente
  │            startAcreditacionesScheduler(dataSource, 5);
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

Todos los `registerXxxHandlers(...)` viven en **una sola función**, `registerAllAppHandlers()` en `electron/utils/register-all-handlers.ts` (fuente única — ver [ipc-pattern.md](ipc-pattern.md#registro)). `main.ts` sólo la llama; **no tiene lista propia**. Los tests E2E llaman la misma función, así que la app real y los tests registran exactamente el mismo set (antes divergían → bug "handler no registrado en handlerRegistry").

`installHandlerRegistry()` debe correr **antes** de `registerAllAppHandlers()` para capturar todos los canales en `handlerRegistry`. El orden dentro de la función es representativo (bloque real en `register-all-handlers.ts`):

```typescript
installHandlerRegistry();   // monkey-patch ipcMain.handle (en main.ts, antes de registrar)

registerAllAppHandlers({ dataSource, getCurrentUser, setCurrentUser });
// ↓ esta función, en register-all-handlers.ts, hace en orden:

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

registerBackupHandlers(...); registerDbConfigHandlers(...);   // BD (sqlite/postgres)
registerAppModeHandlers(...); registerFacturaImportHandlers(...); // modo + OCR/IA
setNotificacionDataSource(dataSource);
registerNotificacionesConfigHandlers(...); registerPasswordRecoveryHandlers(...);
registerPedidosOnlineHandlers(...) /* + Auth/Pedidos/Admin/Config */; registerMesaQrHandlers(...); // pedidos online + QR de mesa
// ← fin de registerAllAppHandlers()

// ── lo que sigue lo hace main.ts DESPUÉS de registerAllAppHandlers() ──
// Migración 1-vez (idempotente):
dataSource.query(`UPDATE ventas SET vendedor_id = created_by WHERE vendedor_id IS NULL AND created_by IS NOT NULL`);

startAcreditacionesScheduler(dataSource, 5);   // AcreditacionPos PENDIENTE vencida, cada 5 min

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
const usaOverlay = soportaTitleBarOverlay(process.platform);  // sólo win32
new BrowserWindow({
  width: 1200, height: 800,
  show: false,                                // se muestra en did-finish-load (cierra splash)
  frame: isMac,                               // Win/Linux: frameless
  titleBarStyle: isMac ? 'hiddenInset' : (usaOverlay ? 'hidden' : 'default'),
  // Windows: el SO dibuja min/max/close SOBRE la toolbar (Window Controls Overlay)
  ...(usaOverlay ? { titleBarOverlay: { color: '#db392e', symbolColor: '#ffffff', height: 64 } } : {}),
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

### Titlebar frameless: quién dibuja los botones de ventana (2026-08-27)

La app es frameless en las tres plataformas, pero **los botones de ventana los dibuja el SO siempre que se pueda** — el header de Angular sólo los pinta donde no hay alternativa:

| Plataforma | `controlsMode` | Quién dibuja min/max/close |
|---|---|---|
| Windows | `native` | El SO, con `titleBarStyle:'hidden'` + `titleBarOverlay` |
| macOS | `none` | El SO (semáforos, `titleBarStyle:'hiddenInset'`) |
| Linux | `custom` | El header (`.window-controls` en `app.component.html`) — Electron 24 no soporta WCO en Linux |

El renderer pregunta por IPC **`window:chrome`** → `{ platform, controlsMode, overlay, toolbarHeight }` y decide qué renderizar (`showCustomWindowControls`, `hasTitleBarOverlay`). Lógica pura en **`electron/utils/window-chrome.utils.ts`** (testeada con `npm run test:window-chrome`).

**Por qué se cambió:** los botones custom estaban en las tres plataformas y **no funcionaban en modo cliente** — el monkey-patch de `preload.ts` ruteaba `window:minimize` y compañía por HTTP al servidor. Ahora `invokeRouter` deja **siempre local** todo canal que empiece con `window:`.

**Overlay y tema:** los botones nativos de Windows no cambian de color solos. El renderer lee el color computado real de `.app-toolbar` y lo manda por `window:set-titlebar-overlay` en cada `applyTheme()`; `normalizeOverlayColor` convierte el `rgb(...)` de `getComputedStyle` al `#rrggbb` que exige Electron. La toolbar reserva el hueco del overlay con `env(titlebar-area-*)` (clase `.with-titlebar-overlay`).

### Herramientas de ventana (zoom / recargar / DevTools)

Una ventana frameless **no tiene menú nativo**, así que se perdían Zoom, Recargar y DevTools. Se repusieron por dos vías:

- **Menú en el header** (botón `tune`, *Herramientas de ventana*): zoom −/%/+, pantalla completa, recargar, DevTools.
- **Atajos en `main.ts`** vía `webContents.on('before-input-event')`, porque sin menú no hay accelerators: `Ctrl +/-/0`, `Ctrl+R`, `F12`, `Ctrl+Shift+I` (en macOS, Cmd). El mapeo vive en `resolveShortcut()`.

> **Gotcha grande: `F5` y `F11` NO se interceptan.** `preventDefault()` en `before-input-event` mata el keydown **antes del DOM**, así que un atajo global le roba la tecla a toda la app. F5 imprime la precuenta en el PdV y elige forma de pago en el diálogo de cobro; F11 finaliza con ticket. Antes de agregar cualquier tecla al mapeo global, grepear los `@HostListener('document:keydown')` del repo.

Handlers: `window:zoom-get|set|step|reset`, `window:reload`, `window:toggle-devtools`, `window:toggle-fullscreen`, `window:is-fullscreen`, más los eventos `window:zoom-changed` y `window:fullscreen-changed`.

El **zoom se persiste por PC** en `app-settings.json` (`ui.zoomFactor`, escritura con debounce de 400ms — `updateAppSettings` es `readFileSync`+`writeFileSync` en el main) y se reaplica en cada `did-finish-load` (un reload resetea el factor del `webContents`). El `zoom-changed` de Chromium (Ctrl+rueda) también se persiste y se notifica al header.

**Seguridad:** `window:*` está en `BLOCKED_PREFIXES` del `rpc-router` — `/api/rpc` es default-allow, y sin ese bloqueo cualquier cliente HTTP autenticado (PWA de un mozo, nodo cliente) podía cerrar, recargar o abrir DevTools **en la ventana física del nodo servidor**.

> **Gotcha:** los handlers `window:*` se registran con un guard de una sola vez (`registerWindowChromeHandlers`). Antes vivían sueltos dentro de `createWindow()`, que en macOS puede volver a correr en el evento `activate` → `ipcMain.handle` tira si el canal ya existe.

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
