import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ChartConfiguration, ChartData } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { TabsService } from 'src/app/services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { abrirShortcut } from 'src/app/shared/utils/dashboard-shortcut-router';
import { ListCajasComponent } from '../cajas/list-cajas.component';
import { ListDispositivosComponent } from '../dispositivos/list-dispositivos.component';
import { ListMonedasComponent } from '../monedas/list-monedas/list-monedas.component';
import { CreateEditFormaPagoComponent } from '../formas-pago/create-edit-forma-pago.component';
import { CajaMayorDashboardComponent } from '../caja-mayor/dashboard/caja-mayor-dashboard.component';
import { DashStatChipComponent } from 'src/app/shared/components/dashboard/stat-chip/dash-stat-chip.component';
import { DashQuickActionComponent } from 'src/app/shared/components/dashboard/quick-action/dash-quick-action.component';
import { DashSectionHeaderComponent } from 'src/app/shared/components/dashboard/section-header/dash-section-header.component';
import { DashChartCardComponent } from 'src/app/shared/components/dashboard/chart-card/dash-chart-card.component';
import { getDashboardChartOptions, DASHBOARD_CHART_COLORS, buildLineDataset } from 'src/app/shared/utils/dashboard-chart-theme';

@Component({
  selector: 'app-financiero-dashboard',
  templateUrl: './financiero-dashboard.component.html',
  styleUrls: ['./financiero-dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDividerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    DashStatChipComponent,
    DashQuickActionComponent,
    DashSectionHeaderComponent,
    DashChartCardComponent,
  ],
})
export class FinancieroDashboardComponent implements OnInit {
  loading = true;

  quickActions = [
    { title: 'Cajas', icon: 'point_of_sale', action: 'cajas', color: '#4caf50' },
    { title: 'Monedas', icon: 'monetization_on', action: 'monedas', color: '#2196f3' },
    { title: 'Formas de Pago', icon: 'payments', action: 'formas-pago', color: '#e91e63' },
    { title: 'Dispositivos', icon: 'devices', action: 'dispositivos', color: '#9c27b0' },
    { title: 'Caja Mayor', icon: 'account_balance', action: 'caja-mayor', color: '#1b5e20' },
  ];

  cajasActivas = 0;
  monedasActivas = 0;
  dispositivosPdv = 0;
  cotizacionUSD = 0;
  cotizacionBRL = 0;

  cajasAbiertasResumen: any[] = [];
  shortcuts: any[] = [];

  chartData: ChartData<'line'> = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'line'>['options'] = getDashboardChartOptions('line');

  constructor(
    private tabsService: TabsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private repositoryService: RepositoryService,
  ) {}

  ngOnInit(): void {
    this.cargarKpis();
    this.loadShortcuts();
  }

  setData(_data: any): void {}

  async cargarKpis(): Promise<void> {
    this.loading = true;
    try {
      const k = await firstValueFrom(this.repositoryService.getDashboardFinancieroKpis());
      if (k) {
        this.cajasActivas = k.cajasActivas || 0;
        this.monedasActivas = k.monedasActivas || 0;
        this.dispositivosPdv = k.dispositivosPdv || 0;
        this.cotizacionUSD = k.cotizacionUSD || 0;
        this.cotizacionBRL = k.cotizacionBRL || 0;
        this.cajasAbiertasResumen = k.cajasAbiertasResumen || [];

        const hist = k.cotizacionesHistorico || { labels: [], usd: [], brl: [] };
        this.chartData = {
          labels: hist.labels || [],
          datasets: [
            buildLineDataset('USD/PYG', hist.usd || [], DASHBOARD_CHART_COLORS.success, DASHBOARD_CHART_COLORS.successSoft, false),
            buildLineDataset('BRL/PYG', hist.brl || [], DASHBOARD_CHART_COLORS.warning, DASHBOARD_CHART_COLORS.warningSoft, false),
          ],
        };
      }
    } catch (e) {
      console.error('Error cargando KPIs financiero', e);
    } finally {
      this.loading = false;
    }
  }

  async loadShortcuts(): Promise<void> {
    try {
      const list = await firstValueFrom(this.repositoryService.getDashboardShortcuts('FINANCIERO'));
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

  formatPYG(v: number): string {
    return (v || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
  }

  navigateTo(action: string): void {
    switch (action) {
      case 'cajas':
        this.tabsService.openTab('Cajas', ListCajasComponent);
        break;
      case 'monedas':
        this.tabsService.openTab('Monedas', ListMonedasComponent);
        break;
      case 'dispositivos':
        this.tabsService.openTab('Dispositivos y Puntos de Venta', ListDispositivosComponent);
        break;
      case 'formas-pago':
        this.dialog.open(CreateEditFormaPagoComponent, { width: '800px', disableClose: false });
        break;
      case 'caja-mayor':
        this.tabsService.openTab('Caja Mayor', CajaMayorDashboardComponent);
        break;
    }
  }
}
