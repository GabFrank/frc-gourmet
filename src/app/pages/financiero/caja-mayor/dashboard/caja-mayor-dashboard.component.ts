import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { TabsService } from 'src/app/services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { abrirShortcut } from 'src/app/shared/utils/dashboard-shortcut-router';
import { ListCajasMayorComponent } from '../list-cajas-mayor/list-cajas-mayor.component';
import { ListGastosComponent } from '../gastos/list-gastos/list-gastos.component';
import { ListGastoCategoriasComponent } from '../gastos/categorias/list-gasto-categorias.component';
import { ListRetirosCajaComponent } from '../retiros/list-retiros-caja/list-retiros-caja.component';
import { ListCuentasBancariasComponent } from '../bancos/list-cuentas-bancarias/list-cuentas-bancarias.component';
import { ListMaquinasPosComponent } from '../pos/list-maquinas-pos/list-maquinas-pos.component';
import { ListAcreditacionesPosComponent } from '../pos/acreditaciones/list-acreditaciones-pos.component';
import { ListCuentasPorPagarComponent } from '../cuentas-por-pagar/list-cuentas-por-pagar/list-cuentas-por-pagar.component';
import { ListCompraCategoriasComponent } from 'src/app/pages/compras/categorias/list-compra-categorias.component';
import { ListEntradasVariasComponent } from '../entradas-varias/list-entradas-varias/list-entradas-varias.component';
import { ListEntradaVariaCategoriasComponent } from '../entradas-varias/categorias/list-entrada-varia-categorias.component';
import { ListOperacionesFinancierasComponent } from '../operaciones-financieras/list-operaciones-financieras/list-operaciones-financieras.component';
import { ListOperacionFinancieraCategoriasComponent } from '../operaciones-financieras/categorias/list-operacion-financiera-categorias.component';
import { ListChequerasComponent } from '../cheques/list-chequeras/list-chequeras.component';
import { ListChequesComponent } from '../cheques/list-cheques/list-cheques.component';

@Component({
  selector: 'app-caja-mayor-dashboard',
  templateUrl: './caja-mayor-dashboard.component.html',
  styleUrls: ['./caja-mayor-dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
    MatGridListModule,
    MatTooltipModule,
    MatSnackBarModule,
  ]
})
export class CajaMayorDashboardComponent implements OnInit {
  dashboardItems = [
    {
      title: 'Cajas Mayor',
      description: 'Abrir, cerrar y administrar cajas mayor',
      icon: 'account_balance',
      route: 'cajas-mayor',
      color: '#1b5e20'
    },
    {
      title: 'Gastos',
      description: 'Registrar y consultar gastos categorizados',
      icon: 'receipt_long',
      route: 'gastos',
      color: '#e65100'
    },
    {
      title: 'Categorias de Gasto',
      description: 'Administrar categorias y subcategorias de gastos',
      icon: 'category',
      route: 'gasto-categorias',
      color: '#4a148c'
    },
    {
      title: 'Retiros de Caja',
      description: 'Retiros de cajas de venta e ingresos a caja mayor',
      icon: 'move_up',
      route: 'retiros',
      color: '#0d47a1'
    },
    {
      title: 'Cuentas Bancarias',
      description: 'Administrar cuentas bancarias y saldos',
      icon: 'account_balance_wallet',
      route: 'cuentas-bancarias',
      color: '#00695c'
    },
    {
      title: 'Maquinas POS',
      description: 'Configurar terminales de tarjetas con cuenta destino y comisión',
      icon: 'credit_card',
      route: 'maquinas-pos',
      color: '#3949ab'
    },
    {
      title: 'Acreditaciones POS',
      description: 'Verificar acreditaciones, diferencias y comisiones',
      icon: 'fact_check',
      route: 'acreditaciones-pos',
      color: '#ad1457'
    },
    {
      title: 'Cuentas por Pagar',
      description: 'Gestionar deudas, préstamos y cuotas pendientes',
      icon: 'request_quote',
      route: 'cuentas-por-pagar',
      color: '#bf360c'
    },
    {
      title: 'Categorías de Compra',
      description: 'Administrar categorías para clasificar compras',
      icon: 'inventory_2',
      route: 'compra-categorias',
      color: '#5d4037'
    },
    {
      title: 'Entradas Varias',
      description: 'Ingresos no operativos: préstamos recibidos, intereses, devoluciones',
      icon: 'trending_up',
      route: 'entradas-varias',
      color: '#2e7d32'
    },
    {
      title: 'Categorias de Entradas Varias',
      description: 'Administrar categorias para clasificar entradas varias',
      icon: 'category',
      route: 'entrada-varia-categorias',
      color: '#1b5e20'
    },
    {
      title: 'Operaciones Financieras',
      description: 'Cambios de divisa, depositos/retiros bancarios y transferencias entre cajas',
      icon: 'swap_horiz',
      route: 'operaciones-financieras',
      color: '#6a1b9a'
    },
    {
      title: 'Categorias de Op. Financieras',
      description: 'Administrar categorias para clasificar operaciones',
      icon: 'category',
      route: 'operacion-financiera-categorias',
      color: '#4a148c'
    },
    {
      title: 'Chequeras',
      description: 'Administrar chequeras propias asociadas a cuentas bancarias',
      icon: 'menu_book',
      route: 'chequeras',
      color: '#1565c0'
    },
    {
      title: 'Cheques',
      description: 'Emitir, cobrar y anular cheques propios (a la vista o diferidos)',
      icon: 'request_quote',
      route: 'cheques',
      color: '#0d47a1'
    },
  ];

