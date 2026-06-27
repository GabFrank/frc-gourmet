import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { ConfiguracionNotificacion } from '../../src/app/database/entities/notificaciones/configuracion-notificacion.entity';
import { EventoNotificacion } from '../../src/app/database/entities/notificaciones/evento-notificacion.entity';
import { ReceptorNotificacion } from '../../src/app/database/entities/notificaciones/receptor-notificacion.entity';
import { SuscripcionNotificacion } from '../../src/app/database/entities/notificaciones/suscripcion-notificacion.entity';
import { LogNotificacion } from '../../src/app/database/entities/notificaciones/log-notificacion.entity';
import {
  ConfiguracionNotificacionTipo,
  CanalEvento,
  CanalNotificacion,
  TipoReceptor,
} from '../../src/app/database/entities/notificaciones/notificaciones-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';
import {
  setSmtpPassword,
  setEvolutionApiKey,
  getSecretsStatus,
} from '../utils/notificaciones-secrets.util';
import { resetEmailTransporter } from '../services/email.service';
import {
  CFG,
  enviarDirecto,
  buildEvolutionConfig,
} from '../services/notificacion.service';
import { getEvolutionApiKey } from '../utils/notificaciones-secrets.util';
import { fetchEvolutionState } from '../services/whatsapp.service';

const PERM = 'NOTIFICACIONES_CONFIGURAR';

// ===================== SEED =====================

interface SeedCfg { clave: string; valor: string; tipo: ConfiguracionNotificacionTipo; descripcion: string; }

const SEED_CONFIG: SeedCfg[] = [
  { clave: CFG.GLOBAL_ACTIVO, valor: 'false', tipo: ConfiguracionNotificacionTipo.BOOLEAN, descripcion: 'Interruptor maestro: habilita/deshabilita TODO el envio de notificaciones' },
  { clave: CFG.SMTP_HOST, valor: 'smtp.gmail.com', tipo: ConfiguracionNotificacionTipo.STRING, descripcion: 'Servidor SMTP (Gmail: smtp.gmail.com)' },
  { clave: CFG.SMTP_PORT, valor: '587', tipo: ConfiguracionNotificacionTipo.NUMBER, descripcion: 'Puerto SMTP (587 STARTTLS / 465 SSL)' },
  { clave: CFG.SMTP_SECURE, valor: 'false', tipo: ConfiguracionNotificacionTipo.BOOLEAN, descripcion: 'true = SSL (puerto 465); false = STARTTLS (puerto 587)' },
  { clave: CFG.SMTP_USER, valor: '', tipo: ConfiguracionNotificacionTipo.STRING, descripcion: 'Usuario SMTP (email de la cuenta emisora)' },
  { clave: CFG.SMTP_FROM, valor: '', tipo: ConfiguracionNotificacionTipo.STRING, descripcion: 'Direccion "From" (si vacio, usa el usuario SMTP)' },
  { clave: CFG.SMTP_FROM_NAME, valor: 'FRC GOURMET', tipo: ConfiguracionNotificacionTipo.STRING, descripcion: 'Nombre visible del remitente' },
  { clave: CFG.EVOLUTION_URL, valor: '', tipo: ConfiguracionNotificacionTipo.STRING, descripcion: 'URL base de Evolution API (ej http://172.25.0.172:8090)' },
  { clave: CFG.EVOLUTION_INSTANCE, valor: 'frc-alertas', tipo: ConfiguracionNotificacionTipo.STRING, descripcion: 'Nombre de la instancia de Evolution API' },
];

interface SeedEvento { codigo: string; nombre: string; descripcion: string; canal: CanalEvento; }

