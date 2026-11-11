import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensajeError } from '../../core/errores';
import { ConfigService } from '../../core/config.service';
import { TelefonoInputComponent } from '../../core/telefono-input.component';
import { AnalisisTelefono, analizarGuardado, telefonoLegible } from '../../core/telefono';

declare const google: any;

@Component({
  selector: 'sf-cuenta',
  standalone: true,
  imports: [CommonModule, FormsModule, TelefonoInputComponent],
  template: `
    <div class="sf-container narrow">
      <h1 class="title">{{ completar ? '¡Bienvenido/a!' : 'Mi cuenta' }}</h1>

      <div class="sf-card banner" *ngIf="completar">
        Completá tus datos para agilizar tus próximos pedidos.
      </div>

      <ng-container *ngIf="auth.cuenta as c">
        <div class="sf-card">
          <div class="field" *ngIf="c.telefono">
            <div class="sf-muted lbl">Teléfono</div>
            <div class="val">{{ telefonoIngreso }}</div>
          </div>

          <ng-container *ngIf="!c.telefono">
            <label class="lbl">Teléfono de contacto</label>
            <sf-telefono-input [valor]="telefonoInicial" [forzarError]="intentoGuardar" (cambio)="tel = $event"></sf-telefono-input>
            <p class="sf-muted ayuda">Para los avisos del pedido por WhatsApp y para que el repartidor te contacte.</p>
          </ng-container>

          <label class="lbl">Nombre</label>
          <input class="sf-input" [(ngModel)]="nombre" placeholder="Tu nombre" />
          <ng-container *ngIf="c.emailVerificado">
            <div class="sf-muted lbl">Email</div>
            <div class="val">{{ c.email }} <span class="verif">· verificado con Google</span></div>
          </ng-container>
          <ng-container *ngIf="!c.emailVerificado">
            <label class="lbl">Email {{ c.telefono ? '(opcional)' : '' }}</label>
            <input class="sf-input" [(ngModel)]="email" type="email" placeholder="tu@email.com" />
          </ng-container>
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

        <!-- Avisos: la misma preferencia que la casilla del checkout; vale para los pedidos en curso. -->
        <div class="sf-card mt" *ngIf="config.config.avisosWhatsapp && c.telefonoVerificado">
          <label class="switch-row">
            <span>
              <span class="switch-titulo">Avisos de mis pedidos por WhatsApp</span>
              <span class="sf-muted ayuda">Te escribimos cuando tu pedido es aceptado, está listo, sale y llega.</span>
            </span>
            <input type="checkbox" class="switch" [ngModel]="avisos" (ngModelChange)="cambiarAvisos($event)"
                   [disabled]="guardandoAvisos" aria-label="Avisos de mis pedidos por WhatsApp" />
          </label>
          <p class="ok" *ngIf="avisosOk">{{ avisosOk }}</p>
        </div>

        <!-- Vincular Google: desde ahí «Continuar con Google» entra a esta misma cuenta. -->
        <div class="sf-card mt" [hidden]="!mostrarGoogle">
          <div class="switch-titulo">Entrar también con Google</div>
          <p class="sf-muted ayuda">Vinculá tu cuenta de Google para entrar con ella, sin pedir el código por WhatsApp.</p>
          <div class="google-btn" #googleBtn></div>
          <p class="err" *ngIf="errorGoogle">{{ errorGoogle }}</p>
        </div>
        <p class="ok" *ngIf="googleOk">{{ googleOk }}</p>

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
    .ayuda { font-size: 12px; margin: 4px 0 0; }
    .mt { margin-top: 14px; }
    .ok { color: var(--sf-success); margin-top: 10px; }
    .err { color: var(--sf-error); margin-top: 10px; }
    .verif { color: var(--sf-success); font-weight: 500; font-size: 13px; }
    .switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; }
    .switch-row > span { display: flex; flex-direction: column; }
    .switch-titulo { font-weight: 600; }
    .google-btn { margin-top: 10px; min-height: 44px; }
    .switch { appearance: none; -webkit-appearance: none; flex: none; width: 46px; height: 28px; border-radius: 14px;
              background: var(--sf-border); position: relative; cursor: pointer; transition: background .15s ease; margin: 0; }
    .switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%;
                     background: var(--sf-surface); box-shadow: var(--sf-shadow-card); transition: transform .15s ease; }
    .switch:checked { background: var(--sf-success); }
    .switch:checked::after { transform: translateX(18px); }
    .switch:focus-visible { outline: 2px solid var(--sf-primary); outline-offset: 2px; }
  `],
})
export class CuentaPage implements OnInit, AfterViewInit, OnDestroy {
  auth = inject(AuthService);
  config = inject(ConfigService);
  private zone = inject(NgZone);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  nombre = this.auth.cuenta?.nombre || '';
  email = this.auth.cuenta?.email || '';
  /** Lo guardado, para precargar el campo. */
  telefonoInicial = this.auth.cuenta?.telefonoContacto || '';
  tel: AnalisisTelefono = analizarGuardado(this.telefonoInicial);
  telefonoIngreso = telefonoLegible(this.auth.cuenta?.telefono);
  intentoGuardar = false;
  /** Avisos por WhatsApp: lo elegido (null = nunca eligió → apagado). */
  avisos = this.auth.cuenta?.avisosWhatsapp === true;
  guardandoAvisos = false;
  avisosOk = '';
  @ViewChild('googleBtn') googleBtn?: ElementRef<HTMLElement>;
  mostrarGoogle = false;
  errorGoogle = '';
  googleOk = '';
  private configSub?: Subscription;
  private googleIniciado = false;
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

