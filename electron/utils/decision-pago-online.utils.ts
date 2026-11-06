import {
  DecisionPagoOnline,
  EstadoPagoOnline,
} from '../../src/app/database/entities/pedidos-online/pedido-online.enums';

/**
 * Qué pasa con lo cobrado online (uPay) cuando se cancela un pedido pagado.
 *
 * Antes toda cancelación dejaba el pago «a devolver». No siempre es así: el cobro puede no haber
 * entrado, el personal pudo devolverlo ya desde el portal, o el local decide quedárselo. Quien
 * cancela elige; las tres puertas (bandeja, diálogo de delivery, historial/PdV) usan este mismo
 * criterio. Sin elección se devuelve, como antes, así ningún llamador viejo cambia de conducta.
 *
 * NO_ENTRO y NO_SE_DEVUELVE dejan la plata sin devolver: exigen motivo, que queda en el
 * historial del pago (`pagos_online_eventos`) con el usuario que lo marcó.
 */
export interface DecisionPago {
  decision: DecisionPagoOnline;
  motivo: string | null;
}

const ESTADO_POR_DECISION: Record<DecisionPagoOnline, EstadoPagoOnline> = {
  [DecisionPagoOnline.DEVOLVER]: EstadoPagoOnline.REEMBOLSO_PENDIENTE,
  [DecisionPagoOnline.YA_DEVUELTO]: EstadoPagoOnline.DEVUELTO,
  [DecisionPagoOnline.NO_ENTRO]: EstadoPagoOnline.NO_ACREDITADO,
  [DecisionPagoOnline.NO_SE_DEVUELVE]: EstadoPagoOnline.RETENIDO,
};

export const DECISION_PAGO_DEFAULT: DecisionPago = { decision: DecisionPagoOnline.DEVOLVER, motivo: null };

export class DecisionPagoError extends Error {
  constructor(public codigo: 'decision_pago_invalida' | 'motivo_pago_requerido') { super(codigo); }
}

/**
 * Normaliza lo que manda el cliente. Acepta `null`/`undefined` (→ devolver), un string con la
 * decisión, o `{ decision, motivo }`. Lanza `DecisionPagoError` si no se entiende o falta motivo.
 */
export function normalizarDecisionPago(raw: any): DecisionPago {
  if (raw == null || raw === '') return DECISION_PAGO_DEFAULT;
  const d = String(typeof raw === 'object' ? raw.decision : raw).trim().toUpperCase() as DecisionPagoOnline;
  if (!Object.values(DecisionPagoOnline).includes(d)) throw new DecisionPagoError('decision_pago_invalida');
  const motivo = typeof raw === 'object' && raw.motivo != null
    ? String(raw.motivo).trim().toUpperCase().slice(0, 200) || null
    : null;
  if ((d === DecisionPagoOnline.NO_ENTRO || d === DecisionPagoOnline.NO_SE_DEVUELVE) && !motivo) {
    throw new DecisionPagoError('motivo_pago_requerido');
  }
  return { decision: d, motivo };
}

/**
 * Para los handlers que reportan errores con `throw` (delivery, ventas): mismo criterio, con el
 * texto que muestra el PdV. El código va al principio para que la UI lo traduzca.
 */
export function normalizarDecisionPagoOError(raw: any): DecisionPago {
  try {
    return normalizarDecisionPago(raw);
  } catch (e) {
    if (e instanceof DecisionPagoError) {
      throw new Error(e.codigo === 'motivo_pago_requerido'
        ? 'MOTIVO_PAGO_REQUERIDO: indicá por qué no se devuelve el pago con tarjeta.'
        : 'DECISION_PAGO_INVALIDA: no se entendió qué hacer con el pago con tarjeta.');
    }
    throw e;
  }
}

export function estadoPagoPorDecision(d: DecisionPago): EstadoPagoOnline {
  return ESTADO_POR_DECISION[d.decision];
}


/** Pedido pagado cuyo pago se decidió dentro de una transacción; se avisa después del commit. */
export interface PagoDecidido {
  pedidoId: number;
  decision: DecisionPago;
}
