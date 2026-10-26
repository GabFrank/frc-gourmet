import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

type TipoPregunta = 'ESCALA' | 'SI_NO' | 'TEXTO';
type Valor = number | boolean | string | null;

interface PreguntaVM {
  id: number;
  texto: string;
  tipo: TipoPregunta;
  obligatoria: boolean;
  valores: number[];
}

interface EvaluadoVM {
  id: number;
  nombre: string;
}

interface PendienteVM {
  periodoId: number;
  titulo: string;
  preguntas: PreguntaVM[];
  evaluados: EvaluadoVM[];
}

/** Escala sin máximo configurado: se muestra hasta min+4 (5 opciones). */
const ESCALA_OPCIONES_DEFAULT = 5;

/** Quita el prefijo de Electron «Error invoking remote method 'x': Error: …». */
function mensajeError(e: any): string {
  const raw = e?.message || String(e ?? 'ERROR');
  const m = raw.match(/Error invoking remote method '[^']+': (?:\w*Error: )?(.*)/s);
  return (m ? m[1] : raw).trim();
}

/**
 * M4 — Votación anónima entre compañeros (PWA). Lista las encuestas abiertas donde todavía no
 * votó el usuario de la sesión (dr-mis-encuestas-pendientes) y arma un paso por compañero,
 * con todas las preguntas; al final una revisión y un ÚNICO envío (dr-votar). El backend no
 * guarda quién votó qué (§12): las respuestas nunca se registran en consola ni en logs.
 */
