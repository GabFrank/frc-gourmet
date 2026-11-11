/**
 * Cómo ve el cliente el estado de su pedido.
 *
 * Los estados internos (RECIBIDO, LISTO…) son los del local: «recibido» es «me
 * llegó un pedido», y el cliente lo leía como «ya lo recibí». Acá se traducen a
 * lo que está pasando y a qué le toca esperar, según cómo le llega el pedido.
 * Los estados de la base y de la bandeja no cambian.
 */

export type TonoEstado = 'espera' | 'curso' | 'ok' | 'error';

export interface PasoPedido {
  label: string;
  hecho: boolean;
  actual: boolean;
}

export interface VistaEstadoPedido {
  chip: string;
  ayuda: string | null;
  tono: TonoEstado;
  /** null cuando no hay camino que mostrar (rechazado, cancelado, falta pagar). */
  pasos: PasoPedido[] | null;
}

type Tipo = 'PICKUP' | 'DELIVERY' | 'MESA_QR' | string;

const PASOS: Record<string, string[]> = {
  PICKUP: ['Enviado', 'Preparando', 'Listo para retirar', 'Retirado'],
  DELIVERY: ['Enviado', 'Preparando', 'En camino', 'Entregado'],
  MESA_QR: ['Enviado', 'Preparando', 'Entregado en la mesa'],
};

/** Paso en el que está el pedido (índice en PASOS[tipo]). */
function pasoActual(estado: string, tipo: Tipo): number | null {
  const ultimo = (PASOS[tipo] || PASOS['PICKUP']).length - 1;
  switch (estado) {
    case 'RECIBIDO': return 0;
    case 'ACEPTADO':
    case 'EN_PREPARACION': return 1;
    // Listo: en el retiro es su propio paso; en delivery y mesa todavía falta que salga o lo lleven.
    case 'LISTO': return tipo === 'PICKUP' ? 2 : 1;
    case 'EN_CAMINO': return tipo === 'DELIVERY' ? 2 : 1;
    case 'ENTREGADO': return ultimo;
    default: return null;
  }
}

function textos(estado: string, tipo: Tipo): { chip: string; ayuda: string | null; tono: TonoEstado } {
  switch (estado) {
    case 'PENDIENTE_PAGO': return { chip: 'Falta pagar', ayuda: 'Completá el pago para que el local reciba tu pedido.', tono: 'espera' };
    case 'RECIBIDO': return { chip: 'Esperando confirmación', ayuda: 'El local todavía no confirmó tu pedido.', tono: 'espera' };
    case 'ACEPTADO': return { chip: 'Confirmado', ayuda: 'El local aceptó tu pedido.', tono: 'curso' };
    case 'EN_PREPARACION': return { chip: 'En preparación', ayuda: 'Lo están preparando en la cocina.', tono: 'curso' };
    case 'LISTO':
      if (tipo === 'PICKUP') return { chip: 'Listo para retirar', ayuda: 'Ya podés pasar a buscarlo.', tono: 'curso' };
      if (tipo === 'DELIVERY') return { chip: 'Listo, sale enseguida', ayuda: 'Tu pedido está listo y sale en breve.', tono: 'curso' };
      return { chip: 'Listo, ya te lo llevan', ayuda: 'Tu pedido está listo y va a tu mesa.', tono: 'curso' };
    case 'EN_CAMINO': return { chip: 'En camino', ayuda: 'El repartidor va hacia tu dirección.', tono: 'curso' };
    case 'ENTREGADO': return { chip: tipo === 'PICKUP' ? 'Retirado' : 'Entregado', ayuda: null, tono: 'ok' };
    case 'RECHAZADO': return { chip: 'No fue aceptado', ayuda: null, tono: 'error' };
    case 'CANCELADO': return { chip: 'Cancelado', ayuda: null, tono: 'error' };
    default: return { chip: estado, ayuda: null, tono: 'espera' };
  }
}

export function vistaEstadoPedido(estado: string, tipo: Tipo): VistaEstadoPedido {
  const t = textos(estado, tipo);
  const actual = pasoActual(estado, tipo);
  const labels = PASOS[tipo] || PASOS['PICKUP'];
  const pasos = actual == null ? null : labels.map((label, i) => ({
    label,
    // Entregado: todos los pasos hechos. Si no, el actual es el que está pasando ahora.
    hecho: estado === 'ENTREGADO' ? true : i < actual,
    actual: estado !== 'ENTREGADO' && i === actual,
  }));
  return { ...t, pasos };
}
