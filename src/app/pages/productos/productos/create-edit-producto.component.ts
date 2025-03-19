import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../database/repository.service';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { Subcategoria } from '../../../database/entities/productos/subcategoria.entity';
import { Categoria } from '../../../database/entities/productos/categoria.entity';
import { firstValueFrom } from 'rxjs';
import { TabsService } from '../../../services/tabs.service';

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
    MatSlideToggleModule,
    MatDividerModule,
    MatTabsModule,
    MatCardModule,
    MatSnackBarModule,
    ReactiveFormsModule
  ],
  templateUrl: './create-edit-producto.component.html',
  styleUrls: ['./create-edit-producto.component.scss']
})
export class CreateEditProductoComponent implements OnInit {
  productoForm: FormGroup;
  isEditing = false;
  isLoading = false;
  categorias: Categoria[] = [];
  subcategorias: Subcategoria[] = [];
  selectedImageFile: File | null = null;
  imagePreviewUrl: string | null = null;
  maxImageSize = 5 * 1024 * 1024; // 5MB
  activeTabIndex = 0;
  producto?: Producto;
  defaultNoImagePath = '/assets/images/no-image.png';
  submitted = false;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private tabsService: TabsService,
    private snackBar: MatSnackBar
  ) {
    this.productoForm = this.fb.group({
      nombre: ['', [Validators.required]],
      nombreAlternativo: [''],
      descripcion: [''],
      iva: [10, [Validators.required, Validators.min(0), Validators.max(100)]],
      stock: [0, [Validators.min(0)]],
      subcategoriaId: [null, [Validators.required]],
      categoriaId: [null, [Validators.required]],
      isPesable: [false],
      isCombo: [false],
      isIngrediente: [false],
      isPromocion: [false],
      isVendible: [true],
      hasVencimiento: [false],
      hasStock: [false],
      alertarVencimientoDias: [30],
      imageUrl: [null],
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
    }

    // When categoria changes, load subcategorias
    this.productoForm.get('categoriaId')?.valueChanges.subscribe((categoriaId) => {
      if (categoriaId) {
        this.loadSubcategoriasByCategoria(categoriaId);

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
      // Set image preview if exists
      if (this.producto.imageUrl) {
        this.imagePreviewUrl = this.producto.imageUrl;
      }

      // Get categoria ID from the subcategoria
      let categoriaId = null;
      if (this.producto.subcategoria?.categoriaId) {
        categoriaId = this.producto.subcategoria.categoriaId;
        // Load subcategorias for this categoria
        this.loadSubcategoriasByCategoria(categoriaId);
      }

      // Patch form with existing producto data
      this.productoForm.patchValue({
        nombre: this.producto.nombre,
        nombreAlternativo: this.producto.nombreAlternativo || '',
        iva: this.producto.iva || 10,
        subcategoriaId: this.producto.subcategoriaId,
        categoriaId: categoriaId,
        isPesable: this.producto.isPesable || false,
        isCombo: this.producto.isCombo || false,
        isIngrediente: this.producto.isIngrediente || false,
        isPromocion: this.producto.isPromocion || false,
        isVendible: this.producto.isVendible !== false, // Default to true
        hasVencimiento: this.producto.hasVencimiento || false,
        hasStock: this.producto.hasStock || false,
        alertarVencimientoDias: this.producto.alertarVencimientoDias || 30,
        imageUrl: this.producto.imageUrl,
        observacion: this.producto.observacion || '',
        activo: this.producto.activo !== false // Default to true
      });

      // Apply conditional disabling
      if (!this.producto.hasVencimiento) {
        this.productoForm.get('alertarVencimientoDias')?.disable();
      }

      if (!this.producto.hasStock) {
        this.productoForm.get('stock')?.disable();
      }
    } catch (error) {
      console.error('Error loading producto data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];

    // Check file size
    if (file.size > this.maxImageSize) {
      alert(`El tamaño de la imagen no debe superar los ${this.maxImageSize / (1024 * 1024)}MB`);
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Por favor, seleccione un archivo de imagen válido');
      return;
    }

    this.selectedImageFile = file;

    // Create preview
    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreviewUrl = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.selectedImageFile = null;
    this.imagePreviewUrl = null;
    this.productoForm.patchValue({ imageUrl: null });
  }

  setActiveTab(index: number): void {
    this.activeTabIndex = index;
  }

  private async uploadImage(file: File): Promise<string> {
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
      // Handle image upload if a new file was selected
      let imageUrl = this.productoForm.get('imageUrl')?.value;
      if (this.selectedImageFile) {
        // If editing and has existing image, delete it first
        if (this.isEditing && this.producto?.imageUrl) {
          await firstValueFrom(
            this.repositoryService.deleteProductoImage(this.producto.imageUrl)
          );
        }

        // Upload the new image
        imageUrl = await this.uploadImage(this.selectedImageFile);
      }

      // Get form values
      const formValues = this.productoForm.getRawValue();

      // Prepare data for saving
      const productoData: Partial<Producto> = {
        ...formValues,
        nombre: formValues.nombre?.toUpperCase() || '',
        nombreAlternativo: formValues.nombreAlternativo?.toUpperCase() || null,
        descripcion: formValues.descripcion?.toUpperCase() || null,
        observacion: formValues.observacion?.toUpperCase() || null,
        imageUrl
      };

      if (this.isEditing && this.producto) {
        // Update existing producto
        const updatedProducto = await firstValueFrom(
          this.repositoryService.updateProducto(this.producto.id!, productoData)
        );
        this.snackBar.open('Producto actualizado correctamente', 'Cerrar', { duration: 3000 });

        // Close the tab
        this.goBack();
      } else {
        // Create new producto
        const createdProducto = await firstValueFrom(
          this.repositoryService.createProducto(productoData)
        );
        this.snackBar.open('Producto creado correctamente', 'Cerrar', { duration: 3000 });

        // Close the tab
        this.goBack();
      }
    } catch (error) {
      console.error('Error saving producto:', error);
      this.snackBar.open('Error al guardar el producto', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  goBack(): void {
    // Close the current tab and return to the product list
    const tabs = this.tabsService.getCurrentTabs();
    const activeTabId = this.tabsService.getActiveTabId();

    if (activeTabId) {
      this.tabsService.removeTab(activeTabId);
    }

    // Find and activate the productos list tab if it exists
    const productosTabId = tabs.find(tab =>
      tab.componentType.name === 'ListProductosComponent' ||
      tab.title === 'Productos')?.id;

    if (productosTabId) {
      this.tabsService.setActiveTab(productosTabId);
    }
  }

  // Helper method to mark all form controls as touched to trigger validation errors
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
      if ((control as any).controls) {
        this.markFormGroupTouched(control as FormGroup);
      }
    });
  }

  cancel(): void {
    this.goBack();
  }
}
