import { Component, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-crear-proveedor-inline-dialog',
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
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Crear proveedor nuevo</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Nombre / razón social</mat-label>
        <input matInput [(ngModel)]="nombre" required />
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>RUC</mat-label>
        <input matInput [(ngModel)]="ruc" />
      </mat-form-field>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Teléfono</mat-label>
        <input matInput [(ngModel)]="telefono" />
      </mat-form-field>
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
  `],
})
export class CrearProveedorInlineDialogComponent {
  nombre = '';
  ruc = '';
  telefono = '';
  saving = false;

  constructor(
    private repo: RepositoryService,
    private dialogRef: MatDialogRef<CrearProveedorInlineDialogComponent>,
    private snackBar: MatSnackBar,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: { nombre?: string; ruc?: string; telefono?: string } | null,
  ) {
    if (data?.nombre) this.nombre = (data.nombre || '').trim();
    if (data?.ruc) this.ruc = (data.ruc || '').trim();
    if (data?.telefono) this.telefono = (data.telefono || '').trim();
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }

  guardar(): void {
    if (!this.nombre?.trim()) return;
    this.saving = true;
    this.repo.createProveedor({
      nombre: this.nombre.trim().toUpperCase(),
      ruc: this.ruc?.trim() || undefined,
      telefono: this.telefono?.trim() || undefined,
      activo: true,
    } as any).subscribe({
      next: (p) => {
        this.saving = false;
        this.dialogRef.close(p);
      },
      error: (err) => {
        this.saving = false;
        this.snackBar.open('Error al crear proveedor: ' + err?.message, 'Cerrar', { duration: 5000 });
      },
    });
  }
}
