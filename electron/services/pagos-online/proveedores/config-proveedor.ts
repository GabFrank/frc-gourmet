/**
 * Datos de configuración de los proveedores que declaran `campos` (todos menos uPay).
 * - No secretos: `tienda_online_config.pago_config_json` → `{ "BANCARD": { "publicKey": "…" } }`.
 * - Secretos: almacén seguro (o los inyectados en tests con `setPagosOnlineDeps({ secretos })`).
 */
import { TiendaOnlineConfig } from '../../../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { deps } from './deps';
import { CampoProveedor, ProveedorPagoOnline } from './tipos';

export function leerPagoConfigJson(cfg: { pagoConfigJson?: string | null } | null | undefined): Record<string, Record<string, string>> {
  if (!cfg?.pagoConfigJson) return {};
  try {
    const o = JSON.parse(cfg.pagoConfigJson);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** Valores no secretos de un proveedor, con los defaults de sus campos. */
export function valoresProveedor(cfg: TiendaOnlineConfig | null, prov: ProveedorPagoOnline): Record<string, string> {
  const guardado = leerPagoConfigJson(cfg)[prov.id] || {};
  const out: Record<string, string> = {};
  for (const c of prov.campos) {
    if (c.secreto) continue;
    const v = guardado[c.clave];
    out[c.clave] = v != null && String(v) !== '' ? String(v) : (c.porDefecto ?? '');
  }
  return out;
}

export async function secretoProveedor(provId: string, clave: string): Promise<string> {
  const inyectado = deps.secretos[`${provId}.${clave}`];
  if (inyectado) return inyectado();
  const { getSecretoPago } = await import('../../../utils/tienda-secrets.util');
  return getSecretoPago(provId, clave);
}

/**
 * Todos los valores (no secretos + secretos) o null si falta uno requerido. Es la base del
 * `credenciales()` de los proveedores con campos.
 */
export async function valoresCompletos(cfg: TiendaOnlineConfig | null, prov: ProveedorPagoOnline): Promise<Record<string, string> | null> {
  const v = valoresProveedor(cfg, prov);
  for (const c of prov.campos) {
    if (c.secreto) v[c.clave] = await secretoProveedor(prov.id, c.clave);
    if (c.requerido && !v[c.clave]) return null;
  }
  return v;
}

/** Valida un valor contra su campo. Devuelve el código de error o null. */
export function validarCampo(prov: ProveedorPagoOnline, c: CampoProveedor, valor: string): string | null {
  if (!valor) return null;
  if (c.maxLength && valor.length > c.maxLength) return `${prov.id.toLowerCase()}_${c.clave.toLowerCase()}_invalido`;
  if (c.opciones && !c.opciones.some((o) => o.valor === valor)) return `${prov.id.toLowerCase()}_${c.clave.toLowerCase()}_invalido`;
  if (c.patron && !new RegExp(`^(?:${c.patron})$`).test(valor)) return `${prov.id.toLowerCase()}_${c.clave.toLowerCase()}_invalido`;
  return null;
}