  shortcuts: any[] = [];

  constructor(
    private tabsService: TabsService,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.loadShortcuts();
  }

  setData(data: any): void {}

  async loadShortcuts(): Promise<void> {
    try {
      const list = await firstValueFrom(this.repositoryService.getDashboardShortcuts('CAJA_MAYOR'));
      this.shortcuts = list || [];
    } catch (e) { console.error(e); }
  }

  abrirShortcut(s: any): void {
    abrirShortcut(s, this.tabsService);
  }

  async eliminarShortcut(s: any, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await firstValueFrom(this.repositoryService.deleteDashboardShortcut(s.id));
      this.snackBar.open('Acceso directo eliminado', 'Cerrar', { duration: 2000 });
      this.loadShortcuts();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al eliminar', 'Cerrar', { duration: 3000 });
    }
  }

  navigateTo(route: string): void {
    switch (route) {
      case 'cajas-mayor':
        this.tabsService.openTab('Cajas Mayor', ListCajasMayorComponent);
        break;
      case 'gastos':
        this.tabsService.openTab('Gastos', ListGastosComponent);
        break;
      case 'gasto-categorias':
        this.tabsService.openTab('Categorias de Gasto', ListGastoCategoriasComponent);
        break;
      case 'retiros':
        this.tabsService.openTab('Retiros de Caja', ListRetirosCajaComponent);
        break;
      case 'cuentas-bancarias':
        this.tabsService.openTab('Cuentas Bancarias', ListCuentasBancariasComponent);
        break;
      case 'maquinas-pos':
        this.tabsService.openTab('Maquinas POS', ListMaquinasPosComponent);
        break;
      case 'acreditaciones-pos':
        this.tabsService.openTab('Acreditaciones POS', ListAcreditacionesPosComponent);
        break;
      case 'cuentas-por-pagar':
        this.tabsService.openTab('Cuentas por Pagar', ListCuentasPorPagarComponent);
        break;
      case 'compra-categorias':
        this.tabsService.openTab('Categorías de Compra', ListCompraCategoriasComponent);
        break;
      case 'entradas-varias':
        this.tabsService.openTab('Entradas Varias', ListEntradasVariasComponent);
        break;
      case 'entrada-varia-categorias':
        this.tabsService.openTab('Categorias de Entradas Varias', ListEntradaVariaCategoriasComponent);
        break;
      case 'operaciones-financieras':
        this.tabsService.openTab('Operaciones Financieras', ListOperacionesFinancierasComponent);
        break;
      case 'operacion-financiera-categorias':
        this.tabsService.openTab('Categorias de Op. Financieras', ListOperacionFinancieraCategoriasComponent);
        break;
      case 'chequeras':
        this.tabsService.openTab('Chequeras', ListChequerasComponent);
        break;
      case 'cheques':
        this.tabsService.openTab('Cheques', ListChequesComponent);
        break;
    }
  }
}
