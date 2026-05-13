/**
 * Scraper de cotizaciones de mercado contra nortecambios.com.py (sucursal Salto del Guaira).
 * Replica el protocolo Livewire 3: GET home → extraer CSRF/snapshot/cookies → POST setActiveBranch(8).
 *
 * Devuelve compra/venta de mercado para las divisas mas comunes (DOLAR, REAL).
 * Convencion de mapeo (literal — sin inversion):
 *   - `compraMercado` = nortecambios.Compra (tasa BAJA — lo que el mercado paga al cliente que vende divisa)
 *   - `ventaMercado`  = nortecambios.Venta  (tasa ALTA — lo que el mercado cobra al cliente que compra divisa)
 *
 * No persiste nada — el caller decide que hacer con los valores. Pensado para ser
 * disparado on-demand desde la UI de cotizaciones.
 *
 * Basado en NorteCambiosScraper.java del proyecto franco-system-backend-servidor (PR #59).
 */

import * as https from 'https';
import { URL } from 'url';

const BASE_URL = 'https://www.nortecambios.com.py/';
const LIVEWIRE_URL = 'https://www.nortecambios.com.py/livewire/update';
const BRANCH_ID = 8; // Salto del Guaira
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CSRF_RE = /data-csrf="([^"]+)"/;
const SNAPSHOT_RE = /wire:snapshot="([^"]+)"/;
const RATE_RE = /Compra:\s*([\d.,]+).*?Venta:\s*([\d.,]+)/;

export interface CotizacionMercadoItem {
  /** Tasa BAJA — lo que el mercado paga al comprar la divisa (mapea literalmente a nortecambios "Compra"). */
  compraMercado: number;
  /** Tasa ALTA — lo que el mercado cobra al vender la divisa (mapea literalmente a nortecambios "Venta"). */
  ventaMercado: number;
}

export interface CotizacionMercadoResult {
  /** Mapa por denominacion (ej. 'DOLAR', 'REAL') */
  monedas: Record<string, CotizacionMercadoItem>;
  /** Cuando se obtuvo */
  obtenidoEn: string; // ISO
  /** Fuente */
  fuente: string;
}

interface HttpResp {
  status: number;
  body: string;
  setCookies: string[];
}

function httpsRequest(
  url: string,
  options: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: options.method,
        headers: options.headers || {},
        // Trust-all SSL (igual que el scraper Java). Norte Cambios a veces tiene
        // cadena de certificados incompleta en su CDN.
        rejectUnauthorized: false,
        timeout: 10000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          const setCookies = res.headers['set-cookie'] || [];
          resolve({
            status: res.statusCode || 0,
            body,
            setCookies: Array.isArray(setCookies) ? setCookies : [setCookies],
          });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

export async function fetchCotizacionMercado(): Promise<CotizacionMercadoResult> {
  // Paso 1: GET home — extraer csrf, snapshot, cookies
  const homeRes = await httpsRequest(BASE_URL, {
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-PY,es;q=0.9',
      'User-Agent': UA,
    },
  });
  if (homeRes.status !== 200) {
    throw new Error(`GET home retornó status ${homeRes.status}`);
  }
  const html = homeRes.body;
  const cookies = extractSessionCookie(homeRes.setCookies);
  const csrf = extractMatch(html, CSRF_RE);
  const snapshotRaw = extractMatch(html, SNAPSHOT_RE);
  if (!csrf || !snapshotRaw) {
    throw new Error('No se pudo extraer csrf/snapshot del home de nortecambios');
  }
  const snapshot = decodeHtmlEntities(snapshotRaw);

  // Paso 2: POST /livewire/update — setActiveBranch(BRANCH_ID)
  const body = buildLivewireBody(snapshot);
  const postHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'es-PY,es;q=0.9',
    'User-Agent': UA,
    'X-Livewire': '',
    'X-CSRF-TOKEN': csrf,
    Referer: BASE_URL,
    'Content-Length': String(Buffer.byteLength(body)),
  };
  if (cookies) postHeaders['Cookie'] = cookies;

  const postRes = await httpsRequest(LIVEWIRE_URL, {
    method: 'POST',
    headers: postHeaders,
    body,
  });
  if (postRes.status !== 200) {
    throw new Error(
      `POST livewire/update status ${postRes.status}: ${postRes.body.slice(0, 200)}`,
    );
  }

  let responseJson: any;
  try {
    responseJson = JSON.parse(postRes.body);
  } catch {
    throw new Error('La respuesta de livewire/update no es JSON valido');
  }

  // Paso 3: extraer data.text del snapshot anidado
  const ratesText = extractRatesText(responseJson);
  if (!ratesText) {
    throw new Error('No se encontró texto de cotizaciones en la respuesta de Livewire');
  }

  // Paso 4: parsear el texto
  const monedas = parseRatesText(ratesText);
  return {
    monedas,
    obtenidoEn: new Date().toISOString(),
    fuente: 'nortecambios.com.py',
  };
}