@Component({
  selector: 'app-votacion',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  template: `
    <div class="crud-page vt-page">
      <div class="vt-anonimo">
        <mat-icon>lock</mat-icon>
        <span>Tu voto es <b>anónimo</b>: no se guarda quién votó qué. Solo se registra que ya participaste,
          y los resultados se ven sumados cuando la encuesta cierra.</span>
      </div>

      <mat-progress-bar *ngIf="loading" mode="indeterminate"></mat-progress-bar>
      <p *ngIf="error" class="crud-error">{{ error }}</p>
      <button *ngIf="error" mat-stroked-button type="button" class="vt-btn-full" (click)="cargar()">
        <mat-icon>refresh</mat-icon> Reintentar
      </button>

      <ng-container *ngIf="!loading && !error">
        <!-- Nada pendiente -->
        <div *ngIf="!actual" class="vt-listo">
          <mat-icon>how_to_vote</mat-icon>
          <ng-container *ngIf="yaVoto; else sinPendientes">
            <h2>Ya votaste</h2>
            <p>No tenés encuestas pendientes por ahora.</p>
          </ng-container>
          <ng-template #sinPendientes><h2>No tenés encuestas pendientes</h2></ng-template>
        </div>

        <!-- Elegir encuesta si hay varias -->
        <div class="vt-encuestas" *ngIf="pendientes.length > 1 && paso === 0">
          <button
            *ngFor="let p of pendientes"
            type="button"
            class="vt-chip"
            [class.active]="actual?.periodoId === p.periodoId"
            (click)="elegir(p)"
          >
            {{ p.titulo }}
          </button>
        </div>

        <ng-container *ngIf="actual as enc">
          <h2 class="vt-titulo">{{ enc.titulo }}</h2>

          <div *ngIf="!enc.evaluados.length || !enc.preguntas.length" class="vt-listo">
            <mat-icon>info</mat-icon>
            <p *ngIf="!enc.evaluados.length">No hay compañeros para evaluar en esta encuesta.</p>
            <p *ngIf="!enc.preguntas.length">La encuesta no tiene preguntas activas.</p>
          </div>

          <ng-container *ngIf="enc.evaluados.length && enc.preguntas.length">
            <div class="vt-progreso">
              <span *ngIf="!enRevision">Compañero {{ paso + 1 }} de {{ enc.evaluados.length }}</span>
              <span *ngIf="enRevision">Revisión</span>
              <span>{{ completos }} / {{ enc.evaluados.length }} completos</span>
            </div>
            <mat-progress-bar mode="determinate" [value]="progreso"></mat-progress-bar>

            <!-- Un compañero por pantalla -->
            <ng-container *ngIf="!enRevision && enc.evaluados[paso] as ev">
              <h3 class="vt-nombre">{{ ev.nombre }}</h3>

              <div class="vt-pregunta" *ngFor="let q of enc.preguntas">
                <div class="vt-q-texto">
                  {{ q.texto }} <span *ngIf="q.obligatoria" class="vt-oblig" aria-label="Obligatoria">*</span>
                </div>

                <div *ngIf="q.tipo === 'ESCALA'" class="vt-escala">
                  <button
                    *ngFor="let v of q.valores"
                    type="button"
                    class="vt-opcion"
                    [class.sel]="resp(ev.id, q.id) === v"
                    [attr.aria-pressed]="resp(ev.id, q.id) === v"
                    (click)="set(ev.id, q.id, v)"
                  >
                    {{ v }}
                  </button>
                </div>

                <div *ngIf="q.tipo === 'SI_NO'" class="vt-escala">
                  <button
                    type="button"
                    class="vt-opcion si"
                    [class.sel]="resp(ev.id, q.id) === true"
                    [attr.aria-pressed]="resp(ev.id, q.id) === true"
                    (click)="set(ev.id, q.id, true)"
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    class="vt-opcion no"
                    [class.sel]="resp(ev.id, q.id) === false"
                    [attr.aria-pressed]="resp(ev.id, q.id) === false"
                    (click)="set(ev.id, q.id, false)"
                  >
                    No
                  </button>
                </div>

                <mat-form-field *ngIf="q.tipo === 'TEXTO'" appearance="outline" class="vt-texto">
                  <mat-label>Tu comentario{{ q.obligatoria ? '' : ' (opcional)' }}</mat-label>
                  <textarea
                    matInput
                    rows="3"
                    maxlength="500"
                    autocomplete="off"
                    [ngModel]="resp(ev.id, q.id) ?? ''"
                    (ngModelChange)="set(ev.id, q.id, $event)"
                  ></textarea>
                </mat-form-field>
              </div>

              <p *ngIf="!completo(ev.id)" class="vt-falta">Respondé las preguntas obligatorias (*) para seguir.</p>

              <div class="vt-nav">
                <button mat-stroked-button type="button" class="vt-nav-btn" [disabled]="paso === 0" (click)="mover(-1)">
                  <mat-icon>chevron_left</mat-icon> Anterior
                </button>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  class="vt-nav-btn"
                  [disabled]="!completo(ev.id)"
                  (click)="mover(1)"
                >
                  {{ paso === enc.evaluados.length - 1 ? 'Revisar' : 'Siguiente' }}
                  <mat-icon iconPositionEnd>chevron_right</mat-icon>
                </button>
              </div>
            </ng-container>

            <!-- Revisión -->
            <ng-container *ngIf="enRevision">
              <div class="vt-rev" *ngFor="let ev of enc.evaluados; let i = index">
                <div class="vt-rev-head">
                  <span class="vt-rev-nombre">{{ ev.nombre }}</span>
                  <button mat-button type="button" (click)="irA(i)"><mat-icon>edit</mat-icon> Editar</button>
                </div>
                <div class="vt-rev-row" *ngFor="let q of enc.preguntas">
                  <span class="vt-rev-q">{{ q.texto }}</span>
                  <span class="vt-rev-v">{{ mostrar(ev.id, q) }}</span>
                </div>
              </div>

              <div class="vt-anonimo vt-anonimo-final">
                <mat-icon>lock</mat-icon>
                <span>Se envía una sola vez y no se puede cambiar después. Nadie verá tus respuestas individuales.</span>
              </div>

              <div class="vt-nav">
                <button mat-stroked-button type="button" class="vt-nav-btn" [disabled]="enviando" (click)="mover(-1)">
                  <mat-icon>chevron_left</mat-icon> Volver
                </button>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  class="vt-nav-btn"
                  [disabled]="enviando || completos < enc.evaluados.length"
                  (click)="enviar()"
                >
                  <mat-icon>send</mat-icon> Enviar voto
                </button>
              </div>
              <mat-progress-bar *ngIf="enviando" mode="indeterminate"></mat-progress-bar>
            </ng-container>
          </ng-container>
        </ng-container>
      </ng-container>
    </div>
  `,
  styles: [
    `
      .vt-page { padding-bottom: 24px; }
      .vt-anonimo {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        padding: 10px 12px;
        margin-bottom: 12px;
        border-radius: 12px;
        font-size: 0.85rem;
        color: var(--text-primary);
        background: color-mix(in srgb, var(--info-color) 14%, transparent);
        border: 1px solid color-mix(in srgb, var(--info-color) 40%, transparent);
      }
      .vt-anonimo mat-icon { color: var(--info-color); flex: 0 0 auto; }
      .vt-anonimo-final { margin-top: 12px; }
      .vt-encuestas { display: flex; gap: 8px; overflow-x: auto; padding: 0 0 12px; }
      .vt-chip {
        flex: 0 0 auto;
        border: 1px solid var(--border-color);
        background: transparent;
        color: var(--text-secondary);
        border-radius: 999px;
        padding: 8px 16px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
      }
      .vt-chip.active {
        background: color-mix(in srgb, var(--info-color) 22%, transparent);
        border-color: var(--info-color);
        color: var(--info-color);
      }
      .vt-titulo { margin: 4px 0 8px; font-size: 1.1rem; font-weight: 700; color: var(--text-primary); }
      .vt-progreso {
        display: flex;
        justify-content: space-between;
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin: 4px 0 6px;
      }
      .vt-nombre { margin: 16px 0 12px; font-size: 1.35rem; font-weight: 700; color: var(--text-primary); }
      .vt-pregunta {
        background: var(--card-background);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 10px;
      }
      .vt-q-texto { font-weight: 600; color: var(--text-primary); margin-bottom: 10px; }
      .vt-oblig { color: var(--error-color); }
      .vt-escala { display: flex; gap: 8px; flex-wrap: wrap; }
      .vt-opcion {
        flex: 1 1 0;
        min-width: 48px;
        min-height: 56px;
        border-radius: 12px;
        border: 2px solid var(--border-color);
        background: transparent;
        color: var(--text-primary);
        font-size: 1.25rem;
        font-weight: 700;
        cursor: pointer;
      }
      .vt-opcion.sel {
        background: color-mix(in srgb, var(--info-color) 22%, transparent);
        border-color: var(--info-color);
        color: var(--info-color);
      }
      .vt-opcion.si.sel {
        background: color-mix(in srgb, var(--success-color) 22%, transparent);
        border-color: var(--success-color);
        color: var(--success-color);
      }
      .vt-opcion.no.sel {
        background: color-mix(in srgb, var(--error-color) 22%, transparent);
        border-color: var(--error-color);
        color: var(--error-color);
      }
      .vt-texto { width: 100%; }
      .vt-falta { font-size: 0.8rem; color: var(--warning-color); text-align: center; margin: 8px 0 0; }
      .vt-nav { display: flex; gap: 10px; margin-top: 16px; }
      .vt-nav-btn { flex: 1; min-height: 52px; font-size: 1rem; }
      .vt-btn-full { width: 100%; min-height: 48px; }
      .vt-rev {
        background: var(--card-background);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 8px 12px 12px;
        margin-top: 10px;
      }
      .vt-rev-head { display: flex; justify-content: space-between; align-items: center; }
      .vt-rev-nombre { font-weight: 700; color: var(--text-primary); }
      .vt-rev-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 6px 0;
        border-top: 1px solid var(--border-color);
        font-size: 0.85rem;
      }
      .vt-rev-q { color: var(--text-secondary); }
      .vt-rev-v { color: var(--text-primary); font-weight: 600; text-align: right; max-width: 50%; word-break: break-word; }
      .vt-listo { text-align: center; color: var(--text-secondary); padding: 32px 16px; }
      .vt-listo h2 { color: var(--text-primary); margin: 8px 0 4px; }
      .vt-listo mat-icon { font-size: 56px; width: 56px; height: 56px; color: var(--success-color); }
    `,
  ],
})
export class VotacionPage implements OnInit {
  private readonly snack = inject(MatSnackBar);

