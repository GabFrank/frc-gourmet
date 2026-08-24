import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p style="white-space: pre-line;">{{ data.message }}</p>
      <mat-form-field *ngIf="data.showInput" appearance="outline" class="full-width">
        <mat-label>{{ data.inputLabel || 'DETALLE' }}</mat-label>
        <textarea matInput [(ngModel)]="valor" (ngModelChange)="onValorChange()" rows="2" cdkFocusInitial></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button *ngIf="data.showCancel !== false" [mat-dialog-close]="false">{{ textoCancelar }}</button>
      <!-- Dos botones y no un binding de cdkFocusInitial: es un selector de
           directiva, no un atributo, asi que un [attr.] no lo activa. Con
           campo de texto el foco inicial va al textarea. -->
      <button mat-button *ngIf="data.showInput" [disabled]="inputInvalido" (click)="confirmar()">{{ textoConfirmar }}</button>
      <button mat-button *ngIf="!data.showInput" (click)="confirmar()" cdkFocusInitial>{{ textoConfirmar }}</button>
    </mat-dialog-actions>
  `,
  styles: [`.full-width { width: 100%; margin-top: 12px; }`]
})
export class ConfirmationDialogComponent {
  // Los llamadores mandan `confirmText`/`cancelText` desde siempre, pero el
  // template los ignoraba y rotulaba todo "No" / "Sí": ~65 confirmaciones de la
  // app mostraban etiquetas genericas en vez de las que su autor escribio.
  readonly textoConfirmar: string;
  readonly textoCancelar: string;

  /**
   * Texto del campo opcional. El diálogo cierra con este string (no con `true`)
   * cuando `showInput` está activo.
   *
   * `showInput` / `inputLabel` se pasaban desde el módulo de delivery desde el
   * principio, pero el componente no los implementaba: la confirmación cerraba
   * con el booleano `true`, la guarda `typeof result === 'string'` del llamador
   * nunca se cumplía y TODOS los deliveries cancelados quedaban con
   * `motivoCancelacion = 'SIN MOTIVO'`. `showCancel` estaba igual de ignorado.
   */
  valor = '';

  constructor(
    public dialogRef: MatDialogRef<ConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      showInput?: boolean;
      inputLabel?: string;
      /** Si true (default con `showInput`), no deja confirmar con el campo vacío. */
      inputRequerido?: boolean;
      showCancel?: boolean;
    }
  ) {
    this.textoConfirmar = data?.confirmText || 'Sí';
    this.textoCancelar = data?.cancelText || 'No';
    this.inputInvalido = this.esInputInvalido();
  }

  /** Pre-computado: la vista no llama funciones ni getters. */
  inputInvalido = false;

  onValorChange(): void {
    this.inputInvalido = this.esInputInvalido();
  }

  private esInputInvalido(): boolean {
    if (!this.data.showInput) return false;
    if (this.data.inputRequerido === false) return false;
    return this.valor.trim().length === 0;
  }

  confirmar(): void {
    this.dialogRef.close(this.data.showInput ? this.valor.trim().toUpperCase() : true);
  }
}
