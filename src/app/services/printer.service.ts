import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DatabaseService, PrinterConfig } from './database.service';

@Injectable({
  providedIn: 'root'
})
export class PrinterService {
  private printers: PrinterConfig[] = [];
  private printersSubject = new BehaviorSubject<PrinterConfig[]>([]);
  private defaultPrinter: PrinterConfig | null = null;

  constructor(private dbService: DatabaseService) {
    // Load printers from database on initialization
    this.loadPrinters();
  }

  /**
   * Load printers from database
   */
  async loadPrinters(): Promise<void> {
    try {
      // Check if the API is available
      if (!window.api || typeof window.api.getPrinters !== 'function') {
        console.error('Printer API not available. Please restart the application.');
        throw new Error('Printer API not available');
      }
      
      // Access the database service to get printers
      this.printers = await this.dbService.getPrinters();
      
      // Update the BehaviorSubject with the loaded printers
      this.printersSubject.next([...this.printers]);
      
      // Set the default printer
      this.defaultPrinter = this.printers.find(p => p.isDefault) || null;
    } catch (error) {
      console.error('Error loading printers:', error);
      this.printers = [];
      this.printersSubject.next([]);
      this.defaultPrinter = null;
      throw error;
    }
  }

  /**
   * Get all printers
   */
  getPrinters(): Observable<PrinterConfig[]> {
    return this.printersSubject.asObservable();
  }

  /**
   * Get default printer
   */
  getDefaultPrinter(): PrinterConfig | null {
    return this.defaultPrinter;
  }

  /**
   * Add a new printer configuration
   */
  async addPrinter(printer: PrinterConfig): Promise<boolean> {
    try {
      // If this is set as default, unset other default printers
      if (printer.isDefault) {
        await this.unsetDefaultPrinters();
      }
      
      // Add printer via database service
      const result = await this.dbService.addPrinter(printer);
      
      if (result.success) {
        // Update local printers list
        this.printers.push(result.printer);
        this.printersSubject.next([...this.printers]);
        
        // If default, update the default printer
        if (printer.isDefault) {
          this.defaultPrinter = result.printer;
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error adding printer:', error);
      return false;
    }
  }

  /**
   * Update a printer configuration
   */
  async updatePrinter(id: number, printer: PrinterConfig): Promise<boolean> {
    try {
      // If this is set as default, unset other default printers
      if (printer.isDefault) {
        await this.unsetDefaultPrinters();
      }
      
      // Update printer via database service
      const result = await this.dbService.updatePrinter(id, printer);
      
      if (result.success) {
        // Update local printers list
        const index = this.printers.findIndex(p => p.id === id);
        if (index !== -1) {
          this.printers[index] = result.printer;
          this.printersSubject.next([...this.printers]);
          
          // If default, update the default printer
          if (printer.isDefault) {
            this.defaultPrinter = result.printer;
          } else if (this.defaultPrinter && this.defaultPrinter.id === id) {
            // If this was the default and now it's not, clear default
            this.defaultPrinter = null;
          }
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating printer:', error);
      return false;
    }
  }

  /**
   * Delete a printer configuration
   */
  async deletePrinter(id: number): Promise<boolean> {
    try {
      // Delete printer via database service
      const result = await this.dbService.deletePrinter(id);
      
      if (result.success) {
        // Update local printers list
        const index = this.printers.findIndex(p => p.id === id);
        if (index !== -1) {
          // If this was the default printer, clear default
          if (this.defaultPrinter && this.defaultPrinter.id === id) {
            this.defaultPrinter = null;
          }
          
          this.printers.splice(index, 1);
          this.printersSubject.next([...this.printers]);
        }
        
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting printer:', error);
      return false;
    }
  }

  /**
   * Set a printer as default
   */
  async setDefaultPrinter(id: number): Promise<boolean> {
    try {
      // Unset all printers as default
      await this.unsetDefaultPrinters();
      
      // Set the specified printer as default
      const printer = this.printers.find(p => p.id === id);
      if (printer) {
        printer.isDefault = true;
        const result = await this.dbService.updatePrinter(id, printer);
        
        if (result.success) {
          this.defaultPrinter = result.printer;
          this.printersSubject.next([...this.printers]);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error setting default printer:', error);
      return false;
    }
  }

  /**
   * Unset all printers as default
   */
  private async unsetDefaultPrinters(): Promise<void> {
    for (const printer of this.printers) {
      if (printer.isDefault) {
        printer.isDefault = false;
        if (printer.id !== undefined) {
          await this.dbService.updatePrinter(printer.id, printer);
        }
      }
    }
    this.defaultPrinter = null;
  }

  /**
   * Print a receipt for an order
   */
  async printReceipt(orderId: number, printerId?: number): Promise<boolean> {
    try {
      // If printerId is not provided, use default printer
      const targetPrinterId = printerId || this.defaultPrinter?.id;
      
      if (typeof targetPrinterId !== 'number') {
        console.error('No printer selected and no default printer configured');
        return false;
      }
      
      // Print receipt via database service
      const result = await this.dbService.printReceipt(orderId, targetPrinterId);
      return result.success;
    } catch (error) {
      console.error('Error printing receipt:', error);
      return false;
    }
  }

  /**
   * Print a test page to verify printer setup
   */
  async printTestPage(printerId: number): Promise<boolean> {
    try {
      // Print test page via database service
      const result = await this.dbService.printTestPage(printerId);
      return result.success;
    } catch (error) {
      console.error('Error printing test page:', error);
      return false;
    }
  }
} 