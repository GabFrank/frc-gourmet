import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../../src/app/database/entities/auth/refresh-token.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

const REFRESH_TOKEN_BYTES = 48;
const DEFAULT_TTL_DAYS = 30;

export interface IssuedRefreshToken {
  token: string; // plain — devolver al cliente, NO persistir
  expiresAt: Date;
  refreshTokenId: number;
}

function hashToken(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

function generatePlain(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

export async function issueRefreshToken(
  dataSource: DataSource,
  usuario: Usuario,
  meta?: { ip?: string; userAgent?: string; ttlDays?: number },
): Promise<IssuedRefreshToken> {
  const plain = generatePlain();
  const tokenHash = hashToken(plain);
  const issuedAt = new Date();
  const ttlDays = meta?.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = new Date(issuedAt.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  const repo = dataSource.getRepository(RefreshToken);
  const entity = repo.create({
    usuario,
    tokenHash,
    issuedAt,
    expiresAt,
    revokedAt: null as any,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
  const saved = await repo.save(entity);
  return { token: plain, expiresAt, refreshTokenId: saved.id };
}

/**
 * Valida un plain token. Devuelve la entidad si es valido (no revocado, no expirado).
 */
export async function findValidRefreshToken(
  dataSource: DataSource,
  plain: string,
): Promise<RefreshToken | null> {
  if (!plain) return null;
  const tokenHash = hashToken(plain);
  const repo = dataSource.getRepository(RefreshToken);
  const found = await repo.findOne({
    where: { tokenHash },
    relations: ['usuario'],
  });
  if (!found) return null;
  if (found.revokedAt) return null;
  if (found.expiresAt.getTime() < Date.now()) return null;
  return found;
}

/**
 * Rota un refresh token: valida + revoca el viejo + emite uno nuevo. Atomico
 * a nivel de save secuencial. Si el viejo es invalido devuelve null sin emitir.
 */
export async function rotateRefreshToken(
  dataSource: DataSource,
  oldPlain: string,
  meta?: { ip?: string; userAgent?: string; ttlDays?: number },
): Promise<IssuedRefreshToken | null> {
  const valid = await findValidRefreshToken(dataSource, oldPlain);
  if (!valid) return null;
  await revokeRefreshTokenById(dataSource, valid.id);
  return issueRefreshToken(dataSource, valid.usuario, meta);
}

export async function revokeRefreshToken(dataSource: DataSource, plain: string): Promise<boolean> {
  const tokenHash = hashToken(plain);
  const repo = dataSource.getRepository(RefreshToken);
  const found = await repo.findOne({ where: { tokenHash } });
  if (!found) return false;
  return revokeRefreshTokenById(dataSource, found.id);
}

export async function revokeRefreshTokenById(dataSource: DataSource, id: number): Promise<boolean> {
  const repo = dataSource.getRepository(RefreshToken);
  await repo.update({ id }, { revokedAt: new Date() });
  return true;
}

export async function revokeAllForUser(dataSource: DataSource, usuarioId: number): Promise<number> {
  const repo = dataSource.getRepository(RefreshToken);
  const result = await repo
    .createQueryBuilder()
    .update(RefreshToken)
    .set({ revokedAt: new Date() })
    .where('usuario_id = :usuarioId AND revoked_at IS NULL', { usuarioId })
    .execute();
  return result.affected ?? 0;
}

/**
 * Limpieza periodica: borra fisicamente tokens revocados o expirados hace mas
 * de `olderThanDays` (default 30). Idempotente.
 */
export async function purgeStaleRefreshTokens(
  dataSource: DataSource,
  olderThanDays = 30,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const repo = dataSource.getRepository(RefreshToken);
  const result = await repo
    .createQueryBuilder()
    .delete()
    .from(RefreshToken)
    .where('expires_at < :cutoff', { cutoff })
    .orWhere('revoked_at IS NOT NULL AND revoked_at < :cutoff', { cutoff })
    .execute();
  return result.affected ?? 0;
}
