/**
 * Handlers del modulo de Musica ambiental (F0: conexion + control manual).
 *
 * Alcance de F0: validar de punta a punta que FRC Gourmet puede controlar la
 * musica del local. Todavia NO hay entidades, ni programacion por franja, ni
 * agente: la config vive en app-settings + keytar. Ver docs/PLAN-MUSICA-SPOTIFY.md.
 *
 * El reproductor es la app de Spotify Desktop instalada en esta PC, controlada
 * por Spotify Connect. Esta app es el control remoto.
 */
import { ipcMain, app, shell } from 'electron';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { readAppSettings, updateAppSettings } from '../utils/app-settings.utils';
import {
  conectarSpotify,
  desconectarSpotify,
  estaConectado,
  getRedirectUri,
  listarDispositivos,
  seleccionarDispositivo,
  getEstado,
  reproducir,
  pausar,
  siguiente,
  anterior,
  setVolumen,
  normalizarModoReproduccion,
} from '../services/spotify.service';

const PERM_VER = 'MUSICA_VER';
const PERM_CONTROLAR = 'MUSICA_CONTROLAR';
const PERM_CONFIGURAR = 'MUSICA_CONFIGURAR';

function userData(): string {
  return app.getPath('userData');
}

export function registerMusicaHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ───────────────── Configuracion ─────────────────

  ipcMain.handle('musica-get-config', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    const { musica } = readAppSettings(userData());
    return {
      spotifyClientId: musica.spotifyClientId,
      redirectPort: musica.redirectPort,
      redirectUri: getRedirectUri(userData()),
      deviceId: musica.deviceId ?? null,
      deviceNombre: musica.deviceNombre ?? null,
      habilitado: musica.habilitado,
      conectado: await estaConectado(),
    };
  });

  ipcMain.handle(
    'musica-set-config',
    async (_event, data: { spotifyClientId?: string; redirectPort?: number; habilitado?: boolean }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      updateAppSettings(userData(), (s) => ({
        ...s,
        musica: {
          ...s.musica,
          spotifyClientId:
            data.spotifyClientId !== undefined
              ? (data.spotifyClientId || '').trim()
              : s.musica.spotifyClientId,
          redirectPort:
            data.redirectPort !== undefined ? Number(data.redirectPort) || 8888 : s.musica.redirectPort,
          habilitado: data.habilitado !== undefined ? !!data.habilitado : s.musica.habilitado,
        },
      }));
      return { success: true };
    },
  );

  // ───────────────── Conexion OAuth ─────────────────

  ipcMain.handle('musica-conectar', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const { nombreUsuario } = await conectarSpotify(userData());
    return { success: true, nombreUsuario };
  });

  ipcMain.handle('musica-desconectar', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    await desconectarSpotify(userData());
    return { success: true };
  });

  // ───────────────── Dispositivos ─────────────────

  ipcMain.handle('musica-listar-dispositivos', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONTROLAR, PERM_CONFIGURAR]);
    return await listarDispositivos(userData());
  });

  ipcMain.handle(
    'musica-seleccionar-dispositivo',
    async (_event, data: { deviceId: string; deviceNombre: string }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      await seleccionarDispositivo(userData(), data.deviceId, data.deviceNombre);
      // La secuencia la manejamos nosotros: shuffle/repeat siempre apagados.
      await normalizarModoReproduccion(userData());
      return { success: true };
    },
  );

  /**
   * Lanza la app de Spotify de esta PC. El protocolo `spotify:` funciona tanto
   * con el instalador clasico como con la version de Microsoft Store, asi que
   * evita depender de la ruta del ejecutable.
   */
  ipcMain.handle('musica-abrir-spotify', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_CONTROLAR, PERM_CONFIGURAR]);
    await shell.openExternal('spotify:');
    return { success: true };
  });

  // ───────────────── Control de reproduccion ─────────────────

  ipcMain.handle('musica-estado', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONTROLAR]);
    return await getEstado(userData());
  });

  ipcMain.handle('musica-play', async (_event, contextUri?: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
    await reproducir(userData(), contextUri);
    return { success: true };
  });

  ipcMain.handle('musica-pausar', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
    await pausar(userData());
    return { success: true };
  });

  ipcMain.handle('musica-siguiente', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
    await siguiente(userData());
    return { success: true };
  });

  ipcMain.handle('musica-anterior', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
    await anterior(userData());
    return { success: true };
  });

  ipcMain.handle('musica-volumen', async (_event, porcentaje: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
    await setVolumen(userData(), porcentaje);
    return { success: true };
  });
}
