import { DeliveryModo } from './entities/ventas/delivery.entity';

/**
 * Payload de `delivery-convertir-modo`.
 *
 * Los campos son excluyentes por modo destino, y ninguno es "opcional" por
 * comodidad: cada uno cubre un dato que **deja de existir o empieza a existir**
 * al convertir, y que el backend valida.
 */
export interface ConvertirModoDeliveryPayload {
  modo: DeliveryModo;
  /** → DELIVERY. Obligatoria si `PdvConfig.deliveryRequiereDireccion`. */
  direccion?: string | null;
  /** → DELIVERY. Zona de entrega; `null` es «SIN CARGO», no «sin definir». */
  precioDeliveryId?: number | null;
  /**
   * → DELIVERY. Obligatorio si el pedido ya está EN_CAMINO y el candado del
   * repartidor está activo con la etapa en EN_CAMINO: esa transición no se
   * vuelve a atravesar, así que es la última oportunidad de exigirlo.
   */
  funcionarioId?: number | null;
  /** → RETIRO. Obligatorio si el pedido no tiene nombre cargado. */
  nombre?: string | null;
}

/**
 * Aviso de cobro que devuelve la conversión. No frena nada: la plata no se
 * mueve sola, se le avisa al cajero.
 */
export interface AvisoCobroConversion {
  /** Cuánto quedó cobrado por encima del total nuevo. 0 si no hay excedente. */
  excedente: number;
  totalCubierto: number;
  deudaBruta: number;
  /** La venta ya tiene líneas de cobro registradas: hay que revisar el detalle. */
  tienePagoRegistrado: boolean;
}
