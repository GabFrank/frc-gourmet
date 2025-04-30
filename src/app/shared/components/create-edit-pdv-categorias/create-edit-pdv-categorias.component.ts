import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { PdvGrupoCategoria } from '../../../database/entities/ventas/pdv-grupo-categoria.entity';
import { PdvCategoria } from '../../../database/entities/ventas/pdv-categoria.entity';
import { PdvCategoriaItem } from '../../../database/entities/ventas/pdv-categoria-item.entity';
import { PdvItemProducto } from '../../../database/entities/ventas/pdv-item-producto.entity';
import { Producto } from '../../../database/entities/productos/producto.entity';

export interface CreateEditPdvCategoriasData {
  action: 'create' | 'edit';
  type: 'grupo' | 'categoria' | 'item' | 'producto';
  entity?: any;
  parentEntity?: any;
}

@Component({
  selector: 'app-create-edit-pdv-categorias',
  templateUrl: './create-edit-pdv-categorias.component.html',
  styleUrls: ['./create-edit-pdv-categorias.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTabsModule,
    MatDividerModule,
    MatTooltipModule
  ]
})
export class CreateEditPdvCategoriasComponent implements OnInit {
  // Forms for each entity type
  grupoForm: FormGroup;
  categoriaForm: FormGroup;
  itemForm: FormGroup;
  productoForm: FormGroup;
  
  // The active form based on entity type
  activeForm!: FormGroup;
  
  // Title and action text
  title = '';
  actionText = '';
  
  // Data lists
  gruposCategorias: PdvGrupoCategoria[] = [];
  categorias: PdvCategoria[] = [];
  items: PdvCategoriaItem[] = [];
  productos: Producto[] = [];
  
  // Loading states
  loading = false;
  submitting = false;
  
  // Image handling
  imageFile: File | null = null;
  imagePreview: string | ArrayBuffer | null = null;
  
  constructor(
    private dialogRef: MatDialogRef<CreateEditPdvCategoriasComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CreateEditPdvCategoriasData,
    private formBuilder: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    // Initialize forms
    this.grupoForm = this.formBuilder.group({
      id: [null],
      nombre: ['', Validators.required],
      activo: [true]
    });
    
    this.categoriaForm = this.formBuilder.group({
      id: [null],
      nombre: ['', Validators.required],
      grupoCategoriId: [null, Validators.required],
      activo: [true]
    });
    
    this.itemForm = this.formBuilder.group({
      id: [null],
      nombre: ['', Validators.required],
      categoriaId: [null, Validators.required],
      imagen: [null],
      activo: [true]
    });
    
    this.productoForm = this.formBuilder.group({
      id: [null],
      categoriaItemId: [null, Validators.required],
      productoId: [null, Validators.required],
      nombre_alternativo: [''],
      activo: [true]
    });
    
    // Set active form based on entity type
    this.setActiveForm();
    
    // Set title and action text based on action and type
    this.setTitleAndAction();
  }
  
  async ngOnInit(): Promise<void> {
    await this.loadRequiredData();
    
    // Populate form if editing
    if (this.data.action === 'edit' && this.data.entity) {
      this.populateFormForEdit();
    } else if (this.data.action === 'create' && this.data.parentEntity) {
      this.setupFormForCreate();
    }
  }
  
  /**
   * Set the active form based on entity type
   */
  private setActiveForm(): void {
    switch (this.data.type) {
      case 'grupo':
        this.activeForm = this.grupoForm;
        break;
      case 'categoria':
        this.activeForm = this.categoriaForm;
        break;
      case 'item':
        this.activeForm = this.itemForm;
        break;
      case 'producto':
        this.activeForm = this.productoForm;
        break;
      default:
        this.activeForm = this.grupoForm;
    }
  }
  
