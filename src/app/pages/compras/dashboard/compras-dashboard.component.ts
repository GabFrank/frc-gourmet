import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ChartConfiguration, ChartData } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { TabsService } from '../../../services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { ListProveedoresComponent } from '../proveedores/list-proveedores.component';
import { ListCompraCategoriasComponent } from '../categorias/list-compra-categorias.component';
import { ListComprasComponent } from '../list-compras/list-compras.component';
import { CreateEditCompraComponent } from '../create-edit-compra/create-edit-compra.component';
import { ListFacturaImportsComponent } from '../list-factura-imports/list-factura-imports.component';
import { ListCuentasPorPagarComponent } from '../../financiero/caja-mayor/cuentas-por-pagar/list-cuentas-por-pagar/list-cuentas-por-pagar.component';
import { DashStatChipComponent } from 'src/app/shared/components/dashboard/stat-chip/dash-stat-chip.component';
import { DashQuickActionComponent } from 'src/app/shared/components/dashboard/quick-action/dash-quick-action.component';
import { DashRankingListComponent, DashRankingItem } from 'src/app/shared/components/dashboard/ranking-list/dash-ranking-list.component';
import { DashSectionHeaderComponent } from 'src/app/shared/components/dashboard/section-header/dash-section-header.component';
import { DashChartCardComponent } from 'src/app/shared/components/dashboard/chart-card/dash-chart-card.component';
import { getDashboardChartOptions, DASHBOARD_CHART_COLORS, buildLineDataset } from 'src/app/shared/utils/dashboard-chart-theme';

interface VencimientoItem {
  proveedor: string;
  monto: number;
  fechaVencimiento: string;
  diasRestantes: number;
  urgencia: 'vencida' | 'urgente' | 'proxima';
}

type RangoValue = 'today' | 'week' | 'month' | 'last-month' | '3months' | '6months';

interface RangoChip {
  label: string;
  value: RangoValue;
  selected: boolean;
}

@Component({
  selector: 'app-compras-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    DashStatChipComponent,
    DashQuickActionComponent,
    DashRankingListComponent,
    DashSectionHeaderComponent,
    DashChartCardComponent,
  ],
  templateUrl: './compras-dashboard.component.html',
  styleUrls: ['./compras-dashboard.component.scss'],
})
export class ComprasDashboardComponent implements OnInit {
  loading = true;

  quickActions = [
    { title: 'Nueva Compra', icon: 'add_shopping_cart', action: 'nueva-compra', color: '#4caf50' },
    { title: 'Importar Factura', icon: 'auto_awesome', action: 'import-factura', color: '#9c27b0' },
    { title: 'Compras', icon: 'shopping_cart', action: 'compras', color: '#2196f3' },
    { title: 'Proveedores', icon: 'business', action: 'proveedores', color: '#00bcd4' },
    { title: 'Categorias', icon: 'category', action: 'compra-categorias', color: '#5d4037' },
    { title: 'Cuentas por Pagar', icon: 'request_quote', action: 'cpp', color: '#bf360c' },
  ];

  // KPIs (sincronizados con rango)
  comprasPeriodo = 0;
  totalPeriodoPYG = 0;
  cppPorVencer = 0;
  totalCppVencidoPYG = 0;
  topProveedorNombre = '-';

  comprasLabel = 'Compras del mes';
  totalLabel = 'Total comprado';

  topProveedores: DashRankingItem[] = [];
  proximosVencimientos: VencimientoItem[] = [];

  rangosChips: RangoChip[] = [
    { label: 'Hoy', value: 'today', selected: false },
    { label: 'Esta semana', value: 'week', selected: false },
    { label: 'Este mes', value: 'month', selected: true },
    { label: 'Mes anterior', value: 'last-month', selected: false },
    { label: '3 meses', value: '3months', selected: false },
    { label: '6 meses', value: '6months', selected: false },
  ];
  rangoSeleccionado: RangoValue = 'month';

