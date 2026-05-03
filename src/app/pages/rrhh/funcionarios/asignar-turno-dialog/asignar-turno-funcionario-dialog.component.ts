import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-asignar-turno-funcionario-dialog',
  standalone: true,
  templateUrl: './asignar-turno-funcionario-dialog.component.html',
  styleUrls: ['./asignar-turno-funcionario-dialog.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
})
export class AsignarTurnoFuncionarioDialogComponent implements OnInit {
  form: FormGroup;
  saving = false;
  loadingTurnos = false;
  turnos: any[] = [];
  isEdit = false;

  constructor(
    private dialogRef: MatDialogRef<AsignarTurnoFuncionarioDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      funcionarioId: number;
      funcionarioNombre: string;
      funcionarioTurnoId?: number;
      turnoId?: number;
      fechaDesde?: Date | string;
    },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.isEdit = !!data?.funcionarioTurnoId;
    this.form = this.fb.group({
      turnoId: [data?.turnoId ?? null, Validators.required],
      fechaDesde: [data?.fechaDesde ? new Date(data.fechaDesde as any) : new Date(), Validators.required],
    });
    if (this.isEdit) this.form.get('turnoId')!.disable();
  }

  async ngOnInit(): Promise<void> {
    this.loadingTurnos = true;
    try {
      const all = await firstValueFrom(this.repositoryService.getTurnos());
      this.turnos = (all || []).filter((t: any) => t.activo);
    } catch (e) {
      console.error('Error cargando turnos:', e);
    } finally {
      this.loadingTurnos = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      if (this.isEdit) {
        await firstValueFrom(
          this.repositoryService.updateFuncionarioTurno(this.data.funcionarioTurnoId!, {
            fechaDesde: this.form.value.fechaDesde,
          }),
        );
      } else {
        await firstValueFrom(
          this.repositoryService.asignarTurnoFuncionario({
            funcionarioId: this.data.funcionarioId,
            turnoId: this.form.value.turnoId,
            fechaDesde: this.form.value.fechaDesde,
          }),
        );
      }
      this.dialogRef.close({ saved: true });
    } catch (e) {
      console.error('Error guardando turno:', e);
      this.snackBar.open('Error al guardar turno', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
