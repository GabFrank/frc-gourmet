import { FastifyInstance } from 'fastify';
import { saveFileToBucket } from '../utils/file-save.utils';
import { addFileToSession, getQrUploadSession } from './qr-upload-store';

/**
 * Rutas de subida por QR — usadas por la PWA mobile cuando el usuario escanea
 * el QR mostrado en el desktop.
 *
 * NO llevan JWT: el `sessionId` (aleatorio, de vida corta, carpeta fija) ES la
 * credencial. El celular sólo escribe un archivo a disco vía la lógica
 * compartida `saveFileToBucket` (misma que el handler IPC `save-file`) y el
 * resultado queda en el store para que el desktop lo recoja por polling.
 * El rate-limit global (300 req/min) y el bodyLimit de 50MB ya aplican.
 */
export function registerQrUploadRoutes(fastify: FastifyInstance): void {
  // Metadata de la sesión — la página mobile la lee para auto-configurarse.
  fastify.get<{ Params: { sessionId: string } }>('/api/qr-upload/:sessionId', async (request, reply) => {
    const s = getQrUploadSession(request.params.sessionId);
    if (!s) {
      reply.code(404);
      return { valid: false, error: 'sesion_invalida_o_expirada' };
    }
    return {
      valid: true,
      carpeta: s.carpeta,
      accept: s.accept,
      maxSizeMB: s.maxSizeMB,
      expiresAt: s.expiresAt,
      uploadedCount: s.files.length,
    };
  });

  // Recibe un archivo (base64) y lo guarda en el bucket fijado por la sesión.
  fastify.post<{ Params: { sessionId: string }; Body: { base64?: string; fileName?: string } }>(
    '/api/qr-upload/:sessionId',
    async (request, reply) => {
      const s = getQrUploadSession(request.params.sessionId);
      if (!s) {
        reply.code(404);
        return { ok: false, error: 'sesion_invalida_o_expirada' };
      }
      const { base64, fileName } = request.body || {};
      if (!base64 || typeof base64 !== 'string') {
        reply.code(400);
        return { ok: false, error: 'sin_contenido' };
      }

      // Límite de tamaño por sesión (aprox — base64 infla ~33%). El bodyLimit
      // global de 50MB ya corta los excesos gruesos antes de llegar acá.
      const cleanLen = base64.replace(/^data:[^;]+;base64,/, '').length;
      const approxBytes = Math.floor(cleanLen * 0.75);
      if (approxBytes > s.maxSizeMB * 1024 * 1024) {
        reply.code(413);
        return { ok: false, error: 'archivo_muy_grande' };
      }

      try {
        // La carpeta la fija el desktop al crear la sesión — el celular NO la elige.
        const file = await saveFileToBucket({
          carpeta: s.carpeta,
          base64,
          fileName: fileName || 'archivo',
          generateThumbnails: true,
        });
        addFileToSession(s.id, file);
        return { ok: true, file };
      } catch (e: any) {
        console.error('[qr-upload] error guardando archivo:', e);
        reply.code(500);
        return { ok: false, error: e?.message || 'error_guardando' };
      }
    },
  );
}
