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
  KpiCard, buildKpiCard, buildKpiCardPct, chartOptions, fmtGs, fmtNum,
  REP_ROJO, REP_AZUL, REP_GRIS, REP_CATEGORICA,
} from '../reporte-visual.util';
import {
  exportarReportePdf, capturarGraficos, primerGraficoBase64, captionKpis,
} from '../reporte-export.util';

interface RankRow { nombre: string; detalle: string; valor: string; pct: number; }
interface MixRow { nombre: string; pct: number; color: string; }
interface HoraPicoRow { etiqueta: string; tickets: number; }

/**
 * Reportes de Ventas — Cierre de Mes (mobile). Consume `get-reporte-ventas-cierre`
 * y muestra KPIs, tendencia (línea) y mix de pago (dona) con ng2-charts, más
 * rankings (día de semana, top productos, horas pico, combinaciones) en tarjetas.
 */
@Component({
  selector: 'app-ventas-reportes',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatSnackBarModule,
    NgChartsModule, ReportePeriodoControlComponent,
  ],
  templateUrl: './ventas-reportes.page.html',
  styleUrls: ['../reportes-mobile.scss'],
})
export class VentasReportesPage implements OnInit {
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

  tendenciaData: ChartData<'line'> = { labels: [], datasets: [] };
  mixData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  mixLeyenda: MixRow[] = [];
  lineOptions = chartOptions('line');
  doughnutOptions = chartOptions('doughnut');

  diaSemana: RankRow[] = [];
  topProductos: RankRow[] = [];
  horasPico: HoraPicoRow[] = [];
  combinaciones: Array<{ par: string; frecuencia: number }> = [];

  ngOnInit(): void { /* la carga la dispara el control de período (autoAplicar) */ }

  async onAplicar(params: ReportePeriodoParams): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.data = await firstValueFrom(this.repo.getReporteVentasCierre(params));
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
      buildKpiCard('Facturación', fmtGs(d.kpis.facturacion.valor), d.kpis.facturacion.variacion),
      buildKpiCard('Tickets', fmtNum(d.kpis.tickets.valor), d.kpis.tickets.variacion),
      buildKpiCard('Ticket prom.', fmtGs(d.kpis.ticketPromedio.valor), d.kpis.ticketPromedio.variacion),
      buildKpiCardPct('Margen', d.kpis.margenPct.valor, d.kpis.margenPct.variacion),
      buildKpiCard('Mesas', fmtNum(d.kpis.mesas.valor), d.kpis.mesas.variacion),
    ];

    // Tendencia (línea actual + anterior punteada)
    const t = d.tendencia || { labels: [], actual: [], anterior: [] };
    const datasets: any[] = [{
      label: 'Actual', data: t.actual || [], borderColor: REP_ROJO,
      backgroundColor: 'rgba(219,57,46,0.12)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2.2,
    }];
    if (t.anterior && t.anterior.length) {
      datasets.push({
        label: 'Anterior', data: t.anterior, borderColor: REP_GRIS, borderDash: [5, 5],
        fill: false, tension: 0.35, pointRadius: 0, borderWidth: 1.4,
      });
    }
    this.tendenciaData = { labels: t.labels || [], datasets };

    // Mix de pago (dona)
    const mix = d.mixPago || [];
    this.mixData = {
      labels: mix.map((m: any) => m.nombre),
      datasets: [{ data: mix.map((m: any) => m.total), backgroundColor: mix.map((_: any, i: number) => REP_CATEGORICA[i % REP_CATEGORICA.length]), borderWidth: 0 }],
    };
    this.mixLeyenda = mix.map((m: any, i: number) => ({ nombre: m.nombre, pct: m.pct, color: REP_CATEGORICA[i % REP_CATEGORICA.length] }));

    // Día de la semana
    const ds = d.diaSemana || [];
    const maxDia = ds.reduce((a: number, x: any) => Math.max(a, x.total), 0) || 1;
    this.diaSemana = ds.map((x: any) => ({
      nombre: x.dia, detalle: '', valor: fmtGs(x.total) + ' Gs', pct: Math.round((x.total / maxDia) * 100),
    }));

    // Top productos
    const tp = d.topProductos || [];
    this.topProductos = tp.map((p: any) => ({
      nombre: p.nombre, detalle: `margen ${fmtNum(p.margenPct)}%`, valor: `${fmtNum(p.unidades)} u`, pct: Number(p.popularidad || 0),
    }));

    // Horas pico (top celdas del heatmap)
    const hp = d.horasPico || { dias: [], horas: [], matriz: [] };
    const celdas: HoraPicoRow[] = [];
    (hp.matriz || []).forEach((fila: number[], di: number) => {
      (fila || []).forEach((v: number, hi: number) => {
        if (v > 0) celdas.push({ etiqueta: `${hp.dias[di]} · ${hp.horas[hi]}:00`, tickets: v });
      });
    });
    this.horasPico = celdas.sort((a, b) => b.tickets - a.tickets).slice(0, 6);

    // Combinaciones
    this.combinaciones = (d.combinaciones || []).slice(0, 8);
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
        base64, caption: captionKpis('Reportes de Ventas', this.periodoLabel, this.kpis), fileName: 'reporte-ventas.png',
      }));
      this.snack.open(res?.ok ? 'Reporte enviado por WhatsApp' : (res?.omitido || 'No se pudo enviar'), 'Cerrar', { duration: 3500 });
    } catch (e: any) {
      this.snack.open(`Error: ${e?.message || 'no se pudo enviar'}`, 'Cerrar', { duration: 4000 });
    } finally {
      this.enviandoWa = false;
    }
  }
}
