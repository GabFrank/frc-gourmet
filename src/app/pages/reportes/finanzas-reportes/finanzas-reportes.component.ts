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
 * Pantalla "Reportes Financieros" (cierre de mes). Fase 0: andamiaje. Fase 4
 * agrega flujo de caja, composición ingresos/egresos, gastos por categoría,
 * aging CPC/CPP, comisiones POS y vencimientos.
 */
@Component({
  selector: 'app-finanzas-reportes',
  templateUrl: './finanzas-reportes.component.html',
  styleUrls: ['./finanzas-reportes.component.scss'],
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule, MatTooltipModule,
    MatProgressSpinnerModule, ReportePeriodoControlComponent,
  ],
})
export class FinanzasReportesComponent {
  loading = false;
  data: any = null;
  periodoLabel = '';
  comparaLabel: string | null = null;

  constructor(private repository: RepositoryService) {}

  setData(_data: any): void {}

  async onAplicar(params: ReportePeriodoParams): Promise<void> {
    this.loading = true;
    try {
      this.data = await firstValueFrom(this.repository.getReporteFinanzasCierre(params));
      this.periodoLabel = this.data?.periodoLabel || '';
      this.comparaLabel = this.data?.periodoLabelAnterior || null;
    } catch (e) {
      console.error('Error cargando reporte financiero', e);
      this.data = null;
    } finally {
      this.loading = false;
    }
  }
}
