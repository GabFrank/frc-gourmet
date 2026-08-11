/**
 * E2E: catálogo de estilos musicales (F4).
 *
 * Ejercita el servicio REAL contra una SQLite limpia con las migraciones
 * aplicadas. Cubre lo que hace que la función sirva:
 *
 *  - `normalizarGenero` unifica acentos e idioma (ELECTRÓNICA = ELECTRONIC),
 *    que es lo que hacía que un mismo estilo apareciera dos veces;
 *  - la siembra del catálogo es idempotente;
 *  - la reclasificación respeta `estiloFijado` (la curación manual no se pisa);
 *  - la mezcla rechaza sumas > 100% y estilos repetidos;
 *  - el déficit calcula cuánta música falta por estilo, que es el número que
 *    evita pedir 50% de bossa teniendo 7 temas;
 *  - la herencia por artista clasifica lo que no tiene género propio.
 *
 * Uso: npm run test:musica-estilos
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { MusicaTrack } from '../src/app/database/entities/musica/musica-track.entity';
import { BloqueProgramacion } from '../src/app/database/entities/musica/bloque-programacion.entity';
import { EstadoTrack } from '../src/app/database/entities/musica/musica-enums';
import {
  normalizarGenero,
  sembrarCatalogo,
  reclasificarPool,
  listarEstilos,
  guardarMezcla,
  getMezcla,
  calcularDeficit,
  heredarEstiloPorArtista,
  generosSinClasificar,
  fijarEstiloTrack,
  contarSinEstilo,
} from '../electron/services/musica-estilos.service';

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

/** Crea un tema del repertorio con lo mínimo que necesitan las cuotas. */
function track(
  ds: DataSource,
  datos: { spotifyId: string; titulo: string; artista: string; artistaId?: string; genero?: string; duracionMs?: number },
): MusicaTrack {
  const t = ds.getRepository(MusicaTrack).create({
    spotifyId: datos.spotifyId,
    titulo: datos.titulo.toUpperCase(),
    artista: datos.artista.toUpperCase(),
    artistaId: datos.artistaId,
    genero: datos.genero,
    duracionMs: datos.duracionMs ?? 210_000,
    estado: EstadoTrack.APROBADO,
  });
  return t;
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-musica-estilos.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({
    ...(baseOptions as any),
    database: dbFile,
    synchronize: false,
    migrationsRun: false,
  });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[musica-estilos] Migraciones OK.\n');

  // ─────────── Normalización ───────────
  console.log('normalizarGenero');
  ok(normalizarGenero('ELECTRÓNICA') === 'ELECTRONICA', 'saca acentos');
  ok(normalizarGenero('  rock   alternativo ') === 'ROCK ALTERNATIVO', 'colapsa espacios');
  ok(normalizarGenero('Electrónica/Neo-Soul') === 'ELECTRONICA NEO-SOUL', 'unifica separadores');
  ok(normalizarGenero('') === '', 'vacío queda vacío');
  ok(normalizarGenero('AXÉ') === 'AXE', 'AXÉ → AXE');

  // ─────────── Repertorio de prueba ───────────
  const trackRepo = ds.getRepository(MusicaTrack);
  await trackRepo.save([
    track(ds, { spotifyId: 's1', titulo: 'Corcovado', artista: 'Joao Gilberto', artistaId: 'a1', genero: 'BOSSA NOVA' }),
    track(ds, { spotifyId: 's2', titulo: 'Aguas de Marco', artista: 'Elis Regina', artistaId: 'a2', genero: 'MPB' }),
    track(ds, { spotifyId: 's3', titulo: 'Tarde em Itapua', artista: 'Toquinho', artistaId: 'a3', genero: 'MPB' }),
    track(ds, { spotifyId: 's4', titulo: 'Deixa Acontecer', artista: 'Revelacao', artistaId: 'a4', genero: 'PAGODE' }),
    track(ds, { spotifyId: 's5', titulo: 'Around', artista: 'Noname', artistaId: 'a5', genero: 'ELECTRONIC' }),
    track(ds, { spotifyId: 's6', titulo: 'Otra', artista: 'Noname', artistaId: 'a5', genero: 'ELECTRÓNICA' }),
    // Sin género: solo puede clasificarse heredando de su artista (a1).
    track(ds, { spotifyId: 's7', titulo: 'Desafinado', artista: 'Joao Gilberto', artistaId: 'a1' }),
    // Género que no está en la siembra: debe quedar sin clasificar y visible.
    track(ds, { spotifyId: 's8', titulo: 'Rara', artista: 'Otro', artistaId: 'a6', genero: 'POLKA PARAGUAYA' }),
  ]);

  // ─────────── Siembra ───────────
  console.log('\nsembrarCatalogo');
  const siembra1 = await sembrarCatalogo(ds);
  ok(siembra1.estilosCreados > 0, 'crea estilos', siembra1);
  ok(siembra1.aliasCreados > 0, 'crea alias', siembra1);

  const siembra2 = await sembrarCatalogo(ds);
  ok(
    siembra2.estilosCreados === 0 && siembra2.aliasCreados === 0,
    'es idempotente: la segunda corrida no duplica',
    siembra2,
  );

  // ─────────── Reclasificación ───────────
  console.log('\nreclasificarPool');
  const recl = await reclasificarPool(ds);
  ok(recl.clasificados >= 6, 'clasifica por alias', recl);

  const estilos = await listarEstilos(ds);
  const bossa = estilos.find((e) => e.nombre === 'BOSSA / MPB')!;
  const electronica = estilos.find((e) => e.nombre === 'ELECTRONICA')!;
  ok(!!bossa && bossa.tracks === 3, 'BOSSA / MPB junta bossa nova + MPB', bossa?.tracks);
  ok(
    !!electronica && electronica.tracks === 2,
    'ELECTRONIC y ELECTRÓNICA caen en el MISMO estilo',
    electronica?.tracks,
  );

  const sueltos = await generosSinClasificar(ds);
  ok(
    sueltos.some((s) => s.genero === 'POLKA PARAGUAYA'),
    'un género no mapeado queda visible para asignar',
    sueltos,
  );

  // ─────────── Herencia por artista ───────────
  console.log('\nheredarEstiloPorArtista');
  const antesHerencia = await contarSinEstilo(ds);
  const herencia = await heredarEstiloPorArtista(ds);
  const despuesHerencia = await contarSinEstilo(ds);
  ok(herencia.heredados >= 1, 'hereda de otro tema del mismo artista', herencia);
  ok(despuesHerencia < antesHerencia, 'baja la cantidad sin estilo', {
    antesHerencia,
    despuesHerencia,
  });

  // ─────────── estiloFijado protege la curación manual ───────────
  console.log('\nestiloFijado');
  const s8 = await trackRepo.findOne({ where: { spotifyId: 's8' } });
  await fijarEstiloTrack(ds, s8!.id, bossa.id);
  const recl2 = await reclasificarPool(ds);
  const s8Despues = await trackRepo.findOne({ where: { spotifyId: 's8' }, relations: ['estilo'] });
  ok(recl2.respetados >= 1, 'la reclasificación cuenta los fijados', recl2);
  ok(
    s8Despues?.estilo?.id === bossa.id,
    'el estilo fijado a mano NO se pisa al reclasificar',
    s8Despues?.estilo?.nombre,
  );

  // ─────────── Mezcla ───────────
  console.log('\nguardarMezcla');
  const bloque = await ds.getRepository(BloqueProgramacion).save(
    ds.getRepository(BloqueProgramacion).create({
      diaSemana: 2,
      nombre: 'ALMUERZO BUFFET',
      horaDesde: '11:00',
      horaHasta: '14:00',
      energia: 2,
      volumen: 40,
      activo: true,
      orden: 0,
      evitarArtistaConsecutivo: true,
    }),
  );

  let rechazoSuma = false;
  try {
    await guardarMezcla(ds, bloque.id, [
      { estiloId: bossa.id, porcentaje: 70 },
      { estiloId: electronica.id, porcentaje: 50 },
    ]);
  } catch {
    rechazoSuma = true;
  }
  ok(rechazoSuma, 'rechaza porcentajes que suman más de 100');

  let rechazoRepetido = false;
  try {
    await guardarMezcla(ds, bloque.id, [
      { estiloId: bossa.id, porcentaje: 10 },
      { estiloId: bossa.id, porcentaje: 10 },
    ]);
  } catch {
    rechazoRepetido = true;
  }
  ok(rechazoRepetido, 'rechaza el mismo estilo repetido');

  await guardarMezcla(ds, bloque.id, [
    { estiloId: bossa.id, porcentaje: 50 },
    { estiloId: electronica.id, porcentaje: 20 },
  ]);
  const mezcla = await getMezcla(ds, bloque.id);
  ok(mezcla.length === 2, 'guarda la mezcla válida', mezcla);

  // Guardar de nuevo REEMPLAZA, no acumula.
  await guardarMezcla(ds, bloque.id, [{ estiloId: bossa.id, porcentaje: 50 }]);
  const mezcla2 = await getMezcla(ds, bloque.id);
  ok(mezcla2.length === 1, 'volver a guardar reemplaza en vez de acumular', mezcla2);

  // ─────────── Déficit ───────────
  console.log('\ncalcularDeficit');
  await guardarMezcla(ds, bloque.id, [
    { estiloId: bossa.id, porcentaje: 50 },
    { estiloId: electronica.id, porcentaje: 20 },
  ]);
  const [deficit] = await calcularDeficit(ds, 1.5, bloque.id);
  // Bloque de 3 h x factor 1.5 = 4.5 h de playlist.
  ok(
    Math.abs(deficit.objetivoMs - 4.5 * 3600000) < 1000,
    'el objetivo es la duración del bloque por el factor',
    deficit.objetivoMs / 3600000,
  );
  const dBossa = deficit.estilos.find((e) => e.estiloId === bossa.id)!;
  ok(dBossa.necesarioMs === Math.round(deficit.objetivoMs * 0.5), 'la cuota pide el % del objetivo');
  ok(
    dBossa.faltanteMs > 0 && dBossa.tracksFaltantes > 0,
    'con 4 temas de bossa avisa que falta material para el 50%',
    { faltan: dBossa.tracksFaltantes, disponibles: dBossa.tracksDisponibles },
  );

  // Un bloque a medianoche: '00:00' es fin de día, no cero horas.
  const nocturno = await ds.getRepository(BloqueProgramacion).save(
    ds.getRepository(BloqueProgramacion).create({
      diaSemana: 2,
      nombre: 'CENA Y NOCHE',
      horaDesde: '17:00',
      horaHasta: '00:00',
      energia: 4,
      volumen: 50,
      activo: true,
      orden: 1,
      evitarArtistaConsecutivo: true,
    }),
  );
  await guardarMezcla(ds, nocturno.id, [{ estiloId: bossa.id, porcentaje: 30 }]);
  const [defNoche] = await calcularDeficit(ds, 1.5, nocturno.id);
  ok(
    Math.abs(defNoche.objetivoMs - 7 * 1.5 * 3600000) < 1000,
    "'00:00' como fin cuenta como medianoche del día siguiente (7 h, no negativo)",
    defNoche.objetivoMs / 3600000,
  );

  await ds.destroy();

  console.log(`\n${passed} pasaron, ${failed} fallaron`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FALLO:', e);
  process.exit(1);
});
