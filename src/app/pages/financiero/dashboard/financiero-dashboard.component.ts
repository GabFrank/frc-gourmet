import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TabsService } from 'src/app/services/tabs.service';
import { ConfigMonedasDialogComponent } from '../monedas/config-monedas/config-monedas-dialog.component';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ListCajasComponent } from '../cajas/list-cajas.component';
import { TipoPrecioComponent } from '../tipo-precio/tipo-precio.component';
import { ListDispositivosComponent } from '../dispositivos/list-dispositivos.component';
import { ListMonedasComponent } from '../monedas/list-monedas/list-monedas.component';
import { CreateEditFormaPagoComponent } from '../formas-pago/create-edit-forma-pago.component';

@Component({
  selector: 'app-financiero-dashboard',
  templateUrl: './financiero-dashboard.component.html',
  styleUrls: ['./financiero-dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatGridListModule,
    MatDialogModule,
    MatSnackBarModule
  ]
})
export class FinancieroDashboardComponent implements OnInit {
  // Dashboard cards
  dashboardItems = [
    {
      title: 'Cajas',
      description: 'Administrar cajas, apertura y cierre de cajas',
      icon: 'point_of_sale',
      route: 'cajas',
      color: '#4caf50'
    },
    {
      title: 'Monedas',
      description: 'Administrar monedas y tipos de cambio',
      icon: 'monetization_on',
      route: 'monedas',
      color: '#2196f3'
    },
    {
      title: 'Monedas de Caja',
      description: 'Configurar monedas habilitadas para cajas',
      icon: 'settings_applications',
      route: 'monedas-caja',
      color: '#f44336'
    },
    {
      title: 'Tipos de Precio',
      description: 'Administrar tipos de precio',
      icon: 'sell',
      route: 'tipo-precio',
      color: '#ff9800'
    },
    {
      title: 'Dispositivos',
      description: 'Administrar dispositivos y puntos de venta',
      icon: 'devices',
      route: 'dispositivos',
      color: '#9c27b0'
    },
    {
      title: 'Formas de Pago',
      description: 'Administrar métodos de pago',
      icon: 'payments',
      route: 'formas-pago',
      color: '#e91e63'
    }
  ];

  constructor(
    private router: Router,
    private tabsService: TabsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    // Load any necessary data for the dashboard
    console.log('Financiero Dashboard initialized');
  }

  navigateTo(route: string): void {
    // Navigation logic based on route
    switch (route) {
      case 'cajas':
        this.tabsService.openTab('Cajas', ListCajasComponent);
        break;
      case 'monedas':
        this.tabsService.openTab('Monedas', ListMonedasComponent);
        break;
      case 'tipo-precio':
        this.tabsService.openTab('Tipos de Precio', TipoPrecioComponent);
        break;
      case 'dispositivos':
        this.tabsService.openTab('Dispositivos y Puntos de Venta', ListDispositivosComponent);
        break;
      case 'formas-pago':
        this.openFormasPagoDialog();
        break;
      default:
        break;
    }
  }

  openConfigDialog(): void {
    const dialogRef = this.dialog.open(ConfigMonedasDialogComponent, {
      width: '800px',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Configuración de monedas guardada correctamente', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }

  openFormasPagoDialog(): void {
    const dialogRef = this.dialog.open(CreateEditFormaPagoComponent, {
      width: '800px',
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Configuración de formas de pago guardada correctamente', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }
}
