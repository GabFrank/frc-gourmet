// Use ES Module import syntax
import { app, BrowserWindow, protocol } from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';
// os is now only used in system.handler.ts
// import * as os from 'os';
// Import TypeORM and reflect-metadata (required for TypeORM decorators)
import 'reflect-metadata';
// Remove unused imports related to moved handlers
// const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
// Remove jwt as it's moved to auth.handler
// const jwt = require('jsonwebtoken');
// imageHandler only used in protocol handler now
// const imageHandler = require('./electron/utils/image-handler');

// Import TypeORM-related code
// import { DataSource } from 'typeorm'; // not used here
import { DatabaseService } from './src/app/database/database.service';
// Keep Usuario import for currentUser type
import { Usuario } from './src/app/database/entities/personas/usuario.entity';

// Import the new handler registration functions
import { registerPrinterHandlers } from './electron/handlers/printers.handler';
import { registerPersonasHandlers } from './electron/handlers/personas.handler';
import { registerAuthHandlers } from './electron/handlers/auth.handler';
import { registerImageHandlers } from './electron/handlers/images.handler';
import { registerProductosHandlers } from './electron/handlers/productos.handler';
import { registerFinancieroHandlers } from './electron/handlers/financiero.handler';
import { registerComprasHandlers } from './electron/handlers/compras.handler';
import { registerSystemHandlers } from './electron/handlers/system.handler';
import { registerVentasHandlers } from './electron/handlers/ventas.handler';
import { registerRecetasHandlers } from './electron/handlers/recetas.handler';
import { registerCajaMayorHandlers } from './electron/handlers/caja-mayor.handler';
import { registerBankingHandlers, startAcreditacionesScheduler } from './electron/handlers/banking.handler';
import { registerCuentasPorPagarHandlers } from './electron/handlers/cuentas-por-pagar.handler';
import { registerDashboardShortcutsHandlers } from './electron/handlers/dashboard-shortcuts.handler';
import { registerPermissionsHandlers, seedPermissions } from './electron/handlers/permissions.handler';
import { registerConfiguracionRrhhHandlers, seedConfiguracionRrhh } from './electron/handlers/configuracion-rrhh.handler';
import { registerRrhhFuncionariosHandlers } from './electron/handlers/rrhh-funcionarios.handler';
import { registerFuncionarioDocumentosHandlers } from './electron/handlers/funcionario-documentos.handler';
import { registerAsistenciasHandlers } from './electron/handlers/asistencias.handler';
import { registerFeriadosHandlers } from './electron/handlers/feriados.handler';
import { registerHorasExtraHandlers } from './electron/handlers/horas-extra.handler';
import { registerValesHandlers } from './electron/handlers/vales.handler';
import { registerLiquidacionSueldoHandlers, seedLiquidacionConceptos } from './electron/handlers/liquidacion-sueldo.handler';
import { registerVacacionesHandlers } from './electron/handlers/vacaciones.handler';
import { registerLiquidacionFinalHandlers } from './electron/handlers/liquidacion-final.handler';
import { registerComisionesHandlers } from './electron/handlers/comisiones.handler';
import { registerEquiposComisionHandlers } from './electron/handlers/equipos-comision.handler';
import { registerCuentasPorCobrarHandlers } from './electron/handlers/cuentas-por-cobrar.handler';
import { registerMovimientosClienteHandlers } from './electron/handlers/movimientos-cliente.handler';
import { seedInitialData } from './electron/utils/seed-data';
import { seedSystemData } from './electron/utils/seed-system';
// RRHH Fase 8 - Dashboard, Notificaciones, Reportes
import { registerNotificacionesRrhhHandlers, generarNotificacionesRrhh } from './electron/handlers/notificaciones-rrhh.handler';
import { registerDashboardRrhhHandlers } from './electron/handlers/dashboard-rrhh.handler';
import { registerReportesRrhhHandlers } from './electron/handlers/reportes-rrhh.handler';
// Dashboards por dominio
import { registerDashboardVentasHandlers } from './electron/handlers/dashboard-ventas.handler';
import { registerDashboardComprasHandlers } from './electron/handlers/dashboard-compras.handler';
import { registerDashboardProductosHandlers } from './electron/handlers/dashboard-productos.handler';
import { registerDashboardFinancieroHandlers } from './electron/handlers/dashboard-financiero.handler';
import { registerDashboardCajaMayorHandlers } from './electron/handlers/dashboard-caja-mayor.handler';
// Backup & Restore handler
import { registerBackupHandlers, startAutoBackupScheduler } from './electron/handlers/backup.handler';
// Importacion de facturas via OCR + IA
import { registerFacturaImportHandlers } from './electron/handlers/factura-import.handler';
// ✅ NUEVOS HANDLERS PARA ARQUITECTURA CON VARIACIONES
// Unificado en recetas.handler: sabores y variaciones

