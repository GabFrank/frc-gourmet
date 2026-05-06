import { DataSource } from 'typeorm';
import { IaPromptConfig } from '../../src/app/database/entities/ia/ia-prompt-config.entity';
import { FACTURA_PROMPT_BASE, buildEffectivePrompt, hashPrompt } from './factura-import.utils';

export interface PromptEffective {
  text: string;
  version: number;
  base: string;
  adiciones: string[];
}

/**
 * Garantiza que exista IaPromptConfig#1 con el prompt base actual.
 * Si el hash del seed cambio entre versiones de la app (mejoras al prompt base
 * en codigo), actualiza promptBase en BD pero CONSERVA las adiciones del usuario,
 * y bumpea version. Las adiciones nunca se sobreescriben automaticamente.
 */
export async function ensureIaPromptConfig(dataSource: DataSource): Promise<IaPromptConfig> {
  const repo = dataSource.getRepository(IaPromptConfig);
  const seedHash = hashPrompt(FACTURA_PROMPT_BASE);
  let cfg = await repo.findOne({ where: { id: 1 as any } });
  if (!cfg) {
    cfg = repo.create({
      promptBase: FACTURA_PROMPT_BASE,
      promptAdicionesJson: '[]',
      version: 1,
      baseSeedHash: seedHash,
    });
    return await repo.save(cfg);
  }
  if (cfg.baseSeedHash !== seedHash) {
    cfg.promptBase = FACTURA_PROMPT_BASE;
    cfg.baseSeedHash = seedHash;
    cfg.version = (cfg.version || 1) + 1;
    return await repo.save(cfg);
  }
  return cfg;
}

export function parseAdiciones(cfg: IaPromptConfig): string[] {
  try {
    const arr = JSON.parse(cfg.promptAdicionesJson || '[]');
    if (Array.isArray(arr)) return arr.filter(s => typeof s === 'string');
    return [];
  } catch {
    return [];
  }
}

export async function loadEffectivePrompt(dataSource: DataSource): Promise<PromptEffective> {
  const cfg = await ensureIaPromptConfig(dataSource);
  const adiciones = parseAdiciones(cfg);
  return {
    text: buildEffectivePrompt(cfg.promptBase, adiciones),
    version: cfg.version,
    base: cfg.promptBase,
    adiciones,
  };
}

export async function setAdiciones(dataSource: DataSource, adiciones: string[]): Promise<IaPromptConfig> {
  const repo = dataSource.getRepository(IaPromptConfig);
  const cfg = await ensureIaPromptConfig(dataSource);
  const limpias = (adiciones || [])
    .map(s => (s || '').trim())
    .filter(s => s.length > 0)
    .slice(0, 50);
  cfg.promptAdicionesJson = JSON.stringify(limpias);
  cfg.version = (cfg.version || 1) + 1;
  return await repo.save(cfg);
}
