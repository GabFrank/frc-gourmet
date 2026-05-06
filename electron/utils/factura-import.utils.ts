import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getFacturaImportsDir } from './ia-config.utils';

/**
 * Prompt BASE (semilla inmutable). Se persiste en BD al primer arranque y se versiona.
 * Cualquier mejora estable al sistema va aca; mejoras del usuario se almacenan como
 * "adiciones" sumadas en runtime via buildEffectivePrompt().
 */
export const FACTURA_PROMPT_BASE = `Sos un asistente que ayuda a un comercio gastronomico a digitalizar
sus comprobantes de compra propios (facturas y notas de proveedores) para cargarlos al sistema
de gestion del negocio. La imagen es un comprobante de compra: el comercio asistido COMPRA
mercaderia o servicios, y otra empresa los VENDE.

REGLA CRITICA — IDENTIFICACION DEL PROVEEDOR:
En toda factura legal paraguaya (y en general en cualquier comprobante comercial) hay DOS partes:

  1) EMISOR / VENDEDOR / REMITENTE: la empresa que EMITE la factura, vende y cobra. Sus datos
     suelen estar en la parte SUPERIOR del comprobante: razon social, RUC, direccion, telefono,
     timbrado, numero de factura. Es la persona/empresa que firma o sella el documento.
  2) RECEPTOR / CLIENTE / COMPRADOR / DESTINATARIO: la empresa que RECIBE la factura y paga.
     Sus datos suelen estar bajo etiquetas como "Cliente:", "Senores:", "Razon social:",
     "Facturado a:", "Nombre o Razon Social del Cliente:", "Destinatario:", o en una caja
     intermedia separada del encabezado.

El campo "proveedor" del JSON DEBE corresponder al EMISOR / VENDEDOR / REMITENTE, NUNCA al
cliente/receptor. No importa si el receptor es el comercio que estas asistiendo o cualquier
otra empresa: ignoralo a la hora de armar "proveedor". Si tenes dudas, mira quien tiene el
timbrado, el numero de factura y el sello/firma — ese es el emisor.

REGLA — UNIDAD DE MEDIDA POR ITEM:
Si la factura tiene una columna explicita de unidad de medida (etiquetas: "U.M.", "UM",
"Unidad Medida", "Unidad", "Med", "UN", "UNI", "KG", "LT", "LITRO", "GR", "CC", "PAQ", "CJA",
etc), usala literal en el campo "unidadMedidaOcr" de cada item. Si no hay columna, null.

REGLA CRITICA — POR DEFECTO TODO PRODUCTO ES UNIDAD (UN):
Las facturas de gastronomia/almacen casi siempre venden productos en UNIDAD (cajas, paquetes,
latas, botellas, frascos, conos individuales). Las menciones dentro de la descripcion como
"95G", "70CC", "500ML", "51CC", "1.5L" describen el CONTENIDO de cada unidad para identificar
el SKU — NO indican que el producto se venda al peso/volumen al cliente. Default fuerte:
unidadBase = UNIDAD ("UN") salvo evidencia inequivoca:

  - Si la columna U.M. dice UN/UNI/UND/UNIDAD → unidad = "UN" (siempre).
  - Si la columna U.M. dice KG/LT/LITRO/ML/G/GR → unidad acorde.
  - Si NO hay columna U.M. y la descripcion no tiene notacion de pack ni "(NU)", podes
    asumir unidad volumetrica/masica solo si el contexto es claro (ej: "HARINA 1KG" suelto).
  - En duda: UNIDAD.

REGLA CRITICA — PACK / CAJA / NOTACION (interpretacion correcta de los numeros):
Las descripciones suelen tener notaciones de pack que indican que el item facturado es UNA
caja/pack, dentro de la cual hay N unidades. Patrones comunes:

  a) "NxV<unidad>" — ej: "16X70CC", "12X500ML", "24X355ML", "6X1.5L"
     → N = cantidadPaquete (cuantas unidades hay en la caja)
     → V<unidad> = contenidoUnitario (volumen de cada unidad, descriptivo del SKU)
  b) "(NU)" / "(N U)" / "(N)" al final — ej: "CONO 95G (18U)", "TUBITO 50G (24)"
     → N = cantidadPaquete
     → "95G" / "50G" antes del parentesis = contenidoUnitario
  c) "CAJA X N" / "PACK X N" / "DISPLAY X N" / "BLISTER X N"
     → N = cantidadPaquete; contenidoUnitario lo que aparezca antes de la notacion.

Cuando detectes alguno de estos patrones, poblar "presentacionInferida":
{
  "tipo": "PACK",
  "cantidadPaquete": N,                                 // cuantas UNIDADES trae el pack
  "contenidoUnitario": { "valor": V, "unidad": "ML"|"L"|"CC"|"G"|"KG"|"GR"|"UN" } | null,
  "nombreProductoLimpio": string,                       // descripcion SIN la notacion de pack
  "nombrePresentacion": string                          // "CAJA X16", "PACK X12", etc
}

Si NO hay notacion de pack y el item es suelto (ej: "GASEOSA COCA 2L"):
{
  "tipo": "UNITARIA",
  "cantidadPaquete": 1,
  "contenidoUnitario": { "valor": 2, "unidad": "L" } | null,
  "nombreProductoLimpio": "GASEOSA COCA 2L",
  "nombrePresentacion": "UNIDAD"
}

Si no se puede inferir nada (ej: servicios, sin descripcion clara), "presentacionInferida": null.

REGLA — NOMBRE DEL PRODUCTO LIMPIO:
"nombreProductoLimpio" debe ser la descripcion en MAYUSCULAS pero **sin** la notacion de pack
(quitar "16X70CC" → dejar "70CC" si era contenido; quitar "(18U)", quitar "CAJA X12", etc).
SI conserva el contenido unitario (95G / 70CC / 500ML / 1.5L) cuando ese dato sirve para
diferenciar SKUs (porque un mismo producto puede venir en distintos contenidos). Ejemplos:

  Original                                   nombreProductoLimpio                cantidadPaquete   nombrePresentacion
  --------                                   --------------------                ---------------   ------------------
  "HELADO CORAZON BON O BON 16X70CC"         "HELADO CORAZON BON O BON 70CC"     16                "CAJA X16"
  "CONO COFLER BLOCK 95G (18U)"              "CONO COFLER BLOCK 95G"             18                "CAJA X18"
  "HEL.MOGUL TUBITO 50G (24)"                "HEL.MOGUL TUBITO 50G"              24                "CAJA X24"
  "FANTA NARANJA 12X500ML"                   "FANTA NARANJA 500ML"               12                "PACK X12"
  "GASEOSA COCA 2L" (suelta)                 "GASEOSA COCA 2L"                   1                 "UNIDAD"

Tu tarea: leer la imagen y devolver UN unico objeto JSON valido (sin markdown, sin texto extra)
con los campos del esquema. Si un campo no aparece o no es legible, usa null.

Esquema requerido:
{
  "proveedor": { "nombre": string, "ruc": string|null, "razonSocial": string|null, "telefono": string|null },
  "documento": {
    "numeroNota": string|null,
    "fecha": string|null,
    "tipo": "LEGAL"|"COMUN"|"OTRO"|"SIN_COMPROBANTE",
    "moneda": "PYG"|"USD"|"BRL",
    "totalDocumento": number,
    "ivaTotal": number|null,
    "descuentoTotal": number|null,
    "timbrado": string|null
  },
  "items": [
    {
      "descripcion": string,
      "cantidad": number,
      "precioUnitario": number,
      "subtotal": number,
      "iva": number|null,
      "codigoProveedor": string|null,
      "unidadMedidaOcr": string|null,
      "presentacionInferida": {
        "tipo": "UNITARIA"|"PACK",
        "cantidadPaquete": number,
        "contenidoUnitario": { "valor": number, "unidad": "UN"|"ML"|"L"|"CC"|"G"|"KG"|"GR" } | null,
        "nombreProductoLimpio": string,
        "nombrePresentacion": string
      } | null
    }
  ]
}

Reglas:
- "proveedor" = EMISOR de la factura (vendedor). NUNCA el cliente/receptor.
- Captura "telefono" del emisor si aparece (campo "Tel:", "Telefono:" o similar). Si no aparece, null.
- Convierte toda descripcion de producto a MAYUSCULAS.
- Fecha en formato "YYYY-MM-DD".
- Si la moneda no se ve, asume PYG.
- subtotal = cantidad * precioUnitario.
- IVA es porcentaje numerico (0, 5, 10).
- Si no es factura legal con timbrado, tipo = "COMUN".
- Devuelve UN SOLO objeto JSON, sin envolver en arrays.`;

