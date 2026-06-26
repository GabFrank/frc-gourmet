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
import fastifyStatic from '@fastify/static';
import { existsSync, readFileSync } from 'fs';
import { DataSource } from 'typeorm';
import { handlerRegistryCount } from '../utils/handler-registry';
import { registerSpecialRoutes } from './special-routes';
import { registerRpcRoute } from './rpc-router';
import { registerAuthRoutes } from './auth-routes';
import { registerFileRoutes } from './file-routes';
import { registerKdsSseRoutes } from './kds-sse-routes';
import { registerAuthPlugin } from './auth-middleware';

export interface ServerOptions {
  port: number;
  host?: string;        // '0.0.0.0' default — escucha en todas las interfaces LAN
  appVersion: string;
  schemaVersion: string;
  driver: 'sqlite' | 'postgres';
  dataSource: DataSource;
  /**
   * F2 (mobile PWA): carpeta con el bundle Angular de `projects/mobile`
   * (`dist/mobile`). Si existe, se sirve estáticamente en `/` para que los
   * dispositivos remotos abran la PWA desde el mismo server (same-origin con
   * la API). Si no se pasa o no existe, no se sirve nada estático.
   */
  staticRoot?: string;
  /**
   * HTTPS directo en LAN. Si `certPath`/`keyPath` existen, se abre un segundo
   * listener HTTPS en `httpsPort` (default 7443) con el mismo set de rutas, para
   * que los dispositivos del local peguen directo al server (sin pasar por el
   * túnel) con cert válido. El HTTP en `port` se mantiene (lo usa el túnel).
   */
  httpsPort?: number;
  certPath?: string;
  keyPath?: string;
  /** URL LAN-directa que la PWA prueba al arrancar (se expone en /api/client-config). */
  lanUrl?: string;
}

const instances: FastifyInstance[] = [];

/** Crea una instancia Fastify (HTTP o HTTPS) y registra TODAS las rutas. */
async function buildInstance(
  opts: ServerOptions,
  https: { key: Buffer; cert: Buffer } | null,
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env['NODE_ENV'] === 'development' ? 'info' : 'warn',
    },
    bodyLimit: 50 * 1024 * 1024, // 50MB para uploads de imagenes/adjuntos
    ...(https ? { https } : {}),
  });

  // CORS — permitir cualquier origen en LAN (clientes desktop con app://, browsers, PWAs).
  // Necesario también para que la PWA cargada desde el dominio (túnel) pueda
  // pegarle al listener HTTPS de LAN (otro origen) cuando detecta la red local.
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

  // Config pública para el cliente (sin auth): la PWA la lee al arrancar para
  // saber qué URL LAN-directa probar (LAN-first con fallback al origen/túnel).
  fastify.get('/api/client-config', async () => ({ lanUrl: opts.lanUrl || null }));

  // Auth (login + refresh, no requieren JWT previo)
  registerAuthRoutes(fastify, opts.dataSource);

  // RPC (requiere JWT — el middleware se aplica via onRequest hook).
  registerRpcRoute(fastify, opts.dataSource);

  // Files (requiere JWT)
  registerFileRoutes(fastify, opts.dataSource);

  // KDS: stream SSE para pantallas web en tiempo real (auth por token en query)
  registerKdsSseRoutes(fastify);

  // F2 (mobile PWA): servir el bundle estático de projects/mobile en `/`.
  if (opts.staticRoot && existsSync(opts.staticRoot)) {
    await fastify.register(fastifyStatic, {
      root: opts.staticRoot,
      prefix: '/',
      wildcard: false,
      index: ['index.html'],
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
    fastify.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api')) {
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        return (reply as any).sendFile('index.html');
      }
      reply.code(404);
      return { error: 'not_found' };
    });
  }

  return fastify;
}

export async function startServer(opts: ServerOptions): Promise<FastifyInstance> {
  if (instances.length) {
    console.log('[server] Ya estaba arrancado, ignorando startServer.');
    return instances[0];
  }

  const host = opts.host || '0.0.0.0';

  // Listener HTTP (siempre) — lo usa el túnel Cloudflare y el acceso LAN HTTP.
  const httpFastify = await buildInstance(opts, null);
  await httpFastify.listen({ port: opts.port, host });
  instances.push(httpFastify);
  console.log(`[server] Fastify escuchando en http://${host}:${opts.port}`);

  // Listener HTTPS (opcional) — LAN-directo con cert válido (latencia baja).
  if (opts.certPath && opts.keyPath && existsSync(opts.certPath) && existsSync(opts.keyPath)) {
    try {
      const httpsPort = opts.httpsPort || 7443;
      const httpsFastify = await buildInstance(opts, {
        key: readFileSync(opts.keyPath),
        cert: readFileSync(opts.certPath),
      });
      await httpsFastify.listen({ port: httpsPort, host });
      instances.push(httpsFastify);
      console.log(`[server] Fastify HTTPS (LAN directo) escuchando en https://${host}:${httpsPort}`);
    } catch (e) {
      console.error('[server] No se pudo abrir el listener HTTPS (cert inválido?):', e);
    }
  } else if (opts.certPath || opts.keyPath) {
    console.warn('[server] HTTPS configurado pero falta el cert/key en disco; se sirve solo HTTP.');
  }

  console.log(`[server] handlerRegistry: ${handlerRegistryCount()} channels disponibles via /api/rpc`);
  return instances[0];
}

export async function stopServer(): Promise<void> {
  if (!instances.length) return;
  await Promise.all(instances.map((i) => i.close()));
  instances.length = 0;
  console.log('[server] Detenido.');
}

export function getServerInstance(): FastifyInstance | null {
  return instances[0] || null;
}
