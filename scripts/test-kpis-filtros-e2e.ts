/**
 * E2E: filtros del resumen de ventas (`get-dashboard-ventas-kpis`).
 *
 * Cubre lo que motivó la feature y lo que casi la rompe:
 *  - La jornada comercial: una venta de la 01:30 pertenece a la jornada del día
 *    ANTERIOR. Con corte a medianoche, medio turno noche caía en el día
 *    siguiente y el usuario veía dos días partidos donde hubo un solo turno.
 *  - Fechas y cajas se COMBINAN (AND). Al elegir las dos, cada una acota; no se
 *    pisan ni se convierten en OR.
 *  - `YYYY-MM-DD` se interpreta como fecha LOCAL. `new Date('2026-07-15')` es
 *    UTC-medianoche: en Paraguay eso es el 14 a la noche y el rango entero
 *    corría un día.
 *  - El string suelto (`'today'`) sigue funcionando: el default histórico se
 *    preserva por AUSENCIA de filtro, no por la forma del argumento.
 *  - `get-cajas-selector` devuelve sólo lo que el selector muestra.
 *
 * Uso: npm run test:kpis-filtros
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import {
  getInicioJornada,
  invalidarCacheJornada,
  registerDashboardVentasHandlers,
} from '../electron/handlers/dashboard-ventas.handler';
import { registerFinancieroHandlers } from '../electron/handlers/financiero.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/**
 * Con filtro explícito, `totalHoyPYG`/`ventasHoy` YA no son "hoy": son el total
 * del período pedido. El nombre quedó del contrato original y se mantiene por
 * compatibilidad con el desktop y la home.
 */

/**
 * `created_at` tal como lo escribe TypeORM en SQLite: `YYYY-MM-DD HH:MM:SS` en
 * UTC, sin `T` ni `Z` (el literal `datetime('now')`).
 *
 * Sellar las ventas con un ISO cualquiera haria pasar el test por la razon
 * equivocada: el bug que se protege es justamente que ese formato y el
 * `toISOString()` de los limites no se comparan bien como texto.
 */
