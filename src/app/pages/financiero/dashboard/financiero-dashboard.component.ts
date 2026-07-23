import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ChartConfiguration, ChartData } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { TabsService } from 'src/app/services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { abrirShortcut } from 'src/app/shared/utils/dashboard-shortcut-router';
// Config financiera
import { ListCajasComponent } from '../cajas/list-cajas.component';
import { ListDispositivosComponent } from '../dispositivos/list-dispositivos.component';
import { ListMonedasComponent } from '../monedas/list-monedas/list-monedas.component';
import { CreateEditFormaPagoComponent } from '../formas-pago/create-edit-forma-pago.component';
// Operativa Caja Mayor (consolidada en este dashboard)
import { ListCajasMayorComponent } from '../caja-mayor/list-cajas-mayor/list-cajas-mayor.component';
import { ListGastosComponent } from '../caja-mayor/gastos/list-gastos/list-gastos.component';
import { ListGastoCategoriasComponent } from '../caja-mayor/gastos/categorias/list-gasto-categorias.component';
import { ListRetirosCajaComponent } from '../caja-mayor/retiros/list-retiros-caja/list-retiros-caja.component';
import { ListEntradasVariasComponent } from '../caja-mayor/entradas-varias/list-entradas-varias/list-entradas-varias.component';
import { ListEntradaVariaCategoriasComponent } from '../caja-mayor/entradas-varias/categorias/list-entrada-varia-categorias.component';
import { ListOperacionesFinancierasComponent } from '../caja-mayor/operaciones-financieras/list-operaciones-financieras/list-operaciones-financieras.component';
import { ListOperacionFinancieraCategoriasComponent } from '../caja-mayor/operaciones-financieras/categorias/list-operacion-financiera-categorias.component';
import { ListCuentasPorPagarComponent } from '../caja-mayor/cuentas-por-pagar/list-cuentas-por-pagar/list-cuentas-por-pagar.component';
import { ListCuentasPorCobrarComponent } from '../caja-mayor/cuentas-por-cobrar/list-cuentas-por-cobrar/list-cuentas-por-cobrar.component';
// Bancos & POS
import { ListCuentasBancariasComponent } from '../caja-mayor/bancos/list-cuentas-bancarias/list-cuentas-bancarias.component';
import { ListMaquinasPosComponent } from '../caja-mayor/pos/list-maquinas-pos/list-maquinas-pos.component';
import { ListAcreditacionesPosComponent } from '../caja-mayor/pos/acreditaciones/list-acreditaciones-pos.component';
import { ListChequerasComponent } from '../caja-mayor/cheques/list-chequeras/list-chequeras.component';
import { ListChequesComponent } from '../caja-mayor/cheques/list-cheques/list-cheques.component';
// Padrón dashboards
import { DashStatChipComponent } from 'src/app/shared/components/dashboard/stat-chip/dash-stat-chip.component';
import { DashQuickActionComponent } from 'src/app/shared/components/dashboard/quick-action/dash-quick-action.component';
import { DashSectionHeaderComponent } from 'src/app/shared/components/dashboard/section-header/dash-section-header.component';
import { DashChartCardComponent } from 'src/app/shared/components/dashboard/chart-card/dash-chart-card.component';
import { getDashboardChartOptions, DASHBOARD_CHART_COLORS, buildLineDataset } from 'src/app/shared/utils/dashboard-chart-theme';

interface VencimientoItem {
  tipo: 'cpp' | 'cheque';
  descripcion: string;
  monto: number;
  fechaVencimiento: string;
  dias: number;
}

interface MenuItem {
  title: string;
  icon: string;
  action: string;
}

