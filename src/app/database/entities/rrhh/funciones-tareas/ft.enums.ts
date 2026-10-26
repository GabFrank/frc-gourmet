/** Enums del módulo Funciones y Tareas (FT). En SQLite se validan con CHECK en la migración. */
export enum FtTipoTarea { SIMPLE = 'SIMPLE', CHECKLIST = 'CHECKLIST' }
export enum FtRecurrencia { DIARIA = 'DIARIA', DIAS_SEMANA = 'DIAS_SEMANA', MENSUAL = 'MENSUAL', UNICA = 'UNICA', EVENTO = 'EVENTO' }
export enum FtEvento { CAJA_ABIERTA = 'CAJA_ABIERTA', CAJA_CERRADA = 'CAJA_CERRADA', COMPRA_RECIBIDA = 'COMPRA_RECIBIDA' }
export enum FtAncla { INICIO_TURNO = 'INICIO_TURNO', FIN_TURNO = 'FIN_TURNO', HORA_FIJA = 'HORA_FIJA', EVENTO = 'EVENTO' }
export enum FtEvidencia { NINGUNA = 'NINGUNA', NOTA = 'NOTA', FOTO = 'FOTO' }
export enum FtMomentoAviso { ANTES_INICIO = 'ANTES_INICIO', ANTES_VENCER = 'ANTES_VENCER', AL_VENCER = 'AL_VENCER', ESCALAMIENTO = 'ESCALAMIENTO' }
/** Momento de un aviso registrado (`ft_aviso_enviado`): los de las reglas + AUSENTE (lo genera el motor, no una regla). */
export enum FtMomentoAvisoRegistro {
  ANTES_INICIO = 'ANTES_INICIO', ANTES_VENCER = 'ANTES_VENCER', AL_VENCER = 'AL_VENCER', ESCALAMIENTO = 'ESCALAMIENTO', AUSENTE = 'AUSENTE',
}
/** Tipo de caja de un evento de caja (CAJA_ABIERTA / CAJA_CERRADA). */
export enum FtEventoCaja { PDV = 'PDV', MAYOR = 'MAYOR' }
/** APP: solo en Gourmet; WHATSAPP/AMBOS: lo envía la app; GERENTE: lo envía el bot Gerente (la app solo lo registra). */
export enum FtCanalAviso { APP = 'APP', WHATSAPP = 'WHATSAPP', AMBOS = 'AMBOS', GERENTE = 'GERENTE' }
export enum FtEstadoTarea {
  PENDIENTE = 'PENDIENTE', HECHA = 'HECHA', VERIFICADA = 'VERIFICADA', VENCIDA = 'VENCIDA', NO_APLICA = 'NO_APLICA', RECHAZADA = 'RECHAZADA',
}
export enum FtOrigenTarea { MOTOR = 'MOTOR', EVENTO = 'EVENTO', MANUAL = 'MANUAL' }
export enum FtEstadoAviso { PENDIENTE = 'PENDIENTE', ENVIADO = 'ENVIADO', FALLIDO = 'FALLIDO', PARA_GERENTE = 'PARA_GERENTE' }
export enum FtEstadoPropuesta { PENDIENTE = 'PENDIENTE', REGISTRADA = 'REGISTRADA', DESCARTADA = 'DESCARTADA' }
