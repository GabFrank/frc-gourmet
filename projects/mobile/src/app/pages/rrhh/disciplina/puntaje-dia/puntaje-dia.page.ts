import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

interface PremioVM {
  id: number;
  nombre: string;
  grupoId: number | null;
}

interface CriterioVM {
  id: number;
  texto: string;
  descripcion?: string | null;
  valores: number[];
}

interface PersonaVM {
  id: number;
  nombre: string;
}

/** Quita el prefijo de Electron «Error invoking remote method 'x': Error: …». */
function mensajeError(e: any): string {
  const raw = e?.message || String(e ?? 'ERROR');
  const m = raw.match(/Error invoking remote method '[^']+': (?:\w*Error: )?(.*)/s);
  return (m ? m[1] : raw).trim();
}

function hoyIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nombreFuncionario(f: any): string {
  const p = f?.persona;
  return [p?.nombre, p?.apellido].filter((x) => !!x && String(x).trim()).join(' ').trim() || `#${f?.id}`;
}

/**
 * M3 — Puntaje del día (PWA). Para una fecha, se puntúa a cada miembro del grupo del premio
 * (método CRITERIOS) en cada criterio activo, una persona por pantalla. Los valores posibles
 * salen de la escala del criterio (escalaMin..escalaMax). Se precargan los puntajes ya
 * cargados ese día (dr-get-puntajes) y se guarda lo cambiado junto con dr-puntuar.
 */
