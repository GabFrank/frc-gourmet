import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { BarcodeScannerDialogComponent } from '../ventas/mesas/barcode-scanner-dialog.component';

type Estado = 'inicial' | 'aprobando' | 'ok' | 'error';

/**
 * Login por QR — lado del que autoriza (teléfono ya logueado). Escanea el QR
 * del dispositivo (TV/desktop) y aprueba la vinculación: ese dispositivo queda
 * logueado como este usuario.
 */
@Component({
  selector: 'app-aprobar-dispositivo-page',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatDialogModule],
  templateUrl: './aprobar-dispositivo.page.html',
  styleUrls: ['./aprobar-dispositivo.page.scss'],
})
export class AprobarDispositivoPage {
  estado: Estado = 'inicial';
  mensaje = '';

  constructor(private dialog: MatDialog) {}

  async escanear(): Promise<void> {
    const codigo = await firstValueFrom(
      this.dialog.open(BarcodeScannerDialogComponent, { width: '92vw', maxWidth: '460px' }).afterClosed(),
    );
    if (!codigo) return;
    await this.aprobar(String(codigo).trim());
  }

  private async aprobar(deviceCode: string): Promise<void> {
    this.estado = 'aprobando';
    this.mensaje = '';
    try {
      const token = localStorage.getItem('frc_mobile_access_token') || '';
      const res = await fetch('/api/auth/device/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ deviceCode }),
      });
      if (res.ok) {
        this.estado = 'ok';
      } else {
        const data = await res.json().catch(() => ({}));
        this.estado = 'error';
        this.mensaje = data?.error === 'codigo_expirado'
          ? 'El código expiró. Generá uno nuevo en el dispositivo.'
          : data?.error === 'codigo_ya_procesado'
            ? 'Ese código ya fue usado.'
            : 'No se pudo aprobar. Verificá el código.';
      }
    } catch (e) {
      console.error('Error aprobando dispositivo:', e);
      this.estado = 'error';
      this.mensaje = 'Error de red al aprobar.';
    }
  }
}
