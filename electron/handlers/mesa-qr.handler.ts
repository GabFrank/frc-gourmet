import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { PdvMesa } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';

/**
 * Handlers del canal MESA_QR (pedidos en mesa por QR, autoservicio).
 *
 * Cada `PdvMesa` tiene un `qr_token` opaco (alta entropía) que se codifica en un
 * QR estático imprimible. El QR apunta a `<baseUrl>/tienda?mesa=<token>` — la
 * cámara nativa del cliente abre el storefront ya posicionado en la mesa. La
 * mesa se resuelve por el token, nunca por el número (anti-fraude, capa 1).
 *
 * `baseUrl` lo provee el frontend (en web /admin = `window.location.origin`, la
 * URL pública real; ej. https://app.frc-gourmet.com). Si no se pasa, se codifica
 * la ruta relativa (útil solo si se escanea desde el mismo origen).
 *
 * F1b: generación/rotación del token + imagen QR + datos para la lámina
 * imprimible. La habilitación por mesa (`autoservicio_activo`, gate del cajero)
 * y la validación de LAN viven en fases posteriores; acá se expone el toggle.
 */
export function registerMesaQrHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  const repo = () => dataSource.getRepository(PdvMesa);

  /** Genera un token opaco único; reintenta ante colisión del índice único. */
  const generarTokenUnico = async (): Promise<string> => {
    for (let intento = 0; intento < 5; intento++) {
      const token = randomBytes(24).toString('base64url'); // 32 chars, cabe en varchar(64)
      const existe = await repo().findOne({ where: { qrToken: token }, select: { id: true } });
      if (!existe) return token;
    }
    throw new Error('No se pudo generar un token único para la mesa');
  };

  const construirUrl = (baseUrl: string | undefined, token: string): string => {
    const path = `/tienda?mesa=${encodeURIComponent(token)}`;
    const base = (baseUrl || '').trim().replace(/\/+$/, '');
    return base ? `${base}${path}` : path;
  };

  /** Asegura (o rota) el token de una mesa y devuelve token + url + imagen QR. */
  const armarQrMesa = async (mesa: PdvMesa, baseUrl?: string) => {
    const url = construirUrl(baseUrl, mesa.qrToken!);
    let qr = '';
    try {
      qr = await QRCode.toDataURL(url, { margin: 1, width: 320 });
    } catch {
      /* si falla la generación del QR, igual devolvemos token+url */
    }
    return { id: mesa.id, numero: mesa.numero, token: mesa.qrToken, url, qr };
  };

  // Generar (si falta) o rotar el token de una mesa + devolver su QR.
  // opts: { baseUrl?: string, rotar?: boolean }
  ipcMain.handle('generar-qr-mesa', async (_event, mesaId: number, opts?: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const mesa = await repo().findOneBy({ id: mesaId });
    if (!mesa) throw new Error(`Mesa ${mesaId} no encontrada`);

    const rotar = !!opts?.rotar;
    if (!mesa.qrToken || rotar) {
      mesa.qrToken = await generarTokenUnico();
      await setEntityUserTracking(dataSource, mesa, getCurrentUser()?.id, true);
      await repo().save(mesa);
    }
    return armarQrMesa(mesa, opts?.baseUrl);
  });

  // Datos de QR para TODAS las mesas activas (lámina imprimible). Genera el token
  // a las que no lo tengan. opts: { baseUrl?: string, soloActivas?: boolean }
  ipcMain.handle('get-qr-mesas', async (_event, opts?: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const soloActivas = opts?.soloActivas !== false; // default: solo activas
    const mesas = await repo().find({
      where: soloActivas ? { activo: true } : {},
      order: { numero: 'ASC' },
    });
    const out: any[] = [];
    for (const mesa of mesas) {
      if (!mesa.qrToken) {
        mesa.qrToken = await generarTokenUnico();
        await setEntityUserTracking(dataSource, mesa, getCurrentUser()?.id, true);
        await repo().save(mesa);
      }
      out.push(await armarQrMesa(mesa, opts?.baseUrl));
    }
    return out;
  });

  // Habilitar/deshabilitar el autoservicio por QR de una mesa (gate del cajero).
  ipcMain.handle('set-autoservicio-mesa', async (_event, mesaId: number, activo: boolean) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const mesa = await repo().findOneBy({ id: mesaId });
    if (!mesa) throw new Error(`Mesa ${mesaId} no encontrada`);
    mesa.autoservicioActivo = !!activo;
    await setEntityUserTracking(dataSource, mesa, getCurrentUser()?.id, true);
    return await repo().save(mesa);
  });
}
