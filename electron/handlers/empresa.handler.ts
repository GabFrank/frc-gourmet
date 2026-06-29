import { app, ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Empresa } from '../../src/app/database/entities/sistema/empresa.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';
import { updateAppSettings } from '../utils/app-settings.utils';

/**
 * Normaliza un string a UPPERCASE + trim; devuelve null si queda vacio o
 * undefined (para que el upsert no toque la columna). Espacios multiples se
 * colapsan para evitar guardar variantes "FOO  BAR" / "FOO BAR".
 */
function toUpperOrNull(value: any): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().replace(/\s+/g, ' ');
  if (s.length === 0) return null;
  return s.toUpperCase();
}

/** Trim sin uppercase — para campos donde mayusculas no aplican (email, sitioWeb, telefono). */
function toTrimOrNull(value: any): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length === 0 ? null : s;
}

/** Empresa singleton: always id=1. Si no existe, se crea con defaults. */
async function getOrCreateEmpresa(dataSource: DataSource, currentUser: Usuario | null): Promise<Empresa> {
  const repo = dataSource.getRepository(Empresa);
  let empresa = await repo.findOne({ where: { id: 1 } });
  if (!empresa) {
    empresa = repo.create({
      nombre: 'MI EMPRESA',
      pais: 'PARAGUAY',
      zonaHoraria: 'America/Asuncion',
    });
    await setEntityUserTracking(dataSource, empresa, currentUser?.id, false);
    empresa = await repo.save(empresa);
  }
  return empresa;
}

export function registerEmpresaHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('get-empresa', async (): Promise<Empresa> => {
    return getOrCreateEmpresa(dataSource, getCurrentUser());
  });

  ipcMain.handle('update-empresa', async (_event, data: Partial<Empresa>): Promise<Empresa> => {
    await ensurePermission(dataSource, getCurrentUser, 'EMPRESA_CONFIGURAR');
    const repo = dataSource.getRepository(Empresa);
    const currentUser = getCurrentUser();
    const existing = await getOrCreateEmpresa(dataSource, currentUser);

    // Asignacion campo a campo aplicando UPPERCASE donde corresponde. Los
    // campos que llegan como undefined no se tocan; los que llegan como null
    // o string vacio se nulean explicitamente (con `as any` para sortear el
    // tipado del Partial — ver feedback_typeorm_null_undefined).
    if ('nombre' in data) {
      const v = toUpperOrNull(data.nombre);
      if (v !== null) existing.nombre = v; // nombre es NOT NULL — ignora vacio
    }
    if ('nombreComercial' in data) (existing as any).nombreComercial = toUpperOrNull(data.nombreComercial);
    if ('razonSocial' in data) (existing as any).razonSocial = toUpperOrNull(data.razonSocial);
    if ('ruc' in data) (existing as any).ruc = toTrimOrNull(data.ruc);
    if ('direccion' in data) (existing as any).direccion = toUpperOrNull(data.direccion);
    if ('telefono' in data) (existing as any).telefono = toTrimOrNull(data.telefono);
    if ('email' in data) (existing as any).email = toTrimOrNull(data.email);
    if ('sitioWeb' in data) (existing as any).sitioWeb = toTrimOrNull(data.sitioWeb);
    if ('logoUrl' in data) (existing as any).logoUrl = toTrimOrNull(data.logoUrl);
    if ('timbradoNumero' in data) (existing as any).timbradoNumero = toTrimOrNull(data.timbradoNumero);
    if ('timbradoVigenciaHasta' in data) {
      const raw = data.timbradoVigenciaHasta;
      (existing as any).timbradoVigenciaHasta = raw ? new Date(raw as any) : null;
    }
    if ('puntoExpedicion' in data) (existing as any).puntoExpedicion = toTrimOrNull(data.puntoExpedicion);
    if ('pais' in data) {
      const v = toUpperOrNull(data.pais);
      if (v !== null) existing.pais = v;
    }
    if ('zonaHoraria' in data) {
      const v = toTrimOrNull(data.zonaHoraria);
      if (v !== null) {
        existing.zonaHoraria = v;
        // Espejar la zona horaria a app-settings (se lee sync al arranque para
        // setear process.env.TZ antes de createWindow) y aplicarla en vivo al
        // proceso main. El renderer toma la nueva zona al reiniciar la app.
        try {
          updateAppSettings(app.getPath('userData'), (s) => ({ ...s, timezone: v }));
          process.env.TZ = v;
        } catch (e) {
          console.warn('[empresa] no se pudo persistir timezone en app-settings:', e);
        }
      }
    }
    if ('monedaPrincipalId' in data) {
      const v = data.monedaPrincipalId;
      (existing as any).monedaPrincipalId = (v === null || v === undefined || v === '' as any) ? null : Number(v);
    }
    if ('actividadEconomica' in data) (existing as any).actividadEconomica = toUpperOrNull(data.actividadEconomica);

    await setEntityUserTracking(dataSource, existing, currentUser?.id, true);
    return repo.save(existing);
  });
}
