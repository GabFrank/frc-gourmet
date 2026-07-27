import { Component, ElementRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { DashChartCardComponent } from 'src/app/shared/components/dashboard/chart-card/dash-chart-card.component';
import { DashRankingListComponent, DashRankingItem } from 'src/app/shared/components/dashboard/ranking-list/dash-ranking-list.component';
import { DashSectionHeaderComponent } from 'src/app/shared/components/dashboard/section-header/dash-section-header.component';
import { getDashboardChartOptions } from 'src/app/shared/utils/dashboard-chart-theme';
import { ReportePeriodoControlComponent } from '../reporte-periodo-control/reporte-periodo-control.component';
import { ReportePeriodoParams } from '../reporte-models';
import {
  REPORTE_ROJO, REPORTE_AZUL, REPORTE_NARANJA, REPORTE_VERDE, REPORTE_AMARILLO, REPORTE_CATEGORICA,
  formatGs, formatDec, KpiCard, buildKpiCard,
} from '../reporte-visual';
import { exportarReportePdf, capturarGraficos, primerGraficoBase64, captionKpis } from '../reporte-export.util';

const AGING_COLORS = [REPORTE_AZUL, REPORTE_AMARILLO, REPORTE_NARANJA, REPORTE_ROJO];
const AGING_LABELS = ['Por vencer', '1–30 días', '31–60 días', '+60 días'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface SegBar { total: string; segs: Array<{ pct: number; color: string; label: string; monto: string }>; }
interface Leyenda { nombre: string; pct: number; color: string; }

/**
 * Pantalla "Reportes Financieros" (cierre de mes). Consume
 * `get-reporte-finanzas-cierre`: flujo de caja, composición ingresos/egresos,
 * gastos por categoría, aging CPC/CPP, comisiones POS y vencimientos.
 */
@Component({
  selector: 'app-finanzas-reportes',
  templateUrl: './finanzas-reportes.component.html',
  styleUrls: ['./finanzas-reportes.component.scss'],
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatProgressSpinnerModule,
    NgChartsModule, MatSnackBarModule, DashChartCardComponent, DashRankingListComponent, DashSectionHeaderComponent, ReportePeriodoControlComponent,
  ],
})
export class FinanzasReportesComponent {
  loading = false;
  cargado = false;
  presentando = false;
  enviandoWa = false;
  data: any = null;
  periodoLabel = '';
  comparaLabel: string | null = null;
  @ViewChild('reporteRoot') reporteRoot?: ElementRef<HTMLElement>;

  kpis: KpiCard[] = [];

  flujoData: ChartData<'bar'> = { labels: [], datasets: [] };
  flujoOptions: ChartConfiguration<'bar'>['options'] = getDashboardChartOptions('bar');

  private donaOptions: ChartConfiguration<'doughnut'>['options'] = {
    ...getDashboardChartOptions('doughnut'),
    cutout: '62%',
    plugins: { ...(getDashboardChartOptions('doughnut') as any)?.plugins, legend: { display: false } },
  };
  ingData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  ingLeyenda: Leyenda[] = [];
  egrData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  egrLeyenda: Leyenda[] = [];
  mixOptions = this.donaOptions;

  gastosRanking: DashRankingItem[] = [];

  agingCobrar: SegBar | null = null;
  agingPagar: SegBar | null = null;
  agingLabels = AGING_LABELS;
  agingColors = AGING_COLORS;

  posTotal = '';
  posFacturado = '';
  posPct = '';
  posData: ChartData<'bar'> = { labels: [], datasets: [] };
  posOptions: ChartConfiguration<'bar'>['options'] = getDashboardChartOptions('bar');

  vencimientos: Array<{ fecha: string; concepto: string; tipo: string; beneficiario: string; monto: string; color: string }> = [];
  totalComprometido = '';

  constructor(private repository: RepositoryService, private snackBar: MatSnackBar) {}

  setData(_data: any): void {}

  // ── Presentación / Export ──
  togglePresentacion(): void {
    const el = this.reporteRoot?.nativeElement;
    if (!this.presentando) {
      this.presentando = true;
      el?.requestFullscreen?.().catch(() => { /* algunos entornos no lo permiten */ });
    } else {
      this.presentando = false;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    if (!document.fullscreenElement) this.presentando = false;
  }

  async exportarPdf(): Promise<void> {
    const root = this.reporteRoot?.nativeElement;
    if (!root) return;
    try {
      await exportarReportePdf({
        titulo: 'Reportes Financieros — Cierre de Mes',
        periodoLabel: this.periodoLabel,
        comparaLabel: this.comparaLabel,
        kpis: this.kpis,
        imagenes: capturarGraficos(root),
        tablas: this.vencimientos.length ? [{
          titulo: 'Próximos vencimientos',
          headers: ['Fecha', 'Concepto', 'Tipo', 'Beneficiario', 'Monto'],
          filas: this.vencimientos.map((v) => [v.fecha, v.concepto, v.tipo, v.beneficiario, v.monto]),
        }] : [],
      });
    } catch (e) {
      console.error('Error exportando PDF', e);
      this.snackBar.open('No se pudo generar el PDF', 'Cerrar', { duration: 3000 });
    }
  }

  async enviarWhatsapp(): Promise<void> {
    const root = this.reporteRoot?.nativeElement;
    if (!root || this.enviandoWa) return;
    const base64 = primerGraficoBase64(root);
    if (!base64) { this.snackBar.open('No hay gráfico para enviar', 'Cerrar', { duration: 3000 }); return; }
    this.enviandoWa = true;
    try {
      const res = await firstValueFrom(this.repository.enviarReporteWhatsapp({
        base64,
        caption: captionKpis('Reportes Financieros', this.periodoLabel, this.kpis),
        fileName: 'reporte-finanzas.png',
      }));
      this.snackBar.open(res?.ok ? 'Reporte enviado por WhatsApp' : (res?.omitido || 'No se pudo enviar'), 'Cerrar', { duration: 3500 });
    } catch (e: any) {
      this.snackBar.open(`Error: ${e?.message || 'no se pudo enviar'}`, 'Cerrar', { duration: 4000 });
    } finally {
      this.enviandoWa = false;
    }
  }

  async onAplicar(params: ReportePeriodoParams): Promise<void> {
    this.loading = true;
    try {
      this.data = await firstValueFrom(this.repository.getReporteFinanzasCierre(params));
      this.periodoLabel = this.data?.periodoLabel || '';
      this.comparaLabel = this.data?.periodoLabelAnterior || null;
      this.procesar();
      this.cargado = true;
    } catch (e) {
      console.error('Error cargando reporte financiero', e);
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  private procesar(): void {
    const d = this.data;
    if (!d || !d.kpis) { return; }

    this.kpis = [
      buildKpiCard('Ingresos del mes', formatGs(d.kpis.ingresos.valor), d.kpis.ingresos.variacion),
      buildKpiCard('Egresos del mes', formatGs(d.kpis.egresos.valor), d.kpis.egresos.variacion, { invertido: true }),
      buildKpiCard('Flujo neto', formatGs(d.kpis.flujoNeto.valor), d.kpis.flujoNeto.variacion),
      buildKpiCard('Gastos operativos', formatGs(d.kpis.gastos.valor), d.kpis.gastos.variacion, { invertido: true }),
      buildKpiCard('Por cobrar vencido', formatGs(d.kpis.porCobrarVencido.valor), d.kpis.porCobrarVencido.variacion, { invertido: true }),
    ];

    // Flujo de caja (barras ingresos/egresos + línea neto)
    const f = d.flujoCaja || { labels: [], ingresos: [], egresos: [], neto: [] };
    this.flujoData = {
      labels: f.labels,
      datasets: [
        { type: 'bar', label: 'Ingresos', data: f.ingresos, backgroundColor: REPORTE_VERDE, borderRadius: 5, maxBarThickness: 26, order: 2 } as any,
        { type: 'bar', label: 'Egresos', data: f.egresos, backgroundColor: REPORTE_NARANJA, borderRadius: 5, maxBarThickness: 26, order: 2 } as any,
        { type: 'line', label: 'Neto', data: f.neto, borderColor: REPORTE_ROJO, backgroundColor: REPORTE_ROJO, tension: 0.35, pointRadius: 3, borderWidth: 2.4, order: 1 } as any,
      ],
    };

    // Composición ingresos / egresos (donas)
    const dona = (arr: any[]): { data: ChartData<'doughnut'>; ley: Leyenda[] } => {
      const items = (arr || []).slice(0, 6);
      return {
        data: { labels: items.map((x) => x.nombre), datasets: [{ data: items.map((x) => x.total), backgroundColor: items.map((_, i) => REPORTE_CATEGORICA[i % REPORTE_CATEGORICA.length]), borderWidth: 0 }] },
        ley: items.map((x, i) => ({ nombre: x.nombre, pct: x.pct, color: REPORTE_CATEGORICA[i % REPORTE_CATEGORICA.length] })),
      };
    };
    const di = dona(d.composicionIngresos); this.ingData = di.data; this.ingLeyenda = di.ley;
    const de = dona(d.composicionEgresos); this.egrData = de.data; this.egrLeyenda = de.ley;

    // Gastos por categoría (ranking)
    const gc = d.gastosPorCategoria || [];
    const maxG = gc.reduce((m: number, x: any) => Math.max(m, x.total), 0) || 1;
    this.gastosRanking = gc.map((g: any) => ({
      nombre: g.nombre, valorPrincipal: formatGs(g.total), valorSecundario: `${g.pct}%`, porcentaje: Math.round((g.total / maxG) * 100),
    }));

    // Aging (barras segmentadas)
    const armarSeg = (a: any): SegBar => ({
      total: formatGs(a?.total || 0),
      segs: (a?.buckets || []).map((monto: number, i: number) => ({
        pct: a.pcts[i], color: AGING_COLORS[i], label: AGING_LABELS[i], monto: formatGs(monto),
      })).filter((s: any) => s.pct > 0 || s.label),
    });
    this.agingCobrar = d.aging?.porCobrar ? armarSeg(d.aging.porCobrar) : null;
    this.agingPagar = d.aging?.porPagar ? armarSeg(d.aging.porPagar) : null;

    // Comisiones POS
    const pos = d.comisionesPos || { total: 0, facturado: 0, pctPromedio: 0, porMaquina: [] };
    this.posTotal = formatGs(pos.total);
    this.posFacturado = formatGs(pos.facturado);
    this.posPct = `${formatDec(pos.pctPromedio)}%`;
    this.posData = {
      labels: pos.porMaquina.map((m: any) => m.nombre),
      datasets: [{ data: pos.porMaquina.map((m: any) => m.comision), backgroundColor: REPORTE_AZUL, borderRadius: 5, maxBarThickness: 46 }],
    };

    // Vencimientos
    this.vencimientos = (d.vencimientos || []).map((v: any) => ({
      fecha: this.fmtFecha(v.fecha),
      concepto: v.concepto,
      tipo: v.tipo,
      beneficiario: v.beneficiario,
      monto: formatGs(v.monto),
      color: v.tipo === 'Cheque' ? REPORTE_ROJO : REPORTE_NARANJA,
    }));
    this.totalComprometido = formatGs(d.totalComprometido || 0);
  }

  private fmtFecha(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return `${d.getDate()} ${MESES[d.getMonth()]}`;
  }
}
