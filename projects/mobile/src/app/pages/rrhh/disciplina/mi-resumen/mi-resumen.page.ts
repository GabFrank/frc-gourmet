import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { PromptDialogComponent, PromptData } from '../../../../core/components/prompt-dialog.component';
import { ConfirmDialogComponent, ConfirmData } from '../../../../core/components/confirm-dialog.component';

interface FaltaVM {
  id: number;
  fecha: string;
  tipo: string;
  ocurrencia: number;
  esMulta: boolean;
  monto: number;
  simbolo: string;
  estado: string;
  estadoClase: string;
  vence: Date | null;
  plazoVencido: boolean;
  renuncio: boolean;
  puedeApelar: boolean;
  puedeRenunciar: boolean;
  apelacionTexto: string;
  resolucion: string;
}

interface ErrorVM {
  fecha: string;
  tipo: string;
  puntos: number;
  estado: string;
}

interface PremioVM {
  nombre: string;
  periodo: string;
  monto: number;
  simbolo: string;
  estado: string;
  estadoClase: string;
}

const ESTADO_CLASE: Record<string, string> = {
  REGISTRADA: 'pend',
  APELADA: 'apel',
  APROBADA: 'ok',
  APROBADO: 'ok',
  PROPUESTO: 'pend',
  JUSTIFICADA: 'info',
  ANULADA: 'anul',
  ANULADO: 'anul',
  DESIERTO: 'anul',
};

const ESTADO_TEXTO: Record<string, string> = {
  REGISTRADA: 'En revisión',
  APELADA: 'Apelada',
  APROBADA: 'Aprobada',
  JUSTIFICADA: 'Justificada',
  ANULADA: 'Anulada',
  PROPUESTO: 'Propuesto',
  APROBADO: 'Aprobado',
  DESIERTO: 'Desierto',
  ANULADO: 'Anulado',
};

