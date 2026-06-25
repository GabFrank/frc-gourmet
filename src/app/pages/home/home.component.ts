import { Component, OnDestroy, OnInit } from '@angular/core';
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
import { Subscription, firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';
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
import { OnboardingService, OnboardingStatus } from 'src/app/services/onboarding.service';
import {
  OnboardingActionEvent,
  OnboardingListComponent,
  OnboardingMarkRequest,
} from 'src/app/shared/components/onboarding/onboarding-list.component';
// Componentes de listado usados por el mapper de acciones del onboarding
import { ListUsuariosComponent } from 'src/app/pages/personas/usuarios/list-usuarios.component';
import { ListFuncionariosComponent } from 'src/app/pages/rrhh/funcionarios/list-funcionarios/list-funcionarios.component';
import { ListMonedasComponent } from 'src/app/pages/financiero/monedas/list-monedas/list-monedas.component';
import { ListCuentasBancariasComponent } from 'src/app/pages/financiero/caja-mayor/bancos/list-cuentas-bancarias/list-cuentas-bancarias.component';
import { ListMaquinasPosComponent } from 'src/app/pages/financiero/caja-mayor/pos/list-maquinas-pos/list-maquinas-pos.component';
import { ListProveedoresComponent } from 'src/app/pages/compras/proveedores/list-proveedores.component';
import { ListFamiliasComponent } from 'src/app/pages/productos/familias/list-familias.component';
import { ListProductosComponent } from 'src/app/pages/productos/list-productos/list-productos.component';
import { ListClientesComponent } from 'src/app/pages/personas/clientes/list-clientes.component';
import { PdvConfigDialogComponent } from 'src/app/shared/components/pdv-config-dialog/pdv-config-dialog.component';
import { PdvMesaDialogComponent } from 'src/app/shared/components/pdv-mesa-dialog/pdv-mesa-dialog.component';
import { MatDialog } from '@angular/material/dialog';

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
    OnboardingListComponent,
  ],
})
export class HomeComponent implements OnInit, OnDestroy {
  loading = true;
  onboardingStatus: OnboardingStatus | null = null;
  showOnboarding = false;
  private subs = new Subscription();

  quickActions = [
    { title: 'Abrir PdV', icon: 'point_of_sale', action: 'pdv', color: '#4caf50' },
    { title: 'Caja Mayor', icon: 'account_balance', action: 'caja-mayor', color: '#1b5e20' },
    { title: 'Notificaciones', icon: 'notifications', action: 'notificaciones', color: '#f44336' },
  ];

  ventasHoy = 0;
  totalHoyPYG = 0;
  cajasAbiertas = 0;
  cppVencidos = 0;

  alertas: { tipo: string; titulo: string; detalle: string; color: 'error' | 'warning' | 'info' }[] = [];

  shortcuts: any[] = [];

  // Acceso a la PWA mobile (solo cuando la app corre en mode=server).
  pwaAccess: { available: boolean; url?: string; urls?: string[]; qr?: string } | null = null;

  // Acceso remoto por internet (Cloudflare quick tunnel).
  remoteRunning = false;
  remoteBusy = false;
  remoteUrl: string | null = null;
  remoteQr: string | null = null;

  chartData: ChartData<'line'> = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'line'>['options'] = getDashboardChartOptions('line');

