import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { DocumentoService, DocumentoGenerado, EntidadRef } from '../../../services/documento.service';

export type DocumentFormat = 'PDF' | 'TICKET' | 'EXCEL';

/**
 * Botón con mat-menu reusable que ofrece las acciones estándar para un
 * documento generable de una entidad:
 *
 *  - **Descargar PDF / Excel** — invoca handler IPC backend y baja el archivo.
 *  - **Abrir en visor** — preview rápido con Blob URL en ventana nueva.
 *  - **Imprimir ticket térmico** — invoca handler `print-*-ticket` del backend.
 *  - **Adjuntar firmado escaneado** — input file → save-file + create-adjunto.
 *
 * Se inserta en cada página de detalle de entidad (CPC, Vale, Liquidación, etc.):
 *
 *   <app-document-actions
 *     docType="PAGARE_CPC"
 *     [entidad]="{ tipo: 'CPC', id: cuenta.id }"
 *     handlerName="export-pagare-cpc-pdf"
 *     [handlerParams]="{ cpcId: cuenta.id }"
 *     [formats]="['PDF']"
 *     [persistirComoAdjunto]="true"
 *     adjuntoTipo="PAGARE_FIRMADO"
 *     ticketHandlerName="print-recibo-cobro-cuota-ticket">
 *   </app-document-actions>
 *
 * Para reportes operativos (sin entidad-dueña, no firmables): omitir
 * `entidad`, `persistirComoAdjunto` y `adjuntoTipo`. El botón "Adjuntar
 * firmado" se oculta automáticamente.
 */
@Component({
  selector: 'app-document-actions',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDividerModule,
  ],
  templateUrl: './document-actions.component.html',
  styleUrls: ['./document-actions.component.scss'],
})
export class DocumentActionsComponent {
  /** Identificador legible del tipo de documento (informativo, no funcional). */
  @Input() docType?: string;

  /** Entidad-dueña (para Adjunto polimórfico). Omitir para reportes operativos. */
  @Input() entidad?: EntidadRef;

  /** Handler IPC backend `export-*-pdf` / `export-*-excel`. */
  @Input() handlerName?: string;

  /** Parámetros que recibe el handler. */
  @Input() handlerParams: any = {};

  /** Formatos disponibles en el menú. Default: solo PDF. */
  @Input() formats: DocumentFormat[] = ['PDF'];

  /** Handler `print-*-ticket` para impresión térmica. */
  @Input() ticketHandlerName?: string;
  @Input() ticketHandlerParams: any = {};

  /** Si true, descargar PDF también lo guarda como Adjunto (firmables). */
  @Input() persistirComoAdjunto = false;

  /** Tipo de adjunto: 'COMPROBANTE' | 'PAGARE' | 'RECIBO' | ... (UPPERCASE). */
  @Input() adjuntoTipo = 'COMPROBANTE';

  /** Mostrar opción "Adjuntar archivo firmado" (input file). */
  @Input() permiteAdjuntarFirmado = true;

  /** MIME types aceptados para "Adjuntar firmado". */
  @Input() acceptFirmado = 'application/pdf,image/*';

  /** Texto del botón principal. */
  @Input() label = 'Documento';

  /** Icono del botón principal. */
  @Input() icon = 'description';

  /** Variante visual: 'stroked' (botón con borde), 'icon' (solo ícono), 'flat' (botón plano). */
  @Input() variant: 'stroked' | 'icon' | 'flat' | 'raised' = 'stroked';

  /** Color Material. */
  @Input() color: 'primary' | 'accent' | 'warn' | '' = '';

  @Input() disabled = false;

  /** Emite cuando un adjunto se crea (para refrescar lista en el padre). */
  @Output() adjuntoCreado = new EventEmitter<any>();

  /** Emite cuando se genera un documento (para que el padre lo guarde en algún lado custom). */
  @Output() documentoGenerado = new EventEmitter<DocumentoGenerado>();

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  loading = false;

  // ─── Computed flags ──────────────────────────────────────────────────────
  get showPdf(): boolean { return this.formats.includes('PDF') && !!this.handlerName; }
  get showExcel(): boolean { return this.formats.includes('EXCEL') && !!this.handlerName; }
  get showTicket(): boolean { return this.formats.includes('TICKET') && !!this.ticketHandlerName; }
  get showAdjuntar(): boolean { return this.permiteAdjuntarFirmado && !!this.entidad; }

