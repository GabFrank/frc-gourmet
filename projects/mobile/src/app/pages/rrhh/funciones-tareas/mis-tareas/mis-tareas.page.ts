import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { PromptDialogComponent, PromptData } from '../../../../core/components/prompt-dialog.component';
import { AppImagePipe } from '../../../../core/pipes/app-image.pipe';
import {
  FT_ESTADO, FT_ESTADO_CLASE, FT_ESTADO_LABEL, FT_EVIDENCIA, FT_FOTO_KB_INICIAL, FT_MIN_PRONTO, FT_MOBILE_STYLES, FT_TIPO,
  ftCall, ftComprimirFoto, ftFaltaTexto, ftMensajeError, ftMotivoRechazo, ftNotaPropia, ftTopeFotoDeError,
} from '../ft-mobile.utils';

interface ItemVM {
  id: number;
  texto: string;
  hecho: boolean;
  obligatorio: boolean;
}

interface TareaVM {
  id: number;
  titulo: string;
  estado: string;
  inicio: Date;
  vence: Date;
  critica: boolean;
  instrucciones: string;
  evidencia: string;
  checklist: boolean;
  items: ItemVM[];
  faltanObligatorios: number;
  evidenciaUrl: string | null;
  notaPropia: string;
  motivoRechazo: string;
  motivoNoAplica: string;
  abierta: boolean;
}

interface GrupoVM {
  clave: string;
  titulo: string;
  icono: string;
  tareas: TareaVM[];
}

/**
 * FT fase 4 · «Mis tareas de hoy» (PWA, permiso RRHH_FT_MARCAR_PROPIAS). Tareas del funcionario
 * de la sesión (`ft-mis-tareas-hoy`: hoy + las del turno de ayer abiertas pasada la medianoche).
 *  - Checklist: cada ítem se marca solo (`ft-tarea-marcar` con itemId); al completar los
 *    obligatorios el backend la pasa a HECHA.
 *  - Evidencia NOTA: pide la nota al marcar. FOTO: la saca con la cámara, la achica a JPEG
 *    dentro de `foto_max_kb` y la sube (`ft-tarea-subir-foto`, base64) antes de marcar.
 *  - RECHAZADA: muestra el motivo y se rehace igual que una pendiente.
 */
