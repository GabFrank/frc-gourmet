import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { DocumentViewerDialogComponent } from '../document-viewer-dialog/document-viewer-dialog.component';
import { FileUploadComponent, FileUploadCarpeta } from '../file-upload/file-upload.component';
import { RepositoryService } from '../../../database/repository.service';
import { thumbUrl } from '../../utils/image-url.util';

interface AdjuntoView {
  id: number;
  entidadTipo: string;
  entidadId: number;
  tipo: string;
  archivoUrl: string;
  nombreArchivo: string;
  mimeType?: string;
  tamanoBytes?: number;
  observacion?: string;
  createdAt?: string | Date;
}

@Component({
  selector: 'app-adjuntos-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatMenuModule,
    MatSelectModule,
    MatTooltipModule,
    FileUploadComponent,
  ],
  templateUrl: './adjuntos-list.component.html',
  styleUrls: ['./adjuntos-list.component.scss'],
})
export class AdjuntosListComponent implements OnInit, OnChanges {
  /** UPPERCASE: 'GASTO' | 'VALE' | 'CHEQUE' | ... */
  @Input() entidadTipo!: string;
  @Input() entidadId: number | null = null;
  /** Tipos seleccionables para nuevos adjuntos. Si vacío, se usa 'OTRO'. */
  @Input() tiposDisponibles: string[] = ['COMPROBANTE', 'FACTURA', 'RECIBO', 'OTRO'];
  /** Carpeta donde se guardan los archivos (default: 'adjuntos'). */
  @Input() carpeta: FileUploadCarpeta = 'adjuntos';
  /** Solo lectura: oculta upload + delete. */
  @Input() readonly = false;
  @Input() title = 'Adjuntos';

  @Output() changed = new EventEmitter<void>();

  adjuntos: AdjuntoView[] = [];
  loading = false;
  tipoNuevoAdjunto = 'COMPROBANTE';

  constructor(
    private repository: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.tipoNuevoAdjunto = this.tiposDisponibles[0] ?? 'OTRO';
    this.load();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['entidadId'] || changes['entidadTipo']) && this.entidadId) {
      this.load();
    }
  }

  private load(): void {
    if (!this.entidadId || !this.entidadTipo) {
      this.adjuntos = [];
      return;
    }
    this.loading = true;
    this.repository.getAdjuntos({ entidadTipo: this.entidadTipo, entidadId: this.entidadId }).subscribe({
      next: (rows) => {
        this.adjuntos = rows;
        this.loading = false;
      },
      error: (err) => {
        console.error('getAdjuntos error', err);
        this.snackBar.open('Error al cargar adjuntos', 'Cerrar', { duration: 3000 });
        this.loading = false;
      },
    });
  }

  onUploaded(event: { url: string; fileName: string; mimeType: string; tamanoBytes: number }): void {
    if (!this.entidadId) {
      this.snackBar.open('Guardá el registro antes de adjuntar archivos', 'Cerrar', { duration: 3000 });
      return;
    }
    this.repository.createAdjunto({
      entidadTipo: this.entidadTipo,
      entidadId: this.entidadId,
      tipo: this.tipoNuevoAdjunto,
      archivoUrl: event.url,
      nombreArchivo: event.fileName,
      mimeType: event.mimeType,
      tamanoBytes: event.tamanoBytes,
    }).subscribe({
      next: () => {
        this.snackBar.open('Adjunto agregado', 'Cerrar', { duration: 2000 });
        this.load();
        this.changed.emit();
      },
      error: (err) => {
        console.error('createAdjunto error', err);
        this.snackBar.open('Error al guardar adjunto', 'Cerrar', { duration: 3000 });
        // Si falla la creación del registro, dejamos huérfano el archivo. Lo borramos.
        this.repository.deleteFile(event.url).subscribe();
      },
    });
  }

  ver(adjunto: AdjuntoView): void {
    this.dialog.open(DocumentViewerDialogComponent, {
      width: '80vw', maxWidth: '1100px',
      height: '85vh', maxHeight: '900px',
      data: {
        url: adjunto.archivoUrl,
        fileName: adjunto.nombreArchivo,
        mimeType: adjunto.mimeType ?? 'application/octet-stream',
        title: adjunto.tipo,
      },
    });
  }

  eliminar(adjunto: AdjuntoView): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar adjunto',
        message: `¿Eliminar "${adjunto.nombreArchivo}"? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    ref.afterClosed().subscribe((confirm) => {
      if (!confirm) return;
      this.repository.deleteAdjunto(adjunto.id).subscribe({
        next: () => {
          this.snackBar.open('Adjunto eliminado', 'Cerrar', { duration: 2000 });
          this.load();
          this.changed.emit();
        },
        error: (err) => {
          console.error('deleteAdjunto error', err);
          this.snackBar.open('Error al eliminar adjunto', 'Cerrar', { duration: 3000 });
        },
      });
    });
  }

  thumbFor(adjunto: AdjuntoView): string | undefined {
    if (!adjunto.mimeType?.startsWith('image/')) return undefined;
    return thumbUrl(adjunto.archivoUrl);
  }

  iconFor(adjunto: AdjuntoView): string {
    const m = adjunto.mimeType ?? '';
    if (m.startsWith('image/')) return 'image';
    if (m === 'application/pdf') return 'picture_as_pdf';
    if (m.startsWith('text/')) return 'description';
    if (m.includes('word')) return 'article';
    if (m.includes('sheet') || m.includes('excel')) return 'table_chart';
    return 'insert_drive_file';
  }

  formatSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
