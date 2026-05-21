import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

interface CompraVM {
  id: number;
  estado: string;
  numeroNota?: string;
  fechaCompra?: string;
  total?: number;
  proveedor?: { nombre?: string };
}

/** Vista (solo lectura) de Compras. */
@Component({
  selector: 'app-compras-list',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatProgressBarModule],
  templateUrl: './compras-list.page.html',
})
export class ComprasListPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  items: CompraVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.repo.getCompras().subscribe({
      next: (data) => {
        this.items = (data || []).map((c: any) => ({
          id: c.id,
          estado: c.estado,
          numeroNota: c.numeroNota,
          fechaCompra: c.fechaCompra,
          total: Number(c.total ?? c.montoTotal ?? 0),
          proveedor: c.proveedor,
        })) as CompraVM[];
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las compras';
        this.loading = false;
      },
    });
  }
}
