/**
 * E2E del motor de métricas de delivery (`reportes-delivery.helper.ts`).
 *
 * Contra SQLite con migraciones reales: KPIs de envíos/retiros, mix por canal,
 * zonas, repartidores, tiempos y SLA, cancelaciones, cobro anticipado, origen
 * del reparto, el bloque del cierre de caja y el comparativo del reporte.
 *
 * Dos invariantes que valen más que el resto y por eso tienen assert propio:
 *
 *  · **la suma del mix por canal es la facturación del reporte** — si un canal
 *    contara de más o de menos, la dona diría una cosa y el KPI otra;
 *  · **una venta cancelada no aparece en ninguna métrica salvo la de
 *    cancelaciones** — es la única que mira ventas CANCELADAS.
 *
 * Uso: npm run test:reporte-delivery
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { construirReporteVentasCierre } from '../electron/handlers/reportes-ventas.helper';
import { resolverPeriodo } from '../electron/handlers/reportes-periodo.util';
import {
  construirBloqueDelivery, resumenDeliveryCaja, deliveriesEnCamino, CotizacionCtx,
  ZONA_SIN_ASIGNAR,
} from '../electron/handlers/reportes-delivery.helper';
import { getMonedaPrincipalId, getCotizacionMap } from '../electron/handlers/dashboard-ventas.handler';
import { CanalVenta } from '../electron/utils/canal-venta.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/** Formato en que TypeORM escribe `created_at` en SQLite: `YYYY-MM-DD HH:MM:SS` UTC. */
const sqliteTs = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

