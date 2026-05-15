import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { ChartConfiguration, ChartData } from 'chart.js';

import { RepositoryService } from 'src/app/database/repository.service';
import { DashStatChipComponent } from 'src/app/shared/components/dashboard/stat-chip/dash-stat-chip.component';
import { DashSectionHeaderComponent } from 'src/app/shared/components/dashboard/section-header/dash-section-header.component';
import { DashChartCardComponent } from 'src/app/shared/components/dashboard/chart-card/dash-chart-card.component';
import {
  getDashboardChartOptions,
  DASHBOARD_CHART_COLORS,
  buildLineDataset,
} from 'src/app/shared/utils/dashboard-chart-theme';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CobrarCuotaDialogComponent } from 'src/app/pages/financiero/caja-mayor/cuentas-por-cobrar/cobrar-cuota-dialog/cobrar-cuota-dialog.component';

type MovTipoFilter = '' | 'CARGO' | 'PAGO' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO';

@Component({
  selector: 'app-cliente-detalle',
  templateUrl: './cliente-detalle.component.html',
  styleUrls: ['./cliente-detalle.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatChipsModule,
    MatTooltipModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatDialogModule,
    DatePipe,
    DashStatChipComponent,
    DashSectionHeaderComponent,
    DashChartCardComponent,
  ],
})
export class ClienteDetalleComponent implements OnInit {
  clienteId: number | null = null;
  cliente: any = null;
  clienteNombreStr = '—';
  clienteSubtitulo = '';

  // KPIs
  saldoActual = 0;
  limiteCredito = 0;
  pctUso = 0;
  pctUsoLabel = '—';
  pctUsoColor: 'success' | 'warning' | 'error' | 'info' = 'info';
  cuotasVencidas = 0;
  kpis: { movsMesCount: number; cargosMesTotal: number; pagosMesTotal: number; netoMes: number } = {
    movsMesCount: 0,
    cargosMesTotal: 0,
    pagosMesTotal: 0,
    netoMes: 0,
  };

  // CPC y ventas
  cpcAbiertas: any[] = [];
  ultimasVentas: any[] = [];

  // Movimientos paginados con filtros
  filterForm!: FormGroup;
  movimientos: any[] = [];
  totalMovimientos = 0;
  pageSize = 20;
  pageIndex = 0;
  movColumns = ['fecha', 'tipo', 'monto', 'origen', 'observacion'];

  // Charts
  chartMesData: ChartData<'line'> = { labels: [], datasets: [] };
  chartMesOptions: ChartConfiguration<'line'>['options'] = getDashboardChartOptions('line');
  chartCompData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  chartCompOptions: ChartConfiguration<'doughnut'>['options'] = getDashboardChartOptions('doughnut');

  // Estado
  loading = false;
  loadingMovs = false;
  recalculando = false;

