/**
 * Test unitario del motor puro de Disciplina y Reconocimiento (electron/services/disciplina).
 * Uso: npm run test:disciplina-motor
 */
import * as assert from 'assert';
import { randomBytes } from 'crypto';
import {
  calcularMulta, debeIgnorarTardanza, TipoFaltaConfig, FaltaPrevia,
  calcularCriterios, calcularSaldoPuntos, calcularVotacion, resolverPremio, dividirMonto, rankear,
  validarEnvio, acumular, cifrarAgregado, descifrarAgregado, mezclar, PreguntaEncuesta, RespuestaEnvio, AgregadoVoto,
  mesDestino, aplicarTope, validarMoneda, DisciplinaError, inicioSemana,
} from '../electron/services/disciplina';

let n = 0;
let fallas = 0;
function caso(nombre: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${nombre}`); }
  catch (e: any) { fallas++; console.error(`  ✗ ${nombre}: ${e?.message ?? e}`); }
}
const eq = (a: unknown, b: unknown, m?: string) => { n++; assert.deepStrictEqual(a, b, m); };
const ok = (c: unknown, m?: string) => { n++; assert.ok(c, m); };
const lanza = (fn: () => unknown, codigo: string) => {
  n++;
  assert.throws(fn, (e: unknown) => e instanceof DisciplinaError && e.codigo === codigo);
};

// ---------------------------------------------------------------- MULTAS
const base: TipoFaltaConfig = { advertenciasPrevias: 1, montoMulta: 50000, reinicio: 'MENSUAL' };

caso('advertencia en 1.ª, multa en 2.ª', () => {
  eq(calcularMulta(base, [], '2026-10-05'), { nOcurrencia: 1, resultado: 'ADVERTENCIA', monto: 0, dentroTolerancia: false });
  eq(calcularMulta(base, [{ fecha: '2026-10-02', estado: 'REGISTRADA' }], '2026-10-05'),
    { nOcurrencia: 2, resultado: 'MULTA', monto: 50000, dentroTolerancia: false });
});

caso('escala de montos por ocurrencia', () => {
  const t: TipoFaltaConfig = { ...base, reinicio: 'NUNCA', escalaMontos: { 2: 30000, 3: 80000 } };
  const p = (k: number): FaltaPrevia[] => Array.from({ length: k }, (_, i) => ({ fecha: `2026-01-0${i + 1}`, estado: 'APROBADA' }));
  eq(calcularMulta(t, p(1), '2026-02-01').monto, 30000);
  eq(calcularMulta(t, p(2), '2026-02-01').monto, 80000);
  eq(calcularMulta(t, p(3), '2026-02-01').monto, 50000, '4.ª sin escala → monto_multa');
  eq(calcularMulta(t, p(3), '2026-02-01').nOcurrencia, 4);
});

caso('reinicio mensual', () => {
  const r = calcularMulta(base, [{ fecha: '2026-09-30', estado: 'APROBADA' }], '2026-10-01');
  eq(r.resultado, 'ADVERTENCIA');
  eq(r.nOcurrencia, 1);
  eq(calcularMulta({ ...base, reinicio: 'NUNCA' }, [{ fecha: '2026-09-30', estado: 'APROBADA' }], '2026-10-01').resultado, 'MULTA');
});

caso('reinicio semanal (lunes por defecto y domingo configurable)', () => {
  const t: TipoFaltaConfig = { ...base, reinicio: 'SEMANAL' };
  // 2026-10-19 es lunes; 2026-10-18 domingo
  eq(inicioSemana('2026-10-23'), '2026-10-19');
  eq(inicioSemana('2026-10-23', 7), '2026-10-18');
  eq(calcularMulta(t, [{ fecha: '2026-10-18', estado: 'REGISTRADA' }], '2026-10-20').resultado, 'ADVERTENCIA');
  eq(calcularMulta(t, [{ fecha: '2026-10-19', estado: 'REGISTRADA' }], '2026-10-20').resultado, 'MULTA');
  eq(calcularMulta(t, [{ fecha: '2026-10-18', estado: 'REGISTRADA' }], '2026-10-20', { inicioSemana: 7 }).resultado, 'MULTA');
});

caso('anuladas y justificadas no cuentan; apeladas sí', () => {
  const prev: FaltaPrevia[] = [{ fecha: '2026-10-01', estado: 'ANULADA' }, { fecha: '2026-10-02', estado: 'JUSTIFICADA' }];
  eq(calcularMulta(base, prev, '2026-10-05').resultado, 'ADVERTENCIA');
  eq(calcularMulta(base, [...prev, { fecha: '2026-10-03', estado: 'APELADA' }], '2026-10-05').nOcurrencia, 2);
  eq(calcularMulta(base, [{ fecha: '2026-10-09', estado: 'REGISTRADA' }], '2026-10-05').nOcurrencia, 1, 'posteriores al hecho no cuentan');
});

caso('tolerancia de tardanza', () => {
  const t: TipoFaltaConfig = { ...base, toleranciaMinutos: 10 };
  const prev: FaltaPrevia[] = [{ fecha: '2026-10-01', estado: 'REGISTRADA' }];
  eq(calcularMulta(t, prev, '2026-10-05', { minutosTardanza: 10 }), { nOcurrencia: 0, resultado: 'NINGUNO', monto: 0, dentroTolerancia: true });
  eq(calcularMulta(t, prev, '2026-10-05', { minutosTardanza: 5, advertirDentroTolerancia: true }).resultado, 'ADVERTENCIA');
  eq(calcularMulta(t, prev, '2026-10-05', { minutosTardanza: 11 }).resultado, 'MULTA');
});

caso('ignorar tardanza si ya hay penalización automática ese día', () => {
  ok(debeIgnorarTardanza('2026-10-05', ['2026-10-05T08:15:00.000Z']));
  ok(!debeIgnorarTardanza('2026-10-05', ['2026-10-04']));
});

// ---------------------------------------------------------------- PREMIOS
const func = [{ id: 1, nombre: 'PEDRO' }, { id: 2, nombre: 'ANA' }, { id: 3, nombre: 'LUIS' }];

caso('CRITERIOS y SALDO_PUNTOS', () => {
  const c = calcularCriterios(func, [{ funcionarioId: 1, valor: 2 }, { funcionarioId: 1, valor: 1 }, { funcionarioId: 2, valor: 2 }]);
  eq(c.map((x) => x.puntaje), [3, 2, 0]);
  const s = calcularSaldoPuntos(func, 10, [
    { funcionarioId: 1, puntos: 3, estado: 'VIGENTE' }, { funcionarioId: 1, puntos: 5, estado: 'ANULADO' },
    { funcionarioId: 3, puntos: 2, estado: 'VIGENTE' },
  ]);
  eq(s.map((x) => x.puntaje), [7, 10, 8]);
  eq(rankear(s).map((r) => [r.nombre, r.posicion]), [['ANA', 1], ['LUIS', 2], ['PEDRO', 3]]);
});

caso('empate DIVIDIR con resto al primero alfabético', () => {
  eq(dividirMonto(100000, 3), [33334, 33333, 33333]);
  const r = resolverPremio({
    metodo: 'CRITERIOS', monto: 100000, reglaEmpate: 'DIVIDIR',
    puntajes: [{ funcionarioId: 1, nombre: 'PEDRO', puntaje: 9 }, { funcionarioId: 2, nombre: 'ANA', puntaje: 9 },
      { funcionarioId: 3, nombre: 'LUIS', puntaje: 9 }, { funcionarioId: 4, nombre: 'ZOE', puntaje: 4 }],
  });
  eq(r.estado, 'EMPATE');
  eq(r.ranking.filter((x) => x.ganador).map((x) => [x.nombre, x.montoPropuesto]), [['ANA', 33334], ['LUIS', 33333], ['PEDRO', 33333]]);
  eq(r.ranking.filter((x) => x.ganador).reduce((s, x) => s + x.montoPropuesto, 0), 100000);
  eq(r.ranking[3].posicion, 4);
});

caso('empate MONTO_COMPLETO_CU y DESIERTO; ganador único', () => {
  const p = [{ funcionarioId: 1, nombre: 'A', puntaje: 5 }, { funcionarioId: 2, nombre: 'B', puntaje: 5 }];
  eq(resolverPremio({ metodo: 'CRITERIOS', monto: 100000, reglaEmpate: 'MONTO_COMPLETO_CU', puntajes: p }).ranking.map((x) => x.montoPropuesto), [100000, 100000]);
  const d = resolverPremio({ metodo: 'CRITERIOS', monto: 100000, reglaEmpate: 'DESIERTO', puntajes: p });
  eq([d.estado, d.motivoDesierto], ['DESIERTO', 'EMPATE_DESIERTO']);
  const g = resolverPremio({ metodo: 'CRITERIOS', monto: 100000, reglaEmpate: 'DIVIDIR', puntajes: [...p, { funcionarioId: 3, nombre: 'C', puntaje: 6 }] });
  eq([g.estado, g.ranking[0].nombre, g.ranking[0].montoPropuesto], ['GANADOR', 'C', 100000]);
});

caso('DESIERTO por mínimo de votantes', () => {
  const p = [{ funcionarioId: 1, nombre: 'A', puntaje: 8 }];
  const r = resolverPremio({ metodo: 'VOTACION', monto: 100000, reglaEmpate: 'DIVIDIR', puntajes: p, cantidadVotantes: 3 });
  eq([r.estado, r.motivoDesierto], ['DESIERTO', 'MINIMO_VOTANTES']);
  ok(r.ranking.every((x) => !x.ganador && x.montoPropuesto === 0));
  eq(resolverPremio({ metodo: 'VOTACION', monto: 100000, reglaEmpate: 'DIVIDIR', puntajes: p, cantidadVotantes: 4 }).estado, 'GANADOR');
  eq(resolverPremio({ metodo: 'VOTACION', monto: 1, reglaEmpate: 'DIVIDIR', puntajes: p, cantidadVotantes: 2, minVotantes: 2 }).estado, 'GANADOR');
});

caso('votación ponderada (peso 2) y SI_NO normalizado', () => {
  let a: AgregadoVoto | null = null;
  a = acumular(a, { tipo: 'ESCALA', valor: 10 }, 2); // Fermina pesa 2
  a = acumular(a, { tipo: 'ESCALA', valor: 4 }, 1);
  eq(a, { sumaPonderada: 24, sumaPesos: 3, cantidad: 2, conteoSi: 0, conteoNo: 0 });
  let sn: AgregadoVoto | null = null;
  sn = acumular(sn, { tipo: 'SI_NO', valor: true }, 2);
  sn = acumular(sn, { tipo: 'SI_NO', valor: false }, 1);
  eq([sn.sumaPonderada, sn.sumaPesos, sn.conteoSi, sn.conteoNo], [2, 3, 1, 1]);
  eq(acumular(a, { tipo: 'ESCALA', valor: null }, 1), a, 'vacía no suma');
  const v = calcularVotacion([{ id: 7, nombre: 'X' }, { id: 8, nombre: 'Y' }], [
    { evaluadoId: 7, tipoPregunta: 'ESCALA', ...a },
    { evaluadoId: 7, tipoPregunta: 'TEXTO', sumaPonderada: 999, sumaPesos: 1, cantidad: 1, conteoSi: 0, conteoNo: 0 },
  ]);
  eq(v[0].puntaje, 8, '(10*2 + 4*1) / 3');
  eq(v[1].puntaje, 0);
  const v2 = calcularVotacion([{ id: 7, nombre: 'X' }], [{ evaluadoId: 7, tipoPregunta: 'ESCALA', ...a }, { evaluadoId: 7, tipoPregunta: 'SI_NO', ...sn }]);
  eq(v2[0].puntaje, 26 / 6);
});

// ---------------------------------------------------------------- VALIDACIÓN DE ENVÍO
const preguntas: PreguntaEncuesta[] = [
  { id: 'p1', tipo: 'ESCALA', escalaMin: 1, escalaMax: 10, obligatoria: true },
  { id: 'p2', tipo: 'SI_NO', obligatoria: true },
  { id: 'p3', tipo: 'TEXTO', obligatoria: false },
];
const resp = (ev: number, v1: number = 7, v2: boolean = true): RespuestaEnvio[] =>
  [{ evaluadoId: ev, preguntaId: 'p1', valor: v1 }, { evaluadoId: ev, preguntaId: 'p2', valor: v2 }];
const codigos = (r: ReturnType<typeof validarEnvio>) => r.errores.map((e) => e.codigo);

caso('validarEnvio: completo OK, autovoto, incompleto, obligatoria, rango', () => {
  const miembros = [1, 2, 3]; // incluye al votante 1
  eq(validarEnvio(1, miembros, preguntas, [...resp(2), ...resp(3)]), { valido: true, errores: [] });
  ok(codigos(validarEnvio(1, miembros, preguntas, [...resp(1), ...resp(2), ...resp(3)])).includes('AUTOVOTO'));
  eq(codigos(validarEnvio(1, miembros, preguntas, resp(2))), ['ENVIO_INCOMPLETO']);
  eq(codigos(validarEnvio(1, miembros, preguntas, [...resp(2), { evaluadoId: 3, preguntaId: 'p1', valor: 5 }])), ['OBLIGATORIA_SIN_RESPUESTA']);
  eq(codigos(validarEnvio(1, miembros, preguntas, [...resp(2, 11), ...resp(3)])), ['FUERA_DE_RANGO']);
  eq(codigos(validarEnvio(1, miembros, preguntas, [...resp(2, 0), ...resp(3)])), ['FUERA_DE_RANGO']);
  eq(codigos(validarEnvio(1, miembros, preguntas, [...resp(2), ...resp(3), ...resp(9)])), ['EVALUADO_NO_ESPERADO']);
  eq(codigos(validarEnvio(null, miembros, preguntas, [...resp(2), ...resp(3)])), ['SIN_VOTANTE']);
  ok(validarEnvio(1, miembros, preguntas, [...resp(2), ...resp(3), { evaluadoId: 2, preguntaId: 'p3', valor: 'BUEN COMPAÑERO' }]).valido);
});

// ---------------------------------------------------------------- CIFRADO Y MEZCLA
caso('cifrado AES-GCM ida y vuelta, sin números en claro', () => {
  const clave = randomBytes(32);
  const agg: AgregadoVoto = { sumaPonderada: 123457, sumaPesos: 98765, cantidad: 4321, conteoSi: 5678, conteoNo: 8765 };
  const c = cifrarAgregado(agg, clave);
  eq(c.split(':').length, 3);
  eq(descifrarAgregado(c, clave), agg);
  for (const num of ['123457', '98765', '4321', '5678', '8765', 'sumaPonderada']) ok(!c.includes(num), `no contiene ${num}`);
  ok(cifrarAgregado(agg, clave) !== c, 'IV aleatorio');
  lanza(() => descifrarAgregado(c, randomBytes(32)), 'CIFRADO_INVALIDO');
  const cc = cifrarAgregado(agg, clave, 'P1|7|p1');
  eq(descifrarAgregado(cc, clave, 'P1|7|p1'), agg);
  lanza(() => descifrarAgregado(cc, clave, 'P1|8|p1'), 'CIFRADO_INVALIDO');
  lanza(() => cifrarAgregado(agg, randomBytes(16)), 'CLAVE_INVALIDA');
});

caso('mezclar conserva elementos', () => {
  const arr = Array.from({ length: 50 }, (_, i) => i);
  const m = mezclar(arr);
  eq(m.slice().sort((a, b) => a - b), arr);
  eq(arr[0], 0, 'no muta el original');
});

// ---------------------------------------------------------------- LIQUIDACIÓN
caso('mesDestino salta APROBADA/PAGADA', () => {
  eq(mesDestino('2026-10-15', {}), '2026-10');
  eq(mesDestino('2026-10-15', { '2026-10': 'BORRADOR' }), '2026-10');
  eq(mesDestino('2026-11-15', { '2026-11': 'PAGADA', '2026-12': 'APROBADA' }), '2027-01');
});

caso('tope mensual con excedente', () => {
  eq(aplicarTope(50000, 80000, 100000), { montoEsteMes: 20000, excedente: 30000 });
  eq(aplicarTope(50000, 120000, 100000), { montoEsteMes: 0, excedente: 50000 });
  eq(aplicarTope(50000, 80000, null), { montoEsteMes: 50000, excedente: 0 });
});

caso('moneda distinta se rechaza', () => {
  lanza(() => validarMoneda('USD', 'PYG'), 'MONEDA_DISTINTA');
  lanza(() => validarMoneda(1, 2), 'MONEDA_DISTINTA');
  n++; assert.doesNotThrow(() => validarMoneda('pyg', 'PYG'));
});

if (fallas > 0) {
  console.error(`FALLARON ${fallas} caso(s) (${n} asserts ejecutados)`);
  process.exit(1);
}
console.log(`OK ${n} asserts`);
