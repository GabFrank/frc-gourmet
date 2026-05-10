import { FastifyInstance } from 'fastify';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { LoginSession } from '../../src/app/database/entities/auth/login-session.entity';
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
        },
      },
    },
  }, async (request, reply) => {
    const { nickname, password, deviceInfo } = request.body;
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

    // Generar access token via @fastify/jwt (15min default)
    const accessToken = await reply.jwtSign({
      id: usuario.id,
      nickname: usuario.nickname,
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
  fastify.post<{ Body: { refreshToken: string } }>('/api/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: { refreshToken: { type: 'string', minLength: 1 } },
      },
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body;
    const ip = request.ip;
    const userAgent = request.headers['user-agent'] || '';
    const rotated = await rotateRefreshToken(dataSource, refreshToken, { ip, userAgent });
    if (!rotated) {
      reply.code(401);
      return { error: 'refresh_invalido_o_expirado' };
    }
    // Hidratar el usuario para el access token nuevo
    const userRepo = dataSource.getRepository(Usuario);
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
    const accessToken = await reply.jwtSign({ id: usuario.id, nickname: usuario.nickname });
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
