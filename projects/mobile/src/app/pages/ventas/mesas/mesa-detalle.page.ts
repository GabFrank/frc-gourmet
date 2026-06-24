import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom, forkJoin, of, Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { RepositoryService } from '@frc/shared-core';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog.component';
import {
  TransferirMesaDialogComponent,
  MesaDestino,
} from './transferir-mesa-dialog.component';
import { ItemInfoDialogComponent } from './item-info-dialog.component';
import { AgregarItemDialogComponent, AgregarItemResult } from './agregar-item-dialog.component';

interface ItemVM {
  id: number;
  productoId?: number;
  precioBase: number;
  descripcion: string;
  detalle?: string;
  cantidad: number;
  unitario: number;
  total: number;
  estado: string;
  cancelado: boolean;
  createdAt?: string;
  usuario?: string;
  adicionales: { id: number; nombre: string; precio: number }[];
  observaciones: { id: number; texto: string }[];
  ingredientes: { id: number; texto: string }[];
  sabores: string[];
}

/**
 * Detalle de mesa: muestra la cuenta de la venta ABIERTA (items + total), con
 * acceso a "Tomar pedido" (FAB) y a quitar un ítem (lo cancela, sincronizando
 * el KDS). Cobrar / pre-cuenta llegan en fases siguientes.
 */
