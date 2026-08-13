# Diseño operativo — Música ambiental (cómo se configura y cómo decide la IA)

**Fecha:** 2026-08-10
**Complementa:** [PLAN-MUSICA-SPOTIFY.md](PLAN-MUSICA-SPOTIFY.md) (arquitectura técnica) e [INVESTIGACION-MUSICA-AMBIENTAL.md](INVESTIGACION-MUSICA-AMBIENTAL.md) (proveedores y restricciones).
**Qué define este doc:** qué carga el usuario, cómo se arma el repertorio, qué decide la IA y cuándo, y qué ve en pantalla.

---

## 0. El principio que ordena todo el diseño

> **El dueño no sabe describir la música que quiere. Sabe reconocerla.**

Nadie va a llenar un formulario que pida "energía 3.5, valencia media, 95-110 BPM, indie folk". Pero cualquiera sabe decir *"quiero que suene como esta playlist"*, *"este artista sí"*, *"esto no me va"*.

De ahí, tres reglas de producto:

1. **Se configura por ejemplos, no por parámetros.** Playlists y artistas de referencia son la entrada principal. Los parámetros numéricos los **deduce el sistema** desde esos ejemplos.
2. **Nunca se arranca de una pantalla en blanco.** Un preset por tipo de local deja todo funcionando en 2 minutos; el dueño ajusta.
3. **Corregir tiene que ser un botón, no una configuración.** "No va" mientras suena vale más que cualquier formulario, porque es cuando el dueño realmente tiene la opinión.

---

## 1. Qué carga el usuario

### Nivel −1 — **Contá tu local en texto** (la entrada principal)

Antes que cualquier formulario: un cuadro de texto donde el dueño **describe su local con sus palabras** — qué es, dónde está, qué público tiene, qué horarios, qué le gusta, qué odia. Puede escribirlo o dictarlo.

Ese texto (el **brief**) se manda al LLM una vez y sale **toda la configuración propuesta**: bloques horarios por día, energía de cada uno, géneros preferidos y vetados, reglas, y una lista de artistas/playlists semilla sugeridos. El dueño la revisa, ajusta lo que quiera y aplica.

```
Brief en texto ──► LLM ──► Configuración propuesta ──► [Revisar / Editar] ──► Aplicar
      ▲                                                        │
      └──────────── "Regenerar" tras editar el texto ◄──────────┘
```

Por qué esto es lo correcto y no un extra:

- Un preset genérico ("restaurante familiar") nunca va a capturar *"bossa n' roses en el buffet, pagode alegre los fines de semana, nada de funk"*. El brief sí.
- Es la forma en que el dueño **ya piensa** su local. No hay que enseñarle un vocabulario nuevo.
- **El brief queda guardado y entra como contexto permanente en el prompt del planificador diario.** No sólo genera la config inicial: sigue explicando el local todos los días.

**Dos vistas sobre la misma configuración:**

| Vista | Qué muestra | Para quién |
|---|---|---|
| **Simple** | el brief en texto + un resumen legible ("mañanas movidas, almuerzo bossa, noches rock") + botón *Regenerar* | el dueño, el 95% del tiempo |
| **Avanzada** | la grilla completa: bloques, energías, volúmenes, géneros, vetos, semillas — todo editable a mano | quien quiera afinar |

**Regla de convivencia entre las dos:** todo campo tocado a mano queda marcado como *override manual*. Al regenerar desde el texto, esos campos **se respetan y se avisa** cuál quedó fuera de la regeneración, con opción de "descartar mis cambios y regenerar todo". Nunca se pisa silenciosamente lo que el dueño editó.

**Modelo de datos:** `MusicaBrief` (texto, versión, fecha, configuración generada en JSON, usuario). Se versiona: si una regeneración empeora las cosas, se vuelve a la anterior.

**Handler:** `musica-interpretar-brief` → devuelve la propuesta **sin aplicarla**; `musica-aplicar-config` la persiste. Siempre hay un paso de revisión: la IA propone, el dueño dispone.

### Nivel 0 — Preset del local (atajo, si no quiere escribir nada)

Al activar el módulo se elige **tipo de local** y queda todo funcionando:

| Preset | Perfil general | Bloques que crea |
|---|---|---|
| Restaurante familiar | melódico, volumen bajo, sin explicit | apertura · almuerzo · tarde · cena · cierre |
| Café / Brunch | acústico, instrumental, energía baja-media | apertura · brunch · media tarde · cierre |
| Bar / Cervecería | energía media-alta, hits conocidos | previa · happy hour · pico · cierre |
| Pizzería / Delivery | energía media, popular | almuerzo · tarde · pico noche · cierre |
| Personalizado | arranca vacío | — |

