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
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-cambio-salario-dialog',
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
    <h2 mat-dialog-title>Ajustar salario</h2>
    <mat-dialog-content>
      <p class="info">Funcionario: <strong>{{ data.funcionario?.persona?.nombre }} {{ data.funcionario?.persona?.apellido || '' }}</strong></p>
      <p class="info">Salario actual: <strong>{{ data.funcionario?.salarioBase | number:'1.0-2' }} {{ data.funcionario?.monedaSalario?.simbolo }}</strong></p>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Nuevo salario</mat-label>
          <input matInput type="number" formControlName="salarioNuevo" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Moneda</mat-label>
          <mat-select formControlName="monedaId">
            <mat-option *ngFor="let m of monedas" [value]="m.id">{{ m.denominacion }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Vigente desde</mat-label>
          <input matInput [matDatepicker]="p" formControlName="fechaVigencia" />
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
    .form { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; min-width: 540px; }
    .full { grid-column: 1 / -1; }
    .info { margin: 4px 0; opacity: 0.85; }
  `],
})
export class CambioSalarioDialogComponent implements OnInit {
  form: FormGroup;
  saving = false;
  monedas: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<CambioSalarioDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { funcionario: any },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      salarioNuevo: [data.funcionario?.salarioBase || 0, [Validators.required, Validators.min(0)]],
      monedaId: [data.funcionario?.monedaSalario?.id || null, Validators.required],
      fechaVigencia: [new Date(), Validators.required],
      motivo: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
    } catch (e) {
      console.error(e);
    }
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.cambiarSalarioFuncionario(this.data.funcionario.id, this.form.value));
      this.snackBar.open('Salario actualizado', 'Cerrar', { duration: 2500 });
      this.dialogRef.close({ saved: true });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cambiar salario', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
