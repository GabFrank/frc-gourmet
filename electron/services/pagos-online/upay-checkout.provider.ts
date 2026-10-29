/**
 * Cliente de uPay Online Payments API — checkout hospedado (PLAN-tienda-online F4).
 *
 * Doc (STG): POST /v1/payments/checkout-sessions, GET /v1/payments/checkout-sessions/{id},
 * GET /v1/payments/{id}/status. Autenticación solo por `X-Api-Key` (nunca Bearer).
 * El `fetch` va inyectado para poder probar contra un uPay simulado.
 */
export type FetchLike = (url: string, init?: any) => Promise<{ status: number; text(): Promise<string> }>;

export const UPAY_STG_BASE_URL = 'https://external-api-hub.stg.upay.com.py';

export interface UpayConfig {
  baseUrl: string;
  apiKey: string;
  merchantId: string;
  merchantNombre: string;
  timeoutMs?: number;
}

export interface UpayRespuesta {
  status: number;
  body: any;
  /** Texto crudo recortado (para el registro de eventos). */
  raw: string;
}

export class UpayError extends Error {
  constructor(public codigo: string, message: string, public status?: number) {
    super(message);
  }
}

export interface CrearSesionInput {
  referencia: string; // operationReferenceId: <numero>-<intento>
  idempotencyKey: string;
  monto: number; // guaraníes enteros
  successUrl: string;
  failureUrl: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; sku?: string }>;
}

export class UpayCheckoutProvider {
  constructor(private cfg: UpayConfig, private fetchFn: FetchLike = (globalThis as any).fetch) {}

  private async llamar(metodo: string, ruta: string, cuerpo?: any, idemKey?: string): Promise<UpayRespuesta> {
    const headers: Record<string, string> = {
      'X-Api-Key': this.cfg.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (idemKey) headers['Idempotency-Key'] = idemKey;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs ?? 15000);
    try {
      const r = await this.fetchFn(this.cfg.baseUrl.replace(/\/+$/, '') + ruta, {
        method: metodo,
        headers,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: ctrl.signal,
      });
      const raw = await r.text();
      let body: any = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }
      return { status: r.status, body, raw: raw.slice(0, 4000) };
    } catch (e: any) {
      throw new UpayError('upay_sin_conexion', e?.name === 'AbortError' ? 'uPay no respondió a tiempo' : String(e?.message || e));
    } finally {
      clearTimeout(t);
    }
  }

  async crearSesion(i: CrearSesionInput): Promise<{ sessionId: string; checkoutUrl: string; expiresAt: Date | null; resp: UpayRespuesta }> {
    const cuerpo = {
      merchant: {
        seller: { id: this.cfg.merchantId, name: this.cfg.merchantNombre, operationReferenceId: i.referencia },
      },
      amount: { value: String(Math.round(i.monto)), currency: 'PYG' },
      country: 'PY',
      checkout: { successUrl: i.successUrl, failureUrl: i.failureUrl },
      paymentMethod: { types: ['card'] },
      order: {
        items: i.items.map((it) => ({
          name: it.name.slice(0, 120),
          quantity: it.quantity,
          unitPrice: String(Math.round(it.unitPrice)),
          ...(it.sku ? { sku: it.sku } : {}),
        })),
      },
    };
    const resp = await this.llamar('POST', '/v1/payments/checkout-sessions', cuerpo, i.idempotencyKey);
    if (resp.status === 401 || resp.status === 403) throw new UpayError('upay_credenciales', 'uPay rechazó la API Key', resp.status);
    if (resp.status < 200 || resp.status >= 300 || !resp.body?.sessionId || !resp.body?.checkoutUrl) {
      throw new UpayError('upay_error', `uPay no creó la sesión (HTTP ${resp.status})`, resp.status);
    }
    const exp = resp.body.expiresAt ? new Date(resp.body.expiresAt) : null;
    return {
      sessionId: String(resp.body.sessionId),
      checkoutUrl: String(resp.body.checkoutUrl),
      expiresAt: exp && !isNaN(exp.getTime()) ? exp : null,
      resp,
    };
  }

  consultarSesion(sessionId: string): Promise<UpayRespuesta> {
    return this.llamar('GET', `/v1/payments/checkout-sessions/${encodeURIComponent(sessionId)}`);
  }

  consultarPago(paymentId: string): Promise<UpayRespuesta> {
    return this.llamar('GET', `/v1/payments/${encodeURIComponent(paymentId)}/status`);
  }
}

/**
 * La tienda solo redirige a uPay: https y host exacto o subdominio con punto
 * (`evilupay.com` o `upay.com.evil.net` no pasan).
 */
export function esUrlCheckoutUpay(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return ['upay.com', 'upay.com.py'].some((d) => h === d || h.endsWith('.' + d));
}
