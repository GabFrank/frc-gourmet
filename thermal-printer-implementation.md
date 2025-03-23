# Thermal Printer Implementation Guide

This guide explains how to implement thermal printer functionality in an Electron application using the `node-thermal-printer` library.

## Dependencies

```json
{
  "dependencies": {
    "node-thermal-printer": "^4.2.0",
    "electron": "^X.X.X"  // Your electron version
  }
}
```

## Implementation Overview

The implementation consists of the following components:

1. A main printing function that handles different printer connection types
2. Helper functions for printer type and character set mapping
3. Content generation functions for receipts
4. Special handling for CUPS printers

## Printer Configuration

Printers are configured with the following properties:

```typescript
interface PrinterConfig {
  id: number;
  name: string;
  type: string;            // 'EPSON' or 'STAR'
  connectionType: string;  // 'network', 'usb', or 'bluetooth'
  address: string;         // IP address or device path
  port?: number;           // Port for network printers (default: 9100)
  width?: number;          // Character width (default: 48)
  characterSet?: string;   // Character set (default: 'PC437_USA')
  options?: any;           // Additional options
}
```

## Core Printing Function

The main function responsible for printing to thermal printers:

```typescript
async function printThermalReceipt(printer: any, content: string): Promise<boolean> {
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

    // Regular thermal printer printing for non-CUPS printers
    // Create interface string based on connection type
    let interfaceConfig;

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
  } catch (error) {
    console.error('Error during printing:', error);
    return false;
  }
}
```

## Helper Functions

### Printer Type Mapping

```typescript
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
```

### Character Set Mapping

```typescript
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
```

## Content Generation

Formatting the content for receipts:

```typescript
function generateReceiptContent(order: any, orderItems: any[]): string {
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
```

## Integration with Electron

To integrate with Electron, you need to:

1. Import the required libraries in your main process file:

```typescript
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
const path = require('path');
const fs = require('fs');
```

2. Create IPC handlers to communicate between renderer and main processes:

```typescript
// Example IPC handler for printing a receipt
ipcMain.handle('print-receipt', async (_event, {printerId, order, orderItems}) => {
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

// Example IPC handler for printing a test page
ipcMain.handle('print-test-page', async (_event, printerId) => {
  try {
    // Get the printer configuration
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
```

3. Register these handlers in your preload script so they can be accessed from the renderer process.

## Client-Side Implementation

From your Angular application, call the Electron IPC handlers:

```typescript
// Service for printer operations
@Injectable({
  providedIn: 'root'
})
export class PrinterService {
  constructor() {}

  async printReceipt(printerId: number, order: any, orderItems: any[]): Promise<any> {
    // Assuming window.electron is exposed through your preload script
    return await window.electron.ipcRenderer.invoke('print-receipt', {
      printerId,
      order,
      orderItems
    });
  }

  async printTestPage(printerId: number): Promise<any> {
    return await window.electron.ipcRenderer.invoke('print-test-page', printerId);
  }
}
```

## Notes on Printer Configuration UI

Your application should have a UI for managing printer configurations, including:

1. Printer name
2. Printer type (EPSON or STAR)
3. Connection type (network, USB, bluetooth)
4. Address (IP or device path)
5. Port (for network printers)
6. Character width
7. Character set
8. Test printing functionality

## Handling Different Operating Systems

- For Windows: USB printers typically use COM ports (e.g., 'COM1')
- For macOS/Linux: USB printers use device paths (e.g., '/dev/usb/lp0')
- For CUPS printing (common on Linux/macOS), handle as shown in the code

## Resources

- [node-thermal-printer documentation](https://github.com/Klemen1337/node-thermal-printer)
- [Electron IPC documentation](https://www.electronjs.org/docs/latest/api/ipc-main) 