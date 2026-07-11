import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { AppMode, AppModeDto, AppModeService } from 'src/app/services/app-mode.service';

/**
 * Configuración de conexión accesible DESDE la pantalla de login (pre-autenticación).
 *
 * Permite elegir el modo de operación (standalone / server / cliente) y la URL
 * del server sin depender de editar `app-settings.json` a mano. Reutiliza
 * `AppModeService` cuyos canales IPC (`app-mode-*`, `db-config-restart-app`)
 * están en la whitelist local del preload, por lo que funcionan sin login y en
 * cualquier modo. El device-picker queda fuera (eso vive en el ModeConfig
 * completo, post-login, que sí necesita sesión para listar dispositivos).
 */
@Component({
  selector: 'app-conexion-config-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './conexion-config-dialog.component.html',
  styleUrls: ['./conexion-config-dialog.component.scss'],
})
export class ConexionConfigDialogComponent implements OnInit {
  loading = false;
  testing = false;
  saving = false;

  mode: AppMode = 'standalone';
  initialMode: AppMode = 'standalone';

  serverPort = 7070;
  serverUrl = 'http://192.168.1.10:7070';

  testResult: { ok: boolean; msg: string } | null = null;

  constructor(
    private svc: AppModeService,
    private snack: MatSnackBar,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<ConexionConfigDialogComponent>,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const cfg = await this.svc.get();
      this.mode = cfg.mode;
      this.initialMode = cfg.mode;
      if (cfg.mode === 'server') {
        this.serverPort = cfg.network?.serverPort ?? 7070;
      } else if (cfg.mode === 'client') {
        this.serverUrl = cfg.network?.serverUrl ?? this.serverUrl;
      }
    } catch (e) {
      this.snack.open('No se pudo cargar la configuración: ' + this.errMsg(e), 'OK', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  onModeChange(): void {
    this.testResult = null;
  }

  buildPayload(): AppModeDto {
    if (this.mode === 'server') {
      return { mode: 'server', network: { serverPort: this.serverPort || 7070 } };
    }
    if (this.mode === 'client') {
      return { mode: 'client', network: { serverUrl: this.serverUrl?.trim() || '' } };
    }
    return { mode: 'standalone', network: null };
  }

  async test(): Promise<void> {
    if (this.mode !== 'client') return;
    const url = this.serverUrl?.trim() || '';
    if (!url) {
      this.testResult = { ok: false, msg: 'URL requerida.' };
      return;
    }
    this.testing = true;
    this.testResult = null;
    try {
      const r = await this.svc.testServer(url);
      this.testResult = { ok: !!r.success, msg: r.message || (r.success ? 'Conexión exitosa.' : 'Error') };
    } catch (e) {
      this.testResult = { ok: false, msg: this.errMsg(e) };
    } finally {
      this.testing = false;
    }
  }

  async saveAndRestart(): Promise<void> {
    const payload = this.buildPayload();

    if (payload.mode === 'client' && !payload.network?.serverUrl) {
      this.snack.open('Ingresá la URL del servidor.', 'OK', { duration: 3000 });
      return;
    }

    let mensaje: string;
    if (payload.mode === 'standalone') {
      mensaje = 'Se cambiará a modo standalone (todo local) y la app se reiniciará. ¿Continuar?';
    } else if (payload.mode === 'server') {
      mensaje = `Se cambiará a modo servidor (Fastify en puerto ${payload.network?.serverPort}) y la app se reiniciará. ¿Continuar?`;
    } else {
      mensaje = `Se cambiará a modo cliente apuntando a ${payload.network?.serverUrl} y la app se reiniciará. ¿Continuar?`;
    }

    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Cambiar configuración de conexión',
        message: mensaje,
        confirmText: 'Guardar y reiniciar',
        cancelText: 'Cancelar',
      },
    });
    const ok = await ref.afterClosed().toPromise();
    if (!ok) return;

    this.saving = true;
    try {
      const r = await this.svc.save(payload);
      if (!r.success) {
        this.snack.open('Error guardando: ' + (r.message || ''), 'OK', { duration: 4000 });
        return;
      }
      this.snack.open('Guardado. Reiniciando...', '', { duration: 1500 });
      setTimeout(() => {
        this.svc.restartApp();
      }, 800);
    } catch (e) {
      this.snack.open('Error: ' + this.errMsg(e), 'OK', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  cerrar(): void {
    this.dialogRef.close();
  }

  private errMsg(e: any): string {
    return e instanceof Error ? e.message : String(e);
  }
}
