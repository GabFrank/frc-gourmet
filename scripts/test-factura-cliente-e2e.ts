/**
 * E2E: al facturar se guarda el cliente y se lo reusa por RUC.
 *
 * Antes `create-factura` guardaba el receptor desnormalizado dentro de la factura
 * y nunca tocaba `Cliente`: si el cajero no usaba el botón "Buscar cliente", la
 * factura quedaba anónima y el RUC se retipeaba en cada emisión.
 *
 * Uso: npm run test:factura-cliente
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerFacturacionHandlers } from '../electron/handlers/facturacion.handler';
import { buscarClientePorRuc, normalizarRuc } from '../electron/utils/cliente-ruc.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-factura-cliente.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[factura-cliente] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { Timbrado } = E('facturacion/timbrado.entity');
  const { TimbradoDetalle } = E('facturacion/timbrado-detalle.entity');
  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const rol: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  const perm: any = await save(Permission, { codigo: 'FACTURACION_EMITIR', descripcion: 'EMITIR', activo: true });
  await save(RolePermission, { role: rol, permission: perm });
  await save(UsuarioRole, { usuario: admin, role: rol });

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true });
  const timbrado: any = await save(Timbrado, {
    numero: '12345678', fechaInicio: new Date(), fechaFin: new Date(Date.now() + 9e10), activo: true,
  });
  const detalle: any = await save(TimbradoDetalle, {
    timbrado, establecimiento: '001', puntoExpedicion: '001',
    rangoDesde: 1, rangoHasta: 9999, numeroActual: 1, activo: true,
  });

  registerFacturacionHandlers(ds, () => admin);

  const facturar = async (receptor: any, extra: any = {}) => await invokeHandler('create-factura', {
    factura: {
      timbradoDetalleId: detalle.id, moneda: { id: pyg.id }, total: 100000,
      condicionVenta: 'CONTADO', ...receptor, ...extra,
    },
    items: [],
  });
  const contarClientes = async () => Number((await ds.query('SELECT COUNT(*) c FROM clientes'))[0].c);

  // ═══════ [A] RUC nuevo ═══════
  console.log('\n[A] Facturar a un RUC que no existe');
  {
    const antes = await contarClientes();
    const f: any = await facturar({ ruc: '80012345-6', nombreCliente: 'PANADERIA SAN JUAN', direccion: 'AVDA. ITAIPU 123', email: 'ventas@sanjuan.com.py' });
    ok(!!f?.id, 'A: la factura se emite', f?.id);
    ok(!!f?.numeroCompleto, 'A: con numeración asignada', f?.numeroCompleto);
    ok(await contarClientes() === antes + 1, 'A: se creó el cliente');
    ok(!!f?.cliente?.id, 'A: la factura queda vinculada al cliente', f?.cliente?.id);

    const c: any = await buscarClientePorRuc(ds, '80012345-6');
    ok(c?.ruc === '80012345-6', 'A: guarda el RUC con el formato tipeado', c?.ruc);
    ok(c?.persona?.documento === '80012345-6', 'A: y también en personas.documento', c?.persona?.documento);
    ok(c?.persona?.tipoDocumento === 'RUC', 'A: con tipoDocumento = RUC', c?.persona?.tipoDocumento);
    ok(c?.persona?.nombre === 'PANADERIA SAN JUAN', 'A: la razón social en UPPERCASE', c?.persona?.nombre);
  }

  // ═══════ [B] Mismo RUC otra vez ═══════
  console.log('\n[B] Facturar de nuevo al mismo RUC');
  {
    const antes = await contarClientes();
    const f: any = await facturar({ ruc: '80012345-6', nombreCliente: 'PANADERIA SAN JUAN' });
    ok(await contarClientes() === antes, 'B: NO crea un segundo cliente');
    ok(!!f?.cliente?.id, 'B: reusa el existente', f?.cliente?.id);
  }

  // ═══════ [C] No pisa lo cargado, completa lo vacío ═══════
  console.log('\n[C] Cliente existente con datos');
  {
    const f1: any = await facturar({ ruc: '80099999-1', nombreCliente: 'FERRETERIA CENTRAL', direccion: 'CALLE ORIGINAL 500' });
    const antes: any = await buscarClientePorRuc(ds, '80099999-1');
    ok(antes?.persona?.direccion === 'CALLE ORIGINAL 500', 'C: dirección inicial guardada', antes?.persona?.direccion);
    ok(!antes?.persona?.telefono, 'C: sin teléfono todavía');

    await facturar({ ruc: '80099999-1', nombreCliente: 'FERRETERIA CENTRAL', direccion: 'OTRA DIRECCION 999', telefono: '0981-111222' });
    const despues: any = await buscarClientePorRuc(ds, '80099999-1');
    ok(despues?.persona?.direccion === 'CALLE ORIGINAL 500', 'C: NO pisa la dirección ya cargada', despues?.persona?.direccion);
    ok(despues?.persona?.telefono === '0981-111222', 'C: SÍ completa el teléfono que faltaba', despues?.persona?.telefono);
  }

  // ═══════ [D] Normalización ═══════
  console.log('\n[D] RUC con espacios, puntos y minúsculas');
  {
    ok(normalizarRuc(' 800.123.45-6 ') === '800123456', 'D: normaliza espacios, puntos y guiones', normalizarRuc(' 800.123.45-6 '));
    ok(normalizarRuc('800123456') === normalizarRuc('80012345-6'), 'D: con y sin guion son el mismo RUC');
    const antes = await contarClientes();
    await facturar({ ruc: ' 800 123 45-6 ', nombreCliente: 'PANADERIA SAN JUAN' });
    ok(await contarClientes() === antes, 'D: resuelve al mismo cliente, no duplica');
    // La variante sin guion tampoco: es el caso que crea duplicados en la vida real.
    await facturar({ ruc: '800123456', nombreCliente: 'PANADERIA SAN JUAN' });
    ok(await contarClientes() === antes, 'D: la variante sin guion tampoco duplica');
  }

  // ═══════ [E] Encuentra por personas.documento ═══════
  console.log('\n[E] Cliente legacy con el RUC sólo en la persona');
  {
    const per: any = await save(Persona, { nombre: 'LEGACY SRL', documento: '80055555-5', tipoDocumento: 'RUC', activo: true });
    await save(Cliente, { persona: per, activo: true, tributa: true, credito: false, limite_credito: 0 });
    const c: any = await buscarClientePorRuc(ds, '80055555-5');
    ok(!!c?.id, 'E: lo encuentra aunque clientes.ruc esté vacío', c?.id);

    const antes = await contarClientes();
    const f: any = await facturar({ ruc: '80055555-5', nombreCliente: 'LEGACY SRL' });
    ok(await contarClientes() === antes, 'E: no lo duplica al facturar');
    ok(f?.cliente?.id === c.id, 'E: la factura se vincula al legacy', f?.cliente?.id);
  }

  // ═══════ [F] Desempate: prefiere el activo ═══════
  console.log('\n[F] RUC duplicado');
  {
    const perBaja: any = await save(Persona, { nombre: 'DUPLICADO BAJA', documento: '80077777-7', tipoDocumento: 'RUC', activo: true });
    const cBaja: any = await save(Cliente, { persona: perBaja, ruc: '80077777-7', activo: false, tributa: true, credito: false, limite_credito: 0 });
    const perAlta: any = await save(Persona, { nombre: 'DUPLICADO ACTIVO', documento: '80077777-7', tipoDocumento: 'RUC', activo: true });
    const cAlta: any = await save(Cliente, { persona: perAlta, ruc: '80077777-7', activo: true, tributa: true, credito: false, limite_credito: 0 });

    const c: any = await buscarClientePorRuc(ds, '80077777-7');
    ok(c?.id === cAlta.id, 'F: prefiere el ACTIVO aunque tenga id mayor', { elegido: c?.id, baja: cBaja.id, alta: cAlta.id });
  }

  // ═══════ [G] La factura manda ═══════
  console.log('\n[G] Si el cliente no se puede resolver, la factura igual sale');
  {
    const antes = await contarClientes();
    // Sin razón social no hay cliente que crear, pero la factura es un documento
    // legal con numeración: se emite igual.
    const f: any = await facturar({ ruc: '80088888-8', nombreCliente: '' });
    ok(!!f?.id && !!f?.numeroCompleto, 'G: se emite y conserva su número', f?.numeroCompleto);
    ok(!f?.cliente, 'G: sin cliente vinculado', f?.cliente);
    ok(await contarClientes() === antes, 'G: no creó nada a medias');
  }

  // ═══════ [H] Cliente ya vinculado ═══════
  console.log('\n[H] Factura que ya trae cliente');
  {
    const c: any = await buscarClientePorRuc(ds, '80012345-6');
    const antes = await contarClientes();
    const f: any = await facturar({ ruc: '80033333-3', nombreCliente: 'OTRO NOMBRE', cliente: { id: c.id } });
    ok(f?.cliente?.id === c.id, 'H: respeta el vínculo explícito', f?.cliente?.id);
    ok(await contarClientes() === antes, 'H: no crea uno nuevo por el RUC distinto');
  }

  // ═══════ [I] Numeración correlativa ═══════
  console.log('\n[I] La numeración no se rompe');
  {
    const d: any = await ds.getRepository(TimbradoDetalle).findOneBy({ id: detalle.id } as any);
    const facturas: any[] = await ds.query('SELECT numero_factura FROM facturas ORDER BY id');
    const numeros = facturas.map((f) => Number(f.numero_factura));
    ok(new Set(numeros).size === numeros.length, 'I: sin números repetidos', numeros);
    ok(d.numeroActual === Math.max(...numeros) + 1, 'I: el contador quedó donde corresponde', { contador: d.numeroActual, max: Math.max(...numeros) });
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} factura-cliente: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
