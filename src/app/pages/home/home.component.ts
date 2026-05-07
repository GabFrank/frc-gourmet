import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ChartConfiguration, ChartData } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { TabsService } from 'src/app/services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { CajaMayorDashboardComponent } from 'src/app/pages/financiero/caja-mayor/dashboard/caja-mayor-dashboard.component';
import { PdvComponent } from 'src/app/pages/ventas/pdv/pdv.component';
import { ListNotificacionesRrhhComponent } from 'src/app/pages/rrhh/notificaciones/list-notificaciones-rrhh.component';
import { abrirShortcut } from 'src/app/shared/utils/dashboard-shortcut-router';
import { DashStatChipComponent } from 'src/app/shared/components/dashboard/stat-chip/dash-stat-chip.component';
import { DashQuickActionComponent } from 'src/app/shared/components/dashboard/quick-action/dash-quick-action.component';
import { DashSectionHeaderComponent } from 'src/app/shared/components/dashboard/section-header/dash-section-header.component';
import { DashChartCardComponent } from 'src/app/shared/components/dashboard/chart-card/dash-chart-card.component';
import { getDashboardChartOptions, DASHBOARD_CHART_COLORS, buildLineDataset } from 'src/app/shared/utils/dashboard-chart-theme';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatDividerModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    DashStatChipComponent,
    DashQuickActionComponent,
    DashSectionHeaderComponent,
    DashChartCardComponent,
  ],
})
export class HomeComponent implements OnInit {
  loading = true;

  quickActions = [
    { title: 'Abrir PdV', icon: 'point_of_sale', action: 'pdv', color: '#4caf50' },
    { title: 'Caja Mayor', icon: 'account_balance', action: 'caja-mayor', color: '#1b5e20' },
    { title: 'Notificaciones', icon: 'notifications', action: 'notificaciones', color: '#f44336' },
  ];

  ventasPeriodo = 0;
  totalPeriodoPYG = 0;
  cajasAbiertas = 0;
  cppVencidos = 0;

  // Labels dinámicos según rango
  ventasLabel = 'Ventas hoy';
  totalLabel = 'Total hoy';

  alertas: { tipo: string; titulo: string; detalle: string; color: 'error' | 'warning' | 'info' }[] = [];

  shortcuts: any[] = [];

  // Rango (subset: today / week / month / last-month)
  rangosChips: { label: string; value: 'today' | 'week' | 'month' | 'last-month'; selected: boolean }[] = [
    { label: 'Hoy', value: 'today', selected: false },
    { label: 'Esta semana', value: 'week', selected: true },
    { label: 'Este mes', value: 'month', selected: false },
    { label: 'Mes anterior', value: 'last-month', selected: false },
  ];
  rangoSeleccionado: 'today' | 'week' | 'month' | 'last-month' = 'week';

  chartData: ChartData<'line'> = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'line'>['options'] = getDashboardChartOptions('line');

  constructor(
    private tabsService: TabsService,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.cargarKpis();
    this.loadShortcuts();
  }

  setData(_data: any): void {}

