/**
 * Resuelve la banderita de una moneda para `<img src>`:
 *   1) flagIconBase64 (data URI, offline-safe) si existe,
 *   2) flagIcon (URL guardada) si existe,
 *   3) fallback a flagcdn.com a partir del countryCode (igual criterio que el
 *      PdV / edición de moneda). Requiere internet, pero cubre el caso en que
 *      la moneda solo tiene el código de país cargado.
 * Devuelve '' si no hay forma de resolverla.
 */
export function flagFor(m: any): string {
  if (!m) return '';
  if (m.flagIconBase64) return m.flagIconBase64;
  if (m.flagIcon) return m.flagIcon;
  const cc = (m.countryCode || '').trim().toLowerCase();
  return cc.length === 2 ? `https://flagcdn.com/w40/${cc}.png` : '';
}