@Component({
  selector: 'app-ft-mis-tareas',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressBarModule, MatDialogModule, MatSnackBarModule, AppImagePipe],
  template: `
    <div class="crud-page">
      <div class="ft-top">
        <span class="ft-hoy">{{ ahora | date: 'EEEE d/MM' }}</span>
        <button mat-stroked-button (click)="cargar()" [disabled]="loading">
          <mat-icon>refresh</mat-icon> Actualizar
        </button>
      </div>

      <div class="ft-resumen" *ngIf="tareas.length">
        <div class="ft-resumen-item"><span class="ft-resumen-num">{{ cuenta.pendientes }}</span><span class="ft-resumen-lbl">Por hacer</span></div>
        <div class="ft-resumen-item"><span class="ft-resumen-num">{{ cuenta.hechas }}</span><span class="ft-resumen-lbl">Hechas</span></div>
        <div class="ft-resumen-item"><span class="ft-resumen-num">{{ cuenta.verificadas }}</span><span class="ft-resumen-lbl">Verificadas</span></div>
      </div>

      <mat-progress-bar *ngIf="loading" mode="indeterminate"></mat-progress-bar>
      <p *ngIf="error" class="crud-error">{{ error }}</p>

      <ng-container *ngIf="!error">
        <ng-container *ngFor="let g of grupos">
          <div class="ft-grupo"><mat-icon>{{ g.icono }}</mat-icon>{{ g.titulo }} ({{ g.tareas.length }})</div>
          <div class="crud-list">
            <mat-card *ngFor="let t of g.tareas; trackBy: porId" class="crud-card" appearance="outlined">
              <div class="ft-card" [class.critica]="t.critica && t.abierta">
                <div class="ft-fila">
                  <span class="ft-titulo">{{ t.titulo }}</span>
                  <span class="ft-tags">
                    <span class="ft-tag error" *ngIf="t.critica && t.abierta">Crítica</span>
                    <span class="ft-tag" [ngClass]="claseEstado(t.estado)">{{ etiquetaEstado(t.estado) }}</span>
                  </span>
                </div>
                <div class="ft-sub">
                  <mat-icon>schedule</mat-icon>
                  <span>{{ t.inicio | date: 'HH:mm' }} – {{ t.vence | date: 'HH:mm' }}</span>
                  <span *ngIf="t.abierta" [class.urgente]="minutos(t) < 0" [class.pronto]="minutos(t) >= 0 && minutos(t) <= minPronto">
                    · {{ falta(t) }}
                  </span>
                </div>

                <div class="ft-rechazo" *ngIf="t.estado === estados.RECHAZADA && t.motivoRechazo">
                  <mat-icon>report</mat-icon>
                  <span><b>Motivo del rechazo:</b> {{ t.motivoRechazo }}</span>
                </div>

                <p class="ft-instr" *ngIf="t.instrucciones && t.abierta">{{ t.instrucciones }}</p>

                <div class="ft-items" *ngIf="t.items.length">
                  <button type="button" class="ft-item" *ngFor="let it of t.items" [class.hecho]="it.hecho"
                          [disabled]="!t.abierta || procesando !== null" (click)="alternarItem(t, it)">
                    <mat-icon>{{ it.hecho ? 'check_box' : 'check_box_outline_blank' }}</mat-icon>
                    <span class="ft-item-txt">{{ it.texto }}</span>
                    <span class="ft-oblig" *ngIf="it.obligatorio && !it.hecho">Obligatorio</span>
                  </button>
                </div>

                <img *ngIf="t.evidenciaUrl" class="ft-foto" [class.grande]="fotoGrande === t.id"
                     [src]="t.evidenciaUrl | appImage" alt="Foto de la tarea" (click)="fotoGrande = fotoGrande === t.id ? null : t.id" />
                <p class="ft-pide" *ngIf="t.abierta && t.evidencia === evid.FOTO && !t.evidenciaUrl">
                  <mat-icon>photo_camera</mat-icon> Esta tarea pide una foto
                </p>
                <p class="ft-pide" *ngIf="t.abierta && t.evidencia === evid.NOTA && !t.notaPropia">
                  <mat-icon>edit_note</mat-icon> Esta tarea pide una nota
                </p>
                <p class="ft-nota" *ngIf="t.notaPropia">Nota: {{ t.notaPropia }}</p>
                <p class="ft-nota" *ngIf="t.motivoNoAplica">No aplica: {{ t.motivoNoAplica }}</p>

                <div class="ft-acciones" *ngIf="t.abierta">
                  <button mat-flat-button color="primary" class="principal" [disabled]="procesando !== null || t.faltanObligatorios > 0"
                          (click)="completar(t)">
                    <mat-icon>{{ t.evidencia === evid.FOTO && !t.evidenciaUrl ? 'photo_camera' : 'task_alt' }}</mat-icon>
                    {{ textoCompletar(t) }}
                  </button>
                  <button mat-stroked-button *ngIf="t.evidencia === evid.FOTO || t.evidenciaUrl" [disabled]="procesando !== null" (click)="pedirFoto(t, false)">
                    <mat-icon>add_a_photo</mat-icon> {{ t.evidenciaUrl ? 'Cambiar foto' : 'Sacar foto' }}
                  </button>
                  <button mat-stroked-button [disabled]="procesando !== null" (click)="editarNota(t)">
                    <mat-icon>edit_note</mat-icon> Nota
                  </button>
                  <button mat-stroked-button [disabled]="procesando !== null" (click)="noAplica(t)">
                    <mat-icon>do_not_disturb_on</mat-icon> No aplica
                  </button>
                </div>
                <mat-progress-bar *ngIf="procesando === t.id" mode="indeterminate"></mat-progress-bar>
              </div>
            </mat-card>
          </div>
        </ng-container>
        <p *ngIf="!loading && tareas.length === 0" class="crud-empty">No tenés tareas para hoy.</p>
      </ng-container>

      <input #fotoInput type="file" accept="image/*" capture="environment" hidden (change)="onFoto($event)" />
    </div>
  `,
  styles: [FT_MOBILE_STYLES],
})
export class MisTareasPage implements OnInit, OnDestroy {
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  @ViewChild('fotoInput') fotoInput?: ElementRef<HTMLInputElement>;

  readonly estados = FT_ESTADO;
  readonly evid = FT_EVIDENCIA;
  readonly minPronto = FT_MIN_PRONTO;

  tareas: TareaVM[] = [];
  grupos: GrupoVM[] = [];
  cuenta = { pendientes: 0, hechas: 0, verificadas: 0 };
  loading = true;
  error: string | null = null;
  procesando: number | null = null;
  fotoGrande: number | null = null;
  ahora = new Date();

