import { FastifyInstance } from 'fastify';
import { handlerRegistryCount } from '../utils/handler-registry';

export interface SpecialRoutesOptions {
  appVersion: string;
  schemaVersion: string;
  driver: 'sqlite' | 'postgres';
}

/**
 * Endpoints publicos sin auth: version, health.
 *
 * - /api/version: usado por clientes para detectar mismatch de schema
 *   (si schema_version difiere, cliente bloquea writes hasta updatear).
 * - /api/health: ping minimo, para load balancers o LAN discovery.
 */
export function registerSpecialRoutes(fastify: FastifyInstance, opts: SpecialRoutesOptions): void {
  fastify.get('/api/version', async () => ({
    appVersion: opts.appVersion,
    schemaVersion: opts.schemaVersion,
    driver: opts.driver,
    handlersAvailable: handlerRegistryCount(),
  }));

  fastify.get('/api/health', async () => ({
    ok: true,
    timestamp: new Date().toISOString(),
  }));
}
