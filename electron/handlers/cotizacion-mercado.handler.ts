import { ipcMain } from 'electron';
import { fetchCotizacionMercado } from '../utils/cotizacion-mercado.utils';

/**
 * Handler para scraping de cotizaciones de mercado.
 * No persiste nada — devuelve el snapshot en vivo. Pensado para que la UI de
 * cotizaciones (CreateEditMonedaCambioDialog) prellene los campos al click del
 * usuario, evitando el copy/paste manual.
 */
export function registerCotizacionMercadoHandlers() {
  ipcMain.handle('get-cotizacion-mercado', async () => {
    try {
      const result = await fetchCotizacionMercado();
      return { success: true, ...result };
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('get-cotizacion-mercado falló:', msg);
      return { success: false, message: msg };
    }
  });
}
