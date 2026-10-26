/**
 * Funcionario vinculado al usuario de la sesión (Funcionario.usuario). Identidad real del
 * request: nunca un id que mande el cliente (§10 B4). Lo usa FT; DR tiene su copia local.
 */
import { DataSource, EntityManager } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';

export async function buscarFuncionarioDeUsuario(db: DataSource | EntityManager, usuarioId: number): Promise<Funcionario | null> {
  return db.getRepository(Funcionario).findOne({ where: { usuario: { id: usuarioId } } as any, relations: ['persona', 'cargo'] });
}

/** Igual que `buscarFuncionarioDeUsuario` pero lanza SIN_FUNCIONARIO si el usuario no está vinculado. */
export async function funcionarioDeSesion(db: DataSource | EntityManager, user: Usuario): Promise<Funcionario> {
  const f = await buscarFuncionarioDeUsuario(db, user.id);
  if (!f) {
    const err: any = new Error('TU USUARIO NO ESTÁ VINCULADO A UN FUNCIONARIO');
    err.code = 'SIN_FUNCIONARIO';
    throw err;
  }
  return f;
}
