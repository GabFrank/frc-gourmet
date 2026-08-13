import { Component, inject, AfterViewInit, NgZone, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';

declare const google: any;

@Component({
  selector: 'sf-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements AfterViewInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private zone = inject(NgZone);
  config = inject(ConfigService);

  @ViewChild('googleBtn') googleBtn?: ElementRef<HTMLElement>;

  metodo: 'telefono' | 'email' = 'telefono';
  // OTP
  paso: 'telefono' | 'codigo' = 'telefono';
  telefono = '';
  codigo = '';
  devHint = false;
  devCodigo: string | null = null;
  // Email
  modoEmail: 'login' | 'registro' = 'login';
  email = '';
  password = '';
  nombre = '';

  enviando = false;
  error: string | null = null;

  ngAfterViewInit(): void {
    const clientId = this.config.config.googleClientId;
    if (clientId) this.initGoogle(clientId);
  }

  private initGoogle(clientId: string): void {
    const render = () => {
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp: any) => this.zone.run(() => this.onGoogle(resp?.credential)),
        });
        if (this.googleBtn?.nativeElement) {
          google.accounts.id.renderButton(this.googleBtn.nativeElement, { theme: 'outline', size: 'large', width: 320, text: 'continue_with' });
        }
      } catch { /* GIS no disponible */ }
    };
    if (typeof google !== 'undefined' && google.accounts) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => render();
    document.head.appendChild(s);
  }

  private onGoogle(idToken?: string): void {
    if (!idToken) return;
    this.enviando = true; this.error = null;
    this.auth.googleLogin(idToken).subscribe({
      next: (res) => { this.enviando = false; res?.success ? this.exito() : (this.error = this.msg(res?.error)); },
      error: (e) => { this.enviando = false; this.error = 'No se pudo ingresar con Google. ' + (e?.message || ''); },
    });
  }

  // ---- OTP ----
  pedirCodigo(): void {
    this.error = null;
    if (this.telefono.replace(/\D+/g, '').length < 6) { this.error = 'Ingresá un número válido.'; return; }
    this.enviando = true;
    this.auth.solicitarOtp(this.telefono).subscribe({
      next: (res) => {
        this.enviando = false;
        if (res?.success) { this.paso = 'codigo'; this.devHint = res.provider === 'dev-log'; if (res.devCodigo) { this.devCodigo = res.devCodigo; this.codigo = res.devCodigo; } }
        else this.error = this.msg(res?.error);
      },
      error: (e) => { this.enviando = false; this.error = 'No se pudo enviar el código. ' + (e?.message || ''); },
    });
  }

  verificar(): void {
    this.error = null;
    if (this.codigo.trim().length !== 6) { this.error = 'El código tiene 6 dígitos.'; return; }
    this.enviando = true;
    this.auth.verificarOtp(this.telefono, this.codigo.trim()).subscribe({
      next: (res) => { this.enviando = false; res?.success ? this.exito() : (this.error = this.msg(res?.error)); },
      error: (e) => { this.enviando = false; this.error = 'No se pudo verificar. ' + (e?.message || ''); },
    });
  }

  // ---- Email ----
  submitEmail(): void {
    this.error = null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.email.trim())) { this.error = 'Email inválido.'; return; }
    if (this.password.length < 6) { this.error = 'La contraseña necesita al menos 6 caracteres.'; return; }
    this.enviando = true;
    const obs = this.modoEmail === 'registro'
      ? this.auth.registrar(this.email.trim(), this.password, this.nombre.trim())
      : this.auth.loginPassword(this.email.trim(), this.password);
    obs.subscribe({
      next: (res) => { this.enviando = false; res?.success ? this.exito() : (this.error = this.msg(res?.error)); },
      error: (e) => { this.enviando = false; this.error = 'No se pudo continuar. ' + (e?.message || ''); },
    });
  }

  private exito(): void {
    const volver = this.route.snapshot.queryParamMap.get('volver') || '/';
    // Si la cuenta no tiene nombre, mandamos a completar el perfil primero.
    if (this.auth.necesitaPerfil) {
      this.router.navigate(['/cuenta'], { queryParams: { completar: 1, volver } });
    } else {
      this.router.navigateByUrl(volver);
    }
  }

  private msg(err?: string): string {
    switch (err) {
      case 'telefono_invalido': return 'Número inválido.';
      case 'demasiadas_solicitudes': return 'Esperá un momento antes de pedir otro código.';
      case 'otp_no_encontrado_o_expirado': return 'El código expiró. Pedí uno nuevo.';
      case 'codigo_incorrecto': return 'Código incorrecto.';
      case 'demasiados_intentos': return 'Demasiados intentos. Pedí un código nuevo.';
      case 'envio_fallido': return 'No se pudo enviar el código por WhatsApp.';
      case 'email_invalido': return 'Email inválido.';
      case 'password_corto': return 'La contraseña necesita al menos 6 caracteres.';
      case 'email_en_uso': return 'Ese email ya está registrado. Probá iniciar sesión.';
      case 'cuenta_o_password_invalidos': return 'Email o contraseña incorrectos.';
      case 'google_no_configurado': return 'El login con Google no está disponible.';
      default: return err || 'Ocurrió un error.';
    }
  }
}
