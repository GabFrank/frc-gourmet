import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRippleModule } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AuthService, RepositoryService } from '@frc/shared-core';
import { AgregarItemDialogComponent, AgregarItemResult } from './agregar-item-dialog.component';

interface ProductoVM {
  id: number;
  nombre: string;
  tipo: string;
  soportado: boolean; // M2 slice: solo productos simples
  presentacionId?: number;
  precioId?: number;
  precio: number;
  costo: number;
  recetaId?: number | null;
}

interface PedidoLinea {
  nombre: string;
  cantidad: number;
  precio: number;
}

/**
 * M2 — Tomar pedido: abrir/usar la venta ABIERTA de la mesa y agregar productos
 * SIMPLES (RETAIL / ELABORADO_SIN_VARIACION) eligiendo cantidad, adicionales (de
 * la receta) y observaciones (del producto + nota libre). Al crear el venta-item
 * el backend dispara la impresión de comanda automáticamente (fire-and-forget).
 *
 * Variaciones (pizza/sabores) y combos llegan en iteraciones siguientes.
 */
@Component({
  selector: 'app-tomar-pedido',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatRippleModule,
  ],
  templateUrl: './tomar-pedido.page.html',
  styleUrls: ['./mesas.scss'],
})
export class TomarPedidoPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  mesaId = 0;
  titulo = 'Tomar pedido';
  ventaId: number | null = null;
  cajaId: number | null = null;

  termino = '';
  resultados: ProductoVM[] = [];
  buscando = false;
  cargando = true;
  error: string | null = null;

  pedido: PedidoLinea[] = [];
  totalPedido = 0;
  guardando = false;

  ngOnInit(): void {
    this.mesaId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargarContexto();
  }

  private cargarContexto(): void {
    this.cargando = true;
    this.repo.getPdvMesa(this.mesaId).subscribe({
      next: (m: any) => {
        this.titulo = m?.numero != null ? `Mesa ${m.numero} — pedido` : 'Tomar pedido';
        this.ventaId = m?.venta?.id ?? null;
        const usuarioId = this.auth.currentUser?.id;
        if (usuarioId) {
          this.repo.getCajaAbiertaByUsuario(usuarioId).subscribe({
            next: (caja: any) => {
              this.cajaId = caja?.id ?? null;
              this.cargando = false;
            },
            error: () => {
              this.cajaId = null;
              this.cargando = false;
            },
          });
        } else {
          this.cargando = false;
        }
      },
      error: () => {
        this.error = 'No se pudo cargar la mesa';
        this.cargando = false;
      },
    });
  }

  buscar(): void {
    const t = (this.termino || '').trim();
    if (!t) {
      this.resultados = [];
      return;
    }
    this.buscando = true;
    this.repo.searchProductosByNombre(t, 'venta').subscribe({
      next: (data: any[]) => {
        this.resultados = (data || []).map((p) => this.toProductoVM(p));
        this.buscando = false;
      },
      error: () => {
        this.snack.open('Error al buscar productos', 'CERRAR', { duration: 3000 });
        this.buscando = false;
      },
    });
  }

  private toProductoVM(p: any): ProductoVM {
    const tipo = p.tipo;
    const soportado =
      tipo === 'RETAIL' || tipo === 'RETAIL_INGREDIENTE' || tipo === 'ELABORADO_SIN_VARIACION';
    return {
      id: p.id,
      nombre: p.nombre,
      tipo,
      soportado,
      presentacionId: p.principalPresentacion?.id,
      precioId: p.principalPrecio?.id,
      precio: Number(p.principalPrecio?.valor) || 0,
      costo: Number(p.receta?.costoCalculado) || 0,
      recetaId: p.receta?.id ?? null,
    };
  }

  private async ensureVenta(): Promise<number | null> {
    if (this.ventaId) return this.ventaId;
    if (!this.cajaId) {
      this.snack.open('No hay una caja abierta para registrar la venta', 'CERRAR', { duration: 4000 });
      return null;
    }
    try {
      const venta: any = await firstValueFrom(
        this.repo.createVenta({
          estado: 'ABIERTA',
          caja: { id: this.cajaId },
          mesa: { id: this.mesaId },
        } as any),
      );
      this.ventaId = venta?.id ?? null;
      return this.ventaId;
    } catch {
      this.snack.open('No se pudo abrir la cuenta de la mesa', 'CERRAR', { duration: 4000 });
      return null;
    }
  }

  async agregar(p: ProductoVM): Promise<void> {
    if (!p.soportado || this.guardando) return;
    if (!p.presentacionId || !p.precioId) {
      this.snack.open('El producto no tiene precio/presentación configurado', 'CERRAR', { duration: 4000 });
      return;
    }

    // Elegir cantidad + adicionales + observaciones antes de agregar.
    const sel = await firstValueFrom(
      this.dialog
        .open(AgregarItemDialogComponent, {
          data: {
            productoId: p.id,
            nombre: p.nombre,
            precioUnitario: p.precio,
            recetaId: p.recetaId,
          },
          width: '340px',
          maxHeight: '85vh',
        })
        .afterClosed(),
    ) as AgregarItemResult | undefined;
    if (!sel || sel.cantidad < 1) return;

    this.guardando = true;
    const ventaId = await this.ensureVenta();
    if (!ventaId) {
      this.guardando = false;
      return;
    }
    try {
      const item: any = await firstValueFrom(
        this.repo.createVentaItem({
          producto: { id: p.id },
          presentacion: { id: p.presentacionId },
          cantidad: sel.cantidad,
          precioVentaUnitario: p.precio,
          precioCostoUnitario: p.costo,
          venta: { id: ventaId },
          precioVentaPresentacion: { id: p.precioId },
          precioAdicionales: sel.precioAdicionalTotal,
          estado: 'ACTIVO',
        } as any),
      );

      // Adicionales y observaciones se crean tras el item (necesitan su id).
      const itemId = item?.id;
      if (itemId) {
        for (const ad of sel.adicionales) {
          await firstValueFrom(
            this.repo.createVentaItemAdicional({
              ventaItem: { id: itemId },
              adicional: { id: ad.id },
              precioCobrado: ad.precio,
              cantidad: 1,
            }),
          );
        }
        for (const obsId of sel.observaciones) {
          await firstValueFrom(
            this.repo.createVentaItemObservacion({
              ventaItem: { id: itemId },
              observacion: { id: obsId },
            }),
          );
        }
        if (sel.observacionLibre) {
          await firstValueFrom(
            this.repo.createVentaItemObservacion({
              ventaItem: { id: itemId },
              observacionLibre: sel.observacionLibre,
            }),
          );
        }
      }

      const precioLinea = p.precio + sel.precioAdicionalTotal;
      this.pedido.unshift({ nombre: p.nombre, cantidad: sel.cantidad, precio: precioLinea });
      this.totalPedido += precioLinea * sel.cantidad;
      this.snack.open(`Agregado: ${sel.cantidad} × ${p.nombre}`, undefined, { duration: 1200 });
    } catch {
      this.snack.open('No se pudo agregar el producto', 'CERRAR', { duration: 4000 });
    } finally {
      this.guardando = false;
    }
  }

  terminar(): void {
    this.location.back();
  }
}
