/**
 * Parser de etiquetas EAN-13 de balanza (comida por peso). Lógica PURA y
 * testeable. La balanza imprime una etiqueta con código de barras que codifica
 * el peso (o el precio) del producto pesado.
 *
 * Estructura EAN-13 de balanza:
 *   dígito 1      = prefijo (config, típicamente '2' = "producto por peso")
 *   dígitos 2-7   = código del producto (6 dígitos)
 *   dígitos 8-12  = valor embebido: peso (gramos) o precio (5 dígitos)
 *   dígito 13     = verificador
 *
 * IMPORTANTE: la balanza debe configurarse en modo PESO (no aplicar su propio
 * tope "buffet libre"), para que la etiqueta lleve el peso real. El tope/mínimo
 * los aplica FRC Gourmet en software.
 */

export interface BalanzaEan13Config {
  /** Prefijo que identifica una etiqueta de balanza. Default '2'. */
  prefijo?: string;
  /** Qué codifica el valor embebido. Default 'PESO'. */
  modo?: 'PESO' | 'PRECIO';
  /** gramos = valorEmbebido * factorPeso. Default 1 (el valor ya viene en gramos). */
  factorPeso?: number;
  /** precio = valorEmbebido * factorPrecio. Default 1. */
  factorPrecio?: number;
}

export interface BalanzaEan13Result {
  esEtiquetaBalanza: boolean;
  codigoProducto: string;
  valorEmbebido: number;
  pesoGramos?: number;
  precio?: number;
}

/** ¿El string es un EAN-13 de balanza con el prefijo configurado? */
export function esEtiquetaBalanza(code: string, config?: BalanzaEan13Config): boolean {
  const prefijo = config?.prefijo ?? '2';
  const s = (code || '').trim();
  return /^\d{13}$/.test(s) && s.startsWith(prefijo);
}

/**
 * Parsea una etiqueta de balanza. Devuelve null si no es un EAN-13 de balanza
 * válido (no 13 dígitos o prefijo distinto).
 */
export function parseEtiquetaBalanza(
  code: string,
  config?: BalanzaEan13Config,
): BalanzaEan13Result | null {
  if (!esEtiquetaBalanza(code, config)) return null;
  const s = code.trim();
  const modo = config?.modo ?? 'PESO';
  const factorPeso = config?.factorPeso ?? 1;
  const factorPrecio = config?.factorPrecio ?? 1;

  const codigoProducto = s.substring(1, 7);
  const valorEmbebido = parseInt(s.substring(7, 12), 10);

  const result: BalanzaEan13Result = {
    esEtiquetaBalanza: true,
    codigoProducto,
    valorEmbebido,
  };
  if (modo === 'PESO') {
    result.pesoGramos = valorEmbebido * factorPeso;
  } else {
    result.precio = valorEmbebido * factorPrecio;
  }
  return result;
}
