import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface PromptDialogData {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  required?: boolean;
  confirmText?: string;
  cancelText?: string;
  multiline?: boolean;
}

/**
 * Dialog reutilizable para capturar un texto del usuario (ej. motivo de anulación)
 * con confirmación en un solo paso. Reemplaza el anti-patrón `window.prompt`.
 * Cierra con el string ingresado al confirmar, o `undefined` al cancelar.
 */
@Component({
  selector: 'app-prompt-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p *ngIf="data.message" style="white-space: pre-line;">{{ data.message }}</p>
      <mat-form-field appearance="outline" style="width: 100%;">
        <mat-label>{{ data.label || 'Motivo' }}</mat-label>
        <textarea *ngIf="data.multiline !== false" matInput [formControl]="control"
                  [placeholder]="data.placeholder || ''" rows="3" cdkFocusInitial></textarea>
        <input *ngIf="data.multiline === false" matInput [formControl]="control"
               [placeholder]="data.placeholder || ''" cdkFocusInitial>
        <mat-error *ngIf="control.hasError('required')">Este campo es requerido</mat-error>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">{{ data.cancelText || 'Cancelar' }}</button>
      <button mat-flat-button color="primary" (click)="confirm()" [disabled]="control.invalid">
        {{ data.confirmText || 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class PromptDialogComponent {
  control: FormControl<string>;

  constructor(
    public dialogRef: MatDialogRef<PromptDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PromptDialogData,
  ) {
    this.control = new FormControl<string>(data.initialValue || '', {
      nonNullable: true,
      validators: data.required ? [Validators.required] : [],
    });
  }

  cancel(): void {
    this.dialogRef.close(undefined);
  }

  confirm(): void {
    if (this.control.invalid) return;
    this.dialogRef.close((this.control.value || '').trim());
  }
}
