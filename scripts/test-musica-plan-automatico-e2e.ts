/**
 * E2E: generación automática del plan del día.
 *
 * POR QUE EXISTE: ya había generación automática, pero PEREZOSA — dentro de
 * `getPlanBloque`, o sea recién cuando el runtime necesita reproducir y estando
 * dentro de un bloque horario. Si el local abre a las 09:00 y el primer bloque
 * arranca a las 11:00, el plan se generaba a las 11:00, que es justo cuando ya
 * tiene que sonar; y `generarPlanDelDia` llama a OpenAI y crea hasta 15
 * playlists, así que tarda minutos.
 *
 * Este test cubre las GUARDAS y la idempotencia, que es lo que evita gastar
 * llamadas a OpenAI y pisar playlists de un día que ya empezó a sonar. La
 * generación real necesita Spotify y OpenAI, así que no se ejercita acá.
 *
 * Uso: npm run test:musica-plan-automatico
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { MusicaTrack } from '../src/app/database/entities/musica/musica-track.entity';
import { BloqueProgramacion } from '../src/app/database/entities/musica/bloque-programacion.entity';
import { PlanProgramacion } from '../src/app/database/entities/musica/plan-programacion.entity';
import { EstadoTrack, OrigenPlan } from '../src/app/database/entities/musica/musica-enums';
import { readAppSettings, writeAppSettings } from '../electron/utils/app-settings.utils';
import { asegurarPlanDelDia, fechaLocalHoy } from '../electron/services/musica-planner.service';

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

function setHabilitado(userDataPath: string, habilitado: boolean): void {
  const s = readAppSettings(userDataPath);
  writeAppSettings(userDataPath, { ...s, musica: { ...s.musica, habilitado } });
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp/plan-automatico');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-musica-plan.db');

  const ds = new DataSource({
    ...(getDataSourceOptions(tmpDir) as any),
    database: dbFile,
    synchronize: false,
    migrationsRun: false,
  });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[musica-plan-automatico] Migraciones OK.\n');

  const hoy = fechaLocalHoy();
  ok(/^\d{4}-\d{2}-\d{2}$/.test(hoy), 'fechaLocalHoy devuelve YYYY-MM-DD');
  // La fecha se calcula en hora LOCAL: con toISOString(), en Paraguay (UTC-3)
  // el plan de las 21:00 del sábado se guardaría como domingo y el local
  // sonaría con la grilla equivocada toda la noche.
  const local = new Date();
  ok(
    Number(hoy.slice(8, 10)) === local.getDate(),
    'y usa el día LOCAL, no el UTC',
    { hoy, local: local.getDate() },
  );

  // ─────────── Guardas, en orden de costo ───────────
  console.log('\nguardas');

  setHabilitado(tmpDir, false);
  let r = await asegurarPlanDelDia(ds, tmpDir, hoy);
  ok(!r.generado && !!r.motivo?.includes('DESHABILITADO'), 'no genera si el módulo está apagado', r);

  setHabilitado(tmpDir, true);
  r = await asegurarPlanDelDia(ds, tmpDir, hoy);
  ok(!r.generado && !!r.motivo?.includes('BLOQUES'), 'no genera sin bloques para hoy', r);

  // Bloque para HOY, sea el día que sea cuando corra el test.
  const diaSemana = new Date(`${hoy}T12:00:00`).getDay();
  await ds.getRepository(BloqueProgramacion).save(
    ds.getRepository(BloqueProgramacion).create({
      diaSemana,
      nombre: 'ALMUERZO',
      horaDesde: '11:00',
      horaHasta: '15:00',
      energia: 3,
      volumen: 45,
      activo: true,
      orden: 0,
      evitarArtistaConsecutivo: true,
    }),
  );

  r = await asegurarPlanDelDia(ds, tmpDir, hoy);
  ok(!r.generado && !!r.motivo?.includes('APROBADO'), 'no genera con el repertorio vacío', r);

  await ds.getRepository(MusicaTrack).save(
    ds.getRepository(MusicaTrack).create({
      spotifyId: 't1',
      titulo: 'CORCOVADO',
      artista: 'JOAO GILBERTO',
      duracionMs: 210_000,
      estado: EstadoTrack.APROBADO,
    }),
  );

  // Con todo lo de base en su lugar quedan las dos guardas de Spotify, que se
  // pierden por separado: el client id vive en app-settings y el refresh token
  // en keytar. Sin client id tiene que frenar acá y NO tirar — que el local no
  // haya terminado de configurar Spotify no es un error del sistema.
  //
  // Esta guarda apareció justamente al escribir el test: en una máquina con un
  // refresh token viejo en el keychain, `estaConectado()` daba true y la
  // función explotaba desde el fondo de `spotifyApi`.
  r = await asegurarPlanDelDia(ds, tmpDir, hoy);
  ok(
    !r.generado && !!r.motivo?.includes('CLIENT ID'),
    'frena sin client id, y devuelve el motivo en vez de tirar',
    r,
  );

  // ─────────── Idempotencia ───────────
  //
  // Es la garantía que importa: regenerar pisaría las playlists de un día que
  // quizá ya empezó a sonar, y gastaría una llamada a OpenAI por cada arranque
  // de la app.
  console.log('\nidempotencia');
  await ds.getRepository(PlanProgramacion).save(
    ds.getRepository(PlanProgramacion).create({
      fecha: hoy,
      origen: OrigenPlan.REGLAS,
      activo: true,
    }),
  );

  r = await asegurarPlanDelDia(ds, tmpDir, hoy);
  ok(!r.generado, 'con plan existente no genera de nuevo');
  ok(r.motivo === 'YA HAY PLAN PARA HOY.', 'y lo dice explícitamente', r.motivo);

  ok(
    (await ds.getRepository(PlanProgramacion).count({ where: { fecha: hoy } })) === 1,
    'no duplica el plan de la fecha',
  );

  // La guarda de "ya hay plan" corre ANTES que la de Spotify: si no, un local
  // con el plan hecho y Spotify caído reportaría un error que no existe.
  ok(
    !r.motivo?.includes('SPOTIFY'),
    'la guarda de plan existente gana sobre la de Spotify',
    r.motivo,
  );

  // Mañana es otro día: el plan de hoy no lo cubre.
  const manana = new Date(`${hoy}T12:00:00`);
  manana.setDate(manana.getDate() + 1);
  const fechaManana = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;
  r = await asegurarPlanDelDia(ds, tmpDir, fechaManana);
  ok(r.motivo !== 'YA HAY PLAN PARA HOY.', 'el plan de hoy no cuenta como plan de mañana', r);

  await ds.destroy();
  console.log(`\n${passed} pasaron, ${failed} fallaron`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FALLO:', e);
  process.exit(1);
});
