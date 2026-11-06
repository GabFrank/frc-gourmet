/**
 * Teléfono de CONTACTO del cliente de la tienda (checkout, «Mi cuenta»). Sin verificar: el local
 * lo usa para llamarlo o escribirle por WhatsApp por su pedido. Nunca sirve para ingresar.
 *
 * Se guarda solo con dígitos. Se acepta el formato local («0981 123 456») o con código de país
 * («+595 981 123 456»): entre 8 y 15 dígitos.
 */
export function normalizarTelefonoContacto(raw: any): { ok: true; telefono: string } | { ok: false; error: 'telefono_invalido' } {
  const t = String(raw ?? '').replace(/\D+/g, '');
  if (t.length < 8 || t.length > 15) return { ok: false, error: 'telefono_invalido' };
  return { ok: true, telefono: t };
}
