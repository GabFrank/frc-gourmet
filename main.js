"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Use CommonJS require syntax for Electron main process
const { app, BrowserWindow, ipcMain, protocol, IpcMainInvokeEvent, dialog, shell } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const os = require('os');
// Import TypeORM and reflect-metadata (required for TypeORM decorators)
require('reflect-metadata');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
// JSON Web Token for authentication
const jwt = require('jsonwebtoken');
// Import the image handler module
const imageHandler = require('./electron/utils/image-handler');
// Import TypeORM-related code
const typeorm_1 = require("typeorm");
const database_service_1 = require("./src/app/database/database.service");
const printer_entity_1 = require("./src/app/database/entities/printer.entity");
const persona_entity_1 = require("./src/app/database/entities/personas/persona.entity");
const usuario_entity_1 = require("./src/app/database/entities/personas/usuario.entity");
const role_entity_1 = require("./src/app/database/entities/personas/role.entity");
const usuario_role_entity_1 = require("./src/app/database/entities/personas/usuario-role.entity");
const tipo_cliente_entity_1 = require("./src/app/database/entities/personas/tipo-cliente.entity");
const cliente_entity_1 = require("./src/app/database/entities/personas/cliente.entity");
const login_session_entity_1 = require("./src/app/database/entities/auth/login-session.entity");
const categoria_entity_1 = require("./src/app/database/entities/productos/categoria.entity");
const subcategoria_entity_1 = require("./src/app/database/entities/productos/subcategoria.entity");
const producto_entity_1 = require("./src/app/database/entities/productos/producto.entity");
const producto_image_entity_1 = require("./src/app/database/entities/productos/producto-image.entity");
const presentacion_entity_1 = require("./src/app/database/entities/productos/presentacion.entity");
const moneda_entity_1 = require("./src/app/database/entities/financiero/moneda.entity");
const precio_venta_entity_1 = require("./src/app/database/entities/productos/precio-venta.entity");
const codigo_entity_1 = require("./src/app/database/entities/productos/codigo.entity");
const sabor_entity_1 = require("./src/app/database/entities/productos/sabor.entity");
const presentacion_sabor_entity_1 = require("./src/app/database/entities/productos/presentacion-sabor.entity");
const receta_entity_1 = require("./src/app/database/entities/productos/receta.entity");
const receta_item_entity_1 = require("./src/app/database/entities/productos/receta-item.entity");
const ingrediente_entity_1 = require("./src/app/database/entities/productos/ingrediente.entity");
const tipo_precio_entity_1 = require("./src/app/database/entities/financiero/tipo-precio.entity");
const receta_variacion_entity_1 = require("./src/app/database/entities/productos/receta-variacion.entity");
const receta_variacion_item_entity_1 = require("./src/app/database/entities/productos/receta-variacion-item.entity");
// Import new financial entities
const moneda_billete_entity_1 = require("./src/app/database/entities/financiero/moneda-billete.entity");
const conteo_entity_1 = require("./src/app/database/entities/financiero/conteo.entity");
const conteo_detalle_entity_1 = require("./src/app/database/entities/financiero/conteo-detalle.entity");
const dispositivo_entity_1 = require("./src/app/database/entities/financiero/dispositivo.entity");
const caja_entity_1 = require("./src/app/database/entities/financiero/caja.entity");
const caja_moneda_entity_1 = require("./src/app/database/entities/financiero/caja-moneda.entity");
const moneda_cambio_entity_1 = require("./src/app/database/entities/financiero/moneda-cambio.entity");
const proveedor_entity_1 = require("./src/app/database/entities/compras/proveedor.entity");
const compra_entity_1 = require("./src/app/database/entities/compras/compra.entity");
const compra_detalle_entity_1 = require("./src/app/database/entities/compras/compra-detalle.entity");
const pago_entity_1 = require("./src/app/database/entities/compras/pago.entity");
const pago_detalle_entity_1 = require("./src/app/database/entities/compras/pago-detalle.entity");
const proveedor_producto_entity_1 = require("./src/app/database/entities/compras/proveedor-producto.entity");
let win;
let dbService;
// JWT Secret for token generation
const JWT_SECRET = 'frc-gourmet-secret-key';
const TOKEN_EXPIRATION = '7d';
// Store the current user
let currentUser = null;
function initializeDatabase() {
    // Get user data path
    const userDataPath = app.getPath('userData');
    // Initialize database service
    dbService = database_service_1.DatabaseService.getInstance();
    dbService.initialize(userDataPath)
        .then((dataSource) => {
        console.log('Database initialized successfully');
    })
        .catch((error) => {
        console.error('Failed to initialize database:', error);
    });
}
function createWindow() {
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
    protocol.registerFileProtocol('app', (request, callback) => {
        const urlPath = request.url.substring(6); // Remove 'app://'
        // Handle profile images
        if (urlPath.startsWith('profile-images/')) {
            const fileName = urlPath.replace('profile-images/', '');
            const imagesDir = path.join(app.getPath('userData'), 'profile-images');
            // Create directory if it doesn't exist
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
            // Create directory if it doesn't exist
            if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir, { recursive: true });
            }
            const imagePath = path.join(imagesDir, fileName);
            console.log('Serving product image from:', imagePath);
            callback({ path: imagePath });
            return;
        }
        // Handle other app:// URLs - check in app folder first
        let normalizedPath = path.normalize(`${app.getAppPath()}/${urlPath}`);
        if (fs.existsSync(normalizedPath)) {
            callback({ path: normalizedPath });
        }
        else {
            // Try user data directory as fallback
            const userDataPath = app.getPath('userData');
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
app.on('ready', () => {
    // Register the app:// protocol for handling local files
    protocol.registerFileProtocol('app', (request, callback) => {
        const urlPath = request.url.substring(6); // Remove 'app://'
        // Handle profile images
        if (urlPath.startsWith('profile-images/')) {
            const fileName = urlPath.replace('profile-images/', '');
            const imagesDir = path.join(app.getPath('userData'), 'profile-images');
            // Create directory if it doesn't exist
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
            // Create directory if it doesn't exist
            if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir, { recursive: true });
            }
            const imagePath = path.join(imagesDir, fileName);
            console.log('Serving product image from:', imagePath);
            callback({ path: imagePath });
            return;
        }
        // Handle other app:// URLs - check in app folder first
        let normalizedPath = path.normalize(`${app.getAppPath()}/${urlPath}`);
        if (fs.existsSync(normalizedPath)) {
            callback({ path: normalizedPath });
        }
        else {
            // Try user data directory as fallback
            const userDataPath = app.getPath('userData');
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
// Handle IPC events for database operations using TypeORM
// IPC handler for getting all printers
ipcMain.handle('get-printers', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const printerRepository = dataSource.getRepository(printer_entity_1.Printer);
        const printers = await printerRepository.find();
        return printers;
    }
    catch (error) {
        console.error('Error getting printers:', error);
        throw error;
    }
});
// IPC handler for adding a printer
ipcMain.handle('add-printer', async (_event, printer) => {
    try {
        const dataSource = dbService.getDataSource();
        const printerRepository = dataSource.getRepository(printer_entity_1.Printer);
        // If this is a default printer, unset any existing defaults
        if (printer.isDefault) {
            await printerRepository.update({ isDefault: true }, { isDefault: false });
        }
        // Create the new printer
        const newPrinter = printerRepository.create({
            name: printer.name,
            type: printer.type,
            connectionType: printer.connectionType,
            address: printer.address,
            port: printer.port,
            dpi: printer.dpi,
            width: printer.width,
            characterSet: printer.characterSet,
            isDefault: printer.isDefault,
            options: printer.options ? JSON.stringify(printer.options) : undefined
        });
        const savedPrinter = await printerRepository.save(newPrinter);
        return { success: true, printer: savedPrinter };
    }
    catch (error) {
        console.error('Error adding printer:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// IPC handler for updating a printer
ipcMain.handle('update-printer', async (_event, printerId, printer) => {
    try {
        const dataSource = dbService.getDataSource();
        const printerRepository = dataSource.getRepository(printer_entity_1.Printer);
        // If this is a default printer, unset any existing defaults
        if (printer.isDefault) {
            await printerRepository.update({ isDefault: true }, { isDefault: false });
        }
        // Update the printer
        const result = await printerRepository.update(printerId, {
            name: printer.name,
            type: printer.type,
            connectionType: printer.connectionType,
            address: printer.address,
            port: printer.port,
            dpi: printer.dpi,
            width: printer.width,
            characterSet: printer.characterSet,
            isDefault: printer.isDefault,
            options: printer.options ? JSON.stringify(printer.options) : undefined
        });
        if (result.affected && result.affected > 0) {
            // Get the updated printer
            const updatedPrinter = await printerRepository.findOneBy({ id: printerId });
            return { success: true, printer: updatedPrinter };
        }
        else {
            return { success: false, error: 'Printer not found' };
        }
    }
    catch (error) {
        console.error('Error updating printer:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// IPC handler for deleting a printer
ipcMain.handle('delete-printer', async (_event, printerId) => {
    try {
        const dataSource = dbService.getDataSource();
        const printerRepository = dataSource.getRepository(printer_entity_1.Printer);
        const result = await printerRepository.delete(printerId);
        if (result.affected && result.affected > 0) {
            return { success: true };
        }
        else {
            return { success: false, error: 'Printer not found' };
        }
    }
    catch (error) {
        console.error('Error deleting printer:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// Helper function to generate receipt content
function generateReceiptContent(order, orderItems) {
    const dateTime = new Date(order.orderTime).toLocaleString();
    let content = `
==============================
         FRC GOURMET
==============================
Order #: ${order.id}
Date: ${dateTime}
Customer: ${order.customerName}
Table: ${order.tableNumber}
------------------------------
ITEMS
------------------------------
`;
    // Add items
    let subtotal = 0;
    for (const item of orderItems) {
        // Adapt for TypeORM entities
        const product = item.product;
        const lineTotal = product.price * item.quantity;
        subtotal += lineTotal;
        content += `${product.name}
${item.quantity} x $${product.price.toFixed(2)} = $${lineTotal.toFixed(2)}
${item.notes ? `Note: ${item.notes}` : ''}
------------------------------
`;
    }
    // Add total
    content += `
SUBTOTAL: $${subtotal.toFixed(2)}
TAX: $${(subtotal * 0.08).toFixed(2)}
TOTAL: $${order.totalAmount.toFixed(2)}
==============================
        THANK YOU!
   PLEASE COME AGAIN SOON
==============================
`;
    return content;
}
// Helper function to generate test page content
function generateTestPageContent(printer) {
    return `
==============================
         TEST PAGE
==============================
Printer: ${printer.name}
Type: ${printer.type}
Connection: ${printer.connectionType}
Address: ${printer.address}
${printer.port ? `Port: ${printer.port}` : ''}
------------------------------
This is a test page to verify
that your printer is working
correctly with FRC Gourmet.
==============================
If you can read this message,
your printer is correctly
configured and working!
==============================
        THANK YOU!
==============================
`;
}
// Helper function to print receipt with thermal printer
async function printThermalReceipt(printer, content) {
    try {
        const thermalPrinter = new ThermalPrinter({
            type: getPrinterType(printer.type),
            interface: printer.connectionType === 'network'
                ? `tcp://${printer.address}:${printer.port || 9100}`
                : printer.address,
            width: printer.width || 48,
            characterSet: printer.characterSet || CharacterSet.PC437_USA,
            removeSpecialCharacters: false,
            options: printer.options ? JSON.parse(printer.options) : {}
        });
        const isConnected = await thermalPrinter.isPrinterConnected();
        if (!isConnected) {
            throw new Error('Printer is not connected');
        }
        thermalPrinter.print(content);
        thermalPrinter.cut();
        await thermalPrinter.execute();
        console.log('Print completed successfully');
        return true;
    }
    catch (error) {
        console.error('Error printing with thermal printer:', error);
        throw error;
    }
}
// Helper function to print receipt with POS printer
async function printPosReceipt(printer, content) {
    try {
        // Special handling for CUPS printers
        if (printer.connectionType === 'usb' && printer.address.includes('ticket-')) {
            console.log("Detected CUPS printer. Using direct CUPS printing approach.");
            // Use child_process to directly print to CUPS
            const { exec } = require('child_process');
            // Create a temporary file for the content
            const tempFile = path.join(app.getPath('temp'), `receipt-${Date.now()}.txt`);
            fs.writeFileSync(tempFile, content, 'utf8');
            // Print using lp command (standard CUPS printing command)
            const printCommand = `lp -d ${printer.address} ${tempFile}`;
            console.log(`Executing: ${printCommand}`);
            return new Promise((resolve, reject) => {
                exec(printCommand, (error, stdout, stderr) => {
                    // Clean up the temp file
                    try {
                        fs.unlinkSync(tempFile);
                    }
                    catch (e) {
                        console.error('Failed to delete temp file:', e);
                    }
                    if (error) {
                        console.error(`CUPS printing error: ${error.message}`);
                        console.error(`stderr: ${stderr}`);
                        reject(error);
                        return;
                    }
                    console.log(`CUPS printing stdout: ${stdout}`);
                    console.log("CUPS printing done!");
                    resolve(true);
                });
            });
        }
        // Regular thermal printer printing for non-CUPS printers
        // Create interface string based on connection type
        let interfaceConfig;
        if (printer.connectionType === 'network') {
            // For regular network printers
            interfaceConfig = `tcp://${printer.address}:${printer.port || 9100}`;
        }
        else if (printer.connectionType === 'usb') {
            // For USB connected printers
            interfaceConfig = printer.address;
        }
        else if (printer.connectionType === 'bluetooth') {
            // For Bluetooth printers
            interfaceConfig = `bt:${printer.address}`;
        }
        else {
            // Fallback
            interfaceConfig = printer.address;
        }
        console.log(`Using printer interface: ${interfaceConfig}`);
        // Get the character set from the CharacterSet enum
        const characterSet = printer.characterSet ? getCharacterSet(printer.characterSet) : CharacterSet.PC437_USA;
        // Use node-thermal-printer with the right configuration
        const thermalPrinter = new ThermalPrinter({
            type: getPrinterType(printer.type),
            interface: interfaceConfig,
            options: {
                timeout: 5000
            },
            width: printer.width || 48,
            characterSet: characterSet,
        });
        // Check connection
        const isConnected = await thermalPrinter.isPrinterConnected();
        if (!isConnected) {
            console.error('Printer is not connected');
            return false;
        }
        // Print receipt
        thermalPrinter.alignCenter();
        thermalPrinter.println(content);
        thermalPrinter.cut();
        await thermalPrinter.execute();
        console.log("Print done!");
        return true;
    }
    catch (error) {
        console.error('Error during printing:', error);
        return false;
    }
}
// Helper function to get printer type for node-thermal-printer
function getPrinterType(type) {
    switch (type.toLowerCase()) {
        case 'epson':
            return PrinterTypes.EPSON;
        case 'star':
            return PrinterTypes.STAR;
        default:
            return PrinterTypes.EPSON; // Default to EPSON
    }
}
// Helper function to get character set for node-thermal-printer
function getCharacterSet(charset) {
    switch (charset) {
        case 'PC437_USA':
            return CharacterSet.PC437_USA;
        case 'PC850_MULTILINGUAL':
            return CharacterSet.PC850_MULTILINGUAL;
        case 'PC860_PORTUGUESE':
            return CharacterSet.PC860_PORTUGUESE;
        case 'PC863_CANADIAN_FRENCH':
            return CharacterSet.PC863_CANADIAN_FRENCH;
        case 'PC865_NORDIC':
            return CharacterSet.PC865_NORDIC;
        case 'PC851_GREEK':
            return CharacterSet.PC851_GREEK;
        case 'PC857_TURKISH':
            return CharacterSet.PC857_TURKISH;
        case 'PC737_GREEK':
            return CharacterSet.PC737_GREEK;
        case 'ISO8859_7_GREEK':
            return CharacterSet.ISO8859_7_GREEK;
        case 'SLOVENIA':
            return CharacterSet.SLOVENIA;
        case 'PC852_LATIN2':
            return CharacterSet.PC852_LATIN2;
        case 'PC858_EURO':
            return CharacterSet.PC858_EURO;
        case 'WPC1252':
            return CharacterSet.WPC1252;
        case 'PC866_CYRILLIC2':
            return CharacterSet.PC866_CYRILLIC2;
        case 'PC852_LATIN2_2':
            return CharacterSet.PC852_LATIN2;
        default:
            return CharacterSet.PC437_USA; // Default to USA
    }
}
// IPC handler for printing a test page
ipcMain.handle('print-test-page', async (_event, printerId) => {
    try {
        // Get the printer configuration
        const dataSource = dbService.getDataSource();
        const printerRepository = dataSource.getRepository(printer_entity_1.Printer);
        const printer = await printerRepository.findOneBy({ id: printerId });
        if (!printer) {
            throw new Error('Printer not found');
        }
        // Generate test page content
        const content = generateTestPageContent(printer);
        // Print the test page
        const success = await printPosReceipt(printer, content);
        return { success };
    }
    catch (error) {
        console.error('Error printing test page:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
});
// IPC handler for printing a receipt
// Helper function to handle user tracking for created/updated entities
async function setEntityUserTracking(entity, usuarioId, isUpdate) {
    if (!usuarioId)
        return;
    try {
        const dataSource = dbService.getDataSource();
        const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
        if (usuario) {
            if (!isUpdate) {
                entity.createdBy = usuario;
            }
            entity.updatedBy = usuario;
        }
    }
    catch (error) {
        console.error(`Error setting user tracking ${isUpdate ? 'update' : 'create'}:`, error);
        // Continue without setting user - don't fail the operation
    }
}
// IPC handlers for Persona entity
// Get all personas
ipcMain.handle('get-personas', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
        return await personaRepository.find({
            order: { nombre: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting personas:', error);
        throw error;
    }
});
// Get persona by ID
ipcMain.handle('get-persona', async (_event, personaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
        return await personaRepository.findOneBy({ id: personaId });
    }
    catch (error) {
        console.error('Error getting persona:', error);
        throw error;
    }
});
// Create a new persona
ipcMain.handle('create-persona', async (_event, personaData, usuarioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
        const persona = personaRepository.create({
            nombre: personaData.nombre,
            telefono: personaData.telefono,
            direccion: personaData.direccion,
            tipoDocumento: personaData.tipoDocumento,
            documento: personaData.documento,
            tipoPersona: personaData.tipoPersona,
            activo: personaData.activo !== undefined ? personaData.activo : true,
            imageUrl: personaData.imageUrl // Add imageUrl field
        });
        // Log the persona data before saving
        console.log('Creating persona with data:', {
            ...persona,
            imageUrl: persona.imageUrl // Log imageUrl specifically
        });
        // Add user tracking
        await setEntityUserTracking(persona, usuarioId, false);
        const savedPersona = await personaRepository.save(persona);
        // Log the saved persona
        console.log('Persona created, saved data:', {
            ...savedPersona,
            imageUrl: savedPersona.imageUrl // Log imageUrl specifically
        });
        return savedPersona;
    }
    catch (error) {
        console.error('Error creating persona:', error);
        throw error;
    }
});
// Update a persona
ipcMain.handle('update-persona', async (_event, personaId, personaData, usuarioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
        // First get the existing entity
        const persona = await personaRepository.findOne({
            where: { id: personaId },
            relations: ['createdBy', 'updatedBy']
        });
        if (!persona) {
            return { success: false, message: 'No persona found with that ID' };
        }
        // Update fields
        if (personaData.nombre !== undefined)
            persona.nombre = personaData.nombre;
        if (personaData.telefono !== undefined)
            persona.telefono = personaData.telefono;
        if (personaData.direccion !== undefined)
            persona.direccion = personaData.direccion;
        if (personaData.tipoDocumento !== undefined)
            persona.tipoDocumento = personaData.tipoDocumento;
        if (personaData.documento !== undefined)
            persona.documento = personaData.documento;
        if (personaData.tipoPersona !== undefined)
            persona.tipoPersona = personaData.tipoPersona;
        if (personaData.activo !== undefined)
            persona.activo = personaData.activo;
        // Handle imageUrl field explicitly
        if (personaData.imageUrl !== undefined) {
            console.log(`Updating persona imageUrl from ${persona.imageUrl} to ${personaData.imageUrl}`);
            persona.imageUrl = personaData.imageUrl;
        }
        // Add user tracking
        await setEntityUserTracking(persona, usuarioId, true);
        // Log the persona data before saving
        console.log('Updating persona with data:', {
            ...persona,
            imageUrl: persona.imageUrl // Log imageUrl specifically
        });
        const savedPersona = await personaRepository.save(persona);
        // Log the saved persona
        console.log('Persona updated, saved data:', {
            ...savedPersona,
            imageUrl: savedPersona.imageUrl // Log imageUrl specifically
        });
        return { success: true, persona: savedPersona };
    }
    catch (error) {
        console.error('Error updating persona:', error);
        throw error;
    }
});
// Delete a persona (soft delete by setting activo to false)
ipcMain.handle('delete-persona', async (_event, personaId, usuarioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
        // First get the persona to update the updatedBy field
        const persona = await personaRepository.findOne({
            where: { id: personaId },
            relations: ['createdBy', 'updatedBy']
        });
        if (!persona) {
            return { success: false, message: 'No persona found with that ID' };
        }
        // Set activo to false
        persona.activo = false;
        // Add user tracking for the update
        await setEntityUserTracking(persona, usuarioId, true);
        // Save the updated persona
        await personaRepository.save(persona);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting persona:', error);
        throw error;
    }
});
// IPC handlers for Usuario entity
// Get all usuarios
ipcMain.handle('get-usuarios', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        return await usuarioRepository.find({
            relations: ['persona'],
            order: { nickname: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting usuarios:', error);
        throw error;
    }
});
// Get usuario by ID
ipcMain.handle('get-usuario', async (_event, usuarioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        return await usuarioRepository.findOne({
            where: { id: usuarioId },
            relations: ['persona']
        });
    }
    catch (error) {
        console.error('Error getting usuario:', error);
        throw error;
    }
});
// Create a new usuario
ipcMain.handle('create-usuario', async (_event, usuarioData) => {
    console.log('usuarioData', usuarioData);
    try {
        const dataSource = dbService.getDataSource();
        const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
        // Check if nickname already exists (case insensitive)
        const existingUsuarios = await usuarioRepository.find();
        const nicknameExists = existingUsuarios.some(u => u.nickname.toUpperCase() === usuarioData.nickname.toUpperCase());
        if (nicknameExists) {
            return {
                success: false,
                message: 'El nombre de usuario ya está en uso. Por favor, elija otro.'
            };
        }
        // First get the persona
        const persona = usuarioData.persona_id != null ? await personaRepository.findBy({ id: usuarioData.persona_id }) : null;
        if (usuarioData.persona_id != null && !persona) {
            return {
                success: false,
                message: 'Persona no encontrada'
            };
        }
        const usuario = usuarioRepository.create({
            persona: persona,
            nickname: usuarioData.nickname,
            password: usuarioData.password || "123",
            activo: usuarioData.activo !== undefined ? usuarioData.activo : true
        });
        const savedUsuario = await usuarioRepository.save(usuario);
        // Fetch the complete usuario with relations
        const completeUsuario = await usuarioRepository.findOne({
            where: { id: savedUsuario.id },
            relations: ['persona']
        });
        return {
            success: true,
            usuario: completeUsuario
        };
    }
    catch (error) {
        console.error('Error creating usuario:', error);
        return {
            success: false,
            message: 'Error al crear usuario: ' + error.message
        };
    }
});
// Update an usuario
ipcMain.handle('update-usuario', async (_event, usuarioId, usuarioData) => {
    try {
        const dataSource = dbService.getDataSource();
        const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
        // Get the current usuario
        const usuario = await usuarioRepository.findOne({
            where: { id: usuarioId },
            relations: ['persona']
        });
        if (!usuario) {
            return { success: false, message: 'No usuario found with that ID' };
        }
        // If nickname is being updated, check for uniqueness (case-insensitive)
        if (usuarioData.nickname !== undefined &&
            usuarioData.nickname.toUpperCase() !== usuario.nickname.toUpperCase()) {
            const existingUsuarios = await usuarioRepository.find();
            const nicknameExists = existingUsuarios.some(u => u.id !== usuarioId &&
                u.nickname.toUpperCase() === usuarioData.nickname.toUpperCase());
            if (nicknameExists) {
                return {
                    success: false,
                    message: 'El nombre de usuario ya está en uso. Por favor, elija otro.'
                };
            }
        }
        // If persona is being updated
        if (usuarioData.persona_id !== undefined) {
            const persona = await personaRepository.findOneBy({ id: usuarioData.persona_id });
            if (!persona) {
                return { success: false, message: 'Persona not found' };
            }
            usuario.persona = persona;
        }
        // Update fields
        if (usuarioData.nickname !== undefined)
            usuario.nickname = usuarioData.nickname;
        if (usuarioData.password !== undefined)
            usuario.password = usuarioData.password;
        if (usuarioData.activo !== undefined)
            usuario.activo = usuarioData.activo;
        const updatedUsuario = await usuarioRepository.save(usuario);
        return { success: true, usuario: updatedUsuario };
    }
    catch (error) {
        console.error('Error updating usuario:', error);
        return {
            success: false,
            message: 'Error al actualizar usuario: ' + error.message
        };
    }
});
// Delete a usuario (soft delete by setting activo to false)
ipcMain.handle('delete-usuario', async (_event, usuarioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        const result = await usuarioRepository.update(usuarioId, { activo: false });
        if (result.affected && result.affected > 0) {
            return { success: true };
        }
        else {
            return { success: false, message: 'No usuario found with that ID' };
        }
    }
    catch (error) {
        console.error('Error deleting usuario:', error);
        throw error;
    }
});
// IPC handlers for Role entity
// Get all roles
ipcMain.handle('get-roles', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const roleRepository = dataSource.getRepository(role_entity_1.Role);
        return await roleRepository.find({
            order: { descripcion: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting roles:', error);
        throw error;
    }
});
// Get role by ID
ipcMain.handle('get-role', async (_event, roleId) => {
    try {
        const dataSource = dbService.getDataSource();
        const roleRepository = dataSource.getRepository(role_entity_1.Role);
        return await roleRepository.findOneBy({ id: roleId });
    }
    catch (error) {
        console.error('Error getting role:', error);
        throw error;
    }
});
// Create a new role
ipcMain.handle('create-role', async (_event, roleData) => {
    try {
        const dataSource = dbService.getDataSource();
        const roleRepository = dataSource.getRepository(role_entity_1.Role);
        const role = roleRepository.create({
            descripcion: roleData.descripcion,
            activo: roleData.activo !== undefined ? roleData.activo : true
        });
        const savedRole = await roleRepository.save(role);
        return savedRole;
    }
    catch (error) {
        console.error('Error creating role:', error);
        throw error;
    }
});
// Update a role
ipcMain.handle('update-role', async (_event, roleId, roleData) => {
    try {
        const dataSource = dbService.getDataSource();
        const roleRepository = dataSource.getRepository(role_entity_1.Role);
        const result = await roleRepository.update(roleId, {
            descripcion: roleData.descripcion,
            activo: roleData.activo
        });
        if (result.affected && result.affected > 0) {
            const updatedRole = await roleRepository.findOneBy({ id: roleId });
            return { success: true, role: updatedRole };
        }
        else {
            return { success: false, message: 'No role found with that ID' };
        }
    }
    catch (error) {
        console.error('Error updating role:', error);
        throw error;
    }
});
// Delete a role (soft delete by setting activo to false)
ipcMain.handle('delete-role', async (_event, roleId) => {
    try {
        const dataSource = dbService.getDataSource();
        const roleRepository = dataSource.getRepository(role_entity_1.Role);
        const result = await roleRepository.update(roleId, { activo: false });
        if (result.affected && result.affected > 0) {
            return { success: true };
        }
        else {
            return { success: false, message: 'No role found with that ID' };
        }
    }
    catch (error) {
        console.error('Error deleting role:', error);
        throw error;
    }
});
// IPC handlers for UsuarioRole entity
// Get all roles for a specific usuario
ipcMain.handle('get-usuario-roles', async (_event, usuarioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const usuarioRoleRepository = dataSource.getRepository(usuario_role_entity_1.UsuarioRole);
        return await usuarioRoleRepository.find({
            where: { usuario: { id: usuarioId } },
            relations: ['usuario', 'role', 'usuario.persona']
        });
    }
    catch (error) {
        console.error('Error getting usuario roles:', error);
        throw error;
    }
});
// Assign a role to a usuario
ipcMain.handle('assign-role-to-usuario', async (_event, usuarioId, roleId) => {
    try {
        const dataSource = dbService.getDataSource();
        const usuarioRoleRepository = dataSource.getRepository(usuario_role_entity_1.UsuarioRole);
        const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        const roleRepository = dataSource.getRepository(role_entity_1.Role);
        // Check if usuario and role exist
        const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
        if (!usuario) {
            return { success: false, message: 'Usuario not found' };
        }
        const role = await roleRepository.findOneBy({ id: roleId });
        if (!role) {
            return { success: false, message: 'Role not found' };
        }
        // Check if this assignment already exists
        const existingAssignment = await usuarioRoleRepository.findOne({
            where: {
                usuario: { id: usuarioId },
                role: { id: roleId }
            }
        });
        if (existingAssignment) {
            return { success: false, message: 'This role is already assigned to this user' };
        }
        // Create new assignment
        const usuarioRole = usuarioRoleRepository.create({
            usuario: usuario,
            role: role
        });
        const savedUsuarioRole = await usuarioRoleRepository.save(usuarioRole);
        // Fetch the complete usuarioRole with relations
        const completeUsuarioRole = await usuarioRoleRepository.findOne({
            where: { id: savedUsuarioRole.id },
            relations: ['usuario', 'role', 'usuario.persona']
        });
        return { success: true, usuarioRole: completeUsuarioRole };
    }
    catch (error) {
        console.error('Error assigning role to usuario:', error);
        throw error;
    }
});
// Remove a role from a usuario
ipcMain.handle('remove-role-from-usuario', async (_event, usuarioRoleId) => {
    try {
        const dataSource = dbService.getDataSource();
        const usuarioRoleRepository = dataSource.getRepository(usuario_role_entity_1.UsuarioRole);
        const result = await usuarioRoleRepository.delete(usuarioRoleId);
        if (result.affected && result.affected > 0) {
            return { success: true };
        }
        else {
            return { success: false, message: 'No assignment found with that ID' };
        }
    }
    catch (error) {
        console.error('Error removing role from usuario:', error);
        throw error;
    }
});
// IPC handlers for TipoCliente entity
// Get all tipo clientes
ipcMain.handle('get-tipo-clientes', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
        return await tipoClienteRepository.find({
            order: { descripcion: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting tipo clientes:', error);
        throw error;
    }
});
// Get tipo cliente by ID
ipcMain.handle('get-tipo-cliente', async (_event, tipoClienteId) => {
    try {
        const dataSource = dbService.getDataSource();
        const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
        return await tipoClienteRepository.findOneBy({ id: tipoClienteId });
    }
    catch (error) {
        console.error('Error getting tipo cliente:', error);
        throw error;
    }
});
// Create a new tipo cliente
ipcMain.handle('create-tipo-cliente', async (_event, tipoClienteData) => {
    try {
        const dataSource = dbService.getDataSource();
        const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
        const tipoCliente = tipoClienteRepository.create({
            descripcion: tipoClienteData.descripcion,
            activo: tipoClienteData.activo !== undefined ? tipoClienteData.activo : true,
            credito: tipoClienteData.credito !== undefined ? tipoClienteData.credito : false,
            descuento: tipoClienteData.descuento !== undefined ? tipoClienteData.descuento : false,
            porcentaje_descuento: tipoClienteData.porcentaje_descuento || 0
        });
        const savedTipoCliente = await tipoClienteRepository.save(tipoCliente);
        return savedTipoCliente;
    }
    catch (error) {
        console.error('Error creating tipo cliente:', error);
        throw error;
    }
});
// Update a tipo cliente
ipcMain.handle('update-tipo-cliente', async (_event, tipoClienteId, tipoClienteData) => {
    try {
        const dataSource = dbService.getDataSource();
        const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
        const result = await tipoClienteRepository.update(tipoClienteId, {
            descripcion: tipoClienteData.descripcion,
            activo: tipoClienteData.activo,
            credito: tipoClienteData.credito,
            descuento: tipoClienteData.descuento,
            porcentaje_descuento: tipoClienteData.porcentaje_descuento
        });
        if (result.affected && result.affected > 0) {
            const updatedTipoCliente = await tipoClienteRepository.findOneBy({ id: tipoClienteId });
            return { success: true, tipoCliente: updatedTipoCliente };
        }
        else {
            return { success: false, message: 'No tipo cliente found with that ID' };
        }
    }
    catch (error) {
        console.error('Error updating tipo cliente:', error);
        throw error;
    }
});
// Delete a tipo cliente (soft delete by setting activo to false)
ipcMain.handle('delete-tipo-cliente', async (_event, tipoClienteId) => {
    try {
        const dataSource = dbService.getDataSource();
        const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
        const result = await tipoClienteRepository.update(tipoClienteId, { activo: false });
        if (result.affected && result.affected > 0) {
            return { success: true };
        }
        else {
            return { success: false, message: 'No tipo cliente found with that ID' };
        }
    }
    catch (error) {
        console.error('Error deleting tipo cliente:', error);
        throw error;
    }
});
// IPC handlers for Cliente entity
// Get all clientes
ipcMain.handle('get-clientes', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const clienteRepository = dataSource.getRepository(cliente_entity_1.Cliente);
        return await clienteRepository.find({
            relations: ['persona', 'tipo_cliente'],
            order: {
                persona: {
                    nombre: 'ASC'
                }
            }
        });
    }
    catch (error) {
        console.error('Error getting clientes:', error);
        throw error;
    }
});
// Get cliente by ID
ipcMain.handle('get-cliente', async (_event, clienteId) => {
    try {
        const dataSource = dbService.getDataSource();
        const clienteRepository = dataSource.getRepository(cliente_entity_1.Cliente);
        return await clienteRepository.findOne({
            where: { id: clienteId },
            relations: ['persona', 'tipo_cliente']
        });
    }
    catch (error) {
        console.error('Error getting cliente:', error);
        throw error;
    }
});
// Create a new cliente
ipcMain.handle('create-cliente', async (_event, clienteData) => {
    try {
        const dataSource = dbService.getDataSource();
        const clienteRepository = dataSource.getRepository(cliente_entity_1.Cliente);
        const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
        const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
        // First get the persona and tipo_cliente
        const persona = await personaRepository.findOneBy({ id: clienteData.persona.id });
        if (!persona) {
            throw new Error('Persona not found');
        }
        const tipoCliente = await tipoClienteRepository.findOneBy({ id: clienteData.tipo_cliente.id });
        if (!tipoCliente) {
            throw new Error('Tipo Cliente not found');
        }
        const cliente = clienteRepository.create({
            persona: persona,
            tipo_cliente: tipoCliente,
            ruc: clienteData.ruc,
            razon_social: clienteData.razon_social,
            tributa: clienteData.tributa !== undefined ? clienteData.tributa : false,
            activo: clienteData.activo !== undefined ? clienteData.activo : true,
            credito: clienteData.credito !== undefined ? clienteData.credito : false,
            limite_credito: clienteData.limite_credito || 0
        });
        const savedCliente = await clienteRepository.save(cliente);
        // Fetch the complete cliente with relations
        const completeCliente = await clienteRepository.findOne({
            where: { id: savedCliente.id },
            relations: ['persona', 'tipo_cliente']
        });
        return completeCliente;
    }
    catch (error) {
        console.error('Error creating cliente:', error);
        throw error;
    }
});
// Update a cliente
ipcMain.handle('update-cliente', async (_event, clienteId, clienteData) => {
    try {
        const dataSource = dbService.getDataSource();
        const clienteRepository = dataSource.getRepository(cliente_entity_1.Cliente);
        const personaRepository = dataSource.getRepository(persona_entity_1.Persona);
        const tipoClienteRepository = dataSource.getRepository(tipo_cliente_entity_1.TipoCliente);
        // Get the current cliente
        const cliente = await clienteRepository.findOne({
            where: { id: clienteId },
            relations: ['persona', 'tipo_cliente']
        });
        if (!cliente) {
            return { success: false, message: 'No cliente found with that ID' };
        }
        // If persona is being updated
        if (clienteData.persona && clienteData.persona.id) {
            const persona = await personaRepository.findOneBy({ id: clienteData.persona.id });
            if (!persona) {
                return { success: false, message: 'Persona not found' };
            }
            cliente.persona = persona;
        }
        // If tipo_cliente is being updated
        if (clienteData.tipo_cliente && clienteData.tipo_cliente.id) {
            const tipoCliente = await tipoClienteRepository.findOneBy({ id: clienteData.tipo_cliente.id });
            if (!tipoCliente) {
                return { success: false, message: 'Tipo Cliente not found' };
            }
            cliente.tipo_cliente = tipoCliente;
        }
        // Update fields
        if (clienteData.ruc !== undefined)
            cliente.ruc = clienteData.ruc;
        if (clienteData.razon_social !== undefined)
            cliente.razon_social = clienteData.razon_social;
        if (clienteData.tributa !== undefined)
            cliente.tributa = clienteData.tributa;
        if (clienteData.activo !== undefined)
            cliente.activo = clienteData.activo;
        if (clienteData.credito !== undefined)
            cliente.credito = clienteData.credito;
        if (clienteData.limite_credito !== undefined)
            cliente.limite_credito = clienteData.limite_credito;
        const updatedCliente = await clienteRepository.save(cliente);
        return { success: true, cliente: updatedCliente };
    }
    catch (error) {
        console.error('Error updating cliente:', error);
        throw error;
    }
});
// Delete a cliente (soft delete by setting activo to false)
ipcMain.handle('delete-cliente', async (_event, clienteId) => {
    try {
        const dataSource = dbService.getDataSource();
        const clienteRepository = dataSource.getRepository(cliente_entity_1.Cliente);
        const result = await clienteRepository.update(clienteId, { activo: false });
        if (result.affected && result.affected > 0) {
            return { success: true };
        }
        else {
            return { success: false, message: 'No cliente found with that ID' };
        }
    }
    catch (error) {
        console.error('Error deleting cliente:', error);
        throw error;
    }
});
// Get usuarios with pagination
ipcMain.handle('get-usuarios-paginated', async (_event, page, pageSize, filters = {}) => {
    try {
        const dataSource = dbService.getDataSource();
        const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        // Build query with relations
        const queryBuilder = usuarioRepository.createQueryBuilder('usuario')
            .leftJoinAndSelect('usuario.persona', 'persona');
        // Apply filters if provided
        if (filters && Object.keys(filters).length > 0) {
            // Filter by nickname (case insensitive)
            if (filters.nickname && typeof filters.nickname === 'string') {
                queryBuilder.andWhere("LOWER(usuario.nickname) LIKE LOWER(:nickname)", {
                    nickname: `%${filters.nickname}%`
                });
            }
            // Filter by persona nombre (case insensitive)
            if (filters.nombrePersona && typeof filters.nombrePersona === 'string') {
                queryBuilder.andWhere("LOWER(persona.nombre) LIKE LOWER(:nombre)", {
                    nombre: `%${filters.nombrePersona}%`
                });
            }
            // Filter by active status
            if (filters.activo !== undefined && filters.activo !== null && filters.activo !== '') {
                const activoValue = filters.activo === 'true' || filters.activo === true;
                queryBuilder.andWhere('usuario.activo = :activo', { activo: activoValue });
            }
        }
        // Get total count with filters
        const total = await queryBuilder.getCount();
        // Add pagination and ordering
        queryBuilder
            .orderBy('usuario.nickname', 'ASC')
            .skip(page * pageSize)
            .take(pageSize);
        // Execute query
        const items = await queryBuilder.getMany();
        return {
            items,
            total
        };
    }
    catch (error) {
        console.error('Error getting paginated usuarios:', error);
        throw error;
    }
});
// Auth handlers - add these along with existing IPC handlers in the preload.js registerIpcHandlers function
// Handle login request
ipcMain.handle('login', async (_event, loginData) => {
    try {
        const { nickname, password, deviceInfo } = loginData;
        const dataSource = dbService.getDataSource();
        const userRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        const sessionRepository = dataSource.getRepository(login_session_entity_1.LoginSession);
        // Find user by nickname (case-insensitive) with persona relation
        const usuarios = await userRepository.find({
            relations: ['persona']
        });
        // Manually find user with case-insensitive comparison
        const usuario = usuarios.find(u => u.nickname.toUpperCase() === nickname.toUpperCase());
        // If user not found or inactive
        if (!usuario || !usuario.activo) {
            return {
                success: false,
                message: 'Usuario no encontrado o inactivo'
            };
        }
        // Verify password (in production, use bcrypt instead of direct comparison)
        const passwordValid = password === usuario.password;
        // For future: const passwordValid = await bcrypt.compare(password, usuario.password);
        if (!passwordValid) {
            return {
                success: false,
                message: 'Contraseña incorrecta'
            };
        }
        // Generate JWT token
        const token = jwt.sign({ id: usuario.id, nickname: usuario.nickname }, JWT_SECRET, { expiresIn: TOKEN_EXPIRATION });
        // Create a new login session
        const session = new login_session_entity_1.LoginSession();
        session.usuario = usuario;
        session.ip_address = '127.0.0.1'; // In a web app, you'd get the real IP
        session.user_agent = deviceInfo.userAgent;
        session.device_info = JSON.stringify(deviceInfo);
        session.login_time = new Date();
        session.is_active = true;
        session.last_activity_time = new Date();
        session.browser = deviceInfo.browser;
        session.os = deviceInfo.os;
        // Save the session to database
        const savedSession = await sessionRepository.save(session);
        // Store the current user
        currentUser = usuario;
        // Return the login result with user information and token
        return {
            success: true,
            usuario: usuario,
            token: token,
            sessionId: savedSession.id,
            message: 'Inicio de sesión exitoso'
        };
    }
    catch (error) {
        console.error('Login error:', error);
        return {
            success: false,
            message: 'Error en el servidor. Por favor, intente nuevamente.'
        };
    }
});
// Handle logout request
ipcMain.handle('logout', async (_event, sessionId) => {
    try {
        const dataSource = dbService.getDataSource();
        const sessionRepository = dataSource.getRepository(login_session_entity_1.LoginSession);
        const session = await sessionRepository.findOne({
            where: { id: sessionId }
        });
        if (session) {
            session.is_active = false;
            session.logout_time = new Date();
            await sessionRepository.save(session);
        }
        // Clear current user
        currentUser = null;
        return true;
    }
    catch (error) {
        console.error('Logout error:', error);
        return false;
    }
});
// Update session activity
ipcMain.handle('updateSessionActivity', async (_event, sessionId) => {
    try {
        const dataSource = dbService.getDataSource();
        const sessionRepository = dataSource.getRepository(login_session_entity_1.LoginSession);
        const session = await sessionRepository.findOne({
            where: { id: sessionId }
        });
        if (session && session.is_active) {
            session.last_activity_time = new Date();
            await sessionRepository.save(session);
            return true;
        }
        return false;
    }
    catch (error) {
        console.error('Update session activity error:', error);
        return false;
    }
});
// Get login sessions for a user
ipcMain.handle('getLoginSessions', async (_event, usuarioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const sessionRepository = dataSource.getRepository(login_session_entity_1.LoginSession);
        const sessions = await sessionRepository.find({
            where: { usuario: { id: usuarioId } },
            order: { login_time: 'DESC' }
        });
        return sessions;
    }
    catch (error) {
        console.error('Get login sessions error:', error);
        return [];
    }
});
// Get current user
ipcMain.handle('getCurrentUser', async () => {
    return currentUser;
});
// Set current user
ipcMain.handle('setCurrentUser', async (_event, usuario) => {
    currentUser = usuario;
});
// Profile image operations
ipcMain.handle('save-profile-image', async (_event, { base64Data, fileName }) => {
    try {
        return await imageHandler.saveProfileImage(base64Data, fileName);
    }
    catch (error) {
        console.error('Error saving profile image:', error);
        throw error;
    }
});
ipcMain.handle('delete-profile-image', async (_event, imageUrl) => {
    try {
        return await imageHandler.deleteProfileImage(imageUrl);
    }
    catch (error) {
        console.error('Error deleting profile image:', error);
        throw error;
    }
});
// Categoria handlers
ipcMain.handle('getCategorias', async () => {
    try {
        const categoriaRepository = dbService.getDataSource().getRepository(categoria_entity_1.Categoria);
        const categorias = await categoriaRepository.find({
            order: {
                posicion: 'ASC',
                nombre: 'ASC'
            }
        });
        return categorias;
    }
    catch (error) {
        console.error('Error getting categorias:', error);
        throw error;
    }
});
ipcMain.handle('getCategoria', async (_event, categoriaId) => {
    try {
        const categoriaRepository = dbService.getDataSource().getRepository(categoria_entity_1.Categoria);
        const categoria = await categoriaRepository.findOne({
            where: { id: categoriaId }
        });
        return categoria;
    }
    catch (error) {
        console.error(`Error getting categoria with ID ${categoriaId}:`, error);
        throw error;
    }
});
ipcMain.handle('createCategoria', async (_event, categoriaData) => {
    try {
        const categoriaRepository = dbService.getDataSource().getRepository(categoria_entity_1.Categoria);
        // Create new categoria entity
        const newCategoria = categoriaRepository.create(categoriaData);
        // Save to database
        const result = await categoriaRepository.save(newCategoria);
        console.log('Categoria created:', result);
        return result;
    }
    catch (error) {
        console.error('Error creating categoria:', error);
        throw error;
    }
});
ipcMain.handle('updateCategoria', async (_event, categoriaId, categoriaData) => {
    try {
        const categoriaRepository = dbService.getDataSource().getRepository(categoria_entity_1.Categoria);
        // Find the categoria
        const categoria = await categoriaRepository.findOne({
            where: { id: categoriaId }
        });
        if (!categoria) {
            throw new Error(`Categoria with ID ${categoriaId} not found`);
        }
        // Update categoria properties
        categoriaRepository.merge(categoria, categoriaData);
        // Save changes
        const result = await categoriaRepository.save(categoria);
        console.log('Categoria updated:', result);
        return result;
    }
    catch (error) {
        console.error(`Error updating categoria with ID ${categoriaId}:`, error);
        throw error;
    }
});
ipcMain.handle('deleteCategoria', async (_event, categoriaId) => {
    try {
        const categoriaRepository = dbService.getDataSource().getRepository(categoria_entity_1.Categoria);
        // Find the categoria
        const categoria = await categoriaRepository.findOne({
            where: { id: categoriaId }
        });
        if (!categoria) {
            throw new Error(`Categoria with ID ${categoriaId} not found`);
        }
        // Delete the categoria
        const result = await categoriaRepository.remove(categoria);
        console.log(`Categoria with ID ${categoriaId} deleted`);
        return result;
    }
    catch (error) {
        console.error(`Error deleting categoria with ID ${categoriaId}:`, error);
        throw error;
    }
});
// Subcategoria handlers
ipcMain.handle('getSubcategorias', async () => {
    try {
        const subcategoriaRepository = dbService.getDataSource().getRepository(subcategoria_entity_1.Subcategoria);
        const subcategorias = await subcategoriaRepository.find({
            relations: ['categoria'],
            order: {
                posicion: 'ASC',
                nombre: 'ASC'
            }
        });
        return subcategorias;
    }
    catch (error) {
        console.error('Error getting subcategorias:', error);
        throw error;
    }
});
ipcMain.handle('getSubcategoria', async (_event, subcategoriaId) => {
    try {
        const subcategoriaRepository = dbService.getDataSource().getRepository(subcategoria_entity_1.Subcategoria);
        const subcategoria = await subcategoriaRepository.findOne({
            where: { id: subcategoriaId },
            relations: ['categoria']
        });
        return subcategoria;
    }
    catch (error) {
        console.error(`Error getting subcategoria with ID ${subcategoriaId}:`, error);
        throw error;
    }
});
ipcMain.handle('getSubcategoriasByCategoria', async (_event, categoriaId) => {
    try {
        const subcategoriaRepository = dbService.getDataSource().getRepository(subcategoria_entity_1.Subcategoria);
        const subcategorias = await subcategoriaRepository.find({
            where: { categoriaId },
            order: {
                posicion: 'ASC',
                nombre: 'ASC'
            }
        });
        return subcategorias;
    }
    catch (error) {
        console.error(`Error getting subcategorias for categoria ID ${categoriaId}:`, error);
        throw error;
    }
});
ipcMain.handle('createSubcategoria', async (_event, subcategoriaData) => {
    try {
        const subcategoriaRepository = dbService.getDataSource().getRepository(subcategoria_entity_1.Subcategoria);
        // Create new subcategoria entity
        const newSubcategoria = subcategoriaRepository.create(subcategoriaData);
        // Save to database
        const result = await subcategoriaRepository.save(newSubcategoria);
        console.log('Subcategoria created:', result);
        return result;
    }
    catch (error) {
        console.error('Error creating subcategoria:', error);
        throw error;
    }
});
ipcMain.handle('updateSubcategoria', async (_event, subcategoriaId, subcategoriaData) => {
    try {
        const subcategoriaRepository = dbService.getDataSource().getRepository(subcategoria_entity_1.Subcategoria);
        // Find the subcategoria
        const subcategoria = await subcategoriaRepository.findOne({
            where: { id: subcategoriaId }
        });
        if (!subcategoria) {
            throw new Error(`Subcategoria with ID ${subcategoriaId} not found`);
        }
        // Update subcategoria properties
        subcategoriaRepository.merge(subcategoria, subcategoriaData);
        // Save changes
        const result = await subcategoriaRepository.save(subcategoria);
        console.log('Subcategoria updated:', result);
        return result;
    }
    catch (error) {
        console.error(`Error updating subcategoria with ID ${subcategoriaId}:`, error);
        throw error;
    }
});
ipcMain.handle('deleteSubcategoria', async (_event, subcategoriaId) => {
    try {
        const subcategoriaRepository = dbService.getDataSource().getRepository(subcategoria_entity_1.Subcategoria);
        // Find the subcategoria
        const subcategoria = await subcategoriaRepository.findOne({
            where: { id: subcategoriaId }
        });
        if (!subcategoria) {
            throw new Error(`Subcategoria with ID ${subcategoriaId} not found`);
        }
        // Delete the subcategoria
        const result = await subcategoriaRepository.remove(subcategoria);
        console.log(`Subcategoria with ID ${subcategoriaId} deleted`);
        return result;
    }
    catch (error) {
        console.error(`Error deleting subcategoria with ID ${subcategoriaId}:`, error);
        throw error;
    }
});
// Producto handlers
ipcMain.handle('getProductos', async () => {
    try {
        const productoRepository = dbService.getDataSource().getRepository(producto_entity_1.Producto);
        const productos = await productoRepository.find({
            relations: ['subcategoria', 'subcategoria.categoria'],
            order: { nombre: 'ASC' }
        });
        return productos;
    }
    catch (error) {
        console.error('Error getting productos:', error);
        throw error;
    }
});
ipcMain.handle('getProducto', async (_event, productoId) => {
    try {
        const productoRepository = dbService.getDataSource().getRepository(producto_entity_1.Producto);
        const producto = await productoRepository.findOne({
            where: { id: productoId },
            relations: ['subcategoria', 'subcategoria.categoria']
        });
        return producto;
    }
    catch (error) {
        console.error(`Error getting producto with ID ${productoId}:`, error);
        throw error;
    }
});
ipcMain.handle('getProductosBySubcategoria', async (_event, subcategoriaId) => {
    try {
        const productoRepository = dbService.getDataSource().getRepository(producto_entity_1.Producto);
        const productos = await productoRepository.find({
            where: { subcategoriaId },
            order: { nombre: 'ASC' }
        });
        return productos;
    }
    catch (error) {
        console.error(`Error getting productos for subcategoria ID ${subcategoriaId}:`, error);
        throw error;
    }
});
ipcMain.handle('createProducto', async (_event, productoData) => {
    try {
        const productoRepository = dbService.getDataSource().getRepository(producto_entity_1.Producto);
        // Create new producto entity
        const newProducto = productoRepository.create(productoData);
        // Save to database
        const result = await productoRepository.save(newProducto);
        console.log('Producto created:', result);
        return result;
    }
    catch (error) {
        console.error('Error creating producto:', error);
        throw error;
    }
});
ipcMain.handle('updateProducto', async (_event, productoId, productoData) => {
    try {
        const productoRepository = dbService.getDataSource().getRepository(producto_entity_1.Producto);
        // Find the producto
        const producto = await productoRepository.findOne({
            where: { id: productoId }
        });
        if (!producto) {
            throw new Error(`Producto with ID ${productoId} not found`);
        }
        // Update producto properties
        productoRepository.merge(producto, productoData);
        // Save changes
        const result = await productoRepository.save(producto);
        console.log('Producto updated:', result);
        return result;
    }
    catch (error) {
        console.error(`Error updating producto with ID ${productoId}:`, error);
        throw error;
    }
});
ipcMain.handle('deleteProducto', async (_event, productoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const productoRepository = dataSource.getRepository(producto_entity_1.Producto);
        const presentacionRepository = dataSource.getRepository(presentacion_entity_1.Presentacion);
        // Find the producto to delete
        const producto = await productoRepository.findOneBy({ id: productoId });
        if (!producto) {
            throw new Error('Producto not found');
        }
        try {
            // First, find all related presentaciones
            const presentaciones = await presentacionRepository.find({
                where: { productoId: productoId }
            });
            // Delete all related presentaciones first
            if (presentaciones.length > 0) {
                console.log(`Deleting ${presentaciones.length} presentaciones for producto ${productoId}`);
                await presentacionRepository.remove(presentaciones);
            }
            // Now attempt to delete the product from the database
            await productoRepository.remove(producto);
            console.log(`Producto with ID ${productoId} deleted successfully`);
            return { success: true, deleted: true };
        }
        catch (error) {
            console.log('Could not delete producto, setting as inactive instead:', error);
            // If deletion failed (likely due to other foreign key constraints),
            // set as inactive instead
            producto.activo = false;
            await productoRepository.save(producto);
            // Throw a specific error to indicate why deletion failed
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`No se pudo eliminar debido a restricciones: ${errorMessage}`);
        }
    }
    catch (error) {
        console.error('Error deleting producto:', error);
        throw error;
    }
});
// Product Image Handlers
ipcMain.handle('getProductImages', async (_event, productoId) => {
    try {
        const productoImageRepository = dbService.getDataSource().getRepository(producto_image_entity_1.ProductoImage);
        const images = await productoImageRepository.find({
            where: { productoId }
        });
        return images;
    }
    catch (error) {
        console.error(`Error getting images for producto ${productoId}:`, error);
        throw error;
    }
});
ipcMain.handle('createProductImage', async (_event, imageData) => {
    try {
        const productoImageRepository = dbService.getDataSource().getRepository(producto_image_entity_1.ProductoImage);
        // Create new image entity
        const productoImage = productoImageRepository.create(imageData);
        // Save to database
        const result = await productoImageRepository.save(productoImage);
        console.log('ProductoImage created:', result);
        return result;
    }
    catch (error) {
        console.error('Error creating productoImage:', error);
        throw error;
    }
});
ipcMain.handle('updateProductImage', async (_event, imageId, imageData) => {
    try {
        const productoImageRepository = dbService.getDataSource().getRepository(producto_image_entity_1.ProductoImage);
        // Find the image
        const productoImage = await productoImageRepository.findOne({
            where: { id: imageId }
        });
        if (!productoImage) {
            throw new Error(`ProductoImage with ID ${imageId} not found`);
        }
        // Update image properties
        productoImageRepository.merge(productoImage, imageData);
        // Save changes
        const result = await productoImageRepository.save(productoImage);
        console.log('ProductoImage updated:', result);
        return result;
    }
    catch (error) {
        console.error(`Error updating productoImage with ID ${imageId}:`, error);
        throw error;
    }
});
ipcMain.handle('deleteProductImage', async (_event, imageId) => {
    try {
        const productoImageRepository = dbService.getDataSource().getRepository(producto_image_entity_1.ProductoImage);
        // Find the image
        const productoImage = await productoImageRepository.findOne({
            where: { id: imageId }
        });
        if (!productoImage) {
            throw new Error(`ProductoImage with ID ${imageId} not found`);
        }
        // Delete the file from storage
        if (productoImage.imageUrl) {
            await imageHandler.deleteProductoImage(productoImage.imageUrl);
        }
        // Delete from database
        await productoImageRepository.remove(productoImage);
        console.log(`ProductoImage with ID ${imageId} deleted`);
        return true;
    }
    catch (error) {
        console.error(`Error deleting productoImage with ID ${imageId}:`, error);
        throw error;
    }
});
// Product Image Handlers
ipcMain.handle('saveProductoImage', async (_event, { base64Data, fileName }) => {
    try {
        // Use the same image handler but with a different directory
        const userDataPath = app.getPath('userData');
        const productoImagesDir = path.join(userDataPath, 'producto-images');
        // Ensure directory exists
        if (!fs.existsSync(productoImagesDir)) {
            fs.mkdirSync(productoImagesDir, { recursive: true });
        }
        const filePath = path.join(productoImagesDir, fileName);
        // Remove data URL prefix if present
        let imageData = base64Data;
        if (base64Data.includes(';base64,')) {
            imageData = base64Data.split(';base64,').pop() || '';
        }
        // Write the file
        fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));
        // Return a special URL format that will be handled by your app
        return { imageUrl: `app://producto-images/${fileName}` };
    }
    catch (error) {
        console.error('Error saving producto image:', error);
        throw error;
    }
});
ipcMain.handle('deleteProductoImage', async (_event, imageUrl) => {
    try {
        // Extract filename from the URL
        const fileName = imageUrl.split('/').pop();
        if (!fileName)
            return false;
        const userDataPath = app.getPath('userData');
        const productoImagesDir = path.join(userDataPath, 'producto-images');
        const filePath = path.join(productoImagesDir, fileName);
        // Check if file exists
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    }
    catch (error) {
        console.error('Error deleting producto image:', error);
        return false;
    }
});
// IPC handler for getting presentaciones by producto
ipcMain.handle('getPresentacionesByProducto', async (_event, productoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const presentacionRepository = dataSource.getRepository(presentacion_entity_1.Presentacion);
        return await presentacionRepository.find({
            where: { productoId },
            order: { principal: 'DESC', descripcion: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting presentaciones by producto:', error);
        throw error;
    }
});
// IPC handler for creating a presentacion
ipcMain.handle('createPresentacion', async (_event, presentacionData) => {
    try {
        const dataSource = dbService.getDataSource();
        const presentacionRepository = dataSource.getRepository(presentacion_entity_1.Presentacion);
        // Create a new presentacion
        const presentacion = presentacionRepository.create(presentacionData);
        // Save the presentacion
        return await presentacionRepository.save(presentacion);
    }
    catch (error) {
        console.error('Error creating presentacion:', error);
        throw error;
    }
});
// IPC handler for updating a presentacion
ipcMain.handle('updatePresentacion', async (_event, presentacionId, presentacionData) => {
    try {
        const dataSource = dbService.getDataSource();
        const presentacionRepository = dataSource.getRepository(presentacion_entity_1.Presentacion);
        // Find the presentacion to update
        const presentacion = await presentacionRepository.findOneBy({ id: presentacionId });
        if (!presentacion) {
            throw new Error('Presentacion not found');
        }
        // Update the presentacion
        presentacionRepository.merge(presentacion, presentacionData);
        // Save the changes
        return await presentacionRepository.save(presentacion);
    }
    catch (error) {
        console.error('Error updating presentacion:', error);
        throw error;
    }
});
// IPC handler for deleting a presentacion
ipcMain.handle('deletePresentacion', async (_event, presentacionId) => {
    try {
        const dataSource = dbService.getDataSource();
        const presentacionRepository = dataSource.getRepository(presentacion_entity_1.Presentacion);
        // Find the presentacion to delete
        const presentacion = await presentacionRepository.findOneBy({ id: presentacionId });
        if (!presentacion) {
            throw new Error('Presentacion not found');
        }
        // Delete the presentacion
        await presentacionRepository.remove(presentacion);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting presentacion:', error);
        throw error;
    }
});
// IPC handler for getting monedas
ipcMain.handle('getMonedas', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        return await monedaRepository.find({
            order: { principal: 'DESC', denominacion: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting monedas:', error);
        throw error;
    }
});
// IPC handler for getting a moneda by ID
ipcMain.handle('getMoneda', async (_event, monedaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        return await monedaRepository.findOne({
            where: { id: monedaId }
        });
    }
    catch (error) {
        console.error(`Error getting moneda with ID ${monedaId}:`, error);
        throw error;
    }
});
// IPC handler for creating a moneda
ipcMain.handle('createMoneda', async (_event, monedaData) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        // If this new moneda is principal, unset any existing principal moneda
        if (monedaData.principal) {
            await monedaRepository.update({ principal: true }, { principal: false });
        }
        // Create a new moneda
        const moneda = monedaRepository.create(monedaData);
        // Save the moneda
        return await monedaRepository.save(moneda);
    }
    catch (error) {
        console.error('Error creating moneda:', error);
        throw error;
    }
});
// IPC handler for updating a moneda
ipcMain.handle('updateMoneda', async (_event, monedaId, monedaData) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        // If this moneda is being set as principal, unset any existing principal moneda
        if (monedaData.principal) {
            await monedaRepository.update({ principal: true, id: (0, typeorm_1.Not)(monedaId) }, { principal: false });
        }
        // Find the moneda to update
        const moneda = await monedaRepository.findOneBy({ id: monedaId });
        if (!moneda) {
            throw new Error('Moneda not found');
        }
        // Update the moneda
        monedaRepository.merge(moneda, monedaData);
        // Save the changes
        return await monedaRepository.save(moneda);
    }
    catch (error) {
        console.error(`Error updating moneda with ID ${monedaId}:`, error);
        throw error;
    }
});
// IPC handler for deleting a moneda
ipcMain.handle('deleteMoneda', async (_event, monedaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        // Find the moneda to delete
        const moneda = await monedaRepository.findOneBy({ id: monedaId });
        if (!moneda) {
            throw new Error('Moneda not found');
        }
        // Check if it's the principal moneda
        if (moneda.principal) {
            throw new Error('No se puede eliminar la moneda principal. Establezca otra moneda como principal primero.');
        }
        // In a real production app, we would need to check if the moneda is in use
        // For now, just delete it
        await monedaRepository.remove(moneda);
        return { success: true };
    }
    catch (error) {
        console.error(`Error deleting moneda with ID ${monedaId}:`, error);
        throw error;
    }
});
// IPC handler for getting tipos de precio
ipcMain.handle('getTipoPrecios', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const tipoPrecioRepository = dataSource.getRepository(tipo_precio_entity_1.TipoPrecio);
        return await tipoPrecioRepository.find({
            order: { descripcion: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting tipos de precio:', error);
        throw error;
    }
});
// IPC handler for getting a tipo de precio by ID
ipcMain.handle('getTipoPrecio', async (_event, tipoPrecioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const tipoPrecioRepository = dataSource.getRepository(tipo_precio_entity_1.TipoPrecio);
        return await tipoPrecioRepository.findOne({
            where: { id: tipoPrecioId }
        });
    }
    catch (error) {
        console.error(`Error getting tipo de precio with ID ${tipoPrecioId}:`, error);
        throw error;
    }
});
// IPC handler for creating a tipo de precio
ipcMain.handle('createTipoPrecio', async (_event, tipoPrecioData) => {
    try {
        const dataSource = dbService.getDataSource();
        const tipoPrecioRepository = dataSource.getRepository(tipo_precio_entity_1.TipoPrecio);
        // Create a new tipo precio
        const tipoPrecio = tipoPrecioRepository.create(tipoPrecioData);
        // Save the tipo precio
        return await tipoPrecioRepository.save(tipoPrecio);
    }
    catch (error) {
        console.error('Error creating tipo de precio:', error);
        throw error;
    }
});
// IPC handler for updating a tipo de precio
ipcMain.handle('updateTipoPrecio', async (_event, tipoPrecioId, tipoPrecioData) => {
    try {
        const dataSource = dbService.getDataSource();
        const tipoPrecioRepository = dataSource.getRepository(tipo_precio_entity_1.TipoPrecio);
        // Find the tipo precio to update
        const tipoPrecio = await tipoPrecioRepository.findOneBy({ id: tipoPrecioId });
        if (!tipoPrecio) {
            throw new Error('Tipo Precio not found');
        }
        // Update the tipo precio
        tipoPrecioRepository.merge(tipoPrecio, tipoPrecioData);
        // Save the changes
        return await tipoPrecioRepository.save(tipoPrecio);
    }
    catch (error) {
        console.error(`Error updating tipo de precio with ID ${tipoPrecioId}:`, error);
        throw error;
    }
});
// IPC handler for deleting a tipo de precio
ipcMain.handle('deleteTipoPrecio', async (_event, tipoPrecioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const tipoPrecioRepository = dataSource.getRepository(tipo_precio_entity_1.TipoPrecio);
        // Find the tipo precio to delete
        const tipoPrecio = await tipoPrecioRepository.findOneBy({ id: tipoPrecioId });
        if (!tipoPrecio) {
            throw new Error('Tipo Precio not found');
        }
        // Delete the tipo precio
        await tipoPrecioRepository.remove(tipoPrecio);
        return { success: true };
    }
    catch (error) {
        console.error(`Error deleting tipo de precio with ID ${tipoPrecioId}:`, error);
        throw error;
    }
});
// IPC handler for getting precios de venta by presentacion
ipcMain.handle('getPreciosVentaByPresentacion', async (_event, presentacionId) => {
    try {
        const dataSource = dbService.getDataSource();
        const precioVentaRepository = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
        return await precioVentaRepository.find({
            where: { presentacionId },
            relations: ['moneda'],
            order: { principal: 'DESC', valor: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting precios venta by presentacion:', error);
        throw error;
    }
});
// IPC handler for getting precios de venta by presentacion sabor
ipcMain.handle('getPreciosVentaByPresentacionSabor', async (_event, presentacionSaborId) => {
    try {
        const dataSource = dbService.getDataSource();
        const precioVentaRepository = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
        return await precioVentaRepository.find({
            where: { presentacionSaborId },
            relations: ['moneda'],
            order: { principal: 'DESC', valor: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting precios venta by presentacion sabor:', error);
        throw error;
    }
});
// IPC handler for creating a precio de venta
ipcMain.handle('createPrecioVenta', async (_event, precioVentaData) => {
    try {
        const dataSource = dbService.getDataSource();
        const precioVentaRepository = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
        // Create a new precio venta
        const precioVenta = precioVentaRepository.create(precioVentaData);
        // Save the precio venta
        return await precioVentaRepository.save(precioVenta);
    }
    catch (error) {
        console.error('Error creating precio venta:', error);
        throw error;
    }
});
// IPC handler for updating a precio de venta
ipcMain.handle('updatePrecioVenta', async (_event, precioVentaId, precioVentaData) => {
    try {
        const dataSource = dbService.getDataSource();
        const precioVentaRepository = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
        // Find the precio venta to update
        const precioVenta = await precioVentaRepository.findOneBy({ id: precioVentaId });
        if (!precioVenta) {
            throw new Error('Precio Venta not found');
        }
        // Update the precio venta
        precioVentaRepository.merge(precioVenta, precioVentaData);
        // Save the changes
        return await precioVentaRepository.save(precioVenta);
    }
    catch (error) {
        console.error('Error updating precio venta:', error);
        throw error;
    }
});
// IPC handler for deleting a precio de venta
ipcMain.handle('deletePrecioVenta', async (_event, precioVentaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const precioVentaRepository = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
        // Find the precio venta to delete
        const precioVenta = await precioVentaRepository.findOneBy({ id: precioVentaId });
        if (!precioVenta) {
            throw new Error('Precio Venta not found');
        }
        // Delete the precio venta
        await precioVentaRepository.remove(precioVenta);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting precio venta:', error);
        throw error;
    }
});
// IPC handler for getting codigos by presentacion
ipcMain.handle('getCodigosByPresentacion', async (_event, presentacionId) => {
    try {
        const dataSource = dbService.getDataSource();
        const codigoRepository = dataSource.getRepository(codigo_entity_1.Codigo);
        return await codigoRepository.find({
            where: { presentacionId },
            order: { principal: 'DESC', codigo: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting codigos by presentacion:', error);
        throw error;
    }
});
// IPC handler for creating a codigo
ipcMain.handle('createCodigo', async (_event, codigoData) => {
    try {
        const dataSource = dbService.getDataSource();
        const codigoRepository = dataSource.getRepository(codigo_entity_1.Codigo);
        // Create a new codigo
        const codigo = codigoRepository.create(codigoData);
        // Save the codigo
        return await codigoRepository.save(codigo);
    }
    catch (error) {
        console.error('Error creating codigo:', error);
        throw error;
    }
});
// IPC handler for updating a codigo
ipcMain.handle('updateCodigo', async (_event, codigoId, codigoData) => {
    try {
        const dataSource = dbService.getDataSource();
        const codigoRepository = dataSource.getRepository(codigo_entity_1.Codigo);
        // Find the codigo to update
        const codigo = await codigoRepository.findOneBy({ id: codigoId });
        if (!codigo) {
            throw new Error('Codigo not found');
        }
        // Update the codigo
        codigoRepository.merge(codigo, codigoData);
        // Save the changes
        return await codigoRepository.save(codigo);
    }
    catch (error) {
        console.error('Error updating codigo:', error);
        throw error;
    }
});
// IPC handler for deleting a codigo
ipcMain.handle('deleteCodigo', async (_event, codigoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const codigoRepository = dataSource.getRepository(codigo_entity_1.Codigo);
        // Find the codigo to delete
        const codigo = await codigoRepository.findOneBy({ id: codigoId });
        if (!codigo) {
            throw new Error('Codigo not found');
        }
        // Delete the codigo
        await codigoRepository.remove(codigo);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting codigo:', error);
        throw error;
    }
});
// Sabor handlers
ipcMain.handle('getSabores', async () => {
    try {
        // Get the repository from the dataSource
        const dataSource = dbService.getDataSource();
        const saborRepository = dataSource.getRepository(sabor_entity_1.Sabor);
        // Return all sabores
        return await saborRepository.find({ order: { nombre: 'ASC' } });
    }
    catch (error) {
        console.error('Error fetching sabores:', error);
        throw error;
    }
});
ipcMain.handle('getSabor', async (_event, saborId) => {
    try {
        const dataSource = dbService.getDataSource();
        const saborRepository = dataSource.getRepository(sabor_entity_1.Sabor);
        return await saborRepository.findOne({
            where: { id: saborId },
            relations: [] // Empty relations array to ensure we get the basic entity data
        });
    }
    catch (error) {
        console.error(`Error fetching sabor with ID ${saborId}:`, error);
        throw error;
    }
});
ipcMain.handle('createSabor', async (_event, saborData) => {
    try {
        const dataSource = dbService.getDataSource();
        const saborRepository = dataSource.getRepository(sabor_entity_1.Sabor);
        const newSabor = saborRepository.create(saborData);
        return await saborRepository.save(newSabor);
    }
    catch (error) {
        console.error('Error creating sabor:', error);
        throw error;
    }
});
ipcMain.handle('updateSabor', async (_event, saborId, saborData) => {
    try {
        const dataSource = dbService.getDataSource();
        const saborRepository = dataSource.getRepository(sabor_entity_1.Sabor);
        await saborRepository.update(saborId, saborData);
        return await saborRepository.findOne({ where: { id: saborId } });
    }
    catch (error) {
        console.error(`Error updating sabor with ID ${saborId}:`, error);
        throw error;
    }
});
ipcMain.handle('deleteSabor', async (_event, saborId) => {
    try {
        const dataSource = dbService.getDataSource();
        const saborRepository = dataSource.getRepository(sabor_entity_1.Sabor);
        const result = await saborRepository.delete(saborId);
        return result.affected && result.affected > 0;
    }
    catch (error) {
        console.error(`Error deleting sabor with ID ${saborId}:`, error);
        throw error;
    }
});
// PresentacionSabor handlers
ipcMain.handle('getPresentacionSaboresByPresentacion', async (_event, presentacionId) => {
    try {
        const dataSource = dbService.getDataSource();
        const presentacionSaborRepository = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
        return await presentacionSaborRepository.find({
            where: { presentacionId },
            relations: ['sabor', 'receta', 'variacion'],
            order: { id: 'ASC' }
        });
    }
    catch (error) {
        console.error(`Error fetching presentacion sabores for presentacion ID ${presentacionId}:`, error);
        throw error;
    }
});
ipcMain.handle('getPresentacionSabor', async (_event, presentacionSaborId) => {
    try {
        const dataSource = dbService.getDataSource();
        const presentacionSaborRepository = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
        return await presentacionSaborRepository.findOne({ where: { id: presentacionSaborId } });
    }
    catch (error) {
        console.error(`Error fetching presentacion sabor with ID ${presentacionSaborId}:`, error);
        throw error;
    }
});
ipcMain.handle('createPresentacionSabor', async (_event, presentacionSaborData) => {
    try {
        const dataSource = dbService.getDataSource();
        const presentacionSaborRepository = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
        const newPresentacionSabor = presentacionSaborRepository.create(presentacionSaborData);
        return await presentacionSaborRepository.save(newPresentacionSabor);
    }
    catch (error) {
        console.error('Error creating presentacion sabor:', error);
        throw error;
    }
});
ipcMain.handle('updatePresentacionSabor', async (_event, presentacionSaborId, presentacionSaborData) => {
    try {
        const dataSource = dbService.getDataSource();
        const presentacionSaborRepository = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
        await presentacionSaborRepository.update(presentacionSaborId, presentacionSaborData);
        return await presentacionSaborRepository.findOne({ where: { id: presentacionSaborId } });
    }
    catch (error) {
        console.error(`Error updating presentacion sabor with ID ${presentacionSaborId}:`, error);
        throw error;
    }
});
ipcMain.handle('deletePresentacionSabor', async (_event, presentacionSaborId) => {
    try {
        const dataSource = dbService.getDataSource();
        const presentacionSaborRepository = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
        const result = await presentacionSaborRepository.delete(presentacionSaborId);
        return result.affected && result.affected > 0;
    }
    catch (error) {
        console.error(`Error deleting presentacion sabor with ID ${presentacionSaborId}:`, error);
        throw error;
    }
});
// Receta handlers
ipcMain.handle('getRecetas', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const recetaRepository = dataSource.getRepository(receta_entity_1.Receta);
        return await recetaRepository.find({ order: { nombre: 'ASC' } });
    }
    catch (error) {
        console.error('Error fetching recetas:', error);
        throw error;
    }
});
ipcMain.handle('getReceta', async (_event, recetaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const recetaRepository = dataSource.getRepository(receta_entity_1.Receta);
        return await recetaRepository.findOne({ where: { id: recetaId } });
    }
    catch (error) {
        console.error(`Error fetching receta with ID ${recetaId}:`, error);
        throw error;
    }
});
ipcMain.handle('createReceta', async (_event, recetaData) => {
    try {
        const dataSource = dbService.getDataSource();
        const recetaRepository = dataSource.getRepository(receta_entity_1.Receta);
        const newReceta = recetaRepository.create(recetaData);
        return await recetaRepository.save(newReceta);
    }
    catch (error) {
        console.error('Error creating receta:', error);
        throw error;
    }
});
ipcMain.handle('updateReceta', async (_event, recetaId, recetaData) => {
    try {
        const dataSource = dbService.getDataSource();
        const recetaRepository = dataSource.getRepository(receta_entity_1.Receta);
        await recetaRepository.update(recetaId, recetaData);
        return await recetaRepository.findOne({ where: { id: recetaId } });
    }
    catch (error) {
        console.error(`Error updating receta with ID ${recetaId}:`, error);
        throw error;
    }
});
ipcMain.handle('deleteReceta', async (_event, recetaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const recetaRepository = dataSource.getRepository(receta_entity_1.Receta);
        const result = await recetaRepository.delete(recetaId);
        return result.affected && result.affected > 0;
    }
    catch (error) {
        console.error(`Error deleting receta with ID ${recetaId}:`, error);
        throw error;
    }
});
// RecetaItem handlers
ipcMain.handle('getRecetaItems', async (_event, recetaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const recetaItemRepository = dataSource.getRepository(receta_item_entity_1.RecetaItem);
        return await recetaItemRepository.find({
            where: { recetaId },
            order: { id: 'ASC' }
        });
    }
    catch (error) {
        console.error(`Error fetching receta items for receta ID ${recetaId}:`, error);
        throw error;
    }
});
ipcMain.handle('getRecetaItem', async (_event, recetaItemId) => {
    try {
        const dataSource = dbService.getDataSource();
        const recetaItemRepository = dataSource.getRepository(receta_item_entity_1.RecetaItem);
        return await recetaItemRepository.findOne({ where: { id: recetaItemId } });
    }
    catch (error) {
        console.error(`Error fetching receta item with ID ${recetaItemId}:`, error);
        throw error;
    }
});
ipcMain.handle('createRecetaItem', async (_event, recetaItemData) => {
    try {
        const dataSource = dbService.getDataSource();
        const recetaItemRepository = dataSource.getRepository(receta_item_entity_1.RecetaItem);
        const newRecetaItem = recetaItemRepository.create(recetaItemData);
        return await recetaItemRepository.save(newRecetaItem);
    }
    catch (error) {
        console.error('Error creating receta item:', error);
        throw error;
    }
});
ipcMain.handle('updateRecetaItem', async (_event, recetaItemId, recetaItemData) => {
    try {
        const dataSource = dbService.getDataSource();
        const recetaItemRepository = dataSource.getRepository(receta_item_entity_1.RecetaItem);
        await recetaItemRepository.update(recetaItemId, recetaItemData);
        return await recetaItemRepository.findOne({ where: { id: recetaItemId } });
    }
    catch (error) {
        console.error(`Error updating receta item with ID ${recetaItemId}:`, error);
        throw error;
    }
});
ipcMain.handle('deleteRecetaItem', async (_event, recetaItemId) => {
    try {
        const dataSource = dbService.getDataSource();
        const recetaItemRepository = dataSource.getRepository(receta_item_entity_1.RecetaItem);
        const result = await recetaItemRepository.delete(recetaItemId);
        return result.affected && result.affected > 0;
    }
    catch (error) {
        console.error(`Error deleting receta item with ID ${recetaItemId}:`, error);
        throw error;
    }
});
// Ingrediente handlers
ipcMain.handle('getIngredientes', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const ingredienteRepository = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
        return await ingredienteRepository.find({ order: { descripcion: 'ASC' } });
    }
    catch (error) {
        console.error('Error fetching ingredientes:', error);
        throw error;
    }
});
ipcMain.handle('getIngrediente', async (_event, ingredienteId) => {
    try {
        const dataSource = dbService.getDataSource();
        const ingredienteRepository = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
        return await ingredienteRepository.findOne({ where: { id: ingredienteId } });
    }
    catch (error) {
        console.error(`Error fetching ingrediente with ID ${ingredienteId}:`, error);
        throw error;
    }
});
ipcMain.handle('createIngrediente', async (_event, ingredienteData) => {
    try {
        const dataSource = dbService.getDataSource();
        const ingredienteRepository = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
        const newIngrediente = ingredienteRepository.create(ingredienteData);
        return await ingredienteRepository.save(newIngrediente);
    }
    catch (error) {
        console.error('Error creating ingrediente:', error);
        throw error;
    }
});
ipcMain.handle('updateIngrediente', async (_event, ingredienteId, ingredienteData) => {
    try {
        const dataSource = dbService.getDataSource();
        const ingredienteRepository = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
        await ingredienteRepository.update(ingredienteId, ingredienteData);
        return await ingredienteRepository.findOne({ where: { id: ingredienteId } });
    }
    catch (error) {
        console.error(`Error updating ingrediente with ID ${ingredienteId}:`, error);
        throw error;
    }
});
ipcMain.handle('deleteIngrediente', async (_event, ingredienteId) => {
    try {
        const dataSource = dbService.getDataSource();
        const ingredienteRepository = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
        const result = await ingredienteRepository.delete(ingredienteId);
        return result.affected && result.affected > 0;
    }
    catch (error) {
        console.error(`Error deleting ingrediente with ID ${ingredienteId}:`, error);
        throw error;
    }
});
// Add search functionality for ingredientes by descripcion
ipcMain.handle('searchIngredientesByDescripcion', async (event, searchText) => {
    try {
        const dataSource = dbService.getDataSource();
        const ingredienteRepository = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
        // If search text is empty, return a limited number of results
        if (!searchText || searchText.trim() === '') {
            return await ingredienteRepository.find({
                order: { descripcion: 'ASC' },
                take: 10
            });
        }
        // Use LIKE query to find matching ingredientes
        return await ingredienteRepository.createQueryBuilder('ingrediente')
            .where('LOWER(ingrediente.descripcion) LIKE LOWER(:searchText)', { searchText: `%${searchText}%` })
            .orWhere('CAST(ingrediente.id AS TEXT) LIKE :searchText', { searchText: `%${searchText}%` })
            .orderBy('ingrediente.descripcion', 'ASC')
            .getMany();
    }
    catch (error) {
        console.error('Error searching ingredientes:', error);
        throw error;
    }
});
// RecetaVariacion handlers
ipcMain.handle('getRecetaVariaciones', async (_event, recetaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const variacionRepository = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
        return await variacionRepository.find({
            where: { recetaId },
            order: { nombre: 'ASC' }
        });
    }
    catch (error) {
        console.error(`Error getting variations for recipe ID ${recetaId}:`, error);
        throw error;
    }
});
ipcMain.handle('getRecetaVariacion', async (_event, variacionId) => {
    try {
        const dataSource = dbService.getDataSource();
        const variacionRepository = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
        return await variacionRepository.findOne({ where: { id: variacionId } });
    }
    catch (error) {
        console.error(`Error getting variation with ID ${variacionId}:`, error);
        throw error;
    }
});
ipcMain.handle('createRecetaVariacion', async (_event, variacionData) => {
    try {
        const dataSource = dbService.getDataSource();
        const variacionRepository = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
        const newVariacion = variacionRepository.create(variacionData);
        return await variacionRepository.save(newVariacion);
    }
    catch (error) {
        console.error('Error creating recipe variation:', error);
        throw error;
    }
});
ipcMain.handle('updateRecetaVariacion', async (_event, variacionId, variacionData) => {
    try {
        const dataSource = dbService.getDataSource();
        const variacionRepository = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
        await variacionRepository.update(variacionId, variacionData);
        return await variacionRepository.findOne({ where: { id: variacionId } });
    }
    catch (error) {
        console.error(`Error updating recipe variation with ID ${variacionId}:`, error);
        throw error;
    }
});
ipcMain.handle('deleteRecetaVariacion', async (_event, variacionId) => {
    try {
        const dataSource = dbService.getDataSource();
        const variacionRepository = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
        const result = await variacionRepository.delete(variacionId);
        return result;
    }
    catch (error) {
        console.error(`Error deleting recipe variation with ID ${variacionId}:`, error);
        throw error;
    }
});
// RecetaVariacionItem handlers
ipcMain.handle('getRecetaVariacionItems', async (_event, variacionId) => {
    try {
        const dataSource = dbService.getDataSource();
        const variacionItemRepository = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
        return await variacionItemRepository.find({
            where: { variacionId },
            relations: ['ingrediente'],
        });
    }
    catch (error) {
        console.error(`Error getting items for recipe variation ID ${variacionId}:`, error);
        throw error;
    }
});
ipcMain.handle('getRecetaVariacionItem', async (_event, variacionItemId) => {
    try {
        const dataSource = dbService.getDataSource();
        const variacionItemRepository = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
        return await variacionItemRepository.findOne({
            where: { id: variacionItemId },
            relations: ['ingrediente'],
        });
    }
    catch (error) {
        console.error(`Error getting recipe variation item with ID ${variacionItemId}:`, error);
        throw error;
    }
});
ipcMain.handle('createRecetaVariacionItem', async (_event, variacionItemData) => {
    try {
        const dataSource = dbService.getDataSource();
        const variacionItemRepository = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
        const newVariacionItem = variacionItemRepository.create(variacionItemData);
        return await variacionItemRepository.save(newVariacionItem);
    }
    catch (error) {
        console.error('Error creating recipe variation item:', error);
        throw error;
    }
});
ipcMain.handle('updateRecetaVariacionItem', async (_event, variacionItemId, variacionItemData) => {
    try {
        const dataSource = dbService.getDataSource();
        const variacionItemRepository = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
        await variacionItemRepository.update(variacionItemId, variacionItemData);
        return await variacionItemRepository.findOne({ where: { id: variacionItemId } });
    }
    catch (error) {
        console.error(`Error updating recipe variation item with ID ${variacionItemId}:`, error);
        throw error;
    }
});
ipcMain.handle('deleteRecetaVariacionItem', async (_event, variacionItemId) => {
    try {
        const dataSource = dbService.getDataSource();
        const variacionItemRepository = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
        const result = await variacionItemRepository.delete(variacionItemId);
        return result;
    }
    catch (error) {
        console.error(`Error deleting recipe variation item with ID ${variacionItemId}:`, error);
        throw error;
    }
});
// Set up IPC handlers for Moneda operations
// ... existing code for Moneda operations ...
// Set up IPC handlers for MonedaBillete operations
ipcMain.handle('get-monedas-billetes', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaBilleteRepository = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
        return await monedaBilleteRepository.find({
            relations: ['moneda']
        });
    }
    catch (error) {
        console.error('Error getting monedas billetes:', error);
        throw error;
    }
});
ipcMain.handle('get-moneda-billete', async (event, monedaBilleteId) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaBilleteRepository = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
        return await monedaBilleteRepository.findOne({
            where: { id: monedaBilleteId },
            relations: ['moneda']
        });
    }
    catch (error) {
        console.error(`Error getting moneda billete ${monedaBilleteId}:`, error);
        throw error;
    }
});
ipcMain.handle('create-moneda-billete', async (event, monedaBilleteData) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaBilleteRepository = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        // Get the moneda entity from the ID
        if (monedaBilleteData.moneda && typeof monedaBilleteData.moneda === 'number') {
            const monedaId = monedaBilleteData.moneda;
            monedaBilleteData.moneda = await monedaRepository.findOne({
                where: { id: monedaId }
            });
        }
        // Create new moneda billete entity
        const monedaBillete = monedaBilleteRepository.create(monedaBilleteData);
        // Set tracking info
        await setEntityUserTracking(monedaBillete, currentUser?.id, false);
        // Save to database
        return await monedaBilleteRepository.save(monedaBillete);
    }
    catch (error) {
        console.error('Error creating moneda billete:', error);
        throw error;
    }
});
ipcMain.handle('update-moneda-billete', async (event, monedaBilleteId, monedaBilleteData) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaBilleteRepository = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        // Find the existing moneda billete
        const existingMonedaBillete = await monedaBilleteRepository.findOne({
            where: { id: monedaBilleteId }
        });
        if (!existingMonedaBillete) {
            throw new Error(`MonedaBillete with ID ${monedaBilleteId} not found`);
        }
        // Get the moneda entity from the ID if it's provided
        if (monedaBilleteData.moneda && typeof monedaBilleteData.moneda === 'number') {
            const monedaId = monedaBilleteData.moneda;
            monedaBilleteData.moneda = await monedaRepository.findOne({
                where: { id: monedaId }
            });
        }
        // Update the entity
        const updatedMonedaBillete = monedaBilleteRepository.merge(existingMonedaBillete, monedaBilleteData);
        // Set tracking info
        await setEntityUserTracking(updatedMonedaBillete, currentUser?.id, true);
        // Save to database
        return await monedaBilleteRepository.save(updatedMonedaBillete);
    }
    catch (error) {
        console.error(`Error updating moneda billete ${monedaBilleteId}:`, error);
        throw error;
    }
});
ipcMain.handle('delete-moneda-billete', async (event, monedaBilleteId) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaBilleteRepository = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
        // Find the moneda billete
        const monedaBillete = await monedaBilleteRepository.findOne({
            where: { id: monedaBilleteId }
        });
        if (!monedaBillete) {
            throw new Error(`MonedaBillete with ID ${monedaBilleteId} not found`);
        }
        // Delete the moneda billete
        return await monedaBilleteRepository.remove(monedaBillete);
    }
    catch (error) {
        console.error(`Error deleting moneda billete ${monedaBilleteId}:`, error);
        throw error;
    }
});
// Set up IPC handlers for Conteo operations
ipcMain.handle('get-conteos', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const conteoRepository = dataSource.getRepository(conteo_entity_1.Conteo);
        return await conteoRepository.find({
            relations: ['detalles', 'detalles.monedaBillete', 'detalles.monedaBillete.moneda']
        });
    }
    catch (error) {
        console.error('Error getting conteos:', error);
        throw error;
    }
});
ipcMain.handle('get-conteo', async (event, conteoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const conteoRepository = dataSource.getRepository(conteo_entity_1.Conteo);
        return await conteoRepository.findOne({
            where: { id: conteoId },
            relations: ['detalles', 'detalles.monedaBillete', 'detalles.monedaBillete.moneda']
        });
    }
    catch (error) {
        console.error(`Error getting conteo ${conteoId}:`, error);
        throw error;
    }
});
ipcMain.handle('create-conteo', async (event, conteoData) => {
    try {
        const dataSource = dbService.getDataSource();
        const conteoRepository = dataSource.getRepository(conteo_entity_1.Conteo);
        // Create new conteo entity
        const conteo = conteoRepository.create(conteoData);
        // Set tracking info
        await setEntityUserTracking(conteo, currentUser?.id, false);
        // Save to database
        return await conteoRepository.save(conteo);
    }
    catch (error) {
        console.error('Error creating conteo:', error);
        throw error;
    }
});
ipcMain.handle('update-conteo', async (event, conteoId, conteoData) => {
    try {
        const dataSource = dbService.getDataSource();
        const conteoRepository = dataSource.getRepository(conteo_entity_1.Conteo);
        // Find the existing conteo
        const existingConteo = await conteoRepository.findOne({
            where: { id: conteoId }
        });
        if (!existingConteo) {
            throw new Error(`Conteo with ID ${conteoId} not found`);
        }
        // Update the entity
        const updatedConteo = conteoRepository.merge(existingConteo, conteoData);
        // Set tracking info
        await setEntityUserTracking(updatedConteo, currentUser?.id, true);
        // Save to database
        return await conteoRepository.save(updatedConteo);
    }
    catch (error) {
        console.error(`Error updating conteo ${conteoId}:`, error);
        throw error;
    }
});
ipcMain.handle('delete-conteo', async (event, conteoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const conteoRepository = dataSource.getRepository(conteo_entity_1.Conteo);
        // Find the conteo
        const conteo = await conteoRepository.findOne({
            where: { id: conteoId }
        });
        if (!conteo) {
            throw new Error(`Conteo with ID ${conteoId} not found`);
        }
        // Delete the conteo
        return await conteoRepository.remove(conteo);
    }
    catch (error) {
        console.error(`Error deleting conteo ${conteoId}:`, error);
        throw error;
    }
});
// Set up IPC handlers for ConteoDetalle operations
ipcMain.handle('get-conteo-detalles', async (event, conteoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const conteoDetalleRepository = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
        return await conteoDetalleRepository.find({
            where: { conteo: { id: conteoId } },
            relations: ['monedaBillete', 'monedaBillete.moneda']
        });
    }
    catch (error) {
        console.error(`Error getting conteo detalles for conteo ${conteoId}:`, error);
        throw error;
    }
});
ipcMain.handle('get-conteo-detalle', async (event, conteoDetalleId) => {
    try {
        const dataSource = dbService.getDataSource();
        const conteoDetalleRepository = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
        return await conteoDetalleRepository.findOne({
            where: { id: conteoDetalleId },
            relations: ['conteo', 'monedaBillete', 'monedaBillete.moneda']
        });
    }
    catch (error) {
        console.error(`Error getting conteo detalle ${conteoDetalleId}:`, error);
        throw error;
    }
});
ipcMain.handle('create-conteo-detalle', async (event, conteoDetalleData) => {
    try {
        const dataSource = dbService.getDataSource();
        const conteoDetalleRepository = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
        const conteoRepository = dataSource.getRepository(conteo_entity_1.Conteo);
        const monedaBilleteRepository = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
        // Get the conteo entity from the ID
        if (conteoDetalleData.conteo && typeof conteoDetalleData.conteo === 'number') {
            const conteoId = conteoDetalleData.conteo;
            conteoDetalleData.conteo = await conteoRepository.findOne({
                where: { id: conteoId }
            });
        }
        // Get the moneda billete entity from the ID
        if (conteoDetalleData.monedaBillete && typeof conteoDetalleData.monedaBillete === 'number') {
            const monedaBilleteId = conteoDetalleData.monedaBillete;
            conteoDetalleData.monedaBillete = await monedaBilleteRepository.findOne({
                where: { id: monedaBilleteId }
            });
        }
        // Create new conteo detalle entity
        const conteoDetalle = conteoDetalleRepository.create(conteoDetalleData);
        // Set tracking info
        await setEntityUserTracking(conteoDetalle, currentUser?.id, false);
        // Save to database
        return await conteoDetalleRepository.save(conteoDetalle);
    }
    catch (error) {
        console.error('Error creating conteo detalle:', error);
        throw error;
    }
});
ipcMain.handle('update-conteo-detalle', async (event, conteoDetalleId, conteoDetalleData) => {
    try {
        const dataSource = dbService.getDataSource();
        const conteoDetalleRepository = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
        const conteoRepository = dataSource.getRepository(conteo_entity_1.Conteo);
        const monedaBilleteRepository = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
        // Find the existing conteo detalle
        const existingConteoDetalle = await conteoDetalleRepository.findOne({
            where: { id: conteoDetalleId }
        });
        if (!existingConteoDetalle) {
            throw new Error(`ConteoDetalle with ID ${conteoDetalleId} not found`);
        }
        // Get the conteo entity from the ID if it's provided
        if (conteoDetalleData.conteo && typeof conteoDetalleData.conteo === 'number') {
            const conteoId = conteoDetalleData.conteo;
            conteoDetalleData.conteo = await conteoRepository.findOne({
                where: { id: conteoId }
            });
        }
        // Get the moneda billete entity from the ID if it's provided
        if (conteoDetalleData.monedaBillete && typeof conteoDetalleData.monedaBillete === 'number') {
            const monedaBilleteId = conteoDetalleData.monedaBillete;
            conteoDetalleData.monedaBillete = await monedaBilleteRepository.findOne({
                where: { id: monedaBilleteId }
            });
        }
        // Update the entity
        const updatedConteoDetalle = conteoDetalleRepository.merge(existingConteoDetalle, conteoDetalleData);
        // Set tracking info
        await setEntityUserTracking(updatedConteoDetalle, currentUser?.id, true);
        // Save to database
        return await conteoDetalleRepository.save(updatedConteoDetalle);
    }
    catch (error) {
        console.error(`Error updating conteo detalle ${conteoDetalleId}:`, error);
        throw error;
    }
});
ipcMain.handle('delete-conteo-detalle', async (event, conteoDetalleId) => {
    try {
        const dataSource = dbService.getDataSource();
        const conteoDetalleRepository = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
        // Find the conteo detalle
        const conteoDetalle = await conteoDetalleRepository.findOne({
            where: { id: conteoDetalleId }
        });
        if (!conteoDetalle) {
            throw new Error(`ConteoDetalle with ID ${conteoDetalleId} not found`);
        }
        // Delete the conteo detalle
        return await conteoDetalleRepository.remove(conteoDetalle);
    }
    catch (error) {
        console.error(`Error deleting conteo detalle ${conteoDetalleId}:`, error);
        throw error;
    }
});
// Set up IPC handlers for Dispositivo operations
ipcMain.handle('get-dispositivos', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const dispositivoRepository = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
        return await dispositivoRepository.find();
    }
    catch (error) {
        console.error('Error getting dispositivos:', error);
        throw error;
    }
});
ipcMain.handle('get-dispositivo', async (event, dispositivoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const dispositivoRepository = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
        return await dispositivoRepository.findOne({
            where: { id: dispositivoId }
        });
    }
    catch (error) {
        console.error(`Error getting dispositivo ${dispositivoId}:`, error);
        throw error;
    }
});
ipcMain.handle('create-dispositivo', async (event, dispositivoData) => {
    try {
        const dataSource = dbService.getDataSource();
        const dispositivoRepository = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
        // Check for duplicate name (case insensitive)
        const existingWithSameName = await dispositivoRepository.createQueryBuilder('dispositivo')
            .where('UPPER(dispositivo.nombre) = UPPER(:nombre)', { nombre: dispositivoData.nombre })
            .getOne();
        if (existingWithSameName) {
            throw new Error(`Ya existe un dispositivo con el nombre '${dispositivoData.nombre}'.`);
        }
        // Check for duplicate MAC address if provided
        if (dispositivoData.mac && dispositivoData.mac.trim() !== '') {
            const existingWithSameMac = await dispositivoRepository.findOne({
                where: { mac: dispositivoData.mac.trim() }
            });
            if (existingWithSameMac) {
                throw new Error(`Ya existe un dispositivo con la dirección MAC '${dispositivoData.mac}'.`);
            }
        }
        // Create new dispositivo entity
        const dispositivo = dispositivoRepository.create(dispositivoData);
        // Set tracking info
        await setEntityUserTracking(dispositivo, currentUser?.id, false);
        // Save to database
        return await dispositivoRepository.save(dispositivo);
    }
    catch (error) {
        console.error('Error creating dispositivo:', error);
        throw error;
    }
});
ipcMain.handle('update-dispositivo', async (event, dispositivoId, dispositivoData) => {
    try {
        const dataSource = dbService.getDataSource();
        const dispositivoRepository = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
        // Find the existing dispositivo
        const existingDispositivo = await dispositivoRepository.findOne({
            where: { id: dispositivoId }
        });
        if (!existingDispositivo) {
            throw new Error(`Dispositivo with ID ${dispositivoId} not found`);
        }
        // Check for duplicate name (case insensitive), excluding the current dispositivo
        const existingWithSameName = await dispositivoRepository.createQueryBuilder('dispositivo')
            .where('UPPER(dispositivo.nombre) = UPPER(:nombre)', { nombre: dispositivoData.nombre })
            .andWhere('dispositivo.id != :id', { id: dispositivoId })
            .getOne();
        if (existingWithSameName) {
            throw new Error(`Ya existe un dispositivo con el nombre '${dispositivoData.nombre}'.`);
        }
        // Check for duplicate MAC address if provided, excluding the current dispositivo
        if (dispositivoData.mac && dispositivoData.mac.trim() !== '') {
            const existingWithSameMac = await dispositivoRepository.createQueryBuilder('dispositivo')
                .where('dispositivo.mac = :mac', { mac: dispositivoData.mac.trim() })
                .andWhere('dispositivo.id != :id', { id: dispositivoId })
                .getOne();
            if (existingWithSameMac) {
                throw new Error(`Ya existe un dispositivo con la dirección MAC '${dispositivoData.mac}'.`);
            }
        }
        // Update the entity
        const updatedDispositivo = dispositivoRepository.merge(existingDispositivo, dispositivoData);
        // Set tracking info
        await setEntityUserTracking(updatedDispositivo, currentUser?.id, true);
        // Save to database
        return await dispositivoRepository.save(updatedDispositivo);
    }
    catch (error) {
        console.error(`Error updating dispositivo ${dispositivoId}:`, error);
        throw error;
    }
});
ipcMain.handle('delete-dispositivo', async (event, dispositivoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const dispositivoRepository = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
        // Find the dispositivo
        const dispositivo = await dispositivoRepository.findOne({
            where: { id: dispositivoId }
        });
        if (!dispositivo) {
            throw new Error(`Dispositivo with ID ${dispositivoId} not found`);
        }
        // Delete the dispositivo
        return await dispositivoRepository.remove(dispositivo);
    }
    catch (error) {
        console.error(`Error deleting dispositivo ${dispositivoId}:`, error);
        throw error;
    }
});
// Set up IPC handlers for Caja operations
ipcMain.handle('get-cajas', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaRepository = dataSource.getRepository(caja_entity_1.Caja);
        return await cajaRepository.find({
            relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona']
        });
    }
    catch (error) {
        console.error('Error getting cajas:', error);
        throw error;
    }
});
ipcMain.handle('get-caja', async (event, cajaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaRepository = dataSource.getRepository(caja_entity_1.Caja);
        return await cajaRepository.findOne({
            where: { id: cajaId },
            relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona']
        });
    }
    catch (error) {
        console.error(`Error getting caja ${cajaId}:`, error);
        throw error;
    }
});
ipcMain.handle('get-caja-by-dispositivo', async (event, dispositivoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaRepository = dataSource.getRepository(caja_entity_1.Caja);
        return await cajaRepository.find({
            where: { dispositivo: { id: dispositivoId } },
            relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona']
        });
    }
    catch (error) {
        console.error(`Error getting cajas for dispositivo ${dispositivoId}:`, error);
        throw error;
    }
});
ipcMain.handle('create-caja', async (event, cajaData) => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaRepository = dataSource.getRepository(caja_entity_1.Caja);
        const dispositivoRepository = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
        const conteoRepository = dataSource.getRepository(conteo_entity_1.Conteo);
        const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        // Get the dispositivo entity from the ID
        if (cajaData.dispositivo && typeof cajaData.dispositivo === 'number') {
            const dispositivoId = cajaData.dispositivo;
            cajaData.dispositivo = await dispositivoRepository.findOne({
                where: { id: dispositivoId }
            });
        }
        // Get the conteo apertura entity from the ID
        if (cajaData.conteoApertura && typeof cajaData.conteoApertura === 'number') {
            const conteoAperturaId = cajaData.conteoApertura;
            cajaData.conteoApertura = await conteoRepository.findOne({
                where: { id: conteoAperturaId }
            });
        }
        // Get the conteo cierre entity from the ID if it's provided
        if (cajaData.conteoCierre && typeof cajaData.conteoCierre === 'number') {
            const conteoCierreId = cajaData.conteoCierre;
            cajaData.conteoCierre = await conteoRepository.findOne({
                where: { id: conteoCierreId }
            });
        }
        // Get the usuario entity from the ID if it's provided
        if (cajaData.revisadoPor && typeof cajaData.revisadoPor === 'number') {
            const usuarioId = cajaData.revisadoPor;
            cajaData.revisadoPor = await usuarioRepository.findOne({
                where: { id: usuarioId }
            });
        }
        // Create new caja entity
        const caja = cajaRepository.create(cajaData);
        // Set tracking info
        await setEntityUserTracking(caja, currentUser?.id, false);
        // Save to database
        return await cajaRepository.save(caja);
    }
    catch (error) {
        console.error('Error creating caja:', error);
        throw error;
    }
});
ipcMain.handle('update-caja', async (event, cajaId, cajaData) => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaRepository = dataSource.getRepository(caja_entity_1.Caja);
        const dispositivoRepository = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
        const conteoRepository = dataSource.getRepository(conteo_entity_1.Conteo);
        const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
        // Find the existing caja
        const existingCaja = await cajaRepository.findOne({
            where: { id: cajaId }
        });
        if (!existingCaja) {
            throw new Error(`Caja with ID ${cajaId} not found`);
        }
        // Get the dispositivo entity from the ID if it's provided
        if (cajaData.dispositivo && typeof cajaData.dispositivo === 'number') {
            const dispositivoId = cajaData.dispositivo;
            cajaData.dispositivo = await dispositivoRepository.findOne({
                where: { id: dispositivoId }
            });
        }
        // Get the conteo apertura entity from the ID if it's provided
        if (cajaData.conteoApertura && typeof cajaData.conteoApertura === 'number') {
            const conteoAperturaId = cajaData.conteoApertura;
            cajaData.conteoApertura = await conteoRepository.findOne({
                where: { id: conteoAperturaId }
            });
        }
        // Get the conteo cierre entity from the ID if it's provided
        if (cajaData.conteoCierre && typeof cajaData.conteoCierre === 'number') {
            const conteoCierreId = cajaData.conteoCierre;
            cajaData.conteoCierre = await conteoRepository.findOne({
                where: { id: conteoCierreId }
            });
        }
        // Get the usuario entity from the ID if it's provided
        if (cajaData.revisadoPor && typeof cajaData.revisadoPor === 'number') {
            const usuarioId = cajaData.revisadoPor;
            cajaData.revisadoPor = await usuarioRepository.findOne({
                where: { id: usuarioId }
            });
        }
        // Update the entity
        const updatedCaja = cajaRepository.merge(existingCaja, cajaData);
        // Set tracking info
        await setEntityUserTracking(updatedCaja, currentUser?.id, true);
        // Save to database
        return await cajaRepository.save(updatedCaja);
    }
    catch (error) {
        console.error(`Error updating caja ${cajaId}:`, error);
        throw error;
    }
});
ipcMain.handle('delete-caja', async (event, cajaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaRepository = dataSource.getRepository(caja_entity_1.Caja);
        // Find the caja
        const caja = await cajaRepository.findOne({
            where: { id: cajaId }
        });
        if (!caja) {
            throw new Error(`Caja with ID ${cajaId} not found`);
        }
        // Delete the caja
        return await cajaRepository.remove(caja);
    }
    catch (error) {
        console.error(`Error deleting caja ${cajaId}:`, error);
        throw error;
    }
});
// Set up IPC handlers for CajaMoneda operations
ipcMain.handle('get-cajas-monedas', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaMonedaRepository = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
        const cajasMonedas = await cajaMonedaRepository.find({
            relations: ['moneda']
        });
        return cajasMonedas;
    }
    catch (error) {
        console.error('Error fetching cajas monedas:', error);
        throw error;
    }
});
ipcMain.handle('get-caja-moneda', async (event, cajaMonedaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaMonedaRepository = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
        return await cajaMonedaRepository.findOne({
            where: { id: cajaMonedaId },
            relations: ['moneda']
        });
    }
    catch (error) {
        console.error('Error getting caja moneda:', error);
        return null;
    }
});
ipcMain.handle('create-caja-moneda', async (event, cajaMonedaData) => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaMonedaRepository = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
        // Create a new entity instance correctly - no type assertion needed
        const newCajaMoneda = new caja_moneda_entity_1.CajaMoneda();
        // Manually copy properties from the input data
        Object.assign(newCajaMoneda, cajaMonedaData);
        // Save the entity
        await cajaMonedaRepository.save(newCajaMoneda);
        // Return the saved entity
        return await cajaMonedaRepository.findOne({
            where: { id: newCajaMoneda.id },
            relations: ['moneda']
        });
    }
    catch (error) {
        console.error('Error creating caja moneda:', error);
        return null;
    }
});
ipcMain.handle('update-caja-moneda', async (event, cajaMonedaId, cajaMonedaData) => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaMonedaRepository = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
        // Find the entity
        const cajaMoneda = await cajaMonedaRepository.findOne({
            where: { id: cajaMonedaId }
        });
        if (!cajaMoneda) {
            throw new Error(`CajaMoneda with id ${cajaMonedaId} not found`);
        }
        // Update and save
        cajaMonedaRepository.merge(cajaMoneda, cajaMonedaData);
        await cajaMonedaRepository.save(cajaMoneda);
        return cajaMoneda;
    }
    catch (error) {
        console.error('Error updating caja moneda:', error);
        return null;
    }
});
ipcMain.handle('delete-caja-moneda', async (event, cajaMonedaId) => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaMonedaRepository = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
        // Find the entity
        const cajaMoneda = await cajaMonedaRepository.findOne({
            where: { id: cajaMonedaId }
        });
        if (!cajaMoneda) {
            throw new Error(`CajaMoneda with id ${cajaMonedaId} not found`);
        }
        // Delete and return result
        await cajaMonedaRepository.remove(cajaMoneda);
        return { success: true };
    }
    catch (error) { // Type error as any to access error.message
        console.error('Error deleting caja moneda:', error);
        return { success: false, error: error.message };
    }
});
ipcMain.handle('save-cajas-monedas', async (event, updates) => {
    try {
        const dataSource = dbService.getDataSource();
        const cajaMonedaRepository = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        const queryRunner = dataSource.createQueryRunner();
        console.log('Received CajaMoneda updates:', updates);
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const results = [];
            for (const update of updates) {
                // Process the update to ensure moneda relationship is properly set
                const processedUpdate = {
                    activo: update.activo,
                    predeterminado: update.predeterminado,
                    orden: update.orden
                };
                // Set the moneda relationship properly
                if (update.monedaId) {
                    const moneda = await monedaRepository.findOneBy({ id: update.monedaId });
                    if (!moneda) {
                        console.error(`Moneda with ID ${update.monedaId} not found`);
                        continue;
                    }
                    processedUpdate.moneda = moneda;
                }
                if (update.id) {
                    // Update existing
                    console.log(`Updating CajaMoneda ID ${update.id}:`, processedUpdate);
                    await queryRunner.manager.update(caja_moneda_entity_1.CajaMoneda, update.id, processedUpdate);
                    results.push({
                        success: true,
                        id: update.id,
                        operation: 'update'
                    });
                }
                else {
                    // Insert new
                    console.log(`Creating new CajaMoneda:`, processedUpdate);
                    const result = await queryRunner.manager.insert(caja_moneda_entity_1.CajaMoneda, processedUpdate);
                    results.push({
                        success: true,
                        id: result.identifiers[0]['id'],
                        operation: 'insert'
                    });
                }
            }
            await queryRunner.commitTransaction();
            console.log('Transaction committed successfully, results:', results);
            return { success: true, results };
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            console.error('Transaction rolled back due to error:', error);
            throw error;
        }
        finally {
            await queryRunner.release();
        }
    }
    catch (error) {
        console.error('Error saving cajas monedas:', error);
        return { success: false, error: error.message };
    }
});
// Set up IPC handlers for MonedaCambio operations
ipcMain.handle('get-monedas-cambio', async (event) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaCambioRepository = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
        return await monedaCambioRepository.find({
            relations: ['monedaOrigen', 'monedaDestino'],
            order: { createdAt: 'DESC' }
        });
    }
    catch (error) {
        console.error('Error getting monedas cambio:', error);
        throw error;
    }
});
ipcMain.handle('get-monedas-cambio-by-moneda-origen', async (event, monedaOrigenId) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaCambioRepository = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        // Find the moneda origen
        const monedaOrigen = await monedaRepository.findOne({
            where: { id: monedaOrigenId }
        });
        if (!monedaOrigen) {
            throw new Error(`Moneda with ID ${monedaOrigenId} not found`);
        }
        return await monedaCambioRepository.find({
            where: { monedaOrigen: { id: monedaOrigenId } },
            relations: ['monedaOrigen', 'monedaDestino'],
            order: { createdAt: 'DESC' }
        });
    }
    catch (error) {
        console.error(`Error getting monedas cambio for moneda origen ${monedaOrigenId}:`, error);
        throw error;
    }
});
ipcMain.handle('get-moneda-cambio', async (event, monedaCambioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaCambioRepository = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
        return await monedaCambioRepository.findOne({
            where: { id: monedaCambioId },
            relations: ['monedaOrigen', 'monedaDestino']
        });
    }
    catch (error) {
        console.error(`Error getting moneda cambio ${monedaCambioId}:`, error);
        throw error;
    }
});
ipcMain.handle('create-moneda-cambio', async (event, monedaCambioData) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        const monedaCambioRepository = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
        // Handle monedaOrigen relation
        if (monedaCambioData.monedaOrigen && typeof monedaCambioData.monedaOrigen === 'number') {
            const monedaOrigenId = monedaCambioData.monedaOrigen;
            monedaCambioData.monedaOrigen = await monedaRepository.findOne({
                where: { id: monedaOrigenId }
            });
        }
        // Handle monedaDestino relation
        if (monedaCambioData.monedaDestino && typeof monedaCambioData.monedaDestino === 'number') {
            const monedaDestinoId = monedaCambioData.monedaDestino;
            monedaCambioData.monedaDestino = await monedaRepository.findOne({
                where: { id: monedaDestinoId }
            });
        }
        const monedaCambio = monedaCambioRepository.create(monedaCambioData);
        // Add user tracking
        await setEntityUserTracking(monedaCambio, currentUser?.id, false);
        return await monedaCambioRepository.save(monedaCambio);
    }
    catch (error) {
        console.error('Error creating moneda cambio:', error);
        throw error;
    }
});
ipcMain.handle('update-moneda-cambio', async (event, monedaCambioId, monedaCambioData) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaRepository = dataSource.getRepository(moneda_entity_1.Moneda);
        const monedaCambioRepository = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
        // Find existing moneda cambio
        const existingMonedaCambio = await monedaCambioRepository.findOne({
            where: { id: monedaCambioId }
        });
        if (!existingMonedaCambio) {
            throw new Error(`MonedaCambio with ID ${monedaCambioId} not found`);
        }
        // Handle monedaOrigen relation
        if (monedaCambioData.monedaOrigen && typeof monedaCambioData.monedaOrigen === 'number') {
            const monedaOrigenId = monedaCambioData.monedaOrigen;
            monedaCambioData.monedaOrigen = await monedaRepository.findOne({
                where: { id: monedaOrigenId }
            });
        }
        // Handle monedaDestino relation
        if (monedaCambioData.monedaDestino && typeof monedaCambioData.monedaDestino === 'number') {
            const monedaDestinoId = monedaCambioData.monedaDestino;
            monedaCambioData.monedaDestino = await monedaRepository.findOne({
                where: { id: monedaDestinoId }
            });
        }
        // Merge and update
        const updatedMonedaCambio = monedaCambioRepository.merge(existingMonedaCambio, monedaCambioData);
        // Add user tracking
        await setEntityUserTracking(updatedMonedaCambio, currentUser?.id, true);
        return await monedaCambioRepository.save(updatedMonedaCambio);
    }
    catch (error) {
        console.error(`Error updating moneda cambio ${monedaCambioId}:`, error);
        throw error;
    }
});
ipcMain.handle('delete-moneda-cambio', async (event, monedaCambioId) => {
    try {
        const dataSource = dbService.getDataSource();
        const monedaCambioRepository = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
        // Find the moneda cambio
        const monedaCambio = await monedaCambioRepository.findOne({
            where: { id: monedaCambioId }
        });
        if (!monedaCambio) {
            throw new Error(`MonedaCambio with ID ${monedaCambioId} not found`);
        }
        // Delete the moneda cambio
        return await monedaCambioRepository.remove(monedaCambio);
    }
    catch (error) {
        console.error(`Error deleting moneda cambio ${monedaCambioId}:`, error);
        throw error;
    }
});
// IPC handler to get the system MAC address
ipcMain.handle('get-system-mac-address', async () => {
    try {
        const networkInterfaces = os.networkInterfaces();
        // Find the first non-internal MAC address
        for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            if (!interfaces)
                continue;
            for (const iface of interfaces) {
                // Skip internal and non-IPv4 interfaces
                if (!iface.internal && iface.family === 'IPv4') {
                    return iface.mac;
                }
            }
        }
        // If no suitable interface was found
        return '';
    }
    catch (error) {
        console.error('Error getting system MAC address:', error);
        return '';
    }
});
// ------------------------------------------------------------------------
// PROVEEDOR API HANDLERS
// ------------------------------------------------------------------------
// IPC handler for getting all proveedores
ipcMain.handle('getProveedores', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const proveedorRepository = dataSource.getRepository(proveedor_entity_1.Proveedor);
        return await proveedorRepository.find({
            relations: ['persona'],
            order: { nombre: 'ASC' }
        });
    }
    catch (error) {
        console.error('Error getting proveedores:', error);
        throw error;
    }
});
// IPC handler for getting a proveedor by ID
ipcMain.handle('getProveedor', async (_event, proveedorId) => {
    try {
        const dataSource = dbService.getDataSource();
        const proveedorRepository = dataSource.getRepository(proveedor_entity_1.Proveedor);
        return await proveedorRepository.findOne({
            where: { id: proveedorId },
            relations: ['persona']
        });
    }
    catch (error) {
        console.error(`Error getting proveedor with ID ${proveedorId}:`, error);
        throw error;
    }
});
// IPC handler for creating a proveedor
ipcMain.handle('createProveedor', async (_event, proveedorData) => {
    try {
        const dataSource = dbService.getDataSource();
        const proveedorRepository = dataSource.getRepository(proveedor_entity_1.Proveedor);
        // Create a new proveedor
        const proveedor = proveedorRepository.create(proveedorData);
        // Save the proveedor and use type assertion to properly handle the response
        const savedProveedor = await proveedorRepository.save(proveedor);
        // Extract the ID from the saved entity
        const savedId = savedProveedor?.id || (Array.isArray(savedProveedor) ? savedProveedor[0]?.id : null);
        if (!savedId) {
            throw new Error('Failed to save proveedor');
        }
        // Return the proveedor with relations
        return await proveedorRepository.findOne({
            where: { id: savedId },
            relations: ['persona']
        });
    }
    catch (error) {
        console.error('Error creating proveedor:', error);
        throw error;
    }
});
// IPC handler for updating a proveedor
ipcMain.handle('updateProveedor', async (_event, proveedorId, proveedorData) => {
    try {
        const dataSource = dbService.getDataSource();
        const proveedorRepository = dataSource.getRepository(proveedor_entity_1.Proveedor);
        // Find the proveedor to update
        const proveedor = await proveedorRepository.findOneBy({ id: proveedorId });
        if (!proveedor) {
            throw new Error('Proveedor not found');
        }
        // Update the proveedor
        proveedorRepository.merge(proveedor, proveedorData);
        // Save the changes
        await proveedorRepository.save(proveedor);
        // Return the updated proveedor with relations
        return await proveedorRepository.findOne({
            where: { id: proveedorId },
            relations: ['persona']
        });
    }
    catch (error) {
        console.error(`Error updating proveedor with ID ${proveedorId}:`, error);
        throw error;
    }
});
// IPC handler for deleting a proveedor
ipcMain.handle('deleteProveedor', async (_event, proveedorId) => {
    try {
        const dataSource = dbService.getDataSource();
        const proveedorRepository = dataSource.getRepository(proveedor_entity_1.Proveedor);
        const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
        // Find the proveedor to delete
        const proveedor = await proveedorRepository.findOneBy({ id: proveedorId });
        if (!proveedor) {
            throw new Error('Proveedor not found');
        }
        // Check if there are any compras associated with this proveedor
        const comprasCount = await compraRepository.count({
            where: { proveedor: { id: proveedorId } }
        });
        if (comprasCount > 0) {
            throw new Error('No se puede eliminar el proveedor porque tiene compras asociadas. Considere desactivarlo en su lugar.');
        }
        // Continue with deletion if no associations
        await proveedorRepository.delete(proveedorId);
        return { success: true };
    }
    catch (error) {
        console.error(`Error deleting proveedor with ID ${proveedorId}:`, error);
        throw error;
    }
});
// Compra handlers
ipcMain.handle('getCompras', async () => {
    const dataSource = dbService.getDataSource();
    const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
    try {
        return await compraRepository.find({
            relations: ['proveedor', 'moneda', 'detalles', 'detalles.producto', 'detalles.ingrediente', 'detalles.presentacion']
        });
    }
    catch (error) {
        console.error('Error getting compras:', error);
        throw error;
    }
});
ipcMain.handle('getCompra', async (_event, compraId) => {
    const dataSource = dbService.getDataSource();
    const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
    try {
        const compra = await compraRepository.findOne({
            where: { id: compraId },
            relations: ['proveedor', 'moneda', 'detalles', 'detalles.producto', 'detalles.ingrediente', 'detalles.presentacion']
        });
        if (!compra) {
            throw new Error(`Compra with id ${compraId} not found`);
        }
        return compra;
    }
    catch (error) {
        console.error('Error getting compra:', error);
        throw error;
    }
});
ipcMain.handle('createCompra', async (_event, compraData) => {
    const dataSource = dbService.getDataSource();
    const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
    try {
        // Remove detalles from compra data if present
        const { detalles, ...compraOnly } = compraData;
        // Create the compra without details
        const compra = compraRepository.create(compraOnly);
        const savedCompra = await compraRepository.save(compra);
        // Return the saved compra
        return savedCompra;
    }
    catch (error) {
        console.error('Error creating compra:', error);
        throw error;
    }
});
ipcMain.handle('updateCompra', async (_event, compraId, compraData) => {
    const dataSource = dbService.getDataSource();
    const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
    try {
        // Remove detalles if present - they'll be handled separately
        const { detalles, ...compraOnly } = compraData;
        // Find the compra
        const compra = await compraRepository.findOne({
            where: { id: compraId }
        });
        if (!compra) {
            throw new Error(`Compra with id ${compraId} not found`);
        }
        // Update compra properties
        Object.assign(compra, compraOnly);
        // Save the updated compra
        await compraRepository.save(compra);
        // Return the updated compra
        return compra;
    }
    catch (error) {
        console.error('Error updating compra:', error);
        throw error;
    }
});
ipcMain.handle('deleteCompra', async (_event, compraId) => {
    const dataSource = dbService.getDataSource();
    const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
    try {
        // Get the compra
        const compra = await compraRepository.findOne({
            where: { id: compraId }
        });
        if (!compra) {
            throw new Error(`Compra with id ${compraId} not found`);
        }
        // Delete the compra
        await compraRepository.remove(compra);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting compra:', error);
        throw error;
    }
});
// CompraDetalle handlers
ipcMain.handle('getCompraDetalles', async (_event, compraId) => {
    const dataSource = dbService.getDataSource();
    const compraDetalleRepository = dataSource.getRepository(compra_detalle_entity_1.CompraDetalle);
    try {
        return await compraDetalleRepository.find({
            where: { compra: { id: compraId } },
            relations: ['producto', 'ingrediente', 'presentacion']
        });
    }
    catch (error) {
        console.error('Error getting compra detalles:', error);
        throw error;
    }
});
ipcMain.handle('createCompraDetalle', async (_event, detalleData) => {
    const dataSource = dbService.getDataSource();
    const compraDetalleRepository = dataSource.getRepository(compra_detalle_entity_1.CompraDetalle);
    try {
        const detalle = compraDetalleRepository.create(detalleData);
        const savedDetalle = await compraDetalleRepository.save(detalle);
        return savedDetalle;
    }
    catch (error) {
        console.error('Error creating compra detalle:', error);
        throw error;
    }
});
ipcMain.handle('updateCompraDetalle', async (_event, detalleId, detalleData) => {
    const dataSource = dbService.getDataSource();
    const compraDetalleRepository = dataSource.getRepository(compra_detalle_entity_1.CompraDetalle);
    try {
        const detalle = await compraDetalleRepository.findOne({
            where: { id: detalleId }
        });
        if (!detalle) {
            throw new Error(`CompraDetalle with id ${detalleId} not found`);
        }
        Object.assign(detalle, detalleData);
        const updatedDetalle = await compraDetalleRepository.save(detalle);
        return updatedDetalle;
    }
    catch (error) {
        console.error('Error updating compra detalle:', error);
        throw error;
    }
});
ipcMain.handle('deleteCompraDetalle', async (_event, detalleId) => {
    const dataSource = dbService.getDataSource();
    const compraDetalleRepository = dataSource.getRepository(compra_detalle_entity_1.CompraDetalle);
    try {
        const detalle = await compraDetalleRepository.findOne({
            where: { id: detalleId }
        });
        if (!detalle) {
            throw new Error(`CompraDetalle with id ${detalleId} not found`);
        }
        await compraDetalleRepository.remove(detalle);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting compra detalle:', error);
        throw error;
    }
});
// ============== PAGO APIS ==============
// Get all pagos
ipcMain.handle('getPagos', async () => {
    try {
        const dataSource = dbService.getDataSource();
        const pagoRepository = dataSource.getRepository(pago_entity_1.Pago);
        const pagos = await pagoRepository.find({
            where: { activo: true },
            relations: ['caja', 'detalles', 'compras']
        });
        return pagos;
    }
    catch (error) {
        console.error('Error fetching pagos:', error);
        throw error;
    }
});
// Get a single pago by ID
ipcMain.handle('getPago', async (_event, pagoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const pagoRepository = dataSource.getRepository(pago_entity_1.Pago);
        const pago = await pagoRepository.findOne({
            where: { id: pagoId },
            relations: ['caja', 'detalles', 'compras']
        });
        if (!pago) {
            throw new Error(`Pago with id ${pagoId} not found`);
        }
        return pago;
    }
    catch (error) {
        console.error('Error fetching pago:', error);
        throw error;
    }
});
// Create a new pago
ipcMain.handle('createPago', async (_event, pagoData) => {
    try {
        // Set usuarioCreacion if currentUser is available
        if (currentUser) {
            await setEntityUserTracking(pagoData, currentUser.id, false);
        }
        const dataSource = dbService.getDataSource();
        const pagoRepository = dataSource.getRepository(pago_entity_1.Pago);
        const pago = pagoRepository.create(pagoData);
        const savedPago = await pagoRepository.save(pago);
        return savedPago;
    }
    catch (error) {
        console.error('Error creating pago:', error);
        throw error;
    }
});
// Update an existing pago
ipcMain.handle('updatePago', async (_event, pagoId, pagoData) => {
    try {
        const dataSource = dbService.getDataSource();
        const pagoRepository = dataSource.getRepository(pago_entity_1.Pago);
        const pago = await pagoRepository.findOne({
            where: { id: pagoId }
        });
        if (!pago) {
            throw new Error(`Pago with id ${pagoId} not found`);
        }
        // Set usuarioActualizacion if currentUser is available
        if (currentUser) {
            await setEntityUserTracking(pagoData, currentUser.id, true);
        }
        const updatedPago = await pagoRepository.save({
            ...pago,
            ...pagoData,
            id: pagoId
        });
        return updatedPago;
    }
    catch (error) {
        console.error('Error updating pago:', error);
        throw error;
    }
});
// Delete (soft delete) a pago
ipcMain.handle('deletePago', async (_event, pagoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const pagoRepository = dataSource.getRepository(pago_entity_1.Pago);
        const pago = await pagoRepository.findOne({
            where: { id: pagoId }
        });
        if (!pago) {
            throw new Error(`Pago with id ${pagoId} not found`);
        }
        // Soft delete by setting activo to false
        pago.activo = false;
        await pagoRepository.save(pago);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting pago:', error);
        throw error;
    }
});
// ============== PAGO DETALLE APIS ==============
// Get detalles for a specific pago
ipcMain.handle('getPagoDetalles', async (_event, pagoId) => {
    try {
        const dataSource = dbService.getDataSource();
        const pagoDetalleRepository = dataSource.getRepository(pago_detalle_entity_1.PagoDetalle);
        const detalles = await pagoDetalleRepository.find({
            where: { pago: { id: pagoId }, activo: true },
            relations: ['moneda']
        });
        return detalles;
    }
    catch (error) {
        console.error('Error fetching pago detalles:', error);
        throw error;
    }
});
// Create a new pago detalle
ipcMain.handle('createPagoDetalle', async (_event, detalleData) => {
    try {
        // Set usuarioCreacion if currentUser is available
        if (currentUser) {
            await setEntityUserTracking(detalleData, currentUser.id, false);
        }
        const dataSource = dbService.getDataSource();
        const pagoDetalleRepository = dataSource.getRepository(pago_detalle_entity_1.PagoDetalle);
        const detalle = pagoDetalleRepository.create(detalleData);
        const savedDetalle = await pagoDetalleRepository.save(detalle);
        return savedDetalle;
    }
    catch (error) {
        console.error('Error creating pago detalle:', error);
        throw error;
    }
});
// Update an existing pago detalle
ipcMain.handle('updatePagoDetalle', async (_event, detalleId, detalleData) => {
    try {
        const dataSource = dbService.getDataSource();
        const pagoDetalleRepository = dataSource.getRepository(pago_detalle_entity_1.PagoDetalle);
        const detalle = await pagoDetalleRepository.findOne({
            where: { id: detalleId }
        });
        if (!detalle) {
            throw new Error(`PagoDetalle with id ${detalleId} not found`);
        }
        // Set usuarioActualizacion if currentUser is available
        if (currentUser) {
            await setEntityUserTracking(detalleData, currentUser.id, true);
        }
        const updatedDetalle = await pagoDetalleRepository.save({
            ...detalle,
            ...detalleData,
            id: detalleId
        });
        return updatedDetalle;
    }
    catch (error) {
        console.error('Error updating pago detalle:', error);
        throw error;
    }
});
// Delete (soft delete) a pago detalle
ipcMain.handle('deletePagoDetalle', async (_event, detalleId) => {
    try {
        const dataSource = dbService.getDataSource();
        const pagoDetalleRepository = dataSource.getRepository(pago_detalle_entity_1.PagoDetalle);
        const detalle = await pagoDetalleRepository.findOne({
            where: { id: detalleId }
        });
        if (!detalle) {
            throw new Error(`PagoDetalle with id ${detalleId} not found`);
        }
        await pagoDetalleRepository.remove(detalle);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting pago detalle:', error);
        throw error;
    }
});
// ============== PROVEEDOR PRODUCTO APIS ==============
// Get all provider products for a provider
ipcMain.handle('getProveedorProductos', async (_event, proveedorId) => {
    try {
        const proveedorProductoRepository = dbService.getDataSource().getRepository(proveedor_producto_entity_1.ProveedorProducto);
        const proveedorProductos = await proveedorProductoRepository.find({
            where: { proveedor: { id: proveedorId }, activo: true },
            relations: ['producto', 'ingrediente', 'compra']
        });
        return proveedorProductos;
    }
    catch (error) {
        console.error('Error fetching proveedor productos:', error);
        throw error;
    }
});
// Get a single provider product by ID
ipcMain.handle('getProveedorProducto', async (_event, proveedorProductoId) => {
    try {
        const proveedorProductoRepository = dbService.getDataSource().getRepository(proveedor_producto_entity_1.ProveedorProducto);
        const proveedorProducto = await proveedorProductoRepository.findOne({
            where: { id: proveedorProductoId },
            relations: ['producto', 'ingrediente', 'compra', 'proveedor']
        });
        if (!proveedorProducto) {
            throw new Error(`ProveedorProducto with id ${proveedorProductoId} not found`);
        }
        return proveedorProducto;
    }
    catch (error) {
        console.error('Error fetching proveedor producto:', error);
        throw error;
    }
});
// Create a new provider product
ipcMain.handle('createProveedorProducto', async (_event, proveedorProductoData) => {
    try {
        // Set usuarioCreacion if currentUser is available
        if (currentUser) {
            await setEntityUserTracking(proveedorProductoData, currentUser.id, false);
        }
        const proveedorProductoRepository = dbService.getDataSource().getRepository(proveedor_producto_entity_1.ProveedorProducto);
        const proveedorProducto = proveedorProductoRepository.create(proveedorProductoData);
        const savedProveedorProducto = await proveedorProductoRepository.save(proveedorProducto);
        return savedProveedorProducto;
    }
    catch (error) {
        console.error('Error creating proveedor producto:', error);
        throw error;
    }
});
// Update an existing provider product
ipcMain.handle('updateProveedorProducto', async (_event, proveedorProductoId, proveedorProductoData) => {
    try {
        const proveedorProductoRepository = dbService.getDataSource().getRepository(proveedor_producto_entity_1.ProveedorProducto);
        const proveedorProducto = await proveedorProductoRepository.findOne({
            where: { id: proveedorProductoId }
        });
        if (!proveedorProducto) {
            throw new Error(`ProveedorProducto with id ${proveedorProductoId} not found`);
        }
        // Set usuarioActualizacion if currentUser is available
        if (currentUser) {
            await setEntityUserTracking(proveedorProductoData, currentUser.id, true);
        }
        const updatedProveedorProducto = await proveedorProductoRepository.save({
            ...proveedorProducto,
            ...proveedorProductoData,
            id: proveedorProductoId
        });
        return updatedProveedorProducto;
    }
    catch (error) {
        console.error('Error updating proveedor producto:', error);
        throw error;
    }
});
// Delete a provider product
ipcMain.handle('deleteProveedorProducto', async (_event, proveedorProductoId) => {
    try {
        const proveedorProductoRepository = dbService.getDataSource().getRepository(proveedor_producto_entity_1.ProveedorProducto);
        const proveedorProducto = await proveedorProductoRepository.findOne({
            where: { id: proveedorProductoId }
        });
        if (!proveedorProducto) {
            throw new Error(`ProveedorProducto with id ${proveedorProductoId} not found`);
        }
        // Use soft delete by setting activo to false
        proveedorProducto.activo = false;
        await proveedorProductoRepository.save(proveedorProducto);
        return { success: true };
    }
    catch (error) {
        console.error('Error deleting proveedor producto:', error);
        throw error;
    }
});
// ============== COMPRA APIS ==============
// ... existing code ...
//# sourceMappingURL=main.js.map