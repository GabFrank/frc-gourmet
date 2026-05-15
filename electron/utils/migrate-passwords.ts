import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { hashPassword, isHashed } from './password.utils';

/**
 * Migracion one-shot: hashea con bcrypt todos los passwords plaintext de Usuario.
 * Idempotente — si ya estan hasheados, no hace nada.
 * Corre al startup, despues de DB init y antes de registrar handlers de auth.
 */
export async function migratePlaintextPasswords(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Usuario);
  const todos = await repo.find();
  let migrados = 0;
  for (const u of todos) {
    if (!u.password) continue;
    if (isHashed(u.password)) continue;
    u.password = await hashPassword(u.password);
    await repo.save(u);
    migrados++;
  }
  if (migrados > 0) {
    console.log(`[migrate-passwords] ${migrados} passwords migrados a bcrypt.`);
  }
}
