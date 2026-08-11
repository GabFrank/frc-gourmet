/**
 * Planificador diario con IA (F3).
 *
 * Es la tercera de las tres decisiones del módulo, y la única que corre una vez
 * por día (ver docs/DISENO-OPERATIVO-MUSICA.md §3):
 *
 *   1. etiquetar cada track   → una vez por track, para siempre
 *   2. PLANIFICAR EL DÍA      → 1 llamada por día  ← esto
 *   3. elegir el próximo tema → código determinista, sin IA
 *
 * Acá el LLM no elige canciones: ajusta el PERFIL de cada bloque para hoy.
 * Mirando las ventas reales por franja, el día de la semana, si es feriado y
 * las notas del dueño, decide que hoy el almuerzo va un punto más tranquilo o
 * que el sábado a la noche conviene subir antes. El generador determinista
 * sigue siendo quien arma las playlists.
 *
 * Por qué no dejarlo elegir tema por tema: hay reglas duras —vetos,
 * anti-repetición, máximo por artista— que en código se cumplen SIEMPRE y en un
 * prompt se cumplen *casi* siempre. La IA aporta criterio, no contabilidad.
 */
import { DataSource } from 'typeorm';
import { BloqueProgramacion } from '../../src/app/database/entities/musica/bloque-programacion.entity';
import { PlanProgramacion } from '../../src/app/database/entities/musica/plan-programacion.entity';
import { Feriado } from '../../src/app/database/entities/rrhh/feriado.entity';
import { OrigenPlan } from '../../src/app/database/entities/musica/musica-enums';
import { readIaConfig } from '../utils/ia-config.utils';
import { readAppSettings } from '../utils/app-settings.utils';
import { ventasPorFranja } from './musica-salon.service';

export interface AjusteBloque {
  bloqueId: number;
  energia: number;
  bpmMin?: number;
  bpmMax?: number;
  generosPreferidos?: string[];
  motivo?: string;
}

export interface PlanIa {
  justificacion: string;
  ajustes: AjusteBloque[];
}

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Pide al modelo los ajustes del día. Devuelve `null` si la IA no está
 * configurada o falla: en ese caso el generador usa la grilla tal cual, que es
 * un resultado perfectamente válido. **La IA mejora el plan, no lo habilita.**
 */
