import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const PROFILE_IMAGE_DIR = 'profile-images';
const PRODUCT_IMAGE_DIR = 'producto-images';

function getStoragePath(dirName: string): string {
  const userDataPath = app.getPath('userData');
  const dirPath = path.join(userDataPath, dirName);

  // Ensure directory exists
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function saveImage(base64Data: string, fileName: string, dirName: string): { imageUrl: string } {
  const storagePath = getStoragePath(dirName);
  const filePath = path.join(storagePath, fileName);

  // Remove data URL prefix if present (e.g., "data:image/png;base64,")
  const imageData = base64Data.replace(/^data:image\/\w+;base64,/, "");

  // Write the file
  fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));

  // Return an app-specific URL for the renderer to use
  return { imageUrl: `app://${dirName}/${fileName}` };
}

function deleteImage(imageUrl: string, dirName: string): boolean {
    // Extract filename from the app-specific URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts.pop(); // Get the last part
    const urlDir = urlParts.pop(); // Get the directory part from the URL

    if (!fileName || urlDir !== dirName) {
        console.error(`Invalid image URL format or mismatched directory for deletion: ${imageUrl}`);
        return false;
    }

    const storagePath = getStoragePath(dirName);
    const filePath = path.join(storagePath, fileName);

    // Check if file exists and delete
    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            console.log(`Deleted image file: ${filePath}`);
            return true;
        } catch (error) {
            console.error(`Error deleting image file ${filePath}:`, error);
            return false;
        }
    } else {
        console.warn(`Image file not found for deletion: ${filePath}`);
        return false; // Indicate file wasn't found
    }
}

// Profile image functions
export const saveProfileImage = (base64Data: string, fileName: string) => {
    return saveImage(base64Data, fileName, PROFILE_IMAGE_DIR);
};

export const deleteProfileImage = (imageUrl: string): boolean => {
    return deleteImage(imageUrl, PROFILE_IMAGE_DIR);
};

// Product image functions
export const saveProductoImage = (base64Data: string, fileName: string) => {
    return saveImage(base64Data, fileName, PRODUCT_IMAGE_DIR);
};

export const deleteProductoImage = (imageUrl: string): boolean => {
    return deleteImage(imageUrl, PRODUCT_IMAGE_DIR);
}; 