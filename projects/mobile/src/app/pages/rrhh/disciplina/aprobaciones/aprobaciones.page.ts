import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@frc/shared-core';
import { PromptDialogComponent, PromptData } from '../../../../core/components/prompt-dialog.component';
import { drMonto } from '../dr-mobile.utils';

type Tab = 'REGISTRADA' | 'APELADA';

interface FaltaVM {
  id: number;
  fecha: string;
  funcionario: string;
  registro: string;
  tipo: string;
  ocurrencia: number;
  esMulta: boolean;
  monto: number;
  simbolo: string;
  vence: Date | null;
  renuncio: boolean;
  plazoAbierto: boolean;
  puedeAprobar: boolean;
  motivoNoAprobar: string;
  apelacionTexto: string;
  apelacionFecha: Date | null;
  observacion: string;
}

function fechaVista(f: unknown): string {
  if (!f) return '-';
  const s = String(f).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/**
 * M6 · Bandeja de aprobaciones DR (PWA, permiso RRHH_DR_APROBAR). Misma lógica que la bandeja
 * del desktop (aprobaciones-disciplina):
 *  - Pendientes: faltas REGISTRADAS. Aprobar se deshabilita si la registré yo o si corre el plazo
 *    de apelación y la persona no renunció (el backend también lo bloquea).
 *  - Apeladas: se ve el texto de la apelación; Aprobar (rechaza la apelación, respuesta obligatoria)
 *    o Justificar (la acepta).
 * Justificar y Anular piden motivo (obligatorio en el backend).
 */
@Component({
  selector: 'app-dr-aprobaciones',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressBarModule,
    MatDialogModule, MatSnackBarModule,
  ],
  template: `
    <div class="crud-page">
      <div class="ap-tabs" role="tablist">
        <button role="tab" class="ap-tab" [class.active]="tab === 'REGISTRADA'" (click)="cambiarTab('REGISTRADA')">
          Pendientes <span class="ap-badge" *ngIf="totalPendientes">{{ totalPendientes }}</span>
        </button>
        <button role="tab" class="ap-tab" [class.active]="tab === 'APELADA'" (click)="cambiarTab('APELADA')">
          Apeladas <span class="ap-badge" *ngIf="totalApeladas">{{ totalApeladas }}</span>
        </button>
      </div>

      <mat-progress-bar *ngIf="loading" mode="indeterminate"></mat-progress-bar>
      <p *ngIf="error" class="crud-error">{{ error }}</p>

      <div class="crud-list" *ngIf="!loading && !error">
        <mat-card *ngFor="let f of items" class="crud-card" appearance="outlined">
          <div class="ap-card">
            <div class="ap-fila">
              <span class="crud-name">{{ f.funcionario }}</span>
              <span class="ap-tag" [class.multa]="f.esMulta">{{ f.esMulta ? 'Multa' : 'Advertencia' }}</span>
            </div>
            <span class="ap-tipo">{{ f.tipo }}<span *ngIf="f.ocurrencia"> · #{{ f.ocurrencia }}</span></span>
            <div class="ap-fila2">
              <span *ngIf="f.esMulta" class="ap-monto">{{ monto(f.monto, f.simbolo) }}</span>
              <span class="crud-sub">{{ f.fecha }}<span *ngIf="f.registro"> · registró {{ f.registro }}</span></span>
            </div>
            <ng-container *ngIf="tab === 'REGISTRADA'">
              <span class="crud-sub" *ngIf="f.renuncio">La persona renunció a apelar.</span>
              <span class="crud-sub" *ngIf="!f.renuncio && f.vence">
                Plazo de apelación {{ f.plazoAbierto ? 'hasta el' : 'vencido el' }} {{ f.vence | date: 'dd/MM/yyyy HH:mm' }}
              </span>
            </ng-container>
            <span class="ap-texto" *ngIf="f.observacion">Obs.: {{ f.observacion }}</span>
            <div class="ap-apelacion" *ngIf="f.apelacionTexto">
              <mat-icon>forum</mat-icon>
              <span>«{{ f.apelacionTexto }}»<span *ngIf="f.apelacionFecha" class="crud-sub"> · {{ f.apelacionFecha | date: 'dd/MM/yy HH:mm' }}</span></span>
            </div>

            <p class="ap-aviso" *ngIf="!f.puedeAprobar">
              <mat-icon>info</mat-icon><span>{{ f.motivoNoAprobar }}</span>
            </p>

            <div class="ap-acciones">
              <button mat-flat-button color="primary" [disabled]="!f.puedeAprobar || procesando !== null" (click)="aprobar(f)">
                <mat-icon>check_circle</mat-icon> Aprobar
              </button>
              <button mat-stroked-button [disabled]="procesando !== null" (click)="justificar(f)">
                <mat-icon>verified</mat-icon> Justificar
              </button>
              <button mat-stroked-button color="warn" [disabled]="procesando !== null" (click)="anular(f)">
                <mat-icon>block</mat-icon> Anular
              </button>
            </div>
          </div>
        </mat-card>
        <p *ngIf="items.length === 0" class="crud-empty">
          {{ tab === 'REGISTRADA' ? 'No hay faltas pendientes.' : 'No hay faltas apeladas.' }}
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      .ap-tabs {
        display: flex;
        gap: 8px;
        padding: 4px 0 12px;
      }
      .ap-tab {
        flex: 1 1 0;
        min-height: 44px;
        border: 1px solid var(--border-color);
        background: transparent;
        color: var(--text-secondary);
        border-radius: 999px;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .ap-tab.active {
        background: color-mix(in srgb, var(--info-color) 22%, transparent);
        border-color: var(--info-color);
        color: var(--info-color);
      }
      .ap-badge {
        min-width: 20px;
        padding: 0 6px;
        border-radius: 999px;
        font-size: 0.72rem;
        line-height: 20px;
        background: color-mix(in srgb, var(--warning-color) 25%, transparent);
        color: var(--text-primary);
      }
      .ap-card {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px 14px;
      }
      .ap-fila {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .ap-fila2 {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ap-tipo {
        color: var(--text-primary);
        font-size: 0.9rem;
      }
      .ap-tag {
        font-size: 0.7rem;
        font-weight: 600;
        padding: 1px 8px;
        border-radius: 999px;
        white-space: nowrap;
        background: color-mix(in srgb, var(--info-color) 16%, transparent);
        color: var(--info-color);
      }
      .ap-tag.multa {
        background: color-mix(in srgb, var(--error-color) 16%, transparent);
        color: var(--error-color);
      }
      .ap-monto {
        font-weight: 700;
        color: var(--text-primary);
      }
      .ap-texto {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }
      .ap-apelacion {
        display: flex;
        gap: 6px;
        align-items: flex-start;
        padding: 8px;
        border-radius: 8px;
        font-size: 0.85rem;
        color: var(--text-primary);
        background: color-mix(in srgb, var(--info-color) 10%, transparent);
      }
      .ap-apelacion mat-icon {
        color: var(--info-color);
        flex: 0 0 auto;
      }
      .ap-aviso {
        display: flex;
        gap: 6px;
        align-items: center;
        margin: 4px 0 0;
        font-size: 0.8rem;
        color: var(--warning-color);
      }
      .ap-aviso mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
      }
      .ap-acciones {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
      }
      .ap-acciones button {
        flex: 1 1 100px;
        min-height: 44px;
      }
    `,
  ],
})
export class AprobacionesDrPage implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  tab: Tab = 'REGISTRADA';
  items: FaltaVM[] = [];
  private pendientes: FaltaVM[] = [];
  private apeladas: FaltaVM[] = [];
  totalPendientes = 0;
  totalApeladas = 0;
  loading = true;
  error: string | null = null;
  procesando: number | null = null;

  private get api(): any {
    return (window as any).api;
  }

  monto(v: number, simbolo?: string | null): string {
    return drMonto(v, simbolo);
  }

  ngOnInit(): void {
    this.cargar();
  }

  cambiarTab(t: Tab): void {
    if (this.tab === t) return;
    this.tab = t;
    this.items = t === 'REGISTRADA' ? this.pendientes : this.apeladas;
  }

  async cargar(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      // Mismos filtros que la bandeja del desktop.
      const [pend, apel] = await Promise.all([
        this.api.callIpc('dr-get-faltas', { estado: 'REGISTRADA', limite: 1000 }),
        this.api.callIpc('dr-get-faltas', { estado: 'APELADA', limite: 1000 }),
      ]);
      // Las más viejas primero: son las que ya pueden resolverse.
      this.pendientes = (Array.isArray(pend) ? pend : []).map((f: any) => this.toVM(f)).reverse();
      this.apeladas = (Array.isArray(apel) ? apel : []).map((f: any) => this.toVM(f)).reverse();
      this.totalPendientes = this.pendientes.length;
      this.totalApeladas = this.apeladas.length;
      this.items = this.tab === 'REGISTRADA' ? this.pendientes : this.apeladas;
    } catch (e) {
      this.error = this.msgError(e, 'No se pudieron cargar las faltas');
    } finally {
      this.loading = false;
    }
  }

  /** Copia de aVista() del desktop (aprobaciones-disciplina.component.ts). */
  private toVM(f: any): FaltaVM {
    const vence = f.apelacionVence ? new Date(f.apelacionVence) : null;
    const renuncio = !!f.renunciaApelacion;
    const plazoAbierto = f.estado === 'REGISTRADA' && !!vence && vence.getTime() > Date.now();
    const registroPropio = !!f.detectadoPor?.id && f.detectadoPor.id === this.auth.currentUser?.id;
    const puedeAprobar = !(plazoAbierto && !renuncio) && !registroPropio;
    const p = f.funcionario?.persona;
    const nombre = p ? `${p.nombre || ''} ${p.apellido || ''}`.trim() : '';
    return {
      id: f.id,
      fecha: fechaVista(f.fecha),
      funcionario: nombre || `Funcionario #${f.funcionario?.id ?? ''}`,
      registro: f.detectadoPor?.nickname ?? '',
      tipo: f.tipoFalta?.nombre ?? '-',
      ocurrencia: Number(f.nOcurrencia) || 0,
      esMulta: f.resultado === 'MULTA',
      monto: Number(f.montoCalculado) || 0,
      simbolo: f.moneda?.simbolo || '₲',
      vence,
      renuncio,
      plazoAbierto,
      puedeAprobar,
      motivoNoAprobar: registroPropio
        ? 'La registraste vos: la aprueba otro aprobador'
        : puedeAprobar ? '' : 'Todavía corre el plazo de apelación y la persona no renunció a apelar',
      apelacionTexto: f.apelacionTexto || '',
      apelacionFecha: f.apelacionFecha ? new Date(f.apelacionFecha) : null,
      observacion: f.observacion || '',
    };
  }

  private titulo(f: FaltaVM): string {
    return `${f.tipo} · ${f.funcionario} (${f.fecha})`;
  }

  private pedirTexto(data: PromptData): Promise<string | undefined> {
    return firstValueFrom(
      this.dialog.open(PromptDialogComponent, { data, width: '360px' }).afterClosed(),
    ) as Promise<string | undefined>;
  }

  async aprobar(f: FaltaVM): Promise<void> {
    if (!f.puedeAprobar || this.procesando !== null) return;
    const apelada = this.tab === 'APELADA';
    const efecto = f.esMulta && f.monto > 0
      ? `Se genera una penalización de ${f.simbolo} ${f.monto.toLocaleString('es-PY', { maximumFractionDigits: 0 })} en el primer mes de liquidación abierto (respetando el tope mensual).`
      : 'Es una advertencia: queda registrada sin descuento.';
    const comentario = await this.pedirTexto({
      title: apelada ? 'Aprobar (rechazar apelación)' : 'Aprobar falta',
      message: `${this.titulo(f)}. ${efecto}${apelada ? ` Apelación: «${f.apelacionTexto}»` : ''}`,
      label: apelada ? 'Respuesta a la apelación (obligatoria)' : 'Comentario (opcional)',
      confirmText: 'Aprobar',
      required: apelada,
    });
    if (comentario === undefined || comentario === null) return;
    await this.ejecutar(f, async () => {
      const r = await this.api.callIpc('dr-aprobar-falta', f.id, comentario || undefined);
      const cuotas: any[] = r?.cuotas ?? [];
      const detalle = cuotas.length > 1
        ? ` en ${cuotas.length} cuotas desde ${cuotas[0].mes}`
        : r?.mesDestino ? ` (mes ${r.mesDestino})` : '';
      return `Falta aprobada${r?.penalizacionId ? ': penalización generada' + detalle : ''}`;
    });
  }

  async justificar(f: FaltaVM): Promise<void> {
    if (this.procesando !== null) return;
    const motivo = await this.pedirTexto({
      title: 'Justificar falta',
      message: `${this.titulo(f)}. Queda justificada: no descuenta ni cuenta para próximas ocurrencias.`,
      label: 'Motivo (obligatorio)',
      confirmText: 'Justificar',
    });
    if (!motivo) return;
    await this.ejecutar(f, async () => {
      await this.api.callIpc('dr-justificar-falta', f.id, motivo);
      return 'Falta justificada';
    });
  }

  async anular(f: FaltaVM): Promise<void> {
    if (this.procesando !== null) return;
    const motivo = await this.pedirTexto({
      title: 'Anular falta',
      message: `${this.titulo(f)}. Anular es para registros cargados por error. Si la persona tenía razón, usá Justificar.`,
      label: 'Motivo (obligatorio)',
      confirmText: 'Anular',
      danger: true,
    });
    if (!motivo) return;
    await this.ejecutar(f, async () => {
      await this.api.callIpc('dr-anular-falta', f.id, motivo);
      return 'Falta anulada';
    });
  }

  private async ejecutar(f: FaltaVM, accion: () => Promise<string>): Promise<void> {
    this.procesando = f.id;
    try {
      const msg = await accion();
      this.snack.open(msg, 'OK', { duration: 4000 });
    } catch (e) {
      this.snack.open(this.msgError(e, 'No se pudo completar'), 'OK', { duration: 6000 });
    } finally {
      this.procesando = null;
      await this.cargar();
    }
  }

  private msgError(e: unknown, fallback: string): string {
    const raw = String((e as Error)?.message || '');
    if (raw === 'SERVER_UNREACHABLE') return 'No se pudo conectar con el servidor';
    return raw.replace(/^Error:\s*/, '') || fallback;
  }
}
