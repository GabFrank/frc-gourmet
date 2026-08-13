/**
 * Presets de programacion musical: una grilla semanal lista para usar.
 *
 * Existen porque nadie configura un modulo desde una pantalla en blanco. El
 * dueno elige el tipo de local y ya tiene bloques, energias y vetos; despues
 * ajusta. En F1.5 el brief en texto libre genera una grilla equivalente con
 * LLM, pero el preset sigue siendo el atajo para quien no quiere escribir.
 *
 * Ver docs/DISENO-OPERATIVO-MUSICA.md seccion 1 y anexo 9.
 */

export interface BloquePreset {
  /** 0=domingo .. 6=sabado. -1 = todos los dias. */
  diaSemana: number;
  nombre: string;
  horaDesde: string;
  horaHasta: string;
  energia: number;
  volumen: number;
  generosPreferidos?: string[];
  generosEvitar?: string[];
  bpmMin?: number;
  bpmMax?: number;
  valenciaMin?: number;
  notas?: string;
}

export interface PresetMusica {
  codigo: string;
  nombre: string;
  descripcion: string;
  /** Vetos globales que acompanan al preset. */
  generosVetados: string[];
  /** Aplica a todos los bloques salvo que el bloque diga otra cosa. */
  valenciaMinGlobal: number;
  bloques: BloquePreset[];
}

/** Dias utiles de lunes a jueves — el patron base de la semana. */
const LUN_JUE = [1, 2, 3, 4];

/**
 * Preset derivado del brief real de Don Franco Burger & Steak (Salto del
 * Guaira): buffet al mediodia, hamburguesas y cervezas artesanales de noche,
 * publico 25+ mezcla de turistas brasilenos y locales.
 *
 * Sirve tal cual para cualquier restaurante-bar de frontera con almuerzo y
 * turno noche, que es el caso mas comun del producto.
 */
function bloquesRestauranteBar(): BloquePreset[] {
  const bloques: BloquePreset[] = [];

  // ── Lunes a jueves ──
  for (const dia of LUN_JUE) {
    bloques.push(
      {
        diaSemana: dia,
        nombre: 'APERTURA Y MONTAJE',
        horaDesde: '09:00',
        horaHasta: '11:00',
        energia: 4,
        volumen: 55,
        generosPreferidos: ['ELECTRONICA', 'DANCE POP', 'HITS DEL MOMENTO'],
        bpmMin: 110,
        bpmMax: 135,
        notas:
          'Todavia no hay clientes: el equipo limpia y ordena. La musica es para levantar el ritmo del trabajo.',
      },
      {
        diaSemana: dia,
        nombre: 'ALMUERZO BUFFET',
        horaDesde: '11:00',
        horaHasta: '14:00',
        energia: 2,
        volumen: 40,
        generosPreferidos: ['BOSSA NOVA', 'MPB', 'CHILL ELECTRONICO', 'SUNSET'],
        generosEvitar: ['ROCK PESADO', 'ELECTRONICA MOVIDA'],
        bpmMin: 70,
        bpmMax: 105,
        valenciaMin: 0.45,
        notas:
          'Buffet libre. Turistas brasilenos y familias que vienen de compras, mas locales. Volumen bajo: se conversa.',
      },
      {
        diaSemana: dia,
        nombre: 'SOBREMESA',
        horaDesde: '14:00',
        horaHasta: '16:00',
        energia: 2,
        volumen: 38,
        generosPreferidos: ['BOSSA NOVA', 'CHILL ELECTRONICO', 'INDIE SUAVE', 'SUNSET'],
        bpmMin: 70,
        bpmMax: 100,
        valenciaMin: 0.35,
        notas:
          'Cierra el buffet pero el local sigue abierto con bebidas y snacks. Bloque de PERMANENCIA: tempo y volumen bajos para que la gente se quede consumiendo.',
      },
      {
        diaSemana: dia,
        nombre: 'PREVIA DE LA NOCHE',
        horaDesde: '16:00',
        horaHasta: '17:00',
        energia: 3,
        volumen: 45,
        generosPreferidos: ['POP', 'ROCK ALTERNATIVO', 'SERTANEJO LIVIANO'],
        bpmMin: 95,
        bpmMax: 120,
        notas: 'Empieza a subir para no pasar de golpe de la sobremesa al turno noche.',
      },
      {
        diaSemana: dia,
        nombre: 'NOCHE TEMPRANA',
        horaDesde: '17:00',
        horaHasta: '20:00',
        energia: 3,
        volumen: 50,
        generosPreferidos: ['ROCK ALTERNATIVO', 'POP', 'HITS MUNDIALES'],
        bpmMin: 95,
        bpmMax: 125,
        notas: 'Arranca el turno de hamburguesas y cervezas artesanales.',
      },
      {
        diaSemana: dia,
        nombre: 'CENA',
        horaDesde: '20:00',
        horaHasta: '23:59',
        energia: 4,
        volumen: 55,
        generosPreferidos: [
          'ROCK ALTERNATIVO',
          'POP',
          'HITS MUNDIALES',
          'PAGODE',
          'SERTANEJO',
          'PARAGUAYA CONTEMPORANEA',
        ],
        bpmMin: 100,
        bpmMax: 135,
        notas: 'Rock y pop en primer plano, con ventanas a pagode, sertanejo y musica paraguaya.',
      },
    );
  }

  // ── Viernes: igual hasta las 17, noche mas movida ──
  for (const b of bloquesRestauranteBarDia(5)) bloques.push(b);
  // ── Sabado: pagode ya en el almuerzo, noche al maximo ──
  for (const b of bloquesRestauranteBarDia(6)) bloques.push(b);

  // ── Domingo: abre 16:00 ──
  bloques.push(
    {
      diaSemana: 0,
      nombre: 'SUNSET DOMINGO',
      horaDesde: '16:00',
      horaHasta: '19:00',
      energia: 2,
      volumen: 42,
      generosPreferidos: ['CHILL ELECTRONICO', 'SUNSET', 'BOSSA NOVA', 'PAGODE SUAVE'],
      bpmMin: 70,
      bpmMax: 105,
      valenciaMin: 0.4,
      notas: 'El bloque mas identitario del local: sunset, chill, clima de domingo.',
    },
    {
      diaSemana: 0,
      nombre: 'DOMINGO NOCHE',
      horaDesde: '19:00',
      horaHasta: '23:59',
      energia: 3,
      volumen: 48,
      generosPreferidos: ['PAGODE', 'SERTANEJO', 'POP SUAVE', 'PARAGUAYA CONTEMPORANEA'],
      bpmMin: 90,
      bpmMax: 120,
      notas: 'Pagode y sertanejo alegres, cierre tranquilo de fin de semana.',
    },
  );

  return bloques;
}

