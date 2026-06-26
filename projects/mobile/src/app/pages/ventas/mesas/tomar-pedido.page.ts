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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService, RepositoryService } from '@frc/shared-core';
import { AgregarItemDialogComponent, AgregarItemResult } from './agregar-item-dialog.component';
import {
  SeleccionarVariacionDialogComponent,
  SeleccionarVariacionResult,
} from './seleccionar-variacion-dialog.component';
import {
  BuffetPesoDialogComponent,
  BuffetPesoDialogResult,
} from './buffet-peso-dialog.component';
import { AppImagePipe } from '../../../core/pipes/app-image.pipe';
import { flagFor } from './moneda-flag.util';
import { BarcodeScannerDialogComponent } from './barcode-scanner-dialog.component';

interface ConversionVM {
  simbolo: string;
  valor: number;
  digits: string;
  flag?: string;
}

interface ProductoVM {
  id: number;
  nombre: string;
  imageUrl?: string | null;
  tipo: string;
  soportado: boolean; // M2 slice: solo productos simples
  presentacionId?: number;
  precioId?: number;
  precio: number;
  costo: number;
  recetaId?: number | null;
  esVariacion: boolean;
  // Buffet por peso (BUFFET_POR_PESO): precio = precio por kg.
  esBuffet?: boolean;
  taraGramos?: number | null;
  pesoMinimoGramos?: number | null;
  precioMinimo?: number | null;
  precioMaximo?: number | null;
  decimalesMoneda?: number;
  simboloMoneda?: string;
  // Conversión del precio a las otras monedas configuradas (para mostrar en la lista).
  conversiones: ConversionVM[];
}

interface PedidoLinea {
  nombre: string;
  cantidad: number;
  precio: number;
}

interface AtajoItemVM {
  id: number;
  nombre: string;
  colorFondo?: string;
  colorTexto?: string;
}

interface AtajoGrupoVM {
  id: number;
  nombre: string;
  items: AtajoItemVM[];
}

