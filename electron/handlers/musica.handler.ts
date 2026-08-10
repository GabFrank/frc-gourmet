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
import { MusicaVeto } from '../../src/app/database/entities/musica/musica-veto.entity';
import { BloqueProgramacion } from '../../src/app/database/entities/musica/bloque-programacion.entity';
import {
  EstadoTrack,
  TipoSemilla,
  TipoVeto,
} from '../../src/app/database/entities/musica/musica-enums';
import { PlanProgramacion } from '../../src/app/database/entities/musica/plan-programacion.entity';
import { PlanBloque } from '../../src/app/database/entities/musica/plan-bloque.entity';
import { PRESETS_MUSICA, getPreset } from '../utils/musica-presets';
import { generarPlanDelDia, getBloqueVigente } from '../services/musica-planner.service';
import { descubrirMusica, rechazarTrack } from '../services/musica-descubrimiento.service';
import { MusicaFeedback } from '../../src/app/database/entities/musica/musica-feedback.entity';
import { TipoFeedback } from '../../src/app/database/entities/musica/musica-enums';

/**
 * Fecha local en YYYY-MM-DD. `toISOString()` daria UTC y en Paraguay (UTC-3)
 * la noche caeria al dia siguiente: el plan de las 21:00 del sabado se
 * guardaria como domingo.
 */
