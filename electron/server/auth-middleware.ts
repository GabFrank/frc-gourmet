import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwtPlugin from '@fastify/jwt';
import { getJwtSecret } from '../utils/jwt-secret.utils';

/**
 * Registra @fastify/jwt y expone `fastify.authenticate` decorator que las
 * rutas privadas (/api/rpc, /api/files) deben usar como onRequest hook.
 *
 * El secret se lee del keytar (F0) — mismo que firma los tokens en
 * el handler IPC `login`.
 */
export async function registerAuthPlugin(fastify: FastifyInstance): Promise<void> {
  const secret = await getJwtSecret();
  await fastify.register(jwtPlugin, {
    secret,
    sign: { expiresIn: '15m' }, // access token TTL chico — el refresh extiende
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: String((err as any)?.message || err) });
    }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: number; nickname: string; device_id?: number | null };
    user: { id: number; nickname: string; device_id?: number | null; iat?: number; exp?: number };
  }
}
