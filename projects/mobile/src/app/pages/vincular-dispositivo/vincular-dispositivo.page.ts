import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '@frc/shared-core';
import { setSessionTokens } from '../../core/data/api-http';

type Estado = 'cargando' | 'esperando' | 'aprobado' | 'expirado' | 'error';

/**
 * Login por QR — lado del dispositivo (TV KDS / navegador). Muestra un QR que
 * el usuario escanea desde el PWA ya logueado; al aprobarlo, este dispositivo
 * recibe los tokens y queda logueado (como el usuario que aprobó).
 */
@Component({
  selector: 'app-vincular-dispositivo-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './vincular-dispositivo.page.html',
  styleUrls: ['./vincular-dispositivo.page.scss'],
})
export class VincularDispositivoPage implements OnInit, OnDestroy {
  estado: Estado = 'cargando';
  qr = '';
  deviceCode = '';
  private pollTimer: any = null;
  private returnUrl = '/';

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParamMap.get('return') || '/';
    this.iniciar();
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  async iniciar(): Promise<void> {
    this.estado = 'cargando';
    if (this.pollTimer) clearInterval(this.pollTimer);
    try {
      const res = await fetch('/api/auth/device/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceInfo: { userAgent: navigator.userAgent } }),
      });
      const data = await res.json();
      this.deviceCode = data.deviceCode;
      this.qr = data.qr || '';
      this.estado = 'esperando';
      const intervalMs = Math.max(2, Number(data.pollInterval) || 3) * 1000;
      this.pollTimer = setInterval(() => this.poll(), intervalMs);
    } catch (e) {
      console.error('Error iniciando vinculación:', e);
      this.estado = 'error';
    }
  }

  private async poll(): Promise<void> {
    try {
      const res = await fetch('/api/auth/device/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceCode: this.deviceCode }),
      });
      const data = await res.json();
      if (data.status === 'pending') return;
      if (this.pollTimer) clearInterval(this.pollTimer);

      if (data.status === 'approved') {
        setSessionTokens(data.accessToken, data.refreshToken);
        this.auth.applyExternalSession(data.usuario, data.accessToken, data.sessionId);
        this.estado = 'aprobado';
        setTimeout(() => this.router.navigateByUrl(this.returnUrl), 700);
      } else {
        this.estado = 'expirado';
      }
    } catch (e) {
      console.error('Error en poll de vinculación:', e);
    }
  }
}
