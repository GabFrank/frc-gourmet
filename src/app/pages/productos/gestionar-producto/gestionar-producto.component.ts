import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GestionarProductoService } from './services/gestionar-producto.service';
import { TabsService } from 'src/app/services/tabs.service';
import { ProductoTipo } from 'src/app/database/entities/productos/producto-tipo.enum';

@Component({
  selector: 'app-gestionar-producto',
  templateUrl: './gestionar-producto.component.html',
  styleUrls: ['./gestionar-producto.component.scss'],
  providers: [GestionarProductoService]
})
export class GestionarProductoComponent implements OnInit, OnDestroy {

  isLoading$: Observable<boolean>;
  isEditMode$: Observable<boolean>;
  productoNombre$: Observable<string>;           // ✅ NUEVO
  productoTipo$: Observable<ProductoTipo | null>; // ✅ NUEVO - CORREGIDO EL TIPO
  visibleTabs$: Observable<{
    presentaciones: boolean;
    preciosVenta: boolean;
    preciosCosto: boolean;
    receta: boolean;
    sabores: boolean;        // ✅ UNIFICADA (Sabores y Variaciones)
    stock: boolean;
    combo: boolean;
    observaciones: boolean;
  }>;
  productoId: number | null = null;
  productoId$!: Observable<number | null>;

  private destroy$ = new Subject<void>();

  constructor(
    private productoService: GestionarProductoService,
    private route: ActivatedRoute,
    private tabsService: TabsService
  ) {
    this.isLoading$ = this.productoService.isLoading$;
    this.isEditMode$ = this.productoService.isEditMode$;
    this.productoNombre$ = this.productoService.productoNombre$;  // ✅ NUEVO
    this.productoTipo$ = this.productoService.productoTipo$;      // ✅ NUEVO
    this.visibleTabs$ = this.productoService.visibleTabs$;
    this.productoId$ = this.productoService.productoId$;
  }

  ngOnInit(): void {
    console.log('[GestionarProductoComponent] ngOnInit: start');

    // Mantener this.productoId sincronizado con el estado del servicio. Es
    // clave para el flujo de CREACIÓN: al guardar un producto nuevo el servicio
    // emite el id recién generado (setEditMode / createProducto), y las subtabs
    // que se bindean a [productoId] (ej. Sabores y Variaciones) deben recibir
    // ese id real en lugar de quedar con null. Antes, this.productoId sólo se
    // seteaba una vez desde los datos del tab y nunca se actualizaba tras crear,
    // lo que hacía que la creación de sabores viajara sin productoId.
    this.productoId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(id => {
        if (id) {
          this.productoId = id;
        }
      });

    // Obtener el productoId desde el tabsService
    const currentTab = this.tabsService.currentTab();
    console.log('[GestionarProductoComponent] currentTab', currentTab);
    if (currentTab && currentTab.data && currentTab.data.productoId) {
      this.productoId = currentTab.data.productoId;
      console.log('[GestionarProductoComponent] productoId from tab', this.productoId);
      this.loadProductoData();
    } else {
      // Si no hay productoId, inicializar en modo creación
      console.log('[GestionarProductoComponent] init create mode via route');
      this.productoService.init(this.route);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.productoService.destroy();
  }

  /**
   * Carga los datos del producto si existe un productoId
   */
  private loadProductoData(): void {
    if (this.productoId) {
      console.log('[GestionarProductoComponent] loadProductoData for', this.productoId);
      // Inicializar el formulario primero
      this.productoService.initForm();

      // Actualizar el estado del servicio
      this.productoService.setEditMode(true, this.productoId);

      // Cambiar el título de la pestaña
      this.tabsService.changeCurrentTabName(`Editar Producto #${this.productoId}`);

      // Cargar los datos del producto
      this.productoService.loadProductoData(this.productoId);
    } else {
      console.warn('[GestionarProductoComponent] loadProductoData called with null productoId');
    }
  }
}
