import { ipcMain } from 'electron';
import * as os from 'os';

export function registerSystemHandlers() {

  // IPC handler to get the system MAC address
  ipcMain.handle('get-system-mac-address', async () => {
    try {
      const networkInterfaces = os.networkInterfaces();
      // Find the first non-internal MAC address
      for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        if (!interfaces) continue;

        for (const iface of interfaces) {
          // Skip internal and non-IPv4 interfaces, or non-ethernet types
          if (!iface.internal && iface.family === 'IPv4' && iface.mac !== '00:00:00:00:00:00') {
            return iface.mac;
          }
        }
      }
      // If no suitable interface was found
      console.warn('Could not find a suitable MAC address.');
      return ''; // Return empty string if none found
    } catch (error) {
      console.error('Error getting system MAC address:', error);
      return ''; // Return empty string on error
    }
  });

} 