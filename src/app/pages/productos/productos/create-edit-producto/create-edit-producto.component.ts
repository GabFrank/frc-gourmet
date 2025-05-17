import { Component, Inject, OnInit, ViewChild, ElementRef, ChangeDetectorRef, Input, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule, FormControl } from '@angular/forms';
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
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogConfig, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { RepositoryService } from '../../../../database/repository.service';
import { Producto } from '../../../../database/entities/productos/producto.entity';
import { ProductoImage } from '../../../../database/entities/productos/producto-image.entity';
import { Subcategoria } from '../../../../database/entities/productos/subcategoria.entity';
import { Categoria } from '../../../../database/entities/productos/categoria.entity';
import { ObservacionProducto } from '../../../../database/entities/productos/observacion-producto.entity';
import { ProductoAdicional } from '../../../../database/entities/productos/producto-adicional.entity';
import { Receta } from '../../../../database/entities/productos/receta.entity';
import { RecetaVariacion } from '../../../../database/entities/productos/receta-variacion.entity';
import { firstValueFrom, Observable, of, debounceTime, distinctUntilChanged, switchMap, map, catchError } from 'rxjs';
import { TabsService } from '../../../../services/tabs.service';
import { ImageViewerComponent } from '../../../../components/image-viewer/image-viewer.component';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { SimplePresentationSectionComponent } from '../../simple-presencation-section/simple-presencation-section.component';
import { CreateEditObservacionProductoDialogComponent } from '../create-edit-observacion-producto-dialog/create-edit-observacion-producto-dialog.component';
import { CreateEditObservacionDialogComponent } from '../create-edit-observacion-dialog/create-edit-observacion-dialog.component';
import { CreateEditProductoAdicionalDialogComponent } from '../create-edit-producto-adicional-dialog/create-edit-producto-adicional-dialog.component';
import { Observacion } from 'src/app/database/entities/productos/observacion.entity';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';