  /**
   * Set title and action text based on action and type
   */
  private setTitleAndAction(): void {
    const actionLabel = this.data.action === 'create' ? 'Crear' : 'Editar';
    
    switch (this.data.type) {
      case 'grupo':
        this.title = `${actionLabel} Grupo de Categoría`;
        this.actionText = this.data.action === 'create' ? 'Crear grupo' : 'Actualizar grupo';
        break;
      case 'categoria':
        this.title = `${actionLabel} Categoría`;
        this.actionText = this.data.action === 'create' ? 'Crear categoría' : 'Actualizar categoría';
        break;
      case 'item':
        this.title = `${actionLabel} Item`;
        this.actionText = this.data.action === 'create' ? 'Crear item' : 'Actualizar item';
        break;
      case 'producto':
        this.title = `${actionLabel} Producto PDV`;
        this.actionText = this.data.action === 'create' ? 'Asignar producto' : 'Actualizar producto';
        break;
    }
  }
  
  /**
   * Load required data based on entity type
   */
  private async loadRequiredData(): Promise<void> {
    this.loading = true;
    
    try {
      // Load required data based on entity type
      const requests = [];
      
      // Always load grupos if we need them
      if (this.data.type === 'grupo' || this.data.type === 'categoria') {
        requests.push(firstValueFrom(this.repositoryService.getPdvGrupoCategorias())
          .then(grupos => this.gruposCategorias = grupos));
      }
      
      // Load categorias if needed
      if (this.data.type === 'categoria' || this.data.type === 'item') {
        requests.push(firstValueFrom(this.repositoryService.getPdvCategorias())
          .then(categorias => this.categorias = categorias));
      }
      
      // Load items if needed
      if (this.data.type === 'item' || this.data.type === 'producto') {
        requests.push(firstValueFrom(this.repositoryService.getPdvCategoriaItems())
          .then(items => this.items = items));
      }
      
      // Load productos if needed
      if (this.data.type === 'producto') {
        requests.push(firstValueFrom(this.repositoryService.getProductos())
          .then(productos => this.productos = productos));
      }
      
      // Wait for all requests to complete
      await Promise.all(requests);
      
    } catch (error) {
      console.error('Error loading required data:', error);
      this.showSnackBar('Error al cargar datos necesarios');
    } finally {
      this.loading = false;
    }
  }
  
  /**
   * Populate form with entity data when editing
   */
  private populateFormForEdit(): void {
    const entity = this.data.entity;
    
    switch (this.data.type) {
      case 'grupo':
        this.grupoForm.patchValue({
          id: entity.id,
          nombre: entity.nombre,
          activo: entity.activo
        });
        break;
        
      case 'categoria':
        this.categoriaForm.patchValue({
          id: entity.id,
          nombre: entity.nombre,
          grupoCategoriId: entity.grupoCategoriId,
          activo: entity.activo
        });
        break;
        
      case 'item':
        this.itemForm.patchValue({
          id: entity.id,
          nombre: entity.nombre,
          categoriaId: entity.categoriaId,
          imagen: entity.imagen,
          activo: entity.activo
        });
        
        // Set image preview if available
        if (entity.imagen) {
          this.imagePreview = entity.imagen;
        }
        break;
        
      case 'producto': {
        // When editing a product assignment, entity contains both itemProducto and producto
        const itemProducto = entity.itemProducto;
        
        this.productoForm.patchValue({
          id: itemProducto.id,
          categoriaItemId: itemProducto.categoriaItemId,
          productoId: itemProducto.productoId,
          nombre_alternativo: itemProducto.nombre_alternativo,
          activo: itemProducto.activo
        });
        break;
      }
    }
  }
  
  /**
   * Setup form defaults when creating new entity based on parent
   */
  private setupFormForCreate(): void {
    const parent = this.data.parentEntity;
    
    switch (this.data.type) {
      case 'categoria':
        // Parent is a grupo
        this.categoriaForm.patchValue({
          grupoCategoriId: parent.id
        });
        break;
        
      case 'item':
        // Parent is a categoria
        this.itemForm.patchValue({
          categoriaId: parent.id
        });
        break;
        
      case 'producto':
        // Parent is an item
        this.productoForm.patchValue({
          categoriaItemId: parent.id
        });
        break;
    }
  }
  
