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
import { RepositoryService } from '../../../database/repository.service';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { ProductoImage } from '../../../database/entities/productos/producto-image.entity';
import { Subcategoria } from '../../../database/entities/productos/subcategoria.entity';
import { Categoria } from '../../../database/entities/productos/categoria.entity';
import { firstValueFrom } from 'rxjs';
import { TabsService } from '../../../services/tabs.service';
import { ImageViewerComponent } from '../../../components/image-viewer/image-viewer.component';
import { CreateEditCodigoComponent } from './create-edit-codigo.component';
import { CreateEditPrecioVentaComponent } from './create-edit-precio-venta.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Presentacion, TipoMedida } from '../../../database/entities/productos/presentacion.entity';
import { CreateEditPresentacionDialogComponent } from './create-edit-presentacion-dialog.component';
import { CreateEditSaboresComponent } from './create-edit-sabores.component';

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
    ReactiveFormsModule,
    CreateEditCodigoComponent,
    CreateEditPrecioVentaComponent,
    CreateEditSaboresComponent
  ],
  templateUrl: './create-edit-producto.component.html',
  styleUrls: ['./create-edit-producto.component.scss'],
  styles: [`
    .empty-tab-message {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      text-align: center;
    }

    .empty-tab-message mat-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      margin-bottom: 1rem;
      color: #757575;
    }

    .empty-tab-message p {
      margin-bottom: 1rem;
      color: #616161;
    }

    .presentaciones-tab-content {
      padding: 16px;
    }

    .header-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .header-actions h2 {
      margin: 0;
    }

    .empty-list {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      background-color: #f5f5f5;
      border-radius: 4px;
      margin-top: 16px;
    }

    .empty-list mat-icon {
      font-size: 48px;
      height: 48px;
      width: 48px;
      margin-bottom: 16px;
      color: #757575;
    }

    .empty-list p {
      margin: 0;
      color: #616161;
      text-align: center;
    }

    .empty-list .hint {
      margin-top: 8px;
      font-size: 0.9em;
      color: #9e9e9e;
    }

    .status-badge {
      padding: 4px 8px;
      border-radius: 16px;
      font-size: 12px;
      text-transform: uppercase;
    }

    .active {
      background-color: #e8f5e9;
      color: #2e7d32;
    }

    .inactive {
      background-color: #ffebee;
      color: #c62828;
    }

    /* Dark theme adjustments */
    :host-context(.dark-theme) {
      .empty-list {
        background-color: #1a2737;
      }

      .active {
        background-color: #1b5e20;
        color: #e8f5e9;
      }

      .inactive {
        background-color: #621818;
        color: #ffebee;
      }
    }
  `]
})
export class CreateEditProductoComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() data: any;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  productoForm: FormGroup;
  isEditing = false;
  isLoading = false;
  isUploading = false;
  categorias: Categoria[] = [];
  subcategorias: Subcategoria[] = [];

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

  // Flag to track if data has been processed to prevent multiple processing
  private dataProcessed = false;

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
      nombre: ['', Validators.required],
      nombreAlternativo: [''],
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
      alertarVencimientoDias: [null],
      observacion: [''],
      activo: [true]
    });
  }

  ngOnInit(): void {
    // Load categories regardless of edit or create
    this.loadCategorias();

    // Setup form control listeners
    this.setupFormControlListeners();

    // Apply initial data if available
    if (this.data && !this.dataProcessed) {
      this.setData(this.data);
      this.dataProcessed = true;
    }
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
            alertarVencimientoDias: producto.alertarVencimientoDias,
            observacion: producto.observacion || '',
            activo: producto.activo
          });

          // Load subcategories for the selected category
          this.loadSubcategoriasByCategoria(producto.subcategoria.categoria.id);

          // Load product images
          this.loadProductImages();

          // Load presentations
          this.loadProductoPresentaciones(producto.id);
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

  // Set up listeners for form control changes
  private setupFormControlListeners(): void {
    // When categoria changes, load subcategorias
    this.productoForm.get('categoriaId')?.valueChanges.subscribe((categoriaId) => {
      if (categoriaId) {
        this.loadSubcategoriasByCategoria(categoriaId);
      } else {
        this.subcategorias = [];
      }
    });

    // Toggle-dependent validators
    this.productoForm.get('hasVencimiento')?.valueChanges.subscribe(hasVencimiento => {
      const alertarControl = this.productoForm.get('alertarVencimientoDias');
      if (hasVencimiento) {
        alertarControl?.setValidators([Validators.required, Validators.min(1)]);
        if (!alertarControl?.value) {
          alertarControl?.setValue(30); // Default value
        }
      } else {
        alertarControl?.clearValidators();
        alertarControl?.setValue(null);
      }
      alertarControl?.updateValueAndValidity();
    });
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

  // Opens the file selector dialog
  openFileSelector(): void {
    if (this.fileInput && this.fileInput.nativeElement) {
      this.fileInput.nativeElement.click();
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

  private async uploadImage(file: File, isMain: boolean = false): Promise<string> {
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

  async onSubmit(): Promise<void> {
    if (this.productoForm.invalid) {
      // Mark all fields as touched to show validation errors
      this.markFormGroupTouched(this.productoForm);
      this.snackBar.open('Por favor complete todos los campos requeridos', 'Cerrar', { duration: 3000 });
      return;
    }

    this.isLoading = true;
    this.submitted = true;

    try {
      // Get form values
      const formData = { ...this.productoForm.value };

      // Convert string values to uppercase
      if (formData.nombre) formData.nombre = formData.nombre.toUpperCase();
      if (formData.nombreAlternativo) formData.nombreAlternativo = formData.nombreAlternativo.toUpperCase();
      if (formData.observacion) formData.observacion = formData.observacion.toUpperCase();

      // Set main image URL if it exists
      const mainImage = this.productImages.find(img => img.isMain);
      if (mainImage) {
        formData.imageUrl = mainImage.imageUrl;
      }

      let savedProducto: Producto;

      if (this.isEditing && this.producto?.id) {
        // Update existing product
        savedProducto = await firstValueFrom(
          this.repositoryService.updateProducto(this.producto.id, formData)
        );

        this.snackBar.open('Producto actualizado exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new product
        savedProducto = await firstValueFrom(
          this.repositoryService.createProducto(formData)
        );

        this.snackBar.open('Producto creado exitosamente', 'Cerrar', { duration: 3000 });
      }

      // Update component state with the saved product
      this.producto = savedProducto;
      this.isEditing = true;

      // Update any pending image associations
      await this.uploadImages();

      // Reload the product to get the latest data including images
      if (savedProducto.id) {
        this.loadProducto(savedProducto.id);
      }
    } catch (error) {
      console.error('Error saving producto:', error);
      this.snackBar.open('Error al guardar el producto', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
      this.submitted = false;
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
      alertarVencimientoDias: null,
      observacion: ''
    });

    // Clear images
    this.productImages = [];
    this.isEditing = false;
    this.producto = undefined;

    // Enable all form fields
    Object.keys(this.productoForm.controls).forEach(key => {
      this.productoForm.get(key)?.enable();
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
    this.dialog.open(CreateEditPrecioVentaComponent, {
      width: '800px',
      maxHeight: '90vh',
      panelClass: 'no-padding-dialog',
      data: { presentacion }
    });
  }

  /**
   * Load product presentations
   */
  async loadProductoPresentaciones(productoId: number): Promise<void> {
    try {
      const presentaciones = await firstValueFrom(this.repositoryService.getPresentacionesByProducto(productoId));
      if (this.producto) {
        this.producto.presentaciones = presentaciones;
      }
    } catch (error) {
      console.error('Error loading presentaciones:', error);
      this.snackBar.open('Error al cargar las presentaciones del producto', 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Open dialog to create a new presentacion
   */
  openPresentacionDialog(presentacion?: Presentacion): void {
    if (!this.producto) {
      this.snackBar.open('Debe guardar el producto primero', 'Cerrar', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(CreateEditPresentacionDialogComponent, {
      width: '550px',
      disableClose: true,
      data: {
        producto: this.producto,
        presentacion: presentacion,
        editMode: !!presentacion
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
    try {
      const confirmed = confirm(`¿Está seguro que desea eliminar la presentación "${presentacion.descripcion || 'Sin descripción'}"?`);

      if (!confirmed) {
        return;
      }

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
    this.dialog.open(CreateEditSaboresComponent, {
      width: '800px',
      maxHeight: '90vh',
      disableClose: false,
      data: { presentacion }
    });
  }

  /**
   * Gets the display label for a TipoMedida enum value
   */
  getTipoMedidaLabel(tipo: TipoMedida): string {
    const labels: Record<TipoMedida, string> = {
      [TipoMedida.UNIDAD]: 'Unidad',
      [TipoMedida.PAQUETE]: 'Paquete',
      [TipoMedida.GRAMO]: 'Gramo',
      [TipoMedida.LITRO]: 'Litro'
    };

    return labels[tipo] || tipo;
  }
}
