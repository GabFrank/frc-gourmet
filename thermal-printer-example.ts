/**
 * This file contains a simplified implementation of thermal printer functionality
 * for Electron applications. It uses the node-thermal-printer package.
 * 
 * Dependencies:
 * - node-thermal-printer
 * - electron
 */

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';

// Define printer configuration interface
export interface PrinterConfig {
  id: number;
  name: string;
  type: string;            // 'EPSON' or 'STAR'
  connectionType: string;  // 'network', 'usb', or 'bluetooth'
  address: string;         // IP address or device path
  port?: number;           // Port for network printers (default: 9100)
  width?: number;          // Character width (default: 48 for 58mm paper)
  characterSet?: string;   // Character set (default: 'PC437_USA')
  options?: any;           // Additional options
}

/**
 * Main function to print content to a thermal receipt printer
 * @param printer The printer configuration object
 * @param content The content to print
 * @returns Promise<boolean> Success or failure
 */
export async function printThermalReceipt(printer: PrinterConfig, content: string): Promise<boolean> {
  try {
    // Special handling for CUPS printers on macOS/Linux
    if (printer.connectionType === 'usb' && printer.address.includes('ticket-')) {
      console.log("Detected CUPS printer. Using direct CUPS printing approach.");
      return await printWithCUPS(printer, content);
    }

    // Regular thermal printer printing for non-CUPS printers
    return await printWithThermalPrinter(printer, content);
  } catch (error) {
    console.error('Error during printing:', error);
    return false;
  }
}

/**
 * Print using CUPS (Common Unix Printing System) on macOS/Linux
 * @param printer Printer configuration
 * @param content Content to print
 * @returns Promise<boolean> Success or failure
 */
async function printWithCUPS(printer: PrinterConfig, content: string): Promise<boolean> {
  const { exec } = require('child_process');

  // Create a temporary file for the content
  const tempFile = path.join(app.getPath('temp'), `receipt-${Date.now()}.txt`);
  fs.writeFileSync(tempFile, content, 'utf8');

  // Print using lp command (standard CUPS printing command)
  const printCommand = `lp -d ${printer.address} ${tempFile}`;
  console.log(`Executing: ${printCommand}`);

  return new Promise((resolve, reject) => {
    exec(printCommand, (error: any, stdout: string, stderr: string) => {
      // Clean up the temp file
      try { fs.unlinkSync(tempFile); } catch (e) { console.error('Failed to delete temp file:', e); }

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

/**
 * Print using node-thermal-printer library
 * @param printer Printer configuration
 * @param content Content to print
 * @returns Promise<boolean> Success or failure
 */
async function printWithThermalPrinter(printer: PrinterConfig, content: string): Promise<boolean> {
  // Create interface string based on connection type
  let interfaceConfig: string;

  if (printer.connectionType === 'network') {
    // For regular network printers
    interfaceConfig = `tcp://${printer.address}:${printer.port || 9100}`;
  } else if (printer.connectionType === 'usb') {
    // For USB connected printers
    interfaceConfig = printer.address;
  } else if (printer.connectionType === 'bluetooth') {
    // For Bluetooth printers
    interfaceConfig = `bt:${printer.address}`;
  } else {
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
    width: printer.width || 48, // Character width
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

/**
 * Map printer type string to node-thermal-printer's PrinterTypes
 * @param type Printer type string ('epson' or 'star')
 * @returns PrinterTypes enum value
 */
function getPrinterType(type: string): any {
  switch (type.toLowerCase()) {
    case 'epson':
      return PrinterTypes.EPSON;
    case 'star':
      return PrinterTypes.STAR;
    default:
      return PrinterTypes.EPSON; // Default to EPSON
  }
}

/**
 * Map character set string to node-thermal-printer's CharacterSet
 * @param charset Character set string
 * @returns CharacterSet enum value
 */
function getCharacterSet(charset: string): any {
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

/**
 * Generate a receipt content string for an order
 * @param order Order data
 * @param orderItems Items in the order
 * @returns Formatted receipt content
 */
export function generateReceiptContent(order: any, orderItems: any[]): string {
  const dateTime = new Date(order.orderTime).toLocaleString();

  let content = `
==============================
         YOUR BUSINESS
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

/**
 * Generate test page content for printer testing
 * @param printer Printer configuration
 * @returns Test page content
 */
export function generateTestPageContent(printer: PrinterConfig): string {
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
correctly with your application.
==============================
If you can read this message,
your printer is correctly
configured and working!
==============================
        THANK YOU!
==============================
`;
}

// Example of how to set up IPC handlers in Electron main process:
/*
import { ipcMain } from 'electron';

// IPC handler for printing a test page
ipcMain.handle('print-test-page', async (_event, printerId) => {
  try {
    // Get the printer configuration from your database
    const printer = await getPrinterById(printerId);

    if (!printer) {
      throw new Error('Printer not found');
    }

    // Generate test page content
    const content = generateTestPageContent(printer);

    // Print the test page
    const success = await printThermalReceipt(printer, content);

    return { success };
  } catch (error) {
    console.error('Error printing test page:', error);
    return { success: false, error: error.message };
  }
});

// IPC handler for printing a receipt
ipcMain.handle('print-receipt', async (_event, { printerId, order, orderItems }) => {
  try {
    // Get the printer configuration from your database
    const printer = await getPrinterById(printerId);

    if (!printer) {
      throw new Error('Printer not found');
    }

    // Generate receipt content
    const content = generateReceiptContent(order, orderItems);

    // Print the receipt
    const success = await printThermalReceipt(printer, content);

    return { success };
  } catch (error) {
    console.error('Error printing receipt:', error);
    return { success: false, error: error.message };
  }
});
*/ 