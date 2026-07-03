import { FastifyInstance } from 'fastify';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { DeviceAuthCode } from '../../src/app/database/entities/auth/device-auth-code.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { LoginSession } from '../../src/app/database/entities/auth/login-session.entity';
import { issueRefreshToken } from '../utils/refresh-token.utils';

/**
 * Login por QR (Device Authorization Grant) para vincular un dispositivo
 * (TV KDS / desktop) sin tipear credenciales.
 *
 *   POST /api/auth/device/start   (público)   → { deviceCode, qr, expiresIn }
 *   POST /api/auth/device/approve (autenticado)→ marca APPROVED con el usuario
 *   POST /api/auth/device/token   (poll)       → pending | approved(+tokens) | ...
 *
 * El dispositivo queda logueado como el usuario que aprobó. El code es efímero
 * (~3 min) y de un solo uso. El QR codifica el deviceCode crudo → el escáner del
 * PWA (same-origin) lo lee y llama a approve.
 */
const CODE_TTL_MS = 3 * 60 * 1000; // 3 minutos
const POLL_INTERVAL_S = 3;

export function registerDeviceAuthRoutes(fastify: FastifyInstance, dataSource: DataSource): void {
  const repo = () => dataSource.getRepository(DeviceAuthCode);

  // ── START (público, rate-limit global) ────────────────────────────────────
  fastify.post<{ Body: { deviceInfo?: any } }>('/api/auth/device/start', async (request) => {
    const deviceCode = randomBytes(24).toString('base64url');
    const now = Date.now();
    const entity = repo().create({
      deviceCode,
      estado: 'PENDING',
      deviceInfo: JSON.stringify((request.body as any)?.deviceInfo || {}),
      expiresAt: new Date(now + CODE_TTL_MS),
    });
    await repo().save(entity);
    let qr = '';
    try {
      qr = await QRCode.toDataURL(deviceCode, { margin: 1, width: 320 });
    } catch { /* si falla el QR, el dispositivo puede mostrar el code como texto */ }
    return { deviceCode, qr, expiresIn: Math.floor(CODE_TTL_MS / 1000), pollInterval: POLL_INTERVAL_S };
  });

  // ── APPROVE (autenticado: el que escanea aprueba con su JWT) ──────────────
  fastify.post<{ Body: { deviceCode: string } }>('/api/auth/device/approve', {
    onRequest: [(fastify as any).authenticate],
    schema: {
      body: { type: 'object', required: ['deviceCode'], properties: { deviceCode: { type: 'string', minLength: 1 } } },
    },
  }, async (request, reply) => {
    const { deviceCode } = request.body;
    const entity = await repo().findOne({ where: { deviceCode } });
    if (!entity) { reply.code(404); return { error: 'codigo_no_encontrado' }; }
    if (entity.estado !== 'PENDING') { reply.code(409); return { error: 'codigo_ya_procesado' }; }
    if (entity.expiresAt.getTime() < Date.now()) { reply.code(410); return { error: 'codigo_expirado' }; }

    const approverId = (request as any).user?.id;
    if (!approverId) { reply.code(401); return { error: 'no_autenticado' }; }

    entity.estado = 'APPROVED';
    entity.usuarioId = approverId;
    entity.approvedAt = new Date();
    await repo().save(entity);
    return { success: true };
  });

  // ── TOKEN / POLL (público: el dispositivo consulta hasta ser aprobado) ────
  fastify.post<{ Body: { deviceCode: string } }>('/api/auth/device/token', {
    schema: {
      body: { type: 'object', required: ['deviceCode'], properties: { deviceCode: { type: 'string', minLength: 1 } } },
    },
  }, async (request, reply) => {
    const { deviceCode } = request.body;
    const entity = await repo().findOne({ where: { deviceCode } });
    if (!entity) { reply.code(404); return { status: 'not_found' }; }
    if (entity.estado === 'CONSUMED') { reply.code(410); return { status: 'consumed' }; }
    if (entity.estado === 'PENDING') {
      if (entity.expiresAt.getTime() < Date.now()) return { status: 'expired' };
      return { status: 'pending' };
    }

    // APPROVED → emitir tokens (como el usuario que aprobó) y consumir el code.
    const usuario = await dataSource.getRepository(Usuario).findOne({
      where: { id: entity.usuarioId as number },
      relations: ['persona'],
    });
    if (!usuario || !usuario.activo) {
      reply.code(401);
      return { status: 'error', error: 'usuario_invalido' };
    }

    const accessToken = await reply.jwtSign({
      id: usuario.id,
      nickname: usuario.nickname,
      device_id: null,
    });
    const refresh = await issueRefreshToken(dataSource, usuario, {
      ip: request.ip,
      userAgent: request.headers['user-agent'] || 'device-qr',
    });

    // LoginSession para audit (igual que el login normal).
    const sessionRepo = dataSource.getRepository(LoginSession);
    const session = sessionRepo.create({
      usuario,
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] || 'device-qr',
      device_info: entity.deviceInfo || '{}',
      login_time: new Date(),
      is_active: true,
      last_activity_time: new Date(),
      browser: 'QR-DEVICE',
      os: 'Unknown',
    });
    const savedSession = await sessionRepo.save(session);

    entity.estado = 'CONSUMED';
    entity.consumedAt = new Date();
    await repo().save(entity);

    return {
      status: 'approved',
      accessToken,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
      sessionId: savedSession.id,
      usuario: { id: usuario.id, nickname: usuario.nickname, persona: usuario.persona },
    };
  });
}