@Component({
  selector: 'app-puntaje-dia',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  template: `
    <div class="crud-page pd-page">
      <mat-form-field appearance="outline" class="pd-fecha">
        <mat-label>Fecha</mat-label>
        <input matInput type="date" [ngModel]="fecha" (ngModelChange)="cambiarFecha($event)" [max]="hoy" />
      </mat-form-field>

      <div class="pd-premios" *ngIf="premios.length > 1">
        <button
          *ngFor="let p of premios"
          type="button"
          class="pd-chip"
          [class.active]="premio?.id === p.id"
          (click)="elegirPremio(p)"
        >
          {{ p.nombre }}
        </button>
      </div>

      <mat-progress-bar *ngIf="loading" mode="indeterminate"></mat-progress-bar>
      <p *ngIf="error" class="crud-error">{{ error }}</p>

      <ng-container *ngIf="!loading && !error">
        <div *ngIf="!premios.length" class="pd-vacio">
          <mat-icon>star_outline</mat-icon>
          <p>No hay premios por criterios activos. Configuralos en Disciplina y Reconocimiento.</p>
        </div>

        <div *ngIf="premio && (!personas.length || !criterios.length)" class="pd-vacio">
          <mat-icon>group_off</mat-icon>
          <p *ngIf="!premio.grupoId">El premio «{{ premio.nombre }}» no tiene grupo asignado.</p>
          <p *ngIf="premio.grupoId && !personas.length">El grupo del premio no tiene miembros activos.</p>
          <p *ngIf="!criterios.length">El premio «{{ premio.nombre }}» no tiene criterios activos.</p>
        </div>

        <ng-container *ngIf="actual as per">
          <div class="pd-progreso">
            <span>{{ idx + 1 }} de {{ personas.length }}</span>
            <span>{{ completas }} completas</span>
          </div>
          <mat-progress-bar mode="determinate" [value]="((idx + 1) / personas.length) * 100"></mat-progress-bar>

          <h2 class="pd-nombre">{{ per.nombre }}</h2>

          <div class="pd-criterio" *ngFor="let c of criterios">
            <div class="pd-crit-head">
              <span class="pd-crit-texto">{{ c.texto }}</span>
              <span *ngIf="c.descripcion" class="pd-crit-desc">{{ c.descripcion }}</span>
            </div>
            <div class="pd-valores">
              <button
                *ngFor="let v of c.valores"
                type="button"
                class="pd-valor"
                [class.sel]="valor(per.id, c.id) === v"
                [ngClass]="claseValor(c, v)"
                [attr.aria-pressed]="valor(per.id, c.id) === v"
                (click)="setValor(per.id, c.id, v)"
              >
                {{ v }}
              </button>
            </div>
          </div>

          <div class="pd-nav">
            <button mat-stroked-button type="button" class="pd-nav-btn" [disabled]="idx === 0" (click)="mover(-1)">
              <mat-icon>chevron_left</mat-icon> Anterior
            </button>
            <button
              *ngIf="idx < personas.length - 1"
              mat-flat-button
              color="primary"
              type="button"
              class="pd-nav-btn"
              (click)="mover(1)"
            >
              Siguiente <mat-icon iconPositionEnd>chevron_right</mat-icon>
            </button>
            <button
              *ngIf="idx === personas.length - 1"
              mat-flat-button
              color="primary"
              type="button"
              class="pd-nav-btn"
              [disabled]="guardando || !pendientes"
              (click)="guardar()"
            >
              <mat-icon>save</mat-icon> Guardar
            </button>
          </div>
          <button
            *ngIf="idx < personas.length - 1 && pendientes"
            mat-button
            type="button"
            class="pd-guardar-ya"
            [disabled]="guardando"
            (click)="guardar()"
          >
            <mat-icon>save</mat-icon> Guardar lo cargado ({{ pendientes }})
          </button>
          <p *ngIf="idx === personas.length - 1 && !pendientes" class="pd-nota">No hay cambios sin guardar.</p>
          <mat-progress-bar *ngIf="guardando" mode="indeterminate"></mat-progress-bar>
        </ng-container>
      </ng-container>
    </div>
  `,
  styles: [
    `
      .pd-page { padding-bottom: 24px; }
      .pd-fecha { width: 100%; }
      .pd-premios { display: flex; gap: 8px; overflow-x: auto; padding: 0 0 12px; }
      .pd-chip {
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
      .pd-chip.active {
        background: color-mix(in srgb, var(--info-color) 22%, transparent);
        border-color: var(--info-color);
        color: var(--info-color);
      }
      .pd-progreso {
        display: flex;
        justify-content: space-between;
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin: 4px 0 6px;
      }
      .pd-nombre {
        margin: 16px 0 12px;
        font-size: 1.35rem;
        font-weight: 700;
        color: var(--text-primary);
      }
      .pd-criterio {
        background: var(--card-background);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 10px;
      }
      .pd-crit-head { display: flex; flex-direction: column; margin-bottom: 10px; }
      .pd-crit-texto { font-weight: 600; color: var(--text-primary); }
      .pd-crit-desc { font-size: 0.8rem; color: var(--text-secondary); }
      .pd-valores { display: flex; gap: 10px; }
      .pd-valor {
        flex: 1;
        min-height: 56px;
        border-radius: 12px;
        border: 2px solid var(--border-color);
        background: transparent;
        color: var(--text-primary);
        font-size: 1.4rem;
        font-weight: 700;
        cursor: pointer;
      }
      .pd-valor.sel.bajo {
        background: color-mix(in srgb, var(--error-color) 22%, transparent);
        border-color: var(--error-color);
        color: var(--error-color);
      }
      .pd-valor.sel.medio {
        background: color-mix(in srgb, var(--warning-color) 22%, transparent);
        border-color: var(--warning-color);
        color: var(--warning-color);
      }
      .pd-valor.sel.alto {
        background: color-mix(in srgb, var(--success-color) 22%, transparent);
        border-color: var(--success-color);
        color: var(--success-color);
      }
      .pd-nav { display: flex; gap: 10px; margin-top: 16px; }
      .pd-nav-btn { flex: 1; min-height: 52px; font-size: 1rem; }
      .pd-guardar-ya { width: 100%; margin-top: 8px; min-height: 44px; }
      .pd-nota { text-align: center; font-size: 0.8rem; color: var(--text-secondary); margin-top: 8px; }
      .pd-vacio { text-align: center; color: var(--text-secondary); padding: 32px 16px; }
      .pd-vacio mat-icon { font-size: 48px; width: 48px; height: 48px; opacity: 0.6; }
    `,
  ],
})
export class PuntajeDiaPage implements OnInit {
  private readonly snack = inject(MatSnackBar);

  readonly hoy = hoyIso();
  fecha = hoyIso();
  premios: PremioVM[] = [];
  premio: PremioVM | null = null;
  criterios: CriterioVM[] = [];
  personas: PersonaVM[] = [];
  idx = 0;
  loading = true;
  guardando = false;
  error: string | null = null;

  /** `${funcionarioId}|${criterioId}` -> valor actual. */
  private readonly valores = new Map<string, number>();
  /** Claves cambiadas desde la última carga o guardado. */
  private readonly cambiados = new Set<string>();

  private get api(): any {
    return (window as any).api;
  }

  get actual(): PersonaVM | null {
    return this.premio && this.criterios.length ? this.personas[this.idx] ?? null : null;
  }

  get pendientes(): number {
    return this.cambiados.size;
  }

  get completas(): number {
    return this.personas.filter((p) => this.criterios.every((c) => this.valores.has(this.k(p.id, c.id)))).length;
  }

  ngOnInit(): void {
    this.cargarPremios();
  }

  private k(f: number, c: number): string {
    return `${f}|${c}`;
  }

