/**
 * Auditoria de permisos: que puede hacer cada rol plantilla en el dia a dia.
 *
 * No inventa permisos: siembra los roles REALES con `seedSystemData` y despues
 * invoca los canales IPC reales con un usuario de cada rol. Un canal se
 * considera permitido si el error NO es FORBIDDEN — el resto de las validaciones
 * (payload incompleto, caja inexistente) corren despues de `ensurePermission`,
 * asi que sirven igual para distinguir "no tiene permiso" de "no pudo hacerlo".
 *
 * La matriz de abajo es la expectativa del negocio. Si un rol no puede hacer lo
 * que le toca, esto falla y el fix va en `ROLES_PLANTILLA` (seed-system.ts).
 *
 * Uso: npm run test:roles-pdv
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';
import { registerFinancieroHandlers } from '../electron/handlers/financiero.handler';
import { registerFacturacionHandlers } from '../electron/handlers/facturacion.handler';
import { registerPdvEgresosHandlers } from '../electron/handlers/pdv-egresos.handler';
import { seedPermissions } from '../electron/handlers/permissions.handler';
import { seedSystemData } from '../electron/utils/seed-system';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

type Rol = 'GERENTE' | 'CAJERO' | 'MOZO';

/**
 * Expectativa del negocio. `roles` = quienes DEBEN poder hacerlo; el resto debe
 * recibir FORBIDDEN.
 */