// Interface for product image model
interface ProductImageModel {
  id?: number;
  imageUrl: string;
  file?: File;
  isMain: boolean;
  orden: number;
  isNew?: boolean;
  toDelete?: boolean;
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
    MatCardModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDialogModule,
    MatMenuModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    FormsModule,
    ConfirmationDialogComponent,
    SimplePresentationSectionComponent
  ],
  templateUrl: './create-edit-producto.component.html',
  styleUrls: ['./create-edit-producto.component.scss'],
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
  observacionesProducto: ObservacionProducto[] = [];
  productosAdicionales: ProductoAdicional[] = [];

  // For image handling
  mainImageUrl = '';
  selectedImageFile: File | null = null;
  productImages: ProductImageModel[] = [];
  maxImageSize = 5 * 1024 * 1024; // 5MB
  currentImageIndex = 0;

  producto?: Producto;
  defaultNoImagePath = '/assets/images/no-image.png';
  submitted = false;

  // For receta search
  recetaSearchCtrl = new FormControl('');
  recetaVariacionCtrl = new FormControl(null);
  isSearchingRecetas = false;
  selectedReceta: Receta | null = null;
  filteredRecetas: Observable<Receta[]> = of([]);
  recetaVariaciones: RecetaVariacion[] = [];
  selectedRecetaVariacion: RecetaVariacion | null = null;

  // moneda principal
  monedaPrincipal: Moneda | null = null;

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
      activo: [true]
    });
  }

  ngOnInit(): void {
    // Load initial data
    this.loadCategorias();

    // Setup form listeners
    this.setupFormControlListeners();
    
    // Setup receta search autocomplete
    this.setupRecetaSearch();

    // load moneda principal
    this.loadMonedaPrincipal();

    // Initialize form data from input if available
    if (this.data) {
      this.loadProducto(this.data.id);
    }
  }

  ngAfterViewInit(): void {
    // Any post-render setup can go here
    this.cdr.detectChanges();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && changes['data'].currentValue) {
      this.loadProducto(changes['data'].currentValue.id);
    }
  }

  async loadMonedaPrincipal(): Promise<void> {
    this.monedaPrincipal = await firstValueFrom(this.repositoryService.getMonedaPrincipal());
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

  async loadObservacionesProducto(): Promise<void> {
    if (!this.producto || !this.producto.id) {
      return;
    }

    try {
      const observacionesProducto = await firstValueFrom(
        this.repositoryService.getObservacionesProductosByProducto(this.producto.id)
      );

      // Load associated observacion details
      for (const op of observacionesProducto) {
        try {
          op.observacion = await firstValueFrom(
            this.repositoryService.getObservacion(op.observacionId)
          );
        } catch (error) {
          console.error(`Error loading observacion ${op.observacionId}:`, error);
        }
      }

      this.observacionesProducto = observacionesProducto;
    } catch (error) {
      console.error('Error loading observaciones producto:', error);
      this.snackBar.open('Error al cargar las observaciones', 'Cerrar', { duration: 3000 });
    }
  }

  async loadProductosAdicionales(): Promise<void> {
    if (!this.producto || !this.producto.id) {
      return;
    }

    try {
      const productosAdicionales = await firstValueFrom(
        this.repositoryService.getProductosAdicionalesByProducto(this.producto.id)
      );

      // Load associated adicional and presentacion details
      for (const pa of productosAdicionales) {
        try {
          pa.adicional = await firstValueFrom(
            this.repositoryService.getAdicional(pa.adicionalId)
          );
          pa.presentacion = await firstValueFrom(
            this.repositoryService.getPresentacion(pa.presentacionId)
          );
        } catch (error) {
          console.error(`Error loading adicional ${pa.adicionalId} or presentacion ${pa.presentacionId}:`, error);
        }
      }

      this.productosAdicionales = productosAdicionales;
    } catch (error) {
      console.error('Error loading productos adicionales:', error);
      this.snackBar.open('Error al cargar los adicionales', 'Cerrar', { duration: 3000 });
    }
  }

  openCreateEditObservacionProductoDialog(observacionProducto?: ObservacionProducto, observacion?: Observacion): void {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.width = '50%';
    dialogConfig.disableClose = true;
    dialogConfig.data = {
      producto: this.producto,
      observacion: observacion,
      observacionProducto: observacionProducto,
      editMode: !!observacionProducto
    };

    const dialogRef = this.dialog.open(CreateEditObservacionProductoDialogComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // reload observaciones producto
        this.loadObservacionesProducto();
      }
    });
  }

  openCreateEditProductoAdicionalDialog(productoAdicional?: ProductoAdicional): void {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.width = '60vw';
    dialogConfig.disableClose = true;
    dialogConfig.data = {
      producto: this.producto,
      productoAdicional: productoAdicional,
      editMode: !!productoAdicional
    };

    const dialogRef = this.dialog.open(CreateEditProductoAdicionalDialogComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // reload productos adicionales
        this.loadProductosAdicionales();
      }
    });
  }

  async deleteObservacionProducto(observacionProducto: ObservacionProducto): Promise<void> {
    if (!observacionProducto || !observacionProducto.id) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirmar Eliminación',
        message: `¿Está seguro que desea eliminar esta observación?`
      }
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) return;

      try {
        await firstValueFrom(
          this.repositoryService.deleteObservacionProducto(observacionProducto.id!)
        );

        this.snackBar.open('Observación eliminada exitosamente', 'Cerrar', { duration: 3000 });
        this.loadObservacionesProducto();
      } catch (error) {
        console.error('Error deleting observacion producto:', error);
        this.snackBar.open('Error al eliminar la observación', 'Cerrar', { duration: 3000 });
      }
    });
  }

  async deleteProductoAdicional(productoAdicional: ProductoAdicional): Promise<void> {
    if (!productoAdicional || !productoAdicional.id) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Confirmar Eliminación',
        message: `¿Está seguro que desea eliminar este adicional?`
      }
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (!result) return;

      try {
        await firstValueFrom(
          this.repositoryService.deleteProductoAdicional(productoAdicional.id!)
        );

        this.snackBar.open('Adicional eliminado exitosamente', 'Cerrar', { duration: 3000 });
        this.loadProductosAdicionales();
      } catch (error) {
        console.error('Error deleting producto adicional:', error);
        this.snackBar.open('Error al eliminar el adicional', 'Cerrar', { duration: 3000 });
      }
    });
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

    this.productoForm.get('categoriaId')?.valueChanges.subscribe(categoriaId => {
      if (categoriaId) {
        this.loadSubcategoriasByCategoria(categoriaId);
      }
    });

    // Listen for changes to isCompuesto to determine if we need to show receta section
    this.productoForm.get('isCompuesto')?.valueChanges.subscribe(isCompuesto => {
      if (isCompuesto) {
        this.setupRecetaSearch();
      } else {
        this.clearRecetaSelection();
      }
    });

    // Listen for receta variacion selection
    this.recetaVariacionCtrl.valueChanges.subscribe((variacion: RecetaVariacion | null) => {
      if (variacion) {
        this.selectedRecetaVariacion = variacion;
      } else {
        this.selectedRecetaVariacion = null;
      }
    });
  }

  /**
   * Sets up the receta search autocomplete functionality
   */
  private setupRecetaSearch(): void {
    this.filteredRecetas = this.recetaSearchCtrl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        // If value is already an object (selected receta), don't search again
        if (typeof value === 'object' && value !== null) {
          return of([value as Receta]);
        }
        
        // If value is empty or less than 2 characters, return empty array
        const searchText = typeof value === 'string' ? value : '';
        if (searchText.length < 2) {
          return of([]);
        }
        
        // Search for recetas
        this.isSearchingRecetas = true;
        return this.repositoryService.searchRecetas(searchText).pipe(
          map(recetas => {
            this.isSearchingRecetas = false;
            return recetas;
          }),
          catchError(error => {
            this.isSearchingRecetas = false;
            console.error('Error searching recetas:', error);
            return of([]);
          })
        );
      })
    );
  }

  /**
   * Handles receta selection from autocomplete
   */
  onRecetaSelected(event: any): void {
    const receta = event.option.value as Receta;
    this.selectedReceta = receta;
    
    // Load receta variaciones
    this.loadRecetaVariaciones(receta.id);
  }

  /**
   * Loads variaciones for the selected receta
   */
  async loadRecetaVariaciones(recetaId: number): Promise<void> {
    try {
      this.recetaVariaciones = await firstValueFrom(this.repositoryService.getRecetaVariaciones(recetaId));
      
      // If there's only one variacion, select it automatically
      if (this.recetaVariaciones.length === 1) {
        this.recetaVariacionCtrl.setValue(this.recetaVariaciones[0] as any);
      } else if (this.recetaVariaciones.length > 0) {
        // If there are multiple, select the principal one if available
        const principalVariacion = this.recetaVariaciones.find(v => v.principal);
        if (principalVariacion) {
          this.recetaVariacionCtrl.setValue(principalVariacion as any);
        }
      }
    } catch (error) {
      console.error('Error loading receta variaciones:', error);
      this.snackBar.open('Error al cargar las variaciones de receta', 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Displays the receta name in the autocomplete
   */
  displayReceta(receta: Receta): string {
    return receta?.nombre || '';
  }

  /**
   * Clears the selected receta and associated data
   */
  clearRecetaSelection(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.recetaSearchCtrl.setValue('');
    this.recetaVariacionCtrl.setValue(null);
    this.selectedReceta = null;
    this.selectedRecetaVariacion = null;
    this.recetaVariaciones = [];
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
            activo: producto.activo
          });
          this.loadSubcategoriasByCategoria(producto.subcategoria.categoria.id);
          this.loadProductImages();
          this.loadObservacionesProducto();
          this.loadProductosAdicionales();
          this.setupFormControlsBasedOnLoadedData();
          // load receta and receta variaciones
          if(producto.recetaVariacion) {
            // Set the selectedRecetaVariacion
            this.selectedRecetaVariacion = producto.recetaVariacion;
            
            // Set the form control value
            this.recetaVariacionCtrl.setValue(producto.recetaVariacion as any);
            
            // If we have the receta information in the recetaVariacion
            if(producto.recetaVariacion.receta) {
              // Set the selectedReceta
              this.selectedReceta = producto.recetaVariacion.receta;
              
              // Set the receta search control with the receta object
              this.recetaSearchCtrl.setValue(producto.recetaVariacion.receta as any);
              
              // Load all variaciones for this receta
              this.loadRecetaVariaciones(producto.recetaVariacion.receta.id);
            }
          }
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
        await firstValueFrom(this.repositoryService.deleteProducto(producto.id!));
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
            await firstValueFrom(this.repositoryService.updateProducto(producto.id!, { activo: false }));
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
        observacion: formValues.observacion,
        activo: formValues.activo
      };

      if (this.isEditing && this.producto?.id) {
        const savedProducto = await firstValueFrom(
          this.repositoryService.updateProducto(this.producto.id, productData)
        );
        this.producto = { ...this.producto, ...savedProducto };
        this.snackBar.open('Producto actualizado exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new product
        const savedProducto = await firstValueFrom(this.repositoryService.createProducto(productData));
        this.producto = savedProducto;
        this.isEditing = true;
        this.snackBar.open('Producto creado exitosamente', 'Cerrar', { duration: 3000 });
      }

      // Common refresh logic
      if (this.producto?.id) {
        await this.loadProductImages(); // Refresh images
      }

    } catch (error) {
      console.error('Error saving product:', error);
      this.snackBar.open('Error al guardar el producto', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
      this.submitted = false;
    }
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

  addReceta(recetaVariacion: RecetaVariacion): void {
    // add receta to producto and save on database
    if(this.producto) {
      this.producto.recetaVariacion = recetaVariacion;
      this.repositoryService.updateProducto(this.producto.id!, this.producto);
    }
  }

  removeReceta(): void {
    if(this.producto) {
      this.producto.recetaVariacion = undefined;
      this.repositoryService.updateProducto(this.producto.id!, this.producto);
    }
  }
} 