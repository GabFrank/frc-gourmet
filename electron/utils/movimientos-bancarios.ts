import { DataSource } from 'typeorm';
import { MovimientoBancario, MovimientoBancarioTipo } from '../../src/app/database/entities/financiero/movimiento-bancario.entity';
import { dbQuery } from './db-query';

export interface MovimientoBancarioUnificado {
  fecha: any;
  tipo: string;
  monto: number;
  esIngreso: boolean;
  descripcion: string;
  numeroComprobante: string | null;
  responsable: string;
  origen: string;
  id: number;
  anulado: boolean;
  // Estampados cuando opts.stampFuente:
  monedaSimbolo?: string;
  fuenteLabel?: string;
  fuenteCuentaId?: number;
}

/**
 * Tipos de movimiento bancario considerados "ruidosos": son de alto volumen y
 * poluyen la lista consolidada de Caja Mayor, por lo que se ocultan por defecto
 * (mostrables con un toggle). Agregar acá cualquier tipo futuro que deba
 * ocultarse por defecto en la consolidada.
 */
export const TIPOS_BANCARIOS_RUIDOSOS = ['ACREDITACION_POS'];

export interface MovimientosBancariosOpts {
  /**
   * Si es true, excluye los tipos de TIPOS_BANCARIOS_RUIDOSOS del resultado.
   * Default false (= devuelve todo). La vista de cuenta bancaria individual no lo
   * setea; la consolidada de Caja Mayor lo activa salvo que el toggle pida verlos.
   */
  excluirRuidosos?: boolean;
  fechaDesde?: any;
  fechaHasta?: any;
  /** Estampa monedaSimbolo / fuenteLabel (nombre de cuenta) / fuenteCuentaId en cada item. */
  stampFuente?: boolean;
}

/**
 * Junta el historial de movimientos de una o varias cuentas bancarias, unificando
 * MovimientosBancarios manuales + Cheques cobrados + AcreditacionesPos + OperacionesFinancieras
 * + EntradasVarias + Gastos + Vales + Cobros de cliente en una forma plana común.
 *
 * Devuelve los items SIN filtrar por tipo/esIngreso y SIN paginar (eso lo hace el llamador).
 * Reutilizado por:
 *  - get-movimientos-cuenta-bancaria (1 cuenta, sin exclusiones)
 *  - get-movimientos-caja-mayor-consolidados (N cuentas visibles, excluye POS, estampa fuente)
 */
