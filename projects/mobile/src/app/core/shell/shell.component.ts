import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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
    MatSnackBarModule,
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
  private readonly snack = inject(MatSnackBar);

  // Versión que sirve el server (se muestra en el menú del usuario). La PWA la
  // pide a /api/version del server que la sirve.
  appVersion = '';
  // Versión al momento de cargar la app (baseline para detectar update nuevo).
  private loadedVersion = '';
  buscandoUpdate = false;

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

    void this.cargarVersion();
  }

  /** Pide la versión al server que sirve la PWA (/api/version). */
  private async fetchVersion(): Promise<string | null> {
    try {
      const base = ((window as any).api?.getServerUrl?.() || '').toString().replace(/\/$/, '');
      const resp = await fetch(`${base}/api/version`, { cache: 'no-store' });
      if (!resp.ok) return null;
      const data = await resp.json();
      return data?.appVersion ? String(data.appVersion) : null;
    } catch {
      return null;
    }
  }

  private async cargarVersion(): Promise<void> {
    const v = await this.fetchVersion();
    if (v) {
      this.appVersion = v;
      if (!this.loadedVersion) this.loadedVersion = v;
    }
  }

  /**
   * Re-consulta la versión del server. Si hay una más nueva que la cargada,
   * ofrece recargar (la PWA no tiene service worker: recargar trae los assets
   * nuevos que sirve el server actualizado).
   */
  async buscarActualizacion(): Promise<void> {
    if (this.buscandoUpdate) return;
    this.buscandoUpdate = true;
    const buscando = this.snack.open('Buscando actualización…', undefined, { duration: 0 });
    try {
      const serverVersion = await this.fetchVersion();
      buscando.dismiss();
      if (!serverVersion) {
        this.snack.open('No se pudo verificar la versión', 'CERRAR', { duration: 3000 });
        return;
      }
      this.appVersion = serverVersion;
      if (this.loadedVersion && serverVersion !== this.loadedVersion) {
        const ref = this.snack.open(`Nueva versión disponible (${serverVersion})`, 'ACTUALIZAR', { duration: 10000 });
        ref.onAction().subscribe(() => (window as any).location?.reload());
      } else {
        if (!this.loadedVersion) this.loadedVersion = serverVersion;
        this.snack.open(`Estás en la última versión (${serverVersion})`, 'CERRAR', { duration: 3000 });
      }
    } catch {
      buscando.dismiss();
      this.snack.open('No se pudo verificar la versión', 'CERRAR', { duration: 3000 });
    } finally {
      this.buscandoUpdate = false;
    }
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
