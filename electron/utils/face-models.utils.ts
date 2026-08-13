import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

/**
 * Gestión de los modelos de @vladmandic/human para el fichaje facial.
 *
 * Los modelos se descargan a `userData/face-models/` (carpeta escribible, funciona
 * en la app empaquetada) y el server los sirve por HTTP en `/face-models/`. La descarga
 * se dispara con un botón in-app (Configuración → Reconocimiento facial).
 */

const BASE_URL = 'https://vladmandic.github.io/human-models/models/';
export const FACE_MODELS = ['blazeface', 'facemesh', 'faceres', 'antispoof', 'liveness'];

export function getFaceModelsDir(): string {
  const dir = path.join(app.getPath('userData'), 'face-models');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface FaceModelsStatus {
  installed: boolean;
  totalBytes: number;
  models: { name: string; present: boolean }[];
}

/** Estado de instalación de los modelos (qué hay en userData/face-models). */
export function getFaceModelsStatus(): FaceModelsStatus {
  const dir = getFaceModelsDir();
  let totalBytes = 0;
  const models = FACE_MODELS.map((name) => {
    const jsonPath = path.join(dir, `${name}.json`);
    const present = fs.existsSync(jsonPath);
    return { name, present };
  });
  for (const file of fs.readdirSync(dir)) {
    try { totalBytes += fs.statSync(path.join(dir, file)).size; } catch { /* ignore */ }
  }
  return { installed: models.every((m) => m.present), totalBytes, models };
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} para ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

export type DownloadProgress = (p: { model: string; index: number; total: number }) => void;

/** Descarga los modelos faltantes (o todos) a userData/face-models. */
export async function downloadFaceModels(onProgress?: DownloadProgress): Promise<FaceModelsStatus> {
  const dir = getFaceModelsDir();
  for (let i = 0; i < FACE_MODELS.length; i++) {
    const model = FACE_MODELS[i];
    onProgress?.({ model, index: i + 1, total: FACE_MODELS.length });
    const jsonBuf = await fetchBuffer(BASE_URL + `${model}.json`);
    fs.writeFileSync(path.join(dir, `${model}.json`), jsonBuf);
    let manifest: any;
    try {
      manifest = JSON.parse(jsonBuf.toString('utf8'));
    } catch (e: any) {
      throw new Error(`Modelo ${model}: JSON inválido (${e.message})`);
    }
    const paths = new Set<string>();
    for (const group of manifest.weightsManifest || []) {
      for (const p of group.paths || []) paths.add(p);
    }
    for (const p of paths) {
      const buf = await fetchBuffer(BASE_URL + p);
      fs.writeFileSync(path.join(dir, p), buf);
    }
  }
  return getFaceModelsStatus();
}