  async cargarPremios(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const premios: any[] = (await this.api.callIpc('dr-get-premios', {})) ?? [];
      this.premios = premios
        .filter((p) => p.metodo === 'CRITERIOS' && p.activo !== false)
        .map((p) => ({ id: p.id, nombre: p.nombre, grupoId: p.grupo?.id ?? null }));
      this.premio = this.premios[0] ?? null;
      await this.cargarPremio();
    } catch (e) {
      this.error = mensajeError(e);
    } finally {
      this.loading = false;
    }
  }

  async elegirPremio(p: PremioVM): Promise<void> {
    if (p.id === this.premio?.id) return;
    if (this.pendientes && !confirm('Hay puntajes sin guardar. ¿Descartarlos?')) return;
    this.premio = p;
    await this.recargar();
  }

  async cambiarFecha(f: string): Promise<void> {
    if (!f || f === this.fecha) return;
    if (this.pendientes && !confirm('Hay puntajes sin guardar. ¿Descartarlos?')) {
      // Re-render del input con la fecha anterior.
      const prev = this.fecha;
      this.fecha = f;
      setTimeout(() => (this.fecha = prev));
      return;
    }
    this.fecha = f;
    await this.recargar();
  }

  private async recargar(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      await this.cargarPremio();
    } catch (e) {
      this.error = mensajeError(e);
    } finally {
      this.loading = false;
    }
  }

  private async cargarPremio(): Promise<void> {
    this.criterios = [];
    this.personas = [];
    this.valores.clear();
    this.cambiados.clear();
    this.idx = 0;
    const p = this.premio;
    if (!p) return;
    const [criterios, miembros, puntajes] = await Promise.all([
      this.api.callIpc('dr-get-criterios', { premioId: p.id }),
      p.grupoId ? this.api.callIpc('dr-get-grupo-miembros', { grupoId: p.grupoId }) : Promise.resolve([]),
      this.api.callIpc('dr-get-puntajes', { premioId: p.id, desde: this.fecha, hasta: this.fecha }),
    ]);
    this.criterios = ((criterios as any[]) ?? [])
      .filter((c) => c.activo !== false)
      .map((c) => {
        const min = Number(c.escalaMin ?? 0);
        const max = Math.max(min, Number(c.escalaMax ?? min));
        const valores: number[] = [];
        for (let v = min; v <= max; v++) valores.push(v);
        return { id: c.id, texto: c.texto, descripcion: c.descripcion, valores };
      });
    const vistos = new Set<number>();
    const personas: PersonaVM[] = [];
    for (const m of (miembros as any[]) ?? []) {
      const fid = m?.funcionario?.id;
      if (m?.activo === false || !fid || vistos.has(fid)) continue;
      vistos.add(fid);
      personas.push({ id: fid, nombre: nombreFuncionario(m.funcionario) });
    }
    this.personas = personas.sort((a, b) => a.nombre.localeCompare(b.nombre));
    for (const pt of (puntajes as any[]) ?? []) {
      const fid = pt?.funcionario?.id;
      const cid = pt?.criterio?.id;
      if (fid && cid) this.valores.set(this.k(fid, cid), Number(pt.valor));
    }
    // Arranca en la primera persona sin completar.
    const primera = this.personas.findIndex((per) => this.criterios.some((c) => !this.valores.has(this.k(per.id, c.id))));
    this.idx = primera >= 0 ? primera : 0;
  }

  valor(f: number, c: number): number | undefined {
    return this.valores.get(this.k(f, c));
  }

  setValor(f: number, c: number, v: number): void {
    const key = this.k(f, c);
    this.valores.set(key, v);
    this.cambiados.add(key);
  }

  /** Color según la posición en la escala: el mínimo rojo, el máximo verde, el resto amarillo. */
  claseValor(c: CriterioVM, v: number): string {
    const min = c.valores[0];
    const max = c.valores[c.valores.length - 1];
    if (v === max && max !== min) return 'alto';
    if (v === min) return 'bajo';
    return 'medio';
  }

  mover(d: number): void {
    const n = this.idx + d;
    if (n < 0 || n >= this.personas.length) return;
    this.idx = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async guardar(): Promise<void> {
    if (!this.pendientes || this.guardando) return;
    const enviados = [...this.cambiados];
    const puntajes = enviados.map((key) => {
      const [funcionarioId, criterioId] = key.split('|').map(Number);
      return { funcionarioId, criterioId, valor: this.valores.get(key)! };
    });
    this.guardando = true;
    try {
      const r = await this.api.callIpc('dr-puntuar', { fecha: this.fecha, puntajes });
      enviados.forEach((key) => this.cambiados.delete(key));
      this.snack.open(`Puntaje guardado (${r?.guardados ?? puntajes.length})`, 'OK', { duration: 3000 });
    } catch (e) {
      this.snack.open(mensajeError(e), 'Cerrar', { duration: 6000 });
    } finally {
      this.guardando = false;
    }
  }
}
