import { Component, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GestionarProductoService } from '../../services/gestionar-producto.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { Producto } from 'src/app/database/entities/productos/producto.entity';
import { Familia } from 'src/app/database/entities/productos/familia.entity';
import { Subfamilia } from 'src/app/database/entities/productos/subfamilia.entity';
import { Receta } from 'src/app/database/entities/productos/receta.entity';
import { mediumUrl } from 'src/app/shared/utils/image-url.util';

interface CarouselImage {
  url: string;
  displayUrl: string;
  label: string;
}

@Component({
  selector: 'app-producto-resumen',
  templateUrl: './producto-resumen.component.html',
  styleUrls: ['./producto-resumen.component.scss']
})
export class ProductoResumenComponent implements OnInit, OnDestroy {
  
  // Observables del servicio de producto
  isEditMode$: Observable<boolean>;
  productoId$: Observable<number | null>;
  
  // Propiedades locales para datos reales
  producto: Producto | null = null;
  familia: Familia | null = null;
  subfamilia: Subfamilia | null = null;
  receta: Receta | null = null;
  
  // Propiedades computadas para performance (siguiendo reglas)
  productoNombre = '';
  productoCodigoBarra = '';
  productoActivo = false;
  productoTipo = '';
  productoUnidadBase = '';
  productoEsVendible = false;
  productoEsComprable = false;
  productoControlaStock = false;
  productoEsIngrediente = false;
  productoStockMinimo = 0;
  productoStockMaximo = 0;
  productoStockActual = 0;
  productoPrecioCosto = 0;
  productoPrecioVenta = 0;
  productoMargenGanancia = 0;
  
  carouselImages: CarouselImage[] = [];
  currentImageIndex = 0;
  
  private destroy$ = new Subject<void>();

  constructor(
    public productoService: GestionarProductoService,
    private repositoryService: RepositoryService
  ) {
    this.isEditMode$ = this.productoService.isEditMode$;
    this.productoId$ = this.productoService.productoId$;
  }

