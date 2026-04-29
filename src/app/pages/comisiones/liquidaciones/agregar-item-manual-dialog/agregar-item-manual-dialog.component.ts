import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-agregar-item-manual-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Agregar item manual</h2>
    <mat-dialog-content>
      <div class="form">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Concepto</mat-label>
          <input matInput [(ngModel)]="concepto" placeholder="Ej: BONO ESPECIAL">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Monto</mat-label>
          <input matInput type="number" [(ngModel)]="monto" min="0">
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Observación</mat-label>
          <textarea matInput [(ngModel)]="observacion" rows="2"></textarea>
        </mat-form-field>
        <mat-slide-toggle [(ngModel)]="esDescuento">Es descuento</mat-slide-toggle>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cerrar()">Cancelar</button>
      <button mat-flat-button color="primary" (click)="guardar()" [disabled]="loading || !concepto || !monto">
        {{ loading ? 'Guardando...' : 'Agregar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.form { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; } .full { width: 100%; } mat-dialog-content { min-width: 400px; }'],
})
export class AgregarItemManualDialogComponent {
  concepto = '';
  monto = 0;
  observacion = '';
  esDescuento = false;
  loading = false;

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<AgregarItemManualDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { liquidacionId: number },
  ) {}

  async guardar(): Promise<void> {
    if (!this.concepto || !this.monto) return;
    this.loading = true;
    try {
      await firstValueFrom(this.repo.agregarItemManualLiquidacionComision({
        liquidacionId: this.data.liquidacionId,
        concepto: this.concepto,
        monto: this.monto,
        esDescuento: this.esDescuento,
        observacion: this.observacion,
      }));
      this.snackBar.open('Item agregado', 'OK', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  cerrar(): void { this.dialogRef.close(false); }
}
