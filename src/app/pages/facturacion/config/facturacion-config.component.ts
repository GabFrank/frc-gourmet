import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { FacturaPlantilla } from '../../../database/entities/facturacion/factura-plantilla.entity';
import { TimbradoDetalle } from '../../../database/entities/facturacion/timbrado-detalle.entity';
import { TipoFacturacion } from '../../../database/entities/facturacion/factura.entity';

@Component({
  selector: 'app-facturacion-config',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './facturacion-config.component.html',
  styleUrls: ['./facturacion-config.component.scss'],
})
export class FacturacionConfigComponent implements OnInit {
  form: FormGroup;
  plantillas: FacturaPlantilla[] = [];
  plantillasFiltradas: FacturaPlantilla[] = [];
  detalles: TimbradoDetalle[] = [];
  detalleOptions: { id: number; label: string }[] = [];
  isLoading = false;
  isSaving = false;

  tipos = [
    { value: TipoFacturacion.PRE_IMPRESO, label: 'Pre-impreso (hoja ya impresa)' },
    { value: TipoFacturacion.AUTO_IMPRESO, label: 'Auto-impreso (térmica / A4)' },
    { value: TipoFacturacion.ELECTRONICA, label: 'Electrónica (SIFEN)' },
  ];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      tipoFacturacion: [TipoFacturacion.PRE_IMPRESO],
      plantillaPredeterminadaId: [null],
      timbradoDetallePredeterminadoId: [null],
      permitirEditarNumeroPreimpreso: [true],
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      const [cfg, plantillas, detalles] = await Promise.all([
        firstValueFrom(this.repositoryService.getFacturacionConfig()),
        firstValueFrom(this.repositoryService.getFacturaPlantillas()),
        firstValueFrom(this.repositoryService.getTimbradoDetalles()),
      ]);
      this.plantillas = (plantillas || []).filter((p) => p.activo);
      this.detalles = (detalles || []).filter((d) => d.activo);
      this.detalleOptions = this.detalles.map((d) => ({ id: d.id!, label: this.detalleLabel(d) }));
      this.form.patchValue({
        tipoFacturacion: cfg?.tipoFacturacion || TipoFacturacion.PRE_IMPRESO,
        plantillaPredeterminadaId: (cfg as any)?.plantillaPredeterminada?.id ?? null,
        timbradoDetallePredeterminadoId: (cfg as any)?.timbradoDetallePredeterminado?.id ?? null,
        permitirEditarNumeroPreimpreso: cfg?.permitirEditarNumeroPreimpreso ?? true,
      });
      this.filtrarPlantillas();
    } catch (error) {
      console.error('Error loading facturacion config:', error);
      this.snackBar.open('Error al cargar la configuración', 'Cerrar', { duration: 4000 });
    } finally {
      this.isLoading = false;
    }
  }

  private detalleLabel(d: TimbradoDetalle): string {
    const t = (d as any).timbrado;
    return `${d.establecimiento}-${d.puntoExpedicion} (próx. ${d.numeroActual})${t?.numero ? ' · Timb. ' + t.numero : ''}`;
  }

  /** Filtra las plantillas segun el tipo de facturacion elegido. */
  filtrarPlantillas(): void {
    const tipo = this.form.get('tipoFacturacion')?.value;
    this.plantillasFiltradas = this.plantillas.filter((p) => {
      const pt = String(p.tipo);
      if (tipo === TipoFacturacion.PRE_IMPRESO) return pt === 'PRE_IMPRESO';
      if (tipo === TipoFacturacion.AUTO_IMPRESO) return pt === 'AUTO_IMPRESO_TERMICA' || pt === 'AUTO_IMPRESO_A4';
      return true; // ELECTRONICA: acepta cualquier diseño (KuDE)
    });
    // Si la plantilla seleccionada ya no aplica al tipo, la limpiamos.
    const sel = this.form.get('plantillaPredeterminadaId')?.value;
    if (sel && !this.plantillasFiltradas.some((p) => p.id === sel)) {
      this.form.patchValue({ plantillaPredeterminadaId: null });
    }
  }

  async save(): Promise<void> {
    this.isSaving = true;
    try {
      await firstValueFrom(this.repositoryService.saveFacturacionConfig(this.form.value));
      this.snackBar.open('Configuración guardada', 'Cerrar', { duration: 2500 });
    } catch (error: any) {
      this.snackBar.open(error?.message || 'Error al guardar la configuración', 'Cerrar', { duration: 4000 });
    } finally {
      this.isSaving = false;
    }
  }
}
