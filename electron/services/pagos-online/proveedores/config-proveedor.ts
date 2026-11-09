/**
 * Datos de configuración de los proveedores que declaran `campos` (todos menos uPay).
 *
 * Desde PLAN-tienda-pagos-multi-icpay cada CUENTA (`formas_pago_online`) tiene los suyos:
 * - No secretos: `formas_pago_online.config_json` → `{ "baseUrl": "…", "email": "…" }`.
 * - Secretos: almacén seguro por cuenta (`tienda-pago-<prov>-<id>-<clave>`).
 * Sin cuenta (instalación sin filas, o la cuenta que convirtió la migración, `_legado`) se leen los
 * de antes: `tienda_online_config.pago_config_json` y `tienda-pago-<prov>-<clave>`.
 * Los tests inyectan secretos con `setPagosOnlineDeps({ secretos })`: `PROV#<id>.clave` o `PROV.clave`.
 */
import { TiendaOnlineConfig } from '../../../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { deps } from './deps';
import { CampoProveedor, CuentaPago, ProveedorPagoOnline } from './tipos';

export function leerPagoConfigJson(cfg: { pagoConfigJson?: string | null } | null | undefined): Record<string, Record<string, string>> {
  if (!cfg?.pagoConfigJson) return {};
  try {
    const o = JSON.parse(cfg.pagoConfigJson);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/** JSON de una cuenta (`config_json`) → objeto plano de strings. */
export function leerConfigCuenta(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    const o = JSON.parse(json);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) if (v != null) out[k] = String(v);
    return out;
  } catch {
    return {};
  }
}

/** La «cuenta» de una instalación sin filas en `formas_pago_online` (lo de antes). */
export function cuentaLegada(cfg: TiendaOnlineConfig | null, provId: string): CuentaPago {
  return { id: null, proveedor: provId, config: leerPagoConfigJson(cfg)[provId] || {}, legado: true };
}

/** Valores no secretos de una cuenta, con los defaults de sus campos. */
export function valoresProveedor(cfg: TiendaOnlineConfig | null, prov: ProveedorPagoOnline, cuenta?: CuentaPago | null): Record<string, string> {
  const guardado = (cuenta ?? cuentaLegada(cfg, prov.id)).config || {};
  const out: Record<string, string> = {};
  for (const c of prov.campos) {
    if (c.secreto) continue;
    const v = guardado[c.clave];
    out[c.clave] = v != null && String(v) !== '' ? String(v) : (c.porDefecto ?? '');
  }
  return out;
}

export async function secretoProveedor(provId: string, clave: string, cuenta?: CuentaPago | null): Promise<string> {
  const propia = cuenta?.id && !cuenta.legado ? cuenta.id : null;
  // Tests: una cuenta propia solo ve los suyos (`PROV#id.clave`), nunca los de otra.
  const inyectado = propia ? deps.secretos[`${provId}#${propia}.${clave}`] : deps.secretos[`${provId}.${clave}`];
  if (inyectado) return inyectado();
  if (Object.keys(deps.secretos).length) return '';
  const { getSecretoPago } = await import('../../../utils/tienda-secrets.util');
  return getSecretoPago(provId, clave, propia);
}

/**
 * Todos los valores (no secretos + secretos) de una cuenta, o null si falta uno requerido. Es la
 * base del `credenciales()` de los proveedores con campos.
 */
export async function valoresCompletos(cfg: TiendaOnlineConfig | null, prov: ProveedorPagoOnline, cuenta?: CuentaPago | null): Promise<Record<string, string> | null> {
  const v = valoresProveedor(cfg, prov, cuenta);
  for (const c of prov.campos) {
    if (c.secreto) v[c.clave] = await secretoProveedor(prov.id, c.clave, cuenta);
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
