import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { Venta, VentaEstado } from '../../../database/entities/ventas/venta.entity';
import { Caja } from '../../../database/entities/financiero/caja.entity';
import { DetalleVentaDialogComponent } from '../../../shared/components/detalle-venta-dialog/detalle-venta-dialog.component';
import { FiltrosVentasDialogComponent, FiltrosAvanzados } from '../../../shared/components/filtros-ventas-dialog/filtros-ventas-dialog.component';
import { canalDeVenta, CANAL_VENTA_LABEL, ORIGEN_VENTA_LABEL } from '../../../shared/utils/canal-venta.util';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { HasPermissionDirective } from 'src/app/shared/directives/has-permission.directive';

export interface VentaRow {
  venta: Venta;
  total: number;
  duracion: string;
  formaPago: string;
  /** SALÓN / MOSTRADOR / DELIVERY / RETIRO — se calcula con la fuente única. */
  canal: string;
  /** Chip extra cuando el pedido no lo cargó el cajero (WEB / QR MESA). */
  origen: string | null;
  /** Zona del reparto, o el repartidor si no hay zona. Vacío si no es reparto. */
  detalleCanal: string;
}

@Component({
  selector: 'app-list-ventas',
  templateUrl: './list-ventas.component.html',
  styleUrls: ['./list-ventas.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    MatDialogModule,
    MatPaginatorModule,
    MatTooltipModule,
    MatBadgeModule,
    HasPermissionDirective,
  ],
})
export class ListVentasComponent implements OnInit {
  ventaRows: VentaRow[] = [];
  displayedColumns = ['id', 'fecha', 'canal', 'mesa', 'cajero', 'formaPago', 'estado', 'total', 'duracion', 'acciones'];

  // Filtros básicos
  fechaDesde: Date = new Date();
  fechaHasta: Date = new Date();
  estadoFiltro: string = '';
  cajaFiltro: number | null = null;
  estados = Object.values(VentaEstado);
  cajas: Caja[] = [];
  fechasDeshabilitadas = false;

  // Filtros avanzados (estado persistente)
  filtrosAvanzados: FiltrosAvanzados = {};
  filtrosAvanzadosCount = 0;

  /** Total de envío cobrado en TODO el resultado filtrado, no en la página. */
  totalCostoDelivery = 0;
  hayCostoDelivery = false;

