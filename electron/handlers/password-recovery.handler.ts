import { ipcMain } from 'electron';
import { DataSource, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { PasswordResetToken } from '../../src/app/database/entities/auth/password-reset-token.entity';
import { CanalNotificacion } from '../../src/app/database/entities/notificaciones/notificaciones-enums';
import { hashPassword, verifyPassword } from '../utils/password.utils';
import { enviarDirecto } from '../services/notificacion.service';

const CODE_TTL_MIN = 15;
const MAX_INTENTOS = 5;
const EVENTO = 'PASSWORD_RESET';

function genCode(): string {
  // 6 digitos, sin sesgo (crypto.randomInt).
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function maskEmail(email?: string): string | null {
  if (!email) return null;
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

function maskPhone(phone?: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length <= 3) return `***${digits}`;
  return `${'*'.repeat(digits.length - 3)}${digits.slice(-3)}`;
}

async function findUsuarioByNickname(dataSource: DataSource, nickname: string): Promise<Usuario | null> {
  return dataSource
    .getRepository(Usuario)
    .createQueryBuilder('usuario')
    .leftJoinAndSelect('usuario.persona', 'persona')
    .where('LOWER(usuario.nickname) = LOWER(:nickname)', { nickname })
    .getOne();
}

export function registerPasswordRecoveryHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
) {
  /**
   * Devuelve que canales tiene disponibles el usuario para recuperar la
   * contrasenha (sin exponer los datos completos). No requiere autenticacion.
   */
  ipcMain.handle('get-reset-channels', async (_event, payload: { nickname: string }) => {
    try {
      const nickname = (payload?.nickname || '').trim();
      if (!nickname) return { success: false, message: 'NICKNAME REQUERIDO' };
      const usuario = await findUsuarioByNickname(dataSource, nickname);
      if (!usuario || !usuario.activo) {
        // No revelar si existe o no: devolver sin canales.
        return { success: true, email: false, whatsapp: false };
      }
      const email = usuario.persona?.email || '';
      const telefono = usuario.persona?.telefono || '';
      return {
        success: true,
        email: !!email,
        whatsapp: !!telefono,
        emailMasked: maskEmail(email),
        phoneMasked: maskPhone(telefono),
      };
    } catch (e) {
      console.error('get-reset-channels error:', e);
      return { success: false, message: 'ERROR EN EL SERVIDOR' };
    }
  });

  /**
   * Genera un codigo de un solo uso y lo envia por el canal elegido (email o
   * whatsapp). Guarda solo el hash del codigo. No requiere autenticacion.
   */
  ipcMain.handle('request-password-reset', async (_event, payload: { nickname: string; canal: CanalNotificacion }) => {
    try {
      const nickname = (payload?.nickname || '').trim();
      const canal = payload?.canal;
      if (!nickname || !canal) return { success: false, message: 'DATOS INCOMPLETOS' };

      const usuario = await findUsuarioByNickname(dataSource, nickname);
      if (!usuario || !usuario.activo) {
        return { success: false, message: 'USUARIO NO ENCONTRADO O SIN CANAL DISPONIBLE' };
      }

      const destino =
        canal === CanalNotificacion.EMAIL ? usuario.persona?.email : usuario.persona?.telefono;
      if (!destino) {
        return { success: false, message: 'EL USUARIO NO TIENE ' + (canal === CanalNotificacion.EMAIL ? 'EMAIL' : 'TELEFONO') + ' CONFIGURADO' };
      }

      const tokenRepo = dataSource.getRepository(PasswordResetToken);
      // Invalidar tokens activos previos del usuario.
      await tokenRepo.update({ usuario: { id: usuario.id } as any, activo: true }, { activo: false });

      const code = genCode();
      const tokenHash = await hashPassword(code);
      const expiraEn = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);

      const token = tokenRepo.create({
        usuario: { id: usuario.id } as any,
        tokenHash,
        canal,
        destino,
        expiraEn,
        intentos: 0,
        usado: false,
        activo: true,
      });
      await tokenRepo.save(token);

      // Enviar el codigo (bypass del switch global: es un flujo de seguridad).
      const asunto = 'CODIGO DE RECUPERACION - FRC GOURMET';
      const texto = `Tu codigo de recuperacion de contrasenha es: ${code}\nValido por ${CODE_TTL_MIN} minutos.\nSi no solicitaste esto, ignora este mensaje.`;
      const html = `<p>Tu codigo de recuperacion de contrasenha es:</p>`
        + `<p style="font-size:24px;font-weight:bold;letter-spacing:3px">${code}</p>`
        + `<p>Valido por ${CODE_TTL_MIN} minutos. Si no solicitaste esto, ignora este mensaje.</p>`;

      const envio = await enviarDirecto({
        canal,
        destino,
        destinoNombre: usuario.nickname,
        eventoCodigo: EVENTO,
        asunto,
        html,
        texto,
        bypassGlobal: true,
      });

      if (envio.estado !== 'ENVIADO') {
        return { success: false, message: 'NO SE PUDO ENVIAR EL CODIGO: ' + (envio.error || 'ERROR') };
      }

      const masked = canal === CanalNotificacion.EMAIL ? maskEmail(destino) : maskPhone(destino);
      return { success: true, destinoMasked: masked, expiraEnMin: CODE_TTL_MIN };
    } catch (e) {
      console.error('request-password-reset error:', e);
      return { success: false, message: 'ERROR EN EL SERVIDOR' };
    }
  });

  /**
   * Valida el codigo y cambia la contrasenha. No requiere autenticacion.
   */
  ipcMain.handle('reset-password-with-code', async (_event, payload: { nickname: string; codigo: string; newPassword: string }) => {
    try {
      const nickname = (payload?.nickname || '').trim();
      const codigo = (payload?.codigo || '').trim();
      const newPassword = payload?.newPassword || '';
      if (!nickname || !codigo || !newPassword) return { success: false, message: 'DATOS INCOMPLETOS' };
      if (newPassword.length < 4) return { success: false, message: 'LA CONTRASENHA DEBE TENER AL MENOS 4 CARACTERES' };

      const usuario = await findUsuarioByNickname(dataSource, nickname);
      if (!usuario || !usuario.activo) return { success: false, message: 'USUARIO NO ENCONTRADO' };

      const tokenRepo = dataSource.getRepository(PasswordResetToken);
      const token = await tokenRepo.findOne({
        where: { usuario: { id: usuario.id } as any, activo: true, usado: false },
        order: { id: 'DESC' },
      });
      if (!token) return { success: false, message: 'NO HAY UN CODIGO ACTIVO. SOLICITA UNO NUEVO.' };

      if (new Date() > new Date(token.expiraEn)) {
        token.activo = false;
        await tokenRepo.save(token);
        return { success: false, message: 'EL CODIGO EXPIRO. SOLICITA UNO NUEVO.' };
      }

      if (token.intentos >= MAX_INTENTOS) {
        token.activo = false;
        await tokenRepo.save(token);
        return { success: false, message: 'DEMASIADOS INTENTOS. SOLICITA UN CODIGO NUEVO.' };
      }

      const ok = await verifyPassword(codigo, token.tokenHash);
      if (!ok) {
        token.intentos += 1;
        await tokenRepo.save(token);
        const restantes = Math.max(0, MAX_INTENTOS - token.intentos);
        return { success: false, message: `CODIGO INCORRECTO. INTENTOS RESTANTES: ${restantes}` };
      }

      // Codigo valido: cambiar contrasenha.
      const userRepo = dataSource.getRepository(Usuario);
      usuario.password = await hashPassword(newPassword);
      usuario.mustChangePassword = false;
      await userRepo.save(usuario);

      token.usado = true;
      token.activo = false;
      await tokenRepo.save(token);

      return { success: true, message: 'CONTRASENHA ACTUALIZADA. YA PUEDES INICIAR SESION.' };
    } catch (e) {
      console.error('reset-password-with-code error:', e);
      return { success: false, message: 'ERROR EN EL SERVIDOR' };
    }
  });

  // Limpieza oportunista de tokens expirados (no critico).
  ipcMain.handle('cleanup-reset-tokens', async () => {
    try {
      const tokenRepo = dataSource.getRepository(PasswordResetToken);
      await tokenRepo.update({ activo: true, expiraEn: LessThan(new Date()) }, { activo: false });
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  });
}
