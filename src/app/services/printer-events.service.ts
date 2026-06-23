import { Injectable, OnDestroy } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';

export interface PrinterEventPayload {
  level: 'success' | 'warning' | 'error';
  handler: string;
  entityRef?: { tipo: string; id: number };
  printed?: number;
  errors?: { printerId?: number; sectorId?: number | null; message: string }[];
  message?: string;
}

/**
 * Servicio singleton que escucha el canal IPC `printer-events` (emitido desde
 * `electron/utils/printer-events.utils.ts`) y:
 *
 * 1. **Muestra snackbar** con el mensaje del payload.
 * 2. **Re-expone** los eventos como `Observable<PrinterEventPayload>` para que
 *    componentes individuales (PdV, historial ventas) puedan reaccionar
 *    además del toast — por ejemplo, refrescar la UI o resaltar comandas con
 *    errores.
 *
 * El servicio se auto-inicializa al inyectarse — `AppComponent` lo inyecta
 * en su constructor para arrancar el listener una sola vez para toda la app.
 *
 * **NO** crea múltiples listeners — el `unsubscribe` se ejecuta solo cuando
 * la app se cierra (Electron destruye el preload junto con el renderer).
 */
@Injectable({ providedIn: 'root' })
export class PrinterEventsService implements OnDestroy {

  private readonly events$ = new Subject<PrinterEventPayload>();
  private unsubscribe?: () => void;

  /** Observable público para componentes que quieran reaccionar a eventos. */
  readonly events = this.events$.asObservable();

  constructor(private snackBar: MatSnackBar) {
    this.initListener();
  }

  ngOnDestroy(): void {
    try { this.unsubscribe?.(); } catch { /* ignore */ }
  }

  private initListener(): void {
    const api: any = (window as any).api;
    if (!api?.onPrinterEvent) {
      // Modo cliente HTTP o preload no inyectado — no hay canal IPC, skip.
      return;
    }
    this.unsubscribe = api.onPrinterEvent((payload: PrinterEventPayload) => {
      this.events$.next(payload);
      this.showSnackbar(payload);
    });
  }

  private showSnackbar(payload: PrinterEventPayload): void {
    if (!payload.message) return;
    const config = {
      duration: payload.level === 'error' ? 6000 : 4000,
      panelClass: payload.level === 'error'
        ? ['snack-error']
        : payload.level === 'warning'
          ? ['snack-warning']
          : ['snack-success'],
    };
    this.snackBar.open(payload.message, 'Cerrar', config);
  }
}
