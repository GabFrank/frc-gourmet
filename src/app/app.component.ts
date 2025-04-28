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
import { ListCategoriasComponent } from './pages/productos/categorias/list-categorias/list-categorias.component';
import { ListProductosComponent } from './pages/productos/productos/list-productos.component';
import { ListMonedasComponent } from './pages/financiero/monedas/list-monedas/list-monedas.component';
import { ListRecetasComponent } from './pages/productos/recetas/list-recetas.component';
import { ListIngredientesComponent } from './pages/productos/ingredientes/list-ingredientes.component';
import { ListDispositivosComponent } from './pages/financiero/dispositivos/list-dispositivos.component';
import { ListCajasComponent } from './pages/financiero/cajas/list-cajas.component';
import { FinancieroDashboardComponent } from './pages/financiero/dashboard/financiero-dashboard.component';
import { TipoPrecioComponent } from './pages/financiero/tipo-precio/tipo-precio.component';
import { ComprasDashboardComponent } from './pages/compras/dashboard/compras-dashboard.component';
import { ListComprasComponent } from './pages/compras/compras/list-compras.component';
import { ListMovimientosStockComponent } from './pages/productos/movimientos/list-movimientos-stock.component';
import { VentasDashboardComponent } from './pages/ventas/dashboard/ventas-dashboard.component';

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
    private snackBar: MatSnackBar
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
    }
  }

  ngAfterViewInit(): void {
    // Initialize sidenav in collapsed state
    this.isMenuExpanded = false;
    this.expandedMenu = null;
  }

  ngOnDestroy() {
    // Clean up any subscriptions to prevent memory leaks
    if (this.authService) {
      // Make sure to unsubscribe from any observables
      // This is just a placeholder - add actual subscription cleanup if needed
    }
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
  }

  // RRHH related tab navigation methods
  openRrhhDashTab() {
    this.tabsService.openTab(
      'RRHH Dashboard',
      RrhhDashComponent,
      { source: 'navigation' },
      'rrhh-dash-tab',
      true
    );
  }

  openPersonasTab() {
    this.tabsService.openTab(
      'Personas',
      ListPersonasComponent,
      { source: 'navigation' },
      'personas-tab',
      true
    );
  }

  openUsuariosTab() {
    this.tabsService.openTab(
      'Usuarios',
      ListUsuariosComponent,
      { source: 'navigation' },
      'usuarios-tab',
      true
    );
  }

  openClientesTab() {
    this.tabsService.openTab(
      'Clientes',
      ListClientesComponent,
      { source: 'navigation' },
      'clientes-tab',
      true
    );
  }

  // Productos related tab navigation methods
  openCategoriasTab() {
    this.tabsService.openTab(
      'Categorías',
      ListCategoriasComponent,
      { source: 'navigation' },
      'categorias-tab',
      true
    );
  }

  openProductosTab() {
    this.tabsService.openTab(
      'Productos',
      ListProductosComponent,
      { source: 'navigation' },
      'productos-tab',
      true
    );
  }

  openMonedasTab() {
    this.tabsService.openTab(
      'Monedas',
      ListMonedasComponent,
      { source: 'navigation' },
      'monedas-tab',
      true
    );
  }

  openRecetasTab() {
    this.tabsService.openTab('Recetas ', ListRecetasComponent);
  }

  openIngredientesTab() {
    this.tabsService.addTab('Ingredientes', ListIngredientesComponent);
  }

  openTipoPrecioTab() {
      this.tabsService.addTab('Tipos de Precio', TipoPrecioComponent);
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
  }

  openCajasTab() {
    this.tabsService.openTab(
      'Cajas',
      ListCajasComponent,
      { source: 'navigation' },
      'cajas-tab',
      true
    );
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
  }

  openComprasTab() {
    this.tabsService.openTab(
      'Compras',
      ListComprasComponent,
      { source: 'navigation' },
      'compras-tab',
      true
    );
  }

  openMovimientosStockTab() {
    this.tabsService.addTab('Movimientos de Stock', ListMovimientosStockComponent);
  }

  openVentasDashTab() {
    this.tabsService.openTab(
      'Dashboard de Ventas',
      VentasDashboardComponent,
      { source: 'navigation' },
      'ventas-dashboard-tab',
      true
    );
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
