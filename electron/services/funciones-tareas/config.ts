/**
 * Configuración clave/valor de FT (`ft_config`). El motor arranca APAGADO: sin la fila
 * `activo` = 'true' no genera nada (§4, §10 A3).
 */
import { DataSource, EntityManager } from 'typeorm';
import { FtConfig } from '../../../src/app/database/entities/rrhh/funciones-tareas/ft-config.entity';

export const FT_CLAVES = {
  ACTIVO: 'activo',
  INTERVALO_MIN: 'intervalo_min',
  GRUPO_ADM_DESTINO: 'grupo_adm_destino',
  UMBRAL_REINCIDENCIA: 'umbral_reincidencia',
  VENTANA_REINCIDENCIA_DIAS: 'ventana_reincidencia_dias',
  /** Teléfono del encargado cuando la plantilla no tiene cargo verificador con teléfono. */
  ENCARGADO_DESTINO: 'encargado_destino',
  /** Canal del aviso «ausente con tarea crítica» (APP | WHATSAPP | AMBOS | GERENTE). */
  CANAL_AUSENTE: 'canal_ausente',
  /** Tope de la foto de evidencia, en KB. */
  FOTO_MAX_KB: 'foto_max_kb',
  /** Internas del motor: no se escriben desde ft-config-set. */
  MOTOR_LOCK: 'motor_lock',
  ULTIMO_TICK: 'ultimo_tick',
} as const;

/** Claves que se pueden cambiar desde la app, con su validación. */
export const FT_CONFIG_EDITABLE: Record<string, (v: string) => boolean> = {
  [FT_CLAVES.ACTIVO]: (v) => v === 'true' || v === 'false',
  [FT_CLAVES.INTERVALO_MIN]: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 60,
  [FT_CLAVES.GRUPO_ADM_DESTINO]: (v) => v.length <= 200,
  [FT_CLAVES.UMBRAL_REINCIDENCIA]: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 100,
  [FT_CLAVES.VENTANA_REINCIDENCIA_DIAS]: (v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 365,
  [FT_CLAVES.ENCARGADO_DESTINO]: (v) => v === '' || /^\+?[\d ()-]{6,30}$/.test(v),
  [FT_CLAVES.CANAL_AUSENTE]: (v) => ['APP', 'WHATSAPP', 'AMBOS', 'GERENTE'].includes(v),
  [FT_CLAVES.FOTO_MAX_KB]: (v) => /^\d+$/.test(v) && Number(v) >= 50 && Number(v) <= 10240,
};

export const FT_CONFIG_DEFAULTS: Record<string, string> = {
  [FT_CLAVES.ACTIVO]: 'false',
  [FT_CLAVES.INTERVALO_MIN]: '5',
  [FT_CLAVES.GRUPO_ADM_DESTINO]: '',
  [FT_CLAVES.UMBRAL_REINCIDENCIA]: '3',
  [FT_CLAVES.VENTANA_REINCIDENCIA_DIAS]: '30',
  [FT_CLAVES.ENCARGADO_DESTINO]: '',
  [FT_CLAVES.CANAL_AUSENTE]: 'APP',
  [FT_CLAVES.FOTO_MAX_KB]: '2048',
};

/** Valor de la config o su default. */
export async function configFt(db: Db, clave: string): Promise<string> {
  return (await leerConfigFt(db, clave)) ?? FT_CONFIG_DEFAULTS[clave] ?? '';
}

/** Entero de la config dentro de [min, max]; si no, el default. */
export async function configFtEntero(db: Db, clave: string, min: number, max: number): Promise<number> {
  const n = Number(await configFt(db, clave));
  return Number.isInteger(n) && n >= min && n <= max ? n : Number(FT_CONFIG_DEFAULTS[clave]);
}

type Db = DataSource | EntityManager;

export async function leerConfigFt(db: Db, clave: string): Promise<string | null> {
  const fila = await db.getRepository(FtConfig).findOne({ where: { clave } as any });
  return fila?.valor ?? null;
}

export async function escribirConfigFt(db: Db, clave: string, valor: string | null): Promise<void> {
  const repo = db.getRepository(FtConfig);
  const fila = await repo.findOne({ where: { clave } as any });
  if (fila) {
    await repo.update({ id: fila.id } as any, { valor } as any);
    return;
  }
  try {
    await repo.insert({ clave, valor } as any);
  } catch {
    // Otra PC la insertó al mismo tiempo (UNIQUE clave): se actualiza.
    await repo.update({ clave } as any, { valor } as any);
  }
}

export async function motorFtActivo(db: Db): Promise<boolean> {
  return (await leerConfigFt(db, FT_CLAVES.ACTIVO)) === 'true';
}

export async function intervaloMotorMin(db: Db): Promise<number> {
  const n = Number(await leerConfigFt(db, FT_CLAVES.INTERVALO_MIN));
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : 5;
}
