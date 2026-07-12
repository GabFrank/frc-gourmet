import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

/**
 * Configuración de reconocimiento facial: descarga in-app de los modelos y ajuste
 * de los umbrales del fichaje (guardados en ConfiguracionRrhh como FACIAL_*).
 */
@Component({
  selector: 'app-configuracion-facial',
  standalone: true,
  templateUrl: './configuracion-facial.component.html',
  styleUrls: ['./configuracion-facial.component.scss'],
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSlideToggleModule, MatProgressBarModule,
    MatProgressSpinnerModule, MatSnackBarModule,
  ],
})
export class ConfiguracionFacialComponent implements OnInit, OnDestroy {
  cargando = true;
  descargando = false;
  guardando = false;
  progreso: { model: string; index: number; total: number } | null = null;

  status: { installed: boolean; totalBytes: number; models: { name: string; present: boolean }[] } | null = null;

  // Config editable (FACIAL_*). Se cargan por clave con su id para poder guardar.
  private configById: Record<string, { id: number; tipo: string }> = {};
  umbral = 0.6;
  margen = 0.05;
  livenessObligatorio = true;
  livenessMin = 0.5;
  permitirMultiple = false;

  private unsub: (() => void) | null = null;

  constructor(private repository: RepositoryService, private snackBar: MatSnackBar) {}

  async ngOnInit(): Promise<void> {
    const api = (window as any).api;
    if (api?.onFaceModelsProgress) {
      this.unsub = api.onFaceModelsProgress((p: any) => (this.progreso = p));
    }
    await Promise.all([this.cargarStatus(), this.cargarConfig()]);
    this.cargando = false;
  }

  ngOnDestroy(): void {
    if (this.unsub) this.unsub();
  }

  get tamanoMb(): string {
    return ((this.status?.totalBytes || 0) / 1e6).toFixed(1);
  }

  private async cargarStatus(): Promise<void> {
    try {
      this.status = await firstValueFrom(this.repository.getFaceModelsStatus());
    } catch { this.status = null; }
  }

  private async cargarConfig(): Promise<void> {
    try {
      const all: any[] = await firstValueFrom(this.repository.getConfiguracionesRrhh());
      const byClave: Record<string, any> = {};
      for (const c of all || []) byClave[c.clave] = c;
      const set = (clave: string): any => {
        const c = byClave[clave];
        if (c) this.configById[clave] = { id: c.id, tipo: c.tipo };
        return c?.valor;
      };
      this.umbral = parseFloat(set('FACIAL_UMBRAL_SIMILITUD')) || 0.6;
      this.margen = parseFloat(set('FACIAL_MARGEN_MIN')) || 0.05;
      this.livenessObligatorio = String(set('FACIAL_LIVENESS_OBLIGATORIO')).toLowerCase() === 'true';
      this.livenessMin = parseFloat(set('FACIAL_LIVENESS_MIN')) || 0.5;
      this.permitirMultiple = String(set('FACIAL_PERMITIR_MULTIPLE_DIARIO')).toLowerCase() === 'true';
    } catch (e: any) {
      this.snackBar.open('Error cargando configuración: ' + (e?.message || e), 'Cerrar', { duration: 4000 });
    }
  }

  async descargar(): Promise<void> {
    this.descargando = true;
    this.progreso = null;
    try {
      this.status = await firstValueFrom(this.repository.downloadFaceModels());
      this.snackBar.open('Modelos descargados', 'Cerrar', { duration: 3000 });
    } catch (e: any) {
      this.snackBar.open('Error al descargar: ' + (e?.message || e), 'Cerrar', { duration: 5000 });
    } finally {
      this.descargando = false;
      this.progreso = null;
    }
  }

  async guardar(): Promise<void> {
    this.guardando = true;
    try {
      await this.guardarClave('FACIAL_UMBRAL_SIMILITUD', String(this.umbral));
      await this.guardarClave('FACIAL_MARGEN_MIN', String(this.margen));
      await this.guardarClave('FACIAL_LIVENESS_OBLIGATORIO', this.livenessObligatorio ? 'true' : 'false');
      await this.guardarClave('FACIAL_LIVENESS_MIN', String(this.livenessMin));
      await this.guardarClave('FACIAL_PERMITIR_MULTIPLE_DIARIO', this.permitirMultiple ? 'true' : 'false');
      this.snackBar.open('Configuración guardada', 'Cerrar', { duration: 2500 });
    } catch (e: any) {
      this.snackBar.open('Error al guardar: ' + (e?.message || e), 'Cerrar', { duration: 4000 });
    } finally {
      this.guardando = false;
    }
  }

  private async guardarClave(clave: string, valor: string): Promise<void> {
    const ref = this.configById[clave];
    if (!ref) return;
    await firstValueFrom(this.repository.updateConfiguracionRrhh(ref.id, { valor }));
  }
}
