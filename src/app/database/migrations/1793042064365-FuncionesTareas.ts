import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo Funciones y Tareas (FT) — fase 1. Ver docs/planes/PLAN-funciones-tareas.md (§3, §10, §11).
 *
 * ESTRICTAMENTE ADITIVO: 9 tablas nuevas con prefijo `ft_`; `down` elimina SOLO esas.
 * Mismo patrón que 1792785488053 (DisciplinaReconocimiento): tablas descritas una vez y
 * renderizadas por driver, FKs inline, enums `text` con CHECK solo en SQLite.
 * Los permisos RRHH_FT_* van por SEED_PERMISOS (B1), no por migración.
 */

type Del = 'CASCADE' | 'SET NULL';
type Col =
  | { n: string; t: 'int' | 'text' | 'date' | 'ts' | 'bool'; nn?: boolean; def?: string | number | boolean }
  | { n: string; t: 'varchar'; len: number; nn?: boolean; def?: string }
  | { n: string; t: 'enum'; vals: string[]; def?: string; nullable?: boolean }
  | { n: string; t: 'fk'; ref: string; nn?: boolean; del?: Del };

interface Tabla {
  nombre: string;
  cols: Col[];
  /** CHECKs de tabla (no de enums): van en los dos drivers. */
  checks?: { nombre: string; expr: string }[];
  indices?: { nombre: string; cols: string[]; unico?: boolean }[];
}

const ACTIVO: Col = { n: 'activo', t: 'bool', nn: true, def: true };
const ORDEN: Col = { n: 'orden', t: 'int', nn: true, def: 0 };
const MOMENTOS = ['ANTES_INICIO', 'ANTES_VENCER', 'AL_VENCER', 'ESCALAMIENTO'];
const CANALES = ['APP', 'WHATSAPP', 'AMBOS', 'GERENTE'];

