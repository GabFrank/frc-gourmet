import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { PrecioDelivery } from '../../../database/entities/ventas/precio-delivery.entity';
import { DeliveryEstado, DeliveryModo } from '../../../database/entities/ventas/delivery.entity';
import { ConvertirModoDeliveryPayload } from '../../../database/convertir-modo-delivery.types';
import { SeleccionarRepartidorDialogComponent } from '../seleccionar-repartidor-dialog/seleccionar-repartidor-dialog.component';

export interface ConvertirModoDeliveryDialogData {
  /** El pedido a convertir, tal como lo devuelve `delivery-listar-pdv`. */
  delivery: any;
}

export interface ConvertirModoDeliveryDialogResult {
  /** Lo que devolvió `delivery-convertir-modo`. */
  resultado: any;
  /** El cajero pidió reimprimir el ticket con los datos nuevos. */
  reimprimir: boolean;
}

/**
 * Convierte un pedido de reparto en uno para retirar, y al revés.
 *
 * Es un diálogo propio y no un campo más de EDITAR DATOS porque el modo no es
 * un dato del cliente: decide **si existen** la dirección, el costo de envío y
 * el repartidor. Lo que esta pantalla tiene que dejar claro, antes de
 * confirmar, es exactamente qué se agrega y qué se pierde — sobre todo el
 * dinero, que es lo que el cajero no puede deshacer solo.
 */
@Component({
  selector: 'app-convertir-modo-delivery-dialog',
  templateUrl: './convertir-modo-delivery-dialog.component.html',
  styleUrls: ['./convertir-modo-delivery-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatTooltipModule,
  ],
})
export class ConvertirModoDeliveryDialogComponent implements OnInit {
  /** A qué modo se convierte. Es el contrario del que tiene el pedido. */
  destino: DeliveryModo = DeliveryModo.RETIRO;
  esRetiroDestino = true;

  titulo = '';
  subtitulo = '';
  iconoDestino = 'shopping_bag';
  textoConfirmar = 'CONVERTIR';

  // Campos del formulario (sólo los que el modo destino necesita).
  direccion = '';
  precioDeliveryId: number | null = null;
  nombre = '';
  reimprimir = false;

  preciosDelivery: PrecioDelivery[] = [];
  requiereDireccion = false;
  /** El pedido no tiene nombre y el destino es RETIRO: hay que pedirlo. */
  pideNombre = false;

  /**
   * El pedido ya salió a la calle. Convertirlo igual es una decisión del
   * local, pero no puede pasar sin que se vea.
   */
  estaEnCamino = false;
  /** Repartidor que se va a desasignar al pasar a RETIRO. */
  repartidorActual = '';
  /**
   * Convertir a DELIVERY estando EN_CAMINO exige el repartidor: esa transición
   * no se vuelve a atravesar, así que es la última vez que el backend puede
   * exigirlo. Se resuelve acá para no chocar con el error del handler.
   */
  pideRepartidor = false;
  repartidorElegidoId: number | null = null;
  repartidorElegidoNombre = '';

  // Totales. Pre-computados: la vista no llama funciones ni getters.
  envioActual = 0;
  envioNuevo = 0;
  subtotalVenta = 0;
  totalActual = 0;
  totalNuevo = 0;

  puedeConfirmar = false;
  procesando = false;

  constructor(
    public dialogRef: MatDialogRef<ConvertirModoDeliveryDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConvertirModoDeliveryDialogData,
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    const d = this.data.delivery;
    const modoActual = d?.modo === DeliveryModo.RETIRO ? DeliveryModo.RETIRO : DeliveryModo.DELIVERY;
    this.destino = modoActual === DeliveryModo.RETIRO ? DeliveryModo.DELIVERY : DeliveryModo.RETIRO;
    this.esRetiroDestino = this.destino === DeliveryModo.RETIRO;

    this.titulo = this.esRetiroDestino ? 'CONVERTIR EN RETIRO' : 'CONVERTIR EN DELIVERY';
    this.subtitulo = this.esRetiroDestino
      ? 'El cliente lo pasa a buscar por el local.'
      : 'El pedido sale a la calle con un repartidor.';
    this.iconoDestino = this.esRetiroDestino ? 'shopping_bag' : 'delivery_dining';
    this.textoConfirmar = this.esRetiroDestino ? 'CONVERTIR EN RETIRO' : 'CONVERTIR EN DELIVERY';

    this.estaEnCamino = d?.estado === DeliveryEstado.EN_CAMINO;
    this.repartidorActual = d?.entregadoPorFuncionario?.persona?.nombre || '';
    this.nombre = d?.nombre || d?.cliente?.persona?.nombre || '';
    this.pideNombre = this.esRetiroDestino && !this.nombre.trim();
    this.direccion = d?.direccion || d?.cliente?.persona?.direccion || '';

    // `costoDelivery` y `valor` son `decimal`: en Postgres llegan como string.
    this.envioActual = Number(d?.venta?.costoDelivery ?? 0) || 0;
    this.subtotalVenta = this.calcSubtotal(d);
    this.totalActual = this.subtotalVenta + this.envioActual;

    if (!this.esRetiroDestino) {
      try {
        const config = await firstValueFrom(this.repositoryService.getPdvConfig());
        this.requiereDireccion = config?.deliveryRequiereDireccion ?? false;
        // El candado del repartidor sólo tiene un hueco: el pedido que ya está
        // EN_CAMINO con la etapa en EN_CAMINO.
        this.pideRepartidor = !!config?.deliveryRequiereRepartidor
          && (config?.deliveryRepartidorEtapa || 'EN_CAMINO') === 'EN_CAMINO'
          && this.estaEnCamino;

        const precios = await firstValueFrom(this.repositoryService.getPreciosDelivery());
        this.preciosDelivery = (precios || [])
          .filter((p: any) => p.activo)
          // `valor` es decimal → string en Postgres: sin Number() el orden
          // sería alfabético ("10000" < "5000").
          .sort((a: any, b: any) => Number(a.valor) - Number(b.valor));

        // La zona arranca en la default de la config, NO en la que tenga el
        // pedido: un delivery que vino de la tienda nace con
        // `precioDelivery = null` y envío cobrado igual, así que heredar ese
        // null mostraría «SIN CARGO» sobre un pedido que sí cobra envío.
        const preferida = config?.deliveryPrecioDefaultId
          ? this.preciosDelivery.find((p) => p.id === config.deliveryPrecioDefaultId)
          : null;
        this.precioDeliveryId = preferida?.id ?? this.preciosDelivery[0]?.id ?? null;
      } catch (e) {
        this.mostrarError(e, 'No se pudo cargar la configuración de delivery');
      }
    }

    this.recalcular();
  }

