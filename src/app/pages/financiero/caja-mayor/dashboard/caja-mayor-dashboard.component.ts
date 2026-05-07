import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ChartConfiguration, ChartData } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { TabsService } from 'src/app/services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { abrirShortcut } from 'src/app/shared/utils/dashboard-shortcut-router';
import { ListCajasMayorComponent } from '../list-cajas-mayor/list-cajas-mayor.component';
import { ListGastosComponent } from '../gastos/list-gastos/list-gastos.component';
import { ListGastoCategoriasComponent } from '../gastos/categorias/list-gasto-categorias.component';
import { ListRetirosCajaComponent } from '../retiros/list-retiros-caja/list-retiros-caja.component';
import { ListCuentasBancariasComponent } from '../bancos/list-cuentas-bancarias/list-cuentas-bancarias.component';
import { ListMaquinasPosComponent } from '../pos/list-maquinas-pos/list-maquinas-pos.component';
import { ListAcreditacionesPosComponent } from '../pos/acreditaciones/list-acreditaciones-pos.component';
import { ListCuentasPorPagarComponent } from '../cuentas-por-pagar/list-cuentas-por-pagar/list-cuentas-por-pagar.component';
import { ListEntradasVariasComponent } from '../entradas-varias/list-entradas-varias/list-entradas-varias.component';
import { ListEntradaVariaCategoriasComponent } from '../entradas-varias/categorias/list-entrada-varia-categorias.component';
import { ListOperacionesFinancierasComponent } from '../operaciones-financieras/list-operaciones-financieras/list-operaciones-financieras.component';
import { ListOperacionFinancieraCategoriasComponent } from '../operaciones-financieras/categorias/list-operacion-financiera-categorias.component';
import { ListChequerasComponent } from '../cheques/list-chequeras/list-chequeras.component';
import { ListChequesComponent } from '../cheques/list-cheques/list-cheques.component';
import { CajaMayorDetalleComponent } from '../caja-mayor-detalle/caja-mayor-detalle.component';
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

interface CajaMayorAbiertaItem {
  id: number;
  nombre: string;
  saldoPYG: number;
  fechaApertura: Date | string;
}

type RangoValue = 'today' | 'week' | 'month' | 'last-month';

interface RangoChip {
  label: string;
  value: RangoValue;
  selected: boolean;
}

interface MenuItem {
  title: string;
  icon: string;
  action: string;
  description?: string;
}

@Component({
  selector: 'app-caja-mayor-dashboard',
  templateUrl: './caja-mayor-dashboard.component.html',
  styleUrls: ['./caja-mayor-dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    DashStatChipComponent,
    DashQuickActionComponent,
    DashSectionHeaderComponent,
    DashChartCardComponent,
  ],
})
export class CajaMayorDashboardComponent implements OnInit {
  loading = true;

  quickActions = [
    { title: 'Cajas Mayor', icon: 'account_balance', action: 'cajas-mayor', color: '#1b5e20' },
    { title: 'Gastos', icon: 'receipt_long', action: 'gastos', color: '#e65100' },
    { title: 'Entradas Varias', icon: 'trending_up', action: 'entradas-varias', color: '#2e7d32' },
    { title: 'Retiros', icon: 'move_up', action: 'retiros', color: '#0d47a1' },
    { title: 'Operaciones', icon: 'swap_horiz', action: 'operaciones', color: '#6a1b9a' },
    { title: 'CPP', icon: 'request_quote', action: 'cpp', color: '#bf360c' },
  ];

  // Accordion
  grupoOperaciones: MenuItem[] = [
    { title: 'Cajas Mayor', icon: 'account_balance', action: 'cajas-mayor' },
    { title: 'Gastos', icon: 'receipt_long', action: 'gastos' },
    { title: 'Categorias de Gasto', icon: 'category', action: 'gasto-categorias' },
    { title: 'Retiros de Caja', icon: 'move_up', action: 'retiros' },
    { title: 'Entradas Varias', icon: 'trending_up', action: 'entradas-varias' },
    { title: 'Categorias Entradas', icon: 'category', action: 'entrada-varia-categorias' },
    { title: 'Operaciones Financieras', icon: 'swap_horiz', action: 'operaciones-financieras' },
    { title: 'Categorias Op. Financieras', icon: 'category', action: 'operacion-financiera-categorias' },
  ];
  grupoBancos: MenuItem[] = [
    { title: 'Cuentas Bancarias', icon: 'account_balance_wallet', action: 'cuentas-bancarias' },
    { title: 'Maquinas POS', icon: 'credit_card', action: 'maquinas-pos' },
    { title: 'Acreditaciones POS', icon: 'fact_check', action: 'acreditaciones-pos' },
    { title: 'Chequeras', icon: 'menu_book', action: 'chequeras' },
    { title: 'Cheques', icon: 'request_quote', action: 'cheques' },
  ];
  grupoCpp: MenuItem[] = [
    { title: 'Cuentas por Pagar', icon: 'request_quote', action: 'cuentas-por-pagar' },
  ];

