import { Component, EventEmitter, Input, Output, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { mediumUrl, resolveAppUrl } from 'src/app/shared/utils/image-url.util';

export type FileUploadCarpeta =
  | 'profile-images'
  | 'producto-images'
  | 'funcionario-documentos'
  | 'adjuntos';

export interface FileUploadResult {
  url: string;
  fileName: string;
  mimeType: string;
  tamanoBytes: number;
  thumbUrl?: string;
  mediumUrl?: string;
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss'],
})
export class FileUploadComponent {
  /** Carpeta destino bajo `userData/`. */
  @Input() carpeta: FileUploadCarpeta = 'adjuntos';
  /** MIME types aceptados (atributo `accept` del input). */
  @Input() accept = 'image/*,application/pdf';
  /** Tamaño máximo en MB. */
  @Input() maxSizeMB = 10;
  /** URL existente — se muestra como preview. */
  @Input() currentUrl?: string | null;
  /** Texto del botón de subir cuando no hay archivo. */
  @Input() label = 'Subir archivo';
  /** Texto debajo del botón ("PNG, JPG hasta 5MB"). Vacío = no se muestra. */
  @Input() hint = '';
  /** Si es solo imagen, mostrar preview (default detecta por currentUrl/mime). */
  @Input() showPreview = true;
  /** Subir thumbnails al upload (solo para imágenes). */
  @Input() generateThumbnails = true;
  /** Confirmar antes de remover archivo existente. */
  @Input() confirmRemove = true;
  /** Deshabilitado. */
  @Input() disabled = false;

  @Output() uploaded = new EventEmitter<FileUploadResult>();
  @Output() removed = new EventEmitter<void>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  uploading = false;
  errorMsg: string | null = null;
  // Nombre del archivo recién subido (para mostrar en preview cuando no es imagen).
  lastFileName: string | null = null;
  lastMimeType: string | null = null;

  constructor(
    private repository: RepositoryService,
    private snack: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  get hasFile(): boolean {
    return !!this.currentUrl;
  }

  get isImage(): boolean {
    if (this.lastMimeType) return this.lastMimeType.startsWith('image/');
    if (!this.currentUrl) return false;
    const lower = this.currentUrl.toLowerCase();
    return /\.(png|jpe?g|gif|webp|svg)$/.test(lower);
  }

  get previewUrl(): string | undefined {
    if (!this.currentUrl || !this.isImage) return undefined;
    // F4: resolveAppUrl ya esta aplicado dentro de mediumUrl(); fallback al
    // original tambien debe pasar por el proxy para mode=client.
    return mediumUrl(this.currentUrl) || resolveAppUrl(this.currentUrl);
  }

  triggerFileInput(): void {
    if (this.disabled || this.uploading) return;
    this.fileInput.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.errorMsg = null;

    const maxBytes = this.maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      this.errorMsg = `Archivo supera el tamaño máximo (${this.maxSizeMB}MB).`;
      this.snack.open(this.errorMsg, 'Cerrar', { duration: 4000 });
      input.value = '';
      return;
    }

    try {
      this.uploading = true;
      const base64 = await readAsBase64(file);
      const result = await firstValueFrom(this.repository.saveFile({
        carpeta: this.carpeta,
        base64,
        fileName: file.name,
        generateThumbnails: this.generateThumbnails,
      }));
      this.currentUrl = result.url;
      this.lastFileName = result.fileName;
      this.lastMimeType = result.mimeType;
      this.uploaded.emit(result);
    } catch (err: any) {
      console.error('FileUpload save failed:', err);
      this.errorMsg = err?.message || 'Error al subir el archivo.';
      this.snack.open(this.errorMsg!, 'Cerrar', { duration: 4000 });
    } finally {
      this.uploading = false;
      input.value = '';
    }
  }

  async remove(): Promise<void> {
    if (this.disabled || !this.currentUrl) return;
    if (this.confirmRemove) {
      const ref = this.dialog.open(ConfirmationDialogComponent, {
        data: {
          title: 'Quitar archivo',
          message: '¿Estás seguro de quitar este archivo? El archivo se eliminará del disco.',
          confirmText: 'Quitar',
          cancelText: 'Cancelar',
        },
      });
      const ok = await firstValueFrom(ref.afterClosed());
      if (!ok) return;
    }
    try {
      await firstValueFrom(this.repository.deleteFile(this.currentUrl));
    } catch (err) {
      console.warn('FileUpload delete failed (continuing):', err);
    }
    this.currentUrl = undefined;
    this.lastFileName = null;
    this.lastMimeType = null;
    this.removed.emit();
  }

  onPreviewError(event: Event): void {
    // Si la derivada medium no existe (imagenes legacy o mode=client sin
    // pre-genera de medium en el server), caer al original via proxy.
    const img = event.target as HTMLImageElement;
    const fallback = resolveAppUrl(this.currentUrl);
    if (fallback && img.src !== fallback) {
      img.src = fallback;
    }
  }
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result viene como `data:<mime>;base64,<...>` — el handler lo limpia.
      resolve(result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
