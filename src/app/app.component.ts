import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  NgZone,
  OnDestroy,
  Renderer2,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { Observable, Subscription, fromEvent } from 'rxjs';
import { map, shareReplay, debounceTime, delay } from 'rxjs/operators';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatExpansionModule } from '@angular/material/expansion';
import { ThemeService } from './services/theme.service';
import { MatDialog } from '@angular/material/dialog';
import { PrinterSettingsComponent } from './components/printer-settings/printer-settings.component';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TabsService } from './services/tabs.service';
import { TabContainerComponent } from './components/tab-container/tab-container.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { HomeComponent } from './pages/home/home.component';
import { RrhhDashComponent } from './pages/personas/rrhhDash/rrhh-dash.component';
import { ListUsuariosComponent } from './pages/personas/usuarios/list-usuarios.component';
import { ListClientesComponent } from './pages/personas/clientes/list-clientes.component';
import { AuthService } from './services/auth.service';
import { Usuario } from './database/entities/personas/usuario.entity';
import { LoginSession } from './database/entities/auth/login-session.entity';
import { firstValueFrom } from 'rxjs';
import { ListPersonasComponent } from './pages/personas/personas/list-personas.component';
import { ListMonedasComponent } from './pages/financiero/monedas/list-monedas/list-monedas.component';
import { ListDispositivosComponent } from './pages/financiero/dispositivos/list-dispositivos.component';
import { ListCajasComponent } from './pages/financiero/cajas/list-cajas.component';
import { FinancieroDashboardComponent } from './pages/financiero/dashboard/financiero-dashboard.component';
import { ComprasDashboardComponent } from './pages/compras/dashboard/compras-dashboard.component';
import { ListComprasComponent } from './pages/compras/list-compras/list-compras.component';
import { ListFacturaImportsComponent } from './pages/compras/list-factura-imports/list-factura-imports.component';
import { ProductosDashboardComponent } from './pages/productos/dashboard/productos-dashboard.component';
import { ListRecetasComponent } from './pages/gestion-recetas/list-recetas/list-recetas.component';
import { ListAdicionalesComponent } from './pages/gestion-recetas/list-adicionales/list-adicionales.component';
import { ListProductosComponent } from './pages/productos/list-productos/list-productos.component';
import { ListSaboresComponent } from './pages/gestion-sabores/list-sabores/list-sabores.component';
import { VentasDashboardComponent } from './pages/ventas/dashboard/ventas-dashboard.component';
import { CajaMayorDashboardComponent } from './pages/financiero/caja-mayor/dashboard/caja-mayor-dashboard.component';
import { ListCuentasPorCobrarComponent } from './pages/financiero/caja-mayor/cuentas-por-cobrar/list-cuentas-por-cobrar/list-cuentas-por-cobrar.component';
import { ListPermisosComponent } from './pages/personalizacion/permisos/list-permisos/list-permisos.component';
import { ListConfiguracionRrhhComponent } from './pages/rrhh/configuracion/list-configuracion-rrhh/list-configuracion-rrhh.component';
import { BackupRestoreComponent } from './pages/configuracion/backup-restore/backup-restore.component';
import { IaConfigComponent } from './pages/configuracion/ia-config/ia-config.component';
import { ListCargosComponent } from './pages/rrhh/cargos/list-cargos.component';
import { ListFuncionariosComponent } from './pages/rrhh/funcionarios/list-funcionarios/list-funcionarios.component';
import { ListTurnosComponent } from './pages/rrhh/turnos/list-turnos.component';
import { ListAsistenciasComponent } from './pages/rrhh/asistencias/list-asistencias.component';
import { ListPenalizacionesComponent } from './pages/rrhh/penalizaciones/list-penalizaciones.component';
import { ListFeriadosComponent } from './pages/rrhh/feriados/list-feriados.component';
import { ListHorasExtraComponent } from './pages/rrhh/horas-extra/list-horas-extra.component';
import { ListValesComponent } from './pages/rrhh/vales/list-vales.component';
import { ListMotivosValeComponent } from './pages/rrhh/motivos-vale/list-motivos-vale.component';
import { ListPrestamosFuncionariosComponent } from './pages/rrhh/prestamos-funcionarios/list-prestamos-funcionarios.component';
import { ListLiquidacionesSueldoComponent } from './pages/rrhh/liquidaciones-sueldo/list/list-liquidaciones-sueldo.component';
import { ListBonosComponent } from './pages/rrhh/bonos/list-bonos.component';
import { ListAguinaldosComponent } from './pages/rrhh/aguinaldos/list-aguinaldos.component';
// Comisiones (Fase 6)
import { ListReglasComisionComponent } from './pages/comisiones/reglas/list-reglas-comision/list-reglas-comision.component';
import { ListEquiposComisionComponent } from './pages/comisiones/equipos/list-equipos-comision/list-equipos-comision.component';
import { ListLiquidacionesComisionComponent } from './pages/comisiones/liquidaciones/list-liquidaciones-comision/list-liquidaciones-comision.component';
// RRHH Fase 8 - Dashboard, Notificaciones, Reportes
import { RrhhDashboardComponent } from './pages/rrhh/dashboard/rrhh-dashboard.component';
import { ListNotificacionesRrhhComponent } from './pages/rrhh/notificaciones/list-notificaciones-rrhh.component';
import { ReportesRrhhPageComponent } from './pages/rrhh/reportes/reportes-rrhh-page.component';
import { RepositoryService } from './database/repository.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatBadgeModule,
    MatMenuModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatExpansionModule,
    MatDialogModule,
    MatTooltipModule,
    MatSnackBarModule,
    TabContainerComponent,
  ],
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  title = 'FRC Gourmet';
  isDarkTheme = false;
  useTabNavigation = true;
  isMenuExpanded = false;
  // Track which menu section is expanded
  expandedMenu: string | null = null;
  firsTime = true;

  // Authentication state
  isAuthenticated = false;
  currentUser: Usuario | null = null;
  lastLoginTime: Date | null = null;

  // Notificaciones RRHH badge
  notificacionesNoLeidas = 0;
  private notifInterval: any;

  @ViewChild('drawer') sidenav!: MatSidenav;

  isHandset$: Observable<boolean> = this.breakpointObserver
    .observe(Breakpoints.Handset)
    .pipe(
      map((result) => result.matches),
      shareReplay()
    );

  constructor(
    private breakpointObserver: BreakpointObserver,
    private themeService: ThemeService,
    private dialog: MatDialog,
    private tabsService: TabsService,
    private ngZone: NgZone,
    private renderer: Renderer2,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar,
    private repo: RepositoryService,
  ) {
    // Subscribe to authentication state changes
    this.authService.currentUser$.subscribe((user) => {
      this.isAuthenticated = !!user;
      this.currentUser = user;

      // If user is logged in, fetch login history
      if (this.isAuthenticated && user?.id) {
        this.fetchLastLoginTime(user.id);
      }

      // If user is logged out, navigate to login page
      if (!this.isAuthenticated) {
        this.router.navigate(['/login']);
      } else if (this.router.url === '/login') {
        // If user is logged in and on login page, navigate to home
        this.router.navigate(['/']);
      }
    });
  }

  async fetchLastLoginTime(usuarioId: number): Promise<void> {
    try {
      const loginSessions = await firstValueFrom(
        this.authService.getLoginSessions(usuarioId)
      );

      // Sort sessions by login time in descending order
      const sortedSessions = loginSessions.sort(
        (a, b) =>
          new Date(b.login_time).getTime() - new Date(a.login_time).getTime()
      );

      // Get previous login session (not the current one)
      if (sortedSessions && sortedSessions.length > 1) {
        // The first session is the current one, so take the second one
        this.lastLoginTime = new Date(sortedSessions[1].login_time);
      }
    } catch (error) {
      console.error('Error fetching login sessions:', error);
    }
  }

  ngOnInit() {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('darkTheme');
    if (savedTheme) {
      this.isDarkTheme = savedTheme === 'true';
      this.applyTheme();
    } else {
      // Default to light theme if no preference saved
      this.isDarkTheme = false;
      this.applyTheme();
    }

    // Check authentication status
    this.isAuthenticated = this.authService.isLoggedIn;
    this.currentUser = this.authService.currentUser;

    // If authenticated, initialize tabs
    if (this.isAuthenticated) {
      // If we have a current user, fetch login history
      if (this.currentUser?.id) {
        this.fetchLastLoginTime(this.currentUser.id);
      }

      // Add a default home tab when the app starts
      // this.openProductosTab();

      // Initialize sidenav listeners after view is initialized
      setTimeout(() => this.setupSidenavListeners(), 0);

      // Start session activity tracker
      this.startSessionActivityTracker();

      // Cargar badge notificaciones RRHH
      this.cargarNotificacionesNoLeidas();
      this.notifInterval = setInterval(() => this.cargarNotificacionesNoLeidas(), 5 * 60 * 1000);
    }
  }

  ngAfterViewInit(): void {
    // Initialize sidenav in collapsed state
    this.isMenuExpanded = false;
    this.expandedMenu = null;
  }

  ngOnDestroy() {
    if (this.notifInterval) {
      clearInterval(this.notifInterval);
    }
  }

  cargarNotificacionesNoLeidas(): void {
    this.repo.countNotificacionesNoLeidas().subscribe({
      next: (result: any) => {
        this.notificacionesNoLeidas = result?.count ?? 0;
      },
      error: () => { /* ignore */ },
    });
  }

  // Start tracking session activity to keep the session alive
  private startSessionActivityTracker(): void {
    // Update session activity every 5 minutes
    const interval = 5 * 60 * 1000; // 5 minutes in milliseconds
    setInterval(() => {
      if (this.isAuthenticated) {
        this.authService.updateLastActivity();
      }
    }, interval);
  }

  // Logout the user
  async logout(): Promise<void> {
    // Close all tabs first
    this.tabsService.removeAllTabs();

    await this.authService.logout();
    // Router navigation is handled in the authService
  }

  // Listen for clicks on the document
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Only process when menu is expanded
    if (this.isMenuExpanded && this.sidenav) {
      const sidenavElement = document.querySelector('mat-sidenav');
      const toggleButton = document.querySelector('button[aria-label="Toggle sidenav"]');

      if (sidenavElement && toggleButton) {
        // Check if click was outside the sidenav and not on the toggle button
        if (!sidenavElement.contains(event.target as Node) &&
            !toggleButton.contains(event.target as Node)) {
          this.isMenuExpanded = false;
        }
      }
    }
  }

  // Toggle sidenav expanded/collapsed state
  toggleMenu(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation(); // Prevent immediate closing when opening
    }
    this.isMenuExpanded = !this.isMenuExpanded;

    // When collapsing the menu, reset the expanded menu
    if (!this.isMenuExpanded) {
      this.expandedMenu = null;
    }
  }

  // Close menu method
  closeMenu(): void {
    this.isMenuExpanded = false;
    this.expandedMenu = null;
  }

  // Expand menu when any item is clicked in collapsed mode
  expandMenu(event?: MouseEvent, menuSection?: string): void {
    if (event) {
      event.stopPropagation(); // Prevent document click handler from firing
    }

    // If menu is collapsed, expand it first
    if (!this.isMenuExpanded) {
      this.isMenuExpanded = true;
    }

    // Set the active menu section
    if (menuSection) {
      // If clicking the same section that's already expanded, don't change it
      // This prevents the menu from closing when clicking the header again
      if (this.expandedMenu === menuSection && this.isMenuExpanded) {
        return;
      }
      this.expandedMenu = menuSection;
    }
  }

  // Check if a menu section is expanded
  isMenuSectionExpanded(section: string): boolean {
    return this.expandedMenu === section;
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    localStorage.setItem('darkTheme', this.isDarkTheme.toString());
    this.applyTheme();
  }

  openPrinterSettings(): void {
    this.dialog.open(PrinterSettingsComponent, {
      width: '800px',
      maxHeight: '90vh',
    });
    this.closeMenu();
  }

  // Tab navigation methods
  openHomeTab() {
    this.tabsService.openTab(
      'Dashboard',
      HomeComponent,
      { source: 'navigation' },
      'dashboard-tab',
      true
    );
    this.closeMenu();
  }

  // RRHH related tab navigation methods
  openRrhhDashTab() {
    this.tabsService.openTab(
      'RRHH Dashboard',
      RrhhDashboardComponent,
      { source: 'navigation' },
      'rrhh-dash-tab',
      true
    );
    this.closeMenu();
  }

  openNotificacionesRrhhTab() {
    this.tabsService.openTab(
      'Notificaciones RRHH',
      ListNotificacionesRrhhComponent,
      {},
      'notificaciones-rrhh-tab',
      true
    );
    this.closeMenu();
  }

  openReportesRrhhTab() {
    this.tabsService.openTab(
      'Reportes RRHH',
      ReportesRrhhPageComponent,
      {},
      'reportes-rrhh-tab',
      true
    );
    this.closeMenu();
  }

  openListPermisosTab() {
    this.tabsService.openTab(
      'Permisos',
      ListPermisosComponent,
      { source: 'navigation' },
      'permisos-tab',
      true
    );
    this.closeMenu();
  }

  openConfiguracionRrhhTab() {
    this.tabsService.openTab(
      'Configuracion RRHH',
      ListConfiguracionRrhhComponent,
      { source: 'navigation' },
      'configuracion-rrhh-tab',
      true
    );
    this.closeMenu();
  }

  openBackupRestoreTab() {
    this.tabsService.openTab(
      'Backup y Restauración',
      BackupRestoreComponent,
      { source: 'navigation' },
      'backup-restore-tab',
      true
    );
    this.closeMenu();
  }

  openIaConfigTab() {
    this.tabsService.openTab(
      'Configurar IA',
      IaConfigComponent,
      { source: 'navigation' },
      'ia-config-tab',
      true
    );
    this.closeMenu();
  }

  openCargosTab() {
    this.tabsService.openTab(
      'Cargos',
      ListCargosComponent,
      { source: 'navigation' },
      'cargos-tab',
      true
    );
    this.closeMenu();
  }

  openFuncionariosTab() {
    this.tabsService.openTab(
      'Funcionarios',
      ListFuncionariosComponent,
      { source: 'navigation' },
      'funcionarios-tab',
      true
    );
    this.closeMenu();
  }

  openTurnosTab() {
    this.tabsService.openTab('Turnos', ListTurnosComponent, { source: 'navigation' }, 'turnos-tab', true);
    this.closeMenu();
  }

  openAsistenciasTab() {
    this.tabsService.openTab('Asistencias', ListAsistenciasComponent, { source: 'navigation' }, 'asistencias-tab', true);
    this.closeMenu();
  }

  openPenalizacionesTab() {
    this.tabsService.openTab('Penalizaciones', ListPenalizacionesComponent, { source: 'navigation' }, 'penalizaciones-tab', true);
    this.closeMenu();
  }

  openFeriadosTab() {
    this.tabsService.openTab('Feriados', ListFeriadosComponent, { source: 'navigation' }, 'feriados-tab', true);
    this.closeMenu();
  }

  openHorasExtraTab() {
    this.tabsService.openTab('Horas extra', ListHorasExtraComponent, { source: 'navigation' }, 'horas-extra-tab', true);
    this.closeMenu();
  }

  openValesTab() {
    this.tabsService.openTab('Vales', ListValesComponent, { source: 'navigation' }, 'vales-tab', true);
    this.closeMenu();
  }

  openMotivosValeTab() {
    this.tabsService.openTab('Motivos de vale', ListMotivosValeComponent, { source: 'navigation' }, 'motivos-vale-tab', true);
    this.closeMenu();
  }

  openPrestamosFuncionariosTab() {
    this.tabsService.openTab('Prestamos a funcionarios', ListPrestamosFuncionariosComponent, { source: 'navigation' }, 'prestamos-func-tab', true);
    this.closeMenu();
  }

  openLiquidacionesSueldoTab() {
    this.tabsService.openTab('Liquidaciones sueldo', ListLiquidacionesSueldoComponent, { source: 'navigation' }, 'liquidaciones-sueldo-tab', true);
    this.closeMenu();
  }

  openBonosTab() {
    this.tabsService.openTab('Bonos', ListBonosComponent, { source: 'navigation' }, 'bonos-tab', true);
    this.closeMenu();
  }

  openAguinaldosTab() {
    this.tabsService.openTab('Aguinaldos', ListAguinaldosComponent, { source: 'navigation' }, 'aguinaldos-tab', true);
    this.closeMenu();
  }

  // ===================== COMISIONES =====================
  openReglasComisionTab() {
    this.tabsService.openTab('Reglas de Comisión', ListReglasComisionComponent, { source: 'navigation' }, 'reglas-comision-tab', true);
    this.closeMenu();
  }

  openEquiposComisionTab() {
    this.tabsService.openTab('Equipos Comisión', ListEquiposComisionComponent, { source: 'navigation' }, 'equipos-comision-tab', true);
    this.closeMenu();
  }

  openLiquidacionesComisionTab() {
    this.tabsService.openTab('Liquidaciones Comisión', ListLiquidacionesComisionComponent, { source: 'navigation' }, 'liquidaciones-comision-tab', true);
    this.closeMenu();
  }

  openPersonasTab() {
    this.tabsService.openTab(
      'Personas',
      ListPersonasComponent,
      { source: 'navigation' },
      'personas-tab',
      true
    );
    this.closeMenu();
  }

  openUsuariosTab() {
    this.tabsService.openTab(
      'Usuarios',
      ListUsuariosComponent,
      { source: 'navigation' },
      'usuarios-tab',
      true
    );
    this.closeMenu();
  }

  openClientesTab() {
    this.tabsService.openTab(
      'Clientes',
      ListClientesComponent,
      { source: 'navigation' },
      'clientes-tab',
      true
    );
    this.closeMenu();
  }

  // Productos related tab navigation methods
  openCategoriasTab() {
    // this.tabsService.openTab(
    //   'Categorías',
    //   ListCategoriasComponent,
    //   { source: 'navigation' },
    //   'categorias-tab',
    //   true
    // );
  }

  openProductosTab() {
    this.tabsService.openTab(
      'Lista de Productos',
      ListProductosComponent,
      { source: 'navigation' },
      'productos-tab',
      true
    );
    this.closeMenu();
  }

  openMonedasTab() {
    this.tabsService.openTab(
      'Monedas',
      ListMonedasComponent,
      { source: 'navigation' },
      'monedas-tab',
      true
    );
    this.closeMenu();
  }

  openRecetasTab() {
    this.tabsService.openTab(
      'Gestión de Recetas',
      ListRecetasComponent,
      { source: 'navigation' },
      'recetas-tab',
      true
    );
    this.closeMenu();
  }

  openAdicionalesTab() {
    this.tabsService.openTab(
      'Gestión de Adicionales',
      ListAdicionalesComponent,
      { source: 'navigation' },
      'adicionales-tab',
      true
    );
    this.closeMenu();
  }

  openSaboresTab() {
    this.tabsService.openTab(
      'Gestión de Sabores',
      ListSaboresComponent,
      { source: 'navigation' },
      'sabores-tab',
      true
    );
    this.closeMenu();
  }

  openIngredientesTab() {
    // this.tabsService.addTab('Ingredientes', ListIngredientesComponent);
  }

  openTipoPrecioTab() {
      // this.tabsService.addTab('Tipos de Precio', TipoPrecioComponent);
  }

  // New Financiero tab navigation methods
  openFinancieroDashTab() {
    this.tabsService.openTab(
      'Financiero Dashboard',
      FinancieroDashboardComponent,
      { source: 'navigation' },
      'financiero-dashboard-tab',
      true
    );
    this.closeMenu();
  }

  openCajasTab() {
    this.tabsService.openTab(
      'Cajas',
      ListCajasComponent,
      { source: 'navigation' },
      'cajas-tab',
      true
    );
    this.closeMenu();
  }

  openDispositivosTab() {
    // Dynamically import the component to avoid circular dependencies
    this.tabsService.openTab(
      'Dispositivos y Puntos de Venta',
      ListDispositivosComponent,
      { source: 'navigation' },
      'dispositivos-tab',
      true
    );
    this.closeMenu();
  }

  openCajaMayorTab() {
    this.tabsService.openTab(
      'Caja Mayor',
      CajaMayorDashboardComponent,
      { source: 'navigation' },
      'caja-mayor-tab',
      true
    );
    this.closeMenu();
  }

  openCuentasPorCobrarTab() {
    this.tabsService.openTab(
      'Cuentas por Cobrar',
      ListCuentasPorCobrarComponent,
      { source: 'navigation' },
      'cuentas-por-cobrar-tab',
      true
    );
    this.closeMenu();
  }

  // Compras related tab navigation methods
  openComprasDashTab() {
    this.tabsService.openTab(
      'Dashboard de Compras',
      ComprasDashboardComponent,
      { source: 'navigation' },
      'compras-dashboard-tab',
      true
    );
    this.closeMenu();
  }

  openComprasTab() {
    this.tabsService.openTab(
      'Compras',
      ListComprasComponent,
      { source: 'navigation' },
      'compras-tab',
      true,
    );
    this.closeMenu();
  }

  openFacturaImportsTab() {
    this.tabsService.openTab(
      'Importaciones IA',
      ListFacturaImportsComponent,
      { source: 'navigation' },
      'factura-imports-tab',
      true,
    );
    this.closeMenu();
  }

  openMovimientosStockTab() {
    // this.tabsService.addTab('Movimientos de Stock', ListMovimientosStockComponent);
  }

  openVentasDashTab() {
    this.tabsService.openTab(
      'Dashboard de Ventas',
      VentasDashboardComponent,
      { source: 'navigation' },
      'ventas-dashboard-tab',
      true
    );
    this.closeMenu();
  }

  openProductoDashboardTab() {
    this.tabsService.openTab(
      'Dashboard de productos',
      ProductosDashboardComponent,
      { source: 'navigation' },
      'producto-dashboard-tab',
      true
    );
    this.closeMenu();
  }

  private applyTheme() {
    if (this.isDarkTheme) {
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
    }
  }

  // Setup sidenav open/close event listeners
  private setupSidenavListeners() {
    if (this.sidenav) {
      // Force change detection when sidenav opens or closes
      this.sidenav.openedChange.subscribe(() => {
        // This will update the UI when the sidenav is opened or closed
        console.log(
          'Sidenav state changed:',
          this.sidenav.opened ? 'opened' : 'closed'
        );
      });
    }
  }
}
