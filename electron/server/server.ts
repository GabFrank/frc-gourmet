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
import { existsSync } from 'fs';
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
  /**
   * F2 (mobile PWA): carpeta con el bundle Angular de `projects/mobile`
   * (`dist/mobile`). Si existe, se sirve estáticamente en `/` para que los
   * dispositivos remotos abran la PWA desde el mismo server (same-origin con
   * la API). Si no se pasa o no existe, no se sirve nada estático.
   */
  staticRoot?: string;
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

  // F2 (mobile PWA): servir el bundle estático de projects/mobile en `/`.
  // Público (sin JWT): index.html/JS/CSS deben cargar antes del login. La API
  // (/api/*) sigue protegida por su propio onRequest hook. SPA fallback: las
  // rutas del Angular Router (GET no-/api) devuelven index.html.
  if (opts.staticRoot && existsSync(opts.staticRoot)) {
    await fastify.register(fastifyStatic, {
      root: opts.staticRoot,
      prefix: '/',
      wildcard: false,
      index: ['index.html'],
      // Politica de cache: index.html NUNCA se cachea (es la fuente de verdad
      // de los hashes de los bundles; si el navegador la cachea, tras un
      // rebuild pediria bundles con hash viejo y daria 404 -> pantalla en
      // blanco). Los demas archivos llevan hash en el nombre -> seguros para
      // cachear agresivo (`immutable`).
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
    console.log(`[server] PWA mobile servida desde ${opts.staticRoot} en /`);
  } else {
    console.log('[server] dist/mobile no encontrado; PWA no se sirve (correr `ng build mobile`).');
  }

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
