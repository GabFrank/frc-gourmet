/**
 * Disciplina y Reconocimiento (DR) — catálogos configurables (grupos y miembros, encuestas y
 * preguntas, premios, tipos de error, gravedades, criterios). Nada hardcodeado: todo se crea
 * y edita desde la app (desktop y mobile) con RRHH_DR_CONFIGURAR. Textos en MAYÚSCULAS.
 */
import { ipcMain } from 'electron';
import { DataSource, EntityTarget } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { DrGrupo } from '../../src/app/database/entities/rrhh/disciplina/dr-grupo.entity';
import { DrGrupoMiembro } from '../../src/app/database/entities/rrhh/disciplina/dr-grupo-miembro.entity';
import { DrEncuesta } from '../../src/app/database/entities/rrhh/disciplina/dr-encuesta.entity';
import { DrEncuestaPregunta } from '../../src/app/database/entities/rrhh/disciplina/dr-encuesta-pregunta.entity';
import { DrPremio } from '../../src/app/database/entities/rrhh/disciplina/dr-premio.entity';
import { DrTipoError } from '../../src/app/database/entities/rrhh/disciplina/dr-tipo-error.entity';
import { DrGravedad } from '../../src/app/database/entities/rrhh/disciplina/dr-gravedad.entity';
import { DrCriterio } from '../../src/app/database/entities/rrhh/disciplina/dr-criterio.entity';
import { DrChecklistItem } from '../../src/app/database/entities/rrhh/disciplina/dr-checklist-item.entity';
import { ensurePermission, getEffectiveUser } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';

const CONFIGURAR = 'RRHH_DR_CONFIGURAR';
const LECTURA = ['RRHH_DR_CONFIGURAR', 'RRHH_DR_REGISTRAR', 'RRHH_DR_PUNTUAR', 'RRHH_DR_APROBAR', 'RRHH_DR_RESULTADOS_VER'];
const TEXTO_MAYUS = ['nombre', 'descripcion', 'titulo', 'texto', 'area'];
const META = ['createdAt', 'updatedAt', 'createdBy', 'updatedBy'];

interface Catalogo {
  canal: string; // dr-get-<canal> / dr-save-<canal>
  entidad: EntityTarget<any>;
  relaciones: string[];
  requeridos: string[];
  orden?: Record<string, 'ASC' | 'DESC'>;
  /** Campos numéricos que no pueden ser negativos. */
  noNegativos?: string[];
}

const CATALOGOS: Catalogo[] = [
  { canal: 'grupos', entidad: DrGrupo, relaciones: [], requeridos: ['nombre'], orden: { nombre: 'ASC' } },
  { canal: 'grupo-miembros', entidad: DrGrupoMiembro, relaciones: ['grupo', 'funcionario', 'funcionario.persona'], requeridos: ['grupo', 'funcionario'], noNegativos: ['pesoVoto'] },
  { canal: 'encuestas', entidad: DrEncuesta, relaciones: ['grupo', 'preguntas'], requeridos: ['titulo'], orden: { titulo: 'ASC' } },
  { canal: 'encuesta-preguntas', entidad: DrEncuestaPregunta, relaciones: ['encuesta'], requeridos: ['encuesta', 'texto', 'tipo'], orden: { orden: 'ASC' } },
  { canal: 'premios', entidad: DrPremio, relaciones: ['moneda', 'encuesta', 'grupo'], requeridos: ['nombre', 'metodo'], orden: { orden: 'ASC' }, noNegativos: ['monto'] },
  { canal: 'tipos-error', entidad: DrTipoError, relaciones: [], requeridos: ['nombre'], orden: { nombre: 'ASC' } },
  { canal: 'gravedades', entidad: DrGravedad, relaciones: [], requeridos: ['nombre'], orden: { nombre: 'ASC' } },
  { canal: 'criterios', entidad: DrCriterio, relaciones: ['premio'], requeridos: ['premio', 'texto'], orden: { orden: 'ASC', id: 'ASC' } },
  { canal: 'checklist-items', entidad: DrChecklistItem, relaciones: [], requeridos: [], orden: { id: 'ASC' } },
];

function fail(codigo: string, mensaje: string): never {
  const err: any = new Error(mensaje);
  err.code = codigo;
  throw err;
}

export function registerDisciplinaCatalogosHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  for (const c of CATALOGOS) {
    const meta = dataSource.getMetadata(c.entidad);
    const tieneActivo = meta.columns.some((col) => col.propertyName === 'activo');
    const tieneTracking = meta.columns.some((col) => col.propertyName === 'createdBy');
    const relacionesValidas = c.relaciones.filter((r) => meta.findRelationWithPropertyPath(r.split('.')[0]));

    ipcMain.handle(`dr-get-${c.canal}`, async (_e, filtros: any = {}) => {
      await ensurePermission(dataSource, getCurrentUser, LECTURA);
      const where: any = {};
      if (tieneActivo && !filtros?.incluirInactivos) where.activo = true;
      for (const [k, v] of Object.entries(filtros ?? {})) {
        if (k === 'incluirInactivos' || v === undefined || v === null) continue;
        if (k.endsWith('Id') && meta.findRelationWithPropertyPath(k.slice(0, -2))) where[k.slice(0, -2)] = { id: v };
      }
      return dataSource.getRepository(c.entidad).find({ where, relations: relacionesValidas, order: (c.orden ?? {}) as any });
    });

    ipcMain.handle(`dr-save-${c.canal}`, async (_e, data: any) => {
      const user = await ensurePermission(dataSource, getCurrentUser, CONFIGURAR);
      if (!data || typeof data !== 'object') fail('VALIDACION', 'DATOS INVÁLIDOS');
      const repo = dataSource.getRepository(c.entidad);
      const ent: any = data.id ? await repo.findOne({ where: { id: data.id } as any }) : repo.create();
      if (!ent) fail('NO_ENCONTRADO', 'REGISTRO NO ENCONTRADO');
      for (const r of c.requeridos) {
        const v = data[r] ?? ent[r];
        if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) fail('VALIDACION', `FALTA ${r.toUpperCase()}`);
      }
      for (const n of c.noNegativos ?? []) if (data[n] !== undefined && Number(data[n]) < 0) fail('VALIDACION', `${n.toUpperCase()} NO PUEDE SER NEGATIVO`);
      for (const [k, v] of Object.entries(data)) {
        if (k === 'id' || META.includes(k)) continue;
        const rel = meta.findRelationWithPropertyPath(k);
        if (rel) {
          if (rel.isOneToMany) continue; // hijos se guardan con su propio canal
          ent[k] = v && typeof v === 'object' ? { id: (v as any).id } : v ? { id: v } : null;
        } else if (meta.findColumnWithPropertyPath(k)) {
          ent[k] = TEXTO_MAYUS.includes(k) && typeof v === 'string' ? v.trim().toUpperCase() : v;
        }
      }
      if (tieneTracking) await setEntityUserTracking(dataSource, ent, getEffectiveUser(getCurrentUser)?.id ?? user.id, !!data.id);
      return repo.save(ent);
    });
  }
}
