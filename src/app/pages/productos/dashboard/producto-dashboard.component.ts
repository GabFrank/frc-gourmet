import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatGridListModule } from '@angular/material/grid-list';
import { RouterModule } from '@angular/router';
import { TabsService } from '../../../services/tabs.service';
import { ListCategoriasComponent } from '../categorias/list-categorias/list-categorias.component';
import { ListProductosComponent } from '../productos/list-productos.component';
import { ListRecetasComponent } from '../recetas/list-recetas.component';
import { ListIngredientesComponent } from '../ingredientes/list-ingredientes.component';
import { ListMovimientosStockComponent } from '../movimientos/list-movimientos-stock.component';
import { MatDialog } from '@angular/material/dialog';
import { ListAdicionalesDialogComponent } from '../adicionales/list-adicionales-dialog/list-adicionales-dialog.component';
import { MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-producto-dashboard',
  templateUrl: './producto-dashboard.component.html',
  styleUrls: ['./producto-dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatGridListModule,
    RouterModule,
    MatDialogModule
  ]
})
export class ProductoDashboardComponent implements OnInit {
  // Statistics variables - will be populated in ngOnInit
  totalProductos = 0;
  totalCategorias = 0;
  totalRecetas = 0;
  totalIngredientes = 0;
  totalMovimientos = 0;
  totalAdicionales = 0;

  constructor(
    private tabsService: TabsService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    // In a real application, we would fetch these values from services
    this.loadDashboardData();
  }

  loadDashboardData(): void {
    // Placeholder values for now
    // In a real implementation, we would fetch these from services
    this.totalProductos = 42;
    this.totalCategorias = 8;
    this.totalRecetas = 15;
    this.totalIngredientes = 35;
    this.totalMovimientos = 120;
    this.totalAdicionales = 18;
  }

  // Navigation methods
  openCategoriasTab(): void {
    this.tabsService.openTab(
      'Categorías',
      ListCategoriasComponent,
      { source: 'dashboard' },
      'categorias-tab',
      true
    );
  }

  openProductosTab(): void {
    this.tabsService.openTab(
      'Productos',
      ListProductosComponent,
      { source: 'dashboard' },
      'productos-tab',
      true
    );
  }

  openRecetasTab(): void {
    this.tabsService.openTab(
      'Recetas',
      ListRecetasComponent,
      { source: 'dashboard' },
      'recetas-tab',
      true
    );
  }

  openIngredientesTab(): void {
    this.tabsService.openTab(
      'Ingredientes',
      ListIngredientesComponent,
      { source: 'dashboard' },
      'ingredientes-tab',
      true
    );
  }

  openMovimientosTab(): void {
    this.tabsService.openTab(
      'Movimientos de Stock',
      ListMovimientosStockComponent,
      { source: 'dashboard' },
      'movimientos-tab',
      true
    );
  }
  
  openAdicionalesDialog(): void {
    const dialogRef = this.dialog.open(ListAdicionalesDialogComponent, {
      width: '90%',
      maxWidth: '1200px',
      height: '70%',
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Handle result if needed
        console.log('Adicionales dialog closed with result:', result);
      }
    });
  }
} 