/**
 * M2 — Tomar pedido: abrir/usar la venta ABIERTA de la mesa y agregar productos
 * SIMPLES (RETAIL / ELABORADO_SIN_VARIACION) eligiendo cantidad, adicionales (de
 * la receta) y observaciones (del producto + nota libre). Al crear el venta-item
 * el backend dispara la impresión de comanda automáticamente (fire-and-forget).
 *
 * Productos ELABORADO_CON_VARIACION (pizza) abren un diálogo aparte para elegir
 * tamaño + sabores. Combos y personalización por-sabor llegan más adelante.
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
    MatDialogModule,
    MatSnackBarModule,
    AppImagePipe,
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
  private searchTimer: any = null;
  cargando = true;
  error: string | null = null;

  pedido: PedidoLinea[] = [];
  totalPedido = 0;
  guardando = false;

  // Accesos directos (como el PdV)
  grupos: AtajoGrupoVM[] = [];
  grupoSel: AtajoGrupoVM | null = null;
  atajoProductos: ProductoVM[] = []; // drill-in: productos de un atajo con varios

  // Monedas configuradas para mostrar conversiones de precio (como el PdV).
  private monedas: any[] = [];
  private cambios: any[] = [];
  private principalMonedaId: number | null = null;

  // Config de balanza (etiquetas EAN-13 de productos pesables), igual que el PdV.
  private balanzaPrefijo = '2';
  private balanzaModo = 'PESO';
  private balanzaFactorPeso = 1;

  ngOnInit(): void {
    this.mesaId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargarContexto();
    this.cargarAtajos();
    this.cargarMonedas();
    this.cargarBalanzaConfig();
    // Si se entró con ?scan=1 (desde el botón de código de barras), abrir el
    // escáner apenas cargue la pantalla.
    if (this.route.snapshot.queryParamMap.get('scan') === '1') {
      setTimeout(() => this.escanear(), 350);
    }
  }

  private cargarBalanzaConfig(): void {
    this.repo.getPdvConfig().subscribe({
      next: (cfg: any) => {
        if (!cfg) return;
        this.balanzaPrefijo = cfg.balanzaPrefijo || '2';
        this.balanzaModo = cfg.balanzaModo || 'PESO';
        this.balanzaFactorPeso = Number(cfg.balanzaFactorPeso) || 1;
      },
      error: () => {
        /* defaults */
      },
    });
  }

  private cargarMonedas(): void {
    forkJoin({
      mon: this.repo.getMonedas().pipe(catchError(() => of([] as any[]))),
      cam: this.repo.getMonedasCambio().pipe(catchError(() => of([] as any[]))),
    }).subscribe(({ mon, cam }) => {
      this.monedas = (mon as any[]) || [];
      this.cambios = (cam as any[]) || [];
      this.principalMonedaId = this.monedas.find((m: any) => m.principal)?.id ?? null;
      // Recalcular conversiones de lo ya cargado (búsqueda/atajo previo a monedas).
      this.resultados.forEach((p) => (p.conversiones = this.convertir(p.precio)));
      this.atajoProductos.forEach((p) => (p.conversiones = this.convertir(p.precio)));
    });
  }

  /** Convierte un monto en moneda principal a las demás monedas activas. */
  private convertir(monto: number): ConversionVM[] {
    if (!this.principalMonedaId || this.monedas.length === 0 || !(monto > 0)) return [];
    return this.monedas
      .filter((m: any) => m.id !== this.principalMonedaId && m.activo !== false)
      .map((m: any) => {
        const rate = this.cambios.find(
          (c: any) =>
            (c.monedaOrigen?.id === this.principalMonedaId && c.monedaDestino?.id === m.id) ||
            (c.monedaOrigen?.id === m.id && c.monedaDestino?.id === this.principalMonedaId),
        );
        const comp = Number(rate?.compraLocal) || 0;
        if (comp <= 0) return null;
        return {
          simbolo: m.simbolo || m.denominacion || '',
          valor: monto / comp,
          digits: `1.0-${m.decimales ?? 2}`,
          flag: flagFor(m),
        } as ConversionVM;
      })
      .filter((x): x is ConversionVM => !!x);
  }

  onTermino(valor: string): void {
    // Input siempre en MAYÚSCULA (las cadenas se guardan/buscan en upper).
    this.termino = (valor || '').toUpperCase();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (!this.termino) {
      this.resultados = [];
      return;
    }
    // Búsqueda proactiva (debounce) — sin necesidad de enter ni el botón.
    if (this.termino.trim().length < 2) return;
    this.searchTimer = setTimeout(() => this.buscar(), 300);
  }

  private cargarAtajos(): void {
    this.repo.getPdvAtajoGrupos().subscribe({
      next: (data: any[]) => {
        this.grupos = (data || [])
          .filter((g) => g.activo !== false)
          .map((g) => ({
            id: g.id,
            nombre: g.nombre,
            items: (g.atajoGrupoItems || [])
              .map((gi: any) => gi.atajoItem)
              .filter((it: any) => it && it.activo !== false)
              .map((it: any) => ({
                id: it.id,
                nombre: it.nombre,
                colorFondo: it.colorFondo || undefined,
                colorTexto: it.colorTexto || undefined,
              })),
          }))
          .filter((g) => g.items.length > 0);
        this.grupoSel = this.grupos[0] || null;
      },
      error: () => {
        // Sin atajos: queda solo la búsqueda.
      },
    });
  }

  seleccionarGrupo(g: AtajoGrupoVM): void {
    this.grupoSel = g;
    this.atajoProductos = [];
  }

  volverAtajos(): void {
    this.atajoProductos = [];
  }

  tocarAtajo(it: AtajoItemVM): void {
    if (this.guardando) return;
    this.repo.getPdvAtajoItemProductos(it.id).subscribe({
      next: (data: any[]) => {
        const vms = (data || [])
          .filter((ap) => ap.activo !== false && ap.producto)
          .map((ap) => this.toVMFromAtajo(ap));
        if (vms.length === 1) {
          this.agregar(vms[0]);
        } else if (vms.length > 1) {
          this.atajoProductos = vms;
        } else {
          this.snack.open('El atajo no tiene productos', undefined, { duration: 2000 });
        }
      },
      error: () => {
        this.snack.open('No se pudieron cargar los productos del atajo', 'CERRAR', { duration: 3000 });
      },
    });
  }

  private toVMFromAtajo(ap: any): ProductoVM {
    const prod = ap.producto;
    const tipo = prod.tipo;
    const esVariacion = tipo === 'ELABORADO_CON_VARIACION';
    const esBuffet = tipo === 'BUFFET_POR_PESO';
    const esSimple =
      tipo === 'RETAIL' ||
      tipo === 'RETAIL_INGREDIENTE' ||
      tipo === 'ELABORADO_SIN_VARIACION' ||
      tipo === 'COMBO';
    let presObj: any = null;
    let precioObj: any = null;
    // RETAIL y BUFFET_POR_PESO resuelven precio desde la presentación principal.
    if (tipo === 'RETAIL' || tipo === 'RETAIL_INGREDIENTE' || esBuffet) {
      const pres = (prod.presentaciones || []).find((p: any) => p.principal) || (prod.presentaciones || [])[0];
      presObj = pres;
      precioObj = (pres?.preciosVenta || []).find((pv: any) => pv.principal) || (pres?.preciosVenta || [])[0];
    } else {
      precioObj = prod.precioDirecto || null;
      presObj = (prod.presentaciones || [])[0] || null;
    }
    const precio = Number(precioObj?.valor) || 0;
    return {
      id: prod.id,
      nombre: ap.nombre_alternativo || prod.nombre,
      imageUrl: prod.imageUrl ?? null,
      tipo,
      soportado: esSimple || esVariacion || esBuffet,
      esVariacion,
      esBuffet,
      presentacionId: presObj?.id,
      precioId: precioObj?.id,
      precio,
      costo: Number(prod.receta?.costoCalculado) || 0,
      recetaId: prod.receta?.id ?? null,
      taraGramos: prod.taraGramos ?? null,
      pesoMinimoGramos: prod.pesoMinimoGramos ?? null,
      precioMinimo: precioObj?.precioMinimo ?? null,
      precioMaximo: precioObj?.precioMaximo ?? null,
      decimalesMoneda: precioObj?.moneda?.decimales ?? 0,
      simboloMoneda: precioObj?.moneda?.simbolo || '',
      conversiones: this.convertir(precio),
    };
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
    const esVariacion = tipo === 'ELABORADO_CON_VARIACION';
    const esBuffet = tipo === 'BUFFET_POR_PESO';
    const esSimple =
      tipo === 'RETAIL' ||
      tipo === 'RETAIL_INGREDIENTE' ||
      tipo === 'ELABORADO_SIN_VARIACION' ||
      tipo === 'COMBO';
    const precioObj = p.principalPrecio;
    const precio = Number(precioObj?.valor) || 0;
    return {
      id: p.id,
      nombre: p.nombre,
      imageUrl: p.imageUrl ?? null,
      tipo,
      soportado: esSimple || esVariacion || esBuffet,
      esVariacion,
      esBuffet,
      presentacionId: p.principalPresentacion?.id,
      precioId: precioObj?.id,
      precio,
      costo: Number(p.receta?.costoCalculado) || 0,
      recetaId: p.receta?.id ?? null,
      taraGramos: p.taraGramos ?? null,
      pesoMinimoGramos: p.pesoMinimoGramos ?? null,
      precioMinimo: precioObj?.precioMinimo ?? null,
      precioMaximo: precioObj?.precioMaximo ?? null,
      decimalesMoneda: precioObj?.moneda?.decimales ?? 0,
      simboloMoneda: precioObj?.moneda?.simbolo || '',
      conversiones: this.convertir(precio),
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
      // Marcar la mesa OCUPADA (igual que el PdV de escritorio), para que figure
      // ocupada en ambas vistas. No es fatal si falla la actualización de estado.
      if (this.ventaId) {
        try {
          await firstValueFrom(this.repo.updatePdvMesa(this.mesaId, { estado: 'OCUPADO' } as any));
        } catch {
          /* el estado se reconcilia igual por la venta ABIERTA vinculada */
        }
      }
      return this.ventaId;
    } catch {
      this.snack.open('No se pudo abrir la cuenta de la mesa', 'CERRAR', { duration: 4000 });
      return null;
    }
  }

  async agregar(p: ProductoVM): Promise<void> {
    if (!p.soportado || this.guardando) return;
    if (p.esVariacion) {
      await this.agregarVariacion(p);
      return;
    }
    if (p.esBuffet) {
      await this.agregarBuffet(p);
      return;
    }
    // El precio es obligatorio; la presentación es opcional (los elaborados sin
    // variación suelen no tener Presentacion — su precio cuelga de la receta).
    if (!p.precioId) {
      this.snack.open('El producto no tiene un precio configurado', 'CERRAR', { duration: 4000 });
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
          ...(p.presentacionId ? { presentacion: { id: p.presentacionId } } : {}),
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

  private async agregarBuffet(p: ProductoVM, pesoInicialGramos?: number): Promise<void> {
    if (!p.precioId) {
      this.snack.open('El producto no tiene un precio por kg configurado', 'CERRAR', { duration: 4000 });
      return;
    }
    const res = (await firstValueFrom(
      this.dialog
        .open(BuffetPesoDialogComponent, {
          data: {
            nombre: p.nombre,
            precioPorKg: p.precio,
            taraGramos: p.taraGramos,
            pesoMinimoGramos: p.pesoMinimoGramos,
            precioMinimo: p.precioMinimo,
            precioMaximo: p.precioMaximo,
            decimalesMoneda: p.decimalesMoneda,
            simbolo: p.simboloMoneda,
            pesoInicialGramos,
          },
          width: '340px',
          maxHeight: '85vh',
        })
        .afterClosed(),
    )) as BuffetPesoDialogResult | undefined;
    if (!res) return;

    this.guardando = true;
    const ventaId = await this.ensureVenta();
    if (!ventaId) {
      this.guardando = false;
      return;
    }
    try {
      // cantidad = kg neto; precioVentaUnitario = precio/kg efectivo (incluye
      // tope/mínimo) para que (unitario * cantidad) dé el total correcto.
      await firstValueFrom(
        this.repo.createVentaItem({
          producto: { id: p.id },
          ...(p.presentacionId ? { presentacion: { id: p.presentacionId } } : {}),
          cantidad: res.cantidadKg,
          precioVentaUnitario: res.precioVentaUnitarioEfectivo,
          precioCostoUnitario: p.costo,
          venta: { id: ventaId },
          precioVentaPresentacion: { id: p.precioId },
          precioAdicionales: 0,
          pesoBruto: res.pesoBrutoGramos,
          pesoTara: res.pesoTaraGramos,
          pesoNeto: res.pesoNetoGramos,
          precioPorKg: res.precioPorKg,
          aplicoLibre: res.aplicoLibre,
          estado: 'ACTIVO',
        } as any),
      );
      this.pedido.unshift({ nombre: p.nombre, cantidad: 1, precio: res.total });
      this.totalPedido += res.total;
      this.snack.open(`Agregado: ${p.nombre}`, undefined, { duration: 1200 });
    } catch {
      this.snack.open('No se pudo agregar el producto de buffet', 'CERRAR', { duration: 4000 });
    } finally {
      this.guardando = false;
    }
  }

  private async agregarVariacion(p: ProductoVM): Promise<void> {
    const sel = (await firstValueFrom(
      this.dialog
        .open(SeleccionarVariacionDialogComponent, {
          data: { productoId: p.id, nombre: p.nombre },
          width: '360px',
          maxHeight: '85vh',
        })
        .afterClosed(),
    )) as SeleccionarVariacionResult | undefined;
    if (!sel || sel.sabores.length === 0) return;

    this.guardando = true;
    const ventaId = await this.ensureVenta();
    if (!ventaId) {
      this.guardando = false;
      return;
    }
    try {
      const itemData: any = {
        producto: { id: p.id },
        presentacion: { id: sel.presentacionId },
        cantidad: sel.cantidad,
        precioVentaUnitario: sel.precioCalculado,
        precioCostoUnitario: sel.costoCalculado,
        venta: { id: ventaId },
        recetaPresentacion: { id: sel.recetaPresentacionPrincipalId },
        ensambladoDescripcion: sel.ensambladoDescripcion,
        cantidadSabores: sel.sabores.length,
        precioAdicionales: sel.precioAdicionalTotal,
        estado: 'ACTIVO',
      };
      if (sel.precioVentaPresentacionId) {
        itemData.precioVentaPresentacion = { id: sel.precioVentaPresentacionId };
      }
      const item: any = await firstValueFrom(this.repo.createVentaItem(itemData));

      const itemId = item?.id;
      if (itemId) {
        for (const s of sel.sabores) {
          const savedSabor: any = await firstValueFrom(
            this.repo.createVentaItemSabor({
              ventaItemId: itemId,
              recetaPresentacionId: s.recetaPresentacionId,
              proporcion: s.proporcion,
              precioReferencia: s.precioReferencia,
              costoReferencia: s.costoReferencia,
            }),
          );
          // Personalización por-sabor: adicionales/observaciones con FK ventaItemSabor.
          const saborId = savedSabor?.id;
          for (const ad of s.adicionales) {
            await firstValueFrom(
              this.repo.createVentaItemAdicional({
                ventaItem: { id: itemId },
                adicional: { id: ad.id },
                precioCobrado: ad.precio,
                cantidad: 1,
                ...(saborId ? { ventaItemSabor: { id: saborId } } : {}),
              }),
            );
          }
          for (const obsId of s.observaciones) {
            await firstValueFrom(
              this.repo.createVentaItemObservacion({
                ventaItem: { id: itemId },
                observacion: { id: obsId },
                ...(saborId ? { ventaItemSabor: { id: saborId } } : {}),
              }),
            );
          }
          if (s.observacionLibre) {
            await firstValueFrom(
              this.repo.createVentaItemObservacion({
                ventaItem: { id: itemId },
                observacionLibre: s.observacionLibre,
                ...(saborId ? { ventaItemSabor: { id: saborId } } : {}),
              }),
            );
          }
        }
      }

      const precioLineaVar = sel.precioCalculado + sel.precioAdicionalTotal;
      this.pedido.unshift({ nombre: sel.ensambladoDescripcion, cantidad: sel.cantidad, precio: precioLineaVar });
      this.totalPedido += precioLineaVar * sel.cantidad;
      this.snack.open(`Agregado: ${sel.cantidad} × ${p.nombre}`, undefined, { duration: 1200 });
    } catch {
      this.snack.open('No se pudo agregar la variación', 'CERRAR', { duration: 4000 });
    } finally {
      this.guardando = false;
    }
  }

  /** Abre la cámara para escanear un código y lo procesa. */
  async escanear(): Promise<void> {
    if (this.guardando) return;
    const codigo = (await firstValueFrom(
      this.dialog
        .open(BarcodeScannerDialogComponent, {
          width: '100vw',
          maxWidth: '100vw',
          height: '100vh',
          panelClass: 'scanner-dialog-panel',
        })
        .afterClosed(),
    )) as string | undefined;
    if (codigo) await this.procesarCodigo(codigo.trim());
  }

  /**
   * Replica el comportamiento del buscador del PdV ante un código:
   *  1) Etiqueta de balanza (EAN-13 de pesable) → resuelve el producto buffet y
   *     abre el diálogo de pesaje con el peso ya cargado.
   *  2) Código de producto normal → abre el diálogo de personalización.
   *  3) No encontrado → carga el código en el buscador.
   */
  private async procesarCodigo(codigo: string): Promise<void> {
    if (!codigo) return;
    const api = (window as any).api;

    // 1) Balanza (pesable)
    const bal = this.parseBalanza(codigo);
    if (bal && api?.callIpc) {
      try {
        const res: any = await api.callIpc('buscar-producto-codigo-mesa', bal.codigoProducto);
        if (res?.producto && res.producto.tipo === 'BUFFET_POR_PESO') {
          const vm = this.toVMFromAtajo({ producto: res.producto });
          await this.agregarBuffet(vm, bal.pesoGramos);
          return;
        }
      } catch {
        /* sigue al flujo normal */
      }
    }

    // 2) Producto normal por código
    if (api?.callIpc) {
      try {
        const res: any = await api.callIpc('buscar-producto-codigo-mesa', codigo);
        if (res?.producto) {
          const vm = this.toVMFromAtajo({ producto: res.producto });
          if (vm.soportado) {
            await this.agregar(vm);
            return;
          }
        }
      } catch {
        /* sigue al flujo de búsqueda */
      }
    }

    // 3) No encontrado → cargar el código en el buscador
    this.snack.open('Producto no encontrado por código; buscá por nombre', undefined, { duration: 2500 });
    this.termino = codigo.toUpperCase();
    this.buscar();
  }

  /** Parsea una etiqueta EAN-13 de balanza (modo PESO). null si no aplica. */
  private parseBalanza(code: string): { codigoProducto: string; pesoGramos: number } | null {
    const s = (code || '').trim();
    if (!/^\d{13}$/.test(s) || !s.startsWith(this.balanzaPrefijo) || this.balanzaModo !== 'PESO') {
      return null;
    }
    const codigoProducto = s.substring(1, 7);
    const valor = parseInt(s.substring(7, 12), 10);
    return { codigoProducto, pesoGramos: valor * (this.balanzaFactorPeso || 1) };
  }

  terminar(): void {
    this.location.back();
  }
}
