import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import { DataSource, MoreThan } from 'typeorm';
import { CuentaCliente } from '../../src/app/database/entities/pedidos-online/cuenta-cliente.entity';
import { CodigoOtp } from '../../src/app/database/entities/pedidos-online/codigo-otp.entity';
import { hashPassword, verifyPassword } from '../utils/password.utils';
import { sendWhatsappOtp, otpWhatsappDisponible } from '../utils/whatsapp-sender';
import { signCustomerToken } from '../utils/customer-jwt.utils';
import {
  issueCustomerRefreshToken,
  rotateCustomerRefreshToken,
  revokeCustomerRefreshToken,
  revokeAllCustomerRefreshTokens,
} from '../utils/customer-refresh-token.utils';
import { registerPublicOperation } from '../server/public-routes';
import { loginBloqueado, registrarLoginFallido, registrarLoginOk, otpIpPermitido } from '../utils/tienda-limites';

/**
 * Auth de CLIENTE FINAL (web de pedidos) — Fase 2.
 *
 * Flujos (todos vía superficie pública `/pub/rpc`, NUNCA `/api/rpc`):
 *  - auth.otp.request  → genera y envía OTP por WhatsApp
 *  - auth.otp.verify   → verifica OTP, crea/loguea la cuenta, emite JWT de cliente
 *  - auth.login        → login por teléfono/email + password
 *  - auth.me           → datos de la cuenta actual (requiere JWT de cliente)
 *  - auth.perfil.update→ setear nombre/email/password (requiere JWT de cliente)
 *
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
 */

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutos
const OTP_MAX_INTENTOS = 5;
const OTP_MAX_POR_DIA_TELEFONO = 10;
const otpMaxGlobalDia = (): number => Number(process.env['FRC_OTP_MAX_GLOBAL_DIA']) || 300;
const OTP_MAX_POR_MINUTO = 3;

/** Normaliza a solo dígitos (código de país incluido). */
function normalizarTelefono(t: string): string {
  return String(t || '').replace(/\D+/g, '');
}

function generarCodigoOtp(): string {
  // 6 dígitos, con ceros a la izquierda. crypto para no ser predecible.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function mapCuenta(c: CuentaCliente): any {
  return {
    id: c.id,
    telefono: c.telefono,
    telefonoVerificado: c.telefonoVerificado,
    email: c.email ?? null,
    nombre: c.nombre ?? null,
    clienteId: (c.cliente as any)?.id ?? null,
    // Sólo si tiene contraseña, nunca el hash: la UI necesita saber si pedir la
    // actual antes de dejar cambiarla.
    tienePassword: !!c.passwordHash,
  };
}

export function registerPedidosOnlineAuthHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => any,
): void {
  const cuentaRepo = () => dataSource.getRepository(CuentaCliente);
  const otpRepo = () => dataSource.getRepository(CodigoOtp);

  // Emite access + refresh token para una cuenta ya autenticada.
  async function emitirSesion(cuenta: CuentaCliente): Promise<any> {
    const accessToken = await signCustomerToken({
      sub: cuenta.id,
      tel: cuenta.telefono,
      clienteId: (cuenta.cliente as any)?.id ?? null,
    });
    const refresh = await issueCustomerRefreshToken(dataSource, cuenta);
    return {
      accessToken,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
      cuenta: mapCuenta(cuenta),
    };
  }

  // ============== OTP REQUEST ==============
  ipcMain.handle('pub-otp-request', async (_event: any, telefonoRaw: string) => {
    const telefono = normalizarTelefono(telefonoRaw);
    if (telefono.length < 6) {
      return { success: false, error: 'telefono_invalido' };
    }
    if (!otpWhatsappDisponible()) {
      return { success: false, error: 'otp_no_disponible' };
    }

    // Anti-spam: máximo N OTP por minuto por teléfono.
    const desde = new Date(Date.now() - 60_000);
    const recientes = await otpRepo().count({
      where: { telefono, createdAt: MoreThan(desde) as any },
    });
    if (recientes >= OTP_MAX_POR_MINUTO) {
      return { success: false, error: 'demasiadas_solicitudes' };
    }
    // Topes diarios (PLAN-tienda-online F1): por teléfono y global, para que nadie
    // dispare plantillas pagas de WhatsApp a muchos números.
    const hace24h = new Date(Date.now() - 24 * 60 * 60_000);
    const delDia = await otpRepo().count({ where: { telefono, createdAt: MoreThan(hace24h) as any } });
    if (delDia >= OTP_MAX_POR_DIA_TELEFONO) {
      return { success: false, error: 'demasiadas_solicitudes' };
    }
    const globalDia = await otpRepo().count({ where: { createdAt: MoreThan(hace24h) as any } });
    if (globalDia >= otpMaxGlobalDia()) {
      console.warn(`[otp] tope global diario alcanzado (${globalDia}); envío cortado.`);
      return { success: false, error: 'otp_no_disponible' };
    }
    // Por IP: 30 por hora (frena a quien rota números desde un mismo lugar).
    if (!otpIpPermitido(String(_event?._clientIp || ''))) {
      return { success: false, error: 'demasiadas_solicitudes' };
    }

    // Invalidar OTPs previos no usados de este teléfono.
    await otpRepo().update({ telefono, usado: false }, { usado: true });

    const codigo = generarCodigoOtp();
    const codigoHash = await hashPassword(codigo);
    const otp = otpRepo().create({
      telefono,
      codigoHash,
      canal: 'WHATSAPP',
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      intentos: 0,
      usado: false,
    });
    await otpRepo().save(otp);

    const envio = await sendWhatsappOtp(telefono, codigo);
    // Si el envío real falló (no dev-log), avisar al cliente en vez de dejarlo
    // esperando un código que no va a llegar.
    if (!envio.ok) {
      return { success: false, error: 'envio_fallido' };
    }
    return {
      success: true,
      canal: 'WHATSAPP',
      expiresInSeconds: OTP_TTL_MS / 1000,
      // En dev (sin credenciales) el proveedor es 'dev-log'; el front puede
      // avisar que el código se muestra en la consola del server.
      provider: envio.provider,
      // Solo en modo dev-log (FRC_OTP_DEV=1 y app sin empaquetar) devolvemos el
      // código para probar el flujo. En producción el provider nunca es dev-log.
      ...(envio.provider === 'dev-log' ? { devCodigo: codigo } : {}),
    };
  });

  // ============== OTP VERIFY ==============
  ipcMain.handle('pub-otp-verify', async (_event: any, telefonoRaw: string, codigo: string) => {
    const telefono = normalizarTelefono(telefonoRaw);
    const otp = await otpRepo().findOne({
      where: { telefono, usado: false, expiresAt: MoreThan(new Date()) as any },
      order: { createdAt: 'DESC' },
    });
    if (!otp) {
      return { success: false, error: 'otp_no_encontrado_o_expirado' };
    }
    if (otp.intentos >= OTP_MAX_INTENTOS) {
      otp.usado = true;
      await otpRepo().save(otp);
      return { success: false, error: 'demasiados_intentos' };
    }

    const ok = await verifyPassword(String(codigo || ''), otp.codigoHash);
    if (!ok) {
      otp.intentos += 1;
      await otpRepo().save(otp);
      return { success: false, error: 'codigo_incorrecto', intentosRestantes: OTP_MAX_INTENTOS - otp.intentos };
    }

    otp.usado = true;
    await otpRepo().save(otp);

    // Get-or-create de la cuenta.
    let cuenta = await cuentaRepo().findOne({ where: { telefono }, relations: ['cliente'] });
    if (!cuenta) {
      cuenta = cuentaRepo().create({ telefono, telefonoVerificado: true, activo: true });
    }
    cuenta.telefonoVerificado = true;
    cuenta.ultimoLogin = new Date();
    cuenta = await cuentaRepo().save(cuenta);

    return { success: true, ...(await emitirSesion(cuenta)) };
  });

  // ============== LOGIN POR PASSWORD ==============
  ipcMain.handle('pub-cliente-login-password', async (event: any, identificador: string, password: string) => {
    const ip = String(event?._clientIp || '');
    const idRaw = String(identificador || '').trim();
    if (!idRaw || !password) return { success: false, error: 'credenciales_incompletas' };

    // El identificador puede ser teléfono (dígitos) o email.
    const telefono = normalizarTelefono(idRaw);
    const esEmail = idRaw.includes('@');
    const cuenta = esEmail
      ? await cuentaRepo().findOne({ where: { email: idRaw.toLowerCase() }, relations: ['cliente'] })
      : await cuentaRepo().findOne({ where: { telefono }, relations: ['cliente'] });

    // Anti fuerza bruta (PLAN-tienda-online A1.3): por cuenta+IP y por IP.
    const bloqueo = loginBloqueado(cuenta?.id ?? null, ip);
    if (bloqueo) return { success: false, error: 'demasiados_intentos' };
    if (!cuenta || !cuenta.activo || !cuenta.passwordHash) {
      registrarLoginFallido(cuenta?.id ?? null, ip);
      return { success: false, error: 'cuenta_o_password_invalidos' };
    }
    const ok = await verifyPassword(password, cuenta.passwordHash);
    if (!ok) {
      registrarLoginFallido(cuenta.id, ip);
      return { success: false, error: 'cuenta_o_password_invalidos' };
    }
    registrarLoginOk(cuenta.id, ip);

    cuenta.ultimoLogin = new Date();
    await cuentaRepo().save(cuenta);

    return { success: true, ...(await emitirSesion(cuenta)) };
  });

  // ============== REFRESH (rotación de refresh token) ==============
  ipcMain.handle('pub-cliente-refresh', async (_event: any, refreshToken: string) => {
    const rotated = await rotateCustomerRefreshToken(dataSource, refreshToken);
    if (!rotated) return { success: false, error: 'refresh_invalido_o_expirado' };
    // Recargar cuenta con relación cliente para el JWT nuevo.
    const cuenta = await cuentaRepo().findOne({ where: { id: rotated.cuenta.id }, relations: ['cliente'] });
    if (!cuenta || !cuenta.activo) return { success: false, error: 'cuenta_invalida' };
    const accessToken = await signCustomerToken({
      sub: cuenta.id,
      tel: cuenta.telefono,
      clienteId: (cuenta.cliente as any)?.id ?? null,
    });
    return {
      success: true,
      accessToken,
      refreshToken: rotated.refresh.token,
      refreshTokenExpiresAt: rotated.refresh.expiresAt.toISOString(),
      cuenta: mapCuenta(cuenta),
    };
  });

  // ============== LOGOUT (revoca refresh token) ==============
  ipcMain.handle('pub-cliente-logout', async (_event: any, refreshToken: string) => {
    if (refreshToken) await revokeCustomerRefreshToken(dataSource, refreshToken);
    return { success: true };
  });

  // ============== ME (requiere JWT de cliente) ==============
  ipcMain.handle('pub-cliente-me', async (event: any) => {
    const customerId = event?._customerId;
    if (!customerId) return { success: false, error: 'no_autenticado' };
    const cuenta = await cuentaRepo().findOne({ where: { id: customerId }, relations: ['cliente'] });
    // Cuenta dada de baja: no sigue operando con un token viejo (PLAN-tienda-online A1).
    if (!cuenta || !cuenta.activo) return { success: false, error: 'cuenta_no_encontrada' };
    return { success: true, cuenta: mapCuenta(cuenta) };
  });

  // ============== PERFIL UPDATE (nombre/email/password) ==============
  ipcMain.handle('pub-cliente-perfil-update', async (event: any, data: any) => {
    const customerId = event?._customerId;
    if (!customerId) return { success: false, error: 'no_autenticado' };
    const cuenta = await cuentaRepo().findOne({ where: { id: customerId }, relations: ['cliente'] });
    // Cuenta dada de baja: no sigue operando con un token viejo (PLAN-tienda-online A1).
    if (!cuenta || !cuenta.activo) return { success: false, error: 'cuenta_no_encontrada' };

    if (data?.nombre !== undefined) cuenta.nombre = data.nombre ? String(data.nombre).toUpperCase() : undefined;
    if (data?.email !== undefined) {
      const email = data.email ? String(data.email).toLowerCase().trim() : undefined;
      if (email) {
        // Unicidad de email entre cuentas.
        const existe = await cuentaRepo()
          .createQueryBuilder('c')
          .where('LOWER(c.email) = :email', { email })
          .andWhere('c.id != :id', { id: cuenta.id })
          .getOne();
        if (existe) return { success: false, error: 'email_en_uso' };
      }
      // Cambiar el email lo desverifica (y así Google no puede tomar la cuenta por el nuevo).
      if ((email || null) !== (cuenta.email ? cuenta.email.toLowerCase() : null)) {
        cuenta.email = email;
        cuenta.emailVerificado = false;
      }
    }
    let cambioPassword = false;
    if (data?.password) {
      // Exigir la contraseña actual cuando ya hay una. Sin esto, un access token
      // robado -30 minutos de vida- alcanzaba para quedarse con la cuenta de
      // forma permanente, incluso después de que el dueño cerrara la sesión.
      if (cuenta.passwordHash) {
        const actual = String(data.passwordActual || '');
        if (!actual) return { success: false, error: 'falta_password_actual' };
        const coincide = await verifyPassword(actual, cuenta.passwordHash);
        if (!coincide) return { success: false, error: 'password_actual_incorrecta' };
      }
      cuenta.passwordHash = await hashPassword(String(data.password));
      cambioPassword = true;
    }
    const saved = await cuentaRepo().save(cuenta);
    // Cambio de contraseña: se cierran las demás sesiones (refresh tokens). La actual
    // sigue con su access token hasta que venza y se vuelve a loguear con la nueva.
    if (cambioPassword) await revokeAllCustomerRefreshTokens(dataSource, saved.id);
    return { success: true, cuenta: mapCuenta(saved) };
  });

  // ============== REGISTRO POR EMAIL + PASSWORD ==============
  ipcMain.handle('pub-cliente-registrar', async (_event: any, data: any) => {
    const email = String(data?.email || '').trim().toLowerCase();
    const password = String(data?.password || '');
    const nombre = data?.nombre ? String(data.nombre).toUpperCase() : undefined;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: 'email_invalido' };
    if (password.length < 6) return { success: false, error: 'password_corto' };

    const existe = await cuentaRepo()
      .createQueryBuilder('c')
      .where('LOWER(c.email) = :email', { email })
      .getOne();
    if (existe) return { success: false, error: 'email_en_uso' };

    let cuenta = cuentaRepo().create({
      email,
      passwordHash: await hashPassword(password),
      nombre,
      activo: true,
      ultimoLogin: new Date(),
    });
    cuenta = await cuentaRepo().save(cuenta);
    return { success: true, ...(await emitirSesion(cuenta)) };
  });

  // ============== LOGIN CON GOOGLE (credential-ready) ==============
  ipcMain.handle('pub-cliente-google', async (_event: any, idToken: string) => {
    const clientId = process.env['GOOGLE_CLIENT_ID'];
    if (!clientId) return { success: false, error: 'google_no_configurado' };
    if (!idToken) return { success: false, error: 'token_faltante' };
    try {
      // Verificación vía endpoint tokeninfo de Google (sin dependencia extra).
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!res.ok) return { success: false, error: 'google_token_invalido' };
      const info: any = await res.json();
      if (info.aud !== clientId) return { success: false, error: 'google_aud_mismatch' };
      const email = String(info.email || '').trim().toLowerCase();
      // `email_verified` llega como string desde tokeninfo. Comparar contra
      // 'false' fallaba ABIERTO: undefined, un booleano nativo o el campo
      // ausente pasaban como verificados. Se exige el 'true' explícito.
      if (!email || String(info.email_verified) !== 'true') {
        return { success: false, error: 'google_email_no_verificado' };
      }

      let cuenta = await cuentaRepo()
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.cliente', 'cliente')
        .where('LOWER(c.email) = :email', { email })
        .getOne();
      if (cuenta && !cuenta.activo) return { success: false, error: 'cuenta_invalida' };
      // Cuenta con ese email que nunca lo verificó y tiene contraseña: quien la creó no
      // demostró ser dueño del email. Google sí lo demuestra: se queda el dueño real, se
      // borra la contraseña ajena y se cierran sus sesiones (PLAN-tienda-online A1).
      if (cuenta && !cuenta.emailVerificado && cuenta.passwordHash) {
        cuenta.passwordHash = null as any;
        await revokeAllCustomerRefreshTokens(dataSource, cuenta.id);
      }
      if (!cuenta) {
        cuenta = cuentaRepo().create({
          email,
          emailVerificado: true,
          nombre: info.name ? String(info.name).toUpperCase() : undefined,
          activo: true,
        });
      }
      cuenta.emailVerificado = true;
      cuenta.ultimoLogin = new Date();
      cuenta = await cuentaRepo().save(cuenta);
      return { success: true, ...(await emitirSesion(cuenta)) };
    } catch (e: any) {
      console.error('[pub-cliente-google] error:', e?.message || e);
      return { success: false, error: 'google_error' };
    }
  });

  // ---- Registrar en la superficie pública ----
  registerPublicOperation('auth.registrar', { channel: 'pub-cliente-registrar', requiresAuth: false, description: 'Registro por email + password.' });
  registerPublicOperation('auth.google', { channel: 'pub-cliente-google', requiresAuth: false, description: 'Login con Google (ID token).' });
  registerPublicOperation('auth.otp.request', { channel: 'pub-otp-request', requiresAuth: false, description: 'Solicitar OTP por WhatsApp.' });
  registerPublicOperation('auth.otp.verify', { channel: 'pub-otp-verify', requiresAuth: false, description: 'Verificar OTP y emitir JWT de cliente.' });
  registerPublicOperation('auth.login', { channel: 'pub-cliente-login-password', requiresAuth: false, description: 'Login por teléfono/email + password.' });
  registerPublicOperation('auth.refresh', { channel: 'pub-cliente-refresh', requiresAuth: false, description: 'Rotar refresh token → nuevo access token.' });
  registerPublicOperation('auth.logout', { channel: 'pub-cliente-logout', requiresAuth: false, description: 'Revocar refresh token.' });
  registerPublicOperation('auth.me', { channel: 'pub-cliente-me', requiresAuth: true, description: 'Datos de la cuenta autenticada.' });
  registerPublicOperation('auth.perfil.update', { channel: 'pub-cliente-perfil-update', requiresAuth: true, description: 'Actualizar nombre/email/password.' });
}