  constructor(
    private tabsService: TabsService,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private onboardingService: OnboardingService,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.cargarKpis();
    this.loadShortcuts();
    this.cargarPwaAccess();
    this.subs.add(
      this.onboardingService.status$.subscribe((status) => {
        this.onboardingStatus = status;
        this.showOnboarding = !!status && !status.allCompleted;
      }),
    );
    this.onboardingService.refresh().subscribe();

    // Refrescar onboarding cada vez que el usuario vuelve al tab Home
    this.subs.add(
      this.tabsService.activeTab$
        .pipe(filter((id) => id === 'home-tab'))
        .subscribe(() => this.onboardingService.refresh().subscribe()),
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  setData(_data: any): void {}

  async cargarKpis(): Promise<void> {
    this.loading = true;
    try {
      const [ventasKpi, comprasKpi, cmKpi] = await Promise.all([
        firstValueFrom(this.repositoryService.getDashboardVentasKpis('week')).catch(() => null),
        firstValueFrom(this.repositoryService.getDashboardComprasKpis()).catch(() => null),
        firstValueFrom(this.repositoryService.getDashboardCajaMayorKpis()).catch(() => null),
      ]);

      if (ventasKpi) {
        this.ventasHoy = ventasKpi.ventasHoy || 0;
        this.totalHoyPYG = ventasKpi.totalHoyPYG || 0;
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

  async loadShortcuts(): Promise<void> {
    try {
      const list = await firstValueFrom(this.repositoryService.getDashboardShortcuts('HOME'));
      this.shortcuts = list || [];
    } catch (e) { console.error(e); }
  }

  abrirShortcut(s: any): void {
    abrirShortcut(s, this.tabsService);
  }

  /** Carga la URL + QR de acceso a la PWA mobile (si la app está en modo Servidor). */
  private async cargarPwaAccess(): Promise<void> {
    try {
      const api = (window as any).api;
      if (api?.callIpc) {
        const res = await api.callIpc('get-pwa-access');
        this.pwaAccess = res?.available ? res : null;
        // Restaurar estado del túnel remoto (por si ya estaba activo).
        const st = await api.callIpc('remote-tunnel-status');
        this.remoteRunning = !!st?.running;
        this.remoteUrl = st?.url || null;
        this.remoteQr = st?.qr || null;
      }
    } catch {
      this.pwaAccess = null;
    }
  }

  /** Activa/desactiva el acceso remoto por internet (Cloudflare quick tunnel). */
  async toggleRemoto(): Promise<void> {
    const api = (window as any).api;
    if (!api?.callIpc || this.remoteBusy) return;
    this.remoteBusy = true;
    try {
      if (this.remoteRunning) {
        await api.callIpc('remote-tunnel-stop');
        this.remoteRunning = false;
        this.remoteUrl = null;
        this.remoteQr = null;
      } else {
        this.snackBar.open('Activando acceso remoto (puede tardar)…', undefined, { duration: 2500 });
        const res = await api.callIpc('remote-tunnel-start');
        if (res?.ok) {
          this.remoteRunning = true;
          this.remoteUrl = res.url;
          this.remoteQr = res.qr;
        } else {
          this.snackBar.open(res?.error || 'No se pudo activar el acceso remoto', 'Cerrar', { duration: 5000 });
        }
      }
    } catch (e) {
      this.snackBar.open('Error en el acceso remoto', 'Cerrar', { duration: 4000 });
    } finally {
      this.remoteBusy = false;
    }
  }

  copiarUrlRemota(): void {
    if (!this.remoteUrl) return;
    navigator.clipboard?.writeText(this.remoteUrl).then(
      () => this.snackBar.open('URL copiada', 'OK', { duration: 1500 }),
      () => {},
    );
  }

  copiarUrlPwa(): void {
    if (!this.pwaAccess?.url) return;
    navigator.clipboard?.writeText(this.pwaAccess.url).then(
      () => this.snackBar.open('URL copiada', 'OK', { duration: 1500 }),
      () => {},
    );
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

  /** Abre la pantalla asociada a un actionTabKey de onboarding. */
  dispatchOnboardingAction(event: OnboardingActionEvent): void {
    switch (event.actionTabKey) {
      case 'USUARIOS':
        this.tabsService.openTab('Usuarios', ListUsuariosComponent, {}, 'usuarios-tab');
        break;
      case 'FUNCIONARIOS':
        this.tabsService.openTab('Funcionarios', ListFuncionariosComponent, {}, 'funcionarios-tab');
        break;
      case 'MONEDAS':
        this.tabsService.openTab('Monedas', ListMonedasComponent, {}, 'monedas-tab');
        break;
      case 'CUENTAS_BANCARIAS':
        this.tabsService.openTab('Cuentas bancarias', ListCuentasBancariasComponent, {}, 'cuentas-bancarias-tab');
        break;
      case 'MAQUINAS_POS':
        this.tabsService.openTab('Máquinas POS', ListMaquinasPosComponent, {}, 'maquinas-pos-tab');
        break;
      case 'PROVEEDORES':
        this.tabsService.openTab('Proveedores', ListProveedoresComponent, {}, 'proveedores-tab');
        break;
      case 'FAMILIAS':
        this.tabsService.openTab('Familias', ListFamiliasComponent, {}, 'familias-tab');
        break;
      case 'PRODUCTOS':
        this.tabsService.openTab('Productos', ListProductosComponent, {}, 'productos-tab');
        break;
      case 'PDV_CONFIG':
        this.dialog
          .open(PdvConfigDialogComponent, { width: '760px', maxWidth: '95vw' })
          .afterClosed()
          .subscribe(() => this.onboardingService.refresh().subscribe());
        break;
      case 'PDV_MESAS':
        this.dialog
          .open(PdvMesaDialogComponent, { width: '900px', maxWidth: '95vw' })
          .afterClosed()
          .subscribe(() => this.onboardingService.refresh().subscribe());
        break;
      case 'CLIENTES':
        this.tabsService.openTab('Clientes', ListClientesComponent, {}, 'clientes-tab');
        break;
      case 'HOME':
        this.snackBar.open(
          'Para crear tu primer acceso directo, navegá a cualquier dashboard (Caja Mayor, Ventas, etc.) y usá el botón "Guardar como acceso directo".',
          'OK',
          { duration: 6000 },
        );
        break;
    }
  }

  /** Maneja "marcar como completa / no aplica / resetear" desde el menú de cada tarea. */
  async onOnboardingMarkRequest(req: OnboardingMarkRequest): Promise<void> {
    try {
      await firstValueFrom(this.onboardingService.markTask(req.taskKey, req.action));
      await firstValueFrom(this.onboardingService.refresh());
      const msg =
        req.action === 'MANUAL'
          ? 'Tarea marcada como completa'
          : req.action === 'SKIPPED'
          ? 'Tarea marcada como no aplica'
          : 'Tarea reseteada';
      this.snackBar.open(msg, 'OK', { duration: 2500 });
      // Si tras este cambio se completó todo, refrescamos shortcuts para mostrarlos
      if (this.onboardingStatus?.allCompleted) {
        this.loadShortcuts();
      }
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error actualizando la tarea', 'Cerrar', { duration: 3000 });
    }
  }
}