El preset define bloques horarios, energía por bloque, volumen sugerido y semillas iniciales de estilo. **Todo editable.**

### Nivel 1 — Semillas: "que suene como esto" (lo más importante)

Tres formas de sembrar, todas por ejemplo:

- **Pegar links de playlists de Spotify** que al dueño le gusten (propias o públicas). El sistema lee sus tracks y los incorpora al pool.
- **Buscar y marcar artistas de referencia** (con foto, para reconocerlos). De cada uno se toman sus temas más escuchados.
- **Importar lo que ya venían usando**: playlists guardadas en la cuenta del local + `top tracks` + `recently played`.

Cada semilla se puede asignar a **uno o varios bloques** ("esto para el almuerzo", "esto para la noche") o dejarse general.

> Esta es la pantalla que hay que hacer bien. Todo lo demás se deduce de acá.

### Nivel 2 — Vetos y reglas (lo que NO puede sonar)

Más fácil de expresar que lo que sí, y es lo que protege la marca:

- **Artistas vetados** (buscador + lista).
- **Géneros vetados** (chips desde los géneros presentes en el pool, no una lista teórica).
- **Sin contenido explícito** (on/off, default ON).
- **Idiomas** permitidos/evitados.
- **Volumen máximo por bloque** — que nadie deje el local a todo volumen a las 8 AM.
- **Anti-repetición**: no repetir track en X días (default 3), ni más de N temas del mismo artista por bloque (default 2).
- **Rotación**: % mínimo de temas nuevos por semana (default 20%) — **esto es lo que ataca la habituación** que motivó el proyecto.

### Nivel 3 — Programación semanal (grilla)

Grilla lunes-domingo con bloques. Cada bloque:

`nombre · desde-hasta · energía 1-5 · volumen · semillas asignadas · notas del dueño`

Con acciones para **duplicar un día a otro** y **copiar la semana**. El campo **notas** es texto libre y va literal al prompt del agente: *"los domingos al mediodía viene mucha familia con chicos"*, *"después de las 23 sube el movimiento"*. Es el canal por donde entra el conocimiento que ningún parámetro captura.

---

## 2. Cómo se construye el repertorio (pool)

Spotify apagó `recommendations` y `related-artists`, así que el pool se arma con trabajo propio. Proceso en background, incremental:

```
Semillas del dueño
   ├── playlists  → GET /playlists/{id}/items   (paginado, 100 por página)
   ├── artistas   → álbumes del artista → tracks
   └── cuenta     → top tracks + recently played + biblioteca
                          │
                          ▼
              Deduplicar por ISRC / spotifyId
                          │
                          ▼
        Enriquecer cada track (una sola vez, para siempre)
   ├── ReccoBeats  → BPM, energía, valencia, danceability, key
   ├── Spotify     → duración, explicit, artista, álbum, popularidad*
   └── LLM (lote)  → escena, momento apto, "hit vs fondo", ambiente
                          │
                          ▼
                  MusicaTrack (nuestra BD)
```

\* `popularity` fue removido del objeto track en feb-2026; si no viene, se ignora — el "es conocida o no" lo resuelve el etiquetado del LLM.

**Expansión del pool** (para que no suene siempre lo mismo): a partir de los artistas semilla se buscan **artistas similares vía ReccoBeats/Last.fm** (Spotify ya no lo ofrece) y se resuelven en Spotify por `search`. Cada expansión entra a una bandeja de **"sugeridos"** que el dueño aprueba o rechaza de a lotes — nunca entra a sonar sin aprobación la primera vez.

**Tamaño objetivo:** 800–2.000 tracks por local. Con 2.000 tracks y anti-repetición de 3 días no se nota ciclo.

---

## 3. Qué decide la IA, y qué NO

Tres decisiones distintas, con costos y frecuencias distintas. Mezclarlas es el error clásico.

| # | Decisión | Quién | Cuándo | Por qué así |
|---|---|---|---|---|
| 1 | **Etiquetar cada track** | LLM en lote (50-100 tracks por llamada) + ReccoBeats | una vez por track, para siempre | El etiquetado es caro pero se amortiza: un track etiquetado sirve años |
| 2 | **Planificar el día** | LLM (1 llamada por día por local) | 1×/día de madrugada, **o cuando el usuario lo pide** | Es donde el criterio "humano" agrega valor: qué combina, qué corresponde a un domingo lluvioso |
| 3 | **Materializar el plan en playlists de Spotify** | Código, sin IA | al generar el plan | Deja el día entero resuelto por adelantado |
| 4 | **Cambiar de playlist** | Código determinista | **por evento** (cambio de bloque, pedido del staff, umbral sostenido del salón) | ~6-10 llamadas por día, no 2.880 |

