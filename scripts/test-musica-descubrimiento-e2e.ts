/**
 * E2E: el criterio con el que descubre música nueva.
 *
 * POR QUE EXISTE ESTE TEST: el descubridor leía `generosPreferidos` — el texto
 * libre de los bloques que el catálogo de estilos reemplazó en F4 — y nunca
 * veía las cuotas, ni los estilos apagados, ni el voto del dueño. Medido en
 * producción: PAGODE tenía 6 temas contra una cuota del 40%, porque la IA
 * jamás supo que esa cuota existía.
 *
 * Se ejercita el servicio REAL contra una SQLite limpia con las migraciones
 * aplicadas. `construirPrompt` es pura, así que además se verifica el texto
 * final sin tocar OpenAI ni Spotify.
 *
 * Uso: npm run test:musica-descubrimiento
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { MusicaTrack } from '../src/app/database/entities/musica/musica-track.entity';
import { MusicaVeto } from '../src/app/database/entities/musica/musica-veto.entity';
import { BloqueProgramacion } from '../src/app/database/entities/musica/bloque-programacion.entity';
import { EstadoTrack, TipoVeto } from '../src/app/database/entities/musica/musica-enums';
import {
  sembrarCatalogo,
  reclasificarPool,
  listarEstilos,
  guardarMezcla,
  setPreferenciaEstilo,
  vetarEstilo,
} from '../electron/services/musica-estilos.service';
import {
  construirContexto,
  construirPrompt,
  construirPromptDirigido,
} from '../electron/services/musica-descubrimiento.service';

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

function track(
  ds: DataSource,
  datos: { spotifyId: string; titulo: string; artista: string; artistaId?: string; genero?: string },
): MusicaTrack {
  return ds.getRepository(MusicaTrack).create({
    spotifyId: datos.spotifyId,
    titulo: datos.titulo.toUpperCase(),
    artista: datos.artista.toUpperCase(),
    artistaId: datos.artistaId,
    genero: datos.genero,
    duracionMs: 210_000,
    estado: EstadoTrack.APROBADO,
  });
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-musica-descubrimiento.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const ds = new DataSource({
    ...(getDataSourceOptions(tmpDir) as any),
    database: dbFile,
    synchronize: false,
    migrationsRun: false,
  });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[musica-descubrimiento] Migraciones OK.\n');

  // ─────────── Repertorio desbalanceado, como el real ───────────
  // Mucha bossa, casi nada de pagode: es exactamente la forma que tenía el
  // repertorio de producción y la que el descubridor no sabía corregir.
  await ds.getRepository(MusicaTrack).save([
    track(ds, { spotifyId: 'b1', titulo: 'Corcovado', artista: 'Joao Gilberto', artistaId: 'a1', genero: 'BOSSA NOVA' }),
    track(ds, { spotifyId: 'b2', titulo: 'Insensatez', artista: 'Tom Jobim', artistaId: 'a2', genero: 'BOSSA NOVA' }),
    track(ds, { spotifyId: 'b3', titulo: 'Wave', artista: 'Toquinho', artistaId: 'a3', genero: 'MPB' }),
    track(ds, { spotifyId: 'b4', titulo: 'Aguas', artista: 'Elis Regina', artistaId: 'a4', genero: 'MPB' }),
    track(ds, { spotifyId: 'p1', titulo: 'Deixa Acontecer', artista: 'Revelacao', artistaId: 'a5', genero: 'PAGODE' }),
  ]);
  await sembrarCatalogo(ds);
  await reclasificarPool(ds);

  const estilos = await listarEstilos(ds);
  const bossa = estilos.find((e) => e.nombre === 'BOSSA / MPB')!;
  const pagode = estilos.find((e) => e.nombre === 'PAGODE')!;
  const electronica = estilos.find((e) => e.nombre === 'ELECTRONICA')!;

  // Bloque de 4 h que pide mitad pagode: con un solo tema, el déficit es grande.
  const bloque = await ds.getRepository(BloqueProgramacion).save(
    ds.getRepository(BloqueProgramacion).create({
      diaSemana: 3,
      nombre: 'ALMUERZO',
      horaDesde: '11:00',
      horaHasta: '15:00',
      energia: 3,
      volumen: 45,
      activo: true,
      orden: 0,
      evitarArtistaConsecutivo: true,
      generosPreferidos: ['ALGO VIEJO DE TEXTO LIBRE'],
      notas: 'familias con chicos',
    }),
  );
  await guardarMezcla(ds, bloque.id, [
    { estiloId: pagode.id, porcentaje: 50 },
    { estiloId: bossa.id, porcentaje: 30 },
  ]);

  // ─────────── El contexto ve el catálogo ───────────
  console.log('construirContexto');
  let ctx = await construirContexto(ds, null, 1.5);

  ok(ctx.faltantes.length > 0, 'el déficit por estilo llega al contexto', ctx.faltantes);
  ok(
    ctx.faltantes[0].estiloNombre === 'PAGODE',
    'lo que más falta encabeza la lista',
    ctx.faltantes.map((f) => f.estiloNombre),
  );
  ok(
    ctx.faltantes[0].tracksDisponibles === 1,
    'informa cuánto hay hoy, no sólo cuánto falta',
    ctx.faltantes[0],
  );
  ok(ctx.bloques.length === 1, 'los bloques activos siguen en el contexto');

  // ─────────── El voto ───────────
  console.log('\nvoto del dueño');
  await setPreferenciaEstilo(ds, bossa.id, 1);
  await setPreferenciaEstilo(ds, electronica.id, -1);
  ctx = await construirContexto(ds, null, 1.5);
  ok(ctx.estilosQueGustan.includes('BOSSA / MPB'), 'el pulgar arriba llega al contexto');
  ok(ctx.estilosQueGustanMenos.includes('ELECTRONICA'), 'el pulgar abajo también');

  // ─────────── El estilo apagado ───────────
  console.log('\nestilo apagado');
  await vetarEstilo(ds, electronica.id, true);
  ctx = await construirContexto(ds, null, 1.5);
  ok(ctx.estilosVetados.includes('ELECTRONICA'), 'el estilo apagado llega como prohibido');
  ok(
    !ctx.estilosQueGustanMenos.includes('ELECTRONICA'),
    'y deja de figurar como "gusta menos": prohibido gana sobre desaconsejado',
  );

  // Un estilo apagado no puede pedir material: sería gastar la ronda en música
  // que nunca va a sonar.
  await guardarMezcla(ds, bloque.id, [
    { estiloId: pagode.id, porcentaje: 50 },
    { estiloId: electronica.id, porcentaje: 40 },
  ]);
  ctx = await construirContexto(ds, null, 1.5);
  ok(
    !ctx.faltantes.some((f) => f.estiloNombre === 'ELECTRONICA'),
    'un estilo apagado no aparece en lo que falta, aunque tenga cuota',
    ctx.faltantes.map((f) => f.estiloNombre),
  );
  await vetarEstilo(ds, electronica.id, false);
  await guardarMezcla(ds, bloque.id, [
    { estiloId: pagode.id, porcentaje: 50 },
    { estiloId: bossa.id, porcentaje: 30 },
  ]);

  // ─────────── Los vetos clásicos siguen funcionando ───────────
  console.log('\nvetos de género y artista');
  const vetoRepo = ds.getRepository(MusicaVeto);
  await vetoRepo.save([
    vetoRepo.create({ tipo: TipoVeto.GENERO, valor: 'REGGAETON', activo: true }),
    vetoRepo.create({ tipo: TipoVeto.ARTISTA, valor: 'xyz', etiqueta: 'ARTISTA MALO', activo: true }),
  ]);
  ctx = await construirContexto(ds, null, 1.5);
  ok(ctx.generosVetados.includes('REGGAETON'), 'el veto por género sigue llegando');
  ok(ctx.artistasVetados.includes('ARTISTA MALO'), 'y el de artista usa la etiqueta legible');

  // ─────────── El prompt ───────────
  console.log('\nconstruirPrompt');
  await vetarEstilo(ds, electronica.id, true);
  ctx = await construirContexto(ds, null, 1.5);
  const prompt = construirPrompt(ctx, 40, 'Hamburguesería familiar, nada triste.');

  ok(prompt.includes('LO QUE MAS FALTA'), 'el prompt abre por lo que falta');
  ok(prompt.includes('PAGODE'), 'nombra el estilo en déficit');
  ok(
    prompt.indexOf('LO QUE MAS FALTA') < prompt.indexOf('MOMENTOS DEL DIA'),
    'el déficit va ANTES de los bloques: es lo que tiene que priorizar',
  );
  ok(prompt.includes('Hamburguesería familiar'), 'incluye el brief');
  ok(prompt.includes('LO QUE MAS LE GUSTA: BOSSA / MPB'), 'incluye el voto positivo');
  ok(
    prompt.includes('Estilos que el local apago: ELECTRONICA'),
    'el estilo apagado va en la sección PROHIBIDO',
  );
  ok(prompt.includes('REGGAETON'), 'los géneros vetados siguen prohibidos');
  ok(prompt.includes('local familiar'), 'las reglas fijas siguen ahí');
  ok(prompt.includes('40 canciones'), 'pide la cantidad indicada');

  // Sin déficit el prompt no tiene que inventar una sección vacía: un
  // encabezado sin ítems le dice al modelo que no falta nada y es peor que
  // omitirlo.
  const sinFaltantes = construirPrompt({ ...ctx, faltantes: [] }, 10);
  ok(
    !sinFaltantes.includes('LO QUE MAS FALTA'),
    'sin déficit, la sección no se emite vacía',
  );

  // ─────────── Fuentes dirigidas ───────────
  //
  // El punto de elegir una fuente explícita es que el criterio acumulado NO
  // mande: si el déficit siguiera entrando, pedir "covers de bossa" con el
  // pagode en rojo devolvería pagode, que es exactamente el problema.
  console.log('\nconstruirPromptDirigido');
  const dirigido = construirPromptDirigido(ctx, 20, {
    titulo: 'LO QUE TE PIDE:',
    detalle: ['covers de rock clasico en version bossa'],
  });

  ok(dirigido.includes('covers de rock clasico'), 'el pedido va literal al prompt');
  ok(!dirigido.includes('LO QUE MAS FALTA'), 'el déficit NO entra: taparía el pedido');
  ok(!dirigido.includes('MOMENTOS DEL DIA'), 'la grilla tampoco');
  ok(!dirigido.includes('LO QUE MAS LE GUSTA'), 'ni los votos');

  // Las prohibiciones sí quedan: proponer un artista vetado gasta llamadas a
  // Spotify y el filtro lo descarta igual, así que omitirlas sería sólo ruido.
  ok(dirigido.includes('REGGAETON'), 'los géneros vetados siguen prohibidos');
  ok(dirigido.includes('ARTISTA MALO'), 'los artistas vetados también');
  ok(dirigido.includes('ELECTRONICA'), 'y los estilos apagados');
  ok(dirigido.includes('local familiar'), 'la regla de contenido explícito se mantiene');

  ok(
    dirigido.includes('devolvé menos'),
    'pide devolver menos antes que rellenar con otra cosa',
  );
  ok(dirigido.includes('20 canciones'), 'respeta la cantidad');

  await ds.destroy();
  console.log(`\n${passed} pasaron, ${failed} fallaron`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FALLO:', e);
  process.exit(1);
});
