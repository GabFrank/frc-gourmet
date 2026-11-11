/**
 * Teléfonos de la tienda en el servidor.
 *
 * Desde 2026-11 el storefront manda siempre el número internacional (595981123456): el cliente
 * elige el país y escribe el número. Igual se acepta el formato local de Paraguay («0981 123 456»,
 * «981 123 456»), que se completa con 595, porque clientes viejos o llamadas directas lo pueden
 * mandar, y las cuentas creadas antes se guardaron así.
 */

/** Solo dígitos, en formato internacional. Un número local de Paraguay se completa con 595. */
export function telefonoInternacional(raw: any): string {
  const d = String(raw ?? '').replace(/\D+/g, '').replace(/^00/, '');
  if (/^0\d{8,9}$/.test(d)) return '595' + d.slice(1);
  if (/^9[6-9]\d{7}$/.test(d)) return '595' + d;
  return d;
}

/**
 * Las formas en que puede estar guardado un número en una cuenta: el internacional y, para
 * Paraguay, el local con 0 con que se guardaban antes. Para buscar sin duplicar cuentas.
 */
export function variantesTelefono(internacional: string): string[] {
  const v = [internacional];
  const m = /^595(\d{8,9})$/.exec(internacional);
  if (m) v.push('0' + m[1], m[1]);
  return v;
}

/**
 * Teléfono de CONTACTO del cliente de la tienda (checkout, «Mi cuenta»). Sin verificar: el local
 * lo usa para llamarlo o escribirle por WhatsApp por su pedido. Nunca sirve para ingresar.
 *
 * Se guarda internacional, solo dígitos: entre 8 y 15.
 */
export function normalizarTelefonoContacto(raw: any): { ok: true; telefono: string } | { ok: false; error: 'telefono_invalido' } {
  const t = telefonoInternacional(raw);
  if (t.length < 8 || t.length > 15) return { ok: false, error: 'telefono_invalido' };
  return { ok: true, telefono: t };
}
