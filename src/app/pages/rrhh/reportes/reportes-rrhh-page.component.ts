import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { RepositoryService } from 'src/app/database/repository.service';
import { DocumentoService } from 'src/app/services/documento.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-reportes-rrhh-page',
  standalone: true,
  templateUrl: './reportes-rrhh-page.component.html',
  styleUrls: ['./reportes-rrhh-page.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTableModule,
    MatDividerModule,
  ],
})
export class ReportesRrhhPageComponent implements OnInit {
  cargando = false;
  exportando = false;

  tipoReporte = 'LIQUIDACIONES_MES';
  tiposReporte = [
    { value: 'LIQUIDACIONES_MES', label: 'Liquidaciones del Mes' },
    { value: 'ASISTENCIA_MES', label: 'Asistencia del Mes' },
    { value: 'VALES_MES', label: 'Vales del Mes' },
    { value: 'PRESTAMOS_ACTIVOS', label: 'Prestamos Activos' },
    { value: 'COMISIONES_MES', label: 'Comisiones del Mes' },
    { value: 'RECIBO_LIQUIDACION', label: 'Recibo de Liquidacion (PDF)' },
    { value: 'AGUINALDO_ANUAL', label: 'Aguinaldo Anual' },
    { value: 'RESUMEN_IPS', label: 'Resumen IPS' },
  ];

  // Filtros
  periodoSeleccionado = '';
  anioSeleccionado: number = new Date().getFullYear();
  liquidacionIdSeleccionada = 0;
  periodosDisponibles: string[] = [];
  aniosDisponibles: number[] = [];

  // Vista previa
  datosPrevia: any[] = [];
  mostrarPrevia = false;

  // Columnas para preview generico
  columnasPrevia: string[] = [];

  constructor(
    private repo: RepositoryService,
    private snack: MatSnackBar,
    private documentoService: DocumentoService,
  ) {}

