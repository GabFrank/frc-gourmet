import { Component, Inject, OnDestroy, OnInit, ViewChild, ElementRef, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

export interface DocumentViewerData {
  /** URL `app://...` o cualquier URL renderizable. */
  url: string;
  /** Nombre del archivo (para mostrar y descargar). */
  fileName: string;
  /** MIME type — define cómo renderiza. */
  mimeType: string;
  /** Título opcional del dialog. */
  title?: string;
}

type ViewerKind = 'image' | 'pdf' | 'text' | 'unsupported';

@Component({
  selector: 'app-document-viewer-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  templateUrl: './document-viewer-dialog.component.html',
  styleUrls: ['./document-viewer-dialog.component.scss'],
})
export class DocumentViewerDialogComponent implements OnInit, OnDestroy {

  @ViewChild('pdfContainer') pdfContainer?: ElementRef<HTMLDivElement>;

  kind: ViewerKind = 'unsupported';
  loading = false;
  errorMsg: string | null = null;

  // PDF state
  pdfDoc: any = null;
  pdfPage = 1;
  pdfPageCount = 0;
  pdfZoom = 1.0;
  private pdfRendering = false;
  private pdfPendingPage: number | null = null;

  // Texto plano
  textContent: string | null = null;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DocumentViewerData,
    public dialogRef: MatDialogRef<DocumentViewerDialogComponent>,
    private repository: RepositoryService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
  ) {}

  async ngOnInit(): Promise<void> {
    this.kind = this.detectKind(this.data.mimeType, this.data.fileName);
    if (this.kind === 'pdf') {
      await this.loadPdf();
    } else if (this.kind === 'text') {
      await this.loadText();
    }
  }

  ngOnDestroy(): void {
    if (this.pdfDoc?.destroy) {
      try { this.pdfDoc.destroy(); } catch { /* ignore */ }
    }
  }

  private detectKind(mime: string, name: string): ViewerKind {
    const m = (mime || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(n)) return 'image';
    if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
    if (m.startsWith('text/') || /\.(txt|csv|json|md|log)$/.test(n)) return 'text';
    return 'unsupported';
  }

  // ===== PDF =====

  private async loadPdf(): Promise<void> {
    this.loading = true;
    try {
      // Lazy import del legacy bundle (evita romper en tests / SSR).
      const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.js';

      // Leer el archivo a Uint8Array vía IPC para evitar problemas con `app://` y CORS.
      const { base64 } = await firstValueFrom(this.repository.readFileBase64(this.data.url));
      const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const loadingTask = pdfjsLib.getDocument({ data });
      this.pdfDoc = await loadingTask.promise;
      this.pdfPageCount = this.pdfDoc.numPages;
      this.pdfPage = 1;

      // Render una vez que el container exista en el DOM.
      setTimeout(() => this.renderPdfPage(this.pdfPage), 0);
    } catch (err: any) {
      console.error('PDF load failed:', err);
      this.errorMsg = err?.message || 'No se pudo cargar el PDF.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private async renderPdfPage(pageNum: number): Promise<void> {
    if (!this.pdfDoc || !this.pdfContainer) return;
    if (this.pdfRendering) {
      this.pdfPendingPage = pageNum;
      return;
    }
    this.pdfRendering = true;
    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.pdfZoom });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      // Vacía el contenedor y mete el canvas nuevo.
      const container = this.pdfContainer.nativeElement;
      container.innerHTML = '';
      container.appendChild(canvas);
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      console.error('PDF render failed:', err);
      this.errorMsg = 'Error al renderizar la página.';
    } finally {
      this.pdfRendering = false;
      if (this.pdfPendingPage !== null) {
        const next = this.pdfPendingPage;
        this.pdfPendingPage = null;
        this.zone.run(() => this.renderPdfPage(next));
      }
    }
  }

  pdfPrevPage(): void {
    if (this.pdfPage > 1) {
      this.pdfPage--;
      this.renderPdfPage(this.pdfPage);
    }
  }

  pdfNextPage(): void {
    if (this.pdfPage < this.pdfPageCount) {
      this.pdfPage++;
      this.renderPdfPage(this.pdfPage);
    }
  }

  pdfZoomIn(): void {
    this.pdfZoom = Math.min(this.pdfZoom + 0.25, 3);
    this.renderPdfPage(this.pdfPage);
  }

  pdfZoomOut(): void {
    this.pdfZoom = Math.max(this.pdfZoom - 0.25, 0.5);
    this.renderPdfPage(this.pdfPage);
  }

  // ===== Texto =====

  private async loadText(): Promise<void> {
    this.loading = true;
    try {
      const { base64 } = await firstValueFrom(this.repository.readFileBase64(this.data.url));
      this.textContent = atob(base64);
    } catch (err: any) {
      this.errorMsg = err?.message || 'No se pudo cargar el archivo.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  // ===== Acciones comunes =====

  async openWithSystem(): Promise<void> {
    try {
      const res = await firstValueFrom(this.repository.openFileWithSystem(this.data.url));
      if (!res.ok) {
        this.errorMsg = res.error || 'No se pudo abrir con el sistema.';
      }
    } catch (err: any) {
      this.errorMsg = err?.message || 'Error al abrir con sistema.';
    }
  }

  async download(): Promise<void> {
    try {
      const { base64, mimeType } = await firstValueFrom(this.repository.readFileBase64(this.data.url));
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mimeType });
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = this.data.fileName || 'archivo';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err: any) {
      this.errorMsg = err?.message || 'Error al descargar.';
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
