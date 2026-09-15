import { Injectable, Type } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TabsService } from './tabs.service';

export interface DeepLinkParsed {
  tipo: string;
  id: number;
}

/**
 * Servicio de deep links operativos con esquema `#/o/{tipo}/{id}`.
 *
 * Soporta:
 * - `compra` → CompraDetalleComponent (tab)
 * - `gasto` → CreateEditGastoDialogComponent (dialog readonly)
 * - `vale` → CreateEditValeDialogComponent (dialog readonly)
 * - `pago` → DetallePagoConsolidadoDialogComponent (dialog)
 *
 * El interceptor en AppComponent escucha NavigationEnd y delega a openDeepLink().
 */
@Injectable({ providedIn: 'root' })
export class DeepLinkService {
  // Rastreo de dialogs abiertos para evitar duplicados: key = 'tipo-id'
  private openDialogs = new Map<string, MatDialogRef<any>>();

  constructor(
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private tabsService: TabsService,
  ) {}

  /**
   * Parsea un hash de URL en formato `#/o/{tipo}/{id}`.
   * @returns objeto con tipo+id, o null si no coincide con el patrón.
   */
  parseDeepLink(hash: string): DeepLinkParsed | null {
    if (!hash) return null;

    // Remover el # inicial si existe
    const cleaned = hash.startsWith('#') ? hash.substring(1) : hash;

    // Patrón: /o/{tipo}/{id}
    const match = cleaned.match(/^\/o\/([^\/]+)\/(\d+)$/);
    if (!match) return null;

    const tipo = match[1];
    const id = parseInt(match[2], 10);

    if (!tipo || !Number.isFinite(id) || id <= 0) return null;

    return { tipo, id };
  }

  /**
   * Dispatch del deep link: delega al handler correspondiente según el tipo.
   * Muestra errores si el tipo no existe o el ID es inválido.
   */
  async openDeepLink(tipo: string, id: number): Promise<void> {
    if (!tipo || !Number.isFinite(id) || id <= 0) {
      this.snackBar.open('ID inválido en deep link', 'Cerrar', {
        duration: 5000,
        panelClass: 'error-snackbar',
      });
      return;
    }

    try {
      switch (tipo.toLowerCase()) {
        case 'compra':
          await this.openCompra(id);
          break;
        case 'gasto':
          await this.openGasto(id);
          break;
        case 'vale':
          await this.openVale(id);
          break;
        case 'pago':
          await this.openPago(id);
          break;
        default:
          this.snackBar.open(`Tipo de deep link no reconocido: ${tipo}`, 'Cerrar', {
            duration: 5000,
            panelClass: 'error-snackbar',
          });
      }
    } catch (error: any) {
      console.error('Error abriendo deep link:', error);
      this.snackBar.open(
        `Error al abrir el recurso: ${error?.message || 'desconocido'}`,
        'Cerrar',
        { duration: 6000, panelClass: 'error-snackbar' },
      );
    }
  }

  /**
   * Abre CompraDetalleComponent en una tab.
   */
  async openCompra(id: number): Promise<void> {
    // Lazy-import para no cargar el componente hasta que sea necesario
    const { CompraDetalleComponent } = await import(
      '../pages/compras/compra-detalle/compra-detalle.component'
    );

    // Abrir tab (deduplica automáticamente por id si ya existe)
    this.tabsService.openTab(
      `Compra #${id}`,
      CompraDetalleComponent,
      { compraId: id },
      `detalle-compra-${id}`,
      true, // closable
    );
  }

  /**
   * Abre CreateEditGastoDialogComponent en modo readonly.
   */
  async openGasto(id: number): Promise<void> {
    const dialogKey = `gasto-${id}`;

    // Evitar duplicados
    if (this.isDialogOpen(dialogKey)) {
      return;
    }

    // Lazy-import
    const { CreateEditGastoDialogComponent } = await import(
      '../pages/financiero/caja-mayor/gastos/create-edit-gasto/create-edit-gasto-dialog.component'
    );

    const ref = this.dialog.open(CreateEditGastoDialogComponent, {
      width: '700px',
      data: { gastoId: id, readonly: true },
    });

    this.registerDialog(dialogKey, ref);
  }

  /**
   * Abre CreateEditValeDialogComponent en modo readonly.
   * Placeholder: implementado en Fase 4.
   */
  async openVale(id: number): Promise<void> {
    console.log(`[DeepLink] openVale(${id}) - implementar en Fase 4`);
  }

  /**
   * Abre DetallePagoConsolidadoDialogComponent.
   * Placeholder: implementado en Fase 5.
   */
  async openPago(id: number): Promise<void> {
    console.log(`[DeepLink] openPago(${id}) - implementar en Fase 5`);
  }

  /**
   * Registra un dialog abierto para evitar duplicados.
   * @param key identificador único (ej. 'gasto-123')
   * @param ref referencia al MatDialogRef
   */
  protected registerDialog(key: string, ref: MatDialogRef<any>): void {
    this.openDialogs.set(key, ref);
    ref.afterClosed().subscribe(() => {
      this.openDialogs.delete(key);
    });
  }

  /**
   * Verifica si un dialog ya está abierto.
   * @param key identificador único
   * @returns true si el dialog está abierto
   */
  protected isDialogOpen(key: string): boolean {
    return this.openDialogs.has(key);
  }
}
