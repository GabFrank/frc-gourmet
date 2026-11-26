import { estadoCreditoCuenta } from '../utils/credito-tienda.utils';
import { ipcMain } from 'electron';
import * as crypto from 'crypto';
import { DataSource, In, MoreThan } from 'typeorm';
import { CuentaCliente } from '../../src/app/database/entities/pedidos-online/cuenta-cliente.entity';
import { normalizarTelefonoContacto, telefonoInternacional, variantesTelefono } from '../utils/telefono-contacto.utils';
import { CodigoOtp } from '../../src/app/database/entities/pedidos-online/codigo-otp.entity';
import { hashPassword, verifyPassword } from '../utils/password.utils';
import { sendWhatsappOtp, otpWhatsappDisponible } from '../utils/whatsapp-sender';
import { refrescarCredencialesWhatsapp } from '../utils/tienda-ingreso.utils';
import { getGoogleClientId } from '../utils/tienda-ingreso.utils';
import { signCustomerToken } from '../utils/customer-jwt.utils';
import {
  issueCustomerRefreshToken,
  rotateCustomerRefreshToken,
  revokeCustomerRefreshToken,
  revokeAllCustomerRefreshTokens,
} from '../utils/customer-refresh-token.utils';
import { registerPublicOperation } from '../server/public-routes';
import { dispatchEvento } from '../services/notificacion.service';
import { reservarIntentoLogin, confirmarLoginOk, otpIpPermitido, registroIpPermitido } from '../utils/tienda-limites';

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

