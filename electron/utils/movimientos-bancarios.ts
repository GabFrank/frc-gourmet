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

export interface MovimientosBancariosOpts {
  excludePos?: boolean;
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
      items.push({
        fecha: m.fecha,
        tipo: m.tipoMovimiento,
        monto: Number(m.monto),
        esIngreso: m.tipoMovimiento === MovimientoBancarioTipo.ENTRADA_MANUAL || m.tipoMovimiento === MovimientoBancarioTipo.AJUSTE_POSITIVO,
        descripcion: m.observacion || '-',
        numeroComprobante: m.numeroComprobante,
        responsable: m.responsable?.persona?.nombre || m.responsable?.nickname || '-',
        origen: 'MANUAL',
        id: m.id,
        anulado: m.anulado,
      });
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

    // 3. Acreditaciones POS (ingresos cuando se acreditan) — opcional
    if (!opts.excludePos) {
      const acredRows = await dbQuery(dataSource,
        `SELECT a.id, a.monto_acreditado AS "montoAcreditado", a.monto_esperado AS "montoEsperado",
                a.fecha_acreditacion_real AS "fechaReal", a.fecha_transaccion AS "fechaTrans",
                a.estado, mp.nombre AS "maquinaNombre"
         FROM acreditaciones_pos a
         LEFT JOIN maquinas_pos mp ON a.maquina_pos_id = mp.id
         WHERE a.cuenta_bancaria_id = ?`,
        [cuentaBancariaId],
      );
      for (const a of acredRows) {
        if (a.estado === 'ACREDITADO_AUTO' || a.estado === 'VERIFICADO' || a.estado === 'CON_DIFERENCIA') {
          items.push({
            fecha: a.fechaReal || a.fechaTrans,
            tipo: 'ACREDITACION_POS',
            monto: Number(a.montoAcreditado || a.montoEsperado),
            esIngreso: true,
            descripcion: `Acreditacion POS - ${a.maquinaNombre || ''}`,
            numeroComprobante: null,
            responsable: '-',
            origen: 'POS',
            id: a.id,
            anulado: false,
          });
        }
      }
    }

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
      `SELECT mc.id, mc.fecha, COALESCE(mc.monto_cuenta_bancaria, mc.monto) AS monto, mc.tipo, mc.observacion
       FROM movimientos_cliente mc
       WHERE mc.cuenta_bancaria_id = ? AND mc.tipo IN ('PAGO', 'AJUSTE_NEGATIVO')`,
      [cuentaBancariaId],
    );
    for (const mc of cobroRows) {
      const esPago = mc.tipo === 'PAGO';
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

  return items;
}
