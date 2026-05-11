import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { AppMode, AppModeDto, AppModeService, DispositivoOption } from 'src/app/services/app-mode.service';

@Component({
  selector: 'app-mode-config',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './mode-config.component.html',
  styleUrls: ['./mode-config.component.scss'],
})
export class ModeConfigComponent implements OnInit {
  loading = false;
  testing = false;
  saving = false;
  loadingDispositivos = false;

  mode: AppMode = 'standalone';
  initialMode: AppMode = 'standalone';

  serverPort = 7070;
  serverUrl = 'http://192.168.1.10:7070';

  /** F5 paso 3: dispositivo asignado a este PC. Persiste en AppSettings.deviceId. */
  deviceId: number | null = null;
  dispositivos: DispositivoOption[] = [];
  dispositivosError: string | null = null;

  testResult: { ok: boolean; msg: string } | null = null;

  constructor(
    private svc: AppModeService,
    private snack: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.load();
    await this.loadDispositivos();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const cfg = await this.svc.get();
      this.mode = cfg.mode;
      this.initialMode = cfg.mode;
      this.deviceId = cfg.deviceId ?? null;
      if (cfg.mode === 'server') {
        this.serverPort = cfg.network?.serverPort ?? 7070;
      } else if (cfg.mode === 'client') {
        this.serverUrl = cfg.network?.serverUrl ?? this.serverUrl;
      }
    } catch (e) {
      this.snack.open('No se pudo cargar el modo: ' + this.errMsg(e), 'OK', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  async loadDispositivos(): Promise<void> {
    this.loadingDispositivos = true;
    this.dispositivosError = null;
    try {
      const list = await this.svc.listDispositivos();
      this.dispositivos = (list || []).filter(d => d.activo);
    } catch (e) {
      this.dispositivosError = this.errMsg(e);
      this.dispositivos = [];
    } finally {
      this.loadingDispositivos = false;
    }
  }

  onModeChange(): void {
    this.testResult = null;
  }

  buildPayload(): AppModeDto {
    const deviceId = this.deviceId && this.deviceId > 0 ? this.deviceId : null;
    if (this.mode === 'server') {
      return { mode: 'server', network: { serverPort: this.serverPort || 7070 }, deviceId };
    }
    if (this.mode === 'client') {
      return { mode: 'client', network: { serverUrl: this.serverUrl?.trim() || '' }, deviceId };
    }
    return { mode: 'standalone', network: null, deviceId };
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
      this.testResult = { ok: !!r.success, msg: r.message || (r.success ? 'OK' : 'Error') };
    } catch (e) {
      this.testResult = { ok: false, msg: this.errMsg(e) };
    } finally {
      this.testing = false;
    }
  }

  async saveAndRestart(): Promise<void> {
    const payload = this.buildPayload();

    let mensaje: string;
    if (payload.mode === 'standalone') {
      mensaje = 'Se cambiara a modo standalone (todo local) y la app se reiniciara. Continuar?';
    } else if (payload.mode === 'server') {
      mensaje = `Se cambiara a modo server (Fastify en puerto ${payload.network?.serverPort}) y la app se reiniciara. Continuar?`;
    } else {
      mensaje = `Se cambiara a modo cliente apuntando a ${payload.network?.serverUrl} y la app se reiniciara. Continuar?`;
    }
    // F5 paso 3: anexar info del dispositivo seleccionado.
    const dispNombre = payload.deviceId
      ? this.dispositivos.find(d => d.id === payload.deviceId)?.nombre || `ID ${payload.deviceId}`
      : 'sin asignar';
    mensaje += `\n\nDispositivo: ${dispNombre}.`;

    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Cambiar modo de operacion',
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

  private errMsg(e: any): string {
    return e instanceof Error ? e.message : String(e);
  }
}
