/**
 * Tablero de Funciones y Tareas (permiso RRHH_FT_VER_TODO): cumplimiento del día por
 * funcionario, tareas vencidas (con «no aplica»), bandeja de verificación (tareas HECHAS:
 * verificar / rechazar, permiso RRHH_FT_VERIFICAR, validado en el backend), avisos (ft-avisos)
 * y propuestas de falta (nivel 3).
 */
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FtEtiquetaPipe } from '../ft-etiquetas';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { PromptDialogComponent, PromptDialogData } from '../../../../shared/components/prompt-dialog/prompt-dialog.component';
import { PermissionService } from '../../../../services/permission.service';
import {
  FT_CANALES, FT_ESTADOS_AVISO, FT_ESTADOS_PROPUESTA, FuncionesTareasApiService, ftMensajeError,
} from '../funciones-tareas-api.service';

interface FilaCumplimiento {
  funcionario: string;
  total: number;
  cumplidas: number;
  vencidas: number;
  pendientes: number;
  porcentaje: number;
}

function diaLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function hoyLocal(): string {
  return diaLocal(new Date());
}

/** 'YYYY-MM-DD' menos n días (local). */
function restarDias(dia: string, n: number): string {
  const [y, m, d] = dia.split('-').map(Number);
  return diaLocal(new Date(y, m - 1, d - n));
}

/** Días hacia atrás que mira la bandeja de verificación (el backend acepta hasta 31). */
const DIAS_VERIFICACION = 7;

@Component({
  selector: 'app-tablero-funciones-tareas',
  standalone: true,
  imports: [
    FtEtiquetaPipe, CommonModule, FormsModule, MatTabsModule, MatTableModule, MatButtonModule, MatIconModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule, MatProgressBarModule, MatSnackBarModule, MatDialogModule,
  ],
  templateUrl: './tablero-funciones-tareas.component.html',
  styleUrls: ['./tablero-funciones-tareas.component.scss'],
})
export class TableroFuncionesTareasComponent implements OnInit {
  readonly canales = FT_CANALES;
  readonly estadosAviso = FT_ESTADOS_AVISO;
  readonly estadosPropuesta = FT_ESTADOS_PROPUESTA;

  fecha = hoyLocal();
  cargando = false;

  tareas: any[] = [];
  cumplimiento: FilaCumplimiento[] = [];
  vencidas: any[] = [];
  totalPct = 0;
  readonly cumpCols = ['funcionario', 'total', 'cumplidas', 'pendientes', 'vencidas', 'porcentaje'];
  readonly vencCols = ['funcionario', 'titulo', 'vence', 'critica', 'acciones'];

  porVerificar: any[] = [];
  readonly diasVerificacion = DIAS_VERIFICACION;
  readonly verifCols = ['fecha', 'funcionario', 'titulo', 'hechaEn', 'hechaPor', 'detalle', 'acciones'];

  avisos: any[] = [];
  avisoCanal: string | null = null;
  avisoEstado: string | null = null;
  readonly avisoCols = ['creadoEn', 'funcionario', 'tarea', 'momento', 'nivel', 'canal', 'estado', 'destino', 'error'];

  propuestas: any[] = [];
  propEstado: string | null = 'PENDIENTE';
  readonly propCols = ['creadaEn', 'funcionario', 'tarea', 'motivo', 'estado', 'acciones'];

  constructor(
    private api: FuncionesTareasApiService,
    private snack: MatSnackBar,
    private dialog: MatDialog,
    private permisos: PermissionService,
  ) {}

  /** Verificar / rechazar (el backend exige RRHH_FT_VERIFICAR). Sin él no se muestran los botones. */
  get puedeVerificar(): boolean {
    return this.permisos.has('RRHH_FT_VERIFICAR');
  }

  /** Registrar / descartar una propuesta (el backend acepta RRHH_FT_VERIFICAR o RRHH_FT_CONFIGURAR). */
  get puedeResolverPropuestas(): boolean {
    return this.permisos.hasAny(['RRHH_FT_VERIFICAR', 'RRHH_FT_CONFIGURAR']);
  }

  /** Pide un texto en un diálogo; undefined si se cancela. */
  private async pedirTexto(data: PromptDialogData): Promise<string | undefined> {
    const ref = this.dialog.open(PromptDialogComponent, {
      width: '460px',
      data: { cancelText: 'Cancelar', ...data },
    });
    return firstValueFrom(ref.afterClosed());
  }

  ngOnInit() {
    this.refrescar();
  }

  private async ejecutar(fn: () => Promise<void>, ok?: string) {
    this.cargando = true;
    try {
      await fn();
      if (ok) this.snack.open(ok, 'OK', { duration: 2500 });
    } catch (e) {
      this.snack.open(ftMensajeError(e), 'CERRAR', { duration: 6000 });
    } finally {
      this.cargando = false;
    }
  }

  async refrescar() {
    await Promise.all([this.cargarTareas(), this.cargarPorVerificar(), this.cargarAvisos(), this.cargarPropuestas()]);
  }