let win: BrowserWindow | null;
let dbService: DatabaseService;

// Remove JWT constants as they are moved
// const JWT_SECRET = 'frc-gourmet-secret-key';
// const TOKEN_EXPIRATION = '7d';

// Store the current user
let currentUser: Usuario | null = null;

// Functions to manage currentUser state (used by handlers)
function getCurrentUser(): Usuario | null {
  return currentUser;
}

function setCurrentUser(user: Usuario | null): void {
  currentUser = user;
}

function initializeDatabase() {
  // Get user data path
  const userDataPath = app.getPath('userData');

  // Initialize database service
  dbService = DatabaseService.getInstance();
  dbService.initialize(userDataPath)
    .then((dataSource) => {
      console.log('Database initialized successfully');
      // Register all IPC handlers *after* the database is ready
      registerPrinterHandlers(dataSource);
      registerPersonasHandlers(dataSource, getCurrentUser);
      registerAuthHandlers(dataSource, getCurrentUser, setCurrentUser);
      registerImageHandlers(dataSource);
      registerProductosHandlers(dataSource, getCurrentUser);
      registerFinancieroHandlers(dataSource, getCurrentUser);
      registerComprasHandlers(dataSource, getCurrentUser);
      registerSystemHandlers(); // system handler doesn't need dataSource or user
      registerVentasHandlers(dataSource, getCurrentUser); // Register ventas handlers
      registerRecetasHandlers(dataSource, getCurrentUser); // Recetas + Sabores + Variaciones (unificado)
      registerCajaMayorHandlers(dataSource, getCurrentUser); // Caja Mayor + Gastos + Retiros
      registerBankingHandlers(dataSource, getCurrentUser); // CuentasBancarias + MaquinasPos + Acreditaciones
      registerCuentasPorPagarHandlers(dataSource, getCurrentUser); // CompraCategoria + CompraCuota + CuentaPorPagar
      registerDashboardShortcutsHandlers(dataSource, getCurrentUser); // Dashboard Shortcuts personalizables
      registerPermissionsHandlers(dataSource, getCurrentUser); // RRHH: Permission + RolePermission
      registerConfiguracionRrhhHandlers(dataSource, getCurrentUser); // RRHH: ConfiguracionRrhh (parametros legales)
      registerRrhhFuncionariosHandlers(dataSource, getCurrentUser); // RRHH Fase 1: Cargos + Funcionarios + Historicos
      registerFuncionarioDocumentosHandlers(dataSource, getCurrentUser); // RRHH Fase 1: Documentos del funcionario (filesystem)
      registerAsistenciasHandlers(dataSource, getCurrentUser); // RRHH Fase 2: Turnos + Asistencias + Penalizaciones
      registerFeriadosHandlers(dataSource, getCurrentUser); // RRHH Fase 2: Feriados
      registerHorasExtraHandlers(dataSource, getCurrentUser); // RRHH Fase 2: Horas extra
      registerValesHandlers(dataSource, getCurrentUser); // RRHH Fase 3: Vales + Adelantos
      registerLiquidacionSueldoHandlers(dataSource, getCurrentUser); // RRHH Fase 4: Liquidacion + Bonos + Aguinaldos
      registerVacacionesHandlers(dataSource, getCurrentUser); // RRHH Fase 5: Vacaciones
      registerLiquidacionFinalHandlers(dataSource, getCurrentUser); // RRHH Fase 5: Liquidacion final
      registerComisionesHandlers(dataSource, getCurrentUser); // RRHH Fase 6: Comisiones
      registerEquiposComisionHandlers(dataSource, getCurrentUser); // RRHH Fase 6: Equipos de comision
      registerCuentasPorCobrarHandlers(dataSource, getCurrentUser); // Fase 7: CuentasPorCobrar
      registerMovimientosClienteHandlers(dataSource, getCurrentUser); // Fase 7: MovimientosCliente
      // RRHH Fase 8
      registerNotificacionesRrhhHandlers(dataSource, getCurrentUser); // Notificaciones RRHH
      registerDashboardRrhhHandlers(dataSource, getCurrentUser); // Dashboard KPIs RRHH
      registerReportesRrhhHandlers(dataSource, getCurrentUser); // Reportes + Exports RRHH

      // Dashboards por dominio (Ventas, Compras, Productos, Financiero, Caja Mayor)
      registerDashboardVentasHandlers(dataSource, getCurrentUser);
      registerDashboardComprasHandlers(dataSource, getCurrentUser);
      registerDashboardProductosHandlers(dataSource, getCurrentUser);
      registerDashboardFinancieroHandlers(dataSource, getCurrentUser);
      registerDashboardCajaMayorHandlers(dataSource, getCurrentUser);

      // Startup migration: populate vendedor_id from created_by for historic ventas
      dataSource.query(`UPDATE ventas SET vendedor_id = created_by WHERE vendedor_id IS NULL AND created_by IS NOT NULL`)
        .catch((e: any) => console.warn('Migration vendedor_id:', e.message));

      // Scheduler: procesa acreditaciones POS pendientes cada 5 min (en main process)
      startAcreditacionesScheduler(dataSource, 5);

      // Backup & Restore handlers
      registerBackupHandlers(dataSource);

      // Importacion de facturas con OCR + IA
      registerFacturaImportHandlers(dataSource, getCurrentUser);

      // Seed initial data (idempotent - only inserts if tables are empty)
      // Orden: 1) datos generales 2) permisos+conceptos 3) admin user (necesita permisos ya creados)
      (async () => {
        try {
          await seedInitialData(dataSource);
          await seedPermissions(dataSource);
          await seedConfiguracionRrhh(dataSource);
          await seedLiquidacionConceptos(dataSource);
          await seedSystemData(dataSource);
        } catch (e) {
          console.error('Error en seeds iniciales:', e);
        }
      })();

      // Auto-backup scheduler (lee config persistida; idempotente si está deshabilitado)
      startAutoBackupScheduler(app.getPath('userData'));
      // Generar notificaciones RRHH al startup y cada 24h
      generarNotificacionesRrhh().catch((e) => console.error('Error generando notificaciones RRHH:', e));
      setInterval(() => { generarNotificacionesRrhh().catch((e) => console.error('Error notif RRHH interval:', e)); }, 24 * 60 * 60 * 1000);
    })
    .catch((error) => {
      console.error('Failed to initialize database:', error);
      // Consider how to handle DB init failure (e.g., show error, quit app)
    });
}