  async cargarKpis(): Promise<void> {
    this.loading = true;
    this.updateLabels();
    try {
      const [ventasKpi, comprasKpi, cmKpi] = await Promise.all([
        firstValueFrom(this.repositoryService.getDashboardVentasKpis(this.rangoSeleccionado)).catch(() => null),
        firstValueFrom(this.repositoryService.getDashboardComprasKpis()).catch(() => null),
        firstValueFrom(this.repositoryService.getDashboardCajaMayorKpis()).catch(() => null),
      ]);

      if (ventasKpi) {
        this.ventasPeriodo = ventasKpi.ventasPeriodo ?? ventasKpi.ventasHoy ?? 0;
        this.totalPeriodoPYG = ventasKpi.totalPeriodoPYG ?? ventasKpi.totalHoyPYG ?? 0;
        this.cajasAbiertas = (ventasKpi.cajasAbiertas || []).length;

        const periodo = ventasKpi.ventasPorPeriodo || { labels: [], ventas: [] };
        this.chartData = {
          labels: periodo.labels || [],
          datasets: [
            buildLineDataset('Ventas (Gs)', periodo.ventas || [], DASHBOARD_CHART_COLORS.primary, DASHBOARD_CHART_COLORS.primarySoft, true),
          ],
        };
      }

      this.cppVencidos = (cmKpi?.cppVencidos) || 0;

      // Compilar alertas
      this.alertas = [];
      if (cmKpi?.cppVencidos > 0) {
        this.alertas.push({
          tipo: 'cpp',
          titulo: `${cmKpi.cppVencidos} cuota(s) de CPP vencidas`,
          detalle: `${this.formatPYG(cmKpi.cppMontoTotalPYG || 0)} Gs adeudados`,
          color: 'error',
        });
      }
      if (cmKpi?.chequesPorVencer > 0) {
        this.alertas.push({
          tipo: 'cheque',
          titulo: `${cmKpi.chequesPorVencer} cheque(s) a vencer`,
          detalle: `Proximos 7 dias`,
          color: 'warning',
        });
      }
      if (comprasKpi?.cppPorVencer > 0) {
        this.alertas.push({
          tipo: 'compras',
          titulo: `${comprasKpi.cppPorVencer} compra(s) por vencer`,
          detalle: `En los proximos 7 dias`,
          color: 'warning',
        });
      }
      if (this.alertas.length === 0) {
        this.alertas.push({
          tipo: 'ok',
          titulo: 'Sin alertas',
          detalle: 'Todo al dia',
          color: 'info',
        });
      }
    } catch (e) {
      console.error('Error cargando KPIs home', e);
    } finally {
      this.loading = false;
    }
  }

  formatPYG(v: number): string {
    return (v || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
  }

  navigateTo(action: string): void {
    switch (action) {
      case 'pdv':
        this.tabsService.openTab('Punto de Venta (PDV)', PdvComponent, {}, 'pdv');
        break;
      case 'caja-mayor':
        this.tabsService.openTab('Caja Mayor', CajaMayorDashboardComponent);
        break;
      case 'notificaciones':
        this.tabsService.openTab('Notificaciones RRHH', ListNotificacionesRrhhComponent);
        break;
    }
  }

  selectRango(chip: { label: string; value: 'today' | 'week' | 'month' | 'last-month'; selected: boolean }): void {
    this.rangosChips.forEach(c => c.selected = false);
    chip.selected = true;
    this.rangoSeleccionado = chip.value;
    this.cargarKpis();
  }

  private updateLabels(): void {
    switch (this.rangoSeleccionado) {
      case 'today':
        this.ventasLabel = 'Ventas hoy';
        this.totalLabel = 'Total hoy';
        break;
      case 'week':
        this.ventasLabel = 'Ventas semana';
        this.totalLabel = 'Total semana';
        break;
      case 'month':
        this.ventasLabel = 'Ventas del mes';
        this.totalLabel = 'Total del mes';
        break;
      case 'last-month':
        this.ventasLabel = 'Ventas mes anterior';
        this.totalLabel = 'Total mes anterior';
        break;
    }
  }

  async loadShortcuts(): Promise<void> {
    try {
      const list = await firstValueFrom(this.repositoryService.getDashboardShortcuts('HOME'));
      this.shortcuts = list || [];
    } catch (e) { console.error(e); }
  }

  abrirShortcut(s: any): void {
    abrirShortcut(s, this.tabsService);
  }

  async eliminarShortcut(s: any, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await firstValueFrom(this.repositoryService.deleteDashboardShortcut(s.id));
      this.snackBar.open('Acceso directo eliminado', 'Cerrar', { duration: 2000 });
      this.loadShortcuts();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al eliminar', 'Cerrar', { duration: 3000 });
    }
  }
}
