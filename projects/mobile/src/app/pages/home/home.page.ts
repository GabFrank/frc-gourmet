import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService, RepositoryService, Moneda, Usuario } from '@frc/shared-core';
import { ConnectionService } from '../../core/data/connection.service';

/**
 * Landing protegida — smoke test de F1: lee el usuario logueado y lista monedas
 * vía `RepositoryService.getMonedas()` → `POST /api/rpc`. Prueba el camino
 * completo login + RPC. Se reemplaza por el dashboard real en F3+.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly repo = inject(RepositoryService);
  private readonly connection = inject(ConnectionService);

  readonly online$ = this.connection.online$;
  readonly user: Usuario | null = this.auth.currentUser;

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

  logout(): void {
    void this.auth.logout();
  }
}
