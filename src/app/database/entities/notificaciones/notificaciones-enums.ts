/**
 * Enums del modulo de Notificaciones (Email + WhatsApp).
 */

/** Canal por el que se envia un mensaje. */
export enum CanalNotificacion {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
}

/** Canales que un evento admite. AMBOS = puede rutearse por email y/o whatsapp. */
export enum CanalEvento {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  AMBOS = 'AMBOS',
}

/** Tipo de receptor de un mensaje. */
export enum TipoReceptor {
  /** Persona del sistema: email/telefono se resuelven desde la Persona vinculada. */
  PERSONA = 'PERSONA',
  /** Direccion de email cruda. */
  EMAIL = 'EMAIL',
  /** Numero de WhatsApp crudo (formato internacional, ej 595991123456). */
  NUMERO = 'NUMERO',
  /** Grupo de WhatsApp (JID terminado en @g.us). */
  GRUPO_WHATSAPP = 'GRUPO_WHATSAPP',
}

/** Estado de un intento de envio (auditoria). */
export enum EstadoEnvioNotificacion {
  ENVIADO = 'ENVIADO',
  FALLIDO = 'FALLIDO',
  /** No se envio por configuracion (canal/evento desactivado, sin destino, etc). */
  OMITIDO = 'OMITIDO',
}

/** Tipo de valor de una clave de configuracion. */
export enum ConfiguracionNotificacionTipo {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
}
