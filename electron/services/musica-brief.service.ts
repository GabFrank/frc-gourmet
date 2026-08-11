/**
 * Brief en texto → programación completa (F1.5).
 *
 * El dueño describe su local con sus palabras y el LLM devuelve la grilla
 * semanal, los géneros preferidos y los vetos. Es la entrada principal de
 * configuración porque **el dueño no sabe describir la música que quiere, pero
 * sí sabe describir su local**: un preset genérico jamás capturaría "bossa n'
 * roses en el buffet, pagode alegre los fines de semana, nada de funk".
 *
 * La IA PROPONE, el dueño DISPONE: `interpretarBrief` devuelve la propuesta sin
 * aplicarla. Recién `aplicarConfiguracion` la persiste, y ahí se respetan los
 * bloques que el dueño ya editó a mano (ver `preservarManuales`).
 */
import { DataSource } from 'typeorm';
import { BloqueProgramacion } from '../../src/app/database/entities/musica/bloque-programacion.entity';
import { MusicaVeto } from '../../src/app/database/entities/musica/musica-veto.entity';
import { TipoVeto } from '../../src/app/database/entities/musica/musica-enums';
import { readIaConfig } from '../utils/ia-config.utils';
import { updateAppSettings } from '../utils/app-settings.utils';

export interface BloquePropuesto {
  diaSemana: number;
  nombre: string;
  horaDesde: string;
  horaHasta: string;
  energia: number;
  volumen: number;
  generosPreferidos: string[];
  generosEvitar?: string[];
  bpmMin?: number;
  bpmMax?: number;
  valenciaMin?: number;
  notas?: string;
  /** `null` = sin límite (bloques de covers, donde repetir intérprete va bien). */
  maxPorArtista?: number | null;
}

