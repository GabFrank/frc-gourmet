import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-reset-db-confirm-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="warn-icon">delete_forever</mat-icon>
      Resetear base de datos
    </h2>
    <mat-dialog-content>
      <p class="warn-text">
        <strong>Esta acción es irreversible.</strong> Se eliminará la base de datos completa y se reiniciará la app.
      </p>
      <p>Antes de borrar se hace automáticamente un backup de seguridad en la carpeta de backups.</p>
      <p>Después del reinicio:</p>
      <ul>
        <li>Se generarán los datos iniciales (monedas, formas de pago, permisos, configuración RRHH).</li>
        <li>NO habrá usuarios — vas a tener que crear uno desde cero.</li>
        <li>NO habrá productos, recetas, clientes, funcionarios, ventas ni saldos.</li>
      </ul>
      <p class="instruction">
        Para confirmar, escribí <strong>RESET</strong> en el campo de abajo:
      </p>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Confirmación</mat-label>
        <input matInput [(ngModel)]="confirmationText" placeholder="RESET" autocomplete="off">
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="warn"
              [disabled]="confirmationText !== 'RESET'"
              (click)="confirm()">
        <mat-icon>delete_forever</mat-icon>
        <span>Resetear y reiniciar</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .warn-icon {
      color: #c62828;
      vertical-align: middle;
      margin-right: 6px;
    }
    .warn-text {
      background: rgba(198, 40, 40, 0.08);
      padding: 12px;
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 12px;
    }
    ul { padding-left: 20px; font-size: 13px; }
    .instruction {
      font-size: 13px;
      margin-top: 16px;
    }
    .full-width { width: 100%; }
  `],
})
export class ResetDbConfirmDialogComponent {
  confirmationText = '';

  constructor(public dialogRef: MatDialogRef<ResetDbConfirmDialogComponent>) {}

  confirm(): void {
    if (this.confirmationText === 'RESET') {
      this.dialogRef.close(this.confirmationText);
    }
  }
}
