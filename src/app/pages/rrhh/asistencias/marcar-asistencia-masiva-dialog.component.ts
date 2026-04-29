import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

const ESTADOS = ['PRESENTE', 'AUSENTE', 'TARDANZA', 'MEDIA_FALTA', 'JUSTIFICADO', 'FERIADO', 'VACACION'];

interface FilaMarcado {
  funcionarioId: number;
  nombre: string;
  estado: string;
  horaEntrada: string;
  horaSalida: string;
  turnoId: number | null;
  observacion: string;
}

@Component({
  selector: 'app-marcar-asistencia-masiva-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Marcar asistencia masiva</h2>
    <mat-dialog-content>
      <div class="header-form">
        <mat-form-field appearance="outline">
          <mat-label>Fecha</mat-label>
          <input matInput [matDatepicker]="p" [(ngModel)]="fecha" />
          <mat-datepicker-toggle matSuffix [for]="p"></mat-datepicker-toggle>
          <mat-datepicker #p></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Aplicar estado a todos</mat-label>
          <mat-select [(ngModel)]="estadoMasivo" (selectionChange)="aplicarEstadoMasivo()">
            <mat-option [value]="null">--</mat-option>
            <mat-option *ngFor="let e of estados" [value]="e">{{ e }}</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="32"></mat-progress-spinner></div>

      <table mat-table [dataSource]="filas" class="full" *ngIf="!loading">
        <ng-container matColumnDef="nombre">
          <th mat-header-cell *matHeaderCellDef>Funcionario</th>
          <td mat-cell *matCellDef="let f">{{ f.nombre }}</td>
        </ng-container>
        <ng-container matColumnDef="estado">
          <th mat-header-cell *matHeaderCellDef>Estado</th>
          <td mat-cell *matCellDef="let f">
            <mat-form-field appearance="outline" class="compact">
              <mat-select [(ngModel)]="f.estado">
                <mat-option *ngFor="let e of estados" [value]="e">{{ e }}</mat-option>
              </mat-select>
            </mat-form-field>
          </td>
        </ng-container>
        <ng-container matColumnDef="entrada">
          <th mat-header-cell *matHeaderCellDef>Entrada</th>
          <td mat-cell *matCellDef="let f">
            <mat-form-field appearance="outline" class="compact">
              <input matInput [(ngModel)]="f.horaEntrada" placeholder="HH:mm" />
            </mat-form-field>
          </td>
        </ng-container>
        <ng-container matColumnDef="salida">
          <th mat-header-cell *matHeaderCellDef>Salida</th>
          <td mat-cell *matCellDef="let f">
            <mat-form-field appearance="outline" class="compact">
              <input matInput [(ngModel)]="f.horaSalida" placeholder="HH:mm" />
            </mat-form-field>
          </td>
        </ng-container>
        <ng-container matColumnDef="turno">
          <th mat-header-cell *matHeaderCellDef>Turno</th>
          <td mat-cell *matCellDef="let f">
            <mat-form-field appearance="outline" class="compact">
              <mat-select [(ngModel)]="f.turnoId">
                <mat-option [value]="null">--</mat-option>
                <mat-option *ngFor="let t of turnos" [value]="t.id">{{ t.nombre }}</mat-option>
              </mat-select>
            </mat-form-field>
          </td>
        </ng-container>
        <ng-container matColumnDef="obs">
          <th mat-header-cell *matHeaderCellDef>Observacion</th>
          <td mat-cell *matCellDef="let f">
            <mat-form-field appearance="outline" class="compact">
              <input matInput [(ngModel)]="f.observacion" />
            </mat-form-field>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="cols"></tr>
        <tr mat-row *matRowDef="let row; columns: cols"></tr>
      </table>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="saving || filas.length === 0">
        Guardar marcas
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .header-form { display: flex; gap: 12px; margin-bottom: 12px; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    table { width: 100%; }
    .compact { width: 100%; }
    .compact ::ng-deep .mat-mdc-form-field-subscript-wrapper { display: none; }
  `],
})
export class MarcarAsistenciaMasivaDialogComponent implements OnInit {
  loading = false;
  saving = false;
  fecha: Date = new Date();
  estadoMasivo: string | null = null;
  estados = ESTADOS;
  cols = ['nombre', 'estado', 'entrada', 'salida', 'turno', 'obs'];
  funcionarios: any[] = [];
  turnos: any[] = [];
  filas: FilaMarcado[] = [];

  constructor(
    private dialogRef: MatDialogRef<MarcarAsistenciaMasivaDialogComponent>,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const [funcs, turnos] = await Promise.all([
        firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true })),
        firstValueFrom(this.repositoryService.getTurnos()),
      ]);
      this.funcionarios = funcs || [];
      this.turnos = (turnos || []).filter((t: any) => t.activo);
      this.filas = this.funcionarios.map((f: any) => ({
        funcionarioId: f.id,
        nombre: `${f.persona?.nombre || ''} ${f.persona?.apellido || ''}`.trim(),
        estado: 'PRESENTE',
        horaEntrada: '',
        horaSalida: '',
        turnoId: null,
        observacion: '',
      }));
    } catch (e) {
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  aplicarEstadoMasivo(): void {
    if (!this.estadoMasivo) return;
    this.filas.forEach((f) => f.estado = this.estadoMasivo!);
  }

  cancel(): void { this.dialogRef.close(); }

  toIsoDate(d: Date): string { return d.toISOString().slice(0, 10); }

  async submit(): Promise<void> {
    this.saving = true;
    try {
      const items = this.filas.map((f) => ({
        funcionarioId: f.funcionarioId,
        estado: f.estado,
        horaEntrada: f.horaEntrada || undefined,
        horaSalida: f.horaSalida || undefined,
        turnoId: f.turnoId || undefined,
        observacion: f.observacion || undefined,
      }));
      const results = await firstValueFrom(this.repositoryService.marcarAsistenciaMasiva({
        fecha: this.toIsoDate(this.fecha),
        items,
      }));
      const ok = (results || []).filter((r: any) => r.ok).length;
      const fail = (results || []).length - ok;
      this.snackBar.open(`Marcadas ${ok} asistencias` + (fail ? `, ${fail} con error` : ''), 'Cerrar', { duration: 3500 });
      this.dialogRef.close({ saved: true });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al marcar masiva', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
