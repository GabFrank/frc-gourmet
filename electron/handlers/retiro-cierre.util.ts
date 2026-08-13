import { DataSource } from 'typeorm';
import { Caja } from '../../src/app/database/entities/financiero/caja.entity';
import { RetiroCaja } from '../../src/app/database/entities/financiero/retiro-caja.entity';
import { RetiroCajaDetalle } from '../../src/app/database/entities/financiero/retiro-caja-detalle.entity';
import { RetiroCajaEstado, RetiroCajaOrigen } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { FormasPago } from '../../src/app/database/entities/compras/forma-pago.entity';
import { setEntityUserTracking } from '../utils/entity.utils';

/**
 * Genera (si no existe) el RetiroCaja FLOTANTE por el EFECTIVO contado en el
 * cierre de una caja. El efectivo por moneda = suma(valor del billete × cantidad)
 * del conteo de cierre. Queda FLOTANTE (pendiente): recién "se toca" cuando se
 * ingresa a una caja mayor (INGRESO_CIERRE_CAJA).
 *
 * Idempotente por conteoCierre (no duplica). Devuelve el retiro, o `null` cuando
 * no hay nada que generar (caja sin conteo de cierre, cierre sin efectivo, o sin
 * forma de pago de efectivo configurada). Solo lanza ante errores inesperados de
 * BD. Se usa tanto desde el handler manual como automáticamente al cerrar la caja.
 */
export async function generarRetiroDelCierre(
  dataSource: DataSource,
  cajaId: number,
  currentUserId?: number,
): Promise<RetiroCaja | null> {
  const cajaRepo = dataSource.getRepository(Caja);
  const caja = await cajaRepo.findOne({
    where: { id: cajaId },
    relations: [
      'conteoCierre',
      'conteoCierre.detalles',
      'conteoCierre.detalles.monedaBillete',
      'conteoCierre.detalles.monedaBillete.moneda',
    ],
  });
  if (!caja || !caja.conteoCierre) return null;

  const retiroRepo = dataSource.getRepository(RetiroCaja);
  // Idempotencia: no duplicar el retiro de cierre del mismo conteo.
  const existente = await retiroRepo.findOne({
    where: { conteoCierre: { id: caja.conteoCierre.id } } as any,
    relations: ['detalles'],
  });
  if (existente) return existente;

  // Efectivo por moneda del conteo de cierre. Soporta ambos modos: completo
  // (cantidad × valor del billete) y resumido (total directo en `monto`, con
  // cantidad 0). Antes solo usaba cantidad × valor, así que un cierre resumido
  // daba 0 y NO se generaba el retiro del cierre.
  const porMoneda = new Map<number, { moneda: any; monto: number }>();
  for (const d of (caja.conteoCierre.detalles || [])) {
    const mb = (d as any).monedaBillete;
    const moneda = mb?.moneda;
    if (!moneda) continue;
    const sub = Number((d as any).monto) || (Number(mb.valor) * Number((d as any).cantidad));
    const cur = porMoneda.get(moneda.id) || { moneda, monto: 0 };
    cur.monto += sub;
    porMoneda.set(moneda.id, cur);
  }
  const monedasConMonto = [...porMoneda.values()].filter((x) => x.monto > 0);
  if (monedasConMonto.length === 0) return null;

  // Forma de pago de EFECTIVO: la que mueve caja (preferir la principal).
  const fpRepo = dataSource.getRepository(FormasPago);
  const formasEfectivo = await fpRepo.find({
    where: { movimentaCaja: true, activo: true } as any,
    order: { principal: 'DESC', orden: 'ASC' },
  });
  const formaEfectivo = formasEfectivo[0];
  if (!formaEfectivo) return null;

  const retiro = retiroRepo.create({
    caja: { id: cajaId } as any,
    origen: RetiroCajaOrigen.CIERRE,
    estado: RetiroCajaEstado.FLOTANTE,
    conteoCierre: { id: caja.conteoCierre.id } as any,
    fechaRetiro: new Date(),
    observacion: `RETIRO DEL CIERRE DE CAJA #${cajaId}`,
    ...(currentUserId ? { responsableRetiro: { id: currentUserId } as any } : {}),
    detalles: monedasConMonto.map((x) => {
      const det = new RetiroCajaDetalle();
      det.moneda = { id: x.moneda.id } as any;
      det.formaPago = { id: formaEfectivo.id } as any;
      det.monto = x.monto;
      return det;
    }),
  } as any);
  await setEntityUserTracking(dataSource, retiro, currentUserId, false);
  const saved = await retiroRepo.save(retiro);
  return Array.isArray(saved) ? saved[0] : saved;
}
