/**
 * Tablero de Funciones y Tareas (permiso RRHH_FT_VER_TODO): cumplimiento del día por
 * funcionario, tareas vencidas, avisos (ft-avisos) y propuestas de falta (nivel 3).
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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

function hoyLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

@Component({
  selector: 'app-tablero-funciones-tareas',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTabsModule, MatTableModule, MatButtonModule, MatIconModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule, MatProgressBarModule, MatSnackBarModule,
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
  readonly vencCols = ['funcionario', 'titulo', 'vence', 'critica'];

  avisos: any[] = [];
  avisoCanal: string | null = null;
  avisoEstado: string | null = null;
  readonly avisoCols = ['creadoEn', 'funcionario', 'tarea', 'momento', 'nivel', 'canal', 'estado', 'destino', 'error'];

  propuestas: any[] = [];
  propEstado: string | null = 'PENDIENTE';
  readonly propCols = ['creadaEn', 'funcionario', 'tarea', 'motivo', 'estado', 'acciones'];

  constructor(private api: FuncionesTareasApiService, private snack: MatSnackBar) {}

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
    await Promise.all([this.cargarTareas(), this.cargarAvisos(), this.cargarPropuestas()]);
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
    const nota = prompt(estado === 'REGISTRADA'
      ? 'Nota (opcional). Cargá la falta en Disciplina antes de marcarla como registrada.'
      : 'Motivo para descartar (opcional)') ?? null;
    if (nota === null) return;
    await this.ejecutar(async () => {
      await this.api.propuestaResolver(p.id, { estado, nota: nota || undefined });
      await this.cargarPropuestas();
    }, estado === 'REGISTRADA' ? 'PROPUESTA REGISTRADA' : 'PROPUESTA DESCARTADA');
  }
}
