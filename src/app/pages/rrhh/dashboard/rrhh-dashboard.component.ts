import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { firstValueFrom } from 'rxjs';
import { TabsService } from 'src/app/services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { DashStatChipComponent } from 'src/app/shared/components/dashboard/stat-chip/dash-stat-chip.component';
import { DashQuickActionComponent } from 'src/app/shared/components/dashboard/quick-action/dash-quick-action.component';
import { DashRankingListComponent, DashRankingItem } from 'src/app/shared/components/dashboard/ranking-list/dash-ranking-list.component';
import { DashSectionHeaderComponent } from 'src/app/shared/components/dashboard/section-header/dash-section-header.component';

@Component({
  selector: 'app-rrhh-dashboard',
  standalone: true,
  templateUrl: './rrhh-dashboard.component.html',
  styleUrls: ['./rrhh-dashboard.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSnackBarModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTableModule,
    MatTooltipModule,
    MatChipsModule,
    DashStatChipComponent,
    DashQuickActionComponent,
    DashRankingListComponent,
    DashSectionHeaderComponent,
  ],
})
export class RrhhDashboardComponent implements OnInit {
  loading = false;

  quickActions = [
    { title: 'Funcionarios', icon: 'people', action: 'funcionarios', color: '#2196f3' },
    { title: 'Liquidaciones', icon: 'request_quote', action: 'liquidaciones', color: '#4caf50' },
    { title: 'Reportes', icon: 'bar_chart', action: 'reportes', color: '#9c27b0' },
    { title: 'Notificaciones', icon: 'notifications', action: 'notificaciones', color: '#f44336' },
  ];

  // Selector de periodo
  periodoSeleccionado = '';
  periodosDisponibles: string[] = [];

  // KPIs
  totalNominaMes = 0;
  totalFuncionariosActivos = 0;
  porcentajeAsistenciaMes = 0;
  valesPendientes = 0;
  prestamosActivos = 0;
  liquidacionesPendientesAprobacion = 0;
  liquidacionesPendientesPago = 0;

  proximosCumpleanios: any[] = [];
  vacacionesProximas: any[] = [];
  top5Vendedores: DashRankingItem[] = [];

  proximosEventos: { tipo: 'cumple' | 'vacacion'; nombre: string; detalle: string; icon: string; color: 'warning' | 'info' }[] = [];

  constructor(
    private repo: RepositoryService,
    private tabs: TabsService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.initPeriodos();
    this.cargarKpis();
  }

  setData(_data: any): void {}

  private initPeriodos(): void {
    const hoy = new Date();
    const periodos: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const p = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      periodos.push(p);
    }
    this.periodosDisponibles = periodos;
    this.periodoSeleccionado = periodos[0];
  }

  async cargarKpis(): Promise<void> {
    this.loading = true;
    try {
      const kpis = await firstValueFrom(this.repo.getDashboardRrhhKpis(this.periodoSeleccionado));
      if (kpis) {
        this.totalNominaMes = kpis.totalNominaMes || 0;
        this.totalFuncionariosActivos = kpis.totalFuncionariosActivos || 0;
        this.porcentajeAsistenciaMes = kpis.porcentajeAsistenciaMes || 0;
        this.valesPendientes = kpis.valesPendientes || 0;
        this.prestamosActivos = kpis.prestamosActivos || 0;
        this.liquidacionesPendientesAprobacion = kpis.liquidacionesPendientesAprobacion || 0;
        this.liquidacionesPendientesPago = kpis.liquidacionesPendientesPago || 0;
        this.proximosCumpleanios = kpis.proximosCumpleanios || [];
        this.vacacionesProximas = kpis.vacacionesProximas || [];

        const top = kpis.top5Vendedores || [];
        const maxTotal = top.reduce((m: number, v: any) => Math.max(m, Number(v.totalVendido || 0)), 0);
        this.top5Vendedores = top.map((v: any) => ({
          nombre: String(v.nombre || '').toUpperCase(),
          valorPrincipal: `${v.cantVentas || 0} ventas`,
          valorSecundario: `${this.formatPYG(v.totalVendido || 0)} Gs`,
          porcentaje: maxTotal > 0 ? Math.round((Number(v.totalVendido || 0) / maxTotal) * 100) : 0,
        }));

        // Compilar proximos eventos
        const eventos: any[] = [];
        for (const c of this.proximosCumpleanios) {
          eventos.push({
            tipo: 'cumple',
            nombre: c.nombre,
            detalle: `${c.fechaCumpleanios} (${c.diasRestantes} dia/s)`,
            icon: 'cake',
            color: 'warning',
          });
        }
        for (const v of this.vacacionesProximas) {
          eventos.push({
            tipo: 'vacacion',
            nombre: v.nombre,
            detalle: `${v.fechaDesde} - ${v.fechaHasta}`,
            icon: 'beach_access',
            color: 'info',
          });
        }
        this.proximosEventos = eventos;
      }
    } catch (e) {
      console.error(e);
      this.snack.open('Error al cargar datos del dashboard', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  onPeriodoCambiado(): void {
    this.cargarKpis();
  }

  formatPYG(v: number): string {
    return (v || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
  }

  navigateTo(action: string): void {
    switch (action) {
      case 'funcionarios':
        import('src/app/pages/rrhh/funcionarios/list-funcionarios/list-funcionarios.component').then(m => {
          this.tabs.openTab('Funcionarios', m.ListFuncionariosComponent);
        });
        break;
      case 'liquidaciones':
        import('src/app/pages/rrhh/liquidaciones-sueldo/list/list-liquidaciones-sueldo.component').then(m => {
          this.tabs.openTab('Liquidaciones', m.ListLiquidacionesSueldoComponent);
        });
        break;
      case 'reportes':
        import('src/app/pages/rrhh/reportes/reportes-rrhh-page.component').then(m => {
          this.tabs.openTab('Reportes RRHH', m.ReportesRrhhPageComponent);
        });
        break;
      case 'notificaciones':
        import('src/app/pages/rrhh/notificaciones/list-notificaciones-rrhh.component').then(m => {
          this.tabs.openTab('Notificaciones RRHH', m.ListNotificacionesRrhhComponent);
        });
        break;
    }
  }
}
