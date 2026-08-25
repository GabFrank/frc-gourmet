import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'sf-cuenta',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="sf-container narrow">
      <h1 class="title">{{ completar ? '¡Bienvenido/a! 👋' : 'Mi cuenta' }}</h1>

      <div class="sf-card banner" *ngIf="completar">
        Completá tus datos para agilizar tus próximos pedidos.
      </div>

      <ng-container *ngIf="auth.cuenta as c">
        <div class="sf-card">
          <div class="field" *ngIf="c.telefono">
            <div class="sf-muted lbl">Teléfono</div>
            <div class="val">{{ c.telefono }}</div>
          </div>

          <label class="lbl">Nombre</label>
          <input class="sf-input" [(ngModel)]="nombre" placeholder="Tu nombre" />
          <label class="lbl">Email {{ c.telefono ? '(opcional)' : '' }}</label>
          <input class="sf-input" [(ngModel)]="email" type="email" placeholder="tu@email.com" />
          <label class="lbl" *ngIf="tienePassword">Contraseña actual</label>
          <input class="sf-input" *ngIf="tienePassword" type="password" [(ngModel)]="passwordActual"
                 placeholder="Necesaria para cambiarla" autocomplete="current-password" />

          <label class="lbl">{{ tienePassword ? 'Contraseña nueva' : 'Contraseña (opcional)' }}</label>
          <input class="sf-input" type="password" [(ngModel)]="password"
                 placeholder="Para ingresar sin OTP" autocomplete="new-password" />

          <button class="sf-btn sf-btn--block mt" [disabled]="guardando" (click)="guardar()">
            {{ guardando ? 'Guardando…' : (completar ? 'Guardar y continuar' : 'Guardar') }}
          </button>
          <p class="ok" *ngIf="ok">Guardado ✅</p>
          <p class="err" *ngIf="error">{{ error }}</p>
        </div>

        <button class="sf-btn sf-btn--ghost sf-btn--block mt" (click)="salir()">Cerrar sesión</button>
      </ng-container>

      <p class="sf-muted" *ngIf="!auth.cuenta">No estás logueado.</p>
    </div>
  `,
  styles: [`
    .narrow { max-width: 440px; }
    .title { font-size: 22px; font-weight: 800; margin: 8px 0 16px; }
    .banner { background: var(--sf-primary-surface); color: var(--sf-primary); margin-bottom: 12px; font-weight: 600; }
    .field { margin-bottom: 8px; }
    .lbl { display: block; font-size: 13px; color: var(--sf-text-muted); margin: 12px 0 4px; }
    .val { font-weight: 600; }
    .mt { margin-top: 14px; }
    .ok { color: var(--sf-success); margin-top: 10px; }
    .err { color: var(--sf-error); margin-top: 10px; }
  `],
})
export class CuentaPage implements OnInit {
  auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  nombre = this.auth.cuenta?.nombre || '';
  email = this.auth.cuenta?.email || '';
  password = '';
  passwordActual = '';
  /** Si ya tiene contraseña, para cambiarla hay que confirmar la actual. */
  tienePassword = false;
  guardando = false;
  ok = false;
  error: string | null = null;
  completar = false;
  private volver = '/';

  ngOnInit(): void {
    this.completar = this.route.snapshot.queryParamMap.get('completar') === '1';
    this.volver = this.route.snapshot.queryParamMap.get('volver') || '/';
    // Si la cuenta ya tiene contraseña, cambiarla exige confirmar la actual.
    this.tienePassword = !!(this.auth.cuenta as any)?.tienePassword;
  }

  /** Nunca mostrar el código crudo del backend al cliente. */
  private mensajeError(codigo?: string): string {
    switch (codigo) {
      case 'email_en_uso': return 'Ese email ya está en uso.';
      case 'falta_password_actual': return 'Ingresá tu contraseña actual para cambiarla.';
      case 'password_actual_incorrecta': return 'La contraseña actual no coincide.';
      case 'cuenta_no_encontrada': return 'No encontramos tu cuenta. Volvé a ingresar.';
      case 'no_autenticado': return 'Tu sesión venció. Volvé a ingresar.';
      default: return 'No pudimos guardar los cambios. Probá de nuevo.';
    }
  }

  guardar(): void {
    this.ok = false; this.error = null; this.guardando = true;
    const data: any = { nombre: this.nombre, email: this.email };
    if (this.password) {
      data.password = this.password;
      if (this.tienePassword) data.passwordActual = this.passwordActual;
    }
    this.auth.actualizarPerfil(data).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) {
          this.ok = true; this.password = ''; this.passwordActual = ''; this.tienePassword = true;
          if (this.completar) this.router.navigateByUrl(this.volver);
        } else {
          this.error = this.mensajeError(res?.error);
        }
      },
      error: (e) => { this.guardando = false; this.error = e?.message || 'Error'; },
    });
  }

  salir(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
