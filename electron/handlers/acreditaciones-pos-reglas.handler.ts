/**
 * Acreditaciones POS por medio de pago (issue #320, docs/planes/PLAN-acreditaciones-pos.md):
 * reglas por máquina + medio, cálculo con feriados, conciliación agrupada (con deshacer) y resumen.
 * El cálculo puro vive en electron/services/acreditaciones-pos/calculo.ts.
 */
import { ipcMain } from 'electron';
import { DataSource, EntityManager, In } from 'typeorm';
import { MaquinaPos } from '../../src/app/database/entities/financiero/maquina-pos.entity';
import { MaquinaPosRegla } from '../../src/app/database/entities/financiero/maquina-pos-regla.entity';
import { AcreditacionPos } from '../../src/app/database/entities/financiero/acreditacion-pos.entity';
import { ConciliacionPos } from '../../src/app/database/entities/financiero/conciliacion-pos.entity';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { Feriado } from '../../src/app/database/entities/rrhh/feriado.entity';
import { MovimientoBancarioTipo } from '../../src/app/database/entities/financiero/movimiento-bancario.entity';
import {
  AcreditacionPosEstado, ConciliacionPosEstado, MedioPos,
} from '../../src/app/database/entities/financiero/banking-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { calcularAcreditacion, diaLocal, REGLAS_OBSERVADAS, ReglaAcreditacion } from '../services/acreditaciones-pos/calculo';
import { registrarMovimientoBancario } from '../utils/movimiento-bancario.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ensurePermission } from '../utils/auth.utils';

const MEDIOS = Object.values(MedioPos) as string[];

export function normalizarMedio(m: unknown): MedioPos | null {
  const s = String(m ?? '').trim().toUpperCase();
  return MEDIOS.includes(s) ? (s as MedioPos) : null;
}

/** 'YYYY-MM-DD' de los feriados activos entre dos días (inclusive), con margen para plazos largos. */
async function feriadosEntre(manager: EntityManager, desde: string, dias = 60): Promise<Set<string>> {
  const d = new Date(`${desde}T00:00:00`);
  const h = new Date(d);
  h.setDate(h.getDate() + dias);
  const filas = await manager.getRepository(Feriado).find({ where: { activo: true } });
  const out = new Set<string>();
  for (const f of filas) {
    const iso = typeof f.fecha === 'string' ? String(f.fecha).slice(0, 10) : diaLocal(new Date(f.fecha));
    if (iso >= desde && iso <= diaLocal(h)) out.add(iso);
  }
  return out;
}

function aRegla(r: MaquinaPosRegla): ReglaAcreditacion {
  return {
    plazoDias: Number(r.plazoDias) || 0,
    tipoDias: r.tipoDias as any,
    base: r.base as any,
    correrAHabil: !!r.correrAHabil,
    porcentajeComision: Number(r.porcentajeComision) || 0,
    redondeoComision: Number(r.redondeoComision) || 0,
    porcentajeIvaComision: Number(r.porcentajeIvaComision) || 0,
    porcentajeRetRenta: Number(r.porcentajeRetRenta) || 0,
    porcentajeRetIva: Number(r.porcentajeRetIva) || 0,
    divisorIvaVenta: Number(r.divisorIvaVenta) || 0,
    modo: r.modo as any,
  };
}

export interface CalculoAcreditacionCreada {
  montoComision: number;
  montoEsperado: number;
  fechaEsperadaAcreditacion: Date;
  medio: MedioPos | null;
  montoIvaComision: number | null;
  montoRetRenta: number | null;
  montoRetIva: number | null;
  reglaId: number | null;
}

/**
 * Calcula lo que se va a guardar en una AcreditacionPos nueva. Con regla activa para el medio, usa la
 * regla; si no, exactamente el cálculo anterior (% y minutos de la máquina).
 */
