/**
 * Teléfonos de la tienda: país + número, validados mientras se escriben.
 *
 * El número se guarda siempre en formato internacional, solo dígitos y sin «+»
 * (595981123456): es lo que pide WhatsApp y lo que el servidor usa para identificar la cuenta.
 * El cliente lo escribe como lo conoce: «0981 123 456» o «981 123 456» dan lo mismo, porque el 0
 * de larga distancia nacional se descarta.
 *
 * No pretende cubrir todo el plan de numeración del mundo: valida bien los países de la región y
 * los que más llegan, y para el resto ofrece «Otro país», que solo controla el largo.
 */

export interface PaisTelefono {
  iso: string;
  nombre: string;
  bandera: string;
  codigo: string;
  /** Largos válidos del número nacional, sin el 0 ni el código de país. */
  largos: number[];
  /** Si el número nacional tiene que empezar así (sin el 0). */
  inicio?: RegExp;
  /** Celular (lo que sirve para WhatsApp). Sin esto, cualquier número válido cuenta como celular. */
  movil?: RegExp;
  /** Agrupación para mostrarlo, sobre el número nacional: [3, 3, 3] → «981 123 456». */
  grupos: number[];
  ejemplo: string;
}

export const PAISES_TELEFONO: PaisTelefono[] = [
  { iso: 'PY', nombre: 'Paraguay', bandera: '🇵🇾', codigo: '595', largos: [8, 9], inicio: /^[2-9]/, movil: /^9[6-9]\d{7}$/, grupos: [3, 3, 3], ejemplo: '0981 123 456' },
  { iso: 'AR', nombre: 'Argentina', bandera: '🇦🇷', codigo: '54', largos: [10, 11], movil: /^9?\d{10}$/, grupos: [2, 4, 4], ejemplo: '11 2345 6789' },
  { iso: 'BR', nombre: 'Brasil', bandera: '🇧🇷', codigo: '55', largos: [10, 11], inicio: /^[1-9][1-9]/, movil: /^[1-9][1-9]9\d{8}$/, grupos: [2, 5, 4], ejemplo: '11 91234 5678' },
  { iso: 'UY', nombre: 'Uruguay', bandera: '🇺🇾', codigo: '598', largos: [8], inicio: /^[249]/, movil: /^9\d{7}$/, grupos: [2, 3, 3], ejemplo: '094 123 456' },
  { iso: 'BO', nombre: 'Bolivia', bandera: '🇧🇴', codigo: '591', largos: [8], inicio: /^[2-7]/, movil: /^[67]\d{7}$/, grupos: [4, 4], ejemplo: '7123 4567' },
  { iso: 'CL', nombre: 'Chile', bandera: '🇨🇱', codigo: '56', largos: [9], inicio: /^[2-9]/, movil: /^9\d{8}$/, grupos: [1, 4, 4], ejemplo: '9 1234 5678' },
  { iso: 'PE', nombre: 'Perú', bandera: '🇵🇪', codigo: '51', largos: [8, 9], movil: /^9\d{8}$/, grupos: [3, 3, 3], ejemplo: '912 345 678' },
  { iso: 'CO', nombre: 'Colombia', bandera: '🇨🇴', codigo: '57', largos: [10], movil: /^3\d{9}$/, grupos: [3, 3, 4], ejemplo: '321 123 4567' },
  { iso: 'MX', nombre: 'México', bandera: '🇲🇽', codigo: '52', largos: [10], grupos: [2, 4, 4], ejemplo: '55 1234 5678' },
  { iso: 'US', nombre: 'Estados Unidos', bandera: '🇺🇸', codigo: '1', largos: [10], inicio: /^[2-9]/, grupos: [3, 3, 4], ejemplo: '201 555 0123' },
  { iso: 'ES', nombre: 'España', bandera: '🇪🇸', codigo: '34', largos: [9], inicio: /^[6-9]/, movil: /^[67]\d{8}$/, grupos: [3, 3, 3], ejemplo: '612 345 678' },
  { iso: 'IT', nombre: 'Italia', bandera: '🇮🇹', codigo: '39', largos: [9, 10, 11], grupos: [3, 3, 4], ejemplo: '312 345 6789' },
  { iso: 'DE', nombre: 'Alemania', bandera: '🇩🇪', codigo: '49', largos: [10, 11], grupos: [3, 4, 4], ejemplo: '151 2345 6789' },
  { iso: 'XX', nombre: 'Otro país', bandera: '🌐', codigo: '', largos: [], grupos: [], ejemplo: '+44 7400 123456' },
];

export const PAIS_POR_DEFECTO = PAISES_TELEFONO[0];

export type EstadoTelefono = 'vacio' | 'incompleto' | 'valido' | 'invalido';

export interface AnalisisTelefono {
  estado: EstadoTelefono;
  /** Internacional, solo dígitos. Vacío salvo que el estado sea «valido». */
  e164: string;
  /** Para mostrar: «+595 981 123 456». */
  legible: string;
  /** Qué decirle al cliente; vacío si no hace falta. */
  mensaje: string;
}

const agrupar = (d: string, grupos: number[]): string => {
  if (!grupos.length) return d;
  const partes: string[] = [];
  let i = 0;
  for (const g of grupos) {
    if (i >= d.length) break;
    partes.push(d.slice(i, i + g));
    i += g;
  }
  if (i < d.length) partes.push(d.slice(i));
  return partes.join(' ');
};

