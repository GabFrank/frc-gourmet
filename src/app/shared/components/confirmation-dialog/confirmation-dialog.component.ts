import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p style="white-space: pre-line;">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">{{ textoCancelar }}</button>
      <button mat-button [mat-dialog-close]="true" cdkFocusInitial>{{ textoConfirmar }}</button>
    </mat-dialog-actions>
  `
})
export class ConfirmationDialogComponent {
  // Los llamadores mandan `confirmText`/`cancelText` desde siempre, pero el
  // template los ignoraba y rotulaba todo "No" / "Sí": ~65 confirmaciones de la
  // app mostraban etiquetas genericas en vez de las que su autor escribio.
  readonly textoConfirmar: string;
  readonly textoCancelar: string;

  constructor(
    public dialogRef: MatDialogRef<ConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
    }
  ) {
    this.textoConfirmar = data?.confirmText || 'Sí';
    this.textoCancelar = data?.cancelText || 'No';
  }
} 