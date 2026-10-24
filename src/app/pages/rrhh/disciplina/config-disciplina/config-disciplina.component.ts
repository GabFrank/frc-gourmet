/**
 * Configuración de Disciplina y Reconocimiento (permiso RRHH_DR_CONFIGURAR).
 * Una pestaña por catálogo; cada sección: tabla + diálogo crear/editar + activar/desactivar
 * (nada se borra). Las secciones hijas (checklist, criterios, miembros, preguntas) se filtran
 * por el registro padre elegido. Los parámetros generales (tope mensual, mínimo de votantes)
 * viven en Configuración RRHH: acá solo hay un acceso.
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
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from 'src/app/database/repository.service';
import { TabsService } from 'src/app/services/tabs.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ListConfiguracionRrhhComponent } from 'src/app/pages/rrhh/configuracion/list-configuracion-rrhh/list-configuracion-rrhh.component';
import { DrModoAplicacion, DrReinicio } from 'src/app/database/entities/rrhh/disciplina/dr-tipo-falta.enum';
import { DrPremioMetodo, DrPremioPeriodo, DrReglaEmpate } from 'src/app/database/entities/rrhh/disciplina/dr-premio.enum';
import { DrPreguntaTipo } from 'src/app/database/entities/rrhh/disciplina/dr-pregunta-tipo.enum';
import { DrGrupoRol } from 'src/app/database/entities/rrhh/disciplina/dr-grupo-rol.enum';
import { DisciplinaApiService, DrCanal, drMensajeError, drNombreFuncionario } from '../disciplina-api.service';
import { DrCampo, DrFormDialogComponent, DrFormDialogData, DrOpcion } from '../dr-form-dialog/dr-form-dialog.component';

type Fuente = 'grupos' | 'monedas' | 'gravedades' | 'encuestas' | 'funcionarios';

interface Columna {
  key: string;
  label: string;
  numero?: boolean;
  valor: (r: any) => any;
}

interface FilaVista {
  raw: any;
  clave: string;
  activo: boolean;
  celdas: Record<string, any>;
}

interface Seccion {
  id: string;
  titulo: string;
  /** 'tipos-falta' usa sus canales propios; el resto, dr-get/dr-save-<canal>. */
  canal: DrCanal | 'tipos-falta';
  singular: string;
  columnas: Columna[];
  campos: DrCampo[];
  /** Sección hija: se filtra por un registro de la sección padre. */
  padre?: { seccionId: string; relacion: string; label: string };
  aviso?: string;
  // estado
  filas: FilaVista[];
  cols: string[];
  colKeys: string[];
  cargando: boolean;
  padreId: number | null;
  padreOpciones: DrOpcion[];
  sinPadre: boolean;
}

interface Pestania {
  id: string;
  label: string;
  icon: string;
  secciones: Seccion[];
  nota?: string;
}

const opcionesEnum = (e: Record<string, string>): DrOpcion[] => Object.values(e).map((v) => ({ valor: v, label: v.replace(/_/g, ' ') }));
const DIAS: DrOpcion[] = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'].map((d, i) => ({ valor: i + 1, label: d }));
const COLORES: DrOpcion[] = ['VERDE', 'AMARILLO', 'NARANJA', 'ROJO', 'CELESTE'].map((c) => ({ valor: c, label: c }));
const siNo = (b: any) => (b ? 'SÍ' : 'NO');
const rel = (campo: string, prop = 'nombre') => (r: any) => r?.[campo]?.[prop] ?? '-';

@Component({
  selector: 'app-config-disciplina',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatTabsModule, MatTableModule, MatButtonModule, MatIconModule, MatMenuModule,
    MatCardModule, MatFormFieldModule, MatSelectModule, MatSlideToggleModule, MatTooltipModule,
    MatProgressSpinnerModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './config-disciplina.component.html',
  styleUrls: ['./config-disciplina.component.scss'],
})
export class ConfigDisciplinaComponent implements OnInit {
  pestanias: Pestania[] = [];
  incluirInactivos = true;
  cargandoEjemplo = false;
  procesandoId: string | null = null;

  private secciones: Record<string, Seccion> = {};
  private fuentes: Record<Fuente, DrOpcion[]> = { grupos: [], monedas: [], gravedades: [], encuestas: [], funcionarios: [] };
  private monedaPygId: number | null = null;

