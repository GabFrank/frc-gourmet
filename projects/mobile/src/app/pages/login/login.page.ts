import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@frc/shared-core';

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

  readonly form = this.fb.nonNullable.group({
    nickname: ['', Validators.required],
    password: ['', Validators.required],
  });

  loading = false;
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
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
        await this.router.navigateByUrl(returnUrl);
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
