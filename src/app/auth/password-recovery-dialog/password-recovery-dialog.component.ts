import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

export interface PasswordRecoveryDialogData {
  nickname?: string;
}

@Component({
  selector: 'app-password-recovery-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon style="vertical-align: middle; margin-right: 8px;" color="primary">lock_reset</mat-icon>
      Recuperar contraseña
    </h2>
    <mat-dialog-content>
      <!-- PASO 1: nickname -->
      <div *ngIf="step === 1">
        <p>Ingresá tu usuario para recibir un código de recuperación.</p>
        <mat-form-field appearance="outline" style="width: 100%;">
          <mat-label>Usuario</mat-label>
          <input matInput [(ngModel)]="nickname" (keyup.enter)="buscarCanales()" autocomplete="username" />
        </mat-form-field>
      </div>

      <!-- PASO 2: elegir canal -->
      <div *ngIf="step === 2">
        <p>¿Por dónde querés recibir el código?</p>
        <mat-radio-group [(ngModel)]="canal" class="canal-group">
          <mat-radio-button *ngIf="emailDisponible" value="EMAIL">
            Email ({{ emailMasked }})
          </mat-radio-button>
          <mat-radio-button *ngIf="whatsappDisponible" value="WHATSAPP">
            WhatsApp ({{ phoneMasked }})
          </mat-radio-button>
        </mat-radio-group>
        <p *ngIf="!emailDisponible && !whatsappDisponible" class="err-msg">
          Tu usuario no tiene email ni teléfono configurados. Contactá a un administrador.
        </p>
      </div>

      <!-- PASO 3: código + nueva contraseña -->
      <div *ngIf="step === 3">
        <p>Enviamos un código a <b>{{ destinoMasked }}</b>. Ingresalo y elegí una nueva contraseña.</p>
        <mat-form-field appearance="outline" style="width: 100%;">
          <mat-label>Código</mat-label>
          <input matInput [(ngModel)]="codigo" inputmode="numeric" maxlength="6" />
        </mat-form-field>
        <mat-form-field appearance="outline" style="width: 100%;">
          <mat-label>Nueva contraseña</mat-label>
          <input matInput [type]="hide ? 'password' : 'text'" [(ngModel)]="newPassword" autocomplete="new-password" />
          <button type="button" mat-icon-button matSuffix (click)="hide = !hide">
            <mat-icon>{{ hide ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
        </mat-form-field>
        <mat-form-field appearance="outline" style="width: 100%;">
          <mat-label>Confirmar contraseña</mat-label>
          <input matInput [type]="hide ? 'password' : 'text'" [(ngModel)]="confirmPassword" autocomplete="new-password" />
        </mat-form-field>
        <button mat-button type="button" (click)="reenviar()" [disabled]="loading">Reenviar código</button>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()" [disabled]="loading">Cancelar</button>

      <button *ngIf="step === 1" mat-flat-button color="primary" (click)="buscarCanales()" [disabled]="loading || !nickname">
        <mat-progress-spinner *ngIf="loading" mode="indeterminate" diameter="18" class="btn-spinner"></mat-progress-spinner>
        Continuar
      </button>

      <button *ngIf="step === 2" mat-flat-button color="primary" (click)="enviarCodigo()" [disabled]="loading || !canal">
        <mat-progress-spinner *ngIf="loading" mode="indeterminate" diameter="18" class="btn-spinner"></mat-progress-spinner>
        Enviar código
      </button>

      <button *ngIf="step === 3" mat-flat-button color="primary" (click)="confirmar()" [disabled]="loading || !codigo || !newPassword">
        <mat-progress-spinner *ngIf="loading" mode="indeterminate" diameter="18" class="btn-spinner"></mat-progress-spinner>
        Cambiar contraseña
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .canal-group { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
      .err-msg { color: var(--mdc-theme-error, #d32f2f); font-size: 13px; }
      .btn-spinner { display: inline-block; margin-right: 8px; vertical-align: middle; }
    `,
  ],
})
export class PasswordRecoveryDialogComponent {
  step = 1;
  loading = false;
  hide = true;

  nickname = '';
  canal = '';
  emailDisponible = false;
  whatsappDisponible = false;
  emailMasked = '';
  phoneMasked = '';

  destinoMasked = '';
  codigo = '';
  newPassword = '';
  confirmPassword = '';

  private get api(): any {
    return (window as any).api;
  }

  constructor(
    public dialogRef: MatDialogRef<PasswordRecoveryDialogComponent, 'reset' | undefined>,
    private snack: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: PasswordRecoveryDialogData,
  ) {
    if (data?.nickname) this.nickname = data.nickname;
  }

  private err(msg: string): void {
    this.snack.open(msg, 'Cerrar', { duration: 5000, panelClass: 'error-snackbar' });
  }
  private ok(msg: string): void {
    this.snack.open(msg, 'Cerrar', { duration: 4000, panelClass: 'success-snackbar' });
  }

  async buscarCanales(): Promise<void> {
    if (!this.nickname || this.loading) return;
    this.loading = true;
    try {
      const res = await this.api.resetChannels(this.nickname.trim());
      this.emailDisponible = !!res?.email;
      this.whatsappDisponible = !!res?.whatsapp;
      this.emailMasked = res?.emailMasked || '';
      this.phoneMasked = res?.phoneMasked || '';
      if (!this.emailDisponible && !this.whatsappDisponible) {
        this.err('Usuario no encontrado o sin canales de recuperación configurados.');
        this.loading = false;
        return;
      }
      this.canal = this.whatsappDisponible ? 'WHATSAPP' : 'EMAIL';
      this.step = 2;
    } catch (e: any) {
      this.err('Error: ' + (e?.message || e));
    } finally {
      this.loading = false;
    }
  }

  async enviarCodigo(): Promise<void> {
    if (!this.canal || this.loading) return;
    this.loading = true;
    try {
      const res = await this.api.requestPasswordReset(this.nickname.trim(), this.canal);
      if (res?.success) {
        this.destinoMasked = res?.destinoMasked || '';
        this.ok('Código enviado. Revisá tu ' + (this.canal === 'EMAIL' ? 'email' : 'WhatsApp') + '.');
        this.step = 3;
      } else {
        this.err(res?.message || 'No se pudo enviar el código.');
      }
    } catch (e: any) {
      this.err('Error: ' + (e?.message || e));
    } finally {
      this.loading = false;
    }
  }

  async reenviar(): Promise<void> {
    await this.enviarCodigo();
  }

  async confirmar(): Promise<void> {
    if (this.loading) return;
    if (this.newPassword !== this.confirmPassword) {
      this.err('Las contraseñas no coinciden.');
      return;
    }
    if (this.newPassword.length < 4) {
      this.err('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    this.loading = true;
    try {
      const res = await this.api.resetPasswordWithCode(this.nickname.trim(), this.codigo.trim(), this.newPassword);
      if (res?.success) {
        this.ok(res?.message || 'Contraseña actualizada.');
        this.dialogRef.close('reset');
      } else {
        this.err(res?.message || 'No se pudo cambiar la contraseña.');
      }
    } catch (e: any) {
      this.err('Error: ' + (e?.message || e));
    } finally {
      this.loading = false;
    }
  }
}
