import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { AuthService, PermissionService, Usuario } from '@frc/shared-core';
import { NAV_ITEMS, NavItem } from '../../core/shell/nav';
import { PwaInstallService } from '../../core/services/pwa-install.service';

/** Dashboard de inicio: saludo + accesos rápidos a las secciones. */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  readonly pwa = inject(PwaInstallService);

  readonly user: Usuario | null = this.auth.currentUser;
  // Ventas primero; Compras/Finanzas/RRHH solo si el usuario tiene permiso.
  readonly accesos$: Observable<NavItem[]> = this.permissions.codigos$.pipe(
    map((set) =>
      NAV_ITEMS.filter(
        (i) => !i.exact && (!i.permisos || i.permisos.some((p) => set.has(p.toUpperCase()))),
      ),
    ),
    shareReplay(1),
  );
}