> **Decisión (2026-08-10): el plan del día se resuelve de una sola vez.** No hay un loop que elija tema por tema. Ver §3.3.

> **Cambio de prioridad (2026-08-10): el descubrimiento con IA es el corazón del módulo, no un extra de F2.** El dueño no tiene playlists suficientes ni tiempo de armarlas — que es exactamente por lo que recurrió a la app. Re-mezclar sus 4 playlists dejaría al local escuchando lo mismo de siempre. Ver §3.4.

### 3.1 Etiquetado (una vez por track)

Entrada: artista, título, álbum, año, género de Spotify, BPM/energía/valencia de ReccoBeats.
Salida por track (JSON validado, se cachea en `MusicaTrack`):

```json
{
  "escenas": ["almuerzo", "cena", "tarde"],
  "ambiente": "relajado",
  "familiaridad": "conocida",
  "aptoFamiliar": true,
  "idioma": "es",
  "energiaPercibida": 3,
  "evitarSi": ["desayuno"],
  "notas": "clásico melódico, funciona de fondo sin llamar la atención"
}
```

Costo real: ~2.000 tracks en lotes de 100 = 20 llamadas, una sola vez.

### 3.2 Planificación diaria

**Entrada del prompt** (todo lo que el sistema ya sabe):

- Bloques del día con horario, energía objetivo, volumen y **las notas del dueño**
- Vetos vigentes (artistas, géneros, explicit, idiomas)
- Estadísticas del pool: cuántos tracks por escena/energía/género
- **Ventas por franja de las últimas 4 semanas** (de dónde sale el pico real, no el teórico)
- Feriado PY / día de la semana / clima del día
- Qué sonó los últimos 3 días (para no repetir)
- **Feedback acumulado**: "no va" y "más de esto" con su franja

**Salida** (JSON validado; si falla la validación, se reintenta y si vuelve a fallar se usa el plan de ayer):

```json
{
  "fecha": "2026-08-11",
  "bloques": [
    {
      "bloqueId": 3,
      "nombre": "Almuerzo",
      "desde": "11:30", "hasta": "14:30",
      "energiaObjetivo": 3,
      "bpmMin": 85, "bpmMax": 115,
      "volumen": 45,
      "generosPreferidos": ["bossa", "pop latino suave"],
      "generosEvitar": ["reggaeton", "rock pesado"],
      "trackIds": ["4uLU6h...", "1x8Vt7..."],
      "justificacion": "Lunes de almuerzo ejecutivo: energía media-baja, nada de percusión fuerte. Se rota el 25% respecto del viernes."
    }
  ]
}
```

La **justificación** no es decorativa: se muestra en pantalla ("por qué suena esto hoy") y queda auditada. Si el dueño no está de acuerdo, ahí mismo corrige.

Cada bloque recibe una lista **2-3× más larga que su duración**, para que el runtime pueda saltear sin quedarse sin material.

### 3.3 Ejecución: playlists materializadas, cambios por evento

**El día se resuelve una vez.** Al generar el plan, cada bloque se escribe como una **playlist real en la cuenta de Spotify del local**:

```
Plan del día ──► por cada bloque, 3 variantes de energía:
    "FRC · Almuerzo · suave"
    "FRC · Almuerzo · normal"   ← la que arranca
    "FRC · Almuerzo · movido"
```

Son playlists **fijas que se sobreescriben** cada día (mismo `playlistId`, ítems nuevos): no ensucian la cuenta y el dueño puede abrirlas en su Spotify, mirarlas y hasta editarlas a mano.

Cada playlist se genera **más larga que su bloque** (≈1,5×) para que nunca se termine antes de tiempo — si se terminara, Spotify arrancaría su autoplay de recomendaciones, que es justo lo que queremos evitar.

**Por qué esto es mejor que ir eligiendo tema por tema:**

- **Sobrevive a que la app se caiga.** Si FRC Gourmet se cierra, se cuelga o se actualiza, la playlist del bloque sigue sonando. Con una cola gestionada en vivo, la música moría con la app. Esta es la razón más fuerte.
- ~**6-10 llamadas a la API por día** en vez de miles: sin riesgo de 429, sin desgaste.
- **Auditable y editable**: el día entero está a la vista antes de sonar.
- Menos partes móviles que puedan fallar en el local.

**Los únicos disparadores que cambian la música:**

