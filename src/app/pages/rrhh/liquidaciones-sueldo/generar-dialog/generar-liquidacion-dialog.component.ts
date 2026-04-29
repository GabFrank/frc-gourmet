import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-generar-liquidacion-dialog',
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
    <h2 mat-dialog-title>Generar liquidacion (BORRADOR)</h2>
    <mat-dialog-content>
      <p class="info">Crea o regenera la liquidacion del periodo. Items manuales se preservan.</p>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline">
          <mat-label>Funcionario</mat-label>
          <mat-select formControlName="funcionarioId">
            <mat-option *ngFor="let f of funcionarios" [value]="f.id">
              {{ f.persona?.nombre }} {{ f.persona?.apellido || '' }}
            </mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Periodo (YYYY-MM)</mat-label>
          <input matInput formControlName="periodo" placeholder="2026-04" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Moneda pago</mat-label>
          <mat-select formControlName="monedaPagoId">
            <mat-option [value]="null">-- Usar moneda salario --</mat-option>
            <mat-option *ngFor="let m of monedas" [value]="m.id">{{ m.denominacion }}</mat-option>
          </mat-select>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="form.invalid || saving">
        Generar
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .info { opacity: 0.8; }
    .form { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; min-width: 600px; margin-top: 12px; }
  `],
})
export class GenerarLiquidacionDialogComponent implements OnInit {
  saving = false;
  form: FormGroup;
  funcionarios: any[] = [];
  monedas: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<GenerarLiquidacionDialogComponent>,
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    const now = new Date();
    const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    this.form = this.fb.group({
      funcionarioId: [null, Validators.required],
      periodo: [periodo, [Validators.required, Validators.pattern(/^\d{4}-\d{2}$/)]],
      monedaPagoId: [null],
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const [funcs, monedas] = await Promise.all([
        firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true })),
        firstValueFrom(this.repositoryService.getMonedas()),
      ]);
      this.funcionarios = funcs || [];
      this.monedas = monedas || [];
    } catch (e) {
      console.error(e);
    }
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      const liq = await firstValueFrom(this.repositoryService.generarLiquidacionBorrador(this.form.value));
      this.snackBar.open('Liquidacion BORRADOR generada', 'Cerrar', { duration: 3000 });
      this.dialogRef.close({ saved: true, liquidacion: liq });
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    } finally {
      this.saving = false;
    }
  }
}
