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
  // v2 (2026-11-11): textos más cálidos, pedidos por el dueño al probar la v1.
  ACEPTADO: {
    nombre: 'aviso_pedido_aceptado_v2',
    cuerpo: '¡Hola! 🙌 Recibimos tu pedido {{2}} en {{1}} y ya lo estamos preparando. 👨‍🍳\n\nSeguilo acá: {{3}}\n\nTe avisamos apenas cambie de estado.',
  },
  LISTO: {
    nombre: 'aviso_pedido_listo_v2',
    cuerpo: '¡Tu pedido {{2}} está listo! 🎉 Ya podés pasar a retirarlo por {{1}}.\n\nDetalle: {{3}}\n\nAl retirarlo, decí el número del pedido. ¡Te esperamos!',
  },
  EN_CAMINO: {
    nombre: 'aviso_pedido_en_camino_v2',
    cuerpo: '¡Allá va! 🛵 Tu pedido {{2}} de {{1}} ya salió y está en camino. El repartidor puede llamarte a este número.\n\nSeguilo acá: {{3}}\n\n¡Ya casi llega!',
  },
  ENTREGADO: {
    nombre: 'aviso_pedido_entregado_v2',
    cuerpo: '¡Pedido {{2}} entregado! 😋 Gracias por pedir en {{1}}, que lo disfrutes.\n\nDetalle: {{3}}\n\n¡Buen provecho!',
  },
  CANCELADO: {
    nombre: 'aviso_pedido_cancelado_v2',
    cuerpo: 'Hola, lamentamos avisarte que tu pedido {{2}} en {{1}} fue cancelado. 😔\n\nDetalle: {{3}}\n\nSi tenés dudas, comunicate con el local.',
  },
  CANCELADO_DEVOLUCION: {
    nombre: 'aviso_pedido_cancelado_devolucion_v2',
    cuerpo: 'Hola, lamentamos avisarte que tu pedido {{2}} en {{1}} fue cancelado. 😔 Te devolvemos el pago.\n\nDetalle: {{3}}\n\nSi tenés dudas, comunicate con el local.',
  },
};

/** Lo que el sender necesita para mandar un aviso: texto (Evolution) o plantilla (Meta). */
export interface AvisoWhatsapp {
  texto: string;
  plantilla: ClavePlantillaAviso;
  /** {{1}} comercio, {{2}} número, {{3}} enlace. */
  parametros: [string, string, string];
}
