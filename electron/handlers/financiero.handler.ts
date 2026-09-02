import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource, Not } from 'typeorm';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { TipoPrecio } from '../../src/app/database/entities/financiero/tipo-precio.entity';
// import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { MonedaBillete } from '../../src/app/database/entities/financiero/moneda-billete.entity';
import { Conteo } from '../../src/app/database/entities/financiero/conteo.entity';
import { ConteoDetalle } from '../../src/app/database/entities/financiero/conteo-detalle.entity';
import { Dispositivo } from '../../src/app/database/entities/financiero/dispositivo.entity';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { CajaMoneda } from '../../src/app/database/entities/financiero/caja-moneda.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { MonedaCambio } from '../../src/app/database/entities/financiero/moneda-cambio.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { generarRetiroDelCierre } from './retiro-cierre.util';
import { RetiroCaja } from '../../src/app/database/entities/financiero/retiro-caja.entity';
import { RetiroCajaEstado, RetiroCajaOrigen } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { resolveRequestDeviceId } from '../utils/current-device.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';
import { generarResumenCajaImagenes, buildResumenCajaCaption } from '../utils/resumen-caja-imagen.util';
import { buildEvolutionConfig } from '../services/notificacion.service';
import { getEvolutionApiKey } from '../utils/notificaciones-secrets.util';
import { sendWhatsappMedia, sendWhatsappText, normalizeWhatsappNumber } from '../services/whatsapp.service';
import { dbQuery } from '../utils/db-query';

interface EnvioCierreResult {
  ok: boolean;
  cajaId: number | null;
  omitido?: string;       // motivo por el que no se envió (config off, sin destino, etc.)
  imagenes: number;
  enviados: number;
  errores: string[];
}

/**
 * Envía el resumen de cierre de una caja PdV por WhatsApp como imagen(es), si
 * está activado en PdvConfig y hay un destino configurado. Reutiliza la conexión
 * Evolution API de la config de Notificaciones. Best-effort: nunca lanza; el
 * resultado sirve para diagnóstico (uso automático al cerrar y manual/test).
 *
 * opts.forzar        → ignora el flag whatsappCierreCajaActivo (para test manual).
 * opts.destinoOverride → usa este destino en vez del de PdvConfig (para test).
 */
async function enviarCierreCajaWhatsapp(
  dataSource: DataSource,
  cajaId: number,
  opts: { forzar?: boolean; destinoOverride?: string } = {},
): Promise<EnvioCierreResult> {
  const result: EnvioCierreResult = { ok: false, cajaId, imagenes: 0, enviados: 0, errores: [] };
  try {
    const cfg = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
    if (!opts.forzar && !cfg?.whatsappCierreCajaActivo) {
      result.omitido = 'Envío de WhatsApp desactivado en la config del PdV';
      return result;
    }
    const destinoRaw = (opts.destinoOverride || cfg?.whatsappCierreCajaDestino || '').trim();
    if (!destinoRaw) {
      result.omitido = 'Sin destino de WhatsApp configurado';
      return result;
    }

    const evolution = await buildEvolutionConfig();
    const apikey = await getEvolutionApiKey();
    if (!evolution.url || !evolution.instance || !apikey) {
      result.omitido = 'Evolution API no configurada (URL/instancia/apikey en Notificaciones)';
      console.warn('[cierre-whatsapp] ' + result.omitido);
      return result;
    }
    const destino = normalizeWhatsappNumber(destinoRaw);

    let generado: Awaited<ReturnType<typeof generarResumenCajaImagenes>> = null;
    try {
      generado = await generarResumenCajaImagenes(dataSource, cajaId);
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      result.errores.push(`Render de imagen: ${msg}`);
      console.warn(`[cierre-whatsapp] no se pudo generar la imagen del cierre ${cajaId}:`, msg);
    }

    // Fallback: si no se pudo generar la imagen, mandar al menos el texto.
    if (!generado || !generado.base64List.length) {
      try {
        const { computeResumenCaja } = await import('../utils/resumen-caja.utils');
        const resumen = await computeResumenCaja(dataSource, cajaId);
        await sendWhatsappText(evolution, apikey, destino, buildResumenCajaCaption(resumen, ''));
        result.ok = true;
        result.enviados = 1;
      } catch (e) {
        const msg = (e as Error)?.message || String(e);
        result.errores.push(`Fallback texto: ${msg}`);
        console.warn(`[cierre-whatsapp] fallback de texto falló para caja ${cajaId}:`, msg);
      }
      return result;
    }

    result.imagenes = generado.base64List.length;
    const caption = buildResumenCajaCaption(generado.resumen, generado.empresaNombre);
    for (let i = 0; i < generado.base64List.length; i++) {
      try {
        await sendWhatsappMedia(evolution, apikey, destino, generado.base64List[i], {
          fileName: `cierre-caja-${cajaId}${generado.base64List.length > 1 ? `-${i + 1}` : ''}.png`,
          caption: i === 0 ? caption : '', // el caption va solo en la primera imagen
        });
        result.enviados++;
      } catch (e) {
        const msg = (e as Error)?.message || String(e);
        result.errores.push(`Imagen ${i + 1}: ${msg}`);
        console.warn(`[cierre-whatsapp] falló el envío de la imagen ${i + 1} del cierre ${cajaId}:`, msg);
      }
    }
    result.ok = result.enviados > 0;
    return result;
  } catch (e) {
    result.errores.push((e as Error)?.message || String(e));
    return result;
  }
}

