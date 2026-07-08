import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'sf-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="sf-container sf-narrow">
      <h1 class="sf-title">Ingresar</h1>

      <div class="sf-card" *ngIf="paso === 'telefono'">
        <label class="sf-label">Tu número de WhatsApp</label>
        <input class="sf-input" [(ngModel)]="telefono" placeholder="Ej: 0981123456" inputmode="tel" />
        <button class="sf-btn sf-full" [disabled]="enviando" (click)="pedirCodigo()">
          {{ enviando ? 'Enviando…' : 'Enviarme el código' }}
        </button>
      </div>

      <div class="sf-card" *ngIf="paso === 'codigo'">
        <p class="sf-muted">Te enviamos un código por WhatsApp a {{ telefono }}.</p>
        <label class="sf-label">Código de 6 dígitos</label>
        <input class="sf-input" [(ngModel)]="codigo" placeholder="______" inputmode="numeric" maxlength="6" />
        <button class="sf-btn sf-full" [disabled]="enviando" (click)="verificar()">
          {{ enviando ? 'Verificando…' : 'Verificar' }}
        </button>
        <button class="sf-btn sf-btn--ghost sf-full sf-mt" (click)="paso = 'telefono'">Cambiar número</button>
      </div>

      <p class="sf-hint sf-muted" *ngIf="devHint">
        (Dev: sin credenciales de WhatsApp, el código aparece en la consola del server.)
      </p>
      <p class="sf-error" *ngIf="error">{{ error }}</p>
    </div>
  `,
  styles: [`
    .sf-narrow { max-width: 420px; }
    .sf-title { font-size: 22px; margin: 8px 0 16px; }
    .sf-label { display: block; font-size: 13px; color: var(--sf-text-muted); margin: 6px 0 4px; }
    .sf-full { width: 100%; }
    .sf-mt { margin-top: 8px; }
    .sf-input { margin-bottom: 12px; }
    .sf-error { color: #c0392b; }
    .sf-hint { font-size: 12px; margin-top: 12px; }
  `],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  paso: 'telefono' | 'codigo' = 'telefono';
  telefono = '';
  codigo = '';
  enviando = false;
  error: string | null = null;
  devHint = false;

  pedirCodigo(): void {
    this.error = null;
    if (this.telefono.replace(/\D+/g, '').length < 6) { this.error = 'Ingresá un número válido.'; return; }
    this.enviando = true;
    this.auth.solicitarOtp(this.telefono).subscribe({
      next: (res) => {
        this.enviando = false;
        if (res?.success) {
          this.paso = 'codigo';
          this.devHint = res.provider === 'dev-log';
        } else {
          this.error = this.msg(res?.error);
        }
      },
      error: (e) => {
        this.enviando = false;
        this.error = 'No se pudo enviar el código. ' + (e?.message || '');
      },
    });
  }

  verificar(): void {
    this.error = null;
    if (this.codigo.trim().length !== 6) { this.error = 'El código tiene 6 dígitos.'; return; }
    this.enviando = true;
    this.auth.verificarOtp(this.telefono, this.codigo.trim()).subscribe({
      next: (res) => {
        this.enviando = false;
        if (res?.success) {
          const volver = this.route.snapshot.queryParamMap.get('volver') || '/';
          this.router.navigateByUrl(volver);
        } else {
          this.error = this.msg(res?.error);
        }
      },
      error: (e) => {
        this.enviando = false;
        this.error = 'No se pudo verificar. ' + (e?.message || '');
      },
    });
  }

  private msg(err?: string): string {
    switch (err) {
      case 'telefono_invalido': return 'Número inválido.';
      case 'demasiadas_solicitudes': return 'Esperá un momento antes de pedir otro código.';
      case 'otp_no_encontrado_o_expirado': return 'El código expiró. Pedí uno nuevo.';
      case 'codigo_incorrecto': return 'Código incorrecto.';
      case 'demasiados_intentos': return 'Demasiados intentos. Pedí un código nuevo.';
      default: return err || 'Ocurrió un error.';
    }
  }
}
