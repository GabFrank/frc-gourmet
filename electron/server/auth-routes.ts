import { FastifyInstance } from 'fastify';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { LoginSession } from '../../src/app/database/entities/auth/login-session.entity';
import { Dispositivo } from '../../src/app/database/entities/financiero/dispositivo.entity';
import { verifyPassword } from '../utils/password.utils';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../utils/refresh-token.utils';

interface LoginBody {
  nickname: string;
  password: string;
  deviceInfo?: { userAgent?: string; browser?: string; os?: string };
  /**
   * F5 paso 3: id del Dispositivo asignado a este cliente. El server lo
   * valida contra la tabla `dispositivos` y lo firma en el JWT para que
   * los handlers de creacion (venta/compra/conteo/comanda) lo persistan.
   * Opcional para compat con clientes pre-F5; si viene invalido se ignora.
   */
  deviceId?: number;
}

/**
 * Endpoints de auth. NO requieren JWT previo. Producen y rotan los tokens.
 *
 * - POST /api/auth/login    → usuario+password → access JWT + refresh
 * - POST /api/auth/refresh  → rotacion de refresh
 * - POST /api/auth/logout   → revoca refresh
 */
export function registerAuthRoutes(fastify: FastifyInstance, dataSource: DataSource): void {
  // ============== LOGIN ==============
  fastify.post<{ Body: LoginBody }>('/api/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['nickname', 'password'],
        properties: {
          nickname: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
          deviceInfo: { type: 'object', additionalProperties: true },
          deviceId: { type: 'integer', minimum: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { nickname, password, deviceInfo, deviceId } = request.body;
    const userRepo = dataSource.getRepository(Usuario);
    const sessionRepo = dataSource.getRepository(LoginSession);

    const usuario = await userRepo
      .createQueryBuilder('usuario')
      .leftJoinAndSelect('usuario.persona', 'persona')
      .where('LOWER(usuario.nickname) = LOWER(:nickname)', { nickname })
      .getOne();

    if (!usuario || !usuario.activo) {
      reply.code(401);
      return { error: 'usuario_no_encontrado_o_inactivo' };
    }

    const passwordValid = await verifyPassword(password, usuario.password);
    if (!passwordValid) {
      reply.code(401);
      return { error: 'password_incorrecto' };
    }

    // F5 paso 3: si el cliente envio deviceId, validar que el Dispositivo
    // exista; si no existe, ignoramos silenciosamente (la columna FK queda
    // null y no se firma en el JWT).
    let resolvedDeviceId: number | null = null;
    if (typeof deviceId === 'number') {
      const dispRepo = dataSource.getRepository(Dispositivo);
      const exists = await dispRepo.findOne({ where: { id: deviceId } });
      if (exists && exists.activo) {
        resolvedDeviceId = exists.id;
      } else {
        console.warn(`[auth/login] deviceId=${deviceId} no encontrado o inactivo; se ignora.`);
      }
    }

    // Generar access token via @fastify/jwt (15min default). Incluye device_id
    // para que /api/rpc lo lea y lo propague al handler de creacion.
    const accessToken = await reply.jwtSign({
      id: usuario.id,
      nickname: usuario.nickname,
      device_id: resolvedDeviceId,
    });

    // Generar refresh token (30d default)
    const ip = request.ip;
    const userAgent = request.headers['user-agent'] || deviceInfo?.userAgent || '';
    const refresh = await issueRefreshToken(dataSource, usuario, { ip, userAgent });

    // Crear LoginSession (para audit)
    const session = sessionRepo.create({
      usuario,
      ip_address: ip,
      user_agent: userAgent,
      device_info: JSON.stringify(deviceInfo || {}),
      login_time: new Date(),
      is_active: true,
      last_activity_time: new Date(),
      browser: deviceInfo?.browser || 'HTTP',
      os: deviceInfo?.os || 'Unknown',
    });
    const savedSession = await sessionRepo.save(session);

    return {
      success: true,
      usuario: {
        id: usuario.id,
        nickname: usuario.nickname,
        persona: usuario.persona,
      },
      accessToken,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
      sessionId: savedSession.id,
    };
  });

  // ============== REFRESH ==============
  fastify.post<{ Body: { refreshToken: string; deviceId?: number } }>('/api/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', minLength: 1 },
          // F5 paso 3: el cliente reenvia su deviceId asi el JWT nuevo lo
          // incluye y los handlers de creacion siguen recibiendo el device.
          deviceId: { type: 'integer', minimum: 1 },
        },
      },
    },
  }, async (request, reply) => {
    const { refreshToken, deviceId } = request.body;
    const ip = request.ip;
    const userAgent = request.headers['user-agent'] || '';
    const rotated = await rotateRefreshToken(dataSource, refreshToken, { ip, userAgent });
    if (!rotated) {
      reply.code(401);
      return { error: 'refresh_invalido_o_expirado' };
    }
    // Hidratar el usuario para el access token nuevo
    const refreshRepo = dataSource.getRepository(
      require('../../src/app/database/entities/auth/refresh-token.entity').RefreshToken,
    );
    const fresh = await refreshRepo.findOne({
      where: { id: rotated.refreshTokenId },
      relations: ['usuario'],
    });
    if (!fresh || !fresh.usuario) {
      reply.code(500);
      return { error: 'refresh_rotado_pero_sin_usuario' };
    }
    const usuario = fresh.usuario;

    // Re-validar el deviceId que vino del cliente (mismo flujo que /login).
    let resolvedDeviceId: number | null = null;
    if (typeof deviceId === 'number') {
      const dispRepo = dataSource.getRepository(Dispositivo);
      const exists = await dispRepo.findOne({ where: { id: deviceId } });
      if (exists && exists.activo) resolvedDeviceId = exists.id;
    }

    const accessToken = await reply.jwtSign({
      id: usuario.id,
      nickname: usuario.nickname,
      device_id: resolvedDeviceId,
    });
    return {
      accessToken,
      refreshToken: rotated.token,
      refreshTokenExpiresAt: rotated.expiresAt.toISOString(),
    };
  });

  // ============== LOGOUT ==============
  fastify.post<{ Body: { refreshToken?: string } }>('/api/auth/logout', async (request) => {
    const t = request.body?.refreshToken;
    if (t) await revokeRefreshToken(dataSource, t);
    return { success: true };
  });
}