/** Viernes (5) y sabado (6): mismo dia base con la noche mas arriba. */
function bloquesRestauranteBarDia(dia: number): BloquePreset[] {
  const esSabado = dia === 6;
  return [
    {
      diaSemana: dia,
      nombre: 'APERTURA Y MONTAJE',
      horaDesde: '09:00',
      horaHasta: '11:00',
      energia: 4,
      volumen: 55,
      generosPreferidos: ['ELECTRONICA', 'DANCE POP', 'HITS DEL MOMENTO'],
      bpmMin: 110,
      bpmMax: 135,
      notas: 'Montaje del local con el equipo.',
    },
    {
      diaSemana: dia,
      nombre: 'ALMUERZO BUFFET',
      horaDesde: '11:00',
      horaHasta: '14:00',
      energia: esSabado ? 3 : 2,
      volumen: 42,
      generosPreferidos: esSabado
        ? ['PAGODE', 'BOSSA NOVA', 'MPB', 'SUNSET']
        : ['BOSSA NOVA', 'MPB', 'CHILL ELECTRONICO', 'SUNSET'],
      generosEvitar: ['ROCK PESADO'],
      bpmMin: 75,
      bpmMax: esSabado ? 115 : 105,
      valenciaMin: 0.5,
      notas: esSabado
        ? 'Fin de semana: entra pagode alegre mezclado con bossa. Mas familias brasilenas. Nunca agresivo ni triste.'
        : 'Buffet de viernes, publico mixto.',
    },
    {
      diaSemana: dia,
      nombre: 'SOBREMESA',
      horaDesde: '14:00',
      horaHasta: '16:00',
      energia: 2,
      volumen: 38,
      generosPreferidos: ['BOSSA NOVA', 'CHILL ELECTRONICO', 'SUNSET', 'PAGODE SUAVE'],
      bpmMin: 70,
      bpmMax: 100,
      valenciaMin: 0.35,
      notas: 'Bebidas y snacks, bloque de permanencia.',
    },
    {
      diaSemana: dia,
      nombre: 'PREVIA DE LA NOCHE',
      horaDesde: '16:00',
      horaHasta: '17:00',
      energia: 3,
      volumen: 45,
      generosPreferidos: ['POP', 'ROCK ALTERNATIVO', 'SERTANEJO LIVIANO'],
      bpmMin: 95,
      bpmMax: 120,
    },
    {
      diaSemana: dia,
      nombre: 'NOCHE TEMPRANA',
      horaDesde: '17:00',
      horaHasta: '20:00',
      energia: 4,
      volumen: 52,
      generosPreferidos: ['ROCK ALTERNATIVO', 'POP', 'HITS MUNDIALES', 'PAGODE'],
      bpmMin: 100,
      bpmMax: 130,
      notas: 'Fin de semana: arranca mas arriba que entre semana.',
    },
    {
      diaSemana: dia,
      nombre: 'NOCHE PICO',
      horaDesde: '20:00',
      horaHasta: '23:59',
      energia: 5,
      volumen: 58,
      generosPreferidos: [
        'ROCK ALTERNATIVO',
        'POP',
        'HITS MUNDIALES',
        'PAGODE',
        'SERTANEJO',
        'PARAGUAYA CONTEMPORANEA',
      ],
      bpmMin: 110,
      bpmMax: 140,
      valenciaMin: 0.5,
      notas: 'Viernes y sabado: lo mas movido y alegre de la semana.',
    },
  ];
}

export const PRESETS_MUSICA: PresetMusica[] = [
  {
    codigo: 'RESTAURANTE_BAR',
    nombre: 'Restaurante + bar (almuerzo y noche)',
    descripcion:
      'Buffet o almuerzo al mediodia, sobremesa con bebidas, y turno noche de hamburguesas/cervezas. Publico 25+, mezcla de familias y turistas.',
    // "Nada de funk, hip hop, rock pesado, kachaka ni reggaeton" del brief.
    generosVetados: [
      'FUNK BRASILEIRO',
      'HIP HOP',
      'RAP',
      'TRAP',
      'HEAVY METAL',
      'THRASH METAL',
      'KACHAKA',
      'REGGAETON',
    ],
    // "Evitar musicas tristes" es regla transversal, no de un bloque.
    valenciaMinGlobal: 0.45,
    bloques: bloquesRestauranteBar(),
  },
];

export function getPreset(codigo: string): PresetMusica | undefined {
  return PRESETS_MUSICA.find((p) => p.codigo === codigo);
}