const TABLAS: Tabla[] = [
  {
    nombre: 'ft_config',
    cols: [{ n: 'clave', t: 'varchar', len: 60, nn: true }, { n: 'valor', t: 'text' }],
    indices: [{ nombre: 'UQ_ft_config_clave', cols: ['clave'], unico: true }],
  },
  {
    nombre: 'ft_funcion',
    cols: [
      { n: 'descripcion', t: 'text', nn: true },
      { n: 'detalle', t: 'text' },
      ORDEN,
      ACTIVO,
      { n: 'cargo_id', t: 'fk', ref: 'cargos' },
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios' },
    ],
    checks: [{
      nombre: 'CHK_ft_funcion_duenio',
      expr: '("cargo_id" IS NULL AND "funcionario_id" IS NOT NULL) OR ("cargo_id" IS NOT NULL AND "funcionario_id" IS NULL)',
    }],
    indices: [
      { nombre: 'IDX_ft_funcion_cargo', cols: ['cargo_id'] },
      { nombre: 'IDX_ft_funcion_funcionario', cols: ['funcionario_id'] },
    ],
  },
  {
    nombre: 'ft_plantilla_tarea',
    cols: [
      { n: 'titulo', t: 'text', nn: true },
      { n: 'instrucciones', t: 'text' },
      { n: 'tipo', t: 'enum', vals: ['SIMPLE', 'CHECKLIST'], def: 'SIMPLE' },
      ACTIVO,
      { n: 'critica', t: 'bool', nn: true, def: false },
      { n: 'peso', t: 'int', nn: true, def: 1 },
      { n: 'cargo_id', t: 'fk', ref: 'cargos' },
      { n: 'turno_id', t: 'fk', ref: 'turnos' },
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios' },
      { n: 'dr_grupo_id', t: 'fk', ref: 'dr_grupo' },
      { n: 'reemplaza_plantilla_id', t: 'fk', ref: 'ft_plantilla_tarea' },
      { n: 'recurrencia', t: 'enum', vals: ['DIARIA', 'DIAS_SEMANA', 'MENSUAL', 'UNICA', 'EVENTO'], def: 'DIARIA' },
      { n: 'dias_semana', t: 'int' },
      { n: 'dia_mes', t: 'int' },
      { n: 'fecha_unica', t: 'date' },
      { n: 'evento', t: 'enum', vals: ['CAJA_ABIERTA', 'CAJA_CERRADA', 'COMPRA_RECIBIDA'], nullable: true },
      { n: 'ancla', t: 'enum', vals: ['INICIO_TURNO', 'FIN_TURNO', 'HORA_FIJA', 'EVENTO'], def: 'INICIO_TURNO' },
      { n: 'offset_inicio_min', t: 'int', nn: true, def: 0 },
      { n: 'duracion_min', t: 'int', nn: true, def: 60 },
      { n: 'hora_fija', t: 'varchar', len: 5 },
      { n: 'evidencia', t: 'enum', vals: ['NINGUNA', 'NOTA', 'FOTO'], def: 'NINGUNA' },
      { n: 'requiere_verificacion', t: 'bool', nn: true, def: false },
      { n: 'verificador_cargo_id', t: 'fk', ref: 'cargos' },
      { n: 'dr_tipo_falta_id', t: 'fk', ref: 'dr_tipo_falta' },
      { n: 'dr_criterio_id', t: 'fk', ref: 'dr_criterio' },
      { n: 'vigencia_desde', t: 'date' },
      { n: 'vigencia_hasta', t: 'date' },
    ],
  },
  {
    nombre: 'ft_plantilla_item',
    cols: [
      { n: 'plantilla_id', t: 'fk', ref: 'ft_plantilla_tarea', nn: true, del: 'CASCADE' },
      { n: 'texto', t: 'text', nn: true },
      ORDEN,
      { n: 'obligatorio', t: 'bool', nn: true, def: true },
    ],
  },
  {
    nombre: 'ft_regla_aviso',
    cols: [
      { n: 'plantilla_id', t: 'fk', ref: 'ft_plantilla_tarea', nn: true, del: 'CASCADE' },
      { n: 'momento', t: 'enum', vals: MOMENTOS },
      { n: 'minutos', t: 'int', nn: true, def: 0 },
      { n: 'nivel', t: 'int', nn: true, def: 1 },
      { n: 'canal', t: 'enum', vals: CANALES, def: 'APP' },
      { n: 'destino', t: 'text' },
      ACTIVO,
    ],
  },
  {
    nombre: 'ft_tarea',
    cols: [
      { n: 'plantilla_id', t: 'fk', ref: 'ft_plantilla_tarea' },
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios', nn: true },
      { n: 'fecha', t: 'date', nn: true },
      { n: 'inicio', t: 'ts', nn: true },
      { n: 'vence', t: 'ts', nn: true },
      { n: 'estado', t: 'enum', vals: ['PENDIENTE', 'HECHA', 'VERIFICADA', 'VENCIDA', 'NO_APLICA', 'RECHAZADA'], def: 'PENDIENTE' },
      { n: 'titulo', t: 'text', nn: true },
      { n: 'critica', t: 'bool', nn: true, def: false },
      { n: 'peso', t: 'int', nn: true, def: 1 },
      { n: 'hecha_por_id', t: 'fk', ref: 'usuarios' },
      { n: 'hecha_en', t: 'ts' },
      { n: 'verificada_por_id', t: 'fk', ref: 'usuarios' },
      { n: 'verificada_en', t: 'ts' },
      { n: 'nota', t: 'text' },
      { n: 'evidencia_url', t: 'text' },
      { n: 'motivo_no_aplica', t: 'text' },
      { n: 'nivel_escalado', t: 'int', nn: true, def: 0 },
      { n: 'origen', t: 'enum', vals: ['MOTOR', 'EVENTO', 'MANUAL'], def: 'MOTOR' },
      { n: 'evento_ref', t: 'varchar', len: 60, nn: true, def: '' },
    ],
    indices: [
      { nombre: 'UQ_ft_tarea_instancia', cols: ['plantilla_id', 'funcionario_id', 'fecha', 'evento_ref'], unico: true },
      { nombre: 'IDX_ft_tarea_estado_vence', cols: ['estado', 'vence'] },
      { nombre: 'IDX_ft_tarea_funcionario_fecha', cols: ['funcionario_id', 'fecha'] },
    ],
  },
  {
    nombre: 'ft_tarea_item',
    cols: [
      { n: 'tarea_id', t: 'fk', ref: 'ft_tarea', nn: true, del: 'CASCADE' },
      { n: 'item_id', t: 'fk', ref: 'ft_plantilla_item', del: 'SET NULL' },
      { n: 'texto', t: 'text', nn: true },
      { n: 'hecho', t: 'bool', nn: true, def: false },
      { n: 'hecho_en', t: 'ts' },
    ],
  },
  {
    nombre: 'ft_aviso_enviado',
    cols: [
      { n: 'clave', t: 'varchar', len: 120, nn: true },
      { n: 'tarea_id', t: 'fk', ref: 'ft_tarea', del: 'SET NULL' },
      { n: 'momento', t: 'enum', vals: MOMENTOS },
      { n: 'nivel', t: 'int', nn: true, def: 1 },
      { n: 'canal', t: 'enum', vals: CANALES },
      { n: 'estado', t: 'enum', vals: ['PENDIENTE', 'ENVIADO', 'FALLIDO', 'PARA_GERENTE'], def: 'PENDIENTE' },
      { n: 'destino', t: 'text' },
      { n: 'mensaje', t: 'text' },
      { n: 'intentos', t: 'int', nn: true, def: 0 },
      { n: 'enviado_en', t: 'ts' },
    ],
    indices: [{ nombre: 'UQ_ft_aviso_enviado_clave', cols: ['clave'], unico: true }],
  },
  {
    nombre: 'ft_propuesta_falta',
    cols: [
      { n: 'tarea_id', t: 'fk', ref: 'ft_tarea', del: 'SET NULL' },
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios', nn: true },
      { n: 'dr_tipo_falta_id', t: 'fk', ref: 'dr_tipo_falta' },
      { n: 'motivo', t: 'text', nn: true },
      { n: 'estado', t: 'enum', vals: ['PENDIENTE', 'REGISTRADA', 'DESCARTADA'], def: 'PENDIENTE' },
    ],
  },
];