export async function calcularParaMaquina(
  manager: EntityManager,
  maquina: MaquinaPos,
  montoOriginal: number,
  fechaTransaccion: Date,
  medioIn: unknown,
  decimales = 0,
): Promise<CalculoAcreditacionCreada> {
  const medio = normalizarMedio(medioIn);
  const regla = medio
    ? await manager.getRepository(MaquinaPosRegla).findOne({ where: { maquinaPos: { id: maquina.id }, medio, activo: true } })
    : null;
  if (!regla) {
    const porc = Number(maquina.porcentajeComision || 0);
    const montoComision = +(montoOriginal * (porc / 100)).toFixed(2);
    const fechaEsperada = new Date(fechaTransaccion);
    fechaEsperada.setMinutes(fechaEsperada.getMinutes() + (maquina.minutosAcreditacion || 0));
    return {
      montoComision, montoEsperado: +(montoOriginal - montoComision).toFixed(2), fechaEsperadaAcreditacion: fechaEsperada,
      medio, montoIvaComision: null, montoRetRenta: null, montoRetIva: null, reglaId: null,
    };
  }
  const dia = diaLocal(fechaTransaccion);
  const r = calcularAcreditacion(aRegla(regla), montoOriginal, dia, await feriadosEntre(manager, dia), decimales);
  // Día esperado a las 00:00 locales: el scheduler (si auto_acreditar) lo toma desde ese día.
  const [y, m, d] = r.fechaEsperada.split('-').map(Number);
  return {
    montoComision: r.montoComision,
    montoEsperado: r.montoEsperado,
    fechaEsperadaAcreditacion: new Date(y, m - 1, d, 0, 0, 0, 0),
    medio,
    montoIvaComision: r.montoIvaComision,
    montoRetRenta: r.montoRetRenta,
    montoRetIva: r.montoRetIva,
    reglaId: regla.id,
  };
}

/** Pendientes de una cuenta candidatas para un crédito real (fecha esperada ±tolerancia días). */
export async function sugerirConciliacion(
  manager: EntityManager,
  p: { cuentaBancariaId: number; fechaCredito: string; montoCredito?: number; toleranciaDias?: number },
) {
  const tol = Math.max(0, Math.min(15, Number(p.toleranciaDias ?? 2)));
  const base = new Date(`${p.fechaCredito}T00:00:00`);
  const desde = new Date(base); desde.setDate(desde.getDate() - tol);
  const hasta = new Date(base); hasta.setDate(hasta.getDate() + tol + 1);
  const filas = await manager.getRepository(AcreditacionPos).createQueryBuilder('a')
    .leftJoinAndSelect('a.maquinaPos', 'mp')
    .where('a.cuenta_bancaria_id = :id', { id: p.cuentaBancariaId })
    .andWhere('a.estado = :e', { e: AcreditacionPosEstado.PENDIENTE })
    .andWhere('a.conciliacion_id IS NULL')
    .andWhere('a.fechaEsperadaAcreditacion >= :desde AND a.fechaEsperadaAcreditacion < :hasta', { desde, hasta })
    .orderBy('a.fechaEsperadaAcreditacion', 'ASC').addOrderBy('a.id', 'ASC')
    .getMany();
  // Sugerencia: las de la fecha exacta primero; si el monto del crédito se conoce, greedy hasta no pasarse.
  const objetivo = p.montoCredito != null ? Number(p.montoCredito) : null;
  const exactas = filas.filter((f) => diaLocal(new Date(f.fechaEsperadaAcreditacion)) === p.fechaCredito);
  const resto = filas.filter((f) => !exactas.includes(f));
  const sugeridas: number[] = [];
  let suma = 0;
  for (const f of [...exactas, ...resto]) {
    const m = Number(f.montoEsperado);
    if (objetivo == null ? exactas.includes(f) : suma + m <= objetivo + 0.005) { sugeridas.push(f.id); suma += m; }
  }
  return { candidatas: filas, sugeridas, sumaSugerida: +suma.toFixed(2) };
}

/**
 * Concilia un crédito real con N acreditaciones PENDIENTE de la misma cuenta, en una transacción:
 * suma el crédito real al saldo (un movimiento), marca VERIFICADO/CON_DIFERENCIA y guarda la conciliación.
 */
