import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

interface ItemVM {
  id: number;
  descripcion: string;
  detalle?: string;
  cantidad: number;
  unitario: number;
  total: number;
}

/**
 * Detalle de mesa (M1 — solo lectura): muestra la cuenta de la venta ABIERTA
 * de la mesa (items + total). El mozo ve qué se pidió. Tomar pedido / cobrar
 * llegan en fases siguientes.
 */
@Component({
  selector: 'app-mesa-detalle',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  templateUrl: './mesa-detalle.page.html',
  styleUrls: ['./mesas.scss'],
})
export class MesaDetallePage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  mesaId = 0;
  titulo = 'Mesa';
  sectorNombre?: string;
  ocupada = false;
  estado = 'Libre';

  items: ItemVM[] = [];
  total = 0;
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.mesaId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
  }

  private cargar(): void {
    this.loading = true;
    this.error = null;
    // getPdvMesa trae la venta ABIERTA (la venta concluida se desvincula de la
    // mesa al cobrar, así que `venta` es la cuenta abierta o null).
    this.repo.getPdvMesa(this.mesaId).subscribe({
      next: (m: any) => {
        this.titulo = m?.numero != null ? `Mesa ${m.numero}` : 'Mesa';
        this.sectorNombre = m?.sector?.nombre;
        const ventaId = m?.venta?.id;
        this.ocupada = !!ventaId || m?.estado === 'OCUPADO';
        this.estado = this.ocupada ? 'Ocupada' : 'Libre';
        if (ventaId) {
          this.cargarCuenta(ventaId);
        } else {
          this.items = [];
          this.total = 0;
          this.loading = false;
        }
      },
      error: () => {
        this.error = 'No se pudo cargar la mesa';
        this.loading = false;
      },
    });
  }

  private cargarCuenta(ventaId: number): void {
    this.repo.getVentaItems(ventaId).subscribe({
      next: (data: any[]) => {
        const activos = (data || []).filter((i) => i.estado === 'ACTIVO');
        this.items = activos.map((i) => this.toItemVM(i));
        this.total = this.items.reduce((s, i) => s + i.total, 0);
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudo cargar la cuenta';
        this.loading = false;
      },
    });
  }

  private toItemVM(i: any): ItemVM {
    const cantidad = Number(i.cantidad) || 0;
    // Mismo cálculo que el PdV desktop: (unitario + adicionales - descuento) * cantidad.
    const unitario =
      (Number(i.precioVentaUnitario) || 0) +
      (Number(i.precioAdicionales) || 0) -
      (Number(i.descuentoUnitario) || 0);
    return {
      id: i.id,
      descripcion: i.producto?.nombre || i.ensambladoDescripcion || 'Item',
      detalle: i.presentacion?.nombre,
      cantidad,
      unitario,
      total: unitario * cantidad,
    };
  }

  volver(): void {
    this.location.back();
  }
}
