import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, QrUploadedFile } from 'src/app/database/repository.service';

export interface QrUploadDialogData {
  /** Carpeta destino bajo `userData/`. */
  carpeta: string;
  /** MIME types aceptados (informativo para la página mobile). */
  accept?: string;
  /** Tamaño máximo en MB. */
  maxSizeMB?: number;
  /** Permitir subir varios archivos antes de cerrar (adjuntos). */
  multiple?: boolean;
  /** Título del diálogo. */
  titulo?: string;
}

type DialogState = 'loading' | 'ready' | 'error';

/**
 * Diálogo que muestra un QR para subir archivos desde el celular vía la PWA.
 *
 * Al abrir crea una sesión de emparejamiento (`qr-upload-create-session`) que
 * asegura el server local y devuelve un QR apuntando a `/upload?session=<id>`.
 * Hace polling (`qr-upload-poll`) hasta recibir archivo(s); al cerrar devuelve
 * `QrUploadedFile[]`. El toggle "escáner/remoto" activa el túnel HTTPS.
 */
@Component({
  selector: 'app-qr-upload-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
  ],
  templateUrl: './qr-upload-dialog.component.html',
  styleUrls: ['./qr-upload-dialog.component.scss'],
})
export class QrUploadDialogComponent implements OnInit, OnDestroy {
  state: DialogState = 'loading';
  errorMsg = '';
  titulo = 'Subir desde el celular';

  qrDataUrl: string | null = null;
  targetUrl = '';
  sessionId: string | null = null;

  multiple = false;
  received: QrUploadedFile[] = [];
  receivedCount = 0;

  remoteEnabled = false;
  remoteLoading = false;
  remoteUrl: string | null = null;

  private pollTimer: any = null;
  private destroyed = false;

  constructor(
    private repository: RepositoryService,
    private dialogRef: MatDialogRef<QrUploadDialogComponent, QrUploadedFile[]>,
    @Inject(MAT_DIALOG_DATA) public data: QrUploadDialogData,
  ) {
    this.multiple = !!data?.multiple;
    if (data?.titulo) this.titulo = data.titulo;
  }

  async ngOnInit(): Promise<void> {
    try {
      const res: any = await firstValueFrom(
        this.repository.qrUploadCreateSession({
          carpeta: this.data.carpeta,
          accept: this.data.accept,
          maxSizeMB: this.data.maxSizeMB,
        }),
      );
      if (!res?.ok) {
        this.state = 'error';
        this.errorMsg = res?.error || 'No se pudo generar el código QR.';
        return;
      }
      this.sessionId = res.sessionId;
      this.qrDataUrl = res.qrDataUrl || null;
      this.targetUrl = res.targetUrl || '';
      this.state = 'ready';
      this.startPolling();
    } catch (err: any) {
      this.state = 'error';
      this.errorMsg = err?.message || 'No se pudo generar el código QR.';
    }
  }

  private startPolling(): void {
    if (!this.sessionId) return;
    this.pollTimer = setInterval(() => this.poll(), 2000);
  }

  private async poll(): Promise<void> {
    if (this.destroyed || !this.sessionId) return;
    try {
      const res: any = await firstValueFrom(this.repository.qrUploadPoll(this.sessionId));
      if (!res?.ok) {
        // Sesión expirada.
        if (res?.expired) {
          this.stopPolling();
          this.state = 'error';
          this.errorMsg = 'El código expiró. Cerrá y volvé a generar uno.';
        }
        return;
      }
      const files: QrUploadedFile[] = res.files || [];
      if (files.length > this.received.length) {
        this.received = files;
        this.receivedCount = files.length;
        if (!this.multiple) {
          // Un solo archivo: cerrar apenas llega.
          this.finish();
        }
      }
    } catch {
      /* reintenta en el próximo tick */
    }
  }

  async toggleRemote(): Promise<void> {
    if (this.remoteLoading || !this.sessionId) return;
    if (this.remoteEnabled) return; // no soportamos apagar el túnel desde acá
    this.remoteLoading = true;
    try {
      const res: any = await firstValueFrom(this.repository.qrUploadEnableRemote(this.sessionId));
      if (res?.ok) {
        this.remoteEnabled = true;
        this.remoteUrl = res.remoteUrl || null;
        this.qrDataUrl = res.qrDataUrl || this.qrDataUrl;
        this.targetUrl = res.targetUrl || this.targetUrl;
      } else {
        this.errorMsg = res?.error || 'No se pudo activar el acceso remoto.';
      }
    } catch (err: any) {
      this.errorMsg = err?.message || 'No se pudo activar el acceso remoto.';
    } finally {
      this.remoteLoading = false;
    }
  }

  finish(): void {
    this.stopPolling();
    this.dialogRef.close(this.received.length ? this.received : undefined);
  }

  cancel(): void {
    this.stopPolling();
    this.dialogRef.close(this.received.length ? this.received : undefined);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopPolling();
    if (this.sessionId) {
      // Best-effort: liberar la sesión en el main process.
      firstValueFrom(this.repository.qrUploadClose(this.sessionId)).catch(() => { /* ignore */ });
    }
  }
}