  private fotoPara: TareaVM | null = null;
  private completarTrasFoto = false;
  private topeFotoKb = FT_FOTO_KB_INICIAL;
  private reloj?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.cargar();
    this.reloj = setInterval(() => {
      this.ahora = new Date();
      this.agrupar();
    }, 60_000);
  }

  ngOnDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
  }

  porId(_i: number, t: TareaVM): number {
    return t.id;
  }

  etiquetaEstado(e: string): string {
    return FT_ESTADO_LABEL[e] ?? e;
  }

  claseEstado(e: string): string {
    return FT_ESTADO_CLASE[e] ?? '';
  }

  minutos(t: TareaVM): number {
    return Math.round((t.vence.getTime() - this.ahora.getTime()) / 60000);
  }

  falta(t: TareaVM): string {
    return ftFaltaTexto(t.vence, this.ahora);
  }

  textoCompletar(t: TareaVM): string {
    if (t.faltanObligatorios > 0) return `Faltan ${t.faltanObligatorios} ítem(s) obligatorio(s)`;
    if (t.evidencia === FT_EVIDENCIA.FOTO && !t.evidenciaUrl) return 'Sacar foto y marcar hecha';
    return t.estado === FT_ESTADO.RECHAZADA ? 'Rehacer: marcar hecha' : 'Marcar hecha';
  }

  async cargar(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const lista = await ftCall('ft-mis-tareas-hoy');
      this.tareas = (Array.isArray(lista) ? lista : []).map((t: any) => this.toVM(t));
      this.ahora = new Date();
      this.agrupar();
    } catch (e) {
      this.error = ftMensajeError(e, 'No se pudieron cargar tus tareas');
    } finally {
      this.loading = false;
    }
  }

  private toVM(t: any): TareaVM {
    const items: ItemVM[] = (t.items ?? []).map((i: any) => ({
      id: i.id, texto: i.texto, hecho: !!i.hecho, obligatorio: i.obligatorio !== false,
    }));
    return {
      id: t.id,
      titulo: t.titulo,
      estado: t.estado,
      inicio: new Date(t.inicio),
      vence: new Date(t.vence),
      critica: !!t.critica,
      instrucciones: t.plantilla?.instrucciones ?? '',
      evidencia: t.plantilla?.evidencia ?? FT_EVIDENCIA.NINGUNA,
      checklist: t.plantilla?.tipo === FT_TIPO.CHECKLIST || items.length > 0,
      items,
      faltanObligatorios: items.filter((i) => i.obligatorio && !i.hecho).length,
      evidenciaUrl: t.evidenciaUrl || null,
      notaPropia: ftNotaPropia(t.nota),
      motivoRechazo: ftMotivoRechazo(t.nota),
      motivoNoAplica: t.motivoNoAplica || '',
      abierta: t.estado === FT_ESTADO.PENDIENTE || t.estado === FT_ESTADO.RECHAZADA,
    };
  }

  private reemplazar(raw: any): TareaVM {
    const vm = this.toVM(raw);
    const i = this.tareas.findIndex((x) => x.id === vm.id);
    if (i >= 0) this.tareas[i] = vm;
    else this.tareas.push(vm);
    this.agrupar();
    return vm;
  }

  /** Para rehacer · Ahora (ya empezaron, por vencimiento) · Más tarde · Hechas · Cerradas. */
  private agrupar(): void {
    const ahora = this.ahora.getTime();
    const porVence = (a: TareaVM, b: TareaVM) => a.vence.getTime() - b.vence.getTime();
    const porInicio = (a: TareaVM, b: TareaVM) => a.inicio.getTime() - b.inicio.getTime();
    const pend = this.tareas.filter((t) => t.estado === FT_ESTADO.PENDIENTE);
    const grupos: GrupoVM[] = [
      { clave: 'rehacer', titulo: 'Para rehacer', icono: 'replay', tareas: this.tareas.filter((t) => t.estado === FT_ESTADO.RECHAZADA).sort(porVence) },
      { clave: 'ahora', titulo: 'Ahora', icono: 'alarm', tareas: pend.filter((t) => t.inicio.getTime() <= ahora).sort(porVence) },
      { clave: 'despues', titulo: 'Más tarde', icono: 'upcoming', tareas: pend.filter((t) => t.inicio.getTime() > ahora).sort(porInicio) },
      { clave: 'hechas', titulo: 'Hechas, falta verificar', icono: 'hourglass_top', tareas: this.tareas.filter((t) => t.estado === FT_ESTADO.HECHA).sort(porVence) },
      {
        clave: 'cerradas', titulo: 'Cerradas', icono: 'inventory',
        tareas: this.tareas.filter((t) => ([FT_ESTADO.VERIFICADA, FT_ESTADO.NO_APLICA, FT_ESTADO.VENCIDA] as string[]).includes(t.estado)).sort(porVence),
      },
    ];
    this.grupos = grupos.filter((g) => g.tareas.length);
    this.cuenta = {
      pendientes: this.tareas.filter((t) => t.abierta).length,
      hechas: this.tareas.filter((t) => t.estado === FT_ESTADO.HECHA).length,
      verificadas: this.tareas.filter((t) => t.estado === FT_ESTADO.VERIFICADA).length,
    };
  }

  private pedirTexto(data: PromptData): Promise<string | undefined> {
    return firstValueFrom(this.dialog.open(PromptDialogComponent, { data, width: '360px' }).afterClosed()) as Promise<string | undefined>;
  }

  private async ejecutar(t: TareaVM, accion: () => Promise<string | null>): Promise<void> {
    this.procesando = t.id;
    try {
      const msg = await accion();
      if (msg) this.snack.open(msg, 'OK', { duration: 3000 });
    } catch (e) {
      this.snack.open(ftMensajeError(e, 'No se pudo completar'), 'OK', { duration: 6000 });
      if (/CAMBIÓ DE ESTADO|ESTÁ /i.test(String((e as Error)?.message || ''))) await this.cargar();
    } finally {
      this.procesando = null;
    }
  }

  async alternarItem(t: TareaVM, it: ItemVM): Promise<void> {
    if (!t.abierta || this.procesando !== null) return;
    await this.ejecutar(t, async () => {
      const r = await ftCall('ft-tarea-marcar', t.id, { itemId: it.id, hecho: !it.hecho });
      const vm = this.reemplazar(r);
      if (vm.estado === FT_ESTADO.HECHA) return 'Checklist completo: tarea hecha';
      if (!vm.faltanObligatorios && vm.evidencia === FT_EVIDENCIA.FOTO && !vm.evidenciaUrl) return 'Checklist listo: falta la foto';
      return null;
    });
  }

  async completar(t: TareaVM): Promise<void> {
    if (!t.abierta || this.procesando !== null) return;
    if (t.evidencia === FT_EVIDENCIA.FOTO && !t.evidenciaUrl) {
      this.pedirFoto(t, true);
      return;
    }
    let nota: string | undefined;
    if (t.evidencia === FT_EVIDENCIA.NOTA && !t.notaPropia) {
      nota = await this.pedirTexto({
        title: 'Nota de la tarea',
        message: `${t.titulo}: esta tarea pide una nota para darla por hecha.`,
        label: 'Nota (obligatoria)',
        confirmText: 'Marcar hecha',
      });
      if (!nota) return;
    }
    await this.ejecutar(t, async () => {
      const r = await ftCall('ft-tarea-marcar', t.id, nota ? { nota } : {});
      this.reemplazar(r);
      return 'Tarea marcada como hecha';
    });
  }

  async editarNota(t: TareaVM): Promise<void> {
    if (this.procesando !== null) return;
    const nota = await this.pedirTexto({
      title: 'Nota de la tarea',
      message: t.notaPropia ? `Nota actual: ${t.notaPropia}` : t.titulo,
      label: 'Nota',
      confirmText: 'Guardar',
      required: t.evidencia === FT_EVIDENCIA.NOTA,
    });
    if (nota === undefined || nota === null) return;
    await this.ejecutar(t, async () => {
      const r = await ftCall('ft-tarea-marcar', t.id, { nota, completar: false });
      this.reemplazar(r);
      return 'Nota guardada';
    });
  }

  async noAplica(t: TareaVM): Promise<void> {
    if (this.procesando !== null) return;
    const motivo = await this.pedirTexto({
      title: 'No aplica hoy',
      message: `${t.titulo}: contá por qué hoy no corresponde hacerla.`,
      label: 'Motivo (obligatorio)',
      confirmText: 'No aplica',
      danger: true,
    });
    if (!motivo) return;
    await this.ejecutar(t, async () => {
      const r = await ftCall('ft-tarea-no-aplica', t.id, motivo);
      this.reemplazar(r);
      return 'Tarea marcada como «no aplica»';
    });
  }

  pedirFoto(t: TareaVM, completarDespues: boolean): void {
    if (this.procesando !== null) return;
    this.fotoPara = t;
    this.completarTrasFoto = completarDespues;
    const input = this.fotoInput?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
  }

  async onFoto(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    const t = this.fotoPara;
    this.fotoPara = null;
    if (!file || !t) return;
    const completarDespues = this.completarTrasFoto;
    await this.ejecutar(t, async () => {
      let r: any;
      try {
        r = await ftCall('ft-tarea-subir-foto', t.id, { base64: await ftComprimirFoto(file, this.topeFotoKb) });
      } catch (e) {
        // El tope real está en ft_config.foto_max_kb (el funcionario no lo puede leer): se ajusta y reintenta una vez.
        const tope = ftTopeFotoDeError(e);
        if (!tope || tope >= this.topeFotoKb) throw e;
        this.topeFotoKb = tope;
        r = await ftCall('ft-tarea-subir-foto', t.id, { base64: await ftComprimirFoto(file, tope) });
      }
      const vm = this.reemplazar(r?.tarea);
      if (completarDespues && !vm.faltanObligatorios && !(vm.evidencia === FT_EVIDENCIA.NOTA && !vm.notaPropia)) {
        this.reemplazar(await ftCall('ft-tarea-marcar', t.id, {}));
        return 'Foto cargada y tarea marcada como hecha';
      }
      return 'Foto cargada';
    });
  }
}
