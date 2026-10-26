import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  DR_MOBILE_STYLES, DrFuncionarioVM, drCall, drCargarFuncionarios, drFechaIso, drFiltrar, drMensajeError, drMonto,
} from '../dr-mobile.utils';

interface TipoFaltaVM {
  id: number;
  nombre: string;
  descripcion?: string;
  todosPresentes: boolean;
  tardanza: boolean;
  toleranciaMinutos: number | null;
  advertenciasPrevias: number;
  montoMulta: number;
  escala: Record<string, number> | null;
  reinicio: string;
  simbolo: string;
  raw: any;
}

interface PreviewVM {
  resultado: 'ADVERTENCIA' | 'MULTA' | 'NINGUNO' | 'IGNORADA';
  monto: number;
  n: number | null;
}

interface ResultadoVM {
  nombre: string;
  resultado: string;
  monto: number;
  n: number | null;
}

/** Estados de asistencia que cuentan como «presente» para precargar las faltas colectivas. */
const ESTADOS_PRESENTE = ['PRESENTE', 'TARDANZA', 'MEDIA_FALTA'];

const REINICIO_TXT: Record<string, string> = { NUNCA: 'sin reinicio', SEMANAL: 'se reinicia cada semana', MENSUAL: 'se reinicia cada mes' };

