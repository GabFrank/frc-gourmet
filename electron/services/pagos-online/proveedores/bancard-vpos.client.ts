/**
 * Cliente de Bancard vPOS, API 0.3 «Compra Simple» (single buy). PLAN-tienda-pagos-proveedores §4.
 *
 * Toda llamada es `POST {base}/vpos/api/0.3/<ruta>` con `{ public_key, operation: {...} }`. Cada
 * operación lleva un `token` md5 armado con la clave PRIVADA (que nunca viaja):
 *   cobro          md5(privada + shop_process_id + monto + moneda)
 *   confirmación   md5(privada + shop_process_id + 'confirm' + monto + moneda)   (la manda Bancard)
 *   consulta       md5(privada + shop_process_id + 'get_confirmation')
 *   anulación      md5(privada + shop_process_id + 'rollback' + '0.00')
 * El monto va con dos decimales y punto («50000.00»). El `fetch` va inyectado para los tests.
 */
import { createHash, timingSafeEqual } from 'crypto';
import { FetchLike, ProveedorError } from './tipos';

export const BANCARD_URL_PRUEBA = 'https://vpos.infonet.com.py:8888';
export const BANCARD_URL_PRODUCCION = 'https://vpos.infonet.com.py';
export const BANCARD_SCRIPT = '/checkout/javascript/dist/bancard-checkout-4.0.0.js';

export interface BancardConfig {
  publicKey: string;
  privateKey: string;
  entorno: 'PRUEBA' | 'PRODUCCION';
  timeoutMs?: number;
}

export function baseBancard(c: Pick<BancardConfig, 'entorno'>): string {
  return c.entorno === 'PRODUCCION' ? BANCARD_URL_PRODUCCION : BANCARD_URL_PRUEBA;
}

const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');

/** Monto en el formato de Bancard: dos decimales, punto. */
export function montoBancard(n: number): string {
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

export const tokenCobro = (priv: string, spid: number | string, monto: string, moneda = 'PYG') => md5(`${priv}${spid}${monto}${moneda}`);
export const tokenConfirmacion = (priv: string, spid: number | string, monto: string, moneda = 'PYG') => md5(`${priv}${spid}confirm${monto}${moneda}`);
export const tokenConsulta = (priv: string, spid: number | string) => md5(`${priv}${spid}get_confirmation`);
export const tokenAnulacion = (priv: string, spid: number | string) => md5(`${priv}${spid}rollback0.00`);

/** Comparación en tiempo constante (el token de la confirmación lo trae un tercero). */
export function mismoToken(a: string, b: string): boolean {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export interface BancardRespuesta {
  status: number;
  body: any;
  raw: string;
}

/** Claves de error que devuelve Bancard en `messages[].key`. */
export function clavesError(body: any): string[] {
  return Array.isArray(body?.messages) ? body.messages.map((m: any) => String(m?.key ?? '')).filter(Boolean) : [];
}

export class BancardVposClient {
  constructor(private cfg: BancardConfig, private fetchFn: FetchLike) {}

  private async llamar(ruta: string, operation: any): Promise<BancardRespuesta> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs ?? 15000);
    try {
      const r = await this.fetchFn(`${baseBancard(this.cfg)}/vpos/api/0.3/${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ public_key: this.cfg.publicKey, operation }),
        signal: ctrl.signal,
      });
      const raw = await r.text();
      let body: any = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      return { status: r.status, body, raw: raw.slice(0, 4000) };
    } catch (e: any) {
      throw new ProveedorError('bancard_sin_conexion', e?.name === 'AbortError' ? 'Bancard no respondió a tiempo' : String(e?.message || e));
    } finally {
      clearTimeout(t);
    }
  }

  cobro(i: { spid: number; monto: number; descripcion: string; returnUrl: string; cancelUrl: string }): Promise<BancardRespuesta> {
    const amount = montoBancard(i.monto);
    return this.llamar('single_buy', {
      token: tokenCobro(this.cfg.privateKey, i.spid, amount),
      shop_process_id: i.spid,
      amount,
      currency: 'PYG',
      additional_data: '',
      description: i.descripcion,
      return_url: i.returnUrl,
      cancel_url: i.cancelUrl,
    });
  }

  consulta(spid: number): Promise<BancardRespuesta> {
    return this.llamar('single_buy/confirmations', { token: tokenConsulta(this.cfg.privateKey, spid), shop_process_id: spid });
  }

  anulacion(spid: number): Promise<BancardRespuesta> {
    return this.llamar('single_buy/rollback', { token: tokenAnulacion(this.cfg.privateKey, spid), shop_process_id: spid });
  }
}
