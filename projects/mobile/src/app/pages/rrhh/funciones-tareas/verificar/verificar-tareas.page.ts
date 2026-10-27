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
import { AppImagePipe } from '../../../../core/pipes/app-image.pipe';
import { FT_ESTADO, FT_MOBILE_STYLES, ftCall, ftDia, ftMensajeError, ftNotaPropia } from '../ft-mobile.utils';

type Tab = 'HECHA' | 'VENCIDA';

/** Días hacia atrás que mira la bandeja (el backend acepta hasta 31). */
const DIAS_BANDEJA = 7;

interface ItemVM {
  texto: string;
  hecho: boolean;
  obligatorio: boolean;
}

interface TareaVM {
  id: number;
  titulo: string;
  funcionario: string;
  fecha: string;
  inicio: Date;
  vence: Date;
  hechaEn: Date | null;
  hechaPor: string;
  critica: boolean;
  items: ItemVM[];
  evidenciaUrl: string | null;
  nota: string;
  propia: boolean;
}

function fechaVista(f: unknown): string {
  const s = String(f ?? '').slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}` : s;
}

/**
 * FT fase 4 · Bandeja de verificación (PWA, permiso RRHH_FT_VERIFICAR).
 *  - Para verificar: tareas HECHAS de los últimos días → Verificar (`ft-tarea-verificar`) o
 *    Rechazar con motivo (`ft-tarea-rechazar`; la persona la ve y la rehace).
 *  - Vencidas: «No aplica» con motivo (`ft-tarea-no-aplica`).
 * Nadie verifica lo propio ni lo que marcó: se avisa en la tarjeta y el backend lo bloquea.
 */
@Component({
  selector: 'app-ft-verificar-tareas',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatDialogModule, MatSnackBarModule, AppImagePipe],
  template: `
    <div class="crud-page">
      <div class="ft-tabs" role="tablist">
        <button role="tab" class="ft-tab" [class.active]="tab === 'HECHA'" (click)="cambiarTab('HECHA')">
          Para verificar <span class="ft-badge" *ngIf="hechas.length">{{ hechas.length }}</span>
        </button>
        <button role="tab" class="ft-tab" [class.active]="tab === 'VENCIDA'" (click)="cambiarTab('VENCIDA')">
          Vencidas <span class="ft-badge" *ngIf="vencidas.length">{{ vencidas.length }}</span>
        </button>
      </div>

      <mat-progress-bar *ngIf="loading" mode="indeterminate"></mat-progress-bar>
      <p *ngIf="error" class="crud-error">{{ error }}</p>

      <div class="crud-list" *ngIf="!loading && !error">
        <mat-card *ngFor="let t of items; trackBy: porId" class="crud-card" appearance="outlined">
          <div class="ft-card" [class.critica]="t.critica">
            <div class="ft-fila">
              <span class="ft-titulo">{{ t.titulo }}</span>
              <span class="ft-tag error" *ngIf="t.critica">Crítica</span>
            </div>
            <div class="ft-sub"><mat-icon>person</mat-icon><span>{{ t.funcionario }}</span></div>
            <div class="ft-sub">
              <mat-icon>schedule</mat-icon>
              <span>{{ t.fecha }} · {{ t.inicio | date: 'HH:mm' }} – {{ t.vence | date: 'HH:mm' }}</span>
              <span *ngIf="t.hechaEn">· hecha {{ t.hechaEn | date: 'HH:mm' }}<span *ngIf="t.hechaPor"> por {{ t.hechaPor }}</span></span>
            </div>

            <div class="ft-items" *ngIf="t.items.length">
              <div class="ft-item" *ngFor="let it of t.items" [class.hecho]="it.hecho">
                <mat-icon>{{ it.hecho ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
                <span class="ft-item-txt">{{ it.texto }}</span>
                <span class="ft-oblig" *ngIf="it.obligatorio && !it.hecho">Obligatorio</span>
              </div>
            </div>

            <img *ngIf="t.evidenciaUrl" class="ft-foto" [class.grande]="fotoGrande === t.id"
                 [src]="t.evidenciaUrl | appImage" alt="Foto de la tarea" (click)="fotoGrande = fotoGrande === t.id ? null : t.id" />
            <p class="ft-nota" *ngIf="t.nota">Nota: {{ t.nota }}</p>

            <p class="ft-aviso" *ngIf="t.propia">
              <mat-icon>info</mat-icon><span>La marcaste vos: la tiene que verificar otra persona.</span>
            </p>

            <div class="ft-acciones" *ngIf="tab === 'HECHA'">
              <button mat-flat-button color="primary" [disabled]="t.propia || procesando !== null" (click)="verificar(t)">
                <mat-icon>verified</mat-icon> Verificar
              </button>
              <button mat-stroked-button color="warn" [disabled]="t.propia || procesando !== null" (click)="rechazar(t)">
                <mat-icon>replay</mat-icon> Rechazar
              </button>
            </div>
            <div class="ft-acciones" *ngIf="tab === 'VENCIDA'">
              <button mat-stroked-button [disabled]="procesando !== null" (click)="noAplica(t)">
                <mat-icon>do_not_disturb_on</mat-icon> No aplica
              </button>
            </div>
            <mat-progress-bar *ngIf="procesando === t.id" mode="indeterminate"></mat-progress-bar>
          </div>
        </mat-card>
        <p *ngIf="items.length === 0" class="crud-empty">
          {{ tab === 'HECHA' ? 'No hay tareas para verificar.' : 'No hay tareas vencidas.' }}
        </p>
      </div>
    </div>
  `,
  styles: [FT_MOBILE_STYLES],
})
export class VerificarTareasPage implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly auth = inject(AuthService);

  tab: Tab = 'HECHA';
  items: TareaVM[] = [];
  hechas: TareaVM[] = [];
  vencidas: TareaVM[] = [];
  loading = true;
  error: string | null = null;
  procesando: number | null = null;
  fotoGrande: number | null = null;

  ngOnInit(): void {
    this.cargar();
  }

  porId(_i: number, t: TareaVM): number {
    return t.id;
  }

  cambiarTab(t: Tab): void {
    if (this.tab === t) return;
    this.tab = t;
    this.items = t === 'HECHA' ? this.hechas : this.vencidas;
  }

  async cargar(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const hoy = new Date();
      const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (DIAS_BANDEJA - 1));
      const rango = { desde: ftDia(desde), hasta: ftDia(hoy) };
      const [h, v] = await Promise.all([
        ftCall('ft-tareas-list', { ...rango, estado: FT_ESTADO.HECHA }),
        ftCall('ft-tareas-list', { ...rango, estado: FT_ESTADO.VENCIDA }),
      ]);
      // Las más viejas primero (las hechas, por hora de marcado).
      const ts = (d: Date | null) => (d ? d.getTime() : 0);
      this.hechas = (Array.isArray(h) ? h : []).map((t: any) => this.toVM(t)).sort((a, b) => ts(a.hechaEn) - ts(b.hechaEn));
      this.vencidas = (Array.isArray(v) ? v : []).map((t: any) => this.toVM(t)).reverse();
      this.items = this.tab === 'HECHA' ? this.hechas : this.vencidas;
    } catch (e) {
      this.error = ftMensajeError(e, 'No se pudieron cargar las tareas');
    } finally {
      this.loading = false;
    }
  }

  private toVM(t: any): TareaVM {
    const yo = this.auth.currentUser?.id;
    return {
      id: t.id,
      titulo: t.titulo,
      funcionario: t.funcionario?.nombre || `Funcionario #${t.funcionario?.id ?? ''}`,
      fecha: fechaVista(t.fecha),
      inicio: new Date(t.inicio),
      vence: new Date(t.vence),
      hechaEn: t.hechaEn ? new Date(t.hechaEn) : null,
      hechaPor: t.hechaPor?.nickname ?? '',
      critica: !!t.critica,
      items: (t.items ?? []).map((i: any) => ({ texto: i.texto, hecho: !!i.hecho, obligatorio: i.obligatorio !== false })),
      evidenciaUrl: t.evidenciaUrl || null,
      nota: ftNotaPropia(t.nota),
      propia: !!yo && t.hechaPor?.id === yo,
    };
  }

  private pedirTexto(data: PromptData): Promise<string | undefined> {
    return firstValueFrom(this.dialog.open(PromptDialogComponent, { data, width: '360px' }).afterClosed()) as Promise<string | undefined>;
  }

  async verificar(t: TareaVM): Promise<void> {
    if (t.propia || this.procesando !== null) return;
    const nota = await this.pedirTexto({
      title: 'Verificar tarea',
      message: `${t.titulo} · ${t.funcionario}`,
      label: 'Comentario (opcional)',
      confirmText: 'Verificar',
      required: false,
    });
    if (nota === undefined || nota === null) return;
    await this.ejecutar(t, async () => {
      await ftCall('ft-tarea-verificar', t.id, nota || undefined);
      return 'Tarea verificada';
    });
  }

  async rechazar(t: TareaVM): Promise<void> {
    if (t.propia || this.procesando !== null) return;
    const motivo = await this.pedirTexto({
      title: 'Rechazar tarea',
      message: `${t.titulo} · ${t.funcionario}. La persona ve el motivo y la tiene que rehacer.`,
      label: 'Motivo del rechazo (obligatorio)',
      confirmText: 'Rechazar',
      danger: true,
    });
    if (!motivo) return;
    await this.ejecutar(t, async () => {
      await ftCall('ft-tarea-rechazar', t.id, motivo);
      return 'Tarea rechazada: vuelve a la persona para rehacerla';
    });
  }

  async noAplica(t: TareaVM): Promise<void> {
    if (this.procesando !== null) return;
    const motivo = await this.pedirTexto({
      title: 'No aplica',
      message: `${t.titulo} · ${t.funcionario}. Hoy no correspondía hacerla.`,
      label: 'Motivo (obligatorio)',
      confirmText: 'No aplica',
    });
    if (!motivo) return;
    await this.ejecutar(t, async () => {
      await ftCall('ft-tarea-no-aplica', t.id, motivo);
      return 'Tarea marcada como «no aplica»';
    });
  }

  private async ejecutar(t: TareaVM, accion: () => Promise<string>): Promise<void> {
    this.procesando = t.id;
    try {
      const msg = await accion();
      this.snack.open(msg, 'OK', { duration: 3500 });
    } catch (e) {
      this.snack.open(ftMensajeError(e, 'No se pudo completar'), 'OK', { duration: 6000 });
    } finally {
      this.procesando = null;
      await this.cargar();
    }
  }
}
