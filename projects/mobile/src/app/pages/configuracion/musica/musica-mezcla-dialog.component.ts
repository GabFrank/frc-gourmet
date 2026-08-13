import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { EstiloConDatos, MusicaService } from '@frc/shared-core';

export interface MezclaDialogData {
  bloqueId: number;
  bloqueNombre: string;
}

interface FilaMezcla {
  estiloId: number;
  nombre: string;
  tracks: number;
  horas: number;
  porcentaje: number;
  horasPedidas: number;
  faltan: number;
}

/**
 * Mezcla de estilos por bloque (mobile) — espejo de musica-mezcla-dialog.
 * Muestra, al lado de cada estilo, cuánto hay de verdad en el repertorio y
 * cuánto faltaría con el % elegido: el número que evita que la playlist repita
 * los mismos temas toda la tarde.
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
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './musica-mezcla-dialog.component.html',
  styleUrls: ['./musica-mezcla-dialog.component.scss'],
})
export class MusicaMezclaDialogComponent implements OnInit {
  private readonly musica = inject(MusicaService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<MusicaMezclaDialogComponent>);

  cargando = false;
  guardando = false;
  filas: FilaMezcla[] = [];

  objetivoHoras = 0;
  totalPorcentaje = 0;
  excedido = false;
  totalFaltan = 0;

  constructor(@Inject(MAT_DIALOG_DATA) public data: MezclaDialogData) {}

  async ngOnInit(): Promise<void> {
    this.cargando = true;
    try {
      const [estilos, mezcla, deficit] = await Promise.all([
        this.musica.listarEstilos(),
        this.musica.getMezcla(this.data.bloqueId),
        this.musica.getDeficit(this.data.bloqueId),
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
      this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  recalcular(): void {
    this.totalPorcentaje = this.filas.reduce((acc, f) => acc + (Number(f.porcentaje) || 0), 0);
    this.excedido = this.totalPorcentaje > 100;
    this.totalFaltan = 0;
    for (const f of this.filas) {
      const pct = Number(f.porcentaje) || 0;
      f.horasPedidas = (this.objetivoHoras * pct) / 100;
      const faltanHoras = Math.max(0, f.horasPedidas - f.horas);
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
      await this.musica.guardarMezcla(
        this.data.bloqueId,
        this.filas
          .filter((f) => (Number(f.porcentaje) || 0) > 0)
          .map((f) => ({ estiloId: f.estiloId, porcentaje: Number(f.porcentaje) })),
      );
      this.snack.open('Mezcla guardada', 'OK', { duration: 2500 });
      this.dialogRef.close(true);
    } catch (e: any) {
      this.error(e);
    } finally {
      this.guardando = false;
    }
  }

  cerrar(): void {
    this.dialogRef.close(false);
  }

  private error(e: any): void {
    const msg = (e?.message || String(e) || 'Error').replace(/^Error:\s*/i, '');
    this.snack.open(msg, 'CERRAR', { duration: 7000 });
  }
}
