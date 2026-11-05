import { MonedaTienda, formatear } from '../../core/moneda-tienda';

const METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo', TARJETA_POS: 'Tarjeta (POS)', QR: 'QR', PIX: 'PIX',
  TRANSFERENCIA: 'Transferencia', UPAY: 'Tarjeta online', BANCARD: 'Bancard', PAGOPAR: 'Pagopar',
};

/** «Efectivo · pagás con US$ 20,00» / «QR al recibir» / «Tarjeta online». */
export function textoPagoCliente(
  p: { metodoPago?: string | null; pagoModalidad?: string | null; pagoMonedaId?: number | null; vueltoPara?: number | null; tipoPedido?: string },
  monedas: Pick<MonedaTienda, 'id' | 'simbolo' | 'decimales' | 'principal'>[],
): string | null {
  if (!p?.metodoPago) return null;
  const metodo = METODO[p.metodoPago] || p.metodoPago;
  if (p.metodoPago === 'UPAY' || !p.pagoModalidad) return metodo;
  const cuando = p.tipoPedido === 'PICKUP' ? 'al retirar' : 'al recibir';
  if (p.metodoPago !== 'EFECTIVO') return `${metodo} ${cuando}`;
  const moneda = p.pagoMonedaId != null ? monedas.find((m) => m.id === Number(p.pagoMonedaId)) : monedas.find((m) => m.principal);
  const partes = [`Efectivo ${cuando}`];
  if (moneda && !moneda.principal) partes.push(`en ${moneda.simbolo}`);
  if (p.vueltoPara != null && moneda) partes.push(`pagás con ${formatear(Number(p.vueltoPara), moneda)}`);
  else if (p.vueltoPara == null) partes.push('sin vuelto');
  return partes.join(' · ');
}

/** Sabores, personalización, adicionales, preferencias y nota de una línea, en una frase. */
export function detallePersonalizacion(ps: any): string {
  if (!ps) return '';
  const parts: string[] = [];
  const sabores: any[] = Array.isArray(ps.sabores) ? ps.sabores : [];
  if (sabores.length > 1) parts.push(sabores.map((s) => s.nombre).join(' / '));
  for (const s of sabores) {
    const x = s?.personalizacion;
    if (!x) continue;
    const det = [
      ...(x.quitados || []).map((q: any) => `sin ${String(q.nombre || '').toLowerCase()}`),
      ...(x.cambios || []).map((c: any) => `${c.nombre} → ${c.reemplazoNombre}`),
      ...(x.adicionales || []).map((a: any) => `+ ${a.nombre}`),
    ];
    if (det.length) parts.push(sabores.length > 1 ? `${s.nombre}: ${det.join(', ')}` : det.join(', '));
  }
  for (const a of ps.adicionales || []) parts.push(`+ ${a.nombre}`);
  for (const o of ps.observaciones || []) parts.push(typeof o === 'string' ? o : o?.descripcion);
  if (ps.notaLibre) parts.push(`"${ps.notaLibre}"`);
  return parts.filter(Boolean).join(' · ');
}
