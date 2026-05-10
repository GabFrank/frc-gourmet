import { FastifyInstance } from 'fastify';
import { DataSource } from 'typeorm';

/**
 * GET /api/files/:id — stream binario para imagenes/adjuntos. F3.3 lo
 * implementa: lee el adjunto, abre el archivo del filesystem del server
 * y lo manda con el mime correcto.
 */
export function registerFileRoutes(fastify: FastifyInstance, _dataSource: DataSource): void {
  fastify.get<{ Params: { id: string } }>('/api/files/:id', async (request, reply) => {
    // F3.3: implementar
    reply.code(501);
    return { error: 'files/:id not implemented yet (F3.3)' };
  });
}
