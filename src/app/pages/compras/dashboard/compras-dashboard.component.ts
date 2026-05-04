import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { TabsService } from '../../../services/tabs.service';
import { ListProveedoresComponent } from '../proveedores/list-proveedores.component';
import { ListCompraCategoriasComponent } from '../categorias/list-compra-categorias.component';
import { ListComprasComponent } from '../list-compras/list-compras.component';
import { CreateEditCompraComponent } from '../create-edit-compra/create-edit-compra.component';

@Component({
  selector: 'app-compras-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule
  ],
  templateUrl: './compras-dashboard.component.html',
  styleUrls: ['./compras-dashboard.component.scss']
})
export class ComprasDashboardComponent implements OnInit {
  // Dashboard cards
  dashboardItems = [
    {
      title: 'Compras',
      description: 'Listar y gestionar compras a proveedores',
      icon: 'shopping_cart',
      route: 'compras',
      color: '#4caf50'
    },
    {
      title: 'Proveedores',
      description: 'Administrar proveedores',
      icon: 'business',
      route: 'proveedores',
      color: '#2196f3'
    },
    {
      title: 'Categorías de Compra',
      description: 'Administrar categorías para clasificar compras',
      icon: 'category',
      route: 'compra-categorias',
      color: '#5d4037'
    }
  ];

  constructor(
    private router: Router,
    private tabsService: TabsService
  ) {}

  ngOnInit(): void {
    console.log('Compras Dashboard initialized');
  }

  navigateTo(route: string): void {
    if (route === 'compras') {
      this.tabsService.openTab(
        'Compras',
        ListComprasComponent,
        { source: 'dashboard' },
        'compras-tab',
        true
      );
    } else if (route === 'proveedores') {
      this.tabsService.openTab(
        'Proveedores',
        ListProveedoresComponent,
        { source: 'dashboard' },
        'proveedores-tab',
        true
      );
    } else if (route === 'compra-categorias') {
      this.tabsService.openTab(
        'Categorías de Compra',
        ListCompraCategoriasComponent,
      );
    }
  }

  createCompra(): void {
    this.tabsService.openTab(
      'Nueva compra',
      CreateEditCompraComponent,
      { mode: 'create' },
      `nueva-compra-${Date.now()}`,
      true,
    );
  }

  // Used by the tab service
  setData(data: any): void {
    console.log('Setting data for Compras Dashboard component:', data);
  }
}
