import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RepositoryService } from '../../../database/repository.service';
import { CuentaBancariaDestino } from '../../../database/entities/financiero/cuenta-bancaria-destino.entity';
import { Persona } from '../../../database/entities/personas/persona.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { TipoCuentaBancaria } from '../../../database/entities/financiero/banking-enums';
import { firstValueFrom } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

const extraerMensajeError = (e: any): string => {
  const raw = e?.message || String(e);
  const m = raw.match(/Error invoking remote method '[^']+': Error: (.*)/);
  return m ? m[1] : raw;
};

@Component({
  selector: 'app-create-edit-cuenta-destino-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ isEditing ? 'Editar' : 'Crear' }} Cuenta Bancaria de Cobro</h2>

    <div mat-dialog-content>
      <div class="loading-shade" *ngIf="isLoading">
        <mat-spinner></mat-spinner>
      </div>

      <form [formGroup]="cuentaForm" class="form-container">
        <!-- Titular (readonly, derivado de Persona) -->
        <div class="titular-section">
          <div class="titular-label">
            <mat-icon>account_circle</mat-icon>
            <span>Titular de la cuenta (persona)</span>
          </div>
          <div class="titular-chip">
            {{ titularDisplay }}
          </div>
          <div class="titular-hint">
            El titular se deriva automáticamente de la persona. No es editable.
          </div>
        </div>

        <!-- Banco -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Banco</mat-label>
          <input matInput formControlName="banco" placeholder="Ej: BNF, CONTINENTAL, ITAU">
          <mat-error *ngIf="cuentaForm.get('banco')?.hasError('required')">
            El banco es requerido
          </mat-error>
        </mat-form-field>

        <!-- Número de cuenta -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Número de cuenta</mat-label>
          <input matInput formControlName="numeroCuenta" placeholder="Ej: 019-00-1921585">
          <mat-error *ngIf="cuentaForm.get('numeroCuenta')?.hasError('required')">
            El número de cuenta es requerido
          </mat-error>
        </mat-form-field>

        <div class="form-row">
          <!-- Tipo de cuenta -->
          <mat-form-field appearance="outline">
            <mat-label>Tipo de cuenta</mat-label>
            <mat-select formControlName="tipoCuenta">
              <mat-option *ngFor="let tipo of tiposCuenta" [value]="tipo">
                {{ tipo }}
              </mat-option>
            </mat-select>
          </mat-form-field>

          <!-- Moneda -->
          <mat-form-field appearance="outline">
            <mat-label>Moneda</mat-label>
            <mat-select formControlName="monedaId">
              <mat-option *ngFor="let moneda of monedas" [value]="moneda.id">
                {{ moneda.denominacion }} ({{ moneda.simbolo }})
              </mat-option>
            </mat-select>
            <mat-error *ngIf="cuentaForm.get('monedaId')?.hasError('required')">
              La moneda es requerida
            </mat-error>
          </mat-form-field>
        </div>

        <!-- Alias -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Alias (opcional)</mat-label>
          <input matInput formControlName="alias" placeholder="Ej: Cuenta LA FAMILIA">
          <mat-hint>Un nombre descriptivo para identificar rápidamente esta cuenta</mat-hint>
        </mat-form-field>

        <!-- Observación -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Observación (opcional)</mat-label>
          <textarea matInput formControlName="observacion" rows="3"></textarea>
        </mat-form-field>
      </form>
    </div>

    <div mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancel()" [disabled]="isLoading">
        Cancelar
      </button>
      <button
        mat-raised-button
        color="primary"
        (click)="save()"
        [disabled]="cuentaForm.invalid || isLoading">
        {{ isEditing ? 'Actualizar' : 'Guardar' }}
      </button>
    </div>
  `,
  styles: [`
    .form-container {
      position: relative;
      min-width: 500px;
    }

    .loading-shade {
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.15);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .full-width {
      width: 100%;
    }

    .form-row {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .form-row mat-form-field {
      flex: 1;
    }

    .titular-section {
      padding: 16px;
      margin-bottom: 24px;
      border: 2px solid rgba(63, 81, 181, 0.3);
      border-radius: 8px;
      background-color: rgba(63, 81, 181, 0.05);
    }

    .titular-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }

    .titular-label mat-icon {
      color: rgba(63, 81, 181, 0.7);
    }

    .titular-chip {
      display: inline-flex;
      align-items: center;
      padding: 8px 16px;
      background-color: rgb(63, 81, 181);
      color: white;
      border-radius: 16px;
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    .titular-hint {
      font-size: 12px;
      color: var(--text-secondary);
      font-style: italic;
    }

    /* Dark theme: solo los acentos indigo, el texto sale de las variables de tema */
    :host-context(.dark-theme) {
      .titular-section {
        border-color: rgba(121, 134, 203, 0.3);
        background-color: rgba(121, 134, 203, 0.1);
      }

      .titular-label mat-icon {
        color: rgba(121, 134, 203, 0.9);
      }

      .titular-chip {
        background-color: rgb(121, 134, 203);
      }
    }
  `]
})
export class CreateEditCuentaDestinoDialogComponent implements OnInit {
  cuentaForm: FormGroup;
  isLoading = false;
  isEditing = false;

  persona: Persona | null = null;
  titularDisplay = '';
  monedas: Moneda[] = [];
  tiposCuenta = Object.values(TipoCuentaBancaria);

  constructor(
    private dialogRef: MatDialogRef<CreateEditCuentaDestinoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      personaId: number;
      cuentaId?: number;
    },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.cuentaForm = this.fb.group({
      banco: ['', [Validators.required]],
      numeroCuenta: ['', [Validators.required]],
      tipoCuenta: [TipoCuentaBancaria.CORRIENTE, [Validators.required]],
      monedaId: [null, [Validators.required]],
      alias: [''],
      observacion: [''],
    });

    this.isEditing = !!this.data.cuentaId;
  }

  async ngOnInit(): Promise<void> {
    await this.loadInitialData();
  }

  async loadInitialData(): Promise<void> {
    this.isLoading = true;
    try {
      // Cargar monedas
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());

      // Cargar persona
      if (this.data.personaId) {
        this.persona = await firstValueFrom(
          this.repositoryService.getPersona(this.data.personaId)
        );
        if (this.persona) {
          this.titularDisplay = this.persona.nombre || 'SIN NOMBRE';
        }
      }

      // Si estamos editando, cargar la cuenta
      if (this.isEditing && this.data.cuentaId) {
        const cuenta = await firstValueFrom(
          this.repositoryService.getCuentaBancariaDestino(this.data.cuentaId)
        );
        if (cuenta) {
          this.cuentaForm.patchValue({
            banco: cuenta.banco,
            numeroCuenta: cuenta.numeroCuenta,
            tipoCuenta: cuenta.tipoCuenta,
            monedaId: cuenta.monedaId,
            alias: cuenta.alias || '',
            observacion: cuenta.observacion || '',
          });

          // Actualizar titular si viene de la relación
          if (cuenta.persona) {
            this.persona = cuenta.persona;
            this.titularDisplay = cuenta.persona.nombre || 'SIN NOMBRE';
          }
        }
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.snackBar.open(extraerMensajeError(error), 'Cerrar', {
        duration: 8000,
        panelClass: 'error-snackbar',
      });
    } finally {
      this.isLoading = false;
    }
  }

  async save(): Promise<void> {
    if (this.cuentaForm.invalid || !this.data.personaId) {
      return;
    }

    this.isLoading = true;

    // Convertir strings a UPPERCASE
    const formData = {
      ...this.cuentaForm.value,
      banco: this.cuentaForm.get('banco')?.value.toUpperCase(),
      numeroCuenta: this.cuentaForm.get('numeroCuenta')?.value.toUpperCase(),
      alias: this.cuentaForm.get('alias')?.value?.toUpperCase() || null,
      observacion: this.cuentaForm.get('observacion')?.value?.toUpperCase() || null,
      personaId: this.data.personaId,
    };

    try {
      let result: any;
      if (this.isEditing && this.data.cuentaId) {
        result = await firstValueFrom(
          this.repositoryService.updateCuentaBancariaDestino(this.data.cuentaId, formData)
        );
      } else {
        result = await firstValueFrom(
          this.repositoryService.createCuentaBancariaDestino(formData)
        );
      }

      this.snackBar.open(
        `Cuenta bancaria ${this.isEditing ? 'actualizada' : 'creada'} exitosamente`,
        'Cerrar',
        {
          duration: 3000,
          panelClass: 'success-snackbar',
        }
      );

      this.dialogRef.close({ success: true, cuenta: result });
    } catch (error) {
      console.error('Error saving cuenta:', error);
      this.snackBar.open(extraerMensajeError(error), 'Cerrar', {
        duration: 8000,
        panelClass: 'error-snackbar',
      });
    } finally {
      this.isLoading = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
