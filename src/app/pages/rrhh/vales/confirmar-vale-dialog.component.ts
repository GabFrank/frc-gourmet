import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-confirmar-vale-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Confirmar vale</h2>
    <mat-dialog-content>
      <p>
        Esto generara un EGRESO_VALE en la caja mayor seleccionada y descontara el saldo.
        Funcionario: <strong>{{ data.vale?.funcionario?.persona?.nombre }} {{ data.vale?.funcionario?.persona?.apellido || '' }}</strong>
      </p>
      <p>Monto: <strong>{{ data.vale?.monto | number:'1.0-2' }} {{ data.vale?.moneda?.simbolo || '' }}</strong></p>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Caja mayor</mat-label>
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
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="form.invalid || saving">
        Confirmar y descontar saldo
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; min-width: 600px; margin-top: 12px; }
  `],
})
export class ConfirmarValeDialogComponent implements OnInit {
  saving = false;
  form: FormGroup;
  cajasMayor: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<ConfirmarValeDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { vale: any },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      cajaMayorId: [data.vale?.cajaMayor?.id || null, Validators.required],
      monedaId: [data.vale?.moneda?.id || null, Validators.required],
      formaPagoId: [data.vale?.formaPago?.id || null, Validators.required],
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const [cajasMayor, monedas, formasPago] = await Promise.all([
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
      ]);
      this.cajasMayor = (cajasMayor || []).filter((c: any) => c.estado === 'ABIERTA');
      this.monedas = monedas || [];
      this.formasPago = formasPago || [];
    } catch (e) {
      console.error(e);
    }
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.confirmarVale(this.data.vale.id, this.form.value));
      this.snackBar.open('Vale confirmado y saldo descontado', 'Cerrar', { duration: 3000 });
      this.dialogRef.close({ saved: true });
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error al confirmar: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    } finally {
      this.saving = false;
    }
  }
}
