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
import { MusicaMezclaDialogComponent } from './musica-mezcla-dialog.component';
import { ANIMOS, ESCENAS } from 'src/app/database/entities/musica/musica-enums';

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
  /** Resumen de la mezcla de estilos, ya formateado (no hay funciones en template). */
  mezclaTexto: string;
  mezclaCount: number;
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

  /** Vocabulario cerrado, el mismo que valida el backend. */
  readonly animos = ANIMOS;
  readonly escenas = ESCENAS;

  presets: Array<{ codigo: string; nombre: string; descripcion: string; cantidadBloques: number }> = [];
  presetElegido = '';

  avanzado: MusicaAvanzado | null = null;

  instruccion = '';
  ultimoPlan: { resumen: string; advertencias: string[] } | null = null;

  /** Resultado de la generación automática del plan de hoy. */
  estadoPlanAutomatico = '';
  planAutomaticoOk = false;

  constructor(
    private musicaService: MusicaService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.cargar();
    await this.cargarEstadoPlanAutomatico();
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
      await this.cargarMezclas();
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
    // null = heredar, 0 = sin limite, N = tope propio.
    const limiteTexto =
      b.maxPorArtista === 0
        ? 'Sin límite de artista'
        : b.maxPorArtista == null
          ? 'Límite por defecto'
          : `Máx ${b.maxPorArtista} por artista`;
    return {
      ...b,
      horarioTexto: `${b.horaDesde} – ${b.horaHasta}`,
      generosTexto: (b.generosPreferidos || []).join(', ') || 'sin estilos definidos',
      limiteTexto,
      mezclaTexto: 'sin mezcla definida',
      mezclaCount: 0,
      modoLimite: b.maxPorArtista === 0 ? 'sin-limite' : b.maxPorArtista == null ? 'heredar' : 'fijo',
    };
  }

  // ─────────── Mezcla de estilos ───────────

  /**
   * Trae la mezcla de todos los bloques y la deja pre-formateada.
   *
   * Se pre-computa acá y no en el template porque en este proyecto no van
   * llamadas a funciones ni getters en las plantillas.
   */
  private async cargarMezclas(): Promise<void> {
    const todos = this.dias.flatMap((d) => d.bloques);
    const vistos = new Set<number>();
    await Promise.all(
      todos.map(async (b) => {
        if (!b.id || vistos.has(b.id)) return;
        vistos.add(b.id);
        try {
          const mezcla = await this.musicaService.getMezcla(b.id);
          const texto = mezcla.map((m) => `${m.estiloNombre} ${m.porcentaje}%`).join(' · ');
          for (const otro of todos.filter((x) => x.id === b.id)) {
            otro.mezclaCount = mezcla.length;
            otro.mezclaTexto = texto || 'sin mezcla definida';
          }
        } catch {
          // Un bloque sin mezcla no es un error: queda con el texto por defecto.
        }
      }),
    );
  }

  abrirMezcla(b: BloqueVista): void {
    const ref = this.dialog.open(MusicaMezclaDialogComponent, {
      width: '720px',
      maxWidth: '95vw',
      data: { bloqueId: b.id, bloqueNombre: b.nombre },
    });
    ref.afterClosed().subscribe(async (guardado) => {
      if (guardado) await this.cargarMezclas();
    });
  }

  /**
   * Copia la mezcla a los bloques con el MISMO NOMBRE en los otros dias.
   *
   * La grilla tiene 31 bloques en 7 dias; configurar "almuerzo" siete veces a
   * mano es la clase de tarea que hace que la funcion no se use.
   */
  async copiarMezclaATodos(b: BloqueVista): Promise<void> {
    const destinos = this.dias
      .flatMap((d) => d.bloques)
      .filter((x) => x.nombre === b.nombre && x.id !== b.id);
    if (!destinos.length) {
      this.snackBar.open('NO HAY OTROS BLOQUES CON ESE NOMBRE', 'OK', { duration: 3000 });
      return;
    }

    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Copiar mezcla',
        message: `¿Aplicar la mezcla de "${b.nombre}" a los otros ${destinos.length} bloques con el mismo nombre?\nSe reemplaza la mezcla que tengan.`,
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      this.cargando = true;
      try {
        const mezcla = await this.musicaService.getMezcla(b.id);
        const items = mezcla.map((m) => ({ estiloId: m.estiloId, porcentaje: m.porcentaje }));
        // Secuencial y no en paralelo: cada guardado borra y reinserta filas, y
        // en SQLite las escrituras concurrentes se pisan.
        for (const destino of destinos) {
          await this.musicaService.guardarMezcla(destino.id, items);
        }
        await this.cargarMezclas();
        this.snackBar.open(`MEZCLA COPIADA A ${destinos.length} BLOQUES`, 'OK', { duration: 3500 });
      } catch (e: any) {
        this.mostrarError(e);
      } finally {
        this.cargando = false;
      }
    });
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
      // `undefined` para "heredar" no llegaba al backend (se pierde al
      // serializar), asi que se manda el centinela: null = heredar, 0 = sin
      // limite. Ver `BloqueProgramacion.maxPorArtista`.
      const maxPorArtista =
        b.modoLimite === 'sin-limite' ? 0 : b.modoLimite === 'heredar' ? null : b.maxPorArtista;
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
        animosEvitar: b.animosEvitar || [],
        escenaPreferida: b.escenaPreferida ?? null,
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

  /**
   * Cómo salió la generación automática de hoy.
   *
   * El plan se genera solo al arrancar el sistema. Antes eso pasaba en silencio
   * y un fallo sólo se notaba cuando el local abría sin música, así que acá se
   * dice si salió y, si no, por qué.
   */
  async cargarEstadoPlanAutomatico(): Promise<void> {
    try {
      const runtime = await this.musicaService.getRuntimeEstado();
      const p = runtime.planDelDia;
      if (!p) {
        this.estadoPlanAutomatico = '';
      } else if (p.generado) {
        this.estadoPlanAutomatico = `El plan del ${p.fecha} se generó solo al iniciar el sistema.`;
      } else {
        this.estadoPlanAutomatico = `No se generó el plan de hoy automáticamente: ${p.motivo}`;
      }
      this.planAutomaticoOk = !!p?.generado || p?.motivo === 'YA HAY PLAN PARA HOY.';
    } catch {
      // El estado del runtime es informativo: si no responde, la pantalla
      // sigue sirviendo para generar el plan a mano.
      this.estadoPlanAutomatico = '';
    }
  }

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
