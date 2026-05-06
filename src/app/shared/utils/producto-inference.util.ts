export interface InferenciaPresentacion {
  unidadBase: 'UNIDAD' | 'KG' | 'GRAMO' | 'LITRO' | 'MILILITRO';
  cantidadPresentacion: number;
  nombrePresentacion: string;
  nombreProductoSugerido: string;
  posibleGtin: string | null;
  cantidadPaquete: number;
  esPack: boolean;
}

export interface ContenidoUnitarioOcr {
  valor: number;
  unidad: 'UN' | 'ML' | 'L' | 'CC' | 'G' | 'KG' | 'GR';
}

export interface PresentacionInferidaOcr {
  tipo: 'UNITARIA' | 'PACK';
  cantidadPaquete: number;
  contenidoUnitario: ContenidoUnitarioOcr | null;
  nombreProductoLimpio: string;
  nombrePresentacion: string;
}

function unidadOcrAUnidadBase(u: string): InferenciaPresentacion['unidadBase'] | null {
  const x = (u || '').toUpperCase();
  if (['ML', 'CC', 'MILILITRO', 'MILILITROS'].includes(x)) return 'MILILITRO';
  if (['L', 'LT', 'LITRO', 'LITROS'].includes(x)) return 'LITRO';
  if (['KG', 'KILO', 'KILOS', 'KILOGRAMO', 'KILOGRAMOS'].includes(x)) return 'KG';
  if (['G', 'GR', 'GRAMO', 'GRAMOS'].includes(x)) return 'GRAMO';
  if (['UN', 'UND', 'UNI', 'UNID', 'UNIDAD', 'UNIDADES'].includes(x)) return 'UNIDAD';
  return null;
}

function nombreVolumetrico(unidadBase: InferenciaPresentacion['unidadBase'], num: number): string {
  if (unidadBase === 'MILILITRO') return `${num} ML`;
  if (unidadBase === 'LITRO') return `${num} L`;
  if (unidadBase === 'KG') return `${num} KG`;
  if (unidadBase === 'GRAMO') return `${num} G`;
  return 'UNIDAD';
}

