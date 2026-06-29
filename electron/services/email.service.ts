import * as nodemailer from 'nodemailer';

/**
 * Servicio de envio de email via SMTP (nodemailer). Pensado para Gmail / Google
 * Workspace con app password, pero sirve para cualquier SMTP.
 *
 * Es "puro": recibe la config + el secreto (password) ya resueltos. La lectura de
 * config/keytar la hace el orquestador (notificacion.service).
 */
export interface SmtpConfig {
  host: string;
  port: number;
  /** true = SMTPS (465); false = STARTTLS (587). */
  secure: boolean;
  user: string;
  /** Direccion "from". Si vacio, se usa `user`. */
  from?: string;
  /** Nombre legible del remitente. */
  fromName?: string;
}

export interface SendEmailResult {
  messageId: string;
}

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedKey = '';

function transporterKey(cfg: SmtpConfig, password: string): string {
  return [cfg.host, cfg.port, cfg.secure, cfg.user, password ? 'pw' : 'nopw'].join('|');
}

function getTransporter(cfg: SmtpConfig, password: string): nodemailer.Transporter {
  const key = transporterKey(cfg, password);
  if (cachedTransporter && cachedKey === key) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: password } : undefined,
  });
  cachedKey = key;
  return cachedTransporter;
}

function fromHeader(cfg: SmtpConfig): string {
  const addr = (cfg.from && cfg.from.trim()) || cfg.user;
  return cfg.fromName ? `"${cfg.fromName}" <${addr}>` : addr;
}

/**
 * Valida que la config SMTP sea minimamente correcta. Lanza Error con mensaje
 * legible si falta algo.
 */
export function assertSmtpConfig(cfg: SmtpConfig, password: string): void {
  if (!cfg.host) throw new Error('SMTP host no configurado');
  if (!cfg.port) throw new Error('SMTP puerto no configurado');
  if (!cfg.user) throw new Error('SMTP usuario no configurado');
  if (!password) throw new Error('SMTP password no configurado (cargar en Configuracion de Notificaciones)');
}

export async function sendEmail(
  cfg: SmtpConfig,
  password: string,
  to: string,
  subject: string,
  html: string,
  text?: string,
): Promise<SendEmailResult> {
  assertSmtpConfig(cfg, password);
  if (!to) throw new Error('Destinatario de email vacio');
  const transporter = getTransporter(cfg, password);
  const info = await transporter.sendMail({
    from: fromHeader(cfg),
    to,
    subject,
    text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    html,
  });
  return { messageId: info.messageId };
}

/** Verifica conectividad/credenciales SMTP sin enviar mensaje. */
export async function verifySmtp(cfg: SmtpConfig, password: string): Promise<void> {
  assertSmtpConfig(cfg, password);
  const transporter = getTransporter(cfg, password);
  await transporter.verify();
}

/** Invalida el transporter cacheado (llamar tras cambiar config/secreto). */
export function resetEmailTransporter(): void {
  cachedTransporter = null;
  cachedKey = '';
}