/** Solo dígitos, internacional: un número local de Paraguay (0981…) se completa con 595. */
function normalizarTelefono(t: string): string {
  return telefonoInternacional(t);
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
    // Contacto sin verificar (Google/email): el checkout lo pide si no hay `telefono`.
    telefonoContacto: c.telefonoContacto ?? null,
    email: c.email ?? null,
    emailVerificado: !!c.emailVerificado,
    avisosWhatsapp: c.avisosWhatsapp ?? null,
    nombre: c.nombre ?? null,
    // El id del Cliente interno no sale a la web (auditoría F8b): es un dato del local.
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
  /** La cuenta de ese número (internacional); si no hay, la guardada con el número local viejo. */
  const buscarCuentaPorTelefono = async (telefono: string): Promise<CuentaCliente | null> => {
    const encontradas = await cuentaRepo().find({ where: { telefono: In(variantesTelefono(telefono)) }, relations: ['cliente'] });
    return encontradas.find((c) => c.telefono === telefono) ?? encontradas[0] ?? null;
  };
  const otpRepo = () => dataSource.getRepository(CodigoOtp);

  // Emite access + refresh token para una cuenta ya autenticada.
  async function emitirSesion(cuenta: CuentaCliente): Promise<any> {
    const accessToken = await signCustomerToken({
      sub: cuenta.id,
      tel: cuenta.telefono,
      // Sin el id del Cliente interno: el token lo lee el navegador (auditoría F8b).
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
  // Aviso al staff (evento TIENDA_OTP_TOPE, por el WhatsApp de avisos): una vez por día
  // al pasar el 80 % del tope global y otra al llegar. Best-effort: nunca frena el OTP.
  function avisarTopeOtp(nivel: '80' | 'tope', usados: number, tope: number): void {
    const dia = new Date().toISOString().slice(0, 10);
    const texto = nivel === 'tope'
      ? `⚠️ Tienda online: se llegó al tope de ${tope} códigos de ingreso en 24 h. Hasta que baje, nadie nuevo puede entrar por WhatsApp. Si no es una campaña, puede ser un abuso.`
      : `Tienda online: ya se pidieron ${usados} de ${tope} códigos de ingreso en 24 h (80 %). Al llegar al tope se corta el envío.`;
    dispatchEvento('TIENDA_OTP_TOPE', { asunto: 'Tienda online: códigos de ingreso', texto, dedupeKey: `${nivel}-${dia}` })
      .catch((e) => console.warn('[otp] aviso de tope falló:', e?.message || e));
  }

  ipcMain.handle('pub-otp-request', async (_event: any, telefonoRaw: string) => {
    const telefono = normalizarTelefono(telefonoRaw);
    if (telefono.length < 6) {
      return { success: false, error: 'telefono_invalido' };
    }
    // F9: Evolution se configura en Notificaciones; se relee antes de decidir.
    await refrescarCredencialesWhatsapp(dataSource);
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
    // Por IP: 30 por hora y 10 por día (frena a quien rota números desde un mismo lugar). Va
    // ANTES del tope global (F5, M-auth3): una sola IP ya no puede agotarlo para todos.
    if (!otpIpPermitido(String(_event?._clientIp || ''))) {
      return { success: false, error: 'demasiadas_solicitudes' };
    }
    const globalDia = await otpRepo().count({ where: { createdAt: MoreThan(hace24h) as any } });
    const topeGlobal = otpMaxGlobalDia();
    if (globalDia >= topeGlobal) {
      console.warn(`[otp] tope global diario alcanzado (${globalDia}); envío cortado.`);
      avisarTopeOtp('tope', globalDia, topeGlobal);
      return { success: false, error: 'otp_no_disponible' };
    }
    if (globalDia + 1 >= Math.ceil(topeGlobal * 0.8)) avisarTopeOtp('80', globalDia + 1, topeGlobal);

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
    // F5 (auditoría A-auth1): el intento se reserva con un UPDATE condicionado ANTES de
    // comparar el código. Antes el contador se leía y se escribía después de una verificación
    // asíncrona, y muchos intentos en paralelo pasaban todos el tope de 5.
    const reserva = await otpRepo().createQueryBuilder().update(CodigoOtp)
      .set({ intentos: () => 'intentos + 1' } as any)
      .where('id = :id AND usado = :no AND intentos < :max', { id: otp.id, no: false, max: OTP_MAX_INTENTOS })
      .execute();
    if (!reserva.affected) {
      await otpRepo().update({ id: otp.id }, { usado: true } as any);
      return { success: false, error: 'demasiados_intentos' };
    }
    const intentosUsados = otp.intentos + 1;

    const ok = await verifyPassword(String(codigo || ''), otp.codigoHash);
    if (!ok) {
      return { success: false, error: 'codigo_incorrecto', intentosRestantes: Math.max(0, OTP_MAX_INTENTOS - intentosUsados) };
    }

    // Se consume una sola vez: dos verificaciones correctas a la vez no abren dos sesiones.
    const consumo = await otpRepo().createQueryBuilder().update(CodigoOtp)
      .set({ usado: true } as any)
      .where('id = :id AND usado = :no', { id: otp.id, no: false })
      .execute();
    if (!consumo.affected) return { success: false, error: 'otp_no_encontrado_o_expirado' };

    // Get-or-create de la cuenta. Una cuenta vieja guardada con el número local (0981…) es la
    // misma persona: se la encuentra y se le pasa el número al formato internacional.
    let cuenta = await buscarCuentaPorTelefono(telefono);
    if (!cuenta) {
      cuenta = cuentaRepo().create({ telefono, telefonoVerificado: true, activo: true });
    } else if (cuenta.telefono !== telefono) {
      cuenta.telefono = telefono;
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
      : await buscarCuentaPorTelefono(telefono);

    // Anti fuerza bruta (PLAN-tienda-online A1.3): por cuenta+IP y por IP.
    // F5 (A-auth2): el intento se reserva (cuenta como fallo) ANTES de la verificación asíncrona.
    if (!reservarIntentoLogin(cuenta?.id ?? null, ip)) return { success: false, error: 'demasiados_intentos' };
    if (!cuenta || !cuenta.activo || !cuenta.passwordHash) {
      return { success: false, error: 'cuenta_o_password_invalidos' };
    }
    const ok = await verifyPassword(password, cuenta.passwordHash);
    if (!ok) {
      return { success: false, error: 'cuenta_o_password_invalidos' };
    }
    confirmarLoginOk(cuenta.id, ip);

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
      // Sin el id del Cliente interno: el token lo lee el navegador (auditoría F8b).
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
    // F8b: si puede comprar a cuenta y cuánto le queda. Nada del saldo ni del límite exactos.
    const est = await estadoCreditoCuenta(dataSource, cuenta);
    const credito = est.habilitado ? { disponible: est.disponible, sinTope: est.disponible === null } : null;
    return { success: true, cuenta: mapCuenta(cuenta), credito };
  });

  // ============== PERFIL UPDATE (nombre/email/password) ==============
  ipcMain.handle('pub-cliente-perfil-update', async (event: any, data: any) => {
    const customerId = event?._customerId;
    if (!customerId) return { success: false, error: 'no_autenticado' };
    const cuenta = await cuentaRepo().findOne({ where: { id: customerId }, relations: ['cliente'] });
    // Cuenta dada de baja: no sigue operando con un token viejo (PLAN-tienda-online A1).
    if (!cuenta || !cuenta.activo) return { success: false, error: 'cuenta_no_encontrada' };

    if (typeof data?.avisosWhatsapp === 'boolean') cuenta.avisosWhatsapp = data.avisosWhatsapp;
    if (data?.nombre !== undefined) cuenta.nombre = data.nombre ? String(data.nombre).toUpperCase() : undefined;
    // Teléfono de contacto (sin verificar). Vacío lo borra; el de ingreso (`telefono`) no se toca acá.
    if (data?.telefonoContacto !== undefined) {
      if (!String(data.telefonoContacto ?? '').trim()) {
        cuenta.telefonoContacto = null;
      } else {
        const t = normalizarTelefonoContacto(data.telefonoContacto);
        if (t.ok === false) return { success: false, error: t.error };
        cuenta.telefonoContacto = t.telefono;
      }
    }
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
      if (String(data.password).length < 8) return { success: false, error: 'password_corto' };
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
    if (password.length < 8) return { success: false, error: 'password_corto' };
    // F5 (auditoría M-auth6): tope de altas por IP (crear cuentas en masa / enumerar emails).
    if (!registroIpPermitido(String(_event?._clientIp || ''))) return { success: false, error: 'demasiadas_solicitudes' };

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
  /** Verifica un ID token de Google y devuelve el email verificado, o el código de error. */
  const emailDeGoogle = async (idToken: string): Promise<{ email: string; nombre: string | null } | { error: string }> => {
    const clientId = getGoogleClientId();
    if (!clientId) return { error: 'google_no_configurado' };
    if (!idToken) return { error: 'token_faltante' };
    // Verificación vía endpoint tokeninfo de Google (sin dependencia extra).
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { signal: AbortSignal.timeout(10_000), redirect: 'error' });
    if (!res.ok) return { error: 'google_token_invalido' };
    const info: any = await res.json();
    if (info.aud !== clientId) return { error: 'google_aud_mismatch' };
    if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') return { error: 'google_token_invalido' };
    const email = String(info.email || '').trim().toLowerCase();
    // `email_verified` llega como string desde tokeninfo. Comparar contra
    // 'false' fallaba ABIERTO: undefined, un booleano nativo o el campo
    // ausente pasaban como verificados. Se exige el 'true' explícito.
    if (!email || String(info.email_verified) !== 'true') return { error: 'google_email_no_verificado' };
    return { email, nombre: info.name ? String(info.name) : null };
  };

  ipcMain.handle('pub-cliente-google', async (_event: any, idToken: string) => {
    try {
      const g = await emailDeGoogle(idToken);
      if ('error' in g) return { success: false, error: g.error };
      const { email } = g;
      const info = { name: g.nombre };

      let cuenta = await cuentaRepo()
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.cliente', 'cliente')
        .where('LOWER(c.email) = :email', { email })
        .getOne();
      if (cuenta && !cuenta.activo) return { success: false, error: 'cuenta_invalida' };
      // Una cuenta de teléfono que se anotó este email sin verificarlo no es del dueño del Gmail:
      // cualquiera puede escribir un email ajeno en «Mi cuenta». Entrar ahí le daría al dueño del
      // Gmail la cuenta de otro, y al otro (que sigue entrando por teléfono) los pedidos y
      // direcciones del dueño. Se le saca el email y el dueño del Gmail entra a una cuenta propia.
      // Para unir las dos, la cuenta de teléfono usa «Vincular Google», que sí lo verifica.
      if (cuenta && !cuenta.emailVerificado && cuenta.telefono) {
        await cuentaRepo().update({ id: cuenta.id }, { email: null } as any);
        cuenta = null;
      }
      // Cuenta con ese email que nunca lo verificó y tiene contraseña: quien la creó no
      // demostró ser dueño del email. Google sí lo demuestra: se queda el dueño real, se
      // borra la contraseña ajena y se cierran sus sesiones (PLAN-tienda-online A1).
      // F5 (auditoría M-auth4): también sin contraseña se cierran las sesiones previas de una
      // cuenta cuyo email nunca se verificó (quien la abrió no demostró ser el dueño).
      if (cuenta && !cuenta.emailVerificado) {
        if (cuenta.passwordHash) cuenta.passwordHash = null as any;
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
  // ============== VINCULAR GOOGLE (cuenta ya abierta) ==============
  // La cuenta abierta (por teléfono, típicamente) suma su Gmail verificado: desde ahí, «Continuar
  // con Google» entra a esta misma cuenta. Si ese Gmail ya tenía una cuenta solo de Google, se unen.
  ipcMain.handle('pub-cliente-google-vincular', async (event: any, idToken: string) => {
    const customerId = event?._customerId;
    if (!customerId) return { success: false, error: 'no_autenticado' };
    try {
      const cuenta = await cuentaRepo().findOne({ where: { id: customerId }, relations: ['cliente'] });
      if (!cuenta || !cuenta.activo) return { success: false, error: 'cuenta_no_encontrada' };
      const g = await emailDeGoogle(idToken);
      if ('error' in g) return { success: false, error: g.error };
      const otra = await cuentaRepo().createQueryBuilder('c')
        .leftJoinAndSelect('c.cliente', 'cliente')
        .where('LOWER(c.email) = :email', { email: g.email })
        .andWhere('c.id != :id', { id: cuenta.id })
        .getOne();
      // Con el email verificado en otra cuenta que tiene su propio teléfono o un cliente del local
      // vinculado, unirlas no es algo que el cliente decida solo: no se mueve.
      if (otra && otra.emailVerificado && (otra.telefono || (otra as any).cliente)) {
        return { success: false, error: 'google_en_otra_cuenta' };
      }
      await dataSource.transaction(async (m) => {
        if (otra && otra.emailVerificado) {
          // La otra es solo de Google y quien vincula acaba de demostrar que es el dueño del Gmail:
          // es la misma persona con dos cuentas. Sus pedidos pasan a esta y la otra se cierra.
          await m.query(`UPDATE "pedidos_online" SET "cuenta_cliente_id" = ${m.connection.options.type === 'postgres' ? '$1' : '?'} WHERE "cuenta_cliente_id" = ${m.connection.options.type === 'postgres' ? '$2' : '?'}`, [cuenta.id, otra.id]);
          await m.getRepository(CuentaCliente).update({ id: otra.id }, { email: null, emailVerificado: false, activo: false, passwordHash: null } as any);
          if (!cuenta.nombre && otra.nombre) cuenta.nombre = otra.nombre;
          if (!cuenta.telefonoContacto && otra.telefonoContacto) cuenta.telefonoContacto = otra.telefonoContacto;
        } else if (otra) {
          // Sin verificar, quien lo anotó no demostró ser el dueño: se le saca.
          await m.getRepository(CuentaCliente).update({ id: otra.id }, { email: null } as any);
        }
        cuenta.email = g.email;
        cuenta.emailVerificado = true;
        await m.getRepository(CuentaCliente).save(cuenta);
      });
      if (otra && otra.emailVerificado) await revokeAllCustomerRefreshTokens(dataSource, otra.id);
      return { success: true, cuenta: mapCuenta(cuenta) };
    } catch (e: any) {
      console.error('[pub-cliente-google-vincular] error:', e?.message || e);
      return { success: false, error: 'google_error' };
    }
  });

  registerPublicOperation('auth.registrar', { channel: 'pub-cliente-registrar', requiresAuth: false, description: 'Registro por email + password.' });
  registerPublicOperation('auth.google.vincular', { channel: 'pub-cliente-google-vincular', requiresAuth: true, description: 'Suma el Gmail verificado a la cuenta abierta.' });
  registerPublicOperation('auth.google', { channel: 'pub-cliente-google', requiresAuth: false, description: 'Login con Google (ID token).' });
  registerPublicOperation('auth.otp.request', { channel: 'pub-otp-request', requiresAuth: false, description: 'Solicitar OTP por WhatsApp.' });
  registerPublicOperation('auth.otp.verify', { channel: 'pub-otp-verify', requiresAuth: false, description: 'Verificar OTP y emitir JWT de cliente.' });
  registerPublicOperation('auth.login', { channel: 'pub-cliente-login-password', requiresAuth: false, description: 'Login por teléfono/email + password.' });
  registerPublicOperation('auth.refresh', { channel: 'pub-cliente-refresh', requiresAuth: false, description: 'Rotar refresh token → nuevo access token.' });
  registerPublicOperation('auth.logout', { channel: 'pub-cliente-logout', requiresAuth: false, description: 'Revocar refresh token.' });
  registerPublicOperation('auth.me', { channel: 'pub-cliente-me', requiresAuth: true, description: 'Datos de la cuenta autenticada.' });
  registerPublicOperation('auth.perfil.update', { channel: 'pub-cliente-perfil-update', requiresAuth: true, description: 'Actualizar nombre/email/password/teléfono de contacto.' });
}