  chartData: ChartData<'line'> = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'line'>['options'] = getDashboardChartOptions('line');

  constructor(
    private tabsService: TabsService,
    private repository: RepositoryService,
  ) {}

  ngOnInit(): void {
    this.cargarKpis();
  }

  setData(_data: any): void {}

  async cargarKpis(): Promise<void> {
    this.loading = true;
    this.updateLabels();
    try {
      const k = await firstValueFrom(this.repository.getDashboardComprasKpis(this.rangoSeleccionado));
      if (k) {
        this.comprasPeriodo = k.comprasPeriodo ?? k.comprasMes ?? 0;
        this.totalPeriodoPYG = k.totalPeriodoPYG ?? k.totalMesPYG ?? 0;
        this.cppPorVencer = k.cppPorVencer || 0;
        this.totalCppVencidoPYG = k.totalCppVencidoPYG || 0;
        this.topProveedorNombre = k.topProveedores?.[0]?.nombre || '-';

        this.topProveedores = (k.topProveedores || []).map((p: any) => ({
          nombre: p.nombre,
          valorPrincipal: `${p.cantidad} compras`,
          valorSecundario: `${this.formatPYG(p.totalCompras)} Gs`,
          porcentaje: p.porcentaje,
        }));

        this.proximosVencimientos = k.proximosVencimientos || [];

        const periodo = k.comprasPorPeriodo || { labels: [], compras: [], cantidades: [] };
        this.chartData = {
          labels: periodo.labels || [],
          datasets: [
            buildLineDataset('Compras (Gs)', periodo.compras || [], DASHBOARD_CHART_COLORS.primary, DASHBOARD_CHART_COLORS.primarySoft, true),
            buildLineDataset('Cantidad', periodo.cantidades || [], DASHBOARD_CHART_COLORS.cyan, DASHBOARD_CHART_COLORS.cyanSoft, false),
          ],
        };
      }
    } catch (e) {
      console.error('Error cargando KPIs compras', e);
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

  private updateLabels(): void {
    switch (this.rangoSeleccionado) {
      case 'today':
        this.comprasLabel = 'Compras hoy';
        this.totalLabel = 'Total hoy';
        break;
      case 'week':
        this.comprasLabel = 'Compras semana';
        this.totalLabel = 'Total semana';
        break;
      case 'month':
        this.comprasLabel = 'Compras del mes';
        this.totalLabel = 'Total del mes';
        break;
      case 'last-month':
        this.comprasLabel = 'Compras mes anterior';
        this.totalLabel = 'Total mes anterior';
        break;
      case '3months':
        this.comprasLabel = 'Compras 3 meses';
        this.totalLabel = 'Total 3 meses';
        break;
      case '6months':
        this.comprasLabel = 'Compras 6 meses';
        this.totalLabel = 'Total 6 meses';
        break;
    }
  }

  formatPYG(v: number): string {
    return (v || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
  }

  navigateTo(action: string): void {
    switch (action) {
      case 'nueva-compra':
        this.tabsService.openTab('Nueva compra', CreateEditCompraComponent, { mode: 'create' }, `nueva-compra-${Date.now()}`, true);
        break;
      case 'import-factura':
        this.tabsService.openTab('Importaciones IA', ListFacturaImportsComponent, { source: 'dashboard' }, 'factura-imports-tab', true);
        break;
      case 'compras':
        this.tabsService.openTab('Compras', ListComprasComponent, { source: 'dashboard' }, 'compras-tab', true);
        break;
      case 'proveedores':
        this.tabsService.openTab('Proveedores', ListProveedoresComponent, { source: 'dashboard' }, 'proveedores-tab', true);
        break;
      case 'compra-categorias':
        this.tabsService.openTab('Categorias de Compra', ListCompraCategoriasComponent);
        break;
      case 'cpp':
        this.tabsService.openTab('Cuentas por Pagar', ListCuentasPorPagarComponent);
        break;
    }
  }
}
