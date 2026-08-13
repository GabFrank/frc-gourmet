/**
 * E2E: selección de temas por cuotas de estilo (F4.3).
 *
 * Es el algoritmo que hace que "en el almuerzo quiero bossa y pagode"
 * efectivamente suene así. Lo que se verifica:
 *
 *  - sin mezcla definida, el comportamiento no cambia (no rompe lo anterior);
 *  - con mezcla, las proporciones se respetan dentro de un margen razonable;
 *  - los estilos quedan INTERCALADOS y no en bloques — si se llenara cubeta por
 *    cubeta sonaría media hora de bossa seguida y después media hora de pagode,
 *    que en el salón se escucha como dos playlists pegadas;
 *  - cuando una cuota se queda sin material, se avisa en vez de fallar callado
 *    y el hueco lo cubren los demás estilos;
 *  - se respeta el límite de temas por artista.
 *
 * No toca la red ni la base: `seleccionarTracks` es una función pura.
 *
 * Uso: npm run test:musica-cuotas
 */
import 'reflect-metadata';
import './_electron-mock';

import { seleccionarTracks } from '../electron/services/musica-planner.service';
import { MusicaTrack } from '../src/app/database/entities/musica/musica-track.entity';
import { BloqueProgramacion } from '../src/app/database/entities/musica/bloque-programacion.entity';
import { VarianteEnergia } from '../src/app/database/entities/musica/musica-enums';

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : '');
  }
}

const DUR = 210_000; // 3:30, el promedio que usa el planner

let seq = 0;
function t(
  estiloId: number | null,
  artista: string,
  semantica?: { ambiente?: string; escenas?: string[] },
): MusicaTrack {
  seq++;
  return {
    id: seq,
    spotifyId: `s${seq}`,
    titulo: `TEMA ${seq}`,
    artista,
    artistaId: artista,
    duracionMs: DUR,
    score: 0,
    estilo: estiloId ? ({ id: estiloId } as any) : null,
    ambiente: semantica?.ambiente,
    escenas: semantica?.escenas,
  } as unknown as MusicaTrack;
}

/** Bloque sin filtros de BPM ni valencia: acá se prueban solo las cuotas. */
const bloque = {
  id: 1,
  nombre: 'ALMUERZO',
  horaDesde: '11:00',
  horaHasta: '14:00',
  energia: 3,
  bpmMin: undefined,
  bpmMax: undefined,
  valenciaMin: undefined,
} as unknown as BloqueProgramacion;

const OPCIONES_BASE = {
  maxPorArtista: null as number | null,
  evitarConsecutivo: false,
  deltaBpm: 12,
};

function proporcion(elegidos: MusicaTrack[], estiloId: number): number {
  const n = elegidos.filter((x) => x.estilo?.id === estiloId).length;
  return elegidos.length ? n / elegidos.length : 0;
}

/** Racha más larga del mismo estilo: mide si quedó intercalado o en bloques. */
function rachaMaxima(elegidos: MusicaTrack[], estiloId: number): number {
  let max = 0;
  let actual = 0;
  for (const e of elegidos) {
    if (e.estilo?.id === estiloId) {
      actual++;
      max = Math.max(max, actual);
    } else {
      actual = 0;
    }
  }
  return max;
}

