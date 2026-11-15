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
import { Rango, RangoChip, RANGO_LABEL, buildRangoChips } from 'src/app/shared/utils/dashboard-rangos.util';

interface VencimientoItem {
  proveedor: string;
  monto: number;
  fechaVencimiento: string;
  diasRestantes: number;
  urgencia: 'vencida' | 'urgente' | 'proxima';
  /** Precomputado: el template no llama funciones. */
  montoTexto: string;
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

  // --- Rango ---
  rangoSeleccionado: Rango = 'month';
  rangosChips: RangoChip[] = buildRangoChips(['week', 'month', 'last-month', '3months', '6months'], 'month');

  // KPIs
  comprasMes = 0;
  totalMesPYG = 0;
  cppPorVencer = 0;
  totalCppVencidoPYG = 0;
  topProveedorNombre = '-';

  // Precomputados para el template (nada de funciones ni getters en el HTML).
  labelCompras = `Compras · ${RANGO_LABEL['month']}`;
  labelTotal = `Total comprado · ${RANGO_LABEL['month']}`;
  chartTitle = `Compras · ${RANGO_LABEL['month']}`;
  tituloTopProveedores = `Top proveedores · ${RANGO_LABEL['month']}`;
  vacioTopProveedores = 'Sin compras en el periodo';
  totalMesTexto = '0 Gs';
  totalCppVencidoTexto = '0 Gs';

  topProveedores: DashRankingItem[] = [];
  proximosVencimientos: VencimientoItem[] = [];

  chartData: ChartData<'line'> = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'line'>['options'] = getDashboardChartOptions('line');

  // --- Compras por clase (PLAN-clasificacion-items-compras) ---
  mesClase = new Date().toISOString().slice(0, 7); // AAAA-MM
  cargandoClases = false;
  errorClases = '';
  /** Precomputado por moneda: filas destino → clase → monto. */
  reporteClases: {
    moneda: string;
    totalTexto: string;
    diferenciaTexto: string;
    filas: { destino: string; clase: string; montoTexto: string; porcentaje: number; inactiva: boolean }[];
  }[] = [];
  borradoresTexto = '';
  private monedas: any[] = [];

  constructor(
    private tabsService: TabsService,
    private repository: RepositoryService,
  ) {}

  ngOnInit(): void {
    this.cargarKpis();
    this.cargarReporteClases();
  }

  onMesClase(valor: string): void {
    if (!/^\d{4}-\d{2}$/.test(valor || '')) return;
    this.mesClase = valor;
    this.cargarReporteClases();
  }

  async cargarReporteClases(): Promise<void> {
    this.cargandoClases = true;
    this.errorClases = '';
    try {
      if (!this.monedas.length) this.monedas = (await firstValueFrom(this.repository.getMonedas())) as any[] || [];
      const [a, m] = this.mesClase.split('-').map(Number);
      const ultimo = new Date(a, m, 0).getDate();
      const r: any = await firstValueFrom(this.repository.getReporteComprasPorClase({
        desde: `${this.mesClase}-01`, hasta: `${this.mesClase}-${String(ultimo).padStart(2, '0')}`,
      }));
      const destinoLabel: Record<string, string> = {
        CMV: 'CMV', REVENTA: 'Reventa', GASTO_OPERATIVO: 'Gasto operativo',
        SIN_CLASIFICAR: 'Sin clasificar', SIN_DETALLE: 'Sin detalle',
      };
      const simbolo = (id: number | null) => this.monedas.find((x) => x.id === id)?.simbolo || '';
      const fmt = (v: number, id: number | null) => `${(v || 0).toLocaleString('es-PY', { maximumFractionDigits: 2 })} ${simbolo(id)}`;
      this.reporteClases = (r?.porMoneda || []).map((pm: any) => ({
        moneda: simbolo(pm.monedaId),
        totalTexto: fmt(pm.totalCompras, pm.monedaId),
        diferenciaTexto: pm.diferencia ? fmt(pm.diferencia, pm.monedaId) : '',
        filas: (r.filas || []).filter((f: any) => f.monedaId === pm.monedaId).map((f: any) => ({
          destino: destinoLabel[f.destino] || f.destino,
          clase: f.clase,
          montoTexto: fmt(f.monto, f.monedaId),
          porcentaje: pm.totalCompras ? Math.round((f.monto / pm.totalCompras) * 1000) / 10 : 0,
          inactiva: !f.claseActiva,
        })),
      }));
      const b = (r?.borradores || []).reduce((s: number, x: any) => s + x.cantidad, 0);
      this.borradoresTexto = b ? `${b} compra(s) en borrador no entran en el reporte.` : '';
    } catch (e: any) {
      this.errorClases = e?.message || 'No se pudo cargar el reporte.';
      this.reporteClases = [];
    } finally {
      this.cargandoClases = false;
    }
  }

  setData(_data: any): void {}

  async cargarKpis(): Promise<void> {
    this.loading = true;
    try {
      const k = await firstValueFrom(this.repository.getDashboardComprasKpis(this.rangoSeleccionado));
      if (k) {
        this.comprasMes = k.comprasMes || 0;
        this.totalMesPYG = k.totalMesPYG || 0;
        this.cppPorVencer = k.cppPorVencer || 0;
        this.totalCppVencidoPYG = k.totalCppVencidoPYG || 0;
        this.topProveedorNombre = k.topProveedores?.[0]?.nombre || '-';
        this.totalMesTexto = `${this.formatPYG(this.totalMesPYG)} Gs`;
        this.totalCppVencidoTexto = `${this.formatPYG(this.totalCppVencidoPYG)} Gs`;

        this.topProveedores = (k.topProveedores || []).map((p: any) => ({
          nombre: p.nombre,
          valorPrincipal: `${p.cantidad} compras`,
          valorSecundario: `${this.formatPYG(p.totalCompras)} Gs`,
          porcentaje: p.porcentaje,
        }));

        this.proximosVencimientos = (k.proximosVencimientos || []).map((v: any) => ({
          ...v,
          montoTexto: `${this.formatPYG(v.monto)} Gs`,
        }));

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
    if (chip.selected) return;
    this.rangosChips.forEach(c => c.selected = false);
    chip.selected = true;
    this.rangoSeleccionado = chip.value;
    const label = RANGO_LABEL[chip.value];
    this.labelCompras = `Compras · ${label}`;
    this.labelTotal = `Total comprado · ${label}`;
    this.chartTitle = `Compras · ${label}`;
    this.tituloTopProveedores = `Top proveedores · ${label}`;
    this.cargarKpis();
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
