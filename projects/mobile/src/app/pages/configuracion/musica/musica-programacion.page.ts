import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { BloqueProgramacion, MusicaAvanzado, MusicaService } from '@frc/shared-core';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog.component';
import { MusicaMezclaDialogComponent } from './musica-mezcla-dialog.component';

interface DiaConBloques {
  dia: number;
  nombre: string;
  bloques: BloqueVista[];
}

interface BloqueVista extends BloqueProgramacion {
  horarioTexto: string;
  /** Espejo editable del límite: 'heredar' | 'sin-limite' | 'fijo'. */
  modoLimite: string;
  mezclaTexto: string;
  mezclaCount: number;
}

const NOMBRES_DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Programación semanal (mobile) — espejo de musica-programacion.component.
 * Los bloques que definen qué suena en cada momento, con su mezcla de estilos,
 * notas para la IA y opciones avanzadas por bloque + generales.
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
    MatExpansionModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './musica-programacion.page.html',
  styleUrls: ['./musica-programacion.page.scss'],
})
export class MusicaProgramacionPage implements OnInit {
  private readonly musica = inject(MusicaService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  cargando = false;
  generando = false;

  dias: DiaConBloques[] = [];
  hayBloques = false;

  presets: Array<{ codigo: string; nombre: string; descripcion: string; cantidadBloques: number }> = [];
  presetElegido = '';

  avanzado: MusicaAvanzado | null = null;

  instruccion = '';
  ultimoPlan: { resumen: string; advertencias: string[] } | null = null;

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const [bloques, presets, config] = await Promise.all([
        this.musica.listarBloques(),
        this.musica.listarPresets(),
        this.musica.getConfig(),
      ]);
      this.presets = presets;
      if (!this.presetElegido && presets.length) this.presetElegido = presets[0].codigo;
      this.avanzado = config.avanzado || null;
      this.armarDias(bloques);
      await this.cargarMezclas();
    } catch (e: any) {
      this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  private armarDias(bloques: BloqueProgramacion[]): void {
    this.hayBloques = bloques.length > 0;
    this.dias = NOMBRES_DIA.map((nombre, dia) => ({
      dia,
      nombre,
      bloques: bloques.filter((b) => b.diaSemana === dia || b.diaSemana === -1).map((b) => this.aVista(b)),
    })).filter((d) => d.bloques.length > 0);
  }

  private aVista(b: BloqueProgramacion): BloqueVista {
    return {
      ...b,
      horarioTexto: `${b.horaDesde} – ${b.horaHasta}`,
      mezclaTexto: 'sin mezcla definida',
      mezclaCount: 0,
      // null = heredar el global, 0 = sin límite, N = tope propio del bloque.
      modoLimite: b.maxPorArtista === 0 ? 'sin-limite' : b.maxPorArtista == null ? 'heredar' : 'fijo',
    };
  }

  // ─────────── Mezcla ───────────

  private async cargarMezclas(): Promise<void> {
    const todos = this.dias.flatMap((d) => d.bloques);
    const vistos = new Set<number>();
    await Promise.all(
      todos.map(async (b) => {
        if (!b.id || vistos.has(b.id)) return;
        vistos.add(b.id);
        try {
          const mezcla = await this.musica.getMezcla(b.id);
          const texto = mezcla.map((m) => `${m.estiloNombre} ${m.porcentaje}%`).join(' · ');
          for (const otro of todos.filter((x) => x.id === b.id)) {
            otro.mezclaCount = mezcla.length;
            otro.mezclaTexto = texto || 'sin mezcla definida';
          }
        } catch {
          // Un bloque sin mezcla no es un error.
        }
      }),
    );
  }

  abrirMezcla(b: BloqueVista): void {
    const ref = this.dialog.open(MusicaMezclaDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      data: { bloqueId: b.id, bloqueNombre: b.nombre },
    });
    ref.afterClosed().subscribe(async (guardado) => {
      if (guardado) await this.cargarMezclas();
    });
  }

