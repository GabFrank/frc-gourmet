import { Component, Inject, OnInit, ViewChild, ElementRef, ChangeDetectorRef, Input, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabGroup, MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogConfig, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { MatMenuModule } from '@angular/material/menu';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { RepositoryService } from '../../../database/repository.service';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { ProductoImage } from '../../../database/entities/productos/producto-image.entity';
import { Subcategoria } from '../../../database/entities/productos/subcategoria.entity';
import { Categoria } from '../../../database/entities/productos/categoria.entity';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { firstValueFrom, Observable, of, map, startWith, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { TabsService } from '../../../services/tabs.service';
import { ImageViewerComponent } from '../../../components/image-viewer/image-viewer.component';
import { CreateEditCodigoComponent } from './create-edit-codigo.component';
import { CreateEditPrecioVentaComponent } from './create-edit-precio-venta.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Presentacion, TipoMedida } from '../../../database/entities/productos/presentacion.entity';
import { CreateEditPresentacionDialogComponent } from './create-edit-presentacion-dialog.component';
import { CreateEditSaboresComponent } from './create-edit-sabores.component';
import { TipoCodigo, Codigo } from '../../../database/entities/productos/codigo.entity';
import { PrecioVenta } from '../../../database/entities/productos/precio-venta.entity';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { PresentacionSabor } from '../../../database/entities/productos/presentacion-sabor.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { RecetaVariacion } from '../../../database/entities/productos/receta-variacion.entity';
import { ProductoAdicional } from '../../../database/entities/productos/producto-adicional.entity';
import { Adicional } from '../../../database/entities/productos/adicional.entity';
import { CreateEditAdicionalDialogComponent } from '../adicionales/create-edit-adicional-dialog/create-edit-adicional-dialog.component';

// renamed to avoid conflict with the imported type
interface ProductImageModel {
  id?: number;
  imageUrl: string;
  file?: File;
  isMain: boolean;
  orden: number;
  isNew?: boolean;
  toDelete?: boolean;
}

// Extended Presentacion interface with pre-computed display values
interface PresentacionViewModel extends Presentacion {
  tipoMedidaLabel?: string;
  recetaId?: number;
  variacionId?: number;
}

// Add this interface right after
interface PresentacionSaborViewModel extends PresentacionSabor {
  costoTotal?: number;
  precioVenta?: number;
  moneda?: Moneda;
  codigoBarras?: string;
  stock?: number;
}

// Add the RecetaViewModel interface
interface RecetaViewModel {
  id: number;
  nombre: string;
  tipoMedida: string;
  cantidad: number;
  displayText: string;  // For display in the input when selected
  optionText: string;   // Name with ID for option display
}

@Component({
  selector: 'app-create-edit-producto-v2',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatTabsModule,
    MatCardModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule,
    MatTableModule,
    MatMenuModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    FormsModule,
    CreateEditCodigoComponent,
    CreateEditPrecioVentaComponent,
    CreateEditSaboresComponent,
    ConfirmationDialogComponent
  ],
  templateUrl: './create-edit-producto-v2.component.html',
  styleUrls: ['./create-edit-producto-v2.component.scss'],
})
export class CreateEditProductoV2Component implements OnInit, OnChanges, AfterViewInit {
  @Input() data: any;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('imagesSection') imagesSection!: ElementRef;

  productoForm: FormGroup;
  isEditing = false;
  isLoading = false;
  isUploading = false;
  categorias: Categoria[] = [];
  subcategorias: Subcategoria[] = [];
  recetas: Receta[] = [];
  filteredRecetas!: Observable<RecetaViewModel[]>;
  // search for main image when load the product
  mainImageUrl = '';
  // For image handling
  selectedImageFile: File | null = null;
  productImages: ProductImageModel[] = [];
  maxImageSize = 5 * 1024 * 1024; // 5MB
  currentImageIndex = 0;

  producto?: Producto;
  defaultNoImagePath = '/assets/images/no-image.png';
  submitted = false;
  loading = false;

  // Properties for the precios table
  preciosDisplayedColumns: string[] = ['moneda', 'valor', 'cmv', 'tipoPrecio', 'principal', 'activo', 'acciones'];
  defaultPresentacionPrecios: PrecioVenta[] = [];
  defaultPresentacionId?: number;

  // Properties for the codigos table
  codigosDisplayedColumns: string[] = ['codigo', 'tipoCodigo', 'principal', 'activo', 'acciones'];
  presentacionCodigos: { [presentacionId: number]: Codigo[] } = {};

  // Flag to track if data has been processed to prevent multiple processing
  private dataProcessed = false;

  // Maps for pre-computed values
  tipoMedidaLabels: Record<TipoMedida, string> = {
    [TipoMedida.UNIDAD]: 'Unidad',
    [TipoMedida.PAQUETE]: 'Paquete',
    [TipoMedida.GRAMO]: 'Gramo',
    [TipoMedida.LITRO]: 'Litro'
  };

  // Add TipoCodigo to make it available in the template
  TipoCodigo = TipoCodigo;

  // Add these properties after the existing properties
  selectedReceta: Receta | null = null;
  recipeTotalCost = 0;
  recipeCostPerUnit = 0;
  recipeSuggestedPrice = 0;
  defaultMonedaSimbolo = '$';

  expandedPresentacion: Presentacion | null = null;
  presentacionSabores: { [presentacionId: number]: PresentacionSaborViewModel[] } = {};
  loadingSabores = false;
  loadingCodigos = false;

  // Track produto adicionales for each presentacion
  presentacionAdicionales: { [presentacionId: number]: ProductoAdicional[] } = {};
  loadingAdicionales = false;

  // Track presentacion sabor for each presentacion
  presentacionSabor: { [presentacionId: number]: PresentacionSaborViewModel[] } = {};
  loadingPresentacionSabor = false; 

  /**
   * Load sabor data asynchronously
   */
  public saborCache: { [saborId: number]: string } = {};

  // Add a property for selected recipe and filtered variations
  selectedRecetaModel: RecetaViewModel | null = null;
  filteredVariaciones: Observable<RecetaVariacion[]> = of([]);
  variaciones: RecetaVariacion[] = [];

  // Track the selected presentacion tab
  selectedPresentacionIndex = 0;

  // Track the tab group
  @ViewChild('tabGroup') tabGroup!: MatTabGroup;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private tabsService: TabsService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute
  ) {
    // Initialize the form with default values
    this.productoForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.maxLength(255)]],
      nombreAlternativo: ['', Validators.maxLength(255)],
      categoriaId: [null, Validators.required],
      subcategoriaId: [null, Validators.required],
      iva: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
      isPesable: [false],
      isCombo: [false],
      isCompuesto: [false],
      isIngrediente: [false],
      isPromocion: [false],
      isVendible: [true],
      hasVencimiento: [false],
      hasStock: [false],
      hasVariaciones: [true],
      alertarVencimientoDias: [{ value: null, disabled: true }],
      observacion: [''],
      activo: [true],
      // Default presentacion fields
      defaultPresentacionTipoMedida: [TipoMedida.UNIDAD],
      defaultPresentacionCantidad: [1, [Validators.required, Validators.min(0.01)]],
      defaultPresentacionTipoCodigo: [TipoCodigo.MANUAL],
      defaultPresentacionCodigo: [''],
      // Recipe fields
      recetaSearch: [''],
      recetaId: [null],
      variacionId: [null]
    });
  }

  ngOnInit(): void {
    // Load initial data
    this.loadCategorias();
    this.loadRecetas();
    this.loadMonedas();

    // Setup form listeners
    this.setupFormControlListeners();

    // Initialize form data from input if available
    if (this.data) {
      this.setData(this.data);
    }

    // Setup autocomplete for recetas
    this.setupRecetaAutocomplete();
  }

  ngAfterViewInit(): void {
    // Any post-render setup can go here
    this.cdr.detectChanges();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && changes['data'].currentValue) {
      this.setData(changes['data'].currentValue);
    }
  }

  private setupRecetaAutocomplete(): void {
    this.filteredRecetas = this.productoForm.get('recetaSearch')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        if (typeof value === 'string') {
          return this.searchRecetas(value);
        } else {
          return of([]);
        }
      })
    );
  }

  displayRecetaFn(receta: RecetaViewModel | string): string {
    if (receta && typeof receta === 'object') {
      return receta.displayText;
    }
    return '';
  }

  onRecetaSelected(event: any): void {
    this.selectedRecetaModel = event.option.value;
    if (this.selectedRecetaModel) {
      this.loadRecipeDetails(this.selectedRecetaModel.id);
      this.loadRecipeVariations(this.selectedRecetaModel.id);
    }
  }

  clearRecetaSelection(): void {
    this.selectedRecetaModel = null;
    this.variaciones = [];
    this.recipeTotalCost = 0;
    this.recipeSuggestedPrice = 0;
    this.productoForm.get('recetaSearch')!.setValue('');
    this.productoForm.get('recetaId')!.setValue(null);
    this.productoForm.get('variacionId')!.setValue(null);
  }

  async loadPresentacionCodigos(presentacionId: number): Promise<void> {
    this.loadingCodigos = true;
    try {
      const codigos = await firstValueFrom(this.repositoryService.getCodigosByPresentacion(presentacionId));
      this.presentacionCodigos[presentacionId] = codigos;
      console.log('presentacionCodigos', this.presentacionCodigos[presentacionId]);
    } catch (error) {
      console.error('Error loading codigos:', error);
      this.snackBar.open('Error al cargar los códigos', 'Cerrar', { duration: 3000 });
    } finally {
      this.loadingCodigos = false;
      this.cdr.detectChanges();
    }
  }

  addPresentacionCodigo(presentacion: Presentacion): void {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.width = '600px';
    dialogConfig.data = {
      presentacion: presentacion,
      productoId: this.producto!.id,
      productoNombre: this.producto!.nombre
    };

    const dialogRef = this.dialog.open(CreateEditCodigoComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(result => {
      this.loadPresentacionCodigos(presentacion.id!);
    });
  }

  editPresentacionCodigo(codigo: Codigo): void {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.width = '600px';
    dialogConfig.data = {
      codigo,
      productoId: this.producto!.id,
      productoNombre: this.producto!.nombre
    };

    const dialogRef = this.dialog.open(CreateEditCodigoComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadPresentacionCodigos(codigo.presentacionId);
      }
    });
  }

  async deletePresentacionCodigo(codigo: Codigo): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: {
        title: 'Confirmar eliminación',
        message: '¿Está seguro que desea eliminar este código?',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar'
      }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          await firstValueFrom(this.repositoryService.deleteCodigo(codigo.id!));
          this.snackBar.open('Código eliminado correctamente', 'Cerrar', { duration: 3000 });
          this.loadPresentacionCodigos(codigo.presentacionId);
        } catch (error) {
          console.error('Error deleting codigo:', error);
          this.snackBar.open('Error al eliminar el código', 'Cerrar', { duration: 3000 });
        }
      }
    });
  }

  onTabChange(index: number): void {
    this.selectedPresentacionIndex = index;

    if (this.producto && this.producto.presentaciones && this.producto.presentaciones[index]) {
      const presentacion: PresentacionViewModel = this.producto.presentaciones[index];

      // Load data for the selected presentacion tab
      if (presentacion.id) {
        this.loadDefaultPresentacionPrecios(presentacion.id);
        this.loadPresentacionCodigos(presentacion.id);

        if (presentacion.recetaId) {
          this.loadRecipeDetails(presentacion.recetaId);
        }
      }
    }
  }

  async loadCategorias(): Promise<void> {
    this.isLoading = true;
    try {
      this.categorias = await firstValueFrom(this.repositoryService.getCategorias());
      // Sort categorias by nombre
      this.categorias.sort((a, b) => a.nombre.localeCompare(b.nombre));
    } catch (error) {
      console.error('Error loading categorias:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadSubcategoriasByCategoria(categoriaId: number): Promise<void> {
    try {
      this.subcategorias = await firstValueFrom(this.repositoryService.getSubcategoriasByCategoria(categoriaId));
      // Sort subcategorias by nombre
      this.subcategorias.sort((a, b) => a.nombre.localeCompare(b.nombre));
    } catch (error) {
      console.error('Error loading subcategorias:', error);
    }
  }

  async loadRecetas(): Promise<void> {
    try {
      this.recetas = await firstValueFrom(this.repositoryService.getRecetas());
    } catch (error) {
      console.error('Error loading recetas:', error);
    }
  }

  private searchRecetas(value: string): Observable<RecetaViewModel[]> {
    if (!value || typeof value !== 'string') {
      return of([]);
    }
    const filterValue = value.toLowerCase();
    const filteredRecetas = this.recetas
      .filter(receta => receta.nombre.toLowerCase().includes(filterValue))
      .map(receta => this.transformReceta(receta));
    return of(filteredRecetas);
  }

  private transformReceta(receta: Receta): RecetaViewModel {
    const cantidadText = receta.cantidad ? `(${receta.cantidad} ${receta.tipoMedida})` : '';
    return {
      id: receta.id,
      nombre: receta.nombre,
      tipoMedida: receta.tipoMedida,
      cantidad: receta.cantidad || 0,
      displayText: `${receta.nombre} ${cantidadText}`,
      optionText: `${receta.id} - ${receta.nombre} ${cantidadText}`
    };
  }

  async loadRecipeDetails(recetaId: number): Promise<void> {
    try {
      const receta = await firstValueFrom(this.repositoryService.getReceta(recetaId));
      this.selectedReceta = receta;
      const recetaItems = await firstValueFrom(this.repositoryService.getRecetaItems(recetaId));
      if (recetaItems.length > 0) {
        const ingredientIds = recetaItems.map(item => item.ingredienteId);
        const ingredients: any[] = [];
        for (const id of ingredientIds) {
          try {
            const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(id));
            ingredients.push(ingrediente);
          } catch (error) {
            console.error(`Error loading ingredient ${id}:`, error);
          }
        }
        let totalCost = 0;
        for (const item of recetaItems) {
          const ingredient = ingredients.find(i => i.id === item.ingredienteId);
          if (ingredient) {
            totalCost += (ingredient.costo || 0) * (item.cantidad || 0);
          }
        }
        this.recipeTotalCost = totalCost;
        this.recipeCostPerUnit = this.recipeTotalCost;
        this.recipeSuggestedPrice = this.recipeCostPerUnit > 0 ? this.recipeCostPerUnit / 0.35 : 0;
      } else {
        this.recipeTotalCost = 0;
        this.recipeCostPerUnit = 0;
        this.recipeSuggestedPrice = 0;
      }
    } catch (error) {
      console.error('Error loading recipe details:', error);
      this.snackBar.open('Error al cargar detalles de la receta', 'Cerrar', { duration: 3000 });
    }
  }

  async loadRecipeVariations(recetaId: number): Promise<void> {
    if (!recetaId) return;
    try {
      this.isLoading = true;
      this.variaciones = await firstValueFrom(this.repositoryService.getRecetaVariaciones(recetaId));
      const variacionIdControl = this.productoForm.get('variacionId');
      if (variacionIdControl) {
        if (this.variaciones.length > 0) {
          variacionIdControl.enable();
          const principalVariation = this.variaciones.find(v => v.principal);
          if (principalVariation) {
            variacionIdControl.setValue(principalVariation.id);
          } else if (this.variaciones.length > 0) {
            variacionIdControl.setValue(this.variaciones[0].id);
          }
        } else {
          variacionIdControl.disable();
          variacionIdControl.setValue(null);
        }
      }
    } catch (error) {
      console.error('Error loading recipe variations:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadMonedas(): Promise<void> {
    try {
      const monedas = await firstValueFrom(this.repositoryService.getMonedas());
      const defaultMoneda = monedas.find(m => m.principal);
      if (defaultMoneda) {
        this.defaultMonedaSimbolo = defaultMoneda.simbolo;
      }
    } catch (error) {
      console.error('Error loading monedas:', error);
    }
  }

  private setupFormControlListeners(): void {
    this.productoForm.get('hasVencimiento')?.valueChanges.subscribe(hasVencimiento => {
      const alertarVencimientoDiasControl = this.productoForm.get('alertarVencimientoDias');
      if (alertarVencimientoDiasControl) {
        if (hasVencimiento) {
          alertarVencimientoDiasControl.enable();
          alertarVencimientoDiasControl.setValue(30);
        } else {
          alertarVencimientoDiasControl.disable();
          alertarVencimientoDiasControl.setValue(null);
        }
      }
    });

    this.productoForm.get('isCompuesto')?.valueChanges.subscribe(isCompuesto => {
      const hasVariaciones = this.productoForm.get('hasVariaciones')?.value || false;
      const recetaIdControl = this.productoForm.get('recetaId');
      const recetaSearchControl = this.productoForm.get('recetaSearch');
      const variacionIdControl = this.productoForm.get('variacionId');
      if(isCompuesto){
        console.log('isCompuesto', isCompuesto);
        recetaIdControl?.enable();
        recetaSearchControl?.enable();
      } else {
        recetaIdControl?.disable();
        recetaSearchControl?.disable();
      }
      // if (recetaIdControl && recetaSearchControl && variacionIdControl) {
      //   if (isCompuesto && !hasVariaciones) {
      //     recetaIdControl.enable();
      //     recetaSearchControl.enable();
      //   } else {
      //     recetaIdControl.disable();
      //     recetaIdControl.setValue(null);
      //     recetaSearchControl.disable();
      //     recetaSearchControl.setValue(null);
      //     variacionIdControl.disable();
      //   }
      // }
    });

    this.productoForm.get('hasVariaciones')?.valueChanges.subscribe(hasVariaciones => {
      if (this.isEditing && this.producto?.id && !hasVariaciones && this.producto.presentaciones && this.producto.presentaciones.length > 1) {
        const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
          width: '450px',
          data: {
            title: 'Confirmar cambio',
            message: 'Este producto tiene múltiples presentaciones. Al desactivar "Posee variaciones", solo se mantendrá la presentación principal. ¿Desea continuar?'
          }
        });
        dialogRef.afterClosed().subscribe(result => {
          if (!result) {
            this.productoForm.get('hasVariaciones')?.setValue(true, { emitEvent: false });
            return;
          }
          this.updateHasVariacionesState(hasVariaciones);
        });
      } else {
        this.updateHasVariacionesState(hasVariaciones);
      }
    });

    this.productoForm.get('categoriaId')?.valueChanges.subscribe(categoriaId => {
      if (categoriaId) {
        this.loadSubcategoriasByCategoria(categoriaId);
      }
    });
  }

  private updateHasVariacionesState(hasVariaciones: boolean): void {
    const recetaIdControl = this.productoForm.get('recetaId');
    const recetaSearchControl = this.productoForm.get('recetaSearch');
    const variacionIdControl = this.productoForm.get('variacionId');
    if(this.productoForm.get('isCompuesto')?.value){
      recetaIdControl?.enable();
      recetaSearchControl?.enable();
    } else {
      recetaIdControl?.disable();
      recetaSearchControl?.disable();
    }
    // if (recetaIdControl && recetaSearchControl && variacionIdControl) {
    //   if (hasVariaciones) {
    //     recetaIdControl.disable();
    //     recetaIdControl.setValue(null);
    //     recetaSearchControl.disable();
    //     recetaSearchControl.setValue(null);
    //     variacionIdControl.disable();
    //     variacionIdControl.setValue(null);
    //   } else {
    //     const isCompuesto = this.productoForm.get('isCompuesto')?.value;
    //     if (isCompuesto) {
    //       recetaIdControl.enable();
    //       recetaSearchControl.enable();
    //     }
    //   }
    // }
    if (hasVariaciones) {
      this.defaultPresentacionPrecios = [];
    } else if (this.producto?.id && this.producto.presentaciones && this.producto.presentaciones.length > 0) {
      this.loadDefaultPresentacionPrecios(this.producto.presentaciones[0].id!);
    }
  }

  setData(data: any): void {
    if (!data) {
      return;
    }
    if (data.productoId) {
      this.isEditing = true;
      this.loadProducto(data.productoId);
    } else if (data.producto) {
      this.isEditing = true;
      this.producto = data.producto;
      this.loadProducto(data.producto.id);
    }
    if (data.categoriaId) {
      this.productoForm.get('categoriaId')?.setValue(data.categoriaId);
      this.loadSubcategoriasByCategoria(data.categoriaId);
    }
    if (data.subcategoriaId) {
      this.productoForm.get('subcategoriaId')?.setValue(data.subcategoriaId);
    }
    this.loadMainImage();
  }

  loadProducto(productoId?: number): void {
    this.isLoading = true;
    const idToLoad = productoId || (this.producto ? this.producto.id : undefined);
    if (!idToLoad) {
      this.isLoading = false;
      console.error('No producto ID to load');
      return;
    }
    this.repositoryService.getProducto(idToLoad).subscribe({
      next: (producto) => {
        if (producto) {
          this.producto = producto;
          this.isEditing = true;
          this.productoForm.patchValue({
            nombre: producto.nombre,
            nombreAlternativo: producto.nombreAlternativo || '',
            categoriaId: producto.subcategoria.categoria.id,
            subcategoriaId: producto.subcategoriaId,
            iva: producto.iva,
            isPesable: producto.isPesable,
            isCombo: producto.isCombo,
            isCompuesto: producto.isCompuesto,
            isIngrediente: producto.isIngrediente,
            isPromocion: producto.isPromocion,
            isVendible: producto.isVendible,
            hasVencimiento: producto.hasVencimiento,
            hasStock: producto.hasStock,
            hasVariaciones: producto.hasVariaciones,
            alertarVencimientoDias: producto.alertarVencimientoDias || '',
            observacion: producto.observacion || '',
            activo: producto.activo,
            recetaId: producto.recetaId || null
          });
          this.loadSubcategoriasByCategoria(producto.subcategoria.categoria.id);
          this.loadRecetas().then(() => {
            if (producto.recetaId) {
              const receta = this.recetas.find(r => r.id === producto.recetaId);
              if (receta) {
                this.selectedRecetaModel = this.transformReceta(receta);
                this.productoForm.patchValue({
                  recetaSearch: this.selectedRecetaModel
                });
                this.loadRecipeVariations(producto.recetaId);
              }
            }
          });
          this.loadProductImages();
          this.loadProductoPresentaciones(producto.id!).then(() => {
            if (!producto.hasVariaciones && this.producto?.presentaciones?.length) {
              const principalPresentacion = this.producto.presentaciones.find(p => p.principal);
              if (principalPresentacion) {
                this.productoForm.patchValue({
                  defaultPresentacionTipoMedida: principalPresentacion.tipoMedida,
                  defaultPresentacionCantidad: principalPresentacion.cantidad
                });
                if (principalPresentacion.codigos?.length) {
                  const codigo = principalPresentacion.codigos[0];
                  this.productoForm.patchValue({
                    defaultPresentacionCodigo: codigo.codigo,
                    defaultPresentacionTipoCodigo: codigo.tipoCodigo
                  });
                }
              }
            }
          });
          this.setupFormControlsBasedOnLoadedData();
        } else {
          this.snackBar.open('No se encontró el producto', 'Cerrar', { duration: 3000 });
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error loading producto:', error);
        this.snackBar.open('Error al cargar el producto', 'Cerrar', { duration: 3000 });
        this.isLoading = false;
      }
    });
  }

  private setupFormControlsBasedOnLoadedData(): void {
    const hasVencimiento = this.productoForm.get('hasVencimiento')?.value;
    const alertarVencimientoDiasControl = this.productoForm.get('alertarVencimientoDias');
    if (alertarVencimientoDiasControl) {
      if (hasVencimiento) {
        alertarVencimientoDiasControl.enable();
      } else {
        alertarVencimientoDiasControl.disable();
      }
    }
    const isCompuesto = this.productoForm.get('isCompuesto')?.value;
    const hasVariaciones = this.productoForm.get('hasVariaciones')?.value;
    const recetaIdControl = this.productoForm.get('recetaId');
    const recetaSearchControl = this.productoForm.get('recetaSearch');
    const variacionIdControl = this.productoForm.get('variacionId');
    if(isCompuesto){
      recetaIdControl?.enable();
      recetaSearchControl?.enable();
    } else {
      recetaIdControl?.disable();
      recetaSearchControl?.disable();
    }
    // if (recetaIdControl && recetaSearchControl && variacionIdControl) {
    //   if (isCompuesto && !hasVariaciones) {
    //     recetaIdControl.enable();
    //     recetaSearchControl.enable();
    //   } else {
    //     recetaIdControl.disable();
    //     recetaSearchControl.disable();
    //     variacionIdControl.disable();
    //   }
    // }
  }

  async loadProductImages(): Promise<void> {
    if (!this.producto || !this.producto.id) {
      return;
    }
    try {
      const images = await firstValueFrom(this.repositoryService.getProductImages(this.producto.id));
      this.productImages = images.map(image => ({
        id: image.id,
        imageUrl: this.getImagePath(image.imageUrl),
        isMain: image.isMain,
        orden: image.orden
      }));
      this.productImages.sort((a, b) => {
        if (a.isMain) return -1;
        if (b.isMain) return 1;
        return a.orden - b.orden;
      });
      this.cdr.detectChanges();
      this.loadMainImage();
    } catch (error) {
      console.error('Error loading product images:', error);
      this.snackBar.open('Error al cargar las imágenes del producto', 'Cerrar', { duration: 3000 });
    }
  }

  private getImagePath(imageUrl: string): string {
    if (!imageUrl) return this.defaultNoImagePath;
    if (imageUrl.startsWith('app://')) {
      return imageUrl;
    }
    return imageUrl;
  }

  loadMainImage(): void {
    const mainImage = this.productImages.find(img => img.isMain && !img.toDelete);
    this.mainImageUrl = mainImage ? mainImage.imageUrl : this.defaultNoImagePath;
  }

  async loadProductoPresentaciones(productoId: number): Promise<void> {
    try {
      const presentaciones = await firstValueFrom(this.repositoryService.getPresentacionesByProducto(productoId));
      if (this.producto) {
        const enhancedPresentaciones = presentaciones.map(p => {
          const presentacionWithLabel = { ...p };
          (presentacionWithLabel as any).tipoMedidaLabel = this.computeTipoMedidaLabel(p.tipoMedida);
          return presentacionWithLabel;
        });
        this.producto.presentaciones = enhancedPresentaciones as unknown as PresentacionViewModel[];
        for (const presentacion of this.producto.presentaciones) {
          if (presentacion.id) { // Ensure presentacion.id is not undefined
            try {
              const codigos = await firstValueFrom(this.repositoryService.getCodigosByPresentacion(presentacion.id));
              presentacion.codigos = codigos;
            } catch (error) {
              console.error(`Error loading codigos for presentacion ${presentacion.id}:`, error);
            }
            this.loadPresentacionAdicionales(presentacion.id);
            // Load precios if this is the selected tab or if hasVariaciones is false
            if (!this.producto.hasVariaciones || (this.producto.presentaciones[this.selectedPresentacionIndex] && presentacion.id === this.producto.presentaciones[this.selectedPresentacionIndex].id)) {
              this.loadDefaultPresentacionPrecios(presentacion.id);
            }
            // Load codigos if this is the selected tab
            if (this.producto.presentaciones[this.selectedPresentacionIndex] && presentacion.id === this.producto.presentaciones[this.selectedPresentacionIndex].id) {
              this.loadPresentacionCodigos(presentacion.id);
            }
          }
        }
        if (!this.producto.hasVariaciones && this.producto.presentaciones.length > 0) {
          const principalPresentacion = this.producto.presentaciones.find(p => p.principal);
          if (principalPresentacion && principalPresentacion.id) {
            this.defaultPresentacionId = principalPresentacion.id;
            await this.loadDefaultPresentacionPrecios(principalPresentacion.id);
          } else if (this.producto.presentaciones.length > 0 && this.producto.presentaciones[0].id) {
            this.defaultPresentacionId = this.producto.presentaciones[0].id;
            await this.loadDefaultPresentacionPrecios(this.producto.presentaciones[0].id);
          }
        } else {
          this.defaultPresentacionId = undefined;
          this.defaultPresentacionPrecios = [];
        }
        // Ensure the first tab's data is loaded if hasVariaciones
        if (this.producto.hasVariaciones && this.producto.presentaciones.length > 0 && this.producto.presentaciones[0].id) {
          this.onTabChange(0);
        }
      }
    } catch (error) {
      console.error('Error loading presentaciones:', error);
      this.snackBar.open('Error al cargar presentaciones', 'Cerrar', { duration: 3000 });
    }
  }

  private computeTipoMedidaLabel(tipo: TipoMedida): string {
    return this.tipoMedidaLabels[tipo] || tipo;
  }

  async loadPresentacionAdicionales(presentacionId: number): Promise<void> {
    if (this.presentacionAdicionales[presentacionId]?.length > 0) {
      return;
    }
    this.loadingAdicionales = true;
    try {
      const adicionales = await firstValueFrom(this.repositoryService.getProductosAdicionalesByPresentacion(presentacionId));
      this.presentacionAdicionales[presentacionId] = adicionales;
      for (const adicional of this.presentacionAdicionales[presentacionId]) {
        if (!adicional.adicional && adicional.adicionalId) {
          try {
            adicional.adicional = await firstValueFrom(this.repositoryService.getAdicional(adicional.adicionalId));
          } catch (error) {
            console.error(`Error loading adicional details for ID ${adicional.adicionalId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading presentacion adicionales:', error);
      this.snackBar.open('Error al cargar los adicionales de la presentación', 'Cerrar', { duration: 3000 });
    } finally {
      this.loadingAdicionales = false;
    }
  }

  async loadDefaultPresentacionPrecios(presentacionId: number): Promise<void> {
    try {
      const precios = await firstValueFrom(this.repositoryService.getPreciosVentaByPresentacion(presentacionId));
      for (const precio of precios) {
        try {
          precio.moneda = await firstValueFrom(this.repositoryService.getMoneda(precio.monedaId));
          if (precio.tipoPrecioId) {
            precio.tipoPrecio = await firstValueFrom(this.repositoryService.getTipoPrecio(precio.tipoPrecioId));
          }
        } catch (error) {
          console.error(`Error loading details for precio ${precio.id}:`, error);
        }
      }
      this.defaultPresentacionPrecios = precios;
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error loading precios for default presentacion:', error);
      this.snackBar.open('Error al cargar los precios', 'Cerrar', { duration: 3000 });
    }
  }

  editPresentacion(presentacion: PresentacionViewModel): void { // Changed Presentacion to PresentacionViewModel
    this.openPresentacionDialog(presentacion);
  }

  openPresentacionDialog(presentacion?: PresentacionViewModel): void { // Changed Presentacion to PresentacionViewModel
    if (!this.producto) {
      this.snackBar.open('Debe guardar el producto primero', 'Cerrar', { duration: 3000 });
      return;
    }
    const hasVariaciones = this.productoForm.get('hasVariaciones')?.value;
    if (!hasVariaciones && !presentacion && this.producto.presentaciones && this.producto.presentaciones.length > 0) {
      this.snackBar.open(
        'Este producto está configurado sin variaciones. Debe activar "Posee variaciones" para agregar múltiples presentaciones.',
        'Cerrar',
        { duration: 5000 }
      );
      return;
    }
    const dialogRef = this.dialog.open(CreateEditPresentacionDialogComponent, {
      width: '550px',
      disableClose: true,
      data: {
        producto: this.producto,
        presentacion: presentacion,
        editMode: !!presentacion,
        hasVariaciones: hasVariaciones
      }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result && this.producto) { // Ensure this.producto is not undefined
        this.loadProductoPresentaciones(this.producto.id!);
      }
    });
  }

  viewFullImage(image: ProductImageModel): void {
    const imageUrl = image.imageUrl || this.defaultNoImagePath;
    const dialogConfig = new MatDialogConfig();
    dialogConfig.width = '90%';
    dialogConfig.height = '85%';
    dialogConfig.maxHeight = '90vh';
    dialogConfig.panelClass = document.body.classList.contains('dark-theme')
      ? ['image-viewer-dialog', 'dark-theme']
      : 'image-viewer-dialog';
    dialogConfig.data = {
      imageUrl: imageUrl,
      title: this.productoForm.get('nombre')?.value?.toUpperCase() || 'IMAGEN DEL PRODUCTO'
    };
    const dialogRef = this.dialog.open(ImageViewerComponent, dialogConfig);
    dialogRef.disableClose = true;
  }

  restoreImage(image: ProductImageModel): void {
    const foundImage = this.productImages.find(img => img === image);
    if (foundImage) {
      foundImage.toDelete = false;
      this.cdr.markForCheck();
    }
  }

  removeCurrentImage(index: number): void {
    if (index < 0 || index >= this.productImages.length) return;
    this.productImages[index].toDelete = true;
    if (this.productImages[index].isMain) {
      const newMainImage = this.productImages.find(img => !img.toDelete);
      if (newMainImage) {
        this.setMainImageInternal(newMainImage);
      }
    }
    this.cdr.markForCheck();
  }

  setMainImage(index: number): void {
    if (index < 0 || index >= this.productImages.length) return;
    if (this.productImages[index].toDelete) return;
    this.setMainImageInternal(this.productImages[index]);
  }

  private setMainImageInternal(image: ProductImageModel): void {
    this.productImages.forEach(img => {
      img.isMain = false;
    });
    image.isMain = true;
    this.cdr.markForCheck();
  }

  openFileSelector(fromMainImage = false): void {
    if (fromMainImage) {
      this.scrollToImagesSection();
    } else {
      if (this.fileInput && this.fileInput.nativeElement) {
        this.fileInput.nativeElement.click();
      }
    }
  }

  scrollToImagesSection(): void {
    if (this.imagesSection && this.imagesSection.nativeElement) {
      this.imagesSection.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (file.size > this.maxImageSize) {
      this.snackBar.open(`El tamaño de la imagen no debe superar los ${this.maxImageSize / (1024 * 1024)}MB`, 'Cerrar', {
        duration: 3000
      });
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Por favor, seleccione un archivo de imagen válido', 'Cerrar', {
        duration: 3000
      });
      return;
    }
    this.isUploading = true;
    this.cdr.detectChanges();
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = reader.result as string;
      const newImage: ProductImageModel = {
        imageUrl,
        file,
        isMain: this.productImages.length === 0,
        orden: this.productImages.length,
        isNew: true
      };
      this.productImages.push(newImage);
      this.currentImageIndex = this.productImages.length - 1;
      this.isUploading = false;
      this.cdr.detectChanges();
    };
    reader.onerror = () => {
      this.snackBar.open('Error al cargar la imagen', 'Cerrar', { duration: 3000 });
      this.isUploading = false;
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  async deleteProducto(): Promise<void> {
    if (!this.producto || !this.producto.id) {
      this.snackBar.open('No hay producto para eliminar', 'Cerrar', { duration: 3000 });
      return;
    }
    const producto = this.producto;
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirmar Eliminación',
        message: `¿Está seguro que desea eliminar el producto "${producto.nombre}"?`
      }
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) return;
      try {
        this.isLoading = true;
        // Assuming deleteProducto handles soft delete or hard delete based on backend logic.
        await firstValueFrom(this.repositoryService.deleteProducto(producto.id!)); // Added non-null assertion
        this.isLoading = false;
        this.snackBar.open('Producto eliminado exitosamente', 'Cerrar', { duration: 3000 });
        this.goBack();
      } catch (error: any) {
        console.error('Error deleting producto:', error);
        const errorMessage = error?.message || '';
        const hasRestrictions =
          errorMessage.includes('constraint') ||
          errorMessage.includes('restrict') ||
          errorMessage.includes('reference') ||
          errorMessage.includes('FOREIGN KEY');
        if (hasRestrictions) {
          this.snackBar.open(
            'No se puede eliminar el producto debido a restricciones. Se marcará como inactivo.',
            'Cerrar',
            { duration: 5000 }
          );
          try {
            await firstValueFrom(this.repositoryService.updateProducto(producto.id!, { activo: false })); // Added non-null assertion
            if (this.producto) {
              this.producto.activo = false;
              this.productoForm.get('activo')?.setValue(false);
            }
            this.snackBar.open('Producto marcado como inactivo', 'Cerrar', { duration: 3000 });
          } catch (updateError) {
            console.error('Error setting product as inactive:', updateError);
            this.snackBar.open('Error al marcar producto como inactivo', 'Cerrar', { duration: 3000 });
          }
        } else {
          this.snackBar.open('Error al eliminar producto: ' + (error?.message || 'Error desconocido'), 'Cerrar', { duration: 3000 });
        }
        this.isLoading = false;
      }
    });
  }

  goBack(): void {
    const activeTabId = this.tabsService.getActiveTabId();
    if (activeTabId) {
      this.tabsService.removeTabById(activeTabId);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.productoForm.invalid || this.isLoading) {
      this.markFormGroupTouched(this.productoForm);
      return;
    }
    this.isLoading = true;
    this.submitted = true;
    try {
      const formValues = { ...this.productoForm.getRawValue() };
      const imagesToUpload = this.productImages.filter(img => img.file && img.isNew);
      if (imagesToUpload.length > 0) {
        await this.uploadImages();
      }
      const deletePromises = this.productImages
        .filter(img => img.toDelete && img.id)
        .map(img => firstValueFrom(this.repositoryService.deleteProductImage(img.id!)));
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
      formValues.nombre = formValues.nombre?.toUpperCase();
      formValues.nombreAlternativo = formValues.nombreAlternativo?.toUpperCase();
      formValues.observacion = formValues.observacion?.toUpperCase();

      const productData = {
        nombre: formValues.nombre,
        nombreAlternativo: formValues.nombreAlternativo,
        categoriaId: formValues.categoriaId,
        subcategoriaId: formValues.subcategoriaId,
        iva: formValues.iva,
        isPesable: formValues.isPesable,
        isCombo: formValues.isCombo,
        isCompuesto: formValues.isCompuesto,
        isIngrediente: formValues.isIngrediente,
        isPromocion: formValues.isPromocion,
        isVendible: formValues.isVendible,
        hasStock: formValues.hasStock,
        hasVencimiento: formValues.hasVencimiento,
        hasVariaciones: formValues.hasVariaciones,
        alertarVencimientoDias: formValues.hasVencimiento ? formValues.alertarVencimientoDias : null,
        // For V2, recetaId is handled per presentacion if hasVariaciones is true
        recetaId: (!formValues.hasVariaciones && formValues.isCompuesto) ? formValues.recetaId : null,
        observacion: formValues.observacion,
        activo: formValues.activo
      };

      if (this.isEditing && this.producto?.id) {
        const savedProducto = await firstValueFrom(
          this.repositoryService.updateProducto(this.producto.id, productData)
        );
        // Handle default presentacion if hasVariaciones was turned off
        if (!productData.hasVariaciones && this.producto.hasVariaciones) {
          await this.createOrUpdateDefaultPresentacion(savedProducto.id!, formValues, true);
        }
        // If hasVariaciones is false, update the existing default presentacion
        else if (!productData.hasVariaciones && this.producto.presentaciones?.length) {
          await this.createOrUpdateDefaultPresentacion(savedProducto.id!, formValues, false);
        }
        // If hasVariaciones is true, presentacion updates are handled within tabs
        this.producto = { ...this.producto, ...savedProducto };
        this.snackBar.open('Producto actualizado exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new product
        const savedProducto = await firstValueFrom(this.repositoryService.createProducto(productData));
        this.producto = savedProducto; // Assign the created product to this.producto
        // If the product doesn't have variations, create/update a default presentacion
        if (!savedProducto.hasVariaciones) {
          await this.createOrUpdateDefaultPresentacion(savedProducto.id!, formValues, true); // Create new
        }
        // Update image relationships
        if (this.productImages.length > 0) {
          const imageUpdatePromises = this.productImages
            .filter(img => !img.toDelete && img.id) // This needs to be re-evaluated, new images won't have ID yet
            .map(img =>
              firstValueFrom(this.repositoryService.updateProductImage(img.id!, { // This will fail for new images
                productoId: savedProducto.id
              }))
            );
          // Simpler: re-upload all non-deleted images associating with the new product ID
          // This part needs careful review to ensure images are correctly associated after product creation
        }

        this.isEditing = true; // Set to true as the product now exists
        this.snackBar.open('Producto creado exitosamente', 'Cerrar', { duration: 3000 });
      }

      // Common refresh logic
      if (this.producto?.id) {
        await this.loadProductImages(); // Refresh images
        await this.loadProductoPresentaciones(this.producto.id); // Refresh presentaciones
      }

    } catch (error) {
      console.error('Error saving product:', error);
      this.snackBar.open('Error al guardar el producto', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
      this.submitted = false;
    }
  }

  private async createOrUpdateDefaultPresentacion(productoId: number, formValues: any, isNewPresentacion: boolean): Promise<void> {
    const presentacionData = {
      productoId: productoId,
      // descripcion: formValues.defaultPresentacionDesc || null, // Not in V2 form
      tipoMedida: formValues.defaultPresentacionTipoMedida,
      cantidad: formValues.defaultPresentacionCantidad,
      principal: true,
      activo: true,
      // recetaId and variacionId for default presentacion if isCompuesto and !hasVariaciones
      recetaId: (!formValues.hasVariaciones && formValues.isCompuesto) ? formValues.recetaId : null,
      variacionId: (!formValues.hasVariaciones && formValues.isCompuesto && formValues.variacionId) ? formValues.variacionId : null,
    };

    let presentacion: Presentacion;

    if (isNewPresentacion || !this.producto?.presentaciones?.find(p => p.principal)) {
      presentacion = await firstValueFrom(this.repositoryService.createPresentacion(presentacionData));
    } else {
      const principalPresentacion = this.producto!.presentaciones!.find(p => p.principal);
      presentacion = await firstValueFrom(this.repositoryService.updatePresentacion(principalPresentacion!.id!, presentacionData));
    }

    this.defaultPresentacionId = presentacion.id;

    // Handle Codigo for the default presentacion
    if (formValues.defaultPresentacionCodigo) {
      const codigoData = {
        presentacionId: presentacion.id!,
        codigo: formValues.defaultPresentacionCodigo,
        tipoCodigo: formValues.defaultPresentacionTipoCodigo,
        activo: true,
        principal: true // Assuming the default codigo is principal
      };
      // Check if a codigo already exists for this presentacion to update, otherwise create
      const existingCodigo = presentacion.codigos?.find(c => c.principal); // Or some other logic to find the one to update
      if (existingCodigo) {
        await firstValueFrom(this.repositoryService.updateCodigo(existingCodigo.id!, codigoData));
      } else {
        await firstValueFrom(this.repositoryService.createCodigo(codigoData));
      }
    }
    // Refresh precios for this presentacion
    await this.loadDefaultPresentacionPrecios(presentacion.id!);
  }


  private async uploadImages(): Promise<void> {
    const uploadPromises: Promise<any>[] = [];
    for (let i = 0; i < this.productImages.length; i++) {
      const image = this.productImages[i];
      if (image.toDelete && image.id) { // Mark for deletion
        // Deletion is handled in onSubmit after product save
      } else if (image.isNew && image.file) { // Upload new
        uploadPromises.push(this.uploadAndAssociateImage(image.file, image.isMain, i));
      } else if (image.id && !image.isNew) { // Update existing (isMain, orden)
        uploadPromises.push(
          firstValueFrom(this.repositoryService.updateProductImage(image.id, {
            isMain: image.isMain,
            orden: i
            // productoId is already set
          }))
        );
      }
    }
    await Promise.all(uploadPromises);
    // After uploads/updates, reload images from server to get fresh URLs and IDs
    if (this.producto?.id) {
      await this.loadProductImages();
    }
  }

  private async uploadAndAssociateImage(file: File, isMain: boolean, orden: number): Promise<void> {
    if (!this.producto?.id) {
      console.warn("Cannot associate image without product ID. Product must be saved first.");
      // Or, store file and associate after product creation in onSubmit
      return;
    }
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `producto_${this.producto.id}_${Date.now()}_${orden}.${ext}`;
      const reader = new FileReader();
      return new Promise<void>((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64Data = reader.result as string;
            const result = await firstValueFrom(
              this.repositoryService.saveProductoImage(base64Data, fileName)
            );
            await firstValueFrom(
              this.repositoryService.createProductImage({
                productoId: this.producto!.id!,
                imageUrl: result.imageUrl,
                isMain,
                orden
              })
            );
            resolve();
          } catch (error) {
            reject(error);
          }
        };
        reader.onerror = () => reject(new Error('Error reading file'));
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  addPrecio(selectedPresentacion: Presentacion): void {
    if (!this.producto?.id || !selectedPresentacion.id) {
      this.snackBar.open('Debe guardar el producto y la presentación primero', 'Cerrar', { duration: 3000 });
      return;
    }
    const dialogRef = this.dialog.open(CreateEditPrecioVentaComponent, {
      width: '800px',
      disableClose: true,
      data: { presentacion: selectedPresentacion, recipeCost: this.recipeTotalCost, suggestedPrice: this.recipeSuggestedPrice }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadDefaultPresentacionPrecios(selectedPresentacion.id!);
      }
    });
  }

  editDefaultPresentacionPrecio(precio: PrecioVenta): void {
    if (!this.producto?.id || !this.defaultPresentacionId) {
      this.snackBar.open('Debe guardar el producto y la presentación primero', 'Cerrar', { duration: 3000 });
      return;
    }
    const presentacion = this.producto.presentaciones?.find(p => p.id === this.defaultPresentacionId);
    if (!presentacion) {
      this.snackBar.open('No se encontró la presentación principal', 'Cerrar', { duration: 3000 });
      return;
    }
    const dialogRef = this.dialog.open(CreateEditPrecioVentaComponent, {
      width: '800px',
      disableClose: true,
      data: { presentacion: presentacion, precio: precio, editMode: true, recipeCost: this.recipeTotalCost, suggestedPrice: this.recipeSuggestedPrice }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadDefaultPresentacionPrecios(this.defaultPresentacionId!);
      }
    });
  }

  async deleteDefaultPresentacionPrecio(precio: PrecioVenta): Promise<void> {
    if (!precio.id) return;
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirmar Eliminación',
        message: `¿Está seguro de eliminar este precio de ${precio.moneda?.simbolo} ${precio.valor}?`
      }
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        try {
          await firstValueFrom(this.repositoryService.deletePrecioVenta(precio.id!));
          this.snackBar.open('Precio eliminado exitosamente', 'Cerrar', { duration: 3000 });
          if (this.defaultPresentacionId) {
            this.loadDefaultPresentacionPrecios(this.defaultPresentacionId);
          }
        } catch (error) {
          console.error('Error deleting precio:', error);
          this.snackBar.open('Error al eliminar el precio', 'Cerrar', { duration: 3000 });
        }
      }
    });
  }

  getCMVColor(cmvPercentage: number): string {
    if (cmvPercentage <= 35) { // Assuming 35% is a good target
      return '#4caf50';  // Good - green
    } else if (cmvPercentage <= 45) { // Between 35% and 45%
      return '#ff9800';  // Warning - orange
    }
    return '#f44336';  // Danger - red (higher than 45%)
  }

  async addPresentacion(): Promise<void> {
    if (!this.producto?.id) {
      this.snackBar.open('Debe guardar el producto primero', 'Cerrar', { duration: 3000 });
      return;
    }
    // Create a new presentacion, with a default descripcion Presentacion {{index + 1}}
    const presentacion = {
      productoId: this.producto.id,
      descripcion: `Presentacion ${this.producto.presentaciones?.length + 1}`,
      principal: false,
      activo: true
    }
    // Create the presentacion
    const newPresentacion = await firstValueFrom(this.repositoryService.createPresentacion(presentacion));
    // Refresh the presentaciones
    await this.loadProductoPresentaciones(this.producto.id);
    // Select the new presentacion
    this.selectedPresentacionIndex = this.producto.presentaciones?.length - 1;

    // open tab for the new presentacion
    this.tabGroup.selectedIndex = this.selectedPresentacionIndex;
  }

  async addRecetaToPresentacion(selectedPresentacion: Presentacion, selectedReceta: Receta, selectedVariacion: RecetaVariacion): Promise<void> {
    // here we need to vinculate a receta and variacion to the presentacion using presentacion sabor
    // do not open dialog, just create the presentacion sabor
    const presentacionSabor = {
      presentacionId: selectedPresentacion.id,
      recetaId: selectedReceta.id,
      variacionId: selectedVariacion.id
    }
    // create the presentacion sabor
    const newPresentacionSabor = await firstValueFrom(this.repositoryService.createPresentacionSabor(presentacionSabor));
    // refresh the presentacion sabor
    await this.loadPresentacionSabor(selectedPresentacion.id);
  }

  async loadPresentacionSabor(presentacionId: number): Promise<void> {
    const presentacionSabor = await firstValueFrom(this.repositoryService.getPresentacionSabor(presentacionId));
    this.presentacionSabores[presentacionId] = presentacionSabor;
  }
} 