  constructor(
    private api: DisciplinaApiService,
    private repositoryService: RepositoryService,
    private tabsService: TabsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    this.armarPestanias();
    await this.cargarFuentesExternas();
    await this.recargarTodo();
  }

  // ───────────── Definición de pestañas ─────────────
  private seccion(def: Omit<Seccion, 'filas' | 'cols' | 'colKeys' | 'cargando' | 'padreId' | 'padreOpciones' | 'sinPadre'>): Seccion {
    const s: Seccion = {
      ...def, filas: [], cargando: false, padreId: null, padreOpciones: [], sinPadre: !!def.padre,
      colKeys: def.columnas.map((c) => c.key),
      cols: [...def.columnas.map((c) => c.key), 'estado', 'acciones'],
    };
    this.secciones[s.id] = s;
    return s;
  }

  private armarPestanias(): void {
    const tiposFalta = this.seccion({
      id: 'tipos-falta', titulo: 'Tipos de falta', canal: 'tipos-falta', singular: 'tipo de falta',
      columnas: [
        { key: 'nombre', label: 'Nombre', valor: (r) => r.nombre },
        { key: 'modo', label: 'Aplicación', valor: (r) => (r.modoAplicacion === DrModoAplicacion.TODOS_PRESENTES ? 'COLECTIVA' : 'INDIVIDUAL') },
        { key: 'adv', label: 'Advertencias previas', numero: true, valor: (r) => Number(r.advertenciasPrevias) || 0 },
        { key: 'monto', label: 'Multa', numero: true, valor: (r) => Number(r.montoMulta) || 0 },
        { key: 'moneda', label: 'Moneda', valor: rel('moneda', 'simbolo') },
        { key: 'reinicio', label: 'Reinicio', valor: (r) => r.reinicio },
        { key: 'plazo', label: 'Apelación (h)', numero: true, valor: (r) => Number(r.plazoApelacionHoras) || 0 },
        { key: 'grupo', label: 'Grupo', valor: rel('grupo') },
      ],
      campos: [
        { key: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true },
        { key: 'area', label: 'Área (COCINA, SALÓN…)', tipo: 'texto' },
        { key: 'descripcion', label: 'Descripción', tipo: 'textarea' },
        { key: 'grupo', label: 'Grupo', tipo: 'select', fuente: 'grupos', relacion: true },
        { key: 'modoAplicacion', label: 'Aplicación', tipo: 'select', opciones: opcionesEnum(DrModoAplicacion), requerido: true, defecto: DrModoAplicacion.INDIVIDUAL,
          hint: 'TODOS PRESENTES = multa colectiva: dejarla inactiva hasta validarla con asesoría laboral' },
        { key: 'advertenciasPrevias', label: 'Advertencias antes de multar', tipo: 'entero', min: 0, defecto: 0, requerido: true },
        { key: 'montoMulta', label: 'Monto de la multa', tipo: 'numero', min: 0, defecto: 0, requerido: true },
        { key: 'moneda', label: 'Moneda', tipo: 'select', fuente: 'monedas', relacion: true, hint: 'Tiene que ser la del sueldo' },
        { key: 'escalaMontos', label: 'Escala de montos (opcional)', tipo: 'json', hint: 'JSON {"n.º de ocurrencia": monto}, ej. {"3": 30000, "4": 50000}' },
        { key: 'reinicio', label: 'Reinicio del conteo', tipo: 'select', opciones: opcionesEnum(DrReinicio), requerido: true, defecto: DrReinicio.MENSUAL },
        { key: 'plazoApelacionHoras', label: 'Plazo de apelación (horas)', tipo: 'entero', min: 0, defecto: 48, requerido: true },
        { key: 'toleranciaMinutos', label: 'Tolerancia (minutos, tardanzas)', tipo: 'entero', min: 0 },
        { key: 'fuenteAsistencia', label: 'Es tardanza de asistencia', tipo: 'bool', hint: 'Evita doble descuento con la penalización automática' },
        { key: 'requiereChecklist', label: 'Requiere checklist', tipo: 'bool' },
        { key: 'orden', label: 'Orden', tipo: 'entero', defecto: 0 },
      ],
    });
    const checklist = this.seccion({
      id: 'checklist-items', titulo: 'Checklist del tipo de falta', canal: 'checklist-items', singular: 'ítem de checklist',
      padre: { seccionId: 'tipos-falta', relacion: 'tipoFalta', label: 'Tipo de falta' },
      columnas: [
        { key: 'texto', label: 'Ítem', valor: (r) => r.texto },
        { key: 'orden', label: 'Orden', numero: true, valor: (r) => Number(r.orden) || 0 },
      ],
      campos: [
        { key: 'texto', label: 'Ítem', tipo: 'texto', requerido: true, ancho: 'completo' },
        { key: 'orden', label: 'Orden', tipo: 'entero', defecto: 0 },
      ],
    });
    const gravedades = this.seccion({
      id: 'gravedades', titulo: 'Gravedades', canal: 'gravedades', singular: 'gravedad',
      columnas: [
        { key: 'nombre', label: 'Nombre', valor: (r) => r.nombre },
        { key: 'area', label: 'Área', valor: (r) => r.area || '-' },
        { key: 'puntos', label: 'Puntos que descuenta', numero: true, valor: (r) => Number(r.puntos) || 0 },
        { key: 'color', label: 'Color', valor: (r) => r.color || '-' },
        { key: 'orden', label: 'Orden', numero: true, valor: (r) => Number(r.orden) || 0 },
      ],
      campos: [
        { key: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true },
        { key: 'area', label: 'Área', tipo: 'texto' },
        { key: 'puntos', label: 'Puntos que descuenta', tipo: 'numero', min: 0, defecto: 0, requerido: true },
        { key: 'color', label: 'Color', tipo: 'select', opciones: COLORES },
        { key: 'orden', label: 'Orden', tipo: 'entero', defecto: 0 },
      ],
    });
    const tiposError = this.seccion({
      id: 'tipos-error', titulo: 'Tipos de error', canal: 'tipos-error', singular: 'tipo de error',
      aviso: 'La lista no trae la gravedad ni el grupo de cada tipo (el backend no los devuelve): al editar, dejá el campo vacío para conservar el actual.',
      columnas: [
        { key: 'nombre', label: 'Nombre', valor: (r) => r.nombre },
        { key: 'area', label: 'Área', valor: (r) => r.area || '-' },
        { key: 'gravedad', label: 'Gravedad', valor: (r) => r.gravedad?.nombre ?? '(no informada)' },
        { key: 'orden', label: 'Orden', numero: true, valor: (r) => Number(r.orden) || 0 },
      ],
      campos: [
        { key: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true },
        { key: 'area', label: 'Área', tipo: 'texto' },
        { key: 'descripcion', label: 'Descripción', tipo: 'textarea' },
        { key: 'gravedad', label: 'Gravedad', tipo: 'select', fuente: 'gravedades', relacion: true, requerido: true, mantenerSiVacio: true },
        { key: 'grupo', label: 'Grupo (vacío = todos)', tipo: 'select', fuente: 'grupos', relacion: true, mantenerSiVacio: true },
        { key: 'orden', label: 'Orden', tipo: 'entero', defecto: 0 },
      ],
    });
    const premios = this.seccion({
      id: 'premios', titulo: 'Premios', canal: 'premios', singular: 'premio',
      columnas: [
        { key: 'nombre', label: 'Nombre', valor: (r) => r.nombre },
        { key: 'metodo', label: 'Método', valor: (r) => String(r.metodo ?? '').replace(/_/g, ' ') },
        { key: 'periodo', label: 'Período', valor: (r) => r.periodo },
        { key: 'monto', label: 'Monto', numero: true, valor: (r) => Number(r.monto) || 0 },
        { key: 'moneda', label: 'Moneda', valor: rel('moneda', 'simbolo') },
        { key: 'empate', label: 'Empate', valor: (r) => String(r.reglaEmpate ?? '').replace(/_/g, ' ') },
        { key: 'grupo', label: 'Grupo', valor: rel('grupo') },
        { key: 'encuesta', label: 'Encuesta', valor: rel('encuesta', 'titulo') },
      ],
      campos: [
        { key: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true },
        { key: 'area', label: 'Área', tipo: 'texto' },
        { key: 'descripcion', label: 'Descripción', tipo: 'textarea' },
        { key: 'metodo', label: 'Método', tipo: 'select', opciones: opcionesEnum(DrPremioMetodo), requerido: true, defecto: DrPremioMetodo.CRITERIOS },
        { key: 'periodo', label: 'Período', tipo: 'select', opciones: opcionesEnum(DrPremioPeriodo), requerido: true, defecto: DrPremioPeriodo.SEMANAL },
        { key: 'monto', label: 'Monto', tipo: 'numero', min: 0, defecto: 0, requerido: true },
        { key: 'moneda', label: 'Moneda', tipo: 'select', fuente: 'monedas', relacion: true },
        { key: 'reglaEmpate', label: 'Regla de empate', tipo: 'select', opciones: opcionesEnum(DrReglaEmpate), requerido: true, defecto: DrReglaEmpate.DIVIDIR },
        { key: 'grupo', label: 'Grupo', tipo: 'select', fuente: 'grupos', relacion: true, hint: 'Quiénes compiten (o el de la encuesta)' },
        { key: 'encuesta', label: 'Encuesta (solo VOTACIÓN)', tipo: 'select', fuente: 'encuestas', relacion: true },
        { key: 'puntosIniciales', label: 'Puntos iniciales (solo SALDO DE PUNTOS)', tipo: 'numero', min: 0 },
        { key: 'orden', label: 'Orden', tipo: 'entero', defecto: 0 },
      ],
    });
    const criterios = this.seccion({
      id: 'criterios', titulo: 'Criterios del premio', canal: 'criterios', singular: 'criterio',
      padre: { seccionId: 'premios', relacion: 'premio', label: 'Premio' },
      columnas: [
        { key: 'texto', label: 'Criterio', valor: (r) => r.texto },
        { key: 'descripcion', label: 'Descripción', valor: (r) => r.descripcion || '-' },
        { key: 'min', label: 'Mín.', numero: true, valor: (r) => Number(r.escalaMin) || 0 },
        { key: 'max', label: 'Máx.', numero: true, valor: (r) => Number(r.escalaMax) || 0 },
        { key: 'orden', label: 'Orden', numero: true, valor: (r) => Number(r.orden) || 0 },
      ],
      campos: [
        { key: 'texto', label: 'Criterio', tipo: 'texto', requerido: true },
        { key: 'descripcion', label: 'Descripción', tipo: 'textarea' },
        { key: 'escalaMin', label: 'Escala mínima', tipo: 'entero', defecto: 0, requerido: true },
        { key: 'escalaMax', label: 'Escala máxima', tipo: 'entero', defecto: 2, requerido: true },
        { key: 'orden', label: 'Orden', tipo: 'entero', defecto: 0 },
      ],
    });
    const grupos = this.seccion({
      id: 'grupos', titulo: 'Grupos', canal: 'grupos', singular: 'grupo',
      columnas: [
        { key: 'nombre', label: 'Nombre', valor: (r) => r.nombre },
        { key: 'area', label: 'Área', valor: (r) => r.area || '-' },
        { key: 'descripcion', label: 'Descripción', valor: (r) => r.descripcion || '-' },
      ],
      campos: [
        { key: 'nombre', label: 'Nombre', tipo: 'texto', requerido: true },
        { key: 'area', label: 'Área', tipo: 'texto' },
        { key: 'descripcion', label: 'Descripción', tipo: 'textarea' },
      ],
    });
    const miembros = this.seccion({
      id: 'grupo-miembros', titulo: 'Miembros del grupo', canal: 'grupo-miembros', singular: 'miembro',
      padre: { seccionId: 'grupos', relacion: 'grupo', label: 'Grupo' },
      columnas: [
        { key: 'funcionario', label: 'Funcionario', valor: (r) => drNombreFuncionario(r.funcionario) },
        { key: 'rol', label: 'Rol', valor: (r) => r.rol },
        { key: 'peso', label: 'Peso del voto', numero: true, valor: (r) => Number(r.pesoVoto) || 0 },
      ],
      campos: [
        { key: 'funcionario', label: 'Funcionario', tipo: 'select', fuente: 'funcionarios', relacion: true, requerido: true, ancho: 'completo' },
        { key: 'rol', label: 'Rol', tipo: 'select', opciones: opcionesEnum(DrGrupoRol), requerido: true, defecto: DrGrupoRol.MIEMBRO },
        { key: 'pesoVoto', label: 'Peso del voto', tipo: 'numero', min: 0, defecto: 1, requerido: true },
      ],
    });
    const encuestas = this.seccion({
      id: 'encuestas', titulo: 'Encuestas', canal: 'encuestas', singular: 'encuesta',
      columnas: [
        { key: 'titulo', label: 'Título', valor: (r) => r.titulo },
        { key: 'grupo', label: 'Grupo', valor: rel('grupo') },
        { key: 'dia', label: 'Día de apertura', valor: (r) => DIAS.find((d) => d.valor === r.diaApertura)?.label ?? '-' },
        { key: 'hora', label: 'Hora', valor: (r) => r.horaApertura || '-' },
        { key: 'horas', label: 'Horas abierta', numero: true, valor: (r) => Number(r.horasAbierta) || 0 },
        { key: 'preguntas', label: 'Preguntas', numero: true, valor: (r) => (r.preguntas ?? []).filter((p: any) => p.activo !== false).length },
      ],
      campos: [
        { key: 'titulo', label: 'Título', tipo: 'texto', requerido: true },
        { key: 'area', label: 'Área', tipo: 'texto' },
        { key: 'descripcion', label: 'Descripción', tipo: 'textarea' },
        { key: 'grupo', label: 'Grupo que vota', tipo: 'select', fuente: 'grupos', relacion: true },
        { key: 'diaApertura', label: 'Día de apertura', tipo: 'select', opciones: DIAS },
        { key: 'horaApertura', label: 'Hora de apertura', tipo: 'hora' },
        { key: 'horasAbierta', label: 'Horas abierta', tipo: 'entero', min: 1, defecto: 24, requerido: true },
      ],
    });
    const preguntas = this.seccion({
      id: 'encuesta-preguntas', titulo: 'Preguntas de la encuesta', canal: 'encuesta-preguntas', singular: 'pregunta',
      padre: { seccionId: 'encuestas', relacion: 'encuesta', label: 'Encuesta' },
      aviso: 'Con grupos chicos, una respuesta de TEXTO puede delatar al autor por su forma de escribir. Usá preguntas de texto con cuidado.',
      columnas: [
        { key: 'texto', label: 'Pregunta', valor: (r) => r.texto },
        { key: 'tipo', label: 'Tipo', valor: (r) => String(r.tipo ?? '').replace(/_/g, ' ') },
        { key: 'escala', label: 'Escala', valor: (r) => (r.tipo === DrPreguntaTipo.ESCALA ? `${r.escalaMin ?? 1} a ${r.escalaMax ?? '-'}` : '-') },
        { key: 'oblig', label: 'Obligatoria', valor: (r) => siNo(r.obligatoria) },
        { key: 'orden', label: 'Orden', numero: true, valor: (r) => Number(r.orden) || 0 },
      ],
      campos: [
        { key: 'texto', label: 'Pregunta', tipo: 'texto', requerido: true, ancho: 'completo' },
        { key: 'tipo', label: 'Tipo', tipo: 'select', opciones: opcionesEnum(DrPreguntaTipo), requerido: true, defecto: DrPreguntaTipo.ESCALA },
        { key: 'obligatoria', label: 'Obligatoria', tipo: 'bool', defecto: true },
        { key: 'escalaMin', label: 'Escala mínima', tipo: 'entero', defecto: 1 },
        { key: 'escalaMax', label: 'Escala máxima', tipo: 'entero', defecto: 5 },
        { key: 'orden', label: 'Orden', tipo: 'entero', defecto: 0 },
      ],
    });

    this.pestanias = [
      { id: 'tipos-falta', label: 'Tipos de falta', icon: 'gavel', secciones: [tiposFalta, checklist],
        nota: 'La multa colectiva (aplicación TODOS PRESENTES) queda desactivada hasta validarla con asesoría laboral.' },
      { id: 'gravedades', label: 'Gravedades', icon: 'priority_high', secciones: [gravedades] },
      { id: 'tipos-error', label: 'Tipos de error', icon: 'report', secciones: [tiposError] },
      { id: 'criterios', label: 'Criterios', icon: 'checklist', secciones: [criterios] },
      { id: 'premios', label: 'Premios', icon: 'emoji_events', secciones: [premios] },
      { id: 'grupos', label: 'Grupos y miembros', icon: 'groups', secciones: [grupos, miembros] },
      { id: 'encuestas', label: 'Encuestas y preguntas', icon: 'how_to_vote', secciones: [encuestas, preguntas],
        nota: 'La apertura y el cierre por día y hora todavía no son automáticos: los períodos se abren y cierran a mano.' },
    ];
  }

