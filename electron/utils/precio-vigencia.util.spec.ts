/**
 * Tests de lógica pura del resolver de precios programados.
 *
 * Autónomo (no requiere karma/jasmine). Correr con:
 *   npx ts-node --transpile-only -P tsconfig.electron.json \
 *     electron/utils/precio-vigencia.util.spec.ts
 */
import {
  precioVigenteEn,
  resolverPrecioVigente,
  tieneProgramacion,
  PrecioVigenciaLike,
} from '../../src/app/shared/utils/precio-vigencia.util';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

// Helper: Date local en (y, m, d, hh, mm). m es 1-based para legibilidad.
function d(y: number, mo: number, day: number, hh = 0, mm = 0): Date {
  return new Date(y, mo - 1, day, hh, mm);
}

// 2026-06-15 es LUNES.
const lunesAlmuerzo = d(2026, 6, 15, 12, 30);
const lunesNoche = d(2026, 6, 15, 21, 0);
const sabadoAlmuerzo = d(2026, 6, 20, 12, 30); // 2026-06-20 = sábado

// --- tieneProgramacion ---
check('sin campos → no programado', tieneProgramacion({ valor: 100 }) === false);
check('con horaInicio → programado', tieneProgramacion({ horaInicio: '11:00' }) === true);

// --- precioVigenteEn: días de semana ---
check(
  'lun-vie aplica el lunes',
  precioVigenteEn({ diasSemana: '1,2,3,4,5' }, lunesAlmuerzo) === true,
);
check(
  'lun-vie NO aplica el sábado',
  precioVigenteEn({ diasSemana: '1,2,3,4,5' }, sabadoAlmuerzo) === false,
);

// --- precioVigenteEn: rango horario normal ---
check(
  'almuerzo 11:00-15:00 vigente 12:30',
  precioVigenteEn({ horaInicio: '11:00', horaFin: '15:00' }, lunesAlmuerzo) === true,
);
check(
  'almuerzo 11:00-15:00 NO vigente 21:00',
  precioVigenteEn({ horaInicio: '11:00', horaFin: '15:00' }, lunesNoche) === false,
);
check(
  'fin de rango exclusivo (15:00 fuera de 11-15)',
  precioVigenteEn({ horaInicio: '11:00', horaFin: '15:00' }, d(2026, 6, 15, 15, 0)) === false,
);

// --- precioVigenteEn: cruce de medianoche ---
check(
  'nocturno 22:00-02:00 vigente 23:30',
  precioVigenteEn({ horaInicio: '22:00', horaFin: '02:00' }, d(2026, 6, 15, 23, 30)) === true,
);
check(
  'nocturno 22:00-02:00 vigente 01:00',
  precioVigenteEn({ horaInicio: '22:00', horaFin: '02:00' }, d(2026, 6, 15, 1, 0)) === true,
);
check(
  'nocturno 22:00-02:00 NO vigente 12:00',
  precioVigenteEn({ horaInicio: '22:00', horaFin: '02:00' }, d(2026, 6, 15, 12, 0)) === false,
);

// --- precioVigenteEn: rango de fechas ---
check(
  'feriado solo 2026-06-15 aplica ese día',
  precioVigenteEn({ fechaInicio: '2026-06-15', fechaFin: '2026-06-15' }, lunesAlmuerzo) === true,
);
check(
  'feriado solo 2026-06-15 NO aplica el 20',
  precioVigenteEn({ fechaInicio: '2026-06-15', fechaFin: '2026-06-15' }, sabadoAlmuerzo) === false,
);

// --- precioVigenteEn: activo=false nunca vigente ---
check('activo=false → no vigente', precioVigenteEn({ activo: false }, lunesAlmuerzo) === false);

// --- resolverPrecioVigente: fallback al base/principal ---
const precios: PrecioVigenciaLike[] = [
  { id: 1, valor: 50000, principal: true }, // base
  { id: 2, valor: 60000, horaInicio: '19:00', horaFin: '23:00', prioridad: 1 }, // cena
  { id: 3, valor: 75000, diasSemana: '5', horaInicio: '11:00', horaFin: '15:00', prioridad: 5 }, // viernes premium
];
check(
  'almuerzo lunes → base (principal id=1)',
  resolverPrecioVigente(precios, lunesAlmuerzo)?.id === 1,
);
check('noche lunes → cena (id=2)', resolverPrecioVigente(precios, lunesNoche)?.id === 2);
check(
  'viernes 13:00 → premium gana por prioridad (id=3)',
  resolverPrecioVigente(precios, d(2026, 6, 19, 13, 0))?.id === 3, // 2026-06-19 = viernes
);

// --- resolverPrecioVigente: prioridad ante solape ---
const solapados: PrecioVigenciaLike[] = [
  { id: 10, valor: 100, horaInicio: '10:00', horaFin: '20:00', prioridad: 1 },
  { id: 11, valor: 200, horaInicio: '10:00', horaFin: '20:00', prioridad: 9 },
];
check(
  'solape → gana mayor prioridad (id=11)',
  resolverPrecioVigente(solapados, d(2026, 6, 15, 12, 0))?.id === 11,
);

// --- resolverPrecioVigente: lista vacía / sin activos ---
check('lista vacía → null', resolverPrecioVigente([]) === null);
check(
  'sin activos → null',
  resolverPrecioVigente([{ id: 1, valor: 1, activo: false }]) === null,
);

console.log(`\nprecio-vigencia.util: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
