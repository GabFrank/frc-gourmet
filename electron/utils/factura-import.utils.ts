import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getFacturaImportsDir } from './ia-config.utils';

export const FACTURA_PROMPT = `Sos un extractor de datos de facturas comerciales paraguayas.
Devolvé ÚNICAMENTE un objeto JSON válido, sin markdown ni explicación.
Si un campo no aparece o no podés determinarlo, usá null.

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

export interface OpenAiCallResult {
  json: any;
  tokensPrompt: number;
  tokensCompletion: number;
  modelo: string;
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
            { type: 'text', text: 'Extrae los datos de esta factura.' },
            { type: 'image_url', image_url: { url: opts.base64DataUrl } },
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
      throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 500)}`);
    }
    const payload: any = await res.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI no devolvio contenido.');
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
