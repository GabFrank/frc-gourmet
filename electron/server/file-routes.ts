import { FastifyInstance } from 'fastify';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Adjunto } from '../../src/app/database/entities/shared/adjunto.entity';

const ALLOWED_CARPETAS = new Set([
  'adjuntos',
  'profile-images',
  'producto-images',
  'producto-thumbs',
  'sabores',
  'presentaciones',
  'funcionario-documentos',
]);

function urlToAbsolute(url: string): string | null {
  if (!url || !url.startsWith('app://')) return null;
  const rest = url.replace(/^app:\/\//, '');
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const carpeta = rest.substring(0, slash);
  const relPath = rest.substring(slash + 1);
  const top = carpeta.split('/')[0];
  if (!ALLOWED_CARPETAS.has(top)) return null;
  return path.join(app.getPath('userData'), carpeta, relPath);
}

/**
 * GET /api/files/:id — devuelve el binario del adjunto.
 *
 * Requiere JWT (onRequest hook). Casos de retorno:
 *   200 + stream binario + Content-Type real
 *   401 si no auth
 *   404 si el adjunto no existe
 *   404 si el archivo en disco no existe (deja una huella en el log)
 *   400 si el path resuelto sale del scope app://
 */
export function registerFileRoutes(fastify: FastifyInstance, dataSource: DataSource): void {
  fastify.get<{ Params: { id: string } }>('/api/files/:id', {
    onRequest: [(fastify as any).authenticate],
  }, async (request, reply) => {
    const idNum = Number(request.params.id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      reply.code(400);
      return { error: 'id_invalido' };
    }
    const repo = dataSource.getRepository(Adjunto);
    const adj = await repo.findOne({ where: { id: idNum } });
    if (!adj) {
      reply.code(404);
      return { error: 'adjunto_no_encontrado' };
    }
    const abs = urlToAbsolute(adj.archivoUrl);
    if (!abs) {
      reply.code(400);
      return { error: 'archivo_url_fuera_de_scope' };
    }
    if (!fs.existsSync(abs)) {
      console.warn(`[server/files] adjunto ${idNum} apunta a archivo inexistente: ${abs}`);
      reply.code(404);
      return { error: 'archivo_no_encontrado' };
    }
    const mime = adj.mimeType || 'application/octet-stream';
    reply.type(mime);
    if (adj.nombreArchivo) {
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(adj.nombreArchivo)}"`);
    }
    return reply.send(fs.createReadStream(abs));
  });

  /**
   * GET /api/files/by-url?url=app://carpeta/file.jpg&token=<jwt>
   *
   * F4 image URL switch: las entidades guardan `imageUrl=app://producto-images/...`
   * y en modo cliente el renderer no puede resolver `app://` (no hay BD ni
   * filesystem local). Este endpoint resuelve la URL `app://` contra
   * `userData/<carpeta>/<file>` del server y devuelve el binario.
   *
   * Acepta JWT via Authorization header O query `?token=` (porque `<img src>`
   * no permite custom headers).
   */
  fastify.get<{ Querystring: { url?: string; token?: string } }>('/api/files/by-url', async (request, reply) => {
    // Auth: header normal o ?token= en query (necesario para <img>).
    const auth = request.headers.authorization;
    let verifiedOk = false;
    if (auth && auth.startsWith('Bearer ')) {
      try { await request.jwtVerify(); verifiedOk = true; } catch { /* ignore */ }
    }
    if (!verifiedOk && request.query?.token) {
      try {
        // jwtVerify lee `Authorization`. Para el path query, decodificamos a mano.
        const fakeAuth = `Bearer ${request.query.token}`;
        (request as any).headers.authorization = fakeAuth;
        await request.jwtVerify();
        verifiedOk = true;
      } catch { /* ignore */ }
    }
    if (!verifiedOk) {
      reply.code(401);
      return { error: 'unauthorized' };
    }

    const url = request.query?.url || '';
    if (!url.startsWith('app://')) {
      reply.code(400);
      return { error: 'url_invalida' };
    }
    const abs = urlToAbsolute(url);
    if (!abs) {
      reply.code(400);
      return { error: 'archivo_url_fuera_de_scope' };
    }
    if (!fs.existsSync(abs)) {
      reply.code(404);
      return { error: 'archivo_no_encontrado' };
    }
    // MIME basico por extension. node-mime existe en deps pero evitamos importar.
    const ext = path.extname(abs).toLowerCase();
    const mimes: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
    };
    reply.type(mimes[ext] || 'application/octet-stream');
    // Cache-Control: las imagenes son inmutables (nombre con hash/uuid). Cacheamos
    // agresivo en el cliente para no re-fetchar al re-render.
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.send(fs.createReadStream(abs));
  });
}