/**
 * Compone el prompt efectivo: base + adiciones del usuario (si hay).
 * Las adiciones se appendean bajo "Reglas adicionales del usuario" — la IA debe respetarlas
 * pero en caso de conflicto con el prompt base, el base gana (regla explicita en el sufijo).
 */
export function buildEffectivePrompt(promptBase: string, adiciones: string[]): string {
  const limpias = (adiciones || [])
    .map(s => (s || '').trim())
    .filter(s => s.length > 0);
  if (limpias.length === 0) return promptBase;
  const bullets = limpias.map(s => `- ${s}`).join('\n');
  return `${promptBase}\n\nReglas adicionales del usuario (si entran en conflicto con las reglas anteriores, las anteriores tienen prioridad):\n${bullets}`;
}

export function hashPrompt(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

// Compat: nombre viejo apunta al base. Codigo nuevo debe usar buildEffectivePrompt.
export const FACTURA_PROMPT = FACTURA_PROMPT_BASE;

export interface FacturaJsonItem {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  iva: number | null;
  codigoProveedor: string | null;
  unidadMedidaOcr: string | null;
  presentacionInferida: PresentacionInferidaOcr | null;
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

export interface FacturaJson {
  proveedor: { nombre: string; ruc: string | null; razonSocial: string | null; telefono: string | null };
  documento: {
    numeroNota: string | null;
    fecha: string | null;
    tipo: 'LEGAL' | 'COMUN' | 'OTRO' | 'SIN_COMPROBANTE';
    moneda: 'PYG' | 'USD' | 'BRL';
    totalDocumento: number;
    ivaTotal: number | null;
    descuentoTotal: number | null;
    timbrado: string | null;
  };
  items: FacturaJsonItem[];
}

export interface ValidatedFactura {
  factura: FacturaJson;
  warnings: string[];
}

export function normalizeText(s: string): string {
  return (s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

export function validateFacturaJson(raw: unknown): { ok: true; result: ValidatedFactura } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Respuesta de IA no es un objeto JSON.' };
  }
  const data = raw as any;
  const warnings: string[] = [];

  if (!data.proveedor || typeof data.proveedor !== 'object') {
    return { ok: false, error: 'Falta campo proveedor.' };
  }
  if (!data.proveedor.nombre || typeof data.proveedor.nombre !== 'string') {
    return { ok: false, error: 'Falta proveedor.nombre.' };
  }
  if (!data.documento || typeof data.documento !== 'object') {
    return { ok: false, error: 'Falta campo documento.' };
  }
  if (typeof data.documento.totalDocumento !== 'number' || data.documento.totalDocumento <= 0) {
    return { ok: false, error: 'documento.totalDocumento invalido.' };
  }
  if (!Array.isArray(data.items) || data.items.length === 0) {
    return { ok: false, error: 'No se detectaron items en la factura.' };
  }

  for (let i = 0; i < data.items.length; i++) {
    const it = data.items[i];
    if (!it || typeof it !== 'object') {
      return { ok: false, error: `Item ${i + 1} invalido.` };
    }
    if (typeof it.descripcion !== 'string' || !it.descripcion.trim()) {
      return { ok: false, error: `Item ${i + 1} sin descripcion.` };
    }
    if (typeof it.cantidad !== 'number' || it.cantidad <= 0) {
      return { ok: false, error: `Item ${i + 1} cantidad invalida.` };
    }
    if (typeof it.precioUnitario !== 'number' || it.precioUnitario < 0) {
      return { ok: false, error: `Item ${i + 1} precio invalido.` };
    }
    if (typeof it.subtotal !== 'number') {
      it.subtotal = it.cantidad * it.precioUnitario;
    }
    it.descripcion = normalizeText(it.descripcion);
    // Campos nuevos: tolerantes — si la IA todavia no los devolvio (modelo viejo o
    // factura pobre), default a null sin fallar.
    if (typeof it.unidadMedidaOcr !== 'string') it.unidadMedidaOcr = null;
    else it.unidadMedidaOcr = normalizeText(it.unidadMedidaOcr);
    if (!it.presentacionInferida || typeof it.presentacionInferida !== 'object') {
      it.presentacionInferida = null;
    } else {
      const pi: any = it.presentacionInferida;
      const tipo = String(pi.tipo || '').toUpperCase();
      const cantPaq = Number(pi.cantidadPaquete);
      // Tolerar shape viejo (volumenUnitario+unidad planos) por si la IA aun lo usa.
      let contenido: ContenidoUnitarioOcr | null = null;
      if (pi.contenidoUnitario && typeof pi.contenidoUnitario === 'object') {
        const v = Number(pi.contenidoUnitario.valor);
        const u = String(pi.contenidoUnitario.unidad || '').toUpperCase();
        if (Number.isFinite(v) && v > 0 && ['UN', 'ML', 'L', 'CC', 'G', 'KG', 'GR'].includes(u)) {
          contenido = { valor: v, unidad: u as any };
        }
      } else if (Number.isFinite(Number(pi.volumenUnitario)) && pi.unidad) {
        const v = Number(pi.volumenUnitario);
        const u = String(pi.unidad || '').toUpperCase();
        if (v > 0 && ['UN', 'ML', 'L', 'CC', 'G', 'KG', 'GR'].includes(u)) {
          contenido = { valor: v, unidad: u as any };
        }
      }
      const nombreLimpio = typeof pi.nombreProductoLimpio === 'string' && pi.nombreProductoLimpio.trim()
        ? normalizeText(pi.nombreProductoLimpio)
        : it.descripcion;
      const nombrePres = typeof pi.nombrePresentacion === 'string' && pi.nombrePresentacion.trim()
        ? normalizeText(pi.nombrePresentacion)
        : (tipo === 'PACK' && cantPaq > 1 ? `CAJA X${cantPaq}` : 'UNIDAD');
      if (
        (tipo !== 'UNITARIA' && tipo !== 'PACK') ||
        !Number.isFinite(cantPaq) || cantPaq <= 0
      ) {
        it.presentacionInferida = null;
      } else {
        it.presentacionInferida = {
          tipo,
          cantidadPaquete: Math.round(cantPaq),
          contenidoUnitario: contenido,
          nombreProductoLimpio: nombreLimpio,
          nombrePresentacion: nombrePres,
        };
      }
    }
  }

  const sumItems = data.items.reduce((s: number, it: any) => s + (it.subtotal || 0), 0);
  const tot = data.documento.totalDocumento;
  if (Math.abs(sumItems - tot) / tot > 0.05) {
    warnings.push(`Suma de items (${sumItems.toFixed(2)}) difiere mas de 5% del total (${tot.toFixed(2)}).`);
  }

  if (data.proveedor.ruc) {
    data.proveedor.ruc = String(data.proveedor.ruc).replace(/[^\dA-Za-z-]/g, '');
  }

  return { ok: true, result: { factura: data as FacturaJson, warnings } };
}

export function copyArchivoToImports(userDataPath: string, srcPath: string): {
  archivoUrl: string;
  archivoNombre: string;
  archivoTipo: 'PDF' | 'IMAGE';
  destPath: string;
} {
  const dir = getFacturaImportsDir(userDataPath);
  const ext = path.extname(srcPath).toLowerCase() || '.bin';
  const archivoTipo: 'PDF' | 'IMAGE' = ext === '.pdf' ? 'PDF' : 'IMAGE';
  const uuid = crypto.randomBytes(8).toString('hex');
  const fileName = `${Date.now()}-${uuid}${ext}`;
  const destPath = path.join(dir, fileName);
  fs.copyFileSync(srcPath, destPath);
  return {
    archivoUrl: `app://factura-imports/${fileName}`,
    archivoNombre: path.basename(srcPath),
    archivoTipo,
    destPath,
  };
}

export interface InferenciaPresentacion {
  /**
   * unidadBase del producto. Default fuerte: UNIDAD. Solo cambia a volumetrica/masica si
   * la columna U.M. lo dice explicitamente o si el item es claramente suelto sin pack.
   */
  unidadBase: 'UNIDAD' | 'KG' | 'GRAMO' | 'LITRO' | 'MILILITRO';
  /**
   * Cantidad de la presentacion EN unidad base. Para pack (caja X16) = 16, porque ingresan
   * 16 UNIDADES al stock por cada caja. Para item suelto en gramos/ml = el peso/volumen.
   */
  cantidadPresentacion: number;
  /** Nombre legible: "CAJA X16", "PACK X12", "UNIDAD", "500 ML" segun el caso. */
  nombrePresentacion: string;
  /** Nombre del producto limpio (sin notacion de pack), conservando contenido para SKU. */
  nombreProductoSugerido: string;
  posibleGtin: string | null;
  /** Cuantas unidades trae el pack/caja. 1 si es item suelto. */
  cantidadPaquete: number;
  esPack: boolean;
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

/**
 * Limpia el nombre del producto removiendo notaciones de pack pero preservando
 * el contenido unitario que sirve para diferenciar SKUs.
 *
 * "HELADO CORAZON 16X70CC" → "HELADO CORAZON 70CC"
 * "CONO COFLER 95G (18U)"  → "CONO COFLER 95G"
 * "MOGUL TUBITO 50G (24)"  → "MOGUL TUBITO 50G"
 * "FANTA 12X500ML"         → "FANTA 500ML"
 * "CAJA X 6 GASEOSA 2L"    → "GASEOSA 2L"
 */
function limpiarNombreProducto(desc: string): string {
  let s = (desc || '').toUpperCase();
  // Remover patron NxV<unidad> sustituyendolo por solo "V<unidad>" (preserva contenido).
  s = s.replace(/(\d+)\s*[Xx]\s*(\d+(?:[.,]\d+)?\s*(?:ML|MILILITROS?|L|LT|LITROS?|KG|KILOS?|KILOGRAMOS?|G|GR|GRAMOS?|CC))/g, '$2');
  // Remover "(NU)" / "(N U)" / "(N)" al final de la descripcion.
  s = s.replace(/\s*\((\d+)\s*U?\)\s*/g, ' ');
  // Remover "CAJA X N" / "PACK X N" / "DISPLAY X N" / "BLISTER X N".
  s = s.replace(/\b(?:CAJA|PACK|DISPLAY|BLISTER|FARDO|BOLSA)\s*[Xx]\s*\d+/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Inferir presentacion desde un item OCR.
 *
 * Prioridades:
 *   1. presentacionInferida del OCR (la IA ya estructuro pack/unitaria + nombre limpio).
 *   2. unidadMedidaOcr explicita (columna U.M. de la factura) — autoritativa.
 *   3. Heuristica regex sobre la descripcion para detectar pack y limpiar nombre.
 *
 * Default fuerte: unidadBase = UNIDAD.
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

  // U.M. de la factura es autoritativa para la unidadBase.
  let umExplicita: InferenciaPresentacion['unidadBase'] | null = null;
  if (unidadMedidaOcr) umExplicita = unidadOcrAUnidadBase(unidadMedidaOcr);

  // 1) Si la IA estructuro presentacionInferida, usarla casi tal cual.
  if (presentacionInferida) {
    const cantPaq = Math.max(1, Math.round(Number(presentacionInferida.cantidadPaquete) || 1));
    const esPack = presentacionInferida.tipo === 'PACK' && cantPaq > 1;
    // unidadBase: UoM explicita manda. Sin UoM → UNIDAD.
    result.unidadBase = umExplicita || 'UNIDAD';
    result.cantidadPaquete = cantPaq;
    result.esPack = esPack;
    if (esPack) {
      result.cantidadPresentacion = cantPaq;
      result.nombrePresentacion = (presentacionInferida.nombrePresentacion || `CAJA X${cantPaq}`).toUpperCase();
    } else {
      // Item suelto: si UoM volumetrica/masica, usar el contenido unitario como cantidad.
      const cont = presentacionInferida.contenidoUnitario;
      if (cont && result.unidadBase !== 'UNIDAD') {
        const ubCont = unidadOcrAUnidadBase(cont.unidad) || 'UNIDAD';
        // Solo si la unidad del contenido coincide con la UoM, sino UNIDAD.
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

  // 2) Sin presentacionInferida del OCR — heuristica local.
  // Default: UNIDAD salvo que UoM diga otra cosa.
  result.unidadBase = umExplicita || 'UNIDAD';
  result.nombreProductoSugerido = limpiarNombreProducto(desc);

  // Patron pack "NxV<unidad>" o "(NU)" en la descripcion.
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

  // Sin pack: si UoM explicita es volumetrica/masica, intentar leer contenido del nombre.
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

  // Default final: UNIDAD suelta.
  result.cantidadPresentacion = 1;
  result.nombrePresentacion = 'UNIDAD';
  return result;
}

export function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'application/pdf';
  if (e === '.png') return 'image/png';
  if (e === '.webp') return 'image/webp';
  if (e === '.gif') return 'image/gif';
  return 'image/jpeg';
}

// Polyfill de globals que pdfjs-dist necesita en Node (DOMMatrix, Path2D, ImageData).
let pdfPolyfillsApplied = false;
function applyPdfPolyfills(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const napiCanvas = require('@napi-rs/canvas');
  if (!pdfPolyfillsApplied) {
    const g = globalThis as any;
    if (!g.DOMMatrix) g.DOMMatrix = napiCanvas.DOMMatrix;
    if (!g.Path2D) g.Path2D = napiCanvas.Path2D;
    if (!g.ImageData) g.ImageData = napiCanvas.ImageData;
    pdfPolyfillsApplied = true;
  }
  return napiCanvas;
}

/**
 * CanvasFactory para pdfjs-dist usando @napi-rs/canvas.
 * Reemplaza al NodeCanvasFactory por defecto que usa el modulo `canvas` (native build),
 * el cual rompe en Electron por ABI mismatch (NODE_MODULE_VERSION). @napi-rs/canvas
 * usa NAPI v3 (ABI-stable) y funciona sin rebuild.
 */
function buildCanvasFactory(napiCanvas: any) {
  return {
    create(width: number, height: number) {
      if (width <= 0 || height <= 0) {
        throw new Error('Invalid canvas size');
      }
      const canvas = napiCanvas.createCanvas(width, height);
      const context = canvas.getContext('2d');
      return { canvas, context };
    },
    reset(canvasAndContext: any, width: number, height: number) {
      if (!canvasAndContext.canvas) throw new Error('Canvas is not specified');
      if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    },
    destroy(canvasAndContext: any) {
      if (!canvasAndContext.canvas) throw new Error('Canvas is not specified');
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    },
  };
}

/**
 * Convierte la primera pagina de un PDF a data URL PNG.
 * OpenAI Chat Completions vision NO acepta PDFs, solo imagenes.
 *
 * Usamos pdfjs-dist v3 (CJS, Node 18 compat) porque v5 requiere Node 20.19+
 * que Electron 24 no provee. v3 + napi-rs/canvas + worker importado renderiza
 * facturas reales (con fuentes embebidas o escaneadas) sin problemas.
 */
export async function pdfFirstPageToPngDataUrl(pdfPath: string, scale = 2): Promise<string> {
  const napiCanvas = applyPdfPolyfills();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs: any = require('pdfjs-dist/legacy/build/pdf.js');
  // El worker se importa explicitamente para registrarlo en Node
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('pdfjs-dist/legacy/build/pdf.worker.js');

  // Recursos para fuentes builtin (Helvetica, Times) y CJK.
  // OJO: NodeStandardFontDataFactory hace fs.readFile(url) directo, asi que pasamos
  // path nativo terminado en separador (no file:// URL).
  const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const standardFontDataUrl = path.join(pdfjsRoot, 'standard_fonts') + path.sep;
  const cMapUrl = path.join(pdfjsRoot, 'cmaps') + path.sep;

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    canvasFactory: buildCanvasFactory(napiCanvas),
  });
  const pdfDoc = await loadingTask.promise;
  try {
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const canvas = napiCanvas.createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx as any, viewport, canvas: canvas as any }).promise;
    const png = canvas.toBuffer('image/png');
    return `data:image/png;base64,${png.toString('base64')}`;
  } finally {
    try { await pdfDoc.destroy(); } catch { /* noop */ }
  }
}

export async function buildVisionDataUrl(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    return await pdfFirstPageToPngDataUrl(filePath);
  }
  const buf = fs.readFileSync(filePath);
  return `data:${mimeFromExt(ext)};base64,${buf.toString('base64')}`;
}

export interface OpenAiCallResult {
  json: any;
  tokensPrompt: number;
  tokensCompletion: number;
  modelo: string;
}

export function parseOpenAiError(status: number, rawBody: string): string {
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // ignore
  }
  const code = parsed?.error?.code || parsed?.error?.type || '';
  const msg = parsed?.error?.message || '';

  if (code === 'insufficient_quota' || /insufficient[_ ]quota|exceeded your current quota/i.test(msg)) {
    return 'Sin saldo en la cuenta de OpenAI. Carga creditos en https://platform.openai.com/settings/organization/billing/overview (ChatGPT Plus NO incluye API).';
  }
  if (code === 'invalid_api_key' || status === 401 || /invalid[_ ]api[_ ]key|incorrect api key/i.test(msg)) {
    return 'API key invalida o revocada. Verifica la key en Sistema -> Configurar IA.';
  }
  if (code === 'model_not_found' || /model.*does not exist|do not have access/i.test(msg)) {
    return 'Modelo no disponible para tu cuenta. Probá con gpt-4o-mini o verificá que tu cuenta tenga acceso al modelo configurado.';
  }
  if (code === 'rate_limit_exceeded' || (status === 429 && !/quota/i.test(msg))) {
    return 'Demasiadas peticiones por minuto. Esperá unos segundos y reintenta.';
  }
  if (code === 'context_length_exceeded') {
    return 'Imagen demasiado grande para el modelo. Reduci la resolucion o recorta la factura.';
  }
  if (status === 403) {
    return 'Permisos insuficientes en la cuenta de OpenAI. Revisa la API key y los permisos del proyecto.';
  }
  if (status >= 500) {
    return 'OpenAI esta caido o saturado. Reintenta en unos minutos.';
  }
  if (msg) {
    return `OpenAI ${status}: ${msg.slice(0, 300)}`;
  }
  return `OpenAI ${status}: ${rawBody.slice(0, 300)}`;
}

