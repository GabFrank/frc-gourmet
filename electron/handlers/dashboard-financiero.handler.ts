import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { MonedaCambio } from '../../src/app/database/entities/financiero/moneda-cambio.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { CajaMayorEstado } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { dbQuery } from '../utils/db-query';

export function registerDashboardFinancieroHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {

  ipcMain.handle('get-dashboard-financiero-kpis', async () => {
    try {
      const cajaRepo = dataSource.getRepository(Caja);
      const monedaRepo = dataSource.getRepository(Moneda);

      // 1. Cajas abiertas
      const cajasActivas = await cajaRepo.count({ where: { estado: CajaEstado.ABIERTO, activo: true } });

      // 2. Monedas activas
      const monedasActivas = await monedaRepo.count({ where: { activo: true } });

      // 3. Dispositivos PdV
      const dispositivosRows: any[] = await dbQuery(dataSource, `SELECT COUNT(*) as cnt FROM dispositivos WHERE activo = true`);
      const dispositivosPdv = Number(dispositivosRows?.[0]?.cnt || 0);

      // 4. Cotizaciones actuales (USD y BRL contra moneda principal)
      const principal = await monedaRepo.findOne({ where: { principal: true, activo: true } });
      let cotizacionUSD = 0;
      let cotizacionBRL = 0;
      if (principal) {
        const usd = await monedaRepo.findOne({ where: { activo: true, denominacion: 'DOLAR' } });
        const usdAlt = !usd ? await dataSource.getRepository(Moneda)
          .createQueryBuilder('m')
          .where('m.activo = true')
          .andWhere('UPPER(m.simbolo) IN (:...syms)', { syms: ['USD', '$', 'US$'] })
          .getOne() : null;
        const usdMoneda = usd || usdAlt;
        if (usdMoneda) {
          const cambio = await dataSource.getRepository(MonedaCambio).findOne({
            where: { monedaOrigen: { id: usdMoneda.id }, monedaDestino: { id: principal.id }, activo: true },
            order: { createdAt: 'DESC' as any },
          } as any);
          if (cambio) cotizacionUSD = Number(cambio.compraLocal || 0);
        }

        const brl = await dataSource.getRepository(Moneda)
          .createQueryBuilder('m')
          .where('m.activo = true')
          .andWhere('UPPER(m.simbolo) IN (:...syms)', { syms: ['BRL', 'R$'] })
          .getOne();
        if (brl) {
          const cambio = await dataSource.getRepository(MonedaCambio).findOne({
            where: { monedaOrigen: { id: brl.id }, monedaDestino: { id: principal.id }, activo: true },
            order: { createdAt: 'DESC' as any },
          } as any);
          if (cambio) cotizacionBRL = Number(cambio.compraLocal || 0);
        }
      }

      // 5. Historico cotizaciones (ultimos 30 dias) - usa createdAt de MonedaCambio
      const cotizacionesHistorico = await buildHistoricoCotizaciones(dataSource);

      // 6. Cajas abiertas resumen
      const cajasOpen = await cajaRepo.find({
        where: { estado: CajaEstado.ABIERTO, activo: true },
        relations: ['createdBy', 'createdBy.persona', 'dispositivo'],
        order: { fechaApertura: 'ASC' },
      });
      const cajasAbiertasResumen = cajasOpen.map(c => {
        const persona: any = (c.createdBy as any)?.persona;
        const cajero = (persona?.nombre || (c.createdBy as any)?.nickname || 'SIN USUARIO').toUpperCase();
        return {
          id: c.id,
          nombre: `Caja #${c.id}`,
          dispositivo: ((c.dispositivo as any)?.nombre || '').toUpperCase(),
          cajero,
          apertura: c.fechaApertura,
        };
      });

      // 7. Cajas Mayor activas, con su saldo en la moneda principal. Hasta
      // ahora la unica forma de entrar a una caja mayor desde un dashboard era
      // un acceso directo que el usuario tenia que crear a mano, apuntando a
      // una caja concreta; esto las lista todas.
      // El saldo suma SOLO las formas de pago que movimentan caja: es el mismo
      // criterio que usa el detalle de la caja mayor para su "Saldo en caja"
      // (`agruparSaldosPorFormaPago` filtra por `formaPago.movimentaCaja`). Sin
      // ese filtro entra plata que no es efectivo — p.ej. un saldo en
      // TRANSFERENCIA — y la card muestra un numero distinto al de la pantalla
      // que abre al hacerle click.
      const cajasMayorRows: any[] = principal ? await dbQuery(dataSource, `
        SELECT cm.id, cm.nombre, cm.descripcion, cm.fecha_apertura,
               COALESCE(SUM(s.saldo), 0) as saldo
        FROM cajas_mayor cm
        LEFT JOIN formas_pago fp ON fp.movimenta_caja = true
        LEFT JOIN cajas_mayor_saldos s
               ON s.caja_mayor_id = cm.id AND s.moneda_id = ? AND s.forma_pago_id = fp.id
        WHERE cm.activo = true AND cm.estado = ?
        GROUP BY cm.id, cm.nombre, cm.descripcion, cm.fecha_apertura
        ORDER BY cm.nombre ASC
      `, [principal.id, CajaMayorEstado.ABIERTA]) : [];
      const cajasMayorActivas = cajasMayorRows.map(r => ({
        id: Number(r.id),
        nombre: String(r.nombre || '').toUpperCase(),
        descripcion: String(r.descripcion || '').toUpperCase(),
        saldoPYG: Number(r.saldo || 0),
        apertura: r.fecha_apertura,
      }));

      return {
        cajasActivas,
        monedasActivas,
        dispositivosPdv,
        cotizacionUSD,
        cotizacionBRL,
        cotizacionesHistorico,
        cajasAbiertasResumen,
        cajasMayorActivas,
      };
    } catch (error) {
      console.error('Error get-dashboard-financiero-kpis:', error);
      throw error;
    }
  });
}

