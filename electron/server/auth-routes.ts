import { FastifyInstance } from 'fastify';
import { DataSource } from 'typeorm';

/**
 * Auth endpoints (no requieren JWT previo). F3.2 — placeholder hasta wirear
 * con auth handler IPC + JWT generation reusando F0 secret de keytar.
 */
export function registerAuthRoutes(fastify: FastifyInstance, _dataSource: DataSource): void {
  fastify.post('/api/auth/login', async (request, reply) => {
    // F3.2: implementar
    reply.code(501);
    return { error: 'auth/login not implemented yet (F3.2)' };
  });

  fastify.post('/api/auth/refresh', async (request, reply) => {
    // F3.2: implementar
    reply.code(501);
    return { error: 'auth/refresh not implemented yet (F3.2)' };
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    // F3.2: implementar
    reply.code(501);
    return { error: 'auth/logout not implemented yet (F3.2)' };
  });
}