/** El número nacional, sin el código de país si lo pegaron y sin el 0 de larga distancia. */
function nacional(pais: PaisTelefono, texto: string): string {
  let d = String(texto || '').replace(/\D+/g, '');
  // Pegaron el número completo con el código de país: «+595 981…» o «595981…».
  if (pais.codigo && (/^\s*\+/.test(texto) || /^00/.test(d))) {
    d = d.replace(/^00/, '');
    if (d.startsWith(pais.codigo)) d = d.slice(pais.codigo.length);
  } else if (pais.codigo && d.startsWith(pais.codigo) && d.length > Math.max(...pais.largos)) {
    d = d.slice(pais.codigo.length);
  }
  return d.replace(/^0+/, '');
}

/**
 * Analiza lo que el cliente escribió para ese país. `soloMovil`: tiene que ser un celular
 * (el ingreso por código de WhatsApp).
 */
export function analizarTelefono(pais: PaisTelefono, texto: string, opts: { soloMovil?: boolean } = {}): AnalisisTelefono {
  const crudo = String(texto || '');
  if (!crudo.replace(/\D+/g, '')) return { estado: 'vacio', e164: '', legible: '', mensaje: '' };

  // Otro país: tiene que venir con su código; solo se controla el largo internacional.
  if (!pais.codigo) {
    const sinCeros = crudo.replace(/\D+/g, '');
    // Un 0 adelante (que no sea el 00 internacional) es un número local: le falta el código.
    if (/^0(?!0)/.test(sinCeros)) return { estado: 'invalido', e164: '', legible: '', mensaje: 'Empezá por el código de país, por ejemplo +44.' };
    const d = sinCeros.replace(/^00/, '');
    if (d.length < 8) return { estado: 'incompleto', e164: '', legible: '', mensaje: 'Escribí el número completo con el código de país.' };
    if (d.length > 15) return { estado: 'invalido', e164: '', legible: '', mensaje: 'Tiene demasiados dígitos.' };
    return { estado: 'valido', e164: d, legible: '+' + d, mensaje: '' };
  }

  const n = nacional(pais, crudo);
  const min = Math.min(...pais.largos);
  const max = Math.max(...pais.largos);
  const legible = `+${pais.codigo} ${agrupar(n, pais.grupos)}`.trim();
  if (pais.inicio && n.length >= 1 && !pais.inicio.test(n)) {
    return { estado: 'invalido', e164: '', legible, mensaje: `Un número de ${pais.nombre} no empieza así.` };
  }
  if (opts.soloMovil && pais.movil && n.length >= 2) {
    // Antes de completarlo ya se puede saber si va camino a ser celular: se compara el prefijo.
    const relleno = n.length >= max ? n : n + '0'.repeat(max - n.length);
    if (!pais.movil.test(relleno) && !(n.length >= min && pais.movil.test(n))) {
      return { estado: 'invalido', e164: '', legible, mensaje: 'Tiene que ser un celular con WhatsApp.' };
    }
  }
  if (n.length < min) return { estado: 'incompleto', e164: '', legible, mensaje: `Faltan ${min - n.length} dígito${min - n.length === 1 ? '' : 's'}.` };
  if (n.length > max) return { estado: 'invalido', e164: '', legible, mensaje: 'Tiene demasiados dígitos.' };
  if (!pais.largos.includes(n.length)) return { estado: 'incompleto', e164: '', legible, mensaje: 'Falta un dígito.' };
  if (opts.soloMovil && pais.movil && !pais.movil.test(n)) {
    if (n.length < max) return { estado: 'incompleto', e164: '', legible, mensaje: `Faltan ${max - n.length} dígito${max - n.length === 1 ? '' : 's'}.` };
    return { estado: 'invalido', e164: '', legible, mensaje: 'Tiene que ser un celular con WhatsApp.' };
  }
  return { estado: 'valido', e164: pais.codigo + n, legible, mensaje: '' };
}

/**
 * De un número guardado (internacional o, en cuentas viejas, local de Paraguay) al país y el
 * número nacional para precargar el campo.
 */
export function separarTelefono(guardado: string | null | undefined): { pais: PaisTelefono; numero: string } {
  const d = String(guardado || '').replace(/\D+/g, '');
  if (!d) return { pais: PAIS_POR_DEFECTO, numero: '' };
  // Local de Paraguay (cuentas creadas antes de guardar con código de país).
  if (/^0\d{8,9}$/.test(d) || /^9\d{8}$/.test(d)) return { pais: PAIS_POR_DEFECTO, numero: d.replace(/^0+/, '') };
  // El código más largo primero: 595 antes que 59x, 54 antes que 5…
  const candidatos = PAISES_TELEFONO.filter((p) => p.codigo).sort((a, b) => b.codigo.length - a.codigo.length);
  for (const p of candidatos) {
    if (!d.startsWith(p.codigo)) continue;
    const resto = d.slice(p.codigo.length);
    if (p.largos.includes(resto.length)) return { pais: p, numero: resto };
  }
  return { pais: PAISES_TELEFONO[PAISES_TELEFONO.length - 1], numero: '+' + d };
}

/** «595981123456» → «+595 981 123 456», para mostrar un número guardado. */
export function telefonoLegible(guardado: string | null | undefined): string {
  if (!guardado) return '';
  const { pais, numero } = separarTelefono(guardado);
  if (!pais.codigo) return numero;
  return `+${pais.codigo} ${agrupar(numero, pais.grupos)}`;
}

/** Análisis de un número ya guardado, para saber si es válido antes de que el cliente lo toque. */
export function analizarGuardado(guardado: string | null | undefined, opts: { soloMovil?: boolean } = {}): AnalisisTelefono {
  const { pais, numero } = separarTelefono(guardado);
  return analizarTelefono(pais, numero, opts);
}
