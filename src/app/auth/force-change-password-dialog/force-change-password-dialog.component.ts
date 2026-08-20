import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../database/repository.service';
import { AuthService } from '../../services/auth.service';

/**
 * Modo del diálogo:
 * - `forzado` (default): post-login con `mustChangePassword=true`. No se puede
 *   cerrar por afuera; la única salida sin cambiar es cerrar sesión.
 * - `self`: el propio usuario cambia su contraseña cuando quiere (menú de
 *   usuario o buscador global). Se puede cancelar.
 */
export type CambiarPasswordModo = 'forzado' | 'self';

export interface ForceChangePasswordDialogData {
  /** Si no viene (ej. abierto desde el buscador global), se toma del usuario logueado. */
  usuarioId?: number;
  nickname?: string;
  modo?: CambiarPasswordModo;
}

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const nueva = group.get('newPassword')?.value;
  const conf = group.get('confirmPassword')?.value;
  if (!nueva || !conf) return null;
  return nueva === conf ? null : { passwordsMismatch: true };
}

@Component({
  selector: 'app-force-change-password-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon
        style="vertical-align: middle; margin-right: 8px;"
        [color]="esForzado ? 'warn' : 'primary'"
        >lock</mat-icon
      >
      {{ titulo }}
    </h2>
    <mat-dialog-content>
      <p>{{ textoIntro }}</p>
      <form [formGroup]="form" (ngSubmit)="onSubmit()" autocomplete="off">
        <mat-form-field appearance="outline" style="width: 100%; margin-top: 12px;">
          <mat-label>Contraseña actual</mat-label>
          <input
            matInput
            [type]="hideCurrent ? 'password' : 'text'"
            formControlName="currentPassword"
            autocomplete="current-password"
          />
          <button
            type="button"
            mat-icon-button
            matSuffix
            (click)="hideCurrent = !hideCurrent"
            [attr.aria-label]="'Mostrar/ocultar contraseña actual'"
          >
            <mat-icon>{{ hideCurrent ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          <mat-error *ngIf="form.get('currentPassword')?.hasError('required')">
            Requerida
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" style="width: 100%;">
          <mat-label>Nueva contraseña</mat-label>
          <input
            matInput
            [type]="hideNew ? 'password' : 'text'"
            formControlName="newPassword"
            autocomplete="new-password"
          />
          <button
            type="button"
            mat-icon-button
            matSuffix
            (click)="hideNew = !hideNew"
            [attr.aria-label]="'Mostrar/ocultar nueva contraseña'"
          >
            <mat-icon>{{ hideNew ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          <mat-error *ngIf="form.get('newPassword')?.hasError('required')">
            Requerida
          </mat-error>
          <mat-error *ngIf="form.get('newPassword')?.hasError('minlength')">
            Al menos 6 caracteres
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" style="width: 100%;">
          <mat-label>Confirmar nueva contraseña</mat-label>
          <input
            matInput
            [type]="hideNew ? 'password' : 'text'"
            formControlName="confirmPassword"
            autocomplete="new-password"
          />
          <mat-error *ngIf="form.get('confirmPassword')?.hasError('required')">
            Requerida
          </mat-error>
        </mat-form-field>

        <p
          *ngIf="form.hasError('passwordsMismatch') && form.get('confirmPassword')?.touched"
          class="mismatch-msg"
        >
          Las contraseñas no coinciden.
        </p>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="onCancelLogout()" [disabled]="saving">
        {{ labelCancelar }}
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        (click)="onSubmit()"
        [disabled]="form.invalid || saving"
      >
        <mat-progress-spinner
          *ngIf="saving"
          mode="indeterminate"
          diameter="18"
          style="display: inline-block; margin-right: 8px; vertical-align: middle;"
        ></mat-progress-spinner>
        Cambiar contraseña
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .mismatch-msg {
        color: var(--mdc-theme-error, #d32f2f);
        font-size: 12px;
        margin: 4px 0 8px;
      }
    `,
  ],
})
export class ForceChangePasswordDialogComponent {
  form: FormGroup;
  hideCurrent = true;
  hideNew = true;
  saving = false;

  // Pre-computados en el constructor (nada de funciones/getters en el template).
  esForzado = true;
  titulo = 'Cambio de contraseña requerido';
  textoIntro = '';
  labelCancelar = 'Cerrar sesión';
  /** Usuario sobre el que se opera: el del data, o el logueado. */
  private usuarioId: number | null = null;

  constructor(
    private fb: FormBuilder,
    public dialogRef: MatDialogRef<ForceChangePasswordDialogComponent, 'changed' | 'logout'>,
    private repo: RepositoryService,
    private snack: MatSnackBar,
    private authService: AuthService,
    @Inject(MAT_DIALOG_DATA) public data: ForceChangePasswordDialogData
  ) {
    this.esForzado = (data?.modo || 'forzado') === 'forzado';
    this.titulo = this.esForzado ? 'Cambio de contraseña requerido' : 'Cambiar mi contraseña';
    this.textoIntro = this.esForzado
      ? 'Para tu seguridad debes cambiar la contraseña por defecto antes de continuar. Elegí una nueva (mínimo 6 caracteres).'
      : 'Ingresá tu contraseña actual y elegí una nueva (mínimo 6 caracteres).';
    this.labelCancelar = this.esForzado ? 'Cerrar sesión' : 'Cancelar';
    this.usuarioId = data?.usuarioId ?? this.authService.currentUser?.id ?? null;

    this.form = this.fb.group(
      {
        currentPassword: ['', [Validators.required]],
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: passwordsMatchValidator }
    );
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.saving) return;
    if (this.usuarioId == null) {
      this.snack.open('NO HAY USUARIO LOGUEADO', 'Cerrar', { duration: 4000 });
      return;
    }
    this.saving = true;
    const { currentPassword, newPassword } = this.form.value;
    try {
      const result = await firstValueFrom(
        this.repo.changePassword(this.usuarioId, currentPassword, newPassword)
      );
      if (result?.success) {
        // El backend ya persistió `mustChangePassword=false`; bajamos también el
        // flag del usuario en memoria/storage para que el guard de la PWA deje
        // de redirigir a la pantalla de cambio obligatorio.
        this.authService.markPasswordChanged();
        this.snack.open('CONTRASEÑA ACTUALIZADA', 'Cerrar', { duration: 3000 });
        this.dialogRef.close('changed');
      } else {
        this.snack.open(result?.message || 'NO SE PUDO CAMBIAR LA CONTRASEÑA', 'Cerrar', {
          duration: 5000,
          panelClass: 'error-snackbar',
        });
      }
    } catch (error) {
      console.error('changePassword error:', error);
      this.snack.open('ERROR INTERNO', 'Cerrar', { duration: 5000 });
    } finally {
      this.saving = false;
    }
  }

  /** Forzado → cerrar sesión (única salida sin cambiar). Self → simple cancelar. */
  onCancelLogout(): void {
    this.dialogRef.close(this.esForzado ? 'logout' : undefined);
  }
}
