import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getFacturaImportsDir } from './ia-config.utils';

export const FACTURA_PROMPT = `Sos un asistente que ayuda a un comercio gastronomico a digitalizar
sus comprobantes de compra propios (facturas y notas de proveedores) para cargarlos al sistema
de gestion del negocio. La imagen es un comprobante de compra del comercio que estas asistiendo.

Tu tarea: leer la imagen y devolver UN unico objeto JSON valido (sin markdown, sin texto extra)
con los campos del esquema. Si un campo no aparece o no es legible, usa null.

Esquema requerido:
{
  "proveedor": { "nombre": string, "ruc": string|null, "razonSocial": string|null },
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
      "codigoProveedor": string|null
    }
  ]
}

Reglas:
- Convertí toda descripción de producto a MAYÚSCULAS.
- Fecha en formato "YYYY-MM-DD".
- Si la moneda no se ve, asumí PYG.
- subtotal = cantidad * precioUnitario.
- IVA es porcentaje numérico (0, 5, 10).
- Si no es factura legal con timbrado, tipo = "COMUN".
- Devolvé UN SOLO objeto JSON, sin envolver en arrays.`;

export interface FacturaJsonItem {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  iva: number | null;
  codigoProveedor: string | null;
}

export interface FacturaJson {
  proveedor: { nombre: string; ruc: string | null; razonSocial: string | null };
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
}): Promise<OpenAiCallResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45000);

  try {
    const body = {
      model: opts.modelo,
      messages: [
        { role: 'system', content: FACTURA_PROMPT },
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