function limpiarNombreProducto(desc: string): string {
  let s = (desc || '').toUpperCase();
  s = s.replace(/(\d+)\s*[Xx]\s*(\d+(?:[.,]\d+)?\s*(?:ML|MILILITROS?|L|LT|LITROS?|KG|KILOS?|KILOGRAMOS?|G|GR|GRAMOS?|CC))/g, '$2');
  s = s.replace(/\s*\((\d+)\s*U?\)\s*/g, ' ');
  s = s.replace(/\b(?:CAJA|PACK|DISPLAY|BLISTER|FARDO|BOLSA)\s*[Xx]\s*\d+/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Mirror del inferirPresentacion del lado Electron. Mantener sincronizado.
 * Default fuerte: UNIDAD. Pack notation → cantidadPresentacion = cantidadPaquete (units en caja).
 */
export function inferirPresentacion(
  descripcion: string,
  codigoProveedor?: string | null,
  presentacionInferida?: PresentacionInferidaOcr | null,
  unidadMedidaOcr?: string | null,
): InferenciaPresentacion {
  const desc = (descripcion || '').toUpperCase();
  const result: InferenciaPresentacion = {
    unidadBase: 'UNIDAD',
    cantidadPresentacion: 1,
    nombrePresentacion: 'UNIDAD',
    nombreProductoSugerido: desc,
    posibleGtin: null,
    cantidadPaquete: 1,
    esPack: false,
  };

  if (codigoProveedor && /^\d{8,14}$/.test(codigoProveedor.trim())) {
    result.posibleGtin = codigoProveedor.trim();
  }

  let umExplicita: InferenciaPresentacion['unidadBase'] | null = null;
  if (unidadMedidaOcr) umExplicita = unidadOcrAUnidadBase(unidadMedidaOcr);

  if (presentacionInferida) {
    const cantPaq = Math.max(1, Math.round(Number(presentacionInferida.cantidadPaquete) || 1));
    const esPack = presentacionInferida.tipo === 'PACK' && cantPaq > 1;
    result.unidadBase = umExplicita || 'UNIDAD';
    result.cantidadPaquete = cantPaq;
    result.esPack = esPack;
    if (esPack) {
      result.cantidadPresentacion = cantPaq;
      result.nombrePresentacion = (presentacionInferida.nombrePresentacion || `CAJA X${cantPaq}`).toUpperCase();
    } else {
      const cont = presentacionInferida.contenidoUnitario;
      if (cont && result.unidadBase !== 'UNIDAD') {
        const ubCont = unidadOcrAUnidadBase(cont.unidad) || 'UNIDAD';
        if (ubCont !== 'UNIDAD' && ubCont === result.unidadBase) {
          result.cantidadPresentacion = cont.valor;
          result.nombrePresentacion = nombreVolumetrico(result.unidadBase, cont.valor);
        } else {
          result.cantidadPresentacion = 1;
          result.nombrePresentacion = 'UNIDAD';
        }
      } else {
        result.cantidadPresentacion = 1;
        result.nombrePresentacion = (presentacionInferida.nombrePresentacion || 'UNIDAD').toUpperCase();
      }
    }
    result.nombreProductoSugerido = (presentacionInferida.nombreProductoLimpio || limpiarNombreProducto(desc)).toUpperCase();
    return result;
  }

  result.unidadBase = umExplicita || 'UNIDAD';
  result.nombreProductoSugerido = limpiarNombreProducto(desc);

  const rePackInner = /(\d+)\s*[Xx]\s*(\d+(?:[.,]\d+)?)\s*(ML|MILILITROS?|L|LT|LITROS?|KG|KILOS?|KILOGRAMOS?|G|GR|GRAMOS?|CC)\b/;
  const rePackParen = /\((\d+)\s*U?\)/;
  const rePackPrefijo = /\b(?:CAJA|PACK|DISPLAY|BLISTER|FARDO|BOLSA)\s*[Xx]\s*(\d+)\b/;

  let cantPaqDetectada: number | null = null;
  const m1 = desc.match(rePackInner);
  if (m1) {
    const n = parseInt(m1[1], 10);
    if (Number.isFinite(n) && n > 1) cantPaqDetectada = n;
  }
  if (cantPaqDetectada == null) {
    const m2 = desc.match(rePackParen);
    if (m2) {
      const n = parseInt(m2[1], 10);
      if (Number.isFinite(n) && n > 1) cantPaqDetectada = n;
    }
  }
  if (cantPaqDetectada == null) {
    const m3 = desc.match(rePackPrefijo);
    if (m3) {
      const n = parseInt(m3[1], 10);
      if (Number.isFinite(n) && n > 1) cantPaqDetectada = n;
    }
  }

  if (cantPaqDetectada != null) {
    result.cantidadPaquete = cantPaqDetectada;
    result.esPack = true;
    result.cantidadPresentacion = cantPaqDetectada;
    result.nombrePresentacion = `CAJA X${cantPaqDetectada}`;
    return result;
  }

  if (umExplicita && umExplicita !== 'UNIDAD') {
    const re = /(\d+(?:[.,]\d+)?)\s*(ML|MILILITROS?|L|LT|LITROS?|KG|KILOS?|KILOGRAMOS?|G|GR|GRAMOS?|CC)\b/;
    const m = desc.match(re);
    if (m) {
      const num = parseFloat(m[1].replace(',', '.'));
      const ub = unidadOcrAUnidadBase(m[2]);
      if (ub && ub === umExplicita) {
        result.cantidadPresentacion = num;
        result.nombrePresentacion = nombreVolumetrico(umExplicita, num);
        return result;
      }
    }
  }

  result.cantidadPresentacion = 1;
  result.nombrePresentacion = 'UNIDAD';
  return result;
}