  // Paginación
  totalVentas = 0;
  pageSize = 25;
  pageIndex = 0;
  pageSizeOptions = [25, 50, 100];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog
  ) {
    this.fechaDesde.setHours(0, 0, 0, 0);
    this.fechaHasta.setHours(23, 59, 59, 999);
  }

  async ngOnInit(): Promise<void> {
    await this.loadCajas();
    await this.filtrar();
  }

  private async loadCajas(): Promise<void> {
    const allCajas = await firstValueFrom(this.repositoryService.getCajas());
    // Últimas 20 cajas
    this.cajas = allCajas.slice(0, 20);
  }

  getCajaLabel(caja: Caja): string {
    const dispositivo = caja.dispositivo?.nombre || 'S/D';
    const fecha = caja.fechaApertura ? new Date(caja.fechaApertura).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
    const cajero = (caja as any).createdBy?.persona?.nombre || '';
    return `#${caja.id} - ${dispositivo} - ${fecha} - ${cajero}`;
  }

  onCajaChange(): void {
    this.fechasDeshabilitadas = this.cajaFiltro != null;
    this.filtrar();
  }

  async filtrar(): Promise<void> {
    const filtros: any = {
      page: this.pageIndex + 1,
      pageSize: this.pageSize,
    };

    if (this.estadoFiltro) filtros.estado = this.estadoFiltro;
    if (this.cajaFiltro) filtros.cajaId = this.cajaFiltro;

    // Filtros avanzados
    if (this.filtrosAvanzados.mozoId) filtros.mozoId = this.filtrosAvanzados.mozoId;
    if (this.filtrosAvanzados.formasPagoIds?.length) filtros.formasPagoIds = this.filtrosAvanzados.formasPagoIds;
    if (this.filtrosAvanzados.monedaIds?.length) filtros.monedaIds = this.filtrosAvanzados.monedaIds;
    if (this.filtrosAvanzados.mesaId) filtros.mesaId = this.filtrosAvanzados.mesaId;
    if (this.filtrosAvanzados.monedaValorId) filtros.monedaValorId = this.filtrosAvanzados.monedaValorId;
    if (this.filtrosAvanzados.valorMin != null) filtros.valorMin = this.filtrosAvanzados.valorMin;
    if (this.filtrosAvanzados.valorMax != null) filtros.valorMax = this.filtrosAvanzados.valorMax;
    if (this.filtrosAvanzados.tieneDescuento) filtros.tieneDescuento = this.filtrosAvanzados.tieneDescuento;
    if (this.filtrosAvanzados.dispositivoId) filtros.dispositivoId = this.filtrosAvanzados.dispositivoId;
    if (this.filtrosAvanzados.canal) filtros.canal = this.filtrosAvanzados.canal;
    if (this.filtrosAvanzados.zonaId) filtros.zonaId = this.filtrosAvanzados.zonaId;
    if (this.filtrosAvanzados.repartidorId) filtros.repartidorId = this.filtrosAvanzados.repartidorId;
    if (this.filtrosAvanzados.canalOrigen) filtros.canalOrigen = this.filtrosAvanzados.canalOrigen;

    const result = await firstValueFrom(
      this.repositoryService.getVentasByDateRange(
        this.fechaDesde.toISOString(),
        this.fechaHasta.toISOString(),
        filtros
      )
    );

    this.totalVentas = result.total;
    this.totalCostoDelivery = Number((result as any)?.totales?.costoDelivery ?? 0) || 0;
    this.hayCostoDelivery = this.totalCostoDelivery > 0;
    this.ventaRows = result.data.map(v => ({
      venta: v,
      total: this.calcTotal(v),
      duracion: this.calcDuracion(v),
      formaPago: (v.formaPago as any)?.nombre || '-',
      canal: CANAL_VENTA_LABEL[canalDeVenta(v)],
      // Sólo se muestra si NO lo cargó el cajero: en un local normal la enorme
      // mayoría es LOCAL y repetirlo en cada fila es ruido.
      origen: ((v as any).canalOrigen && (v as any).canalOrigen !== 'LOCAL')
        ? (ORIGEN_VENTA_LABEL[(v as any).canalOrigen] || (v as any).canalOrigen)
        : null,
      detalleCanal: this.detalleDelReparto(v),
    }));
  }

  /** Zona del reparto; si no tiene, el repartidor. Vacío si no es un reparto. */
  private detalleDelReparto(venta: any): string {
    const d = venta?.delivery;
    if (!d) return '';
    const zona = d.precioDelivery?.descripcion;
    if (zona) return String(zona).toUpperCase();
    const rep = d.entregadoPorFuncionario?.persona?.nombre;
    return rep ? String(rep).toUpperCase() : '';
  }

  private calcTotal(venta: Venta): number {
    if (!venta.items) return 0;
    return venta.items.reduce((sum: number, i: any) => {
      if (i.estado === 'ACTIVO') {
        return sum + (i.precioVentaUnitario + (i.precioAdicionales || 0) - (i.descuentoUnitario || 0)) * i.cantidad;
      }
      return sum;
    }, 0);
  }

  private calcDuracion(venta: Venta): string {
    if (!venta.fechaCierre || !venta.createdAt) return '-';
    const ms = new Date(venta.fechaCierre).getTime() - new Date(venta.createdAt).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const restMins = mins % 60;
    return `${hrs}h ${restMins}m`;
  }

  setRango(rango: string): void {
    const now = new Date();
    this.fechaHasta = new Date();
    this.fechaHasta.setHours(23, 59, 59, 999);

    switch (rango) {
      case 'hoy':
        this.fechaDesde = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'semana':
        this.fechaDesde = new Date(now);
        this.fechaDesde.setDate(now.getDate() - now.getDay());
        this.fechaDesde.setHours(0, 0, 0, 0);
        break;
      case 'mes':
        this.fechaDesde = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'trimestre':
        this.fechaDesde = new Date(now);
        this.fechaDesde.setMonth(now.getMonth() - 3);
        this.fechaDesde.setHours(0, 0, 0, 0);
        break;
    }
    this.pageIndex = 0;
    this.filtrar();
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.filtrar();
  }

  resetFiltros(): void {
    this.fechaDesde = new Date();
    this.fechaDesde.setHours(0, 0, 0, 0);
    this.fechaHasta = new Date();
    this.fechaHasta.setHours(23, 59, 59, 999);
    this.estadoFiltro = '';
    this.cajaFiltro = null;
    this.fechasDeshabilitadas = false;
    this.filtrosAvanzados = {};
    this.filtrosAvanzadosCount = 0;
    this.totalCostoDelivery = 0;
    this.hayCostoDelivery = false;
    this.pageIndex = 0;
    this.filtrar();
  }

  openFiltrosAvanzados(): void {
    const dialogRef = this.dialog.open(FiltrosVentasDialogComponent, {
      width: '500px',
      data: { ...this.filtrosAvanzados },
    });

    dialogRef.afterClosed().subscribe((result: FiltrosAvanzados | null | undefined) => {
      if (result !== undefined && result !== null) {
        this.filtrosAvanzados = result;
        this.filtrosAvanzadosCount = this.countActiveFilters(result);
        this.pageIndex = 0;
        this.filtrar();
      }
    });
  }

  private countActiveFilters(f: FiltrosAvanzados): number {
    let count = 0;
    if (f.mozoId) count++;
    if (f.formasPagoIds?.length) count++;
    if (f.monedaIds?.length) count++;
    if (f.mesaId) count++;
    if (f.tieneDescuento) count++;
    if (f.monedaValorId && (f.valorMin != null || f.valorMax != null)) count++;
    if (f.dispositivoId) count++;
    if (f.canal) count++;
    if (f.zonaId) count++;
    if (f.repartidorId) count++;
    if (f.canalOrigen) count++;
    return count;
  }

  verDetalle(venta: Venta): void {
    this.dialog.open(DetalleVentaDialogComponent, {
      width: '80vw',
      height: '80vh',
      data: { venta },
    });
  }

  cancelarVenta(venta: Venta): void {
    // Requiere admin
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'CANCELAR VENTA',
        message: `¿Está seguro de cancelar la venta #${venta.id}? Esta acción requiere autorización de administrador.`,
      },
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        // TODO: validar credenciales admin via validate-credentials
        const estadoAnterior = venta.estado;
        await firstValueFrom(this.repositoryService.updateVenta(venta.id, {
          estado: VentaEstado.CANCELADA,
        }));
        // Revertir stock si la venta estaba CONCLUIDA
        if (estadoAnterior === VentaEstado.CONCLUIDA) {
          this.repositoryService.revertirStockVenta(venta.id).subscribe({
            next: (r) => console.log('Stock revertido:', r),
            error: (e) => console.error('Error revirtiendo stock:', e),
          });
        }
        this.filtrar();
      }
    });
  }

  rehabilitarVenta(venta: Venta): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'REHABILITAR VENTA',
        message: `¿Está seguro de rehabilitar la venta #${venta.id}? La venta pasará a estado CONCLUIDA.`,
      },
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        await firstValueFrom(this.repositoryService.updateVenta(venta.id, {
          estado: VentaEstado.CONCLUIDA,
        }));
        // Re-procesar stock al rehabilitar a CONCLUIDA
        this.repositoryService.procesarStockVenta(venta.id).subscribe({
          next: (r) => console.log('Stock re-procesado:', r),
          error: (e) => console.error('Error re-procesando stock:', e),
        });
        this.filtrar();
      }
    });
  }
}
