/**
 * Registro e historial de Disciplina y Reconocimiento (permiso RRHH_DR_REGISTRAR).
 * Pestañas Faltas y Errores: filtros con botón Filtrar, registrar y anular con motivo
 * (anular requiere RRHH_DR_APROBAR; el backend lo valida).
 */
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { HasPermissionDirective } from 'src/app/shared/directives/has-permission.directive';
import { DrFaltaEstado } from 'src/app/database/entities/rrhh/disciplina/dr-falta.enum';
import { DrErrorEstado } from 'src/app/database/entities/rrhh/disciplina/dr-error-estado.enum';
import {
  DisciplinaApiService, drClaseEstado, drEsAutoResolucion, drFechaIso, drFechaVista, drMensajeError, drNombreFuncionario,
} from '../disciplina-api.service';
import { RegistrarFaltaDialogComponent, RegistrarFaltaDialogData } from './registrar-falta-dialog.component';
import { RegistrarErrorDialogComponent, RegistrarErrorDialogData } from './registrar-error-dialog.component';

interface FaltaVista {
  id: number;
  clave: string;
  fecha: string;
  funcionario: string;
  tipo: string;
  ocurrencia: number;
  resultado: string;
  esMulta: boolean;
  monto: number;
  moneda: string;
  estado: string;
  claseEstado: string;
  vence: Date | null;
  observacion: string;
  resolucion: string;
  anulable: boolean;
}

interface ErrorVista {
  id: number;
  clave: string;
  fecha: string;
  funcionario: string;
  tipo: string;
  gravedad: string;
  puntos: number;
  detalle: string;
  estado: string;
  claseEstado: string;
  motivo: string;
  anulable: boolean;
}

const primeroDelMes = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

@Component({
  selector: 'app-registro-disciplina',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTabsModule, MatTableModule, MatButtonModule, MatIconModule, MatMenuModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatNativeDateModule, MatTooltipModule,
    MatProgressSpinnerModule, MatDialogModule, MatSnackBarModule, HasPermissionDirective,
  ],
  templateUrl: './registro-disciplina.component.html',
  styleUrls: ['./registro-disciplina.component.scss'],
})
export class RegistroDisciplinaComponent implements OnInit {
  funcionarios: { id: number; nombre: string }[] = [];
  estadosFalta = Object.values(DrFaltaEstado);
  estadosError = Object.values(DrErrorEstado);

  // Faltas
  fDesde: Date | null = primeroDelMes();
  fHasta: Date | null = new Date();
  fFuncionarioId: number | null = null;
  fEstado: string | null = null;
  faltas: FaltaVista[] = [];
  cargandoFaltas = false;
  colsFaltas = ['fecha', 'funcionario', 'tipo', 'ocurrencia', 'resultado', 'monto', 'estado', 'vence', 'observacion', 'acciones'];

  // Errores
  eDesde: Date | null = primeroDelMes();
  eHasta: Date | null = new Date();
  eFuncionarioId: number | null = null;
  eEstado: string | null = null;
  errores: ErrorVista[] = [];
  cargandoErrores = false;
  colsErrores = ['fecha', 'funcionario', 'tipo', 'gravedad', 'puntos', 'detalle', 'estado', 'acciones'];

  procesandoId: string | null = null;

