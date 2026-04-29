import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-liquidacion-comision-detalle',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatChipsModule,
    MatSnackBarModule,
  ],
  templateUrl: './liquidacion-comision-detalle.component.html',
  styleUrls: ['./liquidacion-comision-detalle.component.scss'],
})
export class LiquidacionComisionDetalleComponent implements OnInit {
  liquidacion: any = null;
  loading = false;
  itemsColumns = ['concepto', 'monto', 'esManual', 'acciones'];

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<LiquidacionComisionDetalleComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { liquidacionId: number },
  ) {}

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.loading = true;
    this.repo.getLiquidacionComision(this.data.liquidacionId).subscribe({
      next: (l) => { this.liquidacion = l; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  async eliminarItem(item: any): Promise<void> {
    try {
      await firstValueFrom(this.repo.eliminarItemLiquidacionComision(item.id));
      this.snackBar.open('Item eliminado', 'OK', { duration: 3000 });
      this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    }
  }

  cerrar(): void { this.dialogRef.close(); }
}
