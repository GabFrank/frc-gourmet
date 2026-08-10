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
import { MusicaSemilla } from '../../src/app/database/entities/musica/musica-semilla.entity';
import { MusicaTrack } from '../../src/app/database/entities/musica/musica-track.entity';
import { EstadoTrack, TipoSemilla } from '../../src/app/database/entities/musica/musica-enums';
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { readAppSettings, updateAppSettings } from '../utils/app-settings.utils';
import {
  extraerIdSpotify,
  importarSemilla,
  getResumenPool,
} from '../services/musica-pool.service';
import {
  spotifyApi,
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

  // ───────────────── Semillas y repertorio (F1) ─────────────────

  ipcMain.handle('musica-semillas-listar', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    const repo = dataSource.getRepository(MusicaSemilla);
    return await repo.find({ where: { activo: true }, order: { id: 'DESC' } });
  });

  /**
   * Alta de semilla desde una URL o URI pegada por el dueno. El tipo se deduce
   * del link (no se le pide que lo elija) y el nombre/imagen se resuelven
   * contra Spotify para que reconozca lo que cargo.
   */
  ipcMain.handle(
    'musica-semilla-crear',
    async (_event, data: { url: string; bloqueIds?: number[] }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      const repo = dataSource.getRepository(MusicaSemilla);

      const ref = extraerIdSpotify(data.url);
      if (!ref) {
        throw new Error(
          'NO RECONOCI ESE ENLACE. PEGA UN LINK DE PLAYLIST, ARTISTA O TEMA DE SPOTIFY.',
        );
      }

      const tipo =
        ref.tipo === 'playlist'
          ? TipoSemilla.PLAYLIST
          : ref.tipo === 'artist'
            ? TipoSemilla.ARTISTA
            : TipoSemilla.TRACK;

      const spotifyUri = `spotify:${ref.tipo}:${ref.id}`;
      const yaExiste = await repo.findOne({ where: { spotifyUri, activo: true } });
      if (yaExiste) return yaExiste;

      // Resolver nombre e imagen segun el tipo.
      let nombre = spotifyUri;
      let imagenUrl: string | undefined;
      if (tipo === TipoSemilla.PLAYLIST) {
        const pl = await spotifyApi(userData(), 'GET', `/playlists/${ref.id}`);
        nombre = pl?.name || nombre;
        imagenUrl = pl?.images?.[0]?.url;
      } else if (tipo === TipoSemilla.ARTISTA) {
        const ar = await spotifyApi(userData(), 'GET', `/artists/${ref.id}`);
        nombre = ar?.name || nombre;
        imagenUrl = ar?.images?.[0]?.url;
      } else {
        const tr = await spotifyApi(userData(), 'GET', `/tracks/${ref.id}`);
        nombre = tr ? `${tr.name} — ${(tr.artists || []).map((a: any) => a.name).join(', ')}` : nombre;
        imagenUrl = tr?.album?.images?.[0]?.url;
      }

      const entity = repo.create({
        tipo,
        spotifyUri,
        nombre: nombre.toUpperCase(),
        imagenUrl,
        bloqueIds: data.bloqueIds?.length ? data.bloqueIds : undefined,
        activo: true,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    },
  );

  /** Importa la biblioteca completa de la cuenta como una sola semilla. */
  ipcMain.handle('musica-semilla-biblioteca', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const repo = dataSource.getRepository(MusicaSemilla);
    const existente = await repo.findOne({
      where: { tipo: TipoSemilla.BIBLIOTECA, activo: true },
    });
    if (existente) return existente;

    const entity = repo.create({
      tipo: TipoSemilla.BIBLIOTECA,
      spotifyUri: 'spotify:library',
      nombre: 'BIBLIOTECA DE LA CUENTA',
      activo: true,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('musica-semilla-eliminar', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const repo = dataSource.getRepository(MusicaSemilla);
    const existente = await repo.findOne({ where: { id } });
    if (!existente) throw new Error(`SEMILLA ${id} NO ENCONTRADA`);
    // Baja logica: los tracks que aporto siguen en el pool.
    existente.activo = false;
    await setEntityUserTracking(dataSource, existente, getCurrentUser()?.id, true);
    await repo.save(existente);
    return { success: true };
  });

  ipcMain.handle('musica-semilla-importar', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const repo = dataSource.getRepository(MusicaSemilla);
    const semilla = await repo.findOne({ where: { id } });
    if (!semilla) throw new Error(`SEMILLA ${id} NO ENCONTRADA`);
    return await importarSemilla(dataSource, userData(), semilla);
  });

  /**
   * Importa todas las semillas activas. Una semilla que falle (playlist
   * borrada, privada de otra cuenta) no aborta el resto: se reporta aparte.
   */
  ipcMain.handle('musica-importar-todas', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const repo = dataSource.getRepository(MusicaSemilla);
    const semillas = await repo.find({ where: { activo: true } });

    let nuevos = 0;
    let actualizados = 0;
    const errores: Array<{ semilla: string; error: string }> = [];

    for (const s of semillas) {
      try {
        const r = await importarSemilla(dataSource, userData(), s);
        nuevos += r.nuevos;
        actualizados += r.actualizados;
      } catch (e) {
        errores.push({ semilla: s.nombre, error: (e as Error).message });
      }
    }

    return { semillas: semillas.length, nuevos, actualizados, errores };
  });

  ipcMain.handle('musica-pool-resumen', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    return await getResumenPool(dataSource);
  });

  ipcMain.handle(
    'musica-tracks-listar',
    async (
      _event,
      filtros?: { estado?: EstadoTrack; texto?: string; page?: number; pageSize?: number },
    ) => {
      await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
      const repo = dataSource.getRepository(MusicaTrack);
      const pageSize = Number(filtros?.pageSize) || 50;
      const page = Math.max(0, Number(filtros?.page) || 0);

      const qb = repo.createQueryBuilder('t');
      if (filtros?.estado) qb.andWhere('t.estado = :estado', { estado: filtros.estado });
      if (filtros?.texto) {
        qb.andWhere('(t.titulo LIKE :q OR t.artista LIKE :q)', {
          q: `%${filtros.texto.toUpperCase()}%`,
        });
      }
      const [items, total] = await qb
        .orderBy('t.artista', 'ASC')
        .addOrderBy('t.titulo', 'ASC')
        .skip(page * pageSize)
        .take(pageSize)
        .getManyAndCount();

      return { items, total };
    },
  );

  ipcMain.handle(
    'musica-track-estado',
    async (_event, data: { id: number; estado: EstadoTrack }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      const repo = dataSource.getRepository(MusicaTrack);
      const track = await repo.findOne({ where: { id: data.id } });
      if (!track) throw new Error(`TRACK ${data.id} NO ENCONTRADO`);
      track.estado = data.estado;
      await setEntityUserTracking(dataSource, track, getCurrentUser()?.id, true);
      return await repo.save(track);
    },
  );
}