async function buildHistoricoCotizaciones(
  dataSource: DataSource,
): Promise<{ labels: string[]; usd: number[]; brl: number[] }> {
  const labels: string[] = [];
  const usd: number[] = [];
  const brl: number[] = [];

  const principal = await dataSource.getRepository(Moneda).findOne({ where: { principal: true, activo: true } });
  if (!principal) return { labels, usd, brl };

  const usdMoneda = await dataSource.getRepository(Moneda)
    .createQueryBuilder('m')
    .where('m.activo = true AND UPPER(m.simbolo) IN (:...syms)', { syms: ['USD', '$', 'US$'] })
    .getOne();
  const brlMoneda = await dataSource.getRepository(Moneda)
    .createQueryBuilder('m')
    .where('m.activo = true AND UPPER(m.simbolo) IN (:...syms)', { syms: ['BRL', 'R$'] })
    .getOne();

  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i); d.setHours(23, 59, 59, 999);
    labels.push(`${d.getDate()}/${d.getMonth() + 1}`);

    if (usdMoneda) {
      const rows: any[] = await dbQuery(dataSource, `
        SELECT "compraLocal" FROM monedas_cambio
        WHERE moneda_origen_id = ? AND moneda_destino_id = ?
          AND created_at <= ?
        ORDER BY created_at DESC LIMIT 1
      `, [usdMoneda.id, principal.id, d.toISOString()]);
      usd.push(Number(rows?.[0]?.compraLocal || 0));
    } else {
      usd.push(0);
    }

    if (brlMoneda) {
      const rows: any[] = await dbQuery(dataSource, `
        SELECT "compraLocal" FROM monedas_cambio
        WHERE moneda_origen_id = ? AND moneda_destino_id = ?
          AND created_at <= ?
        ORDER BY created_at DESC LIMIT 1
      `, [brlMoneda.id, principal.id, d.toISOString()]);
      brl.push(Number(rows?.[0]?.compraLocal || 0));
    } else {
      brl.push(0);
    }
  }

  return { labels, usd, brl };
}