export async function conciliar(
  dataSource: DataSource,
  p: { cuentaBancariaId: number; fechaCredito: string; montoCredito: number; referencia?: string; acreditacionIds: number[] },
  usuario: Usuario | null,
): Promise<ConciliacionPos> {
  const ids = Array.from(new Set((p.acreditacionIds || []).map(Number).filter((x) => x > 0)));
  const monto = Number(p.montoCredito);
  if (!ids.length) throw new Error('CONCILIACION_SIN_ACREDITACIONES');
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('CONCILIACION_MONTO_INVALIDO');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.fechaCredito))) throw new Error('CONCILIACION_FECHA_INVALIDA');
  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const m = qr.manager;
    const acreds = await m.getRepository(AcreditacionPos).find({ where: { id: In(ids) }, relations: ['cuentaBancaria'] });
    if (acreds.length !== ids.length) throw new Error('CONCILIACION_ACREDITACION_NO_ENCONTRADA');
    for (const a of acreds) {
      if (a.cuentaBancaria?.id !== Number(p.cuentaBancariaId)) throw new Error('CONCILIACION_OTRA_CUENTA');
      if (a.estado !== AcreditacionPosEstado.PENDIENTE || a.conciliacionId) throw new Error(`CONCILIACION_YA_PROCESADA:${a.id}`);
    }
    const referencia = p.referencia ? String(p.referencia).trim().toUpperCase().slice(0, 100) : null;
    // El mismo crédito (cuenta + fecha + monto + referencia) no se concilia dos veces.
    const dupQb = m.getRepository(ConciliacionPos).createQueryBuilder('c')
      .where('c.cuenta_bancaria_id = :cb', { cb: p.cuentaBancariaId })
      .andWhere('c.fecha_credito = :f', { f: p.fechaCredito })
      .andWhere('c.monto_credito = :mo', { mo: monto })
      .andWhere('c.estado = :e', { e: ConciliacionPosEstado.ACTIVA });
    if (referencia) dupQb.andWhere('c.referencia = :r', { r: referencia }); else dupQb.andWhere('c.referencia IS NULL');
    if (await dupQb.getCount()) throw new Error('CONCILIACION_DUPLICADA');

    const cb = await m.getRepository(CuentaBancaria).findOne({ where: { id: p.cuentaBancariaId } });
    if (!cb) throw new Error('Cuenta bancaria no encontrada');
    const esperado = +acreds.reduce((s, a) => s + Number(a.montoEsperado), 0).toFixed(2);
    const diferencia = +(monto - esperado).toFixed(2);

    const conc = m.create(ConciliacionPos, {
      cuentaBancaria: { id: cb.id } as any,
      fechaCredito: p.fechaCredito,
      montoCredito: monto,
      montoEsperado: esperado,
      diferencia,
      referencia: referencia || undefined,
      cantidadAcreditaciones: acreds.length,
      estado: ConciliacionPosEstado.ACTIVA,
    });
    await setEntityUserTracking(dataSource, conc, usuario?.id, false);
    const guardada = await m.save(ConciliacionPos, conc);

    cb.saldo = +(Number(cb.saldo) + monto).toFixed(2);
    await m.save(CuentaBancaria, cb);
    const [y, mo, d] = p.fechaCredito.split('-').map(Number);
    await registrarMovimientoBancario(m, dataSource, {
      cuentaBancariaId: cb.id,
      tipo: MovimientoBancarioTipo.ACREDITACION_POS,
      monto,
      observacion: `CONCILIACION POS #${guardada.id} (${acreds.length} ACREDITACIONES)`,
      numeroComprobante: referencia || undefined,
      responsable: usuario,
      fecha: new Date(y, mo - 1, d, 12, 0, 0),
    });

    // La diferencia se reparte en la última (las demás quedan exactas): el total cierra con el crédito real.
    const ahora = new Date();
    acreds.sort((a, b) => a.id - b.id);
    acreds.forEach((a, i) => {
      const ultima = i === acreds.length - 1;
      a.montoAcreditado = ultima ? +(Number(a.montoEsperado) + diferencia).toFixed(2) : Number(a.montoEsperado);
      a.diferencia = ultima ? diferencia : 0;
      a.estado = ultima && diferencia !== 0 ? AcreditacionPosEstado.CON_DIFERENCIA : AcreditacionPosEstado.VERIFICADO;
      a.fechaAcreditacionReal = new Date(y, mo - 1, d, 12, 0, 0);
      a.fechaVerificacion = ahora;
      a.conciliacionId = guardada.id;
      if (usuario) a.verificadoPor = usuario;
    });
    await m.save(AcreditacionPos, acreds);
    await qr.commitTransaction();
    return guardada;
  } catch (e) {
    await qr.rollbackTransaction();
    throw e;
  } finally {
    await qr.release();
  }
}