  async cargarTareas() {
    await this.ejecutar(async () => {
      this.tareas = (await this.api.tareasList({ desde: this.fecha, hasta: this.fecha })) ?? [];
      const porFunc = new Map<string, FilaCumplimiento>();
      for (const t of this.tareas) {
        if (t.estado === 'NO_APLICA') continue;
        const nombre = t.funcionario?.nombre ?? '(SIN FUNCIONARIO)';
        const f = porFunc.get(nombre) ?? { funcionario: nombre, total: 0, cumplidas: 0, vencidas: 0, pendientes: 0, porcentaje: 0 };
        f.total++;
        if (t.estado === 'HECHA' || t.estado === 'VERIFICADA') f.cumplidas++;
        else if (t.estado === 'VENCIDA') f.vencidas++;
        else f.pendientes++;
        porFunc.set(nombre, f);
      }
      let tot = 0;
      let ok = 0;
      this.cumplimiento = [...porFunc.values()].map((f) => {
        tot += f.total;
        ok += f.cumplidas;
        return { ...f, porcentaje: f.total ? Math.round((f.cumplidas * 100) / f.total) : 0 };
      }).sort((a, b) => a.porcentaje - b.porcentaje);
      this.totalPct = tot ? Math.round((ok * 100) / tot) : 0;
      this.vencidas = this.tareas.filter((t) => t.estado === 'VENCIDA');
    });
  }

  // ───────── Bandeja de verificación ─────────
  async cargarPorVerificar() {
    await this.ejecutar(async () => {
      const hasta = this.fecha;
      const desde = restarDias(hasta, DIAS_VERIFICACION - 1);
      this.porVerificar = (await this.api.tareasList({ desde, hasta, estado: 'HECHA' })) ?? [];
    });
  }

  itemsHechos(t: any): string {
    const items = t?.items ?? [];
    return items.length ? `${items.filter((i: any) => i.hecho).length}/${items.length} ítems` : '';
  }

  async verificar(t: any) {
    const nota = await this.pedirTexto({
      title: 'Verificar tarea',
      message: `${t.funcionario?.nombre ?? ''} — ${t.titulo}`,
      label: 'Nota de verificación (opcional)',
      required: false,
      confirmText: 'Verificar',
    });
    if (nota === undefined) return;
    await this.ejecutar(async () => {
      await this.api.tareaVerificar(t.id, nota || undefined);
      await Promise.all([this.cargarPorVerificar(), this.cargarTareasSiMismoDia(t)]);
    }, 'TAREA VERIFICADA');
  }

  async rechazar(t: any) {
    const motivo = await this.pedirTexto({
      title: 'Rechazar tarea',
      message: `${t.funcionario?.nombre ?? ''} — ${t.titulo}\nLa tarea vuelve a quedar abierta para que la rehaga.`,
      label: 'Motivo del rechazo',
      required: true,
      confirmText: 'Rechazar',
    });
    if (!motivo) return;
    await this.ejecutar(async () => {
      await this.api.tareaRechazar(t.id, motivo);
      await Promise.all([this.cargarPorVerificar(), this.cargarTareasSiMismoDia(t)]);
    }, 'TAREA RECHAZADA');
  }

  /** «No aplica» de un encargado: tareas PENDIENTES, VENCIDAS o RECHAZADAS de otro funcionario. */
  async noAplica(t: any) {
    const motivo = await this.pedirTexto({
      title: 'Marcar como «no aplica»',
      message: `${t.funcionario?.nombre ?? ''} — ${t.titulo}`,
      label: 'Por qué no aplica',
      required: true,
      confirmText: 'No aplica',
    });
    if (!motivo) return;
    await this.ejecutar(async () => {
      await this.api.tareaNoAplica(t.id, motivo);
      await this.cargarTareas();
    }, 'TAREA MARCADA COMO NO APLICA');
  }

  private async cargarTareasSiMismoDia(t: any) {
    if (String(t?.fecha ?? '').slice(0, 10) === this.fecha) await this.cargarTareas();
  }

  async cargarAvisos() {
    await this.ejecutar(async () => {
      const filtros: any = { desde: this.fecha, hasta: this.fecha };
      if (this.avisoCanal) filtros.canal = this.avisoCanal;
      if (this.avisoEstado) filtros.estado = this.avisoEstado;
      this.avisos = ((await this.api.avisos(filtros)) ?? []).reverse();
    });
  }

  async cargarPropuestas() {
    await this.ejecutar(async () => {
      const filtros: any = {};
      if (this.propEstado) filtros.estado = this.propEstado;
      this.propuestas = (await this.api.propuestasList(filtros)) ?? [];
    });
  }

  async resolver(p: any, estado: 'REGISTRADA' | 'DESCARTADA') {
    const registrar = estado === 'REGISTRADA';
    const nota = await this.pedirTexto({
      title: registrar ? 'Marcar propuesta como registrada' : 'Descartar propuesta',
      message: `${p.funcionario?.nombre ?? ''} — ${p.tarea?.titulo ?? ''}`
        + (registrar ? '\nCargá la falta en Disciplina antes de marcarla como registrada.' : ''),
      label: registrar ? 'Nota (opcional)' : 'Motivo para descartar (opcional)',
      required: false,
      confirmText: registrar ? 'Registrada' : 'Descartar',
    });
    if (nota === undefined) return;
    await this.ejecutar(async () => {
      await this.api.propuestaResolver(p.id, { estado, nota: nota || undefined });
      await this.cargarPropuestas();
    }, estado === 'REGISTRADA' ? 'PROPUESTA REGISTRADA' : 'PROPUESTA DESCARTADA');
  }
}
