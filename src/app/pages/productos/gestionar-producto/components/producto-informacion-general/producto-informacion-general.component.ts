import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Observable, Subject, combineLatest } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { Familia } from 'src/app/database/entities/productos/familia.entity';
import { Subfamilia } from 'src/app/database/entities/productos/subfamilia.entity';
import { ProductoTipo } from 'src/app/database/entities/productos/producto-tipo.enum';
import { GestionarProductoService } from '../../services/gestionar-producto.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { TabsService } from 'src/app/services/tabs.service';
import { GestionarProductoComponent } from '../../gestionar-producto.component';

@Component({
  selector: 'app-producto-informacion-general',
  templateUrl: './producto-informacion-general.component.html',
  styleUrls: ['./producto-informacion-general.component.scss']
})
export class ProductoInformacionGeneralComponent implements OnInit, OnDestroy {
  
  informacionPrincipalForm: FormGroup;
  familias$: Observable<Familia[]>;
  subfamilias$: Observable<Subfamilia[]>;
  isEditMode$: Observable<boolean>;
  unidadBaseList: { nombre: string; }[];
  
  // Propiedades para la información del tipo de producto
  tipoProductoNombre = '';
  tipoProductoDescripcion = '';
  tipoProductoEjemplos: string[] = [];
  tipoProductoColor = '';
  tipoProductoIcono = '';
  mostrarTipoInfo = false;
  
  // Propiedades para controlar la habilitación de campos
  esVendibleHabilitado = true;
  esComprableHabilitado = true;
  controlaStockHabilitado = true;
  esIngredienteHabilitado = true;
  
  // Propiedades para mostrar los valores seleccionados
  familiaSeleccionada: Familia | null = null;
  subfamiliaSeleccionada: Subfamilia | null = null;
  
  // Propiedad computada para el estado activo
  estadoActivo = false;
  
  // Propiedad computada para el estado del formulario
  formularioInvalido = false;
  formularioSinCambios = false;
  
  private destroy$ = new Subject<void>();
  
  // Enum para referencia en el template si es necesario
  readonly ProductoTipo = ProductoTipo;

  constructor(
    private productoService: GestionarProductoService,
    private repositoryService: RepositoryService,
    private tabsService: TabsService
  ) {
    this.informacionPrincipalForm = this.productoService.informacionPrincipalForm;
    this.familias$ = this.productoService.familias$;
    this.subfamilias$ = this.productoService.subfamilias$;
    this.isEditMode$ = this.productoService.isEditMode$;
    this.unidadBaseList = this.productoService.unidadBaseList;
  }

  ngOnInit(): void {
    // Suscribirse a cambios en el tipo de producto
    this.informacionPrincipalForm.get('tipo')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(tipo => {
        this.actualizarTipoProductoInfo(tipo);
        this.actualizarHabilitacionCampos(tipo);
      });
      
    // Verificar el valor inicial
    const tipoInicial = this.informacionPrincipalForm.get('tipo')?.value;
    if (tipoInicial) {
      this.actualizarTipoProductoInfo(tipoInicial);
      this.actualizarHabilitacionCampos(tipoInicial);
    }

    // Suscribirse a cambios en familiaId para actualizar la familia seleccionada
    this.informacionPrincipalForm.get('familiaId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(familiaId => {
        if (familiaId) {
          this.repositoryService.getFamilia(familiaId).subscribe(familia => {
            this.familiaSeleccionada = familia;
          });
        } else {
          this.familiaSeleccionada = null;
        }
      });

    // Suscribirse a cambios en subfamiliaId para actualizar la subfamilia seleccionada
    this.informacionPrincipalForm.get('subfamiliaId')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(subfamiliaId => {
        if (subfamiliaId) {
          this.repositoryService.getSubfamilia(subfamiliaId).subscribe(subfamilia => {
            this.subfamiliaSeleccionada = subfamilia;
          });
        } else {
          this.subfamiliaSeleccionada = null;
        }
      });

    // Suscribirse a los observables del servicio para actualizar las propiedades seleccionadas
    this.productoService.familiaSeleccionada$
      .pipe(takeUntil(this.destroy$))
      .subscribe(familia => {
        this.familiaSeleccionada = familia;
      });

    this.productoService.subfamiliaSeleccionada$
      .pipe(takeUntil(this.destroy$))
      .subscribe(subfamilia => {
        this.subfamiliaSeleccionada = subfamilia;
      });

    // Suscribirse a cambios en el estado activo
    this.informacionPrincipalForm.get('activo')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(activo => {
        this.estadoActivo = activo;
      });

