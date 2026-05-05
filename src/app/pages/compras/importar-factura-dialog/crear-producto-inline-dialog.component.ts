import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from 'src/app/database/repository.service';
import { ProductoTipo } from 'src/app/database/entities/productos/producto-tipo.enum';

@Component({
  selector: 'app-crear-producto-inline-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Crear producto rápido</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Nombre del producto</mat-label>
        <input matInput [(ngModel)]="nombre" required />
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Tipo</mat-label>
        <mat-select [(ngModel)]="tipo">
          <mat-option [value]="'RETAIL'">RETAIL (reventa)</mat-option>
          <mat-option [value]="'RETAIL_INGREDIENTE'">RETAIL + INGREDIENTE</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Unidad base</mat-label>
        <mat-select [(ngModel)]="unidadBase">
          <mat-option value="UNIDAD">UNIDAD</mat-option>
          <mat-option value="KG">KG</mat-option>
          <mat-option value="LITRO">LITRO</mat-option>
          <mat-option value="GRAMO">GRAMO</mat-option>
          <mat-option value="MILILITRO">MILILITRO</mat-option>
        </mat-select>
      </mat-form-field>

      <h4>Presentación principal</h4>
      <div class="row">
        <mat-form-field appearance="outline" class="grow">
          <mat-label>Nombre presentación</mat-label>
          <input matInput [(ngModel)]="presentacionNombre" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="qty">
          <mat-label>Cantidad</mat-label>
          <input matInput type="number" [(ngModel)]="presentacionCantidad" />
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="guardar()" [disabled]="saving || !nombre">
        <mat-icon>save</mat-icon>
        <span *ngIf="!saving">Crear</span>
        <mat-spinner *ngIf="saving" diameter="18"></mat-spinner>
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full-width { width: 100%; display: block; margin-bottom: 8px; }
    .row { display: flex; gap: 12px; }
    .grow { flex: 1; }
    .qty { width: 140px; }
    h4 { margin: 12px 0 4px 0; color: var(--text-secondary); font-size: 13px; }
  `],
})
export class CrearProductoInlineDialogComponent {
  nombre = '';
  tipo: string = 'RETAIL';
  unidadBase = 'UNIDAD';
  presentacionNombre = 'UNIDAD';
  presentacionCantidad = 1;
  saving = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { descripcionOcr?: string },
    private repo: RepositoryService,
    private dialogRef: MatDialogRef<CrearProductoInlineDialogComponent>,
    private snackBar: MatSnackBar,
  ) {
    if (data?.descripcionOcr) {
      this.nombre = data.descripcionOcr.toUpperCase();
    }
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }

  guardar(): void {
    if (!this.nombre?.trim()) return;
    this.saving = true;
    this.repo.createProducto({
      nombre: this.nombre.trim().toUpperCase(),
      tipo: this.tipo as ProductoTipo,
      unidadBase: this.unidadBase,
      esVendible: true,
      esComprable: true,
      esIngrediente: this.tipo === 'RETAIL_INGREDIENTE',
      controlaStock: true,
      activo: true,
    } as any).subscribe({
      next: (prod: any) => {
        // Crear presentacion principal
        this.repo.createPresentacion({
          producto: { id: prod.id } as any,
          nombre: (this.presentacionNombre || 'UNIDAD').toUpperCase(),
          cantidad: Number(this.presentacionCantidad) || 1,
          principal: true,
          activo: true,
        } as any).subscribe({
          next: (pres: any) => {
            this.saving = false;
            this.dialogRef.close({ producto: prod, presentacion: pres });
          },
          error: (err) => {
            this.saving = false;
            this.snackBar.open('Producto creado, error al crear presentacion: ' + err?.message, 'Cerrar', { duration: 6000 });
            this.dialogRef.close({ producto: prod, presentacion: null });
          },
        });
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open('Error al crear producto: ' + err?.message, 'Cerrar', { duration: 5000 });
      },
    });
  }
}
