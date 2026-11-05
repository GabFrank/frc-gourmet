/**
 * F9: compartir un pedido (por WhatsApp o el menú de compartir del teléfono) y los enlaces para
 * comunicarse con el local. Funciones puras: se prueban sin navegador.
 */

export interface PedidoCompartible {
  numero: string;
  tipoPedido: string;
  total: number;
  items: { cantidad: number; nombreProducto: string; nombrePresentacion?: string | null }[];
}

function guaranies(v: number): string {
  return `₲ ${new Intl.NumberFormat('es-PY').format(Math.round(Number(v) || 0))}`;
}

const TIPO: Record<string, string> = { PICKUP: 'para retirar', DELIVERY: 'delivery', MESA_QR: 'en la mesa' };

/**
 * Texto para mandarle a alguien («esto pedí»). Sin dirección ni teléfono: el que lo recibe no
 * tiene por qué verlos, y el enlace del pedido sólo lo abre su dueño.
 */
export function textoCompartirPedido(p: PedidoCompartible, opts: { comercio?: string | null; estado?: string | null; url?: string | null } = {}): string {
  const lineas: string[] = [];
  const donde = opts.comercio ? ` en ${opts.comercio}` : '';
  lineas.push(`Pedido ${p.numero}${donde} (${TIPO[p.tipoPedido] || p.tipoPedido})`);
  if (opts.estado) lineas.push(`Estado: ${opts.estado}`);
  lineas.push('');
  const max = 15;
  for (const it of (p.items || []).slice(0, max)) {
    const pres = it.nombrePresentacion && it.nombrePresentacion !== 'Estándar' ? ` (${it.nombrePresentacion})` : '';
    lineas.push(`• ${Number(it.cantidad) || 1}× ${it.nombreProducto}${pres}`);
  }
  if ((p.items || []).length > max) lineas.push(`• y ${(p.items || []).length - max} más`);
  lineas.push('');
  lineas.push(`Total: ${guaranies(p.total)}`);
  if (opts.url) lineas.push(opts.url);
  return lineas.join('\n');
}

/** Número para wa.me: sólo dígitos, con el 595 de Paraguay si viene en formato local (09…). */
export function numeroWa(telefono: string | null | undefined): string | null {
  const d = String(telefono || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('595')) return d.length >= 11 ? d : null;
  if (d.startsWith('0') && d.length >= 9) return '595' + d.slice(1);
  if (d.startsWith('9') && d.length === 9) return '595' + d;
  return d.length >= 8 ? d : null;
}

/** Enlace de WhatsApp con el texto; sin número abre el selector de contactos. */
export function urlWhatsapp(texto: string, telefono?: string | null): string {
  const n = telefono ? numeroWa(telefono) : null;
  return `https://wa.me/${n || ''}?text=${encodeURIComponent(texto)}`;
}

/** Enlace tel: (sólo dígitos y +). */
export function urlTelefono(telefono: string | null | undefined): string | null {
  const t = String(telefono || '').replace(/[^\d+]/g, '');
  return t.replace(/\D/g, '').length >= 6 ? `tel:${t}` : null;
}