function fechaLocalHoy(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import {
  readAppSettings,
  updateAppSettings,
  MusicaAvanzado,
} from '../utils/app-settings.utils';
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
      autoAprobarDescubrimientos: musica.autoAprobarDescubrimientos !== false,
      brief: musica.brief || '',
      avanzado: musica.avanzado,
      conectado: await estaConectado(),
    };
  });

  ipcMain.handle(
    'musica-set-config',
    async (
      _event,
      data: {
        spotifyClientId?: string;
        redirectPort?: number;
        habilitado?: boolean;
        autoAprobarDescubrimientos?: boolean;
        brief?: string;
        avanzado?: Partial<MusicaAvanzado>;
      },
    ) => {
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
          autoAprobarDescubrimientos:
            data.autoAprobarDescubrimientos !== undefined
              ? !!data.autoAprobarDescubrimientos
              : s.musica.autoAprobarDescubrimientos,
          // Sin UPPERCASE: va literal al prompt del descubridor.
          brief: data.brief !== undefined ? data.brief : s.musica.brief,
          // Merge parcial: la UI puede mandar solo el campo que cambio.
          avanzado: data.avanzado
            ? ({ ...s.musica.avanzado, ...data.avanzado } as MusicaAvanzado)
            : s.musica.avanzado,
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

  // ───────────────── Grilla de bloques (F1) ─────────────────

  ipcMain.handle('musica-bloques-listar', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    const repo = dataSource.getRepository(BloqueProgramacion);
    return await repo.find({
      where: { activo: true },
      order: { diaSemana: 'ASC', horaDesde: 'ASC' },
    });
  });

  ipcMain.handle('musica-bloque-guardar', async (_event, data: Partial<BloqueProgramacion>) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const repo = dataSource.getRepository(BloqueProgramacion);

    const entity = data.id
      ? await repo.findOne({ where: { id: data.id } })
      : repo.create({ activo: true } as BloqueProgramacion);
    if (!entity) throw new Error(`BLOQUE ${data.id} NO ENCONTRADO`);

    if (data.diaSemana !== undefined) entity.diaSemana = data.diaSemana;
    if (data.nombre !== undefined) entity.nombre = (data.nombre || '').toUpperCase();
    if (data.horaDesde !== undefined) entity.horaDesde = data.horaDesde;
    if (data.horaHasta !== undefined) entity.horaHasta = data.horaHasta;
    if (data.energia !== undefined) entity.energia = data.energia;
    if (data.volumen !== undefined) entity.volumen = data.volumen;
    if (data.generosPreferidos !== undefined) entity.generosPreferidos = data.generosPreferidos;
    if (data.generosEvitar !== undefined) entity.generosEvitar = data.generosEvitar;
    if (data.bpmMin !== undefined) entity.bpmMin = data.bpmMin;
    if (data.bpmMax !== undefined) entity.bpmMax = data.bpmMax;
    if (data.valenciaMin !== undefined) entity.valenciaMin = data.valenciaMin;
    // `notas` NO se pasa a UPPERCASE: es texto libre del dueno y va literal al
    // prompt del planificador. Gritarlo degrada la lectura del modelo.
    if (data.notas !== undefined) entity.notas = data.notas;
    if (data.orden !== undefined) entity.orden = data.orden;

    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, !!data.id);
    return await repo.save(entity);
  });

  ipcMain.handle('musica-bloque-eliminar', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const repo = dataSource.getRepository(BloqueProgramacion);
    const entity = await repo.findOne({ where: { id } });
    if (!entity) throw new Error(`BLOQUE ${id} NO ENCONTRADO`);
    entity.activo = false;
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    await repo.save(entity);
    return { success: true };
  });

  ipcMain.handle('musica-presets-listar', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    return PRESETS_MUSICA.map((p) => ({
      codigo: p.codigo,
      nombre: p.nombre,
      descripcion: p.descripcion,
      cantidadBloques: p.bloques.length,
    }));
  });

  /**
   * Deja la grilla lista a partir de un preset. Nadie configura un modulo
   * desde una pantalla en blanco.
   *
   * `reemplazar` da de baja la grilla anterior; sin eso, aplicar dos veces
   * duplicaria los bloques y el dia tendria dos programaciones solapadas.
   */
  ipcMain.handle(
    'musica-aplicar-preset',
    async (_event, data: { codigo: string; reemplazar?: boolean }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      const preset = getPreset(data.codigo);
      if (!preset) throw new Error(`PRESET ${data.codigo} NO ENCONTRADO`);

      const bloqueRepo = dataSource.getRepository(BloqueProgramacion);
      const vetoRepo = dataSource.getRepository(MusicaVeto);

      if (data.reemplazar) {
        const previos = await bloqueRepo.find({ where: { activo: true } });
        for (const b of previos) b.activo = false;
        if (previos.length) await bloqueRepo.save(previos);
      }

      const creados: BloqueProgramacion[] = [];
      for (const [i, b] of preset.bloques.entries()) {
        const entity = bloqueRepo.create({
          diaSemana: b.diaSemana,
          nombre: b.nombre.toUpperCase(),
          horaDesde: b.horaDesde,
          horaHasta: b.horaHasta,
          energia: b.energia,
          volumen: b.volumen,
          generosPreferidos: b.generosPreferidos,
          generosEvitar: b.generosEvitar,
          bpmMin: b.bpmMin,
          bpmMax: b.bpmMax,
          // El bloque manda; si no define nada, rige la regla transversal.
          valenciaMin: b.valenciaMin ?? preset.valenciaMinGlobal,
          notas: b.notas,
          orden: i,
          activo: true,
        } as BloqueProgramacion);
        await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
        creados.push(entity);
      }
      await bloqueRepo.save(creados);

      // Vetos globales del preset, sin pisar los que ya existan.
      let vetosNuevos = 0;
      for (const genero of preset.generosVetados) {
        const ya = await vetoRepo.findOne({
          where: { tipo: TipoVeto.GENERO, valor: genero, activo: true },
        });
        if (ya) continue;
        const veto = vetoRepo.create({
          tipo: TipoVeto.GENERO,
          valor: genero,
          etiqueta: genero,
          bloqueId: null,
          motivo: `PRESET ${preset.codigo}`,
          activo: true,
        });
        await setEntityUserTracking(dataSource, veto, getCurrentUser()?.id, false);
        await vetoRepo.save(veto);
        vetosNuevos++;
      }

      return { bloques: creados.length, vetos: vetosNuevos };
    },
  );

  // ───────────────── Vetos ─────────────────

  ipcMain.handle('musica-vetos-listar', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    const repo = dataSource.getRepository(MusicaVeto);
    return await repo.find({ where: { activo: true }, order: { tipo: 'ASC', valor: 'ASC' } });
  });

  ipcMain.handle(
    'musica-veto-crear',
    async (
      _event,
      data: { tipo: TipoVeto; valor: string; etiqueta?: string; bloqueId?: number | null },
    ) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      const repo = dataSource.getRepository(MusicaVeto);
      const valor = (data.valor || '').toUpperCase().trim();
      if (!valor) throw new Error('EL VETO NECESITA UN VALOR.');

      const ya = await repo.findOne({
        where: { tipo: data.tipo, valor, bloqueId: data.bloqueId ?? null, activo: true },
      });
      if (ya) return ya;

      const entity = repo.create({
        tipo: data.tipo,
        valor,
        etiqueta: data.etiqueta ? data.etiqueta.toUpperCase() : valor,
        bloqueId: data.bloqueId ?? null,
        motivo: 'MANUAL',
        activo: true,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    },
  );

  // ───────────────── Descubrimiento con IA ─────────────────

  /**
   * Pide musica nueva al modelo y la resuelve en Spotify. Es el corazon del
   * modulo: sin esto el local seguiria escuchando siempre lo mismo, que es el
   * problema que motivo todo.
   */
  ipcMain.handle(
    'musica-descubrir',
    async (_event, data?: { cantidad?: number; bloqueId?: number }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      const { musica } = readAppSettings(userData());
      return await descubrirMusica(dataSource, userData(), {
        cantidad: data?.cantidad,
        bloqueId: data?.bloqueId,
        brief: musica.brief || undefined,
        usuarioId: getCurrentUser()?.id,
      });
    },
  );

  /**
   * "No va": saca el tema del repertorio y lo convierte en ejemplo negativo
   * para las proximas rondas. Lo pueden usar cajeros, gerentes y admin.
   */
  ipcMain.handle(
    'musica-rechazar',
    async (_event, data: { spotifyId: string; tambienArtista?: boolean; bloqueId?: number }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
      return await rechazarTrack(dataSource, data.spotifyId, {
        tambienArtista: data.tambienArtista,
        bloqueId: data.bloqueId,
      });
    },
  );

  /** "Mas de esto": sube el score y alimenta el prompt de descubrimiento. */
  ipcMain.handle(
    'musica-me-gusta',
    async (_event, data: { spotifyId: string; bloqueId?: number }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
      const trackRepo = dataSource.getRepository(MusicaTrack);
      const feedbackRepo = dataSource.getRepository(MusicaFeedback);
      const track = await trackRepo.findOne({ where: { spotifyId: data.spotifyId } });
      if (track) {
        track.score = (track.score || 0) + 1;
        await trackRepo.save(track);
      }
      await feedbackRepo.save(
        feedbackRepo.create({
          spotifyId: data.spotifyId,
          artistaId: track?.artistaId,
          titulo: track?.titulo,
          tipo: TipoFeedback.MAS_DE_ESTO,
          bloqueId: data.bloqueId,
          fecha: new Date(),
        }),
      );
      return { success: true };
    },
  );

  // ───────────────── Plan del dia ─────────────────

  /**
   * Genera el plan y materializa las playlists. El dia se resuelve de una vez:
   * ver docs/DISENO-OPERATIVO-MUSICA.md 3.3.
   */
  ipcMain.handle(
    'musica-generar-plan',
    async (_event, data?: { fecha?: string; instruccion?: string }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      const fecha = data?.fecha || fechaLocalHoy();
      return await generarPlanDelDia(dataSource, userData(), fecha, {
        instruccion: data?.instruccion,
        usuarioId: getCurrentUser()?.id,
      });
    },
  );

  ipcMain.handle('musica-plan-del-dia', async (_event, fecha?: string) => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONTROLAR]);
    const planRepo = dataSource.getRepository(PlanProgramacion);
    const plan = await planRepo.findOne({ where: { fecha: fecha || fechaLocalHoy() } });
    if (!plan) return null;

    const planBloqueRepo = dataSource.getRepository(PlanBloque);
    const bloques = await planBloqueRepo.find({
      where: { plan: { id: plan.id } },
      relations: ['bloque'],
      order: { id: 'ASC' },
    });
    const vigente = await getBloqueVigente(dataSource);
    return { plan, bloques, bloqueVigenteId: vigente?.id ?? null };
  });

  ipcMain.handle('musica-veto-eliminar', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const repo = dataSource.getRepository(MusicaVeto);
    const entity = await repo.findOne({ where: { id } });
    if (!entity) throw new Error(`VETO ${id} NO ENCONTRADO`);
    entity.activo = false;
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    await repo.save(entity);
    return { success: true };
  });
}
