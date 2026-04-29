import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-generar-liquidacion-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Generar liquidación de comisión</h2>
    <mat-dialog-content>
      <div class="form">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Funcionario</mat-label>
          <mat-select [(ngModel)]="funcionarioId">
            <mat-option *ngFor="let f of funcionarios" [value]="f.id">{{ f.persona?.nombre }} {{ f.persona?.apellido }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Período (YYYY-MM)</mat-label>
          <input matInput type="month" [(ngModel)]="periodo">
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cerrar()">Cancelar</button>
      <button mat-flat-button color="primary" (click)="generar()" [disabled]="loading || !funcionarioId || !periodo">
        {{ loading ? 'Generando...' : 'Generar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.form { display: flex; flex-direction: column; gap: 8px; padding: 8px 0; } .full { width: 100%; } mat-dialog-content { min-width: 400px; }'],
})
export class GenerarLiquidacionDialogComponent implements OnInit {
  funcionarios: any[] = [];
  funcionarioId: number | null = null;
  periodo = '';
  loading = false;

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    public dialogRef: MatDialogRef<GenerarLiquidacionDialogComponent>,
  ) {}

  ngOnInit(): void {
    this.repo.getFuncionarios({}).subscribe({ next: (f) => this.funcionarios = f });
    const now = new Date();
    this.periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  async generar(): Promise<void> {
    if (!this.funcionarioId || !this.periodo) return;
    this.loading = true;
    try {
      await firstValueFrom(this.repo.generarLiquidacionComision({ funcionarioId: this.funcionarioId, periodo: this.periodo }));
      this.snackBar.open('Liquidación generada', 'OK', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (e: any) {
      this.snackBar.open('Error: ' + e.message, 'OK', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  cerrar(): void { this.dialogRef.close(false); }
}
