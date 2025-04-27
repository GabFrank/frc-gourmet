// Use ES Module import syntax
import { app, BrowserWindow, ipcMain, protocol, dialog, shell } from 'electron';
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
import { DataSource } from 'typeorm'; // Remove Not if unused here
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

let win: any;
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
  protocol.registerFileProtocol('app', (request: any, callback: any) => {
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
      protocol.registerFileProtocol('app', (request: any, callback: any) => {
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
