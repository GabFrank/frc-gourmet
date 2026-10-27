/**
 * Fotos de evidencia de tareas FT (§10 B6): carpeta propia `userData/ft-evidencias`, guardado
 * propio (sin derivadas) y tope de tamaño que valida el handler ANTES de escribir nada.
 * Solo JPEG, PNG o WEBP, reconocidos por su firma (no por la extensión que manda el cliente).
 * Servido como `app://ft-evidencias/<archivo>` (bucket registrado en file-save.utils y main.ts).
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

export const CARPETA_EVIDENCIAS_FT = 'ft-evidencias';

export class ErrorEvidenciaFt extends Error {
  constructor(public code: 'FOTO_EXCEDIDA' | 'FOTO_INVALIDA', mensaje: string) {
    super(mensaje);
  }
}

/** Bytes que ocupará un base64 (sin el prefijo data:), sin decodificarlo. */
export function bytesDeBase64(b64: string): number {
  const limpio = b64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const relleno = limpio.endsWith('==') ? 2 : limpio.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((limpio.length * 3) / 4) - relleno);
}

function extensionDe(buf: Buffer): '.jpg' | '.png' | '.webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return '.webp';
  return null;
}

/**
 * Valida y guarda la foto. Lanza `ErrorEvidenciaFt` si excede `maxBytes` (medido sobre el
 * base64, antes de decodificar) o si no es una imagen JPEG/PNG/WEBP.
 */
export function guardarEvidenciaFt(base64: string, tareaId: number, maxBytes: number): { url: string; bytes: number } {
  if (typeof base64 !== 'string' || !base64.length) throw new ErrorEvidenciaFt('FOTO_INVALIDA', 'FALTA LA FOTO');
  const bytes = bytesDeBase64(base64);
  if (bytes > maxBytes) {
    throw new ErrorEvidenciaFt('FOTO_EXCEDIDA', `LA FOTO PESA ${Math.ceil(bytes / 1024)} KB; EL MÁXIMO ES ${Math.floor(maxBytes / 1024)} KB`);
  }
  const buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buf.length > maxBytes) throw new ErrorEvidenciaFt('FOTO_EXCEDIDA', `EL MÁXIMO ES ${Math.floor(maxBytes / 1024)} KB`);
  const ext = extensionDe(buf);
  if (!ext) throw new ErrorEvidenciaFt('FOTO_INVALIDA', 'LA EVIDENCIA TIENE QUE SER UNA FOTO (JPG, PNG O WEBP)');
  const dir = path.join(app.getPath('userData'), CARPETA_EVIDENCIAS_FT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const nombre = `ftev-${tareaId}-${Date.now()}-${randomBytes(3).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(dir, nombre), buf, { flag: 'wx' });
  return { url: `app://${CARPETA_EVIDENCIAS_FT}/${nombre}`, bytes: buf.length };
}

const RE_URL_EVIDENCIA = /^app:\/\/ft-evidencias\/ftev-(\d+)-[A-Za-z0-9-]+\.(jpg|png|webp)$/;

/**
 * Si una URL de evidencia es de la carpeta propia, con el nombre que pone `guardarEvidenciaFt`
 * (`ftev-<tareaId>-<ts>-<rand>.jpg|png|webp`). Con `tareaId`, además tiene que ser de ESA tarea (lo único
 * que acepta ft-tarea-marcar: no se reusa la foto de otra tarea).
 */
export function esUrlEvidenciaFt(url: string, tareaId?: number): boolean {
  const m = RE_URL_EVIDENCIA.exec(String(url ?? ''));
  if (!m) return false;
  return tareaId === undefined || Number(m[1]) === Number(tareaId);
}

/** Borra (best effort) la foto de evidencia de esa tarea. Solo archivos `ftev-<tareaId>-…`. */
export function borrarEvidenciaFt(url: string | null | undefined, tareaId: number): boolean {
  if (!url || !esUrlEvidenciaFt(url, tareaId)) return false;
  try {
    const abs = path.join(app.getPath('userData'), CARPETA_EVIDENCIAS_FT, url.replace(`app://${CARPETA_EVIDENCIAS_FT}/`, ''));
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    return true;
  } catch (e: any) {
    console.warn('[ft-evidencias] no se pudo borrar', url, e?.message ?? e);
    return false;
  }
}
