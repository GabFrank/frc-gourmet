import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { Venta, VentaEstado } from 'src/app/database/entities/ventas/venta.entity';
import { EstadoVentaItem } from 'src/app/database/entities/ventas/venta-item.entity';
import { DetalleVentaDialogComponent } from 'src/app/shared/components/detalle-venta-dialog/detalle-venta-dialog.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

interface UltimaVentaRow {
  venta: Venta;
  hora: Date;
  totalFmt: string;
  formaPago: string;
  estado: string;
  esCredito: boolean;
}

/**
 * Vista rápida de las últimas ventas de la caja actual (desde utilitarios del
 * PdV). Cada venta permite ver el detalle, reimprimir el ticket (y el pagaré
 * si es a crédito) y cancelarla.
 */
@Component({
  selector: 'app-ultimas-ventas-dialog',
  standalone: true,
  imports: [
    CommonModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatMenuModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './ultimas-ventas-dialog.component.html',
  styleUrls: ['./ultimas-ventas-dialog.component.scss'],
})
export class UltimasVentasDialogComponent implements OnInit {
  cajaId = 0;
  loading = true;
  rows: UltimaVentaRow[] = [];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<UltimasVentasDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  async ngOnInit(): Promise<void> {
    this.cajaId = this.data?.cajaId || 0;
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.loading = true;
    try {
      const ventas = await firstValueFrom(this.repositoryService.getVentasByCaja(this.cajaId));
      this.rows = (ventas || []).map((v) => {
        const fp = (v.formaPago as any)?.nombre || '-';
        return {
          venta: v,
          hora: v.createdAt as any,
          totalFmt: this.calcTotal(v).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
          formaPago: fp,
          estado: v.estado,
          esCredito: /CREDITO|CUENTA CORRIENTE/.test(fp.toUpperCase()),
        };
      });
    } catch (e) {
      console.error('Error cargando últimas ventas:', e);
      this.rows = [];
    } finally {
      this.loading = false;
    }
  }

  private calcTotal(venta: Venta): number {
    const items: any[] = (venta as any).items || [];
    return items.reduce((sum, i) => {
      if (i.estado === EstadoVentaItem.ACTIVO) {
        return sum + (i.precioVentaUnitario + (i.precioAdicionales || 0) - (i.descuentoUnitario || 0)) * i.cantidad;
      }
      return sum;
    }, 0);
  }

  verDetalle(row: UltimaVentaRow): void {
    this.dialog.open(DetalleVentaDialogComponent, {
      width: '80vw',
      height: '80vh',
      data: { venta: row.venta },
    });
  }

  async reimprimirTicket(row: UltimaVentaRow): Promise<void> {
    try {
      const api = (window as any).api;
      const res = await api.callIpc('print-venta-ticket', { ventaId: row.venta.id });
      if (res?.ok) {
        this.snackBar.open(`Ticket de la venta #${row.venta.id} reenviado a la impresora`, 'CERRAR', { duration: 3000 });
      } else {
        const msg = res?.errors?.[0]?.message || 'No se pudo reimprimir el ticket';
        this.snackBar.open(msg, 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
      }
    } catch (e) {
      console.error('Error reimprimir ticket:', e);
      this.snackBar.open('Error al reimprimir el ticket', 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
    }
  }

  async reimprimirPagare(row: UltimaVentaRow): Promise<void> {
    try {
      const api = (window as any).api;
      const cpc = await api.callIpc('get-cpc-by-venta', row.venta.id);
      if (!cpc?.id) {
        this.snackBar.open('Esta venta no tiene un pagaré asociado', 'CERRAR', { duration: 3500 });
        return;
      }
      const res = await api.callIpc('print-pagare-cpc-ticket', { cpcId: cpc.id });
      if (res?.ok) {
        this.snackBar.open('Pagaré reenviado a la impresora', 'CERRAR', { duration: 3000 });
      } else {
        const msg = res?.errors?.[0]?.message || 'No se pudo reimprimir el pagaré';
        this.snackBar.open(msg, 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
      }
    } catch (e) {
      console.error('Error reimprimir pagaré:', e);
      this.snackBar.open('Error al reimprimir el pagaré', 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
    }
  }

  cancelarVenta(row: UltimaVentaRow): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'CANCELAR VENTA',
        message: `¿Está seguro de cancelar la venta #${row.venta.id}? Esta acción requiere autorización de administrador.`,
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        const estadoAnterior = row.venta.estado;
        await firstValueFrom(this.repositoryService.updateVenta(row.venta.id, { estado: VentaEstado.CANCELADA }));
        if (estadoAnterior === VentaEstado.CONCLUIDA) {
          this.repositoryService.revertirStockVenta(row.venta.id).subscribe({
            next: (r) => console.log('Stock revertido:', r),
            error: (e) => console.error('Error revirtiendo stock:', e),
          });
        }
        this.snackBar.open(`Venta #${row.venta.id} cancelada`, 'CERRAR', { duration: 3000 });
        await this.cargar();
      } catch (e) {
        console.error('Error cancelando venta:', e);
        this.snackBar.open('Error al cancelar la venta', 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
      }
    });
  }

  cerrar(): void {
    this.dialogRef?.close();
  }
}
