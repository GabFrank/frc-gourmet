import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { TabsService } from '../../../services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { ListFamiliasComponent } from '../familias/list-familias.component';
import { ListProductosComponent } from '../list-productos/list-productos.component';
import { GestionarProductoComponent } from '../gestionar-producto/gestionar-producto.component';
import { ListRecetasComponent } from '../../gestion-recetas/list-recetas/list-recetas.component';
import { ListSaboresComponent } from '../../gestion-sabores/list-sabores/list-sabores.component';
import { DashStatChipComponent } from 'src/app/shared/components/dashboard/stat-chip/dash-stat-chip.component';
import { DashQuickActionComponent } from 'src/app/shared/components/dashboard/quick-action/dash-quick-action.component';
import { DashRankingListComponent, DashRankingItem } from 'src/app/shared/components/dashboard/ranking-list/dash-ranking-list.component';
import { DashSectionHeaderComponent } from 'src/app/shared/components/dashboard/section-header/dash-section-header.component';

@Component({
  selector: 'app-productos-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    DashStatChipComponent,
    DashQuickActionComponent,
    DashRankingListComponent,
    DashSectionHeaderComponent,
  ],
  templateUrl: './productos-dashboard.component.html',
  styleUrls: ['./productos-dashboard.component.scss'],
})
export class ProductosDashboardComponent implements OnInit {
  loading = true;

  quickActions = [
    { title: 'Productos', icon: 'restaurant', action: 'productos', color: '#f44336' },
    { title: 'Familias', icon: 'category', action: 'familias', color: '#4caf50' },
    { title: 'Recetas', icon: 'menu_book', action: 'recetas', color: '#795548' },
    { title: 'Sabores', icon: 'local_pizza', action: 'sabores', color: '#ffc107' },
  ];

  productosActivos = 0;
  recetasActivas = 0;
  productosSinPrecio = 0;
  productosParciales = 0;

  topCmv: DashRankingItem[] = [];
  productosParcialesLista: any[] = [];
  topVendidos: DashRankingItem[] = [];

  constructor(
    private tabsService: TabsService,
    private repository: RepositoryService,
  ) {}

  ngOnInit(): void {
    this.cargarKpis();
  }

  setData(_data: any): void {}

  async cargarKpis(): Promise<void> {
    this.loading = true;
    try {
      const k = await firstValueFrom(this.repository.getDashboardProductosKpis());
      if (k) {
        this.productosActivos = k.productosActivos || 0;
        this.recetasActivas = k.recetasActivas || 0;
        this.productosSinPrecio = k.productosSinPrecio || 0;
        this.productosParciales = k.productosParciales || 0;
        this.productosParcialesLista = k.productosParcialesLista || [];
        const cmvList = k.topCmv || [];
        const maxMargen = cmvList.reduce((m: number, c: any) => Math.max(m, Number(c.margen || 0)), 0);
        this.topCmv = cmvList.map((c: any) => ({
          nombre: c.nombre,
          valorPrincipal: `${c.margen.toFixed(1)}%`,
          valorSecundario: `${this.formatPYG(c.precioVenta)} / ${this.formatPYG(c.precioCosto)} Gs`,
          porcentaje: maxMargen > 0 ? Math.round((Number(c.margen) / maxMargen) * 100) : 0,
          payload: { id: c.id, nombre: c.nombre },
        }));
        this.topVendidos = (k.topVendidos || []).map((p: any) => ({
          nombre: p.nombre,
          valorPrincipal: `${p.cantidad} uds`,
          valorSecundario: `${this.formatPYG(p.total)} Gs`,
          porcentaje: p.porcentaje,
          payload: { id: p.id, nombre: p.nombre },
        }));
      }
    } catch (e) {
      console.error('Error cargando KPIs productos', e);
    } finally {
      this.loading = false;
    }
  }

  formatPYG(v: number): string {
    return (v || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
  }

  navigateTo(action: string): void {
    switch (action) {
      case 'productos':
        this.tabsService.openTab('Productos', ListProductosComponent, { source: 'dashboard' }, 'productos-tab', true);
        break;
      case 'familias':
        this.tabsService.openTab('Familias', ListFamiliasComponent, { source: 'dashboard' }, 'familias-tab', true);
        break;
      case 'recetas':
        this.tabsService.openTab('Recetas', ListRecetasComponent, { source: 'dashboard' }, 'recetas-tab', true);
        break;
      case 'sabores':
        this.tabsService.openTab('Sabores', ListSaboresComponent, { source: 'dashboard' }, 'sabores-tab', true);
        break;
    }
  }

  openProducto(id: number, nombre?: string): void {
    if (!id) return;
    this.tabsService.openTab(
      `Editar Producto${nombre ? ' - ' + nombre : ''}`,
      GestionarProductoComponent,
      { mode: 'edit', productoId: id },
      `editar-producto-${id}-tab`,
    );
  }

  onRankingClick(item: DashRankingItem): void {
    const p = item.payload;
    if (p?.id) this.openProducto(p.id, p.nombre);
  }
}
