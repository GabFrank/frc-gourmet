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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-cambio-cargo-dialog',
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
    MatIconModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Cambiar cargo</h2>
    <mat-dialog-content>
      <p class="info">Funcionario: <strong>{{ data.funcionario?.persona?.nombre }} {{ data.funcionario?.persona?.apellido || '' }}</strong></p>
      <p class="info">Cargo actual: <strong>{{ data.funcionario?.cargo?.nombre }}</strong></p>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Nuevo cargo</mat-label>
          <mat-select formControlName="nuevoCargoId">
            <mat-option *ngFor="let c of cargos" [value]="c.id">{{ c.nombre }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Vigente desde</mat-label>
          <input matInput [matDatepicker]="p" formControlName="fechaDesde" />
          <mat-datepicker-toggle matSuffix [for]="p"></mat-datepicker-toggle>
          <mat-datepicker #p></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Motivo</mat-label>
          <input matInput formControlName="motivo" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="form.invalid || saving">
        Confirmar
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-width: 460px; }
    .full { grid-column: 1 / -1; }
    .info { margin: 4px 0; opacity: 0.85; }
  `],
})
export class CambioCargoDialogComponent implements OnInit {
  form: FormGroup;
  saving = false;
  cargos: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<CambioCargoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { funcionario: any },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      nuevoCargoId: [null, Validators.required],
      fechaDesde: [new Date(), Validators.required],
      motivo: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const cargos = await firstValueFrom(this.repositoryService.getCargos());
      this.cargos = (cargos || []).filter((c: any) => c.activo && c.id !== this.data.funcionario?.cargo?.id);
    } catch (e) {
      console.error(e);
    }
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.cambiarCargoFuncionario(this.data.funcionario.id, this.form.value));
      this.snackBar.open('Cargo actualizado', 'Cerrar', { duration: 2500 });
      this.dialogRef.close({ saved: true });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cambiar cargo', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