/** Deshace una conciliación: resta el crédito del saldo (movimiento inverso) y devuelve las acreditaciones a PENDIENTE. */
export async function deshacerConciliacion(dataSource: DataSource, id: number, usuario: Usuario | null): Promise<ConciliacionPos> {
  const qr = dataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    const m = qr.manager;
    const conc = await m.getRepository(ConciliacionPos).findOne({ where: { id }, relations: ['cuentaBancaria'] });
    if (!conc) throw new Error(`Conciliación ${id} no encontrada`);
    if (conc.estado !== ConciliacionPosEstado.ACTIVA) throw new Error('CONCILIACION_YA_DESHECHA');
    const cb = await m.getRepository(CuentaBancaria).findOne({ where: { id: conc.cuentaBancaria.id } });
    if (!cb) throw new Error('Cuenta bancaria no encontrada');
    const monto = Number(conc.montoCredito);
    cb.saldo = +(Number(cb.saldo) - monto).toFixed(2);
    await m.save(CuentaBancaria, cb);
    await registrarMovimientoBancario(m, dataSource, {
      cuentaBancariaId: cb.id,
      tipo: MovimientoBancarioTipo.AJUSTE_NEGATIVO,
      monto,
      observacion: `DESHACER CONCILIACION POS #${conc.id}`,
      responsable: usuario,
    });
    const acreds = await m.getRepository(AcreditacionPos).find({ where: { conciliacionId: conc.id } as any });
    for (const a of acreds) {
      a.estado = AcreditacionPosEstado.PENDIENTE;
      // null (no undefined): TypeORM ignora undefined al guardar y dejaría los valores viejos.
      a.montoAcreditado = null as any;
      a.diferencia = null as any;
      a.fechaAcreditacionReal = null as any;
      a.fechaVerificacion = null as any;
      a.verificadoPor = null as any;
      a.conciliacionId = null as any;
    }
    if (acreds.length) await m.save(AcreditacionPos, acreds);
    conc.estado = ConciliacionPosEstado.DESHECHA;
    conc.fechaDeshecha = new Date();
    await setEntityUserTracking(dataSource, conc, usuario?.id, true);
    await m.save(ConciliacionPos, conc);
    await qr.commitTransaction();
    return conc;
  } catch (e) {
    await qr.rollbackTransaction();
    throw e;
  } finally {
    await qr.release();
  }
}

