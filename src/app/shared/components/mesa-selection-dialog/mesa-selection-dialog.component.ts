import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { PdvMesa } from '../../../database/entities/ventas/pdv-mesa.entity';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface MesaSelectionDialogData {
  mesas: PdvMesa[];
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
    MatTooltipModule
  ],
  templateUrl: './mesa-selection-dialog.component.html',
  styleUrls: ['./mesa-selection-dialog.component.scss']
})
export class MesaSelectionDialogComponent {
  
  constructor(
    public dialogRef: MatDialogRef<MesaSelectionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MesaSelectionDialogData
  ) { }

  selectMesa(mesa: PdvMesa): void {
    this.dialogRef.close(mesa);
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
} 