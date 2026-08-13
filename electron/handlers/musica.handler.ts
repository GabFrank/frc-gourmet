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
  AnimoTrack,
  ESCENAS,
  EstadoTrack,
  normalizarAnimo,
  TipoSemilla,
  TipoVeto,
} from '../../src/app/database/entities/musica/musica-enums';
import { PlanProgramacion } from '../../src/app/database/entities/musica/plan-programacion.entity';
import { PlanBloque } from '../../src/app/database/entities/musica/plan-bloque.entity';
import { PRESETS_MUSICA, getPreset } from '../utils/musica-presets';
import { generarPlanDelDia, getBloqueVigente } from '../services/musica-planner.service';
import { descubrirMusica, rechazarTrack } from '../services/musica-descubrimiento.service';
import { enriquecerFeatures, etiquetarTracks } from '../services/musica-features.service';
import { emitirStreamToken, StreamScope } from '../utils/stream-token.utils';
import {
  interpretarBrief,
  aplicarConfiguracion,
  describirPropuesta,
  ConfiguracionPropuesta,
} from '../services/musica-brief.service';
import {
  iniciarRuntimeMusica,
  detenerRuntimeMusica,
  getEstadoRuntime,
  getEstadoSalon,
  cambiarVariante,
  limpiarErrorRuntime,
} from '../services/musica-runtime.service';
import {
  listarEstilos,
  guardarEstilo,
  eliminarEstilo,
  asignarAlias,
  quitarAlias,
  sembrarCatalogo,
  reclasificarPool,
  clasificarTodo,
  generosSinClasificar,
  fijarEstiloTrack,
  desacuerdosDeEstilo,
  getMezcla,
  guardarMezcla,
  calcularDeficit,
} from '../services/musica-estilos.service';
import { VarianteEnergia } from '../../src/app/database/entities/musica/musica-enums';
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
  cancelarConexionSpotify,
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

  /**
   * Chequeo liviano para la navegacion: si el local no configuro Spotify, el
   * modulo no tiene nada que mostrar y el destino se oculta del menu. Devuelve
   * solo booleanos — no expone client id ni estado de la cuenta.
   */
  ipcMain.handle('musica-disponible', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONTROLAR, PERM_CONFIGURAR]);
    const { musica } = readAppSettings(userData());
    return {
      configurado: !!(musica.spotifyClientId || '').trim(),
      conectado: await estaConectado(),
      habilitado: !!musica.habilitado,
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

  // La llama la pantalla de Musica al cerrarse: si el usuario abandono el flujo
  // de OAuth a medias, libera el puerto loopback en vez de dejarlo tomado hasta
  // que venza el timeout de 3 minutos.
  ipcMain.handle('musica-cancelar-conexion', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    cancelarConexionSpotify('SE CERRO LA PANTALLA DE MUSICA');
    return { success: true };
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

  // Los comandos que salen bien limpian la alerta: son la prueba de que el
  // player volvio a responder, y esperar al proximo heartbeat (2 min) deja el
  // cartel de error puesto sobre una situacion ya resuelta.
  ipcMain.handle('musica-play', async (_event, contextUri?: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
    await reproducir(userData(), contextUri);
    limpiarErrorRuntime();
    return { success: true };
  });

  ipcMain.handle('musica-pausar', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
    await pausar(userData());
    limpiarErrorRuntime();
    return { success: true };
  });

  ipcMain.handle('musica-siguiente', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
    await siguiente(userData());
    limpiarErrorRuntime();
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
    limpiarErrorRuntime();
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
      // Con las relaciones de estilo: la pantalla muestra en que estilo quedo
      // cada tema y permite corregirlo, y sin esto vendrian todas undefined.
      const [items, total] = await qb
        .leftJoinAndSelect('t.estilo', 'estilo')
        .leftJoinAndSelect('t.estiloManual', 'estiloManual')
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
    // Ejes semanticos. Se normalizan aca —no se confia en la UI— porque este
    // handler tambien entra por HTTP en modo cliente.
    if (data.animosEvitar !== undefined) {
      entity.animosEvitar = (data.animosEvitar || [])
        .map((a) => normalizarAnimo(a))
        .filter((a): a is AnimoTrack => !!a);
    }
    if (data.escenaPreferida !== undefined) {
      const escena = (data.escenaPreferida || '').toUpperCase();
      entity.escenaPreferida = (ESCENAS as string[]).includes(escena) ? escena : null;
    }
    // `notas` NO se pasa a UPPERCASE: es texto libre del dueno y va literal al
    // prompt del planificador. Gritarlo degrada la lectura del modelo.
    if (data.notas !== undefined) entity.notas = data.notas;
    if (data.orden !== undefined) entity.orden = data.orden;
    // Opciones avanzadas del bloque. Estaban en la entidad y en la UI, pero no
    // se persistian: los cuatro controles del panel avanzado no hacian nada.
    // `maxPorArtista` viaja con su centinela (null = heredar, 0 = sin limite);
    // ver el comentario de la entidad.
    if (data.maxPorArtista !== undefined) entity.maxPorArtista = data.maxPorArtista;
    if (data.evitarArtistaConsecutivo !== undefined) {
      entity.evitarArtistaConsecutivo = data.evitarArtistaConsecutivo;
    }
    if (data.factorDuracion !== undefined) entity.factorDuracion = data.factorDuracion;

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

  // ───────────────── Catalogo de estilos (F4) ─────────────────

  ipcMain.handle('musica-estilos-listar', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    return await listarEstilos(dataSource);
  });

  ipcMain.handle('musica-estilo-guardar', async (_event, datos: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    return await guardarEstilo(dataSource, datos);
  });

  ipcMain.handle('musica-estilo-eliminar', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    return await eliminarEstilo(dataSource, id);
  });

  ipcMain.handle(
    'musica-estilo-alias-asignar',
    async (_event, { genero, estiloId }: { genero: string; estiloId: number }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      return await asignarAlias(dataSource, genero, estiloId);
    },
  );

  ipcMain.handle('musica-estilo-alias-quitar', async (_event, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    return await quitarAlias(dataSource, id);
  });

  /** Crea el catalogo inicial agrupando los generos que ya estan en el pool. */
  ipcMain.handle('musica-estilos-sembrar', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const siembra = await sembrarCatalogo(dataSource);
    // Sembrar sin reclasificar deja el catalogo sin efecto: van juntos.
    const reclasificacion = await reclasificarPool(dataSource);
    return { ...siembra, ...reclasificacion };
  });

  ipcMain.handle('musica-estilos-reclasificar', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    return await reclasificarPool(dataSource);
  });

  /**
   * Cascada completa: trae generos de Spotify, reclasifica por alias y hereda
   * del mismo artista. Es lo que hay que correr despues de importar musica.
   */
  ipcMain.handle(
    'musica-estilos-clasificar-todo',
    async (_event, opts?: { conMusicBrainz?: boolean; limiteMusicBrainz?: number }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      return await clasificarTodo(dataSource, userData(), opts);
    },
  );

  ipcMain.handle('musica-generos-sin-clasificar', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    return await generosSinClasificar(dataSource);
  });

  ipcMain.handle(
    'musica-track-estilo',
    async (_event, { trackId, estiloId }: { trackId: number; estiloId: number | null }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      return await fijarEstiloTrack(dataSource, trackId, estiloId);
    },
  );

  /** Donde el agente y el genero no coinciden: la cola de curacion. */
  ipcMain.handle('musica-estilos-desacuerdos', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    return await desacuerdosDeEstilo(dataSource);
  });

  ipcMain.handle('musica-mezcla-get', async (_event, bloqueId: number) => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    return await getMezcla(dataSource, bloqueId);
  });

  ipcMain.handle(
    'musica-mezcla-guardar',
    async (_event, { bloqueId, items }: { bloqueId: number; items: any[] }) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      return await guardarMezcla(dataSource, bloqueId, items);
    },
  );

  /** Cuanta musica falta por estilo para que las cuotas se puedan cumplir. */
  ipcMain.handle('musica-deficit', async (_event, bloqueId?: number) => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONFIGURAR]);
    const { musica } = readAppSettings(userData());
    const factor = musica.avanzado?.factorDuracion ?? 1.5;
    return await calcularDeficit(dataSource, factor, bloqueId);
  });

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

  // ───────────────── Brief → programacion (F1.5) ─────────────────

  /**
   * Interpreta la descripcion del local y devuelve la grilla propuesta SIN
   * aplicarla. La IA propone, el dueno dispone: siempre hay un paso de revision.
   */
  ipcMain.handle('musica-interpretar-brief', async (_event, brief: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const propuesta = await interpretarBrief(userData(), brief);
    return { propuesta, descripcion: describirPropuesta(propuesta) };
  });

  ipcMain.handle(
    'musica-aplicar-config',
    async (
      _event,
      data: { propuesta: ConfiguracionPropuesta; brief: string; preservarManuales?: boolean },
    ) => {
      await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
      return await aplicarConfiguracion(dataSource, userData(), data.propuesta, {
        brief: data.brief,
        // Por defecto se respetan los bloques editados a mano: pisarlos en
        // silencio haria que el dueno no vuelva a confiar en "Regenerar".
        preservarManuales: data.preservarManuales !== false,
        usuarioId: getCurrentUser()?.id,
      });
    },
  );

  // ───────────────── Enriquecimiento del repertorio ─────────────────

  /**
   * Completa BPM/energia/valencia con ReccoBeats. Sin estos datos los perfiles
   * por bloque no muerden: el filtro deja pasar lo que no tiene el dato y las
   * tres variantes salen iguales.
   */
  ipcMain.handle('musica-enriquecer', async (_event, limite?: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    return await enriquecerFeatures(dataSource, userData(), limite || 200);
  });

  /** Etiquetado semantico en lote: escena, ambiente, apto familiar, idioma. */
  ipcMain.handle('musica-etiquetar', async (_event, limite?: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    return await etiquetarTracks(dataSource, userData(), limite || 200);
  });

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

  // ───────────────── Stream SSE ─────────────────

  /**
   * Emite el token efimero para abrir un stream SSE. Va por RPC (autenticado
   * con el JWT en header) y devuelve un token de 60s, de un solo uso y de
   * alcance acotado: `EventSource` no puede mandar headers, y poner el token de
   * sesion en la query lo dejaria en logs, historial y proxies.
   *
   * Sirve tanto a musica como al KDS, que comparten el problema.
   */
  ipcMain.handle('stream-token', async (_event, scope: StreamScope) => {
    const permisos =
      scope === 'kds' ? ['COMANDAS_KDS_VER', 'COMANDAS_KDS_OPERAR'] : [PERM_VER, PERM_CONTROLAR];
    const usuario = await ensurePermission(dataSource, getCurrentUser, permisos);
    return await emitirStreamToken(usuario.id, scope === 'kds' ? 'kds' : 'musica');
  });

  // ───────────────── Runtime automatico ─────────────────

  ipcMain.handle('musica-runtime-estado', async () => {
    await ensurePermission(dataSource, getCurrentUser, [PERM_VER, PERM_CONTROLAR]);
    // El estado del salon viaja junto: es lo que explica por que la musica
    // esta donde esta ("70% ocupado" justifica la variante movida).
    return { ...getEstadoRuntime(), salon: await getEstadoSalon() };
  });

  /**
   * Cambia la variante de energia del bloque actual (suave/normal/movido).
   * Es la reaccion al salon sin re-planificar: las tres playlists ya existen.
   */
  ipcMain.handle('musica-variante', async (_event, variante: VarianteEnergia) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONTROLAR);
    await cambiarVariante(variante);
    return { success: true };
  });

  ipcMain.handle('musica-runtime-toggle', async (_event, activar: boolean) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    updateAppSettings(userData(), (s) => ({
      ...s,
      musica: { ...s.musica, habilitado: !!activar },
    }));
    if (activar) iniciarRuntimeMusica(dataSource, userData());
    else detenerRuntimeMusica();
    return { success: true, habilitado: !!activar };
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
