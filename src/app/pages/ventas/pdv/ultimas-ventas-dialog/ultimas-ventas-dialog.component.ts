import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { Venta } from 'src/app/database/entities/ventas/venta.entity';
import { EstadoVentaItem } from 'src/app/database/entities/ventas/venta-item.entity';
import { DetalleVentaDialogComponent } from 'src/app/shared/components/detalle-venta-dialog/detalle-venta-dialog.component';

interface UltimaVentaRow {
  venta: Venta;
  hora: Date;
  totalFmt: string;
  formaPago: string;
  estado: string;
}

/**
 * Vista rápida de las últimas ventas de la caja actual (desde utilitarios del
 * PdV). Al tocar una venta se abre el detalle completo.
 */
@Component({
  selector: 'app-ultimas-ventas-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule],
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
      this.rows = (ventas || []).map((v) => ({
        venta: v,
        hora: v.createdAt as any,
        totalFmt: this.calcTotal(v).toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
        formaPago: (v.formaPago as any)?.nombre || '-',
        estado: v.estado,
      }));
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

  cerrar(): void {
    this.dialogRef?.close();
  }
}
