import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Módulo Disciplina y Reconocimiento (multas, premios, encuestas anónimas) —
 * fase 1. Ver docs/planes/PLAN-multas-premios-encuestas.md (§2, §4, §12).
 *
 * ESTRICTAMENTE ADITIVO: 19 tablas nuevas con prefijo `dr_`, sin tocar ninguna
 * tabla existente. `down` elimina SOLO las tablas `dr_*`.
 *
 * Driver-aware (SQLite vs Postgres): las tablas se describen una sola vez y se
 * renderizan por driver. Las FKs van inline en el CREATE TABLE (válido en los
 * dos drivers; en SQLite es la única forma sin recrear la tabla). Los enums son
 * `text`: en SQLite llevan CHECK (como genera TypeORM), en Postgres no. El
 * formato (nombres de FK, CHECK, decimal) replica lo que genera TypeORM para que
 * `migration:generate` no detecte diferencias en las tablas dr_*.
 *
 * ANONIMATO (§4/§12): `dr_participacion`, `dr_voto_agregado` y
 * `dr_respuesta_texto` NO tienen created_at/created_by/updated_* ni fecha; PK
 * varchar(36) con UUID aleatorio generado en código.
 */

type Col =
  | { n: string; t: 'uuidpk' }
  | { n: string; t: 'int' | 'text' | 'date' | 'ts' | 'bool' | 'dec'; nn?: boolean; def?: string | number | boolean }
  | { n: string; t: 'varchar'; len: number; nn?: boolean; def?: string }
  | { n: string; t: 'enum'; vals: string[]; def: string }
  | { n: string; t: 'fk'; ref: string; nn?: boolean };

interface Tabla {
  nombre: string;
  /** Hereda BaseModel (created_at, updated_at, created_by, updated_by). */
  base: boolean;
  cols: Col[];
  indices?: { nombre: string; cols: string[]; unico?: boolean }[];
}

const AREA: Col = { n: 'area', t: 'varchar', len: 60 };
const ACTIVO: Col = { n: 'activo', t: 'bool', nn: true, def: true };
const ORDEN: Col = { n: 'orden', t: 'int', nn: true, def: 0 };

