import * as fs from 'fs';
import * as path from 'path';

export interface IaConfig {
  openaiApiKey: string;
  modelo: string;
  habilitado: boolean;
}

export const DEFAULT_IA_CONFIG: IaConfig = {
  openaiApiKey: '',
  modelo: 'gpt-4o',
  habilitado: false,
};

const CONFIG_FILE_NAME = 'ia-config.json';

export function getIaConfigPath(userDataPath: string): string {
  return path.join(userDataPath, CONFIG_FILE_NAME);
}

export function readIaConfig(userDataPath: string): IaConfig {
  const p = getIaConfigPath(userDataPath);
  if (!fs.existsSync(p)) {
    return { ...DEFAULT_IA_CONFIG };
  }
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_IA_CONFIG, ...parsed };
  } catch (e) {
    console.warn('No se pudo leer ia-config.json, usando default:', e);
    return { ...DEFAULT_IA_CONFIG };
  }
}

export function writeIaConfig(userDataPath: string, config: IaConfig): void {
  const p = getIaConfigPath(userDataPath);
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8');
}

export function getFacturaImportsDir(userDataPath: string): string {
  const dir = path.join(userDataPath, 'factura-imports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