function main() {
  const objetivo = 40 * DUR; // 40 temas

  // Pool holgado: 60 de cada estilo, artistas distintos.
  const pool: MusicaTrack[] = [];
  for (let i = 0; i < 60; i++) pool.push(t(1, `BOSSA-${i}`));
  for (let i = 0; i < 60; i++) pool.push(t(2, `PAGODE-${i}`));
  for (let i = 0; i < 60; i++) pool.push(t(3, `ELECTRO-${i}`));
  for (let i = 0; i < 60; i++) pool.push(t(null, `OTRO-${i}`));

  console.log('sin mezcla');
  const sinMezcla = seleccionarTracks(pool, bloque, VarianteEnergia.NORMAL, objetivo, {
    ...OPCIONES_BASE,
    mezcla: [],
  });
  ok(sinMezcla.elegidos.length === 40, 'llena la duración objetivo', sinMezcla.elegidos.length);
  ok(sinMezcla.cuotasIncumplidas.length === 0, 'no reporta cuotas incumplidas');

  console.log('\ncon mezcla 50/20');
  const conMezcla = seleccionarTracks(pool, bloque, VarianteEnergia.NORMAL, objetivo, {
    ...OPCIONES_BASE,
    mezcla: [
      { estiloId: 1, estiloNombre: 'BOSSA / MPB', porcentaje: 50 },
      { estiloId: 2, estiloNombre: 'PAGODE', porcentaje: 20 },
    ],
  });
  const pBossa = proporcion(conMezcla.elegidos, 1);
  const pPagode = proporcion(conMezcla.elegidos, 2);
  ok(Math.abs(pBossa - 0.5) <= 0.08, 'bossa queda cerca del 50%', pBossa.toFixed(2));
  ok(Math.abs(pPagode - 0.2) <= 0.08, 'pagode queda cerca del 20%', pPagode.toFixed(2));
  ok(
    conMezcla.elegidos.length >= 38,
    'sigue llenando la duración objetivo',
    conMezcla.elegidos.length,
  );

  console.log('\nintercalado');
  const racha = rachaMaxima(conMezcla.elegidos, 1);
  // Con 50% de bossa, sin intercalar la racha sería ~20 temas seguidos.
  ok(racha <= 4, 'la bossa no sale toda junta al principio', { rachaMaxima: racha });
  const primerPagode = conMezcla.elegidos.findIndex((x) => x.estilo?.id === 2);
  ok(primerPagode >= 0 && primerPagode < 8, 'el pagode aparece temprano, no al final', primerPagode);

  console.log('\ncuota sin material');
  // Solo 3 temas de pagode para una cuota que pide 20% de 40 = 8.
  const poolEscaso = [
    ...pool.filter((x) => x.estilo?.id !== 2),
    ...pool.filter((x) => x.estilo?.id === 2).slice(0, 3),
  ];
  const escaso = seleccionarTracks(poolEscaso, bloque, VarianteEnergia.NORMAL, objetivo, {
    ...OPCIONES_BASE,
    mezcla: [
      { estiloId: 1, estiloNombre: 'BOSSA / MPB', porcentaje: 50 },
      { estiloId: 2, estiloNombre: 'PAGODE', porcentaje: 20 },
    ],
  });
  ok(
    escaso.cuotasIncumplidas.includes('PAGODE'),
    'avisa qué cuota se quedó sin material',
    escaso.cuotasIncumplidas,
  );
  ok(
    escaso.elegidos.filter((x) => x.estilo?.id === 2).length === 3,
    'usa todo el material que hay de esa cuota',
  );
  ok(
    escaso.elegidos.length >= 38,
    'el hueco lo cubren los otros estilos: la playlist NO queda corta',
    escaso.elegidos.length,
  );

  console.log('\nlímite por artista');
  const poolUnArtista: MusicaTrack[] = [];
  for (let i = 0; i < 40; i++) poolUnArtista.push(t(1, 'UNICO'));
  for (let i = 0; i < 40; i++) poolUnArtista.push(t(3, `ELECTRO-X${i}`));
  const conLimite = seleccionarTracks(poolUnArtista, bloque, VarianteEnergia.NORMAL, objetivo, {
    ...OPCIONES_BASE,
    maxPorArtista: 2,
    mezcla: [{ estiloId: 1, estiloNombre: 'BOSSA / MPB', porcentaje: 50 }],
  });
  const delUnico = conLimite.elegidos.filter((x) => x.artista === 'UNICO').length;
  ok(delUnico <= 2, 'respeta el máximo de temas por artista dentro de la cuota', delUnico);

  console.log('\nsin repetidos');
  const ids = conMezcla.elegidos.map((x) => x.id);
  ok(ids.length === new Set(ids).size, 'ningún tema se repite en la playlist');

  // ─────────── Ejes semánticos ───────────
  //
  // El brief del local dice "nada triste" y hasta ahora el planner no tenía
  // cómo cumplirlo: los vetos aceptan artista, género, estilo, tema e idioma,
  // ninguno describe el ánimo. En producción había 45 temas MELANCOLICO
  // sonando con esa regla escrita.
  console.log('\nánimo prohibido');
  const conTristes: MusicaTrack[] = [];
  for (let i = 0; i < 30; i++) conTristes.push(t(1, `ALEGRE-${i}`, { ambiente: 'ALEGRE' }));
  for (let i = 0; i < 30; i++) conTristes.push(t(1, `TRISTE-${i}`, { ambiente: 'MELANCOLICO' }));

  const bloqueSinTristes = { ...bloque, animosEvitar: ['MELANCOLICO'] } as BloqueProgramacion;
  const sinTristes = seleccionarTracks(
    conTristes,
    bloqueSinTristes,
    VarianteEnergia.NORMAL,
    objetivo,
    { ...OPCIONES_BASE, mezcla: [] },
  );
  ok(
    sinTristes.elegidos.every((x) => x.ambiente !== 'MELANCOLICO'),
    'ningún tema melancólico entra cuando el bloque lo prohíbe',
    sinTristes.elegidos.filter((x) => x.ambiente === 'MELANCOLICO').length,
  );
  ok(sinTristes.elegidos.length === 30, 'usa todo lo permitido', sinTristes.elegidos.length);

  // Con poco material el planner relaja BPM y valencia, pero el ánimo NO: es
  // una regla explícita del dueño, no un parámetro de perfil.
  const bloqueExigente = {
    ...bloque,
    animosEvitar: ['MELANCOLICO'],
    bpmMin: 90,
    bpmMax: 100,
  } as BloqueProgramacion;
  const relajado = seleccionarTracks(
    conTristes.filter((x) => x.ambiente === 'MELANCOLICO' || x.artista.startsWith('ALEGRE-1')),
    bloqueExigente,
    VarianteEnergia.NORMAL,
    objetivo,
    { ...OPCIONES_BASE, mezcla: [] },
  );
  ok(
    relajado.elegidos.every((x) => x.ambiente !== 'MELANCOLICO'),
    'el ánimo prohibido NO se relaja aunque falte material',
    relajado.elegidos.filter((x) => x.ambiente === 'MELANCOLICO').length,
  );

  console.log('\nmomento del día');
  // La escena PREFIERE, no filtra: de 278 temas aprobados solo 38 declaran
  // ALMUERZO, y como filtro duro dejaría el bloque a un tercio.
  const pocosDelMomento: MusicaTrack[] = [];
  for (let i = 0; i < 5; i++) pocosDelMomento.push(t(1, `MOMENTO-${i}`, { escenas: ['ALMUERZO'] }));
  for (let i = 0; i < 60; i++) pocosDelMomento.push(t(1, `OTRO-M${i}`, { escenas: ['NOCHE'] }));

  const conEscena = { ...bloque, escenaPreferida: 'ALMUERZO' } as BloqueProgramacion;
  const preferida = seleccionarTracks(
    pocosDelMomento,
    conEscena,
    VarianteEnergia.NORMAL,
    objetivo,
    { ...OPCIONES_BASE, mezcla: [] },
  );
  ok(preferida.elegidos.length === 40, 'la escena no deja la playlist corta', preferida.elegidos.length);
  const primeros = preferida.elegidos.slice(0, 5);
  ok(
    primeros.filter((x) => (x.escenas || []).includes('ALMUERZO')).length === 5,
    'los temas del momento salen primero',
    primeros.map((x) => x.escenas),
  );

  console.log(`\n${passed} pasaron, ${failed} fallaron`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
