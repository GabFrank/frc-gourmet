import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { PdvMesa } from '../../../database/entities/ventas/pdv-mesa.entity';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface MesaSelectionDialogData {
  mesas: PdvMesa[];
  comandas?: any[];
  title: string;
  message: string;
}

@Component({
  selector: 'app-mesa-selection-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatGridListModule,
    MatIconModule,
    MatTooltipModule,
    MatBadgeModule,
    MatSnackBarModule
  ],
  templateUrl: './mesa-selection-dialog.component.html',
  styleUrls: ['./mesa-selection-dialog.component.scss']
})
export class MesaSelectionDialogComponent {
  activeTab: 'MESAS' | 'COMANDAS' = 'MESAS';
  hasComandas: boolean;
  disponiblesCount: number;
  comandasDisponiblesCount: number;

  constructor(
    public dialogRef: MatDialogRef<MesaSelectionDialogComponent>,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: MesaSelectionDialogData
  ) {
    this.hasComandas = !!(data.comandas && data.comandas.length > 0);
    this.disponiblesCount = data.mesas.filter(m => m.estado === 'DISPONIBLE').length;
    this.comandasDisponiblesCount = (data.comandas || []).filter((c: any) => c.estado === 'DISPONIBLE').length;
  }

  private get api(): any {
    return (window as any).api;
  }

  selectMesa(mesa: PdvMesa): void {
    this.dialogRef.close(mesa);
  }

  /**
   * Habilita/deshabilita el autoservicio por QR de una mesa (gate del cajero para
   * el canal MESA_QR). No cierra el diálogo. Actualiza el estado local al vuelo.
   */
  async toggleAutoservicio(mesa: PdvMesa): Promise<void> {
    const nuevo = !mesa.autoservicioActivo;
    try {
      await this.api.callIpc('set-autoservicio-mesa', mesa.id, nuevo);
      mesa.autoservicioActivo = nuevo;
      this.snackBar.open(
        nuevo ? `Mesa ${mesa.numero}: autoservicio QR habilitado` : `Mesa ${mesa.numero}: autoservicio QR deshabilitado`,
        'OK',
        { duration: 2500 },
      );
    } catch (e: any) {
      this.snackBar.open('No se pudo cambiar el autoservicio: ' + (e?.message || e), 'OK', { duration: 4000 });
    }
  }

  selectComanda(comanda: any): void {
    this.dialogRef.close({ tipo: 'comanda', comanda });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
} 