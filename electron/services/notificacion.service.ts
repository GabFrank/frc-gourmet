import { DataSource } from 'typeorm';
import { ConfiguracionNotificacion } from '../../src/app/database/entities/notificaciones/configuracion-notificacion.entity';
import { EventoNotificacion } from '../../src/app/database/entities/notificaciones/evento-notificacion.entity';
import { ReceptorNotificacion } from '../../src/app/database/entities/notificaciones/receptor-notificacion.entity';
import { SuscripcionNotificacion } from '../../src/app/database/entities/notificaciones/suscripcion-notificacion.entity';
import { LogNotificacion } from '../../src/app/database/entities/notificaciones/log-notificacion.entity';
import {
  CanalNotificacion,
  CanalEvento,
  TipoReceptor,
  EstadoEnvioNotificacion,
} from '../../src/app/database/entities/notificaciones/notificaciones-enums';
import { SmtpConfig, sendEmail } from './email.service';
import { EvolutionConfig, sendWhatsappText, normalizeWhatsappNumber } from './whatsapp.service';
import { getSmtpPassword, getEvolutionApiKey } from '../utils/notificaciones-secrets.util';

// Claves de configuracion (ConfiguracionNotificacion)
export const CFG = {
  GLOBAL_ACTIVO: 'NOTIF_GLOBAL_ACTIVO',
  SMTP_HOST: 'NOTIF_SMTP_HOST',
  SMTP_PORT: 'NOTIF_SMTP_PORT',
  SMTP_SECURE: 'NOTIF_SMTP_SECURE',
  SMTP_USER: 'NOTIF_SMTP_USER',
  SMTP_FROM: 'NOTIF_SMTP_FROM',
  SMTP_FROM_NAME: 'NOTIF_SMTP_FROM_NAME',
  EVOLUTION_URL: 'NOTIF_EVOLUTION_URL',
  EVOLUTION_INSTANCE: 'NOTIF_EVOLUTION_INSTANCE',
} as const;

let _dataSource: DataSource | null = null;

export function setNotificacionDataSource(ds: DataSource): void {
  _dataSource = ds;
}

function ds(): DataSource {
  if (!_dataSource) throw new Error('notificacion.service: dataSource no inicializado');
  return _dataSource;
}

// ===================== Lectura de configuracion =====================

async function getConfigMap(): Promise<Map<string, string>> {
  const repo = ds().getRepository(ConfiguracionNotificacion);
  const all = await repo.find();
  const map = new Map<string, string>();
  for (const c of all) {
    if (c.activo) map.set(c.clave, c.valor ?? '');
  }
  return map;
}

function asBool(v: string | undefined, def = false): boolean {
  if (v === undefined) return def;
  return v === 'true' || v === '1';
}

export async function isGlobalActivo(): Promise<boolean> {
  const map = await getConfigMap();
  return asBool(map.get(CFG.GLOBAL_ACTIVO), false);
}

export async function buildSmtpConfig(): Promise<SmtpConfig> {
  const map = await getConfigMap();
  return {
    host: map.get(CFG.SMTP_HOST) || '',
    port: parseInt(map.get(CFG.SMTP_PORT) || '587', 10),
    secure: asBool(map.get(CFG.SMTP_SECURE), false),
    user: map.get(CFG.SMTP_USER) || '',
    from: map.get(CFG.SMTP_FROM) || '',
    fromName: map.get(CFG.SMTP_FROM_NAME) || '',
  };
}

export async function buildEvolutionConfig(): Promise<EvolutionConfig> {
  const map = await getConfigMap();
  return {
    url: map.get(CFG.EVOLUTION_URL) || '',
    instance: map.get(CFG.EVOLUTION_INSTANCE) || '',
  };
}

// ===================== Envio de bajo nivel + log =====================

async function yaEnviado(claveDedupe?: string): Promise<boolean> {
  if (!claveDedupe) return false;
  const repo = ds().getRepository(LogNotificacion);
  const existe = await repo.findOne({
    where: { claveDedupe, estado: EstadoEnvioNotificacion.ENVIADO },
  });
  return !!existe;
}

async function registrarLog(data: Partial<LogNotificacion>): Promise<void> {
  try {
    const repo = ds().getRepository(LogNotificacion);
    const entity = repo.create({ fechaEnvio: new Date(), ...data });
    await repo.save(entity);
  } catch (e) {
    // Una violacion de unique (claveDedupe) significa que ya se logueo: ignorar.
    console.warn('[notificacion] no se pudo registrar log:', (e as Error).message);
  }
}

export interface EnvioResult {
  canal: CanalNotificacion;
  destino: string;
  estado: EstadoEnvioNotificacion;
  error?: string;
  messageId?: string;
}

/**
 * Envia un mensaje a un destino concreto por un canal, validando el switch
 * global, deduplicando y registrando en el log. No valida suscripciones (eso lo
 * hace dispatchEvento). Usado tambien por password reset (envio directo).
 */
