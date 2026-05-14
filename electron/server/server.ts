/**
 * Servidor HTTP Fastify embebido en Electron main.
 *
 * F3 (cliente/servidor): cuando `app-settings.mode === 'server'`, esta
 * funcion arranca un Fastify en `app-settings.network.port` (default 7070).
 *
 * Endpoints expuestos:
 *   GET  /api/version     → schema/app version + driver
 *   GET  /api/health      → ping rápido
 *   POST /api/auth/login  → JWT (delega al login handler IPC)            ← F3.2
 *   POST /api/rpc         → invoca handlerRegistry.get(method)            ← F3.2
 *   GET  /api/files/:id   → stream binario para imagenes/adjuntos        ← F3.3
 *
 * El servidor se arranca despues de los `register*Handlers` para que el
 * handlerRegistry ya este poblado al servir requests.
 */
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { DataSource } from 'typeorm';
import { handlerRegistryCount } from '../utils/handler-registry';
import { registerSpecialRoutes } from './special-routes';
import { registerRpcRoute } from './rpc-router';
import { registerAuthRoutes } from './auth-routes';
import { registerFileRoutes } from './file-routes';
import { registerAuthPlugin } from './auth-middleware';

export interface ServerOptions {
  port: number;
  host?: string;        // '0.0.0.0' default — escucha en todas las interfaces LAN
  appVersion: string;
  schemaVersion: string;
  driver: 'sqlite' | 'postgres';
  dataSource: DataSource;
}

let instance: FastifyInstance | null = null;

export async function startServer(opts: ServerOptions): Promise<FastifyInstance> {
  if (instance) {
    console.log('[server] Ya estaba arrancado, ignorando startServer.');
    return instance;
  }

  const fastify = Fastify({
    logger: {
      level: process.env['NODE_ENV'] === 'development' ? 'info' : 'warn',
    },
    bodyLimit: 50 * 1024 * 1024, // 50MB para uploads de imagenes/adjuntos
  });

  // CORS — permitir cualquier origen en LAN (clientes desktop con app://, browsers, PWAs)
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Rate limiting basico — anti-brute-force de login y anti-DDoS accidental
  await fastify.register(rateLimit, {
    max: 300,           // 300 requests
    timeWindow: '1 minute',
  });

  // JWT plugin (decora fastify.authenticate)
  await registerAuthPlugin(fastify);

  // Endpoints sin auth (version, health)
  registerSpecialRoutes(fastify, {
    appVersion: opts.appVersion,
    schemaVersion: opts.schemaVersion,
    driver: opts.driver,
  });

  // Auth (login + refresh, no requieren JWT previo)
  registerAuthRoutes(fastify, opts.dataSource);

  // RPC (requiere JWT — el middleware se aplica via onRequest hook).
  // dataSource es necesario para resolver el Usuario del JWT y poblar el
  // AsyncLocalStorage que usa `checkPermission` (P0-1).
  registerRpcRoute(fastify, opts.dataSource);

  // Files (requiere JWT)
  registerFileRoutes(fastify, opts.dataSource);

  const host = opts.host || '0.0.0.0';
  await fastify.listen({ port: opts.port, host });

  console.log(`[server] Fastify escuchando en http://${host}:${opts.port}`);
  console.log(`[server] handlerRegistry: ${handlerRegistryCount()} channels disponibles via /api/rpc`);

  instance = fastify;
  return fastify;
}

export async function stopServer(): Promise<void> {
  if (!instance) return;
  await instance.close();
  instance = null;
  console.log('[server] Detenido.');
}

export function getServerInstance(): FastifyInstance | null {
  return instance;
}
