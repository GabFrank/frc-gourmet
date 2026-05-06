export interface InferenciaPresentacion {
  unidadBase: 'UNIDAD' | 'KG' | 'GRAMO' | 'LITRO' | 'MILILITRO';
  cantidadPresentacion: number;
  nombrePresentacion: string;
  posibleGtin: string | null;
}

/**
 * Heurística para inferir presentación desde la descripción OCR de un item.
 * Busca patrones como "750 ML", "1.5 LT", "500G", "2 KG" y normaliza a unidad base.
 * Mirror de la version del lado Electron (electron/utils/factura-import.utils.ts).
 */
export function inferirPresentacion(descripcion: string, codigoProveedor?: string | null): InferenciaPresentacion {
  const desc = (descripcion || '').toUpperCase();
  const result: InferenciaPresentacion = {
    unidadBase: 'UNIDAD',
    cantidadPresentacion: 1,
    nombrePresentacion: 'UNIDAD',
    posibleGtin: null,
  };

  if (codigoProveedor && /^\d{8,14}$/.test(codigoProveedor.trim())) {
    result.posibleGtin = codigoProveedor.trim();
  }

  const re = /(\d+(?:[.,]\d+)?)\s*(ML|MILILITROS?|L|LT|LITROS?|KG|KILOS?|KILOGRAMOS?|G|GR|GRAMOS?|CC|UN|UND|UNID|UNIDAD)\b/i;
  const m = desc.match(re);
  if (m) {
    const num = parseFloat(m[1].replace(',', '.'));
    const u = m[2].toUpperCase();
    if (['ML', 'CC', 'MILILITRO', 'MILILITROS'].includes(u)) {
      result.unidadBase = 'MILILITRO';
      result.cantidadPresentacion = num;
      result.nombrePresentacion = `${num} ML`;
    } else if (['L', 'LT', 'LITRO', 'LITROS'].includes(u)) {
      result.unidadBase = 'LITRO';
      result.cantidadPresentacion = num;
      result.nombrePresentacion = `${num} L`;
    } else if (['KG', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS'].includes(u)) {
      result.unidadBase = 'KG';
      result.cantidadPresentacion = num;
      result.nombrePresentacion = `${num} KG`;
    } else if (['G', 'GR', 'GRAMO', 'GRAMOS'].includes(u)) {
      result.unidadBase = 'GRAMO';
      result.cantidadPresentacion = num;
      result.nombrePresentacion = `${num} G`;
    }
  }

  return result;
}
