import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const FUNCIONARIO_DOC_ROOT = 'funcionario-documentos';

function getFuncionarioDocPath(funcionarioId: number): string {
  const userDataPath = app.getPath('userData');
  const dirPath = path.join(userDataPath, FUNCIONARIO_DOC_ROOT, String(funcionarioId));
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Guarda un documento (base64 con o sin data URL prefix) en el filesystem
 * dentro de userData/funcionario-documentos/{funcionarioId}/{fileName}.
 * Retorna metadata: { rutaRelativa, tamanoBytes, mimeType }.
 */
export function saveFuncionarioDocumento(
  funcionarioId: number,
  base64Data: string,
  fileName: string,
  mimeType?: string,
): { rutaRelativa: string; tamanoBytes: number; mimeType: string } {
  const dirPath = getFuncionarioDocPath(funcionarioId);

  // Generar nombre unico (timestamp prefix) para evitar colisiones
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueName = `${Date.now()}_${sanitized}`;
  const filePath = path.join(dirPath, uniqueName);

  // Detectar mimeType del data URL si no se paso
  let detectedMime = mimeType;
  const dataUrlMatch = base64Data.match(/^data:([^;]+);base64,/);
  if (dataUrlMatch && !detectedMime) {
    detectedMime = dataUrlMatch[1];
  }
  const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  fs.writeFileSync(filePath, buffer);

  return {
    rutaRelativa: `${FUNCIONARIO_DOC_ROOT}/${funcionarioId}/${uniqueName}`,
    tamanoBytes: buffer.length,
    mimeType: detectedMime || 'application/octet-stream',
  };
}

export function deleteFuncionarioDocumento(rutaRelativa: string): boolean {
  if (!rutaRelativa || !rutaRelativa.startsWith(`${FUNCIONARIO_DOC_ROOT}/`)) return false;
  const userDataPath = app.getPath('userData');
  const filePath = path.join(userDataPath, rutaRelativa);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (e) {
      console.error('Error eliminando documento:', e);
      return false;
    }
  }
  return false;
}

export function readFuncionarioDocumentoBase64(rutaRelativa: string): string | null {
  if (!rutaRelativa) return null;
  const userDataPath = app.getPath('userData');
  const filePath = path.join(userDataPath, rutaRelativa);
  if (!fs.existsSync(filePath)) return null;
  try {
    return fs.readFileSync(filePath).toString('base64');
  } catch (e) {
    console.error('Error leyendo documento:', e);
    return null;
  }
}