  // KPIs
  saldoPYG = 0;
  saldoUSD = 0;
  saldoBRL = 0;
  cppVencidos = 0;
  cppMontoTotalPYG = 0;
  chequesPorVencer = 0;

  proximosVencimientos: VencimientoItem[] = [];
  cajasMayorAbiertas: CajaMayorAbiertaItem[] = [];
  shortcuts: any[] = [];

  rangosChips: RangoChip[] = [
    { label: 'Hoy', value: 'today', selected: false },
    { label: 'Esta semana', value: 'week', selected: false },
    { label: 'Este mes', value: 'month', selected: true },
    { label: 'Mes anterior', value: 'last-month', selected: false },
  ];
  rangoSeleccionado: RangoValue = 'month';

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
    try {
      const k = await firstValueFrom(this.repositoryService.getDashboardCajaMayorKpis(this.rangoSeleccionado));
      if (k) {
        this.saldoPYG = k.saldoPYG || 0;
        this.saldoUSD = k.saldoUSD || 0;
        this.saldoBRL = k.saldoBRL || 0;
        this.cppVencidos = k.cppVencidos || 0;
        this.cppMontoTotalPYG = k.cppMontoTotalPYG || 0;
        this.chequesPorVencer = k.chequesPorVencer || 0;
        this.proximosVencimientos = k.proximosVencimientos || [];
        this.cajasMayorAbiertas = k.cajasMayorAbiertas || [];

        const mov = k.movimientosPorRango || k.movimientos30d || { labels: [], entradas: [], salidas: [] };
        this.chartData = {
          labels: mov.labels || [],
          datasets: [
            buildLineDataset('Entradas', mov.entradas || [], DASHBOARD_CHART_COLORS.success, DASHBOARD_CHART_COLORS.successSoft, true),
            buildLineDataset('Salidas', mov.salidas || [], DASHBOARD_CHART_COLORS.error, DASHBOARD_CHART_COLORS.errorSoft, true),
          ],
        };
      }
    } catch (e) {
      console.error('Error cargando KPIs caja mayor', e);
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

  abrirCajaMayor(item: CajaMayorAbiertaItem): void {
    this.tabsService.openTab(
      `Caja Mayor: ${item.nombre}`,
      CajaMayorDetalleComponent,
      { cajaMayorIdShortcut: item.id },
    );
  }

  async loadShortcuts(): Promise<void> {
    try {
      const list = await firstValueFrom(this.repositoryService.getDashboardShortcuts('CAJA_MAYOR'));
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
  formatUSD(v: number): string {
    return (v || 0).toLocaleString('es-PY', { maximumFractionDigits: 2 });
  }

  navigateTo(action: string): void {
    switch (action) {
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
      case 'cuentas-bancarias':
        this.tabsService.openTab('Cuentas Bancarias', ListCuentasBancariasComponent);
        break;
      case 'maquinas-pos':
        this.tabsService.openTab('Maquinas POS', ListMaquinasPosComponent);
        break;
      case 'acreditaciones-pos':
        this.tabsService.openTab('Acreditaciones POS', ListAcreditacionesPosComponent);
        break;
      case 'cuentas-por-pagar':
      case 'cpp':
        this.tabsService.openTab('Cuentas por Pagar', ListCuentasPorPagarComponent);
        break;
      case 'entradas-varias':
        this.tabsService.openTab('Entradas Varias', ListEntradasVariasComponent);
        break;
      case 'entrada-varia-categorias':
        this.tabsService.openTab('Categorias de Entradas Varias', ListEntradaVariaCategoriasComponent);
        break;
      case 'operaciones':
      case 'operaciones-financieras':
        this.tabsService.openTab('Operaciones Financieras', ListOperacionesFinancierasComponent);
        break;
      case 'operacion-financiera-categorias':
        this.tabsService.openTab('Categorias de Op. Financieras', ListOperacionFinancieraCategoriasComponent);
        break;
      case 'chequeras':
        this.tabsService.openTab('Chequeras', ListChequerasComponent);
        break;
      case 'cheques':
        this.tabsService.openTab('Cheques', ListChequesComponent);
        break;
    }
  }
}