function createWindow(): void {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    fullscreen: true
  });

  // Load the app
  if (process.argv.indexOf('--serve') !== -1) {
    // Load from Angular dev server if --serve argument is provided
    win.loadURL('http://localhost:4201');
    // Open the DevTools automatically if in development mode
    win.webContents.openDevTools();
  } else {
    // Load the built app from the dist folder
    win.loadURL(url.format({
      pathname: path.join(__dirname, 'dist/index.html'),
      protocol: 'file:',
      slashes: true
    }));
  }

  // Event when the window is closed.
  win.on('closed', () => {
    win = null;
  });

  // Register the app:// protocol for serving local files
  // This part remains here
  protocol.registerFileProtocol('app', (request: { url: string }, callback: (response: any) => void) => {
    const urlPath = request.url.substring(6); // Remove 'app://'

    // Handle profile images
    if (urlPath.startsWith('profile-images/')) {
      const fileName = urlPath.replace('profile-images/', '');
      const imagesDir = path.join(app.getPath('userData'), 'profile-images');
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }
      callback({ path: path.join(imagesDir, fileName) });
      return;
    }

    // Handle product images
    if (urlPath.startsWith('producto-images/')) {
      const fileName = urlPath.replace('producto-images/', '');
      const imagesDir = path.join(app.getPath('userData'), 'producto-images');
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }
      const imagePath = path.join(imagesDir, fileName);
      // console.log('Serving product image from:', imagePath); // Optional logging
      callback({ path: imagePath });
      return;
    }

    // Handle factura imports (PDFs/images de facturas OCR)
    if (urlPath.startsWith('factura-imports/')) {
      const fileName = urlPath.replace('factura-imports/', '');
      const dir = path.join(app.getPath('userData'), 'factura-imports');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      callback({ path: path.join(dir, fileName) });
      return;
    }

    // Handle other app:// URLs - check in app folder first
    let normalizedPath = path.normalize(`${app.getAppPath()}/${urlPath}`);
    if (fs.existsSync(normalizedPath)) {
      callback({ path: normalizedPath });
    } else {
      // Try user data directory as fallback
      const userDataPath = app.getPath('userData');
      normalizedPath = path.normalize(`${userDataPath}/${urlPath}`);
      if (fs.existsSync(normalizedPath)) {
        callback({ path: normalizedPath });
      } else {
        console.error(`File not found: ${normalizedPath}`);
        callback({ error: -2 /* ENOENT */ });
      }
    }
  });
}

