"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Use CommonJS require syntax for Electron main process
const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
// Import TypeORM and reflect-metadata (required for TypeORM decorators)
require('reflect-metadata');
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
// JSON Web Token for authentication
const jwt = require('jsonwebtoken');
// Import the image handler module
const imageHandler = require('./electron/utils/image-handler');
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
        win.loadURL('http://localhost:4200');
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
}
// Initialize the database when the app is ready
app.on('ready', () => {
    // Register the app:// protocol for handling profile images
    protocol.registerFileProtocol('app', (request, callback) => {
        const url = request.url.substring(6); // Remove 'app://'
        if (url.startsWith('profile-images/')) {
            const fileName = url.replace('profile-images/', '');
            const imagesDir = path.join(app.getPath('userData'), 'profile-images');
            callback({ path: path.join(imagesDir, fileName) });
            return;
        }
        // Handle other app:// URLs here if needed
        callback({ error: -2 /* ENOENT */ });
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
        const persona = await personaRepository.findOneBy({ id: usuarioData.persona_id });
        if (!persona) {
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
        const productoRepository = dbService.getDataSource().getRepository(producto_entity_1.Producto);
        // Find the producto
        const producto = await productoRepository.findOne({
            where: { id: productoId }
        });
        if (!producto) {
            throw new Error(`Producto with ID ${productoId} not found`);
        }
        // If producto has an image, delete it
        if (producto.imageUrl) {
            await imageHandler.deleteProductoImage(producto.imageUrl);
        }
        // Delete the producto
        const result = await productoRepository.remove(producto);
        console.log(`Producto with ID ${productoId} deleted`);
        return result;
    }
    catch (error) {
        console.error(`Error deleting producto with ID ${productoId}:`, error);
        throw error;
    }
});
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
//# sourceMappingURL=main.js.map