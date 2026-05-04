import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { TabsService } from 'src/app/services/tabs.service';

@Component({
  selector: 'app-compra-detalle',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatDividerModule,
    DatePipe,
    DecimalPipe,
  ],
  templateUrl: './compra-detalle.component.html',
  styleUrls: ['./compra-detalle.component.scss'],
})
export class CompraDetalleComponent implements OnInit {
  compraId?: number;
  compra: any = null;
  cuotas: any[] = [];
  loading = false;

  displayedColumns = ['producto', 'presentacion', 'cantidad', 'cantidadUB', 'costoUnit', 'subtotal'];
  cuotasColumns = ['numero', 'vencimiento', 'monto', 'pagado', 'estado'];

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private tabsService: TabsService,
  ) {}

  ngOnInit(): void {
    if (this.compraId) this.load();
  }

  setData(d: any): void {
    if (d?.compraId) this.compraId = d.compraId;
  }

  async load(): Promise<void> {
    if (!this.compraId) return;
    this.loading = true;
    try {
      this.compra = await firstValueFrom(this.repo.getCompra(this.compraId));
      this.cuotas = [];
      if (this.compra?.cuentaPorPagar?.id) {
        const c: any = await firstValueFrom(this.repo.getCuentaPorPagarCuotas(this.compra.cuentaPorPagar.id));
        this.cuotas = (c as any[]) || [];
      }
    } catch (e: any) {
      this.snackBar.open(this.extraerError(e), 'Cerrar', { duration: 6000, panelClass: 'error-snackbar' });
    } finally {
      this.loading = false;
    }
  }

  estadoLabel(estado: string): string {
    switch (estado) {
      case 'ABIERTO': return 'Borrador';
      case 'FINALIZADO': return 'Finalizada';
      case 'CANCELADO': return 'Anulada';
      default: return estado;
    }
  }

  estadoChipClass(estado: string): string {
    switch (estado) {
      case 'ABIERTO': return 'chip-amarillo';
      case 'FINALIZADO': return 'chip-verde';
      case 'CANCELADO': return 'chip-rojo';
      default: return 'chip-gris';
    }
  }

  cuotaChipClass(estado: string): string {
    switch (estado) {
      case 'PENDIENTE': return 'chip-amarillo';
      case 'PARCIAL': return 'chip-naranja';
      case 'PAGADA': return 'chip-verde';
      case 'CANCELADA': return 'chip-rojo';
      default: return 'chip-gris';
    }
  }

  async anular(): Promise<void> {
    if (!this.compra) return;
    const motivo = window.prompt('Motivo de anulación (opcional):', '') ?? null;
    if (motivo === null) return;
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '480px',
      data: {
        title: `Anular compra #${this.compra.id}`,
        message: this.compra.estado === 'FINALIZADO'
          ? '¿Confirmás la anulación? Se revertirán stock, costo y caja mayor (o se cancelará el CPP).'
          : '¿Confirmás la anulación de este borrador?',
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repo.anularCompra(this.compra.id, motivo));
      this.snackBar.open('Compra anulada', 'Cerrar', { duration: 3000 });
      this.load();
    } catch (e: any) {
      this.snackBar.open(this.extraerError(e), 'Cerrar', { duration: 8000, panelClass: 'error-snackbar' });
    }
  }

  cerrarTab(): void {
    const idx = this.tabsService.currentIndex;
    if (idx >= 0) this.tabsService.removeTab(idx);
  }

  extraerError(e: any): string {
    const msg = e?.message || String(e);
    return msg.replace(/^Error invoking remote method '[^']+': Error: /, '');
  }
}
