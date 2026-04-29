import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-generar-liquidaciones-mes-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Generar liquidaciones del mes</h2>
    <mat-dialog-content>
      <p class="hint">Genera o regenera las liquidaciones de comisión para todos los funcionarios con reglas activas en el período.</p>
      <mat-form-field appearance="outline" class="full">
        <mat-label>Período (YYYY-MM)</mat-label>
        <input matInput type="month" [(ngModel)]="periodo">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cerrar()">Cancelar</button>
      <button mat-flat-button color="primary" (click)="generar()" [disabled]="loading || !periodo">
        {{ loading ? 'Generando...' : 'Generar para todos' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.hint { opacity: 0.7; font-size: 13px; } .full { width: 100%; } mat-dialog-content { min-width: 350px; }'],
})
export class GenerarLiquidacionesMesDialogComponent implements OnInit {
  periodo = '';
  loading = false;

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<GenerarLiquidacionesMesDialogComponent>,
  ) {}

  ngOnInit(): void {
    const now = new Date();
    this.periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  async generar(): Promise<void> {
    if (!this.periodo) return;
    this.loading = true;
    try {
      const resultados = await firstValueFrom(this.repo.generarLiquidacionesComisionMes(this.periodo));
      const ok = (resultados as any[]).filter((r) => r.ok).length;
      const err = (resultados as any[]).filter((r) => !r.ok).length;
      this.snackBar.open(`Generadas: ${ok} ok, ${err} errores`, 'OK', { duration: 5000 });
      this.dialogRef.close(true);
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  cerrar(): void { this.dialogRef.close(false); }
}
