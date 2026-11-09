/**
 * USDT por Tron con IC Pay: cuándo pedir la verificación de una orden (PLAN-tienda-pagos-multi-icpay).
 *
 * Lo que se observó en staging (2026-11-09, dos corridas, 6 de 6 casos): `POST
 * /payment/webhook/{id}/tron` le asigna a la orden que se verifica **el pago entrante más reciente
 * que todavía no tiene orden**, sin mirar el monto. Con varias órdenes pendientes a la vez, pedirlo
 * para todas mezcla los pagos. Y sin pedirlo, IC no detecta el pago (12 min de prueba solo con GET).
 *
 * La regla de la tienda: mirar la cadena (TronGrid) antes de pedir nada. Se toma el pago USDT más
 * reciente hacia la dirección del comercio que ninguna orden de IC tiene asignado; solo si su monto
 * es exactamente el de ESTA orden se pide la verificación. Así cada pago va a la orden de su monto
 * aunque haya varias pendientes (IC nunca deja dos órdenes pendientes del mismo monto). Con una sola
 * orden pendiente se verifica aunque el monto no coincida (pago de más o de menos: no puede ser de
 * otra). Con varias, un pago que no coincide con ninguna no se le asigna a nadie: se avisa.
 */
import { FetchLike } from './tipos';
import { IcpayConfig, icpayLlamar } from './icpay-auth';

/** Red Tron de cada ambiente de IC: staging usa la testnet Nile. */
export const REDES_TRON = {
  NILE: { grid: 'https://nile.trongrid.io', usdt: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf' },
  MAINNET: { grid: 'https://api.trongrid.io', usdt: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' },
} as const;
export function redTronDe(c: IcpayConfig): (typeof REDES_TRON)[keyof typeof REDES_TRON] {
  return /\/\/stage\./i.test(c.baseUrl) ? REDES_TRON.NILE : REDES_TRON.MAINNET;
}

interface Entrante { txid: string; monto: number; en: number }
interface Panorama { entrantesSinOrden: Entrante[]; pendientes: { id: string; monto: number }[]; en: number }

/** Vida de la foto (cadena + órdenes de IC): varias órdenes del mismo ciclo comparten una sola. */
const VIDA_MS = 10_000;
const fotos = new Map<string, Panorama>();
/** Solo tests. */
export function olvidarPanoramaTron(): void {
  fotos.clear();
}
const clave = (c: IcpayConfig) => `${c.baseUrl}|${c.email}`;

async function json(fetch: FetchLike, url: string): Promise<any> {
  const r = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status} de ${new URL(url).host}`);
  return JSON.parse(await r.text());
}

/** Pagos entrantes sin orden y órdenes USDT pendientes, vistos ahora. */
async function panorama(c: IcpayConfig, fetch: FetchLike, wallet: string): Promise<Panorama> {
  const k = clave(c);
  const f = fotos.get(k);
  if (f && Date.now() - f.en < VIDA_MS) return f;
  const lista = await icpayLlamar(c, fetch, 'GET', '/api/v1/payment/order?take=100&currency=USDT');
  if (lista.status !== 200 || !Array.isArray(lista.body?.results)) throw new Error(`IC no devolvió la lista de órdenes (HTTP ${lista.status})`);
  const ordenes: any[] = lista.body.results;
  const asignados = new Set(ordenes.map((o) => String(o?.providerMetadata?.payerId || '')).filter(Boolean));
  const pendientes = ordenes.filter((o) => String(o?.status) === 'pending')
    .map((o) => ({ id: String(o.id), monto: Number(o.amount), creada: new Date(o.createdAt).getTime() }));
  // Solo pagos posteriores a la orden pendiente más vieja (los de antes ya no pueden ser de ninguna).
  const desde = Math.min(...pendientes.map((p) => p.creada), Date.now()) - 2 * 60_000;
  const red = redTronDe(c);
  const tx = await json(fetch, `${red.grid}/v1/accounts/${wallet}/transactions/trc20?only_to=true&contract_address=${red.usdt}&min_timestamp=${desde}&limit=200`);
  const entrantesSinOrden: Entrante[] = (Array.isArray(tx?.data) ? tx.data : [])
    .filter((t: any) => t?.to === wallet && !asignados.has(String(t.transaction_id)))
    .map((t: any) => ({ txid: String(t.transaction_id), monto: Number(t.value) / 10 ** Number(t.token_info?.decimals ?? 6), en: Number(t.block_timestamp) }))
    .sort((a: Entrante, b: Entrante) => b.en - a.en);
  const p: Panorama = { entrantesSinOrden, pendientes: pendientes.map(({ id, monto }) => ({ id, monto })), en: Date.now() };
  fotos.set(k, p);
  return p;
}

export type DecisionTron =
  | { verificar: true; txid: string }
  | { verificar: false; motivo: string; bloqueado?: boolean };

/**
 * ¿Se pide ya la verificación de Tron para esta orden? Sí solo si el pago entrante más reciente sin
 * orden es exactamente de su monto. `bloqueado`: ese pago no coincide con ninguna orden pendiente
 * (alguien mandó otro monto): no se asigna y el personal lo revisa.
 */
export async function decidirVerificacionTron(c: IcpayConfig, fetch: FetchLike, wallet: string, ordenId: string, usd: number): Promise<DecisionTron> {
  const p = await panorama(c, fetch, wallet);
  const u = p.entrantesSinOrden[0];
  if (!u) return { verificar: false, motivo: 'todavía no llegó ningún pago USDT sin orden' };
  const igual = (a: number, b: number) => Math.abs(a - b) < 0.005;
  if (igual(u.monto, usd)) return { verificar: true, txid: u.txid };
  const deOtra = p.pendientes.some((o) => o.id !== ordenId && igual(o.monto, u.monto));
  if (deOtra) return { verificar: false, motivo: `el último pago (${u.monto.toFixed(2)} USDT) es de otra orden; se espera el turno` };
  // Única orden pendiente: el pago (de más o de menos) no puede ser de otra; IC lo resuelve.
  if (p.pendientes.length === 1 && p.pendientes[0].id === ordenId) return { verificar: true, txid: u.txid };
  return { verificar: false, bloqueado: true, motivo: `llegó un pago de ${u.monto.toFixed(2)} USDT (tx ${u.txid.slice(0, 10)}…) que no coincide con ninguna orden pendiente` };
}

/** Después de verificar, la foto vieja ya no sirve (ese pago pasó a tener orden). */
export function invalidarPanoramaTron(c: IcpayConfig): void {
  fotos.delete(clave(c));
}
