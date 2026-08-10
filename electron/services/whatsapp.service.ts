import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

/**
 * Servicio de envio de WhatsApp via Evolution API (self-hosted, Baileys).
 * Contrato: POST {baseUrl}/message/sendText/{instance}  con header `apikey`.
 *
 * Reutiliza la instancia ya configurada en frc-cicd (ej. `frc-alertas`).
 * Es "puro": recibe config + apikey ya resueltos. Usa http/https nativo (sin
 * dependencias extra), igual que cotizacion-mercado.utils.ts.
 */
export interface EvolutionConfig {
  /** Base URL del Evolution API, ej http://172.25.0.172:8090 */
  url: string;
  /** Nombre de la instancia, ej frc-alertas */
  instance: string;
}

export interface SendWhatsappResult {
  id: string;
}

export function assertEvolutionConfig(cfg: EvolutionConfig, apikey: string): void {
  if (!cfg.url) throw new Error('Evolution API URL no configurada');
  if (!cfg.instance) throw new Error('Evolution API instancia no configurada');
  if (!apikey) throw new Error('Evolution API key no configurada (cargar en Configuracion de Notificaciones)');
}

function postJson(
  endpoint: string,
  apikey: string,
  body: any,
  timeoutMs = 15000,
): Promise<{ status: number; json: any; raw: string }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch (e) {
      reject(new Error(`URL de Evolution invalida: ${endpoint}`));
      return;
    }
    const payload = JSON.stringify(body);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          apikey,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json: any = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            /* respuesta no-JSON */
          }
          resolve({ status: res.statusCode || 0, json, raw: data });
        });
      },
    );
    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Timeout conectando a Evolution API'));
    });
    req.write(payload);
    req.end();
  });
}

/** Normaliza la base url (sin trailing slash). */
function baseUrl(cfg: EvolutionConfig): string {
  return cfg.url.replace(/\/+$/, '');
}

/**
 * Envia un mensaje de texto. `numberOrJid` puede ser un numero internacional
 * (595991123456) o un JID de grupo (120363...@g.us).
 */
export async function sendWhatsappText(
  cfg: EvolutionConfig,
  apikey: string,
  numberOrJid: string,
  text: string,
): Promise<SendWhatsappResult> {
  assertEvolutionConfig(cfg, apikey);
  if (!numberOrJid) throw new Error('Numero/grupo de WhatsApp vacio');
  const endpoint = `${baseUrl(cfg)}/message/sendText/${encodeURIComponent(cfg.instance)}`;
  const { status, json, raw } = await postJson(endpoint, apikey, {
    number: numberOrJid,
    text,
  });
  if (status < 200 || status >= 300) {
    const msg = (json && (json.message || json.error)) || raw || `HTTP ${status}`;
    throw new Error(`Evolution API error (${status}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  const id = json?.key?.id || json?.id || '';
  return { id };
}

/**
 * Envia una imagen (u otro media) por WhatsApp via Evolution API.
 * Contrato: POST {baseUrl}/message/sendMedia/{instance}
 *   { number, mediatype: 'image', mimetype, media: <base64 sin prefijo>, fileName, caption }
 * `base64` es el contenido puro (sin `data:image/png;base64,`).
 */
export async function sendWhatsappMedia(
  cfg: EvolutionConfig,
  apikey: string,
  numberOrJid: string,
  base64: string,
  opts: { fileName?: string; caption?: string; mimetype?: string; mediatype?: 'image' | 'document' | 'video' | 'audio' } = {},
): Promise<SendWhatsappResult> {
  assertEvolutionConfig(cfg, apikey);
  if (!numberOrJid) throw new Error('Numero/grupo de WhatsApp vacio');
  if (!base64) throw new Error('Contenido (base64) vacio');
  const mediatype = opts.mediatype || 'image';
  const endpoint = `${baseUrl(cfg)}/message/sendMedia/${encodeURIComponent(cfg.instance)}`;
  const { status, json, raw } = await postJson(
    endpoint,
    apikey,
    {
      number: numberOrJid,
      mediatype,
      mimetype: opts.mimetype || (mediatype === 'image' ? 'image/png' : 'application/octet-stream'),
      media: base64,
      fileName: opts.fileName || (mediatype === 'image' ? 'cierre-caja.png' : 'archivo'),
      caption: opts.caption || '',
    },
    120000, // dumps de BD pueden ser grandes: timeout amplio
  );
  if (status < 200 || status >= 300) {
    const msg = (json && (json.message || json.error)) || raw || `HTTP ${status}`;
    throw new Error(`Evolution API error (${status}): ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  const id = json?.key?.id || json?.id || '';
  return { id };
}

/**
 * Envía un archivo (documento) por WhatsApp via Evolution API. Lee el archivo
 * de disco y lo manda como `mediatype: 'document'`. Pensado para enviar backups
 * de la BD (.db / .dump / .sql / .frcbak) al número/grupo configurado.
 */
export async function sendWhatsappDocumentFile(
  cfg: EvolutionConfig,
  apikey: string,
  numberOrJid: string,
  filePath: string,
  opts: { fileName?: string; caption?: string; mimetype?: string } = {},
): Promise<SendWhatsappResult> {
  // require diferido para no acoplar fs a los llamadores del servicio.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('path') as typeof import('path');
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Archivo a enviar no encontrado');
  const base64 = fs.readFileSync(filePath).toString('base64');
  return sendWhatsappMedia(cfg, apikey, numberOrJid, base64, {
    mediatype: 'document',
    fileName: opts.fileName || path.basename(filePath),
    caption: opts.caption || '',
    mimetype: opts.mimetype || 'application/octet-stream',
  });
}

export interface EvolutionStateResult {
  /** 'open' | 'close' | 'connecting' | 'unknown' | 'error' */
  state: string;
  /** true solo si la instancia esta conectada (state === 'open'). */
  ok: boolean;
  /** true si el servidor respondio algo (aunque sea un error HTTP). */
  reachable: boolean;
  httpStatus?: number;
  error?: string;
  /** Mensaje accionable para el operador segun el tipo de fallo. */
  hint?: string;
}

function getJson(
  endpoint: string,
  apikey: string,
  timeoutMs = 10000,
): Promise<{ status: number; json: any; raw: string }> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      reject(new Error(`URL invalida: ${endpoint}`));
      return;
    }
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: { apikey },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json: any = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            /* no-op */
          }
          resolve({ status: res.statusCode || 0, json, raw: data });
        });
      },
    );
    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Timeout conectando a Evolution API')));
    req.end();
  });
}

