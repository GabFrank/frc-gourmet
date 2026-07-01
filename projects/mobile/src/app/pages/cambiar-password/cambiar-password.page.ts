import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService, RepositoryService } from '@frc/shared-core';

/**
 * Cambio de contraseña obligatorio en la PWA. Se llega acá cuando el usuario
 * tiene `mustChangePassword=true` (contraseña temporal): el guard lo redirige y
 * no lo deja salir hasta cambiarla. Paridad con el dialog bloqueante del desktop.
 */
@Component({
  selector: 'app-cambiar-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './cambiar-password.page.html',
  styleUrls: ['./cambiar-password.page.scss'],
})
export class CambiarPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly repo = inject(RepositoryService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: [coincidenPasswords, distintaAActual] },
  );

  loading = false;
  error: string | null = null;

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }
    const usuarioId = this.auth.currentUser?.id;
    if (usuarioId == null) {
      await this.router.navigateByUrl('/login');
      return;
    }
    this.loading = true;
    this.error = null;
    const { currentPassword, newPassword } = this.form.getRawValue();
    try {
      const res: any = await firstValueFrom(
        this.repo.changePassword(usuarioId, currentPassword, newPassword),
      );
      if (res && res.success === false) {
        this.error = res.message || 'No se pudo cambiar la contraseña';
        return;
      }
      // Baja el flag local para que el guard deje pasar y entra a la app.
      this.auth.markPasswordChanged();
      await this.router.navigateByUrl('/');
    } catch {
      this.error = 'No se pudo conectar con el servidor';
    } finally {
      this.loading = false;
    }
  }

  async cerrarSesion(): Promise<void> {
    await this.auth.logout();
  }
}

/** La nueva contraseña y su confirmación deben coincidir. */
function coincidenPasswords(group: AbstractControl): ValidationErrors | null {
  const nueva = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return nueva && confirm && nueva !== confirm ? { noCoincide: true } : null;
}

/** La nueva contraseña debe ser distinta a la temporal actual. */
function distintaAActual(group: AbstractControl): ValidationErrors | null {
  const actual = group.get('currentPassword')?.value;
  const nueva = group.get('newPassword')?.value;
  return actual && nueva && actual === nueva ? { igualAActual: true } : null;
}