  // Identificación
  ventasColumns = ['fecha', 'total', 'formaPago'];

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private fb: FormBuilder,
  ) {
    this.filterForm = this.fb.group({
      fechaInicio: [null],
      fechaFin: [null],
      tipo: ['' as MovTipoFilter],
    });
  }

  ngOnInit(): void {
    if (this.clienteId) this.loadAll();
  }

  setData(data: any): void {
    this.clienteId = data?.clienteId || null;
    if (this.clienteId) this.loadAll();
  }

  async loadAll(): Promise<void> {
    if (!this.clienteId) return;
    this.loading = true;
    try {
      const [estado, stats] = await Promise.all([
        firstValueFrom(this.repositoryService.getClienteEstadoCuenta(this.clienteId)),
        firstValueFrom(this.repositoryService.getMovimientosClienteStats(this.clienteId)),
      ]);
      this.applyEstadoCuenta(estado);
      this.applyStats(stats);
      await this.loadMovimientos();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar el estado de cuenta', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  private applyEstadoCuenta(estado: any): void {
    this.cliente = estado?.cliente || null;
    this.saldoActual = Number(estado?.saldoActual) || 0;
    this.cuotasVencidas = Number(estado?.cuotasVencidas) || 0;
    this.kpis = estado?.kpis || { movsMesCount: 0, cargosMesTotal: 0, pagosMesTotal: 0, netoMes: 0 };
    this.cpcAbiertas = (estado?.cpcAbiertas || []).map((c: any) => this.enrichCpc(c));
    this.ultimasVentas = (estado?.ultimasVentas || []).map((v: any) => ({
      ...v,
      _formaPagoLabel: v?.formaPago?.descripcion || v?.formaPago?.nombre || '—',
    }));
    this.limiteCredito = Number(this.cliente?.limite_credito) || 0;
    this.computeClienteLabels();
    this.computePctUso();
  }

  private computeClienteLabels(): void {
    if (!this.cliente) {
      this.clienteNombreStr = '—';
      this.clienteSubtitulo = '';
      return;
    }
    const p = this.cliente.persona;
    const apellido = p?.apellido ? ` ${p.apellido}` : '';
    this.clienteNombreStr = `${p?.nombre || ''}${apellido}`.trim() || this.cliente.razon_social || '—';
    const partes: string[] = [];
    if (this.cliente.tipo_cliente?.descripcion) partes.push(this.cliente.tipo_cliente.descripcion);
    if (this.cliente.ruc) partes.push(`RUC ${this.cliente.ruc}`);
    else if (p?.documento) partes.push(`${p?.tipoDocumento || 'Doc'} ${p.documento}`);
    this.clienteSubtitulo = partes.join(' · ');
  }

  private computePctUso(): void {
    if (this.cliente?.credito && this.limiteCredito > 0) {
      this.pctUso = (this.saldoActual / this.limiteCredito) * 100;
      this.pctUsoLabel = `${this.pctUso.toFixed(0)}%`;
      if (this.pctUso > 100) this.pctUsoColor = 'error';
      else if (this.pctUso >= 80) this.pctUsoColor = 'warning';
      else if (this.pctUso >= 50) this.pctUsoColor = 'warning';
      else this.pctUsoColor = 'success';
    } else if (this.cliente?.credito) {
      this.pctUso = 0;
      this.pctUsoLabel = 'Sin límite';
      this.pctUsoColor = 'info';
    } else {
      this.pctUso = 0;
      this.pctUsoLabel = 'Sin crédito';
      this.pctUsoColor = 'info';
    }
  }

  private enrichCpc(c: any): any {
    const cuotas = Array.isArray(c.cuotas) ? c.cuotas : [];
    const pendientes = cuotas.filter((q: any) => q.estado === 'PENDIENTE' || q.estado === 'PARCIAL');
    pendientes.sort((a: any, b: any) =>
      new Date(a.fechaVencimiento || a.fecha_vencimiento).getTime() -
      new Date(b.fechaVencimiento || b.fecha_vencimiento).getTime()
    );
    const proxima = pendientes[0] || null;
    const montoPendiente = (Number(c.montoTotal) || 0) - (Number(c.montoCobrado) || 0);
    return {
      ...c,
      _pendientes: pendientes.length,
      _proxima: proxima,
      _montoPendiente: +montoPendiente.toFixed(2),
    };
  }

  private applyStats(stats: any): void {
    const porMes = stats?.porMes || [];
    const composicion = stats?.composicion || {};

    const labels = porMes.map((p: any) => p.mes);
    this.chartMesData = {
      labels,
      datasets: [
        buildLineDataset(
          'Cargos',
          porMes.map((p: any) => p.cargo),
          DASHBOARD_CHART_COLORS.warning,
          DASHBOARD_CHART_COLORS.warningSoft,
          true,
        ),
        buildLineDataset(
          'Pagos',
          porMes.map((p: any) => p.pago),
          DASHBOARD_CHART_COLORS.success,
          DASHBOARD_CHART_COLORS.successSoft,
          true,
        ),
      ],
    };

    const compLabels = ['Cargos', 'Pagos', 'Ajuste +', 'Ajuste −'];
    const compValues = [
      Number(composicion.CARGO) || 0,
      Number(composicion.PAGO) || 0,
      Number(composicion.AJUSTE_POSITIVO) || 0,
      Number(composicion.AJUSTE_NEGATIVO) || 0,
    ];
    this.chartCompData = {
      labels: compLabels,
      datasets: [
        {
          data: compValues,
          backgroundColor: [
            DASHBOARD_CHART_COLORS.warning,
            DASHBOARD_CHART_COLORS.success,
            DASHBOARD_CHART_COLORS.info,
            DASHBOARD_CHART_COLORS.error,
          ],
          borderWidth: 0,
        },
      ],
    };
  }

  async loadMovimientos(): Promise<void> {
    if (!this.clienteId) return;
    this.loadingMovs = true;
    try {
      const f = this.filterForm.value;
      const filtros: any = {
        page: this.pageIndex,
        pageSize: this.pageSize,
      };
      if (f.fechaInicio) filtros.fechaInicio = this.toIso(f.fechaInicio);
      if (f.fechaFin) filtros.fechaFin = this.toIsoEndOfDay(f.fechaFin);
      if (f.tipo) filtros.tipo = f.tipo;

      const res: any = await firstValueFrom(
        this.repositoryService.getMovimientosCliente(this.clienteId, filtros),
      );
      const items = res?.items || res || [];
      this.movimientos = items.map((m: any) => ({
        ...m,
        _tipoClass: this.tipoBadgeClass(m.tipo),
        _origen: this.origenMov(m),
      }));
      this.totalMovimientos = res?.total ?? this.movimientos.length;
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar movimientos', 'Cerrar', { duration: 3000 });
    } finally {
      this.loadingMovs = false;
    }
  }

  private toIso(d: any): string {
    const date = d instanceof Date ? d : new Date(d);
    date.setHours(0, 0, 0, 0);
    return date.toISOString();
  }

  private toIsoEndOfDay(d: any): string {
    const date = d instanceof Date ? d : new Date(d);
    date.setHours(23, 59, 59, 999);
    return date.toISOString();
  }

  buscarMovs(): void {
    this.pageIndex = 0;
    this.loadMovimientos();
  }

  limpiarFiltros(): void {
    this.filterForm.reset({ fechaInicio: null, fechaFin: null, tipo: '' });
    this.pageIndex = 0;
    this.loadMovimientos();
  }

  onPageChange(e: PageEvent): void {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.loadMovimientos();
  }

  private tipoBadgeClass(tipo: string): string {
    switch (tipo) {
      case 'CARGO': return 'tipo-cargo';
      case 'AJUSTE_POSITIVO': return 'tipo-cargo';
      case 'PAGO': return 'tipo-pago';
      case 'AJUSTE_NEGATIVO': return 'tipo-pago';
      default: return 'tipo-default';
    }
  }

  private origenMov(m: any): string {
    if (m.ventaId) return `Venta #${m.ventaId}`;
    if (m.cuentaPorCobrarId) return `CPC #${m.cuentaPorCobrarId}`;
    return '—';
  }

  abrirCobrarCuota(cuota: any, cpc: any): void {
    if (!cuota) {
      this.snackBar.open('No hay cuotas pendientes', 'Cerrar', { duration: 2500 });
      return;
    }
    const ref = this.dialog.open(CobrarCuotaDialogComponent, {
      width: '640px',
      data: {
        cuota: { ...cuota, cuentaPorCobrar: cpc },
        contextoLabel: this.clienteNombre(),
      },
      disableClose: true,
    });
    ref.afterClosed().subscribe((r) => {
      if (r) this.loadAll();
    });
  }

  recalcularSaldo(): void {
    if (!this.clienteId || this.recalculando) return;
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '440px',
      data: {
        title: 'Recalcular saldo',
        message: '¿Recalcular el saldo del cliente sumando todos sus movimientos? Esto sobrescribe el saldo actual con el valor calculado.',
        confirmText: 'Recalcular',
        cancelText: 'Cancelar',
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      this.recalculando = true;
      try {
        const res: any = await firstValueFrom(this.repositoryService.recalcularSaldoCliente(this.clienteId!));
        const nuevo = Number(res?.saldoRecalculado ?? 0).toFixed(2);
        this.snackBar.open(`Saldo recalculado: ${nuevo}`, 'Cerrar', { duration: 3000 });
        await this.loadAll();
      } catch (e) {
        console.error(e);
        this.snackBar.open('Error al recalcular saldo', 'Cerrar', { duration: 3000 });
      } finally {
        this.recalculando = false;
      }
    });
  }

  async exportarHistorial(formato: 'pdf' | 'excel'): Promise<void> {
    if (!this.clienteId) return;
    try {
      // Trae TODO el historial filtrado (sin paginación)
      const f = this.filterForm.value;
      const filtros: any = {};
      if (f.fechaInicio) filtros.fechaInicio = this.toIso(f.fechaInicio);
      if (f.fechaFin) filtros.fechaFin = this.toIsoEndOfDay(f.fechaFin);
      if (f.tipo) filtros.tipo = f.tipo;
      const movs: any = await firstValueFrom(
        this.repositoryService.getMovimientosCliente(this.clienteId, filtros),
      );
      const items = Array.isArray(movs) ? movs : movs?.items || [];
      if (!items.length) {
        this.snackBar.open('No hay movimientos para exportar', 'Cerrar', { duration: 2500 });
        return;
      }
      if (formato === 'excel') {
        await this.exportarExcel(items);
      } else {
        await this.exportarPdf(items);
      }
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al exportar', 'Cerrar', { duration: 3000 });
    }
  }

  private async exportarExcel(items: any[]): Promise<void> {
    const ExcelJS: any = await import('exceljs');
    const wb = new (ExcelJS.Workbook || ExcelJS.default?.Workbook)();
    const ws = wb.addWorksheet('Movimientos');
    ws.columns = [
      { header: 'Fecha', key: 'fecha', width: 22 },
      { header: 'Tipo', key: 'tipo', width: 14 },
      { header: 'Monto', key: 'monto', width: 14 },
      { header: 'Origen', key: 'origen', width: 18 },
      { header: 'Observación', key: 'observacion', width: 40 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const m of items) {
      ws.addRow({
        fecha: m.fecha ? new Date(m.fecha).toLocaleString('es-PY') : '',
        tipo: m.tipo,
        monto: Number(m.monto) || 0,
        origen: this.origenMov(m),
        observacion: m.observacion || '',
      });
    }
    const buffer = await wb.xlsx.writeBuffer();
    this.downloadBlob(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `movimientos-${this.fileSlug()}.xlsx`,
    );
    this.snackBar.open('Excel generado', 'Cerrar', { duration: 2500 });
  }

  private async exportarPdf(items: any[]): Promise<void> {
    // @ts-ignore — pdfmake sin types
    const pdfMakeMod: any = await import('pdfmake/build/pdfmake');
    // @ts-ignore
    const pdfFontsMod: any = await import('pdfmake/build/vfs_fonts');
    const pdfMake: any = pdfMakeMod.default || pdfMakeMod;
    pdfMake.vfs = (pdfFontsMod.default || pdfFontsMod).pdfMake?.vfs || pdfFontsMod.pdfMake?.vfs;

    const body: any[][] = [
      ['Fecha', 'Tipo', 'Monto', 'Origen', 'Observación'].map((h) => ({ text: h, bold: true })),
    ];
    for (const m of items) {
      body.push([
        m.fecha ? new Date(m.fecha).toLocaleString('es-PY') : '',
        m.tipo,
        { text: (Number(m.monto) || 0).toLocaleString('es-PY'), alignment: 'right' },
        this.origenMov(m),
        m.observacion || '',
      ]);
    }

    const docDef = {
      pageSize: 'A4',
      pageOrientation: 'landscape',
      content: [
        { text: 'Estado de cuenta', style: 'h1' },
        { text: this.clienteNombre(), style: 'h2', margin: [0, 0, 0, 12] },
        {
          columns: [
            { text: `Saldo actual: ${(this.saldoActual || 0).toLocaleString('es-PY')}` },
            { text: `Generado: ${new Date().toLocaleString('es-PY')}`, alignment: 'right' },
          ],
          margin: [0, 0, 0, 12],
        },
        { table: { headerRows: 1, widths: ['auto', 'auto', 'auto', 'auto', '*'], body }, layout: 'lightHorizontalLines' },
      ],
      styles: {
        h1: { fontSize: 18, bold: true },
        h2: { fontSize: 13, color: '#555' },
      },
      defaultStyle: { fontSize: 10 },
    };

    pdfMake.createPdf(docDef).download(`movimientos-${this.fileSlug()}.pdf`);
    this.snackBar.open('PDF generado', 'Cerrar', { duration: 2500 });
  }

  private fileSlug(): string {
    const base = (this.clienteNombre() || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${base}-${new Date().toISOString().slice(0, 10)}`;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private clienteNombre(): string {
    return this.clienteNombreStr;
  }
}
