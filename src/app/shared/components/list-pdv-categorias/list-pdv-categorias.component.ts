import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTreeModule, MatTreeNestedDataSource } from '@angular/material/tree';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { MatExpansionModule } from '@angular/material/expansion';
import { NestedTreeControl } from '@angular/cdk/tree';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { PdvGrupoCategoria } from '../../../database/entities/ventas/pdv-grupo-categoria.entity';
import { PdvCategoria } from '../../../database/entities/ventas/pdv-categoria.entity';
import { PdvCategoriaItem } from '../../../database/entities/ventas/pdv-categoria-item.entity';
import { PdvItemProducto } from '../../../database/entities/ventas/pdv-item-producto.entity';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { CreateEditPdvCategoriasComponent } from '../create-edit-pdv-categorias/create-edit-pdv-categorias.component';

/**
 * Node for category item
 */
interface CategoryNode {
  id?: number;
  nombre: string;
  type: 'grupo' | 'categoria' | 'item' | 'producto';
  activo: boolean;
  imagen?: string;
  nombre_alternativo?: string;
  children?: CategoryNode[];
  originalEntity?: any;
}

@Component({
  selector: 'app-list-pdv-categorias',
  templateUrl: './list-pdv-categorias.component.html',
  styleUrls: ['./list-pdv-categorias.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTreeModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatBadgeModule,
    MatExpansionModule
  ]
})
export class ListPdvCategoriasComponent implements OnInit {
  // Tree structure
  treeControl = new NestedTreeControl<CategoryNode>(node => node.children);
  dataSource = new MatTreeNestedDataSource<CategoryNode>();
  
  // Filter
  filterValue = '';
  showInactive = false;
  
  // Loading state
  loading = false;
  
  // Original data
  gruposCategorias: PdvGrupoCategoria[] = [];
  categorias: PdvCategoria[] = [];
  items: PdvCategoriaItem[] = [];
  itemProductos: PdvItemProducto[] = [];
  productos: Producto[] = [];
  
  // Stats for counts
  counts = {
    grupos: 0,
    categorias: 0,
    items: 0,
    productos: 0
  };
  
  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  /**
   * Load all PDV category data and build the tree
   */
  async loadData(): Promise<void> {
    this.loading = true;
    
    try {
      // Load all data in parallel
      const [grupos, categorias, items, itemProductos, productos] = await Promise.all([
        firstValueFrom(this.repositoryService.getPdvGrupoCategorias()),
        firstValueFrom(this.repositoryService.getPdvCategorias()),
        firstValueFrom(this.repositoryService.getPdvCategoriaItems()),
        firstValueFrom(this.repositoryService.getPdvItemProductos()),
        firstValueFrom(this.repositoryService.getProductos())
      ]);
      
      // Store original data
      this.gruposCategorias = grupos;
      this.categorias = categorias;
      this.items = items;
      this.itemProductos = itemProductos;
      this.productos = productos;
      
      // Update counts
      this.updateCounts();
      
      // Build tree
      this.buildTree();
    } catch (error) {
      console.error('Error loading PDV category data:', error);
    } finally {
      this.loading = false;
    }
  }
  
  /**
   * Update the counts of each entity type
   */
  private updateCounts(): void {
    this.counts = {
      grupos: this.gruposCategorias.filter(g => g.activo).length,
      categorias: this.categorias.filter(c => c.activo).length,
      items: this.items.filter(i => i.activo).length,
      productos: this.itemProductos.filter(p => p.activo).length
    };
  }
  
