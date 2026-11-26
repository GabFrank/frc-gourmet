/**
 * Acreditación en Bancos de lo cobrado por la tienda online (IC Pay, Bancard…).
 *
 * Lo cobrado online quedaba en la venta como forma de pago «PIX ONLINE» (no mueve la caja) y no
 * entraba a ningún banco. Si la forma de pago online tiene máquina POS, al aceptar el pedido se crea
 * su `AcreditacionPos`, como un cobro con tarjeta: monto real cobrado por el proveedor en la moneda
 * de la cuenta de la máquina, comisión y plazo de la regla del medio (QR para Pix), y después se
 * acredita sola o se verifica contra el extracto.
 *
 * La línea de la venta no lleva la máquina: así el diálogo de cobro del PdV no crea otra
 * acreditación al finalizar (y en guaraníes, que no coincidiría con la cuenta).
 */
import { DataSource } from 'typeorm';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { FormaPagoOnline } from '../../src/app/database/entities/pedidos-online/forma-pago-online.entity';
import { MaquinaPos } from '../../src/app/database/entities/financiero/maquina-pos.entity';
import { AcreditacionPos } from '../../src/app/database/entities/financiero/acreditacion-pos.entity';
import { AcreditacionPosEstado, MedioPos } from '../../src/app/database/entities/financiero/banking-enums';
import { EstadoPagoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { calcularParaMaquina } from '../handlers/acreditaciones-pos-reglas.handler';
import { setEntityUserTracking } from './entity.utils';

export type ResultadoAcreditacionOnline =
  | { creada: true; id: number; monto: number; moneda: string }
  | { creada: false; motivo: string };

const codigoMoneda = (m: any): 'USD' | 'BRL' | 'PYG' | null => {
  if (!m) return null;
  const pais = String(m.countryCode || '').toUpperCase();
  const simbolo = String(m.simbolo || '').trim();
  const nombre = String(m.denominacion || '').toUpperCase();
  if (m.principal) return 'PYG';
  if (pais === 'BR' || simbolo === 'R$' || nombre.startsWith('REAL')) return 'BRL';
  if (pais === 'US' || simbolo === '$' || simbolo === 'US$' || nombre.startsWith('DOLAR') || nombre.startsWith('DÓLAR')) return 'USD';
  return null;
};

/** El monto que cobró el proveedor, en la moneda pedida (lo que guardó al crear el cobro). */
export function montoCobradoEn(p: Pick<PedidoOnline, 'pagoDatosJson' | 'pagoMonto' | 'total'>, moneda: 'USD' | 'BRL' | 'PYG'): number | null {
  if (moneda === 'PYG') return Number(p.pagoMonto ?? p.total) || null;
  let d: any = null;
  try { d = p.pagoDatosJson ? JSON.parse(p.pagoDatosJson) : null; } catch { d = null; }
  if (!d) return null;
  if (moneda === 'USD') return Number(d.usd) > 0 ? Number(d.usd) : null;
  if (moneda === 'BRL') return d.qr?.moneda === 'BRL' && Number(d.qr?.monto) > 0 ? Number(d.qr.monto) : null;
  return null;
}

export async function acreditarCobroOnline(ds: DataSource, pedidoId: number, ventaId: number, userId?: number | null): Promise<ResultadoAcreditacionOnline> {
  // `pagoDatosJson` no se trae por defecto (select: false): es lo que guardó el proveedor al cobrar.
  const p = await ds.getRepository(PedidoOnline).createQueryBuilder('p').addSelect('p.pagoDatosJson').where('p.id = :id', { id: pedidoId }).getOne();
  if (!p || p.estadoPago !== EstadoPagoOnline.PAGADO) return { creada: false, motivo: 'sin cobro online' };
  const formaId = (p as any).formaPagoOnlineId;
  const forma = formaId ? await ds.getRepository(FormaPagoOnline).findOne({ where: { id: formaId } }) : null;
  if (!forma?.maquinaPosId) return { creada: false, motivo: 'la forma de pago online no tiene máquina POS' };
  const maquina = await ds.getRepository(MaquinaPos).findOne({ where: { id: forma.maquinaPosId }, relations: ['cuentaBancaria', 'cuentaBancaria.moneda'] });
  if (!maquina?.cuentaBancaria) return { creada: false, motivo: 'la máquina POS no tiene cuenta bancaria' };
  const repo = ds.getRepository(AcreditacionPos);
  // Una sola por venta y máquina (reintentos del job, doble aceptación).
  if (await repo.count({ where: { ventaId, maquinaPos: { id: maquina.id } } as any })) return { creada: false, motivo: 'ya acreditado' };

  const moneda = codigoMoneda((maquina.cuentaBancaria as any).moneda);
  if (!moneda) return { creada: false, motivo: 'no se reconoce la moneda de la cuenta del POS' };
  const monto = montoCobradoEn(p, moneda);
  if (!(monto && monto > 0)) return { creada: false, motivo: `no se sabe cuánto cobró el proveedor en ${moneda}` };

  const decimales = Number((maquina.cuentaBancaria as any)?.moneda?.decimales ?? (moneda === 'PYG' ? 0 : 2));
  const fecha = new Date();
  const calc = await calcularParaMaquina(ds.manager, maquina, monto, fecha, MedioPos.QR, decimales);
  const entity = repo.create({
    maquinaPos: { id: maquina.id } as any,
    cuentaBancaria: { id: maquina.cuentaBancaria.id } as any,
    montoOriginal: monto,
    montoComision: calc.montoComision,
    montoEsperado: calc.montoEsperado,
    fechaTransaccion: fecha,
    fechaEsperadaAcreditacion: calc.fechaEsperadaAcreditacion,
    estado: AcreditacionPosEstado.PENDIENTE,
    ventaId,
    medio: calc.medio || MedioPos.QR,
    marca: String(p.pagoProveedor || 'ONLINE').toUpperCase().slice(0, 30),
    montoIvaComision: calc.montoIvaComision ?? undefined,
    montoRetRenta: calc.montoRetRenta ?? undefined,
    montoRetIva: calc.montoRetIva ?? undefined,
    reglaId: calc.reglaId ?? undefined,
  } as any);
  await setEntityUserTracking(ds, entity, userId ?? undefined, false);
  const r: any = await repo.save(entity);
  return { creada: true, id: Number((Array.isArray(r) ? r[0] : r).id), monto, moneda };
}