function extractMatch(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1] : null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'");
}

function extractSessionCookie(setCookies: string[]): string | null {
  if (!setCookies || setCookies.length === 0) return null;
  return setCookies
    .map((c) => {
      const semi = c.indexOf(';');
      return semi > 0 ? c.substring(0, semi) : c;
    })
    .join('; ');
}

function buildLivewireBody(snapshot: string): string {
  // Hay que enviar el snapshot como string JSON (escapado) dentro del body JSON.
  const escaped = snapshot.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `{"components":[{"snapshot":"${escaped}","updates":{},"calls":[{"path":"","method":"setActiveBranch","params":[${BRANCH_ID}]}]}]}`;
}

function extractRatesText(responseJson: any): string | null {
  try {
    const components = responseJson?.components;
    if (!Array.isArray(components) || components.length === 0) return null;
    const snapshotStr = components[0]?.snapshot;
    if (!snapshotStr) return null;
    const snapshotJson =
      typeof snapshotStr === 'string' ? snapshotStr : JSON.stringify(snapshotStr);
    const snapshotNode = JSON.parse(snapshotJson);
    const textNode = snapshotNode?.data?.text;
    if (textNode === undefined || textNode === null) return null;
    // En Livewire 3 puede venir como [value, metadata] o como string directo
    if (Array.isArray(textNode) && textNode.length > 0) return String(textNode[0]);
    return String(textNode);
  } catch (e) {
    return null;
  }
}

function mapMonedaKey(nameLine: string): string | null {
  const lower = nameLine.toLowerCase();
  // Descartar arbitrajes (contienen " x " entre monedas)
  if (lower.includes(' x ')) return null;
  if (lower.includes('dólar') || lower.includes('dolar') || lower.includes('dollar')) return 'DOLAR';
  if (lower.includes('real')) return 'REAL';
  return null;
}

function parseRate(raw: string): number {
  let cleaned = raw.trim();
  // Coma decimal (ej. "3,00", "5,03")
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, ''); // quitar separadores de miles si hubiera
    cleaned = cleaned.replace(',', '.');
    return parseFloat(cleaned);
  }
  // Solo punto — determinar si es miles o decimal
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      // X.XXX = separador de miles (ej. "6.120" = 6120)
      return parseFloat(cleaned.replace(/\./g, ''));
    }
    return parseFloat(cleaned);
  }
  return parseFloat(cleaned);
}

function parseRatesText(text: string): Record<string, CotizacionMercadoItem> {
  const result: Record<string, CotizacionMercadoItem> = {};
  // Bloques separados por doble salto de línea
  const blocks = text.split('\n\n');
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const monedaKey = mapMonedaKey(lines[0].trim());
    if (!monedaKey) continue;
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i].match(RATE_RE);
      if (m) {
        try {
          const compra = parseRate(m[1]);
          const venta = parseRate(m[2]);
          if (Number.isFinite(compra) && Number.isFinite(venta)) {
            // Mapeo literal: nortecambios.Compra → nuestro compraMercado (tasa baja),
            // nortecambios.Venta → nuestro ventaMercado (tasa alta).
            result[monedaKey] = {
              compraMercado: compra,
              ventaMercado: venta,
            };
          }
        } catch {}
        break;
      }
    }
  }
  return result;
}
