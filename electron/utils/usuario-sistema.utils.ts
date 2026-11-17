import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { Persona } from '../../src/app/database/entities/personas/persona.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { UsuarioRole } from '../../src/app/database/entities/personas/usuario-role.entity';
import { hashPassword } from './password.utils';
import { enTransaccionSiPostgres } from './tx.utils';

/**
 * #357 punto 3: usuario de sistema para las rutas públicas (`/api/pub`: QR de
 * mesa y tienda online). Sin esto, lo que crea un comensal o un cliente online
 * quedaba sin autor o a nombre del operador logueado en la consola del servidor.
 *
 * - Inactivo y con una clave aleatoria que nadie conoce: no puede iniciar
 *   sesión (login y /api/rpc rechazan usuarios inactivos).
 * - Sin roles: cualquier `ensurePermission` dentro de una ruta pública falla
 *   en vez de heredar los permisos de la consola.
 * - Se crea solo la primera vez que hace falta (idempotente, SQLite y Postgres).
 * - Si alguien lo activó o le dio roles desde Usuarios, se vuelve a dejar
 *   inactivo y sin roles: lo público nunca hereda permisos.
 */
export const NICKNAME_SISTEMA_ONLINE = 'SISTEMA_ONLINE';

let cache: Promise<Usuario> | null = null;
let ultimoFallo = 0;
const ESPERA_TRAS_FALLO_MS = 30_000;

async function buscar(dataSource: DataSource): Promise<Usuario | null> {
  return dataSource.getRepository(Usuario).findOne({ where: { nickname: NICKNAME_SISTEMA_ONLINE } });
}

/** Deja al usuario de sistema inactivo y sin roles (por si lo tocaron a mano). */
async function sanear(dataSource: DataSource, usuario: Usuario): Promise<Usuario> {
  const roles = await dataSource.getRepository(UsuarioRole).find({ where: { usuario: { id: usuario.id } } });
  if (roles.length) {
    console.warn(`[sistema-online] ${NICKNAME_SISTEMA_ONLINE} tenía ${roles.length} rol(es): se quitan.`);
    await dataSource.getRepository(UsuarioRole).remove(roles);
  }
  if (usuario.activo) {
    console.warn(`[sistema-online] ${NICKNAME_SISTEMA_ONLINE} estaba activo: se desactiva.`);
    await dataSource.getRepository(Usuario).update({ id: usuario.id }, { activo: false });
    usuario.activo = false;
  }
  return usuario;
}

async function crear(dataSource: DataSource): Promise<Usuario> {
  const existente = await buscar(dataSource);
  if (existente) return sanear(dataSource, existente);
  try {
    // SQLite: una sola conexión, sin transacción propia (ver tx.utils.ts).
    return await enTransaccionSiPostgres(dataSource, async (manager) => {
      const persona = await manager.getRepository(Persona).save(
        manager.getRepository(Persona).create({ nombre: 'SISTEMA / ONLINE', activo: false }),
      );
      const usuario = manager.getRepository(Usuario).create({
        persona,
        nickname: NICKNAME_SISTEMA_ONLINE,
        password: await hashPassword(randomBytes(32).toString('hex')),
        activo: false,
      });
      return manager.getRepository(Usuario).save(usuario);
    });
  } catch (err) {
    // Otro request lo creó al mismo tiempo (nickname único): usar ese.
    const creado = await buscar(dataSource);
    if (creado) return creado;
    throw err;
  }
}

/** Usuario «Sistema / Online» (lo crea si no existe). */
export function getUsuarioSistemaOnline(dataSource: DataSource): Promise<Usuario> {
  if (!cache) {
    if (Date.now() - ultimoFallo < ESPERA_TRAS_FALLO_MS) {
      return Promise.reject(new Error('usuario Sistema / Online no disponible (reintento en espera)'));
    }
    cache = crear(dataSource).catch((err) => {
      cache = null; // reintentar después de la espera, no en cada request
      ultimoFallo = Date.now();
      throw err;
    });
  }
  return cache;
}

/** Solo tests: olvidar el usuario cacheado (otra base). */
export function resetUsuarioSistemaOnlineCache(): void {
  cache = null;
  ultimoFallo = 0;
}
