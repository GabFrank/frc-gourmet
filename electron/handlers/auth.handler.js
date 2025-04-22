"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuthHandlers = void 0;
const electron_1 = require("electron");
const usuario_entity_1 = require("../../src/app/database/entities/personas/usuario.entity");
const login_session_entity_1 = require("../../src/app/database/entities/auth/login-session.entity");
const jwt = __importStar(require("jsonwebtoken"));
// JWT Secret and Expiration - Consider moving to environment variables or a config file
const JWT_SECRET = 'frc-gourmet-secret-key';
const TOKEN_EXPIRATION = '7d';
function registerAuthHandlers(dataSource, getCurrentUser, // Function to get the current user
setCurrentUser // Function to set the current user
) {
    electron_1.ipcMain.handle('login', async (_event, loginData) => {
        try {
            const { nickname, password, deviceInfo } = loginData;
            const userRepository = dataSource.getRepository(usuario_entity_1.Usuario);
            const sessionRepository = dataSource.getRepository(login_session_entity_1.LoginSession);
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
            const token = jwt.sign({ id: usuario.id, nickname: usuario.nickname }, JWT_SECRET, { expiresIn: TOKEN_EXPIRATION });
            // Create login session
            const session = new login_session_entity_1.LoginSession();
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
                usuario: usuario,
                token: token,
                sessionId: savedSession.id,
                message: 'Inicio de sesión exitoso'
            };
        }
        catch (error) {
            console.error('Login error:', error);
            return { success: false, message: 'Error en el servidor. Por favor, intente nuevamente.' };
        }
    });
    electron_1.ipcMain.handle('logout', async (_event, sessionId) => {
        try {
            const sessionRepository = dataSource.getRepository(login_session_entity_1.LoginSession);
            const session = await sessionRepository.findOneBy({ id: sessionId });
            if (session) {
                session.is_active = false;
                session.logout_time = new Date();
                await sessionRepository.save(session);
            }
            // Clear the current user globally
            setCurrentUser(null);
            return { success: true }; // Indicate success
        }
        catch (error) {
            console.error('Logout error:', error);
            return { success: false }; // Indicate failure
        }
    });
    electron_1.ipcMain.handle('updateSessionActivity', async (_event, sessionId) => {
        try {
            const sessionRepository = dataSource.getRepository(login_session_entity_1.LoginSession);
            const session = await sessionRepository.findOneBy({ id: sessionId, is_active: true });
            if (session) {
                session.last_activity_time = new Date();
                await sessionRepository.save(session);
                return { success: true };
            }
            return { success: false, message: 'Session not found or inactive' };
        }
        catch (error) {
            console.error('Update session activity error:', error);
            return { success: false };
        }
    });
    electron_1.ipcMain.handle('getLoginSessions', async (_event, usuarioId) => {
        try {
            const sessionRepository = dataSource.getRepository(login_session_entity_1.LoginSession);
            const sessions = await sessionRepository.find({
                where: { usuario: { id: usuarioId } },
                order: { login_time: 'DESC' }
            });
            return sessions;
        }
        catch (error) {
            console.error('Get login sessions error:', error);
            return []; // Return empty array on error
        }
    });
    // Handler to get the currently logged-in user state from main process
    electron_1.ipcMain.handle('getCurrentUser', async () => {
        return getCurrentUser();
    });
    // Potentially dangerous: Allows renderer to set main process state.
    // Consider if this is truly necessary or if state should only flow from main to renderer.
    electron_1.ipcMain.handle('setCurrentUser', async (_event, usuario) => {
        console.warn('Directly setting current user from renderer. Ensure this is intended.');
        setCurrentUser(usuario);
        return { success: true };
    });
}
exports.registerAuthHandlers = registerAuthHandlers;
//# sourceMappingURL=auth.handler.js.map