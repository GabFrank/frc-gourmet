/**
 * Qué se hace con lo cobrado online (uPay) al cancelar un pedido web pagado, o al cerrar una
 * devolución pendiente. Lo valida el servidor (`electron/utils/decision-pago-online.utils.ts`):
 * NO_ENTRO y NO_SE_DEVUELVE exigen motivo.
 */
export type DecisionPagoOnlineTipo = 'DEVOLVER' | 'YA_DEVUELTO' | 'NO_ENTRO' | 'NO_SE_DEVUELVE';

export interface DecisionPagoPayload {
  decision: DecisionPagoOnlineTipo;
  motivo?: string | null;
}
