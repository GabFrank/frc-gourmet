import { Component, Inject, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatAutocompleteModule, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { RepositoryService } from '../../../database/repository.service';
import { PrecioDelivery } from '../../../database/entities/ventas/precio-delivery.entity';
import { Caja } from '../../../database/entities/financiero/caja.entity';
import { BuscarClienteDialogComponent } from '../buscar-cliente-dialog/buscar-cliente-dialog.component';

export interface CrearDeliveryDialogData {
  caja: Caja;
  delivery?: any;
}

@Component({
  selector: 'app-crear-delivery-dialog',
  templateUrl: './crear-delivery-dialog.component.html',
  styleUrls: ['./crear-delivery-dialog.component.scss'],
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
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatAutocompleteModule,
    MatTooltipModule,
  ],
})
export class CrearDeliveryDialogComponent implements OnInit, OnDestroy {
  @ViewChild('telefonoInput') telefonoInput!: ElementRef<HTMLInputElement>;
  @ViewChild('nombreInput') nombreInput!: ElementRef<HTMLInputElement>;
  @ViewChild('direccionInput') direccionInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('precioSelect') precioSelect!: MatSelect;
  @ViewChild('observacionInput') observacionInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('confirmarBtn') confirmarBtn!: ElementRef<HTMLButtonElement>;
  @ViewChild(MatAutocompleteTrigger) autoTrigger!: MatAutocompleteTrigger;

  telefono = '';
  nombre = '';
  direccion = '';
  observacion = '';
  precioDeliveryId: number | null = null;
  cobroAnticipado = false;

  preciosDelivery: PrecioDelivery[] = [];
  clienteEncontrado: any = null;
  clientesSugeridos: any[] = [];
  buscando = false;
  processing = false;
  isEditMode = false;
  precioDeliveryOriginalId: number | null = null;

  // Configuración del PdV (antes eran constantes en este archivo).
  telefonoMinDigitos = 4;
  requiereDireccion = true;

  // Pre-computados: la vista no llama funciones ni getters.
  puedeConfirmar = false;
  precioDeliveryCambio = false;
  /** Cambiar la zona con la venta ya cobrada lo rechaza el backend. */
  zonaBloqueada = false;

  private telefonoSubject = new Subject<string>();

  constructor(
    public dialogRef: MatDialogRef<CrearDeliveryDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CrearDeliveryDialogData,
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const config = await firstValueFrom(this.repositoryService.getPdvConfig());
      if (config) {
        this.telefonoMinDigitos = config.deliveryTelefonoMinDigitos ?? 4;
        this.requiereDireccion = config.deliveryRequiereDireccion ?? true;
        this.cobroAnticipado = !!config.deliveryCobroAnticipadoDefault;
      }
      const precios = await firstValueFrom(this.repositoryService.getPreciosDelivery());
      this.preciosDelivery = precios
        .filter((p: any) => p.activo)
        // `valor` es decimal → string en Postgres: sin Number() el orden sería
        // alfabético ("10000" < "5000").
        .sort((a: any, b: any) => Number(a.valor) - Number(b.valor));

      if (this.data.delivery) {
        this.isEditMode = true;
        const d = this.data.delivery;
        this.telefono = d.telefono || '';
        this.nombre = d.nombre || d.cliente?.persona?.nombre || '';
        this.direccion = d.direccion || '';
        this.observacion = d.observacion || '';
        this.precioDeliveryId = d.precioDelivery?.id ?? null;
        this.precioDeliveryOriginalId = this.precioDeliveryId;
        this.cobroAnticipado = !!d.cobroAnticipado;
        this.clienteEncontrado = d.cliente || null;
        this.zonaBloqueada = !!d.venta && d.venta.estado !== 'ABIERTA';
      } else {
        // Zona por defecto: la configurada; si no hay, la de menor valor.
        const preferida = config?.deliveryPrecioDefaultId
          ? this.preciosDelivery.find((p) => p.id === config.deliveryPrecioDefaultId)
          : null;
        this.precioDeliveryId = preferida?.id ?? this.preciosDelivery[0]?.id ?? null;
      }
    } catch (error) {
      this.mostrarError(error, 'No se pudo cargar la configuración de delivery');
    }

    this.recalcular();

