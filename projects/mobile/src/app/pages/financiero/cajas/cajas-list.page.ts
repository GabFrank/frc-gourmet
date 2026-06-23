import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

interface CajaVM {
  id: number;
  estado: string;
  estadoClase: string;
  activo: boolean;
  fechaApertura?: string;
  fechaCierre?: string;
  dispositivo?: { nombre?: string };
}

function claseEstado(estado: string): string {
  const e = (estado || '').toUpperCase();
  if (e.includes('ABIERT')) return 'ok';
  if (e.includes('CERRAD')) return 'off';
  return 'warn';
}

/** Vista (solo lectura) de Cajas. Visibilidad administrativa desde mobile. */
@Component({
  selector: 'app-cajas-list',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatProgressBarModule],
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
        this.items = (data || []).map((c: any) => ({ ...c, estadoClase: claseEstado(c.estado) })) as CajaVM[];
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las cajas';
        this.loading = false;
      },
    });
  }
}
