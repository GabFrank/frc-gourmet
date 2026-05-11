import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { LiquidacionSueldo } from '../../src/app/database/entities/rrhh/liquidacion-sueldo.entity';
import { LiquidacionSueldoEstado } from '../../src/app/database/entities/rrhh/liquidacion-sueldo-estado.enum';
import { Asistencia } from '../../src/app/database/entities/rrhh/asistencia.entity';
import { AsistenciaEstado } from '../../src/app/database/entities/rrhh/asistencia-estado.enum';
import { Vale } from '../../src/app/database/entities/rrhh/vale.entity';
import { ValeEstado } from '../../src/app/database/entities/rrhh/vale-estado.enum';
import { VacacionPeriodo, VacacionPeriodoEstado } from '../../src/app/database/entities/rrhh/vacacion-periodo.entity';
import { CuentaPorPagar } from '../../src/app/database/entities/financiero/cuenta-por-pagar.entity';
import { CuentaPorPagarTipo, CuentaPorPagarEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { dbQuery } from '../utils/db-query';

export function registerDashboardRrhhHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {

  ipcMain.handle('get-dashboard-rrhh-kpis', async (_event, periodo: string) => {
    try {
      const [anio, mes] = periodo.split('-').map(Number);
      const fechaInicio = new Date(anio, mes - 1, 1);
      const fechaFin = new Date(anio, mes, 0);
      const hoy = new Date();

      // 1. totalNominaMes
      const liquidaciones = await dataSource.getRepository(LiquidacionSueldo).find({
        where: { periodo },
      });
      const totalNominaMes = liquidaciones.reduce((sum, l) => sum + Number(l.totalNeto || 0), 0);

      // 2. totalFuncionariosActivos
      const totalFuncionariosActivos = await dataSource.getRepository(Funcionario).count({
        where: { activo: true },
      });

      // 3. porcentajeAsistenciaMes
      let porcentajeAsistenciaMes = 0;
      try {
        const totalAsistencias = await dataSource.getRepository(Asistencia)
          .createQueryBuilder('a')
          .where('a.fecha >= :fi', { fi: fechaInicio.toISOString().slice(0, 10) })
          .andWhere('a.fecha <= :ff', { ff: fechaFin.toISOString().slice(0, 10) })
          .getCount();
        const presentes = await dataSource.getRepository(Asistencia)
          .createQueryBuilder('a')
          .where('a.fecha >= :fi', { fi: fechaInicio.toISOString().slice(0, 10) })
          .andWhere('a.fecha <= :ff', { ff: fechaFin.toISOString().slice(0, 10) })
          .andWhere('a.estado = :estado', { estado: AsistenciaEstado.PRESENTE })
          .getCount();
        porcentajeAsistenciaMes = totalAsistencias > 0 ? Math.round((presentes / totalAsistencias) * 100) : 0;
      } catch (_e) { /* optional */ }

      // 4. valesPendientes
      const valesPendientes = await dataSource.getRepository(Vale)
        .createQueryBuilder('v')
        .where('v.estado = :estado', { estado: ValeEstado.CONFIRMADO })
        .andWhere('v.esAdelanto = :ea', { ea: false })
        .getCount();

      // 5. prestamosActivos
      const prestamosActivos = await dataSource.getRepository(CuentaPorPagar)
        .createQueryBuilder('cpp')
        .where('cpp.tipo = :tipo', { tipo: CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO })
        .andWhere('cpp.estado NOT IN (:...estados)', { estados: [CuentaPorPagarEstado.PAGADO, CuentaPorPagarEstado.CANCELADO] })
        .getCount();

      // 6. proximosCumpleanios (30 dias)
      const en30 = new Date(hoy);
      en30.setDate(en30.getDate() + 30);
      const funcionarios = await dataSource.getRepository(Funcionario).find({
        where: { activo: true },
        relations: ['persona'],
      });
      const proximosCumpleanios: any[] = [];
      for (const f of funcionarios) {
        if (!f.persona?.fechaNacimiento) continue;
        const fn = new Date(f.persona.fechaNacimiento);
        const esteAnio = new Date(hoy.getFullYear(), fn.getMonth(), fn.getDate());
        if (esteAnio < hoy) esteAnio.setFullYear(hoy.getFullYear() + 1);
        if (esteAnio <= en30) {
          proximosCumpleanios.push({
            funcionarioId: f.id,
            nombre: `${f.persona.nombre} ${f.persona.apellido || ''}`.trim(),
            fechaCumpleanios: esteAnio.toISOString().slice(0, 10),
            diasRestantes: Math.ceil((esteAnio.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)),
          });
        }
      }
      proximosCumpleanios.sort((a, b) => a.diasRestantes - b.diasRestantes);

      // 7. vacacionesProximas (30 dias)
      const vacacionesProximas: any[] = [];
      try {
        const periodos = await dataSource.getRepository(VacacionPeriodo).find({
          where: { estado: VacacionPeriodoEstado.PROGRAMADA },
          relations: ['vacacion', 'vacacion.funcionario', 'vacacion.funcionario.persona'],
        });
        for (const p of periodos) {
          const fd = new Date(p.fechaDesde);
          if (fd >= hoy && fd <= en30) {
            const f = (p as any).vacacion?.funcionario;
            vacacionesProximas.push({
              periodoId: p.id,
              funcionarioId: f?.id,
              nombre: f?.persona ? `${f.persona.nombre} ${f.persona.apellido || ''}`.trim() : 'FUNCIONARIO',
              fechaDesde: p.fechaDesde,
              fechaHasta: p.fechaHasta,
              diasUsados: p.diasUsados,
            });
          }
        }
      } catch (_e) { /* optional */ }

      // 8. top5Vendedores del periodo
      const top5Vendedores: any[] = [];
      try {
        const raw = await dbQuery(dataSource, `
          SELECT v.vendedor_id, SUM(v.total) as totalVendido, COUNT(*) as cantVentas
          FROM ventas v
          WHERE v.estado = 'CONCLUIDA'
            AND strftime('%Y-%m', v.created_at) = '${periodo}'
            AND v.vendedor_id IS NOT NULL
          GROUP BY v.vendedor_id
          ORDER BY totalVendido DESC
          LIMIT 5
        `);
        for (const row of raw) {
          const usuario = await dataSource.getRepository(Usuario).findOne({
            where: { id: row.vendedor_id },
            relations: ['persona'],
          });
          top5Vendedores.push({
            usuarioId: row.vendedor_id,
            nombre: usuario?.persona ? `${usuario.persona.nombre} ${(usuario.persona as any).apellido || ''}`.trim() : `USUARIO ${row.vendedor_id}`,
            totalVendido: Number(row.totalVendido || 0),
            cantVentas: Number(row.cantVentas || 0),
          });
        }
      } catch (_e) { /* optional - ventas tabla puede no existir */ }

      // 9. liquidacionesPendientesAprobacion (BORRADOR)
      const liquidacionesPendientesAprobacion = await dataSource.getRepository(LiquidacionSueldo)
        .count({ where: { estado: LiquidacionSueldoEstado.BORRADOR } });

      // 10. liquidacionesPendientesPago (APROBADA)
      const liquidacionesPendientesPago = await dataSource.getRepository(LiquidacionSueldo)
        .count({ where: { estado: LiquidacionSueldoEstado.APROBADA } });

      return {
        totalNominaMes,
        totalFuncionariosActivos,
        porcentajeAsistenciaMes,
        valesPendientes,
        prestamosActivos,
        proximosCumpleanios,
        vacacionesProximas,
        top5Vendedores,
        liquidacionesPendientesAprobacion,
        liquidacionesPendientesPago,
      };
    } catch (error) {
      console.error('Error get-dashboard-rrhh-kpis:', error);
      throw error;
    }
  });
}
