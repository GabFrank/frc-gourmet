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
import { TabsService } from 'src/app/services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { firstValueFrom } from 'rxjs';

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
  ],
})
export class RrhhDashboardComponent implements OnInit {
  cargando = false;

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
  top5Vendedores: any[] = [];

  columnsVendedores = ['nombre', 'totalVendido', 'cantVentas'];

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
    this.cargando = true;
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
        this.top5Vendedores = kpis.top5Vendedores || [];
      }
    } catch (e) {
      this.snack.open('Error al cargar datos del dashboard', 'Cerrar', { duration: 3000 });
    } finally {
      this.cargando = false;
    }
  }

  onPeriodoCambiado(): void {
    this.cargarKpis();
  }

  abrirLiquidaciones(): void {
    import('src/app/pages/rrhh/liquidaciones-sueldo/list/list-liquidaciones-sueldo.component').then(m => {
      this.tabs.openTab('Liquidaciones', m.ListLiquidacionesSueldoComponent, {});
    });
  }

  abrirNotificaciones(): void {
    import('src/app/pages/rrhh/notificaciones/list-notificaciones-rrhh.component').then(m => {
      this.tabs.openTab('Notificaciones RRHH', m.ListNotificacionesRrhhComponent, {});
    });
  }
}