  constructor(
    private api: DisciplinaApiService,
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const funcs: any[] = (await firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true }))) ?? [];
      this.funcionarios = funcs.map((f) => ({ id: f.id, nombre: drNombreFuncionario(f) }));
    } catch (e) {
      console.error(e);
    }
    await Promise.all([this.cargarFaltas(), this.cargarErrores()]);
  }

  // ───────────── Faltas ─────────────
  async cargarFaltas(): Promise<void> {
    this.cargandoFaltas = true;
    try {
      const filas = await this.api.getFaltas({
        desde: drFechaIso(this.fDesde),
        hasta: drFechaIso(this.fHasta),
        funcionarioId: this.fFuncionarioId,
        estado: this.fEstado,
        limite: 1000,
      });
      const anulables: string[] = [DrFaltaEstado.REGISTRADA, DrFaltaEstado.APELADA, DrFaltaEstado.APROBADA];
      this.faltas = (filas ?? []).map((f: any) => ({
        id: f.id,
        clave: `f-${f.id}`,
        fecha: drFechaVista(f.fecha),
        funcionario: drNombreFuncionario(f.funcionario),
        tipo: f.tipoFalta?.nombre ?? '-',
        ocurrencia: Number(f.nOcurrencia) || 0,
        resultado: f.resultado,
        esMulta: f.resultado === 'MULTA',
        monto: Number(f.montoCalculado) || 0,
        moneda: f.moneda?.simbolo ?? '',
        estado: f.estado,
        claseEstado: drClaseEstado(f.estado),
        vence: f.apelacionVence ? new Date(f.apelacionVence) : null,
        observacion: f.observacion || '',
        resolucion: f.motivoAnulacion || f.resolucionTexto || '',
        anulable: anulables.includes(f.estado),
      }));
    } catch (e) {
      this.error(e);
    } finally {
      this.cargandoFaltas = false;
    }
  }

  async registrarFalta(): Promise<void> {
    let tiposFalta: any[] = [];
    try {
      tiposFalta = await this.api.getTiposFalta(false);
    } catch (e) {
      this.error(e);
      return;
    }
    const data: RegistrarFaltaDialogData = { tiposFalta, funcionarios: this.funcionarios };
    const ok = await firstValueFrom(this.dialog.open(RegistrarFaltaDialogComponent, { data, width: '720px', maxHeight: '90vh' }).afterClosed());
    if (ok) await this.cargarFaltas();
  }

  async anularFalta(f: FaltaVista): Promise<void> {
    const motivo = await firstValueFrom(this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular falta',
        message: `¿Anular la falta «${f.tipo}» de ${f.funcionario} (${f.fecha})?${f.estado === 'APROBADA' ? '\n\nSi generó una multa, se anulan sus cuotas (salvo que ya estén en una liquidación aprobada o pagada).' : ''}`,
        confirmText: 'Anular',
        cancelText: 'Cancelar',
        showInput: true,
        inputLabel: 'MOTIVO (OBLIGATORIO)',
      },
    }).afterClosed());
    if (typeof motivo !== 'string' || !motivo.trim()) return;
    this.procesandoId = f.clave;
    try {
      await this.api.anularFalta(f.id, motivo);
      this.snackBar.open('FALTA ANULADA', 'Cerrar', { duration: 2500 });
      await this.cargarFaltas();
    } catch (e) {
      this.error(e);
    } finally {
      this.procesandoId = null;
    }
  }

  // ───────────── Errores ─────────────
  async cargarErrores(): Promise<void> {
    this.cargandoErrores = true;
    try {
      const filas = await this.api.getErrores({
        desde: drFechaIso(this.eDesde),
        hasta: drFechaIso(this.eHasta),
        funcionarioId: this.eFuncionarioId,
        estado: this.eEstado,
      });
      this.errores = (filas ?? []).map((e: any) => ({
        id: e.id,
        clave: `e-${e.id}`,
        fecha: drFechaVista(e.fecha),
        funcionario: drNombreFuncionario(e.funcionario),
        tipo: e.tipoError?.nombre ?? '-',
        gravedad: e.tipoError?.gravedad?.nombre ?? '-',
        puntos: Number(e.puntos) || 0,
        detalle: e.detalle || '',
        estado: e.estado,
        claseEstado: drClaseEstado(e.estado),
        motivo: e.motivoAnulacion || '',
        anulable: e.estado === DrErrorEstado.VIGENTE,
      }));
    } catch (e) {
      this.error(e);
    } finally {
      this.cargandoErrores = false;
    }
  }

  async registrarError(): Promise<void> {
    let tiposError: any[] = [];
    try {
      tiposError = await this.api.getCatalogo('tipos-error');
    } catch (e) {
      this.error(e);
      return;
    }
    const data: RegistrarErrorDialogData = { tiposError, funcionarios: this.funcionarios };
    const ok = await firstValueFrom(this.dialog.open(RegistrarErrorDialogComponent, { data, width: '720px', maxHeight: '90vh' }).afterClosed());
    if (ok) await this.cargarErrores();
  }

  async anularError(e: ErrorVista): Promise<void> {
    const motivo = await firstValueFrom(this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular error',
        message: `¿Anular el error «${e.tipo}» de ${e.funcionario} (${e.fecha})? Deja de descontar puntos.`,
        confirmText: 'Anular',
        cancelText: 'Cancelar',
        showInput: true,
        inputLabel: 'MOTIVO (OBLIGATORIO)',
      },
    }).afterClosed());
    if (typeof motivo !== 'string' || !motivo.trim()) return;
    this.procesandoId = e.clave;
    try {
      await this.api.anularError(e.id, motivo);
      this.snackBar.open('ERROR ANULADO', 'Cerrar', { duration: 2500 });
      await this.cargarErrores();
    } catch (err) {
      this.error(err);
    } finally {
      this.procesandoId = null;
    }
  }

  private error(e: any): void {
    console.error(e);
    const msg = drEsAutoResolucion(e)
      ? 'NO PODÉS ANULAR UNA FALTA QUE REGISTRASTE VOS: LA TIENE QUE RESOLVER OTRO APROBADOR'
      : drMensajeError(e);
    this.snackBar.open(msg, 'Cerrar', { duration: 8000, panelClass: 'error-snackbar' });
  }
}
