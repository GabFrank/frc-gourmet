import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-list-aguinaldos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="page">
      <mat-card>
        <mat-card-content>
          <div class="header">
            <div class="title"><mat-icon>star</mat-icon> <h2>Aguinaldos (13o salario)</h2></div>
            <div class="actions-header">
              <mat-form-field appearance="outline" class="anio">
                <mat-label>Anio</mat-label>
                <input matInput type="number" [(ngModel)]="anio" />
              </mat-form-field>
              <button mat-stroked-button color="primary" (click)="load()">
                <mat-icon>search</mat-icon> Buscar
              </button>
              <button mat-flat-button color="primary" (click)="recalcular()">
                <mat-icon>calculate</mat-icon> Recalcular {{ anio }}
              </button>
            </div>
          </div>
          <p class="info">El aguinaldo se calcula como 1/12 del total de haberes liquidados (APROBADA o PAGADA) en el anio.</p>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-content>
          <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="40"></mat-progress-spinner></div>
          <table mat-table [dataSource]="aguinaldos" class="full" *ngIf="!loading">
            <ng-container matColumnDef="anio">
              <th mat-header-cell *matHeaderCellDef>Anio</th>
              <td mat-cell *matCellDef="let a">{{ a.anio }}</td>
            </ng-container>
            <ng-container matColumnDef="funcionario">
              <th mat-header-cell *matHeaderCellDef>Funcionario</th>
              <td mat-cell *matCellDef="let a">{{ a.funcionario?.persona?.nombre }} {{ a.funcionario?.persona?.apellido || '' }}</td>
            </ng-container>
            <ng-container matColumnDef="meses">
              <th mat-header-cell *matHeaderCellDef>Meses trab.</th>
              <td mat-cell *matCellDef="let a">{{ a.mesesTrabajados }}</td>
            </ng-container>
            <ng-container matColumnDef="monto">
              <th mat-header-cell *matHeaderCellDef>Monto</th>
              <td mat-cell *matCellDef="let a">{{ a.montoCalculado | number:'1.0-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let a">{{ a.estado }}</td>
            </ng-container>
            <ng-container matColumnDef="fechaPago">
              <th mat-header-cell *matHeaderCellDef>Fecha pago</th>
              <td mat-cell *matCellDef="let a">{{ (a.fechaPago | date:'shortDate') || '-' }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
          <div *ngIf="!loading && aguinaldos.length === 0" class="empty">Sin aguinaldos para {{ anio }}.</div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
    .title { display: flex; align-items: center; gap: 8px; h2 { margin: 0; font-size: 20px; } }
    .actions-header { display: flex; gap: 12px; align-items: center; }
    .anio { width: 120px; }
    .info { opacity: 0.75; font-size: 13px; margin: 8px 0 0; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    table { width: 100%; }
    .empty { padding: 16px; text-align: center; opacity: 0.7; }
  `],
})
export class ListAguinaldosComponent implements OnInit {
  aguinaldos: any[] = [];
  loading = false;
  cols = ['anio', 'funcionario', 'meses', 'monto', 'estado', 'fechaPago'];
  anio: number = new Date().getFullYear();

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.aguinaldos = await firstValueFrom(this.repositoryService.getAguinaldos({ anio: this.anio }));
    } catch (e) { console.error(e); }
    finally { this.loading = false; }
  }

  async recalcular(): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Recalcular aguinaldos',
        message: `¿Recalcular aguinaldos para ${this.anio}? Los aguinaldos PAGADOS no seran modificados.`,
        confirmText: 'Recalcular',
        cancelText: 'Cancelar',
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.calcularAguinaldosAnio(this.anio));
      this.snackBar.open('Aguinaldos calculados', 'Cerrar', { duration: 2500 });
      this.load();
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    }
  }
}
