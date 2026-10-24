/**
 * Bandeja de aprobaciones de Disciplina y Reconocimiento (permiso RRHH_DR_APROBAR).
 *  - Pendientes: faltas REGISTRADAS. Aprobar queda deshabilitado mientras corre el plazo de
 *    apelación y la persona no renunció (el backend también lo bloquea: PLAZO_APELACION_VIGENTE).
 *  - Apeladas: se ve el texto de la apelación; Aprobar (la rechaza) o Justificar (la acepta).
 *  - Premios: calcular la propuesta de un período CERRADO y aprobarla (crea los Bonos [DR]).
 *    TODO(backend): no hay canal para listar períodos (dr-get-periodos); por ahora el período
 *    se indica por su número.
 * Quien registró una falta no puede resolverla (AUTO_RESOLUCION): se avisa con un mensaje claro.
 * Doble clic: botones deshabilitados durante la llamada (la base además lo garantiza).
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { DrFaltaEstado } from 'src/app/database/entities/rrhh/disciplina/dr-falta.enum';
import {
  DisciplinaApiService, drClaseEstado, drEsAutoResolucion, drFechaVista, drMensajeError, drNombreFuncionario,
} from '../disciplina-api.service';

interface FaltaBandeja {
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
  vence: Date | null;
  renuncio: boolean;
  plazoAbierto: boolean;
  puedeAprobar: boolean;
  motivoNoAprobar: string;
  apelacionTexto: string;
  apelacionFecha: Date | null;
  observacion: string;
}

interface FilaPremio {
  posicion: number;
  nombre: string;
  puntaje: number;
  ganador: boolean;
  montoPropuesto: number;
}

const MOTIVOS_DESIERTO: Record<string, string> = {
  SIN_PARTICIPANTES: 'SIN PARTICIPANTES (EL GRUPO NO TIENE MIEMBROS ACTIVOS)',
  MINIMO_VOTANTES: 'NO SE ALCANZÓ EL MÍNIMO DE VOTANTES',
  EMPATE_DESIERTO: 'EMPATE EN EL PRIMER PUESTO CON REGLA «DESIERTO»',
};

@Component({
  selector: 'app-aprobaciones-disciplina',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTabsModule, MatTableModule, MatButtonModule, MatIconModule, MatMenuModule, MatCardModule,
    MatFormFieldModule, MatInputModule, MatTooltipModule, MatProgressSpinnerModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './aprobaciones-disciplina.component.html',
  styleUrls: ['./aprobaciones-disciplina.component.scss'],
})
export class AprobacionesDisciplinaComponent implements OnInit {
  pendientes: FaltaBandeja[] = [];
  apeladas: FaltaBandeja[] = [];
  cargandoPendientes = false;
  cargandoApeladas = false;
  colsPendientes = ['fecha', 'funcionario', 'tipo', 'resultado', 'monto', 'vence', 'renuncia', 'observacion', 'acciones'];
  colsApeladas = ['fecha', 'funcionario', 'tipo', 'resultado', 'monto', 'apelacion', 'acciones'];
  /** Clave de la fila en proceso (o 'premio'): deshabilita botones mientras dura la llamada. */
  procesando: string | null = null;
  totalPendientes = 0;
  totalApeladas = 0;

  // Premios
  periodoId: number | null = null;
  calculando = false;
  aprobandoPremio = false;
  premioCalculado = false;
  premioEstado = '';
  premioClaseEstado = '';
  premioMotivo = '';
  premioVotantes: number | null = null;
  premioMinVotantes: number | null = null;
  premioHayGanadores = false;
  premioPeriodoCalculado: number | null = null;
  ranking: FilaPremio[] = [];
  colsRanking = ['posicion', 'nombre', 'puntaje', 'ganador', 'monto'];

  constructor(
    private api: DisciplinaApiService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.recargar();
  }

  async recargar(): Promise<void> {
    await Promise.all([this.cargarPendientes(), this.cargarApeladas()]);
  }

  private aVista(f: any): FaltaBandeja {
    const vence = f.apelacionVence ? new Date(f.apelacionVence) : null;
    const renuncio = !!f.renunciaApelacion;
    const plazoAbierto = f.estado === DrFaltaEstado.REGISTRADA && !!vence && vence.getTime() > Date.now();
    const puedeAprobar = !(plazoAbierto && !renuncio);
    return {
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
      vence,
      renuncio,
      plazoAbierto,
      puedeAprobar,
      motivoNoAprobar: puedeAprobar ? '' : 'Todavía corre el plazo de apelación y la persona no renunció a apelar',
      apelacionTexto: f.apelacionTexto || '',
      apelacionFecha: f.apelacionFecha ? new Date(f.apelacionFecha) : null,
      observacion: f.observacion || '',
    };
  }

  async cargarPendientes(): Promise<void> {
    this.cargandoPendientes = true;
    try {
      const filas = await this.api.getFaltas({ estado: DrFaltaEstado.REGISTRADA, limite: 1000 });
      // Las más viejas primero: son las que ya pueden resolverse.
      this.pendientes = (filas ?? []).map((f: any) => this.aVista(f)).reverse();
      this.totalPendientes = this.pendientes.length;
    } catch (e) {
      this.error(e);
    } finally {
      this.cargandoPendientes = false;
    }
  }

  async cargarApeladas(): Promise<void> {
    this.cargandoApeladas = true;
    try {
      const filas = await this.api.getFaltas({ estado: DrFaltaEstado.APELADA, limite: 1000 });
      this.apeladas = (filas ?? []).map((f: any) => this.aVista(f)).reverse();
      this.totalApeladas = this.apeladas.length;
    } catch (e) {
      this.error(e);
    } finally {
      this.cargandoApeladas = false;
    }
  }

  // ───────────── Resolución de faltas ─────────────
  async aprobar(f: FaltaBandeja, apelada: boolean): Promise<void> {
    if (!f.puedeAprobar || this.procesando) return;
    const efecto = f.esMulta && f.monto > 0
      ? `Se genera una penalización de ${f.moneda} ${f.monto.toLocaleString('es-PY')} en la liquidación del primer mes abierto (respetando el tope mensual).`
      : 'Es una advertencia: queda registrada sin descuento.';
    const comentario = await firstValueFrom(this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: apelada ? 'Aprobar falta (rechazar la apelación)' : 'Aprobar falta',
        message: `${f.tipo} — ${f.funcionario} (${f.fecha})\n\n${efecto}${apelada ? `\n\nApelación: «${f.apelacionTexto}»` : ''}`,
        confirmText: 'Aprobar',
        cancelText: 'Cancelar',
        showInput: true,
        inputRequerido: apelada,
        inputLabel: apelada ? 'RESPUESTA A LA APELACIÓN (OBLIGATORIA)' : 'COMENTARIO (OPCIONAL)',
      },
    }).afterClosed());
    if (typeof comentario !== 'string') return;
    await this.ejecutar(f, async () => {
      const r = await this.api.aprobarFalta(f.id, comentario || undefined);
      const cuotas: any[] = r?.cuotas ?? [];
      const detalle = cuotas.length > 1
        ? ` EN ${cuotas.length} CUOTAS DESDE ${cuotas[0].mes}`
        : r?.mesDestino ? ` (MES ${r.mesDestino})` : '';
      this.snackBar.open(`FALTA APROBADA${r?.penalizacionId ? ': PENALIZACIÓN GENERADA' + detalle : ''}`, 'Cerrar', { duration: 5000 });
    });
  }

  async justificar(f: FaltaBandeja): Promise<void> {
    if (this.procesando) return;
    const motivo = await firstValueFrom(this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Justificar falta',
        message: `${f.tipo} — ${f.funcionario} (${f.fecha})\n\nLa falta queda JUSTIFICADA: no descuenta ni cuenta para próximas ocurrencias.${f.apelacionTexto ? `\n\nApelación: «${f.apelacionTexto}»` : ''}`,
        confirmText: 'Justificar',
        cancelText: 'Cancelar',
        showInput: true,
        inputLabel: 'MOTIVO (OBLIGATORIO)',
      },
    }).afterClosed());
    if (typeof motivo !== 'string' || !motivo) return;
    await this.ejecutar(f, async () => {
      await this.api.justificarFalta(f.id, motivo);
      this.snackBar.open('FALTA JUSTIFICADA', 'Cerrar', { duration: 3000 });
    });
  }

  async anular(f: FaltaBandeja): Promise<void> {
    if (this.procesando) return;
    const motivo = await firstValueFrom(this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular falta',
        message: `${f.tipo} — ${f.funcionario} (${f.fecha})\n\nAnular es para registros cargados por error. Si la persona tenía razón, usá Justificar.`,
        confirmText: 'Anular',
        cancelText: 'Cancelar',
        showInput: true,
        inputLabel: 'MOTIVO (OBLIGATORIO)',
      },
    }).afterClosed());
    if (typeof motivo !== 'string' || !motivo) return;
    await this.ejecutar(f, async () => {
      await this.api.anularFalta(f.id, motivo);
      this.snackBar.open('FALTA ANULADA', 'Cerrar', { duration: 3000 });
    });
  }

  private async ejecutar(f: FaltaBandeja, accion: () => Promise<void>): Promise<void> {
    this.procesando = f.clave;
    try {
      await accion();
    } catch (e) {
      this.error(e);
    } finally {
      this.procesando = null;
      await this.recargar();
    }
  }

  // ───────────── Premios ─────────────
  async calcularPremio(): Promise<void> {
    const id = Number(this.periodoId);
    if (!id || this.calculando || this.aprobandoPremio) return;
    this.calculando = true;
    this.premioCalculado = false;
    try {
      const r = await this.api.calcularPremio(id);
      this.ranking = (r?.ranking ?? []).map((x: any) => ({
        posicion: Number(x.posicion) || 0,
        nombre: x.nombre,
        puntaje: Number(x.puntaje) || 0,
        ganador: !!x.ganador,
        montoPropuesto: Number(x.montoPropuesto) || 0,
      }));
      this.premioEstado = r?.estado ?? '';
      this.premioClaseEstado = drClaseEstado(this.premioEstado === 'DESIERTO' ? 'DESIERTO' : 'PROPUESTO');
      this.premioMotivo = r?.motivoDesierto ? MOTIVOS_DESIERTO[r.motivoDesierto] ?? r.motivoDesierto : '';
      this.premioVotantes = r?.cantidadVotantes ?? null;
      this.premioMinVotantes = r?.minVotantes ?? null;
      this.premioHayGanadores = this.premioEstado !== 'DESIERTO' && this.ranking.some((x) => x.ganador);
      this.premioPeriodoCalculado = id;
      this.premioCalculado = true;
    } catch (e) {
      this.error(e);
    } finally {
      this.calculando = false;
    }
  }

  async aprobarPremio(): Promise<void> {
    const id = this.premioPeriodoCalculado;
    if (!id || !this.premioHayGanadores || this.aprobandoPremio) return;
    const ganadores = this.ranking.filter((x) => x.ganador).map((x) => `• ${x.nombre}: ${x.montoPropuesto.toLocaleString('es-PY')}`).join('\n');
    const ok = await firstValueFrom(this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: `Aprobar premio del período #${id}`,
        message: `Se crea un bono por cada ganador en el primer mes de liquidación abierto:\n\n${ganadores}\n\nSi ya hay un borrador de liquidación de ese mes, hay que regenerarlo para que tome el bono.`,
        confirmText: 'Aprobar premio',
        cancelText: 'Cancelar',
      },
    }).afterClosed());
    if (!ok) return;
    this.aprobandoPremio = true;
    try {
      const r = await this.api.aprobarPremio(id);
      this.snackBar.open(`PREMIO APROBADO: ${(r?.bonos ?? []).length} BONO(S) CREADO(S)`, 'Cerrar', { duration: 5000 });
      this.premioHayGanadores = false;
      this.premioEstado = 'APROBADO';
      this.premioClaseEstado = drClaseEstado('APROBADO');
    } catch (e) {
      this.error(e);
    } finally {
      this.aprobandoPremio = false;
    }
  }

  private error(e: any): void {
    console.error(e);
    const msg = drEsAutoResolucion(e)
      ? 'NO PODÉS RESOLVER UNA FALTA QUE REGISTRASTE VOS: LA TIENE QUE APROBAR, JUSTIFICAR O ANULAR OTRO APROBADOR'
      : drMensajeError(e);
    this.snackBar.open(msg, 'Cerrar', { duration: 8000, panelClass: 'error-snackbar' });
  }
}