function comoLoGuardaSqlite(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-kpis-filtros.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[kpis-filtros] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const save = (ent: any, data: any) =>
    ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);
  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });

  // La jornada arranca a las 07:00 (el default que se despacha encendido).
  await ds.query(
    `INSERT INTO pdv_config (id, inicio_jornada_hora, created_at, updated_at, activo)
     VALUES (1, 7, ?, ?, 1)`,
    [comoLoGuardaSqlite(new Date()), comoLoGuardaSqlite(new Date())],
  ).catch(async () => {
    // pdv_config puede tener otras columnas NOT NULL segun la migracion vigente.
    await ds.query(`INSERT INTO pdv_config (id, inicio_jornada_hora) VALUES (1, 7)`);
  });

  const monedaPrincipal: any = await save(E('financiero/moneda.entity').Moneda, {
    denominacion: 'GUARANI', simbolo: 'GS', principal: true, activo: true,
  });
  const disp1: any = await save(E('financiero/dispositivo.entity').Dispositivo, {
    nombre: 'CAJA 1', isCaja: true, isVenta: true, activo: true,
  });
  const disp2: any = await save(E('financiero/dispositivo.entity').Dispositivo, {
    nombre: 'CAJA 2', isCaja: true, isVenta: true, activo: true,
  });
  const { CajaEstado } = E('financiero/caja.entity');
  // `conteo_apertura_id` es NOT NULL: toda caja nace de un conteo.
  const conteo = () => save(E('financiero/conteo.entity').Conteo, { activo: true });
  const caja1: any = await save(E('financiero/caja.entity').Caja, {
    dispositivo: disp1, fechaApertura: new Date(), estado: CajaEstado.CERRADO,
    conteoApertura: await conteo(), activo: true,
  });
  const caja2: any = await save(E('financiero/caja.entity').Caja, {
    dispositivo: disp2, fechaApertura: new Date(), estado: CajaEstado.CERRADO,
    conteoApertura: await conteo(), activo: true,
  });

  /**
   * Venta CONCLUIDA de `monto` en `caja`, sellada en `cuando`.
   *
   * `created_at` se pisa con UPDATE porque BaseModel la escribe sola: sin eso no
   * hay forma de poner una venta a la 01:30 de un día concreto, que es
   * exactamente el caso que la jornada existe para resolver.
   */
  let seq = 0;
  const ventaEn = async (cuando: Date, caja: any, monto: number) => {
    seq++;
    const pago: any = await save(E('compras/pago.entity').Pago, { activo: true });
    await save(E('compras/pago-detalle.entity').PagoDetalle, {
      pago, moneda: monedaPrincipal, valor: monto, tipo: 'PAGO',
      descripcion: 'EFECTIVO', activo: true,
    });
    const venta: any = await save(E('ventas/venta.entity').Venta, {
      estado: 'CONCLUIDA', caja, pago, total: monto, activo: true,
    });
    await ds.query(`UPDATE ventas SET created_at = ? WHERE id = ?`, [comoLoGuardaSqlite(cuando), venta.id]);
    return venta;
  };

  registerDashboardVentasHandlers(ds, () => admin);
  registerFinancieroHandlers(ds, () => admin);

  // ── Escenario: el turno noche del 15/Jul cruza la medianoche ──
  //   15/Jul 20:00 caja1 · 100.000  → jornada del 15
  //   16/Jul 01:30 caja1 ·  50.000  → jornada del 15 (¡pasada la medianoche!)
  //   16/Jul 10:00 caja2 ·  70.000  → jornada del 16
  await ventaEn(new Date(2026, 6, 15, 20, 0, 0), caja1, 100_000);
  await ventaEn(new Date(2026, 6, 16, 1, 30, 0), caja1, 50_000);
  await ventaEn(new Date(2026, 6, 16, 10, 0, 0), caja2, 70_000);

  console.log('\n[0] el sellado del test coincide con lo que escribe BaseModel');
  {
    // Si TypeORM cambiara de formato, el resto del archivo seguiria pasando
    // mientras prueba algo que ya no ocurre en la app. Esto lo ancla.
    const nativo: any[] = await ds.query(`SELECT created_at FROM pagos ORDER BY id LIMIT 1`);
    const sembrado: any[] = await ds.query(`SELECT created_at FROM ventas ORDER BY id LIMIT 1`);
    const forma = (v: string) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(v));
    ok(forma(nativo[0]?.created_at), 'BaseModel escribe `YYYY-MM-DD HH:MM:SS`', nativo[0]);
    ok(forma(sembrado[0]?.created_at), 'el test sella con el mismo formato', sembrado[0]);
  }

  const kpis = (p: any) => invokeHandler('get-dashboard-ventas-kpis', p) as Promise<any>;

  console.log('\n[A] jornada comercial · el turno que cruza medianoche es UN día');
  {
    const r = await kpis({ desde: '2026-07-15', hasta: '2026-07-15' });
    ok(r.totalHoyPYG === 150_000,
       'el 15 suma las 20:00 y la 01:30 del 16 (150.000)', r.totalHoyPYG);
  }
  {
    const r = await kpis({ desde: '2026-07-16', hasta: '2026-07-16' });
    ok(r.totalHoyPYG === 70_000,
       'el 16 NO se lleva la venta de la 01:30 (70.000)', r.totalHoyPYG);
  }

  console.log('\n[B] fecha local, no UTC');
  {
    // Con parseo UTC, '2026-07-15' caeria el 14 y esta ventana daria 0.
    const r = await kpis({ desde: '2026-07-15', hasta: '2026-07-15' });
    ok(r.totalHoyPYG > 0, 'YYYY-MM-DD se interpreta como fecha local', r.totalHoyPYG);
  }

  console.log('\n[C] fechas Y cajas se combinan (AND)');
  {
    const r = await kpis({ desde: '2026-07-15', hasta: '2026-07-16', cajaIds: [caja1.id] });
    ok(r.totalHoyPYG === 150_000, 'periodo amplio + caja1 → sólo caja1 (150.000)', r.totalHoyPYG);
  }
  {
    const r = await kpis({ desde: '2026-07-16', hasta: '2026-07-16', cajaIds: [caja1.id] });
    ok(r.totalHoyPYG === 0, 'el 16 en caja1 no tiene ventas (la 01:30 es del 15)', r.totalHoyPYG);
  }
  {
    const r = await kpis({ desde: '2026-07-15', hasta: '2026-07-16', cajaIds: [caja1.id, caja2.id] });
    ok(r.totalHoyPYG === 220_000, 'multi-caja suma las dos (220.000)', r.totalHoyPYG);
  }

  console.log('\n[D] compatibilidad: el string suelto no cambia');
  {
    const conString = await kpis('week');
    const conObjeto = await kpis({ rango: 'week' });
    ok(conString.totalHoyPYG === conObjeto.totalHoyPYG,
       `'week' == { rango: 'week' }`, [conString.totalHoyPYG, conObjeto.totalHoyPYG]);
    ok(conString.filtroAplicado === null, 'sin filtro explícito, filtroAplicado = null', conString.filtroAplicado);
  }
  {
    const r = await kpis({ desde: '2026-07-15', hasta: '2026-07-15' });
    ok(!!r.filtroAplicado, 'con fechas, filtroAplicado informa la ventana', r.filtroAplicado);
    ok(typeof r.inicioJornada === 'number', 'la respuesta informa el inicio de jornada', r.inicioJornada);
  }

  console.log('\n[E] selector de cajas');
  {
    const cajas: any[] = await invokeHandler('get-cajas-selector', {}) as any;
    ok(Array.isArray(cajas) && cajas.length === 2, 'devuelve las 2 cajas', cajas?.length);
    const c = cajas.find((x) => x.id === caja1.id);
    ok(!!c && c.dispositivoNombre === 'CAJA 1', 'trae el nombre del dispositivo', c);
    ok(!!c && !('conteoApertura' in c), 'NO arrastra los conteos (payload liviano)', Object.keys(c || {}));
  }
  {
    const cajas: any[] = await invokeHandler('get-cajas-selector', { limite: 1 }) as any;
    ok(cajas.length === 1, 'respeta el límite', cajas.length);
  }

  console.log('\n[G] el chart sigue la ventana pedida, no el preset');
  {
    // Las cards usaban la ventana y el chart el preset (`week` por default):
    // filtrar julio mostraba las cards de julio con un chart de la semana
    // actual, en cero. Es el desfase card/chart que la feature dice corregir.
    const r = await kpis({ desde: '2026-07-15', hasta: '2026-07-16' });
    const serie = r.ventasPorPeriodo;
    ok(!!serie && serie.labels.length > 0, 'la serie tiene tramos', serie?.labels);
    const sumaBarras = (serie.ventas || []).reduce((a: number, b: number) => a + b, 0);
    ok(sumaBarras === r.totalHoyPYG,
       'la suma de las barras cierra con el total de la card',
       { sumaBarras, card: r.totalHoyPYG });
    ok(serie.labels.some((l: string) => l.includes('7')),
       'los tramos son de julio, no de la semana actual', serie.labels);
  }
  {
    // Rango largo: la granularidad baja pero el invariante se mantiene.
    const r = await kpis({ desde: '2026-05-01', hasta: '2026-07-31' });
    const suma = (r.ventasPorPeriodo.ventas || []).reduce((a: number, b: number) => a + b, 0);
    ok(suma === r.totalHoyPYG, 'rango largo: barras == card', { suma, card: r.totalHoyPYG });
  }

  console.log('\n[H] filtrar SOLO por caja no se acota ademas a hoy');
  {
    // El selector ofrece cajas viejas. Elegir una y aplicar sin fechas cruzaba
    // la caja con la ventana de "hoy" y devolvia cero, con el cartel
    // "No hubo ventas en el periodo" — falso, la caja si tuvo ventas.
    const r = await kpis({ cajaIds: [caja1.id] });
    ok(r.totalHoyPYG === 150_000,
       'caja1 sola devuelve sus 150.000 aunque sean de julio', r.totalHoyPYG);
    // El rotulo no puede anunciar una ventana que no se aplico.
    ok(r.filtroAplicado?.desde === null && r.filtroAplicado?.hasta === null,
       'sin fechas, filtroAplicado NO inventa un periodo', r.filtroAplicado);
    ok(r.filtroAplicado?.cajaIds?.length === 1, 'pero si informa la caja', r.filtroAplicado);
  }
  {
    const r = await kpis({ cajaIds: [caja1.id, caja2.id] });
    ok(r.totalHoyPYG === 220_000, 'las dos cajas solas suman 220.000', r.totalHoyPYG);
  }
  {
    // Con fechas SI se acota: la caja no anula el periodo.
    const r = await kpis({ desde: '2026-07-16', hasta: '2026-07-16', cajaIds: [caja1.id] });
    ok(r.totalHoyPYG === 0, 'caja1 el 16 no tiene ventas (la 01:30 es del 15)', r.totalHoyPYG);
  }

  console.log('\n[I] medio rango no devuelve vacio en silencio');
  {
    // Solo `hasta`: el fallback de `desde` es el preset, que arranca HOY, asi
    // que la ventana quedaba invertida y el SQL siempre falso.
    const r = await kpis({ hasta: '2026-07-16' });
    const f = r.filtroAplicado;
    ok(new Date(f.desde) <= new Date(f.hasta),
       'la ventana nunca queda invertida', { desde: f.desde, hasta: f.hasta });
  }

  console.log('\n[F] el cambio de configuración se ve enseguida');
  {
    // `getInicioJornada` cachea 60s. Sin invalidar, el usuario cambia el corte,
    // vuelve al resumen y sigue viendo el anterior durante un minuto.
    ok((await getInicioJornada(ds)) === 7, 'arranca en 7');
    await ds.query(`UPDATE pdv_config SET inicio_jornada_hora = 5`);
    ok((await getInicioJornada(ds)) === 7, 'sin invalidar, sigue el valor cacheado');
    invalidarCacheJornada();
    ok((await getInicioJornada(ds)) === 5, 'tras invalidar, toma el nuevo valor');
    await ds.query(`UPDATE pdv_config SET inicio_jornada_hora = 7`);
    invalidarCacheJornada();
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} KPIS FILTROS: ${passed} OK, ${failed} fallos.\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
