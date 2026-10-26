/**
 * Configuración de Funciones y Tareas (permiso RRHH_FT_CONFIGURAR).
 * Pestañas: Funciones (por cargo o funcionario), Plantillas (ítems de checklist y reglas de
 * aviso) y Motor (ft-config-get/set). Edición en un panel debajo de cada tabla.
 */
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import {
  FT_ANCLAS, FT_CANALES, FT_EVENTOS, FT_EVIDENCIAS, FT_MOMENTOS_AVISO, FT_RECURRENCIAS, FT_TIPOS,
  FuncionesTareasApiService, ftMensajeError,
} from '../funciones-tareas-api.service';

const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];

@Component({
  selector: 'app-config-funciones-tareas',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTabsModule, MatTableModule, MatButtonModule, MatIconModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatCheckboxModule, MatTooltipModule, MatSnackBarModule, MatDialogModule,
  ],
  templateUrl: './config-funciones-tareas.component.html',
  styleUrls: ['./config-funciones-tareas.component.scss'],
})
export class ConfigFuncionesTareasComponent implements OnInit {
  readonly tipos = FT_TIPOS;
  readonly recurrencias = FT_RECURRENCIAS;
  readonly eventos = FT_EVENTOS;
  readonly anclas = FT_ANCLAS;
  readonly evidencias = FT_EVIDENCIAS;
  readonly momentos = FT_MOMENTOS_AVISO;
  readonly canales = FT_CANALES;
  readonly dias = DIAS;

  cargos: any[] = [];
  funcionarios: any[] = [];
  turnos: any[] = [];
  /** Áreas (dr_grupo) y tipos de falta de Disciplina: requieren permisos DR; si no hay, quedan vacíos. */
  grupos: any[] = [];
  tiposFalta: any[] = [];
  cargando = false;

  // Funciones
  fnFiltroTipo: 'cargo' | 'funcionario' = 'cargo';
  fnFiltroId: number | null = null;
  funciones: any[] = [];
  fnEdit: any = null;
  readonly fnCols = ['descripcion', 'alcance', 'orden', 'activo', 'acciones'];

  // Plantillas
  plantillas: any[] = [];
  plEdit: any = null;
  readonly plCols = ['titulo', 'alcance', 'tipo', 'recurrencia', 'ancla', 'activo', 'acciones'];

  // Motor
  config: Record<string, string> = {};
  ultimoTick: any = null;
  lock: any = null;

  constructor(private api: FuncionesTareasApiService, private snack: MatSnackBar, private dialog: MatDialog) {}

  private async confirmar(title: string, message: string, confirmText = 'Borrar'): Promise<boolean> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: { title, message, confirmText, cancelText: 'Cancelar' },
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  async ngOnInit() {
    await this.ejecutar(async () => {
      // get-cargos / get-turnos devuelven la entidad plana (id, nombre, ...); get-funcionarios
      // filtra activos con `soloActivos` y trae `persona` (nombre, apellido) y `cargo`.
      const [cargos, funcs, turnos, grupos, tiposFalta] = await Promise.all([
        this.api.call<any[]>('get-cargos'),
        this.api.call<any[]>('get-funcionarios', { soloActivos: true }),
        this.api.call<any[]>('get-turnos').catch(() => []),
        this.api.call<any[]>('dr-get-grupos').catch(() => []),
        this.api.call<any[]>('dr-get-tipos-falta').catch(() => []),
      ]);
      this.cargos = cargos ?? [];
      this.funcionarios = funcs ?? [];
      this.turnos = turnos ?? [];
      this.grupos = grupos ?? [];
      this.tiposFalta = tiposFalta ?? [];
    });
    await Promise.all([this.cargarFunciones(), this.cargarPlantillas(), this.cargarConfig()]);
  }

  nombreFunc(f: any): string {
    if (!f) return '';
    const p = f.persona;
    return p ? [p.nombre, p.apellido].filter(Boolean).join(' ') : f.nombre ?? `#${f.id}`;
  }

