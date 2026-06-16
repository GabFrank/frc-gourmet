import { Injectable } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { Familia } from 'src/app/database/entities/productos/familia.entity';
import { Subfamilia } from 'src/app/database/entities/productos/subfamilia.entity';
import { ProductoTipo } from 'src/app/database/entities/productos/producto-tipo.enum';
import { RepositoryService } from 'src/app/database/repository.service';
import { TabsService } from 'src/app/services/tabs.service';
import { GenericSearchDialogComponent, GenericSearchConfig } from 'src/app/shared/components/generic-search-dialog/generic-search-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class GestionarProductoService {
  // Instance ID para identificar cada instancia
  private instanceId = Math.random().toString(36).substr(2, 9);

  // Subjects para estado reactivo
  private _isEditMode = new BehaviorSubject<boolean>(false);
  isEditMode$ = this._isEditMode.asObservable();

  private _isLoading = new BehaviorSubject<boolean>(true);
  isLoading$ = this._isLoading.asObservable();

  private _productoId = new BehaviorSubject<number | null>(null);
  productoId$ = this._productoId.asObservable();

  // ✅ NUEVOS: Estado del producto actual
  private _productoNombre = new BehaviorSubject<string>('');
  productoNombre$ = this._productoNombre.asObservable();

  private _productoTipo = new BehaviorSubject<ProductoTipo | null>(null);
  productoTipo$ = this._productoTipo.asObservable();

  private _familias = new BehaviorSubject<Familia[]>([]);
  familias$ = this._familias.asObservable();

  private _subfamilias = new BehaviorSubject<Subfamilia[]>([]);
  subfamilias$ = this._subfamilias.asObservable();

  // Observables para las entidades seleccionadas
  private _familiaSeleccionada = new BehaviorSubject<Familia | null>(null);
  familiaSeleccionada$ = this._familiaSeleccionada.asObservable();

  private _subfamiliaSeleccionada = new BehaviorSubject<Subfamilia | null>(null);
  subfamiliaSeleccionada$ = this._subfamiliaSeleccionada.asObservable();

  // Observable para las tabs visibles
  private _visibleTabs = new BehaviorSubject<{
    presentaciones: boolean;
    preciosVenta: boolean;
    preciosCosto: boolean;
    receta: boolean;
    sabores: boolean;        // ✅ UNIFICADA (Sabores y Variaciones)
    stock: boolean;
    combo: boolean;
    observaciones: boolean;
  }>({
    presentaciones: true,
    preciosVenta: true,
    preciosCosto: true,
    receta: true,
    sabores: false,          // ✅ UNIFICADA (Sabores y Variaciones)
    stock: true,
    combo: true,
    observaciones: true
  });
  visibleTabs$ = this._visibleTabs.asObservable();

  // Formulario
  productoForm: FormGroup = this.fb.group({});

  // Lista de unidades (puede ser estática o venir de una entidad)
  readonly unidadBaseList = [
    { nombre: 'UNIDAD' },
    { nombre: 'KILOGRAMO' },
    { nombre: 'LITRO' },
  ];

  constructor(
    private fb: FormBuilder,
    private repository: RepositoryService,
    private router: Router,
    private tabsService: TabsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {
    this.initForm();
  }

  // Método para obtener el ID de la instancia (útil para debugging)
  getInstanceId(): string {
    return this.instanceId;
  }

  // Método para limpiar el estado de la instancia
  destroy(): void {
    this._isEditMode.complete();
    this._isLoading.complete();
    this._productoId.complete();
    this._productoNombre.complete();    // ✅ NUEVO
    this._productoTipo.complete();      // ✅ NUEVO
    this._familias.complete();
    this._subfamilias.complete();
    this._familiaSeleccionada.complete();
    this._subfamiliaSeleccionada.complete();
    this._visibleTabs.complete();
  }

  // Método para crear una nueva instancia aislada
  createIsolatedInstance(): GestionarProductoService {
    const isolatedService = new GestionarProductoService(
      this.fb,
      this.repository,
      this.router,
      this.tabsService,
      this.dialog,
      this.snackBar
    );
    return isolatedService;
  }

  // Método para resetear el estado de la instancia
  resetInstance(): void {
    this._isEditMode.next(false);
    this._isLoading.next(true);
    this._productoId.next(null);
    this._familias.next([]);
    this._subfamilias.next([]);
    this._familiaSeleccionada.next(null);
    this._subfamiliaSeleccionada.next(null);
    this._visibleTabs.next({
      presentaciones: true,
      preciosVenta: true,
      preciosCosto: true,
      receta: true,
      sabores: false,          // ✅ UNIFICADA (Sabores y Variaciones)
      stock: true,
      combo: true,
      observaciones: true
    });
    this.initForm();
  }

  // Método para verificar el estado de la instancia
  getInstanceStatus(): {
    instanceId: string;
    isEditMode: boolean;
    productoId: number | null;
    familiasCount: number;
    subfamiliasCount: number;
  } {
    return {
      instanceId: this.instanceId,
      isEditMode: this._isEditMode.value,
      productoId: this._productoId.value,
      familiasCount: this._familias.value.length,
      subfamiliasCount: this._subfamilias.value.length
    };
  }

  // Métodos de inicialización
  init(route: ActivatedRoute): void {
    console.log('[GestionarProductoService] init');
    this.loadInitialData();

    route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        console.log('[GestionarProductoService] route has id', id);
        this._isEditMode.next(true);
        this._productoId.next(+id);
        this.loadProductoData(+id);
        this.tabsService.changeCurrentTabName(`Editar Producto #${id}`);
      } else {
        console.log('[GestionarProductoService] route without id (create mode)');
        this._isEditMode.next(false);
        this._isLoading.next(false);
        this.tabsService.changeCurrentTabName('Crear Nuevo Producto');
      }
    });

    this.informacionPrincipalForm.get('familiaId')?.valueChanges.subscribe(familiaId => {
      this._subfamilias.next([]);
      this.informacionPrincipalForm.get('subfamiliaId')?.reset();
      if (familiaId) {
        this.loadSubfamilias(familiaId);
      }
    });
  }

  /**
   * Establece el modo de edición y el ID del producto
   */
  setEditMode(isEdit: boolean, productoId?: number): void {
    this._isEditMode.next(isEdit);
    if (productoId) {
      this._productoId.next(productoId);
    }
  }

  /**
   * Establece la familia seleccionada
   */
  setFamiliaSeleccionada(familia: Familia | null): void {
    this._familiaSeleccionada.next(familia);
  }

  /**
   * Establece la subfamilia seleccionada
   */
  setSubfamiliaSeleccionada(subfamilia: Subfamilia | null): void {
    this._subfamiliaSeleccionada.next(subfamilia);
  }

  /**
   * Determina si la tab de Presentaciones y Precios debe ser visible
   */
  isPresentacionesTabVisible(): boolean {
    const tipo = this.informacionPrincipalForm.get('tipo')?.value;

    // Presentaciones son relevantes para:
    // - RETAIL y RETAIL_INGREDIENTE (unidades de compra/venta)
    // - ELABORADO_CON_VARIACION (tamaños necesarios para generar variaciones)
    return (
      tipo === ProductoTipo.RETAIL ||
      tipo === ProductoTipo.RETAIL_INGREDIENTE ||
      tipo === ProductoTipo.ELABORADO_CON_VARIACION
    );
  }

  /**
   * Determina si la tab de Precios de Venta debe ser visible
   */
  isPreciosVentaTabVisible(): boolean {
    const tipo = this.informacionPrincipalForm.get('tipo')?.value;
    const esVendible = this.informacionPrincipalForm.get('esVendible')?.value;

    // Según el análisis del documento:
    // - RETAIL: Los precios se gestionan dentro de "Presentaciones y Precios" (NO necesita pestaña exclusiva)
    // - RETAIL_INGREDIENTE: Puede ser vendible si el usuario lo indica, pero por defecto no se vende al público
    // - ELABORADO_SIN_VARIACION: Necesita pestaña exclusiva (precios a nivel del producto)
    // - ELABORADO_CON_VARIACION: Los precios se gestionan por variación en "Recetas"
    // - COMBO: Necesita pestaña exclusiva (precios del combo)

    if (tipo === ProductoTipo.RETAIL) {
      return false; // Los precios se manejan en "Presentaciones y Precios"
    }

    if (tipo === ProductoTipo.RETAIL_INGREDIENTE) {
      return esVendible === true; // Solo si el usuario marca como vendible
    }

    if (tipo === ProductoTipo.ELABORADO_SIN_VARIACION || tipo === ProductoTipo.COMBO) {
      return esVendible === true; // Solo si es vendible
    }

    if (tipo === ProductoTipo.ELABORADO_CON_VARIACION) {
      return false; // Los precios se manejan por variación en "Recetas"
    }

    return esVendible === true; // Fallback
  }

  /**
   * Determina si la tab de Precios de Costo debe ser visible
   */
  isPreciosCostoTabVisible(): boolean {
    const tipo = this.informacionPrincipalForm.get('tipo')?.value;
    const esComprable = this.informacionPrincipalForm.get('esComprable')?.value;

    // Según el análisis del documento:
    // - RETAIL: "Info General, Presentaciones, Precios, Stock, Costos" (SÍ necesita costos)
    // - RETAIL_INGREDIENTE: "Info General, Presentaciones, Stock, Costos" (SÍ necesita costos)
    // - ELABORADO_SIN_VARIACION: No menciona costos explícitamente, pero puede tener costos manuales
    // - ELABORADO_CON_VARIACION: No menciona costos explícitamente
    // - COMBO: No menciona costos explícitamente

    if (tipo === ProductoTipo.COMBO) {
      return false; // COMBO: el costo se calcula desde los productos componentes
    }

    if (tipo === ProductoTipo.ELABORADO_CON_VARIACION) {
      return false; // El costo proviene de la receta
    }

    if (tipo === ProductoTipo.ELABORADO_SIN_VARIACION) {
      return false; // El costo se calcula desde la receta
    }

    if (tipo === ProductoTipo.RETAIL || tipo === ProductoTipo.RETAIL_INGREDIENTE) {
      return esComprable === true; // Solo productos comprables tienen costos
    }

    return false;
  }

  /**
   * Determina si la tab de Receta debe ser visible
   */
  isRecetaTabVisible(): boolean {
    const tipo = this.informacionPrincipalForm.get('tipo')?.value;

    // Recetas visibles solo para productos elaborados sin variación
    // Para ELABORADO_CON_VARIACION la receta se gestiona desde la pestaña "Sabores" → "Gestionar Receta"
    return tipo === ProductoTipo.ELABORADO_SIN_VARIACION;
  }

  /**
   * Determina si la tab de Stock debe ser visible
   */
  isStockTabVisible(): boolean {
    const tipo = this.informacionPrincipalForm.get('tipo')?.value;
    const controlaStock = this.informacionPrincipalForm.get('controlaStock')?.value;

    // Según el análisis:
    // - RETAIL: "Stock: El stock se gestiona por Presentacion"
    // - RETAIL_INGREDIENTE: "Stock: El stock se incrementa con Compras y se descuenta cuando se registra una Produccion"
    // - ELABORADO_SIN_VARIACION: "Stock: El stock de este producto se gestiona a través de un módulo de Produccion"
    // - ELABORADO_CON_VARIACION: "Stock: No hay stock para el producto padre. El stock se descuenta de los ingredientes"
    // - COMBO: "Stock: Cuando se vende un Combo, el sistema debe descontar el stock de cada uno de los productos componentes"

    // COMBO no maneja stock propio — se descuenta de los productos componentes
    if (tipo === ProductoTipo.COMBO) {
      return false;
    }

    // ELABORADO_CON_VARIACION: no hay stock para el producto padre, se descuenta de los ingredientes
    if (tipo === ProductoTipo.ELABORADO_CON_VARIACION) {
      return false;
    }

    // ELABORADO_SIN_VARIACION: el stock se gestiona a través del módulo de Producción
    if (tipo === ProductoTipo.ELABORADO_SIN_VARIACION) {
      return false;
    }

    // RETAIL y RETAIL_INGREDIENTE tienen gestión de stock
    return true;
  }

  /**
   * Determina si la tab de Sabores debe ser visible
   */
  isSaboresTabVisible(): boolean {
    const tipo = this.informacionPrincipalForm.get('tipo')?.value;

    // La pestaña de Sabores solo es visible para ELABORADO_CON_VARIACION
    // Según la nueva arquitectura: "Gestión de sabores permite crear variaciones automáticas"
    return tipo === ProductoTipo.ELABORADO_CON_VARIACION;
  }



  /**
   * Determina si la tab de Combo debe ser visible
   */
  isComboTabVisible(): boolean {
    const tipo = this.informacionPrincipalForm.get('tipo')?.value;

    // Solo productos tipo COMBO tienen esta tab
    // Según el análisis: "Armado de Combo: Esta es la pestaña principal" para COMBO
    return tipo === ProductoTipo.COMBO;
  }

  /**
   * Obtiene todas las tabs visibles según la configuración actual del producto
   */
  getVisibleTabs(): {
    presentaciones: boolean;
    preciosVenta: boolean;
    preciosCosto: boolean;
    receta: boolean;
    sabores: boolean;        // ✅ UNIFICADA (Sabores y Variaciones)
    stock: boolean;
    combo: boolean;
    observaciones: boolean;
  } {
    const visibleTabs = {
      presentaciones: this.isPresentacionesTabVisible(),
      preciosVenta: this.isPreciosVentaTabVisible(),
      preciosCosto: this.isPreciosCostoTabVisible(),
      receta: this.isRecetaTabVisible(),
      sabores: this.isSaboresTabVisible(),           // ✅ UNIFICADA (Sabores y Variaciones)
      stock: this.isStockTabVisible(),
      combo: this.isComboTabVisible(),
      observaciones: this.isObservacionesTabVisible()
    };

    return visibleTabs;
  }

  /**
   * Determina si la tab de Observaciones debe ser visible
   */
  isObservacionesTabVisible(): boolean {
    // Las observaciones son relevantes para todos los tipos de producto
    return true;
  }

  /**
   * Carga los datos de un producto específico
   */
  loadProductoData(id: number): void {
    console.log('[GestionarProductoService] loadProductoData', id);
    this._isLoading.next(true);

    // Cargar familias primero
    this.loadInitialData();

    this.repository.getProducto(id).subscribe({
      next: (producto) => {
        console.log('[GestionarProductoService] producto loaded', producto);
        // Parchear el formulario con los datos del producto
        this.informacionPrincipalForm.patchValue({
          familiaId: producto.subfamilia?.familia?.id || null,
          subfamiliaId: producto.subfamilia?.id || null,
          nombre: producto.nombre?.toUpperCase(),
          tipo: producto.tipo,
          unidadBase: producto.unidadBase,
          iva: (producto as any).iva ?? 10,
          activo: producto.activo,
          esVendible: producto.esVendible,
          esComprable: producto.esComprable,
          controlaStock: producto.controlaStock,
          esIngrediente: producto.esIngrediente,
          stockMinimo: producto.stockMinimo,
          stockMaximo: producto.stockMaximo,
          taraGramos: (producto as any).taraGramos ?? null,
          pesoMinimoGramos: (producto as any).pesoMinimoGramos ?? null,
          descuentaPorReceta: (producto as any).descuentaPorReceta ?? false,
          imageUrl: (producto as any).imageUrl ?? null
        });

        // Cargar subfamilias si hay familia seleccionada
        if (producto.subfamilia?.familia?.id) {
          this.loadSubfamilias(producto.subfamilia.familia.id);
        }

        // Emitir un evento para que el componente actualice las propiedades seleccionadas
        setTimeout(() => {
          // Forzar la actualización de las propiedades seleccionadas
          if (producto.subfamilia?.familia) {
            this.repository.getFamilia(producto.subfamilia.familia.id).subscribe(familia => {
              // Emitir un evento personalizado para actualizar familiaSeleccionada
              this._familiaSeleccionada.next(familia);
            });
          }

          if (producto.subfamilia) {
            this.repository.getSubfamilia(producto.subfamilia.id).subscribe(subfamilia => {
              // Emitir un evento personalizado para actualizar subfamiliaSeleccionada
              this._subfamiliaSeleccionada.next(subfamilia);
            });
          }

          // Actualizar las tabs visibles después de cargar los datos
          this.actualizarTabsVisibles();
          console.log('[GestionarProductoService] visibleTabs', this.getVisibleTabs());
        }, 100);

        this._isLoading.next(false);
      },
      error: (error) => {
        console.error('Error cargando producto:', error);
        this._isLoading.next(false);
      }
    });
  }

  initForm(): void {
    this.productoForm = this.fb.group({
      informacionPrincipal: this.fb.group({
        familiaId: [null, [Validators.required]],
        subfamiliaId: [null, [Validators.required]],
        nombre: ['', [Validators.required, Validators.maxLength(255)]],
        tipo: [ProductoTipo.RETAIL, [Validators.required]],
        unidadBase: [this.unidadBaseList[0].nombre, [Validators.required]],
        iva: [10, [Validators.required]],
        activo: [true],
        // Campos de configuración según el análisis
        esVendible: [true],
        esComprable: [true],
        controlaStock: [true],
        esIngrediente: [false],
        stockMinimo: [null, [Validators.min(0)]],
        stockMaximo: [null, [Validators.min(0)]],
        imageUrl: [null],
        // Buffet por peso (solo BUFFET_POR_PESO)
        taraGramos: [null, [Validators.min(0)]],
        pesoMinimoGramos: [null, [Validators.min(0)]],
        descuentaPorReceta: [false]
      }, { validators: this.stockRangeValidator }),
      presentaciones: this.fb.array([]),
      precios: this.fb.group({
        venta: this.fb.array([]),
        costo: this.fb.array([])
      }),
      receta: this.fb.group({
        recetaId: [null]
      }),
      combo: this.fb.group({
        productos: this.fb.array([])
      })
    });

    // Suscribirse a cambios en el tipo para configurar automáticamente los campos booleanos
    this.setupProductoTipoWatchers();
  }

  // Validador personalizado para verificar que stockMaximo > stockMinimo
  private stockRangeValidator(group: FormGroup): {[key: string]: any} | null {
    const stockMinimo = group.get('stockMinimo')?.value;
    const stockMaximo = group.get('stockMaximo')?.value;

    if (stockMinimo !== null && stockMaximo !== null && stockMaximo <= stockMinimo) {
      return { 'stockRangeInvalid': true };
    }

    return null;
  }

  private setupProductoTipoWatchers(): void {
    const form = this.informacionPrincipalForm;

    // Observar cambios en el tipo para configurar automáticamente los campos booleanos
    form.get('tipo')?.valueChanges.subscribe(tipo => {
      this.configurarCamposSegunTipo(tipo);
      this.actualizarTabsVisibles();
    });

    // Observar cambios en los campos booleanos para actualizar las tabs visibles
    form.get('esVendible')?.valueChanges.subscribe(() => {
      this.actualizarTabsVisibles();
    });

    form.get('esComprable')?.valueChanges.subscribe(() => {
      this.actualizarTabsVisibles();
    });

    form.get('controlaStock')?.valueChanges.subscribe(() => {
      this.actualizarTabsVisibles();
    });

    form.get('esIngrediente')?.valueChanges.subscribe(() => {
      this.actualizarTabsVisibles();
    });

    // Watcher para convertir el nombre a mayúsculas automáticamente
    form.get('nombre')?.valueChanges.subscribe(nombre => {
      if (nombre && typeof nombre === 'string') {
        const upperCaseNombre = nombre.toUpperCase();
        if (nombre !== upperCaseNombre) {
          form.get('nombre')?.setValue(upperCaseNombre, { emitEvent: false });
        }
      }
      // ✅ NUEVO: Actualizar el observable del nombre
      this._productoNombre.next(nombre || '');
    });
  }

  /**
   * Actualiza las tabs visibles según la configuración actual del producto
   */
  private actualizarTabsVisibles(): void {
    const visibleTabs = this.getVisibleTabs();
    this._visibleTabs.next(visibleTabs);

    // ✅ NUEVO: También actualizar nombre y tipo del producto
    const form = this.informacionPrincipalForm;
    const nombre = form.get('nombre')?.value || '';
    const tipo = form.get('tipo')?.value || null;

    this._productoNombre.next(nombre);
    this._productoTipo.next(tipo);
  }

  private configurarCamposSegunTipo(tipo: ProductoTipo): void {
    const form = this.informacionPrincipalForm;

    // Configuración por defecto según el análisis
    const configuracion = this.getConfiguracionPorTipo(tipo);
    const habilitacion = this.getConfiguracionHabilitacion(tipo);

    // Actualizar los campos booleanos sin emitir eventos para evitar loops
    form.get('esVendible')?.setValue(configuracion.esVendible, { emitEvent: false });
    form.get('esComprable')?.setValue(configuracion.esComprable, { emitEvent: false });
    form.get('controlaStock')?.setValue(configuracion.controlaStock, { emitEvent: false });
    form.get('esIngrediente')?.setValue(configuracion.esIngrediente, { emitEvent: false });

    // Configurar el estado disabled de los controles
    if (habilitacion.esVendibleHabilitado) {
      form.get('esVendible')?.enable({ emitEvent: false });
    } else {
      form.get('esVendible')?.disable({ emitEvent: false });
    }

    if (habilitacion.esComprableHabilitado) {
      form.get('esComprable')?.enable({ emitEvent: false });
    } else {
      form.get('esComprable')?.disable({ emitEvent: false });
    }

    if (habilitacion.controlaStockHabilitado) {
      form.get('controlaStock')?.enable({ emitEvent: false });
    } else {
      form.get('controlaStock')?.disable({ emitEvent: false });
    }

    if (habilitacion.esIngredienteHabilitado) {
      form.get('esIngrediente')?.enable({ emitEvent: false });
    } else {
      form.get('esIngrediente')?.disable({ emitEvent: false });
    }
  }

  private getConfiguracionPorTipo(tipo: ProductoTipo): {
    esVendible: boolean;
    esComprable: boolean;
    controlaStock: boolean;
    esIngrediente: boolean;
  } {
    const configuraciones = {
      [ProductoTipo.RETAIL]: {
        esVendible: true,
        esComprable: true,
        controlaStock: true,
        esIngrediente: false
      },
      [ProductoTipo.RETAIL_INGREDIENTE]: {
        esVendible: false,
        esComprable: true,
        controlaStock: true,
        esIngrediente: true
      },
      [ProductoTipo.ELABORADO_SIN_VARIACION]: {
        esVendible: true,
        esComprable: false,
        controlaStock: false,
        esIngrediente: true  // Cambiado de false a true
      },
      [ProductoTipo.ELABORADO_CON_VARIACION]: {
        esVendible: true,
        esComprable: false,
        controlaStock: false,
        esIngrediente: true  // Cambiado de false a true
      },
      [ProductoTipo.COMBO]: {
        esVendible: true,
        esComprable: false,
        controlaStock: false,
        esIngrediente: false
      },
      [ProductoTipo.BUFFET_POR_PESO]: {
        esVendible: true,
        esComprable: false,
        controlaStock: true,
        esIngrediente: false
      }
    };

    return configuraciones[tipo] || configuraciones[ProductoTipo.RETAIL];
  }

  private getConfiguracionHabilitacion(tipo: ProductoTipo): {
    esVendibleHabilitado: boolean;
    esComprableHabilitado: boolean;
    controlaStockHabilitado: boolean;
    esIngredienteHabilitado: boolean;
  } {
    const configuraciones = {
      [ProductoTipo.RETAIL]: {
        esVendibleHabilitado: true,
        esComprableHabilitado: true,
        controlaStockHabilitado: true,
        esIngredienteHabilitado: false
      },
      [ProductoTipo.RETAIL_INGREDIENTE]: {
        esVendibleHabilitado: true,
        esComprableHabilitado: true,
        controlaStockHabilitado: true,
        esIngredienteHabilitado: true
      },
      [ProductoTipo.ELABORADO_SIN_VARIACION]: {
        esVendibleHabilitado: true,
        esComprableHabilitado: false,
        controlaStockHabilitado: true,
        esIngredienteHabilitado: true
      },
      [ProductoTipo.ELABORADO_CON_VARIACION]: {
        esVendibleHabilitado: true,
        esComprableHabilitado: false,
        controlaStockHabilitado: true,
        esIngredienteHabilitado: true
      },
      [ProductoTipo.COMBO]: {
        esVendibleHabilitado: true,
        esComprableHabilitado: false,
        controlaStockHabilitado: true,
        esIngredienteHabilitado: false
      },
      [ProductoTipo.BUFFET_POR_PESO]: {
        esVendibleHabilitado: true,
        esComprableHabilitado: false,
        controlaStockHabilitado: true,
        esIngredienteHabilitado: false
      }
    };

    return configuraciones[tipo] || configuraciones[ProductoTipo.RETAIL];
  }

  // Getters para fácil acceso a los form groups
  get informacionPrincipalForm(): FormGroup {
    return this.productoForm.get('informacionPrincipal') as FormGroup;
  }

  // Métodos de carga de datos
  private loadInitialData(): void {
    this.repository.getFamilias().subscribe((res: Familia[]) => {
      this._familias.next(res);
    });
  }

  private loadSubfamilias(familiaId: number): void {
    this.repository.getSubfamiliasByFamilia(familiaId).subscribe((res: Subfamilia[]) => {
      this._subfamilias.next(res);
    });
  }

  // Acciones
  guardarProducto(): void {
    if (this.informacionPrincipalForm.invalid) {
      this.informacionPrincipalForm.markAllAsTouched();
      // TODO: Add snackbar notification
      console.error('El formulario es inválido');
      return;
    }

    this._isLoading.next(true);
    const productoData = this.informacionPrincipalForm.value;

    // Verificar que los datos del formulario estén presentes
    if (!productoData) {
      console.error('No hay datos del formulario');
      this._isLoading.next(false);
      return;
    }

    // Normalizar el nombre a mayúsculas y preparar los datos
    const normalizedData = {
      nombre: productoData.nombre?.toUpperCase() || '',
      tipo: productoData.tipo,
      unidadBase: productoData.unidadBase,
      iva: Number(productoData.iva ?? 10),
      activo: productoData.activo,
      esVendible: productoData.esVendible,
      esComprable: productoData.esComprable,
      controlaStock: productoData.controlaStock,
      esIngrediente: productoData.esIngrediente,
      stockMinimo: productoData.stockMinimo,
      stockMaximo: productoData.stockMaximo,
      taraGramos: productoData.taraGramos ?? null,
      pesoMinimoGramos: productoData.pesoMinimoGramos ?? null,
      descuentaPorReceta: productoData.descuentaPorReceta ?? false,
      subfamiliaId: productoData.subfamiliaId,
      imageUrl: productoData.imageUrl ?? null
    };

    if (this._isEditMode.value) {
      this.repository.updateProducto(this._productoId.value!, normalizedData).subscribe({
        next: (response) => {
          // Mostrar mensaje de éxito
          this.snackBar.open('Producto actualizado correctamente', 'CERRAR', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });

          this._isLoading.next(false);
          // Recargar los datos del producto para reflejar los cambios
          this.loadProductoData(this._productoId.value!);
        },
        error: (error) => {
          console.error('Error actualizando producto:', error);

          // Mostrar mensaje de error
          this.snackBar.open('Error al actualizar producto', 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });

          this._isLoading.next(false);
        }
      });
    } else {
      this.repository.createProducto(normalizedData).subscribe({
        next: (res: any) => {
          // Mostrar mensaje de éxito
          this.snackBar.open('Producto creado correctamente', 'CERRAR', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });

          // En lugar de cerrar el componente, cambiar a modo edición
          this._isEditMode.next(true);
          this._productoId.next(res.id);
          this.tabsService.changeCurrentTabName(`Editar Producto #${res.id}`);

          // Recargar los datos del producto para mostrar la información completa
          this.loadProductoData(res.id);

          this._isLoading.next(false);
        },
        error: (error) => {
          console.error('Error creando producto:', error);

          // Mostrar mensaje de error
          this.snackBar.open('Error al crear producto', 'CERRAR', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });

          this._isLoading.next(false);
        }
      });
    }
  }

  /**
   * Abre el diálogo de búsqueda de familias
   */
  buscarFamilia(): Observable<Familia | undefined> {
    const config: GenericSearchConfig = {
      title: 'BUSCAR FAMILIA',
      displayedColumns: ['nombre', 'activo'],
      columnLabels: {
        nombre: 'NOMBRE',
        activo: 'ACTIVO'
      },
      columnAlignments: {
        nombre: 'left',
        activo: 'center'
      },
      booleanColumns: {
        activo: { trueValue: 'Sí', falseValue: 'No' }
      },
      showActiveFilter: true,
      searchFn: async (query: string, page: number, pageSize: number, activeFilter?: 'all' | 'active' | 'inactive') => {
        const familias = await this.repository.getFamilias().toPromise();
        if (!familias) return { items: [], total: 0 };

        let filteredFamilias = familias;

        // Filtrar por query si se proporciona
        if (query && query.trim()) {
          const searchTerm = query.toLowerCase().trim();
          filteredFamilias = familias.filter(familia =>
            familia.nombre.toLowerCase().includes(searchTerm)
          );
        }

        // Filtrar por estado activo/inactivo
        if (activeFilter && activeFilter !== 'all') {
          const isActive = activeFilter === 'active';
          filteredFamilias = filteredFamilias.filter(familia => familia.activo === isActive);
        }

        // Aplicar paginación
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedFamilias = filteredFamilias.slice(startIndex, endIndex);

        return {
          items: paginatedFamilias,
          total: filteredFamilias.length
        };
      }
    };

    const dialogRef = this.dialog.open(GenericSearchDialogComponent, {
      width: '60%',
      height: '80%',
      data: config
    });

    return dialogRef.afterClosed();
  }

  /**
   * Abre el diálogo de búsqueda de subfamilias
   */
  buscarSubfamilia(familiaId?: number): Observable<Subfamilia | undefined> {
    const config: GenericSearchConfig = {
      title: 'BUSCAR SUBFAMILIA',
      displayedColumns: ['nombre', 'familia.nombre', 'activo'],
      columnLabels: {
        nombre: 'NOMBRE',
        'familia.nombre': 'FAMILIA',
        activo: 'ACTIVO'
      },
      columnAlignments: {
        nombre: 'left',
        'familia.nombre': 'left',
        activo: 'center'
      },
      booleanColumns: {
        activo: { trueValue: 'Sí', falseValue: 'No' }
      },
      showActiveFilter: true,
      searchFn: async (query: string, page: number, pageSize: number, activeFilter?: 'all' | 'active' | 'inactive') => {
        let subfamilias: Subfamilia[] = [];

        if (familiaId) {
          subfamilias = await this.repository.getSubfamiliasByFamilia(familiaId).toPromise() || [];
        } else {
          subfamilias = await this.repository.getSubfamilias().toPromise() || [];
        }

        let filteredSubfamilias = subfamilias;

        // Filtrar por query si se proporciona
        if (query && query.trim()) {
          const searchTerm = query.toLowerCase().trim();
          filteredSubfamilias = subfamilias.filter(subfamilia =>
            subfamilia.nombre.toLowerCase().includes(searchTerm) ||
            subfamilia.familia?.nombre.toLowerCase().includes(searchTerm)
          );
        }

        // Filtrar por estado activo/inactivo
        if (activeFilter && activeFilter !== 'all') {
          const isActive = activeFilter === 'active';
          filteredSubfamilias = filteredSubfamilias.filter(subfamilia => subfamilia.activo === isActive);
        }

        // Aplicar paginación
        const startIndex = page * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedSubfamilias = filteredSubfamilias.slice(startIndex, endIndex);

        return {
          items: paginatedSubfamilias,
          total: filteredSubfamilias.length
        };
      }
    };

    const dialogRef = this.dialog.open(GenericSearchDialogComponent, {
      width: '60%',
      height: '80%',
      data: config
    });

    return dialogRef.afterClosed();
  }
}
