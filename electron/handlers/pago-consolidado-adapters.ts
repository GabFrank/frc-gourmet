/**
 * Adaptadores por concepto del pago consolidado.
 *
 * Cada adaptador sabe tres cosas de SU tipo de obligacion: como listar las
 * pendientes, como marcarla pagada, y como deshacer eso. Ninguno crea
 * movimientos de caja ni toca saldos: el asiento vive en un unico lugar
 * (`pago-consolidado.handler.ts`), que es justamente el punto del refactor —
 * hoy ese bloque esta escrito cinco veces en el repo.
 *
 * Ver `docs/planes/PLAN-PAGO-CONSOLIDADO-CAJA-MAYOR.md`.
 */
import { DataSource } from 'typeorm';

import { CuentaPorPagarCuota } from '../../src/app/database/entities/financiero/cuenta-por-pagar-cuota.entity';
import {
  CuentaPorPagarEstado,
  CuentaPorPagarTipo,
  CuotaEstado,
} from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { Gasto } from '../../src/app/database/entities/financiero/gasto.entity';
import { GastoEstado, TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { Vale } from '../../src/app/database/entities/rrhh/vale.entity';
import { ValeEstado } from '../../src/app/database/entities/rrhh/vale-estado.enum';
import { LiquidacionSueldo } from '../../src/app/database/entities/rrhh/liquidacion-sueldo.entity';
import { LiquidacionSueldoEstado } from '../../src/app/database/entities/rrhh/liquidacion-sueldo-estado.enum';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import {
  PagoConcepto,
  PagoOrigenTipo,
} from '../../src/app/database/entities/financiero/pago-consolidado-enums';

import { aplicarEstadoPagoCuota, revertirEstadoPagoCuota } from './cuentas-por-pagar.handler';
import {
  aplicarEstadoPagoLiquidacion,
  revertirEstadoPagoLiquidacion,
} from './liquidacion-sueldo.handler';

/** Fila normalizada de obligacion pendiente que consume el componente. */
export interface ObligacionPendiente {
  origenTipo: PagoOrigenTipo;
  origenId: number;
  /** Numero visible para el usuario (nro de cuota, id del gasto, etc.). */
  numero: string;
  descripcion: string;
  beneficiario: string | null;
  beneficiarioId: number | null;
  fecha: Date | string | null;
  monedaId: number | null;
  monedaSimbolo: string | null;
  monedaDenominacion: string | null;
  decimales: number;
  montoTotal: number;
  montoPagado: number;
  saldoPendiente: number;
  bloqueado: boolean;
  bloqueoMotivo?: string;
  /** Datos extra propios del concepto, para las columnas de la tabla. */
  extra?: Record<string, any>;
}

export interface AdapterCtx {
  dataSource: DataSource;
  currentUser: Usuario | null;
  userId?: number;
}

export interface ConceptoAdapter {
  concepto: PagoConcepto;
  origenTipo: PagoOrigenTipo;
  permiso: string;
  tipoMovimiento: TipoMovimiento;
  listarPendientes(dataSource: DataSource, filtros?: any): Promise<ObligacionPendiente[]>;
  /**
   * Relee la obligacion DENTRO de la transaccion, tomando lock pesimista en
   * Postgres, y devuelve su saldo real. No confiar nunca en el saldo que mando
   * el cliente: entre que se dibujo la pantalla y se confirmo el pago la deuda
   * pudo haberse saldado por otro camino.
   */
  leerYBloquear(queryRunner: any, origenId: number): Promise<{ saldoPendiente: number; monedaId: number; descripcion: string; beneficiario: string | null }>;
  aplicar(queryRunner: any, origenId: number, monto: number, ctx: AdapterCtx): Promise<void>;
  revertir(queryRunner: any, origenId: number, monto: number, ctx: AdapterCtx): Promise<void>;
  /** Columna de referencia clasica del movimiento, cuando el evento cubre 1 solo item. */
  columnaReferencia(origenId: number): Record<string, any>;
}

const dec = (m: any): number => {
  const d = m?.decimales;
  return d === null || d === undefined ? 2 : Number(d);
};
const round2 = (v: number) => +Number(v).toFixed(2);

/**
 * Lock pesimista sobre la fila de la obligacion. Sin esto, dos usuarios (o dos
 * clicks) pueden leer la misma deuda como pendiente y pagarla dos veces: el lock
 * del saldo de caja protege el saldo agregado, no impide el egreso duplicado.
 * SQLite serializa las escrituras por si mismo y no soporta SELECT ... FOR UPDATE.
 *
 * ⚠️ El lock y las `relations` NO pueden ir en la misma consulta. TypeORM resuelve
 * las relaciones con LEFT JOIN y Postgres rechaza el FOR UPDATE:
 *
 *   FOR UPDATE no puede ser aplicado al lado nulable de un outer join
 *
 * Son dos consultas: primero el lock sobre la fila desnuda, despues la carga con
 * relaciones. El FOR UPDATE se mantiene hasta el fin de la transaccion, asi que
 * la segunda lectura ya esta protegida. SQLite nunca lo hizo notar — su driver
 * ignora los locks — y el error salia recien en el local del cliente, con el pago
 * a medio registrar (issue #258).
 */
async function findConLock<T>(queryRunner: any, entidad: any, id: number, relations?: string[]): Promise<T | null> {
  const esPg = queryRunner.connection?.options?.type === 'postgres';
  if (esPg) {
    await queryRunner.manager.findOne(entidad, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
  }
  return queryRunner.manager.findOne(entidad, { where: { id }, relations });
}

// ───────────────────────────── COMPRA (cuotas CPP) ─────────────────────────────

const compraAdapter: ConceptoAdapter = {
  concepto: PagoConcepto.COMPRA,
  origenTipo: PagoOrigenTipo.CPP_CUOTA,
  permiso: 'COMPRAS_GESTIONAR',
  tipoMovimiento: TipoMovimiento.EGRESO_CUOTA_COMPRA,

  async listarPendientes(dataSource, filtros) {
    const qb = dataSource.getRepository(CuentaPorPagarCuota).createQueryBuilder('cuota')
      .leftJoin('cuota.cuentaPorPagar', 'cpp')
      .leftJoin('cpp.proveedor', 'pv')
      .leftJoin('cpp.moneda', 'mon')
      // CPP guarda `compraId` como columna plana, sin relacion ORM: JOIN crudo.
      .leftJoin('compras', 'compra', 'compra.id = cpp.compra_id')
      // Solo COMPRA: un PRESTAMO_FUNCIONARIO invierte el signo del movimiento
      // (es un INGRESO) y no tiene nada que hacer en un pago de egreso.
      .where('cpp.tipo = :tipo', { tipo: CuentaPorPagarTipo.COMPRA })
      .andWhere('cuota.estado IN (:...estados)', { estados: [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL] })
      .andWhere('cpp.estado = :cppEstado', { cppEstado: CuentaPorPagarEstado.ACTIVO });

    if (filtros?.beneficiarioId) qb.andWhere('pv.id = :pid', { pid: filtros.beneficiarioId });
    if (filtros?.monedaId) qb.andWhere('mon.id = :mid', { mid: filtros.monedaId });

    // Aliases quoteados: Postgres pliega a minuscula los identificadores sin
    // comillas y rompe el acceso por propiedad en getRawMany.
    qb.select([
      'cuota.id AS "id"',
      'cpp.id AS "cppId"',
      'compra.numero_nota AS "numeroNota"',
      'cuota.numero AS "numero"',
      'cpp.cantidadCuotas AS "cantidadCuotas"',
      'cuota.fechaVencimiento AS "fechaVencimiento"',
      'cuota.monto AS "monto"',
      'cuota.montoPagado AS "montoPagado"',
      'pv.id AS "proveedorId"',
      'pv.nombre AS "proveedorNombre"',
      'mon.id AS "monedaId"',
      'mon.simbolo AS "monedaSimbolo"',
      'mon.denominacion AS "monedaDenominacion"',
      'mon.decimales AS "decimales"',
    ])
      .orderBy('pv.nombre', 'ASC')
      .addOrderBy('cuota.fechaVencimiento', 'ASC')
      .addOrderBy('cuota.id', 'ASC');

    const rows = await qb.getRawMany();
    return rows.map((r: any) => {
      const monto = Number(r.monto) || 0;
      const pagado = Number(r.montoPagado) || 0;
      const saldo = round2(monto - pagado);
      const sinMoneda = r.monedaId == null;
      return {
        origenTipo: PagoOrigenTipo.CPP_CUOTA,
        origenId: Number(r.id),
        numero: r.numeroNota ? String(r.numeroNota) : `CPP #${r.cppId}`,
        descripcion: `CUOTA ${Number(r.numero)}/${Number(r.cantidadCuotas) || 1}`
          + (r.numeroNota ? ` — NOTA ${r.numeroNota}` : ` — CPP #${r.cppId}`),
        beneficiario: r.proveedorNombre || null,
        beneficiarioId: r.proveedorId != null ? Number(r.proveedorId) : null,
        fecha: r.fechaVencimiento || null,
        monedaId: sinMoneda ? null : Number(r.monedaId),
        monedaSimbolo: r.monedaSimbolo || null,
        monedaDenominacion: r.monedaDenominacion || null,
        decimales: dec({ decimales: r.decimales }),
        montoTotal: monto,
        montoPagado: pagado,
        saldoPendiente: saldo,
        bloqueado: sinMoneda || saldo <= 0,
        bloqueoMotivo: sinMoneda ? 'La cuenta por pagar no tiene moneda' : (saldo <= 0 ? 'Sin saldo pendiente' : undefined),
        extra: { cppId: Number(r.cppId), numeroCuota: Number(r.numero), cantidadCuotas: Number(r.cantidadCuotas) || 1 },
      } as ObligacionPendiente;
    });
  },

  async leerYBloquear(queryRunner, origenId) {
    const cuota = await findConLock<CuentaPorPagarCuota>(queryRunner, CuentaPorPagarCuota, origenId,
      ['cuentaPorPagar', 'cuentaPorPagar.moneda', 'cuentaPorPagar.proveedor']);
    if (!cuota) throw new Error(`Cuota ${origenId} no encontrada`);
    if (cuota.estado === CuotaEstado.PAGADA) throw new Error(`La cuota #${cuota.numero} ya está pagada`);
    if (cuota.estado === CuotaEstado.CANCELADA) throw new Error(`La cuota #${cuota.numero} está anulada`);
    const cpp: any = cuota.cuentaPorPagar;
    if (cpp?.tipo !== CuentaPorPagarTipo.COMPRA) {
      throw new Error('Solo se pagan cuotas de compra por este camino');
    }
    const monedaId = cpp?.moneda?.id;
    if (!monedaId) throw new Error('La cuenta por pagar no tiene moneda definida');
    return {
      saldoPendiente: round2(Number(cuota.monto) - Number(cuota.montoPagado)),
      monedaId: Number(monedaId),
      descripcion: `CUOTA ${cuota.numero} — CPP #${cpp?.id}`,
      beneficiario: cpp?.proveedor?.nombre || null,
    };
  },

  async aplicar(queryRunner, origenId, monto, ctx) {
    await aplicarEstadoPagoCuota(queryRunner, origenId, monto, ctx.currentUser, ctx.dataSource);
  },

  async revertir(queryRunner, origenId, monto, ctx) {
    await revertirEstadoPagoCuota(queryRunner, origenId, monto, ctx.currentUser, ctx.dataSource);
  },

  columnaReferencia(origenId) {
    return { cuentaPorPagarCuotaId: origenId };
  },
};

// ───────────────────────────────── GASTO ─────────────────────────────────

const gastoAdapter: ConceptoAdapter = {
  concepto: PagoConcepto.GASTO,
  origenTipo: PagoOrigenTipo.GASTO,
  permiso: 'CAJA_MAYOR_OPERAR',
  tipoMovimiento: TipoMovimiento.EGRESO_GASTO,

  async listarPendientes(dataSource, filtros) {
    const qb = dataSource.getRepository(Gasto).createQueryBuilder('g')
      .leftJoinAndSelect('g.moneda', 'mon')
      .leftJoinAndSelect('g.proveedor', 'pv')
      .leftJoinAndSelect('g.gastoCategoria', 'cat')
      // Gasto no tiene columna `activo`: el estado ya acota el listado.
      .where('g.estado = :estado', { estado: GastoEstado.PENDIENTE });
    if (filtros?.monedaId) qb.andWhere('mon.id = :mid', { mid: filtros.monedaId });
    if (filtros?.beneficiarioId) qb.andWhere('pv.id = :pid', { pid: filtros.beneficiarioId });
    qb.orderBy('g.fecha', 'ASC').addOrderBy('g.id', 'ASC');

    const gastos = await qb.getMany();
    return gastos.map((g: any) => {
      const monto = Number(g.monto) || 0;
      const sinMoneda = !g.moneda?.id;
      return {
        origenTipo: PagoOrigenTipo.GASTO,
        origenId: g.id,
        numero: `#${g.id}`,
        descripcion: `GASTO #${g.id}`
          + (g.gastoCategoria?.nombre ? ` (${g.gastoCategoria.nombre})` : '')
          + (g.descripcion ? ` ${g.descripcion}` : ''),
        beneficiario: g.proveedor?.nombre || null,
        beneficiarioId: g.proveedor?.id ?? null,
        fecha: g.fecha || null,
        monedaId: sinMoneda ? null : Number(g.moneda.id),
        monedaSimbolo: g.moneda?.simbolo || null,
        monedaDenominacion: g.moneda?.denominacion || null,
        decimales: dec(g.moneda),
        montoTotal: monto,
        montoPagado: 0,
        saldoPendiente: monto,
        bloqueado: sinMoneda || monto <= 0,
        bloqueoMotivo: sinMoneda ? 'El gasto no tiene moneda' : (monto <= 0 ? 'Monto en 0' : undefined),
        extra: { categoria: g.gastoCategoria?.nombre || null, numeroComprobante: g.numeroComprobante || null },
      } as ObligacionPendiente;
    });
  },

  async leerYBloquear(queryRunner, origenId) {
    const g: any = await findConLock(queryRunner, Gasto, origenId, ['moneda', 'proveedor', 'gastoCategoria']);
    if (!g) throw new Error(`Gasto ${origenId} no encontrado`);
    if (g.estado !== GastoEstado.PENDIENTE) {
      throw new Error(`El gasto #${origenId} está en estado ${g.estado}, no se puede pagar`);
    }
    if (!g.moneda?.id) throw new Error(`El gasto #${origenId} no tiene moneda definida`);
    return {
      saldoPendiente: round2(Number(g.monto)),
      monedaId: Number(g.moneda.id),
      descripcion: `GASTO #${g.id}` + (g.gastoCategoria?.nombre ? ` (${g.gastoCategoria.nombre})` : ''),
      beneficiario: g.proveedor?.nombre || null,
    };
  },

  async aplicar(queryRunner, origenId, _monto, _ctx) {
    const g: any = await queryRunner.manager.findOne(Gasto, { where: { id: origenId } });
    if (!g) throw new Error(`Gasto ${origenId} no encontrado`);
    g.estado = GastoEstado.PAGADO;
    await queryRunner.manager.save(Gasto, g);
  },

  async revertir(queryRunner, origenId, _monto, _ctx) {
    const g: any = await queryRunner.manager.findOne(Gasto, { where: { id: origenId } });
    if (!g) return;
    g.estado = GastoEstado.PENDIENTE;
    await queryRunner.manager.save(Gasto, g);
  },

  columnaReferencia(origenId) {
    return { gasto: { id: origenId } as any };
  },
};

// ────────────────────────────────── VALE ──────────────────────────────────

const valeAdapter: ConceptoAdapter = {
  concepto: PagoConcepto.VALE,
  origenTipo: PagoOrigenTipo.VALE,
  permiso: 'RRHH_VALE_CONFIRMAR',
  tipoMovimiento: TipoMovimiento.EGRESO_VALE,

  async listarPendientes(dataSource, filtros) {
    const qb = dataSource.getRepository(Vale).createQueryBuilder('v')
      .leftJoinAndSelect('v.moneda', 'mon')
      .leftJoinAndSelect('v.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .leftJoinAndSelect('v.motivo', 'mot')
      // Vale tampoco tiene columna `activo`: un vale anulado cambia de estado.
      .where('v.estado = :estado', { estado: ValeEstado.SOLICITADO });
    if (filtros?.monedaId) qb.andWhere('mon.id = :mid', { mid: filtros.monedaId });
    if (filtros?.beneficiarioId) qb.andWhere('f.id = :fid', { fid: filtros.beneficiarioId });
    qb.orderBy('v.fecha', 'ASC').addOrderBy('v.id', 'ASC');

    const vales = await qb.getMany();
    return vales.map((v: any) => {
      const monto = Number(v.monto) || 0;
      const sinMoneda = !v.moneda?.id;
      const nombre = [v.funcionario?.persona?.nombre, v.funcionario?.persona?.apellido]
        .filter(Boolean).join(' ').trim() || null;
      return {
        origenTipo: PagoOrigenTipo.VALE,
        origenId: v.id,
        numero: `#${v.id}`,
        descripcion: `VALE #${v.id}`
          + (v.motivo?.nombre ? ` (${v.motivo.nombre})` : '')
          + (v.descripcion ? ` ${v.descripcion}` : ''),
        beneficiario: nombre,
        beneficiarioId: v.funcionario?.id ?? null,
        fecha: v.fecha || null,
        monedaId: sinMoneda ? null : Number(v.moneda.id),
        monedaSimbolo: v.moneda?.simbolo || null,
        monedaDenominacion: v.moneda?.denominacion || null,
        decimales: dec(v.moneda),
        montoTotal: monto,
        montoPagado: 0,
        saldoPendiente: monto,
        bloqueado: sinMoneda || monto <= 0,
        bloqueoMotivo: sinMoneda ? 'El vale no tiene moneda' : (monto <= 0 ? 'Monto en 0' : undefined),
        extra: { esAdelanto: !!v.esAdelanto, motivo: v.motivo?.nombre || null },
      } as ObligacionPendiente;
    });
  },

  async leerYBloquear(queryRunner, origenId) {
    const v: any = await findConLock(queryRunner, Vale, origenId, ['moneda', 'funcionario', 'funcionario.persona']);
    if (!v) throw new Error(`Vale ${origenId} no encontrado`);
    if (v.estado !== ValeEstado.SOLICITADO) {
      throw new Error(`El vale #${origenId} está en estado ${v.estado}, no se puede pagar`);
    }
    if (!v.moneda?.id) throw new Error(`El vale #${origenId} no tiene moneda definida`);
    const nombre = [v.funcionario?.persona?.nombre, v.funcionario?.persona?.apellido]
      .filter(Boolean).join(' ').trim() || null;
    return {
      saldoPendiente: round2(Number(v.monto)),
      monedaId: Number(v.moneda.id),
      descripcion: `VALE #${v.id}`,
      beneficiario: nombre,
    };
  },

  async aplicar(queryRunner, origenId, _monto, _ctx) {
    const v: any = await queryRunner.manager.findOne(Vale, { where: { id: origenId } });
    if (!v) throw new Error(`Vale ${origenId} no encontrado`);
    v.estado = ValeEstado.CONFIRMADO;
    await queryRunner.manager.save(Vale, v);
  },

  async revertir(queryRunner, origenId, _monto, _ctx) {
    const v: any = await queryRunner.manager.findOne(Vale, { where: { id: origenId } });
    if (!v) return;
    // Vuelve a SOLICITADO, no a ANULADO: la deuda con el funcionario sigue viva,
    // lo que se deshizo es la entrega de la plata.
    v.estado = ValeEstado.SOLICITADO;
    await queryRunner.manager.save(Vale, v);
  },

  columnaReferencia(origenId) {
    return { valeId: origenId };
  },
};

// ────────────────────────── LIQUIDACION DE SUELDO ──────────────────────────

const liquidacionAdapter: ConceptoAdapter = {
  concepto: PagoConcepto.LIQUIDACION_SUELDO,
  origenTipo: PagoOrigenTipo.LIQUIDACION_SUELDO,
  permiso: 'RRHH_LIQUIDACION_PAGAR',
  tipoMovimiento: TipoMovimiento.EGRESO_SALARIO,

  async listarPendientes(dataSource, filtros) {
    const qb = dataSource.getRepository(LiquidacionSueldo).createQueryBuilder('l')
      .leftJoinAndSelect('l.monedaPago', 'mon')
      .leftJoinAndSelect('l.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .where('l.estado = :estado', { estado: LiquidacionSueldoEstado.APROBADA });
    if (filtros?.monedaId) qb.andWhere('mon.id = :mid', { mid: filtros.monedaId });
    if (filtros?.beneficiarioId) qb.andWhere('f.id = :fid', { fid: filtros.beneficiarioId });
    qb.orderBy('l.periodo', 'ASC').addOrderBy('l.id', 'ASC');

    const liqs = await qb.getMany();
    return liqs.map((l: any) => {
      const neto = Number(l.totalNeto) || 0;
      const sinMoneda = !l.monedaPago?.id;
      const nombre = [l.funcionario?.persona?.nombre, l.funcionario?.persona?.apellido]
        .filter(Boolean).join(' ').trim() || null;
      return {
        origenTipo: PagoOrigenTipo.LIQUIDACION_SUELDO,
        origenId: l.id,
        numero: `#${l.id}`,
        descripcion: `LIQUIDACION ${l.periodo} #${l.id}`,
        beneficiario: nombre,
        beneficiarioId: l.funcionario?.id ?? null,
        fecha: l.fechaPago || null,
        monedaId: sinMoneda ? null : Number(l.monedaPago.id),
        monedaSimbolo: l.monedaPago?.simbolo || null,
        monedaDenominacion: l.monedaPago?.denominacion || null,
        decimales: dec(l.monedaPago),
        montoTotal: neto,
        montoPagado: 0,
        saldoPendiente: neto,
        // Un neto en 0 es legitimo (todo el sueldo se fue en descuentos) pero no
        // hay nada que entregar: se aprueba y se paga sin pasar por caja.
        bloqueado: sinMoneda || neto <= 0,
        bloqueoMotivo: sinMoneda
          ? 'La liquidación no tiene moneda de pago'
          : (neto <= 0 ? 'El neto es 0: no hay nada que entregar' : undefined),
        extra: { periodo: l.periodo },
      } as ObligacionPendiente;
    });
  },

  async leerYBloquear(queryRunner, origenId) {
    const l: any = await findConLock(queryRunner, LiquidacionSueldo, origenId,
      ['monedaPago', 'funcionario', 'funcionario.persona']);
    if (!l) throw new Error(`Liquidación ${origenId} no encontrada`);
    if (l.estado !== LiquidacionSueldoEstado.APROBADA) {
      throw new Error(`La liquidación #${origenId} está en estado ${l.estado}, solo APROBADA se puede pagar`);
    }
    if (!l.monedaPago?.id) throw new Error(`La liquidación #${origenId} no tiene moneda de pago`);
    const nombre = [l.funcionario?.persona?.nombre, l.funcionario?.persona?.apellido]
      .filter(Boolean).join(' ').trim() || null;
    return {
      saldoPendiente: round2(Number(l.totalNeto)),
      monedaId: Number(l.monedaPago.id),
      descripcion: `LIQUIDACION ${l.periodo} #${l.id}`,
      beneficiario: nombre,
    };
  },

  async aplicar(queryRunner, origenId, _monto, ctx) {
    const l: any = await queryRunner.manager.findOne(LiquidacionSueldo, {
      where: { id: origenId },
      relations: ['funcionario', 'funcionario.persona', 'monedaPago'],
    });
    if (!l) throw new Error(`Liquidación ${origenId} no encontrada`);
    // El neteo (vales, cuotas CPP/CPC, aguinaldo, comisiones, vacaciones).
    await aplicarEstadoPagoLiquidacion(queryRunner, l, ctx.userId, ctx.currentUser, ctx.dataSource);
    l.estado = LiquidacionSueldoEstado.PAGADA;
    l.fechaPago = new Date();
    // `movimientoId` y `cuentaBancariaId` quedan en null a proposito: este pago
    // puede haber generado N movimientos y la liquidacion solo tiene lugar para
    // uno. La reversa la hace `anular-pago-consolidado`, y por eso
    // `anular-liquidacion-sueldo` queda bloqueado para estas liquidaciones.
    await queryRunner.manager.save(LiquidacionSueldo, l);
  },

  async revertir(queryRunner, origenId, _monto, ctx) {
    const l: any = await queryRunner.manager.findOne(LiquidacionSueldo, {
      where: { id: origenId },
      relations: ['funcionario', 'funcionario.persona', 'monedaPago'],
    });
    if (!l) return;
    await revertirEstadoPagoLiquidacion(queryRunner, l, ctx.userId, ctx.dataSource);
    l.estado = LiquidacionSueldoEstado.APROBADA;
    (l as any).fechaPago = null;
    await queryRunner.manager.save(LiquidacionSueldo, l);
  },

  columnaReferencia(origenId) {
    return { liquidacionSueldoId: origenId };
  },
};

// ─────────────────────────────── registro ───────────────────────────────

export const ADAPTERS: Record<PagoConcepto, ConceptoAdapter> = {
  [PagoConcepto.COMPRA]: compraAdapter,
  [PagoConcepto.GASTO]: gastoAdapter,
  [PagoConcepto.VALE]: valeAdapter,
  [PagoConcepto.LIQUIDACION_SUELDO]: liquidacionAdapter,
};

export function getAdapter(concepto: PagoConcepto): ConceptoAdapter {
  const a = ADAPTERS[concepto];
  if (!a) throw new Error(`Concepto de pago desconocido: ${concepto}`);
  return a;
}
