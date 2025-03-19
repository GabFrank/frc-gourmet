import { Component, Inject, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
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
import { RepositoryService } from '../../../database/repository.service';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { ProductoImage } from '../../../database/entities/productos/producto-image.entity';
import { Subcategoria } from '../../../database/entities/productos/subcategoria.entity';
import { Categoria } from '../../../database/entities/productos/categoria.entity';
import { firstValueFrom } from 'rxjs';
import { TabsService } from '../../../services/tabs.service';
import { ImageViewerComponent } from '../../../components/image-viewer/image-viewer.component';

// Interface for product image handling
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
    ReactiveFormsModule
  ],
  templateUrl: './create-edit-producto.component.html',
  styleUrls: ['./create-edit-producto.component.scss']
})
export class CreateEditProductoComponent implements OnInit {
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

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private tabsService: TabsService,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private dialog: MatDialog
  ) {
    // Initialize the form with appropriate disabled states
    this.productoForm = this.fb.group({
      nombre: ['', [Validators.required]],
      nombreAlternativo: [''],
      iva: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
      stock: [{value: 0, disabled: false}, [Validators.min(0)]],
      subcategoriaId: [{value: null, disabled: true}, [Validators.required]],
      categoriaId: [null, [Validators.required]],
      isPesable: [false],
      isCombo: [false],
      isCompuesto: [false],
      isIngrediente: [false],
      isPromocion: [false],
      isVendible: [true],
      hasVencimiento: [false],
      hasStock: [true],
      alertarVencimientoDias: [{value: 30, disabled: true}],
      observacion: [''],
      activo: [true]
    });
  }

  ngOnInit(): void {
    // Get product data from tab if provided
    const tabs = this.tabsService.getCurrentTabs();
    const activeTabId = this.tabsService.getActiveTabId();
    const activeTab = tabs.find(tab => tab.id === activeTabId);

    if (activeTab?.data?.producto) {
      this.producto = activeTab.data.producto;
      this.isEditing = true;
    }

    this.loadCategorias();

    if (this.isEditing && this.producto) {
      this.loadProducto();
      this.loadProductImages();
    }

    // When categoria changes, load subcategorias and enable subcategoria selector
    this.productoForm.get('categoriaId')?.valueChanges.subscribe((categoriaId) => {
      if (categoriaId) {
        this.loadSubcategoriasByCategoria(categoriaId);
        this.productoForm.get('subcategoriaId')?.enable();

        // Reset subcategoriaId if it belongs to a different categoria
        const currentSubcategoriaId = this.productoForm.get('subcategoriaId')?.value;
        if (currentSubcategoriaId) {
          const belongsToCategoria = this.subcategorias.some(
            s => s.id === currentSubcategoriaId && s.categoriaId === categoriaId
          );

          if (!belongsToCategoria) {
            this.productoForm.get('subcategoriaId')?.setValue(null);
          }
        }
      } else {
        this.subcategorias = [];
        this.productoForm.get('subcategoriaId')?.setValue(null);
        this.productoForm.get('subcategoriaId')?.disable();
      }
    });

    // Toggle-dependent validators
    this.productoForm.get('hasVencimiento')?.valueChanges.subscribe(hasVencimiento => {
      const alertarControl = this.productoForm.get('alertarVencimientoDias');
      if (hasVencimiento) {
        alertarControl?.enable();
      } else {
        alertarControl?.disable();
      }
    });

    this.productoForm.get('hasStock')?.valueChanges.subscribe(hasStock => {
      const stockControl = this.productoForm.get('stock');
      if (hasStock) {
        stockControl?.enable();
      } else {
        stockControl?.disable();
      }
    });
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

  loadProducto(): void {
    if (!this.producto) return;

    this.isLoading = true;
    try {
      // Get categoria ID from the subcategoria
      let categoriaId = null;
      if (this.producto.subcategoria?.categoriaId) {
        categoriaId = this.producto.subcategoria.categoriaId;
        // Load subcategorias for this categoria
        this.loadSubcategoriasByCategoria(categoriaId);
        // Make sure subcategoriaId is enabled if we have a categoriaId
        if (categoriaId) {
          this.productoForm.get('subcategoriaId')?.enable();
        }
      }

      // Create form patch object
      const patchObject: any = {
        nombre: this.producto.nombre,
        nombreAlternativo: this.producto.nombreAlternativo || '',
        iva: this.producto.iva || 10,
        subcategoriaId: this.producto.subcategoriaId,
        categoriaId: categoriaId,
        isPesable: this.producto.isPesable || false,
        isCombo: this.producto.isCombo || false,
        isCompuesto: this.producto.isCompuesto || false,
        isIngrediente: this.producto.isIngrediente || false,
        isPromocion: this.producto.isPromocion || false,
        isVendible: this.producto.isVendible !== false, // Default to true
        hasVencimiento: this.producto.hasVencimiento || false,
        hasStock: this.producto.hasStock || false,
        alertarVencimientoDias: this.producto.alertarVencimientoDias || 30,
        observacion: this.producto.observacion || '',
        activo: this.producto.activo !== false // Default to true
      };

      // Patch form with existing producto data
      this.productoForm.patchValue(patchObject);

      // Explicitly handle the form control states based on conditional values
      // Note: This needs to run after the patchValue to ensure the values are set correctly
      if (this.producto.hasVencimiento) {
        this.productoForm.get('alertarVencimientoDias')?.enable();
      } else {
        this.productoForm.get('alertarVencimientoDias')?.disable();
      }

      if (this.producto.hasStock) {
        this.productoForm.get('stock')?.enable();
      } else {
        this.productoForm.get('stock')?.disable();
      }
    } catch (error) {
      console.error('Error loading producto data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // New method to load product images
  async loadProductImages(): Promise<void> {
    if (!this.producto?.id) return;

    this.isLoading = true;
    try {
      // Get images from repository
      const images = await firstValueFrom(this.repositoryService.getProductImages(this.producto.id));
      
      // If legacy single image exists but no images in the new system, add it
      if (images.length === 0 && this.producto.imageUrl) {
        this.productImages = [{
          imageUrl: this.producto.imageUrl,
          isMain: true,
          orden: 0
        }];
      } else {
        // Sort by order
        this.productImages = images.sort((a, b) => a.orden - b.orden)
          .map(img => ({
            id: img.id,
            imageUrl: img.imageUrl,
            isMain: img.isMain,
            orden: img.orden
          }));
      }

      // Set current image to main image if exists
      const mainImageIndex = this.productImages.findIndex(img => img.isMain);
      if (mainImageIndex >= 0) {
        this.currentImageIndex = mainImageIndex;
      }
    } catch (error) {
      console.error('Error loading product images:', error);
      this.snackBar.open('Error al cargar imágenes del producto', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
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

  removeCurrentImage(index?: number): void {
    // If index is provided, use it, otherwise use currentImageIndex
    const imageIndex = typeof index === 'number' ? index : this.currentImageIndex;
    
    if (this.productImages.length === 0 || imageIndex < 0 || imageIndex >= this.productImages.length) return;
    
    const image = this.productImages[imageIndex];
    
    // If this is the main image, set the next one as main
    if (image.isMain && this.productImages.length > 1) {
      const nextIndex = (imageIndex + 1) % this.productImages.length;
      this.productImages[nextIndex].isMain = true;
    }
    
    // If it has an ID, mark for deletion instead of removing immediately
    if (image.id) {
      image.toDelete = true;
    } else {
      // Remove from array if it's a new image
      this.productImages.splice(imageIndex, 1);
    }
    
    // Adjust current index
    if (this.productImages.length > 0) {
      this.currentImageIndex = Math.min(imageIndex, this.productImages.length - 1);
    } else {
      this.currentImageIndex = -1;
    }
    
    // Force change detection to update the UI
    this.cdr.detectChanges();
  }

  setMainImage(index: number): void {
    if (index < 0 || index >= this.productImages.length) return;
    
    // Remove main flag from all images
    this.productImages.forEach(img => img.isMain = false);
    
    // Set the selected image as main
    this.productImages[index].isMain = true;
    this.currentImageIndex = index;
    
    // Force change detection to update the UI
    this.cdr.detectChanges();
  }

  navigateImages(direction: 'prev' | 'next'): void {
    if (this.productImages.length <= 1) return;
    
    if (direction === 'next') {
      this.currentImageIndex = (this.currentImageIndex + 1) % this.productImages.length;
    } else {
      this.currentImageIndex = (this.currentImageIndex - 1 + this.productImages.length) % this.productImages.length;
    }
  }

  getCurrentImage(): ProductImageModel | null {
    if (this.productImages.length === 0 || this.currentImageIndex < 0) return null;
    return this.productImages[this.currentImageIndex];
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
            
            // If this is editing mode and the product ID exists, save the image association
            if (this.isEditing && this.producto?.id) {
              await firstValueFrom(
                this.repositoryService.createProductImage({
                  productoId: this.producto.id,
                  imageUrl: result.imageUrl,
                  isMain,
                  orden: this.productImages.findIndex(img => img.file === file)
                })
              );
            }
            
            resolve(result.imageUrl);
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
      this.markFormGroupTouched(this.productoForm);
      return;
    }

    this.isLoading = true;
    try {
      // Get form values
      const formValues = this.productoForm.getRawValue();

      // Find main image
      const mainImage = this.productImages.find(img => img.isMain && !img.toDelete);
      
      // Prepare data for saving
      const productoData: Partial<Producto> = {
        ...formValues,
        nombre: formValues.nombre?.toUpperCase() || '',
        nombreAlternativo: formValues.nombreAlternativo?.toUpperCase() || null,
        observacion: formValues.observacion?.toUpperCase() || null,
        imageUrl: mainImage?.imageUrl // Keep legacy support for main image
      };

      let savedProducto: Producto;
      
      if (this.isEditing && this.producto) {
        // Update existing producto
        savedProducto = await firstValueFrom(
          this.repositoryService.updateProducto(this.producto.id!, productoData)
        );
        this.snackBar.open('Producto actualizado correctamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new producto
        savedProducto = await firstValueFrom(
          this.repositoryService.createProducto(productoData)
        );
        this.snackBar.open('Producto creado correctamente', 'Cerrar', { duration: 3000 });
      }

      // Handle all images (upload new, update existing, delete marked)
      if (this.productImages.length > 0) {
        // For new producto, we need to associate the images with the new product ID
        if (!this.isEditing) {
          // Find images that were just added (isNew flag)
          const newImages = this.productImages.filter(img => img.isNew && !img.toDelete);
          
          // Associate each image with the new product
          for (let i = 0; i < newImages.length; i++) {
            const image = newImages[i];
            if (!image.file) continue;
            
            const imageUrl = await this.uploadImage(image.file, image.isMain);
            
            await firstValueFrom(
              this.repositoryService.createProductImage({
                productoId: savedProducto.id!,
                imageUrl,
                isMain: image.isMain,
                orden: i
              })
            );
          }
        } else {
          // For existing productos, handle image changes
          await this.uploadImages();
        }
      }

      // Close the tab
      this.goBack();
    } catch (error) {
      console.error('Error saving producto:', error);
      this.snackBar.open('Error al guardar el producto', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Cancel form and go back
   */
  cancel(): void {
    this.goBack();
  }

  /**
   * Go back to previous page or close tab
   */
  goBack(): void {
    // Close the tab
    const activeTabId = this.tabsService.getActiveTabId();
    if (activeTabId) {
      this.tabsService.removeTab(activeTabId);
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
    // Log to console to verify the image URL
    
    const dialogConfig = new MatDialogConfig();
    dialogConfig.width = '90%';
    dialogConfig.height = '85%';
    dialogConfig.maxHeight = '90vh';
    dialogConfig.panelClass = document.body.classList.contains('dark-theme') 
      ? ['image-viewer-dialog', 'dark-theme'] 
      : 'image-viewer-dialog';
    dialogConfig.data = {
      imageUrl: image.imageUrl,
      title: this.productoForm.get('nombre')?.value || 'Imagen del Producto'
    };
    
    const dialogRef = this.dialog.open(ImageViewerComponent, dialogConfig);
    
    // Prevent clicks inside dialog from closing it accidentally
    dialogRef.disableClose = true;
  }
}
