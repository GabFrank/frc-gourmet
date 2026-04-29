import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { MarcarAsistenciaMasivaDialogComponent } from './marcar-asistencia-masiva-dialog.component';

const ESTADOS = ['PRESENTE', 'AUSENTE', 'TARDANZA', 'MEDIA_FALTA', 'JUSTIFICADO', 'FERIADO', 'VACACION'];

@Component({
  selector: 'app-list-asistencias',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="page">
      <mat-card>
        <mat-card-content>
          <div class="header">
            <div class="title"><mat-icon>fact_check</mat-icon> <h2>Asistencias</h2></div>
            <button mat-flat-button color="primary" (click)="abrirMasiva()">
              <mat-icon>group</mat-icon> Marcar masiva
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-content>
          <div class="filtros">
            <mat-form-field appearance="outline">
              <mat-label>Desde</mat-label>
              <input matInput [matDatepicker]="p1" [(ngModel)]="fechaDesde" />
              <mat-datepicker-toggle matSuffix [for]="p1"></mat-datepicker-toggle>
              <mat-datepicker #p1></mat-datepicker>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Hasta</mat-label>
              <input matInput [matDatepicker]="p2" [(ngModel)]="fechaHasta" />
              <mat-datepicker-toggle matSuffix [for]="p2"></mat-datepicker-toggle>
              <mat-datepicker #p2></mat-datepicker>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Estado</mat-label>
              <mat-select [(ngModel)]="estado">
                <mat-option [value]="null">Todos</mat-option>
                <mat-option *ngFor="let e of estados" [value]="e">{{ e }}</mat-option>
              </mat-select>
            </mat-form-field>
            <button mat-flat-button color="primary" (click)="load()">
              <mat-icon>search</mat-icon> Filtrar
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-content>
          <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="40"></mat-progress-spinner></div>
          <table mat-table [dataSource]="asistencias" class="full" *ngIf="!loading">
            <ng-container matColumnDef="fecha">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let a">{{ a.fecha | date:'shortDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="funcionario">
              <th mat-header-cell *matHeaderCellDef>Funcionario</th>
              <td mat-cell *matCellDef="let a">
                {{ a.funcionario?.persona?.nombre }} {{ a.funcionario?.persona?.apellido || '' }}
              </td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let a">
                <span class="estado-tag" [ngClass]="'tag-' + a.estado">{{ a.estado }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="entrada">
              <th mat-header-cell *matHeaderCellDef>Entrada</th>
              <td mat-cell *matCellDef="let a">{{ a.horaEntrada || '-' }}</td>
            </ng-container>
            <ng-container matColumnDef="salida">
              <th mat-header-cell *matHeaderCellDef>Salida</th>
              <td mat-cell *matCellDef="let a">{{ a.horaSalida || '-' }}</td>
            </ng-container>
            <ng-container matColumnDef="tardanza">
              <th mat-header-cell *matHeaderCellDef>Tardanza</th>
              <td mat-cell *matCellDef="let a">{{ a.minutosTardanza > 0 ? a.minutosTardanza + ' min' : '-' }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef class="acc-col">Acciones</th>
              <td mat-cell *matCellDef="let a">
                <button mat-icon-button [matMenuTriggerFor]="menu"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="justificar(a)" [disabled]="a.justificada">
                    <mat-icon>check</mat-icon><span>Justificar</span>
                  </button>
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
          <div *ngIf="!loading && asistencias.length === 0" class="empty">Sin asistencias.</div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .title { display: flex; align-items: center; gap: 8px; h2 { margin: 0; font-size: 20px; } }
    .filtros { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    table { width: 100%; }
    .empty { padding: 16px; text-align: center; opacity: 0.7; }
    .acc-col { width: 60px; }
    .estado-tag {
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      &.tag-PRESENTE { background: #e8f5e9; color: #2e7d32; }
      &.tag-AUSENTE { background: #ffebee; color: #c62828; }
      &.tag-TARDANZA { background: #fff3e0; color: #e65100; }
      &.tag-JUSTIFICADO { background: #e3f2fd; color: #1565c0; }
      &.tag-MEDIA_FALTA { background: #fff8e1; color: #f57f17; }
      &.tag-FERIADO { background: #f3e5f5; color: #6a1b9a; }
      &.tag-VACACION { background: #e0f2f1; color: #00695c; }
    }
  `],
})
export class ListAsistenciasComponent implements OnInit {
  asistencias: any[] = [];
  loading = false;
  cols = ['fecha', 'funcionario', 'estado', 'entrada', 'salida', 'tardanza', 'actions'];
  estados = ESTADOS;
  fechaDesde: Date = new Date();
  fechaHasta: Date = new Date();
  estado: string | null = null;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnInit(): void {
    // Default: ultimo mes
    const d = new Date();
    d.setDate(d.getDate() - 30);
    this.fechaDesde = d;
    this.load();
  }

  toIsoDate(d: Date): string {
    if (!d) return '';
    return d.toISOString().slice(0, 10);
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.asistencias = await firstValueFrom(this.repositoryService.getAsistencias({
        fechaDesde: this.toIsoDate(this.fechaDesde),
        fechaHasta: this.toIsoDate(this.fechaHasta),
        estado: this.estado,
      }));
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar asistencias', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  abrirMasiva(): void {
    const ref = this.dialog.open(MarcarAsistenciaMasivaDialogComponent, { width: '900px' });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.load(); });
  }

  async justificar(a: any): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.justificarAsistencia(a.id, { motivo: '' }));
      this.snackBar.open('Asistencia justificada', 'Cerrar', { duration: 2500 });
      this.load();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al justificar', 'Cerrar', { duration: 3500 });
    }
  }
}
