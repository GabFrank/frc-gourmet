import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

const ESTADOS = ['PRESENTE', 'AUSENTE', 'TARDANZA', 'MEDIA_FALTA', 'JUSTIFICADO', 'FERIADO', 'VACACION'];

@Component({
  selector: 'app-marcar-asistencia-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Marcar asistencia</h2>
    <mat-dialog-content>
      <div *ngIf="loading" class="spinner-wrap">
        <mat-progress-spinner mode="indeterminate" diameter="32"></mat-progress-spinner>
      </div>

      <form *ngIf="!loading" [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="col-2">
          <mat-label>Funcionario</mat-label>
          <mat-select formControlName="funcionarioId" (selectionChange)="onFuncionarioChange($event.value)">
            <mat-option *ngFor="let f of funcionarios" [value]="f.id">
              {{ f.persona?.nombre }} {{ f.persona?.apellido || '' }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Fecha</mat-label>
          <input matInput [matDatepicker]="dp" formControlName="fecha" />
          <mat-datepicker-toggle matSuffix [for]="dp"></mat-datepicker-toggle>
          <mat-datepicker #dp></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Estado</mat-label>
          <mat-select formControlName="estado">
            <mat-option *ngFor="let e of estados" [value]="e">{{ e }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Turno</mat-label>
          <mat-select formControlName="turnoId">
            <mat-option [value]="null">Sin turno</mat-option>
            <mat-option *ngFor="let t of turnos" [value]="t.id">
              {{ t.nombre }} ({{ t.horaEntrada }} - {{ t.horaSalida }})
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Hora entrada</mat-label>
          <input matInput type="time" formControlName="horaEntrada" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Hora salida</mat-label>
          <input matInput type="time" formControlName="horaSalida" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="col-2">
          <mat-label>Observacion</mat-label>
          <input matInput formControlName="observacion" maxlength="200" />
        </mat-form-field>

        <mat-checkbox formControlName="justificada" class="col-2">Justificada (no genera penalizacion)</mat-checkbox>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="form.invalid || saving || loading">
        Guardar
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .col-2 { grid-column: 1 / -1; }
    .spinner-wrap { display: flex; justify-content: center; padding: 24px; }
  `],
})
export class MarcarAsistenciaDialogComponent implements OnInit {
  form: FormGroup;
  funcionarios: any[] = [];
  turnos: any[] = [];
  estados = ESTADOS;
  loading = false;
  saving = false;

  constructor(
    private dialogRef: MatDialogRef<MarcarAsistenciaDialogComponent>,
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      funcionarioId: [null, Validators.required],
      fecha: [new Date(), Validators.required],
      estado: ['PRESENTE', Validators.required],
      turnoId: [null],
      horaEntrada: [''],
      horaSalida: [''],
      observacion: [''],
      justificada: [false],
    });
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const [funcs, turnos] = await Promise.all([
        firstValueFrom(this.repositoryService.getFuncionarios({ activo: true })),
        firstValueFrom(this.repositoryService.getTurnos()),
      ]);
      this.funcionarios = (funcs || []).filter((f: any) => f.activo);
      this.turnos = (turnos || []).filter((t: any) => t.activo);
    } catch (e) {
      console.error('Error cargando datos:', e);
      this.snackBar.open('Error al cargar funcionarios/turnos', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  async onFuncionarioChange(funcionarioId: number): Promise<void> {
    if (!funcionarioId) return;
    try {
      const ftList: any[] = await firstValueFrom(this.repositoryService.getFuncionarioTurnos(funcionarioId)) || [];
      const activo = ftList.find((ft: any) => !ft.fechaHasta);
      if (activo?.turno?.id && !this.form.value.turnoId) {
        this.form.patchValue({ turnoId: activo.turno.id });
      }
    } catch (e) {
      console.error('Error cargando turno activo del funcionario:', e);
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  toIsoDate(d: Date): string {
    if (!d) return '';
    return d.toISOString().slice(0, 10);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      const v = this.form.value;
      await firstValueFrom(this.repositoryService.createAsistencia({
        funcionarioId: v.funcionarioId,
        fecha: this.toIsoDate(v.fecha),
        estado: v.estado,
        turnoId: v.turnoId || undefined,
        horaEntrada: v.horaEntrada || undefined,
        horaSalida: v.horaSalida || undefined,
        observacion: (v.observacion || '').toUpperCase() || undefined,
        justificada: !!v.justificada,
      }));
      this.dialogRef.close({ saved: true });
    } catch (e: any) {
      console.error('Error guardando asistencia:', e);
      this.snackBar.open(`Error: ${e?.message || 'no se pudo guardar'}`, 'Cerrar', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }
}
