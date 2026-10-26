/**
 * Datos de EJEMPLO de Disciplina y Reconocimiento para una cocina.
 * Solo datos (sin lógica): los carga `cargarEjemploCocina` (disciplina-api.service.ts)
 * vía los canales dr-save-*, siempre con activo=false y sin duplicar por nombre.
 * Los montos son orientativos: el propietario los revisa y activa a mano.
 */
import { DrModoAplicacion, DrReinicio } from '../../../database/entities/rrhh/disciplina/dr-tipo-falta.enum';
import { DrPremioMetodo, DrPremioPeriodo, DrReglaEmpate } from '../../../database/entities/rrhh/disciplina/dr-premio.enum';
import { DrPreguntaTipo } from '../../../database/entities/rrhh/disciplina/dr-pregunta-tipo.enum';

export const EJEMPLO_AREA = 'COCINA';

export const EJEMPLO_GRUPO = { nombre: 'COCINA', area: EJEMPLO_AREA, descripcion: 'EQUIPO DE COCINA (EJEMPLO)' };

export interface EjemploGravedad { nombre: string; puntos: number; color: string; orden: number }
export const EJEMPLO_GRAVEDADES: EjemploGravedad[] = [
  { nombre: 'LEVE', puntos: 1, color: 'AMARILLO', orden: 1 },
  { nombre: 'MEDIA', puntos: 3, color: 'NARANJA', orden: 2 },
  { nombre: 'GRAVE', puntos: 5, color: 'ROJO', orden: 3 },
];

export interface EjemploTipoFalta {
  nombre: string;
  descripcion: string;
  modoAplicacion: DrModoAplicacion;
  advertenciasPrevias: number;
  montoMulta: number;
  reinicio: DrReinicio;
  toleranciaMinutos: number | null;
  fuenteAsistencia: boolean;
  plazoApelacionHoras: number;
  requiereChecklist: boolean;
  orden: number;
}
export const EJEMPLO_TIPOS_FALTA: EjemploTipoFalta[] = [
  {
    nombre: 'LLEGADA TARDÍA', descripcion: 'LLEGAR DESPUÉS DEL HORARIO DEL TURNO',
    modoAplicacion: DrModoAplicacion.INDIVIDUAL, advertenciasPrevias: 1, montoMulta: 20000,
    reinicio: DrReinicio.MENSUAL, toleranciaMinutos: 5, fuenteAsistencia: false,
    plazoApelacionHoras: 48, requiereChecklist: false, orden: 1,
  },
  {
    nombre: 'FALTA SIN AVISO', descripcion: 'NO PRESENTARSE AL TURNO SIN AVISAR',
    modoAplicacion: DrModoAplicacion.INDIVIDUAL, advertenciasPrevias: 0, montoMulta: 50000,
    reinicio: DrReinicio.MENSUAL, toleranciaMinutos: null, fuenteAsistencia: false,
    plazoApelacionHoras: 48, requiereChecklist: false, orden: 2,
  },
  {
    nombre: 'UNIFORME INCOMPLETO', descripcion: 'TRABAJAR SIN EL UNIFORME COMPLETO (GORRO, DELANTAL, CALZADO)',
    modoAplicacion: DrModoAplicacion.INDIVIDUAL, advertenciasPrevias: 2, montoMulta: 10000,
    reinicio: DrReinicio.MENSUAL, toleranciaMinutos: null, fuenteAsistencia: false,
    plazoApelacionHoras: 48, requiereChecklist: false, orden: 3,
  },
  {
    // Multa colectiva: queda INACTIVA hasta validarla con asesoría laboral.
    nombre: 'COCINA SUCIA AL CIERRE', descripcion: 'LA COCINA QUEDA SUCIA AL CIERRE (MULTA A CADA PRESENTE)',
    modoAplicacion: DrModoAplicacion.TODOS_PRESENTES, advertenciasPrevias: 0, montoMulta: 30000,
    reinicio: DrReinicio.MENSUAL, toleranciaMinutos: null, fuenteAsistencia: false,
    plazoApelacionHoras: 48, requiereChecklist: false, orden: 4,
  },
];

