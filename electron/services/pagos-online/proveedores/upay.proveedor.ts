/**
 * uPay como proveedor (checkout hospedado: el cliente paga en la página de uPay). Es el
 * comportamiento de F4/F5 tal cual, detrás del contrato común.
 */
import { DataSource } from 'typeorm';
import { TiendaOnlineConfig } from '../../../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { FORMA_PAGO_UPAY } from '../../../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { UpayCheckoutProvider, UpayConfig, UpayError, UPAY_STG_BASE_URL } from '../upay-checkout.provider';
import { interpretarPago, interpretarSesion } from '../interpretar-pago';
import { deps } from './deps';
import { ProveedorPagoOnline } from './tipos';

export const PROVEEDOR_UPAY = 'UPAY';

/** API Key de uPay vigente (almacén seguro, o la de prueba inyectada). */
export async function upayApiKey(): Promise<string> {
  if (deps.apiKey) return deps.apiKey();
  const { getUpayApiKey } = await import('../../../utils/tienda-secrets.util');
  return getUpayApiKey();
}

/** Config completa para hablar con uPay, o null si falta algo. */
export async function upayConfigDeCfg(c: TiendaOnlineConfig | null): Promise<UpayConfig | null> {
  const key = await upayApiKey();
  if (!c || !key || !c.upayMerchantId) return null;
  return {
    baseUrl: c.upayBaseUrl || UPAY_STG_BASE_URL,
    apiKey: key,
    merchantId: c.upayMerchantId,
    merchantNombre: c.upayMerchantNombre || c.nombreComercio || 'Tienda',
  };
}

export const upayProveedor: ProveedorPagoOnline<UpayConfig> = {
  id: PROVEEDOR_UPAY,
  nombre: 'uPay',
  formaPago: FORMA_PAGO_UPAY,
  hosts: ['upay.com', 'upay.com.py'],
  // uPay tiene su bloque propio en la pantalla (columnas `upay_*` y su API Key, de F4).
  campos: [],
  modo: 'REDIRECCION',

  credenciales: (_ds: DataSource, cfg) => upayConfigDeCfg(cfg),

  async iniciar(creds, input, ctx) {
    const r = await new UpayCheckoutProvider(creds, ctx.fetch).crearSesion({
      referencia: input.referencia,
      idempotencyKey: input.idempotencyKey,
      monto: input.monto,
      successUrl: input.urlVuelta + '?r=ok',
      failureUrl: input.urlVuelta + '?r=error',
      items: input.items,
    });
    return { tipo: 'REDIRECCION', sesionId: r.sessionId, url: r.checkoutUrl, expiraEn: r.expiresAt, crudo: r.resp.raw };
  },

  async consultar(creds, cobro, ctx) {
    const prov = new UpayCheckoutProvider(creds, ctx.fetch);
    let crudo: any = null;
    try {
      const s = await prov.consultarSesion(cobro.sesionId);
      crudo = { sesion: s.body ?? s.raw, status: s.status };
      if (s.status === 401 || s.status === 403) throw new UpayError('upay_credenciales', 'API Key rechazada', s.status);
      if (s.status < 200 || s.status >= 300) throw new UpayError('upay_error', `HTTP ${s.status}`, s.status);
      const ses = interpretarSesion(s.body);
      let pago: any = null;
      if (ses.estado === 'complete' && ses.paymentId) {
        const pr = await prov.consultarPago(ses.paymentId);
        crudo.pago = pr.body ?? pr.raw;
        if (pr.status >= 200 && pr.status < 300) pago = pr.body;
      }
      const resultado = interpretarPago(s.body, pago, { monto: cobro.monto, referencia: cobro.referencia });
      return { resultado, crudo };
    } catch (e: any) {
      // El registro del error lleva lo que se alcanzó a leer (igual que antes).
      if (e instanceof UpayError) (e as any).crudo = crudo;
      throw e;
    }
  },

  async probarConexion(creds, ctx) {
    // Consulta una sesión que no existe: 404 = la API Key sirve; 401/403 = no.
    try {
      const r = await new UpayCheckoutProvider(creds, ctx.fetch).consultarSesion('00000000-0000-4000-8000-000000000000');
      if (r.status === 401 || r.status === 403) return { ok: false, error: 'upay_credenciales' };
      if (r.status === 404 || (r.status >= 200 && r.status < 300)) return { ok: true };
      return { ok: false, error: 'upay_error', detalle: `HTTP ${r.status}` };
    } catch (e: any) {
      return { ok: false, error: 'upay_sin_conexion', detalle: e?.message || String(e) };
    }
  },
};