    // Inicializar estado activo
    this.estadoActivo = this.informacionPrincipalForm.get('activo')?.value || false;

    // Suscribirse a cambios en el estado del formulario
    this.informacionPrincipalForm.statusChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.actualizarEstadoFormulario();
      });

    // Inicializar estados
    this.actualizarEstadoFormulario();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  guardarProducto(): void {
    this.productoService.guardarProducto();
  }

  onImagenUploaded(event: { url: string; fileName: string; mimeType: string; tamanoBytes: number; thumbUrl?: string; mediumUrl?: string }): void {
    this.informacionPrincipalForm.patchValue({ imageUrl: event.url });
    this.informacionPrincipalForm.markAsDirty();
    this.actualizarEstadoFormulario();
  }

  onImagenRemoved(): void {
    this.informacionPrincipalForm.patchValue({ imageUrl: null });
    this.informacionPrincipalForm.markAsDirty();
    this.actualizarEstadoFormulario();
  }

  /**
   * Crea un nuevo producto abriendo una nueva pestaña
   */
  crearNuevoProducto(): void {
    try {
      // Crear nueva pestaña para crear producto
      this.tabsService.addTab('Crear Nuevo Producto', GestionarProductoComponent);
    } catch (error) {
      console.error('Error al crear nueva pestaña de producto:', error);
      // TODO: Agregar snackbar notification cuando se implemente el servicio
    }
  }

  /**
   * Cambia el estado activo del producto
   */
  toggleActivo(): void {
    const activoControl = this.informacionPrincipalForm.get('activo');
    if (activoControl) {
      const nuevoValor = !activoControl.value;
      activoControl.setValue(nuevoValor);
      
      // Marcar el formulario como modificado
      this.informacionPrincipalForm.markAsDirty();
      
      // TODO: Agregar snackbar notification cuando se implemente el servicio
    }
  }

  /**
   * Actualiza el estado del formulario
   */
  private actualizarEstadoFormulario(): void {
    this.formularioInvalido = this.informacionPrincipalForm.invalid;
    this.formularioSinCambios = !this.informacionPrincipalForm.dirty;
  }

  /**
   * Abre el diálogo de búsqueda de familias
   */
  buscarFamilia(): void {
    this.productoService.buscarFamilia().subscribe((familia: Familia | undefined) => {
      if (familia) {
        this.informacionPrincipalForm.patchValue({
          familiaId: familia.id,
          subfamiliaId: null // Reset subfamilia when familia changes
        });
        this.familiaSeleccionada = familia;
        this.productoService.setFamiliaSeleccionada(familia);
        this.buscarSubfamilia();
      }
    });
  }

  /**
   * Abre el diálogo de búsqueda de subfamilias
   */
  buscarSubfamilia(): void {
    const familiaId = this.informacionPrincipalForm.get('familiaId')?.value;
    
    this.productoService.buscarSubfamilia(familiaId).subscribe((subfamilia: Subfamilia | undefined) => {
      if (subfamilia) {
        this.informacionPrincipalForm.patchValue({
          subfamiliaId: subfamilia.id
        });
        this.subfamiliaSeleccionada = subfamilia;
        this.productoService.setSubfamiliaSeleccionada(subfamilia);
        
        // Si no había familia seleccionada, también actualizar la familia
        if (!familiaId) {
          this.familiaSeleccionada = subfamilia.familia;
          this.productoService.setFamiliaSeleccionada(subfamilia.familia);
          this.informacionPrincipalForm.patchValue({
            familiaId: subfamilia.familia.id
          });
        }
      }
    });
  }

  /**
   * Limpia la familia seleccionada
   */
  limpiarFamilia(): void {
    this.informacionPrincipalForm.patchValue({
      familiaId: null,
      subfamiliaId: null
    });
    this.familiaSeleccionada = null;
    this.subfamiliaSeleccionada = null;
    this.productoService.setFamiliaSeleccionada(null);
    this.productoService.setSubfamiliaSeleccionada(null);
  }

  /**
   * Limpia la subfamilia seleccionada
   */
  limpiarSubfamilia(): void {
    this.informacionPrincipalForm.patchValue({
      subfamiliaId: null
    });
    this.subfamiliaSeleccionada = null;
    this.productoService.setSubfamiliaSeleccionada(null);
  }

  /**
   * Actualiza las propiedades de información del tipo de producto
   */
  private actualizarTipoProductoInfo(tipo: ProductoTipo): void {
    if (!tipo) {
      this.mostrarTipoInfo = false;
      return;
    }

    const tipoInfo = this.getTipoProductoInfo(tipo);
    this.tipoProductoNombre = tipoInfo.nombre;
    this.tipoProductoDescripcion = tipoInfo.descripcion;
    this.tipoProductoEjemplos = tipoInfo.ejemplos;
    this.tipoProductoColor = tipoInfo.color;
    this.tipoProductoIcono = tipoInfo.icono;
    this.mostrarTipoInfo = true;
  }

  /**
   * Actualiza la habilitación de campos según el tipo de producto
   */
  stockTooltip = '';

  private actualizarHabilitacionCampos(tipo: ProductoTipo): void {
    const tiposSinComprable = [ProductoTipo.ELABORADO_SIN_VARIACION, ProductoTipo.ELABORADO_CON_VARIACION, ProductoTipo.COMBO];
    this.esComprableHabilitado = !tiposSinComprable.includes(tipo);
    this.controlaStockHabilitado = true; // Visible para todos los tipos

    // Tooltip informativo por tipo
    switch (tipo) {
      case ProductoTipo.RETAIL:
        this.stockTooltip = 'Stock se descuenta directamente al vender este producto.';
        break;
      case ProductoTipo.RETAIL_INGREDIENTE:
        this.stockTooltip = 'Stock se descuenta al vender o al ser usado como ingrediente en recetas.';
        break;
      case ProductoTipo.ELABORADO_SIN_VARIACION:
      case ProductoTipo.ELABORADO_CON_VARIACION:
        this.stockTooltip = 'ON: Se descuenta este producto directamente (requiere produccion previa). OFF: Se descontaran los ingredientes de su receta al vender.';
        break;
      case ProductoTipo.COMBO:
        this.stockTooltip = 'ON: Se descuenta el combo como producto. OFF: Se descontaran los productos componentes del combo al vender.';
        break;
      default:
        this.stockTooltip = '';
    }
  }

  /**
   * Obtiene información detallada sobre un tipo de producto específico
   */
  private getTipoProductoInfo(tipo: ProductoTipo): { 
    nombre: string; 
    descripcion: string; 
    ejemplos: string[]; 
    color: string; 
    icono: string; 
  } {
    const tipoInfoMap = {
      [ProductoTipo.RETAIL]: {
        nombre: 'RETAIL',
        descripcion: 'Productos que se compran a un proveedor y se venden al cliente final sin ninguna modificación',
        ejemplos: ['Coca-Cola', 'Agua Embotellada', 'Cerveza', 'Productos Empacados', 'Cigarrillos'],
        color: 'primary',
        icono: 'shopping_cart'
      },
      [ProductoTipo.RETAIL_INGREDIENTE]: {
        nombre: 'RETAIL INGREDIENTE',
        descripcion: 'Materias primas o insumos que se compran a proveedores y se utilizan en la elaboración de otros productos',
        ejemplos: ['Harina', 'Tomate', 'Queso Mozzarella', 'Aceite de Oliva', 'Sal', 'Carne Molida'],
        color: 'warn',
        icono: 'eco'
      },
      [ProductoTipo.ELABORADO_SIN_VARIACION]: {
        nombre: 'ELABORADO SIN VARIACIÓN',
        descripcion: 'Un producto que se crea en el restaurante a partir de una receta única y fija',
        ejemplos: ['Lasaña de Carne', 'Tiramisú', 'Sopa Específica', 'Pasta Bolognesa'],
        color: 'accent',
        icono: 'restaurant'
      },
      [ProductoTipo.ELABORADO_CON_VARIACION]: {
        nombre: 'ELABORADO CON VARIACIÓN',
        descripcion: 'Productos complejos que actúan como una "plantilla" y se ofrecen en múltiples variaciones',
        ejemplos: ['Pizza', 'Hamburguesa', 'Empanada', 'Pasta con diferentes salsas'],
        color: 'accent',
        icono: 'restaurant'
      },
      [ProductoTipo.COMBO]: {
        nombre: 'COMBO',
        descripcion: 'Un paquete promocional que agrupa varios productos vendibles a un precio fijo',
        ejemplos: ['Pizza + Bebida', 'Hamburguesa + Papas + Bebida', 'Menú Familiar', 'Combo Desayuno'],
        color: 'primary',
        icono: 'group_work'
      },
    };

    return tipoInfoMap[tipo] || {
      nombre: 'DESCONOCIDO',
      descripcion: 'Tipo de producto no definido',
      ejemplos: [],
      color: 'basic',
      icono: 'help'
    };
  }

}
