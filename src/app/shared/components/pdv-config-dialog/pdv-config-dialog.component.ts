import { Component, OnInit, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { RepositoryService } from '../../../database/repository.service';
import { PdvGrupoCategoria } from '../../../database/entities/ventas/pdv-grupo-categoria.entity';
import { PdvCategoria } from '../../../database/entities/ventas/pdv-categoria.entity';
import { PdvCategoriaItem } from '../../../database/entities/ventas/pdv-categoria-item.entity';
import { PdvItemProducto } from '../../../database/entities/ventas/pdv-item-producto.entity';
import { Producto } from '../../../database/entities/productos/producto.entity';

export interface PdvConfigDialogData {
  activeTab?: number;
}

@Component({
  selector: 'app-pdv-config-dialog',
  templateUrl: './pdv-config-dialog.component.html',
  styleUrls: ['./pdv-config-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatTabsModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    MatPaginatorModule,
    MatProgressSpinnerModule
  ]
})
export class PdvConfigDialogComponent implements OnInit {
  // Forms
  grupoForm: FormGroup;
  categoriaForm: FormGroup;
  itemForm: FormGroup;
  productoForm: FormGroup;

  // Data lists
  gruposCategorias: PdvGrupoCategoria[] = [];
  categorias: PdvCategoria[] = [];
  items: PdvCategoriaItem[] = [];
  itemProductos: PdvItemProducto[] = [];
  productos: Producto[] = [];

  // Selected items for editing
  selectedGrupo: PdvGrupoCategoria | null = null;
  selectedCategoria: PdvCategoria | null = null;
  selectedItem: PdvCategoriaItem | null = null;
  selectedItemProducto: PdvItemProducto | null = null;

  // Loading states
  isLoading = true;
  isSubmitting = false;

  // Table columns
  gruposColumns: string[] = ['id', 'nombre', 'activo', 'actions'];
  categoriasColumns: string[] = ['id', 'nombre', 'grupoCategoria', 'activo', 'actions'];
  itemsColumns: string[] = ['id', 'nombre', 'categoria', 'activo', 'actions'];
  productosColumns: string[] = ['id', 'nombre', 'item', 'producto', 'nombreAlternativo', 'activo', 'actions'];

  // Image base64 storage
  imageBase64: string | null = null;

  loading = true;
  selectedTab = 0;
  
  // Grupos
  grupos: PdvGrupoCategoria[] = [];
  allGrupos: PdvGrupoCategoria[] = [];
  
  // Categorías
  allCategorias: PdvCategoria[] = [];
  editingCategoria: PdvCategoria | null = null;
  
  // Items
  allItems: PdvCategoriaItem[] = [];
  editingItem: PdvCategoriaItem | null = null;
  
  // Productos
  editingProducto: PdvItemProducto | null = null;
  selectedImageFile: File | null = null;
  imagePreview: string | ArrayBuffer | null = null;

  constructor(
    private dialogRef: MatDialogRef<PdvConfigDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PdvConfigDialogData,
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
      activo: [true],
      imagen: [null]
    });

    this.productoForm = this.formBuilder.group({
      id: [null],
      categoriaItemId: [null, Validators.required],
      productoId: [null, Validators.required],
      nombre_alternativo: [''],
      activo: [true]
    });

    // Set active tab if provided
    if (data?.activeTab !== undefined) {
      this.selectedTab = data.activeTab;
    }
  }

  async ngOnInit(): Promise<void> {
    await this.loadInitialData();
  }

  async loadInitialData(): Promise<void> {
    try {
      this.loading = true;
      await Promise.all([
        this.loadGruposCategorias(),
        this.loadAllProductos()
      ]);

      this.loading = false;
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.showSnackBar('Error cargando datos iniciales: ' + (error as Error).message);
      this.loading = false;
    }
  }

  async loadGruposCategorias(): Promise<void> {
    try {
      const result = await firstValueFrom(this.repositoryService.getPdvGrupoCategorias());
      this.gruposCategorias = result;
      this.allGrupos = result;
    } catch (error) {
      console.error('Error loading grupos categorias:', error);
      this.showSnackBar('Error cargando grupos de categorías: ' + (error as Error).message);
    }
  }

  async loadCategorias(grupoId?: number): Promise<void> {
    try {
      if (grupoId) {
        // If a grupoId is provided, filter categories by grupo
        const allCategorias = await firstValueFrom(this.repositoryService.getPdvCategorias());
        this.categorias = allCategorias.filter(cat => cat.grupoCategoriId === grupoId);
      } else {
        // Otherwise load all categories
        this.categorias = await firstValueFrom(this.repositoryService.getPdvCategorias());
      }
      this.allCategorias = this.categorias;
    } catch (error) {
      console.error('Error loading categorias:', error);
      this.showSnackBar('Error cargando categorías: ' + (error as Error).message);
    }
  }

  async loadItems(categoriaId?: number): Promise<void> {
    try {
      if (categoriaId) {
        // If a categoriaId is provided, filter items by categoria
        const allItems = await firstValueFrom(this.repositoryService.getPdvCategoriaItems());
        this.items = allItems.filter(item => item.categoriaId === categoriaId);
      } else {
        // Otherwise load all items
        this.items = await firstValueFrom(this.repositoryService.getPdvCategoriaItems());
      }
      this.allItems = this.items;
    } catch (error) {
      console.error('Error loading items:', error);
      this.showSnackBar('Error cargando items: ' + (error as Error).message);
    }
  }

  async loadItemProductos(itemId?: number): Promise<void> {
    try {
      if (itemId) {
        // If an itemId is provided, filter item productos by item
        this.itemProductos = await firstValueFrom(this.repositoryService.getPdvItemProductosByItem(itemId));
      } else {
        // Otherwise load all item productos
        this.itemProductos = await firstValueFrom(this.repositoryService.getPdvItemProductos());
      }
    } catch (error) {
      console.error('Error loading item productos:', error);
      this.showSnackBar('Error cargando asignaciones de productos: ' + (error as Error).message);
    }
  }

  async loadAllProductos(): Promise<void> {
    try {
      this.productos = await firstValueFrom(this.repositoryService.getProductos());
    } catch (error) {
      console.error('Error loading productos:', error);
      this.showSnackBar('Error cargando productos: ' + (error as Error).message);
    }
  }

  // Tab handling
  onTabChange(index: number): void {
    this.selectedTab = index;
    this.resetForms();
  }
  
  // Form reset
  resetForms(): void {
    this.grupoForm.reset({ activo: true });
    this.categoriaForm.reset({ activo: true });
    this.itemForm.reset({ activo: true });
    this.productoForm.reset({ activo: true, nombre_alternativo: '' });
    
    this.selectedGrupo = null;
    this.selectedCategoria = null;
    this.selectedItem = null;
    this.selectedItemProducto = null;
    
    this.selectedImageFile = null;
    this.imagePreview = null;
  }

  // Grupo Categoria methods
  editGrupo(grupo: PdvGrupoCategoria): void {
    this.selectedGrupo = grupo;
    this.grupoForm.patchValue({
      id: grupo.id,
      nombre: grupo.nombre,
      activo: grupo.activo
    });
  }

  async saveGrupo(): Promise<void> {
    if (this.grupoForm.invalid) {
      this.showSnackBar('Por favor complete todos los campos requeridos');
      return;
    }

    try {
      this.isSubmitting = true;
      const formData = this.grupoForm.value;
      
      if (formData.id) {
        // Update existing grupo
        await firstValueFrom(this.repositoryService.updatePdvGrupoCategoria(formData.id, formData));
        this.showSnackBar('Grupo actualizado correctamente');
      } else {
        // Create new grupo
        await firstValueFrom(this.repositoryService.createPdvGrupoCategoria(formData));
        this.showSnackBar('Grupo creado correctamente');
      }
      
      // Refresh data and reset form
      await this.loadGruposCategorias();
      this.resetGrupoForm();
    } catch (error) {
      console.error('Error saving grupo:', error);
      this.showSnackBar('Error guardando grupo: ' + (error as Error).message);
    } finally {
      this.isSubmitting = false;
    }
  }

  async deleteGrupo(id: number): Promise<void> {
    if (!confirm('¿Está seguro de eliminar este grupo de categoría?')) {
      return;
    }

    try {
      await firstValueFrom(this.repositoryService.deletePdvGrupoCategoria(id));
      this.showSnackBar('Grupo eliminado correctamente');
      await this.loadGruposCategorias();
    } catch (error) {
      console.error('Error deleting grupo:', error);
      this.showSnackBar('Error eliminando grupo: ' + (error as Error).message);
    }
  }

  resetGrupoForm(): void {
    this.grupoForm.reset({ activo: true });
    this.selectedGrupo = null;
  }

  // Categoria methods
  editCategoria(categoria: PdvCategoria): void {
    this.selectedCategoria = categoria;
    this.categoriaForm.patchValue({
      id: categoria.id,
      nombre: categoria.nombre,
      grupoCategoriId: categoria.grupoCategoriId,
      activo: categoria.activo
    });
  }

  async saveCategoria(): Promise<void> {
    if (this.categoriaForm.invalid) {
      this.showSnackBar('Por favor complete todos los campos requeridos');
      return;
    }

    try {
      this.isSubmitting = true;
      const formData = this.categoriaForm.value;
      
      if (formData.id) {
        // Update existing categoria
        await firstValueFrom(this.repositoryService.updatePdvCategoria(formData.id, formData));
        this.showSnackBar('Categoría actualizada correctamente');
      } else {
        // Create new categoria
        await firstValueFrom(this.repositoryService.createPdvCategoria(formData));
        this.showSnackBar('Categoría creada correctamente');
      }
      
      // Refresh data and reset form
      await this.loadCategorias();
      this.resetCategoriaForm();
    } catch (error) {
      console.error('Error saving categoria:', error);
      this.showSnackBar('Error guardando categoría: ' + (error as Error).message);
    } finally {
      this.isSubmitting = false;
    }
  }

  async deleteCategoria(id: number): Promise<void> {
    if (!confirm('¿Está seguro de eliminar esta categoría?')) {
      return;
    }

    try {
      await firstValueFrom(this.repositoryService.deletePdvCategoria(id));
      this.showSnackBar('Categoría eliminada correctamente');
      await this.loadCategorias();
    } catch (error) {
      console.error('Error deleting categoria:', error);
      this.showSnackBar('Error eliminando categoría: ' + (error as Error).message);
    }
  }

  resetCategoriaForm(): void {
    this.categoriaForm.reset({ activo: true });
    this.selectedCategoria = null;
  }

  // Item methods
  editItem(item: PdvCategoriaItem): void {
    this.selectedItem = item;
    this.itemForm.patchValue({
      id: item.id,
      nombre: item.nombre,
      categoriaId: item.categoriaId,
      imagen: item.imagen,
      activo: item.activo
    });
    this.imageBase64 = item.imagen || null;
  }

  async saveItem(): Promise<void> {
    if (this.itemForm.invalid) {
      this.showSnackBar('Por favor complete todos los campos requeridos');
      return;
    }

    try {
      this.isSubmitting = true;
      const formData = this.itemForm.value;
      
      // Handle image upload if there is a new image selected
      if (this.selectedImageFile) {
        const reader = new FileReader();
        reader.onload = async (e) => {
          if (e.target?.result) {
            formData.imagen = e.target.result as string;
            await this.saveItemWithImage(formData);
          }
        };
        reader.readAsDataURL(this.selectedImageFile);
      } else {
        await this.saveItemWithImage(formData);
      }
      
    } catch (error) {
      console.error('Error saving item:', error);
      this.showSnackBar('Error guardando item: ' + (error as Error).message);
      this.isSubmitting = false;
    }
  }

  private async saveItemWithImage(formData: any): Promise<void> {
    try {
      if (formData.id) {
        // Update existing item
        await firstValueFrom(this.repositoryService.updatePdvCategoriaItem(formData.id, formData));
        this.showSnackBar('Item actualizado correctamente');
      } else {
        // Create new item
        await firstValueFrom(this.repositoryService.createPdvCategoriaItem(formData));
        this.showSnackBar('Item creado correctamente');
      }
      
      // Refresh data and reset form
      await this.loadItems();
      this.resetItemForm();
    } finally {
      this.isSubmitting = false;
    }
  }

  async deleteItem(id: number): Promise<void> {
    if (!confirm('¿Está seguro de eliminar este item?')) {
      return;
    }

    try {
      await firstValueFrom(this.repositoryService.deletePdvCategoriaItem(id));
      this.showSnackBar('Item eliminado correctamente');
      await this.loadItems();
    } catch (error) {
      console.error('Error deleting item:', error);
      this.showSnackBar('Error eliminando item: ' + (error as Error).message);
    }
  }

  resetItemForm(): void {
    this.itemForm.reset({ activo: true });
    this.selectedItem = null;
    this.imageBase64 = null;
  }

  // Handle image upload
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedImageFile = input.files[0];
      
      // Preview the image
      const reader = new FileReader();
      reader.onload = (e) => {
        this.imagePreview = e.target?.result || null;
      };
      reader.readAsDataURL(this.selectedImageFile);
    }
  }

  // Item Producto methods
  editItemProducto(itemProducto: PdvItemProducto): void {
    this.selectedItemProducto = itemProducto;
    this.productoForm.patchValue({
      id: itemProducto.id,
      categoriaItemId: itemProducto.categoriaItemId,
      productoId: itemProducto.productoId,
      nombre_alternativo: itemProducto.nombre_alternativo,
      activo: itemProducto.activo
    });
  }

  async saveItemProducto(): Promise<void> {
    if (this.productoForm.invalid) {
      this.showSnackBar('Por favor complete todos los campos requeridos');
      return;
    }

    try {
      this.isSubmitting = true;
      const formData = this.productoForm.value;
      
      if (formData.id) {
        // Update existing item producto
        await firstValueFrom(this.repositoryService.updatePdvItemProducto(formData.id, formData));
        this.showSnackBar('Asignación actualizada correctamente');
      } else {
        // Create new item producto
        await firstValueFrom(this.repositoryService.createPdvItemProducto(formData));
        this.showSnackBar('Asignación creada correctamente');
      }
      
      // Refresh data and reset form
      await this.loadItemProductos();
      this.resetProductoForm();
    } catch (error) {
      console.error('Error saving item producto:', error);
      this.showSnackBar('Error guardando asignación: ' + (error as Error).message);
    } finally {
      this.isSubmitting = false;
    }
  }

  async deleteItemProducto(id: number): Promise<void> {
    if (!confirm('¿Está seguro de eliminar esta asignación de producto?')) {
      return;
    }

    try {
      await firstValueFrom(this.repositoryService.deletePdvItemProducto(id));
      this.showSnackBar('Asignación eliminada correctamente');
      await this.loadItemProductos();
    } catch (error) {
      console.error('Error deleting item producto:', error);
      this.showSnackBar('Error eliminando asignación: ' + (error as Error).message);
    }
  }

  resetProductoForm(): void {
    this.productoForm.reset({ activo: true });
    this.selectedItemProducto = null;
  }

  // Helper methods
  showSnackBar(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom'
    });
  }

  onGrupoSelected(event: any): void {
    const grupoId = event.value;
    if (grupoId) {
      this.loadCategorias(grupoId);
    }
  }

  onCategoriaSelected(event: any): void {
    const categoriaId = event.value;
    if (categoriaId) {
      this.loadItems(categoriaId);
    }
  }

  onItemSelected(event: any): void {
    const itemId = event.value;
    if (itemId) {
      this.loadItemProductos(itemId);
    }
  }

  close(): void {
    this.dialogRef.close();
  }

  getGrupoNombre(id: number | undefined): string {
    if (!id) return 'N/A';
    const grupo = this.allGrupos.find(g => g.id === id);
    return grupo ? grupo.nombre : 'N/A';
  }

  getCategoriaNombre(id: number | undefined): string {
    if (!id) return 'N/A';
    const categoria = this.allCategorias.find(c => c.id === id);
    return categoria ? categoria.nombre : 'N/A';
  }

  getItemNombre(id: number | undefined): string {
    if (!id) return 'N/A';
    const item = this.allItems.find(i => i.id === id);
    return item ? item.nombre : 'N/A';
  }

  getProductoNombre(id: number | undefined): string {
    if (!id) return 'N/A';
    const producto = this.productos.find(p => p.id === id);
    return producto ? producto.nombre : 'N/A';
  }
} 