/**
 * Test del cargador idempotente «Cargar ejemplo Cocina» (Disciplina y Reconocimiento, fase 2).
 * Usa un api en memoria que imita dr-get-* / dr-save-* (sin Electron ni base):
 *  - la primera carga crea todo con activo=false;
 *  - la segunda no crea nada nuevo;
 *  - con registros previos (mismo nombre, otra capitalización) los reutiliza.
 * Correr: npm run test:disciplina-ejemplo
 */
import { cargarEjemploCocina, DrIpc } from '../src/app/pages/rrhh/disciplina/disciplina-api.service';
import { EJEMPLO_GRAVEDADES, EJEMPLO_PREMIOS, EJEMPLO_TIPOS_ERROR, EJEMPLO_TIPOS_FALTA, EJEMPLO_ENCUESTA } from '../src/app/pages/rrhh/disciplina/ejemplo-cocina';

let fallas = 0;
let total = 0;
function check(nombre: string, cond: boolean): void {
  total++;
  if (cond) console.log(`  ✓ ${nombre}`);
  else { fallas++; console.log(`  ✗ ${nombre}`); }
}

/** Relación → filtro <rel>Id que acepta el handler genérico. */
const REL_FILTRO: Record<string, string> = { 'encuesta-preguntas': 'encuesta', criterios: 'premio', 'checklist-items': 'tipoFalta', 'grupo-miembros': 'grupo' };

class FakeApi implements DrIpc {
  tablas: Record<string, any[]> = {};
  saves = 0;
  private seq = 1;
  tabla(c: string) { return (this.tablas[c] ??= []); }
  async call(channel: string, ...args: any[]): Promise<any> {
    const canal = channel === 'dr-get-tipos-falta' || channel === 'dr-save-tipo-falta' ? 'tipos-falta' : channel.replace(/^dr-(get|save)-/, '');
    if (channel.startsWith('dr-get-')) {
      const f = args[0] ?? {};
      let filas = this.tabla(canal).filter((x) => f.incluirInactivos || x.activo !== false);
      const rel = REL_FILTRO[canal];
      if (rel && f[`${rel}Id`]) filas = filas.filter((x) => x[rel]?.id === f[`${rel}Id`]);
      return JSON.parse(JSON.stringify(filas));
    }
    if (channel.startsWith('dr-save-')) {
      this.saves++;
      const d = { ...args[0] };
      for (const k of ['nombre', 'titulo', 'texto', 'descripcion', 'area']) if (typeof d[k] === 'string') d[k] = d[k].trim().toUpperCase();
      const fila = { id: this.seq++, activo: true, ...d };
      this.tabla(canal).push(fila);
      return { ...fila };
    }
    throw new Error(`canal no simulado: ${channel}`);
  }
}

(async () => {
  console.log('[A] primera carga');
  const api = new FakeApi();
  const r1 = await cargarEjemploCocina(api, { monedaId: 7 });
  const esperado = 1 /*grupo*/ + EJEMPLO_GRAVEDADES.length + EJEMPLO_TIPOS_FALTA.length + EJEMPLO_TIPOS_ERROR.length
    + 1 + EJEMPLO_ENCUESTA.preguntas.length + EJEMPLO_PREMIOS.length
    + EJEMPLO_PREMIOS.reduce((s, p) => s + (p.criterios?.length ?? 0), 0);
  check(`crea ${esperado} registros (creó ${r1.creados.length})`, r1.creados.length === esperado && api.saves === esperado);
  check('ninguno existía', r1.existentes.length === 0);
  const todas = Object.values(api.tablas).flat();
  check('todo se crea con activo=false', todas.length === esperado && todas.every((x) => x.activo === false));
  check('3 gravedades LEVE/MEDIA/GRAVE', ['LEVE', 'MEDIA', 'GRAVE'].every((n) => api.tabla('gravedades').some((g) => g.nombre === n)));
  const cocinaSucia = api.tabla('tipos-falta').find((t) => t.nombre === 'COCINA SUCIA AL CIERRE');
  check('COCINA SUCIA AL CIERRE es colectiva e inactiva', cocinaSucia?.modoAplicacion === 'TODOS_PRESENTES' && cocinaSucia?.activo === false);
  const tarde = api.tabla('tipos-falta').find((t) => t.nombre === 'LLEGADA TARDÍA');
  check('LLEGADA TARDÍA: 1 advertencia, multa 20000, moneda 7', tarde?.advertenciasPrevias === 1 && tarde?.montoMulta === 20000 && tarde?.moneda?.id === 7);
  const comanda = api.tabla('tipos-error').find((t) => t.nombre === 'ERROR DE COMANDA');
  const leve = api.tabla('gravedades').find((g) => g.nombre === 'LEVE');
  check('ERROR DE COMANDA apunta a la gravedad LEVE', comanda?.gravedad?.id === leve?.id);
  const cocinero = api.tabla('premios').find((p) => p.nombre === 'COCINERO DE LA SEMANA');
  check('COCINERO DE LA SEMANA por CRITERIOS, 100000', cocinero?.metodo === 'CRITERIOS' && cocinero?.monto === 100000);
  check('3 criterios del premio', api.tabla('criterios').filter((c) => c.premio?.id === cocinero?.id).length === 3);
  const companero = api.tabla('premios').find((p) => p.nombre === 'COMPAÑERO DEL MES');
  check('COMPAÑERO DEL MES por VOTACION con encuesta', companero?.metodo === 'VOTACION' && !!companero?.encuesta?.id);

  console.log('[B] segunda carga (idempotente)');
  const savesAntes = api.saves;
  const r2 = await cargarEjemploCocina(api, { monedaId: 7 });
  check('no crea nada nuevo', r2.creados.length === 0 && api.saves === savesAntes);
  check('reconoce todos como existentes', r2.existentes.length === esperado);
  check('cantidad total sin cambios', Object.values(api.tablas).flat().length === esperado);

  console.log('[C] con datos previos del usuario (activos, otra capitalización)');
  const api2 = new FakeApi();
  await api2.call('dr-save-gravedades', { nombre: 'leve', puntos: 9 });
  await api2.call('dr-save-tipo-falta', { nombre: 'Falta sin aviso', montoMulta: 99 });
  api2.saves = 0;
  const r3 = await cargarEjemploCocina(api2);
  check('no duplica LEVE', api2.tabla('gravedades').filter((g) => g.nombre === 'LEVE').length === 1);
  check('no toca el registro previo (sigue activo y con sus valores)', api2.tabla('gravedades').find((g) => g.nombre === 'LEVE')?.puntos === 9
    && api2.tabla('gravedades').find((g) => g.nombre === 'LEVE')?.activo === true);
  check('no duplica FALTA SIN AVISO', api2.tabla('tipos-falta').filter((t) => t.nombre === 'FALTA SIN AVISO').length === 1);
  check('crea solo lo que faltaba', r3.creados.length === esperado - 2 && r3.existentes.length === 2);
  const comanda2 = api2.tabla('tipos-error').find((t) => t.nombre === 'ERROR DE COMANDA');
  check('reusa la gravedad LEVE existente', comanda2?.gravedad?.id === api2.tabla('gravedades').find((g) => g.nombre === 'LEVE')?.id);
  check('sin moneda → null', api2.tabla('tipos-falta').find((t) => t.nombre === 'LLEGADA TARDÍA')?.moneda === null);

  console.log(`\n${total - fallas}/${total} OK`);
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
