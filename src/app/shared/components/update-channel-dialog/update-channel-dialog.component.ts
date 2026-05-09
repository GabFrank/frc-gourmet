import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  UpdateChannel,
  UpdateConfig,
  UpdateService,
  UpdateStatusEvent,
} from '../../../services/update.service';

@Component({
  selector: 'app-update-channel-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    MatDividerModule,
  ],
  templateUrl: './update-channel-dialog.component.html',
  styleUrls: ['./update-channel-dialog.component.scss'],
})
export class UpdateChannelDialogComponent implements OnInit, OnDestroy {
  channel: UpdateChannel = 'stable';
  autoCheck = true;
  lastCheckAt: string | null = null;
  appVersion = '';

  status: UpdateStatusEvent = { status: 'idle' };
  downloadPercent = 0;
  available = true;

  private sub?: Subscription;

  constructor(
    private dialogRef: MatDialogRef<UpdateChannelDialogComponent>,
    private updateService: UpdateService,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    this.available = this.updateService.isAvailable();
    this.appVersion = this.detectAppVersion();

    if (this.available) {
      const cfg = await this.updateService.getConfig();
      if (cfg) {
        this.channel = cfg.channel;
        this.autoCheck = cfg.autoCheck;
        this.lastCheckAt = cfg.lastCheckAt ?? null;
      }
    }

    this.sub = this.updateService.status$.subscribe((evt) => {
      this.status = evt;
      if (evt.status === 'progress' && evt.payload?.percent != null) {
        this.downloadPercent = Math.round(evt.payload.percent);
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  async onChannelChange(value: UpdateChannel): Promise<void> {
    const cfg = await this.updateService.setChannel(value);
    if (cfg) {
      this.channel = cfg.channel;
      this.snackBar.open(`Canal cambiado a "${value}"`, 'OK', { duration: 2500 });
    }
  }

  async onAutoCheckChange(enabled: boolean): Promise<void> {
    const cfg = await this.updateService.setAutoCheck(enabled);
    if (cfg) this.autoCheck = cfg.autoCheck;
  }

  async checkNow(): Promise<void> {
    await this.updateService.checkNow();
    this.snackBar.open('Buscando actualización...', undefined, { duration: 2000 });
  }

  async installNow(): Promise<void> {
    await this.updateService.quitAndInstall();
  }

  close(): void {
    this.dialogRef.close();
  }

  statusLabel(): string {
    switch (this.status.status) {
      case 'checking':
        return 'Buscando actualización...';
      case 'available':
        return `Disponible: v${this.status.payload?.version ?? '?'}`;
      case 'not-available':
        return 'Estás en la última versión';
      case 'progress':
        return `Descargando ${this.downloadPercent}%`;
      case 'downloaded':
        return `Lista para instalar: v${this.status.payload?.version ?? '?'}`;
      case 'error':
        return `Error: ${this.status.payload?.message ?? 'desconocido'}`;
      default:
        return 'Sin actividad reciente';
    }
  }

  formatLastCheck(): string {
    if (!this.lastCheckAt) return 'Nunca';
    try {
      return new Date(this.lastCheckAt).toLocaleString();
    } catch {
      return this.lastCheckAt;
    }
  }

  private detectAppVersion(): string {
    const w: any = window as any;
    if (w.api?.appVersion) return w.api.appVersion;
    return '';
  }
}
