import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { TabsService } from '../../../services/tabs.service';
import { PdvComponent } from '../pdv/pdv.component';
import { ListPreciosDeliveryComponent } from '../precios-delivery/list-precios-delivery.component';
import { ListVentasComponent } from '../historial/list-ventas.component';
import { PdvConfigDialogComponent } from 'src/app/shared/components/pdv-config-dialog/pdv-config-dialog.component';
import { PdvMesaDialogComponent } from 'src/app/shared/components/pdv-mesa-dialog/pdv-mesa-dialog.component';
import { ComandaAbmDialogComponent } from 'src/app/shared/components/comanda-abm-dialog/comanda-abm-dialog.component';
import { AtajoConfigDialogComponent } from 'src/app/shared/components/atajo-config-dialog/atajo-config-dialog.component';
import { CajaMayorDashboardComponent } from '../../financiero/caja-mayor/dashboard/caja-mayor-dashboard.component';
import { DashStatChipComponent } from 'src/app/shared/components/dashboard/stat-chip/dash-stat-chip.component';
import { DashQuickActionComponent } from 'src/app/shared/components/dashboard/quick-action/dash-quick-action.component';
import { DashRankingListComponent, DashRankingItem } from 'src/app/shared/components/dashboard/ranking-list/dash-ranking-list.component';
import { DashSectionHeaderComponent } from 'src/app/shared/components/dashboard/section-header/dash-section-header.component';
import { DashChartCardComponent } from 'src/app/shared/components/dashboard/chart-card/dash-chart-card.component';
import { getDashboardChartOptions, DASHBOARD_CHART_COLORS, buildLineDataset } from 'src/app/shared/utils/dashboard-chart-theme';
import { VentasDesgloseDialogComponent } from 'src/app/shared/components/ventas-desglose-dialog/ventas-desglose-dialog.component';

interface CajaAbierta {
  id: number;
  cajero: string;
  horaApertura: Date | string;
  horasAbierto: string;
  valorAperturaPYG: number;
  valorAperturaUSD: number;
  ventaTotal: number;
  mesasAtendidas: number;
  cantidadVentas: number;
}

interface RangoChip {
  label: string;
  value: 'week' | 'month' | '3months' | '6months';
  selected: boolean;
}

@Component({
  selector: 'app-ventas-dashboard',
  templateUrl: './ventas-dashboard.component.html',
  styleUrls: ['./ventas-dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    MatExpansionModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    NgChartsModule,
    DashStatChipComponent,
    DashQuickActionComponent,
    DashRankingListComponent,
    DashSectionHeaderComponent,
    DashChartCardComponent,
  ],
})
export class VentasDashboardComponent implements OnInit {

  loading = true;

  // --- Quick actions ---
  quickActions = [
    { title: 'Abrir PdV', icon: 'point_of_sale', action: 'pdv', color: '#4caf50' },
    { title: 'Gestionar Mesas', icon: 'table_restaurant', action: 'mesas', color: '#ff9800' },
    { title: 'Comandas', icon: 'receipt_long', action: 'comandas', color: '#00bcd4' },
    { title: 'Configurar PdV', icon: 'tune', action: 'pdv-config', color: '#9c27b0' },
    { title: 'Accesos Rapidos', icon: 'touch_app', action: 'atajo-config', color: '#ff9800' },
    { title: 'Precios Delivery', icon: 'local_shipping', action: 'precios-delivery', color: '#e91e63' },
    { title: 'Listado Ventas', icon: 'list_alt', action: 'ventas-list', color: '#2196f3' },
    { title: 'Caja Mayor', icon: 'account_balance', action: 'caja-mayor', color: '#1b5e20' },
  ];

  // --- KPIs ---
  ventasHoy = 0;
  totalHoyPYG = 0;
  ticketPromedio = 0;
  mesasOcupadas = 0;
  mesasTotal = 0;
  comandasPendientes = 0;

  cajasAbiertas: CajaAbierta[] = [];
  topProductos: DashRankingItem[] = [];
  // Desglose del total de ventas de hoy (por moneda y forma de pago, en Gs).
  desgloseVentasHoy: any = null;
  // true → el total corresponde a las cajas abiertas (no al día calendario);
  // define los labels de las cards y el título del desglose.
  totalBasadoEnCajas = false;
  labelVentas = 'Ventas hoy';
  labelTotal = 'Total hoy';

  // --- Rango ---
  rangosChips: RangoChip[] = [
    { label: 'Esta semana', value: 'week', selected: true },
    { label: 'Este mes', value: 'month', selected: false },
    { label: '3 meses', value: '3months', selected: false },
    { label: '6 meses', value: '6months', selected: false },
  ];
  rangoSeleccionado: 'week' | 'month' | '3months' | '6months' = 'week';

