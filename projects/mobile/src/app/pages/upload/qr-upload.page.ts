import { Component, ElementRef, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { DocumentScannerComponent } from './document-scanner.component';

interface UploadedItem {
  fileName: string;
  thumb: string; // dataURL o app-url para preview
}

/**
 * Página pública de subida por QR (`/upload?session=<id>`). NO requiere login:
 * el token de sesión (creado por el desktop) es la credencial. Permite escanear
 * un documento con la cámara, tomar una foto o elegir un archivo, y lo sube al
 * server (`POST /api/qr-upload/:session`) same-origin. El desktop lo recibe por
 * polling y lo inserta en el widget de subida.
 */
@Component({
  selector: 'app-qr-upload',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './qr-upload.page.html',
  styleUrls: ['./qr-upload.page.scss'],
})
export class QrUploadPage implements OnInit {
  @ViewChild('photoInput') photoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  state: 'loading' | 'ready' | 'invalid' = 'loading';
  errorMsg = '';

  sessionId = '';
  carpeta = '';
  accept = 'image/*,application/pdf';
  maxSizeMB = 15;

  secureContext = false;
  uploading = false;
  uploaded: UploadedItem[] = [];

  async ngOnInit(): Promise<void> {
    this.secureContext = typeof window !== 'undefined' && !!window.isSecureContext;
    this.sessionId = this.route.snapshot.queryParamMap.get('session') || '';
    if (!this.sessionId) {
      this.state = 'invalid';
      this.errorMsg = 'Falta el código de sesión. Volvé a escanear el QR.';
      return;
    }
    try {
      const res = await fetch(`/api/qr-upload/${encodeURIComponent(this.sessionId)}`);
      const data = await res.json();
      if (!res.ok || !data?.valid) {
        this.state = 'invalid';
        this.errorMsg = 'El código expiró o no es válido. Generá uno nuevo en la PC.';
        return;
      }
      this.carpeta = data.carpeta;
      this.accept = data.accept || this.accept;
      this.maxSizeMB = data.maxSizeMB || this.maxSizeMB;
      this.state = 'ready';
    } catch {
      this.state = 'invalid';
      this.errorMsg = 'No se pudo conectar con la PC. Verificá que sigan en la misma red.';
    }
  }

  async scanDocument(): Promise<void> {
    const ref = this.dialog.open(DocumentScannerComponent, {
      width: '100vw',
      maxWidth: '100vw',
      height: '100dvh',
      maxHeight: '100dvh',
      panelClass: 'fullscreen-dialog',
      autoFocus: false,
    });
    const dataUrl: string | null = await firstValueFrom(ref.afterClosed());
    if (dataUrl) {
      await this.uploadDataUrl(dataUrl, `documento-${Date.now()}.jpg`);
    }
  }

  triggerPhoto(): void {
    this.photoInput.nativeElement.click();
  }

  triggerFile(): void {
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > this.maxSizeMB * 1024 * 1024) {
      this.snack.open(`El archivo supera ${this.maxSizeMB}MB.`, 'Cerrar', { duration: 3500 });
      return;
    }
    const dataUrl = await readAsDataUrl(file);
    await this.uploadDataUrl(dataUrl, file.name || `archivo-${Date.now()}`);
  }

  private async uploadDataUrl(dataUrl: string, fileName: string): Promise<void> {
    this.uploading = true;
    try {
      const res = await fetch(`/api/qr-upload/${encodeURIComponent(this.sessionId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64: dataUrl, fileName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const msg = data?.error === 'sesion_invalida_o_expirada'
          ? 'La sesión expiró. Generá un nuevo QR en la PC.'
          : 'No se pudo subir el archivo. Intentá de nuevo.';
        this.snack.open(msg, 'Cerrar', { duration: 4000 });
        return;
      }
      this.uploaded = [
        { fileName, thumb: dataUrl.startsWith('data:image') ? dataUrl : '' },
        ...this.uploaded,
      ];
      this.snack.open('¡Enviado a la PC!', undefined, { duration: 2500 });
    } catch {
      this.snack.open('No se pudo subir. Verificá la conexión.', 'Cerrar', { duration: 4000 });
    } finally {
      this.uploading = false;
    }
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