export interface EjemploTipoError { nombre: string; descripcion: string; gravedad: string; orden: number }
export const EJEMPLO_TIPOS_ERROR: EjemploTipoError[] = [
  { nombre: 'ERROR DE COMANDA', descripcion: 'PLATO PREPARADO DISTINTO A LA COMANDA', gravedad: 'LEVE', orden: 1 },
  { nombre: 'PLATO DEVUELTO', descripcion: 'EL CLIENTE DEVOLVIÓ EL PLATO POR CALIDAD', gravedad: 'MEDIA', orden: 2 },
];

export interface EjemploEncuesta {
  titulo: string;
  descripcion: string;
  horasAbierta: number;
  preguntas: { texto: string; tipo: DrPreguntaTipo; escalaMin: number; escalaMax: number | null; obligatoria: boolean; orden: number }[];
}
export const EJEMPLO_ENCUESTA: EjemploEncuesta = {
  titulo: 'COMPAÑERO DEL MES - COCINA',
  descripcion: 'VOTACIÓN ANÓNIMA ENTRE COMPAÑEROS DE COCINA',
  horasAbierta: 48,
  preguntas: [
    { texto: '¿CUÁNTO COLABORA CON EL EQUIPO?', tipo: DrPreguntaTipo.ESCALA, escalaMin: 1, escalaMax: 5, obligatoria: true, orden: 1 },
    { texto: '¿LO ELEGIRÍAS COMO COMPAÑERO DEL MES?', tipo: DrPreguntaTipo.SI_NO, escalaMin: 1, escalaMax: null, obligatoria: true, orden: 2 },
  ],
};

export interface EjemploPremio {
  nombre: string;
  descripcion: string;
  monto: number;
  periodo: DrPremioPeriodo;
  metodo: DrPremioMetodo;
  reglaEmpate: DrReglaEmpate;
  orden: number;
  /** Solo CRITERIOS. */
  criterios?: { texto: string; descripcion: string; escalaMin: number; escalaMax: number; orden: number }[];
  /** Solo VOTACION: usa EJEMPLO_ENCUESTA. */
  usaEncuesta?: boolean;
}
export const EJEMPLO_PREMIOS: EjemploPremio[] = [
  {
    nombre: 'COCINERO DE LA SEMANA', descripcion: 'MAYOR PUNTAJE DIARIO POR CRITERIOS EN LA SEMANA',
    monto: 100000, periodo: DrPremioPeriodo.SEMANAL, metodo: DrPremioMetodo.CRITERIOS,
    reglaEmpate: DrReglaEmpate.DIVIDIR, orden: 1,
    criterios: [
      { texto: 'LIMPIEZA', descripcion: 'PUESTO LIMPIO Y ORDENADO', escalaMin: 0, escalaMax: 2, orden: 1 },
      { texto: 'PUNTUALIDAD', descripcion: 'LLEGA A HORARIO Y CUMPLE LOS TIEMPOS', escalaMin: 0, escalaMax: 2, orden: 2 },
      { texto: 'TRABAJO EN EQUIPO', descripcion: 'AYUDA A LOS COMPAÑEROS', escalaMin: 0, escalaMax: 2, orden: 3 },
    ],
  },
  {
    nombre: 'COMPAÑERO DEL MES', descripcion: 'ELEGIDO POR VOTACIÓN ANÓNIMA DE LOS COMPAÑEROS',
    monto: 50000, periodo: DrPremioPeriodo.MENSUAL, metodo: DrPremioMetodo.VOTACION,
    reglaEmpate: DrReglaEmpate.DIVIDIR, orden: 2, usaEncuesta: true,
  },
];
