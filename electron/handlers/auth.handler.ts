import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { LoginSession } from '../../src/app/database/entities/auth/login-session.entity';
import * as jwt from 'jsonwebtoken';


// JWT Secret and Expiration - Consider moving to environment variables or a config file
const JWT_SECRET = 'frc-gourmet-secret-key';
const TOKEN_EXPIRATION = '7d';

export function registerAuthHandlers(
    dataSource: DataSource,
    getCurrentUser: () => Usuario | null, // Function to get the current user
    setCurrentUser: (user: Usuario | null) => void // Function to set the current user
) {

  ipcMain.handle('login', async (_event: any, loginData: any) => {
    try {
      const { nickname, password, deviceInfo } = loginData;
      const userRepository = dataSource.getRepository(Usuario);
      const sessionRepository = dataSource.getRepository(LoginSession);

      // Find user case-insensitively
      const usuario = await userRepository.createQueryBuilder('usuario')
        .leftJoinAndSelect('usuario.persona', 'persona')
        .where('LOWER(usuario.nickname) = LOWER(:nickname)', { nickname: nickname })
        .getOne();

      if (!usuario || !usuario.activo) {
        return { success: false, message: 'Usuario no encontrado o inactivo' };
      }

      // Basic password check (replace with bcrypt in production)
      const passwordValid = password === usuario.password;
      if (!passwordValid) {
        return { success: false, message: 'Contraseña incorrecta' };
      }

      // Generate JWT
      const token = jwt.sign(
        { id: usuario.id, nickname: usuario.nickname },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRATION }
      );

      // Create login session
      const session = new LoginSession();
      session.usuario = usuario;
      session.ip_address = '127.0.0.1'; // Placeholder for local Electron app
      session.user_agent = deviceInfo?.userAgent || 'Unknown';
      session.device_info = JSON.stringify(deviceInfo || {});
      session.login_time = new Date();
      session.is_active = true;
      session.last_activity_time = new Date();
      session.browser = deviceInfo?.browser || 'Electron';
      session.os = deviceInfo?.os || process.platform;
      const savedSession = await sessionRepository.save(session);

      // Set the current user globally in the main process
      setCurrentUser(usuario);

      return {
        success: true,
        usuario: usuario, // Return user details (consider sanitizing)
        token: token,
        sessionId: savedSession.id,
        message: 'Inicio de sesión exitoso'
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Error en el servidor. Por favor, intente nuevamente.' };
    }
  });

  ipcMain.handle('logout', async (_event: any, sessionId: number) => {
    try {
      const sessionRepository = dataSource.getRepository(LoginSession);
      const session = await sessionRepository.findOneBy({ id: sessionId });

      if (session) {
        session.is_active = false;
        session.logout_time = new Date();
        await sessionRepository.save(session);
      }

      // Clear the current user globally
      setCurrentUser(null);
      return { success: true }; // Indicate success
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false }; // Indicate failure
    }
  });

  ipcMain.handle('updateSessionActivity', async (_event: any, sessionId: number) => {
    try {
      const sessionRepository = dataSource.getRepository(LoginSession);
      const session = await sessionRepository.findOneBy({ id: sessionId, is_active: true });

      if (session) {
        session.last_activity_time = new Date();
        await sessionRepository.save(session);
        return { success: true };
      }
      return { success: false, message: 'Session not found or inactive' };
    } catch (error) {
      console.error('Update session activity error:', error);
      return { success: false };
    }
  });

  ipcMain.handle('getLoginSessions', async (_event: any, usuarioId: number) => {
    try {
      const sessionRepository = dataSource.getRepository(LoginSession);
      const sessions = await sessionRepository.find({
        where: { usuario: { id: usuarioId } },
        order: { login_time: 'DESC' }
      });
      return sessions;
    } catch (error) {
      console.error('Get login sessions error:', error);
      return []; // Return empty array on error
    }
  });

  // Handler to get the currently logged-in user state from main process
  ipcMain.handle('getCurrentUser', async () => {
    return getCurrentUser();
  });

  // Potentially dangerous: Allows renderer to set main process state.
  // Consider if this is truly necessary or if state should only flow from main to renderer.
  ipcMain.handle('setCurrentUser', async (_event: any, usuario: Usuario | null) => {
     console.warn('Directly setting current user from renderer. Ensure this is intended.');
     setCurrentUser(usuario);
     return { success: true };
  });

} 