export async function callOpenAiVision(opts: {
  apiKey: string;
  modelo: string;
  base64DataUrl: string;
  timeoutMs?: number;
  /** Prompt completo (base + adiciones). Si se omite, usa FACTURA_PROMPT_BASE. */
  promptText?: string;
}): Promise<OpenAiCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45000);

  try {
    const body = {
      model: opts.modelo,
      messages: [
        { role: 'system', content: opts.promptText || FACTURA_PROMPT_BASE },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Esta es una factura/comprobante de compra de mi propio comercio. Por favor leela y devolveme los datos en JSON segun el esquema.',
            },
            { type: 'image_url', image_url: { url: opts.base64DataUrl, detail: 'high' } as any },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(parseOpenAiError(res.status, txt));
    }
    const payload: any = await res.json();
    const choice = payload?.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      const finishReason = choice?.finish_reason;
      const refusal = choice?.message?.refusal;
      // Log el payload completo para debug en stdout de Electron
      console.error('[OpenAI vision] respuesta sin content. Payload:', JSON.stringify(payload, null, 2).slice(0, 2000));
      if (refusal) {
        throw new Error(`OpenAI rechazó la solicitud: ${String(refusal).slice(0, 300)}`);
      }
      if (finishReason === 'length') {
        throw new Error('Respuesta truncada por limite de tokens. Probá con gpt-4o-mini o reduce la imagen.');
      }
      if (finishReason === 'content_filter') {
        throw new Error('OpenAI bloqueó la respuesta por filtro de contenido. Verifica que la imagen sea legible.');
      }
      throw new Error(`OpenAI no devolvio contenido (finish_reason: ${finishReason || 'desconocido'}).`);
    }
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (e: any) {
      throw new Error(`Respuesta no es JSON valido: ${e.message}`);
    }
    return {
      json: parsed,
      tokensPrompt: payload?.usage?.prompt_tokens ?? 0,
      tokensCompletion: payload?.usage?.completion_tokens ?? 0,
      modelo: payload?.model ?? opts.modelo,
    };
  } finally {
    clearTimeout(timer);
  }
}
