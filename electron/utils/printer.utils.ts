import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

// Helper function to generate test page content
export function generateTestPageContent(printer: any): string {
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

// Helper function to print receipt with POS printer
export async function printPosReceipt(printer: any, content: string): Promise<boolean> {
  try {
    // Special handling for CUPS printers (often USB thermal printers on Linux/macOS)
    if (printer.connectionType === 'usb' && printer.address && printer.address.startsWith('ticket-')) { // Example CUPS naming
      console.log("Detected CUPS printer. Using direct CUPS printing approach.");

      // Create a temporary file for the content
      const tempDir = app.getPath('temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const tempFile = path.join(tempDir, `receipt-${Date.now()}.txt`);
      fs.writeFileSync(tempFile, content, 'utf8');

      // Print using lp command
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

    // Regular thermal printer printing for network/other USB/Bluetooth printers
    let interfaceConfig;
    if (printer.connectionType === 'network') {
      interfaceConfig = `tcp://${printer.address}:${printer.port || 9100}`;
    } else if (printer.connectionType === 'usb' || printer.connectionType === 'serial') {
      interfaceConfig = printer.address; // For USB/Serial, address is usually the path
    } else if (printer.connectionType === 'bluetooth') {
      interfaceConfig = `bt:${printer.address}`;
    } else {
      console.warn(`Unsupported printer connection type: ${printer.connectionType}. Using address directly.`);
      interfaceConfig = printer.address; // Fallback, might not work
    }

    console.log(`Using printer interface: ${interfaceConfig}`);

    const characterSet = printer.characterSet ? getCharacterSet(printer.characterSet) : CharacterSet.PC437_USA;
    const printerType = getPrinterType(printer.type);

    const thermalPrinter = new ThermalPrinter({
      type: printerType,
      interface: interfaceConfig,
      options: {
        timeout: 5000 // Network timeout
      },
      width: printer.width || 48, // Character width (e.g., 48 for 80mm, 32 for 58mm)
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
  } catch (error) {
    console.error('Error during printing process:', error);
    return false;
  }
}

// Helper function to get printer type for node-thermal-printer
export function getPrinterType(type: string): PrinterTypes {
  switch (type?.toLowerCase()) {
    case 'epson':
      return PrinterTypes.EPSON;
    case 'star':
      return PrinterTypes.STAR;
    // Add other supported types if needed
    default:
      console.warn(`Unknown printer type "${type}", defaulting to EPSON.`);
      return PrinterTypes.EPSON; // Default to a common type
  }
}

// Helper function to get character set for node-thermal-printer
export function getCharacterSet(charset: string): CharacterSet {
  const upperCharset = charset?.toUpperCase();
  const foundSet = Object.values(CharacterSet).find(set => set.toUpperCase() === upperCharset);

  if (foundSet) {
    return foundSet as CharacterSet;
  } else {
    console.warn(`Unknown character set "${charset}", defaulting to PC437_USA.`);
    return CharacterSet.PC437_USA; // Default to a common set
  }
} 