import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { ConfiguracionRrhh } from '../../src/app/database/entities/rrhh/configuracion-rrhh.entity';
import { ConfiguracionRrhhTipo } from '../../src/app/database/entities/rrhh/configuracion-rrhh-tipo.enum';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';

interface SeedItem {
  clave: string;
  valor: string;
  tipo: ConfiguracionRrhhTipo;
  descripcion: string;
}

const SEED_CONFIG: SeedItem[] = [
  // IPS
  { clave: 'IPS_PORCENTAJE_FUNCIONARIO', valor: '9', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Aporte IPS del funcionario (%) - PY' },
  { clave: 'IPS_PORCENTAJE_PATRONAL', valor: '16.5', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Aporte IPS patronal (%) - PY' },
  // Salario
  { clave: 'SALARIO_MINIMO_LEGAL_PYG', valor: '2798309', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Salario minimo legal en PYG (referencia 2026 - actualizar segun corresponda)' },
  // Vacaciones
  { clave: 'DIAS_VACACIONES_HASTA_5A', valor: '12', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Dias habiles vacaciones hasta 5 anios de servicio' },
  { clave: 'DIAS_VACACIONES_5_10A', valor: '18', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Dias habiles vacaciones entre 5 y 10 anios de servicio' },
  { clave: 'DIAS_VACACIONES_MAS_10A', valor: '30', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Dias habiles vacaciones con mas de 10 anios de servicio' },
  { clave: 'PRESCRIPCION_VACACIONES_MESES', valor: '24', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Meses despues de los cuales prescriben las vacaciones no gozadas' },
  // Indemnizacion
  { clave: 'INDEMNIZACION_DIAS_POR_ANIO', valor: '15', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Dias jornales por anio trabajado en despido injustificado - PY' },
  { clave: 'INDEMNIZACION_ANTIGUEDAD_MIN_DIAS', valor: '90', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Antiguedad minima (dias) para tener derecho a indemnizacion' },
  // Horas extra
  { clave: 'RECARGO_HE_DIURNA', valor: '50', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Recargo (%) horas extra diurnas - PY' },
  { clave: 'RECARGO_HE_NOCTURNA', valor: '100', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Recargo (%) horas extra nocturnas - PY' },
  { clave: 'RECARGO_HE_FERIADO', valor: '100', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Recargo (%) horas extra en feriado - PY' },
  // Asistencia / Cierre
  { clave: 'TOLERANCIA_TARDANZA_MIN', valor: '5', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Minutos de tolerancia para tardanza' },
  { clave: 'PENALIZACION_AUTO_TARDANZA', valor: 'true', tipo: ConfiguracionRrhhTipo.BOOLEAN, descripcion: 'Generar penalizacion automatica al detectar tardanza > tolerancia' },
  { clave: 'PENALIZACION_MONTO_TARDANZA', valor: '0', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Monto fijo (PYG) de la penalizacion automatica por tardanza. Si es 0, se genera la penalizacion sin descuento monetario' },
  { clave: 'PENALIZACION_MONTO_POR_MINUTO_TARDANZA', valor: '0', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Monto (PYG) por minuto de tardanza, sumado al fijo. Si es 0, no se aplica' },
  { clave: 'DIA_CIERRE_MES', valor: '30', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Dia del mes en que se cierra el periodo de liquidacion' },
  // Productos / recetas
  { clave: 'PORCENTAJE_COSTO_SUGERIDO', valor: '35', tipo: ConfiguracionRrhhTipo.NUMBER, descripcion: 'Porcentaje del precio final que representa el costo, para sugerir precio en recetas. Ej: 35 => el costo es 35% del precio, precio sugerido = costo / 0.35' },
];

export async function seedConfiguracionRrhh(dataSource: DataSource) {
  const repo = dataSource.getRepository(ConfiguracionRrhh);
  for (const seed of SEED_CONFIG) {
    const existing = await repo.findOne({ where: { clave: seed.clave } });
    if (!existing) {
      const entity = repo.create({
        clave: seed.clave,
        valor: seed.valor,
        tipo: seed.tipo,
        descripcion: seed.descripcion,
        activo: true,
      });
      await repo.save(entity);
    }
  }
}

/**
 * Helper interno para obtener un valor de configuracion. Usar desde otros handlers.
 */
export async function getConfig(dataSource: DataSource, clave: string): Promise<string | null> {
  const repo = dataSource.getRepository(ConfiguracionRrhh);
  const cfg = await repo.findOne({ where: { clave, activo: true } });
  return cfg?.valor ?? null;
}

export async function getConfigNumber(dataSource: DataSource, clave: string, defaultValue: number = 0): Promise<number> {
  const v = await getConfig(dataSource, clave);
  if (v === null) return defaultValue;
  const n = parseFloat(v);
  return isNaN(n) ? defaultValue : n;
}

export async function getConfigBoolean(dataSource: DataSource, clave: string, defaultValue: boolean = false): Promise<boolean> {
  const v = await getConfig(dataSource, clave);
  if (v === null) return defaultValue;
  return v === 'true' || v === '1';
}

export function registerConfiguracionRrhhHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('get-configuraciones-rrhh', async () => {
    try {
      const repo = dataSource.getRepository(ConfiguracionRrhh);
      return await repo.find({ order: { clave: 'ASC' } });
    } catch (error) {
      console.error('Error getting configuraciones rrhh:', error);
      throw error;
    }
  });

  ipcMain.handle('get-configuracion-rrhh', async (_event, clave: string) => {
    try {
      const repo = dataSource.getRepository(ConfiguracionRrhh);
      return await repo.findOne({ where: { clave } });
    } catch (error) {
      console.error(`Error getting configuracion rrhh ${clave}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-configuracion-rrhh', async (_event, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
      const repo = dataSource.getRepository(ConfiguracionRrhh);
      const entity = repo.create({
        clave: (data.clave || '').toUpperCase(),
        valor: data.valor,
        tipo: data.tipo || ConfiguracionRrhhTipo.STRING,
        descripcion: data.descripcion,
        activo: data.activo !== false,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating configuracion rrhh:', error);
      throw error;
    }
  });

  ipcMain.handle('update-configuracion-rrhh', async (_event, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
      const repo = dataSource.getRepository(ConfiguracionRrhh);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`ConfiguracionRrhh ${id} no encontrado`);
      if (data.valor !== undefined) existing.valor = data.valor;
      if (data.tipo !== undefined) existing.tipo = data.tipo;
      if (data.descripcion !== undefined) existing.descripcion = data.descripcion;
      if (data.activo !== undefined) existing.activo = data.activo;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error updating configuracion rrhh ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-configuracion-rrhh', async (_event, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
      const repo = dataSource.getRepository(ConfiguracionRrhh);
      await repo.delete(id);
      return { success: true };
    } catch (error) {
      console.error(`Error deleting configuracion rrhh ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('seed-configuracion-rrhh', async () => {
    try {
      await seedConfiguracionRrhh(dataSource);
      return { success: true };
    } catch (error) {
      console.error('Error seeding configuracion rrhh:', error);
      throw error;
    }
  });
}