| Evento | Acción |
|---|---|
| Empieza un bloque nuevo | `play(context_uri)` de la playlist del bloque (variante "normal") |
| El salón se llena y **se sostiene** (ocupación alta + ritmo de ventas alto, ≥10 min continuos) | cambia a la variante **"movido"** del mismo bloque |
| El salón se vacía y se sostiene (≥10 min) | cambia a la variante **"suave"** |
| Staff toca **"No va"** | `next` + veto del track |
| Dueño pide **regenerar** ("hoy quiero algo más tranquilo") | se regenera el plan del día (o solo del bloque) y se reescriben las playlists |
| Cambio manual detectado en la app de Spotify | **modo manual**: el sistema se aparta hasta el próximo bloque |

La **histéresis de 10 minutos** es deliberada: sin ella la música cambiaría de humor cada vez que entra o sale una mesa, que es peor que no reaccionar.

**Heartbeat lento (cada 2-5 min), que NO elige música.** Sólo verifica tres cosas y avisa si fallan: que el device siga vivo, que efectivamente esté sonando algo, y que lo que suena pertenezca a la playlist esperada (si no, es que alguien tocó a mano → modo manual). Es el watchdog, no el cerebro.

---

### 3.4 Descubrimiento: el LLM descubre, Spotify resuelve

Spotify ya no recomienda nada (`recommendations` y `related-artists` murieron en nov-2024) y su `search` devuelve 10 resultados: **es inútil para descubrir, pero perfecto para resolver**. De ahí la división de trabajo:

```
Contexto del local ──► LLM ──► "artista — tema" ──► search de Spotify ──► track real ──► repertorio
```

El prompt lleva: el **brief**, los **bloques con sus notas**, los **géneros preferidos de la grilla**, los **vetos**, los **artistas que ya tiene** (para que proponga otros) y —clave— **lo que ya rechazó**, como ejemplo negativo.

**Ese último punto es todo el aprendizaje del sistema.** No se reentrena nada: cada "no va" mejora el contexto de la próxima ronda. Es más rápido, más barato y auditable.

Filtros que atraviesa cada candidato, en orden:

1. Artista o género vetado → descartado **antes** de gastar un request a Spotify
2. Resolución con match estricto de artista + título normalizado (sin `(Remastered)`, sin `feat.`) — sin esto Spotify devuelve cualquier cosa para nombres que no existen y el repertorio se llena de basura
3. `explicit` (configurable), duración fuera de rango, y duplicados

Lo que sobrevive entra **aprobado directamente** por defecto: el dueño pidió no curar de a uno. `temperature: 0.8` a propósito — con 0 el modelo propone siempre lo mismo y el repertorio dejaría de crecer a la segunda ronda.

## 4. Pantallas

> **La PWA mobile es el control principal, no un espejo del desktop.** El PC del PdV está ocupado cobrando y con clientes adelante; nadie va a ir hasta la caja para saltear un tema. El encargado controla la música desde el celular, caminando por el salón — que es además donde realmente se escucha cómo suena.

| Pantalla | Dónde | Para quién | Contenido |
|---|---|---|---|
| **Control de música** | **PWA (principal)** + tab desktop | encargado, mozos | ver §4.1 |
| **Mi estilo / brief** | desktop | dueño | el brief en texto, semillas, bandeja de sugeridos, vetos |
| **Programación** | desktop | dueño | grilla semanal, notas por bloque, duplicar día/semana |
| **Repertorio** | desktop | dueño | el pool con filtros, estado de etiquetado, buscar y vetar |
| **Historial** | desktop + PWA (lectura) | dueño | qué sonó y cuándo, cruzado con ventas del bloque |

Todo con el padrón visual existente: `<app-dash-*>` para métricas, `mat-menu` para acciones de tabla, sin colores hardcodeados.

### 4.1 Control de música en la PWA (pantalla completa del módulo)

Una sola pantalla, scrolleable, pensada para usarse con una mano mientras se atiende:

**1. Ahora suena**
Carátula, tema, artista, barra de progreso, y **bloque vigente** ("Cena / hamburguesas · energía 4"). Controles grandes: anterior · play/pausa · siguiente · slider de volumen.

**2. Los dos botones de feedback**
**"No va"** (saltea y veta) y **"Más de esto"**. Tamaño de dedo, sin confirmación — son reversibles desde el historial.

**3. Siguientes temas**
Lista de los próximos de la playlist del bloque. Por ítem, con `mat-menu`: *saltar hasta acá* (reproduce desde ese track), *vetar tema*, *vetar artista*. Ver lo que viene es lo que más tranquiliza al encargado: sabe que no se viene algo fuera de lugar.

