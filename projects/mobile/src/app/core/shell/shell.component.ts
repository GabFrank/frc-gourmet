import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { Observable } from 'rxjs';
import { filter, map, shareReplay, startWith } from 'rxjs/operators';
import { AuthService, PermissionService, ThemeService, Usuario } from '@frc/shared-core';
import { NAV_ITEMS, NavItem } from './nav';
import { OfflineBannerComponent } from '../components/offline-banner.component';

/**
 * Layout autenticado: toolbar superior + navegación responsive (nav-rail en
 * tablet/desktop, bottom-nav en teléfono) + `<router-outlet>` para el contenido.
 * UI nueva mobile-first (no reutiliza nada del shell desktop).
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    OfflineBannerComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss'],
})
export class ShellComponent implements OnInit {
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Navegación filtrada por permisos: los destinos con `permisos` solo se
  // muestran si el usuario tiene al menos uno (Compras/Finanzas/RRHH).
  readonly nav$: Observable<NavItem[]> = this.permissions.codigos$.pipe(
    map((set) =>
      NAV_ITEMS.filter((i) => !i.permisos || i.permisos.some((p) => set.has(p.toUpperCase()))),
    ),
    shareReplay(1),
  );
  readonly user: Usuario | null = this.auth.currentUser;

  readonly isHandset$: Observable<boolean> = this.breakpoints
    .observe('(max-width: 767px)')
    .pipe(map((r) => r.matches), shareReplay(1));

  readonly dark$: Observable<boolean> = this.theme.isDarkTheme();

  pageTitle = 'FRC Gourmet';

  ngOnInit(): void {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        startWith(null),
        map(() => this.deriveTitle()),
      )
      .subscribe((t) => (this.pageTitle = t));
  }

  private deriveTitle(): string {
    let r = this.route.firstChild;
    let title = 'FRC Gourmet';
    while (r) {
      const t = r.snapshot.data['title'];
      if (typeof t === 'string') title = t;
      r = r.firstChild;
    }
    return title;
  }

  toggleTheme(): void {
    this.theme.toggleTheme();
  }

  logout(): void {
    void this.auth.logout();
  }
}