@Component({
  selector: 'app-mesa-detalle',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './mesa-detalle.page.html',
  styleUrls: ['./mesas.scss'],
})
export class MesaDetallePage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  mesaId = 0;
  ventaId: number | null = null;
  quitando = false;
  titulo = 'Mesa';
  sectorNombre?: string;
  ocupada = false;
  estado = 'Libre';

  items: ItemVM[] = [];
  total = 0;
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.mesaId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
  }

  private cargar(): void {
    this.loading = true;
    this.error = null;
    // getPdvMesa trae la venta ABIERTA (la venta concluida se desvincula de la
    // mesa al cobrar, así que `venta` es la cuenta abierta o null).
    this.repo.getPdvMesa(this.mesaId).subscribe({
      next: (m: any) => {
        this.titulo = m?.numero != null ? `Mesa ${m.numero}` : 'Mesa';
        this.sectorNombre = m?.sector?.nombre;
        const ventaId = m?.venta?.id;
        this.ventaId = ventaId ?? null;
        this.ocupada = !!ventaId || m?.estado === 'OCUPADO';
        this.estado = this.ocupada ? 'Ocupada' : 'Libre';
        if (ventaId) {
          this.cargarCuenta(ventaId);
        } else {
          this.items = [];
          this.total = 0;
          this.loading = false;
        }
      },
      error: () => {
        this.error = 'No se pudo cargar la mesa';
        this.loading = false;
      },
    });
  }

  private cargarCuenta(ventaId: number): void {
    this.repo.getVentaItems(ventaId).subscribe({
      next: (data: any[]) => {
        const items = data || [];
        if (items.length === 0) {
          this.items = [];
          this.total = 0;
          this.loading = false;
          return;
        }
        // Cargar la personalización de cada item (adicionales/obs/ingredientes/sabores)
        // en paralelo. Se muestran TODOS los items, incluidos los cancelados.
        forkJoin(items.map((i) => this.cargarItem(i))).subscribe({
          next: (vms) => {
            this.items = vms;
            // El total de la cuenta suma solo los items ACTIVOS (los cancelados no).
            this.total = vms.filter((v) => !v.cancelado).reduce((s, v) => s + v.total, 0);
            this.loading = false;
          },
          error: () => {
            this.error = 'No se pudo cargar la cuenta';
            this.loading = false;
          },
        });
      },
      error: () => {
        this.error = 'No se pudo cargar la cuenta';
        this.loading = false;
      },
    });
  }

  private cargarItem(i: any): Observable<ItemVM> {
    return forkJoin({
      adic: this.repo.getVentaItemAdicionales(i.id).pipe(catchError(() => of([] as any[]))),
      obs: this.repo.getObservacionesByVentaItem(i.id).pipe(catchError(() => of([] as any[]))),
      ing: this.repo
        .getVentaItemIngredienteModificaciones(i.id)
        .pipe(catchError(() => of([] as any[]))),
      sab: this.repo.getVentaItemSabores(i.id).pipe(catchError(() => of([] as any[]))),
    }).pipe(map((p) => this.toItemVM(i, p)));
  }

  private toItemVM(
    i: any,
    p: { adic: any[]; obs: any[]; ing: any[]; sab: any[] },
  ): ItemVM {
    const cantidad = Number(i.cantidad) || 0;
    // Mismo cálculo que el PdV desktop: (unitario + adicionales - descuento) * cantidad.
    const unitario =
      (Number(i.precioVentaUnitario) || 0) +
      (Number(i.precioAdicionales) || 0) -
      (Number(i.descuentoUnitario) || 0);
    return {
      id: i.id,
      productoId: i.producto?.id,
      precioBase: Number(i.precioVentaUnitario) || 0,
      descripcion: i.producto?.nombre || i.ensambladoDescripcion || 'Item',
      detalle: i.presentacion?.nombre,
      cantidad,
      unitario,
      total: unitario * cantidad,
      estado: i.estado || 'ACTIVO',
      cancelado: i.estado === 'CANCELADO',
      createdAt: i.createdAt,
      usuario: i.createdBy?.persona?.nombre || i.createdBy?.nickname || i.createdBy?.usuario,
      adicionales: (p.adic || [])
        .filter((a) => a.activo !== false)
        .map((a) => ({
          id: a.id,
          nombre: a.adicional?.nombre || 'Adicional',
          precio: Number(a.precioCobrado) || 0,
        })),
      observaciones: (p.obs || [])
        .filter((o) => o.activo !== false)
        .map((o) => ({
          id: o.id,
          texto: [o.observacion?.descripcion || o.observacion?.nombre, o.observacionLibre]
            .filter(Boolean)
            .join(' — '),
        }))
        .filter((o) => !!o.texto),
      ingredientes: (p.ing || [])
        .filter((m) => m.activo !== false)
        .map((m) => {
          const nom = m.recetaIngrediente?.ingrediente?.nombre || 'ingrediente';
          return {
            id: m.id,
            texto:
              m.tipoModificacion === 'INTERCAMBIADO'
                ? `${nom} → ${m.ingredienteReemplazo?.nombre || '?'}`
                : `Sin ${nom}`,
          };
        }),
      sabores: (p.sab || []).map((s) => {
        const prop = Number(s.proporcion) || 1;
        const frac = prop < 1 ? `1/${Math.round(1 / prop)} ` : '';
        return `${frac}${s.recetaPresentacion?.sabor?.nombre || 'Sabor'}`;
      }),
    };
  }

  abrirInfo(item: ItemVM): void {
    this.dialog.open(ItemInfoDialogComponent, {
      data: {
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        unitario: item.unitario,
        total: item.total,
        estado: item.estado,
        cancelado: item.cancelado,
        createdAt: item.createdAt,
        usuario: item.usuario,
        adicionales: item.adicionales,
        observaciones: item.observaciones,
        ingredientes: item.ingredientes,
        sabores: item.sabores,
      },
      width: '340px',
      maxHeight: '85vh',
    });
  }

  async editar(item: ItemVM): Promise<void> {
    if (item.cancelado || this.quitando) return;
    // Las variaciones (con sabores) no se editan acá — su personalización es por sabor.
    if (item.sabores.length > 0) {
      this.snack.open('Las variaciones no se editan desde acá todavía', 'CERRAR', { duration: 3000 });
      return;
    }
    this.quitando = true;
    let adicRows: any[] = [];
    let obsRows: any[] = [];
    try {
      const [adic, obs, prod] = await Promise.all([
        firstValueFrom(this.repo.getVentaItemAdicionales(item.id).pipe(catchError(() => of([] as any[])))),
        firstValueFrom(this.repo.getObservacionesByVentaItem(item.id).pipe(catchError(() => of([] as any[])))),
        item.productoId
          ? firstValueFrom(this.repo.getProducto(item.productoId).pipe(catchError(() => of(null as any))))
          : Promise.resolve(null),
      ]);
      adicRows = (adic as any[]) || [];
      obsRows = (obs as any[]) || [];
      const recetaId = (prod as any)?.receta?.id ?? null;
      const adicionalesPreSel = adicRows
        .filter((a) => a.activo !== false && a.adicional)
        .map((a) => a.adicional.id);
      const observacionesPreSel = obsRows
        .filter((o) => o.activo !== false && o.observacion)
        .map((o) => o.observacion.id);
      const observacionLibreInicial =
        obsRows.find((o) => o.observacionLibre && !o.observacion)?.observacionLibre || '';
      this.quitando = false;

      const res = (await firstValueFrom(
        this.dialog
          .open(AgregarItemDialogComponent, {
            data: {
              productoId: item.productoId,
              nombre: item.descripcion,
              precioUnitario: item.precioBase,
              recetaId,
              modoEdicion: true,
              cantidadInicial: item.cantidad,
              adicionalesPreSel,
              observacionesPreSel,
              observacionLibreInicial,
            },
            width: '340px',
            maxHeight: '85vh',
          })
          .afterClosed(),
      )) as AgregarItemResult | 'QUITAR' | undefined;

      if (!res) return;
      if (res === 'QUITAR') {
        await this.quitar(item);
        return;
      }

      this.quitando = true;
      // Reconciliar: borrar adicionales/observaciones actuales y recrear según la selección.
      for (const a of adicRows) await firstValueFrom(this.repo.deleteVentaItemAdicional(a.id));
      for (const o of obsRows) await firstValueFrom(this.repo.deleteVentaItemObservacion(o.id));
      for (const a of res.adicionales) {
        await firstValueFrom(
          this.repo.createVentaItemAdicional({
            ventaItem: { id: item.id },
            adicional: { id: a.id },
            precioCobrado: a.precio,
            cantidad: 1,
          }),
        );
      }
      for (const oid of res.observaciones) {
        await firstValueFrom(
          this.repo.createVentaItemObservacion({ ventaItem: { id: item.id }, observacion: { id: oid } }),
        );
      }
      if (res.observacionLibre) {
        await firstValueFrom(
          this.repo.createVentaItemObservacion({ ventaItem: { id: item.id }, observacionLibre: res.observacionLibre }),
        );
      }
      await firstValueFrom(
        this.repo.updateVentaItem(item.id, {
          cantidad: res.cantidad,
          precioAdicionales: res.precioAdicionalTotal,
          modificado: true,
          horaModificacion: new Date(),
        } as any),
      );
      this.snack.open('Ítem actualizado', undefined, { duration: 1500 });
      if (this.ventaId) this.cargarCuenta(this.ventaId);
    } catch {
      this.snack.open('No se pudo editar el ítem', 'CERRAR', { duration: 4000 });
    } finally {
      this.quitando = false;
    }
  }

  async quitar(item: ItemVM): Promise<void> {
    if (this.quitando) return;
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: 'Quitar ítem',
            message: `¿Quitar "${item.descripcion}" de la cuenta? Si ya fue enviado a cocina, se cancelará también allí.`,
            confirmText: 'Quitar',
            danger: true,
          },
          width: '320px',
        })
        .afterClosed(),
    );
    if (!ok) return;

    this.quitando = true;
    try {
      // Cancelar (no borrar): preserva auditoría y cancela los comanda-items del KDS.
      await firstValueFrom(this.repo.updateVentaItem(item.id, { estado: 'CANCELADO' } as any));
      this.snack.open('Ítem quitado', undefined, { duration: 1500 });
      if (this.ventaId) {
        this.cargarCuenta(this.ventaId);
      }
    } catch {
      this.snack.open('No se pudo quitar el ítem', 'CERRAR', { duration: 4000 });
    } finally {
      this.quitando = false;
    }
  }

  async imprimirPreCuenta(): Promise<void> {
    if (!this.ventaId) return;
    const api = (window as any).api;
    if (!api?.callIpc) {
      this.snack.open('Impresión no disponible', 'CERRAR', { duration: 3000 });
      return;
    }
    try {
      const res = await api.callIpc('print-precuenta', { ventaId: this.ventaId });
      if (res?.ok === false) {
        this.snack.open('La pre-cuenta no se pudo imprimir', 'CERRAR', { duration: 4000 });
      } else {
        this.snack.open('Pre-cuenta enviada a impresión', undefined, { duration: 1800 });
      }
    } catch {
      this.snack.open('No se pudo imprimir la pre-cuenta', 'CERRAR', { duration: 4000 });
    }
  }

  async transferir(): Promise<void> {
    if (!this.ventaId) return;
    const destino = (await firstValueFrom(
      this.dialog
        .open(TransferirMesaDialogComponent, {
          data: { mesaActualId: this.mesaId },
          width: '320px',
          maxHeight: '85vh',
        })
        .afterClosed(),
    )) as MesaDestino | undefined;
    if (!destino) return;

    const ventaOrigenId = this.ventaId;
    this.loading = true;
    try {
      if (destino.ventaId) {
        // Destino ya tiene cuenta abierta: mover items activos y cancelar la origen.
        const items = await firstValueFrom(this.repo.getVentaItems(ventaOrigenId));
        const activos = (items || []).filter((i: any) => i.estado === 'ACTIVO');
        for (const it of activos) {
          await firstValueFrom(
            this.repo.updateVentaItem(it.id, { venta: { id: destino.ventaId } } as any),
          );
        }
        await firstValueFrom(this.repo.updateVenta(ventaOrigenId, { estado: 'CANCELADA' } as any));
      } else {
        // Destino libre: mover la venta completa.
        await firstValueFrom(this.repo.updateVenta(ventaOrigenId, { mesa: { id: destino.id } } as any));
      }
      // Liberar mesa origen y ocupar destino.
      await firstValueFrom(this.repo.updatePdvMesa(this.mesaId, { estado: 'DISPONIBLE' } as any));
      await firstValueFrom(this.repo.updatePdvMesa(destino.id, { estado: 'OCUPADO' } as any));

      this.snack.open(`Cuenta transferida a Mesa ${destino.numero}`, undefined, { duration: 2000 });
      this.location.back();
    } catch {
      this.snack.open('No se pudo transferir la cuenta', 'CERRAR', { duration: 4000 });
      this.loading = false;
    }
  }

  volver(): void {
    this.location.back();
  }
}
