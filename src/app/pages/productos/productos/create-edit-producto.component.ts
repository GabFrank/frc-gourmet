import { Component, Inject, OnInit, ViewChild, ElementRef, ChangeDetectorRef, Input, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { MatTabsModule } from '@angular/material/tabs';
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
import { TipoCodigo } from '../../../database/entities/productos/codigo.entity';
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
}

// Add this interface right after
interface PresentacionSaborViewModel extends PresentacionSabor {
  costoTotal?: number;
  precioVenta?: number;
  moneda?: Moneda;
  codigoBarras?: string;
  stock?: number;
}

// 1. First, add the RecetaViewModel interface after the existing interfaces
interface RecetaViewModel {
  id: number;
  nombre: string;
  tipoMedida: string;
  cantidad: number;
  displayText: string;  // For display in the input when selected
  optionText: string;   // Name with ID for option display
}

@Component({
  selector: 'app-create-edit-producto',
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
    CreateEditCodigoComponent,
    CreateEditPrecioVentaComponent,
    CreateEditSaboresComponent,
    ConfirmationDialogComponent
  ],
  templateUrl: './create-edit-producto.component.html',
  styleUrls: ['./create-edit-producto.component.scss'],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', visibility: 'hidden' })),
      state('expanded', style({ height: '*', visibility: 'visible' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class CreateEditProductoComponent implements OnInit, OnChanges, AfterViewInit {
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

  // Presentaciones tab columns
  presentacionesDisplayedColumns: string[] = [
    'descripcion',
    'tipoMedida',
    'cantidad',
    'principal',
    'activo',
    'acciones'
  ];

  // Properties for the precios table
  preciosDisplayedColumns: string[] = ['moneda', 'valor', 'cmv', 'tipoPrecio', 'principal', 'activo', 'acciones'];
  defaultPresentacionPrecios: PrecioVenta[] = [];
  defaultPresentacionId?: number;

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

  // Columns for the sabores expanded table
  saboresDisplayedColumns: string[] = [
    'nombre',
    'receta',
    'variacion',
    'costo',
    'precio',
    'cmv',
    'activo',
    'acciones'
  ];

  // Columns for the adicionales table
  adicionalesDisplayedColumns: string[] = [
    'nombre',
    'ingrediente',
    'cantidad',
    'precioVentaUnitario',
    'activo',
    'acciones'
  ];

  // Track producto adicionales for each presentacion
  presentacionAdicionales: { [presentacionId: number]: ProductoAdicional[] } = {};
  loadingAdicionales = false;

  /**
   * Load sabor data asynchronously
   */
  public saborCache: { [saborId: number]: string } = {};

  // 2. Add a property for selected recipe and filtered variations
  selectedRecetaModel: RecetaViewModel | null = null;
  filteredVariaciones: Observable<RecetaVariacion[]> = of([]);
  variaciones: RecetaVariacion[] = [];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private tabsService: TabsService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
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
      hasVariaciones: [false],
      alertarVencimientoDias: [{ value: null, disabled: true }],
      observacion: [''],
      activo: [true],
      recetaId: [{ value: null, disabled: true }],
      recetaSearch: [{ value: null, disabled: true }], // Add new recetaSearch control
      variacionId: [{ value: null, disabled: true }], // Add new variacionId control
      // Default presentacion form controls
      defaultPresentacionDesc: [''], // Kept for data model but not shown in UI
      defaultPresentacionTipoMedida: ['UNIDAD'],
      defaultPresentacionCantidad: [1],
      defaultPresentacionCodigo: [''],
      defaultPresentacionTipoCodigo: [TipoCodigo.MANUAL]
    });
  }

  ngOnInit(): void {
    this.loadCategorias();
    this.loadMonedas();
    this.loadRecetas();  // Load recipes

    // Initialize from input data if provided
    if (this.data) {
      this.setData(this.data);
    }

    // Setup listeners
    this.setupFormControlListeners();

    // Setup recipe search autocomplete
    this.filteredRecetas = this.productoForm.get('recetaSearch')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        if (typeof value === 'object' && value !== null) {
          return of([value as RecetaViewModel]);
        }
        return this.filterRecetas(value as string);
      })
    );

    // Setup variation filtering
    this.filteredVariaciones = this.productoForm.get('variacionId')!.valueChanges.pipe(
      startWith(null),
      map(variacionId => {
        const recetaId = this.productoForm.get('recetaId')?.value;
        if (!recetaId) return [];
        return this.variaciones.filter(v => v.recetaId === recetaId);
      })
    );
  }

  ngAfterViewInit(): void {
    // Only process data in AfterViewInit if it wasn't processed in ngOnInit
    if (this.data && !this.dataProcessed) {
      this.setData(this.data);
      this.dataProcessed = true;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Only process if data is new (not just the same reference)
    if (changes['data'] &&
        changes['data'].currentValue &&
        changes['data'].currentValue !== changes['data'].previousValue &&
        !this.dataProcessed) {
      this.setData(changes['data'].currentValue);
      this.dataProcessed = true;
    }
  }

  // Used to set data from tab service
  setData(data: any): void {
    // If no data provided, return (new product mode)
    if (!data) {
      return;
    }

    // Check if we have product data for editing
    if (data.productoId) {
      this.isEditing = true;
      this.loadProducto(data.productoId);
    } else if (data.producto) {
      this.isEditing = true;
      this.producto = data.producto;
      this.loadProducto(data.producto.id);
    }

    // Pre-select category if provided
    if (data.categoriaId) {
      this.productoForm.get('categoriaId')?.setValue(data.categoriaId);
      this.loadSubcategoriasByCategoria(data.categoriaId);
    }

    // Pre-select subcategory if provided
    if (data.subcategoriaId) {
      this.productoForm.get('subcategoriaId')?.setValue(data.subcategoriaId);
    }

    // load the main image
    this.loadMainImage();
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
      console.log('subcategorias', this.subcategorias);
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

  /**
   * Filter recetas for autocomplete
   */
  private filterRecetas(value: string): Observable<RecetaViewModel[]> {
    if (!value || typeof value !== 'string') {
      return of([]);
    }

    const filterValue = value.toLowerCase();

    // Filter recetas
    const filteredRecetas = this.recetas
      .filter(receta => receta.nombre.toLowerCase().includes(filterValue))
      .map(receta => this.transformReceta(receta));

    return of(filteredRecetas);
  }

  /**
   * Displays the recipe name in the autocomplete
   */
  displayRecetaFn(receta: RecetaViewModel | string): string {
    if (!receta) return '';

    if (typeof receta === 'object') {
      return receta.displayText;
    }

    // If it's just an ID
    const recetaById = this.recetas.find(r => r.id === +receta);
    return recetaById ? recetaById.nombre : '';
  }

  loadProducto(productoId?: number): void {
    this.isLoading = true;

    // If we have a specific ID, use that, otherwise use the producto's ID
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

          // Populate the form
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

          // Load subcategories for the selected category
          this.loadSubcategoriasByCategoria(producto.subcategoria.categoria.id);

          // Load recipes
          this.loadRecetas().then(() => {
            // If product has a recipe, load it
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

          // Load product images
          this.loadProductImages();

          // Load presentations
          this.loadProductoPresentaciones(producto.id).then(() => {
            // After presentations are loaded, if hasVariaciones is false, populate default presentacion form
            if (!producto.hasVariaciones && this.producto?.presentaciones?.length) {
              // Find the principal presentacion
              const principalPresentacion = this.producto.presentaciones.find(p => p.principal);

              // If principal presentacion exists, use its data
              if (principalPresentacion) {
                this.productoForm.patchValue({
                  defaultPresentacionDesc: principalPresentacion.descripcion || '',
                  defaultPresentacionTipoMedida: principalPresentacion.tipoMedida,
                  defaultPresentacionCantidad: principalPresentacion.cantidad
                });

                // If presentacion has codigos, use the first one
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

          // Setup form controls based on loaded data
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

  /**
   * Setup form control change listeners
   */
  private setupFormControlListeners(): void {
    // Handle vencimiento checkbox
    this.productoForm.get('hasVencimiento')?.valueChanges.subscribe(hasVencimiento => {
      const alertarVencimientoDiasControl = this.productoForm.get('alertarVencimientoDias');
      if (alertarVencimientoDiasControl) {
        if (hasVencimiento) {
          alertarVencimientoDiasControl.enable();
          alertarVencimientoDiasControl.setValue(30); // Default value
        } else {
          alertarVencimientoDiasControl.disable();
          alertarVencimientoDiasControl.setValue(null);
        }
      }
    });

    // Handle isCompuesto toggling
    this.productoForm.get('isCompuesto')?.valueChanges.subscribe(isCompuesto => {
      // Control recetaId based on isCompuesto value
      const hasVariaciones = this.productoForm.get('hasVariaciones')?.value || false;
      const recetaIdControl = this.productoForm.get('recetaId');
      const recetaSearchControl = this.productoForm.get('recetaSearch');
      const variacionIdControl = this.productoForm.get('variacionId');

      if (recetaIdControl && recetaSearchControl && variacionIdControl) {
        if (isCompuesto && !hasVariaciones) {
          // Only enable if hasVariaciones is false
          recetaIdControl.enable();
          recetaSearchControl.enable();
        } else {
          recetaIdControl.disable();
          recetaIdControl.setValue(null);
          recetaSearchControl.disable();
          recetaSearchControl.setValue(null);
          variacionIdControl.disable();
        }
      }
    });

    // Handle hasVariaciones changes
    this.productoForm.get('hasVariaciones')?.valueChanges.subscribe(hasVariaciones => {
      // If editing a product and hasVariaciones is toggled off, show a confirmation dialog
      if (this.isEditing && this.producto?.id && !hasVariaciones && this.producto.presentaciones?.length > 1) {
        const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
          width: '450px',
          data: {
            title: 'Confirmar cambio',
            message: 'Este producto tiene múltiples presentaciones. Al desactivar "Posee variaciones", solo se mantendrá la presentación principal. ¿Desea continuar?'
          }
        });

        dialogRef.afterClosed().subscribe(result => {
          if (!result) {
            // User canceled, revert the change
            this.productoForm.get('hasVariaciones')?.setValue(true, { emitEvent: false });
            return;
          }
          this.updateHasVariacionesState(hasVariaciones);
        });
      } else {
        this.updateHasVariacionesState(hasVariaciones);
      }
    });

    // Add listener for recetaId changes to load recipe details
    this.productoForm.get('recetaId')?.valueChanges.subscribe(recetaId => {
      if (recetaId) {
        // Recipe details are now loaded in loadRecipeVariations
        // which is called when a recipe is selected from the autocomplete
      }
    });

    // add listener for categoriaId changes to load subcategorias
    this.productoForm.get('categoriaId')?.valueChanges.subscribe(categoriaId => {
      if (categoriaId) {
        this.loadSubcategoriasByCategoria(categoriaId);
      }
    });
  }

  // Helper method to update state when hasVariaciones changes
  private updateHasVariacionesState(hasVariaciones: boolean): void {
    // Handle recetaId field - disable it when hasVariaciones is true
    const recetaIdControl = this.productoForm.get('recetaId');
    const recetaSearchControl = this.productoForm.get('recetaSearch');
    const variacionIdControl = this.productoForm.get('variacionId');

    if (recetaIdControl && recetaSearchControl && variacionIdControl) {
      if (hasVariaciones) {
        recetaIdControl.disable();
        recetaIdControl.setValue(null);
        recetaSearchControl.disable();
        recetaSearchControl.setValue(null);
        variacionIdControl.disable();
        variacionIdControl.setValue(null);
      } else {
        // Only enable if isCompuesto is true
        const isCompuesto = this.productoForm.get('isCompuesto')?.value;
        if (isCompuesto) {
          recetaIdControl.enable();
          recetaSearchControl.enable();
        }
      }
    }

    // Clear or update precios based on hasVariaciones value
    if (hasVariaciones) {
      // If switching to hasVariaciones=true, clear default presentacion precios
      this.defaultPresentacionPrecios = [];
    } else if (this.producto?.id && this.producto.presentaciones && this.producto.presentaciones.length > 0) {
      // If switching to hasVariaciones=false, load the default presentacion precios
      this.loadDefaultPresentacionPrecios(this.producto.presentaciones[0].id);
    }
  }

  async loadProductImages(): Promise<void> {
    if (!this.producto || !this.producto.id) {
      return;
    }

    try {
      const images = await firstValueFrom(this.repositoryService.getProductImages(this.producto.id));

      // Map the images to the ProductImageModel format used by the component
      this.productImages = images.map(image => ({
        id: image.id,
        imageUrl: this.getImagePath(image.imageUrl),
        isMain: image.isMain,
        orden: image.orden
      }));

      // Sort by order and ensure main image is first
      this.productImages.sort((a, b) => {
        if (a.isMain) return -1;
        if (b.isMain) return 1;
        return a.orden - b.orden;
      });

      this.cdr.detectChanges(); // Ensure UI updates
      this.loadMainImage();
    } catch (error) {
      console.error('Error loading product images:', error);
      this.snackBar.open('Error al cargar las imágenes del producto', 'Cerrar', { duration: 3000 });
    }
  }

  // Helper method to convert image URLs to proper format
  private getImagePath(imageUrl: string): string {
    if (!imageUrl) return this.defaultNoImagePath;

    // For app:// protocol URLs, just use the URL directly - they will be handled by our protocol handler
    if (imageUrl.startsWith('app://')) {
      // Return as is - Electron will handle it through the protocol handler
      return imageUrl;
    }

    return imageUrl;
  }

  // Methods for image handling
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];

    // Validate file size
    if (file.size > this.maxImageSize) {
      this.snackBar.open(`El tamaño de la imagen no debe superar los ${this.maxImageSize / (1024 * 1024)}MB`, 'Cerrar', {
        duration: 3000
      });
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Por favor, seleccione un archivo de imagen válido', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    // Set uploading flag
    this.isUploading = true;
    // Make sure UI updates
    this.cdr.detectChanges();

    // Create preview
    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = reader.result as string;

      // Add to product images
      const newImage: ProductImageModel = {
        imageUrl,
        file,
        isMain: this.productImages.length === 0, // Make it main if it's the first image
        orden: this.productImages.length,
        isNew: true
      };

      this.productImages.push(newImage);
      this.currentImageIndex = this.productImages.length - 1;

      // Turn off uploading flag
      this.isUploading = false;

      // Force change detection to update the UI
      this.cdr.detectChanges();
    };

    reader.onerror = () => {
      this.snackBar.open('Error al cargar la imagen', 'Cerrar', { duration: 3000 });
      this.isUploading = false;
      this.cdr.detectChanges();
    };

    reader.readAsDataURL(file);

    // Reset input so the same file can be selected again
    input.value = '';
  }

  // Opens the file selector dialog or scrolls to the images section based on the source
  openFileSelector(fromMainImage = false): void {
    if (fromMainImage) {
      // If called from the main image preview, scroll to the images section
      this.scrollToImagesSection();
    } else {
      // Otherwise, open the file selector
    if (this.fileInput && this.fileInput.nativeElement) {
      this.fileInput.nativeElement.click();
      }
    }
  }

  // Scrolls to the images section
  scrollToImagesSection(): void {
    if (this.imagesSection && this.imagesSection.nativeElement) {
      this.imagesSection.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Marks the current image for deletion.
   * @param index Index of the image to mark for deletion
   */
  removeCurrentImage(index: number): void {
    if (index < 0 || index >= this.productImages.length) return;

    // Mark the image for deletion instead of removing it from the array
    this.productImages[index].toDelete = true;

    // If the deleted image was the main image, set a new main image
    if (this.productImages[index].isMain) {
      // Find the first non-deleted image to be the new main
      const newMainImage = this.productImages.find(img => !img.toDelete);
      if (newMainImage) {
        this.setMainImageInternal(newMainImage);
      }
    }

    // Notify UI of changes
    this.cdr.markForCheck();
  }

  /**
   * Checks if there are any images marked for deletion.
   * @returns true if any images are marked for deletion
   */
  hasPendingImageDeletions(): boolean {
    return this.productImages.some(image => image.toDelete);
  }

  /**
   * Restores an image that was marked for deletion.
   * @param image The image to restore
   */
  restoreImage(image: ProductImageModel): void {
    const foundImage = this.productImages.find(img => img === image);
    if (foundImage) {
      foundImage.toDelete = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Sets the specified image as the main image.
   * @param index The index of the image to set as main
   */
  setMainImage(index: number): void {
    if (index < 0 || index >= this.productImages.length) return;
    if (this.productImages[index].toDelete) return; // Don't set deleted images as main

    this.setMainImageInternal(this.productImages[index]);
  }

  /**
   * Sets the specified image as the main image.
   * @param image The image to set as main
   */
  private setMainImageInternal(image: ProductImageModel): void {
    // Reset all images
    this.productImages.forEach(img => {
      img.isMain = false;
    });

    // Set the selected image as main
    image.isMain = true;
    this.cdr.markForCheck();
  }

  /**
   * Gets the current image to display.
   * @returns The current image or null if none available
   */
  getCurrentImage(): ProductImageModel | null {
    if (!this.productImages.length || this.currentImageIndex < 0 || this.currentImageIndex >= this.productImages.length) {
      return null;
    }

    // Get image at current index
    const currentImage = this.productImages[this.currentImageIndex];

    // If current image is marked for deletion, find first non-deleted image
    if (currentImage.toDelete) {
      const visibleImage = this.productImages.find(image => !image.toDelete);
      return visibleImage || null;
    }

    return currentImage;
  }

  private async uploadImages(): Promise<void> {
    // Process each image
    const uploadPromises: Promise<any>[] = [];
    const mainImageIndex = this.productImages.findIndex(img => img.isMain);

    // Handle new images first
    for (let i = 0; i < this.productImages.length; i++) {
      const image = this.productImages[i];

      // Skip images marked for deletion
      if (image.toDelete) continue;

      // Upload new images
      if (image.isNew && image.file) {
        uploadPromises.push(this.uploadImage(image.file, i === mainImageIndex));
      } else if (image.id) {
        // Update existing images (just the isMain flag and order)
        uploadPromises.push(
          firstValueFrom(this.repositoryService.updateProductImage(image.id, {
            isMain: image.isMain,
            orden: i
          }))
        );
      }
    }

    // Delete images marked for deletion
    for (const image of this.productImages.filter(img => img.toDelete && img.id)) {
      uploadPromises.push(firstValueFrom(this.repositoryService.deleteProductImage(image.id!)));
    }

    await Promise.all(uploadPromises);
  }

  private async uploadImage(file: File, isMain = false): Promise<string> {
    try {
      // Generate a unique filename
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `producto_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;

      // Read file as data URL
      const reader = new FileReader();
      return new Promise<string>((resolve, reject) => {
        reader.onload = async () => {
          try {
            const base64Data = reader.result as string;
            const result = await firstValueFrom(
              this.repositoryService.saveProductoImage(base64Data, fileName)
            );

            // Get the properly formatted image path
            const imageUrl = this.getImagePath(result.imageUrl);

            // If this is editing mode and the product ID exists, save the image association
            if (this.isEditing && this.producto?.id) {
              await firstValueFrom(
                this.repositoryService.createProductImage({
                  productoId: this.producto.id,
                  imageUrl: result.imageUrl, // Save the original URL to the database
                  isMain,
                  orden: this.productImages.findIndex(img => img.file === file)
                })
              );
            }

            resolve(imageUrl);
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

  /**
   * Handle form submission
   */
  async onSubmit(): Promise<void> {
    if (this.productoForm.invalid || this.isLoading) {
      // Mark all controls as touched to show validation errors
      this.markFormGroupTouched(this.productoForm);
      return;
    }

    this.isLoading = true;
    this.submitted = true;

    try {
      // Prepare form values
      const formValues = { ...this.productoForm.getRawValue() };

      // Select only actual image files for upload
      const imagesToUpload = this.productImages.filter(img => img.file && img.isNew);

      // Upload new images first
      if (imagesToUpload.length > 0) {
        await this.uploadImages();
      }

      // Handle image deletions
      const deletePromises = this.productImages
        .filter(img => img.toDelete && img.id)
        .map(img => firstValueFrom(this.repositoryService.deleteProductImage(img.id!)));

      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
      //set nombre, nombreAlternativo, observacion to uppercase
      formValues.nombre = formValues.nombre?.toUpperCase();
      formValues.nombreAlternativo = formValues.nombreAlternativo?.toUpperCase();
      formValues.observacion = formValues.observacion?.toUpperCase();
      if (this.isEditing && this.producto?.id) {
        // Update existing product
        const updatedProductData = {
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
          recetaId: formValues.isCompuesto ? formValues.recetaId : null,
          observacion: formValues.observacion,
          activo: formValues.activo
        };

        // Update the product
        const savedProducto = await firstValueFrom(
          this.repositoryService.updateProducto(this.producto.id, updatedProductData)
        );

        // If there was a change from hasVariaciones=true to false, we need to create a default presentacion
        if (!updatedProductData.hasVariaciones && this.producto.hasVariaciones) {
          await this.createDefaultPresentacion(savedProducto.id, formValues);
        } 
        // If the product already had no variations, update the principal presentacion with the form values
        else if (!updatedProductData.hasVariaciones && !this.producto.hasVariaciones && this.producto.presentaciones?.length) {
          // Find the principal presentacion
          const principalPresentacion = this.producto.presentaciones.find(p => p.principal);
          
          if (principalPresentacion) {
            // Update the presentacion with the form values
            await firstValueFrom(
              this.repositoryService.updatePresentacion(principalPresentacion.id, {
                descripcion: formValues.defaultPresentacionDesc || null,
                tipoMedida: formValues.defaultPresentacionTipoMedida,
                cantidad: formValues.defaultPresentacionCantidad,
                principal: true,
                activo: true
              })
            );
            
            // If presentacion has codigos, update the first one, otherwise create a new one
            if (principalPresentacion.codigos?.length && formValues.defaultPresentacionCodigo) {
              const codigo = principalPresentacion.codigos[0];
              await firstValueFrom(
                this.repositoryService.updateCodigo(codigo.id, {
                  codigo: formValues.defaultPresentacionCodigo,
                  tipoCodigo: formValues.defaultPresentacionTipoCodigo,
                  activo: true
                })
              );
            } else if (formValues.defaultPresentacionCodigo) {
              // Create a new codigo if none exists but one was provided in the form
              await firstValueFrom(
                this.repositoryService.createCodigo({
                  presentacionId: principalPresentacion.id,
                  codigo: formValues.defaultPresentacionCodigo,
                  tipoCodigo: formValues.defaultPresentacionTipoCodigo,
                  activo: true
                })
              );
            }
          }
        }

        this.producto = { ...this.producto, ...savedProducto };
        this.isLoading = false;
        this.snackBar.open('Producto actualizado exitosamente', 'Cerrar', { duration: 3000 });

        // Refresh presentaciones data
        if (this.producto?.id) {
          await this.loadProductoPresentaciones(this.producto.id);
        }

        // If we have a default presentacion, refresh precios
        if (this.defaultPresentacionId && !formValues.hasVariaciones) {
          await this.loadDefaultPresentacionPrecios(this.defaultPresentacionId);
        }
      } else {
        // Create new product
        const newProductData = {
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
          recetaId: formValues.isCompuesto ? formValues.recetaId : null,
          observacion: formValues.observacion,
          activo: formValues.activo
        };

        // Create the product
        const savedProducto = await firstValueFrom(this.repositoryService.createProducto(newProductData));

        // If the product doesn't have variations, create a default presentacion
        if (!savedProducto.hasVariaciones) {
          await this.createDefaultPresentacion(savedProducto.id, formValues);
        }

        // Update image relationships to the new product
        if (this.productImages.length > 0) {
          const imageUpdatePromises = this.productImages
            .filter(img => !img.toDelete && img.id)
            .map(img =>
              firstValueFrom(this.repositoryService.updateProductImage(img.id!, {
                productoId: savedProducto.id
              }))
            );

          if (imageUpdatePromises.length > 0) {
            await Promise.all(imageUpdatePromises);
          }
        }

        this.isEditing = true;
        this.producto = savedProducto;
        this.isLoading = false;
        this.snackBar.open('Producto creado exitosamente', 'Cerrar', { duration: 3000 });

        // Refresh presentaciones data
        if (this.producto?.id) {
          await this.loadProductoPresentaciones(this.producto.id);
        }

        // If we have a default presentacion, refresh precios
        if (this.defaultPresentacionId && !formValues.hasVariaciones) {
          await this.loadDefaultPresentacionPrecios(this.defaultPresentacionId);
        }
      }
    } catch (error) {
      console.error('Error saving product:', error);
      this.isLoading = false;
      this.snackBar.open('Error al guardar el producto', 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Creates a default presentacion for a product
   */
  private async createDefaultPresentacion(productoId: number, formValues: any): Promise<void> {
    try {
      // Create the presentacion
      const presentacion = await firstValueFrom(
        this.repositoryService.createPresentacion({
          productoId: productoId,
          descripcion: formValues.defaultPresentacionDesc || null, // Make it null if empty string
          tipoMedida: formValues.defaultPresentacionTipoMedida,
          cantidad: formValues.defaultPresentacionCantidad,
          principal: true, // Always set as principal
          activo: true
        })
      );

      // Store the default presentacion ID for precios
      this.defaultPresentacionId = presentacion.id;

      // If a codigo was provided, create it for the presentacion
      if (formValues.defaultPresentacionCodigo) {
        await firstValueFrom(
          this.repositoryService.createCodigo({
            presentacionId: presentacion.id,
            codigo: formValues.defaultPresentacionCodigo,
            tipoCodigo: formValues.defaultPresentacionTipoCodigo,
            activo: true
          })
        );
      }

      // Initialize empty precios for this presentacion
      this.defaultPresentacionPrecios = [];
    } catch (error) {
      console.error('Error creating default presentacion:', error);
      throw error;
    }
  }

  /**
   * Cancels the current operation, resets the form to empty state
   * allowing the user to create a new product
   */
  cancel(): void {
    // Reset form to default empty values
    this.productoForm.reset({
      nombre: '',
      nombreAlternativo: '',
      categoriaId: null,
      subcategoriaId: null,
      iva: 10, // Default IVA
      isPesable: false,
      isCombo: false,
      isCompuesto: false,
      isIngrediente: false,
      isPromocion: false,
      isVendible: true, // Default to true
      hasVencimiento: false,
      hasStock: false,
      hasVariaciones: false,
      alertarVencimientoDias: null,
      observacion: '',
      recetaId: null,
      recetaSearch: null,
      variacionId: null,
      // Default presentacion form controls
      defaultPresentacionDesc: '',
      defaultPresentacionTipoMedida: 'UNIDAD',
      defaultPresentacionCantidad: 1,
      defaultPresentacionCodigo: '',
      defaultPresentacionTipoCodigo: TipoCodigo.MANUAL
    });

    // Clear images
    this.productImages = [];
    this.isEditing = false;
    this.producto = undefined;
    this.selectedRecetaModel = null;
    this.variaciones = [];

    // Enable/disable appropriate form fields
    Object.keys(this.productoForm.controls).forEach(key => {
      if (key === 'alertarVencimientoDias' || key === 'recetaId' || key === 'recetaSearch' || key === 'variacionId') {
        this.productoForm.get(key)?.disable();
      } else {
        this.productoForm.get(key)?.enable();
      }
    });

    // Mark form as pristine and untouched
    this.productoForm.markAsPristine();
    this.productoForm.markAsUntouched();

    this.snackBar.open('Formulario restablecido para nuevo producto', 'Cerrar', { duration: 3000 });
  }

  /**
   * Restores the form to the original product data
   * Only works when editing an existing product
   */
  restablecer(): void {
    if (!this.isEditing || !this.producto) {
      this.snackBar.open('No hay datos originales para restablecer', 'Cerrar', { duration: 3000 });
      return;
    }

    // Load original product data
    this.loadProducto();
    this.snackBar.open('Datos del producto restablecidos', 'Cerrar', { duration: 3000 });
  }

  /**
   * Navigates back to the product list
   */
  goBack(): void {
    const activeTabId = this.tabsService.getActiveTabId();
    if (activeTabId) {
      this.tabsService.removeTabById(activeTabId);
    }
  }

  /**
   * Mark all form controls as touched to trigger validation errors display
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  /**
   * View full size image in a dialog
   */
  viewFullImage(image: ProductImageModel): void {
    // Make sure we have a valid image URL
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

    // Prevent clicks inside dialog from closing it accidentally
    dialogRef.disableClose = true;
  }

  /**
   * Navigate to the presentation prices management
   */
  navigateToPresentacionPrices(presentacion: Presentacion): void {
    // Calculate recipe cost and suggested price if not a sabor
    let recipeCost = 0;
    let suggestedPrice = 0;

    // If the product has a recipe, use its cost
    if (this.producto?.recetaId && this.selectedRecetaModel) {
      recipeCost = this.recipeCostPerUnit;
      suggestedPrice = this.recipeSuggestedPrice;
    }

    this.dialog.open(CreateEditPrecioVentaComponent, {
      width: '800px',
      maxHeight: '90vh',
      panelClass: 'no-padding-dialog',
      data: {
        presentacion,
        recipeCost,
        suggestedPrice
      }
    });
  }

  /**
   * Load product presentations and their prices
   */
  async loadProductoPresentaciones(productoId: number): Promise<void> {
    try {
      const presentaciones = await firstValueFrom(this.repositoryService.getPresentacionesByProducto(productoId));
      if (this.producto) {
        // Create enhanced presentaciones with labels
        const enhancedPresentaciones = presentaciones.map(p => {
          const presentacionWithLabel = { ...p };
          (presentacionWithLabel as any).tipoMedidaLabel = this.computeTipoMedidaLabel(p.tipoMedida);
          return presentacionWithLabel;
        });

        // Type assertion to handle the type compatibility
        this.producto.presentaciones = enhancedPresentaciones as unknown as any[];

        // Fetch codigos for each presentacion
        for (const presentacion of this.producto.presentaciones) {
          try {
            const codigos = await firstValueFrom(this.repositoryService.getCodigosByPresentacion(presentacion.id));
            presentacion.codigos = codigos;
          } catch (error) {
            console.error(`Error loading codigos for presentacion ${presentacion.id}:`, error);
          }

          // Also load adicionales for each presentacion
          if (presentacion.id) {
            this.loadPresentacionAdicionales(presentacion.id);
          }
        }

        // If the product doesn't have variations, get the principal presentation for precios
        if (!this.producto.hasVariaciones && this.producto.presentaciones.length > 0) {
          const principalPresentacion = this.producto.presentaciones.find(p => p.principal);
          if (principalPresentacion) {
            this.defaultPresentacionId = principalPresentacion.id;
            await this.loadDefaultPresentacionPrecios(principalPresentacion.id);
          } else if (this.producto.presentaciones.length > 0) {
            // If no principal presentation exists, use the first one
            this.defaultPresentacionId = this.producto.presentaciones[0].id;
            await this.loadDefaultPresentacionPrecios(this.producto.presentaciones[0].id);
          }
        } else {
          // Reset precios when has variations is true
          this.defaultPresentacionId = undefined;
          this.defaultPresentacionPrecios = [];
        }
      }
    } catch (error) {
      console.error('Error loading presentaciones:', error);
      this.snackBar.open('Error al cargar presentaciones', 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Load prices for the default presentation
   */
  async loadDefaultPresentacionPrecios(presentacionId: number): Promise<void> {
    try {
      const precios = await firstValueFrom(this.repositoryService.getPreciosVentaByPresentacion(presentacionId));

      // Load moneda and tipoPrecio details for each precio
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
    } catch (error) {
      console.error('Error loading precios for default presentacion:', error);
      this.snackBar.open('Error al cargar los precios', 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Open dialog to add a new precio for the default presentacion
   */
  addDefaultPresentacionPrecio(): void {
    if (!this.producto?.id || !this.defaultPresentacionId) {
      this.snackBar.open('Debe guardar el producto primero', 'Cerrar', { duration: 3000 });
      return;
    }

    // Find the default presentacion
    const presentacion = this.producto.presentaciones.find(p => p.id === this.defaultPresentacionId);
    if (!presentacion) {
      this.snackBar.open('No se encontró la presentación', 'Cerrar', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(CreateEditPrecioVentaComponent, {
      width: '800px',
      disableClose: true,
      data: {
        presentacion: presentacion
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Reload prices after adding
        this.loadDefaultPresentacionPrecios(this.defaultPresentacionId!);
      }
    });
  }

  /**
   * Open dialog to edit an existing precio
   */
  editDefaultPresentacionPrecio(precio: PrecioVenta): void {
    if (!this.producto?.id || !this.defaultPresentacionId) {
      this.snackBar.open('Debe guardar el producto primero', 'Cerrar', { duration: 3000 });
      return;
    }

    // Find the default presentacion
    const presentacion = this.producto.presentaciones.find(p => p.id === this.defaultPresentacionId);
    if (!presentacion) {
      this.snackBar.open('No se encontró la presentación', 'Cerrar', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(CreateEditPrecioVentaComponent, {
      width: '800px',
      disableClose: true,
      data: {
        presentacion: presentacion,
        precio: precio,
        editMode: true
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Reload prices after editing
        this.loadDefaultPresentacionPrecios(this.defaultPresentacionId!);
      }
    });
  }

  /**
   * Delete a precio from the default presentacion
   */
  async deleteDefaultPresentacionPrecio(precio: PrecioVenta): Promise<void> {
    if (!precio.id) return;

    // Confirm deletion
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
          await firstValueFrom(this.repositoryService.deletePrecioVenta(precio.id));
          this.snackBar.open('Precio eliminado exitosamente', 'Cerrar', { duration: 3000 });

          // Reload prices after deletion
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

  // Private computation method
  private computeTipoMedidaLabel(tipo: TipoMedida): string {
    return this.tipoMedidaLabels[tipo] || tipo;
  }

  /**
   * Open dialog to create a new presentacion
   */
  openPresentacionDialog(presentacion?: Presentacion): void {
    if (!this.producto) {
      this.snackBar.open('Debe guardar el producto primero', 'Cerrar', { duration: 3000 });
      return;
    }

    // If hasVariaciones is false, check if we already have a presentacion
    const hasVariaciones = this.productoForm.get('hasVariaciones')?.value;
    if (!hasVariaciones && !presentacion && this.producto.presentaciones?.length > 0) {
      // If we already have a presentacion and we're trying to create a new one
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
      if (result) {
        this.loadProductoPresentaciones(this.producto!.id);
      }
    });
  }

  /**
   * Edit a presentacion
   */
  editPresentacion(presentacion: Presentacion): void {
    this.openPresentacionDialog(presentacion);
  }

  /**
   * Delete a presentacion
   */
  async deletePresentacion(presentacion: Presentacion): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirmar Eliminación',
        message: `¿Está seguro que desea eliminar la presentación "${presentacion.descripcion || 'Sin descripción'}"?`
      }
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        try {
      await firstValueFrom(this.repositoryService.deletePresentacion(presentacion.id));
      this.snackBar.open('Presentación eliminada exitosamente', 'Cerrar', { duration: 3000 });

      // Reload presentations
      if (this.producto) {
        this.loadProductoPresentaciones(this.producto.id);
      }
    } catch (error) {
      console.error('Error deleting presentacion:', error);
      this.snackBar.open('Error al eliminar la presentación', 'Cerrar', { duration: 3000 });
    }
      }
    });
  }

  /**
   * View códigos for a presentacion
   */
  viewCodigos(presentacion: Presentacion): void {
    this.dialog.open(CreateEditCodigoComponent, {
      width: '800px',
      maxHeight: '90vh',
      panelClass: 'no-padding-dialog',
      data: { presentacion }
    });
  }

  /**
   * Open dialog to manage sabores for a presentacion
   */
  manageSabores(presentacion: Presentacion): void {
    const dialogRef = this.dialog.open(CreateEditSaboresComponent, {
      width: '800px',
      maxHeight: '90vh',
      disableClose: false,
      data: { presentacion }
    });

    // Reload presentacion sabores when dialog is closed
    dialogRef.afterClosed().subscribe(() => {
      if (presentacion.id) {
        // Clear existing sabores data to force a fresh load
        this.presentacionSabores[presentacion.id] = [];
        this.loadPresentacionSabores(presentacion.id);
      }
    });
  }

  /**
   * Gets the display label for a TipoMedida enum value
   * Kept for backwards compatibility but shouldn't be called from template
   */
  getTipoMedidaLabel(tipo: TipoMedida): string {
    return this.computeTipoMedidaLabel(tipo);
  }

  /**
   * Load recipe details and calculate costs
   */
  async loadRecipeDetails(recetaId: number): Promise<void> {
    try {
      // Get the recipe details
      const receta = await firstValueFrom(this.repositoryService.getReceta(recetaId));
      this.selectedReceta = receta;

      // Get recipe items to calculate cost
      const recetaItems = await firstValueFrom(this.repositoryService.getRecetaItems(recetaId));

      if (recetaItems.length > 0) {
        // Get all ingredient IDs from the recipe items
        const ingredientIds = recetaItems.map(item => item.ingredienteId);

        // Fetch all ingredients used in the recipe
        const ingredients: any[] = [];
        for (const id of ingredientIds) {
          try {
            const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(id));
            ingredients.push(ingrediente);
          } catch (error) {
            console.error(`Error loading ingredient ${id}:`, error);
          }
        }

        // Calculate total cost of the recipe
        let totalCost = 0;
        for (const item of recetaItems) {
          const ingredient = ingredients.find(i => i.id === item.ingredienteId);
          if (ingredient) {
            totalCost += (ingredient.costo || 0) * (item.cantidad || 0);
          }
        }

        this.recipeTotalCost = totalCost;

        // The cost per unit is the same as the total cost for our product calculation
        // since we're using the full recipe or variation
        this.recipeCostPerUnit = this.recipeTotalCost;

        // Calculate suggested price (using 35% food cost as a standard)
        this.recipeSuggestedPrice = this.recipeCostPerUnit > 0 ? this.recipeCostPerUnit / 0.35 : 0;

        // Log the calculated costs
        console.log(`Calculated recipe costs for recetaId ${recetaId}:`, {
          totalCost: this.recipeTotalCost,
          suggestedPrice: this.recipeSuggestedPrice
        });
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

  // Add at the end of loadMonedas method (create this method if it doesn't exist)
  async loadMonedas(): Promise<void> {
    try {
      const monedas = await firstValueFrom(this.repositoryService.getMonedas());
      // Find default moneda (principal == true)
      const defaultMoneda = monedas.find(m => m.principal);

      // Set default moneda símbolo for template
      if (defaultMoneda) {
        this.defaultMonedaSimbolo = defaultMoneda.simbolo;
      }
    } catch (error) {
      console.error('Error loading monedas:', error);
    }
  }

  /**
   * Returns the URL of the main product image for display in the preview
   * Falls back to default image if no main image exists
   */
  // transform this on a getter
  loadMainImage(): void {
    console.log('productImages');
    const mainImage = this.productImages.find(img => img.isMain && !img.toDelete);
    this.mainImageUrl = mainImage ? mainImage.imageUrl : this.defaultNoImagePath;
  }

  /**
   * Checks if the product has a main image for display
   */
  hasMainImage(): boolean {
    return this.productImages.some(img => img.isMain && !img.toDelete);
  }

  /**
   * Attempts to delete the product. If database restrictions exist,
   * it will set the product as inactive instead of deleting it.
   */
  async deleteProducto(): Promise<void> {
    if (!this.producto || !this.producto.id) {
      this.snackBar.open('No hay producto para eliminar', 'Cerrar', { duration: 3000 });
      return;
    }

    // Store reference to producto to use within closure
    const producto = this.producto;

    // Confirm deletion first
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
        await firstValueFrom(this.repositoryService.deleteProducto(producto.id));

        this.isLoading = false;
        this.snackBar.open('Producto eliminado exitosamente', 'Cerrar', { duration: 3000 });

        // Close the current tab after successful deletion
        this.goBack();
      } catch (error: any) {
        console.error('Error deleting producto:', error);

        // Check if error is due to database restrictions (foreign key constraint, etc.)
        // The exact error message format depends on your backend implementation
        const errorMessage = error?.message || '';
        const hasRestrictions =
          errorMessage.includes('constraint') ||
          errorMessage.includes('restrict') ||
          errorMessage.includes('reference') ||
          errorMessage.includes('FOREIGN KEY');

        if (hasRestrictions) {
          this.snackBar.open(
            'No se puede eliminar el producto debido a restricciones en la base de datos. Se establecerá como inactivo.',
            'Cerrar',
            { duration: 5000 }
          );

          // Set product as inactive instead
          try {
            await firstValueFrom(this.repositoryService.updateProducto(producto.id, { activo: false }));

            // Update local product object if it still exists
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
          // Other error
          this.snackBar.open('Error al eliminar producto: ' + (error?.message || 'Error desconocido'), 'Cerrar', { duration: 3000 });
        }

        this.isLoading = false;
      }
    });
  }

  /**
   * Toggle expansion of a presentacion row to show sabores
   */
  toggleExpandPresentacion(presentacion: Presentacion): void {
    if (this.expandedPresentacion === presentacion) {
      this.expandedPresentacion = null;
    } else {
      this.expandedPresentacion = presentacion;
      if (presentacion && presentacion.id) {
        this.loadPresentacionSabores(presentacion.id);
      }
    }
  }

  /**
   * Load sabores for a specific presentacion
   */
  async loadPresentacionSabores(presentacionId: number): Promise<void> {
    if (this.presentacionSabores[presentacionId]?.length > 0) {
      // Already loaded
      return;
    }

    this.loadingSabores = true;
    try {
      const sabores = await firstValueFrom(this.repositoryService.getPresentacionSabores(presentacionId));
      this.presentacionSabores[presentacionId] = sabores as PresentacionSaborViewModel[];

      // Load any missing sabor names
      for (const sabor of this.presentacionSabores[presentacionId]) {
        if (!sabor.sabor?.nombre) {
          this.loadSaborName(sabor.saborId);
        }

        // Initialize the ViewModel properties
        sabor.costoTotal = 0;
        sabor.precioVenta = undefined;
        sabor.moneda = undefined;
        sabor.stock = 0;

        // Load additional cost details
        if (sabor.recetaId || sabor.variacionId) {
          await this.loadSaborCostoDetails(sabor);
        }

        // Check if the sabor has any precios venta associated
        try {
          // We need to add a way to get precios by presentacionSaborId
          if (sabor.id) {
            const preciosVenta = await this.loadPreciosVentaBySaborId(sabor.id);
            // Add a property to track if the sabor has precios
            (sabor as any).hasPrecioVenta = preciosVenta.length > 0;
            if (preciosVenta.length > 0) {
              // Find the principal price
              const principalPrecio = preciosVenta.find(p => p.principal) || preciosVenta[0];
              sabor.precioVenta = principalPrecio.valor;
              sabor.moneda = principalPrecio.moneda;
            }
          }
        } catch (error) {
          console.error('Error loading precios venta for sabor:', error);
          (sabor as any).hasPrecioVenta = false;
        }
      }
    } catch (error) {
      console.error('Error loading presentacion sabores:', error);
      this.snackBar.open('Error al cargar los sabores de la presentación', 'Cerrar', { duration: 3000 });
    } finally {
      this.loadingSabores = false;
    }
  }

  /**
   * Load precio venta for a presentacion sabor
   */
  async loadPreciosVentaBySaborId(presentacionSaborId: number): Promise<PrecioVenta[]> {
    try {
      // Assuming there's a repository method to get precios by presentacionSaborId
      // This endpoint may need to be added if it doesn't exist
      const precios = await firstValueFrom(this.repositoryService.getPreciosVentaByPresentacionSabor(presentacionSaborId));

      // Load moneda and tipoPrecio details for each precio
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
      return precios;
    } catch (error) {
      console.error('Error loading precios venta by sabor id:', error);
      return [];
    }
  }

  /**
   * Open dialog to add precio for a presentacion sabor
   */
  addPrecioToPresentacionSabor(sabor: PresentacionSabor): void {
    const saborVM = sabor as PresentacionSaborViewModel;
    const costoTotal = saborVM.costoTotal || 0;

    const dialogRef = this.dialog.open(CreateEditPrecioVentaComponent, {
      width: '900px',
      data: {
        presentacionSabor: sabor,
        recipeCost: costoTotal,
        suggestedPrice: costoTotal / 0.35 // Para que el costo represente el 35% del precio final
      },
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        // Clear the cache and reload to get the updated data with new prices
        if (sabor.presentacionId) {
          this.presentacionSabores[sabor.presentacionId] = [];
          this.loadPresentacionSabores(sabor.presentacionId);
        }
      }
    });
  }

  /**
   * Simple function to load a sabor name and store it in cache
   */
  private loadSaborName(saborId: number): void {
    // Skip if already loaded or loading
    if (this.saborCache[saborId] && !this.saborCache[saborId].startsWith('Cargando')) {
      return;
    }

    // Set loading state
    this.saborCache[saborId] = `Cargando...`;

    // Load the sabor data
    this.repositoryService.getSabor(saborId).subscribe({
      next: (sabor) => {
        if (sabor) {
          this.saborCache[saborId] = sabor.nombre;

          // Update all instances of this sabor in all presentacionSabores
          Object.values(this.presentacionSabores).forEach(sabores => {
            sabores.forEach(s => {
              if (s.saborId === saborId) {
                s.sabor = sabor;
              }
            });
          });

          // Trigger change detection
          this.cdr.detectChanges();
        } else {
          this.saborCache[saborId] = `Sabor #${saborId}`;
        }
      },
      error: (error) => {
        console.error(`Error loading sabor data for ID ${saborId}:`, error);
        this.saborCache[saborId] = `Sabor #${saborId}`;
      }
    });
  }

  /**
   * Load cost details for a sabor
   */
  private async loadSaborCostoDetails(sabor: PresentacionSaborViewModel): Promise<void> {
    try {
      if (sabor.variacionId) {
        const variacion = await firstValueFrom(this.repositoryService.getRecetaVariacion(sabor.variacionId));
        if (variacion) {
          // Set the sabor's cost from the variation
          sabor.costoTotal = variacion.costo || 0;
        }
      } else if (sabor.recetaId) {
        const recetaItems = await firstValueFrom(this.repositoryService.getRecetaItems(sabor.recetaId));
        if (recetaItems) {
          // Calculate the total cost from all recipe items
          const totalCost = recetaItems.reduce((sum, item) => sum + (item.cantidad * (item.ingrediente?.costo || 0)), 0);
          sabor.costoTotal = totalCost;
        }
      }

      // Try to load the precio venta
      const precios = await firstValueFrom(this.repositoryService.getPreciosVentaByPresentacion(sabor.presentacionId));
      if (precios && precios.length > 0) {
        // Find the principal price if it exists, otherwise use the first one
        const principalPrecio = precios.find((p: PrecioVenta) => p.principal) || precios[0];
        sabor.precioVenta = principalPrecio.valor;
        sabor.moneda = principalPrecio.moneda;
      }
    } catch (error) {
      console.error('Error loading sabor details:', error);
    }
  }

  /**
   * Check if we should show the expanded row
   */
  shouldShowExpandedRow(presentacion: Presentacion): boolean {
    return true; // Always return true to ensure the expansion row is available
  }

  /**
   * Get sabor name by ID (maintained for backward compatibility)
   */
  getSaborNombre(saborId: number): string {
    // First check cache
    if (this.saborCache[saborId]) {
      return this.saborCache[saborId];
    }

    // Not in cache, start loading and return placeholder
    this.loadSaborName(saborId);
    return `Sabor #${saborId}`;
  }

  /**
   * Get receta name by ID (maintained for backward compatibility)
   */
  getRecetaNombre(recetaId?: number): string {
    if (!recetaId) return 'No asignada';
    const receta = this.recetas.find(r => r.id === recetaId);
    return receta ? receta.nombre : 'No asignada';
  }

  /**
   * Get variacion name by ID (maintained for backward compatibility)
   */
  getVariacionNombre(variacionId?: number): string {
    if (!variacionId) return 'No asignada';
    return 'No asignada';
  }

  // Add these new methods for sabor actions

  editSabor(sabor: PresentacionSabor): void {
    // Navigate to edit sabor screen or open edit dialog
    // This will depend on your sabor edit UI implementation
    this.snackBar.open('Función de editar sabor en desarrollo', 'Cerrar', {
      duration: 3000
    });
  }

  async deleteSabor(sabor: PresentacionSabor): Promise<void> {
    const confirmDelete = confirm(`¿Está seguro que desea eliminar el sabor "${this.getSaborNombre(sabor.saborId)}"?`);

    if (!confirmDelete) {
      return;
    }

    this.isLoading = true;

    try {
      await firstValueFrom(this.repositoryService.deletePresentacionSabor(sabor.id));
      this.snackBar.open('Sabor eliminado exitosamente', 'Cerrar', { duration: 3000 });

      // Reload the sabores for this presentacion
      this.loadPresentacionSabores(sabor.presentacionId);
    } catch (error) {
      console.error('Error deleting sabor:', error);
      this.snackBar.open('Error al eliminar el sabor', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  manageSaborPrecios(sabor: PresentacionSabor): void {
    const saborVM = sabor as PresentacionSaborViewModel;
    const costoTotal = saborVM.costoTotal || 0;

    const dialogRef = this.dialog.open(CreateEditPrecioVentaComponent, {
      width: '900px',
      data: {
        presentacionSabor: sabor,
        recipeCost: costoTotal,
        suggestedPrice: costoTotal / 0.35 // Para que el costo represente el 35% del precio final
      },
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        // Clear previous data to force a refresh and reload the sabores for this presentacion
        if (sabor.presentacionId) {
          this.presentacionSabores[sabor.presentacionId] = [];
          this.loadPresentacionSabores(sabor.presentacionId);
        }
      }
    });
  }

  // Method to transform a Receta to RecetaViewModel
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

  // Method to search recipes
  private searchRecetas(searchText: string): Observable<RecetaViewModel[]> {
    if (!searchText.trim()) {
      return of(this.recetas.slice(0, 10).map(r => this.transformReceta(r)));
    }

    const filterValue = searchText.toLowerCase();
    const filteredRecetas = this.recetas
      .filter(receta => receta.nombre.toLowerCase().includes(filterValue))
      .slice(0, 10)
      .map(r => this.transformReceta(r));

    return of(filteredRecetas);
  }

  // Handle recipe selection from autocomplete
  onRecetaSelected(event: any): void {
    const selectedReceta = event.option.value as RecetaViewModel;
    this.selectedRecetaModel = selectedReceta;
    this.productoForm.patchValue({
      recetaId: selectedReceta.id
    });

    // Loading the selected recipe details
    this.loadRecipeDetails(selectedReceta.id).then(() => {
      // After recipe details are loaded, if there are no variations,
      // ensure we display the correct cost values from the base recipe
      if (this.variaciones.length === 0) {
        this.recipeTotalCost = this.calculateTotalCostForRecipe(selectedReceta.id);
        this.recipeCostPerUnit = this.recipeTotalCost;
        this.recipeSuggestedPrice = this.recipeTotalCost > 0 ? this.recipeTotalCost / 0.35 : 0;
      }
    });

    // Loading variations is handled by loadRecipeVariations
    this.loadRecipeVariations(selectedReceta.id);
  }

  // Helper method to calculate total cost for a recipe from its items
  private calculateTotalCostForRecipe(recetaId: number): number {
    const receta = this.recetas.find(r => r.id === recetaId);
    if (!receta) return 0;

    // For now, return 0 since we don't have recipe items loaded here
    // This will be overridden by loadRecipeDetails which properly calculates costs
    return 0;
  }

  // Clear recipe selection
  clearRecetaSelection(): void {
    this.selectedRecetaModel = null;
    this.productoForm.patchValue({
      recetaId: null,
      recetaSearch: '',
      variacionId: null
    });
    this.variaciones = [];
  }

  // Load recipe variations
  async loadRecipeVariations(recetaId: number): Promise<void> {
    if (!recetaId) return;

    try {
      this.isLoading = true;
      this.variaciones = await firstValueFrom(this.repositoryService.getRecetaVariaciones(recetaId));

      // If variations exist, enable the variations dropdown
      const variacionIdControl = this.productoForm.get('variacionId');
      if (variacionIdControl) {
        if (this.variaciones.length > 0) {
          variacionIdControl.enable();

          // Set up a listener for variation changes before setting the initial value
          // to avoid duplicate cost calculations
          const subscription = variacionIdControl.valueChanges.subscribe(variationId => {
            if (variationId) {
              this.updateRecipeVariationCosts(variationId);
            }
          });

          // Store the subscription to avoid memory leaks
          // (if you have a component destroy method, you should unsubscribe there)
          // this.subscriptions.push(subscription);

          // Select the principal variation by default
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

  // Add a new method to update costs for a specific variation
  async updateRecipeVariationCosts(variationId: number): Promise<void> {
    try {
      const variation = this.variaciones.find(v => v.id === variationId);

      if (variation) {
        // Get the latest variation data to ensure we have the most up-to-date cost
        const updatedVariation = await firstValueFrom(this.repositoryService.getRecetaVariacion(variationId));

        // Update the recipe cost based on the variation cost - use the updated value from the server
        this.recipeTotalCost = updatedVariation?.costo || variation.costo || 0;

        // For product cost calculation, we only need the full cost of the variation
        // We don't need to divide by recipe cantidad because the variation cost already
        // represents the full cost of producing the item
        this.recipeCostPerUnit = this.recipeTotalCost;

        // Calculate suggested price (using 35% food cost as a standard)
        this.recipeSuggestedPrice = this.recipeCostPerUnit > 0 ? this.recipeCostPerUnit / 0.35 : 0;

        console.log(`Updated costs for variation ${variationId}:`, {
          variationCost: this.recipeTotalCost,
          suggestedPrice: this.recipeSuggestedPrice
        });
      }
    } catch (error) {
      console.error('Error updating variation costs:', error);
    }
  }

  // Add a method to save the recipe variation association
  async saveRecipeVariation(): Promise<void> {
    const recetaId = this.productoForm.get('recetaId')?.value;
    const variacionId = this.productoForm.get('variacionId')?.value;

    if (!recetaId || !variacionId) {
      this.snackBar.open('Seleccione una receta y variación para guardar', 'Cerrar', { duration: 3000 });
      return;
    }

    if (!this.producto?.id) {
      this.snackBar.open('Debe guardar el producto primero antes de asociar una receta', 'Cerrar', { duration: 3000 });
      return;
    }

    try {
      this.isLoading = true;

      // Update the product with the selected recipe only, as that's what's available in the type
      await firstValueFrom(this.repositoryService.updateProducto(this.producto.id, {
        recetaId: recetaId
      }));

      // We may need to update the variation association separately if the API supports it
      // or it might be handled through a different endpoint
      // For now, we'll just update what we know works

      this.snackBar.open('Receta guardada exitosamente', 'Cerrar', { duration: 3000 });

      // Update local product data
      if (this.producto) {
        this.producto.recetaId = recetaId;
        // Store variation ID in a data attribute or local variable if needed
      }
    } catch (error) {
      console.error('Error saving recipe:', error);
      this.snackBar.open('Error al guardar la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  // Add a new method to setup form controls based on loaded data
  private setupFormControlsBasedOnLoadedData(): void {
    // Enable/disable controls based on current state
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

    if (recetaIdControl && recetaSearchControl && variacionIdControl) {
      if (isCompuesto && !hasVariaciones) {
        recetaIdControl.enable();
        recetaSearchControl.enable();
      } else {
        recetaIdControl.disable();
        recetaSearchControl.disable();
        variacionIdControl.disable();
      }
    }
  }

  // Helper method to get color for CMV percentage
  getCMVColor(cmvPercentage: number): string {
    if (cmvPercentage <= 35) {
      return '#2e7d32'; // Green - good CMV
    } else if (cmvPercentage <= 45) {
      return '#ef6c00'; // Orange - warning CMV
    } else {
      return '#c62828'; // Red - high CMV
    }
  }

  /**
   * Load adicionales for a specific presentacion
   */
  async loadPresentacionAdicionales(presentacionId: number): Promise<void> {
    if (this.presentacionAdicionales[presentacionId]?.length > 0) {
      // Already loaded
      return;
    }

    this.loadingAdicionales = true;
    try {
      const adicionales = await firstValueFrom(this.repositoryService.getProductosAdicionalesByPresentacion(presentacionId));
      this.presentacionAdicionales[presentacionId] = adicionales;

      // Load adicional details for each producto adicional
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

  /**
   * Open dialog to add a new adicional for a presentacion
   */
  addPresentacionAdicional(presentacion: Presentacion): void {
    if (!this.producto?.id || !presentacion.id) {
      this.snackBar.open('Debe guardar el producto primero', 'Cerrar', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(CreateEditAdicionalDialogComponent, {
      width: '800px',
      disableClose: false,
      data: {} // No specific data to send
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        try {
          // Create the relationship between presentacion and adicional
          const adicionalId = result.id || result; // Get the ID from result object or directly
          
          await firstValueFrom(this.repositoryService.createProductoAdicional({
            presentacionId: presentacion.id,
            adicionalId: adicionalId,
            productoId: this.producto!.id,
            cantidadDefault: 1,
            activo: true
          }));

          this.snackBar.open('Adicional agregado exitosamente', 'Cerrar', { duration: 3000 });
          
          // Reload adicionales for this presentacion
          this.presentacionAdicionales[presentacion.id] = [];
          this.loadPresentacionAdicionales(presentacion.id);
        } catch (error) {
          console.error('Error adding adicional to presentacion:', error);
          this.snackBar.open('Error al agregar el adicional', 'Cerrar', { duration: 3000 });
        }
      }
    });
  }

  /**
   * Edit a producto adicional
   */
  editProductoAdicional(productoAdicional: ProductoAdicional): void {
    if (!productoAdicional.id) {
      this.snackBar.open('El adicional no tiene ID', 'Cerrar', { duration: 3000 });
      return;
    }

    // This implementation just edits the default cantidad for now
    // A more complete implementation would let you edit the relationship properties
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Editar cantidad por defecto',
        message: `Ingrese la cantidad por defecto para ${productoAdicional.adicional?.nombre || 'el adicional'}`,
        inputType: 'number',
        inputValue: productoAdicional.cantidadDefault || 1,
        confirmText: 'Guardar',
        cancelText: 'Cancelar'
      }
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result !== undefined) {
        try {
          await firstValueFrom(this.repositoryService.updateProductoAdicional(productoAdicional.id, {
            cantidadDefault: +result
          }));

          this.snackBar.open('Adicional actualizado exitosamente', 'Cerrar', { duration: 3000 });
          
          // Reload adicionales for this presentacion
          this.presentacionAdicionales[productoAdicional.presentacionId] = [];
          this.loadPresentacionAdicionales(productoAdicional.presentacionId);
        } catch (error) {
          console.error('Error updating producto adicional:', error);
          this.snackBar.open('Error al actualizar el adicional', 'Cerrar', { duration: 3000 });
        }
      }
    });
  }

  /**
   * Delete a producto adicional
   */
  async deleteProductoAdicional(productoAdicional: ProductoAdicional): Promise<void> {
    if (!productoAdicional.id) {
      return;
    }

    // Confirm deletion
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirmar Eliminación',
        message: `¿Está seguro de eliminar este adicional?`
      }
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        try {
          await firstValueFrom(this.repositoryService.deleteProductoAdicional(productoAdicional.id));
          this.snackBar.open('Adicional eliminado exitosamente', 'Cerrar', { duration: 3000 });

          // Reload adicionales for this presentacion
          this.presentacionAdicionales[productoAdicional.presentacionId] = [];
          this.loadPresentacionAdicionales(productoAdicional.presentacionId);
        } catch (error) {
          console.error('Error deleting producto adicional:', error);
          this.snackBar.open('Error al eliminar el adicional', 'Cerrar', { duration: 3000 });
        }
      }
    });
  }

  /**
   * Helper function to get ingrediente descripcion
   */
  getIngredienteDescripcion(ingredienteId?: number): string {
    if (!ingredienteId) return 'N/A';
    return 'Ingrediente';  // Placeholder - in real implementation you would look up the ingredient
  }
}