    this.telefonoSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(async (tel) => {
      if (tel.length >= 3) {
        this.buscando = true;
        try {
          this.clientesSugeridos = await firstValueFrom(this.repositoryService.buscarClientesPorTelefono(tel)) || [];
          // Comparación por dígitos: "0981 123456" y "0981123456" son el mismo
          // teléfono. Con el `===` crudo de antes, cada variante de formato
          // creaba un cliente nuevo para la misma persona.
          const soloDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
          const exacto = this.clientesSugeridos.find(
            (c) => soloDigitos(c.persona?.telefono) === soloDigitos(tel),
          );
          if (exacto) this.seleccionarCliente(exacto);
        } catch (e) {
          this.clientesSugeridos = [];
        } finally {
          this.buscando = false;
        }
      } else {
        this.clientesSugeridos = [];
        this.clienteEncontrado = null;
      }
      this.recalcular();
    });
  }

  ngOnDestroy(): void {
    this.telefonoSubject.complete();
  }

  /** Recalcula todo lo que la vista consume como propiedad. */
  private recalcular(): void {
    const telefonoOk = this.telefono.replace(/\D/g, '').length >= this.telefonoMinDigitos;
    const direccionOk = !this.requiereDireccion || this.direccion.trim().length > 0;
    this.puedeConfirmar = telefonoOk && direccionOk && !this.processing;
    this.precioDeliveryCambio = this.isEditMode && this.precioDeliveryId !== this.precioDeliveryOriginalId;
  }

  onCampoChange(): void {
    this.recalcular();
  }

  onTelefonoChange(): void {
    this.clienteEncontrado = null;
    this.telefonoSubject.next(this.telefono);
    this.recalcular();
  }

  onEnterTelefono(event: Event): void {
    event.preventDefault();
    if (this.autoTrigger?.panelOpen) {
      this.autoTrigger.closePanel();
    }
    this.clientesSugeridos = [];
    setTimeout(() => this.nombreInput?.nativeElement?.focus(), 50);
  }

  onAutoCompleteSelected(event: any): void {
    this.seleccionarCliente(event.option.value);
    setTimeout(() => this.nombreInput?.nativeElement?.focus(), 50);
  }

  seleccionarCliente(cliente: any): void {
    this.clienteEncontrado = cliente;
    this.telefono = cliente.persona?.telefono || this.telefono;
    this.nombre = cliente.persona?.nombre || '';
    this.direccion = cliente.persona?.direccion || '';
    this.clientesSugeridos = [];
    this.recalcular();
  }

  focusDireccion(): void {
    this.direccionInput?.nativeElement?.focus();
  }

  focusPrecio(): void {
    this.precioSelect?.focus();
    setTimeout(() => this.precioSelect?.open(), 50);
  }

  focusObservacion(): void {
    this.observacionInput?.nativeElement?.focus();
  }

  focusConfirmar(): void {
    this.confirmarBtn?.nativeElement?.focus();
  }

  abrirBuscarCliente(): void {
    const dialogRef = this.dialog.open(BuscarClienteDialogComponent, {
      width: '600px',
      maxHeight: '80vh',
    });

    dialogRef.afterClosed().subscribe((cliente: any) => {
      if (cliente) {
        this.seleccionarCliente(cliente);
      }
    });
  }

  async confirmar(): Promise<void> {
    if (!this.puedeConfirmar) return;
    this.processing = true;
    this.recalcular();

    try {
      let cliente = this.clienteEncontrado;
      if (!cliente) {
        cliente = await firstValueFrom(this.repositoryService.crearClienteRapido({
          telefono: this.telefono,
          nombre: this.nombre || undefined,
          direccion: this.direccion || undefined,
        }));
      }

      const payload: any = {
        clienteId: cliente?.id ?? null,
        nombre: this.nombre || cliente?.persona?.nombre || '',
        telefono: this.telefono,
        direccion: this.direccion,
        observacion: this.observacion,
        cobroAnticipado: this.cobroAnticipado,
      };

      if (this.isEditMode) {
        // Sólo se manda `precioDeliveryId` si cambió: el backend usa la
        // presencia de la clave para decidir si resincroniza el costo de la
        // venta.
        if (this.precioDeliveryCambio) payload.precioDeliveryId = this.precioDeliveryId;
        await firstValueFrom(this.repositoryService.deliveryActualizarDatos(this.data.delivery.id, payload));
        this.dialogRef.close({ edited: true });
      } else {
        payload.cajaId = this.data.caja.id;
        payload.precioDeliveryId = this.precioDeliveryId;
        // Alta atómica: el backend crea Delivery + Venta en una transacción.
        // Antes eran dos llamadas y un fallo en la segunda dejaba un delivery
        // sin venta, invisible para la lista (que parte de Venta).
        const resultado = await firstValueFrom(this.repositoryService.deliveryCrear(payload));
        this.dialogRef.close(resultado);
      }
    } catch (error) {
      this.mostrarError(error, 'No se pudo guardar el delivery');
      this.processing = false;
      this.recalcular();
    }
  }

  private mostrarError(error: unknown, fallback: string): void {
    console.error(fallback, error);
    const mensaje = (error as any)?.message?.replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, '')
      || fallback;
    this.snackBar.open(mensaje, 'CERRAR', { duration: 6000, panelClass: ['error-snackbar'] });
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