export interface ConfiguracionPropuesta {
  resumen: string;
  generosVetados: string[];
  valenciaMinGlobal: number;
  bloques: BloquePropuesto[];
}

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Pide la configuración al modelo. NO la aplica. */
export async function interpretarBrief(
  userDataPath: string,
  brief: string,
): Promise<ConfiguracionPropuesta> {
  const texto = (brief || '').trim();
  if (texto.length < 40) {
    throw new Error(
      'CONTA UN POCO MAS SOBRE EL LOCAL: HORARIOS, PUBLICO, QUE TE GUSTA Y QUE NO QUERES ESCUCHAR.',
    );
  }

  const ia = await readIaConfig(userDataPath);
  if (!ia.openaiApiKey) {
    throw new Error('FALTA LA API KEY DE IA. CARGALA EN CONFIGURACION → CONFIGURAR IA.');
  }

  const prompt = [
    'Sos consultor de ambientación musical para gastronomía. A partir de la descripción de un',
    'local, armá su programación musical semanal.',
    '',
    'REGLAS:',
    '- Cubrí SOLO los horarios en que el local está abierto, según lo que diga la descripción.',
    '  Si un día abre distinto (por ejemplo domingo más tarde), reflejalo.',
    '- Partí el día en bloques por MOMENTO, no por hora arbitraria: apertura/montaje, almuerzo,',
    '  sobremesa, previa, noche… Cada bloque con su propia energía.',
    '- energia: 1 (muy tranquilo) a 5 (muy movido). volumen: 0-100, más bajo donde se conversa.',
    '- Un bloque donde la gente se queda sentada consumiendo (sobremesa, almuerzo largo) va con',
    '  energía y volumen BAJOS: el tempo lento alarga la estadía. Un bloque de rotación alta va',
    '  con energía mayor.',
    '- bpmMin/bpmMax coherentes con la energía del bloque.',
    '- valenciaMin: 0 a 1, mínimo de "alegría" del tema. Subilo si el dueño pide evitar música',
    '  triste. Bajalo un poco en bloques chill, donde algo de melancolía es aceptable.',
    '- notas: una frase en las palabras del dueño sobre ese momento (público, clima, qué pasa).',
    '- maxPorArtista: null solo si en ese bloque no molesta repetir artista (por ejemplo un',
    '  bloque de covers de un mismo proyecto). Si no, 2.',
    '- generosVetados: lo que el dueño dijo que NO quiere, en términos de género.',
    // El modelo tiende a etiquetar el primer bloque del dia como "apertura y
    // montaje" aunque a esa hora ya haya clientes: en la prueba real el domingo
    // abria 16:00 con publico y lo llamo montaje, perdiendo el "sunset" que el
    // dueno habia pedido explicitamente.
    '- El NOMBRE del bloque tiene que describir lo que pasa en ese momento según la descripción',
    '  (SUNSET, ALMUERZO BUFFET, SOBREMESA, CENA…). Usá "apertura/montaje" SOLO si a esa hora el',
    '  local todavía no recibe clientes. Si el dueño nombró un clima para un momento (por ejemplo',
    '  "los domingos va estilo sunset"), ese bloque debe llamarse y sonar así.',
    '',
    'DESCRIPCIÓN DEL LOCAL:',
    texto,
    '',
    'Devolvé SOLO JSON:',
    '{"resumen":"2 frases sobre la lógica de la programación",',
    ' "generosVetados":[],"valenciaMinGlobal":0.45,',
    ' "bloques":[{"diaSemana":1,"nombre":"","horaDesde":"09:00","horaHasta":"11:00","energia":3,',
    '   "volumen":50,"generosPreferidos":[],"generosEvitar":[],"bpmMin":90,"bpmMax":120,',
    '   "valenciaMin":0.45,"notas":"","maxPorArtista":2}]}',
    '',
    'diaSemana: 0=domingo, 1=lunes … 6=sábado. Incluí los SIETE días (repetí el patrón de la',
    'semana en cada día laborable; los fines de semana suelen ir más arriba).',
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ia.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: ia.modelo || 'gpt-4o',
        messages: [{ role: 'system', content: prompt }],
        response_format: { type: 'json_object' },
        // Estructura, no creatividad: la grilla tiene que ser consistente.
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      if (res.status === 401) throw new Error('LA API KEY DE IA NO ES VALIDA.');
      if (res.status === 429) throw new Error('SIN CREDITOS O LIMITE DE IA ALCANZADO.');
      throw new Error(`ERROR DE IA (${res.status}).`);
    }

    const payload: any = await res.json();
    const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
    const bloques: BloquePropuesto[] = Array.isArray(parsed?.bloques) ? parsed.bloques : [];
    if (bloques.length === 0) {
      throw new Error('LA IA NO PUDO ARMAR LA PROGRAMACION. PROBA DESCRIBIENDO LOS HORARIOS.');
    }

    const normalizados = bloques
      .map(normalizarBloque)
      .filter((b): b is BloquePropuesto => b !== null);
    const { completos, diasCompletados } = completarDiasFaltantes(normalizados);

    return {
      resumen:
        (parsed.resumen || '') +
        (diasCompletados.length
          ? ` (${diasCompletados.map((d) => NOMBRES_DIA[d]).join(', ')} se completaron replicando el patrón del día equivalente)`
          : ''),
      generosVetados: Array.isArray(parsed.generosVetados) ? parsed.generosVetados : [],
      valenciaMinGlobal: Number(parsed.valenciaMinGlobal) || 0.45,
      bloques: completos,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Completa los días que el modelo no devolvió.
 *
 * Pedirle que repita la estructura para los siete días es poco confiable: en la
 * prueba real devolvió solo lunes, viernes y domingo. Un día sin bloques deja al
 * local SIN MÚSICA ese día entero, así que se replica el patrón del día
 * equivalente: los laborables copian de otro laborable, el sábado del viernes
 * (o del sábado si vino), y el domingo nunca se inventa — si el local no abre,
 * no debe tener bloques.
 */
function completarDiasFaltantes(bloques: BloquePropuesto[]): {
  completos: BloquePropuesto[];
  diasCompletados: number[];
} {
  const porDia = new Map<number, BloquePropuesto[]>();
  for (const b of bloques) {
    if (!porDia.has(b.diaSemana)) porDia.set(b.diaSemana, []);
    porDia.get(b.diaSemana)!.push(b);
  }

  const LABORABLES = [1, 2, 3, 4, 5];
  // El día modelo es el que MÁS bloques trajo: copiar de uno incompleto
  // propagaría su hueco a toda la semana.
  const modeloLaborable = LABORABLES.map((d) => porDia.get(d) || [])
    .filter((v) => v.length)
    .sort((a, b) => b.length - a.length)[0];
  const diasCompletados: number[] = [];
  const salida = [...bloques];

  /**
   * Completa un día con los bloques del modelo cuyo horario no esté ya cubierto.
   *
   * No alcanza con rellenar días vacíos: en la prueba real el viernes y el
   * sábado vinieron SOLO con la noche, así que el local quedaba sin música de
   * 09:00 a 17:00 — justo el buffet del sábado. Se rellenan los HUECOS.
   */
  const completarDia = (dia: number, modelo: BloquePropuesto[]): boolean => {
    const propios = porDia.get(dia) || [];
    const cubre = (desde: string, hasta: string) =>
      propios.some((p) => p.horaDesde < hasta && p.horaHasta > desde);

    let agregoAlgo = false;
    for (const b of modelo) {
      if (cubre(b.horaDesde, b.horaHasta)) continue;
      salida.push({ ...b, diaSemana: dia });
      agregoAlgo = true;
    }
    return agregoAlgo;
  };

  // Laborables: se copian del laborable más completo que haya venido.
  for (const dia of LABORABLES) {
    if (!modeloLaborable) break;
    if (completarDia(dia, modeloLaborable)) diasCompletados.push(dia);
  }

  // Sábado: se parece al viernes (fin de semana), no al lunes. Se usa el
  // viernes YA COMPLETADO como modelo, para no arrastrarle el mismo hueco.
  const viernesCompleto = salida.filter((b) => b.diaSemana === 5);
  const baseSabado = viernesCompleto.length ? viernesCompleto : modeloLaborable;
  if (baseSabado && completarDia(6, baseSabado)) diasCompletados.push(6);

  // El domingo NO se completa: si el modelo no lo trajo puede ser que el local
  // no abra. Inventarlo haría sonar música un día cerrado.

  return { completos: salida, diasCompletados };
}

/** El modelo puede devolver horas sueltas o fuera de rango: se sanean acá. */
function normalizarBloque(b: any): BloquePropuesto | null {
  const hora = (v: any): string | null => {
    const m = String(v ?? '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };
  const desde = hora(b?.horaDesde);
  const hasta = hora(b?.horaHasta);
  const dia = Number(b?.diaSemana);
  if (!desde || !hasta || !Number.isInteger(dia) || dia < 0 || dia > 6) return null;

  return {
    diaSemana: dia,
    nombre: String(b?.nombre || 'BLOQUE').toUpperCase(),
    horaDesde: desde,
    horaHasta: hasta,
    energia: Math.min(5, Math.max(1, Number(b?.energia) || 3)),
    volumen: Math.min(100, Math.max(0, Number(b?.volumen) || 50)),
    generosPreferidos: (b?.generosPreferidos || []).map((g: any) => String(g).toUpperCase()),
    generosEvitar: (b?.generosEvitar || []).map((g: any) => String(g).toUpperCase()),
    bpmMin: Number(b?.bpmMin) || undefined,
    bpmMax: Number(b?.bpmMax) || undefined,
    valenciaMin: Number(b?.valenciaMin) || undefined,
    // Sin UPPERCASE: va literal al prompt del planificador.
    notas: b?.notas ? String(b.notas) : undefined,
    maxPorArtista: b?.maxPorArtista === null ? null : Number(b?.maxPorArtista) || undefined,
  };
}

/**
 * Persiste la propuesta.
 *
 * `preservarManuales` respeta los bloques que el dueño editó a mano: se
 * identifican por día + horario. Sin esto, regenerar desde el texto pisaría en
 * silencio ajustes que costaron trabajo, y el dueño perdería la confianza en el
 * botón "Regenerar".
 */
export async function aplicarConfiguracion(
  dataSource: DataSource,
  userDataPath: string,
  propuesta: ConfiguracionPropuesta,
  opts: { brief: string; preservarManuales: boolean; usuarioId?: number },
): Promise<{ bloques: number; vetos: number; preservados: number }> {
  const bloqueRepo = dataSource.getRepository(BloqueProgramacion);
  const vetoRepo = dataSource.getRepository(MusicaVeto);

  const previos = await bloqueRepo.find({ where: { activo: true } });
  const clave = (b: { diaSemana: number; horaDesde: string }) => `${b.diaSemana}::${b.horaDesde}`;
  const manuales = new Map<string, BloqueProgramacion>();

  if (opts.preservarManuales) {
    for (const b of previos) {
      // updatedAt > createdAt ⇒ alguien lo tocó después de crearlo.
      const editado =
        b.updatedAt && b.createdAt && b.updatedAt.getTime() - b.createdAt.getTime() > 2000;
      if (editado) manuales.set(clave(b), b);
    }
  }

  // Baja de todo lo anterior salvo lo preservado.
  const aDarDeBaja = previos.filter((b) => !manuales.has(clave(b)));
  for (const b of aDarDeBaja) b.activo = false;
  if (aDarDeBaja.length) await bloqueRepo.save(aDarDeBaja);

  const nuevos: BloqueProgramacion[] = [];
  for (const [i, p] of propuesta.bloques.entries()) {
    if (manuales.has(clave(p))) continue; // ese horario ya tiene versión del dueño
    nuevos.push(
      bloqueRepo.create({
        diaSemana: p.diaSemana,
        nombre: p.nombre,
        horaDesde: p.horaDesde,
        horaHasta: p.horaHasta,
        energia: p.energia,
        volumen: p.volumen,
        generosPreferidos: p.generosPreferidos,
        generosEvitar: p.generosEvitar,
        bpmMin: p.bpmMin,
        bpmMax: p.bpmMax,
        valenciaMin: p.valenciaMin ?? propuesta.valenciaMinGlobal,
        maxPorArtista: p.maxPorArtista,
        evitarArtistaConsecutivo: true,
        notas: p.notas,
        orden: i,
        activo: true,
      } as BloqueProgramacion),
    );
  }
  if (nuevos.length) await bloqueRepo.save(nuevos);

  let vetosNuevos = 0;
  for (const genero of propuesta.generosVetados) {
    const valor = String(genero).toUpperCase();
    const ya = await vetoRepo.findOne({
      where: { tipo: TipoVeto.GENERO, valor, activo: true },
    });
    if (ya) continue;
    await vetoRepo.save(
      vetoRepo.create({
        tipo: TipoVeto.GENERO,
        valor,
        etiqueta: valor,
        bloqueId: null,
        motivo: 'BRIEF DEL DUEÑO',
        activo: true,
      }),
    );
    vetosNuevos++;
  }

  // El brief queda guardado: sigue alimentando el descubrimiento todos los días.
  updateAppSettings(userDataPath, (s) => ({
    ...s,
    musica: { ...s.musica, brief: opts.brief },
  }));

  return { bloques: nuevos.length, vetos: vetosNuevos, preservados: manuales.size };
}

/** Resumen legible de la propuesta, para revisarla antes de aplicarla. */
export function describirPropuesta(propuesta: ConfiguracionPropuesta): string[] {
  const porDia = new Map<number, BloquePropuesto[]>();
  for (const b of propuesta.bloques) {
    if (!porDia.has(b.diaSemana)) porDia.set(b.diaSemana, []);
    porDia.get(b.diaSemana)!.push(b);
  }

  const lineas: string[] = [];
  for (const dia of [1, 2, 3, 4, 5, 6, 0]) {
    const bloques = porDia.get(dia);
    if (!bloques?.length) continue;
    const detalle = bloques
      .sort((a, b) => a.horaDesde.localeCompare(b.horaDesde))
      .map((b) => `${b.horaDesde}-${b.horaHasta} ${b.nombre} (e${b.energia})`)
      .join(' · ');
    lineas.push(`${NOMBRES_DIA[dia]}: ${detalle}`);
  }
  return lineas;
}