  // ───────────── Carga ─────────────
  private async cargarFuentesExternas(): Promise<void> {
    try {
      const monedas: any[] = (await firstValueFrom(this.repositoryService.getMonedas())) ?? [];
      this.fuentes.monedas = monedas.filter((m) => m.activo !== false).map((m) => ({ valor: m.id, label: `${m.denominacion} (${m.simbolo})` }));
      const pyg = monedas.find((m) => /GUARAN/i.test(m.denominacion ?? '') || ['PYG', 'GS', '₲'].includes(String(m.simbolo ?? '').toUpperCase()));
      this.monedaPygId = pyg?.id ?? null;
    } catch (e) {
      console.error(e);
    }
    try {
      const funcs: any[] = (await firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true }))) ?? [];
      this.fuentes.funcionarios = funcs.map((f) => ({ valor: f.id, label: drNombreFuncionario(f) }));
    } catch (e) {
      console.error(e);
    }
  }

  async recargarTodo(): Promise<void> {
    const raiz = Object.values(this.secciones).filter((s) => !s.padre);
    await Promise.all(raiz.map((s) => this.cargar(s)));
    for (const s of Object.values(this.secciones).filter((x) => !!x.padre)) {
      await this.cargar(s);
    }
  }

  async cargar(s: Seccion): Promise<void> {
    if (s.padre) {
      const padre = this.secciones[s.padre.seccionId];
      s.padreOpciones = padre.filas.map((f) => ({ valor: f.raw.id, label: `${f.raw.nombre ?? f.raw.titulo}${f.activo ? '' : ' (INACTIVO)'}` }));
      if (s.padreId && !s.padreOpciones.some((o) => o.valor === s.padreId)) s.padreId = null;
      if (!s.padreId && s.padreOpciones.length) s.padreId = s.padreOpciones[0].valor;
      s.sinPadre = !s.padreId;
      if (!s.padreId) {
        s.filas = [];
        return;
      }
    }
    s.cargando = true;
    try {
      let filas: any[];
      if (s.canal === 'tipos-falta') {
        filas = await this.api.getTiposFalta(this.incluirInactivos);
      } else {
        const filtros: any = { incluirInactivos: this.incluirInactivos };
        if (s.padre && s.padreId) filtros[`${s.padre.relacion}Id`] = s.padreId;
        filas = await this.api.getCatalogo(s.canal, filtros);
      }
      s.filas = (filas ?? []).map((raw) => ({
        raw,
        clave: `${s.id}-${raw.id}`,
        activo: raw.activo !== false,
        celdas: Object.fromEntries(s.columnas.map((c) => [c.key, c.valor(raw)])),
      }));
      this.actualizarFuente(s);
    } catch (e) {
      this.error(e);
    } finally {
      s.cargando = false;
    }
  }

  private actualizarFuente(s: Seccion): void {
    const activos = s.filas.filter((f) => f.activo);
    if (s.id === 'grupos') this.fuentes.grupos = activos.map((f) => ({ valor: f.raw.id, label: f.raw.nombre }));
    if (s.id === 'gravedades') this.fuentes.gravedades = activos.map((f) => ({ valor: f.raw.id, label: `${f.raw.nombre} (${Number(f.raw.puntos) || 0} PTS)` }));
    if (s.id === 'encuestas') this.fuentes.encuestas = activos.map((f) => ({ valor: f.raw.id, label: f.raw.titulo }));
  }

  async cambiarInactivos(): Promise<void> {
    await this.recargarTodo();
  }

  async cambiarPadre(s: Seccion): Promise<void> {
    s.sinPadre = !s.padreId;
    await this.cargar(s);
  }

  // ───────────── Alta / edición ─────────────
  abrirForm(s: Seccion, fila: FilaVista | null): void {
    if (s.padre && !s.padreId) return;
    const campos: DrCampo[] = s.campos.map((c) => (c.fuente ? { ...c, opciones: this.fuentes[c.fuente as Fuente] ?? [] } : c));
    const fijos: Record<string, any> = {};
    if (s.padre && s.padreId) fijos[s.padre.relacion] = { id: s.padreId };
    const data: DrFormDialogData = {
      titulo: `${fila ? 'Editar' : 'Nuevo'} ${s.singular}`,
      campos,
      valor: fila?.raw ?? null,
      fijos,
      aviso: s.aviso,
      guardar: (payload) => (s.canal === 'tipos-falta' ? this.api.saveTipoFalta(payload) : this.api.saveCatalogo(s.canal, payload)),
    };
    this.dialog.open(DrFormDialogComponent, { data, width: '760px', maxHeight: '90vh' }).afterClosed().subscribe(async (r) => {
      if (!r) return;
      this.snackBar.open(`${s.singular.toUpperCase()} GUARDADO`, 'Cerrar', { duration: 2500 });
      await this.recargarDesde(s);
    });
  }

  /** Recarga la sección y sus hijas (las opciones del padre pueden haber cambiado). */
  private async recargarDesde(s: Seccion): Promise<void> {
    await this.cargar(s);
    for (const h of Object.values(this.secciones).filter((x) => x.padre?.seccionId === s.id)) await this.cargar(h);
  }

  // ───────────── Activar / desactivar ─────────────
  cambiarActivo(s: Seccion, fila: FilaVista): void {
    const activar = !fila.activo;
    const nombre = fila.raw.nombre ?? fila.raw.titulo ?? fila.raw.texto ?? drNombreFuncionario(fila.raw.funcionario);
    this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: `${activar ? 'Activar' : 'Desactivar'} ${s.singular}`,
        message: `¿${activar ? 'Activar' : 'Desactivar'} «${nombre}»?${activar ? '' : '\n\nNo se borra: deja de ofrecerse para registros nuevos.'}`,
        confirmText: activar ? 'Activar' : 'Desactivar',
        cancelText: 'Cancelar',
      },
    }).afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      this.procesandoId = fila.clave;
      try {
        if (s.canal === 'tipos-falta') {
          await this.api.setTipoFaltaActivo(fila.raw.id, activar);
        } else {
          // El save genérico revalida los requeridos: mandar las relaciones que vinieron cargadas.
          const payload: any = { id: fila.raw.id, activo: activar };
          for (const c of s.campos) if (c.relacion && fila.raw[c.key]?.id) payload[c.key] = { id: fila.raw[c.key].id };
          if (s.padre && s.padreId) payload[s.padre.relacion] = { id: s.padreId };
          await this.api.saveCatalogo(s.canal, payload);
        }
        this.snackBar.open(activar ? 'ACTIVADO' : 'DESACTIVADO', 'Cerrar', { duration: 2500 });
        await this.recargarDesde(s);
      } catch (e) {
        this.error(e);
      } finally {
        this.procesandoId = null;
      }
    });
  }

  // ───────────── Ejemplo y accesos ─────────────
  cargarEjemplo(): void {
    this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Cargar ejemplo Cocina',
        message:
          'Se van a crear DATOS DE EJEMPLO para una cocina: grupo COCINA, gravedades, tipos de falta (llegada tardía, falta sin aviso, '
          + 'uniforme incompleto, cocina sucia al cierre), tipos de error, una encuesta y los premios «Cocinero de la semana» y «Compañero del mes».\n\n'
          + 'Todo se crea INACTIVO, con montos orientativos: revisalos y activá solo lo que quieras usar.\n'
          + 'Lo que ya exista con el mismo nombre no se duplica ni se modifica.\n\n¿Continuar?',
        confirmText: 'Cargar ejemplo',
        cancelText: 'Cancelar',
      },
    }).afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      this.cargandoEjemplo = true;
      try {
        const r = await this.api.cargarEjemploCocina(this.monedaPygId);
        const msg = r.creados.length
          ? `EJEMPLO CARGADO: ${r.creados.length} REGISTROS NUEVOS (INACTIVOS)${r.existentes.length ? `, ${r.existentes.length} YA EXISTÍAN` : ''}`
          : 'EL EJEMPLO YA ESTABA CARGADO: NO SE CREÓ NADA';
        this.snackBar.open(msg, 'Cerrar', { duration: 6000 });
        this.incluirInactivos = true;
        await this.recargarTodo();
      } catch (e) {
        this.error(e);
        await this.recargarTodo();
      } finally {
        this.cargandoEjemplo = false;
      }
    });
  }

  abrirConfiguracionRrhh(): void {
    this.tabsService.openTabWithData('Configuracion RRHH', ListConfiguracionRrhhComponent, { source: 'navigation' }, 'configuracion-rrhh-tab');
  }

  private error(e: any): void {
    console.error(e);
    this.snackBar.open(drMensajeError(e), 'Cerrar', { duration: 8000, panelClass: 'error-snackbar' });
  }
}
