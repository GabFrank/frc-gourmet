/**
 * Alta de un `Delivery` dentro de una transacción ajena.
 *
 * `delivery-crear` abre su propia transacción y valida el payload con las reglas
 * del alta manual del cajero (teléfono mínimo, dirección obligatoria, caja
 * explícita). Ninguna de las dos cosas sirve cuando el delivery nace de un
 * pedido online: la materialización ya tiene su transacción abierta, y los datos
 * vienen congelados del cliente web, que puede no cumplir esos mínimos pensados
 * para la carga a mano.
 *
 * Por eso esta función NO valida: sólo persiste. La validación es
 * responsabilidad de quien la llama, que es donde vive la regla de negocio.
 * Mismo patrón que `venta-reversa.utils.ts` (`cancelarVentaCompletaEnTx`).
 */
import { DataSource, EntityManager } from 'typeorm';
import { Delivery, DeliveryEstado, DeliveryModo } from '../../src/app/database/entities/ventas/delivery.entity';
import { setEntityUserTracking } from './entity.utils';

export interface DatosAltaDelivery {
  telefono?: string | null;
  nombre?: string | null;
  direccion?: string | null;
  observacion?: string | null;
  clienteId?: number | null;
  precioDeliveryId?: number | null;
  cobroAnticipado?: boolean;
  /** `RETIRO` para el pedido que el cliente pasa a buscar. Default `DELIVERY`. */
  modo?: DeliveryModo;
}

function upper(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s.toUpperCase() : undefined;
}

export async function crearDeliveryEnTx(
  manager: EntityManager,
  dataSource: DataSource,
  datos: DatosAltaDelivery,
  usuarioId?: number,
): Promise<Delivery> {
  const delivery = manager.getRepository(Delivery).create({
    precioDelivery: datos.precioDeliveryId ? ({ id: datos.precioDeliveryId } as any) : undefined,
    cliente: datos.clienteId ? ({ id: datos.clienteId } as any) : undefined,
    nombre: upper(datos.nombre),
    telefono: datos.telefono ? String(datos.telefono).trim() : undefined,
    direccion: upper(datos.direccion),
    observacion: upper(datos.observacion),
    estado: DeliveryEstado.ABIERTO,
    modo: datos.modo ?? DeliveryModo.DELIVERY,
    fechaAbierto: new Date(),
    cobroAnticipado: !!datos.cobroAnticipado,
  });
  await setEntityUserTracking(dataSource, delivery, usuarioId, false);
  return manager.save(Delivery, delivery);
}
