import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource } from 'typeorm';
import { ProductoImage } from '../../src/app/database/entities/productos/producto-image.entity';
import * as imageHandler from '../utils/image-handler.utils'; // Import the utility functions

export function registerImageHandlers(dataSource: DataSource) {

  // --- Profile Image Handlers ---
  ipcMain.handle('save-profile-image', async (_event: IpcMainInvokeEvent, { base64Data, fileName }: { base64Data: string, fileName: string }) => {
    try {
      // Use the utility function
      return await imageHandler.saveProfileImage(base64Data, fileName);
    } catch (error) {
      console.error('Error saving profile image via IPC:', error);
      throw error; // Re-throw the error to be caught by the renderer
    }
  });

  ipcMain.handle('delete-profile-image', async (_event: IpcMainInvokeEvent, imageUrl: string) => {
    try {
      // Use the utility function
      const success = await imageHandler.deleteProfileImage(imageUrl);
      return { success }; // Return result to renderer
    } catch (error) {
      console.error('Error deleting profile image via IPC:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  // --- Product Image DB Handlers ---
  ipcMain.handle('getProductImages', async (_event: any, productoId: number) => {
    try {
      const productoImageRepository = dataSource.getRepository(ProductoImage);
      const images = await productoImageRepository.find({
        where: { productoId }
      });
      return images;
    } catch (error) {
      console.error(`Error getting images for producto ${productoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createProductImage', async (_event: any, imageData: any) => {
    try {
      const productoImageRepository = dataSource.getRepository(ProductoImage);
      const productoImage = productoImageRepository.create(imageData);
      const result = await productoImageRepository.save(productoImage);
      console.log('ProductoImage created:', result);
      return result;
    } catch (error) {
      console.error('Error creating productoImage:', error);
      throw error;
    }
  });

  ipcMain.handle('updateProductImage', async (_event: any, imageId: number, imageData: any) => {
    try {
      const productoImageRepository = dataSource.getRepository(ProductoImage);
      const productoImage = await productoImageRepository.findOneBy({ id: imageId });

      if (!productoImage) {
        throw new Error(`ProductoImage with ID ${imageId} not found`);
      }

      productoImageRepository.merge(productoImage, imageData);
      const result = await productoImageRepository.save(productoImage);
      console.log('ProductoImage updated:', result);
      return result;
    } catch (error) {
      console.error(`Error updating productoImage with ID ${imageId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteProductImage', async (_event: any, imageId: number) => {
    try {
      const productoImageRepository = dataSource.getRepository(ProductoImage);
      const productoImage = await productoImageRepository.findOneBy({ id: imageId });

      if (!productoImage) {
        throw new Error(`ProductoImage with ID ${imageId} not found`);
      }

      // Delete the file from storage first
      if (productoImage.imageUrl) {
        await imageHandler.deleteProductoImage(productoImage.imageUrl);
      }

      // Delete from database
      await productoImageRepository.remove(productoImage);
      console.log(`ProductoImage with ID ${imageId} deleted`);
      return { success: true };
    } catch (error) {
      console.error(`Error deleting productoImage with ID ${imageId}:`, error);
      throw error;
    }
  });

  // --- Product Image File Handlers ---
  ipcMain.handle('saveProductoImage', async (_event: IpcMainInvokeEvent, { base64Data, fileName }: { base64Data: string, fileName: string }) => {
    try {
      // Use the utility function for product images
      return await imageHandler.saveProductoImage(base64Data, fileName);
    } catch (error) {
      console.error('Error saving producto image file via IPC:', error);
      throw error;
    }
  });

  ipcMain.handle('deleteProductoImageFile', async (_event: IpcMainInvokeEvent, imageUrl: string) => {
    // Renamed handler slightly to avoid conflict with DB delete handler name
    try {
      // Use the utility function for product images
      const success = await imageHandler.deleteProductoImage(imageUrl);
      return { success };
    } catch (error) {
      console.error('Error deleting producto image file via IPC:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
} 