const SEED_EVENTOS: SeedEvento[] = [
  { codigo: 'CAJA_CIERRE', nombre: 'Cierre de caja', descripcion: 'Envia un resumen al cerrar una caja mayor', canal: CanalEvento.AMBOS },
  { codigo: 'PEDIDO_CANCELADO', nombre: 'Pedido cancelado', descripcion: 'Avisa cuando se cancela un pedido/venta', canal: CanalEvento.WHATSAPP },
  { codigo: 'MESA_CANCELADA', nombre: 'Mesa cancelada', descripcion: 'Avisa cuando se cancela una mesa', canal: CanalEvento.WHATSAPP },
  { codigo: 'CUENTA_PAGAR_VENCE', nombre: 'Vencimiento de cuenta a pagar', descripcion: 'Recuerda vencimientos de cuentas por pagar', canal: CanalEvento.WHATSAPP },
  { codigo: 'GASTO_RECURRENTE', nombre: 'Gasto recurrente proximo', descripcion: 'Avisa sobre fechas de gastos recurrentes', canal: CanalEvento.WHATSAPP },
  { codigo: 'CUMPLEANIOS_COLABORADOR', nombre: 'Cumpleanios de colaborador', descripcion: 'Avisa cumpleanios de colaboradores', canal: CanalEvento.WHATSAPP },
  { codigo: 'META_ALCANZADA', nombre: 'Meta alcanzada', descripcion: 'Avisa cuando se alcanza una meta', canal: CanalEvento.WHATSAPP },
  { codigo: 'MENSAJE_POSITIVO', nombre: 'Mensaje positivo periodico', descripcion: 'Mensajes motivacionales periodicos al grupo', canal: CanalEvento.WHATSAPP },
  { codigo: 'RECORDATORIO_TAREA', nombre: 'Recordatorio de tarea', descripcion: 'Recordatorios de tareas configuradas', canal: CanalEvento.WHATSAPP },
];

export async function seedNotificaciones(dataSource: DataSource): Promise<void> {
  const cfgRepo = dataSource.getRepository(ConfiguracionNotificacion);
  for (const s of SEED_CONFIG) {
    const existing = await cfgRepo.findOne({ where: { clave: s.clave } });
    if (!existing) {
      await cfgRepo.save(cfgRepo.create({ clave: s.clave, valor: s.valor, tipo: s.tipo, descripcion: s.descripcion, activo: true }));
    }
  }
  const evtRepo = dataSource.getRepository(EventoNotificacion);
  for (const e of SEED_EVENTOS) {
    const existing = await evtRepo.findOne({ where: { codigo: e.codigo } });
    if (!existing) {
      await evtRepo.save(evtRepo.create({ codigo: e.codigo, nombre: e.nombre, descripcion: e.descripcion, canal: e.canal, activo: true }));
    }
  }
}

// ===================== HANDLERS =====================