const TABLAS: Tabla[] = [
  {
    nombre: 'dr_grupo', base: true,
    cols: [{ n: 'nombre', t: 'varchar', len: 120, nn: true }, AREA, { n: 'descripcion', t: 'text' }, ACTIVO],
  },
  {
    nombre: 'dr_grupo_miembro', base: true,
    cols: [
      { n: 'grupo_id', t: 'fk', ref: 'dr_grupo', nn: true },
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios', nn: true },
      { n: 'rol', t: 'enum', vals: ['MIEMBRO', 'AUDITOR'], def: 'MIEMBRO' },
      { n: 'peso_voto', t: 'dec', nn: true, def: 1 },
      ACTIVO,
    ],
    indices: [{ nombre: 'UQ_dr_grupo_miembro_grupo_funcionario', cols: ['grupo_id', 'funcionario_id'], unico: true }],
  },
  {
    nombre: 'dr_tipo_falta', base: true,
    cols: [
      { n: 'nombre', t: 'varchar', len: 150, nn: true },
      { n: 'descripcion', t: 'text' },
      AREA,
      { n: 'grupo_id', t: 'fk', ref: 'dr_grupo' },
      { n: 'modo_aplicacion', t: 'enum', vals: ['INDIVIDUAL', 'TODOS_PRESENTES'], def: 'INDIVIDUAL' },
      { n: 'advertencias_previas', t: 'int', nn: true, def: 0 },
      { n: 'monto_multa', t: 'dec', nn: true, def: 0 },
      { n: 'moneda_id', t: 'fk', ref: 'monedas' },
      { n: 'escala_montos', t: 'text' },
      { n: 'reinicio', t: 'enum', vals: ['NUNCA', 'SEMANAL', 'MENSUAL'], def: 'MENSUAL' },
      { n: 'tolerancia_minutos', t: 'int' },
      { n: 'fuente_asistencia', t: 'bool', nn: true, def: false },
      { n: 'plazo_apelacion_horas', t: 'int', nn: true, def: 48 },
      { n: 'requiere_checklist', t: 'bool', nn: true, def: false },
      ORDEN,
      ACTIVO,
    ],
  },
  {
    nombre: 'dr_checklist_item', base: true,
    cols: [{ n: 'tipo_falta_id', t: 'fk', ref: 'dr_tipo_falta', nn: true }, { n: 'texto', t: 'text', nn: true }, ORDEN, ACTIVO],
  },
  {
    nombre: 'dr_gravedad', base: true,
    cols: [
      { n: 'nombre', t: 'varchar', len: 100, nn: true }, AREA,
      { n: 'puntos', t: 'dec', nn: true, def: 0 },
      { n: 'color', t: 'varchar', len: 40 },
      ORDEN, ACTIVO,
    ],
  },
  {
    nombre: 'dr_tipo_error', base: true,
    cols: [
      { n: 'nombre', t: 'varchar', len: 150, nn: true },
      { n: 'descripcion', t: 'text' }, AREA,
      { n: 'gravedad_id', t: 'fk', ref: 'dr_gravedad', nn: true },
      { n: 'grupo_id', t: 'fk', ref: 'dr_grupo' },
      ORDEN, ACTIVO,
    ],
  },
  {
    nombre: 'dr_encuesta', base: true,
    cols: [
      { n: 'titulo', t: 'varchar', len: 150, nn: true },
      { n: 'descripcion', t: 'text' }, AREA,
      { n: 'grupo_id', t: 'fk', ref: 'dr_grupo' },
      { n: 'dia_apertura', t: 'int' },
      { n: 'hora_apertura', t: 'varchar', len: 5 },
      { n: 'horas_abierta', t: 'int', nn: true, def: 24 },
      ACTIVO,
    ],
  },
  {
    nombre: 'dr_encuesta_pregunta', base: true,
    cols: [
      { n: 'encuesta_id', t: 'fk', ref: 'dr_encuesta', nn: true },
      { n: 'texto', t: 'text', nn: true },
      { n: 'tipo', t: 'enum', vals: ['ESCALA', 'SI_NO', 'TEXTO'], def: 'ESCALA' },
      { n: 'escala_min', t: 'int', nn: true, def: 1 },
      { n: 'escala_max', t: 'int' },
      { n: 'obligatoria', t: 'bool', nn: true, def: true },
      ORDEN, ACTIVO,
    ],
  },
  {
    nombre: 'dr_premio', base: true,
    cols: [
      { n: 'nombre', t: 'varchar', len: 150, nn: true },
      { n: 'descripcion', t: 'text' }, AREA,
      { n: 'monto', t: 'dec', nn: true, def: 0 },
      { n: 'moneda_id', t: 'fk', ref: 'monedas' },
      { n: 'periodo', t: 'enum', vals: ['SEMANAL', 'QUINCENAL', 'MENSUAL'], def: 'SEMANAL' },
      { n: 'metodo', t: 'enum', vals: ['CRITERIOS', 'VOTACION', 'SALDO_PUNTOS'], def: 'CRITERIOS' },
      { n: 'regla_empate', t: 'enum', vals: ['DIVIDIR', 'MONTO_COMPLETO_CADA_UNO', 'DESIERTO'], def: 'DIVIDIR' },
      { n: 'puntos_iniciales', t: 'dec' },
      { n: 'encuesta_id', t: 'fk', ref: 'dr_encuesta' },
      { n: 'grupo_id', t: 'fk', ref: 'dr_grupo' },
      ORDEN, ACTIVO,
    ],
  },
  {
    nombre: 'dr_criterio', base: true,
    cols: [
      { n: 'premio_id', t: 'fk', ref: 'dr_premio', nn: true },
      { n: 'texto', t: 'text', nn: true },
      { n: 'descripcion', t: 'text' },
      { n: 'escala_min', t: 'int', nn: true, def: 0 },
      { n: 'escala_max', t: 'int', nn: true, def: 2 },
      ORDEN, ACTIVO,
    ],
  },
  {
    nombre: 'dr_falta', base: true,
    cols: [
      { n: 'fecha', t: 'date', nn: true },
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios', nn: true },
      { n: 'tipo_falta_id', t: 'fk', ref: 'dr_tipo_falta', nn: true },
      { n: 'detectado_por_id', t: 'fk', ref: 'usuarios' },
      { n: 'motivo', t: 'text' },
      { n: 'observacion', t: 'text' },
      { n: 'minutos_tardanza', t: 'int' },
      { n: 'n_ocurrencia', t: 'int', nn: true, def: 1 },
      { n: 'resultado', t: 'enum', vals: ['ADVERTENCIA', 'MULTA'], def: 'ADVERTENCIA' },
      { n: 'monto_calculado', t: 'dec', nn: true, def: 0 },
      { n: 'moneda_id', t: 'fk', ref: 'monedas' },
      { n: 'estado', t: 'enum', vals: ['REGISTRADA', 'APELADA', 'APROBADA', 'JUSTIFICADA', 'ANULADA'], def: 'REGISTRADA' },
      { n: 'apelacion_texto', t: 'text' },
      { n: 'apelacion_fecha', t: 'ts' },
      { n: 'apelacion_vence', t: 'ts' },
      { n: 'renuncia_apelacion', t: 'bool', nn: true, def: false },
      { n: 'resuelto_por_id', t: 'fk', ref: 'usuarios' },
      { n: 'resuelto_en', t: 'ts' },
      { n: 'resolucion_texto', t: 'text' },
      { n: 'motivo_anulacion', t: 'text' },
      { n: 'penalizacion_id', t: 'fk', ref: 'penalizaciones' },
      { n: 'mes_destino', t: 'varchar', len: 7 },
      { n: 'lote_id', t: 'varchar', len: 36 },
      { n: 'checklist_fallado', t: 'text' },
    ],
    indices: [
      { nombre: 'UQ_dr_falta_penalizacion', cols: ['penalizacion_id'], unico: true },
      { nombre: 'IDX_dr_falta_funcionario_tipo_fecha', cols: ['funcionario_id', 'tipo_falta_id', 'fecha'] },
      { nombre: 'IDX_dr_falta_estado', cols: ['estado'] },
      { nombre: 'IDX_dr_falta_lote', cols: ['lote_id'] },
    ],
  },
  {
    nombre: 'dr_error', base: true,
    cols: [
      { n: 'fecha', t: 'date', nn: true },
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios', nn: true },
      { n: 'tipo_error_id', t: 'fk', ref: 'dr_tipo_error', nn: true },
      { n: 'puntos', t: 'dec', nn: true, def: 0 },
      { n: 'detalle', t: 'text' },
      { n: 'registrado_por_id', t: 'fk', ref: 'usuarios' },
      { n: 'estado', t: 'enum', vals: ['VIGENTE', 'ANULADO'], def: 'VIGENTE' },
      { n: 'motivo_anulacion', t: 'text' },
    ],
    indices: [{ nombre: 'IDX_dr_error_funcionario_fecha', cols: ['funcionario_id', 'fecha'] }],
  },
  {
    nombre: 'dr_puntaje_criterio', base: true,
    cols: [
      { n: 'fecha', t: 'date', nn: true },
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios', nn: true },
      { n: 'criterio_id', t: 'fk', ref: 'dr_criterio', nn: true },
      { n: 'valor', t: 'int', nn: true, def: 0 },
      { n: 'auditor_id', t: 'fk', ref: 'usuarios' },
    ],
    indices: [{ nombre: 'UQ_dr_puntaje_criterio_fecha_func_crit', cols: ['fecha', 'funcionario_id', 'criterio_id'], unico: true }],
  },
  {
    nombre: 'dr_periodo', base: true,
    cols: [
      { n: 'premio_id', t: 'fk', ref: 'dr_premio' },
      { n: 'encuesta_id', t: 'fk', ref: 'dr_encuesta' },
      { n: 'desde', t: 'date', nn: true },
      { n: 'hasta', t: 'date', nn: true },
      { n: 'abre_en', t: 'ts' },
      { n: 'cierra_en', t: 'ts' },
      { n: 'estado', t: 'enum', vals: ['ABIERTO', 'CERRADO', 'APROBADO'], def: 'ABIERTO' },
      { n: 'cerrado_por_id', t: 'fk', ref: 'usuarios' },
      { n: 'cerrado_en', t: 'ts' },
      { n: 'aprobado_por_id', t: 'fk', ref: 'usuarios' },
      { n: 'aprobado_en', t: 'ts' },
    ],
    indices: [
      { nombre: 'IDX_dr_periodo_premio_desde', cols: ['premio_id', 'desde'] },
      { nombre: 'IDX_dr_periodo_encuesta_desde', cols: ['encuesta_id', 'desde'] },
    ],
  },
  {
    nombre: 'dr_resultado_premio', base: true,
    cols: [
      { n: 'periodo_id', t: 'fk', ref: 'dr_periodo', nn: true },
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios', nn: true },
      { n: 'puntaje', t: 'dec', nn: true, def: 0 },
      { n: 'posicion', t: 'int' },
      { n: 'ganador', t: 'bool', nn: true, def: false },
      { n: 'monto_propuesto', t: 'dec', nn: true, def: 0 },
      { n: 'monto_aprobado', t: 'dec' },
      { n: 'moneda_id', t: 'fk', ref: 'monedas' },
      { n: 'estado', t: 'enum', vals: ['PROPUESTO', 'APROBADO', 'DESIERTO', 'ANULADO'], def: 'PROPUESTO' },
      { n: 'bono_id', t: 'fk', ref: 'bonos' },
      { n: 'mes_destino', t: 'varchar', len: 7 },
      { n: 'aprobado_por_id', t: 'fk', ref: 'usuarios' },
      { n: 'aprobado_en', t: 'ts' },
      { n: 'observacion', t: 'text' },
    ],
    indices: [
      { nombre: 'UQ_dr_resultado_premio_periodo_func', cols: ['periodo_id', 'funcionario_id'], unico: true },
      { nombre: 'UQ_dr_resultado_premio_bono', cols: ['bono_id'], unico: true },
    ],
  },
  // ── Votación anónima: sin BaseModel, sin fechas, PK UUID ──
  {
    nombre: 'dr_participacion', base: false,
    cols: [
      { n: 'id', t: 'uuidpk' },
      { n: 'periodo_id', t: 'fk', ref: 'dr_periodo', nn: true },
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios', nn: true },
    ],
    indices: [{ nombre: 'UQ_dr_participacion_periodo_func', cols: ['periodo_id', 'funcionario_id'], unico: true }],
  },
  {
    nombre: 'dr_voto_agregado', base: false,
    cols: [
      { n: 'id', t: 'uuidpk' },
      { n: 'periodo_id', t: 'fk', ref: 'dr_periodo', nn: true },
      { n: 'evaluado_id', t: 'fk', ref: 'funcionarios', nn: true },
      { n: 'pregunta_id', t: 'fk', ref: 'dr_encuesta_pregunta', nn: true },
      { n: 'datos_cifrados', t: 'text' },
      { n: 'suma_ponderada', t: 'dec' },
      { n: 'suma_pesos', t: 'dec' },
      { n: 'cantidad', t: 'int' },
      { n: 'conteo_si', t: 'int' },
      { n: 'conteo_no', t: 'int' },
    ],
    indices: [{ nombre: 'UQ_dr_voto_agregado_periodo_eval_preg', cols: ['periodo_id', 'evaluado_id', 'pregunta_id'], unico: true }],
  },
  {
    nombre: 'dr_respuesta_texto', base: false,
    cols: [
      { n: 'id', t: 'uuidpk' },
      { n: 'periodo_id', t: 'fk', ref: 'dr_periodo', nn: true },
      { n: 'evaluado_id', t: 'fk', ref: 'funcionarios', nn: true },
      { n: 'pregunta_id', t: 'fk', ref: 'dr_encuesta_pregunta', nn: true },
      { n: 'texto', t: 'text', nn: true },
    ],
    indices: [{ nombre: 'IDX_dr_respuesta_texto_periodo_eval', cols: ['periodo_id', 'evaluado_id'] }],
  },
  {
    nombre: 'dr_liquidacion_pendiente', base: true,
    cols: [
      { n: 'funcionario_id', t: 'fk', ref: 'funcionarios', nn: true },
      { n: 'mes', t: 'varchar', len: 7, nn: true },
      { n: 'liquidacion_id', t: 'fk', ref: 'liquidaciones_sueldo' },
      { n: 'motivo', t: 'text' },
      { n: 'estado', t: 'enum', vals: ['PENDIENTE', 'RESUELTO'], def: 'PENDIENTE' },
      { n: 'resuelto_en', t: 'ts' },
    ],
    indices: [{ nombre: 'IDX_dr_liq_pend_func_mes_estado', cols: ['funcionario_id', 'mes', 'estado'] }],
  },
];