  // --- Chart ---
  chartData: ChartData<'line'> = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'line'>['options'] = getDashboardChartOptions('line');

  constructor(
    private repository: RepositoryService,
    private tabsService: TabsService,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.cargarKpis();
  }

  setData(_data: any): void {}

  async cargarKpis(): Promise<void> {
    this.loading = true;
    try {
      const kpis = await firstValueFrom(this.repository.getDashboardVentasKpis(this.rangoSeleccionado));
      if (kpis) {
        this.ventasHoy = kpis.ventasHoy || 0;
        this.totalHoyPYG = kpis.totalHoyPYG || 0;
        this.desgloseVentasHoy = kpis.desgloseVentasHoy || null;
        this.totalBasadoEnCajas = !!kpis.totalBasadoEnCajas;
        this.labelVentas = this.totalBasadoEnCajas ? 'Ventas en caja' : 'Ventas hoy';
        this.labelTotal = this.totalBasadoEnCajas ? 'Total en caja' : 'Total hoy';
        this.ticketPromedio = kpis.ticketPromedio || 0;
        this.mesasOcupadas = kpis.mesasOcupadas || 0;
        this.mesasTotal = kpis.mesasTotal || 0;
        this.comandasPendientes = kpis.comandasPendientes || 0;
        this.cajasAbiertas = kpis.cajasAbiertas || [];
        this.topProductos = (kpis.topProductos || []).map((p: any) => ({
          nombre: p.nombre,
          valorPrincipal: `${p.cantidad} uds`,
          valorSecundario: `${this.formatPYG(p.total)} Gs`,
          porcentaje: p.porcentaje,
        }));

        const periodo = kpis.ventasPorPeriodo || { labels: [], ventas: [], cantidades: [] };
        this.chartData = {
          labels: periodo.labels || [],
          datasets: [
            buildLineDataset('Ventas (Gs)', periodo.ventas || [], DASHBOARD_CHART_COLORS.primary, DASHBOARD_CHART_COLORS.primarySoft, true),
            buildLineDataset('Cantidad', periodo.cantidades || [], DASHBOARD_CHART_COLORS.cyan, DASHBOARD_CHART_COLORS.cyanSoft, false),
          ],
        };
      }
    } catch (e) {
      console.error('Error cargando KPIs ventas', e);
    } finally {
      this.loading = false;
    }
  }

  selectRango(chip: RangoChip): void {
    this.rangosChips.forEach(c => c.selected = false);
    chip.selected = true;
    this.rangoSeleccionado = chip.value;
    this.cargarKpis();
  }

  formatPYG(v: number): string {
    return (v || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
  }

  /** Abre el desglose del total de ventas por moneda y forma de pago (en Gs). */
  abrirDesgloseVentas(): void {
    if (!this.desgloseVentasHoy) return;
    this.dialog.open(VentasDesgloseDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        titulo: this.totalBasadoEnCajas ? 'Total de ventas en caja' : 'Total de ventas de hoy',
        totalGs: this.desgloseVentasHoy.totalGs || 0,
        porMoneda: this.desgloseVentasHoy.porMoneda || [],
        porFormaPago: this.desgloseVentasHoy.porFormaPago || [],
      },
    });
  }

  navigateTo(action: string): void {
    switch (action) {
      case 'pdv':
        this.tabsService.openTab('Punto de Venta (PDV)', PdvComponent, {}, 'pdv');
        break;
      case 'mesas':
        this.dialog.open(PdvMesaDialogComponent, { width: '80%', height: '80%' });
        break;
      case 'comandas':
        this.dialog.open(ComandaAbmDialogComponent, { width: '70%', height: '70%' });
        break;
      case 'pdv-config':
        this.dialog.open(PdvConfigDialogComponent, { width: '600px' });
        break;
      case 'atajo-config':
        this.dialog.open(AtajoConfigDialogComponent, {
          width: '90vw', maxWidth: '90vw', height: '80vh',
          panelClass: 'atajo-config-dialog-container',
        });
        break;
      case 'precios-delivery':
        this.tabsService.openTab('Precios de Delivery', ListPreciosDeliveryComponent);
        break;
      case 'ventas-list':
        this.tabsService.openTab('Historial de Ventas', ListVentasComponent);
        break;
      case 'caja-mayor':
        this.tabsService.openTab('Caja Mayor', CajaMayorDashboardComponent);
        break;
    }
  }
}