  ngOnInit(): void {
    const hoy = new Date();
    // Periodos ultimos 24 meses
    for (let i = 0; i < 24; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      this.periodosDisponibles.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    this.periodoSeleccionado = this.periodosDisponibles[0];
    // Anios ultimos 5
    for (let i = 0; i < 5; i++) {
      this.aniosDisponibles.push(hoy.getFullYear() - i);
    }
    this.anioSeleccionado = hoy.getFullYear();
  }

  setData(_data: any): void {}

  needsPeriodo(): boolean {
    return ['LIQUIDACIONES_MES', 'ASISTENCIA_MES', 'VALES_MES', 'COMISIONES_MES', 'RESUMEN_IPS'].includes(this.tipoReporte);
  }

  needsAnio(): boolean {
    return this.tipoReporte === 'AGUINALDO_ANUAL';
  }

  needsLiquidacionId(): boolean {
    return this.tipoReporte === 'RECIBO_LIQUIDACION';
  }

  hasPdf(): boolean {
    return ['LIQUIDACIONES_MES', 'RECIBO_LIQUIDACION', 'AGUINALDO_ANUAL'].includes(this.tipoReporte);
  }

  hasExcel(): boolean {
    return this.tipoReporte !== 'RECIBO_LIQUIDACION';
  }

  async verPrevia(): Promise<void> {
    this.cargando = true;
    this.datosPrevia = [];
    this.mostrarPrevia = false;
    try {
      let data: any = null;
      switch (this.tipoReporte) {
        case 'LIQUIDACIONES_MES':
          data = await firstValueFrom(this.repo.getReporteLiquidacionesMesData(this.periodoSeleccionado));
          break;
        case 'ASISTENCIA_MES':
          data = await firstValueFrom(this.repo.getReporteAsistenciaMesData(this.periodoSeleccionado));
          break;
        case 'VALES_MES':
          data = await firstValueFrom(this.repo.getReporteValesMesData(this.periodoSeleccionado));
          break;
        case 'PRESTAMOS_ACTIVOS':
          data = await firstValueFrom(this.repo.getReportePrestamosActivosData());
          break;
        case 'COMISIONES_MES':
          data = await firstValueFrom(this.repo.getReporteComisionesMesData(this.periodoSeleccionado));
          break;
        case 'AGUINALDO_ANUAL':
          data = await firstValueFrom(this.repo.getReporteAguinaldoAnualData(this.anioSeleccionado));
          break;
        case 'RESUMEN_IPS':
          data = await firstValueFrom(this.repo.getReporteResumenIpsData(this.periodoSeleccionado));
          break;
        default:
          data = [];
      }
      this.datosPrevia = Array.isArray(data) ? data : [];
      this.mostrarPrevia = true;
      this.snack.open(`${this.datosPrevia.length} registros encontrados`, 'Cerrar', { duration: 2000 });
    } catch (_e) {
      this.snack.open('Error al obtener datos del reporte', 'Cerrar', { duration: 3000 });
    } finally {
      this.cargando = false;
    }
  }

  async exportarExcel(): Promise<void> {
    this.exportando = true;
    try {
      let result: any = null;
      switch (this.tipoReporte) {
        case 'LIQUIDACIONES_MES':
          result = await firstValueFrom(this.repo.exportReporteLiquidacionesMesExcel(this.periodoSeleccionado));
          break;
        case 'ASISTENCIA_MES':
          result = await firstValueFrom(this.repo.exportReporteAsistenciaMesExcel(this.periodoSeleccionado));
          break;
        case 'VALES_MES':
          result = await firstValueFrom(this.repo.exportReporteValesMesExcel(this.periodoSeleccionado));
          break;
        case 'PRESTAMOS_ACTIVOS':
          result = await firstValueFrom(this.repo.exportReportePrestamosActivosExcel());
          break;
        case 'COMISIONES_MES':
          result = await firstValueFrom(this.repo.exportReporteComisionesMesExcel(this.periodoSeleccionado));
          break;
        case 'AGUINALDO_ANUAL':
          result = await firstValueFrom(this.repo.exportReporteAguinaldoAnualExcel(this.anioSeleccionado));
          break;
        case 'RESUMEN_IPS':
          result = await firstValueFrom(this.repo.exportReporteResumenIpsExcel(this.periodoSeleccionado));
          break;
      }
      if (result) this.descargar(result);
    } catch (_e) {
      this.snack.open('Error al exportar Excel', 'Cerrar', { duration: 3000 });
    } finally {
      this.exportando = false;
    }
  }

  async exportarPdf(): Promise<void> {
    this.exportando = true;
    try {
      let result: any = null;
      switch (this.tipoReporte) {
        case 'LIQUIDACIONES_MES':
          result = await firstValueFrom(this.repo.exportReporteLiquidacionesMesPdf(this.periodoSeleccionado));
          break;
        case 'RECIBO_LIQUIDACION':
          if (!this.liquidacionIdSeleccionada) {
            this.snack.open('Ingrese el ID de liquidacion', 'Cerrar', { duration: 3000 });
            return;
          }
          result = await firstValueFrom(this.repo.exportReciboLiquidacionPdf(this.liquidacionIdSeleccionada));
          break;
        case 'AGUINALDO_ANUAL':
          result = await firstValueFrom(this.repo.exportReporteAguinaldoAnualPdf(this.anioSeleccionado));
          break;
      }
      if (result) this.documentoService.abrirEnVisor(result);
    } catch (_e) {
      this.snack.open('Error al exportar PDF', 'Cerrar', { duration: 3000 });
    } finally {
      this.exportando = false;
    }
  }

  private descargar(result: { filename: string; base64: string; mimeType: string }): void {
    try {
      const byteChars = atob(result.base64);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const byteArr = new Uint8Array(byteNums);
      const blob = new Blob([byteArr], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      this.snack.open(`Descargando ${result.filename}`, 'Cerrar', { duration: 2000 });
    } catch (_e) {
      this.snack.open('Error al descargar archivo', 'Cerrar', { duration: 3000 });
    }
  }
}
