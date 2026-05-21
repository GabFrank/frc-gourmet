import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AuthService, RepositoryService, Moneda, Usuario } from '@frc/shared-core';
import { NAV_ITEMS, NavItem } from '../../core/shell/nav';

/**
 * Dashboard de inicio (dentro del shell). Accesos rápidos a las secciones +
 * tarjeta demo de monedas (smoke test de `/api/rpc`). Se enriquece con KPIs
 * reales cuando lleguen los dashboards por dominio.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatIconModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly repo = inject(RepositoryService);

  readonly user: Usuario | null = this.auth.currentUser;
  readonly accesos: NavItem[] = NAV_ITEMS.filter((i) => !i.exact);

  monedas: Moneda[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.repo.getMonedas().subscribe({
      next: (monedas) => {
        this.monedas = monedas;
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los datos del servidor';
        this.loading = false;
      },
    });
  }
}
