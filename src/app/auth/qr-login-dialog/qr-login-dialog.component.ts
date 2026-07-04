import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../services/auth.service';

type Estado = 'cargando' | 'esperando' | 'aprobado' | 'expirado' | 'error';

/**
 * Login por QR en el desktop (modo cliente). El desktop es el dispositivo: pide
 * un `deviceCode`, muestra su QR y pollea; un teléfono ya logueado lo escanea y
 * aprueba (`/aprobar-dispositivo` en la PWA). Al aprobarse, el desktop queda
 * logueado como ese usuario. Reusa el Device Authorization Grant del server.
 */
@Component({
  selector: 'app-qr-login-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <h2 mat-dialog-title>Ingresar escaneando un QR</h2>
    <mat-dialog-content class="qr-body">
      <ng-container [ngSwitch]="estado">
        <div *ngSwitchCase="'cargando'" class="qr-center">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Generando código…</p>
        </div>

        <div *ngSwitchCase="'esperando'" class="qr-center">
          <img class="qr-img" [src]="qr" alt="Código QR para ingresar" />
          <p class="qr-hint">
            Desde la app en tu teléfono (ya logueado): <strong>Autorizar dispositivo</strong> →
            escaneá este código.
          </p>
        </div>

        <div *ngSwitchCase="'aprobado'" class="qr-center qr-ok">
          <mat-icon>check_circle</mat-icon>
          <p>¡Autorizado! Ingresando…</p>
        </div>

        <div *ngSwitchCase="'expirado'" class="qr-center">
          <mat-icon class="qr-warn">timer_off</mat-icon>
          <p>El código expiró.</p>
          <button mat-flat-button color="primary" (click)="iniciar()">Generar nuevo código</button>
        </div>

        <div *ngSwitchCase="'error'" class="qr-center">
          <mat-icon class="qr-err">error_outline</mat-icon>
          <p>{{ mensaje }}</p>
          <button mat-stroked-button (click)="iniciar()">Reintentar</button>
        </div>
      </ng-container>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cerrar()">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .qr-body { min-width: min(90vw, 340px); }
    .qr-center { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 8px 0; }
    .qr-img { width: 220px; height: 220px; image-rendering: pixelated; border-radius: 8px; background: #fff; padding: 8px; }
    .qr-hint { font-size: 0.85rem; color: var(--text-secondary); margin: 0; }
    .qr-ok mat-icon { color: #4caf50; font-size: 44px; width: 44px; height: 44px; }
    .qr-warn { color: #ff9800; font-size: 44px; width: 44px; height: 44px; }
    .qr-err { color: #f44336; font-size: 44px; width: 44px; height: 44px; }
  `],
})
export class QrLoginDialogComponent implements OnInit, OnDestroy {
  estado: Estado = 'cargando';
  qr = '';
  mensaje = '';

  private deviceCode = '';
  private pollTimer?: any;
  private expiraTimer?: any;

  constructor(
    private readonly dialogRef: MatDialogRef<QrLoginDialogComponent>,
    private readonly authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.iniciar();
  }

  ngOnDestroy(): void {
    this.limpiarTimers();
  }

  async iniciar(): Promise<void> {
    this.limpiarTimers();
    this.estado = 'cargando';
    const api: any = (window as any).api;
    try {
      const res = await api.deviceStart();
      this.deviceCode = res.deviceCode;
      this.qr = res.qr;
      this.estado = 'esperando';
      const pollMs = Math.max(2, Number(res.pollInterval) || 3) * 1000;
      const expiraMs = Math.max(30, Number(res.expiresIn) || 180) * 1000;
      this.pollTimer = setInterval(() => this.poll(), pollMs);
      this.expiraTimer = setTimeout(() => {
        this.limpiarTimers();
        if (this.estado === 'esperando') this.estado = 'expirado';
      }, expiraMs);
    } catch (e: any) {
      this.estado = 'error';
      this.mensaje = (e?.message || 'No se pudo generar el código').replace(/^Error:\s*/, '');
    }
  }

  private async poll(): Promise<void> {
    const api: any = (window as any).api;
    try {
      const res = await api.deviceToken(this.deviceCode);
      if (res?.status === 'approved') {
        this.limpiarTimers();
        this.estado = 'aprobado';
        this.authService.applyExternalSession(res.usuario, res.accessToken, res.sessionId);
        setTimeout(() => this.dialogRef.close('approved'), 600);
      } else if (res?.status === 'expired') {
        this.limpiarTimers();
        this.estado = 'expirado';
      }
      // 'pending' → seguir esperando
    } catch {
      // Error transitorio de red: se reintenta en el próximo tick.
    }
  }

  private limpiarTimers(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = undefined; }
    if (this.expiraTimer) { clearTimeout(this.expiraTimer); this.expiraTimer = undefined; }
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}
