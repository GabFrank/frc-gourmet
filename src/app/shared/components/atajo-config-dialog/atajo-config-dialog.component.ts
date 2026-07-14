import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { thumbUrl, resolveAppUrl } from '../../utils/image-url.util';

// Common Material icons for quick selection
const COMMON_ICONS = [
  'local_bar', 'local_drink', 'coffee', 'wine_bar', 'sports_bar',
  'restaurant', 'lunch_dining', 'dinner_dining', 'breakfast_dining', 'brunch_dining',
  'local_pizza', 'icecream', 'cake', 'bakery_dining', 'ramen_dining',
  'set_meal', 'tapas', 'kebab_dining', 'egg', 'rice_bowl',
  'fastfood', 'local_cafe', 'emoji_food_beverage', 'liquor', 'nightlife',
  'outdoor_grill', 'soup_kitchen', 'cookie', 'flatware', 'takeout_dining'
];

@Component({
  selector: 'app-atajo-config-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    DragDropModule
  ],
  templateUrl: './atajo-config-dialog.component.html',
  styleUrls: ['./atajo-config-dialog.component.scss']
})
export class AtajoConfigDialogComponent implements OnInit {
  // Data
  grupos: any[] = [];
  allItems: any[] = [];
  itemsDelGrupo: any[] = [];
  productosDelItem: any[] = [];
  allProductos: any[] = [];

  // Selection state
  selectedGrupo: any = null;
  selectedItem: any = null;

  // Forms
  grupoForm: FormGroup;
  itemForm: FormGroup;

  // Edit modes
  editingGrupo = false;
  editingItem = false;
  addingProducto = false;
  productoSearchText = '';

  // UI
  isLoading = true;
  isSaving = false;
  commonIcons = COMMON_ICONS;
  filteredProductos: any[] = [];
  gridSize = 3;
  productosGridSize = 3;
  pdvConfigId: number | null = null;

