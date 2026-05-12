import { CommonModule } from '@angular/common';
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

export interface CreateUsuarioRapidoDialogData {
  personaId?: number | null;
  /** Sugerencia de nickname (ej. primera palabra del nombre en lowercase) */
  nicknameSugerido?: string;
}

export interface CreateUsuarioRapidoDialogResult {
  success: boolean;
  usuario?: any;
}

/**
 * Genera una password aleatoria legible (sin caracteres ambiguos).
 * 12 chars, mezcla a-z A-Z 0-9.
 */
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
  selector: 'app-create-usuario-rapido-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './create-usuario-rapido-dialog.component.html',
  styleUrls: ['./create-usuario-rapido-dialog.component.scss'],
})
export class CreateUsuarioRapidoDialogComponent implements OnInit {
  form!: FormGroup;
  roles: any[] = [];
  loading = false;
  saving = false;

  /** Una vez creado el usuario, muestra esta vista con la password temporal. */
  usuarioCreado: { nickname: string; passwordTemporal: string } | null = null;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateUsuarioRapidoDialogComponent, CreateUsuarioRapidoDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: CreateUsuarioRapidoDialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      nickname: [
        (data?.nicknameSugerido || '').toLowerCase(),
        [Validators.required, Validators.pattern(/^[a-z0-9._-]{3,30}$/)],
      ],
      roleIds: [[]],
    });
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const roles = await firstValueFrom(this.repositoryService.getRoles());
      this.roles = (roles || []).filter((r: any) => r.activo);
    } catch (e) {
      console.error('Error cargando roles', e);
    } finally {
      this.loading = false;
    }
  }

  async confirmar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    try {
      const v = this.form.getRawValue();
      const passwordTemporal = generarPasswordAleatoria(12);
      const usuarioPayload: any = {
        nickname: v.nickname,
        password: passwordTemporal,
        activo: true,
      };
      if (this.data?.personaId) usuarioPayload.persona_id = this.data.personaId;

      const usuario: any = await firstValueFrom(this.repositoryService.createUsuario(usuarioPayload));
      if (!usuario || (usuario as any).success === false) {
        const msg = (usuario as any)?.message || 'No se pudo crear el usuario';
        this.snackBar.open(msg, 'OK', { duration: 4000 });
        this.saving = false;
        return;
      }

      const usuarioId = (usuario as any).id;
      // Asignar roles si vinieron seleccionados
      const roleIds: number[] = v.roleIds || [];
      for (const rid of roleIds) {
        try {
          await firstValueFrom(this.repositoryService.assignRoleToUsuario(usuarioId, rid));
        } catch (e) {
          console.warn(`No se pudo asignar rol ${rid} al usuario ${usuarioId}`, e);
        }
      }

      this.usuarioCreado = { nickname: v.nickname, passwordTemporal };
    } catch (e: any) {
      console.error('Error creando usuario', e);
      this.snackBar.open('Error: ' + (e?.message || e), 'OK', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  copiarPassword(): void {
    if (!this.usuarioCreado) return;
    const txt = this.usuarioCreado.passwordTemporal;
    if ((navigator as any)?.clipboard?.writeText) {
      (navigator as any).clipboard.writeText(txt);
      this.snackBar.open('Password copiada al portapapeles', '', { duration: 2000 });
    }
  }

  cerrarOk(): void {
    if (!this.usuarioCreado) {
      this.dialogRef.close({ success: false });
      return;
    }
    this.dialogRef.close({ success: true, usuario: { nickname: this.usuarioCreado.nickname } });
  }

  cancelar(): void {
    this.dialogRef.close({ success: false });
  }
}
