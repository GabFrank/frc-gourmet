import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface PromptData {
  title: string;
  message?: string;
  label: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  required?: boolean;
}

/**
 * Diálogo con un campo de texto (motivo, observación). Devuelve el string
 * ingresado al confirmar, o `undefined` si se cancela. Reutilizable.
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
      <p class="msg" *ngIf="data.message">{{ data.message }}</p>
      <mat-form-field appearance="outline" class="full">
        <mat-label>{{ data.label }}</mat-label>
        <textarea matInput [formControl]="texto" rows="2" cdkFocusInitial></textarea>
        <mat-error *ngIf="texto.hasError('required')">Requerido</mat-error>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(undefined)">
        {{ data.cancelText || 'Cancelar' }}
      </button>
      <button
        mat-flat-button
        [color]="data.danger ? 'warn' : 'primary'"
        (click)="confirmar()"
      >
        {{ data.confirmText || 'Confirmar' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .msg {
        margin: 0 0 8px;
        color: var(--text-primary);
      }
      .full {
        width: 100%;
      }
    `,
  ],
})
export class PromptDialogComponent {
  readonly texto: FormControl<string>;

  constructor(
    public ref: MatDialogRef<PromptDialogComponent, string | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: PromptData,
  ) {
    this.texto = new FormControl('', {
      nonNullable: true,
      validators: data.required === false ? [] : [Validators.required],
    });
  }

  confirmar(): void {
    if (this.texto.invalid) {
      this.texto.markAsTouched();
      return;
    }
    this.ref.close(this.texto.value.trim());
  }
}