function renderTabla(t: Tabla, isPg: boolean, fkNombre: (tabla: string, col: string, ref: string) => string): string {
  const ts = isPg ? 'TIMESTAMP' : 'datetime';
  const tsNow = isPg ? 'now()' : "(datetime('now'))";
  const bool = (v: boolean) => (isPg ? String(v) : v ? '1' : '0');
  const lineas: string[] = [];
  const restr: string[] = [];
  const nn = (b?: boolean) => (b ? ' NOT NULL' : ' NULL');
  const fk = (col: string, ref: string, del?: Del) =>
    restr.push(`CONSTRAINT "${fkNombre(t.nombre, col, ref)}" FOREIGN KEY ("${col}") REFERENCES "${ref}"("id") ON DELETE ${del ?? 'NO ACTION'} ON UPDATE NO ACTION`);

  lineas.push(`"id" ${isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL'}`);
  lineas.push(`"created_at" ${ts} NOT NULL DEFAULT ${tsNow}`);
  lineas.push(`"updated_at" ${ts} NOT NULL DEFAULT ${tsNow}`);
  for (const c of t.cols) {
    switch (c.t) {
      case 'fk':
        lineas.push(`"${c.n}" integer${nn(c.nn)}`);
        fk(c.n, c.ref, c.del);
        break;
      case 'enum': {
        const chk = isPg ? '' : ` CHECK( "${c.n}" IN (${c.vals.map((v) => `'${v}'`).join(',')}) )`;
        const def = c.def !== undefined ? ` DEFAULT ${isPg ? `'${c.def}'` : `('${c.def}')`}` : '';
        lineas.push(`"${c.n}" ${isPg ? 'text' : 'varchar'}${chk}${c.nullable ? ' NULL' : ' NOT NULL'}${def}`);
        break;
      }
      case 'varchar':
        lineas.push(`"${c.n}" varchar(${c.len})${nn(c.nn)}${c.def !== undefined ? ` DEFAULT '${c.def}'` : ''}`);
        break;
      default: {
        const tipo = { int: 'integer', text: 'text', date: 'date', ts, bool: 'boolean' }[c.t];
        let def = '';
        if (c.def !== undefined) def = ` DEFAULT ${typeof c.def === 'boolean' ? bool(c.def) : c.def}`;
        lineas.push(`"${c.n}" ${tipo}${nn(c.nn)}${def}`);
      }
    }
  }
  lineas.push(`"created_by" integer NULL`);
  lineas.push(`"updated_by" integer NULL`);
  for (const ch of t.checks ?? []) restr.push(`CONSTRAINT "${ch.nombre}" CHECK (${ch.expr})`);
  fk('created_by', 'usuarios');
  fk('updated_by', 'usuarios');
  return `CREATE TABLE IF NOT EXISTS "${t.nombre}" (\n  ${[...lineas, ...restr].join(',\n  ')}\n)`;
}

export class FuncionesTareas1793042064365 implements MigrationInterface {
  name = 'FuncionesTareas1793042064365';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    // Mismos nombres de FK que genera TypeORM (ver 1792785488053).
    const ns = queryRunner.connection.namingStrategy;
    const fkNombre = (tabla: string, col: string, ref: string) => ns.foreignKeyName(tabla, [col], ref, ['id']);
    for (const t of TABLAS) {
      await queryRunner.query(renderTabla(t, isPg, fkNombre));
      for (const i of t.indices ?? []) {
        await queryRunner.query(
          `CREATE ${i.unico ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS "${i.nombre}" ON "${t.nombre}" (${i.cols.map((c) => `"${c}"`).join(', ')})`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Solo tablas ft_*, en orden inverso (los índices caen con su tabla).
    for (const t of [...TABLAS].reverse()) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${t.nombre}"`);
    }
  }
}
