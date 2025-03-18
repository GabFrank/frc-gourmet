import { Component, OnInit, ViewChild, ElementRef, NgZone, OnDestroy, Renderer2 } from '@angular/core';
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
    TabContainerComponent
  ]
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'FRC Gourmet';
  isDarkTheme = false;
  useTabNavigation = true;
  private autoCloseTimeout: any;
  private sidenavHoverSubscription = new Subscription();
  private mouseLeaveSubscription = new Subscription();
  private closeDelayMs = 2000; // 2 seconds

  // Authentication state
  isAuthenticated = false;
  currentUser: Usuario | null = null;
  lastLoginTime: Date | null = null;

  @ViewChild('drawer') sidenav!: MatSidenav;
  @ViewChild('sidenavTrigger') sidenavTrigger!: ElementRef;

  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.Handset)
    .pipe(
      map(result => result.matches),
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
    private router: Router
  ) {
    // Subscribe to authentication state changes
    this.authService.currentUser$.subscribe(user => {
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
      const sortedSessions = loginSessions.sort((a, b) =>
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
      this.openCategoriasTab();

      // Add event listener for mouse movement after view is initialized
      setTimeout(() => this.setupSidenavHover(), 0);

      // Initialize sidenav listeners after view is initialized
      setTimeout(() => this.setupSidenavListeners(), 0);

      // Start session activity tracker
      this.startSessionActivityTracker();
    }
  }

  ngOnDestroy() {
    // Clean up subscriptions
    this.sidenavHoverSubscription.unsubscribe();
    this.mouseLeaveSubscription.unsubscribe();

    // Clear any pending timeouts
    if (this.autoCloseTimeout) {
      clearTimeout(this.autoCloseTimeout);
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
    await this.authService.logout();
    // Router navigation is handled in the authService
  }

  // Set up sidenav hover detection
  private setupSidenavHover() {
    // Create a trigger area for desktop devices
    if (!this.sidenavTrigger) {
      // Create a trigger div for the hover area
      const triggerElement = this.renderer.createElement('div');
      this.renderer.setAttribute(triggerElement, 'class', 'sidenav-trigger');
      this.renderer.appendChild(document.body, triggerElement);
      this.sidenavTrigger = { nativeElement: triggerElement };
    }

    // Subscribe to mouse hover events on the trigger area (left edge of screen)
    this.ngZone.runOutsideAngular(() => {
      this.sidenavHoverSubscription = fromEvent(this.sidenavTrigger.nativeElement, 'mouseenter')
        .pipe(debounceTime(100))
        .subscribe(() => {
          this.ngZone.run(() => {
            // Clear any pending auto-close
            if (this.autoCloseTimeout) {
              clearTimeout(this.autoCloseTimeout);
              this.autoCloseTimeout = null;
            }

            // Open the sidenav
            if (this.sidenav && !this.sidenav.opened) {
              this.sidenav.open();
            }
          });
        });

      // When mouse leaves the sidenav, start a timer to close it
      if (this.sidenav) {
        // Use querySelector to find the sidenav element without accessing private properties
        setTimeout(() => {
          const sidenavElement = document.querySelector('mat-sidenav');
          if (sidenavElement) {
            this.mouseLeaveSubscription = fromEvent(sidenavElement, 'mouseleave')
              .subscribe(() => {
                this.ngZone.run(() => {
                  // Clear any existing timeout
                  if (this.autoCloseTimeout) {
                    clearTimeout(this.autoCloseTimeout);
                  }

                  // Set a new timeout to close the sidenav after delay
                  this.autoCloseTimeout = setTimeout(() => {
                    if (this.sidenav && this.sidenav.opened) {
                      this.sidenav.close();
                    }
                  }, this.closeDelayMs);
                });
              });
          }
        }, 500); // Small delay to ensure sidenav is in the DOM
      }
    });
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    localStorage.setItem('darkTheme', this.isDarkTheme.toString());
    this.applyTheme();
  }

  openPrinterSettings(): void {
    this.dialog.open(PrinterSettingsComponent, {
      width: '800px',
      maxHeight: '90vh'
    });
  }

  // Tab navigation methods
  openHomeTab() {
    this.tabsService.openTab('Dashboard', HomeComponent, { source: 'navigation' }, 'dashboard-tab', true);
  }

  // RRHH related tab navigation methods
  openRrhhDashTab() {
    this.tabsService.openTab('RRHH Dashboard', RrhhDashComponent, { source: 'navigation' }, 'rrhh-dash-tab', true);
  }

  openPersonasTab() {
    this.tabsService.openTab('Personas', ListPersonasComponent, { source: 'navigation' }, 'personas-tab', true);
  }

  openUsuariosTab() {
    this.tabsService.openTab('Usuarios', ListUsuariosComponent, { source: 'navigation' }, 'usuarios-tab', true);
  }

  openClientesTab() {
    this.tabsService.openTab('Clientes', ListClientesComponent, { source: 'navigation' }, 'clientes-tab', true);
  }

  // Productos related tab navigation methods
  openCategoriasTab() {
    this.tabsService.openTab('Categorías', ListCategoriasComponent, { source: 'navigation' }, 'categorias-tab', true);
  }

  openProductosTab() {
    this.tabsService.openTab('Productos', ListProductosComponent, { source: 'navigation' }, 'productos-tab', true);
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
        console.log('Sidenav state changed:', this.sidenav.opened ? 'opened' : 'closed');
      });
    }
  }
}
