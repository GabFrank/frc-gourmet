import { Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NgChartsModule } from 'ng2-charts';
import { ChartData } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ReportePeriodoControlComponent } from '../reporte-periodo-control.component';
import { ReportePeriodoParams } from '../reporte-periodo.model';
import {
  KpiCard, buildKpiCard, chartOptions, fmtGs, fmtDec,
  REP_ROJO, REP_AZUL, REP_NARANJA, REP_VERDE, REP_AMARILLO, REP_CATEGORICA,
} from '../reporte-visual.util';
import {
  exportarReportePdf, capturarGraficos, primerGraficoBase64, captionKpis,
} from '../reporte-export.util';

interface RankRow { nombre: string; valor: string; sub: string; pct: number; }
interface Leyenda { nombre: string; pct: number; color: string; }
interface Seg { pct: number; color: string; label: string; monto: string; }
interface SegBar { total: string; segs: Seg[]; hasData: boolean; }
interface VencRow { fecha: string; concepto: string; tipo: string; beneficiario: string; monto: string; }

const AGING_COLORS = [REP_AZUL, REP_AMARILLO, REP_NARANJA, REP_ROJO];
const AGING_LABELS = ['Por vencer', '1–30 d', '31–60 d', '+60 d'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * Reportes Financieros — Cierre de Mes (mobile). Consume
 * `get-reporte-finanzas-cierre`: KPIs, flujo de caja (barras) y composición de
 * egresos (dona) con ng2-charts, gastos por categoría, aging CPC/CPP,
 * comisiones POS y próximos vencimientos en tarjetas.
 */
@Component({
  selector: 'app-finanzas-reportes',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatSnackBarModule,
    NgChartsModule, ReportePeriodoControlComponent,
  ],
  templateUrl: './finanzas-reportes.page.html',
  styleUrls: ['../reportes-mobile.scss'],
})
export class FinanzasReportesPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly snack = inject(MatSnackBar);

  loading = false;
  cargado = false;
  error: string | null = null;
  presentando = false;
  enviandoWa = false;
  periodoLabel = '';
  comparaLabel: string | null = null;

  @ViewChild('reporteRoot') reporteRoot?: ElementRef<HTMLElement>;

  data: any = null;
  kpis: KpiCard[] = [];

  flujoData: ChartData<'bar'> = { labels: [], datasets: [] };
  egrData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  egrLeyenda: Leyenda[] = [];
  barOptions = chartOptions('bar');
  doughnutOptions = chartOptions('doughnut');

  ingresos: RankRow[] = [];
  gastos: RankRow[] = [];
  agingCobrar: SegBar | null = null;
  agingPagar: SegBar | null = null;
  agingLabels = AGING_LABELS;
  agingColors = AGING_COLORS;

  posTotal = '';
  posFacturado = '';
  posPct = '';
  vencimientos: VencRow[] = [];
  totalComprometido = '';

  ngOnInit(): void { /* la carga la dispara el control de período (autoAplicar) */ }

  async onAplicar(params: ReportePeriodoParams): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.data = await firstValueFrom(this.repo.getReporteFinanzasCierre(params));
      this.periodoLabel = this.data?.periodoLabel || '';
      this.comparaLabel = this.data?.periodoLabelAnterior || null;
      this.procesar();
      this.cargado = true;
    } catch (e: any) {
      this.error = e?.message || 'No se pudo cargar el reporte';
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  private procesar(): void {
    const d = this.data;
    if (!d || !d.kpis) return;

    this.kpis = [
      buildKpiCard('Ingresos', fmtGs(d.kpis.ingresos.valor), d.kpis.ingresos.variacion),
      buildKpiCard('Egresos', fmtGs(d.kpis.egresos.valor), d.kpis.egresos.variacion, { invertido: true }),
      buildKpiCard('Flujo neto', fmtGs(d.kpis.flujoNeto.valor), d.kpis.flujoNeto.variacion),
      buildKpiCard('Gastos', fmtGs(d.kpis.gastos.valor), d.kpis.gastos.variacion, { invertido: true }),
      buildKpiCard('Por cobrar venc.', fmtGs(d.kpis.porCobrarVencido.valor), d.kpis.porCobrarVencido.variacion, { invertido: true }),
    ];

    // Flujo de caja (barras ingresos/egresos)
    const f = d.flujoCaja || { labels: [], ingresos: [], egresos: [] };
    this.flujoData = {
      labels: f.labels || [],
      datasets: [
        { label: 'Ingresos', data: f.ingresos || [], backgroundColor: REP_VERDE, borderRadius: 4, maxBarThickness: 22 },
        { label: 'Egresos', data: f.egresos || [], backgroundColor: REP_NARANJA, borderRadius: 4, maxBarThickness: 22 },
      ],
    };

    // Composición egresos (dona)
    const egr = (d.composicionEgresos || []).slice(0, 6);
    this.egrData = {
      labels: egr.map((x: any) => x.nombre),
      datasets: [{ data: egr.map((x: any) => x.total), backgroundColor: egr.map((_: any, i: number) => REP_CATEGORICA[i % REP_CATEGORICA.length]), borderWidth: 0 }],
    };
    this.egrLeyenda = egr.map((x: any, i: number) => ({ nombre: x.nombre, pct: x.pct, color: REP_CATEGORICA[i % REP_CATEGORICA.length] }));

    // Composición ingresos (lista)
    this.ingresos = (d.composicionIngresos || []).map((x: any) => ({
      nombre: x.nombre, valor: fmtGs(x.total) + ' Gs', sub: `${fmtDec(x.pct)}%`, pct: Number(x.pct || 0),
    }));

    // Gastos por categoría (ranking)
    const gc = d.gastosPorCategoria || [];
    const maxG = gc.reduce((a: number, x: any) => Math.max(a, x.total), 0) || 1;
    this.gastos = gc.map((g: any) => ({
      nombre: g.nombre, valor: fmtGs(g.total) + ' Gs', sub: `${g.pct}%`, pct: Math.round((g.total / maxG) * 100),
    }));

    // Aging
    this.agingCobrar = d.aging?.porCobrar ? this.armarSeg(d.aging.porCobrar) : null;
    this.agingPagar = d.aging?.porPagar ? this.armarSeg(d.aging.porPagar) : null;

    // Comisiones POS
    const pos = d.comisionesPos || { total: 0, facturado: 0, pctPromedio: 0 };
    this.posTotal = fmtGs(pos.total) + ' Gs';
    this.posFacturado = fmtGs(pos.facturado) + ' Gs';
    this.posPct = `${fmtDec(pos.pctPromedio)}%`;

    // Vencimientos
    this.vencimientos = (d.vencimientos || []).map((v: any) => ({
      fecha: this.fmtFecha(v.fecha), concepto: v.concepto, tipo: v.tipo, beneficiario: v.beneficiario, monto: fmtGs(v.monto) + ' Gs',
    }));
    this.totalComprometido = fmtGs(d.totalComprometido || 0) + ' Gs';
  }

  private armarSeg(a: any): SegBar {
    return {
      total: fmtGs(a?.total || 0) + ' Gs',
      hasData: Number(a?.total || 0) > 0,
      segs: (a?.buckets || []).map((monto: number, i: number) => ({
        pct: a.pcts[i], color: AGING_COLORS[i], label: AGING_LABELS[i], monto: fmtGs(monto) + ' Gs',
      })),
    };
  }

  private fmtFecha(iso: string): string {
    if (!iso) return '';
    // Parsear la parte de fecha como LOCAL: new Date('2026-07-15') sería UTC
    // medianoche y en huso negativo (PY) getDate() devolvería el día anterior.
    const s = String(iso).slice(0, 10);
    const [y, m, day] = s.split('-').map(Number);
    const d = y && m && day ? new Date(y, m - 1, day) : new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return `${d.getDate()} ${MESES[d.getMonth()]}`;
  }

  // ── Presentación / export ──
  togglePresentacion(): void {
    const el = this.reporteRoot?.nativeElement;
    if (!this.presentando) {
      this.presentando = true;
      el?.requestFullscreen?.().catch(() => { this.presentando = false; });
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
    } catch {
      this.snack.open('No se pudo generar el PDF', 'Cerrar', { duration: 3000 });
    }
  }

  async enviarWhatsapp(): Promise<void> {
    const root = this.reporteRoot?.nativeElement;
    if (!root || this.enviandoWa) return;
    const base64 = primerGraficoBase64(root);
    if (!base64) { this.snack.open('No hay gráfico para enviar', 'Cerrar', { duration: 3000 }); return; }
    this.enviandoWa = true;
    try {
      const res: any = await firstValueFrom(this.repo.enviarReporteWhatsapp({
        base64, caption: captionKpis('Reportes Financieros', this.periodoLabel, this.kpis), fileName: 'reporte-finanzas.png',
      }));
      this.snack.open(res?.ok ? 'Reporte enviado por WhatsApp' : (res?.omitido || 'No se pudo enviar'), 'Cerrar', { duration: 3500 });
    } catch (e: any) {
      this.snack.open(`Error: ${e?.message || 'no se pudo enviar'}`, 'Cerrar', { duration: 4000 });
    } finally {
      this.enviandoWa = false;
    }
  }
}