export async function getMovimientosBancariosUnificados(
  dataSource: DataSource,
  accountIds: number[],
  opts: MovimientosBancariosOpts = {},
): Promise<MovimientoBancarioUnificado[]> {
  const items: MovimientoBancarioUnificado[] = [];
  if (!accountIds || accountIds.length === 0) return items;

  // Lookup de moneda/nombre por cuenta (para estampar fuente)
  const cuentaInfo = new Map<number, { nombre: string; monedaSimbolo: string }>();
  if (opts.stampFuente) {
    const cuentaRows = await dbQuery(
      dataSource,
      `SELECT cb.id, cb.nombre, m.simbolo AS "monedaSimbolo"
       FROM cuentas_bancarias cb
       LEFT JOIN monedas m ON cb.moneda_id = m.id
       WHERE cb.id IN (${accountIds.map(() => '?').join(',')})`,
      accountIds,
    );
    for (const r of cuentaRows) {
      cuentaInfo.set(Number(r.id), { nombre: r.nombre, monedaSimbolo: r.monedaSimbolo || '' });
    }
  }

  for (const cuentaBancariaId of accountIds) {
    const base = items.length;

    // 1. Movimientos manuales
    const mbRepo = dataSource.getRepository(MovimientoBancario);
    const mbQb = mbRepo.createQueryBuilder('mb')
      .leftJoinAndSelect('mb.responsable', 'responsable')
      .leftJoinAndSelect('responsable.persona', 'persona')
      .where('mb.cuenta_bancaria_id = :id', { id: cuentaBancariaId });
    if (opts.fechaDesde) mbQb.andWhere('mb.fecha >= :fd', { fd: opts.fechaDesde });
    if (opts.fechaHasta) mbQb.andWhere('mb.fecha <= :fh', { fh: opts.fechaHasta });
    const movs = await mbQb.getMany();
    for (const m of movs) {
      const esAcredPos = m.tipoMovimiento === MovimientoBancarioTipo.ACREDITACION_POS;
      items.push({
        fecha: m.fecha,
        tipo: m.tipoMovimiento,
        monto: Number(m.monto),
        esIngreso: m.tipoMovimiento === MovimientoBancarioTipo.ENTRADA_MANUAL
          || m.tipoMovimiento === MovimientoBancarioTipo.AJUSTE_POSITIVO
          || esAcredPos,
        descripcion: m.observacion || '-',
        numeroComprobante: m.numeroComprobante,
        responsable: m.responsable?.persona?.nombre || m.responsable?.nickname || '-',
        origen: esAcredPos ? 'POS' : 'MANUAL',
        id: m.id,
        anulado: m.anulado,
      });
    }

    // C-01: dedupe. Todo gasto/vale/entrada/cobro/operación pagado desde/hacia una
    // cuenta bancaria crea un MovimientoBancario (helper registrarMovimientoBancario),
    // que la sección 1 ya lista. Sin filtrar, las secciones 4-8 (que listan de la
    // tabla origen) duplicarían cada evento. Solución sin migración: saltar en 4-8
    // la fila origen SI ya existe su MovimientoBancario, detectado por el token
    // "#<id>" de la observación (uppercased por el helper). Las filas históricas
    // previas al helper NO tienen MovimientoBancario y se siguen listando por origen,
    // así el ledger nunca pierde movimientos ni deja de cuadrar con el saldo.
    const gastoConMB = new Set<number>();
    const valeConMB = new Set<number>();
    const entradaConMB = new Set<number>();
    const opfinConMB = new Set<number>();
    const cobroConMB = new Set<string>();      // key `${cpcId}:${cuotaNumero}`
    const anulCobroConMB = new Set<number>();  // cuotaId
    for (const m of movs) {
      const obs = (m.observacion || '').toUpperCase();
      let mm: RegExpMatchArray | null;
      if ((mm = obs.match(/^GASTO #(\d+)/))) gastoConMB.add(Number(mm[1]));
      else if ((mm = obs.match(/^VALE #(\d+)/))) valeConMB.add(Number(mm[1]));
      else if ((mm = obs.match(/^ENTRADA VARIA #(\d+)/))) entradaConMB.add(Number(mm[1]));
      else if ((mm = obs.match(/^(?:DEPOSITO|RETIRO) BANCARIO OP\.FIN #(\d+)/))) opfinConMB.add(Number(mm[1]));
      else if ((mm = obs.match(/^COBRO #(\d+) - CPC #(\d+)/))) cobroConMB.add(`${Number(mm[2])}:${Number(mm[1])}`);
      else if ((mm = obs.match(/^ANULACION COBRO CPC CUOTA #(\d+)/))) anulCobroConMB.add(Number(mm[1]));
    }

    // 2. Cheques (egresos cuando son cobrados)
    const chequeRows = await dbQuery(dataSource,
      `SELECT id, monto, estado, fecha_cobro AS "fechaCobro", fecha_emision AS "fechaEmision",
              numero_cheque AS "numeroCheque", beneficiario, es_diferido AS "esDiferido"
       FROM cheques WHERE cuenta_bancaria_id = ?`,
      [cuentaBancariaId],
    );
    for (const ch of chequeRows) {
      if (ch.estado === 'COBRADO') {
        items.push({
          fecha: ch.fechaCobro || ch.fechaEmision,
          tipo: 'CHEQUE_COBRADO',
          monto: Number(ch.monto),
          esIngreso: false,
          descripcion: `Cheque #${ch.numeroCheque} - ${ch.beneficiario || 'AL PORTADOR'}`,
          numeroComprobante: ch.numeroCheque,
          responsable: '-',
          origen: 'CHEQUE',
          id: ch.id,
          anulado: false,
        });
      }
    }

    // 3. Acreditaciones POS: NO se listan desde la entidad AcreditacionPos. Al
    //    acreditar (auto o verificada) se crea un MovimientoBancario con
    //    tipo = ACREDITACION_POS (ver banking.handler), que YA se incluye en la
    //    sección 1. Listar también la entidad duplicaba cada acreditación. El
    //    tipo ACREDITACION_POS está en TIPOS_BANCARIOS_RUIDOSOS, así que el
    //    filtro genérico de abajo lo oculta por defecto en la consolidada.

    // 4. Operaciones financieras (DEPOSITO_BANCARIO destino, RETIRO_BANCARIO origen)
    const opRows = await dbQuery(dataSource,
      `SELECT id, tipo_operacion AS "tipoOp", descripcion, fecha,
              monto_origen AS "montoOrigen", monto_destino AS "montoDestino",
              cuenta_bancaria_origen_id AS "cbOrigenId", cuenta_bancaria_destino_id AS "cbDestinoId",
              anulado
       FROM operaciones_financieras
       WHERE (cuenta_bancaria_origen_id = ? OR cuenta_bancaria_destino_id = ?) AND anulado = false`,
      [cuentaBancariaId, cuentaBancariaId],
    );
    for (const op of opRows) {
      if (opfinConMB.has(Number(op.id))) continue; // ya listado como MovimientoBancario (sección 1)
      if (op.tipoOp === 'DEPOSITO_BANCARIO' && Number(op.cbDestinoId) === cuentaBancariaId) {
        items.push({
          fecha: op.fecha,
          tipo: 'DEPOSITO',
          monto: Number(op.montoDestino),
          esIngreso: true,
          descripcion: op.descripcion || 'Deposito bancario',
          numeroComprobante: null,
          responsable: '-',
          origen: 'OP_FIN',
          id: op.id,
          anulado: false,
        });
      } else if (op.tipoOp === 'RETIRO_BANCARIO' && Number(op.cbOrigenId) === cuentaBancariaId) {
        items.push({
          fecha: op.fecha,
          tipo: 'RETIRO',
          monto: Number(op.montoOrigen),
          esIngreso: false,
          descripcion: op.descripcion || 'Retiro bancario',
          numeroComprobante: null,
          responsable: '-',
          origen: 'OP_FIN',
          id: op.id,
          anulado: false,
        });
      }
    }

    // 5. Entradas Varias con destino cuenta bancaria
    const evRows = await dbQuery(dataSource,
      `SELECT ev.id, ev.descripcion, ev.fecha, ev.monto, ev.anulado,
              cat.nombre AS "catNombre"
       FROM entradas_varias ev
       LEFT JOIN entradas_varias_categorias cat ON ev.entrada_varia_categoria_id = cat.id
       WHERE ev.cuenta_bancaria_id = ? AND ev.anulado = false`,
      [cuentaBancariaId],
    );
    for (const ev of evRows) {
      if (entradaConMB.has(Number(ev.id))) continue; // ya listado como MovimientoBancario (sección 1)
      items.push({
        fecha: ev.fecha,
        tipo: 'ENTRADA_VARIA',
        monto: Number(ev.monto),
        esIngreso: true,
        descripcion: `${ev.catNombre || ''}: ${ev.descripcion}`,
        numeroComprobante: null,
        responsable: '-',
        origen: 'ENTRADA_VARIA',
        id: ev.id,
        anulado: !!ev.anulado,
      });
    }

    // 6. Gastos pagados desde esta cuenta bancaria (egresos)
    const gastoRows = await dbQuery(dataSource,
      `SELECT g.id, g.descripcion, g.fecha, g.created_at AS "createdAt",
              COALESCE(g.monto_cuenta_bancaria, g.monto) AS monto,
              g.numero_comprobante AS "numeroComprobante", cat.nombre AS "catNombre"
       FROM gastos g
       LEFT JOIN gastos_categorias cat ON g.gasto_categoria_id = cat.id
       WHERE g.cuenta_bancaria_id = ? AND g.estado <> 'CANCELADO'`,
      [cuentaBancariaId],
    );
    for (const g of gastoRows) {
      if (gastoConMB.has(Number(g.id))) continue; // ya listado como MovimientoBancario (sección 1)
      items.push({
        fecha: g.createdAt || g.fecha,
        tipo: 'GASTO',
        monto: Number(g.monto),
        esIngreso: false,
        descripcion: `${g.catNombre ? g.catNombre + ': ' : ''}${g.descripcion || ''}`.trim(),
        numeroComprobante: g.numeroComprobante || null,
        responsable: '-',
        origen: 'GASTO',
        id: g.id,
        anulado: false,
      });
    }

    // 7. Vales egresados desde esta cuenta bancaria (egresos)
    const valeRows = await dbQuery(dataSource,
      `SELECT v.id, v.descripcion, v.fecha, v.created_at AS "createdAt",
              COALESCE(v.monto_cuenta_bancaria, v.monto) AS monto,
              p.nombre AS "nombre", p.apellido AS "apellido"
       FROM vales v
       LEFT JOIN funcionarios f ON v.funcionario_id = f.id
       LEFT JOIN personas p ON f.persona_id = p.id
       WHERE v.cuenta_bancaria_id = ? AND v.estado <> 'ANULADO'`,
      [cuentaBancariaId],
    );
    for (const v of valeRows) {
      if (valeConMB.has(Number(v.id))) continue; // ya listado como MovimientoBancario (sección 1)
      const func = `${v.nombre || ''} ${v.apellido || ''}`.trim();
      items.push({
        fecha: v.createdAt || v.fecha,
        tipo: 'VALE',
        monto: Number(v.monto),
        esIngreso: false,
        descripcion: `Vale${func ? ' - ' + func : ''}${v.descripcion ? ': ' + v.descripcion : ''}`,
        numeroComprobante: null,
        responsable: '-',
        origen: 'VALE',
        id: v.id,
        anulado: false,
      });
    }

    // 8. Cobros de cuotas CPC acreditados a esta cuenta bancaria (ingresos);
    //    los AJUSTE_NEGATIVO (anulaciones de cobro) figuran como egresos para
    //    que el neto coincida con el saldo.
    const cobroRows = await dbQuery(dataSource,
      `SELECT mc.id, mc.fecha, COALESCE(mc.monto_cuenta_bancaria, mc.monto) AS monto, mc.tipo, mc.observacion,
              mc.cuenta_por_cobrar_id AS "cpcId", mc.cuenta_por_cobrar_cuota_id AS "cuotaId",
              cu.numero AS "cuotaNumero"
       FROM movimientos_cliente mc
       LEFT JOIN cuentas_por_cobrar_cuotas cu ON mc.cuenta_por_cobrar_cuota_id = cu.id
       WHERE mc.cuenta_bancaria_id = ? AND mc.tipo IN ('PAGO', 'AJUSTE_NEGATIVO')`,
      [cuentaBancariaId],
    );
    for (const mc of cobroRows) {
      const esPago = mc.tipo === 'PAGO';
      // C-01 dedupe: saltar si el cobro/anulación ya figura como MovimientoBancario.
      if (esPago) {
        if (cobroConMB.has(`${Number(mc.cpcId)}:${Number(mc.cuotaNumero)}`)) continue;
      } else if (anulCobroConMB.has(Number(mc.cuotaId))) {
        continue;
      }
      items.push({
        fecha: mc.fecha,
        tipo: 'COBRO_CLIENTE',
        monto: Number(mc.monto),
        esIngreso: esPago,
        descripcion: mc.observacion || (esPago ? 'Cobro cliente' : 'Anulación cobro cliente'),
        numeroComprobante: null,
        responsable: '-',
        origen: 'COBRO_CLIENTE',
        id: mc.id,
        anulado: false,
      });
    }

    // Estampar fuente (moneda + nombre de cuenta) en todos los items de esta cuenta
    if (opts.stampFuente) {
      const info = cuentaInfo.get(cuentaBancariaId);
      for (let i = base; i < items.length; i++) {
        items[i].monedaSimbolo = info?.monedaSimbolo || '';
        items[i].fuenteLabel = info?.nombre || '';
        items[i].fuenteCuentaId = cuentaBancariaId;
      }
    }
  }

  // Filtro generico de tipos ruidosos (la query POS ya se saltea arriba; esto
  // cubre cualquier otro tipo agregado a TIPOS_BANCARIOS_RUIDOSOS en el futuro).
  if (opts.excluirRuidosos) {
    return items.filter((i) => !TIPOS_BANCARIOS_RUIDOSOS.includes(i.tipo));
  }

  return items;
}
