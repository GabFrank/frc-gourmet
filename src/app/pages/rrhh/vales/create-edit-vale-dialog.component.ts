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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-create-edit-vale-dialog',
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
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Crear vale / adelanto</h2>
    <mat-dialog-content class="dialog-content">
      <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="40"></mat-progress-spinner></div>
      <form [formGroup]="form" *ngIf="!loading" class="form">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Funcionario</mat-label>
          <mat-select formControlName="funcionarioId">
            <mat-option *ngFor="let f of funcionarios" [value]="f.id">
              {{ f.persona?.nombre }} {{ f.persona?.apellido || '' }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Motivo</mat-label>
          <mat-select formControlName="motivoId">
            <mat-option [value]="null">-- Sin motivo --</mat-option>
            <mat-option *ngFor="let m of motivos" [value]="m.id">{{ m.nombre }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Monto</mat-label>
          <input matInput type="number" formControlName="monto" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Fecha</mat-label>
          <input matInput [matDatepicker]="p" formControlName="fecha" />
          <mat-datepicker-toggle matSuffix [for]="p"></mat-datepicker-toggle>
          <mat-datepicker #p></mat-datepicker>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Moneda</mat-label>
          <mat-select formControlName="monedaId">
            <mat-option *ngFor="let m of monedas" [value]="m.id">{{ m.denominacion }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Caja Mayor (opcional)</mat-label>
          <mat-select formControlName="cajaMayorId">
            <mat-option [value]="null">-- Definir luego --</mat-option>
            <mat-option *ngFor="let c of cajasMayor" [value]="c.id">{{ c.nombre }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Forma de pago (opcional)</mat-label>
          <mat-select formControlName="formaPagoId">
            <mat-option [value]="null">-- Definir luego --</mat-option>
            <mat-option *ngFor="let f of formasPago" [value]="f.id">{{ f.descripcion || f.nombre }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Descripcion</mat-label>
          <input matInput formControlName="descripcion" />
        </mat-form-field>

        <mat-slide-toggle formControlName="esAdelanto">
          Es adelanto de salario (se descuenta automatico en proxima liquidacion)
        </mat-slide-toggle>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="form.invalid || saving">
        Crear (estado SOLICITADO)
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-content { min-width: 720px; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: center; }
    .full { grid-column: 1 / -1; }
  `],
})
export class CreateEditValeDialogComponent implements OnInit {
  loading = false;
  saving = false;
  form!: FormGroup;
  funcionarios: any[] = [];
  motivos: any[] = [];
  monedas: any[] = [];
  cajasMayor: any[] = [];
  formasPago: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<CreateEditValeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      funcionarioId: [null, Validators.required],
      motivoId: [null],
      monto: [0, [Validators.required, Validators.min(1)]],
      fecha: [new Date(), Validators.required],
      monedaId: [null, Validators.required],
      cajaMayorId: [null],
      formaPagoId: [null],
      descripcion: [''],
      esAdelanto: [false],
    });
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const [funcs, motivos, monedas, cajasMayor, formasPago] = await Promise.all([
        firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true })),
        firstValueFrom(this.repositoryService.getMotivosVale()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getFormasPago()),
      ]);
      this.funcionarios = funcs || [];
      this.motivos = (motivos || []).filter((m: any) => m.activo);
      this.monedas = monedas || [];
      this.cajasMayor = (cajasMayor || []).filter((c: any) => c.estado === 'ABIERTA' || c.estado === 'ACTIVA');
      this.formasPago = formasPago || [];
    } catch (e) {
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.createVale(this.form.value));
      this.snackBar.open('Vale creado en estado SOLICITADO', 'Cerrar', { duration: 3000 });
      this.dialogRef.close({ saved: true });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al crear vale', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
