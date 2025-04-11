import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { TabsService } from '../../../services/tabs.service';
import { ListComprasComponent } from '../compras/list-compras.component';
import { CreateEditCompraComponent } from '../compras/create-edit-compra.component';
import { ListProveedoresComponent } from '../proveedores/list-proveedores.component';

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
      description: 'Gestión de compras a proveedores',
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
      title: 'Pagos',
      description: 'Gestión de pagos a proveedores',
      icon: 'payments',
      route: 'pagos',
      color: '#f44336'
    }
  ];

  constructor(
    private router: Router,
    private tabsService: TabsService
  ) {}

  ngOnInit(): void {
    console.log('Compras Dashboard initialized');
  }

  // Method to navigate to different sections
  navigateTo(route: string): void {
    console.log(`Navigating to: ${route}`);

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
    }
  }

  // Create a new compra
  createCompra(): void {
    this.tabsService.openTab(
      'Nueva Compra',
      CreateEditCompraComponent,
      {}, // No specific data needed for new compra
      `nueva-compra-${Date.now()}`, // Unique ID for the tab
      true // Closable
    );
  }

  // Used by the tab service
  setData(data: any): void {
    console.log('Setting data for Compras Dashboard component:', data);
  }
}
