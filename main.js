"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// Use ES Module import syntax
const electron_1 = require("electron");
const path = __importStar(require("path"));
const url = __importStar(require("url"));
const fs = __importStar(require("fs"));
// os is now only used in system.handler.ts
// import * as os from 'os';
// Import TypeORM and reflect-metadata (required for TypeORM decorators)
require("reflect-metadata");
const database_service_1 = require("./src/app/database/database.service");
// Import the new handler registration functions
const printers_handler_1 = require("./electron/handlers/printers.handler");
const personas_handler_1 = require("./electron/handlers/personas.handler");
const auth_handler_1 = require("./electron/handlers/auth.handler");
const images_handler_1 = require("./electron/handlers/images.handler");
const productos_handler_1 = require("./electron/handlers/productos.handler");
const financiero_handler_1 = require("./electron/handlers/financiero.handler");
const compras_handler_1 = require("./electron/handlers/compras.handler");
const system_handler_1 = require("./electron/handlers/system.handler");
let win;
let dbService;
// Remove JWT constants as they are moved
// const JWT_SECRET = 'frc-gourmet-secret-key';
// const TOKEN_EXPIRATION = '7d';
// Store the current user
let currentUser = null;
// Functions to manage currentUser state (used by handlers)
function getCurrentUser() {
    return currentUser;
}
function setCurrentUser(user) {
    currentUser = user;
}
function initializeDatabase() {
    // Get user data path
    const userDataPath = electron_1.app.getPath('userData');
    // Initialize database service
    dbService = database_service_1.DatabaseService.getInstance();
    dbService.initialize(userDataPath)
        .then((dataSource) => {
        console.log('Database initialized successfully');
        // Register all IPC handlers *after* the database is ready
        (0, printers_handler_1.registerPrinterHandlers)(dataSource);
        (0, personas_handler_1.registerPersonasHandlers)(dataSource, getCurrentUser);
        (0, auth_handler_1.registerAuthHandlers)(dataSource, getCurrentUser, setCurrentUser);
        (0, images_handler_1.registerImageHandlers)(dataSource);
        (0, productos_handler_1.registerProductosHandlers)(dataSource, getCurrentUser);
        (0, financiero_handler_1.registerFinancieroHandlers)(dataSource, getCurrentUser);
        (0, compras_handler_1.registerComprasHandlers)(dataSource, getCurrentUser);
        (0, system_handler_1.registerSystemHandlers)(); // system handler doesn't need dataSource or user
    })
        .catch((error) => {
        console.error('Failed to initialize database:', error);
        // Consider how to handle DB init failure (e.g., show error, quit app)
    });
}
function createWindow() {
    // Create the browser window.
    win = new electron_1.BrowserWindow({
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
    }
    else {
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
    electron_1.protocol.registerFileProtocol('app', (request, callback) => {
        const urlPath = request.url.substring(6); // Remove 'app://'
        // Handle profile images
        if (urlPath.startsWith('profile-images/')) {
            const fileName = urlPath.replace('profile-images/', '');
            const imagesDir = path.join(electron_1.app.getPath('userData'), 'profile-images');
            if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir, { recursive: true });
            }
            callback({ path: path.join(imagesDir, fileName) });
            return;
        }
        // Handle product images
        if (urlPath.startsWith('producto-images/')) {
            const fileName = urlPath.replace('producto-images/', '');
            const imagesDir = path.join(electron_1.app.getPath('userData'), 'producto-images');
            if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir, { recursive: true });
            }
            const imagePath = path.join(imagesDir, fileName);
            // console.log('Serving product image from:', imagePath); // Optional logging
            callback({ path: imagePath });
            return;
        }
        // Handle other app:// URLs - check in app folder first
        let normalizedPath = path.normalize(`${electron_1.app.getAppPath()}/${urlPath}`);
        if (fs.existsSync(normalizedPath)) {
            callback({ path: normalizedPath });
        }
        else {
            // Try user data directory as fallback
            const userDataPath = electron_1.app.getPath('userData');
            normalizedPath = path.normalize(`${userDataPath}/${urlPath}`);
            if (fs.existsSync(normalizedPath)) {
                callback({ path: normalizedPath });
            }
            else {
                console.error(`File not found: ${normalizedPath}`);
                callback({ error: -2 /* ENOENT */ });
            }
        }
    });
}
// Initialize the database when the app is ready
electron_1.app.on('ready', () => {
    // The protocol registration needs to happen before createWindow in 'ready'
    // Ensure it only happens once
    if (!electron_1.protocol.isProtocolRegistered('app')) {
        electron_1.protocol.registerFileProtocol('app', (request, callback) => {
            const urlPath = request.url.substring(6); // Remove 'app://'
            // Handle profile images
            if (urlPath.startsWith('profile-images/')) {
                const fileName = urlPath.replace('profile-images/', '');
                const imagesDir = path.join(electron_1.app.getPath('userData'), 'profile-images');
                if (!fs.existsSync(imagesDir)) {
                    fs.mkdirSync(imagesDir, { recursive: true });
                }
                callback({ path: path.join(imagesDir, fileName) });
                return;
            }
            // Handle product images
            if (urlPath.startsWith('producto-images/')) {
                const fileName = urlPath.replace('producto-images/', '');
                const imagesDir = path.join(electron_1.app.getPath('userData'), 'producto-images');
                if (!fs.existsSync(imagesDir)) {
                    fs.mkdirSync(imagesDir, { recursive: true });
                }
                const imagePath = path.join(imagesDir, fileName);
                // console.log('Serving product image from:', imagePath);
                callback({ path: imagePath });
                return;
            }
            // Handle other app:// URLs - check in app folder first
            let normalizedPath = path.normalize(`${electron_1.app.getAppPath()}/${urlPath}`);
            if (fs.existsSync(normalizedPath)) {
                callback({ path: normalizedPath });
            }
            else {
                // Try user data directory as fallback
                const userDataPath = electron_1.app.getPath('userData');
                normalizedPath = path.normalize(`${userDataPath}/${urlPath}`);
                if (fs.existsSync(normalizedPath)) {
                    callback({ path: normalizedPath });
                }
                else {
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
electron_1.app.on('window-all-closed', () => {
    // On macOS specific behavior
    if (process.platform !== 'darwin') {
        // Close the database connection
        if (dbService) {
            dbService.close();
        }
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    // On macOS specific behavior
    if (win === null) {
        createWindow();
    }
});
// ALL IPC HANDLERS AND HELPER FUNCTIONS PREVIOUSLY BELOW THIS LINE HAVE BEEN MOVED
// TO THE respective handler/util files in the electron/ directory.
//# sourceMappingURL=main.js.map