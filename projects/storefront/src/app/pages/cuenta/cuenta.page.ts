import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'sf-cuenta',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="sf-container sf-narrow">
      <h1 class="sf-title">Mi cuenta</h1>

      <ng-container *ngIf="auth.cuenta as c">
        <div class="sf-card">
          <div class="sf-muted">Teléfono</div>
          <div class="sf-val">{{ c.telefono }}</div>

          <label class="sf-label">Nombre</label>
          <input class="sf-input" [(ngModel)]="nombre" placeholder="Tu nombre" />
          <label class="sf-label">Email (opcional)</label>
          <input class="sf-input" [(ngModel)]="email" placeholder="tu@email.com" />
          <label class="sf-label">Contraseña (opcional)</label>
          <input class="sf-input" type="password" [(ngModel)]="password" placeholder="Para ingresar sin OTP" />

          <button class="sf-btn sf-full" [disabled]="guardando" (click)="guardar()">
            {{ guardando ? 'Guardando…' : 'Guardar' }}
          </button>
          <p class="sf-ok" *ngIf="ok">Guardado ✅</p>
          <p class="sf-error" *ngIf="error">{{ error }}</p>
        </div>

        <button class="sf-btn sf-btn--ghost sf-full sf-mt" (click)="salir()">Cerrar sesión</button>
      </ng-container>

      <p class="sf-muted" *ngIf="!auth.cuenta">No estás logueado.</p>
    </div>
  `,
  styles: [`
    .sf-narrow { max-width: 420px; }
    .sf-title { font-size: 22px; margin: 8px 0 16px; }
    .sf-label { display: block; font-size: 13px; color: var(--sf-text-muted); margin: 10px 0 4px; }
    .sf-val { font-weight: 600; margin-bottom: 6px; }
    .sf-input { margin-bottom: 4px; }
    .sf-full { width: 100%; margin-top: 12px; }
    .sf-mt { margin-top: 14px; }
    .sf-ok { color: var(--sf-success); }
    .sf-error { color: #c0392b; }
  `],
})
export class CuentaPage {
  auth = inject(AuthService);
  private router = inject(Router);

  nombre = this.auth.cuenta?.nombre || '';
  email = this.auth.cuenta?.email || '';
  password = '';
  guardando = false;
  ok = false;
  error: string | null = null;

  guardar(): void {
    this.ok = false;
    this.error = null;
    this.guardando = true;
    const data: any = { nombre: this.nombre, email: this.email };
    if (this.password) data.password = this.password;
    this.auth.actualizarPerfil(data).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) {
          this.ok = true;
          this.password = '';
        } else {
          this.error = res?.error === 'email_en_uso' ? 'Ese email ya está en uso.' : res?.error || 'Error';
        }
      },
      error: (e) => {
        this.guardando = false;
        this.error = e?.message || 'Error';
      },
    });
  }

  salir(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