  constructor(
    public dialogRef: MatDialogRef<AtajoConfigDialogComponent>,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private fb: FormBuilder
  ) {
    this.grupoForm = this.fb.group({
      nombre: ['', Validators.required],
      icono: ['']
    });
    this.itemForm = this.fb.group({
      nombre: ['', Validators.required],
      icono: [''],
      colorFondo: ['#4CAF50'],
      colorTexto: ['#FFFFFF']
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.grupos = await firstValueFrom(this.repositoryService.getPdvAtajoGrupos());
      this.allItems = await firstValueFrom(this.repositoryService.getPdvAtajoItems());
      this.allProductos = await firstValueFrom(this.repositoryService.getProductos());
      this.allProductos = this.allProductos.filter((p: any) => p.activo && p.esVendible);
      // Load grid size from config
      try {
        const config = await firstValueFrom(this.repositoryService.getPdvConfig());
        const cfg = Array.isArray(config) ? config[0] : config;
        if (cfg) {
          this.pdvConfigId = cfg.id;
          this.gridSize = cfg.atajosGridSize || 3;
          this.productosGridSize = cfg.atajosProductosGridSize || 3;
        }
      } catch (e) { /* use default */ }
      if (this.selectedGrupo) {
        await this.selectGrupo(this.selectedGrupo);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.isLoading = false;
    }
  }

  // ========================
  // GRUPO methods
  // ========================

  async selectGrupo(grupo: any): Promise<void> {
    this.selectedGrupo = grupo;
    this.selectedItem = null;
    this.productosDelItem = [];
    this.editingGrupo = false;
    this.editingItem = false;
    try {
      this.itemsDelGrupo = await firstValueFrom(this.repositoryService.getPdvAtajoItemsByGrupo(grupo.id));
    } catch (error) {
      console.error('Error loading items for grupo:', error);
      this.itemsDelGrupo = [];
    }
  }

  startAddGrupo(): void {
    this.grupoForm.reset({ nombre: '', icono: '' });
    this.editingGrupo = true;
    this.selectedGrupo = null;
    this.itemsDelGrupo = [];
    this.selectedItem = null;
  }

  startEditGrupo(grupo: any): void {
    this.grupoForm.patchValue({
      nombre: grupo.nombre,
      icono: grupo.icono || ''
    });
    this.editingGrupo = true;
    this.selectedGrupo = grupo;
  }

  async saveGrupo(): Promise<void> {
    if (this.grupoForm.invalid) return;
    try {
      this.isSaving = true;
      const data = this.grupoForm.value;
      if (this.selectedGrupo?.id) {
        await firstValueFrom(this.repositoryService.updatePdvAtajoGrupo(this.selectedGrupo.id, data));
        this.showSuccess('Grupo actualizado');
      } else {
        data.posicion = this.grupos.length;
        const created = await firstValueFrom(this.repositoryService.createPdvAtajoGrupo(data));
        this.selectedGrupo = created;
        this.showSuccess('Grupo creado');
      }
      this.editingGrupo = false;
      await this.loadData();
    } catch (error) {
      this.showError('Error al guardar grupo');
    } finally {
      this.isSaving = false;
    }
  }

  async deleteGrupo(grupo: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Eliminar grupo', message: `¿Eliminar el grupo "${grupo.nombre}"? Se desvincularán todos los items.` }
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) return;
    try {
      await firstValueFrom(this.repositoryService.deletePdvAtajoGrupo(grupo.id));
      if (this.selectedGrupo?.id === grupo.id) {
        this.selectedGrupo = null;
        this.itemsDelGrupo = [];
        this.selectedItem = null;
      }
      await this.loadData();
      this.showSuccess('Grupo eliminado');
    } catch (error) {
      this.showError('Error al eliminar grupo');
    }
  }

  async onGrupoDrop(event: CdkDragDrop<any[]>): Promise<void> {
    moveItemInArray(this.grupos, event.previousIndex, event.currentIndex);
    const orderedIds = this.grupos.map(g => g.id);
    try {
      await firstValueFrom(this.repositoryService.reorderPdvAtajoGrupos(orderedIds));
    } catch (error) {
      console.error('Error reordering grupos:', error);
    }
  }

  cancelEditGrupo(): void {
    this.editingGrupo = false;
  }

  // ========================
  // ITEM methods
  // ========================

  async selectItem(item: any): Promise<void> {
    this.selectedItem = item;
    this.editingItem = false;
    this.addingProducto = false;
    try {
      this.productosDelItem = await firstValueFrom(this.repositoryService.getPdvAtajoItemProductos(item.id));
    } catch (error) {
      console.error('Error loading productos for item:', error);
      this.productosDelItem = [];
    }
  }

  startAddItem(): void {
    this.itemForm.reset({ nombre: '', icono: '', colorFondo: '#4CAF50' });
    this.editingItem = true;
    this.selectedItem = null;
    this.productosDelItem = [];
  }

  startEditItem(item: any): void {
    this.itemForm.patchValue({
      nombre: item.nombre,
      icono: item.icono || '',
      colorFondo: item.colorFondo || '#4CAF50',
      colorTexto: item.colorTexto || '#FFFFFF'
    });
    this.editingItem = true;
    this.selectedItem = item;
  }

  async saveItem(): Promise<void> {
    if (this.itemForm.invalid || !this.selectedGrupo) return;
    try {
      this.isSaving = true;
      const data = this.itemForm.value;
      if (this.selectedItem?.id) {
        await firstValueFrom(this.repositoryService.updatePdvAtajoItem(this.selectedItem.id, data));
        this.showSuccess('Item actualizado');
      } else {
        const created = await firstValueFrom(this.repositoryService.createPdvAtajoItem(data));
        // Assign to current grupo
        await firstValueFrom(this.repositoryService.assignAtajoItemToGrupo(
          this.selectedGrupo.id, created.id, this.itemsDelGrupo.length
        ));
        this.selectedItem = created;
        this.showSuccess('Item creado y asignado al grupo');
      }
      this.editingItem = false;
      await this.selectGrupo(this.selectedGrupo);
      if (this.selectedItem) {
        await this.selectItem(this.selectedItem);
      }
    } catch (error) {
      this.showError('Error al guardar item');
    } finally {
      this.isSaving = false;
    }
  }

  async deleteItem(item: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Eliminar item', message: `¿Eliminar "${item.nombre}"? Se eliminará de todos los grupos.` }
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) return;
    try {
      await firstValueFrom(this.repositoryService.deletePdvAtajoItem(item.id));
      if (this.selectedItem?.id === item.id) {
        this.selectedItem = null;
        this.productosDelItem = [];
      }
      await this.selectGrupo(this.selectedGrupo);
      this.showSuccess('Item eliminado');
    } catch (error) {
      this.showError('Error al eliminar item');
    }
  }

