import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { CurrencyInputComponent } from '../currency-input/currency-input.component';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';

export interface AjusteDialogData {
  tipo: 'AUMENTO' | 'DESCUENTO';
  saldoPendiente: number;
  moneda: Moneda;
  suggested?: number;
}

@Component({
  selector: 'app-ajuste-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    CurrencyInputComponent
  ],
  template: `
    <h2 mat-dialog-title>{{ data.tipo === 'AUMENTO' ? 'Registrar Aumento' : 'Aplicar Descuento' }}</h2>
    <div mat-dialog-content>
      <p>Saldo pendiente: {{ data.saldoPendiente | number:'1.2-2' }} {{ data.moneda.simbolo }}</p>
      
      <form [formGroup]="form">
        <div class="form-field">
          <app-currency-input
            formControlName="valor"
            [moneda]="data.moneda"
            [required]="true"
            [min]="0.01"
            [hint]="data.tipo === 'AUMENTO' ? 'Aumento' : 'Descuento'"
            [label]="data.tipo === 'AUMENTO' ? 'Monto del aumento' : 'Monto del descuento'">
          </app-currency-input>
        </div>
        
        <div class="form-field">
          <mat-form-field appearance="outline" style="width: 100%">
            <mat-label>Descripción</mat-label>
            <input matInput formControlName="descripcion">
          </mat-form-field>
        </div>
      </form>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancelar</button>
      <button mat-raised-button color="primary" (click)="onConfirm()" [disabled]="!form.valid">
        {{ data.tipo === 'AUMENTO' ? 'Registrar Aumento' : 'Aplicar Descuento' }}
      </button>
    </div>
  `,
  styles: [`
    .form-field {
      margin-bottom: 16px;
    }
  `]
})
export class AjusteDialogComponent {
  form: FormGroup;

  constructor(
    public dialogRef: MatDialogRef<AjusteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AjusteDialogData,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      valor: [data.suggested || Math.abs(data.saldoPendiente), [Validators.required, Validators.min(0.01)]],
      descripcion: ['', Validators.required]
    });

    // Add validators based on tipo
    if (data.tipo === 'DESCUENTO') {
      this.form.get('valor')?.addValidators(
        Validators.max(Math.abs(data.saldoPendiente))
      );
      
      // Default description for descuento
      this.form.get('descripcion')?.setValue(`Descuento aplicado de ${Math.abs(data.saldoPendiente).toFixed(2)} ${data.moneda.simbolo}`);
    } else {
      // Default description for aumento
      this.form.get('descripcion')?.setValue(`Aumento aplicado de ${Math.abs(data.saldoPendiente).toFixed(2)} ${data.moneda.simbolo}`);
    }
  }

  onConfirm(): void {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }
} 