import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { LiquidacionSueldo } from '../../src/app/database/entities/rrhh/liquidacion-sueldo.entity';
import { Asistencia } from '../../src/app/database/entities/rrhh/asistencia.entity';
import { AsistenciaEstado } from '../../src/app/database/entities/rrhh/asistencia-estado.enum';
import { Vale } from '../../src/app/database/entities/rrhh/vale.entity';
import { CuentaPorPagar } from '../../src/app/database/entities/financiero/cuenta-por-pagar.entity';
import { CuentaPorPagarTipo, CuentaPorPagarEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { LiquidacionComision } from '../../src/app/database/entities/rrhh/liquidacion-comision.entity';
import { Aguinaldo } from '../../src/app/database/entities/rrhh/aguinaldo.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { LiquidacionItemTipo } from '../../src/app/database/entities/rrhh/liquidacion-item-tipo.enum';
import { LiquidacionItem } from '../../src/app/database/entities/rrhh/liquidacion-item.entity';

// @ts-ignore
const pdfMake = require('pdfmake/build/pdfmake');
try {
  // @ts-ignore
  require('pdfmake/build/vfs_fonts');
} catch (_e) { /* VFS optional */ }

// @ts-ignore
import * as ExcelJS from 'exceljs';

// ---- Helpers ----
function getNombreFuncionario(f: any): string {
  if (!f) return 'N/A';
  const p = f.persona;
  return p ? `${p.nombre} ${p.apellido || ''}`.trim().toUpperCase() : `FUNCIONARIO ${f.id}`;
}

function excelColLetra(idx: number): string {
  let s = '';
  while (idx >= 0) {
    s = String.fromCharCode((idx % 26) + 65) + s;
    idx = Math.floor(idx / 26) - 1;
  }
  return s;
}

async function buildExcelBase64(headers: string[], rows: any[][]): Promise<string> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Reporte');
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const row of rows) {
    ws.addRow(row);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf).toString('base64');
}

async function buildPdfBase64(docDef: any): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const doc = pdfMake.createPdf(docDef);
      doc.getBuffer((buf: Buffer) => {
        resolve(Buffer.from(buf).toString('base64'));
      });
    } catch (e) {
      reject(e);
    }
  });
}

