/**
 * Resultados de Disciplina y Reconocimiento (fase 4, solo lectura; RRHH_DR_APROBAR o RRHH_DR_RESULTADOS_VER).
 *  - Tablero: tarjetas por persona con semáforo (neto premios − multas) para la revisión de los lunes.
 *  - Por persona: hechos del rango y neto por mes de liquidación; export CSV.
 *  - Encuesta: promedios por persona y pregunta de un período cerrado (solo si alcanzó el mínimo de votantes).
 * Nunca muestra votos individuales: el backend solo devuelve agregados.
 */
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from 'src/app/database/repository.service';
import { DisciplinaApiService, drClaseEstado, drFechaIso, drFechaVista, drMensajeError, drNombreFuncionario } from '../disciplina-api.service';

type Semaforo = 'verde' | 'amarillo' | 'rojo';

@Component({
  selector: 'app-resultados-disciplina',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTabsModule, MatTableModule, MatButtonModule, MatIconModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatTooltipModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  templateUrl: './resultados-disciplina.component.html',
  styleUrls: ['./resultados-disciplina.component.scss'],
})
export class ResultadosDisciplinaComponent implements OnInit {
  readonly claseEstado = drClaseEstado;
  readonly fechaVista = drFechaVista;

  desde = '';
  hasta = '';
  grupoId: number | null = null;
  grupos: { id: number; nombre: string }[] = [];
  funcionarios: { id: number; nombre: string }[] = [];

  cargandoTablero = false;
  tablero: any = null;

  funcionarioId: number | null = null;
  cargandoReporte = false;
  reporte: any = null;
  maxPuntaje = 1;

  periodos: any[] = [];
  periodoId: number | null = null;
  cargandoEncuesta = false;
  encuesta: any = null;
  preguntasEncuesta: string[] = [];
  filasEncuesta: { evaluado: string; valores: Record<string, number | null> }[] = [];

  constructor(private api: DisciplinaApiService, private repositoryService: RepositoryService, private snackBar: MatSnackBar) {}

  async ngOnInit(): Promise<void> {
    const hoy = new Date();
    this.desde = drFechaIso(new Date(hoy.getFullYear(), hoy.getMonth(), 1))!;
    this.hasta = drFechaIso(hoy)!;
    try {
      const [funcs, grupos, periodos] = await Promise.all([
        firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true })),
        this.api.getCatalogo('grupos'),
        this.api.getPeriodos({}),
      ]);
      this.funcionarios = ((funcs as any[]) ?? []).map((f) => ({ id: f.id, nombre: drNombreFuncionario(f) }));
      this.grupos = (grupos ?? []).map((g: any) => ({ id: g.id, nombre: g.nombre }));
      this.periodos = (periodos ?? []).filter((p: any) => p.estado !== 'ABIERTO' && (p.encuesta || p.encuestaId));
    } catch (e) {
      console.error(e);
    }
    await this.cargarTablero();
  }

  private error(e: any): void {
    this.snackBar.open(drMensajeError(e), 'OK', { duration: 5000 });
  }

  async cargarTablero(): Promise<void> {
    if (!this.desde || !this.hasta) return;
    this.cargandoTablero = true;
    try {
      this.tablero = await this.api.getTablero({ desde: this.desde, hasta: this.hasta, grupoId: this.grupoId });
    } catch (e) {
      this.error(e);
    } finally {
      this.cargandoTablero = false;
    }
  }

  /** Verde: neto ≥ 0 y sin multas; amarillo: advertencias o faltas pendientes; rojo: neto negativo. */
  semaforo(r: any): Semaforo {
    if (r.neto < 0) return 'rojo';
    if (r.multas > 0 || r.advertencias > 0 || r.faltasPendientes > 0 || r.errores > 0) return 'amarillo';
    return 'verde';
  }

  verPersona(funcionarioId: number, tabs?: { selectedIndex: number }): void {
    this.funcionarioId = funcionarioId;
    if (tabs) tabs.selectedIndex = 1;
    this.cargarReporte();
  }

  async cargarReporte(): Promise<void> {
    if (!this.funcionarioId) return;
    this.cargandoReporte = true;
    try {
      this.reporte = await this.api.getReportePersona({ funcionarioId: this.funcionarioId, desde: this.desde, hasta: this.hasta });
      this.maxPuntaje = Math.max(1, ...(this.reporte?.puntajeDiario ?? []).map((d: any) => Number(d.total) || 0));
    } catch (e) {
      this.error(e);
    } finally {
      this.cargandoReporte = false;
    }
  }

  exportarReporte(): void {
    const r = this.reporte;
    if (!r) return;
    const filas: string[][] = [['TIPO', 'FECHA', 'DETALLE', 'ESTADO', 'MONTO EN SUELDO', 'MES DESTINO']];
    for (const f of r.faltas) filas.push(['FALTA', f.fecha, `${f.tipo ?? ''} (${f.resultado})`, f.estado, String(-f.montoEnSueldo), f.mesDestino ?? '']);
    for (const e of r.errores) filas.push(['ERROR', e.fecha, `${e.tipo ?? ''} (${e.puntos} PTS)`, e.estado, '0', '']);
    for (const p of r.premios) filas.push(['PREMIO', p.hasta, `${p.premio ?? ''} #${p.posicion ?? '-'}`, p.estado, String(p.montoEnSueldo), p.mesDestino ?? '']);
    for (const m of r.netoPorMes) filas.push(['NETO', m.mes, 'PREMIOS − MULTAS', '', String(m.neto), m.mes]);
    const csv = filas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `disciplina-${r.funcionario.replace(/\s+/g, '-')}-${r.desde}-${r.hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async cargarEncuesta(): Promise<void> {
    if (!this.periodoId) return;
    this.cargandoEncuesta = true;
    try {
      this.encuesta = await this.api.getResultadosEncuesta(this.periodoId);
      const preguntas = new Map<string, string>();
      const porEvaluado = new Map<string, Record<string, number | null>>();
      for (const f of this.encuesta?.filas ?? []) {
        const p = f.pregunta ?? `#${f.preguntaId}`;
        preguntas.set(p, p);
        const ev = f.evaluado || `#${f.evaluadoId}`;
        const row = porEvaluado.get(ev) ?? {};
        row[p] = f.tipo === 'SI_NO' ? (f.conteoSi + f.conteoNo ? Math.round((100 * f.conteoSi) / (f.conteoSi + f.conteoNo)) : null) : (f.promedio != null ? Math.round(f.promedio * 100) / 100 : null);
        porEvaluado.set(ev, row);
      }
      this.preguntasEncuesta = [...preguntas.keys()];
      this.filasEncuesta = [...porEvaluado.entries()].map(([evaluado, valores]) => ({ evaluado, valores }));
    } catch (e) {
      this.error(e);
    } finally {
      this.cargandoEncuesta = false;
    }
  }

  etiquetaPeriodo(p: any): string {
    return `${p.premio?.nombre ?? p.encuesta?.titulo ?? 'PERÍODO'} · ${drFechaVista(p.desde)} – ${drFechaVista(p.hasta)} · ${p.estado}`;
  }
}
