import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

interface CajaVM {
  id: number;
  cajero: string;
  estado: string;
  estadoClase: string;
  fechaApertura?: string;
  fechaCierre?: string;
}

function claseEstado(estado: string): string {
  const e = (estado || '').toUpperCase();
  if (e.includes('ABIERT')) return 'ok';
  if (e.includes('CERRAD')) return 'off';
  return 'warn';
}

/**
 * Lista de Cajas (PWA). Muestra el nombre del cajero (no la terminal). Tap sobre
 * una caja → detalle/resumen. Botón para abrir una caja nueva.
 */
@Component({
  selector: 'app-cajas-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatCardModule, MatIconModule, MatButtonModule,
    MatRippleModule, MatProgressBarModule,
  ],
  templateUrl: './cajas-list.page.html',
})
export class CajasListPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  items: CajaVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.repo.getCajas().subscribe({
      next: (data) => {
        this.items = (data || []).map((c: any) => ({
          id: c.id,
          cajero: String(c?.createdBy?.persona?.nombre || c?.createdBy?.nickname || 'Sin usuario').toUpperCase(),
          estado: c.estado,
          estadoClase: claseEstado(c.estado),
          fechaApertura: c.fechaApertura,
          fechaCierre: c.fechaCierre,
        }));
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las cajas';
        this.loading = false;
      },
    });
  }
}
