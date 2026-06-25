import { app, ipcMain } from 'electron';
import * as os from 'os';
import * as QRCode from 'qrcode';
import { readAppSettings } from '../utils/app-settings.utils';

export function registerSystemHandlers() {

  // Devuelve la URL de acceso a la PWA mobile (cuando la app corre en mode=server)
  // + un QR (data-url) para escanear desde el teléfono. Enumera las IPv4 de LAN.
  ipcMain.handle('get-pwa-access', async () => {
    try {
      const settings = readAppSettings(app.getPath('userData'));
      const mode = (settings as any).mode;
      const port = (settings as any).network?.serverPort || 7070;
      if (mode !== 'server') {
        return { available: false, mode, port };
      }
      const ifaces = os.networkInterfaces();
      const ips: string[] = [];
      for (const name in ifaces) {
        for (const iface of ifaces[name] || []) {
          if (!iface.internal && iface.family === 'IPv4') ips.push(iface.address);
        }
      }
      const urls = ips.map((ip) => `http://${ip}:${port}`);
      const url = urls[0] || `http://localhost:${port}`;
      let qr = '';
      try {
        qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });
      } catch (e) {
        console.warn('[get-pwa-access] no se pudo generar el QR:', e);
      }
      return { available: true, mode, port, url, urls, qr };
    } catch (error) {
      console.error('Error en get-pwa-access:', error);
      return { available: false };
    }
  });

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