function parseEscala(v: any): Record<string, number> | null {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try {
    const o = JSON.parse(v);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

/**
 * M1 — Registrar falta (PWA). Tipo de falta (solo activos), funcionario(s) (precarga los presentes
 * del día si el tipo es TODOS_PRESENTES), fecha, minutos si es tardanza y detalle. Muestra la
 * vista previa ADVERTENCIA / MULTA con el mismo motor del backend y, al guardar, creadas e ignoradas.
 */
@Component({
  selector: 'app-registrar-falta',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatProgressBarModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  templateUrl: './registrar-falta.page.html',
  styles: [DR_MOBILE_STYLES],
})
export class RegistrarFaltaPage implements OnInit {
  private readonly snack = inject(MatSnackBar);

  loading = true;
  error: string | null = null;
  guardando = false;

  tipos: TipoFaltaVM[] = [];
  tipo: TipoFaltaVM | null = null;
  private funcionarios: DrFuncionarioVM[] = [];
  visibles: DrFuncionarioVM[] = [];
  seleccion = new Set<number>();
  cargandoPresentes = false;
  presentesCargados: number | null = null;

  readonly busqueda = new FormControl('', { nonNullable: true });
  readonly fecha = new FormControl(drFechaIso(new Date())!, { nonNullable: true });
  readonly minutos = new FormControl<number | null>(null);
  readonly detalle = new FormControl('', { nonNullable: true });

  preview = new Map<number, PreviewVM>();
  calculandoPreview = false;
  /** La última vista previa falló (se muestra un aviso discreto). */
  previewError = false;
  private previewToken = 0;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  creadas: ResultadoVM[] | null = null;
  ignoradas: { nombre: string; motivo: string }[] = [];
  enTolerancia: string[] = [];

  async ngOnInit(): Promise<void> {
    this.busqueda.valueChanges.subscribe(() => this.filtrar());
    this.fecha.valueChanges.subscribe(() => {
      if (this.tipo?.todosPresentes) this.cargarPresentes();
      this.actualizarPreview();
    });
    this.minutos.valueChanges.subscribe(() => this.programarPreview());
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [tipos, funcs] = await Promise.all([drCall('dr-get-tipos-falta', { incluirInactivos: false }), drCargarFuncionarios()]);
      this.tipos = ((tipos ?? []) as any[]).filter((t) => t?.activo !== false).map((t) => ({
        id: t.id,
        nombre: t.nombre,
        descripcion: t.descripcion ?? undefined,
        todosPresentes: t.modoAplicacion === 'TODOS_PRESENTES',
        tardanza: !!t.fuenteAsistencia || (t.toleranciaMinutos !== null && t.toleranciaMinutos !== undefined),
        toleranciaMinutos: t.toleranciaMinutos ?? null,
        advertenciasPrevias: Number(t.advertenciasPrevias) || 0,
        montoMulta: Number(t.montoMulta) || 0,
        escala: parseEscala(t.escalaMontos),
        reinicio: t.reinicio,
        simbolo: t.moneda?.simbolo ?? '',
        raw: t,
      }));
      this.funcionarios = funcs;
      this.filtrar();
    } catch (e) {
      this.error = drMensajeError(e);
    } finally {
      this.loading = false;
    }
  }

  monto(v: number, simbolo?: string): string {
    return drMonto(v, simbolo || this.tipo?.simbolo);
  }

  /** Regla configurada del tipo, en palabras (sin valores fijos en el código). */
  regla(t: TipoFaltaVM): string {
    const partes: string[] = [];
    if (t.advertenciasPrevias > 0) {
      partes.push(`${t.advertenciasPrevias} advertencia${t.advertenciasPrevias > 1 ? 's' : ''}, después multa de ${drMonto(t.montoMulta, t.simbolo)}`);
    } else {
      partes.push(`Multa de ${drMonto(t.montoMulta, t.simbolo)}`);
    }
    if (t.escala && Object.keys(t.escala).length) {
      const esc = Object.entries(t.escala)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([n, m]) => `${n}.ª ${drMonto(Number(m), t.simbolo)}`)
        .join(' · ');
      partes.push(`escala: ${esc}`);
    }
    if (t.toleranciaMinutos !== null) partes.push(`tolerancia ${t.toleranciaMinutos} min`);
    if (REINICIO_TXT[t.reinicio]) partes.push(REINICIO_TXT[t.reinicio]);
    return partes.join(' · ');
  }

  elegirTipo(t: TipoFaltaVM): void {
    if (this.creadas) return;
    this.tipo = t;
    if (!t.tardanza) this.minutos.setValue(null, { emitEvent: false });
    if (t.todosPresentes) this.cargarPresentes();
    this.actualizarPreview();
  }

  filtrar(): void {
    this.visibles = drFiltrar(this.funcionarios, this.busqueda.value);
  }

  toggle(f: DrFuncionarioVM): void {
    if (this.creadas) return;
    if (this.seleccion.has(f.id)) this.seleccion.delete(f.id);
    else this.seleccion.add(f.id);
    this.programarPreview();
  }

  limpiarSeleccion(): void {
    this.seleccion.clear();
    this.actualizarPreview();
  }

  nombre(id: number): string {
    return this.funcionarios.find((f) => f.id === id)?.nombre ?? `#${id}`;
  }

  get seleccionados(): DrFuncionarioVM[] {
    return this.funcionarios.filter((f) => this.seleccion.has(f.id));
  }

  /** Precarga (editable) los presentes del día según asistencias. */
  async cargarPresentes(): Promise<void> {
    const fecha = this.fecha.value;
    if (!fecha) return;
    this.cargandoPresentes = true;
    try {
      const asis: any[] = (await drCall('get-asistencias', { fecha })) ?? [];
      const ids = new Set<number>(
        asis.filter((a) => ESTADOS_PRESENTE.includes(a?.estado) && a?.funcionario?.id).map((a) => a.funcionario.id),
      );
      const validos = [...ids].filter((id) => this.funcionarios.some((f) => f.id === id));
      this.seleccion = new Set(validos);
      this.presentesCargados = validos.length;
      if (!validos.length) this.snack.open('No hay presentes registrados ese día: elegí los funcionarios a mano', 'OK', { duration: 3500 });
    } catch (e) {
      this.snack.open(`No se pudieron cargar los presentes: ${drMensajeError(e)}`, 'OK', { duration: 4000 });
    } finally {
      this.cargandoPresentes = false;
      this.actualizarPreview();
    }
  }

  /** Agenda la vista previa con un pequeño retardo (evita una llamada por cada toque o tecla). */
  programarPreview(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      void this.actualizarPreview();
    }, 300);
  }

  /** Tardanza sin minutos cargados (no se puede calcular ni guardar). */
  get faltanMinutos(): boolean {
    if (!this.tipo?.tardanza) return false;
    const m = this.minutos.value;
    return m === null || (m as any) === '' || !Number.isFinite(Number(m));
  }

  /** Vista previa por funcionario: el backend corre el mismo cálculo que el registro, sin guardar. */
  async actualizarPreview(): Promise<void> {
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    const token = ++this.previewToken;
    this.previewError = false;
    const tipo = this.tipo;
    const fecha = this.fecha.value;
    const ids = [...this.seleccion];
    if (!tipo || !fecha || !ids.length || this.faltanMinutos) {
      this.preview = new Map();
      this.calculandoPreview = false;
      return;
    }
    this.calculandoPreview = true;
    try {
      const min = this.minutos.value;
      const r = await drCall('dr-preview-falta', {
        tipoFaltaId: tipo.id,
        fecha,
        funcionarioIds: ids,
        minutosTardanza: min === null || (min as any) === '' ? undefined : Number(min),
      });
      if (token !== this.previewToken) return;
      if (r?.faltanMinutos) {
        this.preview = new Map();
        return;
      }
      const mapa = new Map<number, PreviewVM>();
      for (const it of r?.items ?? []) {
        mapa.set(it.funcionarioId, { resultado: it.resultado, monto: Number(it.monto) || 0, n: it.nOcurrencia });
      }
      this.preview = mapa;
    } catch {
      // Sin vista previa (p. ej. sin permiso para ver faltas): se muestra la regla del tipo y un aviso.
      if (token === this.previewToken) {
        this.preview = new Map();
        this.previewError = true;
      }
    } finally {
      if (token === this.previewToken) this.calculandoPreview = false;
    }
  }

  get totalMultas(): number {
    let s = 0;
    this.preview.forEach((p) => (s += p.resultado === 'MULTA' ? p.monto : 0));
    return s;
  }

  get puedeGuardar(): boolean {
    if (!this.tipo || !this.seleccion.size || !this.fecha.value || this.guardando) return false;
    const m = this.minutos.value;
    if (this.tipo.tardanza) return !this.faltanMinutos && Number(m) >= 0;
    return m === null || (m as any) === '' || Number(m) >= 0;
  }

  async guardar(): Promise<void> {
    if (!this.puedeGuardar || !this.tipo) return;
    this.guardando = true;
    const ids = [...this.seleccion];
    const m = this.minutos.value;
    try {
      const r = await drCall('dr-registrar-falta', {
        tipoFaltaId: this.tipo.id,
        fecha: this.fecha.value,
        funcionarioIds: ids,
        observacion: this.detalle.value.trim() ? this.detalle.value.trim().toUpperCase() : undefined,
        minutosTardanza: this.tipo.tardanza && m !== null && (m as any) !== '' ? Number(m) : null,
      });
      const creadas: any[] = r?.creadas ?? [];
      const ignoradas: any[] = r?.ignoradas ?? [];
      this.creadas = creadas.map((c) => ({
        nombre: this.nombre(c.funcionario?.id),
        resultado: c.resultado,
        monto: Number(c.montoCalculado) || 0,
        n: Number(c.nOcurrencia) || 0,
      }));
      this.ignoradas = ignoradas.map((i) => ({ nombre: this.nombre(i.funcionarioId), motivo: i.motivo }));
      const tratados = new Set<number>([...creadas.map((c) => c.funcionario?.id), ...ignoradas.map((i) => i.funcionarioId)]);
      this.enTolerancia = ids.filter((id) => !tratados.has(id)).map((id) => this.nombre(id));
      const partes = [`${creadas.length} registrada${creadas.length === 1 ? '' : 's'}`];
      if (ignoradas.length) partes.push(`${ignoradas.length} ignorada${ignoradas.length === 1 ? '' : 's'}`);
      this.snack.open(`Falta: ${partes.join(', ')}`, 'OK', { duration: 3500 });
    } catch (e) {
      this.snack.open(drMensajeError(e), 'OK', { duration: 5000 });
    } finally {
      this.guardando = false;
    }
  }

  nueva(): void {
    this.creadas = null;
    this.ignoradas = [];
    this.enTolerancia = [];
    this.seleccion.clear();
    this.presentesCargados = null;
    this.detalle.setValue('');
    this.minutos.setValue(null, { emitEvent: false });
    this.tipo = null;
    this.preview = new Map();
    this.previewError = false;
  }
}