  alcance(r: any): string {
    if (r?.funcionario) return `FUNC.: ${this.nombreFunc(r.funcionario)}`;
    if (r?.cargo) return `CARGO: ${r.cargo.nombre}${r.turno ? ' / ' + (r.turno.nombre ?? r.turno.id) : ''}`;
    if (r?.grupo) return `ÁREA: ${r.grupo.nombre}`;
    return '-';
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

  // ───────── Funciones ─────────
  async cargarFunciones() {
    await this.ejecutar(async () => {
      const filtros: any = { incluirInactivas: true };
      if (this.fnFiltroId) filtros[this.fnFiltroTipo === 'cargo' ? 'cargoId' : 'funcionarioId'] = this.fnFiltroId;
      this.funciones = (await this.api.funcionesList(filtros)) ?? [];
    });
  }

  nuevaFuncion() {
    this.fnEdit = {
      descripcion: '', detalle: '', orden: 0, activo: true,
      tipoAlcance: this.fnFiltroTipo, alcanceId: this.fnFiltroId,
    };
  }

  editarFuncion(r: any) {
    this.fnEdit = {
      id: r.id, descripcion: r.descripcion, detalle: r.detalle, orden: r.orden, activo: r.activo,
      tipoAlcance: r.funcionario ? 'funcionario' : 'cargo', alcanceId: r.funcionario?.id ?? r.cargo?.id ?? null,
    };
  }

  async guardarFuncion() {
    const e = this.fnEdit;
    const data: any = { id: e.id, descripcion: e.descripcion, detalle: e.detalle, orden: Number(e.orden) || 0, activo: e.activo };
    data[e.tipoAlcance === 'cargo' ? 'cargoId' : 'funcionarioId'] = e.alcanceId;
    await this.ejecutar(async () => {
      await this.api.funcionesSave(data);
      this.fnEdit = null;
      await this.cargarFunciones();
    }, 'FUNCIÓN GUARDADA');
  }

  async activoFuncion(r: any, activo: boolean) {
    await this.ejecutar(async () => { await this.api.funcionesSetActivo(r.id, activo); await this.cargarFunciones(); });
  }

  async borrarFuncion(r: any) {
    if (!(await this.confirmar('Borrar función', `¿Borrar la función «${r.descripcion}»?`))) return;
    await this.ejecutar(async () => { await this.api.funcionesDelete(r.id); await this.cargarFunciones(); }, 'FUNCIÓN BORRADA');
  }

  // ───────── Plantillas ─────────
  async cargarPlantillas() {
    await this.ejecutar(async () => {
      this.plantillas = (await this.api.plantillasList({ incluirInactivas: true })) ?? [];
    });
  }

  nuevaPlantilla() {
    this.plEdit = {
      titulo: '', instrucciones: '', tipo: 'SIMPLE', recurrencia: 'DIARIA', ancla: 'INICIO_TURNO', evidencia: 'NINGUNA',
      offsetInicioMin: 0, duracionMin: 60, horaFija: '', diasSemana: 0, diaMes: null, fechaUnica: null, evento: null, eventoCaja: null,
      requiereVerificacion: false, verificadorCargoId: null, activo: true, critica: false, peso: 1,
      tipoAlcance: 'cargo', cargoId: null, turnoId: null, funcionarioId: null, grupoId: null,
      reemplazaPlantillaId: null, tipoFaltaId: null, criterioId: null,
      items: [], reglas: [],
    };
  }

  async editarPlantilla(r: any) {
    await this.ejecutar(async () => {
      const p: any = await this.api.plantillasGet(r.id);
      this.plEdit = {
        ...p,
        tipoAlcance: p.funcionario ? 'funcionario' : p.grupo ? 'grupo' : 'cargo',
        cargoId: p.cargo?.id ?? null, turnoId: p.turno?.id ?? null, funcionarioId: p.funcionario?.id ?? null,
        grupoId: p.grupo?.id ?? null, verificadorCargoId: p.verificadorCargo?.id ?? null,
        reemplazaPlantillaId: p.reemplazaPlantilla?.id ?? null, tipoFaltaId: p.tipoFalta?.id ?? null,
        criterioId: p.criterio?.id ?? null,
        horaFija: p.horaFija ? String(p.horaFija).slice(0, 5) : '',
        items: (p.items ?? []).map((i: any) => ({ id: i.id, texto: i.texto, orden: i.orden, obligatorio: i.obligatorio })),
        reglas: (p.reglas ?? []).map((x: any) => ({ id: x.id, momento: x.momento, minutos: x.minutos, nivel: x.nivel, canal: x.canal, destino: x.destino, activo: x.activo })),
      };
    });
  }

  /** Plantillas generales (sin funcionario) que una específica puede reemplazar. */
  get plantillasGenerales(): any[] {
    return this.plantillas.filter((p) => !p.funcionario && p.id !== this.plEdit?.id);
  }

  /** El tipo de falta actual puede estar inactivo o no venir en la lista (sin permiso DR). */
  get tipoFaltaFueraDeLista(): boolean {
    const id = this.plEdit?.tipoFaltaId;
    return !!id && !this.tiposFalta.some((t) => t.id === id);
  }

  get grupoFueraDeLista(): boolean {
    const id = this.plEdit?.grupoId;
    return !!id && !this.grupos.some((g) => g.id === id);
  }

  diaMarcado(i: number): boolean { return ((this.plEdit?.diasSemana ?? 0) & (1 << i)) !== 0; }
  toggleDia(i: number) { this.plEdit.diasSemana = (this.plEdit.diasSemana ?? 0) ^ (1 << i); }

  agregarItem() { this.plEdit.items.push({ texto: '', orden: this.plEdit.items.length, obligatorio: true }); }
  quitarItem(i: number) { this.plEdit.items.splice(i, 1); }
  agregarRegla() { this.plEdit.reglas.push({ momento: 'AL_VENCER', minutos: 0, nivel: 1, canal: 'APP', destino: '', activo: true }); }
  quitarRegla(i: number) { this.plEdit.reglas.splice(i, 1); }

  async guardarPlantilla() {
    const e = this.plEdit;
    const data: any = {
      id: e.id, titulo: e.titulo, instrucciones: e.instrucciones || null, tipo: e.tipo, recurrencia: e.recurrencia, ancla: e.ancla,
      evidencia: e.evidencia, offsetInicioMin: Number(e.offsetInicioMin) || 0, duracionMin: Number(e.duracionMin) || 0,
      horaFija: e.ancla === 'HORA_FIJA' ? e.horaFija : null,
      diasSemana: e.recurrencia === 'DIAS_SEMANA' ? e.diasSemana : null,
      diaMes: e.recurrencia === 'MENSUAL' ? e.diaMes : null,
      fechaUnica: e.recurrencia === 'UNICA' ? e.fechaUnica : null,
      evento: e.recurrencia === 'EVENTO' ? e.evento : null,
      eventoCaja: e.recurrencia === 'EVENTO' ? e.eventoCaja : null,
      requiereVerificacion: !!e.requiereVerificacion,
      verificadorCargoId: e.requiereVerificacion ? e.verificadorCargoId : null,
      activo: e.activo,
      critica: !!e.critica,
      peso: e.peso === null || e.peso === undefined || e.peso === '' ? 1 : Number(e.peso),
      // El backend pisa con null lo que no viene: se mandan siempre (criterio se conserva tal cual).
      tipoFaltaId: e.tipoFaltaId || null,
      criterioId: e.criterioId || null,
      vigenciaDesde: e.vigenciaDesde || null, vigenciaHasta: e.vigenciaHasta || null,
      items: e.tipo === 'CHECKLIST' ? e.items.map((it: any, i: number) => ({ ...it, orden: i })) : [],
      reglas: e.reglas.map((r: any) => ({ ...r, destino: r.destino || null })),
    };
    if (e.tipoAlcance === 'funcionario') {
      data.funcionarioId = e.funcionarioId;
      // Solo una específica (de un funcionario) puede reemplazar a una general.
      data.reemplazaPlantillaId = e.reemplazaPlantillaId || null;
    } else if (e.tipoAlcance === 'grupo') {
      data.grupoId = Number(e.grupoId) || null;
    } else {
      data.cargoId = e.cargoId;
      data.turnoId = e.turnoId || null;
    }
    await this.ejecutar(async () => {
      await this.api.plantillasSave(data);
      this.plEdit = null;
      await this.cargarPlantillas();
    }, 'PLANTILLA GUARDADA');
  }

  async activoPlantilla(r: any, activo: boolean) {
    await this.ejecutar(async () => { await this.api.plantillasSetActivo(r.id, activo); await this.cargarPlantillas(); });
  }

  async borrarPlantilla(r: any) {
    if (!(await this.confirmar('Borrar plantilla',
      `¿Borrar la plantilla «${r.titulo}»? Si ya generó tareas o la reemplaza otra, desactivala en vez de borrarla.`))) return;
    await this.ejecutar(async () => { await this.api.plantillasDelete(r.id); await this.cargarPlantillas(); }, 'PLANTILLA BORRADA');
  }

  // ───────── Motor ─────────
  async cargarConfig() {
    await this.ejecutar(async () => {
      const r = await this.api.configGet();
      this.config = { ...(r?.valores ?? {}) };
      this.ultimoTick = r?.ultimoTick;
      this.lock = r?.lock;
    });
  }

  get motorActivo(): boolean { return this.config['activo'] === 'true'; }
  set motorActivo(v: boolean) { this.config['activo'] = v ? 'true' : 'false'; }

  claves(): string[] { return Object.keys(this.config).filter((k) => k !== 'activo'); }

  async guardarConfig() {
    await this.ejecutar(async () => { await this.api.configSet(this.config); await this.cargarConfig(); }, 'CONFIGURACIÓN GUARDADA');
  }
}
