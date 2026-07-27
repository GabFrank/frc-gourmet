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
  REPORTE_ROJO, REPORTE_CATEGORICA, REPORTE_AZUL, REPORTE_GRIS,
  REPORTE_VERDE, REPORTE_AMARILLO, formatGs, formatNum, KpiCard, buildKpiCard, buildKpiCardPct, HeatmapVM,
} from '../reporte-visual';
import { exportarReportePdf, capturarGraficos, primerGraficoBase64, captionKpis } from '../reporte-export.util';

/**
 * Pantalla "Reportes de Ventas" (cierre de mes). Consume
 * `get-reporte-ventas-cierre` y arma KPIs con variación, tendencia, día de
 * semana, horas pico (heatmap), mix de pago, top productos, ingeniería de menú
 * y combinaciones.
 */
@Component({
  selector: 'app-ventas-reportes',
  templateUrl: './ventas-reportes.component.html',
  styleUrls: ['./ventas-reportes.component.scss'],
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatProgressSpinnerModule,
    NgChartsModule, MatSnackBarModule, DashChartCardComponent, DashRankingListComponent, DashSectionHeaderComponent, ReportePeriodoControlComponent,
  ],
})
export class VentasReportesComponent {
  loading = false;
  cargado = false;
  presentando = false;
  enviandoWa = false;
  data: any = null;
  periodoLabel = '';
  comparaLabel: string | null = null;
  @ViewChild('reporteRoot') reporteRoot?: ElementRef<HTMLElement>;

  kpis: KpiCard[] = [];

  tendenciaData: ChartData<'line'> = { labels: [], datasets: [] };
  tendenciaOptions: ChartConfiguration<'line'>['options'] = getDashboardChartOptions('line');

  diaSemanaData: ChartData<'bar'> = { labels: [], datasets: [] };
  diaSemanaOptions: ChartConfiguration<'bar'>['options'] = getDashboardChartOptions('bar');
  mejorDia = '';

  mixData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  // Leyenda propia (con %); se apaga la del chart.
  mixOptions: ChartConfiguration<'doughnut'>['options'] = {
    ...getDashboardChartOptions('doughnut'),
    cutout: '62%',
    plugins: { ...(getDashboardChartOptions('doughnut') as any)?.plugins, legend: { display: false } },
  };
  mixLeyenda: Array<{ nombre: string; pct: number; color: string }> = [];

  scatterData: ChartData<'bubble'> = { datasets: [] };
  scatterOptions: ChartConfiguration<'bubble'>['options'] = getDashboardChartOptions('bubble');

  heatmap: HeatmapVM = { dias: [], horas: [], celdas: [], max: 0 };
  topProductos: DashRankingItem[] = [];
  combinaciones: Array<{ par: string; frecuencia: number }> = [];

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
        titulo: 'Reportes de Ventas — Cierre de Mes',
        periodoLabel: this.periodoLabel,
        comparaLabel: this.comparaLabel,
        kpis: this.kpis,
        imagenes: capturarGraficos(root),
        tablas: this.combinaciones.length ? [{
          titulo: 'Combinaciones más frecuentes',
          headers: ['Combinación', 'Frecuencia'],
          filas: this.combinaciones.map((c) => [c.par, `${c.frecuencia} veces`]),
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
        caption: captionKpis('Reportes de Ventas', this.periodoLabel, this.kpis),
        fileName: 'reporte-ventas.png',
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
      this.data = await firstValueFrom(this.repository.getReporteVentasCierre(params));
      this.periodoLabel = this.data?.periodoLabel || '';
      this.comparaLabel = this.data?.periodoLabelAnterior || null;
      this.procesar();
      this.cargado = true;
    } catch (e) {
      console.error('Error cargando reporte de ventas', e);
      this.data = null;
    } finally {
      this.loading = false;
    }
  }

