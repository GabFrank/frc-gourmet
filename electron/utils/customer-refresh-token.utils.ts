import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { CustomerRefreshToken } from '../../src/app/database/entities/pedidos-online/customer-refresh-token.entity';
import { CuentaCliente } from '../../src/app/database/entities/pedidos-online/cuenta-cliente.entity';

/**
 * Refresh tokens de CLIENTE FINAL (storefront). Mismo patrón que
 * `refresh-token.utils` (staff): el plain se devuelve al cliente, la BD guarda
 * el sha256. Rotación en cada uso. Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
 */

const REFRESH_TOKEN_BYTES = 48;
const DEFAULT_TTL_DAYS = 60;

export interface IssuedCustomerRefreshToken {
  token: string;
  expiresAt: Date;
  id: number;
}

function hashToken(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

export async function issueCustomerRefreshToken(
  dataSource: DataSource,
  cuenta: CuentaCliente,
  meta?: { ip?: string; userAgent?: string; ttlDays?: number },
): Promise<IssuedCustomerRefreshToken> {
  const plain = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  const issuedAt = new Date();
  const ttlDays = meta?.ttlDays ?? DEFAULT_TTL_DAYS;
  const expiresAt = new Date(issuedAt.getTime() + ttlDays * 24 * 60 * 60 * 1000);

  const repo = dataSource.getRepository(CustomerRefreshToken);
  const saved = await repo.save(
    repo.create({
      cuentaCliente: cuenta,
      tokenHash: hashToken(plain),
      issuedAt,
      expiresAt,
      revokedAt: null as any,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    }),
  );
  return { token: plain, expiresAt, id: saved.id };
}

export async function findValidCustomerRefreshToken(
  dataSource: DataSource,
  plain: string,
): Promise<CustomerRefreshToken | null> {
  if (!plain) return null;
  const repo = dataSource.getRepository(CustomerRefreshToken);
  const found = await repo.findOne({
    where: { tokenHash: hashToken(plain) },
    relations: ['cuentaCliente'],
  });
  if (!found || found.revokedAt) return null;
  if (found.expiresAt.getTime() < Date.now()) return null;
  return found;
}

/** Valida + revoca el viejo + emite uno nuevo. null si el viejo es inválido. */
export async function rotateCustomerRefreshToken(
  dataSource: DataSource,
  oldPlain: string,
  meta?: { ip?: string; userAgent?: string },
): Promise<{ cuenta: CuentaCliente; refresh: IssuedCustomerRefreshToken } | null> {
  const valid = await findValidCustomerRefreshToken(dataSource, oldPlain);
  if (!valid) return null;
  await dataSource.getRepository(CustomerRefreshToken).update({ id: valid.id }, { revokedAt: new Date() });
  const refresh = await issueCustomerRefreshToken(dataSource, valid.cuentaCliente, meta);
  return { cuenta: valid.cuentaCliente, refresh };
}

export async function revokeCustomerRefreshToken(dataSource: DataSource, plain: string): Promise<boolean> {
  const repo = dataSource.getRepository(CustomerRefreshToken);
  const found = await repo.findOne({ where: { tokenHash: hashToken(plain) } });
  if (!found) return false;
  await repo.update({ id: found.id }, { revokedAt: new Date() });
  return true;
}
