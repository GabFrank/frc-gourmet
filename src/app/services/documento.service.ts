import { Injectable } from '@angular/core';
import { from, Observable, of, switchMap, tap } from 'rxjs';

/**
 * Resultado standard de un handler `export-*-pdf` / `export-*-excel` / etc.
 * El handler backend retorna esto y `DocumentoService` decide qué hacer
 * (descargar, abrir en visor, persistir como adjunto).
 */
export interface DocumentoGenerado {
  filename: string;
  base64: string;
  mimeType: string;
}

/** Referencia a la entidad-dueña de un adjunto polimórfico. */
export interface EntidadRef {
  tipo: string;   // 'CPC' | 'CPP' | 'VALE' | etc. — siempre UPPERCASE
  id: number;
}

/** Resultado de `printTicket` — el handler retorna esto sin throw nunca. */
export interface ImpresionResultado {
  ok: boolean;
  printed?: { itemId?: number; sectorId?: number; printerId?: number }[];
  errors?: { printerId?: number; message: string }[];
}

/**
 * Orquesta la generación, descarga, previsualización y persistencia de
 * documentos (PDFs A4, tickets térmicos, exports Excel) en toda la app.
 *
 * **Patrón de invocación:** delega a handlers IPC backend (`export-*-pdf`,
 * `print-*-ticket`, `create-adjunto`, `save-file`) vía `window.api.callIpc`.
 * En modo cliente HTTP, el preload monkey-patchea ipcRenderer.invoke para
 * rutear a `/api/rpc`, así que este servicio funciona transparente en ambos
 * modos.
 *
 * **No reinventes ruedas:** para nuevos documentos, agregá el handler IPC,
 * registralo en main.ts, y usá `documentoService.generar('export-xxx-pdf', params)`.
 * NO hace falta agregar wrappers en `RepositoryService`.
 */
@Injectable({ providedIn: 'root' })
export class DocumentoService {

  private get api(): any {
    return (window as any).api;
  }

  // ============================================================
  // GENERAR (PDF / Excel)
  // ============================================================

  /**
   * Invoca un handler `export-*-pdf` / `export-*-excel` y retorna el documento
   * en base64. El handler debe retornar `{filename, base64, mimeType}`.
   */
  generar(handlerName: string, params?: any): Observable<DocumentoGenerado> {
    return from(this.api.callIpc(handlerName, params));
  }

  // ============================================================
  // DESCARGAR
  // ============================================================