  async removeItemFromGrupo(item: any): Promise<void> {
    if (!this.selectedGrupo) return;
    try {
      await firstValueFrom(this.repositoryService.removeAtajoItemFromGrupo(this.selectedGrupo.id, item.id));
      await this.selectGrupo(this.selectedGrupo);
      if (this.selectedItem?.id === item.id) {
        this.selectedItem = null;
        this.productosDelItem = [];
      }
      this.showSuccess('Item desvinculado del grupo');
    } catch (error) {
      this.showError('Error al desvincular item');
    }
  }

  async onItemDrop(event: CdkDragDrop<any[]>): Promise<void> {
    if (!this.selectedGrupo) return;
    moveItemInArray(this.itemsDelGrupo, event.previousIndex, event.currentIndex);
    const orderedItemIds = this.itemsDelGrupo.map((i: any) => i.id);
    try {
      await firstValueFrom(this.repositoryService.reorderAtajoItemsInGrupo(this.selectedGrupo.id, orderedItemIds));
    } catch (error) {
      console.error('Error reordering items:', error);
    }
  }

  cancelEditItem(): void {
    this.editingItem = false;
  }

  // ========================
  // PRODUCTO methods
  // ========================

  toggleAddProducto(): void {
    this.addingProducto = !this.addingProducto;
    this.productoSearchText = '';
    this.filteredProductos = [];
  }

  filterProductos(): void {
    if (!this.productoSearchText || this.productoSearchText.length < 2) {
      this.filteredProductos = [];
      return;
    }
    const search = this.productoSearchText.toUpperCase();
    const assignedIds = new Set(this.productosDelItem.map((p: any) => p.productoId));
    this.filteredProductos = this.allProductos
      .filter((p: any) => !assignedIds.has(p.id) && p.nombre.toUpperCase().includes(search))
      .slice(0, 20);
  }

  async addProductoToItem(producto: any): Promise<void> {
    if (!this.selectedItem) return;
    try {
      await firstValueFrom(this.repositoryService.assignProductoToAtajoItem(this.selectedItem.id, producto.id));
      this.productosDelItem = await firstValueFrom(this.repositoryService.getPdvAtajoItemProductos(this.selectedItem.id));
      this.productoSearchText = '';
      this.filteredProductos = [];
      this.showSuccess(`${producto.nombre} agregado`);
    } catch (error) {
      this.showError('Error al agregar producto');
    }
  }

  // ========================
  // GRID SIZE
  // ========================

  async changeGridSize(size: number): Promise<void> {
    this.gridSize = size;
    if (this.pdvConfigId) {
      try {
        await firstValueFrom(this.repositoryService.updatePdvConfig(this.pdvConfigId, { atajosGridSize: size } as any));
      } catch (error) {
        this.showError('Error al guardar tamaño');
      }
    }
  }

  async changeProductosGridSize(size: number): Promise<void> {
    this.productosGridSize = size;
    if (this.pdvConfigId) {
      try {
        await firstValueFrom(this.repositoryService.updatePdvConfig(this.pdvConfigId, { atajosProductosGridSize: size } as any));
      } catch (error) {
        this.showError('Error al guardar tamaño');
      }
    }
  }

  async removeProducto(itemProducto: any): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.removeProductoFromAtajoItem(itemProducto.id));
      this.productosDelItem = this.productosDelItem.filter((p: any) => p.id !== itemProducto.id);
      this.showSuccess('Producto removido');
    } catch (error) {
      this.showError('Error al remover producto');
    }
  }

  /** URL renderizable del thumb (con fallback al original vía proxy en cliente). */
  thumbFor(url?: string | null): string | undefined {
    return thumbUrl(url) || resolveAppUrl(url ?? undefined);
  }

  /** Si el thumb no existe (imágenes legacy), cae al original. */
  onThumbError(event: Event, originalUrl?: string | null): void {
    const img = event.target as HTMLImageElement;
    const fallback = resolveAppUrl(originalUrl);
    if (fallback && img.src !== fallback) {
      img.src = fallback;
    }
  }

  // ========================
  // Helpers
  // ========================

  private showSuccess(msg: string): void {
    this.snackBar.open(msg, 'Cerrar', { duration: 2000, horizontalPosition: 'end', verticalPosition: 'top' });
  }

  private showError(msg: string): void {
    this.snackBar.open(msg, 'Cerrar', { duration: 3000, horizontalPosition: 'end', verticalPosition: 'top' });
  }
}