const MIN = 60000;

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-reporte-delivery.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[reporte-delivery] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaCambio } = E('financiero/moneda-cambio.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { Producto } = E('productos/producto.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { PdvConfig } = E('ventas/pdv-config.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { Pago } = E('compras/pago.entity');
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { PrecioDelivery } = E('ventas/precio-delivery.entity');
  const { Delivery } = E('ventas/delivery.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cargo } = E('rrhh/cargo.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Usuario } = E('personas/usuario.entity');

  const save = (ent: any, data: any) =>
    ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // ── Catálogos ────────────────────────────────────────────────────────────
  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true });
  const usd: any = await save(Moneda, { denominacion: 'DOLAR', simbolo: 'US$', principal: false, decimales: 2, activo: true });
  await save(MonedaCambio, {
    monedaOrigen: usd, monedaDestino: pyg,
    compraOficial: 7000, ventaOficial: 7200, compraLocal: 7000, ventaLocal: 7200, activo: true,
  });
  const efectivo: any = await save(FormasPago, { nombre: 'EFECTIVO', activo: true, movimentaCaja: true });
  const producto: any = await save(Producto, { nombre: 'PIZZA', activo: true, tipo: 'RETAIL' });
  const mesa: any = await save(PdvMesa, { numero: 1, activo: true });
  await save(PdvConfig, { cantidad_mesas: 1, deliveryTiempoAmarillo: 30, deliveryTiempoRojo: 60 });

  const zonaCentro: any = await save(PrecioDelivery, { descripcion: 'CENTRO', valor: 15000, activo: true });
  const zonaSur: any = await save(PrecioDelivery, { descripcion: 'SUR', valor: 20000, activo: true });

  const cargo: any = await save(Cargo, { nombre: 'REPARTIDOR', activo: true });
  const repartidor: any = await save(Funcionario, {
    persona: await save(Persona, { nombre: 'JUAN PEREZ' }),
    cargo, fechaIngreso: '2026-01-01', activo: true,
  });

  const usuario: any = await save(Usuario, { nickname: 'cajero', password: 'x', activo: true });
  const dispositivo: any = await save(Dispositivo, { nombre: 'CAJA-1', activo: true });
  const caja: any = await save(Caja, {
    estado: 'ABIERTO', activo: true, fechaApertura: new Date(), createdBy: usuario,
    dispositivo, conteoApertura: await save(Conteo, {}),
  });

  const ahora = new Date();

  /**
   * Crea una venta con su pago. `etapas` son minutos relativos al alta del
   * reparto; se sellan como los timestamps de la máquina de estados.
   */
  const mkVenta = async (o: {
    conMesa?: boolean;
    modo?: 'DELIVERY' | 'RETIRO';
    zona?: any;
    repartidor?: any;
    costoDelivery?: number | null;
    monto: number;
    moneda?: any;
    itemMonto?: number;
    cancelada?: boolean;
    cobroAnticipado?: boolean;
    canalOrigen?: string;
    estadoDelivery?: string;
    etapas?: { paraEntrega?: number; enCamino?: number; entregado?: number };
    createdAt?: Date;
    conCaja?: boolean;
  }) => {
    let delivery: any = null;
    if (o.modo) {
      delivery = await save(Delivery, {
        nombre: 'CLIENTE', telefono: '0981', modo: o.modo,
        estado: o.estadoDelivery ?? (o.cancelada ? 'CANCELADO' : 'ENTREGADO'),
        fechaAbierto: ahora, cobroAnticipado: !!o.cobroAnticipado,
        precioDelivery: o.zona ?? undefined,
        entregadoPorFuncionario: o.repartidor ?? undefined,
        motivoCancelacion: o.cancelada ? 'CLIENTE NO ATENDIO' : undefined,
      });
      const e = o.etapas;
      if (e) {
        const t = (m?: number) => (m == null ? null : sqliteTs(new Date(ahora.getTime() + m * MIN)));
        await ds.query(
          `UPDATE deliveries SET fecha_abierto = ?, fecha_para_entrega = ?, fecha_en_camino = ?, fecha_entregado = ? WHERE id = ?`,
          [sqliteTs(ahora), t(e.paraEntrega), t(e.enCamino), t(e.entregado), delivery.id],
        );
      }
    }

    const venta: any = await save(Venta, {
      estado: o.cancelada ? 'CANCELADA' : 'CONCLUIDA',
      mesa: o.conMesa ? mesa : undefined,
      delivery: delivery ?? undefined,
      costoDelivery: o.costoDelivery ?? null,
      canalOrigen: o.canalOrigen ?? 'LOCAL',
      caja: o.conCaja === false ? undefined : caja,
    });

    await save(VentaItem, {
      venta, producto, cantidad: 1,
      precioVentaUnitario: o.itemMonto ?? o.monto, precioCostoUnitario: 0,
      estado: o.cancelada ? 'CANCELADO' : 'ACTIVO',
    });

    // Una venta cancelada tiene sus líneas de cobro desactivadas (`activo=false`),
    // igual que las deja `cancelarVentaCompletaEnTx`. Sellarlas activas haría
    // pasar el test por la razón equivocada.
    const pago: any = await save(Pago, { estado: 'ABIERTO', activo: true });
    await save(PagoDetalle, {
      valor: o.monto, descripcion: 'PAGO', tipo: 'PAGO', pago,
      moneda: o.moneda ?? pyg, formaPago: efectivo, activo: !o.cancelada,
    });
    venta.pago = pago;
    await ds.getRepository(Venta).save(venta);

    await ds.query(`UPDATE ventas SET created_at = ? WHERE id = ?`,
      [sqliteTs(o.createdAt ?? ahora), venta.id]);
    return venta;
  };

  // ── Escenario ────────────────────────────────────────────────────────────
  await mkVenta({ conMesa: true, monto: 50000 });                                    // SALÓN
  await mkVenta({ monto: 30000 });                                                   // MOSTRADOR
  // Tres repartos entregados, uno por franja del semáforo (30 / 60 min).
  await mkVenta({                                                                    // DELIVERY verde (20 min)
    modo: 'DELIVERY', zona: zonaCentro, repartidor, costoDelivery: 15000, monto: 45000,
    etapas: { paraEntrega: 5, enCamino: 8, entregado: 20 },
  });
  await mkVenta({                                                                    // DELIVERY amarillo (40 min)
    modo: 'DELIVERY', zona: zonaCentro, repartidor, costoDelivery: 15000, monto: 65000,
    cobroAnticipado: true,
    etapas: { paraEntrega: 10, enCamino: 15, entregado: 40 },
  });
  await mkVenta({                                                                    // DELIVERY rojo (70 min), sin repartidor
    modo: 'DELIVERY', zona: zonaSur, costoDelivery: 20000, monto: 100000,
    etapas: { paraEntrega: 12, enCamino: 20, entregado: 70 },
  });
  // Reparto web cobrado en USD y sin zona: prueba la conversión y el "SIN ZONA".
  await mkVenta({
    modo: 'DELIVERY', costoDelivery: 15000, monto: 10, moneda: usd, itemMonto: 70000,
    canalOrigen: 'WEB', estadoDelivery: 'EN_CAMINO',
  });
  await mkVenta({ modo: 'RETIRO', costoDelivery: 0, monto: 25000 });                 // RETIRO
  await mkVenta({                                                                    // DELIVERY cancelado
    modo: 'DELIVERY', zona: zonaCentro, costoDelivery: 15000, monto: 40000,
    itemMonto: 40000, cancelada: true,
  });

  // Un reparto en el período de comparación. Se ubica con `resolverPeriodo` y no
  // con "hace 35 días" para que el test no dependa del día del mes en que corra:
  // a principio de mes, 35 días atrás cae DOS meses antes y la comparación
  // quedaría vacía sin que nadie se entere.
  const periodo = resolverPeriodo({ rango: 'month', comparar: true }, ahora, 0);
  const medioAnterior = new Date(
    (periodo.anterior!.desde.getTime() + periodo.anterior!.hasta.getTime()) / 2,
  );
  await mkVenta({
    modo: 'DELIVERY', zona: zonaCentro, costoDelivery: 10000, monto: 20000,
    createdAt: medioAnterior,
    // Sin caja: el bloque del cierre cuenta por caja y este reparto es de otro mes.
    conCaja: false,
  });

  const ctx: CotizacionCtx = {
    monPrincipal: await getMonedaPrincipalId(ds),
    cotMap: {},
    isPg: false,
  };
  ctx.cotMap = await getCotizacionMap(ds, ctx.monPrincipal);
  ok(ctx.cotMap[usd.id] === 7000, 'cotización USD cargada (7000)', ctx.cotMap[usd.id]);

  const desde = new Date(ahora.getTime() - 2 * 60 * MIN);
  const hasta = new Date(ahora.getTime() + 2 * 60 * MIN);
  const bloque = await construirBloqueDelivery(ds, ctx, { desde, hasta }, null);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  console.log('\n[A] KPIs');
  ok(bloque.kpis.envios === 4, 'envíos = 4 (el cancelado no cuenta)', bloque.kpis.envios);
  ok(bloque.kpis.retiros === 1, 'retiros = 1', bloque.kpis.retiros);
  // 15000 + 15000 + 20000 + 15000 + 0 (el retiro) = 65000. El cancelado no suma.
  ok(bloque.kpis.ingresoEnvios === 65000, 'ingreso por envíos = 65.000', bloque.kpis.ingresoEnvios);
  // 45000 + 65000 + 100000 + (10 USD × 7000) = 280000
  ok(bloque.kpis.facturacionDelivery === 280000,
    'facturación delivery convierte el cobro en USD', bloque.kpis.facturacionDelivery);
  ok(bloque.kpis.ticketPromedioDelivery === 70000, 'ticket promedio delivery = 70.000', bloque.kpis.ticketPromedioDelivery);

  // ── Mix por canal ────────────────────────────────────────────────────────
  console.log('\n[B] Mix por canal');
  const porCanal = new Map(bloque.mixCanal.map((c) => [c.canal, c]));
  ok(bloque.mixCanal.length === 4, 'los 4 canales están presentes aunque alguno esté en cero');
  ok(porCanal.get(CanalVenta.SALON)!.facturacion === 50000, 'SALÓN 50.000', porCanal.get(CanalVenta.SALON)!.facturacion);
  ok(porCanal.get(CanalVenta.MOSTRADOR)!.facturacion === 30000, 'MOSTRADOR 30.000');
  ok(porCanal.get(CanalVenta.DELIVERY)!.tickets === 4, 'DELIVERY 4 tickets');
  ok(porCanal.get(CanalVenta.RETIRO)!.tickets === 1, 'RETIRO 1 ticket');

  // El invariante se mide sobre el MISMO período que el reporte, no sobre la
  // ventana corta de los asserts de arriba: comparar dos ventanas distintas
  // haría pasar (o fallar) el invariante por una razón que no es la suya.
  const bloqueMes = await construirBloqueDelivery(ds, ctx, periodo.actual, null);
  const sumaMix = bloqueMes.mixCanal.reduce((s, c) => s + c.facturacion, 0);
  const rep = await construirReporteVentasCierre(ds, { rango: 'month', comparar: false });
  ok(sumaMix === rep.kpis.facturacion.valor,
    'INVARIANTE: la suma del mix por canal = la facturación del reporte',
    { sumaMix, facturacion: rep.kpis.facturacion.valor });
  const sumaPct = bloque.mixCanal.reduce((s, c) => s + c.pct, 0);
  ok(Math.abs(sumaPct - 100) < 0.5, 'los porcentajes suman ~100', sumaPct);

  // ── Zonas ────────────────────────────────────────────────────────────────
  console.log('\n[C] Envíos por zona');
  const zonas = new Map(bloque.zonas.map((z) => [z.zona, z]));
  ok(zonas.get('CENTRO')?.envios === 2, 'CENTRO: 2 envíos', zonas.get('CENTRO')?.envios);
  ok(zonas.get('SUR')?.envios === 1, 'SUR: 1 envío');
  ok(zonas.get(ZONA_SIN_ASIGNAR)?.envios === 1, 'el reparto sin zona cae en SIN ZONA');
  ok(!zonas.has('CENTRO') || zonas.get('CENTRO')!.envioRecaudado === 30000,
    'CENTRO recauda 30.000 de envío', zonas.get('CENTRO')?.envioRecaudado);
  // El retiro no tiene zona; si se colara, aparecería como una zona más.
  const totalEnviosZonas = bloque.zonas.reduce((s, z) => s + z.envios, 0);
  ok(totalEnviosZonas === 4, 'las zonas sólo cuentan repartos, no retiros', totalEnviosZonas);
  ok(zonas.get('CENTRO')!.minutosPromedio === 30, 'CENTRO: 30 min promedio (20 y 40)', zonas.get('CENTRO')?.minutosPromedio);
  ok(bloque.zonas[0].zona === 'CENTRO', 'ordenado por cantidad de envíos');

  // ── Repartidores ─────────────────────────────────────────────────────────
  console.log('\n[D] Repartidores');
  const reps = new Map(bloque.repartidores.map((r) => [r.nombre, r]));
  ok(reps.get('JUAN PEREZ')?.entregas === 2, 'JUAN PEREZ: 2 entregas', reps.get('JUAN PEREZ')?.entregas);
  ok(reps.get('JUAN PEREZ')?.facturacion === 110000, 'JUAN PEREZ: 110.000', reps.get('JUAN PEREZ')?.facturacion);
  ok(reps.get('JUAN PEREZ')?.minutosPromedio === 30, 'JUAN PEREZ: 30 min promedio');
  ok(reps.get('SIN REPARTIDOR')?.entregas === 2, 'los repartos sin repartidor se agrupan aparte');

  // ── Tiempos y SLA ────────────────────────────────────────────────────────
  console.log('\n[E] Tiempos y SLA');
  const etapas = new Map(bloque.tiempos.etapas.map((e) => [e.etapa, e]));
  ok(etapas.get('TOTAL')!.muestras === 3, 'sólo entran los entregados (3 de 4)', etapas.get('TOTAL')!.muestras);
  ok(etapas.get('TOTAL')!.promedio === 43.3, 'total promedio (20+40+70)/3 = 43.3', etapas.get('TOTAL')!.promedio);
  ok(etapas.get('TOTAL')!.mediana === 40, 'total mediana = 40', etapas.get('TOTAL')!.mediana);
  ok(etapas.get('PREPARACIÓN')!.promedio === 9, 'preparación promedio (5+10+12)/3 = 9', etapas.get('PREPARACIÓN')!.promedio);
  ok(etapas.get('EN CALLE')!.promedio === 29, 'en calle promedio (12+25+50)/3 = 29', etapas.get('EN CALLE')!.promedio);
  ok(bloque.tiempos.sla.verde === 1 && bloque.tiempos.sla.amarillo === 1 && bloque.tiempos.sla.rojo === 1,
    'SLA: uno por franja con umbrales 30/60', bloque.tiempos.sla);
  ok(bloque.tiempos.umbralAmarillo === 30 && bloque.tiempos.umbralRojo === 60,
    'los umbrales salen de PdvConfig');

  // ── Cancelaciones ────────────────────────────────────────────────────────
  console.log('\n[F] Cancelaciones');
  ok(bloque.cancelaciones.cantidad === 1, 'un reparto cancelado', bloque.cancelaciones.cantidad);
  ok(bloque.cancelaciones.montoPerdido === 40000, 'monto perdido = 40.000 (ítems cancelados incluidos)',
    bloque.cancelaciones.montoPerdido);
  ok(bloque.cancelaciones.motivos[0]?.motivo === 'CLIENTE NO ATENDIO', 'el motivo se reporta',
    bloque.cancelaciones.motivos[0]);
  // 1 cancelado sobre 1 + 5 repartos concluidos (4 envíos + 1 retiro) = 16.7 %
  ok(bloque.cancelaciones.tasa === 16.7, 'tasa de cancelación = 16.7 %', bloque.cancelaciones.tasa);

  // ── Cobro anticipado y origen ────────────────────────────────────────────
  console.log('\n[G] Cobro anticipado y origen');
  ok(bloque.cobroAnticipado.anticipado === 1, 'un reparto con cobro anticipado', bloque.cobroAnticipado);
  ok(bloque.cobroAnticipado.contraEntrega === 4, 'los otros cuatro, contra entrega');
  const origen = new Map(bloque.origenRepartos.map((o) => [o.origen, o]));
  ok(origen.get('WEB')?.tickets === 1, 'un reparto entró por la tienda online');
  ok(origen.get('LOCAL')?.tickets === 4, 'los otros cuatro los cargó el cajero');

  // ── Estado operativo y cierre de caja ────────────────────────────────────
  console.log('\n[H] Operativo y cierre de caja');
  ok(await deliveriesEnCamino(ds) === 1, 'un reparto en la calle ahora mismo');

  const cierre = await resumenDeliveryCaja(ds, caja.id);
  ok(cierre.envios === 4, 'cierre: 4 envíos del turno', cierre.envios);
  ok(cierre.retiros === 1, 'cierre: 1 retiro');
  ok(cierre.cancelados === 1, 'cierre: 1 cancelado');
  ok(cierre.cobroEnvios === 65000, 'cierre: 65.000 cobrados en envíos', cierre.cobroEnvios);
  ok(cierre.anticipados === 1, 'cierre: 1 cobro anticipado');
  ok(cierre.pendientes === 1, 'cierre: 1 reparto sin entregar al cerrar', cierre.pendientes);

  // ── Integración con el reporte ───────────────────────────────────────────
  console.log('\n[I] Integración con el reporte de ventas');
  ok(rep.kpis.envios.valor === 4, 'el reporte expone los envíos como KPI', rep.kpis.envios?.valor);
  ok(rep.kpis.ingresoEnvios.valor === 65000, 'y el ingreso por envíos');
  ok(rep.kpis.envios.variacion === null, 'sin comparar → variación null');
  ok(!!rep.delivery?.zonas?.length, 'el bloque delivery viaja completo en el payload');

  const repComp = await construirReporteVentasCierre(ds, { rango: 'month', comparar: true });
  ok(repComp.delivery.kpisAnterior !== null, 'con comparar → hay KPIs del período anterior');
  ok(repComp.delivery.kpisAnterior!.envios === 1, 'el período anterior tuvo 1 envío',
    repComp.delivery.kpisAnterior?.envios);
  ok(repComp.delivery.kpisAnterior!.ingresoEnvios === 10000, 'y 10.000 de envío recaudado',
    repComp.delivery.kpisAnterior?.ingresoEnvios);
  // 4 vs 1 → +300 %. Con base 0 `variacionPct` devuelve null a propósito (no hay
  // porcentaje contra cero), así que un anterior vacío NO prueba que el cálculo
  // funcione — hace falta un período anterior con datos, que es este.
  ok(repComp.kpis.envios.variacion === 300, 'variación de envíos: 4 vs 1 = +300 %',
    repComp.kpis.envios.variacion);

  // ── Aislamiento de las canceladas ────────────────────────────────────────
  console.log('\n[J] Una venta cancelada no contamina ninguna otra métrica');
  const enviosCentro = zonas.get('CENTRO')!.envios;
  ok(enviosCentro === 2, 'CENTRO tendría 3 si contara la cancelada', enviosCentro);
  ok(bloque.kpis.ingresoEnvios === 65000, 'el envío de la cancelada no se cobró (sería 80.000)');
  ok(porCanal.get(CanalVenta.DELIVERY)!.facturacion === 280000,
    'la facturación de delivery no incluye la cancelada');

  await ds.destroy();

  console.log(`\n[reporte-delivery] ${passed} OK, ${failed} FALLAN`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