function renderTabla(t: Tabla, isPg: boolean, fkNombre: (tabla: string, col: string, ref: string) => string): string {
  const ts = isPg ? 'TIMESTAMP' : 'datetime';
  const tsNow = isPg ? 'now()' : "(datetime('now'))";
  const bool = (v: boolean) => (isPg ? String(v) : v ? '1' : '0');
  const lineas: string[] = [];
  const fks: string[] = [];
  const nn = (b?: boolean) => (b ? ' NOT NULL' : ' NULL');
  const fk = (col: string, ref: string) =>
    fks.push(`CONSTRAINT "${fkNombre(t.nombre, col, ref)}" FOREIGN KEY ("${col}") REFERENCES "${ref}"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);

  if (t.base) {
    lineas.push(`"id" ${isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL'}`);
    lineas.push(`"created_at" ${ts} NOT NULL DEFAULT ${tsNow}`);
    lineas.push(`"updated_at" ${ts} NOT NULL DEFAULT ${tsNow}`);
  }
  for (const c of t.cols) {
    switch (c.t) {
      case 'uuidpk':
        lineas.push(`"${c.n}" varchar(36) PRIMARY KEY NOT NULL`);
        break;
      case 'fk':
        lineas.push(`"${c.n}" integer${nn(c.nn)}`);
        fk(c.n, c.ref);
        break;
      case 'enum': {
        const chk = isPg ? '' : ` CHECK( "${c.n}" IN (${c.vals.map((v) => `'${v}'`).join(',')}) )`;
        lineas.push(`"${c.n}" ${isPg ? 'text' : 'varchar'}${chk} NOT NULL DEFAULT ${isPg ? `'${c.def}'` : `('${c.def}')`}`);
        break;
      }
      case 'varchar':
        lineas.push(`"${c.n}" varchar(${c.len})${nn(c.nn)}${c.def !== undefined ? ` DEFAULT '${c.def}'` : ''}`);
        break;
      default: {
        const tipo = { int: 'integer', text: 'text', date: 'date', ts, bool: 'boolean', dec: isPg ? 'numeric(18,2)' : 'decimal(18,2)' }[c.t];
        let def = '';
        if (c.def !== undefined) def = ` DEFAULT ${typeof c.def === 'boolean' ? bool(c.def) : c.def}`;
        lineas.push(`"${c.n}" ${tipo}${nn(c.nn)}${def}`);
      }
    }
  }
  if (t.base) {
    lineas.push(`"created_by" integer NULL`);
    lineas.push(`"updated_by" integer NULL`);
    fk('created_by', 'usuarios');
    fk('updated_by', 'usuarios');
  }
  return `CREATE TABLE IF NOT EXISTS "${t.nombre}" (\n  ${[...lineas, ...fks].join(',\n  ')}\n)`;
}

export class DisciplinaReconocimiento1792785488053 implements MigrationInterface {
  name = 'DisciplinaReconocimiento1792785488053';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    // Mismos nombres de FK que genera TypeORM: así `migration:generate` no ve
    // diferencias espurias en las tablas dr_* más adelante.
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
    // Solo tablas dr_*, en orden inverso (los índices caen con su tabla).
    for (const t of [...TABLAS].reverse()) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${t.nombre}"`);
    }
  }
}