  /** Ítems activos de la venta, sin el envío. */
  private calcSubtotal(d: any): number {
    if (!d?.venta?.items) return 0;
    return d.venta.items.reduce((sum: number, i: any) => {
      if (i.estado !== 'ACTIVO') return sum;
      const unit = Number(i.precioVentaUnitario || 0)
        + Number(i.precioAdicionales || 0)
        - Number(i.descuentoUnitario || 0);
      return sum + unit * Number(i.cantidad || 0);
    }, 0);
  }

  /** Recalcula todo lo que la vista consume como propiedad. */
  private recalcular(): void {
    const zona = this.preciosDelivery.find((p) => p.id === this.precioDeliveryId);
    this.envioNuevo = this.esRetiroDestino ? 0 : (Number(zona?.valor ?? 0) || 0);
    this.totalNuevo = this.subtotalVenta + this.envioNuevo;

    const direccionOk = this.esRetiroDestino || !this.requiereDireccion || this.direccion.trim().length > 0;
    const nombreOk = !this.pideNombre || this.nombre.trim().length > 0;
    const repartidorOk = !this.pideRepartidor || !!this.repartidorElegidoId;
    this.puedeConfirmar = direccionOk && nombreOk && repartidorOk && !this.procesando;
  }

  onCampoChange(): void {
    this.recalcular();
  }

  elegirRepartidor(): void {
    this.repositoryService.deliveryListarRepartidores().subscribe({
      next: (repartidores) => {
        const ref = this.dialog.open(SeleccionarRepartidorDialogComponent, {
          width: '420px',
          data: { repartidores, seleccionadoId: this.repartidorElegidoId },
        });
        ref.afterClosed().subscribe((funcionarioId: number | null | undefined) => {
          if (funcionarioId === undefined) return; // cancelado
          this.repartidorElegidoId = funcionarioId ?? null;
          this.repartidorElegidoNombre = funcionarioId
            ? (repartidores.find((r) => r.id === funcionarioId)?.nombre || '')
            : '';
          this.recalcular();
        });
      },
      error: (e) => this.mostrarError(e, 'No se pudo cargar la lista de repartidores'),
    });
  }

  async confirmar(): Promise<void> {
    if (!this.puedeConfirmar) return;
    this.procesando = true;
    this.recalcular();

    const payload: ConvertirModoDeliveryPayload = { modo: this.destino };
    if (this.esRetiroDestino) {
      payload.nombre = this.nombre.trim() || null;
    } else {
      payload.direccion = this.direccion.trim() || null;
      payload.precioDeliveryId = this.precioDeliveryId;
      if (this.repartidorElegidoId) payload.funcionarioId = this.repartidorElegidoId;
    }

    try {
      const resultado = await firstValueFrom(
        this.repositoryService.deliveryConvertirModo(this.data.delivery.id, payload),
      );
      this.dialogRef.close({ resultado, reimprimir: this.reimprimir } as ConvertirModoDeliveryDialogResult);
    } catch (error) {
      this.mostrarError(error, 'No se pudo convertir el pedido');
      this.procesando = false;
      this.recalcular();
    }
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }

  private mostrarError(error: unknown, fallback: string): void {
    console.error(fallback, error);
    const mensaje = (error as any)?.message?.replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, '')
      || fallback;
    this.snackBar.open(mensaje, 'CERRAR', { duration: 6000, panelClass: ['error-snackbar'] });
  }
}
