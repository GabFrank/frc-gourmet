/**
 * Plantillas de WhatsApp Cloud (Meta) de los avisos del pedido (PLAN-tienda-avisos-whatsapp, fase 2).
 *
 * Meta solo deja escribirle primero a un cliente con una plantilla aprobada. Una por aviso, categoría
 * UTILITY, idioma `es`, con tres variables: {{1}} comercio, {{2}} número del pedido, {{3}} enlace al
 * detalle. Reglas de Meta que condicionan los textos: el cuerpo no puede empezar ni terminar con una
 * variable, y sin frases promocionales (si no, la pasa a MARKETING).
 *
 * El cuerpo se usa para crearlas (`scripts/crear-plantillas-avisos-meta.ts`): si se cambia un texto,
 * hay que crear la plantilla con otro nombre (Meta no deja editar libremente una aprobada).
 */
export type ClavePlantillaAviso = 'ACEPTADO' | 'LISTO' | 'EN_CAMINO' | 'ENTREGADO' | 'CANCELADO' | 'CANCELADO_DEVOLUCION';

export interface PlantillaAviso {
  nombre: string;
  cuerpo: string;
}

export const IDIOMA_PLANTILLAS_AVISO = 'es';

export const PLANTILLAS_AVISO: Record<ClavePlantillaAviso, PlantillaAviso> = {
  ACEPTADO: {
    nombre: 'aviso_pedido_aceptado',
    cuerpo: 'Tu pedido {{2}} en {{1}} fue aceptado y ya lo estamos preparando.\n\nDetalle: {{3}}\n\nTe avisamos por acá cuando cambie el estado.',
  },
  LISTO: {
    nombre: 'aviso_pedido_listo',
    cuerpo: 'Tu pedido {{2}} en {{1}} está listo para retirar.\n\nDetalle: {{3}}\n\nAl retirarlo, indicá el número del pedido.',
  },
  EN_CAMINO: {
    nombre: 'aviso_pedido_en_camino',
    cuerpo: 'Tu pedido {{2}} en {{1}} salió y va en camino. El repartidor puede llamarte a este número.\n\nDetalle: {{3}}\n\nTe avisamos cuando se entregue.',
  },
  ENTREGADO: {
    nombre: 'aviso_pedido_entregado',
    cuerpo: 'Tu pedido {{2}} en {{1}} fue entregado.\n\nDetalle: {{3}}\n\nGracias por tu compra.',
  },
  CANCELADO: {
    nombre: 'aviso_pedido_cancelado',
    cuerpo: 'Tu pedido {{2}} en {{1}} fue cancelado.\n\nDetalle: {{3}}\n\nSi tenés dudas, comunicate con el local.',
  },
  CANCELADO_DEVOLUCION: {
    nombre: 'aviso_pedido_cancelado_devolucion',
    cuerpo: 'Tu pedido {{2}} en {{1}} fue cancelado. Te devolvemos el pago.\n\nDetalle: {{3}}\n\nSi tenés dudas, comunicate con el local.',
  },
};

/** Lo que el sender necesita para mandar un aviso: texto (Evolution) o plantilla (Meta). */
export interface AvisoWhatsapp {
  texto: string;
  plantilla: ClavePlantillaAviso;
  /** {{1}} comercio, {{2}} número, {{3}} enlace. */
  parametros: [string, string, string];
}
