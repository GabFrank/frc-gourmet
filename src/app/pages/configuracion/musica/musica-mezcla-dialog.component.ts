import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EstiloConDatos, MusicaService } from 'src/app/services/musica.service';

export interface MezclaDialogData {
  bloqueId: number;
  bloqueNombre: string;
}

interface FilaMezcla {
  estiloId: number;
  nombre: string;
  /** Temas aprobados de ese estilo en el repertorio. */
  tracks: number;
  /** Horas disponibles de ese estilo. */
  horas: number;
  porcentaje: number;
  /** Horas que pide la cuota con el % actual. */
  horasPedidas: number;
  /** Temas que faltarian. 0 = alcanza. */
  faltan: number;
}

/**
 * "En el almuerzo quiero 50% bossa y 20% pagode".
 *
 * La pantalla muestra, al lado de cada estilo, CUANTO HAY de verdad en el
 * repertorio y cuanto faltaria con el porcentaje elegido. Ese numero es lo que
 * evita el problema real del modulo: se puede pedir 50% de bossa teniendo 7
 * temas, y sin el aviso la playlist repetiria los mismos siete toda la tarde.
 */
@Component({
  selector: 'app-musica-mezcla-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './musica-mezcla-dialog.component.html',
  styleUrls: ['./musica-mezcla-dialog.component.scss'],
})
export class MusicaMezclaDialogComponent implements OnInit {
  cargando = false;
  guardando = false;
  filas: FilaMezcla[] = [];

  /** Duracion objetivo de la playlist del bloque, en horas. */
  objetivoHoras = 0;
  totalPorcentaje = 0;
  /** true = la suma pasa 100 y el backend lo va a rechazar. */
  excedido = false;
  totalFaltan = 0;

  constructor(
    private musicaService: MusicaService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<MusicaMezclaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MezclaDialogData,
  ) {}

  async ngOnInit(): Promise<void> {
    this.cargando = true;
    try {
      const [estilos, mezcla, deficit] = await Promise.all([
        this.musicaService.listarEstilos(),
        this.musicaService.getMezcla(this.data.bloqueId),
        this.musicaService.getDeficit(this.data.bloqueId),
      ]);
      this.objetivoHoras = (deficit?.[0]?.objetivoMs || 0) / 3600000;
      const porEstilo = new Map(mezcla.map((m) => [m.estiloId, m.porcentaje]));
      this.filas = estilos
        .filter((e: EstiloConDatos) => e.activo)
        .map((e: EstiloConDatos) => ({
          estiloId: e.id,
          nombre: e.nombre,
          tracks: e.tracks,
          horas: e.duracionMs / 3600000,
          porcentaje: porEstilo.get(e.id) || 0,
          horasPedidas: 0,
          faltan: 0,
        }));
      this.recalcular();
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.cargando = false;
    }
  }

  /**
   * Se llama en cada cambio de input. Es aritmetica local, sin ir al backend:
   * el aviso tiene que aparecer mientras el usuario mueve el numero, no despues
   * de guardar.
   */
  recalcular(): void {
    this.totalPorcentaje = this.filas.reduce((acc, f) => acc + (Number(f.porcentaje) || 0), 0);
    this.excedido = this.totalPorcentaje > 100;
    this.totalFaltan = 0;
    for (const f of this.filas) {
      const pct = Number(f.porcentaje) || 0;
      f.horasPedidas = (this.objetivoHoras * pct) / 100;
      const faltanHoras = Math.max(0, f.horasPedidas - f.horas);
      // 3:30 promedio por tema, mismo criterio que el calculo del backend.
      f.faltan = Math.ceil((faltanHoras * 3600000) / 210000);
      this.totalFaltan += f.faltan;
    }
  }

  limpiar(): void {
    for (const f of this.filas) f.porcentaje = 0;
    this.recalcular();
  }

  async guardar(): Promise<void> {
    if (this.excedido) return;
    this.guardando = true;
    try {
      await this.musicaService.guardarMezcla(
        this.data.bloqueId,
        this.filas
          .filter((f) => (Number(f.porcentaje) || 0) > 0)
          .map((f) => ({ estiloId: f.estiloId, porcentaje: Number(f.porcentaje) })),
      );
      this.snackBar.open('MEZCLA GUARDADA', 'OK', { duration: 2500 });
      // Se devuelve true para que la pantalla de programación se refresque y el
      // plan se regenere cuando el usuario quiera.
      this.dialogRef.close(true);
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.guardando = false;
    }
  }

  cerrar(): void {
    this.dialogRef.close(false);
  }

  private mostrarError(e: any): void {
    const msg = (e?.message || String(e) || 'ERROR').replace(/^Error:\s*/i, '');
    this.snackBar.open(msg, 'CERRAR', { duration: 7000 });
  }
}