/** Resumen de un rango: pendiente por cuenta y día esperado; comisiones, IVA y retenciones (informativo). */
export async function resumenAcreditaciones(manager: EntityManager, p: { desde: string; hasta: string }) {
  const desde = new Date(`${p.desde}T00:00:00`);
  const hasta = new Date(`${p.hasta}T00:00:00`); hasta.setDate(hasta.getDate() + 1);
  const filas = await manager.getRepository(AcreditacionPos).createQueryBuilder('a')
    .leftJoinAndSelect('a.maquinaPos', 'mp')
    .leftJoinAndSelect('a.cuentaBancaria', 'cb')
    .leftJoinAndSelect('cb.moneda', 'mon')
    .where('a.fechaTransaccion >= :desde AND a.fechaTransaccion < :hasta', { desde, hasta })
    .getMany();
  const pendientes = await manager.getRepository(AcreditacionPos).createQueryBuilder('a')
    .leftJoinAndSelect('a.cuentaBancaria', 'cb')
    .leftJoinAndSelect('a.maquinaPos', 'mp')
    .where('a.estado = :e', { e: AcreditacionPosEstado.PENDIENTE })
    .getMany();
  const hoy = diaLocal(new Date());
  const porCuentaDia = new Map<string, any>();
  for (const a of pendientes) {
    const dia = diaLocal(new Date(a.fechaEsperadaAcreditacion));
    const k = `${a.cuentaBancaria?.id}|${dia}`;
    const it = porCuentaDia.get(k) ?? { cuentaBancariaId: a.cuentaBancaria?.id, cuenta: a.cuentaBancaria?.nombre, fecha: dia, monto: 0, cantidad: 0, vencida: dia < hoy };
    it.monto = +(it.monto + Number(a.montoEsperado)).toFixed(2);
    it.cantidad++;
    porCuentaDia.set(k, it);
  }
  const porMaquinaMedio = new Map<string, any>();
  // Totales por moneda de la cuenta destino: no se suman guaraníes con reales.
  const totPorMoneda = new Map<string, any>();
  for (const a of filas) {
    const moneda = a.cuentaBancaria?.moneda?.simbolo ?? '';
    const k = `${a.maquinaPos?.id}|${a.medio || 'SIN_MEDIO'}|${moneda}`;
    const it = porMaquinaMedio.get(k) ?? { maquina: a.maquinaPos?.nombre, medio: a.medio || null, moneda, bruto: 0, comision: 0, ivaComision: 0, retRenta: 0, retIva: 0, neto: 0, cantidad: 0 };
    const tot = totPorMoneda.get(moneda) ?? { moneda, principal: !!a.cuentaBancaria?.moneda?.principal, bruto: 0, comision: 0, ivaComision: 0, retRenta: 0, retIva: 0, neto: 0, cantidad: 0 };
    totPorMoneda.set(moneda, tot);
    const v = {
      bruto: Number(a.montoOriginal) || 0, comision: Number(a.montoComision) || 0, ivaComision: Number(a.montoIvaComision) || 0,
      retRenta: Number(a.montoRetRenta) || 0, retIva: Number(a.montoRetIva) || 0,
    };
    const neto = v.bruto - v.comision - v.ivaComision - v.retRenta - v.retIva;
    for (const o of [it, tot] as any[]) {
      o.bruto += v.bruto; o.comision += v.comision; o.ivaComision += v.ivaComision; o.retRenta += v.retRenta; o.retIva += v.retIva;
      o.neto += neto; o.cantidad++;
    }
    porMaquinaMedio.set(k, it);
  }
  const r2 = (o: any) => { for (const k of ['bruto', 'comision', 'ivaComision', 'retRenta', 'retIva', 'neto']) o[k] = +Number(o[k]).toFixed(2); return o; };
  const totalesPorMoneda = Array.from(totPorMoneda.values()).map(r2).sort((a, b) => Number(b.principal) - Number(a.principal));
  const vacio = { moneda: '', principal: true, bruto: 0, comision: 0, ivaComision: 0, retRenta: 0, retIva: 0, neto: 0, cantidad: 0 };
  return {
    pendientePorCuentaYFecha: Array.from(porCuentaDia.values()).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
    porMaquinaYMedio: Array.from(porMaquinaMedio.values()).map(r2),
    // `totales`: los de la moneda principal (o la única); el resto en `totalesPorMoneda`.
    totales: totalesPorMoneda[0] ?? vacio,
    totalesPorMoneda,
    nota: 'IVA de comisión y retenciones: informativo, a validar por el contador.',
  };
}

export function registerAcreditacionesPosReglasHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  ipcMain.handle('get-maquina-pos-reglas', async (_e, maquinaPosId: number) => {
    await ensurePermission(dataSource, getCurrentUser, ['BANCOS_VER', 'BANCOS_GESTIONAR']);
    return dataSource.getRepository(MaquinaPosRegla).find({ where: { maquinaPos: { id: Number(maquinaPosId) } }, order: { medio: 'ASC' } });
  });

  ipcMain.handle('save-maquina-pos-regla', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    const repo = dataSource.getRepository(MaquinaPosRegla);
    const medio = normalizarMedio(data?.medio);
    const maquinaPosId = Number(data?.maquinaPosId ?? data?.maquinaPos?.id);
    if (!medio) throw new Error('MEDIO_INVALIDO');
    if (!maquinaPosId) throw new Error('MAQUINA_REQUERIDA');
    const num = (v: any, min: number, max: number) => {
      const n = Number(v ?? 0);
      if (!Number.isFinite(n) || n < min || n > max) throw new Error('VALOR_FUERA_DE_RANGO');
      return n;
    };
    const ent = data?.id ? await repo.findOne({ where: { id: Number(data.id) } }) : repo.create();
    if (!ent) throw new Error('Regla no encontrada');
    Object.assign(ent, {
      maquinaPos: { id: maquinaPosId } as any,
      medio,
      plazoDias: Math.floor(num(data.plazoDias, 0, 60)),
      tipoDias: data.tipoDias === 'CORRIDOS' ? 'CORRIDOS' : 'HABILES',
      base: data.base === 'TRANSACCION' ? 'TRANSACCION' : 'PROCESO',
      correrAHabil: data.correrAHabil !== false,
      porcentajeComision: num(data.porcentajeComision, 0, 100),
      redondeoComision: num(data.redondeoComision, 0, 1000),
      porcentajeIvaComision: num(data.porcentajeIvaComision, 0, 100),
      porcentajeRetRenta: num(data.porcentajeRetRenta, 0, 100),
      porcentajeRetIva: num(data.porcentajeRetIva, 0, 100),
      divisorIvaVenta: num(data.divisorIvaVenta ?? 11, 0, 1000),
      modo: data.modo === 'BRUTO_COMISION_APARTE' ? 'BRUTO_COMISION_APARTE' : 'NETO',
      verificada: !!data.verificada,
      observacion: data.observacion ? String(data.observacion).slice(0, 500) : null,
      activo: data.activo !== false,
    });
    await setEntityUserTracking(dataSource, ent, getCurrentUser()?.id, !!data?.id);
    try {
      return await repo.save(ent);
    } catch (e: any) {
      if (/unique|UNIQUE/.test(String(e?.message))) throw new Error('REGLA_DUPLICADA_PARA_MEDIO');
      throw e;
    }
  });

  ipcMain.handle('delete-maquina-pos-regla', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    await dataSource.getRepository(MaquinaPosRegla).delete({ id: Number(id) });
    return true;
  });

  /** Carga como datos iniciales las reglas observadas del proveedor (solo las que no existen). */
  ipcMain.handle('cargar-reglas-observadas-pos', async (_e, maquinaPosId: number, proveedor: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    const lista = REGLAS_OBSERVADAS[String(proveedor || '').toUpperCase()];
    if (!lista) return { creadas: 0, proveedores: Object.keys(REGLAS_OBSERVADAS) };
    const repo = dataSource.getRepository(MaquinaPosRegla);
    let creadas = 0;
    for (const o of lista) {
      const existe = await repo.findOne({ where: { maquinaPos: { id: Number(maquinaPosId) }, medio: o.medio as MedioPos } });
      if (existe) continue;
      const ent = repo.create({
        ...o.regla, maquinaPos: { id: Number(maquinaPosId) } as any, medio: o.medio,
        verificada: o.verificada, activo: o.verificada,
        observacion: o.verificada ? 'Verificada con extracto real' : 'SIN VERIFICAR: valores aproximados, confirmar con un extracto antes de activar',
      } as any);
      await setEntityUserTracking(dataSource, ent, getCurrentUser()?.id, false);
      await repo.save(ent);
      creadas++;
    }
    return { creadas };
  });

  ipcMain.handle('sugerir-conciliacion-pos', async (_e, p: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    return sugerirConciliacion(dataSource.manager, p);
  });

  ipcMain.handle('conciliar-acreditaciones-pos', async (_e, p: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    return conciliar(dataSource, p, getCurrentUser());
  });

  ipcMain.handle('deshacer-conciliacion-pos', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'BANCOS_GESTIONAR');
    return deshacerConciliacion(dataSource, Number(id), getCurrentUser());
  });

  ipcMain.handle('get-conciliaciones-pos', async (_e, cuentaBancariaId?: number) => {
    await ensurePermission(dataSource, getCurrentUser, ['BANCOS_VER', 'BANCOS_GESTIONAR']);
    return dataSource.getRepository(ConciliacionPos).find({
      where: cuentaBancariaId ? { cuentaBancaria: { id: Number(cuentaBancariaId) } } : {},
      relations: ['cuentaBancaria'],
      order: { fechaCredito: 'DESC', id: 'DESC' },
      take: 200,
    });
  });

  ipcMain.handle('get-resumen-acreditaciones-pos', async (_e, p: any) => {
    await ensurePermission(dataSource, getCurrentUser, ['BANCOS_VER', 'BANCOS_GESTIONAR']);
    return resumenAcreditaciones(dataSource.manager, p);
  });
}