**4. Cambiar el clima ahora**
Los tres perfiles del bloque actual como botones: **Suave · Normal · Movido**. Es el override manual del salón — **vence solo al empezar el próximo bloque**, así nadie deja el local en "movido" toda la noche por error.

**5. Saltar a otro momento**
Timeline de los bloques del día con el actual resaltado. Permite forzar otro bloque ("poné el sunset ahora aunque sean las 15:00"). También vence en el próximo cambio de bloque.

**6. Recalcular**
Botón *Regenerar*, con alcance elegible (**solo este bloque** / **resto del día**) y un campo de texto corto para la instrucción: *"hoy hay muchas familias con chicos"*, *"algo más tranquilo"*. Ese texto entra al prompt del planificador y **queda registrado** junto con el plan resultante. Requiere `MUSICA_CONFIGURAR`.

**7. Estado del sistema**
Chip visible: `Sonando` / `En pausa` / `Modo manual` / **`Spotify cerrado en la PC`**. El último es el que importa: si alguien cerró Spotify, el encargado se entera por el celular en vez de por el silencio del salón.

**Detalles técnicos de la PWA:**

- **Actualización por SSE**, no polling — mismo mecanismo que el KDS (`kds-sse-routes.ts`). En un celular, un poll cada pocos segundos es batería tirada. La PWA se suscribe a `/api/musica/stream` y recibe cambios de track, bloque, modo y estado del device.
- **Varios dispositivos a la vez**: todos ven lo mismo por el mismo stream. Las acciones se debouncean en backend para que dos "siguiente" simultáneos no salten dos temas.
- **La PWA no reproduce audio**, sólo controla: el player sigue siendo la app de Spotify del PC. Por eso funciona igual en iPhone que en Android — las restricciones de audio en background de iOS no aplican.
- **Sin conexión con el server**: la pantalla se marca como desactualizada y deshabilita los controles, en vez de mentir con datos viejos.
- **Código propio en `projects/mobile`** — la PWA es un proyecto Angular aparte: necesita su propio componente y su propio servicio, consumiendo por `/api/rpc` los **mismos handlers** que el desktop. Cero backend nuevo.
- **Permisos**: los controles piden `MUSICA_CONTROLAR`; regenerar pide `MUSICA_CONFIGURAR`; la vista sola, `MUSICA_VER`. Así se decide si un mozo puede saltear temas o sólo mirar.

---

## 5. Feedback: dos botones y nada más

| Acción | Efecto inmediato | Efecto en el próximo plan |
|---|---|---|
| **No va** | skip al toque | el track baja de score; 3 "no va" del mismo artista en la misma franja → artista vetado para esa franja (se avisa al dueño) |
| **Más de esto** | ninguno (no interrumpe) | sube el score del track y de sus similares para esa franja |

Ambos guardan **quién, cuándo y en qué bloque**. Se puede limitar quién puede votar por permiso (`MUSICA_CONTROLAR`).

Esto es lo que convierte al sistema en algo que **mejora solo**: no hay que volver a configurar nada, sólo reaccionar cuando algo molesta.

---

## 6. Las reglas que atacan los 4 dolores originales

| Dolor reportado | Regla que lo mata |
|---|---|
| "Se traba un artista y suena 3 horas" | máx. N tracks por artista por bloque (default 2), y jamás 2 seguidos |
| "No hay tiempo de renovar playlists" | rotación forzada: mínimo 20% de temas nuevos por semana, tomados del pool aprobado |
| "Suena algo que no corresponde al horario" | bloques con energía + escena + vetos por franja; el track fuera de perfil se saltea solo |
| "El equipo deja de percibir la música" | rotación semanal + expansión del pool con sugeridos + el dashboard muestra si el repertorio se estancó |

---

## 7. Modelo de datos que agrega esta parte

Sobre lo ya listado en el plan técnico:

| Entidad | Campos clave |
|---|---|
| `MusicaSemilla` | tipo (PLAYLIST/ARTISTA/TRACK), spotifyUri, nombre, bloques asignados, activo |
| `MusicaTrack` | spotifyId, isrc, artista, título, duración, explicit, bpm, energía, valencia, género, **escenas[], ambiente, familiaridad, aptoFamiliar, idioma** (etiquetado LLM), estado (APROBADO/SUGERIDO/VETADO), score |
| `MusicaVeto` | tipo (ARTISTA/GENERO/TRACK/IDIOMA), valor, bloque (o global), motivo, usuario |
| `BloqueProgramacion` | día, desde, hasta, nombre, energía, volumen, **notas** (texto libre → prompt), semillas |
| `PlanProgramacion` | fecha, bloques resueltos, trackIds ordenados, **justificación**, generadoPor (IA/MANUAL/FALLBACK) |
| `TrackLog` | trackId, bloque, inicio, fin, saltado, ocupación y ventas/min del momento |
| `MusicaFeedback` | trackId, tipo (NO_VA/MAS_DE_ESTO), bloque, usuario, fecha |

