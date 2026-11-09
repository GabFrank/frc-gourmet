/**
 * Cuentas de pago online (`formas_pago_online`, PLAN-tienda-pagos-multi-icpay): puede haber varias,
 * incluso del mismo proveedor. Acá se resuelve con qué cuenta se ofrece, se cobra, se consulta y se
 * devuelve cada pedido.
 *
 * Regla de compatibilidad: **sin ninguna fila** en `formas_pago_online` la tienda funciona como
 * antes, con el único proveedor de `tienda_online_config.pago_proveedor` (vacío = uPay) y sus datos
 * de `pago_config_json`. Con filas, mandan las filas.
 */
import { DataSource } from 'typeorm';
import { FormaPagoOnline } from '../../../src/app/database/entities/pedidos-online/forma-pago-online.entity';
import { TiendaOnlineConfig } from '../../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { cuentaLegada, leerConfigCuenta } from './proveedores/config-proveedor';
import { CuentaPago, ProveedorPagoOnline } from './proveedores/tipos';
import { proveedorPorId, PROVEEDOR_UPAY } from './proveedores';

export type TipoPedidoPago = 'PICKUP' | 'DELIVERY' | 'MESA_QR' | string;

/** Una cuenta lista para usar: su fila (o null si es la de antes), el proveedor y las credenciales. */
export interface CuentaResuelta {
  forma: FormaPagoOnline | null;
  cuenta: CuentaPago;
  prov: ProveedorPagoOnline;
  creds: any;
}

export function cuentaDeForma(f: FormaPagoOnline): CuentaPago {
  const config = leerConfigCuenta(f.configJson);
  return { id: f.id, proveedor: String(f.proveedor).toUpperCase(), config, legado: config['_legado'] === '1' };
}

/** Todas las cuentas, en el orden de la tabla. */
export async function listarFormasPago(ds: DataSource): Promise<FormaPagoOnline[]> {
  return ds.getRepository(FormaPagoOnline).find({ order: { orden: 'ASC', id: 'ASC' } });
}

/** ¿La cuenta se ofrece para este tipo de pedido? (las de mesa nunca pagan online). */
export function formaPermiteTipo(f: FormaPagoOnline | null, tipo?: TipoPedidoPago | null): boolean {
  if (!tipo || !f) return true;
  if (tipo === 'PICKUP') return !!f.permitePickup;
  if (tipo === 'DELIVERY') return !!f.permiteDelivery;
  return false;
}

/** Resuelve las credenciales de una fila (null si el proveedor no existe o le faltan datos). */
export async function resolverForma(ds: DataSource, cfg: TiendaOnlineConfig | null, f: FormaPagoOnline): Promise<CuentaResuelta | null> {
  const prov = proveedorPorId(f.proveedor);
  if (!prov) return null;
  const cuenta = cuentaDeForma(f);
  const creds = await prov.credenciales(ds, cfg, cuenta);
  return creds ? { forma: f, cuenta, prov, creds } : null;
}

/** La cuenta de antes (sin filas): el proveedor elegido en la config. */
export async function resolverLegada(ds: DataSource, cfg: TiendaOnlineConfig | null, provId?: string | null): Promise<CuentaResuelta | null> {
  const prov = proveedorPorId(provId || cfg?.pagoProveedor || PROVEEDOR_UPAY);
  if (!prov) return null;
  const cuenta = cuentaLegada(cfg, prov.id);
  const creds = await prov.credenciales(ds, cfg, cuenta);
  return creds ? { forma: null, cuenta, prov, creds } : null;
}

/**
 * Las cuentas que se ofrecen a pedidos NUEVOS: activas, de un proveedor conocido, con sus datos
 * completos y que admiten el tipo de pedido. En el orden de la tabla.
 */
export async function cuentasListas(ds: DataSource, cfg: TiendaOnlineConfig | null, tipo?: TipoPedidoPago | null): Promise<CuentaResuelta[]> {
  const formas = await listarFormasPago(ds);
  if (!formas.length) {
    if (tipo === 'MESA_QR') return [];
    const l = await resolverLegada(ds, cfg);
    return l ? [l] : [];
  }
  const out: CuentaResuelta[] = [];
  for (const f of formas) {
    if (!f.activo || !formaPermiteTipo(f, tipo)) continue;
    const r = await resolverForma(ds, cfg, f);
    if (r) out.push(r);
  }
  return out;
}

/**
 * Con qué cuenta se consulta / devuelve un pedido ya creado: la suya (aunque después se haya
 * desactivado); si es de antes de las cuentas, la primera del mismo proveedor, o la de antes.
 */
export async function cuentaDelPedido(
  ds: DataSource, cfg: TiendaOnlineConfig | null, p: { formaPagoOnlineId?: number | null; pagoProveedor?: string | null; metodoPago?: string | null },
): Promise<CuentaResuelta | null> {
  const repo = ds.getRepository(FormaPagoOnline);
  const provId = String(p.pagoProveedor || p.metodoPago || PROVEEDOR_UPAY).toUpperCase();
  if (p.formaPagoOnlineId) {
    const f = await repo.findOne({ where: { id: p.formaPagoOnlineId } });
    return f ? resolverForma(ds, cfg, f) : null;
  }
  const mismas = (await listarFormasPago(ds)).filter((f) => String(f.proveedor).toUpperCase() === provId);
  for (const f of mismas) {
    const r = await resolverForma(ds, cfg, f);
    if (r) return r;
  }
  return mismas.length ? null : resolverLegada(ds, cfg, provId);
}

/**
 * Candidatas para verificar un aviso (webhook) del proveedor: la cuenta indicada en la URL, o todas
 * las de ese proveedor (la firma dice cuál es), o la de antes.
 */
export async function cuentasParaAviso(ds: DataSource, cfg: TiendaOnlineConfig | null, provId: string, formaId?: number | null): Promise<CuentaResuelta[]> {
  const formas = (await listarFormasPago(ds)).filter((f) => String(f.proveedor).toUpperCase() === provId && (!formaId || f.id === formaId));
  if (!formas.length) {
    if (formaId) return [];
    const l = await resolverLegada(ds, cfg, provId);
    return l ? [l] : [];
  }
  const out: CuentaResuelta[] = [];
  for (const f of formas) {
    const r = await resolverForma(ds, cfg, f);
    if (r) out.push(r);
  }
  return out;
}