const MATRIZ: Array<{ operacion: string; canal: string; args: any[]; roles: Rol[] }> = [
  // ── Salon: lo que hace un mozo todo el dia ──
  { operacion: 'Abrir una venta de mesa', canal: 'createVenta', args: [{ estado: 'ABIERTA' }], roles: ['GERENTE', 'CAJERO', 'MOZO'] },
  { operacion: 'Cargar un item', canal: 'createVentaItem', args: [{ cantidad: 1 }], roles: ['GERENTE', 'CAJERO', 'MOZO'] },
  { operacion: 'Modificar un item', canal: 'updateVentaItem', args: [1, { cantidad: 2 }], roles: ['GERENTE', 'CAJERO', 'MOZO'] },
  { operacion: 'Cancelar un item', canal: 'deleteVentaItem', args: [1], roles: ['GERENTE', 'CAJERO', 'MOZO'] },
  { operacion: 'Ocupar o liberar una mesa', canal: 'set-pdv-mesa-estado', args: [1, 'OCUPADO'], roles: ['GERENTE', 'CAJERO', 'MOZO'] },
  { operacion: 'Abrir una comanda', canal: 'abrirComanda', args: [1, {}], roles: ['GERENTE', 'CAJERO', 'MOZO'] },
  { operacion: 'Cerrar una comanda', canal: 'cerrarComanda', args: [1], roles: ['GERENTE', 'CAJERO', 'MOZO'] },
  { operacion: 'Transferir una cuenta', canal: 'transferir-venta-pdv', args: [{ origen: { tipo: 'MESA', id: 1 }, destino: { tipo: 'MESA', id: 2 }, alcance: 'COMPLETA' }], roles: ['GERENTE', 'CAJERO', 'MOZO'] },

  // ── Caja: abrir, contar y cerrar su propio turno. Abrir una caja son tres
  // llamadas (conteo + detalles + caja) y cerrarla otras tres, asi que el rol
  // necesita las tres o no puede ni empezar el turno.
  { operacion: 'Crear el conteo de apertura/cierre', canal: 'create-conteo', args: [{ tipo: 'APERTURA' }], roles: ['GERENTE', 'CAJERO'] },
  { operacion: 'Cargar el detalle del conteo', canal: 'create-conteo-detalle', args: [{ cantidad: 1 }], roles: ['GERENTE', 'CAJERO'] },
  { operacion: 'Abrir caja', canal: 'create-caja', args: [{ estado: 'ABIERTO' }], roles: ['GERENTE', 'CAJERO'] },
  { operacion: 'Cerrar caja', canal: 'update-caja', args: [1, { estado: 'CERRADO' }], roles: ['GERENTE', 'CAJERO'] },
  // Lo destructivo y lo de configuracion NO baja al cajero.
  { operacion: 'Borrar una caja', canal: 'delete-caja', args: [1], roles: ['GERENTE'] },
  { operacion: 'Borrar un conteo', canal: 'delete-conteo', args: [1], roles: ['GERENTE'] },
  { operacion: 'Configurar las monedas habilitadas para el conteo', canal: 'save-cajas-monedas', args: [[]], roles: ['GERENTE'] },
  { operacion: 'Ajustar una caja ya cerrada', canal: 'finalizar-ajuste-caja', args: [1, 'MOTIVO'], roles: ['GERENTE'] },

  // ── Cajon del PdV ──
  { operacion: 'Pagar un vale desde el cajon', canal: 'pagar-vale-caja', args: [{}], roles: ['GERENTE', 'CAJERO'] },
  { operacion: 'Pagar una compra desde el cajon', canal: 'pagar-compra-cuota-caja', args: [{}], roles: ['GERENTE', 'CAJERO'] },
  { operacion: 'Anular un egreso del cajon', canal: 'anular-egreso-caja', args: [1, 'MOTIVO'], roles: ['GERENTE'] },

  // ── Facturacion legal ──
  { operacion: 'Emitir una factura', canal: 'create-factura', args: [{}], roles: ['GERENTE', 'CAJERO'] },
  { operacion: 'Cargar un timbrado', canal: 'create-timbrado', args: [{}], roles: ['GERENTE'] },

  // ── Configuracion: solo el gerente ──
  { operacion: 'Renombrar una mesa', canal: 'updatePdvMesa', args: [1, { numero: 99 }], roles: ['GERENTE'] },
  { operacion: 'Editar categorias del PdV', canal: 'createPdvCategoria', args: [{}], roles: ['GERENTE'] },
  { operacion: 'Editar la config del PdV', canal: 'updatePdvConfig', args: [1, {}], roles: ['GERENTE'] },
  { operacion: 'Editar monedas', canal: 'createMoneda', args: [{}], roles: ['GERENTE'] },
];

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-roles-pdv.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });

  // Los roles NO se declaran aca: se siembran con el seed real del sistema.
  await seedPermissions(ds);
  await seedSystemData(ds);
  console.log('[roles-pdv] Permisos y roles plantilla sembrados desde el seed real.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Role } = E('personas/role.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const usuarios: Record<Rol, any> = {} as any;
  for (const descripcion of ['GERENTE', 'CAJERO', 'MOZO'] as Rol[]) {
    const rol: any = await ds.getRepository(Role).findOne({ where: { descripcion } as any });
    if (!rol) throw new Error(`El seed no creo el rol ${descripcion}`);
    const usuario: any = await save(Usuario, { nickname: `U_${descripcion}`, password: 'x', activo: true });
    await save(UsuarioRole, { usuario, role: rol });
    usuarios[descripcion] = usuario;
  }

  let usuarioActual: any = usuarios.MOZO;
  registerVentasHandlers(ds, () => usuarioActual);
  registerFinancieroHandlers(ds, () => usuarioActual);
  registerFacturacionHandlers(ds, () => usuarioActual);
  registerPdvEgresosHandlers(ds, () => usuarioActual);

  /** true = el rol pasa el guard de permisos (aunque despues falle por datos). */
  const permitido = async (canal: string, args: any[]): Promise<boolean> => {
    try {
      await invokeHandler(canal, ...args);
      return true;
    } catch (e: any) {
      return e?.code !== 'FORBIDDEN';
    }
  };

  const silenciarErrores = console.error;
  const faltantes: string[] = [];
  const sobrantes: string[] = [];

  for (const caso of MATRIZ) {
    console.log(`\n[${caso.operacion}] (${caso.canal})`);
    for (const rol of ['GERENTE', 'CAJERO', 'MOZO'] as Rol[]) {
      usuarioActual = usuarios[rol];
      console.error = () => { /* los handlers logean su propio error; no ensucia la salida */ };
      const puede = await permitido(caso.canal, caso.args);
      console.error = silenciarErrores;
      const deberia = caso.roles.includes(rol);
      ok(puede === deberia, `${rol} ${deberia ? 'puede' : 'no puede'}`, puede === deberia ? undefined : { puede, deberia });
      if (!puede && deberia) faltantes.push(`${rol} no puede: ${caso.operacion} (${caso.canal})`);
      if (puede && !deberia) sobrantes.push(`${rol} PUEDE de mas: ${caso.operacion} (${caso.canal})`);
    }
  }

  if (faltantes.length || sobrantes.length) {
    console.log('\n─── Hallazgos ───');
    faltantes.forEach((f) => console.log(`  ⛔ ${f}`));
    sobrantes.forEach((f) => console.log(`  ⚠  ${f}`));
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} roles-pdv: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
