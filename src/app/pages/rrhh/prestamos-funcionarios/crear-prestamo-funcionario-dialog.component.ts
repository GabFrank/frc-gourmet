import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
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
  selector: 'app-crear-prestamo-funcionario-dialog',
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
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Nuevo prestamo a funcionario</h2>
    <mat-dialog-content>
      <p class="info">La empresa entrega el dinero al funcionario. Se generara un movimiento EGRESO en Caja Mayor por el monto total.</p>
      <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="32"></mat-progress-spinner></div>
      <form [formGroup]="form" *ngIf="!loading" class="form">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Funcionario</mat-label>
          <mat-select formControlName="funcionarioId">
            <mat-option *ngFor="let f of funcionarios" [value]="f.id">
              {{ f.persona?.nombre }} {{ f.persona?.apellido || '' }}
            </mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Descripcion</mat-label>
          <input matInput formControlName="descripcion" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Monto total</mat-label>
          <input matInput type="number" formControlName="montoTotal" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Cantidad de cuotas</mat-label>
          <input matInput type="number" formControlName="cantidadCuotas" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Fecha primera cuota</mat-label>
          <input matInput [matDatepicker]="p" formControlName="fechaInicio" />
          <mat-datepicker-toggle matSuffix [for]="p"></mat-datepicker-toggle>
          <mat-datepicker #p></mat-datepicker>
        </mat-form-field>

        <div class="separator full">Origen del desembolso</div>

        <mat-form-field appearance="outline">
          <mat-label>Caja Mayor</mat-label>
          <mat-select formControlName="cajaMayorId">
            <mat-option *ngFor="let c of cajasMayor" [value]="c.id">{{ c.nombre }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Moneda</mat-label>
          <mat-select formControlName="monedaId">
            <mat-option *ngFor="let m of monedas" [value]="m.id">{{ m.denominacion }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Forma de pago</mat-label>
          <mat-select formControlName="formaPagoId">
            <mat-option *ngFor="let f of formasPago" [value]="f.id">{{ f.descripcion || f.nombre }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full">
          <mat-label>Observacion</mat-label>
          <input matInput formControlName="observacion" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="form.invalid || saving">
        Crear prestamo
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .info { opacity: 0.85; margin-bottom: 12px; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    .form { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; min-width: 720px; }
    .full { grid-column: 1 / -1; }
    .separator { font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; opacity: 0.65; padding: 4px 0; border-bottom: 1px solid rgba(128,128,128,0.25); margin: 4px 0 0; }
  `],
})
export class CrearPrestamoFuncionarioDialogComponent implements OnInit {
  loading = false;
  saving = false;
  form: FormGroup;
  funcionarios: any[] = [];
  monedas: any[] = [];
  cajasMayor: any[] = [];
  formasPago: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<CrearPrestamoFuncionarioDialogComponent>,
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      funcionarioId: [null, Validators.required],
      descripcion: ['', Validators.required],
      montoTotal: [0, [Validators.required, Validators.min(1)]],
      cantidadCuotas: [6, [Validators.required, Validators.min(1)]],
      monedaId: [null, Validators.required],
      fechaInicio: [new Date(), Validators.required],
      cajaMayorId: [null, Validators.required],
      formaPagoId: [null, Validators.required],
      observacion: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const [funcs, monedas, cajas, formas] = await Promise.all([
        firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true })),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getFormasPago()),
      ]);
      this.funcionarios = funcs || [];
      this.monedas = monedas || [];
      this.cajasMayor = (cajas || []).filter((c: any) => c.estado === 'ABIERTA');
      this.formasPago = formas || [];
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
      await firstValueFrom(this.repositoryService.createCuentaPorPagar({
        ...this.form.value,
        tipo: 'PRESTAMO_FUNCIONARIO',
      }));
      this.snackBar.open('Prestamo creado con cuotas mensuales', 'Cerrar', { duration: 3000 });
      this.dialogRef.close({ saved: true });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al crear prestamo', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