  ngAfterViewInit(): void {
    this.configSub = this.config.cambios$.subscribe((c) => {
      if (!c.googleClientId || this.googleIniciado || this.auth.cuenta?.emailVerificado) return;
      this.googleIniciado = true;
      this.initGoogle(c.googleClientId);
    });
  }

  ngOnDestroy(): void {
    this.configSub?.unsubscribe();
  }

  private initGoogle(clientId: string): void {
    const render = () => this.zone.run(() => {
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp: any) => this.zone.run(() => this.vincularGoogle(resp?.credential)),
        });
        if (this.googleBtn?.nativeElement) {
          google.accounts.id.renderButton(this.googleBtn.nativeElement, { theme: 'outline', size: 'large', width: 280, text: 'continue_with' });
          this.mostrarGoogle = true;
        }
      } catch { /* GIS no disponible */ }
    });
    if (typeof google !== 'undefined' && google.accounts) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = () => render();
    document.head.appendChild(s);
  }

  private vincularGoogle(idToken?: string): void {
    if (!idToken) return;
    this.errorGoogle = ''; this.googleOk = '';
    this.auth.vincularGoogle(idToken).subscribe({
      next: (res) => {
        if (res?.success) {
          this.mostrarGoogle = false;
          this.email = res.cuenta?.email || this.email;
          this.googleOk = `Listo: ya podés entrar también con Google (${res.cuenta?.email}).`;
        } else {
          this.errorGoogle = res?.error === 'google_en_otra_cuenta'
            ? 'Esa cuenta de Google ya tiene su propia cuenta en la tienda. Entrá con Google para usarla.'
            : this.mensajeError(res?.error);
        }
      },
      error: (e) => { this.errorGoogle = mensajeError(e, 'No pudimos vincular Google. Probá de nuevo.'); },
    });
  }

  cambiarAvisos(v: boolean): void {
    this.avisos = v; this.avisosOk = ''; this.guardandoAvisos = true;
    this.auth.actualizarPerfil({ avisosWhatsapp: v }).subscribe({
      next: (res) => {
        this.guardandoAvisos = false;
        if (res?.success) this.avisosOk = v ? 'Avisos prendidos.' : 'Avisos apagados: no te vamos a escribir por tus pedidos.';
        else { this.avisos = !v; this.error = this.mensajeError(res?.error); }
      },
      error: (e) => { this.guardandoAvisos = false; this.avisos = !v; this.error = mensajeError(e); },
    });
  }

  /** Nunca mostrar el código crudo del backend al cliente. */
  private mensajeError(codigo?: string): string {
    switch (codigo) {
      case 'email_en_uso': return 'Ese email ya está en uso.';
      case 'telefono_invalido': return 'Ese teléfono no parece válido. Revisalo, por favor.';
      case 'falta_password_actual': return 'Ingresá tu contraseña actual para cambiarla.';
      case 'password_actual_incorrecta': return 'La contraseña actual no coincide.';
      case 'cuenta_no_encontrada': return 'No encontramos tu cuenta. Volvé a ingresar.';
      case 'no_autenticado': return 'Tu sesión venció. Volvé a ingresar.';
      default: return mensajeError(codigo, 'No pudimos guardar los cambios. Probá de nuevo.');
    }
  }

  guardar(): void {
    this.ok = false; this.error = null;
    const data: any = { nombre: this.nombre };
    // Un email verificado con Google no se edita acá (cambiarlo lo desverificaría).
    if (!this.auth.cuenta?.emailVerificado) data.email = this.email;
    if (!this.auth.cuenta?.telefono) {
      // Vacío lo borra; escrito a medias o mal, no se guarda.
      if (this.tel.estado !== 'vacio' && this.tel.estado !== 'valido') {
        this.intentoGuardar = true;
        this.error = 'Revisá el teléfono de contacto.';
        return;
      }
      data.telefonoContacto = this.tel.e164;
    }
    this.guardando = true;
    if (this.password) {
      data.password = this.password;
      if (this.tienePassword) data.passwordActual = this.passwordActual;
    }
    this.auth.actualizarPerfil(data).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) {
          if (data.telefonoContacto !== undefined && this.auth.cuenta) this.auth.cuenta.telefonoContacto = data.telefonoContacto || null;
          this.ok = true; this.password = ''; this.passwordActual = ''; this.tienePassword = true;
          if (this.completar) this.router.navigateByUrl(this.volver);
        } else {
          this.error = this.mensajeError(res?.error);
        }
      },
      error: (e) => { this.guardando = false; this.error = mensajeError(e, 'No pudimos guardar los cambios. Probá de nuevo.'); },
    });
  }

  salir(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