const pad = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** 'YYYY-MM-DD…' → 'dd/MM/yyyy' sin pasar por zona horaria. */
function fechaVista(f: unknown): string {
  if (!f) return '-';
  const s = f instanceof Date ? isoLocal(f) : String(f).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/**
 * M5 · Mi resumen (permiso RRHH_DR_MIS_DATOS): faltas propias (advertencias y multas) con
 * apelación o renuncia a apelar, saldo de puntos y errores del mes en curso, y premios ganados.
 * Todo es del funcionario de la sesión (el backend resuelve la identidad).
 */
@Component({
  selector: 'app-dr-mi-resumen',
  standalone: true,
  imports: [
    CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressBarModule,
    MatDialogModule, MatSnackBarModule,
  ],
  template: `
    <div class="crud-page">
      <mat-progress-bar *ngIf="loading" mode="indeterminate"></mat-progress-bar>
      <p *ngIf="error" class="crud-error">{{ error }}</p>

      <ng-container *ngIf="!loading && !error">
        <!-- Totales -->
        <div class="mr-totales">
          <div class="mr-kpi">
            <span class="mr-kpi-label">Advertencias</span>
            <span class="mr-kpi-valor">{{ totalAdvertencias }}</span>
          </div>
          <div class="mr-kpi">
            <span class="mr-kpi-label">Multas</span>
            <span class="mr-kpi-valor">{{ totalMultas }}</span>
          </div>
          <div class="mr-kpi warn">
            <span class="mr-kpi-label">Multas aprobadas</span>
            <span class="mr-kpi-valor">{{ simboloMultas }} {{ montoMultasAprobadas | number: '1.0-0' }}</span>
          </div>
          <div class="mr-kpi">
            <span class="mr-kpi-label">Multas en revisión</span>
            <span class="mr-kpi-valor">{{ simboloMultas }} {{ montoMultasPendientes | number: '1.0-0' }}</span>
          </div>
          <div class="mr-kpi info" *ngFor="let s of saldos">
            <span class="mr-kpi-label">Saldo · {{ s.premio }}</span>
            <span class="mr-kpi-valor">{{ s.saldo | number: '1.0-0' }} pts</span>
          </div>
          <div class="mr-kpi ok">
            <span class="mr-kpi-label">Premios ganados</span>
            <span class="mr-kpi-valor">{{ premios.length }}</span>
          </div>
        </div>

        <!-- Faltas -->
        <h3 class="mr-titulo">Mis faltas</h3>
        <div class="crud-list">
          <mat-card *ngFor="let f of faltas" class="crud-card" appearance="outlined">
            <div class="mr-falta">
              <div class="mr-fila">
                <span class="crud-name">{{ f.tipo }}<span *ngIf="f.ocurrencia"> · #{{ f.ocurrencia }}</span></span>
                <span class="crud-chip" [ngClass]="f.estadoClase">{{ estadoTexto(f.estado) }}</span>
              </div>
              <div class="mr-fila2">
                <span class="mr-tag" [class.multa]="f.esMulta">{{ f.esMulta ? 'Multa' : 'Advertencia' }}</span>
                <span *ngIf="f.esMulta" class="mr-monto">{{ f.simbolo }} {{ f.monto | number: '1.0-0' }}</span>
                <span class="crud-sub">· {{ f.fecha }}</span>
              </div>
              <span class="crud-sub" *ngIf="f.estado === 'REGISTRADA' && f.vence && !f.renuncio">
                {{ f.plazoVencido ? 'El plazo para apelar venció el' : 'Podés apelar hasta el' }}
                {{ f.vence | date: 'dd/MM/yyyy HH:mm' }}
              </span>
              <span class="crud-sub" *ngIf="f.renuncio && f.estado === 'REGISTRADA'">Aceptaste la falta (no vas a apelar).</span>
              <span class="mr-texto" *ngIf="f.apelacionTexto">Tu apelación: «{{ f.apelacionTexto }}»</span>
              <span class="mr-texto" *ngIf="f.resolucion">Resolución: «{{ f.resolucion }}»</span>

              <div class="mr-acciones" *ngIf="f.puedeApelar || f.puedeRenunciar">
                <button *ngIf="f.puedeApelar" mat-flat-button color="primary" [disabled]="procesando === f.id" (click)="apelar(f)">
                  <mat-icon>gavel</mat-icon> Apelar
                </button>
                <button *ngIf="f.puedeRenunciar" mat-stroked-button [disabled]="procesando === f.id" (click)="renunciar(f)">
                  <mat-icon>done</mat-icon> No voy a apelar
                </button>
              </div>
            </div>
          </mat-card>
          <p *ngIf="faltas.length === 0" class="crud-empty">No tenés faltas registradas.</p>
        </div>

        <!-- Errores del mes -->
        <h3 class="mr-titulo">Errores de este mes</h3>
        <div class="crud-list">
          <mat-card *ngFor="let e of errores" class="crud-card" appearance="outlined">
            <div class="crud-card-body">
              <div class="crud-card-main">
                <span class="crud-name">{{ e.tipo }}</span>
                <span class="crud-sub">{{ e.fecha }}<span *ngIf="e.estado !== 'VIGENTE'"> · {{ e.estado | titlecase }}</span></span>
              </div>
              <span class="mr-puntos" [class.tachado]="e.estado !== 'VIGENTE'">-{{ e.puntos | number: '1.0-0' }} pts</span>
            </div>
          </mat-card>
          <p *ngIf="errores.length === 0" class="crud-empty">Sin errores este mes.</p>
        </div>

        <!-- Premios -->
        <h3 class="mr-titulo">Mis premios</h3>
        <div class="crud-list">
          <mat-card *ngFor="let p of premios" class="crud-card" appearance="outlined">
            <div class="crud-card-body">
              <div class="crud-card-main">
                <span class="crud-name">{{ p.nombre }}</span>
                <span class="crud-sub">{{ p.periodo }}</span>
                <span class="mr-monto" *ngIf="p.monto">{{ p.simbolo }} {{ p.monto | number: '1.0-0' }}</span>
              </div>
              <span class="crud-chip" [ngClass]="p.estadoClase">{{ estadoTexto(p.estado) }}</span>
            </div>
          </mat-card>
          <p *ngIf="premios.length === 0" class="crud-empty">Todavía no ganaste premios.</p>
        </div>
      </ng-container>
    </div>
  `,
  styles: [
    `
      .mr-totales {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 16px;
      }
      .mr-kpi {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid var(--border-color);
        background: var(--surface-variant);
        min-height: 64px;
      }
      .mr-kpi.warn { border-color: color-mix(in srgb, var(--warning-color) 50%, transparent); }
      .mr-kpi.info { border-color: color-mix(in srgb, var(--info-color) 50%, transparent); }
      .mr-kpi.ok { border-color: color-mix(in srgb, var(--success-color) 50%, transparent); }
      .mr-kpi-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
      }
      .mr-kpi-valor {
        font-size: 1.15rem;
        font-weight: 700;
        color: var(--text-primary);
        word-break: break-word;
      }
      .mr-titulo {
        margin: 18px 0 8px;
        font-size: 1rem;
        color: var(--text-primary);
      }
      .mr-falta {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px 14px;
      }
      .mr-fila {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .mr-fila2 {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .mr-tag {
        font-size: 0.7rem;
        font-weight: 600;
        padding: 1px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--info-color) 16%, transparent);
        color: var(--info-color);
      }
      .mr-tag.multa {
        background: color-mix(in srgb, var(--error-color) 16%, transparent);
        color: var(--error-color);
      }
      .mr-monto {
        font-weight: 700;
        color: var(--text-primary);
      }
      .mr-texto {
        font-size: 0.8rem;
        color: var(--text-secondary);
        font-style: italic;
      }
      .mr-acciones {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
      }
      .mr-acciones button {
        flex: 1 1 140px;
        min-height: 44px;
      }
      .mr-puntos {
        font-weight: 700;
        color: var(--error-color);
        white-space: nowrap;
      }
      .mr-puntos.tachado {
        text-decoration: line-through;
        color: var(--text-secondary);
      }
      .crud-chip.pend {
        background: color-mix(in srgb, var(--warning-color) 16%, transparent);
        color: var(--warning-color);
      }
      .crud-chip.apel,
      .crud-chip.info {
        background: color-mix(in srgb, var(--info-color) 16%, transparent);
        color: var(--info-color);
      }
      .crud-chip.ok {
        background: color-mix(in srgb, var(--success-color) 16%, transparent);
        color: var(--success-color);
      }
      .crud-chip.anul {
        background: color-mix(in srgb, var(--error-color) 16%, transparent);
        color: var(--error-color);
      }
    `,
  ],
})
export class MiResumenPage implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  loading = true;
  error: string | null = null;
  procesando: number | null = null;

  faltas: FaltaVM[] = [];
  errores: ErrorVM[] = [];
  saldos: { premio: string; saldo: number }[] = [];
  premios: PremioVM[] = [];

  totalAdvertencias = 0;
  totalMultas = 0;
  montoMultasAprobadas = 0;
  montoMultasPendientes = 0;
  simboloMultas = '₲';

  private get api(): any {
    return (window as any).api;
  }

  ngOnInit(): void {
    this.cargar();
  }

  estadoTexto(e: string): string {
    return ESTADO_TEXTO[e] || e;
  }

  async cargar(): Promise<void> {
    this.loading = true;
    this.error = null;
    const hoy = new Date();
    const desde = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    const hasta = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
    try {
      const [faltas, puntos, premios] = await Promise.all([
        this.api.callIpc('dr-mis-faltas'),
        this.api.callIpc('dr-mis-puntos', { desde, hasta }),
        this.api.callIpc('dr-mis-premios'),
      ]);
      this.faltas = (Array.isArray(faltas) ? faltas : []).map((f: any) => this.toFalta(f));
      this.errores = (puntos?.errores ?? []).map((e: any) => ({
        fecha: fechaVista(e.fecha),
        tipo: e.tipoError?.nombre ?? '-',
        puntos: Number(e.puntos) || 0,
        estado: String(e.estado || ''),
      }));
      this.saldos = (puntos?.saldos ?? []).map((s: any) => ({ premio: s.premio, saldo: Number(s.saldo) || 0 }));
      this.premios = (Array.isArray(premios) ? premios : []).map((r: any) => {
        const estado = String(r.estado || '');
        return {
          nombre: r.periodo?.premio?.nombre ?? 'Premio',
          periodo: r.periodo ? `${fechaVista(r.periodo.desde)} al ${fechaVista(r.periodo.hasta)}` : '',
          monto: Number(r.montoAprobado ?? r.montoPropuesto) || 0,
          simbolo: r.moneda?.simbolo || '₲',
          estado,
          estadoClase: ESTADO_CLASE[estado] || '',
        };
      });
      this.calcularTotales();
    } catch (e) {
      this.error = this.msgError(e, 'No se pudo cargar tu resumen');
    } finally {
      this.loading = false;
    }
  }

  private toFalta(f: any): FaltaVM {
    const estado = String(f.estado || '').toUpperCase();
    const vence = f.apelacionVence ? new Date(f.apelacionVence) : null;
    const plazoVencido = !!vence && vence.getTime() < Date.now();
    const renuncio = !!f.renunciaApelacion;
    // Mismas reglas que el backend (dr-apelar-falta / dr-renunciar-apelacion): solo REGISTRADA,
    // sin renuncia previa y con el plazo vigente.
    const abierta = estado === 'REGISTRADA' && !renuncio && !plazoVencido;
    return {
      id: f.id,
      fecha: fechaVista(f.fecha),
      tipo: f.tipoFalta?.nombre ?? '-',
      ocurrencia: Number(f.nOcurrencia) || 0,
      esMulta: f.resultado === 'MULTA',
      monto: Number(f.montoCalculado) || 0,
      simbolo: f.moneda?.simbolo || '₲',
      estado,
      estadoClase: ESTADO_CLASE[estado] || '',
      vence,
      plazoVencido,
      renuncio,
      puedeApelar: abierta,
      puedeRenunciar: abierta,
      apelacionTexto: f.apelacionTexto || '',
      resolucion: f.resolucionTexto || f.motivoAnulacion || '',
    };
  }

  private calcularTotales(): void {
    const vivas = this.faltas.filter((f) => f.estado !== 'ANULADA' && f.estado !== 'JUSTIFICADA');
    this.totalAdvertencias = vivas.filter((f) => !f.esMulta).length;
    const multas = vivas.filter((f) => f.esMulta);
    this.totalMultas = multas.length;
    this.montoMultasAprobadas = multas.filter((f) => f.estado === 'APROBADA').reduce((s, f) => s + f.monto, 0);
    this.montoMultasPendientes = multas.filter((f) => f.estado !== 'APROBADA').reduce((s, f) => s + f.monto, 0);
    this.simboloMultas = multas[0]?.simbolo || '₲';
  }

  async apelar(f: FaltaVM): Promise<void> {
    if (this.procesando) return;
    const motivo = await firstValueFrom(
      this.dialog
        .open(PromptDialogComponent, {
          data: {
            title: 'Apelar falta',
            message: `${f.tipo} · ${f.fecha}. Contá por qué no corresponde; lo revisa un aprobador.`,
            label: 'Motivo de la apelación',
            confirmText: 'Apelar',
          } as PromptData,
          width: '360px',
        })
        .afterClosed(),
    );
    if (!motivo) return;
    await this.ejecutar(f, () => this.api.callIpc('dr-apelar-falta', f.id, motivo), 'Apelación enviada');
  }

  async renunciar(f: FaltaVM): Promise<void> {
    if (this.procesando) return;
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: 'No voy a apelar',
            message:
              `${f.tipo} · ${f.fecha}. Aceptás la falta y renunciás a apelarla: ` +
              'se podrá aprobar sin esperar el plazo. Esto no se puede deshacer.',
            confirmText: 'Acepto la falta',
            danger: true,
          } as ConfirmData,
          width: '360px',
        })
        .afterClosed(),
    );
    if (ok !== true) return;
    await this.ejecutar(f, () => this.api.callIpc('dr-renunciar-apelacion', f.id), 'Listo: aceptaste la falta');
  }

  private async ejecutar(f: FaltaVM, accion: () => Promise<unknown>, okMsg: string): Promise<void> {
    this.procesando = f.id;
    try {
      await accion();
      this.snack.open(okMsg, 'OK', { duration: 2500 });
    } catch (e) {
      this.snack.open(this.msgError(e, 'No se pudo completar'), 'OK', { duration: 5000 });
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