export function registerFinancieroHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  // Remove this line - get the current user in each handler instead
  // const currentUser = getCurrentUser(); // Get user for tracking

  // --- Moneda Handlers ---
  ipcMain.handle('getMonedas', async () => {
    try {
      const repo = dataSource.getRepository(Moneda);
      return await repo.find({ order: { principal: 'DESC', denominacion: 'ASC' } });
    } catch (error) {
      console.error('Error getting monedas:', error);
      throw error;
    }
  });

  ipcMain.handle('get-monedas', async () => {
    try {
      const repo = dataSource.getRepository(Moneda);
      return await repo.find({ where: { activo: true }, order: { principal: 'DESC', denominacion: 'ASC' } });
    } catch (error) {
      console.error('Error getting monedas:', error);
      throw error;
    }
  });

  ipcMain.handle('getMoneda', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Moneda);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting moneda ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getMonedaPrincipal', async () => {
    try {
      const repo = dataSource.getRepository(Moneda);
      return await repo.findOneBy({ principal: true });
    } catch (error) {
      console.error('Error getting moneda principal:', error);
      throw error;
    }
  });

  ipcMain.handle('createMoneda', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(Moneda);
      if (data.principal) {
        await repo.update({ principal: true }, { principal: false });
      }
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating moneda:', error);
      throw error;
    }
  });

  ipcMain.handle('updateMoneda', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(Moneda);
      if (data.principal) {
        await repo.update({ principal: true, id: Not(id) }, { principal: false });
      }
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Moneda ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating moneda ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteMoneda', async (_event: any, id: number) => {
    // Note: Hard delete. Consider dependencies (PrecioVenta, MonedaBillete, CajaMoneda, etc.)
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(Moneda);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Moneda ID ${id} not found`);
      if (entity.principal) {
        throw new Error('No se puede eliminar la moneda principal. Establezca otra moneda como principal primero.');
      }
      // Add more dependency checks here before deleting
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting moneda ID ${id}:`, error);
      throw error;
    }
  });

  // --- TipoPrecio Handlers ---
  ipcMain.handle('get-tipo-precios', async () => {
    try {
      const repo = dataSource.getRepository(TipoPrecio);
      return await repo.find({ where: { activo: true }, order: { descripcion: 'ASC' } });
    } catch (error) {
      console.error('Error getting tipos de precio:', error);
      throw error;
    }
  });

  ipcMain.handle('create-tipo-precio', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(TipoPrecio);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating tipo de precio:', error);
      throw error;
    }
  });

  ipcMain.handle('get-tipo-precio', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(TipoPrecio);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting tipo de precio ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('update-tipo-precio', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(TipoPrecio);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`TipoPrecio ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating tipo de precio ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-tipo-precio', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(TipoPrecio);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`TipoPrecio ID ${id} not found`);
      // Soft delete
      entity.activo = false;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error deleting tipo de precio ${id}:`, error);
      throw error;
    }
  });

  // --- MonedaBillete Handlers ---
  ipcMain.handle('get-monedas-billetes', async () => {
    try {
      const repo = dataSource.getRepository(MonedaBillete);
      return await repo.find({ relations: ['moneda'], order: { moneda: { id: 'ASC' }, valor: 'ASC' } });
    } catch (error) {
      console.error('Error getting monedas billetes:', error);
      throw error;
    }
  });

  ipcMain.handle('get-moneda-billete', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(MonedaBillete);
      return await repo.findOne({ where: { id }, relations: ['moneda'] });
    } catch (error) {
      console.error(`Error getting moneda billete ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-moneda-billete', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(MonedaBillete);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating moneda billete:', error);
      throw error;
    }
  });

  ipcMain.handle('update-moneda-billete', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(MonedaBillete);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`MonedaBillete ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating moneda billete ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-moneda-billete', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete. Consider dependencies (ConteoDetalle)
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(MonedaBillete);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`MonedaBillete ID ${id} not found`);
      // Add dependency checks here
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting moneda billete ${id}:`, error);
      throw error;
    }
  });

  // --- Conteo Handlers ---
  ipcMain.handle('get-conteos', async () => {
    try {
      const repo = dataSource.getRepository(Conteo);
      // Adjust relations as needed for display/calculation
      return await repo.find({ relations: ['detalles', 'detalles.monedaBillete', 'detalles.monedaBillete.moneda', 'createdBy', 'updatedBy'], order: { id: 'DESC' } });
    } catch (error) {
      console.error('Error getting conteos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-conteo', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(Conteo);
      return await repo.findOne({ where: { id }, relations: ['detalles', 'detalles.monedaBillete', 'detalles.monedaBillete.moneda', 'createdBy', 'updatedBy'] });
    } catch (error) {
      console.error(`Error getting conteo ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-conteo', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_OPERAR');
      const repo = dataSource.getRepository(Conteo);
      const entity: any = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      // F5 paso 3: propagar device_id del request context si no vino explicito.
      if (!data?.dispositivo && !data?.dispositivo_id) {
        const deviceId = resolveRequestDeviceId(_event);
        if (deviceId != null) entity.dispositivo = { id: deviceId };
      }
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating conteo:', error);
      throw error;
    }
  });

  ipcMain.handle('update-conteo', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_OPERAR');
      const repo = dataSource.getRepository(Conteo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Conteo ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating conteo ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-conteo', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete. Conteos might be linked to Cajas, consider implications.
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
      const repo = dataSource.getRepository(Conteo);
      const entity = await repo.findOne({ where: { id }, relations: ['detalles'] }); // Load detalles to delete them first
      if (!entity) throw new Error(`Conteo ID ${id} not found`);

      // Manually delete details first if cascade delete is not set up
      if (entity.detalles && entity.detalles.length > 0) {
        const detalleRepo = dataSource.getRepository(ConteoDetalle);
        await detalleRepo.remove(entity.detalles);
      }
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting conteo ${id}:`, error);
      throw error;
    }
  });

  // --- ConteoDetalle Handlers ---
  ipcMain.handle('get-conteo-detalles', async (_event: IpcMainInvokeEvent, conteoId: number) => {
    try {
      const repo = dataSource.getRepository(ConteoDetalle);
      return await repo.find({ where: { conteo: { id: conteoId } }, relations: ['monedaBillete', 'monedaBillete.moneda'] });
    } catch (error) {
      console.error(`Error getting conteo detalles for conteo ${conteoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-conteo-detalle', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(ConteoDetalle);
      return await repo.findOne({ where: { id }, relations: ['conteo', 'monedaBillete', 'monedaBillete.moneda'] });
    } catch (error) {
      console.error(`Error getting conteo detalle ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-conteo-detalle', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_OPERAR');
      const repo = dataSource.getRepository(ConteoDetalle);
      const entity = repo.create(data);
      // No user tracking needed usually for details
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating conteo detalle:', error);
      throw error;
    }
  });

  ipcMain.handle('update-conteo-detalle', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_OPERAR');
      const repo = dataSource.getRepository(ConteoDetalle);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ConteoDetalle ID ${id} not found`);
      repo.merge(entity, data);
      // No user tracking needed usually
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating conteo detalle ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-conteo-detalle', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete.
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
      const repo = dataSource.getRepository(ConteoDetalle);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ConteoDetalle ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting conteo detalle ${id}:`, error);
      throw error;
    }
  });

  // --- Dispositivo Handlers ---
  ipcMain.handle('get-dispositivos', async () => {
    try {
      const repo = dataSource.getRepository(Dispositivo);
      return await repo.find({ order: { nombre: 'ASC' }, relations: ['printerTicket'] });
    } catch (error) {
      console.error('Error getting dispositivos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-dispositivo', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(Dispositivo);
      return await repo.findOne({ where: { id }, relations: ['printerTicket'] });
    } catch (error) {
      console.error(`Error getting dispositivo ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-dispositivo', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'DISPOSITIVOS_GESTIONAR');
      const repo = dataSource.getRepository(Dispositivo);
      // Mapeo: printerTicketId (UI) → printerTicket FK
      const { printerTicketId, ...rest } = data || {};
      const payload: any = { ...rest };
      if (printerTicketId !== undefined) {
        payload.printerTicket = printerTicketId ? { id: printerTicketId } : null;
      }
      const entity = repo.create(payload);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating dispositivo:', error);
      throw error; // Let renderer handle specific messages (like duplicates)
    }
  });

  ipcMain.handle('update-dispositivo', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'DISPOSITIVOS_GESTIONAR');
      const repo = dataSource.getRepository(Dispositivo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Dispositivo ID ${id} not found`);
      // Mapeo: printerTicketId (UI) → printerTicket FK
      const { printerTicketId, ...rest } = data || {};
      const merged: any = { ...rest };
      if (printerTicketId !== undefined) {
        merged.printerTicket = printerTicketId ? { id: printerTicketId } : null;
      }
      repo.merge(entity, merged);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating dispositivo ${id}:`, error);
      throw error; // Let renderer handle specific messages
    }
  });

  ipcMain.handle('delete-dispositivo', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete. Consider dependencies (Caja)
    try {
      await ensurePermission(dataSource, getCurrentUser, 'DISPOSITIVOS_GESTIONAR');
      const repo = dataSource.getRepository(Dispositivo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Dispositivo ID ${id} not found`);
      // Add dependency checks here
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting dispositivo ${id}:`, error);
      throw error;
    }
  });

  // --- Caja Handlers ---
  ipcMain.handle('get-cajas', async () => {
    try {
      const repo = dataSource.getRepository(Caja);
      return await repo.find({
        relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona'],
        order: { fechaApertura: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting cajas:', error);
      throw error;
    }
  });

  /**
   * Cajas para el SELECTOR de filtros: sólo id, dispositivo, estado y fechas.
   *
   * `get-cajas` no sirve para esto: no tiene `where` ni `LIMIT` y arrastra 6
   * relaciones eager (incluidos los dos conteos completos y las personas). En un
   * local con dos años de operación son miles de filas con sus conteos, por una
   * lista desplegable de un filtro. Acá se pide lo que se muestra y nada más.
   *
   * `desde`/`hasta` acotan por fecha de apertura para que el selector ofrezca
   * las cajas del período que el usuario está mirando, no todo el histórico.
   */
  ipcMain.handle(
    'get-cajas-selector',
    async (
      _event: IpcMainInvokeEvent,
      params: { desde?: string; hasta?: string; limite?: number } = {},
    ) => {
      try {
        const limite = Math.min(Math.max(Number(params.limite) || 200, 1), 500);
        const where: string[] = [];
        const args: any[] = [];
        // `fecha_apertura` es un datetime completo. Un `YYYY-MM-DD` pelado como
        // `hasta` compara como texto contra `YYYY-MM-DD HH:MM:SS` y, siendo un
        // prefijo mas corto, deja AFUERA las cajas abiertas ese mismo dia. Se
        // expande a los extremos del dia antes de comparar.
        const soloFecha = /^\d{4}-\d{2}-\d{2}$/;
        if (params.desde) {
          where.push('c.fecha_apertura >= ?');
          args.push(soloFecha.test(params.desde) ? `${params.desde} 00:00:00` : params.desde);
        }
        if (params.hasta) {
          where.push('c.fecha_apertura <= ?');
          args.push(soloFecha.test(params.hasta) ? `${params.hasta} 23:59:59` : params.hasta);
        }
        const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const rows: any[] = await dbQuery(
          dataSource,
          `SELECT c.id, c.estado, c.fecha_apertura, c.fecha_cierre, d.nombre AS dispositivo_nombre
             FROM cajas c
             LEFT JOIN dispositivos d ON d.id = c.dispositivo_id
             ${filtro}
            ORDER BY c.fecha_apertura DESC
            LIMIT ${limite}`,
          args,
        );
        return rows.map((r) => ({
          id: Number(r.id),
          estado: String(r.estado || ''),
          fechaApertura: r.fecha_apertura,
          fechaCierre: r.fecha_cierre ?? null,
          dispositivoNombre: String(r.dispositivo_nombre || 'SIN DISPOSITIVO').toUpperCase(),
        }));
      } catch (error) {
        console.error('Error getting cajas selector:', error);
        throw error;
      }
    },
  );

  ipcMain.handle('get-caja', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(Caja);
      return await repo.findOne({
        where: { id },
        relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona']
      });
    } catch (error) {
      console.error(`Error getting caja ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-caja-by-dispositivo', async (_event: IpcMainInvokeEvent, dispositivoId: number) => {
    try {
      const repo = dataSource.getRepository(Caja);
      return await repo.find({
        where: { dispositivo: { id: dispositivoId } },
        relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona'],
        order: { fechaApertura: 'DESC' }
      });
    } catch (error) {
      console.error(`Error getting cajas for dispositivo ${dispositivoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-caja', async (_event: IpcMainInvokeEvent, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_OPERAR');
    try {
      const repo = dataSource.getRepository(Caja);
      // Guard: una sola caja ABIERTA por dispositivo (terminal). Antes solo lo
      // aseguraba el frontend del desktop; la PWA también abre cajas, así que el
      // chequeo va en backend para ser inmune a la carrera multi-dispositivo.
      const dispositivoId = data?.dispositivo?.id ?? data?.dispositivo_id ?? null;
      if (data?.estado === CajaEstado.ABIERTO && dispositivoId != null) {
        const yaAbierta = await repo.count({
          where: { dispositivo: { id: dispositivoId }, estado: CajaEstado.ABIERTO },
        });
        if (yaAbierta > 0) {
          throw new Error('Ya hay una caja abierta en esta terminal. Cerrá esa caja antes de abrir otra.');
        }
      }
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating caja:', error);
      throw error;
    }
  });

  ipcMain.handle('update-caja', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_OPERAR');
      const repo = dataSource.getRepository(Caja);
      const entity = await repo.findOne({ where: { id }, relations: ['createdBy'] });
      if (!entity) throw new Error(`Caja ID ${id} not found`);

      // Guard: solo el usuario que ABRIÓ la caja puede cerrarla. Antes solo lo
      // aseguraba el frontend del desktop (mostraba la acción solo al creador);
      // la PWA también cierra cajas, así que va en backend.
      if (data?.estado === CajaEstado.CERRADO && entity.estado !== CajaEstado.CERRADO) {
        const abridorId = (entity.createdBy as any)?.id ?? null;
        const actualId = getCurrentUser()?.id ?? null;
        if (abridorId != null && actualId !== abridorId) {
          throw new Error('Solo el usuario que abrió la caja puede cerrarla.');
        }
      }

      // Guard: no permitir CERRAR una caja que todavía tiene ventas ABIERTAS
      // (mesas/comandas/ventas rápidas sin cobrar). Si se cierra igual, esas
      // ventas quedan huérfanas (la mesa queda OCUPADA para siempre, visible
      // para cualquier caja nueva). El chequeo del diálogo de cierre es solo de
      // frontend y un snapshot: en el modelo multi-dispositivo otro equipo puede
      // abrir una venta en esta caja después de que el diálogo cargó. Este guard
      // en backend es inmune a esa carrera.
      if (data?.estado === CajaEstado.CERRADO && entity.estado !== CajaEstado.CERRADO) {
        const ventasAbiertas = await dataSource.getRepository(Venta).count({
          where: { caja: { id }, estado: VentaEstado.ABIERTA },
        });
        if (ventasAbiertas > 0) {
          throw new Error(
            `No se puede cerrar la caja: tiene ${ventasAbiertas} venta(s) abierta(s) (mesas/comandas sin cobrar). Cobrá o cancelá esas cuentas antes de cerrar.`
          );
        }
      }

      const seEstaCerrando = data?.estado === CajaEstado.CERRADO && entity.estado !== CajaEstado.CERRADO;
      // `dispositivo` fuera del merge: es el dueño de la caja y lo único que
      // sostiene el gate de cobro por terminal. Aceptarlo dejaba que cualquier
      // terminal se apropiara de una caja ajena con un update, desarmando el
      // gate para siempre y rompiendo el invariante "una caja abierta por
      // dispositivo", que sólo se verifica al crear. Ningún llamador lo manda.
      const { dispositivo: _dispositivoIgnorado, ...cajaData } = data ?? {};
      repo.merge(entity, cajaData);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      const saved = await repo.save(entity);

      // Al cerrar, auto-generar el RetiroCaja FLOTANTE con el efectivo del cierre,
      // para que quede disponible para ingresar a una caja mayor. Best-effort: si
      // falla (p. ej. cierre sin conteo de billetes), NO bloquea el cierre. Es
      // idempotente, así que el botón manual del desktop sigue funcionando igual.
      if (seEstaCerrando) {
        try {
          await generarRetiroDelCierre(dataSource, id, getCurrentUser()?.id);
        } catch (e) {
          console.error(`[update-caja] no se pudo auto-generar el retiro del cierre de la caja ${id}:`, e);
        }
        // Envío automático del resumen por WhatsApp (best-effort, no bloquea).
        setImmediate(() => {
          enviarCierreCajaWhatsapp(dataSource, id)
            .catch((e) => console.warn(`[update-caja] envío WhatsApp del cierre ${id} falló:`, e?.message || e));
        });
      }
      return saved;
    } catch (error) {
      console.error(`Error updating caja ${id}:`, error);
      throw error;
    }
  });

  // --- Ajuste de caja cerrada -------------------------------------------------
  // Permite corregir el conteo o agregar un gasto/retiro que faltó, en una caja
  // ya CERRADA, SIN reabrirla. Límite natural: solo mientras el retiro del cierre
  // NO haya sido ingresado a Caja Mayor (ahí ya movió saldos reales).

  /** Busca el retiro del cierre (origen=CIERRE) de una caja, si existe. */
  async function findRetiroDelCierre(cajaId: number): Promise<RetiroCaja | null> {
    return dataSource.getRepository(RetiroCaja).findOne({
      where: { caja: { id: cajaId }, origen: RetiroCajaOrigen.CIERRE } as any,
      relations: ['detalles'],
      order: { id: 'DESC' },
    });
  }

  // Indica si una caja cerrada se puede ajustar (y por qué no, si aplica).
  ipcMain.handle('puede-ajustar-caja', async (_event: IpcMainInvokeEvent, cajaId: number) => {
    const caja = await dataSource.getRepository(Caja).findOne({ where: { id: cajaId } });
    if (!caja) return { editable: false, motivoBloqueo: 'La caja no existe.' };
    if (caja.estado !== CajaEstado.CERRADO) {
      return { editable: false, motivoBloqueo: 'La caja no está cerrada.' };
    }
    const retiroCierre = await findRetiroDelCierre(cajaId);
    if (retiroCierre && retiroCierre.estado === RetiroCajaEstado.INGRESADO) {
      return {
        editable: false,
        motivoBloqueo:
          'El retiro del cierre ya fue ingresado a Caja Mayor. Revertí ese ingreso desde Caja Mayor antes de ajustar la caja.',
      };
    }
    return { editable: true };
  });

  // Cierra el ajuste de una caja cerrada: regenera el retiro del cierre (para que
  // refleje el conteo corregido) y deja traza (revisado + motivo). Se llama DESPUÉS
  // de haber corregido el conteo / agregado el gasto o retiro.
  ipcMain.handle('finalizar-ajuste-caja', async (_event: IpcMainInvokeEvent, cajaId: number, motivo?: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_AJUSTAR');
    const cajaRepo = dataSource.getRepository(Caja);
    const caja = await cajaRepo.findOne({ where: { id: cajaId } });
    if (!caja) throw new Error(`Caja ID ${cajaId} no encontrada`);
    if (caja.estado !== CajaEstado.CERRADO) throw new Error('Solo se puede ajustar una caja cerrada.');

    // Guard: si el retiro del cierre ya se ingresó a Caja Mayor, no tocar.
    const retiroCierre = await findRetiroDelCierre(cajaId);
    if (retiroCierre && retiroCierre.estado === RetiroCajaEstado.INGRESADO) {
      throw new Error(
        'El retiro del cierre ya fue ingresado a Caja Mayor. Revertí ese ingreso antes de ajustar la caja.',
      );
    }

    // Regenerar el retiro del cierre desde el conteo (posiblemente) corregido:
    // borrar el FLOTANTE/VINCULADO_PENDIENTE existente y volver a generarlo.
    if (retiroCierre) {
      await dataSource.getRepository(RetiroCaja).remove(retiroCierre);
    }
    await generarRetiroDelCierre(dataSource, cajaId, getCurrentUser()?.id);

    // Traza del ajuste.
    (caja as any).revisado = true;
    if (getCurrentUser()?.id) (caja as any).revisadoPor = { id: getCurrentUser()!.id } as any;
    (caja as any).motivoAjuste = (motivo || '').trim().toUpperCase() || null;
    await setEntityUserTracking(dataSource, caja, getCurrentUser()?.id, true);
    await cajaRepo.save(caja);
    return { success: true };
  });

  // Envío manual / test del resumen de cierre por WhatsApp. Dispara la MISMA
  // lógica que el envío automático al cerrar. Sin `cajaId`, usa la última caja
  // CERRADA. `forzar` ignora el flag de PdvConfig (útil para probar); `destino`
  // permite mandar a otro número/grupo sin tocar la config.
  // Sigue en FINANCIERO_CAJA_GESTIONAR (gerente), no en el permiso operativo del
  // turno: acepta CUALQUIER `cajaId` y un `destino` de WhatsApp arbitrario, asi
  // que con el permiso del cajero seria una via para mandar el cierre de una caja
  // ajena a un numero elegido por quien llama.
  ipcMain.handle('enviar-resumen-cierre-whatsapp', async (
    _event: IpcMainInvokeEvent,
    params?: { cajaId?: number; forzar?: boolean; destino?: string },
  ) => {
    await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
    const repo = dataSource.getRepository(Caja);
    let cajaId = params?.cajaId ?? null;
    if (!cajaId) {
      const ultima = await repo.findOne({
        where: { estado: CajaEstado.CERRADO },
        order: { fechaCierre: 'DESC', id: 'DESC' },
      });
      if (!ultima) throw new Error('No hay ninguna caja cerrada');
      cajaId = ultima.id;
    }
    return await enviarCierreCajaWhatsapp(dataSource, cajaId, {
      forzar: params?.forzar,
      destinoOverride: params?.destino,
    });
  });

  ipcMain.handle('delete-caja', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete. Consider implications if caja records are critical audit trails.
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
      const repo = dataSource.getRepository(Caja);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Caja ID ${id} not found`);
      // Check if related conteos should also be deleted?
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting caja ${id}:`, error);
      throw error;
    }
  });

  // get-caja-abierta-por-usuario
  ipcMain.handle('get-caja-abierta-by-usuario', async (_event: IpcMainInvokeEvent, usuarioId: number) => {
    try {
      const repo = dataSource.getRepository(Caja);
      return await repo.findOne({ where: { createdBy: { id: usuarioId }, estado: CajaEstado.ABIERTO } });
    } catch (error) {
      console.error('Error getting caja abierta por usuario:', error);
      throw error;
    }
  });

  // get-cajas-abiertas: todas las cajas ABIERTO (de cualquier usuario/dispositivo).
  // Permite que otros usuarios/dispositivos (desktop o PWA) se "unan" a una caja
  // abierta para lanzar items. El cobro sigue restringido al dispositivo dueño.
  ipcMain.handle('get-cajas-abiertas', async () => {
    try {
      const repo = dataSource.getRepository(Caja);
      return await repo.find({
        where: { estado: CajaEstado.ABIERTO },
        relations: ['dispositivo', 'conteoApertura', 'createdBy', 'createdBy.persona'],
        order: { fechaApertura: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting cajas abiertas:', error);
      throw error;
    }
  });

  // --- CajaMoneda Handlers ---
  ipcMain.handle('get-cajas-monedas', async () => {
    try {
      const repo = dataSource.getRepository(CajaMoneda);
      return await repo.find({ relations: ['moneda'], order: { orden: 'ASC' } });
    } catch (error) {
      console.error('Error getting cajas monedas:', error);
      throw error;
    }
  });

  ipcMain.handle('get-caja-moneda', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(CajaMoneda);
      return await repo.findOne({ where: { id }, relations: ['moneda'] });
    } catch (error) {
      console.error('Error getting caja moneda:', error);
      throw error;
    }
  });

  ipcMain.handle('create-caja-moneda', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
      const repo = dataSource.getRepository(CajaMoneda);
      const entity = repo.create(data);
      // No user tracking typically needed for config like this
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating caja moneda:', error);
      throw error;
    }
  });

  ipcMain.handle('update-caja-moneda', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
      const repo = dataSource.getRepository(CajaMoneda);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`CajaMoneda ID ${id} not found`);
      repo.merge(entity, data);
      // No user tracking typically needed
      return await repo.save(entity);
    } catch (error) {
      console.error('Error updating caja moneda:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-caja-moneda', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete.
    try {
      await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
      const repo = dataSource.getRepository(CajaMoneda);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`CajaMoneda ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error('Error deleting caja moneda:', error);
      throw error;
    }
  });

  // Bulk save for CajaMoneda settings
  ipcMain.handle('save-cajas-monedas', async (_event: IpcMainInvokeEvent, updates: any[]) => {
    await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_CAJA_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const results = [];
      for (const update of updates) {
        const { id, monedaId, ...updateData } = update;
        const processedUpdate: Partial<CajaMoneda> = { ...updateData };
        if (monedaId) {
          processedUpdate.moneda = { id: monedaId } as Moneda; // Assign relation by ID
        }

        if (id) {
          await queryRunner.manager.update(CajaMoneda, id, processedUpdate);
          results.push({ success: true, id, operation: 'update' });
        } else {
          const result = await queryRunner.manager.insert(CajaMoneda, processedUpdate);
          const insertedId = result.identifiers[0]?.['id'];
          results.push({ success: true, id: insertedId, operation: 'insert' });
        }
      }
      await queryRunner.commitTransaction();
      return { success: true, results };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error saving cajas monedas (transaction rolled back):', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // --- MonedaCambio Handlers ---
  ipcMain.handle('get-monedas-cambio', async () => {
    try {
      const repo = dataSource.getRepository(MonedaCambio);
      return await repo.find({ relations: ['monedaOrigen', 'monedaDestino'], order: { createdAt: 'DESC' } });
    } catch (error) {
      console.error('Error getting monedas cambio:', error);
      throw error;
    }
  });

   ipcMain.handle('get-monedas-cambio-by-moneda-origen', async (_event: IpcMainInvokeEvent, monedaOrigenId: number) => {
    try {
      const repo = dataSource.getRepository(MonedaCambio);
      return await repo.find({
        where: { monedaOrigen: { id: monedaOrigenId } },
        relations: ['monedaOrigen', 'monedaDestino'],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error(`Error getting monedas cambio for origen ${monedaOrigenId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-moneda-cambio', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(MonedaCambio);
      return await repo.findOne({ where: { id }, relations: ['monedaOrigen', 'monedaDestino'] });
    } catch (error) {
      console.error(`Error getting moneda cambio ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-moneda-cambio', async (_event: IpcMainInvokeEvent, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
    try {
      const repo = dataSource.getRepository(MonedaCambio);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating moneda cambio:', error);
      throw error;
    }
  });

  ipcMain.handle('update-moneda-cambio', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(MonedaCambio);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`MonedaCambio ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating moneda cambio ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-moneda-cambio', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete.
    try {
      await ensurePermission(dataSource, getCurrentUser, 'MONEDAS_GESTIONAR');
      const repo = dataSource.getRepository(MonedaCambio);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`MonedaCambio ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting moneda cambio ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-moneda-cambio-by-moneda-principal', async (_event: IpcMainInvokeEvent) => {
    try {
      const repoMonedaCambio = dataSource.getRepository(MonedaCambio);
      const repoMoneda = dataSource.getRepository(Moneda);

      const monedaPrincipal = await repoMoneda.findOneBy({ principal: true });
      if (!monedaPrincipal) throw new Error('Moneda principal not found');
      return await repoMonedaCambio.findOne({ where: { monedaOrigen: { id: monedaPrincipal.id } } });
    } catch (error) {
      console.error('Error getting moneda cambio por moneda principal:', error);  
      throw error;
    }
  });

  ipcMain.handle('get-valor-en-moneda-principal', async (_event: IpcMainInvokeEvent, monedaId: number, valor: number) => {
    try {
      const repoMonedaCambio = dataSource.getRepository(MonedaCambio);
      const repoMoneda = dataSource.getRepository(Moneda);  
      const moneda = await repoMoneda.findOneBy({ id: monedaId });
      if (!moneda) throw new Error('Moneda not found');
      const monedaPrincipal = await repoMoneda.findOneBy({ principal: true });
      if (!monedaPrincipal) throw new Error('Moneda principal not found');
      if(moneda.id === monedaPrincipal.id) {
        return valor;
      }
      // moneda origen es la moneda principal
      const monedaCambio = await repoMonedaCambio.findOne({ where: { monedaOrigen: { id: monedaPrincipal.id }, monedaDestino: { id: moneda.id } } });
      if (!monedaCambio) throw new Error('MonedaCambio not found');
      return valor * monedaCambio.compraOficial;
    } catch (error) {
      console.error('Error getting valor en moneda principal:', error);
      throw error;
    }
  });
}