  private procesar(): void {
    const d = this.data;
    if (!d || !d.kpis) { return; }

    // ── KPIs ──
    this.kpis = [
      buildKpiCard('Facturación', formatGs(d.kpis.facturacion.valor), d.kpis.facturacion.variacion),
      buildKpiCard('Tickets', formatNum(d.kpis.tickets.valor), d.kpis.tickets.variacion),
      buildKpiCard('Ticket promedio', formatGs(d.kpis.ticketPromedio.valor), d.kpis.ticketPromedio.variacion),
      buildKpiCardPct('Margen bruto', d.kpis.margenPct.valor, d.kpis.margenPct.variacion),
      buildKpiCard('Mesas atendidas', formatNum(d.kpis.mesas.valor), d.kpis.mesas.variacion),
    ];

    // ── Tendencia (línea + comparativo punteado) ──
    const datasets: any[] = [{
      label: 'Actual', data: d.tendencia.actual || [], borderColor: REPORTE_ROJO,
      backgroundColor: 'rgba(219,57,46,0.12)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2.4,
    }];
    if (d.tendencia.anterior && d.tendencia.anterior.length) {
      datasets.push({
        label: 'Anterior', data: d.tendencia.anterior, borderColor: REPORTE_GRIS, borderDash: [5, 5],
        fill: false, tension: 0.35, pointRadius: 0, borderWidth: 1.6,
      });
    }
    this.tendenciaData = { labels: d.tendencia.labels || [], datasets };

    // ── Día de semana (barras, mejor día resaltado) ──
    const ds = d.diaSemana || [];
    const maxDia = ds.reduce((m: number, x: any) => Math.max(m, x.total), 0);
    this.mejorDia = (ds.find((x: any) => x.total === maxDia && maxDia > 0) || {}).dia || '';
    this.diaSemanaData = {
      labels: ds.map((x: any) => x.dia),
      datasets: [{
        data: ds.map((x: any) => x.total),
        backgroundColor: ds.map((x: any) => (x.total === maxDia && maxDia > 0 ? REPORTE_ROJO : REPORTE_AZUL)),
        borderRadius: 5, maxBarThickness: 46,
      }],
    };

    // ── Mix de forma de pago (dona) ──
    const mix = d.mixPago || [];
    this.mixData = {
      labels: mix.map((m: any) => m.nombre),
      datasets: [{ data: mix.map((m: any) => m.total), backgroundColor: mix.map((_: any, i: number) => REPORTE_CATEGORICA[i % REPORTE_CATEGORICA.length]), borderWidth: 0 }],
    };
    this.mixLeyenda = mix.map((m: any, i: number) => ({ nombre: m.nombre, pct: m.pct, color: REPORTE_CATEGORICA[i % REPORTE_CATEGORICA.length] }));

    // ── Ingeniería de menú (burbujas por cuadrante) ──
    const me = d.menuEngineering || [];
    const maxIng = me.reduce((m: number, x: any) => Math.max(m, x.ingreso), 0) || 1;
    this.scatterData = {
      datasets: me.map((p: any) => ({
        label: p.nombre,
        data: [{ x: p.popularidad, y: p.margenPct, r: 6 + Math.round((p.ingreso / maxIng) * 12) }],
        backgroundColor: this.colorCuadrante(p.popularidad, p.margenPct),
      })),
    };

    // ── Horas pico (heatmap) ──
    const hp = d.horasPico || { dias: [], horas: [], matriz: [] };
    let max = 0;
    for (const fila of hp.matriz) for (const v of fila) if (v > max) max = v;
    this.heatmap = {
      dias: hp.dias, horas: hp.horas, max,
      celdas: (hp.matriz || []).map((fila: number[], di: number) =>
        fila.map((v: number, hi: number) => ({ dia: hp.dias[di], hora: hp.horas[hi], valor: v, opacidad: max > 0 ? Math.max(0.06, v / max) : 0.06 }))),
    };

    // ── Top productos (ranking del padrón) ──
    this.topProductos = (d.topProductos || []).map((p: any) => ({
      nombre: p.nombre,
      valorPrincipal: `${formatNum(p.unidades)} u`,
      valorSecundario: `margen ${formatNum(p.margenPct)}%`,
      porcentaje: p.popularidad,
    }));

    // ── Combinaciones ──
    this.combinaciones = d.combinaciones || [];
  }

  private colorCuadrante(pop: number, margen: number): string {
    // Estrella (alta pop, alto margen) / Vaca / Incógnita / Perro.
    if (pop >= 50) return margen >= 55 ? REPORTE_VERDE : REPORTE_AZUL;
    return margen >= 55 ? REPORTE_AMARILLO : REPORTE_ROJO;
  }
}
