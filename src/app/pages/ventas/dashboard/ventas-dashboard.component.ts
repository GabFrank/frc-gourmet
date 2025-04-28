import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RepositoryService } from '../../../database/repository.service';
import { TabsService } from '../../../services/tabs.service';
import { PdvComponent } from '../pdv/pdv.component';
import { PdvConfigDialogComponent } from 'src/app/shared/components/pdv-config-dialog/pdv-config-dialog.component';
import { MatDialog } from '@angular/material/dialog';
@Component({
  selector: 'app-ventas-dashboard',
  templateUrl: './ventas-dashboard.component.html',
  styleUrls: ['./ventas-dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class VentasDashboardComponent implements OnInit {

  // Statistics
  totalSalesCount = 0;
  deliveryCount = 0;
  pendingDeliveries = 0;
  todaysSalesCount = 0;

  constructor(
    private repository: RepositoryService,
    private tabsService: TabsService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    this.loadStats();
  }

  loadStats(): void {
    // TODO: Implement fetching actual statistics from the repository
    // For now, using placeholder values
    this.totalSalesCount = 123;
    this.deliveryCount = 45;
    this.pendingDeliveries = 7;
    this.todaysSalesCount = 25;
  }

  openPdv(): void {
    this.tabsService.openTab('Punto de Venta (PDV)', PdvComponent);
  }

  openSalesList(): void {
    // TODO: Implement when we have a sales list component
    // this.tabsService.openTab('Listado de Ventas', ListVentasComponent);
  }

  openDeliveryList(): void {
    // TODO: Implement when we have a delivery list component
    // this.tabsService.openTab('Listado de Deliveries', ListDeliveriesComponent);
  }

  openPdvConfigDialog(): void {
    // its a dialog not a tab
    this.dialog.open(PdvConfigDialogComponent, {
      width: '600px'
    });
  }
} 