import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ReportePeriodoControlComponent } from '../reporte-periodo-control/reporte-periodo-control.component';
import { ReportePeriodoParams } from '../reporte-models';

/**
 * Pantalla "Reportes de Ventas" (cierre de mes). Fase 0: andamiaje (header +
 * control de período + carga del handler). Fase 2 agrega las tarjetas/gráficos.
 */
@Component({
  selector: 'app-ventas-reportes',
  templateUrl: './ventas-reportes.component.html',
  styleUrls: ['./ventas-reportes.component.scss'],
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule, MatTooltipModule,
    MatProgressSpinnerModule, ReportePeriodoControlComponent,
  ],
})
export class VentasReportesComponent {
  loading = false;
  data: any = null;
  periodoLabel = '';
  comparaLabel: string | null = null;

  constructor(private repository: RepositoryService) {}

  // Hook para recibir el data del tab (patrón del proyecto).
  setData(_data: any): void {}

  async onAplicar(params: ReportePeriodoParams): Promise<void> {
    this.loading = true;
    try {
      this.data = await firstValueFrom(this.repository.getReporteVentasCierre(params));
      this.periodoLabel = this.data?.periodoLabel || '';
      this.comparaLabel = this.data?.periodoLabelAnterior || null;
    } catch (e) {
      console.error('Error cargando reporte de ventas', e);
      this.data = null;
    } finally {
      this.loading = false;
    }
  }
}
