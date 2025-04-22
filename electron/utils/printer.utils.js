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
exports.getCharacterSet = exports.getPrinterType = exports.printPosReceipt = exports.generateTestPageContent = void 0;
const node_thermal_printer_1 = require("node-thermal-printer");
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const electron_1 = require("electron");
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
exports.generateTestPageContent = generateTestPageContent;
// Helper function to print receipt with POS printer
async function printPosReceipt(printer, content) {
    try {
        // Special handling for CUPS printers (often USB thermal printers on Linux/macOS)
        if (printer.connectionType === 'usb' && printer.address && printer.address.startsWith('ticket-')) { // Example CUPS naming
            console.log("Detected CUPS printer. Using direct CUPS printing approach.");
            // Create a temporary file for the content
            const tempDir = electron_1.app.getPath('temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const tempFile = path.join(tempDir, `receipt-${Date.now()}.txt`);
            fs.writeFileSync(tempFile, content, 'utf8');
            // Print using lp command
            const printCommand = `lp -d ${printer.address} ${tempFile}`;
            console.log(`Executing: ${printCommand}`);
            return new Promise((resolve, reject) => {
                (0, child_process_1.exec)(printCommand, (error, stdout, stderr) => {
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
        // Regular thermal printer printing for network/other USB/Bluetooth printers
        let interfaceConfig;
        if (printer.connectionType === 'network') {
            interfaceConfig = `tcp://${printer.address}:${printer.port || 9100}`;
        }
        else if (printer.connectionType === 'usb' || printer.connectionType === 'serial') {
            interfaceConfig = printer.address; // For USB/Serial, address is usually the path
        }
        else if (printer.connectionType === 'bluetooth') {
            interfaceConfig = `bt:${printer.address}`;
        }
        else {
            console.warn(`Unsupported printer connection type: ${printer.connectionType}. Using address directly.`);
            interfaceConfig = printer.address; // Fallback, might not work
        }
        console.log(`Using printer interface: ${interfaceConfig}`);
        const characterSet = printer.characterSet ? getCharacterSet(printer.characterSet) : node_thermal_printer_1.CharacterSet.PC437_USA;
        const printerType = getPrinterType(printer.type);
        const thermalPrinter = new node_thermal_printer_1.ThermalPrinter({
            type: printerType,
            interface: interfaceConfig,
            options: {
                timeout: 5000 // Network timeout
            },
            width: printer.width || 48,
            characterSet: characterSet,
            removeSpecialCharacters: false, // Keep special characters if needed
            // lineCharacter: "=", // Optional: Custom line character
        });
        const isConnected = await thermalPrinter.isPrinterConnected();
        if (!isConnected) {
            console.error('Printer is not connected. Interface:', interfaceConfig);
            return false;
        }
        thermalPrinter.alignCenter();
        thermalPrinter.println(content); // Use println for adding newline
        thermalPrinter.cut();
        thermalPrinter.beep(); // Optional: beep after printing
        await thermalPrinter.execute();
        console.log("Print command executed successfully!");
        return true;
    }
    catch (error) {
        console.error('Error during printing process:', error);
        return false;
    }
}
exports.printPosReceipt = printPosReceipt;
// Helper function to get printer type for node-thermal-printer
function getPrinterType(type) {
    switch (type?.toLowerCase()) {
        case 'epson':
            return node_thermal_printer_1.PrinterTypes.EPSON;
        case 'star':
            return node_thermal_printer_1.PrinterTypes.STAR;
        // Add other supported types if needed
        default:
            console.warn(`Unknown printer type "${type}", defaulting to EPSON.`);
            return node_thermal_printer_1.PrinterTypes.EPSON; // Default to a common type
    }
}
exports.getPrinterType = getPrinterType;
// Helper function to get character set for node-thermal-printer
function getCharacterSet(charset) {
    const upperCharset = charset?.toUpperCase();
    const foundSet = Object.values(node_thermal_printer_1.CharacterSet).find(set => set.toUpperCase() === upperCharset);
    if (foundSet) {
        return foundSet;
    }
    else {
        console.warn(`Unknown character set "${charset}", defaulting to PC437_USA.`);
        return node_thermal_printer_1.CharacterSet.PC437_USA; // Default to a common set
    }
}
exports.getCharacterSet = getCharacterSet;
//# sourceMappingURL=printer.utils.js.map