  ngOnInit(): void {
    // Suscribirse a cambios del producto
    this.productoId$.pipe(takeUntil(this.destroy$)).subscribe(productoId => {
      if (productoId) {
        this.loadProductoData(productoId);
      } else {
        this.resetData();
      }
    });

    // Reaccionar a cambios en el imageUrl del form (preview live al subir)
    const imageCtrl = this.productoService.informacionPrincipalForm.get('imageUrl');
    imageCtrl?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.buildCarouselImages();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Carga los datos del producto y sus relaciones
   */
  private loadProductoData(productoId: number): void {
    this.repositoryService.getProducto(productoId).subscribe({
      next: (producto: Producto) => {
        this.producto = producto;
        this.updateComputedProperties();
        this.buildCarouselImages();
        this.loadRelatedData();
      },
      error: (error: any) => {
        console.error('Error loading producto:', error);
      }
    });
  }

  /**
   * Carga datos relacionados (familia, subfamilia, receta)
   */
  private loadRelatedData(): void {
    if (this.producto?.subfamilia?.id) {
      this.subfamilia = this.producto.subfamilia;
      this.familia = this.producto.subfamilia.familia;
    }
    
    // Cargar receta si existe
    if (this.producto?.receta?.id) {
      this.loadRecetaData(this.producto.receta.id);
    }
  }

  /**
   * Carga los datos de la receta asociada al producto
   */
  private loadRecetaData(recetaId: number): void {
    this.repositoryService.getReceta(recetaId).subscribe({
      next: (receta: Receta) => {
        this.receta = receta;
        // ✅ El backend ya devuelve costoCalculado y precioPrincipal
        console.log(`Receta cargada: ${receta.nombre}`);
        console.log(`Costo calculado: $${receta.costoCalculado}`);
        console.log(`Precio principal: $${receta.precioPrincipal}`);
        
        // Actualizar propiedades computadas después de cargar la receta
        this.updateComputedProperties();
      },
      error: (error: any) => {
        console.error('Error loading receta:', error);
        this.receta = null;
      }
    });
  }

  /**
   * Actualiza las propiedades computadas para performance
   */
  private updateComputedProperties(): void {
    if (!this.producto) {
      this.resetComputedProperties();
      return;
    }

    this.productoNombre = this.producto.nombre || '';
    this.productoCodigoBarra = this.getCodigoBarraPrincipal();
    this.productoActivo = this.producto.activo || false;
    this.productoTipo = this.producto.tipo || '';
    this.productoUnidadBase = this.producto.unidadBase || '';
    this.productoEsVendible = this.producto.esVendible || false;
    this.productoEsComprable = this.producto.esComprable || false;
    this.productoControlaStock = this.producto.controlaStock || false;
    this.productoEsIngrediente = this.producto.esIngrediente || false;
    this.productoStockMinimo = this.producto.stockMinimo || 0;
    this.productoStockMaximo = this.producto.stockMaximo || 0;
    this.productoStockActual = this.calculateStockActual();
    this.productoPrecioCosto = this.calculatePrecioCosto();
    this.productoPrecioVenta = this.calculatePrecioVenta();
    this.productoMargenGanancia = this.calculateMargenGanancia();
  }

  /**
   * Resetea las propiedades computadas
   */
  private resetComputedProperties(): void {
    this.productoNombre = '';
    this.productoCodigoBarra = '';
    this.productoActivo = false;
    this.productoTipo = '';
    this.productoUnidadBase = '';
    this.productoEsVendible = false;
    this.productoEsComprable = false;
    this.productoControlaStock = false;
    this.productoEsIngrediente = false;
    this.productoStockMinimo = 0;
    this.productoStockMaximo = 0;
    this.productoStockActual = 0;
    this.productoPrecioCosto = 0;
    this.productoPrecioVenta = 0;
    this.productoMargenGanancia = 0;
  }

  /**
   * Resetea todos los datos
   */
  private resetData(): void {
    this.producto = null;
    this.familia = null;
    this.subfamilia = null;
    this.receta = null;
    this.carouselImages = [];
    this.currentImageIndex = 0;
    this.resetComputedProperties();
  }

  /**
   * Obtiene el código de barra principal del producto
   */
  private getCodigoBarraPrincipal(): string {
    if (!this.producto?.presentaciones) return '';
    
    for (const presentacion of this.producto.presentaciones) {
      if (presentacion.codigosBarras && presentacion.codigosBarras.length > 0) {
        const codigoPrincipal = presentacion.codigosBarras.find(c => c.principal);
        if (codigoPrincipal) {
          return codigoPrincipal.codigo;
        }
        return presentacion.codigosBarras[0].codigo;
      }
    }
    return '';
  }

  /**
   * Calcula el stock actual del producto
   */
  private calculateStockActual(): number {
    // TODO: Implementar cálculo real de stock
    return 0;
  }

  /**
   * Calcula el precio de costo del producto
   */
  private calculatePrecioCosto(): number {
    if (!this.producto) return 0;
    
    // ✅ Para productos elaborados, usar el costo calculado de la receta
    if (this.producto.tipo === 'ELABORADO_SIN_VARIACION' && this.receta) {
      return this.receta.costoCalculado || 0;
    }
    
    // Para otros tipos de productos, usar el precio de costo más reciente
    // TODO: Implementar lógica para obtener el precio de costo más reciente
    return 0;
  }
  
  /**
   * Calcula el precio de venta del producto
   */
  private calculatePrecioVenta(): number {
    if (!this.producto) return 0;
    
    // ✅ Para productos elaborados, usar el precio principal de la receta
    if (this.producto.tipo === 'ELABORADO_SIN_VARIACION' && this.receta) {
      // Usar precioPrincipal si está disponible
      if (this.receta.precioPrincipal !== undefined) {
        return this.receta.precioPrincipal;
      }
      
      // Fallback: buscar el precio principal en preciosVenta
      if (this.receta.preciosVenta && this.receta.preciosVenta.length > 0) {
        const precioPrincipal = this.receta.preciosVenta.find(p => p.principal && p.activo);
        if (precioPrincipal) {
          return precioPrincipal.valor;
        }
        
        // Si no hay precio principal, usar el primero activo
        const precioActivo = this.receta.preciosVenta.find(p => p.activo);
        if (precioActivo) {
          return precioActivo.valor;
        }
      }
      
      return 0;
    }
    
    // Para otros tipos de productos, usar el precio de venta más reciente
    // TODO: Implementar lógica para obtener el precio de venta más reciente
    return 0;
  }

  /**
   * Calcula el margen de ganancia
   */
  private calculateMargenGanancia(): number {
    if (this.productoPrecioCosto === 0) return 0;
    return ((this.productoPrecioVenta - this.productoPrecioCosto) / this.productoPrecioCosto) * 100;
  }

  // Getters para datos del formulario (mantenidos para compatibilidad)
  get formData() {
    return this.productoService.informacionPrincipalForm;
  }

  get familiaNombre() {
    return this.familia?.nombre || '';
  }

  get subfamiliaNombre() {
    return this.subfamilia?.nombre || '';
  }

  get tipoProducto() {
    return this.productoTipo || this.formData.get('tipo')?.value || '';
  }

  get unidadBase() {
    return this.productoUnidadBase || this.formData.get('unidadBase')?.value || '';
  }

  // Carrusel: producto.imageUrl + presentaciones[].imageUrl + sabores[].imageUrl
  private buildCarouselImages(): void {
    const items: CarouselImage[] = [];
    const formImageUrl = this.productoService.informacionPrincipalForm.get('imageUrl')?.value as string | null;
    const principalUrl = formImageUrl || this.producto?.imageUrl;
    if (principalUrl) {
      items.push({ url: principalUrl, displayUrl: mediumUrl(principalUrl) ?? principalUrl, label: 'Principal' });
    }
    for (const p of this.producto?.presentaciones ?? []) {
      if (p.imageUrl) {
        items.push({ url: p.imageUrl, displayUrl: mediumUrl(p.imageUrl) ?? p.imageUrl, label: `Presentación: ${p.nombre ?? ''}`.trim() });
      }
    }
    for (const s of this.producto?.sabores ?? []) {
      if (s.imageUrl) {
        items.push({ url: s.imageUrl, displayUrl: mediumUrl(s.imageUrl) ?? s.imageUrl, label: `Sabor: ${s.nombre ?? ''}`.trim() });
      }
    }
    this.carouselImages = items;
    if (this.currentImageIndex >= items.length) {
      this.currentImageIndex = 0;
    }
  }

  onCarouselImgError(event: Event, originalUrl: string): void {
    const img = event.target as HTMLImageElement;
    if (img.src !== originalUrl) {
      img.src = originalUrl;
    }
  }

  nextImage(): void {
    if (!this.carouselImages.length) return;
    this.currentImageIndex = (this.currentImageIndex + 1) % this.carouselImages.length;
  }

  previousImage(): void {
    if (!this.carouselImages.length) return;
    this.currentImageIndex = this.currentImageIndex === 0
      ? this.carouselImages.length - 1
      : this.currentImageIndex - 1;
  }

  goToImage(index: number): void {
    this.currentImageIndex = index;
  }
}
