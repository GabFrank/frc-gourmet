# Integration Steps for Profile Image Handling

Follow these steps to integrate the profile image handling functionality into your Electron application.

## 1. Import the Image Handler in Your Main Process

In your main.js or where you set up your IPC handlers:

```javascript
// Import the image handler utilities
const imageHandler = require('./utils/image-handler');
```

## 2. Register IPC Handlers for Image Operations

Add these handlers to your existing IPC setup:

```javascript
// In your main process where you set up other IPC handlers
ipcMain.handle('save-profile-image', async (event, { base64Data, fileName }) => {
  return await imageHandler.saveProfileImage(base64Data, fileName);
});

ipcMain.handle('delete-profile-image', async (event, imageUrl) => {
  return await imageHandler.deleteProfileImage(imageUrl);
});
```

## 3. Update Your Preload Script

Add these methods to your preload.js to expose them to the renderer process:

```javascript
// In your preload.js
contextBridge.exposeInMainWorld('api', {
  // ... your existing API methods
  
  // Profile image operations
  saveProfileImage: (base64Data, fileName) => {
    return ipcRenderer.invoke('save-profile-image', { base64Data, fileName });
  },
  
  deleteProfileImage: (imageUrl) => {
    return ipcRenderer.invoke('delete-profile-image', imageUrl);
  }
});
```

## 4. Set Up a Protocol Handler for Images (Optional but Recommended)

Add this to your main process to handle the app:// protocol for images:

```javascript
// In your main.js, before app is ready
app.whenReady().then(() => {
  // Register the app:// protocol
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.substring(6); // Remove 'app://'
    
    if (url.startsWith('profile-images/')) {
      const fileName = url.replace('profile-images/', '');
      const imagesDir = path.join(app.getPath('userData'), 'profile-images');
      callback({ path: path.join(imagesDir, fileName) });
      return;
    }
    
    // Handle other app:// URLs here if needed
    callback({ error: -2 /* ENOENT */ });
  });
});
```

## 5. Display Images in Your Angular Component

Update your component to properly display images with the app:// protocol:

```typescript
// In your component that displays the images
displayImageUrl(imageUrl: string): string {
  if (!imageUrl) return 'assets/default-profile.png'; // Fallback image
  
  // If it's already a proper URL or data URL, use it directly
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('http')) {
    return imageUrl;
  }
  
  // For our app protocol URLs, return as is
  return imageUrl;
}
```

In your HTML template:

```html
<img [src]="displayImageUrl(persona.imageUrl)" alt="Profile Image">
```

## 6. Test the Implementation

1. Create a new persona with an image
2. Verify it's saved in the app data directory
3. Restart the app and ensure the image still appears
4. Edit the persona and update the image, verify the old one is deleted 