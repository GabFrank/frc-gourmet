import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import {
  BloqueProgramacion,
  MusicaAvanzado,
  MusicaService,
} from 'src/app/services/musica.service';

interface DiaConBloques {
  dia: number;
  nombre: string;
  bloques: BloqueVista[];
}

interface BloqueVista extends BloqueProgramacion {
  horarioTexto: string;
  generosTexto: string;
  limiteTexto: string;
  /** Espejo editable: la UI usa 'sin-limite' | 'heredar' | número. */
  modoLimite: string;
}

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Programación semanal: los bloques que definen qué suena en cada momento.
 *
 * Incluye las opciones avanzadas por bloque, que existen porque el valor
 * correcto depende del estilo: en un bloque de covers no molesta repetir
 * artista, en la noche de rock sí.
 */
@Component({
  selector: 'app-musica-programacion',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatExpansionModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './musica-programacion.component.html',
  styleUrls: ['./musica-programacion.component.scss'],
})
export class MusicaProgramacionComponent implements OnInit {
  cargando = false;
  generando = false;

  dias: DiaConBloques[] = [];
  hayBloques = false;

  presets: Array<{ codigo: string; nombre: string; descripcion: string; cantidadBloques: number }> = [];
  presetElegido = '';

  avanzado: MusicaAvanzado | null = null;

  instruccion = '';
  ultimoPlan: { resumen: string; advertencias: string[] } | null = null;

  constructor(
    private musicaService: MusicaService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const [bloques, presets, config] = await Promise.all([
        this.musicaService.listarBloques(),
        this.musicaService.listarPresets(),
        this.musicaService.getConfig(),
      ]);
      this.presets = presets;
      if (!this.presetElegido && presets.length) this.presetElegido = presets[0].codigo;
      this.avanzado = config.avanzado || null;
      this.armarDias(bloques);
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.cargando = false;
    }
  }

  private armarDias(bloques: BloqueProgramacion[]): void {
    this.hayBloques = bloques.length > 0;
    this.dias = NOMBRES_DIA.map((nombre, dia) => ({
      dia,
      nombre,
      bloques: bloques
        .filter((b) => b.diaSemana === dia || b.diaSemana === -1)
        .map((b) => this.aVista(b)),
    })).filter((d) => d.bloques.length > 0);
  }

  private aVista(b: BloqueProgramacion): BloqueVista {
    const limiteTexto =
      b.maxPorArtista === null
        ? 'Sin límite de artista'
        : b.maxPorArtista === undefined
          ? 'Límite por defecto'
          : `Máx ${b.maxPorArtista} por artista`;
    return {
      ...b,
      horarioTexto: `${b.horaDesde} – ${b.horaHasta}`,
      generosTexto: (b.generosPreferidos || []).join(', ') || 'sin estilos definidos',
      limiteTexto,
      modoLimite:
        b.maxPorArtista === null ? 'sin-limite' : b.maxPorArtista === undefined ? 'heredar' : 'fijo',
    };
  }

  // ─────────── Preset ───────────

  aplicarPreset(): void {
    if (!this.presetElegido) return;
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Aplicar programación',
        message: this.hayBloques
          ? 'Ya tenés una grilla cargada.\n¿Reemplazarla por la del preset? Se pierden los ajustes manuales.'
          : '¿Cargar la programación del preset? Después podés ajustar cada bloque.',
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      this.cargando = true;
      try {
        const r = await this.musicaService.aplicarPreset(this.presetElegido, this.hayBloques);
        this.snackBar.open(`${r.bloques} bloques y ${r.vetos} vetos cargados`, 'OK', {
          duration: 4000,
        });
        await this.cargar();
      } catch (e: any) {
        this.mostrarError(e);
      } finally {
        this.cargando = false;
      }
    });
  }

  // ─────────── Edición de bloque ───────────

  async guardarBloque(b: BloqueVista): Promise<void> {
    try {
      const maxPorArtista =
        b.modoLimite === 'sin-limite' ? null : b.modoLimite === 'heredar' ? undefined : b.maxPorArtista;
      await this.musicaService.guardarBloque({
        id: b.id,
        nombre: b.nombre,
        horaDesde: b.horaDesde,
        horaHasta: b.horaHasta,
        energia: b.energia,
        volumen: b.volumen,
        maxPorArtista,
        evitarArtistaConsecutivo: b.evitarArtistaConsecutivo,
        factorDuracion: b.factorDuracion ?? null,
        notas: b.notas,
      });
      this.snackBar.open('BLOQUE GUARDADO', 'OK', { duration: 2000 });
      await this.cargar();
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  eliminarBloque(b: BloqueVista): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Quitar bloque', message: `¿Quitar "${b.nombre}" (${b.horarioTexto})?` },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        await this.musicaService.eliminarBloque(b.id);
        await this.cargar();
      } catch (e: any) {
        this.mostrarError(e);
      }
    });
  }

  // ─────────── Opciones globales ───────────

  async guardarAvanzado(): Promise<void> {
    if (!this.avanzado) return;
    try {
      await this.musicaService.setConfig({ avanzado: this.avanzado });
      this.snackBar.open('OPCIONES GUARDADAS', 'OK', { duration: 2000 });
    } catch (e: any) {
      this.mostrarError(e);
    }
  }

  // ─────────── Plan ───────────

  async generarPlan(): Promise<void> {
    this.generando = true;
    this.ultimoPlan = null;
    try {
      const r = await this.musicaService.generarPlan(undefined, this.instruccion || undefined);
      this.ultimoPlan = {
        resumen: `${r.playlists} playlists generadas para ${r.bloques} bloques del ${r.fecha}`,
        advertencias: r.advertencias,
      };
      this.instruccion = '';
      this.snackBar.open('PLAN GENERADO', 'OK', { duration: 4000 });
    } catch (e: any) {
      this.mostrarError(e);
    } finally {
      this.generando = false;
    }
  }

  private mostrarError(e: any): void {
    const msg = (e?.message || String(e) || 'ERROR DESCONOCIDO').replace(/^Error:\s*/i, '');
    this.snackBar.open(msg, 'CERRAR', { duration: 9000 });
  }
}
