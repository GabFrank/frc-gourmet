import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { Persona } from '../../src/app/database/entities/personas/persona.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { hashPassword } from './password.utils';

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
 */
export const NICKNAME_SISTEMA_ONLINE = 'SISTEMA_ONLINE';

let cache: Promise<Usuario> | null = null;

async function buscar(dataSource: DataSource): Promise<Usuario | null> {
  return dataSource.getRepository(Usuario).findOne({ where: { nickname: NICKNAME_SISTEMA_ONLINE } });
}

async function crear(dataSource: DataSource): Promise<Usuario> {
  const existente = await buscar(dataSource);
  if (existente) return existente;
  try {
    return await dataSource.transaction(async (manager) => {
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
    cache = crear(dataSource).catch((err) => {
      cache = null; // reintentar en el próximo request
      throw err;
    });
  }
  return cache;
}

/** Solo tests: olvidar el usuario cacheado (otra base). */
export function resetUsuarioSistemaOnlineCache(): void {
  cache = null;
}