// Initialize the database when the app is ready
app.on('ready', () => {
  // The protocol registration needs to happen before createWindow in 'ready'
  // Ensure it only happens once
  if (!protocol.isProtocolRegistered('app')) {
      protocol.registerFileProtocol('app', (request: { url: string }, callback: (response: any) => void) => {
        const urlPath = request.url.substring(6); // Remove 'app://'

        // Handle profile images
        if (urlPath.startsWith('profile-images/')) {
          const fileName = urlPath.replace('profile-images/', '');
          const imagesDir = path.join(app.getPath('userData'), 'profile-images');
          if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
          }
          callback({ path: path.join(imagesDir, fileName) });
          return;
        }

        // Handle product images
        if (urlPath.startsWith('producto-images/')) {
          const fileName = urlPath.replace('producto-images/', '');
          const imagesDir = path.join(app.getPath('userData'), 'producto-images');
          if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
          }
          const imagePath = path.join(imagesDir, fileName);
          // console.log('Serving product image from:', imagePath);
          callback({ path: imagePath });
          return;
        }

        // Handle factura imports (PDFs/images de facturas OCR)
        if (urlPath.startsWith('factura-imports/')) {
          const fileName = urlPath.replace('factura-imports/', '');
          const dir = path.join(app.getPath('userData'), 'factura-imports');
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          callback({ path: path.join(dir, fileName) });
          return;
        }

        // Handle other app:// URLs - check in app folder first
        let normalizedPath = path.normalize(`${app.getAppPath()}/${urlPath}`);
        if (fs.existsSync(normalizedPath)) {
          callback({ path: normalizedPath });
        } else {
          // Try user data directory as fallback
          const userDataPath = app.getPath('userData');
          normalizedPath = path.normalize(`${userDataPath}/${urlPath}`);
          if (fs.existsSync(normalizedPath)) {
            callback({ path: normalizedPath });
          } else {
            console.error(`File not found: ${normalizedPath}`);
            callback({ error: -2 /* ENOENT */ });
          }
        }
      });
  }

  initializeDatabase();
  createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS specific behavior
  if (process.platform !== 'darwin') {
    // Close the database connection
    if (dbService) {
      dbService.close();
    }
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS specific behavior
  if (win === null) {
    createWindow();
  }
});

// ALL IPC HANDLERS AND HELPER FUNCTIONS PREVIOUSLY BELOW THIS LINE HAVE BEEN MOVED
// TO THE respective handler/util files in the electron/ directory.
