import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog.component';
import {
  TransferirMesaDialogComponent,
  MesaDestino,
} from './transferir-mesa-dialog.component';

interface ItemVM {
  id: number;
  descripcion: string;
  detalle?: string;
  cantidad: number;
  unitario: number;
  total: number;
}

/**
 * Detalle de mesa: muestra la cuenta de la venta ABIERTA (items + total), con
 * acceso a "Tomar pedido" (FAB) y a quitar un ítem (lo cancela, sincronizando
 * el KDS). Cobrar / pre-cuenta llegan en fases siguientes.
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
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  mesaId = 0;
  ventaId: number | null = null;
  quitando = false;
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
        this.ventaId = ventaId ?? null;
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

  async quitar(item: ItemVM): Promise<void> {
    if (this.quitando) return;
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: 'Quitar ítem',
            message: `¿Quitar "${item.descripcion}" de la cuenta? Si ya fue enviado a cocina, se cancelará también allí.`,
            confirmText: 'Quitar',
            danger: true,
          },
          width: '320px',
        })
        .afterClosed(),
    );
    if (!ok) return;

    this.quitando = true;
    try {
      // Cancelar (no borrar): preserva auditoría y cancela los comanda-items del KDS.
      await firstValueFrom(this.repo.updateVentaItem(item.id, { estado: 'CANCELADO' } as any));
      this.snack.open('Ítem quitado', undefined, { duration: 1500 });
      if (this.ventaId) {
        this.cargarCuenta(this.ventaId);
      }
    } catch {
      this.snack.open('No se pudo quitar el ítem', 'CERRAR', { duration: 4000 });
    } finally {
      this.quitando = false;
    }
  }

  async imprimirPreCuenta(): Promise<void> {
    if (!this.ventaId) return;
    const api = (window as any).api;
    if (!api?.callIpc) {
      this.snack.open('Impresión no disponible', 'CERRAR', { duration: 3000 });
      return;
    }
    try {
      const res = await api.callIpc('print-precuenta', { ventaId: this.ventaId });
      if (res?.ok === false) {
        this.snack.open('La pre-cuenta no se pudo imprimir', 'CERRAR', { duration: 4000 });
      } else {
        this.snack.open('Pre-cuenta enviada a impresión', undefined, { duration: 1800 });
      }
    } catch {
      this.snack.open('No se pudo imprimir la pre-cuenta', 'CERRAR', { duration: 4000 });
    }
  }

  async transferir(): Promise<void> {
    if (!this.ventaId) return;
    const destino = (await firstValueFrom(
      this.dialog
        .open(TransferirMesaDialogComponent, {
          data: { mesaActualId: this.mesaId },
          width: '320px',
          maxHeight: '85vh',
        })
        .afterClosed(),
    )) as MesaDestino | undefined;
    if (!destino) return;

    const ventaOrigenId = this.ventaId;
    this.loading = true;
    try {
      if (destino.ventaId) {
        // Destino ya tiene cuenta abierta: mover items activos y cancelar la origen.
        const items = await firstValueFrom(this.repo.getVentaItems(ventaOrigenId));
        const activos = (items || []).filter((i: any) => i.estado === 'ACTIVO');
        for (const it of activos) {
          await firstValueFrom(
            this.repo.updateVentaItem(it.id, { venta: { id: destino.ventaId } } as any),
          );
        }
        await firstValueFrom(this.repo.updateVenta(ventaOrigenId, { estado: 'CANCELADA' } as any));
      } else {
        // Destino libre: mover la venta completa.
        await firstValueFrom(this.repo.updateVenta(ventaOrigenId, { mesa: { id: destino.id } } as any));
      }
      // Liberar mesa origen y ocupar destino.
      await firstValueFrom(this.repo.updatePdvMesa(this.mesaId, { estado: 'DISPONIBLE' } as any));
      await firstValueFrom(this.repo.updatePdvMesa(destino.id, { estado: 'OCUPADO' } as any));

      this.snack.open(`Cuenta transferida a Mesa ${destino.numero}`, undefined, { duration: 2000 });
      this.location.back();
    } catch {
      this.snack.open('No se pudo transferir la cuenta', 'CERRAR', { duration: 4000 });
      this.loading = false;
    }
  }

  volver(): void {
    this.location.back();
  }
}