export async function planificarDia(
  dataSource: DataSource,
  userDataPath: string,
  fecha: string,
  instruccion?: string,
): Promise<PlanIa | null> {
  const ia = await readIaConfig(userDataPath);
  if (!ia.openaiApiKey) return null;

  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
  const bloqueRepo = dataSource.getRepository(BloqueProgramacion);
  const bloques = await bloqueRepo.find({
    where: [
      { activo: true, diaSemana },
      { activo: true, diaSemana: -1 },
    ],
    order: { horaDesde: 'ASC' },
  });
  if (bloques.length === 0) return null;

  const [franjas, feriado, planesPrevios] = await Promise.all([
    ventasPorFranja(dataSource, 4),
    esFeriado(dataSource, fecha),
    ultimosPlanes(dataSource, 3),
  ]);

  const { musica } = readAppSettings(userDataPath);

  const prompt = [
    'Sos el curador musical de un restaurante. Ajustá el perfil de cada bloque del día de hoy.',
    'NO elegís canciones: solo la energía y el rango de BPM de cada momento.',
    '',
    musica.brief ? `SOBRE EL LOCAL:\n${musica.brief}\n` : '',
    `HOY ES ${NOMBRES_DIA[diaSemana]} ${fecha}${feriado ? ` — FERIADO: ${feriado}` : ''}.`,
    '',
    'BLOQUES PROGRAMADOS (energía base que definió el dueño):',
    ...bloques.map(
      (b) =>
        `- id ${b.id} | ${b.horaDesde}-${b.horaHasta} | ${b.nombre} | energía ${b.energia}/5 | ` +
        `BPM ${b.bpmMin ?? '-'}-${b.bpmMax ?? '-'}` +
        (b.notas ? ` | notas del dueño: ${b.notas}` : ''),
    ),
    '',
    franjas.length
      ? `VENTAS REALES POR HORA (últimas 4 semanas): ${franjas
          .map((f) => `${f.hora}h:${f.ventas}`)
          .join(' ')}`
      : 'Todavía no hay historial de ventas.',
    '',
    planesPrevios.length
      ? `CÓMO VENÍAN LOS ÚLTIMOS DÍAS:\n${planesPrevios.join('\n')}`
      : '',
    instruccion ? `\nPEDIDO EXPRESO DEL DUEÑO PARA HOY: "${instruccion}"` : '',
    '',
    'CRITERIO:',
    '- Donde las ventas muestran el pico real, subí la energía: ayuda a rotar mesas.',
    '- En las franjas valle con gente sentada, bajala: el tempo lento alarga la estadía y el',
    '  consumo. No apures a la mesa que más margen deja.',
    '- Un feriado o un fin de semana admite más energía que un martes.',
    '- Respetá el espíritu de cada bloque: ajustá ±1 punto, no lo des vuelta.',
    '- Si el pedido del dueño contradice todo lo anterior, gana el pedido del dueño.',
    '',
    'Devolvé SOLO JSON:',
    '{"justificacion":"2 frases explicando el día",',
    ' "ajustes":[{"bloqueId":1,"energia":3,"bpmMin":90,"bpmMax":120,"motivo":"breve"}]}',
  ]
    .filter(Boolean)
    .join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
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
        temperature: 0.4,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const payload: any = await res.json();
    const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
    const ajustes: AjusteBloque[] = (parsed?.ajustes || [])
      .map((a: any) => ({
        bloqueId: Number(a?.bloqueId),
        // Acotado a 1-5 y a ±1 del valor del dueño: el modelo propone, no manda.
        energia: Math.min(5, Math.max(1, Number(a?.energia) || 3)),
        bpmMin: Number(a?.bpmMin) || undefined,
        bpmMax: Number(a?.bpmMax) || undefined,
        generosPreferidos: Array.isArray(a?.generosPreferidos)
          ? a.generosPreferidos.map((g: any) => String(g).toUpperCase())
          : undefined,
        motivo: a?.motivo ? String(a.motivo) : undefined,
      }))
      .filter((a: AjusteBloque) => Number.isInteger(a.bloqueId));

    if (ajustes.length === 0) return null;
    return { justificacion: String(parsed?.justificacion || ''), ajustes };
  } catch {
    // Cualquier fallo cae al plan por reglas. La música no depende de la IA.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Aplica los ajustes SOBRE UNA COPIA en memoria de los bloques. No toca la
 * grilla persistida: la configuración del dueño es la base estable y el ajuste
 * vale solo para el plan de hoy.
 */
export function aplicarAjustes(
  bloques: BloqueProgramacion[],
  plan: PlanIa | null,
): BloqueProgramacion[] {
  if (!plan) return bloques;
  const porId = new Map(plan.ajustes.map((a) => [a.bloqueId, a]));

  return bloques.map((b) => {
    const ajuste = porId.get(b.id);
    if (!ajuste) return b;
    // Tope de ±1 respecto de lo que definió el dueño: si el modelo se entusiasma
    // y pone un 5 donde había un 2, el local sonaría irreconocible.
    const energia = Math.min(b.energia + 1, Math.max(b.energia - 1, ajuste.energia));
    return Object.assign(Object.create(Object.getPrototypeOf(b)), b, {
      energia,
      bpmMin: ajuste.bpmMin ?? b.bpmMin,
      bpmMax: ajuste.bpmMax ?? b.bpmMax,
      generosPreferidos: ajuste.generosPreferidos ?? b.generosPreferidos,
    }) as BloqueProgramacion;
  });
}

async function esFeriado(dataSource: DataSource, fecha: string): Promise<string | null> {
  try {
    const repo = dataSource.getRepository(Feriado);
    const feriados = await repo.find({ where: { activo: true } });
    const [, mes, dia] = fecha.split('-');
    const hit = feriados.find((f: any) => {
      const d = f.fecha ? new Date(f.fecha) : null;
      if (!d || Number.isNaN(d.getTime())) return false;
      return d.getMonth() + 1 === Number(mes) && d.getDate() === Number(dia);
    });
    return hit ? (hit as any).descripcion || (hit as any).nombre || 'Feriado' : null;
  } catch {
    return null;
  }
}

async function ultimosPlanes(dataSource: DataSource, cantidad: number): Promise<string[]> {
  const repo = dataSource.getRepository(PlanProgramacion);
  const planes = await repo.find({ order: { fecha: 'DESC' }, take: cantidad });
  return planes
    .filter((p) => p.justificacion)
    .map((p) => `- ${p.fecha}${p.origen === OrigenPlan.IA ? '' : ' (por reglas)'}: ${p.justificacion}`);
}