  /**
   * Build the tree structure from the loaded data
   */
  private buildTree(): void {
    const treeData: CategoryNode[] = [];
    
    // Filter entities based on active status if needed
    const filteredGrupos = this.showInactive 
      ? this.gruposCategorias 
      : this.gruposCategorias.filter(g => g.activo);
    
    // Build the tree structure starting with grupos
    for (const grupo of filteredGrupos) {
      // Create grupo node
      const grupoNode: CategoryNode = {
        id: grupo.id,
        nombre: grupo.nombre,
        type: 'grupo',
        activo: grupo.activo,
        children: [],
        originalEntity: grupo
      };
      
      // Find categorias for this grupo
      const grupoId = grupo.id;
      if (grupoId) {
        const filteredCategorias = this.showInactive 
          ? this.categorias.filter(c => c.grupoCategoriId === grupoId)
          : this.categorias.filter(c => c.grupoCategoriId === grupoId && c.activo);
          
        // Add categorias to the grupo node
        for (const categoria of filteredCategorias) {
          const categoriaNode: CategoryNode = {
            id: categoria.id,
            nombre: categoria.nombre,
            type: 'categoria',
            activo: categoria.activo,
            children: [],
            originalEntity: categoria
          };
          
          // Find items for this categoria
          const categoriaId = categoria.id;
          if (categoriaId) {
            const filteredItems = this.showInactive
              ? this.items.filter(i => i.categoriaId === categoriaId)
              : this.items.filter(i => i.categoriaId === categoriaId && i.activo);
              
            // Add items to the categoria node
            for (const item of filteredItems) {
              const itemNode: CategoryNode = {
                id: item.id,
                nombre: item.nombre,
                type: 'item',
                activo: item.activo,
                imagen: item.imagen,
                children: [],
                originalEntity: item
              };
              
              // Find productos for this item
              const itemId = item.id;
              if (itemId) {
                const filteredItemProductos = this.showInactive
                  ? this.itemProductos.filter(ip => ip.categoriaItemId === itemId)
                  : this.itemProductos.filter(ip => ip.categoriaItemId === itemId && ip.activo);
                  
                // Add productos to the item node
                for (const itemProducto of filteredItemProductos) {
                  const producto = this.productos.find(p => p.id === itemProducto.productoId);
                  if (producto) {
                    const productoNode: CategoryNode = {
                      id: itemProducto.id,
                      nombre: itemProducto.nombre_alternativo || producto.nombre || '',
                      type: 'producto',
                      activo: itemProducto.activo,
                      nombre_alternativo: itemProducto.nombre_alternativo,
                      originalEntity: { itemProducto, producto }
                    };
                    
                    itemNode.children?.push(productoNode);
                  }
                }
              }
              
              // Only add the item if it has productos or we're showing all nodes
              if (itemNode.children?.length || this.showInactive) {
                categoriaNode.children?.push(itemNode);
              }
            }
          }
          
          // Only add the categoria if it has items or we're showing all nodes
          if (categoriaNode.children?.length || this.showInactive) {
            grupoNode.children?.push(categoriaNode);
          }
        }
      }
      
      // Only add the grupo if it has categorias or we're showing all nodes
      if (grupoNode.children?.length || this.showInactive) {
        treeData.push(grupoNode);
      }
    }
    
    // Apply text filter if needed
    if (this.filterValue) {
      this.filterTree(treeData);
    }
    
    // Update the data source
    this.dataSource.data = treeData;
    
    // Expand all nodes if filtering
    if (this.filterValue) {
      this.expandAll();
    }
  }
  
  /**
   * Filter the tree based on the current filter value
   */
  private filterTree(nodes: CategoryNode[]): CategoryNode[] {
    const filteredNodes: CategoryNode[] = [];
    const filterLower = this.filterValue.toLowerCase();
    
    for (const node of nodes) {
      // Check if current node matches filter
      const nodeMatches = node.nombre.toLowerCase().includes(filterLower) ||
        (node.nombre_alternativo && node.nombre_alternativo.toLowerCase().includes(filterLower));
      
      // Filter children recursively
      const filteredChildren = node.children ? this.filterTree(node.children) : [];
      
      // Include node if it matches or has matching children
      if (nodeMatches || filteredChildren.length > 0) {
        const clonedNode = { ...node, children: filteredChildren };
        filteredNodes.push(clonedNode);
      }
    }
    
    return filteredNodes;
  }
  
  /**
   * Expand all tree nodes
   */
  expandAll(): void {
    const allNodes = this.treeControl.dataNodes;
    this.treeControl.expandAll();
  }
  
  /**
   * Collapse all tree nodes
   */
  collapseAll(): void {
    this.treeControl.collapseAll();
  }
  
  /**
   * Apply filter when user changes the filter value
   */
  applyFilter(): void {
    this.buildTree();
  }
  
  /**
   * Toggle whether to show inactive items
   */
  toggleShowInactive(): void {
    this.showInactive = !this.showInactive;
    this.buildTree();
  }
  
  /**
   * Clear filter
   */
  clearFilter(): void {
    this.filterValue = '';
    this.buildTree();
  }
  
  /**
   * Check if node has children
   */
  hasChildren = (_: number, node: CategoryNode) => !!node.children && node.children.length > 0;
  
  /**
   * Get icon for node type
   */
  getNodeIcon(node: CategoryNode): string {
    switch (node.type) {
      case 'grupo':
        return 'folder';
      case 'categoria':
        return 'category';
      case 'item':
        return 'grid_view';
      case 'producto':
        return 'inventory_2';
      default:
        return 'help';
    }
  }
  
  /**
   * Get color class for node based on type and active status
   */
  getNodeClass(node: CategoryNode): string {
    let baseClass = `node-${node.type}`;
    
    if (!node.activo) {
      baseClass += ' node-inactive';
    }
    
    return baseClass;
  }
  
  /**
   * Open dialog to create or edit a node
   */
  openCreateEditDialog(action: 'create' | 'edit', type: 'grupo' | 'categoria' | 'item' | 'producto', node?: CategoryNode, parentNode?: CategoryNode): void {
    const dialogRef = this.dialog.open(CreateEditPdvCategoriasComponent, {
      width: '600px',
      disableClose: true,
      data: {
        action,
        type,
        entity: node?.originalEntity,
        parentEntity: parentNode?.originalEntity
      }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        // Reload data if changes were made
        this.loadData();
      }
    });
  }
  
  /**
   * Create a new entity
   */
  createNew(type: 'grupo' | 'categoria' | 'item' | 'producto', parentNode?: CategoryNode): void {
    this.openCreateEditDialog('create', type, undefined, parentNode);
  }
  
  /**
   * Edit an existing entity
   */
  editNode(node: CategoryNode, parentNode?: CategoryNode): void {
    this.openCreateEditDialog('edit', node.type, node, parentNode);
  }
  
  /**
   * Refresh the data
   */
  refresh(): void {
    this.loadData();
  }
} 