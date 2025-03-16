/**
 * Utilities for handling profile image storage in the app data directory
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Base directory for storing profile images
const getImagesDir = () => {
  const userDataPath = app.getPath('userData');
  const imagesDir = path.join(userDataPath, 'profile-images');
  
  // Ensure directory exists
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  return imagesDir;
};

/**
 * Save a base64 image to the app data directory
 * @param {string} base64Data - The base64 encoded image data
 * @param {string} fileName - The filename to save as
 * @returns {Promise<{imageUrl: string}>} Object containing the relative URL to access the image
 */
exports.saveProfileImage = async (base64Data, fileName) => {
  try {
    const imagesDir = getImagesDir();
    const filePath = path.join(imagesDir, fileName);
    
    // Remove data URL prefix if present (e.g., 'data:image/jpeg;base64,')
    let imageData = base64Data;
    if (base64Data.includes(';base64,')) {
      imageData = base64Data.split(';base64,').pop();
    }
    
    // Write the file
    fs.writeFileSync(filePath, Buffer.from(imageData, 'base64'));
    
    // Return a special URL format that will be handled by your app
    // You can use a custom protocol or a relative path that your app understands
    return { imageUrl: `app://profile-images/${fileName}` };
  } catch (error) {
    console.error('Error saving profile image:', error);
    throw error;
  }
};

/**
 * Delete a profile image from the app data directory
 * @param {string} imageUrl - The URL of the image to delete
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
exports.deleteProfileImage = async (imageUrl) => {
  try {
    // Extract filename from the URL
    const fileName = imageUrl.split('/').pop();
    if (!fileName) return false;
    
    const imagesDir = getImagesDir();
    const filePath = path.join(imagesDir, fileName);
    
    // Check if file exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error deleting profile image:', error);
    return false;
  }
};

/**
 * Get the actual file path for a profile image URL
 * @param {string} imageUrl - The URL of the image
 * @returns {string|null} The file path or null if not found
 */
exports.getProfileImagePath = (imageUrl) => {
  try {
    // Extract filename from the URL
    const fileName = imageUrl.split('/').pop();
    if (!fileName) return null;
    
    const imagesDir = getImagesDir();
    const filePath = path.join(imagesDir, fileName);
    
    // Check if file exists
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting profile image path:', error);
    return null;
  }
}; 