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
exports.deleteProductoImage = exports.saveProductoImage = exports.deleteProfileImage = exports.saveProfileImage = void 0;
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const PROFILE_IMAGE_DIR = 'profile-images';
const PRODUCT_IMAGE_DIR = 'producto-images';
function getStoragePath(dirName) {
    const userDataPath = electron_1.app.getPath('userData');
    const dirPath = path.join(userDataPath, dirName);
    // Ensure directory exists
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
}
function saveImage(base64Data, fileName, dirName) {
    const storagePath = getStoragePath(dirName);
    const filePath = path.join(storagePath, fileName);
    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const imageData = base64Data.replace(/^data:image\/\w+;base64,/, "");
    // Write the file
    fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));
    // Return an app-specific URL for the renderer to use
    return { imageUrl: `app://${dirName}/${fileName}` };
}
function deleteImage(imageUrl, dirName) {
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
        }
        catch (error) {
            console.error(`Error deleting image file ${filePath}:`, error);
            return false;
        }
    }
    else {
        console.warn(`Image file not found for deletion: ${filePath}`);
        return false; // Indicate file wasn't found
    }
}
// Profile image functions
const saveProfileImage = (base64Data, fileName) => {
    return saveImage(base64Data, fileName, PROFILE_IMAGE_DIR);
};
exports.saveProfileImage = saveProfileImage;
const deleteProfileImage = (imageUrl) => {
    return deleteImage(imageUrl, PROFILE_IMAGE_DIR);
};
exports.deleteProfileImage = deleteProfileImage;
// Product image functions
const saveProductoImage = (base64Data, fileName) => {
    return saveImage(base64Data, fileName, PRODUCT_IMAGE_DIR);
};
exports.saveProductoImage = saveProductoImage;
const deleteProductoImage = (imageUrl) => {
    return deleteImage(imageUrl, PRODUCT_IMAGE_DIR);
};
exports.deleteProductoImage = deleteProductoImage;
//# sourceMappingURL=image-handler.utils.js.map