  /**
   * Trigger de descarga en el browser/renderer. Crea un Blob URL y simula
   * un click en `<a download>`. No requiere IPC ni save-file — el archivo
   * va directo al directorio de descargas del SO.
   */
  descargar(doc: DocumentoGenerado): void {
    const blob = this.base64ToBlob(doc.base64, doc.mimeType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ============================================================
  // ABRIR EN VISOR (preview sin guardar)
  // ============================================================

  /**
   * Abre el PDF/imagen en una ventana nueva del propio Electron usando un
   * Blob URL. Para PDFs el visor nativo de Chromium-Electron es suficiente
   * para preview.
   *
   * Si querés el visor custom (`DocumentViewerDialogComponent`), usar
   * `guardarYAbrir` que primero guarda el archivo y abre el visor con la
   * `app://` URL — sólo para firmables que de todos modos se persisten.
   */
  abrirEnVisor(doc: DocumentoGenerado): void {
    const blob = this.base64ToBlob(doc.base64, doc.mimeType);
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      // popup bloqueado — fallback a descarga
      this.descargar(doc);
    }
    // No revocamos la URL aquí: la pestaña/ventana la usa hasta que el usuario cierra.
    // En la práctica, dejarla viva por algunos segundos basta para que se cargue.
  }

  // ============================================================
  // GUARDAR EN DISCO + ADJUNTAR
  // ============================================================

  /**
   * Guarda el documento como archivo persistente en `userData/adjuntos/` y
   * crea una row `Adjunto` polimórfica vinculada a la entidad-dueña.
   *
   * Usado para documentos firmables (pagarés, recibos, liquidaciones) que
   * deben quedar inmutables como evidencia legal/contable.
   *
   * @param doc       documento generado (base64)
   * @param entidad   `{tipo: 'CPC_CUOTA', id: 42}`
   * @param tipo      rol del archivo: `'COMPROBANTE' | 'RECIBO' | 'PAGARE' | 'CONTRATO' | 'OTRO'`
   * @param observacion opcional, contexto adicional
   */
  guardarComoAdjunto(
    doc: DocumentoGenerado,
    entidad: EntidadRef,
    tipo: string,
    observacion?: string,
  ): Observable<any /* Adjunto */> {
    return from(this.api.callIpc('save-file', {
      carpeta: 'adjuntos',
      base64: doc.base64,
      fileName: doc.filename,
      generateThumbnails: false,  // no son imágenes
    })).pipe(
      switchMap((saved: any) => from(this.api.callIpc('create-adjunto', {
        entidadTipo: entidad.tipo.toUpperCase(),
        entidadId: entidad.id,
        tipo: tipo.toUpperCase(),
        archivoUrl: saved.url,
        nombreArchivo: saved.fileName,
        mimeType: saved.mimeType,
        tamanoBytes: saved.tamanoBytes,
        observacion,
      }))),
    );
  }

  /**
   * Atajo: generar + adjuntar en una sola llamada para flujos típicos de
   * documentos firmables (ej. "Generar pagaré y guardar como adjunto del CPC").
   */
  generarYAdjuntar(
    handlerName: string,
    params: any,
    entidad: EntidadRef,
    tipo: string,
    observacion?: string,
  ): Observable<{ documento: DocumentoGenerado; adjunto: any }> {
    return this.generar(handlerName, params).pipe(
      switchMap(documento =>
        this.guardarComoAdjunto(documento, entidad, tipo, observacion).pipe(
          switchMap(adjunto => of({ documento, adjunto })),
        ),
      ),
    );
  }

  // ============================================================
  // ADJUNTO MANUAL (escaneado firmado)
  // ============================================================

  /**
   * Adjuntar un archivo subido por el usuario (típicamente un escaneo del
   * documento firmado). Acepta un `File` del input HTML, lo convierte a
   * base64, lo guarda en disco y crea la row Adjunto.
   */
  adjuntarArchivoSubido(
    file: File,
    entidad: EntidadRef,
    tipo: string,
    observacion?: string,
  ): Observable<any> {
    return from(this.fileToBase64(file)).pipe(
      switchMap(base64 => from(this.api.callIpc('save-file', {
        carpeta: 'adjuntos',
        base64,
        fileName: file.name,
        generateThumbnails: file.type.startsWith('image/'),
      }))),
      switchMap((saved: any) => from(this.api.callIpc('create-adjunto', {
        entidadTipo: entidad.tipo.toUpperCase(),
        entidadId: entidad.id,
        tipo: tipo.toUpperCase(),
        archivoUrl: saved.url,
        nombreArchivo: saved.fileName,
        mimeType: saved.mimeType,
        tamanoBytes: saved.tamanoBytes,
        observacion,
      }))),
    );
  }

  // ============================================================
  // IMPRIMIR TICKET TÉRMICO
  // ============================================================

  /**
   * Invoca un handler `print-*-ticket` que ejecuta `printTicketSpec` en el
   * backend. Por contrato los handlers de impresión NUNCA hacen throw —
   * retornan `{ ok, printed, errors }`. El frontend solo necesita mostrar
   * toast si hay errores.
   */
  imprimirTicket(handlerName: string, params: any): Observable<ImpresionResultado> {
    return from(this.api.callIpc(handlerName, params));
  }

  // ============================================================
  // HELPERS PRIVADOS
  // ============================================================

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const cleanBase64 = base64.replace(/^data:[^;]+;base64,/, '');
    const byteChars = atob(cleanBase64);
    const byteArrays: Uint8Array[] = [];
    const sliceSize = 512;
    for (let offset = 0; offset < byteChars.length; offset += sliceSize) {
      const slice = byteChars.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) byteNumbers[i] = slice.charCodeAt(i);
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mimeType });
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // FileReader.readAsDataURL devuelve "data:mime;base64,XXX" → strip el prefijo
        const base64 = result.split(',')[1] || result;
        resolve(base64);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
