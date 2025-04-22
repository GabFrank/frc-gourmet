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
exports.registerImageHandlers = void 0;
const electron_1 = require("electron");
const producto_image_entity_1 = require("../../src/app/database/entities/productos/producto-image.entity");
const imageHandler = __importStar(require("../utils/image-handler.utils")); // Import the utility functions
function registerImageHandlers(dataSource) {
    // --- Profile Image Handlers ---
    electron_1.ipcMain.handle('save-profile-image', async (_event, { base64Data, fileName }) => {
        try {
            // Use the utility function
            return await imageHandler.saveProfileImage(base64Data, fileName);
        }
        catch (error) {
            console.error('Error saving profile image via IPC:', error);
            throw error; // Re-throw the error to be caught by the renderer
        }
    });
    electron_1.ipcMain.handle('delete-profile-image', async (_event, imageUrl) => {
        try {
            // Use the utility function
            const success = await imageHandler.deleteProfileImage(imageUrl);
            return { success }; // Return result to renderer
        }
        catch (error) {
            console.error('Error deleting profile image via IPC:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
    // --- Product Image DB Handlers ---
    electron_1.ipcMain.handle('getProductImages', async (_event, productoId) => {
        try {
            const productoImageRepository = dataSource.getRepository(producto_image_entity_1.ProductoImage);
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
    electron_1.ipcMain.handle('createProductImage', async (_event, imageData) => {
        try {
            const productoImageRepository = dataSource.getRepository(producto_image_entity_1.ProductoImage);
            const productoImage = productoImageRepository.create(imageData);
            const result = await productoImageRepository.save(productoImage);
            console.log('ProductoImage created:', result);
            return result;
        }
        catch (error) {
            console.error('Error creating productoImage:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateProductImage', async (_event, imageId, imageData) => {
        try {
            const productoImageRepository = dataSource.getRepository(producto_image_entity_1.ProductoImage);
            const productoImage = await productoImageRepository.findOneBy({ id: imageId });
            if (!productoImage) {
                throw new Error(`ProductoImage with ID ${imageId} not found`);
            }
            productoImageRepository.merge(productoImage, imageData);
            const result = await productoImageRepository.save(productoImage);
            console.log('ProductoImage updated:', result);
            return result;
        }
        catch (error) {
            console.error(`Error updating productoImage with ID ${imageId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteProductImage', async (_event, imageId) => {
        try {
            const productoImageRepository = dataSource.getRepository(producto_image_entity_1.ProductoImage);
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
        }
        catch (error) {
            console.error(`Error deleting productoImage with ID ${imageId}:`, error);
            throw error;
        }
    });
    // --- Product Image File Handlers ---
    electron_1.ipcMain.handle('saveProductoImage', async (_event, { base64Data, fileName }) => {
        try {
            // Use the utility function for product images
            return await imageHandler.saveProductoImage(base64Data, fileName);
        }
        catch (error) {
            console.error('Error saving producto image file via IPC:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteProductoImageFile', async (_event, imageUrl) => {
        // Renamed handler slightly to avoid conflict with DB delete handler name
        try {
            // Use the utility function for product images
            const success = await imageHandler.deleteProductoImage(imageUrl);
            return { success };
        }
        catch (error) {
            console.error('Error deleting producto image file via IPC:', error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
    });
}
exports.registerImageHandlers = registerImageHandlers;
//# sourceMappingURL=images.handler.js.map