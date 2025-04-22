import { ipcMain } from 'electron';
import { DataSource, Not } from 'typeorm';
import { Printer } from '../../src/app/database/entities/printer.entity';
import { generateTestPageContent, printPosReceipt } from '../utils/printer.utils';

export function registerPrinterHandlers(dataSource: DataSource) {

  // IPC handler for getting all printers
  ipcMain.handle('get-printers', async () => {
    try {
      const printerRepository = dataSource.getRepository(Printer);
      const printers = await printerRepository.find();
      return printers;
    } catch (error) {
      console.error('Error getting printers:', error);
      throw error;
    }
  });

  // IPC handler for adding a printer
  ipcMain.handle('add-printer', async (_event: any, printer: any) => {
    try {
      const printerRepository = dataSource.getRepository(Printer);

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
    } catch (error) {
      console.error('Error adding printer:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // IPC handler for updating a printer
  ipcMain.handle('update-printer', async (_event: any, printerId: number, printer: any) => {
    try {
      const printerRepository = dataSource.getRepository(Printer);

      // If this is a default printer, unset any existing defaults
      if (printer.isDefault) {
        // Use Not(printerId) to ensure we don't unset the printer being updated
        await printerRepository.update({ isDefault: true, id: Not(printerId) }, { isDefault: false });
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
        // Get the updated printer to return
        const updatedPrinter = await printerRepository.findOneBy({ id: printerId });
        return { success: true, printer: updatedPrinter };
      } else {
        return { success: false, error: 'Printer not found' };
      }
    } catch (error) {
      console.error('Error updating printer:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // IPC handler for deleting a printer
  ipcMain.handle('delete-printer', async (_event: any, printerId: number) => {
    try {
      const printerRepository = dataSource.getRepository(Printer);

      const result = await printerRepository.delete(printerId);

      if (result.affected && result.affected > 0) {
        return { success: true };
      } else {
        return { success: false, error: 'Printer not found' };
      }
    } catch (error) {
      console.error('Error deleting printer:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // IPC handler for printing a test page
  ipcMain.handle('print-test-page', async (_event: any, printerId: number) => {
    try {
      const printerRepository = dataSource.getRepository(Printer);
      const printer = await printerRepository.findOneBy({ id: printerId });

      if (!printer) {
        throw new Error('Printer not found');
      }

      // Generate test page content using the utility function
      const content = generateTestPageContent(printer);

      // Print the test page using the utility function
      const success = await printPosReceipt(printer, content);

      return { success };
    } catch (error) {
      console.error('Error printing test page:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
} 