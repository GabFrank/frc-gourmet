import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRippleModule } from '@angular/material/core';
import { RepositoryService } from '@frc/shared-core';

interface CxpVM {
  id: number;
  titulo: string;
  descripcion?: string;
  simbolo: string;
  decimales: number;
  saldo: number;
  estado: string;
  estadoClase: string;
}

/** Lista de Cuentas por Pagar (deudas a proveedores). Enlaza al detalle para pagar cuotas. */
@Component({
  selector: 'app-cxp-list',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatIconModule, MatProgressBarModule, MatRippleModule],
  templateUrl: './cxp-list.page.html',
})
export class CxpListPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  items: CxpVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.repo.getCuentasPorPagar({ excluirPrestamosFuncionario: true }).subscribe({
      next: (data: any) => {
        const arr: any[] = Array.isArray(data) ? data : data?.items || [];
        this.items = arr.map((c) => this.toVM(c));
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las cuentas por pagar';
        this.loading = false;
      },
    });
  }

  private toVM(c: any): CxpVM {
    const estado = (c.estado || '').toUpperCase();
    const activo = estado === 'ACTIVO';
    const total = Number(c.montoTotal) || 0;
    const pagado = Number(c.montoPagado) || 0;
    const prov = c.proveedor?.razonSocial || c.proveedor?.nombre || c.funcionario?.persona?.nombre || '';
    return {
      id: c.id,
      titulo: prov || c.descripcion || `CxP #${c.id}`,
      descripcion: prov ? c.descripcion : undefined,
      simbolo: c.moneda?.simbolo || '',
      decimales: c.moneda?.decimales ?? 0,
      saldo: total - pagado,
      estado: activo ? 'Pendiente' : estado === 'PAGADO' ? 'Pagada' : 'Cancelada',
      estadoClase: activo ? 'warn' : estado === 'PAGADO' ? 'ok' : 'off',
    };
  }
}