  async copiarMezclaATodos(b: BloqueVista): Promise<void> {
    const destinos = this.dias
      .flatMap((d) => d.bloques)
      .filter((x) => x.nombre === b.nombre && x.id !== b.id);
    if (!destinos.length) {
      this.snack.open('No hay otros bloques con ese nombre', 'OK', { duration: 3000 });
      return;
    }
    const ok = await this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Copiar mezcla',
          message: `¿Aplicar la mezcla de "${b.nombre}" a los otros ${destinos.length} bloques con el mismo nombre? Se reemplaza la mezcla que tengan.`,
          confirmText: 'Copiar',
        },
      })
      .afterClosed()
      .toPromise();
    if (!ok) return;
    this.cargando = true;
    try {
      const mezcla = await this.musica.getMezcla(b.id);
      const items = mezcla.map((m) => ({ estiloId: m.estiloId, porcentaje: m.porcentaje }));
      // Secuencial: cada guardado borra y reinserta filas; en SQLite las
      // escrituras concurrentes se pisan.
      for (const destino of destinos) {
        await this.musica.guardarMezcla(destino.id, items);
      }
      await this.cargarMezclas();
      this.snack.open(`Mezcla copiada a ${destinos.length} bloques`, 'OK', { duration: 3500 });
    } catch (e: any) {
      this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  // ─────────── Preset ───────────

  async aplicarPreset(): Promise<void> {
    if (!this.presetElegido) return;
    const ok = await this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Aplicar programación',
          message: this.hayBloques
            ? 'Ya tenés una grilla cargada. ¿Reemplazarla por la del preset? Se pierden los ajustes manuales.'
            : '¿Cargar la programación del preset? Después podés ajustar cada bloque.',
          confirmText: 'Aplicar',
          danger: this.hayBloques,
        },
      })
      .afterClosed()
      .toPromise();
    if (!ok) return;
    this.cargando = true;
    try {
      const r = await this.musica.aplicarPreset(this.presetElegido, this.hayBloques);
      this.snack.open(`${r.bloques} bloques y ${r.vetos} vetos cargados`, 'OK', { duration: 4000 });
      await this.cargar();
    } catch (e: any) {
      this.error(e);
    } finally {
      this.cargando = false;
    }
  }

  // ─────────── Edición de bloque ───────────

  async guardarBloque(b: BloqueVista): Promise<void> {
    try {
      // Centinela en vez de `undefined`: no sobrevive al JSON de /api/rpc.
      const maxPorArtista =
        b.modoLimite === 'sin-limite' ? 0 : b.modoLimite === 'heredar' ? null : b.maxPorArtista;
      await this.musica.guardarBloque({
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
      this.snack.open('Bloque guardado', 'OK', { duration: 2000 });
      await this.cargar();
    } catch (e: any) {
      this.error(e);
    }
  }

  async eliminarBloque(b: BloqueVista): Promise<void> {
    const ok = await this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Quitar bloque',
          message: `¿Quitar "${b.nombre}" (${b.horarioTexto})?`,
          confirmText: 'Quitar',
          danger: true,
        },
      })
      .afterClosed()
      .toPromise();
    if (!ok) return;
    try {
      await this.musica.eliminarBloque(b.id);
      await this.cargar();
    } catch (e: any) {
      this.error(e);
    }
  }

  // ─────────── Opciones generales ───────────

  async guardarAvanzado(): Promise<void> {
    if (!this.avanzado) return;
    try {
      await this.musica.setConfig({ avanzado: this.avanzado });
      this.snack.open('Opciones guardadas', 'OK', { duration: 2000 });
    } catch (e: any) {
      this.error(e);
    }
  }

  // ─────────── Plan ───────────

  async generarPlan(): Promise<void> {
    this.generando = true;
    this.ultimoPlan = null;
    try {
      const r = await this.musica.generarPlan(undefined, this.instruccion || undefined);
      this.ultimoPlan = {
        resumen: `${r.playlists} playlists generadas para ${r.bloques} bloques del ${r.fecha}`,
        advertencias: r.advertencias,
      };
      this.instruccion = '';
      this.snack.open('Plan generado', 'OK', { duration: 4000 });
    } catch (e: any) {
      this.error(e);
    } finally {
      this.generando = false;
    }
  }

  private error(e: any): void {
    const msg = (e?.message || String(e) || 'Error').replace(/^Error:\s*/i, '');
    this.snack.open(msg, 'CERRAR', { duration: 9000 });
  }
}