---

## 8. Fases revisadas (reemplaza a §8 del plan técnico de F2/F3)

| Fase | Contenido | Criterio de terminado |
|---|---|---|
| **F0** ✅ escrito | Conexión OAuth + control manual + selección de device | Suena música del local controlada desde FRC Gourmet |
| **F1** ✅ **implementado** | Entidades + migraciones + grilla con presets + semillas + importador + **descubrimiento con IA** + generador de las 3 playlists por bloque + runtime por eventos con watchdog + UI desktop (4 pestañas) + control en la PWA | El local suena solo todo el día, sigue sonando aunque se cierre la app, el repertorio crece con IA y el encargado lo maneja desde el celular |
| **F1.5** | **Brief en texto → configuración automática** (§1 Nivel −1): interpretar el brief con LLM para generar la grilla completa, vista simple/avanzada con overrides. *(El brief ya se guarda y alimenta el descubrimiento; falta que genere los bloques.)* | El dueño configura el local escribiendo, no llenando formularios |
| **F2** | Etiquetado (ReccoBeats + LLM en lote) + vetos + bandeja de sugeridos + rotación semanal | Selección por escena/energía real, repertorio que se renueva |
| **F3** | Planificador diario con LLM (notas del dueño, ventas por franja, clima, feriados) + señales del PdV en el runtime + feedback de 2 botones | Plan diario con justificación + reacción al salón |
| **F4** | Historial, dashboard música↔ventas, multi-local, feature flag | Vendible |

---

## 9. Anexo — Configuración inicial real: **Don Franco Burger & Steak**

Este anexo es el caso de prueba de F1 y, a la vez, el ejemplo que valida el diseño del brief: todo lo que sigue **sale del texto que escribió el dueño**, sin que haya tocado un solo formulario.

### 9.1 Identidad del local (contexto permanente del prompt)

> Don Franco Burger & Steak — Salto del Guairá, Paraguay. Hamburguesas artesanales, cervezas artesanales, picadas, pizzas, drinks y postres por la noche; buffet libre/kilo al mediodía. Estilo **rústico industrial**, luz cálida, fotos históricas, cultura paraguaya, ambiente familiar. Público **25+**: al mediodía turistas brasileños y familias que vienen de compras, más locales trabajadores y familias.

Consecuencias que el planificador debe tener siempre presentes:

- **Público bilingüe PT/ES** — el portugués no es excepción, es parte del repertorio central (turismo brasileño de frontera). El inglés entra por los hits mundiales.
- **Ambiente familiar** — nada explícito ni de contenido vulgar, aunque Spotify no lo marque como *explicit*.
- **"Nada triste"** es una regla transversal, no un gusto de un bloque: aplica todo el día.

### 9.2 Géneros preferidos y vetados

