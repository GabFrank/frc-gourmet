import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

interface CxcVM {
  id: number;
  clienteNombre: string;
  descripcion?: string;
  montoTotal: number;
  saldo: number;
  estado?: string;
}

/** Vista (solo lectura) de Cuentas por Cobrar. */
@Component({
  selector: 'app-cxc-list',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatProgressBarModule],
  templateUrl: './cxc-list.page.html',
})
export class CxcListPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  items: CxcVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.repo.getCuentasPorCobrar().subscribe({
      next: (data: any) => {
        const arr: any[] = Array.isArray(data) ? data : data?.data || data?.items || data?.cuentas || [];
        this.items = arr.map((c: any) => {
          const total = Number(c.montoTotal) || 0;
          const cobrado = Number(c.montoCobrado) || 0;
          return {
            id: c.id,
            clienteNombre: c.cliente?.persona?.nombre || c.cliente?.razon_social || 'Cliente',
            descripcion: c.descripcion,
            montoTotal: total,
            saldo: total - cobrado,
            estado: c.estado,
          } as CxcVM;
        });
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las cuentas por cobrar';
        this.loading = false;
      },
    });
  }
}
