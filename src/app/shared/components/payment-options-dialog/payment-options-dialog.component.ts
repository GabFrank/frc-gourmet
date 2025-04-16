import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface PaymentOptionsData {
  title: string;
  message: string;
  payNowText: string;
  payLaterText: string;
  cancelText: string;
  compraId: number;
  total: number;
}

export enum PaymentResult {
  PAY_NOW = 'PAY_NOW',
  PAY_LATER = 'PAY_LATER',
  CANCEL = 'CANCEL'
}

@Component({
  selector: 'app-payment-options-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      <p *ngIf="data.total">Total: <strong>{{ data.total | number:'1.0-2' }}</strong></p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="paymentResult.CANCEL">{{ data.cancelText }}</button>
      <button mat-button [mat-dialog-close]="paymentResult.PAY_LATER">{{ data.payLaterText }}</button>
      <button mat-raised-button color="primary" [mat-dialog-close]="paymentResult.PAY_NOW">{{ data.payNowText }}</button>
    </mat-dialog-actions>
  `
})
export class PaymentOptionsDialogComponent {
  paymentResult = PaymentResult; // To use enum in template

  constructor(
    public dialogRef: MatDialogRef<PaymentOptionsDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PaymentOptionsData
  ) {}
}
