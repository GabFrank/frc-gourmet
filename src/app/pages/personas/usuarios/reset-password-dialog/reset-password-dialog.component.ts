import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

export interface ResetPasswordDialogData {
  usuarioId: number;
  nickname: string;
}

function generarPasswordAleatoria(longitud = 12): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint32Array(longitud);
    cryptoObj.getRandomValues(arr);
    for (let i = 0; i < longitud; i++) out += chars[arr[i] % chars.length];
  } else {
    for (let i = 0; i < longitud; i++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

@Component({
  selector: 'app-reset-password-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './reset-password-dialog.component.html',
  styleUrls: ['./reset-password-dialog.component.scss'],
})
export class ResetPasswordDialogComponent {
  saving = false;
  passwordNueva: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<ResetPasswordDialogComponent, { success: boolean }>,
    @Inject(MAT_DIALOG_DATA) public data: ResetPasswordDialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {}

  async confirmar(): Promise<void> {
    this.saving = true;
    try {
      const pass = generarPasswordAleatoria(12);
      // El handler `update-usuario` hashea la password si viene en el payload.
      const res: any = await firstValueFrom(
        this.repositoryService.updateUsuario(this.data.usuarioId, { password: pass } as any),
      );
      if (res && (res as any).success === false) {
        this.snackBar.open((res as any).message || 'Error al resetear', 'OK', { duration: 4000 });
        return;
      }
      this.passwordNueva = pass;
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error al resetear password: ' + (e?.message || e), 'OK', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  copiarPassword(): void {
    if (!this.passwordNueva) return;
    if ((navigator as any)?.clipboard?.writeText) {
      (navigator as any).clipboard.writeText(this.passwordNueva);
      this.snackBar.open('Password copiada al portapapeles', '', { duration: 2000 });
    }
  }

  cerrar(): void {
    this.dialogRef.close({ success: !!this.passwordNueva });
  }

  cancelar(): void {
    this.dialogRef.close({ success: false });
  }
}