| ✅ Preferidos | ❌ Vetados (duros) |
|---|---|
| Rock alternativo **alegre** | Funk brasileño |
| Pop y hits mundiales (no explícitos) | Hip hop / rap / trap |
| Bossa nova y covers bossa (*bossa n' roses*) | Rock pesado: heavy, thrash |
| Pagode brasileño alegre | Kachaka |
| Sertanejo (evitando *sofrência*) | Reggaetón |
| Música paraguaya contemporánea (Kchiporros, Tierra Adentro) | Cualquier cosa explícita o de letra banal/vulgar |
| Electrónica tranquila "sunset", buena vibra | Canciones tristes (regla transversal) |
| Electrónica movida / dance para la apertura | |

**Regla técnica para "nada triste":** valencia mínima 0,45 en general y 0,35 en los bloques chill (la valencia viene de ReccoBeats). Se combina con la etiqueta de ambiente del LLM, porque hay temas alegres de valencia baja y viceversa.

**Regla para "nada banal":** filtro *explicit* de Spotify **más** la etiqueta `aptoFamiliar` del LLM — el filtro de Spotify no marca letras vulgares que no dicen malas palabras.

### 9.3 Grilla semanal propuesta

**Lunes a jueves**

| Bloque | Horario | Energía | Perfil |
|---|---|---|---|
| Apertura y montaje | 09:00–11:00 | 4 | Electrónica movida, dance pop, hits del momento. Es para el equipo que limpia y ordena: sube el ritmo del trabajo |
| Almuerzo buffet | 11:00–14:00 | 2 | Bossa nova, covers bossa, MPB suave, electrónica sunset calma. Volumen bajo: se conversa |
| Sobremesa / tarde | 14:00–16:00 | 2-3 | Cierra el buffet pero el local sigue abierto con bebidas y snacks: sobremesa, gente charlando. Chill, bossa, sunset, indie suave. Volumen bajo |
| Previa de la noche | 16:00–17:00 | 3 | Empieza a subir: pop, rock alternativo, sertanejo liviano. Prepara el turno noche |
| Noche temprana | 17:00–20:00 | 3-4 | Rock y pop en primer plano, hits mundiales |
| Cena / hamburguesas | 20:00–00:00 | 4 | Rock alternativo y pop, con ventanas a pagode, sertanejo y música paraguaya |

**Viernes** — igual hasta las 17:00; de 17:00 a 20:00 energía 4, y de 20:00 a 00:00 **energía 5** (más movido y alegre).

**Sábado** — apertura y tarde igual; en el **almuerzo (11:00–14:00) entra pagode alegre** mezclado con bossa (fin de semana, más familias brasileñas); noche como viernes, energía 5.

**Domingo** (abre 16:00)

| Bloque | Horario | Energía | Perfil |
|---|---|---|---|
| Sunset domingo | 16:00–19:00 | 2 | Chill, electrónica sunset, bossa, pagode suave. El bloque más identitario del local |
| Domingo noche | 19:00–00:00 | 3 | Pagode y sertanejo alegres, pop suave, música paraguaya |

### 9.4 bis — Semillas reales aportadas por el dueño (2026-08-10)

Playlists que el local ya venía usando. Se cargan desde *Mi estilo*; el pool que producen es independiente de la cuenta conectada (los `spotifyId` son universales), así que lo importado en desarrollo sirve igual en producción.

```
https://open.spotify.com/playlist/7rEk1qXOjh2tKgVYjTiCMc
https://open.spotify.com/playlist/5CM35hd3A1LtdVLqz0TTJt
https://open.spotify.com/playlist/1tcvpuZZmHPZJgXad3rF1M
https://open.spotify.com/playlist/37i9dQZF1DWUIDYTCle9M9   ← ver nota
```

> ⚠️ **La cuarta no es importable.** El prefijo `37i9dQZF` identifica a las playlists **editoriales propias de Spotify**, que quedaron fuera del acceso por API en la poda de noviembre 2024 (junto con `recommendations`, `related-artists` y `featured playlists`). Devuelve 404 para apps nuevas. Alternativa: abrirla en Spotify, copiar sus temas a una playlist propia y sembrar ese link.
>
> ⚠️ **Corrección (probado 2026-08-11):** las otras tres **tampoco se importan desde una cuenta ajena**. Spotify solo devuelve el contenido (`items`) de playlists que la cuenta conectada **posee o colabora**; para el resto manda solo metadata, y en Development Mode responde **403**. Como en desarrollo se usa una cuenta personal y las playlists son de la cuenta del local, hay que copiar los temas a una playlist propia, hacerlas colaborativas, o conectar la cuenta dueña.
>
> Esto **refuerza el valor del descubrimiento con IA**: no depende de tener playlists previas, que es justamente el problema original del dueño.

**No usar la semilla `BIBLIOTECA` mientras se trabaje con una cuenta personal**: levantaría las playlists privadas del desarrollador y contaminaría el repertorio del local con gusto ajeno.

### 9.4 Semillas sugeridas (a aprobar en la bandeja de sugeridos)

Son **propuestas del sistema**, no verdad revelada: entran a la bandeja y el dueño aprueba o rechaza antes de que suenen.

| Bloque | Artistas semilla propuestos |
|---|---|
| Apertura | Purple Disco Machine, Meduza, Dom Dolla, Kungs, Calvin Harris, Fred again.. |
| Almuerzo buffet (semana) | João Gilberto, Bebel Gilberto, Céu, Nouvelle Vague, series *Bossa n'* (Roses/Stones/Marley), Ben Böhmer, Lane 8 |
| Almuerzo (fin de semana) | + Sorriso Maroto, Thiaguinho, Ferrugem, Grupo Revelação, Péricles |
| Tarde | Vampire Weekend, Two Door Cinema Club, Phoenix, Franz Ferdinand |
| Noche semana | Kings of Leon, The Killers, Arctic Monkeys, Coldplay, Dua Lipa, Bruno Mars |
| Noche fin de semana | + Jorge & Mateus, Henrique & Juliano, Gusttavo Lima (filtrando *sofrência*) |
| Identidad paraguaya (transversal) | Kchiporros, Tierra Adentro, Purahéi Soul, Paiko, Salamandra |

> **Nota:** el sertanejo trae mucha *sofrência* (temática de despecho, valencia baja). El filtro de "nada triste" lo recorta solo, pero conviene revisar los primeros lotes de ese género en particular.

### 9.5 Servicio continuo (confirmado)

El local **no cierra entre las 14:00 y las 17:00**: a las 14:00 cierra el *buffet*, pero sigue abierto sirviendo bebidas y snacks. Por eso ese tramo se divide en dos bloques (§9.3):

- **14:00–16:00 sobremesa** — público que se queda charlando con una bebida. Es un bloque de *permanencia*, no de rotación: energía y volumen bajos, que es lo que hace que la gente se quede consumiendo. Consistente con la evidencia de tempo lento → mayor estadía.
- **16:00–17:00 previa** — recién acá empieza a subir, para no pasar de golpe de la sobremesa a la noche.

**Domingo** no tiene este tramo: abre directo 16:00 con el bloque sunset.

---

## 10. Decisiones que necesito del dueño antes de F1

Resueltas por el brief del dueño (§9): tipo de local, franjas, géneros preferidos y vetados, público, identidad.

Pendientes:

1. ~~¿El local cierra entre 14:00 y 17:00?~~ **Resuelto:** servicio continuo, cierra sólo el buffet (§9.5).
2. **Volumen por bloque**: hay que calibrarlo en el local con el sistema andando — no se puede definir en papel. Se ajusta en el piloto.
3. ~~¿Quién puede votar "no va"?~~ **Resuelto:** sólo **cajeros, gerentes y admin**. Se implementa con permisos, sin código extra: `MUSICA_CONTROLAR` va a los roles CAJERO / GERENTE / ADMIN en el seed; los mozos reciben sólo `MUSICA_VER` (ven qué suena, no intervienen).
4. ~~Playlists propias existentes~~ **Resuelto:** el dueño las carga **desde la app**, no por seed. Implicancia para F1: la pantalla **"Mi estilo"** (pegar links de playlists + buscar artistas semilla + importar la biblioteca de la cuenta) es parte del entregable mínimo, porque sin ella el pool arranca vacío y no hay nada que sonar.

---

## 11. Hallazgos de la primera prueba real (2026-08-11)

Sesión con Spotify y OpenAI reales sobre la cuenta de desarrollo. **Funcionó de punta a punta hasta la creación de las playlists**, y encontró seis bugs que ninguna revisión de código había detectado. Vale registrarlos porque casi todos son de la misma familia: *supuestos sobre datos que vienen de afuera*.

| # | Bug | Por qué no se veía antes |
|---|---|---|
| 1 | Playlists ajenas no se pueden importar (403) | La doc de Spotify lo dice en la guía de migración, no en la referencia del endpoint |
| 2 | `POST /users/{id}/playlists` deprecado → `POST /me/playlists` | Cuarto endpoint que Spotify cambió; sólo se ve al escribir |
| 3 | **Horas comparadas como texto**: `'17:00' < '00:00'` es falso | El turno noche nunca resultaba vigente y su playlist duraba 30 min |
| 4 | Veto bidireccional: `FUNK BRASILEIRO` descartaba funk americano | Sólo se nota mirando *por qué* se descartó cada tema |
| 5 | El LLM disfraza géneros vetados ("J Balvin: latin pop") | Un filtro que depende de una etiqueta del modelo, el modelo la acomoda |
| 6 | El LLM no cubre los 7 días aunque se le pida | Devolvió 3 días, y luego 7 con dos a medio cubrir |

**Tres lecciones que valen más allá de este módulo:**

1. **Mostrar el motivo de cada descarte no es un lujo de UI.** Los bugs 4 y 5 fueron visibles sólo porque la pantalla lista qué se filtró y por qué. Sin eso, el sistema hubiera estado descartando música válida en silencio, para siempre.
2. **Todo lo que el LLM devuelva y alimente una regla dura hay que verificarlo contra un dato duro.** Los géneros ahora se validan contra `/artists/{id}` de Spotify; los días faltantes se completan por código. El modelo aporta criterio, no contabilidad.
3. **La estructura repetitiva no se le pide al modelo.** Pedirle 35 bloques (7 días × 5 momentos) da resultados incompletos; pedirle el patrón y replicarlo por código es determinista y gratis.

### Resultado medido

```
31 bloques · 7 días completos · sin duplicados
427 temas aprobados · 27,8 h de música
15 playlists creadas (5 bloques × 3 variantes)
plan generado por IA (origen = IA, con justificación del día)
```

Las duraciones confirman el fix de medianoche: bloque de 7 h → playlist de 10,5 h (factor 1,5×).
