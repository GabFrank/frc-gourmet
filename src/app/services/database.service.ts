import { Injectable } from '@angular/core';

// Define interfaces for our database models
export interface PrinterConfig {
  id?: number;
  name: string;
  type: 'epson' | 'star' | 'thermal';  // 'epson' and 'star' are supported by node-thermal-printer
  connectionType: 'usb' | 'network' | 'bluetooth';
  address: string; // IP address for network, path for USB, MAC for bluetooth
  port?: number;
  dpi?: number;
  width?: number; // in mm
  characterSet?: string;
  isDefault: boolean;
  options?: any; // Additional printer-specific options
}

// Define the window interface to access the renderer process API
declare global {
  interface Window {
    api: {
      // Printer-related API methods
      getPrinters(): Promise<PrinterConfig[]>;
      addPrinter(printer: PrinterConfig): Promise<{ success: boolean, printer: PrinterConfig }>;
      updatePrinter(printerId: number, printer: PrinterConfig): Promise<{ success: boolean, printer: PrinterConfig }>;
      deletePrinter(printerId: number): Promise<{ success: boolean }>;
      printReceipt(orderId: number, printerId: number): Promise<{ success: boolean }>;
      printTestPage(printerId: number): Promise<{ success: boolean }>;
      
      on(channel: string, callback: (data: any) => void): void;
    };
  }
}

@Injectable({
  providedIn: 'root'
})
export class DatabaseService {
  constructor() { }

  // Printer related methods
  getPrinters(): Promise<PrinterConfig[]> {
    return window.api.getPrinters();
  }

  addPrinter(printer: PrinterConfig): Promise<{ success: boolean, printer: PrinterConfig }> {
    return window.api.addPrinter(printer);
  }

  updatePrinter(printerId: number, printer: PrinterConfig): Promise<{ success: boolean, printer: PrinterConfig }> {
    return window.api.updatePrinter(printerId, printer);
  }

  deletePrinter(printerId: number): Promise<{ success: boolean }> {
    return window.api.deletePrinter(printerId);
  }

  printReceipt(orderId: number, printerId: number): Promise<{ success: boolean }> {
    return window.api.printReceipt(orderId, printerId);
  }

  printTestPage(printerId: number): Promise<{ success: boolean }> {
    return window.api.printTestPage(printerId);
  }
} 