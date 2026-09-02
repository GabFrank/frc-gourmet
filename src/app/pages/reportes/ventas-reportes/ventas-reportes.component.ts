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
  REPORTE_ROJO, REPORTE_CATEGORICA, REPORTE_AZUL, REPORTE_GRIS, REPORTE_NARANJA,
  REPORTE_VERDE, REPORTE_AMARILLO, formatGs, formatNum, formatDec,
  KpiCard, buildKpiCard, buildKpiCardPct, HeatmapVM,
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
  errorCarga = false;
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
  /** Canal del heatmap: la curva del delivery no es la del salón. */
  heatmapCanal: 'TODOS' | 'DELIVERY' = 'TODOS';
  topProductos: DashRankingItem[] = [];
  combinaciones: Array<{ par: string; frecuencia: number }> = [];

  // ── Delivery y retiro ──
  /** KPIs del canal, en su propia fila para no romper la grilla de 5 de arriba. */
  kpisDelivery: KpiCard[] = [];
  /** `kpis` + `kpisDelivery`: lo que se manda al PDF y al caption de WhatsApp. */
  kpisExport: KpiCard[] = [];
  hayDelivery = false;

  canalData: ChartData<'doughnut'> = { labels: [], datasets: [] };
  canalOptions: ChartConfiguration<'doughnut'>['options'] = {
    ...getDashboardChartOptions('doughnut'),
    cutout: '62%',
    plugins: { ...(getDashboardChartOptions('doughnut') as any)?.plugins, legend: { display: false } },
  };
  canalFilas: Array<{ label: string; tickets: string; facturacion: string; ticketPromedio: string; pct: string; color: string }> = [];
  cobroAnticipado = { anticipado: 0, contraEntrega: 0 };
  origenRepartos: Array<{ origen: string; tickets: number }> = [];

  zonasData: ChartData<'bar'> = { labels: [], datasets: [] };
  zonasOptions: ChartConfiguration<'bar'>['options'] = getDashboardChartOptions('bar');
  zonasFilas: Array<{ zona: string; envios: string; facturacion: string; ticketPromedio: string; envioRecaudado: string; minutos: string }> = [];

  repartidores: DashRankingItem[] = [];

  tiemposData: ChartData<'bar'> = { labels: [], datasets: [] };
  tiemposOptions: ChartConfiguration<'bar'>['options'] = getDashboardChartOptions('bar');
  slaChips: Array<{ label: string; cantidad: number; pct: string; color: string }> = [];
  slaLeyenda = '';
  hayTiempos = false;

  cancelaciones = { cantidad: 0, tasa: '0', montoPerdido: '', motivos: [] as Array<{ motivo: string; cantidad: number }> };

  constructor(private repository: RepositoryService, private snackBar: MatSnackBar) {}

  setData(_data: any): void {}

  // ── Presentación / Export ──
  togglePresentacion(): void {
    const el = this.reporteRoot?.nativeElement;
    if (!this.presentando) {
      this.presentando = true;
      // Si el entorno rechaza pantalla completa, revertir el estado del botón.
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
        kpis: this.kpisExport,
        imagenes: capturarGraficos(root),
        tablas: [
          ...(this.zonasFilas.length ? [{
            titulo: 'Envíos por zona',
            headers: ['Zona', 'Envíos', 'Facturación', 'Envío cobrado', 'Tiempo prom.'],
            filas: this.zonasFilas.map((z) => [z.zona, z.envios, z.facturacion, z.envioRecaudado, z.minutos]),
          }] : []),
          ...(this.combinaciones.length ? [{
            titulo: 'Combinaciones más frecuentes',
            headers: ['Combinación', 'Frecuencia'],
            filas: this.combinaciones.map((c) => [c.par, `${c.frecuencia} veces`]),
          }] : []),
        ],
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
        caption: captionKpis('Reportes de Ventas', this.periodoLabel, this.kpisExport),
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
    this.errorCarga = false;
    try {
      this.data = await firstValueFrom(this.repository.getReporteVentasCierre(params));
      this.periodoLabel = this.data?.periodoLabel || '';
      this.comparaLabel = this.data?.periodoLabelAnterior || null;
      this.procesar();
      this.cargado = true;
    } catch (e: any) {
      console.error('Error cargando reporte de ventas', e);
      this.data = null;
      this.errorCarga = true;
      this.snackBar.open(`No se pudo cargar el reporte: ${e?.message || 'error inesperado'}`, 'Cerrar', { duration: 4000 });
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
    // Fila propia: la grilla de arriba es de 5 columnas y meter 9 cards ahí
    // dejaba una segunda fila coja. Además separa lo general de lo del canal.
    this.kpisDelivery = [
      buildKpiCard('Envíos', formatNum(d.kpis.envios.valor), d.kpis.envios.variacion),
      buildKpiCard('Retiros', formatNum(d.kpis.retiros.valor), d.kpis.retiros.variacion),
      buildKpiCard('Ingreso por envíos', formatGs(d.kpis.ingresoEnvios.valor), d.kpis.ingresoEnvios.variacion),
      buildKpiCard('Ticket prom. delivery', formatGs(d.kpis.ticketPromedioDelivery.valor), d.kpis.ticketPromedioDelivery.variacion),
    ];
    // El PDF y el caption de WhatsApp leen las cards, así que ven las dos filas.
    this.kpisExport = [...this.kpis, ...this.kpisDelivery];

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
    // Sólo si hubo delivery en el período: una línea plana en cero no informa
    // nada y le roba lectura a las otras dos.
    const serieDelivery: number[] = d.tendencia.delivery || [];
    if (serieDelivery.some((v: number) => v > 0)) {
      datasets.push({
        label: 'Delivery', data: serieDelivery, borderColor: REPORTE_NARANJA,
        fill: false, tension: 0.35, pointRadius: 0, borderWidth: 2,
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
    this.aplicarHeatmap();

    // ── Top productos (ranking del padrón) ──
    this.topProductos = (d.topProductos || []).map((p: any) => ({
      nombre: p.nombre,
      valorPrincipal: `${formatNum(p.unidades)} u`,
      valorSecundario: `margen ${formatNum(p.margenPct)}%`,
      porcentaje: p.popularidad,
    }));

    // ── Combinaciones ──
    this.combinaciones = d.combinaciones || [];

    // ── Delivery y retiro ──
    this.procesarDelivery(d.delivery);
  }

  /** Cambia el canal del heatmap. Es un handler de evento, no se llama del template. */
  setHeatmapCanal(canal: 'TODOS' | 'DELIVERY'): void {
    this.heatmapCanal = canal;
    this.aplicarHeatmap();
  }

  private aplicarHeatmap(): void {
    const d = this.data;
    const hp = (this.heatmapCanal === 'DELIVERY' ? d?.horasPicoDelivery : d?.horasPico)
      || { dias: [], horas: [], matriz: [] };
    let max = 0;
    for (const fila of hp.matriz || []) for (const v of fila) if (v > max) max = v;
    this.heatmap = {
      dias: hp.dias || [], horas: hp.horas || [], max,
      celdas: (hp.matriz || []).map((fila: number[], di: number) =>
        fila.map((v: number, hi: number) => ({
          dia: hp.dias[di], hora: hp.horas[hi], valor: v,
          opacidad: max > 0 ? Math.max(0.06, v / max) : 0.06,
        }))),
    };
  }

  private procesarDelivery(dv: any): void {
    if (!dv) { this.hayDelivery = false; return; }
    this.hayDelivery = (dv.kpis?.envios || 0) > 0 || (dv.kpis?.retiros || 0) > 0;

    // ── Mix por canal (dona + tabla) ──
    // Se pintan los cuatro canales aunque alguno esté en cero: su ausencia es
    // el dato ("este mes no hubo un solo retiro"), no un hueco en el gráfico.
    const canales = dv.mixCanal || [];
    const colorDe = (i: number) => REPORTE_CATEGORICA[i % REPORTE_CATEGORICA.length];
    this.canalData = {
      labels: canales.map((c: any) => c.label),
      datasets: [{
        data: canales.map((c: any) => c.facturacion),
        backgroundColor: canales.map((_: any, i: number) => colorDe(i)),
        borderWidth: 0,
      }],
    };
    this.canalFilas = canales.map((c: any, i: number) => ({
      label: c.label,
      tickets: formatNum(c.tickets),
      facturacion: formatGs(c.facturacion),
      ticketPromedio: formatGs(c.ticketPromedio),
      pct: `${formatDec(c.pct)}%`,
      color: colorDe(i),
    }));
    this.cobroAnticipado = dv.cobroAnticipado || { anticipado: 0, contraEntrega: 0 };
    this.origenRepartos = (dv.origenRepartos || []).map((o: any) => ({ origen: o.origen, tickets: o.tickets }));

    // ── Envíos por zona (barras + tabla) ──
    const zonas = dv.zonas || [];
    this.zonasData = {
      labels: zonas.map((z: any) => z.zona),
      datasets: [{
        data: zonas.map((z: any) => z.envios),
        backgroundColor: REPORTE_AZUL, borderRadius: 5, maxBarThickness: 34,
      }],
    };
    this.zonasFilas = zonas.map((z: any) => ({
      zona: z.zona,
      envios: formatNum(z.envios),
      facturacion: formatGs(z.facturacion),
      ticketPromedio: formatGs(z.ticketPromedio),
      envioRecaudado: formatGs(z.envioRecaudado),
      // null = ningún envío de la zona llegó a entregarse en el período; un "0"
      // diría que fueron instantáneos.
      minutos: z.minutosPromedio == null ? '—' : `${formatDec(z.minutosPromedio)} min`,
    }));

    // ── Repartidores ──
    this.repartidores = (dv.repartidores || []).map((r: any) => ({
      nombre: r.nombre,
      valorPrincipal: `${formatNum(r.entregas)} entregas`,
      valorSecundario: r.minutosPromedio == null
        ? formatGs(r.facturacion)
        : `${formatGs(r.facturacion)} · ${formatDec(r.minutosPromedio)} min`,
      porcentaje: 0,
    }));
    const maxEntregas = (dv.repartidores || []).reduce((m: number, r: any) => Math.max(m, r.entregas), 0);
    this.repartidores.forEach((item, i) => {
      const r = dv.repartidores[i];
      item.porcentaje = maxEntregas > 0 ? Math.round((r.entregas / maxEntregas) * 100) : 0;
    });

    // ── Tiempos por etapa + SLA ──
    const etapas = (dv.tiempos?.etapas || []).filter((e: any) => e.muestras > 0);
    this.hayTiempos = etapas.length > 0;
    this.tiemposData = {
      labels: etapas.map((e: any) => e.etapa),
      datasets: [
        { label: 'Promedio', data: etapas.map((e: any) => e.promedio ?? 0), backgroundColor: REPORTE_AZUL, borderRadius: 5, maxBarThickness: 28 },
        { label: 'Mediana', data: etapas.map((e: any) => e.mediana ?? 0), backgroundColor: REPORTE_NARANJA, borderRadius: 5, maxBarThickness: 28 },
      ],
    };
    const sla = dv.tiempos?.sla || { verde: 0, amarillo: 0, rojo: 0, total: 0 };
    const pct = (n: number) => (sla.total > 0 ? `${formatDec((n / sla.total) * 100)}%` : '—');
    const ua = dv.tiempos?.umbralAmarillo ?? 30;
    const ur = dv.tiempos?.umbralRojo ?? 60;
    this.slaChips = [
      { label: `En hora (< ${ua} min)`, cantidad: sla.verde, pct: pct(sla.verde), color: REPORTE_VERDE },
      { label: `Demorado (${ua}–${ur} min)`, cantidad: sla.amarillo, pct: pct(sla.amarillo), color: REPORTE_AMARILLO },
      { label: `Muy demorado (≥ ${ur} min)`, cantidad: sla.rojo, pct: pct(sla.rojo), color: REPORTE_ROJO },
    ];
    this.slaLeyenda = sla.total > 0
      ? `Sobre ${formatNum(sla.total)} envíos entregados`
      : 'Sin envíos entregados en el período';

    // ── Cancelaciones ──
    const c = dv.cancelaciones || { cantidad: 0, tasa: 0, montoPerdido: 0, motivos: [] };
    this.cancelaciones = {
      cantidad: c.cantidad,
      tasa: `${formatDec(c.tasa)}%`,
      montoPerdido: formatGs(c.montoPerdido),
      motivos: c.motivos || [],
    };
  }

  private colorCuadrante(pop: number, margen: number): string {
    // Estrella (alta pop, alto margen) / Vaca / Incógnita / Perro.
    if (pop >= 50) return margen >= 55 ? REPORTE_VERDE : REPORTE_AZUL;
    return margen >= 55 ? REPORTE_AMARILLO : REPORTE_ROJO;
  }
}
