import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{1,2}\$/;

export function isHashed(value: string | null | undefined): boolean {
  if (!value) return false;
  return BCRYPT_HASH_RE.test(value);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  if (isHashed(stored)) {
    return bcrypt.compare(plain, stored);
  }
  // Legacy plaintext fallback. Migracion debio haber corrido al startup;
  // si llega aqui es porque el usuario logueo antes de migrar o la migracion fallo.
  return plain === stored;
}