  pendientes: PendienteVM[] = [];
  actual: PendienteVM | null = null;
  /** 0..evaluados.length-1 = compañero; evaluados.length = revisión. */
  paso = 0;
  loading = true;
  enviando = false;
  error: string | null = null;
  /** Votó con éxito en esta sesión o el backend avisó que ya había votado. */
  yaVoto = false;

  /** Respuestas en memoria: `${evaluadoId}|${preguntaId}` -> valor. Nunca se loguean. */
  private respuestas = new Map<string, Valor>();

  private get api(): any {
    return (window as any).api;
  }

  get enRevision(): boolean {
    return !!this.actual && this.paso >= this.actual.evaluados.length;
  }

  get completos(): number {
    return this.actual ? this.actual.evaluados.filter((e) => this.completo(e.id)).length : 0;
  }

  get progreso(): number {
    const n = this.actual?.evaluados.length ?? 0;
    return n ? (Math.min(this.paso, n) / n) * 100 : 0;
  }

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const lista: any[] = (await this.api.callIpc('dr-mis-encuestas-pendientes')) ?? [];
      this.pendientes = lista.map((p) => this.mapear(p));
      this.elegir(this.pendientes[0] ?? null);
    } catch (e) {
      this.error = mensajeError(e);
    } finally {
      this.loading = false;
    }
  }

  private mapear(p: any): PendienteVM {
    return {
      periodoId: p.periodoId,
      titulo: p.encuesta?.titulo ?? 'Encuesta',
      evaluados: (p.evaluados ?? []).map((e: any) => ({ id: e.id, nombre: e.nombre || `#${e.id}` })),
      preguntas: (p.preguntas ?? []).map((q: any) => {
        const tipo: TipoPregunta = q.tipo;
        const valores: number[] = [];
        if (tipo === 'ESCALA') {
          const min = Number(q.escalaMin ?? 1);
          const max = q.escalaMax != null ? Number(q.escalaMax) : min + ESCALA_OPCIONES_DEFAULT - 1;
          for (let v = min; v <= max; v++) valores.push(v);
        }
        return { id: q.id, texto: q.texto, tipo, obligatoria: q.obligatoria !== false, valores };
      }),
    };
  }

  elegir(p: PendienteVM | null): void {
    if (p && this.actual && p.periodoId === this.actual.periodoId) return;
    if (this.respuestas.size && !confirm('Vas a perder las respuestas cargadas. ¿Seguir?')) return;
    this.actual = p;
    this.paso = 0;
    this.respuestas = new Map();
  }

  private k(ev: number, q: number): string {
    return `${ev}|${q}`;
  }

  resp(ev: number, q: number): Valor | undefined {
    return this.respuestas.get(this.k(ev, q));
  }

  set(ev: number, q: number, v: Valor): void {
    this.respuestas.set(this.k(ev, q), v);
  }

  private vacio(v: Valor | undefined): boolean {
    return v === null || v === undefined || (typeof v === 'string' && !v.trim());
  }

  completo(ev: number): boolean {
    return !!this.actual?.preguntas.every((q) => !q.obligatoria || !this.vacio(this.resp(ev, q.id)));
  }

  mostrar(ev: number, q: PreguntaVM): string {
    const v = this.resp(ev, q.id);
    if (this.vacio(v)) return '—';
    if (q.tipo === 'SI_NO') return v ? 'Sí' : 'No';
    return String(v);
  }

  mover(d: number): void {
    if (!this.actual) return;
    const n = this.paso + d;
    if (n < 0 || n > this.actual.evaluados.length) return;
    this.paso = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  irA(i: number): void {
    this.paso = i;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async enviar(): Promise<void> {
    const enc = this.actual;
    if (!enc || this.enviando) return;
    if (this.completos < enc.evaluados.length) {
      this.snack.open('Faltan respuestas obligatorias', 'Cerrar', { duration: 4000 });
      return;
    }
    const respuestas: { evaluadoId: number; preguntaId: number; valor: Valor }[] = [];
    for (const ev of enc.evaluados) {
      for (const q of enc.preguntas) {
        const v = this.resp(ev.id, q.id);
        respuestas.push({
          evaluadoId: ev.id,
          preguntaId: q.id,
          valor: this.vacio(v) ? null : typeof v === 'string' ? v.trim() : (v as Valor),
        });
      }
    }
    this.enviando = true;
    try {
      await this.api.callIpc('dr-votar', enc.periodoId, respuestas);
      this.respuestas = new Map();
      this.yaVoto = true;
      this.snack.open('¡Gracias! Tu voto anónimo fue registrado', 'OK', { duration: 4000 });
      this.pendientes = this.pendientes.filter((p) => p.periodoId !== enc.periodoId);
      this.actual = null;
      this.elegir(this.pendientes[0] ?? null);
    } catch (e) {
      const msg = mensajeError(e);
      this.snack.open(msg, 'Cerrar', { duration: 6000 });
      // Ya votó (otro dispositivo) o la encuesta cerró: se refresca la lista.
      if (/YA VOTASTE|YA CERR/i.test(msg)) {
        if (/YA VOTASTE/i.test(msg)) this.yaVoto = true;
        this.respuestas = new Map();
        this.actual = null;
        await this.cargar();
      }
    } finally {
      this.enviando = false;
    }
  }
}