  constructor(
    private documentoService: DocumentoService,
    private snackBar: MatSnackBar,
  ) {}

  // ─── Acciones PDF ────────────────────────────────────────────────────────
  async onDescargarPdf(): Promise<void> {
    if (!this.handlerName) return;
    this.loading = true;
    try {
      const doc = await firstValueFrom(this.documentoService.generar(this.handlerName, this.handlerParams));
      this.documentoGenerado.emit(doc);
      this.documentoService.descargar(doc);

      // Persistir como adjunto si está activado
      if (this.persistirComoAdjunto && this.entidad) {
        const adj = await firstValueFrom(
          this.documentoService.guardarComoAdjunto(doc, this.entidad, this.adjuntoTipo),
        );
        this.adjuntoCreado.emit(adj);
        this.snackBar.open(`PDF descargado y adjuntado a ${this.entidad.tipo}`, 'Cerrar', { duration: 3000 });
      } else {
        this.snackBar.open('PDF descargado', 'Cerrar', { duration: 2000 });
      }
    } catch (err: any) {
      console.error('Error generar PDF:', err);
      this.snackBar.open(`Error: ${err?.message || err}`, 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  async onAbrirEnVisor(): Promise<void> {
    if (!this.handlerName) return;
    this.loading = true;
    try {
      const doc = await firstValueFrom(this.documentoService.generar(this.handlerName, this.handlerParams));
      this.documentoGenerado.emit(doc);
      this.documentoService.abrirEnVisor(doc);
    } catch (err: any) {
      console.error('Error preview PDF:', err);
      this.snackBar.open(`Error: ${err?.message || err}`, 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  // ─── Excel ───────────────────────────────────────────────────────────────
  async onDescargarExcel(): Promise<void> {
    if (!this.handlerName) return;
    // Convención: el handler Excel tiene el mismo nombre pero termina en `-excel`
    // en vez de `-pdf`. Si el caller pasó `export-foo-pdf`, asumimos `export-foo-excel`.
    const excelHandler = this.handlerName.replace(/-pdf$/, '-excel');
    this.loading = true;
    try {
      const doc = await firstValueFrom(this.documentoService.generar(excelHandler, this.handlerParams));
      this.documentoService.descargar(doc);
      this.snackBar.open('Excel descargado', 'Cerrar', { duration: 2000 });
    } catch (err: any) {
      console.error('Error generar Excel:', err);
      this.snackBar.open(`Error: ${err?.message || err}`, 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  // ─── Imprimir ticket ─────────────────────────────────────────────────────
  async onImprimirTicket(): Promise<void> {
    if (!this.ticketHandlerName) return;
    this.loading = true;
    try {
      const params = Object.keys(this.ticketHandlerParams).length > 0
        ? this.ticketHandlerParams
        : this.handlerParams;
      const res = await firstValueFrom(this.documentoService.imprimirTicket(this.ticketHandlerName, params));
      if (res.ok) {
        const count = res.printed?.length ?? 0;
        this.snackBar.open(`Ticket impreso${count > 1 ? ` (${count} impresoras)` : ''}`, 'Cerrar', { duration: 2500 });
      } else {
        const errMsg = res.errors?.[0]?.message || 'No se pudo imprimir';
        this.snackBar.open(`Impresión falló: ${errMsg}`, 'Cerrar', { duration: 5000 });
      }
    } catch (err: any) {
      console.error('Error print ticket:', err);
      this.snackBar.open(`Error: ${err?.message || err}`, 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  // ─── Adjuntar firmado escaneado ──────────────────────────────────────────
  onSeleccionarArchivo(): void {
    this.fileInput?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.entidad) {
      if (input) input.value = '';
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      this.snackBar.open('Archivo muy grande (máx 20 MB)', 'Cerrar', { duration: 3000 });
      input.value = '';
      return;
    }

    this.loading = true;
    try {
      const adj = await firstValueFrom(
        this.documentoService.adjuntarArchivoSubido(file, this.entidad, this.adjuntoTipo + '_FIRMADO'),
      );
      this.adjuntoCreado.emit(adj);
      this.snackBar.open(`Adjunto firmado guardado (${file.name})`, 'Cerrar', { duration: 3000 });
    } catch (err: any) {
      console.error('Error adjuntar firmado:', err);
      this.snackBar.open(`Error: ${err?.message || err}`, 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
      input.value = '';
    }
  }
}