// ---- Handler Registration ----
export function registerReportesRrhhHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {

  // 1. LIQUIDACIONES MES
  ipcMain.handle('get-reporte-liquidaciones-mes-data', async (_event, periodo: string) => {
    try {
      const liqRepo = dataSource.getRepository(LiquidacionSueldo);
      return await liqRepo.find({
        where: { periodo },
        relations: ['funcionario', 'funcionario.persona', 'monedaPago'],
        order: { id: 'ASC' },
      });
    } catch (e) {
      console.error('Error get-reporte-liquidaciones-mes-data:', e);
      throw e;
    }
  });

  ipcMain.handle('export-reporte-liquidaciones-mes-excel', async (_event, periodo: string) => {
    const liqRepo = dataSource.getRepository(LiquidacionSueldo);
    const data = await liqRepo.find({
      where: { periodo },
      relations: ['funcionario', 'funcionario.persona', 'monedaPago'],
      order: { id: 'ASC' },
    });
    const headers = ['FUNCIONARIO', 'PERIODO', 'SALARIO BASE', 'TOTAL HABERES', 'TOTAL DESCUENTOS', 'TOTAL NETO', 'MONEDA', 'ESTADO'];
    const rows = data.map(l => [
      getNombreFuncionario(l.funcionario),
      l.periodo,
      Number(l.salarioBase || 0),
      Number(l.totalHaberes || 0),
      Number(l.totalDescuentos || 0),
      Number(l.totalNeto || 0),
      (l.monedaPago as any)?.codigo || '',
      l.estado,
    ]);
    const base64 = await buildExcelBase64(headers, rows);
    return { filename: `liquidaciones-${periodo}.xlsx`, base64, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  });

  ipcMain.handle('export-reporte-liquidaciones-mes-pdf', async (_event, periodo: string) => {
    const liqRepo = dataSource.getRepository(LiquidacionSueldo);
    const data = await liqRepo.find({
      where: { periodo },
      relations: ['funcionario', 'funcionario.persona', 'monedaPago'],
      order: { id: 'ASC' },
    });
    const body = [
      ['FUNCIONARIO', 'PERIODO', 'SALARIO BASE', 'TOTAL HABERES', 'DESCUENTOS', 'TOTAL NETO', 'ESTADO'],
      ...data.map(l => [
        getNombreFuncionario(l.funcionario),
        l.periodo,
        String(Number(l.salarioBase || 0).toFixed(2)),
        String(Number(l.totalHaberes || 0).toFixed(2)),
        String(Number(l.totalDescuentos || 0).toFixed(2)),
        String(Number(l.totalNeto || 0).toFixed(2)),
        l.estado,
      ]),
    ];
    const docDef: any = {
      content: [
        { text: `LIQUIDACIONES DEL MES - ${periodo}`, style: 'header' },
        { table: { headerRows: 1, body }, layout: 'lightHorizontalLines' },
      ],
      styles: { header: { fontSize: 14, bold: true, margin: [0, 0, 0, 10] } },
    };
    const base64 = await buildPdfBase64(docDef);
    return { filename: `liquidaciones-${periodo}.pdf`, base64, mimeType: 'application/pdf' };
  });

  // 2. ASISTENCIA MES
  ipcMain.handle('get-reporte-asistencia-mes-data', async (_event, periodo: string, funcionarioId?: number) => {
    try {
      const [anio, mes] = periodo.split('-').map(Number);
      const fi = new Date(anio, mes - 1, 1).toISOString().slice(0, 10);
      const ff = new Date(anio, mes, 0).toISOString().slice(0, 10);
      const qb = dataSource.getRepository(Asistencia)
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.funcionario', 'f')
        .leftJoinAndSelect('f.persona', 'p')
        .where('a.fecha >= :fi', { fi })
        .andWhere('a.fecha <= :ff', { ff })
        .orderBy('f.id', 'ASC')
        .addOrderBy('a.fecha', 'ASC');
      if (funcionarioId) qb.andWhere('f.id = :fid', { fid: funcionarioId });
      return await qb.getMany();
    } catch (e) {
      console.error('Error get-reporte-asistencia-mes-data:', e);
      throw e;
    }
  });

  ipcMain.handle('export-reporte-asistencia-mes-excel', async (_event, periodo: string, funcionarioId?: number) => {
    const [anio, mes] = periodo.split('-').map(Number);
    const fi = new Date(anio, mes - 1, 1).toISOString().slice(0, 10);
    const ff = new Date(anio, mes, 0).toISOString().slice(0, 10);
    const qb = dataSource.getRepository(Asistencia)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .where('a.fecha >= :fi', { fi })
      .andWhere('a.fecha <= :ff', { ff })
      .orderBy('f.id', 'ASC').addOrderBy('a.fecha', 'ASC');
    if (funcionarioId) qb.andWhere('f.id = :fid', { fid: funcionarioId });
    const data = await qb.getMany();
    const headers = ['FUNCIONARIO', 'FECHA', 'ESTADO', 'HORA ENTRADA', 'HORA SALIDA'];
    const rows = data.map(a => [
      getNombreFuncionario(a.funcionario),
      a.fecha,
      a.estado,
      a.horaEntrada || '',
      a.horaSalida || '',
    ]);
    const base64 = await buildExcelBase64(headers, rows);
    return { filename: `asistencia-${periodo}.xlsx`, base64, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  });

  // 3. VALES MES
  ipcMain.handle('get-reporte-vales-mes-data', async (_event, periodo: string) => {
    try {
      const [anio, mes] = periodo.split('-').map(Number);
      const fi = new Date(anio, mes - 1, 1).toISOString().slice(0, 10);
      const ff = new Date(anio, mes, 0).toISOString().slice(0, 10);
      return await dataSource.getRepository(Vale)
        .createQueryBuilder('v')
        .leftJoinAndSelect('v.funcionario', 'f')
        .leftJoinAndSelect('f.persona', 'p')
        .leftJoinAndSelect('v.motivo', 'm')
        .leftJoinAndSelect('v.moneda', 'mon')
        .where('v.fecha >= :fi', { fi })
        .andWhere('v.fecha <= :ff', { ff })
        .orderBy('v.fecha', 'ASC')
        .getMany();
    } catch (e) {
      console.error('Error get-reporte-vales-mes-data:', e);
      throw e;
    }
  });

  ipcMain.handle('export-reporte-vales-mes-excel', async (_event, periodo: string) => {
    const [anio, mes] = periodo.split('-').map(Number);
    const fi = new Date(anio, mes - 1, 1).toISOString().slice(0, 10);
    const ff = new Date(anio, mes, 0).toISOString().slice(0, 10);
    const data = await dataSource.getRepository(Vale)
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.funcionario', 'f').leftJoinAndSelect('f.persona', 'p')
      .leftJoinAndSelect('v.motivo', 'm').leftJoinAndSelect('v.moneda', 'mon')
      .where('v.fecha >= :fi', { fi }).andWhere('v.fecha <= :ff', { ff })
      .orderBy('v.fecha', 'ASC').getMany();
    const headers = ['FUNCIONARIO', 'FECHA', 'MONTO', 'MONEDA', 'ESTADO', 'ES ADELANTO', 'MOTIVO'];
    const rows = data.map(v => [
      getNombreFuncionario(v.funcionario),
      v.fecha,
      Number(v.monto || 0),
      (v.moneda as any)?.codigo || '',
      v.estado,
      (v as any).esAdelanto ? 'SI' : 'NO',
      (v.motivo as any)?.nombre || '',
    ]);
    const base64 = await buildExcelBase64(headers, rows);
    return { filename: `vales-${periodo}.xlsx`, base64, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  });

  // 4. PRESTAMOS ACTIVOS
  ipcMain.handle('get-reporte-prestamos-activos-data', async () => {
    try {
      return await dataSource.getRepository(CuentaPorPagar).find({
        where: { tipo: CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO },
        relations: ['funcionario', 'funcionario.persona', 'moneda', 'cuotas'],
      });
    } catch (e) {
      console.error('Error get-reporte-prestamos-activos-data:', e);
      throw e;
    }
  });

  ipcMain.handle('export-reporte-prestamos-activos-excel', async () => {
    const data = await dataSource.getRepository(CuentaPorPagar).find({
      where: { tipo: CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO },
      relations: ['funcionario', 'funcionario.persona', 'moneda'],
    });
    const headers = ['FUNCIONARIO', 'DESCRIPCION', 'MONTO TOTAL', 'MONTO PAGADO', 'MONEDA', 'ESTADO', 'CUOTAS', 'FECHA INICIO'];
    const rows = data.map(cpp => [
      getNombreFuncionario((cpp as any).funcionario),
      cpp.descripcion,
      Number(cpp.montoTotal || 0),
      Number(cpp.montoPagado || 0),
      (cpp.moneda as any)?.codigo || '',
      cpp.estado,
      cpp.cantidadCuotas,
      cpp.fechaInicio,
    ]);
    const base64 = await buildExcelBase64(headers, rows);
    return { filename: `prestamos-activos.xlsx`, base64, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  });

  // 5. COMISIONES MES
  ipcMain.handle('get-reporte-comisiones-mes-data', async (_event, periodo: string) => {
    try {
      return await dataSource.getRepository(LiquidacionComision).find({
        where: { periodo },
        relations: ['funcionario', 'funcionario.persona', 'items'],
        order: { id: 'ASC' },
      });
    } catch (e) {
      console.error('Error get-reporte-comisiones-mes-data:', e);
      throw e;
    }
  });

  ipcMain.handle('export-reporte-comisiones-mes-excel', async (_event, periodo: string) => {
    const data = await dataSource.getRepository(LiquidacionComision).find({
      where: { periodo },
      relations: ['funcionario', 'funcionario.persona'],
    });
    const headers = ['FUNCIONARIO', 'PERIODO', 'TOTAL', 'ESTADO'];
    const rows = data.map(lc => [
      getNombreFuncionario((lc as any).funcionario),
      lc.periodo,
      Number((lc as any).totalComision || (lc as any).total || 0),
      lc.estado,
    ]);
    const base64 = await buildExcelBase64(headers, rows);
    return { filename: `comisiones-${periodo}.xlsx`, base64, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  });

  // 6. RECIBO PDF DE LIQUIDACION
  ipcMain.handle('export-recibo-liquidacion-pdf', async (_event, liquidacionId: number) => {
    const liqRepo = dataSource.getRepository(LiquidacionSueldo);
    const liq = await liqRepo.findOne({
      where: { id: liquidacionId },
      relations: ['funcionario', 'funcionario.persona', 'funcionario.cargo', 'monedaPago'],
    });
    if (!liq) throw new Error(`Liquidacion ${liquidacionId} no encontrada`);

    const items = await dataSource.getRepository(LiquidacionItem).find({
      where: { liquidacion: { id: liquidacionId } } as any,
      relations: ['concepto'],
    });
    const haberes = items.filter(i => i.tipo === LiquidacionItemTipo.HABER);
    const descuentos = items.filter(i => i.tipo === LiquidacionItemTipo.DESCUENTO);

    const nomFun = getNombreFuncionario(liq.funcionario);
    const cargo = (liq.funcionario as any)?.cargo?.nombre || '';
    const moneda = (liq.monedaPago as any)?.codigo || 'GS';

    const haberesRows = haberes.map(h => [
      h.descripcion.toUpperCase(),
      { text: Number(h.monto || 0).toFixed(2), alignment: 'right' },
    ]);
    const descuentosRows = descuentos.map(d => [
      d.descripcion.toUpperCase(),
      { text: Number(d.monto || 0).toFixed(2), alignment: 'right' },
    ]);

    const docDef: any = {
      content: [
        { text: 'RECIBO DE LIQUIDACION DE SUELDO', style: 'title' },
        { text: `PERIODO: ${liq.periodo}`, style: 'subtitle' },
        { text: ' ' },
        {
          columns: [
            [
              { text: `FUNCIONARIO: ${nomFun}`, style: 'campo' },
              { text: `CARGO: ${cargo}`, style: 'campo' },
            ],
            [
              { text: `FECHA APROBACION: ${liq.fechaAprobacion ? new Date(liq.fechaAprobacion).toLocaleDateString() : 'N/A'}`, style: 'campo' },
              { text: `ESTADO: ${liq.estado}`, style: 'campo' },
            ],
          ],
        },
        { text: ' ' },
        { text: 'HABERES', style: 'sectionHeader' },
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              [{ text: 'CONCEPTO', bold: true }, { text: `MONTO (${moneda})`, bold: true, alignment: 'right' }],
              ...haberesRows,
              [{ text: 'TOTAL HABERES', bold: true }, { text: Number(liq.totalHaberes || 0).toFixed(2), alignment: 'right', bold: true }],
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: ' ' },
        { text: 'DESCUENTOS', style: 'sectionHeader' },
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              [{ text: 'CONCEPTO', bold: true }, { text: `MONTO (${moneda})`, bold: true, alignment: 'right' }],
              ...descuentosRows,
              [{ text: 'TOTAL DESCUENTOS', bold: true }, { text: Number(liq.totalDescuentos || 0).toFixed(2), alignment: 'right', bold: true }],
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: ' ' },
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              [
                { text: 'TOTAL NETO A PERCIBIR', bold: true, fontSize: 14 },
                { text: `${moneda} ${Number(liq.totalNeto || 0).toFixed(2)}`, bold: true, fontSize: 14, alignment: 'right' },
              ],
            ],
          },
          layout: 'noBorders',
        },
        { text: ' ' },
        { text: ' ' },
        {
          columns: [
            { text: '___________________________\nFIRMA FUNCIONARIO', alignment: 'center' },
            { text: '___________________________\nFIRMA RRHH', alignment: 'center' },
            { text: '___________________________\nFIRMA EMPRESA', alignment: 'center' },
          ],
        },
      ],
      styles: {
        title: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
        subtitle: { fontSize: 12, alignment: 'center', margin: [0, 0, 0, 8] },
        sectionHeader: { fontSize: 11, bold: true, margin: [0, 8, 0, 4], decoration: 'underline' },
        campo: { fontSize: 10, margin: [0, 2, 0, 2] },
      },
    };

    const base64 = await buildPdfBase64(docDef);
    return { filename: `recibo-liquidacion-${liquidacionId}.pdf`, base64, mimeType: 'application/pdf' };
  });

  // 7. AGUINALDO ANUAL
  ipcMain.handle('get-reporte-aguinaldo-anual-data', async (_event, anio: number) => {
    try {
      return await dataSource.getRepository(Aguinaldo).find({
        where: { anio },
        relations: ['funcionario', 'funcionario.persona'],
        order: { id: 'ASC' },
      });
    } catch (e) {
      console.error('Error get-reporte-aguinaldo-anual-data:', e);
      throw e;
    }
  });

  ipcMain.handle('export-reporte-aguinaldo-anual-excel', async (_event, anio: number) => {
    const data = await dataSource.getRepository(Aguinaldo).find({
      where: { anio },
      relations: ['funcionario', 'funcionario.persona'],
    });
    const headers = ['FUNCIONARIO', 'AÑO', 'MESES TRABAJADOS', 'MONTO CALCULADO', 'ESTADO', 'FECHA PAGO'];
    const rows = data.map(a => [
      getNombreFuncionario(a.funcionario),
      a.anio,
      a.mesesTrabajados,
      Number(a.montoCalculado || 0),
      a.estado,
      a.fechaPago ? new Date(a.fechaPago).toLocaleDateString() : '',
    ]);
    const base64 = await buildExcelBase64(headers, rows);
    return { filename: `aguinaldo-${anio}.xlsx`, base64, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  });

  ipcMain.handle('export-reporte-aguinaldo-anual-pdf', async (_event, anio: number) => {
    const data = await dataSource.getRepository(Aguinaldo).find({
      where: { anio },
      relations: ['funcionario', 'funcionario.persona'],
    });
    const body = [
      ['FUNCIONARIO', 'MESES', 'MONTO', 'ESTADO'],
      ...data.map(a => [
        getNombreFuncionario(a.funcionario),
        String(a.mesesTrabajados),
        String(Number(a.montoCalculado || 0).toFixed(2)),
        a.estado,
      ]),
    ];
    const docDef: any = {
      content: [
        { text: `REPORTE DE AGUINALDO - AÑO ${anio}`, style: 'header' },
        { table: { headerRows: 1, body }, layout: 'lightHorizontalLines' },
      ],
      styles: { header: { fontSize: 14, bold: true, margin: [0, 0, 0, 10] } },
    };
    const base64 = await buildPdfBase64(docDef);
    return { filename: `aguinaldo-${anio}.pdf`, base64, mimeType: 'application/pdf' };
  });

  // 8. RESUMEN IPS MES
  ipcMain.handle('get-reporte-resumen-ips-data', async (_event, periodo: string) => {
    try {
      const data = await dataSource.getRepository(LiquidacionSueldo).find({
        where: { periodo },
        relations: ['funcionario', 'funcionario.persona', 'items', 'items.concepto'],
      });
      // Extraer items de IPS para calcular aportes
      return data.map(liq => {
        const ipsItems = (liq.items || []).filter((i: any) =>
          i.descripcion?.toUpperCase().includes('IPS') || i.concepto?.codigo?.toUpperCase().includes('IPS')
        );
        const ipsFuncionario = ipsItems.filter((i: any) => i.tipo === LiquidacionItemTipo.DESCUENTO)
          .reduce((s: number, i: any) => s + Number(i.monto || 0), 0);
        const ipsPatronal = ipsItems.filter((i: any) => i.tipo === LiquidacionItemTipo.HABER)
          .reduce((s: number, i: any) => s + Number(i.monto || 0), 0);
        return {
          funcionario: liq.funcionario,
          periodo: liq.periodo,
          salarioBase: Number(liq.salarioBase || 0),
          ipsFuncionario,
          ipsPatronal,
        };
      });
    } catch (e) {
      console.error('Error get-reporte-resumen-ips-data:', e);
      throw e;
    }
  });

  ipcMain.handle('export-reporte-resumen-ips-excel', async (_event, periodo: string) => {
    const data = await dataSource.getRepository(LiquidacionSueldo).find({
      where: { periodo },
      relations: ['funcionario', 'funcionario.persona', 'items', 'items.concepto'],
    });
    const headers = ['FUNCIONARIO', 'PERIODO', 'SALARIO BASE', 'IPS FUNCIONARIO (9%)', 'IPS PATRONAL (16.5%)'];
    const rows = data.map(liq => {
      const ipsItems = (liq.items || []).filter((i: any) =>
        i.descripcion?.toUpperCase().includes('IPS') || i.concepto?.codigo?.toUpperCase().includes('IPS')
      );
      const ipsFun = ipsItems.filter((i: any) => i.tipo === LiquidacionItemTipo.DESCUENTO)
        .reduce((s: number, i: any) => s + Number(i.monto || 0), 0);
      const ipsPat = ipsItems.filter((i: any) => i.tipo === LiquidacionItemTipo.HABER)
        .reduce((s: number, i: any) => s + Number(i.monto || 0), 0);
      return [
        getNombreFuncionario(liq.funcionario),
        liq.periodo,
        Number(liq.salarioBase || 0),
        ipsFun,
        ipsPat,
      ];
    });
    const base64 = await buildExcelBase64(headers, rows);
    return { filename: `resumen-ips-${periodo}.xlsx`, base64, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  });
}