export async function enviarDirecto(params: {
  canal: CanalNotificacion;
  destino: string;
  destinoNombre?: string;
  eventoCodigo: string;
  asunto: string;
  /** Cuerpo HTML para email. */
  html?: string;
  /** Texto plano (whatsapp y fallback email). */
  texto?: string;
  claveDedupe?: string;
  /** Si true, ignora el switch global (ej. password reset de seguridad). */
  bypassGlobal?: boolean;
}): Promise<EnvioResult> {
  const { canal, destino, destinoNombre, eventoCodigo, asunto, html, texto, claveDedupe, bypassGlobal } = params;

  if (!bypassGlobal && !(await isGlobalActivo())) {
    await registrarLog({
      eventoCodigo, canal, destino, destinoNombre,
      estado: EstadoEnvioNotificacion.OMITIDO, asunto, mensaje: texto || asunto,
      error: 'Notificaciones globales desactivadas',
    });
    return { canal, destino, estado: EstadoEnvioNotificacion.OMITIDO, error: 'GLOBAL_OFF' };
  }

  if (await yaEnviado(claveDedupe)) {
    return { canal, destino, estado: EstadoEnvioNotificacion.OMITIDO, error: 'DUPLICADO' };
  }

  try {
    let messageId = '';
    if (canal === CanalNotificacion.EMAIL) {
      const cfg = await buildSmtpConfig();
      const pass = await getSmtpPassword();
      const res = await sendEmail(cfg, pass, destino, asunto, html || (texto || ''), texto);
      messageId = res.messageId;
    } else {
      const cfg = await buildEvolutionConfig();
      const apikey = await getEvolutionApiKey();
      const res = await sendWhatsappText(cfg, apikey, normalizeWhatsappNumber(destino), texto || asunto);
      messageId = res.id;
    }
    await registrarLog({
      eventoCodigo, canal, destino, destinoNombre,
      estado: EstadoEnvioNotificacion.ENVIADO, asunto, mensaje: texto || asunto,
      proveedorMessageId: messageId, claveDedupe,
    });
    return { canal, destino, estado: EstadoEnvioNotificacion.ENVIADO, messageId };
  } catch (e) {
    const error = (e as Error).message || String(e);
    await registrarLog({
      eventoCodigo, canal, destino, destinoNombre,
      estado: EstadoEnvioNotificacion.FALLIDO, asunto, mensaje: texto || asunto, error,
    });
    return { canal, destino, estado: EstadoEnvioNotificacion.FALLIDO, error };
  }
}

// ===================== Resolucion de destino por receptor =====================

function destinoEmail(receptor: ReceptorNotificacion): string | null {
  if (receptor.tipo === TipoReceptor.EMAIL) return receptor.valor || null;
  if (receptor.tipo === TipoReceptor.PERSONA) return receptor.persona?.email || null;
  return null;
}

function destinoWhatsapp(receptor: ReceptorNotificacion): string | null {
  if (receptor.tipo === TipoReceptor.NUMERO || receptor.tipo === TipoReceptor.GRUPO_WHATSAPP) {
    return receptor.valor || null;
  }
  if (receptor.tipo === TipoReceptor.PERSONA) return receptor.persona?.telefono || null;
  return null;
}

// ===================== Dispatch de un evento =====================

export interface DispatchPayload {
  /** Asunto del email / titulo. */
  asunto: string;
  /** Cuerpo HTML para email (si el evento va por email). */
  html?: string;
  /** Texto para whatsapp y fallback de email. */
  texto: string;
  /** Sufijo opcional para la clave de dedupe (ej id de la caja). */
  dedupeKey?: string;
}

/**
 * Despacha un evento a todos sus receptores suscriptos. Valida switch global,
 * que el evento este activo, y rutea por el canal de cada suscripcion.
 * Devuelve el detalle de cada envio (para logging/diagnostico).
 */
export async function dispatchEvento(eventoCodigo: string, payload: DispatchPayload): Promise<EnvioResult[]> {
  const results: EnvioResult[] = [];

  if (!(await isGlobalActivo())) return results;

  const eventoRepo = ds().getRepository(EventoNotificacion);
  const evento = await eventoRepo.findOne({ where: { codigo: eventoCodigo } });
  if (!evento || !evento.activo) return results;

  const suscRepo = ds().getRepository(SuscripcionNotificacion);
  const suscripciones = await suscRepo.find({
    where: { evento: { id: evento.id }, activo: true },
    relations: ['receptor', 'receptor.persona'],
  });

  for (const susc of suscripciones) {
    const receptor = susc.receptor;
    if (!receptor || !receptor.activo) continue;

    // El canal de la suscripcion debe ser compatible con el canal del evento.
    if (evento.canal !== CanalEvento.AMBOS) {
      if (evento.canal === CanalEvento.EMAIL && susc.canal !== CanalNotificacion.EMAIL) continue;
      if (evento.canal === CanalEvento.WHATSAPP && susc.canal !== CanalNotificacion.WHATSAPP) continue;
    }

    const destino =
      susc.canal === CanalNotificacion.EMAIL ? destinoEmail(receptor) : destinoWhatsapp(receptor);
    if (!destino) {
      await registrarLog({
        eventoCodigo, canal: susc.canal, destinoNombre: receptor.nombre,
        estado: EstadoEnvioNotificacion.OMITIDO, asunto: payload.asunto, mensaje: payload.texto,
        error: 'Receptor sin destino para el canal',
      });
      continue;
    }

    const claveDedupe = payload.dedupeKey
      ? `${eventoCodigo}-${susc.canal}-${receptor.id}-${payload.dedupeKey}`
      : undefined;

    const res = await enviarDirecto({
      canal: susc.canal,
      destino,
      destinoNombre: receptor.nombre,
      eventoCodigo,
      asunto: payload.asunto,
      html: payload.html,
      texto: payload.texto,
      claveDedupe,
    });
    results.push(res);
  }

  return results;
}