export function registerNotificacionesConfigHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ----- Configuracion (key/value) + estado de secretos -----
  ipcMain.handle('get-notif-config', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(ConfiguracionNotificacion);
    const items = await repo.find({ order: { clave: 'ASC' } });
    const secrets = await getSecretsStatus();
    return { items, secrets };
  });

  ipcMain.handle('update-notif-config', async (_event, items: Array<{ clave: string; valor: string }>) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(ConfiguracionNotificacion);
    for (const it of items || []) {
      const existing = await repo.findOne({ where: { clave: it.clave } });
      if (existing) {
        existing.valor = it.valor;
        await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
        await repo.save(existing);
      }
    }
    resetEmailTransporter();
    return { success: true };
  });

  ipcMain.handle('set-notif-secret', async (_event, payload: { tipo: 'smtp' | 'evolution'; valor: string }) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    if (payload.tipo === 'smtp') await setSmtpPassword(payload.valor || '');
    else if (payload.tipo === 'evolution') await setEvolutionApiKey(payload.valor || '');
    resetEmailTransporter();
    return { success: true };
  });

  // ----- Eventos (on/off por funcion) -----
  ipcMain.handle('get-notif-eventos', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(EventoNotificacion);
    return await repo.find({ order: { nombre: 'ASC' } });
  });

  ipcMain.handle('update-notif-evento', async (_event, id: number, data: { activo?: boolean; canal?: CanalEvento }) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(EventoNotificacion);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Evento ${id} no encontrado`);
    if (data.activo !== undefined) existing.activo = data.activo;
    if (data.canal !== undefined) existing.canal = data.canal;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  // ----- Receptores -----
  ipcMain.handle('get-notif-receptores', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(ReceptorNotificacion);
    return await repo.find({ relations: ['persona'], order: { nombre: 'ASC' } });
  });

  ipcMain.handle('create-notif-receptor', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(ReceptorNotificacion);
    const entity = repo.create({
      tipo: data.tipo || TipoReceptor.EMAIL,
      nombre: (data.nombre || '').toUpperCase(),
      valor: data.valor ?? null,
      persona: data.personaId ? ({ id: data.personaId } as any) : null,
      activo: data.activo !== false,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('update-notif-receptor', async (_event, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(ReceptorNotificacion);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Receptor ${id} no encontrado`);
    if (data.tipo !== undefined) existing.tipo = data.tipo;
    if (data.nombre !== undefined) existing.nombre = (data.nombre || '').toUpperCase();
    if (data.valor !== undefined) existing.valor = data.valor;
    if (data.personaId !== undefined) existing.persona = data.personaId ? ({ id: data.personaId } as any) : undefined;
    if (data.activo !== undefined) existing.activo = data.activo;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  ipcMain.handle('delete-notif-receptor', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(ReceptorNotificacion);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Receptor ${id} no encontrado`);
    existing.activo = false;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    await repo.save(existing);
    return { success: true };
  });

  // ----- Suscripciones (ruteo evento -> receptor por canal) -----
  ipcMain.handle('get-notif-suscripciones', async (_event, eventoId?: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(SuscripcionNotificacion);
    const where: any = {};
    if (eventoId) where.evento = { id: eventoId };
    return await repo.find({ where, relations: ['evento', 'receptor', 'receptor.persona'], order: { id: 'ASC' } });
  });

  ipcMain.handle('create-notif-suscripcion', async (_event, data: { eventoId: number; receptorId: number; canal: CanalNotificacion }) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(SuscripcionNotificacion);
    const existing = await repo.findOne({
      where: { evento: { id: data.eventoId }, receptor: { id: data.receptorId }, canal: data.canal },
    });
    if (existing) {
      existing.activo = true;
      return await repo.save(existing);
    }
    const entity = repo.create({
      evento: { id: data.eventoId } as any,
      receptor: { id: data.receptorId } as any,
      canal: data.canal,
      activo: true,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('delete-notif-suscripcion', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(SuscripcionNotificacion);
    await repo.delete(id);
    return { success: true };
  });

  // ----- Log de envios -----
  ipcMain.handle('get-notif-logs', async (_event, filtros?: { page?: number; pageSize?: number }) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(LogNotificacion);
    const pageSize = Number(filtros?.pageSize) || 50;
    const page = Math.max(0, Number(filtros?.page) || 0);
    const [items, total] = await repo.findAndCount({
      order: { fechaEnvio: 'DESC' },
      skip: page * pageSize,
      take: pageSize,
    });
    return { items, total };
  });

  // ----- Pruebas -----
  ipcMain.handle('test-notif-email', async (_event, to: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const res = await enviarDirecto({
      canal: CanalNotificacion.EMAIL,
      destino: to,
      destinoNombre: 'PRUEBA',
      eventoCodigo: 'TEST',
      asunto: 'PRUEBA FRC GOURMET',
      html: '<p>Este es un email de <b>prueba</b> de FRC Gourmet. Si lo recibiste, la configuracion SMTP funciona.</p>',
      texto: 'Email de prueba de FRC Gourmet. Si lo recibiste, la configuracion SMTP funciona.',
      bypassGlobal: true,
    });
    return res;
  });

  ipcMain.handle('test-notif-whatsapp', async (_event, to: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const res = await enviarDirecto({
      canal: CanalNotificacion.WHATSAPP,
      destino: to,
      destinoNombre: 'PRUEBA',
      eventoCodigo: 'TEST',
      asunto: 'PRUEBA FRC GOURMET',
      texto: '🔔 Mensaje de prueba de FRC Gourmet. Si lo recibiste, la configuracion de WhatsApp funciona.',
      bypassGlobal: true,
    });
    return res;
  });

  ipcMain.handle('get-notif-evolution-state', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    try {
      const cfg = await buildEvolutionConfig();
      const apikey = await getEvolutionApiKey();
      return await fetchEvolutionState(cfg, apikey);
    } catch (e) {
      return { state: 'error', error: (e as Error).message };
    }
  });
}
