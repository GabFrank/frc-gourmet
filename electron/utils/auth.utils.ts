import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { UsuarioRole } from '../../src/app/database/entities/personas/usuario-role.entity';
import { RolePermission } from '../../src/app/database/entities/personas/role-permission.entity';

/**
 * P0-1: helper de autorizacion centralizado para handlers IPC.
 *
 * Problema: la UI valida permisos con `*appHasPermission`, pero un usuario
 * autenticado puede saltarse la UI llamando directamente a `window.api.X`
 * desde DevTools. Sin chequeo en backend, la UI no es frontera real de
 * seguridad. Este helper se debe invocar al inicio de cada handler que
 * muta datos sensibles (financiero, RRHH, personas/usuarios, compras,
 * sistema). Lectura cruda sin mutacion suele no requerirlo.
 *
 * Uso:
 *
 *   ipcMain.handle('anular-liquidacion-sueldo', async (_e, id, motivo) => {
 *     const auth = await checkPermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_PAGAR');
 *     if (!auth.ok) return { success: false, message: auth.message };
 *     // ... resto del handler
 *   });
 *
 * El frontend recibe `{ success: false, message }` y muestra snackbar.
 *
 * Cache: permisos por usuario con TTL corto (30s). Razon: la query
 * involucra UsuarioRole + RolePermission + Permission y se ejecutaria
 * en cada handler invocado — barato individualmente, costoso en
 * burst de UI. TTL corto = cambios de rol/permiso tienen efecto en
 * <=30s sin invalidacion manual. Si se requiere efecto inmediato,
 * los handlers que mutan UsuarioRole/RolePermission deben llamar
 * `clearPermissionCache(usuarioId)`.
 */

const TTL_MS = 30_000;
type CacheEntry = { codes: Set<string>; expiresAt: number };
const permissionsCache = new Map<number, CacheEntry>();

export function clearPermissionCache(usuarioId?: number): void {
  if (usuarioId == null) permissionsCache.clear();
  else permissionsCache.delete(usuarioId);
}

/**
 * Contexto del usuario del request actual.
 *
 * Problema sin esto: en mode=server/client, los handlers usan
 * `getCurrentUser()` que apunta a la variable global del main process —
 * pero ese user es el de la consola del server, NO el del request HTTP.
 * Resultado: todos los requests HTTP verian el mismo currentUser global,
 * rompiendo la autorizacion por-usuario en cliente/servidor.
 *
 * Fix: el rpc-router envuelve `invokeHandler` con `withRequestUser(jwtUser, fn)`
 * y `checkPermission` lee de aca PRIMERO, cayendo al `getCurrentUser`
 * global solo cuando no hay contexto HTTP (mode=standalone).
 *
 * AsyncLocalStorage es seguro frente a requests concurrentes — cada
 * request mantiene su propio contexto aunque haya `await`s en el medio.
 */
const requestUserContext = new AsyncLocalStorage<Usuario>();

export function withRequestUser<T>(user: Usuario, fn: () => T | Promise<T>): T | Promise<T> {
  return requestUserContext.run(user, fn);
}

/**
 * Devuelve el usuario relevante para autorizacion:
 * - Si estamos dentro de un `withRequestUser(...)` (request HTTP), ese.
 * - Sino, el `getCurrentUser()` global del main process (mode standalone).
 */
function resolveAuthUser(getCurrentUser: () => Usuario | null): Usuario | null {
  return requestUserContext.getStore() ?? getCurrentUser();
}

export async function getUserPermissionCodes(
  dataSource: DataSource,
  usuarioId: number
): Promise<Set<string>> {
  const now = Date.now();
  const hit = permissionsCache.get(usuarioId);
  if (hit && hit.expiresAt > now) return hit.codes;

  const usuarioRoleRepo = dataSource.getRepository(UsuarioRole);
  const userRoles = await usuarioRoleRepo.find({
    where: { usuario: { id: usuarioId } },
    relations: ['role'],
  });
  const roleIds = userRoles
    .map((ur) => ur.role?.id)
    .filter((id): id is number => typeof id === 'number');

  const codes = new Set<string>();
  if (roleIds.length > 0) {
    const rolePermissionRepo = dataSource.getRepository(RolePermission);
    const rps = await rolePermissionRepo
      .createQueryBuilder('rp')
      .leftJoinAndSelect('rp.permission', 'permission')
      .leftJoin('rp.role', 'role')
      .where('role.id IN (:...roleIds)', { roleIds })
      .getMany();
    for (const rp of rps) {
      if (rp.permission?.codigo) codes.add(rp.permission.codigo);
    }
  }

  permissionsCache.set(usuarioId, { codes, expiresAt: now + TTL_MS });
  return codes;
}

export interface PermissionCheckOk {
  ok: true;
  user: Usuario;
}
export interface PermissionCheckErr {
  ok: false;
  message: string;
  code: 'UNAUTHORIZED' | 'FORBIDDEN';
}
export type PermissionCheck = PermissionCheckOk | PermissionCheckErr;

/**
 * Verifica que el usuario logueado tenga al menos UNO de los codigos
 * (OR de permisos). Si pasas un solo string, exige ese codigo.
 *
 * Retorna un discriminated union: chequea `auth.ok` antes de usar
 * `auth.user`.
 */
export async function checkPermission(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
  codigo: string | string[]
): Promise<PermissionCheck> {
  const user = resolveAuthUser(getCurrentUser);
  if (!user) {
    return { ok: false, message: 'NO AUTENTICADO', code: 'UNAUTHORIZED' };
  }
  const codes = Array.isArray(codigo) ? codigo : [codigo];
  const userPerms = await getUserPermissionCodes(dataSource, user.id);
  const allowed = codes.some((c) => userPerms.has(c));
  if (!allowed) {
    return {
      ok: false,
      message: `PERMISO REQUERIDO: ${codes.join(' o ')}`,
      code: 'FORBIDDEN',
    };
  }
  return { ok: true, user };
}

/**
 * Variante "throw" de checkPermission. Util para handlers cuyo estilo es
 * propagar errores con `throw new Error(...)` en vez de devolver
 * `{ success: false, message }`. Lanza un Error con `.code` =
 * 'UNAUTHORIZED' | 'FORBIDDEN'.
 */
export async function ensurePermission(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
  codigo: string | string[]
): Promise<Usuario> {
  const check = await checkPermission(dataSource, getCurrentUser, codigo);
  if (check.ok) {
    return check.user;
  }
  const errInfo = check as PermissionCheckErr;
  const err: any = new Error(errInfo.message);
  err.code = errInfo.code;
  throw err;
}
