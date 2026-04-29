import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

const MOTIVOS = [
  'RENUNCIA',
  'DESPIDO_JUSTIFICADO',
  'DESPIDO_INJUSTIFICADO',
  'MUTUO_ACUERDO',
  'JUBILACION',
  'FALLECIMIENTO',
  'OTRO',
];

@Component({
  selector: 'app-egresar-funcionario-dialog',
  standalone: true,
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
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Registrar egreso</h2>
    <mat-dialog-content>
      <p class="warning">Esta accion marcara al funcionario como inactivo.</p>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Fecha de egreso</mat-label>
          <input matInput [matDatepicker]="p" formControlName="fechaEgreso" />
          <mat-datepicker-toggle matSuffix [for]="p"></mat-datepicker-toggle>
          <mat-datepicker #p></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Motivo</mat-label>
          <mat-select formControlName="motivoEgreso">
            <mat-option *ngFor="let m of motivos" [value]="m">{{ m }}</mat-option>
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="warn" (click)="submit()" [disabled]="form.invalid || saving">
        Registrar egreso
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-width: 460px; }
    .warning { color: #e65100; margin: 4px 0 12px; }
  `],
})
export class EgresarFuncionarioDialogComponent {
  form: FormGroup;
  saving = false;
  motivos = MOTIVOS;

  constructor(
    private dialogRef: MatDialogRef<EgresarFuncionarioDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { funcionario: any },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      fechaEgreso: [new Date(), Validators.required],
      motivoEgreso: ['RENUNCIA', Validators.required],
    });
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.egresarFuncionario(this.data.funcionario.id, this.form.value));
      this.snackBar.open('Egreso registrado', 'Cerrar', { duration: 2500 });
      this.dialogRef.close({ saved: true });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al registrar egreso', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