  /**
   * Save form based on entity type
   */
  async save(): Promise<void> {
    if (this.activeForm.invalid) {
      this.showSnackBar('Por favor complete todos los campos requeridos');
      return;
    }
    
    this.submitting = true;
    
    try {
      const formData = this.activeForm.value;
      
      switch (this.data.type) {
        case 'grupo':
          await this.saveGrupo(formData);
          break;
          
        case 'categoria':
          await this.saveCategoria(formData);
          break;
          
        case 'item':
          await this.saveItem(formData);
          break;
          
        case 'producto':
          await this.saveProducto(formData);
          break;
      }
      
      // Close dialog with success
      this.dialogRef.close(true);
      
    } catch (error) {
      console.error('Error saving:', error);
      this.showSnackBar(`Error al guardar: ${(error as Error).message}`);
    } finally {
      this.submitting = false;
    }
  }
  
  /**
   * Save grupo entity
   */
  private async saveGrupo(formData: any): Promise<void> {
    if (formData.id) {
      // Update existing
      await firstValueFrom(this.repositoryService.updatePdvGrupoCategoria(formData.id, formData));
      this.showSnackBar('Grupo actualizado correctamente');
    } else {
      // Create new
      await firstValueFrom(this.repositoryService.createPdvGrupoCategoria(formData));
      this.showSnackBar('Grupo creado correctamente');
    }
  }
  
  /**
   * Save categoria entity
   */
  private async saveCategoria(formData: any): Promise<void> {
    if (formData.id) {
      // Update existing
      await firstValueFrom(this.repositoryService.updatePdvCategoria(formData.id, formData));
      this.showSnackBar('Categoría actualizada correctamente');
    } else {
      // Create new
      await firstValueFrom(this.repositoryService.createPdvCategoria(formData));
      this.showSnackBar('Categoría creada correctamente');
    }
  }
  
  /**
   * Save item entity with image handling
   */
  private async saveItem(formData: any): Promise<void> {
    // Handle image upload if there is a new image selected
    if (this.imageFile) {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
          if (e.target?.result) {
            try {
              formData.imagen = e.target.result as string;
              await this.saveItemWithImage(formData);
              resolve();
            } catch (error) {
              reject(error);
            }
          } else {
            reject(new Error('Error al leer la imagen'));
          }
        };
        reader.onerror = () => reject(new Error('Error al leer la imagen'));
        reader.readAsDataURL(this.imageFile as Blob);
      });
    } else {
      // Save without changing image
      await this.saveItemWithImage(formData);
    }
  }
  
  /**
   * Save item with image data
   */
  private async saveItemWithImage(formData: any): Promise<void> {
    if (formData.id) {
      // Update existing item
      await firstValueFrom(this.repositoryService.updatePdvCategoriaItem(formData.id, formData));
      this.showSnackBar('Item actualizado correctamente');
    } else {
      // Create new item
      await firstValueFrom(this.repositoryService.createPdvCategoriaItem(formData));
      this.showSnackBar('Item creado correctamente');
    }
  }
  
  /**
   * Save producto assignment
   */
  private async saveProducto(formData: any): Promise<void> {
    if (formData.id) {
      // Update existing producto assignment
      await firstValueFrom(this.repositoryService.updatePdvItemProducto(formData.id, formData));
      this.showSnackBar('Asignación actualizada correctamente');
    } else {
      // Create new producto assignment
      await firstValueFrom(this.repositoryService.createPdvItemProducto(formData));
      this.showSnackBar('Producto asignado correctamente');
    }
  }
  
  /**
   * Handle image selection
   */
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.imageFile = input.files[0];
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.imagePreview = e.target?.result || null;
      };
      
      if (this.imageFile) {
        reader.readAsDataURL(this.imageFile);
      }
    }
  }
  
  /**
   * Clear selected image
   */
  clearImage(): void {
    this.imageFile = null;
    this.imagePreview = null;
    this.itemForm.patchValue({ imagen: null });
  }
  
  /**
   * Show snackbar message
   */
  private showSnackBar(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }
  
  /**
   * Close dialog
   */
  cancel(): void {
    this.dialogRef.close(false);
  }
} 