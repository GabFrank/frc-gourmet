import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@frc/shared-core';
import { DeepLinkService } from '../../core/services/deep-link.service';

/**
 * Login de la PWA. Reactive Forms. Pega a `/api/auth/login` vía el shim HTTP.
 * UI provisional de F1 (se rediseña con el sistema visual moderno en F3).
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly deepLinkService = inject(DeepLinkService);

  readonly form = this.fb.nonNullable.group({
    nickname: ['', Validators.required],
    password: ['', Validators.required],
  });

  loading = false;

  /** Ver la contrasenha en claro: en teclado tactil el tipeo a ciegas falla seguido. */
  verPassword = false;
  error: string | null = null;

  async submit(): Promise<void> {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.error = null;
    const { nickname, password } = this.form.getRawValue();
    try {
      const result = await this.auth.login(nickname, password);
      if (result.success) {
        // P0 FIX: tras login exitoso, verificar si hay hash deep link (además de returnUrl)
        const hash = window.location.hash;
        if (hash && hash.startsWith('#/o/')) {
          console.log('[LoginPage] Hash deep link detectado tras login:', hash);
          await this.deepLinkService.translateAndNavigate(hash);
        } else {
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
          await this.router.navigateByUrl(returnUrl);
        }
      } else {
        this.error = result.message || 'Credenciales inválidas';
      }
    } catch {
      this.error = 'No se pudo conectar con el servidor';
    } finally {
      this.loading = false;
    }
  }
}
