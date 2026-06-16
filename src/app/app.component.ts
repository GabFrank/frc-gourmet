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
import { BuffetDashboardComponent } from './pages/ventas/buffet-dashboard/buffet-dashboard.component';
import { CajaMayorDashboardComponent } from './pages/financiero/caja-mayor/dashboard/caja-mayor-dashboard.component';
import { ListCuentasPorCobrarComponent } from './pages/financiero/caja-mayor/cuentas-por-cobrar/list-cuentas-por-cobrar/list-cuentas-por-cobrar.component';
import { ListPermisosComponent } from './pages/personalizacion/permisos/list-permisos/list-permisos.component';
import { ListConfiguracionRrhhComponent } from './pages/rrhh/configuracion/list-configuracion-rrhh/list-configuracion-rrhh.component';
import { BackupRestoreComponent } from './pages/configuracion/backup-restore/backup-restore.component';
import { IaConfigComponent } from './pages/configuracion/ia-config/ia-config.component';
import { DbConfigComponent } from './pages/configuracion/db-config/db-config.component';
import { ModeConfigComponent } from './pages/configuracion/mode-config/mode-config.component';
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
import { UpdateService } from './services/update.service';
import { UpdateChannelDialogComponent } from './shared/components/update-channel-dialog/update-channel-dialog.component';
import { EmpresaService } from './shared/services/empresa.service';
import { ConfigurarEmpresaComponent } from './pages/sistema/configurar-empresa/configurar-empresa.component';
import { resolveAppUrl } from './shared/utils/image-url.util';
import { HasPermissionDirective, HasAnyPermissionDirective } from './shared/directives/has-permission.directive';
import { SplashOverlayComponent } from './shared/components/splash-overlay/splash-overlay.component';
import { UserAvatarComponent } from './shared/components/user-avatar/user-avatar.component';

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
    HasPermissionDirective,
    HasAnyPermissionDirective,
    SplashOverlayComponent,
    UserAvatarComponent,
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
  // Splash overlay (post-login): se muestra ~1.6s al pasar de no-auth a auth
  showSplash = false;
  splashGreeting: string | null = null;
  private splashTimer: any = null;
  private prevAuthenticated = false;
  currentUser: Usuario | null = null;
  lastLoginTime: Date | null = null;
  /** Label visible en el toolbar (nombre persona o nickname). Computado al cambiar currentUser. */
  userDisplayName = '';

  // Notificaciones RRHH badge
  notificacionesNoLeidas = 0;
  private notifInterval: any;

  /** Nombre de la empresa para el toolbar. Bindeado al EmpresaService.empresa$. */
  empresaNombre = 'MI EMPRESA';
  /** URL resuelta del logo para mostrar en el header (thumb o original como fallback). */
  empresaLogoUrl: string | null = null;
  private empresaSub: Subscription | null = null;

  // Auto-update toolbar state
  updateAvailable = false;
  updateDownloaded = false;
  private updateStatusSub: Subscription | null = null;

  // Window controls (custom titlebar). En macOS los semáforos nativos
  // quedan a la izquierda por `titleBarStyle:hiddenInset` en main.ts, así
  // que ocultamos los controles custom para no duplicar.
  isWindowMaximized = false;
  isMacOS = false;
  private windowStateUnsub: (() => void) | null = null;

  // Datos enriquecidos del header.
  appVersion = '';
  /** standalone | server | client — del wizard de modo de operación. */
  appMode: 'standalone' | 'server' | 'client' = 'standalone';
  /** Reloj actualizado cada 1s. */
  currentTime: Date = new Date();
  private clockInterval: any = null;
  /** Cotizaciones del día (compra/venta de mercado de nortecambios). */
  cotizacionUsd: { compra: number; venta: number } | null = null;
  cotizacionBrl: { compra: number; venta: number } | null = null;
  cotizacionTimestamp: Date | null = null;
  cotizacionError = false;
  private cotizacionInterval: any = null;

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
    private updateService: UpdateService,
    private empresaService: EmpresaService,
  ) {
    // Suscribirse al servicio de empresa para mantener el nombre + logo del
    // toolbar sincronizados con cualquier update (login, guardar en
    // configurar-empresa, subir/quitar logo).
    this.empresaSub = this.empresaService.empresa.subscribe((emp) => {
      this.empresaNombre = emp?.nombre || 'MI EMPRESA';
      const raw = emp?.logoUrl || null;
      // Logo va sin thumbnails para preservar transparencia (los thumbs .jpg
      // aplanan el alpha). El original suele pesar < 100KB, no es problema.
      this.empresaLogoUrl = raw ? (resolveAppUrl(raw) || null) : null;
    });

    // Subscribe to authentication state changes
    this.authService.currentUser$.subscribe((user) => {
      const wasAuthenticated = this.prevAuthenticated;
      this.isAuthenticated = !!user;
      this.currentUser = user;
      this.userDisplayName = this.buildUserDisplayName(user);

      // Al autenticar, recargar los datos de la empresa (handler requiere user
      // context para tracking). Sin user, dejamos el cache previo / fallback.
      if (this.isAuthenticated) {
        this.empresaService.load();
      }

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

      // Splash post-login: solo en transición no-auth -> auth
      if (!wasAuthenticated && this.isAuthenticated) {
        this.triggerPostLoginSplash();
      }
      this.prevAuthenticated = this.isAuthenticated;
    });
  }

  private triggerPostLoginSplash(): void {
    this.splashGreeting = this.computeGreeting();
    this.showSplash = true;
    if (this.splashTimer) clearTimeout(this.splashTimer);
    this.splashTimer = setTimeout(() => {
      this.showSplash = false;
      this.splashTimer = null;
    }, 1600);
  }

  private computeGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días,';
    if (h < 19) return 'Buenas tardes,';
    return 'Buenas noches,';
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

    // Suscribirse al estado del auto-updater para mostrar badge en toolbar
    this.updateStatusSub = this.updateService.status$.subscribe((evt) => {
      if (evt.status === 'available') {
        this.updateAvailable = true;
      } else if (evt.status === 'downloaded') {
        this.updateAvailable = true;
        this.updateDownloaded = true;
      } else if (evt.status === 'not-available') {
        this.updateAvailable = false;
        this.updateDownloaded = false;
      }
    });

    // Window controls custom titlebar: leer plataforma + estado inicial y
    // suscribirse a cambios maximize/unmaximize emitidos desde main.ts.
    this.initWindowControls();

    // Datos enriquecidos del header: version, modo de operación,
    // reloj cada 1s, cotizaciones del día con refresh cada 5 min.
    this.initHeaderEnriched();
  }

  private initHeaderEnriched(): void {
    const api: any = (window as any).api;
    this.appVersion = api?.getAppVersion?.() || '';
    this.appMode = api?.getAppMode?.() || 'standalone';
    // Reloj: tick cada 1s. ngZone.runOutsideAngular para no disparar CD
    // global cada segundo; el binding se actualiza al asignar dentro de
    // ngZone.run en cada tick.
    this.ngZone.runOutsideAngular(() => {
      this.clockInterval = setInterval(() => {
        this.ngZone.run(() => { this.currentTime = new Date(); });
      }, 1000);
    });
    // Cotización: cargar al startup + refresh cada 5 min. El scrapper hace
    // un par de requests HTTPS contra nortecambios; si falla, marcamos error
    // y dejamos el último valor visible (mejor que vaciar la UI).
    this.refreshCotizacion();
    this.cotizacionInterval = setInterval(() => this.refreshCotizacion(), 5 * 60 * 1000);
  }

  private async refreshCotizacion(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this.repo.getCotizacionMercado());
      if (!res?.success || !res?.monedas) {
        this.cotizacionError = true;
        return;
      }
      const usd = res.monedas['DOLAR'] || res.monedas['USD'] || null;
      const brl = res.monedas['REAL'] || res.monedas['BRL'] || null;
      if (usd) this.cotizacionUsd = { compra: Number(usd.compraMercado), venta: Number(usd.ventaMercado) };
      if (brl) this.cotizacionBrl = { compra: Number(brl.compraMercado), venta: Number(brl.ventaMercado) };
      this.cotizacionTimestamp = res.obtenidoEn ? new Date(res.obtenidoEn) : new Date();
      this.cotizacionError = false;
    } catch (e) {
      console.warn('[header] No se pudo obtener cotización mercado', e);
      this.cotizacionError = true;
    }
  }

  private async initWindowControls(): Promise<void> {
    const api: any = (window as any).api;
    if (!api?.windowPlatform) return; // dev sin preload o fallback
    try {
      const platform: string = await api.windowPlatform();
      this.isMacOS = platform === 'darwin';
      this.isWindowMaximized = await api.windowIsMaximized();
      this.windowStateUnsub = api.onWindowStateChanged?.((state: { isMaximized: boolean }) => {
        this.ngZone.run(() => { this.isWindowMaximized = !!state?.isMaximized; });
      }) || null;
    } catch (e) {
      console.warn('[app] No se pudieron inicializar window controls:', e);
    }
  }

  /** Minimiza la ventana. */
  minimizeWindow(): void {
    (window as any).api?.windowMinimize?.();
  }

  /** Alterna maximizado/restaurado. */
  toggleMaximize(): void {
    (window as any).api?.windowMaximizeToggle?.();
  }

  /** Cierra la ventana (dispara el flujo normal de cierre de Electron). */
  closeWindow(): void {
    (window as any).api?.windowClose?.();
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
    if (this.updateStatusSub) {
      this.updateStatusSub.unsubscribe();
    }
    if (this.empresaSub) {
      this.empresaSub.unsubscribe();
    }
    if (this.windowStateUnsub) {
      this.windowStateUnsub();
    }
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
    if (this.cotizacionInterval) {
      clearInterval(this.cotizacionInterval);
    }
    if (this.splashTimer) {
      clearTimeout(this.splashTimer);
      this.splashTimer = null;
    }
  }

  openUpdateDialog(): void {
    this.dialog.open(UpdateChannelDialogComponent, {
      width: '520px',
      maxHeight: '90vh',
    });
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

  /** Construye el label visible en el toolbar a partir del usuario actual.
   * Prioriza Persona.nombre + apellido; si no hay persona usa nickname. */
  private buildUserDisplayName(user: Usuario | null): string {
    if (!user) return '';
    const persona = (user as any).persona;
    if (persona) {
      const partes = [persona.nombre, persona.apellido].filter((p: any) => !!p);
      if (partes.length > 0) return partes.join(' ');
    }
    return user.nickname || '';
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

  openConfigurarEmpresaTab() {
    this.tabsService.openTab(
      'Datos de la Empresa',
      ConfigurarEmpresaComponent,
      { source: 'navigation' },
      'configurar-empresa-tab',
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

  openDbConfigTab() {
    this.tabsService.openTab(
      'Configurar BD',
      DbConfigComponent,
      { source: 'navigation' },
      'db-config-tab',
      true
    );
    this.closeMenu();
  }

  openModeConfigTab() {
    this.tabsService.openTab(
      'Modo de operacion',
      ModeConfigComponent,
      { source: 'navigation' },
      'mode-config-tab',
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

  openBuffetDashTab() {
    this.tabsService.openTab(
      'Buffet por kilo',
      BuffetDashboardComponent,
      { source: 'navigation' },
      'buffet-dashboard-tab',
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