/**
 * Verifica el estado de conexion de la instancia con diagnostico accionable.
 * Distingue: URL inalcanzable, apikey invalida (401/403), instancia inexistente
 * (404) e instancia desconectada (state != open).
 */
export async function fetchEvolutionState(cfg: EvolutionConfig, apikey: string): Promise<EvolutionStateResult> {
  assertEvolutionConfig(cfg, apikey);
  const endpoint = `${baseUrl(cfg)}/instance/connectionState/${encodeURIComponent(cfg.instance)}`;

  let resp: { status: number; json: any; raw: string };
  try {
    resp = await getJson(endpoint, apikey);
  } catch (e) {
    const msg = (e as Error).message || String(e);
    let hint = `No se pudo conectar a ${cfg.url}. Verifica la URL y que el nodo tenga acceso de red al servidor de Evolution.`;
    if (/ECONNREFUSED/i.test(msg)) hint = `Conexion rechazada por ${cfg.url}. Evolution no escucha en esa direccion/puerto desde este equipo (revisa el binding: si esta en 127.0.0.1 solo funciona en la misma PC).`;
    else if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) hint = `No se resolvio el host de ${cfg.url}. Revisa la URL.`;
    else if (/timeout/i.test(msg)) hint = `Timeout conectando a ${cfg.url}. El equipo no llega al servidor de Evolution (red/ZeroTier/firewall).`;
    return { state: 'error', ok: false, reachable: false, error: msg, hint };
  }

  const { status, json, raw } = resp;
  if (status === 401 || status === 403) {
    return { state: 'error', ok: false, reachable: true, httpStatus: status, error: raw || `HTTP ${status}`, hint: 'API key invalida o sin permiso. Revisa el apikey de Evolution.' };
  }
  if (status === 404) {
    return { state: 'error', ok: false, reachable: true, httpStatus: status, error: raw || 'HTTP 404', hint: `La instancia "${cfg.instance}" no existe en Evolution. Revisa el nombre de la instancia.` };
  }
  if (status < 200 || status >= 300) {
    const msg = (json && (json.message || json.error)) || raw || `HTTP ${status}`;
    return { state: 'error', ok: false, reachable: true, httpStatus: status, error: typeof msg === 'string' ? msg : JSON.stringify(msg) };
  }

  const state = json?.instance?.state || json?.state || 'unknown';
  const ok = state === 'open';
  const hint = ok
    ? undefined
    : `La instancia respondio pero no esta conectada (estado: ${state}). Escanea el QR / reconecta la instancia en el manager de Evolution.`;
  return { state, ok, reachable: true, httpStatus: status, hint };
}

/** Formatea un numero local a formato internacional aceptado por Evolution. */
export function normalizeWhatsappNumber(value: string): string {
  const v = (value || '').trim();
  if (v.includes('@')) return v; // JID de grupo
  // Solo digitos
  return v.replace(/[^\d]/g, '');
}