/**
 * Dashboard Financiero — **punto de entrada único** de Finanzas. Consolida lo
 * que antes estaba partido entre "Financiero" (casi solo config) y "Caja Mayor"
 * (toda la operación): saldos, vencimientos, gastos/entradas/operaciones/
 * retiros, CPP/CPC, bancos y config, todo en un solo lugar intuitivo.
 */
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
    MatExpansionModule,
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

  // Acciones operativas primarias (lo más usado del día a día).
  quickActions = [
    { title: 'Gastos', icon: 'receipt_long', action: 'gastos', color: '#e65100' },
    { title: 'Entradas Varias', icon: 'trending_up', action: 'entradas-varias', color: '#2e7d32' },
    { title: 'Operaciones', icon: 'swap_horiz', action: 'operaciones-financieras', color: '#6a1b9a' },
    { title: 'Retiros', icon: 'move_up', action: 'retiros', color: '#0d47a1' },
    { title: 'Cuentas por Pagar', icon: 'request_quote', action: 'cuentas-por-pagar', color: '#bf360c' },
    { title: 'Cuentas por Cobrar', icon: 'paid', action: 'cuentas-por-cobrar', color: '#00695c' },
  ];

  // Accordion "Operativa" — todo lo financiero agrupado (reemplaza al dashboard
  // de Caja Mayor como destino separado).
  grupoOperaciones: MenuItem[] = [
    { title: 'Cajas Mayor', icon: 'account_balance', action: 'cajas-mayor' },
    { title: 'Gastos', icon: 'receipt_long', action: 'gastos' },
    { title: 'Entradas Varias', icon: 'trending_up', action: 'entradas-varias' },
    { title: 'Operaciones Financieras', icon: 'swap_horiz', action: 'operaciones-financieras' },
    { title: 'Retiros de Caja', icon: 'move_up', action: 'retiros' },
  ];
  grupoCuentas: MenuItem[] = [
    { title: 'Cuentas por Pagar', icon: 'request_quote', action: 'cuentas-por-pagar' },
    { title: 'Cuentas por Cobrar', icon: 'paid', action: 'cuentas-por-cobrar' },
  ];
  grupoBancos: MenuItem[] = [
    { title: 'Cuentas Bancarias', icon: 'account_balance_wallet', action: 'cuentas-bancarias' },
    { title: 'Maquinas POS', icon: 'credit_card', action: 'maquinas-pos' },
    { title: 'Acreditaciones POS', icon: 'fact_check', action: 'acreditaciones-pos' },
    { title: 'Chequeras', icon: 'menu_book', action: 'chequeras' },
    { title: 'Cheques', icon: 'request_quote', action: 'cheques' },
  ];
  grupoConfig: MenuItem[] = [
    { title: 'Cajas', icon: 'point_of_sale', action: 'cajas' },
    { title: 'Monedas', icon: 'monetization_on', action: 'monedas' },
    { title: 'Formas de Pago', icon: 'payments', action: 'formas-pago' },
    { title: 'Dispositivos', icon: 'devices', action: 'dispositivos' },
    { title: 'Categorias de Gasto', icon: 'category', action: 'gasto-categorias' },
    { title: 'Categorias Entradas', icon: 'category', action: 'entrada-varia-categorias' },
    { title: 'Categorias Op. Financieras', icon: 'category', action: 'operacion-financiera-categorias' },
  ];

  // KPIs Caja Mayor (saldos + alertas)
  saldoPYG = 0;
  saldoUSD = 0;
  saldoBRL = 0;
  cppVencidos = 0;
  cppMontoTotalPYG = 0;
  chequesPorVencer = 0;
  proximosVencimientos: VencimientoItem[] = [];

  // KPIs de config financiera
  cajasActivas = 0;
  monedasActivas = 0;
  dispositivosPdv = 0;
  cotizacionUSD = 0;
  cotizacionBRL = 0;
  cajasAbiertasResumen: any[] = [];

  shortcuts: any[] = [];

  // Chart de movimientos (Caja Mayor)
  movChartData: ChartData<'line'> = { labels: [], datasets: [] };
  // Chart de cotizaciones (Financiero)
  cotChartData: ChartData<'line'> = { labels: [], datasets: [] };
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
      // Carga en paralelo de ambos padrones de KPI (config + caja mayor).
      const [fin, cm] = await Promise.all([
        firstValueFrom(this.repositoryService.getDashboardFinancieroKpis()),
        firstValueFrom(this.repositoryService.getDashboardCajaMayorKpis()),
      ]);

      if (fin) {
        this.cajasActivas = fin.cajasActivas || 0;
        this.monedasActivas = fin.monedasActivas || 0;
        this.dispositivosPdv = fin.dispositivosPdv || 0;
        this.cotizacionUSD = fin.cotizacionUSD || 0;
        this.cotizacionBRL = fin.cotizacionBRL || 0;
        this.cajasAbiertasResumen = fin.cajasAbiertasResumen || [];

        const hist = fin.cotizacionesHistorico || { labels: [], usd: [], brl: [] };
        this.cotChartData = {
          labels: hist.labels || [],
          datasets: [
            buildLineDataset('USD/PYG', hist.usd || [], DASHBOARD_CHART_COLORS.success, DASHBOARD_CHART_COLORS.successSoft, false),
            buildLineDataset('BRL/PYG', hist.brl || [], DASHBOARD_CHART_COLORS.warning, DASHBOARD_CHART_COLORS.warningSoft, false),
          ],
        };
      }

      if (cm) {
        this.saldoPYG = cm.saldoPYG || 0;
        this.saldoUSD = cm.saldoUSD || 0;
        this.saldoBRL = cm.saldoBRL || 0;
        this.cppVencidos = cm.cppVencidos || 0;
        this.cppMontoTotalPYG = cm.cppMontoTotalPYG || 0;
        this.chequesPorVencer = cm.chequesPorVencer || 0;
        this.proximosVencimientos = cm.proximosVencimientos || [];

        const mov = cm.movimientos30d || { labels: [], entradas: [], salidas: [] };
        this.movChartData = {
          labels: mov.labels || [],
          datasets: [
            buildLineDataset('Entradas', mov.entradas || [], DASHBOARD_CHART_COLORS.success, DASHBOARD_CHART_COLORS.successSoft, true),
            buildLineDataset('Salidas', mov.salidas || [], DASHBOARD_CHART_COLORS.error, DASHBOARD_CHART_COLORS.errorSoft, true),
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

  navigateTo(action: string): void {
    switch (action) {
      // Operativa
      case 'cajas-mayor':
        this.tabsService.openTab('Cajas Mayor', ListCajasMayorComponent);
        break;
      case 'gastos':
        this.tabsService.openTab('Gastos', ListGastosComponent);
        break;
      case 'gasto-categorias':
        this.tabsService.openTab('Categorias de Gasto', ListGastoCategoriasComponent);
        break;
      case 'retiros':
        this.tabsService.openTab('Retiros de Caja', ListRetirosCajaComponent);
        break;
      case 'entradas-varias':
        this.tabsService.openTab('Entradas Varias', ListEntradasVariasComponent);
        break;
      case 'entrada-varia-categorias':
        this.tabsService.openTab('Categorias de Entradas Varias', ListEntradaVariaCategoriasComponent);
        break;
      case 'operaciones-financieras':
        this.tabsService.openTab('Operaciones Financieras', ListOperacionesFinancierasComponent);
        break;
      case 'operacion-financiera-categorias':
        this.tabsService.openTab('Categorias de Op. Financieras', ListOperacionFinancieraCategoriasComponent);
        break;
      // Cuentas
      case 'cuentas-por-pagar':
        this.tabsService.openTab('Cuentas por Pagar', ListCuentasPorPagarComponent);
        break;
      case 'cuentas-por-cobrar':
        this.tabsService.openTab('Cuentas por Cobrar', ListCuentasPorCobrarComponent);
        break;
      // Bancos & POS
      case 'cuentas-bancarias':
        this.tabsService.openTab('Cuentas Bancarias', ListCuentasBancariasComponent);
        break;
      case 'maquinas-pos':
        this.tabsService.openTab('Maquinas POS', ListMaquinasPosComponent);
        break;
      case 'acreditaciones-pos':
        this.tabsService.openTab('Acreditaciones POS', ListAcreditacionesPosComponent);
        break;
      case 'chequeras':
        this.tabsService.openTab('Chequeras', ListChequerasComponent);
        break;
      case 'cheques':
        this.tabsService.openTab('Cheques', ListChequesComponent);
        break;
      // Configuración
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
    }
  }
}
