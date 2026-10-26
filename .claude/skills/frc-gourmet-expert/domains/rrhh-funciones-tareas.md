# RRHH — Funciones y Tareas (funciones por cargo, tareas y checklists automáticas)

> Módulo **FT**: cada cargo tiene **funciones generales** y cada funcionario puede tener
> **funciones específicas**; además hay **plantillas de tareas o checklists** (por cargo +
> turno, por funcionario o por área) que un **motor programado** convierte en tareas del
> día, con avisos (app / WhatsApp / bot Gerente), vencimiento, escalamiento a **propuesta
> de falta** de Disciplina, foto de evidencia y verificación por otra persona.
>
> Rama `bot/ceo-frc-gourmet/feat-funciones-tareas` (se mergea junto con Disciplina y
> Reconocimiento, PR #314). Plan: `docs/planes/PLAN-funciones-tareas.md` (**§10 y §11
> prevalecen** sobre el resto). La fuente de verdad es el código; este doc lo resume.
> Manual de pruebas: `docs/testing/TESTING-CHECKLIST-FUNCIONES-TAREAS.md`.

## Principios de diseño (el porqué)

- **La app es la dueña de tareas y avisos** (§11 C1). Tareas, checklists, recordatorios y
  la bandeja de avisos viven solo en FRC Gourmet. El bot Gerente **no crea ni marca**
  tareas: lee (`ft-avisos` y las lecturas de fase 5) y, para las reglas de canal `GERENTE`,
  manda él el WhatsApp.
- **Arranca apagado.** Sin la fila `ft_config.activo = 'true'` el motor no genera nada y
  los eventos de caja/compra no crean tareas. Con el interruptor apagado cada vuelta del
  motor es una lectura de `ft_config` y nada más.
- **Nunca rompe la caja ni las compras.** Los hooks se llaman **después del commit**,
  agendados con `setImmediate`, con todo error atrapado (`dispararEventoFt`).
- **Idempotencia por la base, no por memoria.** Tareas: UNIQUE `(plantilla, funcionario,
  fecha, evento_ref)`. Avisos: UNIQUE `clave` insertada **antes** de enviar. Lock del motor
  en `ft_config.motor_lock` con compare-and-swap (varias PC sobre el mismo Postgres).
- **Fechas en hora LOCAL** (`electron/services/funciones-tareas/fechas.ts`). Nunca
  `toISOString()` para sacar el día (en Paraguay a las 21:00 ya es «mañana» en UTC). No se
  reutiliza `fechaIso` de DR por ese motivo (§10 A8).
- **Identidad desde la sesión.** «Mis tareas», marcar, foto y «no aplica» propio resuelven
  el funcionario con `funcionarioDeSesion` (`electron/utils/funcionario-sesion.utils.ts`),
  nunca con un id del cliente. **Nadie verifica ni rechaza lo propio** ni resuelve una
  propuesta sobre sí mismo.
- **Nunca falta directa.** El nivel 3 crea una `ft_propuesta_falta` PENDIENTE; la falta la
  carga un humano con `dr-registrar-falta` (DR no tiene estado «propuesto», §10 A1).
- **Nada hardcodeado ni sembrado con datos de negocio.** Funciones, plantillas, horarios,
  reglas y canales se cargan desde la app. Módulo aislado: tablas propias `ft_*`, migración
  aditiva cuyo `down` borra solo esas.

## Modelo de datos

Entidades en `src/app/database/entities/rrhh/funciones-tareas/` (enums en `ft.enums.ts`).
Migración `1793042064365-FuncionesTareas.ts`: **9 tablas** `ft_*`, driver-aware (patrón de
`1792785488053-DisciplinaReconocimiento`: tablas descritas una vez, FKs inline, enums `text`
con CHECK solo en SQLite). Registradas en `database.config.ts`. Todas heredan `BaseModel`.

| Entity | Tabla | Campos clave |
|---|---|---|
| `FtFuncion` | `ft_funcion` | `descripcion`, `detalle`, `orden`, `activo`, `cargo?` **o** `funcionario?` (exactamente uno: CHECK `CHK_ft_funcion_duenio` + handler). Cargo = general; funcionario = específica |
| `FtPlantillaTarea` | `ft_plantilla_tarea` | `titulo`, `instrucciones`, `tipo` (`SIMPLE`/`CHECKLIST`), `activo`, `critica`, `peso`. **Alcance:** `cargo?` + `turno?`, `funcionario?`, `grupo?` (DrGrupo = área), `reemplazaPlantilla?`. **Recurrencia:** `recurrencia`, `diasSemana` (bitmask lun=1 … dom=64), `diaMes`, `fechaUnica`, `evento`, `eventoCaja` (`PDV`/`MAYOR`/null). **Ventana:** `ancla`, `offsetInicioMin`, `duracionMin` (def. 60), `horaFija` 'HH:MM'. `evidencia` (`NINGUNA`/`NOTA`/`FOTO`), `requiereVerificacion`, `verificadorCargo?`, `tipoFalta?` (DrTipoFalta sugerido en la propuesta), `criterio?` (DrCriterio, reservado), `vigenciaDesde/Hasta`; `items` y `reglas` (1:N) |
| `FtPlantillaItem` | `ft_plantilla_item` | `plantilla` (CASCADE), `texto`, `orden`, `obligatorio` |
| `FtReglaAviso` | `ft_regla_aviso` | `plantilla` (CASCADE), `momento` (`FtMomentoAviso`), `minutos`, `nivel` (1–3), `canal` (`FtCanalAviso`, def. APP), `destino?` (teléfono: pisa al encargado), `activo` |
| `FtTarea` | `ft_tarea` | Instancia. `plantilla?`, `funcionario`, `fecha` (día de **entrada** al turno), `inicio`, `vence`, `estado`, **snapshot** `titulo`/`critica`/`peso`, `hechaPor/En`, `verificadaPor/En`, `nota`, `evidenciaUrl`, `motivoNoAplica`, `nivelEscalado`, `origen` (`MOTOR`/`EVENTO`/`MANUAL`), `eventoRef` (def. `''`). **UNIQUE `UQ_ft_tarea_instancia` (plantilla, funcionario, fecha, evento_ref)** |
| `FtTareaItem` | `ft_tarea_item` | `tarea` (CASCADE), `item?` (SET NULL), `texto` (snapshot), `hecho`, `hechoEn` |
| `FtConfig` | `ft_config` | `clave` (UNIQUE) / `valor`. Ver *Configuración* |
| `FtAvisoEnviado` | `ft_aviso_enviado` | `clave` (**UNIQUE**, `ft:<tarea>:<momento>:<nivel>`), `tarea?` (SET NULL), `momento` (`FtMomentoAvisoRegistro`: los 4 de regla + `AUSENTE`), `nivel`, `canal`, `estado` (`FtEstadoAviso`), `destino`, `mensaje`, `intentos`, `error`, `enviadoEn`. `created_at` = hora del módulo (`ahoraFt`) |
| `FtPropuestaFalta` | `ft_propuesta_falta` | `tarea?` (SET NULL), `funcionario`, `tipoFalta?`, `motivo`, `estado` (`PENDIENTE`/`REGISTRADA`/`DESCARTADA`). Quién resolvió = `updatedBy` |

Editar una plantilla **no** toca las tareas ya generadas (tienen snapshot de título,
crítica, peso e ítems).

> Nota de migración: la `1793042064365` se **editó** en fase 2 (no estaba mergeada) para
> sumar `AUSENTE`, `ft_aviso_enviado.error` y `ft_plantilla_tarea.evento_caja`. Una base de
> sandbox que corrió la versión vieja hay que recrearla.

## Concepto: funciones y plantillas

- **Funciones** (`ft-funciones-*`): texto descriptivo del puesto. `ft-funciones-de` combina
  las **generales del cargo vigente** (HistoricoCargo a la fecha; si no hay,
  `funcionario.cargo`, §10 A9) + las **específicas** del funcionario. Ej.: dos gerentes de
  cocina (diurno y nocturno) comparten las generales y cada uno tiene las suyas.
- **Plantillas** (`ft-plantillas-*`): qué tarea se genera, a quién y cuándo. Alcances
  válidos (validados en `ft-plantillas-save`; si no, `ALCANCE_INVALIDO`):
  1. **solo funcionario** (específica);
  2. **cargo**, con o sin **turno** (general por cargo o cargo+turno);
  3. **área** = grupo DR (`dr_grupo`; general para los miembros activos del grupo).
- **Reemplazo:** una **específica** puede tener `reemplazaPlantilla` = una **general**.
  Mientras la específica esté activa y vigente, ese funcionario **no recibe la general**
  (sin mirar la recurrencia de la específica). Solo una específica reemplaza, solo a una
  general, nunca a sí misma.
- **SIMPLE** no lleva ítems; **CHECKLIST** necesita al menos uno.
- Borrar una plantilla solo si nunca generó tareas ni la reemplaza otra (`EN_USO`); si no,
  desactivarla.

## Motor — `electron/services/funciones-tareas/`

| Archivo | Qué hace |
|---|---|
| `fechas.ts` | `ahoraFt` / `fijarRelojFt` (reloj inyectable de tests), `fechaLocal`, `fechaLocalHoy`, `sumarDias`, `enHora(dia, hh:mm, diasExtra)`, `bitDiaSemana`, `paramTs` (ver *Pitfalls*) |
| `config.ts` | `FT_CLAVES`, `FT_CONFIG_EDITABLE` (validadores), `FT_CONFIG_DEFAULTS`, `configFt`, `motorFtActivo`, `intervaloMotorMin` |
| `vigencia.ts` | Cargo vigente (HistoricoCargo → `funcionario.cargo`), turno vigente (`FuncionarioTurno` que cubre la fecha, solo turnos activos), funcionario vigente (ingreso/egreso/activo) |
| `motor.ts` | `generarTareasFt`, `vencerTareasFt`, lock, `ejecutarTickFt`, `ftOnEvento`, `startMotorFuncionesTareas` / `stopMotorFuncionesTareas`, `registrarPasoTickFt` |
| `avisos.ts` | `pasoAvisosFt`, `pasoAusentesFt`, `registrarAvisoFt`, `enviarWhatsappFt`, `reintentarAvisosFt`, `fijarEnviadorFt` (tests) |
| `eventos.ts` | `dispararEventoFt` (hook post-commit), `fijarInterceptorEventoFt` / `esperarEventosFt` (tests) |
| `evidencias.ts` | `guardarEvidenciaFt`, `esUrlEvidenciaFt`, `bytesDeBase64`, `CARPETA_EVIDENCIAS_FT = 'ft-evidencias'` |

**Arranque:** `main.ts` llama `startMotorFuncionesTareas(dataSource)` solo si
`mode !== 'client'` (standalone o server, §10 A3) y `stopMotorFuncionesTareas()` en
`will-quit`. Primera vuelta a los 20 s; después cada `ft_config.intervalo_min` (def. 5,
releído en cada vuelta). Patrón de `startRetryComandaWorker`.

### Un tick (`ejecutarTickFt`)

1. Si hay un tick en curso en este proceso → `omitido: 'EN_CURSO'`. Si `activo != 'true'`
   → `'APAGADO'`. Si no se toma el lock → `'LOCK'`.
2. **Generar** (`generarTareasFt`) para **ayer y hoy** (un turno nocturno de ayer puede
   seguir abierto): funcionarios vigentes × cargo vigente × turno vigente × plantillas
   aplicables (`plantillasDelFuncionario` + `aplicaEnDia` por recurrencia y vigencia).
   INSERT idempotente en transacción con sus ítems (`insertarTareaFt`); si choca el UNIQUE
   es `EXISTE` (otro tick u otra PC). **Solo se crean tareas cuyo `vence` todavía no pasó**:
   con el server apagado no aparecen de golpe tareas ya vencidas.
3. **Vencer** (`vencerTareasFt`): `PENDIENTE` con `vence < ahora` → `VENCIDA` (un UPDATE).
   RECHAZADA no vence sola.
4. **Ausentes** (`pasoAusentesFt`) y **avisos** (`pasoAvisosFt`, incluye escalamiento y
   nivel 3). Cada paso aislado en su try/catch: si uno falla, el tick sigue y suma `errores`.
5. Pasos extra registrados con `registrarPasoTickFt`.
6. Escribe el resultado en `ft_config.ultimo_tick` (JSON con `generadas`, `existentes`,
   `vencidas`, `avisos`, `ausentes`, `propuestas`, `errores`, `en`) y libera el lock.

**Lock:** `ft_config.motor_lock` = `{ duenio: "<host>#<pid>#<uuid8>", expira }`, TTL 10 min.
Se toma si está libre, vencido o ya es propio, con `UPDATE … WHERE valor = <leído>`
(compare-and-swap): si otra PC lo cambió en el medio afecta 0 filas.

### Ventana de la tarea (`ventanaDe`)

| Ancla | Base | Sin turno |
|---|---|---|
| `INICIO_TURNO` | `hora_entrada` del día | no hay tarea |
| `FIN_TURNO` | `hora_salida` (día siguiente si el turno es nocturno) | no hay tarea |
| `HORA_FIJA` | `hora_fija` del día | **sí** (lo único que se genera sin turno) |
| `EVENTO` | la arma `ftOnEvento` (ahora + desfase) | — |

`inicio = base + offset_inicio_min`; `vence = inicio + duracion_min`.

**Turno nocturno** = `hora_salida <= hora_entrada` (`esTurnoNocturno`). La `fecha` de la
tarea es siempre el **día de entrada**. Con `HORA_FIJA` entre 00:00 y la salida, la hora cae
en la **madrugada siguiente** (sigue siendo la tarea de ese turno). `ft-mis-tareas-hoy`
devuelve las de hoy **y** las de ayer que vencen hoy o después.

### Recurrencias

`DIARIA` · `DIAS_SEMANA` (bitmask, al menos un día) · `MENSUAL` (`dia_mes`; en meses cortos
usa el último día) · `UNICA` (`fecha_unica`) · `EVENTO` (la genera `ftOnEvento`, nunca el
tick; va obligatoriamente con ancla `EVENTO`).

## Eventos de caja y compra

Hooks post-commit (§10 A7) con `dispararEventoFt(ds, evento, ref, tipoCaja, usuarioId)`:

| Handler | Canal | Evento | Caja |
|---|---|---|---|
| `financiero.handler.ts` | `create-caja` | `CAJA_ABIERTA` | `PDV` |
| `caja-mayor.handler.ts` | `abrir-caja-desde-conteo` | `CAJA_ABIERTA` | `PDV` |
| `financiero.handler.ts` | `update-caja` (pasa a CERRADO, bloque post-transacción) | `CAJA_CERRADA` | `PDV` |
| `caja-mayor.handler.ts` | `create-caja-mayor` | `CAJA_ABIERTA` | `MAYOR` |
| `caja-mayor.handler.ts` | `cerrar-caja-mayor` | `CAJA_CERRADA` | `MAYOR` |
| `compras.handler.ts` | `finalizar-compra`, `crear-compra-simplificada` | `COMPRA_RECIBIDA` | — |

`dispararEventoFt` **nunca lanza ni espera**: agenda `ftOnEvento` con `setImmediate` y atrapa
errores sincrónicos y de la promesa. `ftOnEvento`:

- Respeta el interruptor (`omitido: 'APAGADO'`); sin plantillas `EVENTO` de ese evento
  (filtradas por `evento_caja` si la plantilla lo tiene y por vigencia) → `'SIN_PLANTILLAS'`.
- `eventoRef = '<PDV|MAYOR|COMPRA>:<id>'` (60 car.): el mismo evento dos veces no duplica.
- **Responsables:** de los funcionarios del alcance, si quien disparó el evento (usuario →
  funcionario) es uno, **solo él**; si no, los que están **en su turno ahora**; si nadie,
  **todos** los del alcance.
- Ventana: `ahora + offset_inicio_min`, durante `duracion_min`. `origen = EVENTO`.

## Operación de una tarea

Estados (`FtEstadoTarea`): `PENDIENTE` → `HECHA` → `VERIFICADA`; `HECHA` → `RECHAZADA` →
(rehacer) `HECHA`; `PENDIENTE` → `VENCIDA` (motor); `PENDIENTE`/`RECHAZADA`(/`VENCIDA`) →
`NO_APLICA`. Todos los cambios son `UPDATE … WHERE estado IN (<esperados>)`: dos clics a la
vez no pisan nada (`ESTADO_INVALIDO: LA TAREA CAMBIÓ DE ESTADO`).

- **Marcar** (`ft-tarea-marcar`, solo la propia, en PENDIENTE o RECHAZADA):
  - con `itemId`: marca/desmarca ese ítem; al quedar hechos **todos los obligatorios** la
    tarea pasa **sola** a `HECHA` (si la evidencia pedida ya está);
  - sin `itemId`: completa; exige ítems obligatorios (`ITEMS_PENDIENTES`) y la evidencia
    (`EVIDENCIA_REQUERIDA`: NOTA → `nota`; FOTO → `evidenciaUrl`);
  - `completar: false`: solo guarda nota/evidencia.
  - Una `VENCIDA` **no** se marca (solo «no aplica» de un verificador).
- **No aplica** (`ft-tarea-no-aplica`, motivo obligatorio): la persona en su tarea PENDIENTE
  o RECHAZADA; un `RRHH_FT_VERIFICAR` en la de otro, también si está VENCIDA. Sin permiso
  sobre una ajena responde `NO_ENCONTRADO` (no revela que existe).
- **Manual** (`ft-tarea-crear-manual`, VERIFICAR): con o sin plantilla; con plantilla,
  `eventoRef = 'MANUAL:<ts>:<rand>'` para no chocar con la del motor.

### Evidencia foto (§10 B6)

`ft-tarea-subir-foto(tareaId, { base64 })`: tarea propia abierta. El tope
`ft_config.foto_max_kb` (def. 2048, 50–10240) se valida **sobre el base64, antes de
decodificar o escribir** (`FOTO_EXCEDIDA`). Solo JPEG/PNG/WEBP reconocidos **por firma**,
sin derivadas. Se guarda en `userData/ft-evidencias/ftev-*` y se sirve como
`app://ft-evidencias/<archivo>` (bucket en `file-save.utils.ts` y `main.ts`). Guarda la URL
en la tarea pero **no la completa**. `ft-tarea-marcar` solo acepta `evidenciaUrl` de esa
carpeta. La carpeta **está incluida en el backup completo** (`backup.handler.ts`).

### Verificación — nadie verifica lo propio

`ft-tarea-verificar` / `ft-tarea-rechazar` (VERIFICAR; rechazar con motivo): solo sobre
`HECHA`. `validarVerificador` rechaza con `PROPIA` si la tarea es del funcionario del
usuario **o** la marcó ese usuario (`hechaPor`). Si la plantilla tiene `verificadorCargo`,
solo verifica quien tiene ese cargo vigente hoy, salvo `RRHH_FT_CONFIGURAR`. La nota de
verificación/rechazo se agrega a `nota` (`… | VERIFICACIÓN: …` / `RECHAZO: …`).

## Avisos y canales (§10 A5, §11 C2)

Cada regla (`ft_regla_aviso`) define `momento` + `minutos`, `nivel` y `canal`:

| Momento | Cuándo | Estado de la tarea |
|---|---|---|
| `ANTES_INICIO` | `inicio − minutos` | PENDIENTE y no vencida |
| `ANTES_VENCER` | `vence − minutos` | PENDIENTE y no vencida |
| `AL_VENCER` | `vence + minutos` | VENCIDA |
| `ESCALAMIENTO` | `vence + minutos` | VENCIDA |
| `AUSENTE` (sin regla) | tras la tolerancia del turno | tarea **crítica** PENDIENTE |

**Dedupe atómico:** cada aviso se **inserta** en `ft_aviso_enviado` con `clave =
ft:<tarea>:<momento>:<nivel>` **antes** de enviarlo; si el INSERT choca, ya lo tomó otro
tick u otra PC. **Gracia 180 min** (`GRACIA_MIN`): un aviso atrasado más que eso (server
apagado) no se manda. FALLIDO se reintenta hasta **3 intentos** (`MAX_INTENTOS`) dentro de
la gracia. El paso mira 8 días hacia atrás.

| Canal | Qué hace la app | Estado que queda |
|---|---|---|
| `APP` | Nada sale; se ve en la bandeja de avisos | `ENVIADO` |
| `WHATSAPP` / `AMBOS` | Lo envía la app con `notificacion.service` respetando `NOTIF_GLOBAL_ACTIVO` | `ENVIADO` o `FALLIDO` (con `error`; global apagado → FALLIDO, cuenta intento) |
| `GERENTE` | **No envía** (ni `enviarDirecto` ni `dispatchEvento`) | `PARA_GERENTE` |

**Destino por nivel:**

- **Nivel 1:** `ANTES_*` → teléfono del **responsable**; `AL_VENCER` / `ESCALAMIENTO` →
  **encargado**. Encargado = funcionarios activos cuyo cargo vigente es el
  `verificadorCargo` de la plantilla (menos el responsable); si no hay,
  `ft_config.encargado_destino`. `regla.destino` (teléfono) pisa todo. Sale con
  `enviarDirecto` (`claveDedupe = <clave>:<tel>`).
- **Nivel 2:** grupo ADM con `dispatchEvento('RECORDATORIO_TAREA')` (evento ya sembrado en
  el catálogo de notificaciones; los receptores se suscriben en Configuración ›
  Notificaciones). `destino = 'GRUPO_ADM'`. `ft_config.grupo_adm_destino` existe pero la app
  no lo usa (es para el Gerente).
- **Nivel 3:** solo si hay **reincidencia**: vencidas de esa plantilla y funcionario en
  `ventana_reincidencia_dias` (def. 30) ≥ `umbral_reincidencia` (def. 3). Crea la
  `ft_propuesta_falta` PENDIENTE (con el `tipoFalta` sugerido de la plantilla) **en la misma
  transacción** que el aviso y avisa al encargado por el canal de la regla. No duplica si ya
  hay una PENDIENTE de esa plantilla. **Sin reincidencia no registra nada.**

**Ausente con tarea crítica** (`pasoAusentesFt`): tarea crítica PENDIENTE cuyo responsable
no marcó entrada pasada la tolerancia de su turno → un aviso `AUSENTE` (nivel 1) al
encargado para que la **reasigne a mano** (no se reasigna sola). Presente = asistencia con
`hora_entrada` o estado PRESENTE / TARDANZA / MEDIA_FALTA. Sin turno no hay «tarde».
Canal: `ft_config.canal_ausente` (def. `APP`).

**Propuestas:** `ft-propuesta-resolver(id, { estado: 'REGISTRADA'|'DESCARTADA', nota? })`.
REGISTRADA significa «ya cargué la falta con `dr-registrar-falta`»; el resolver **no** crea
la falta ni abre el diálogo de DR. `AUTO_RESOLUCION` si la propuesta es sobre uno mismo.

## Contrato con el bot Gerente (§11 C3, C4)

El Gerente entra por `POST /api/rpc` con un usuario que tenga `RRHH_FT_REPORTES` (solo
lectura). Nunca escribe en FT.

1. **`ft-avisos`** `{ desde, hasta (≤ 31 días, por fecha del aviso), canal?, estado?,
   momento?, funcionarioId? }` → lista ordenada por `id`:
   ```
   { id, clave, tareaId, tarea: { id, titulo, fecha, inicio, vence, estado, critica } | null,
     funcionario: { id, nombre } | null, momento, nivel, canal, destinoCanal (= canal),
     estado, enviadoPorApp, destino, mensaje, intentos, error, creadoEn, enviadoEn }
   ```
   - `enviadoPorApp` = estado `ENVIADO` y canal `WHATSAPP`|`AMBOS`: **la app ya lo mandó,
     el Gerente no lo repite**.
   - Canal `GERENTE` → estado `PARA_GERENTE`: lo manda el Gerente y **deduplica por `id`**
     (guarda los `id` ya enviados; la app no se entera de que lo mandó).
   - `destinoCanal` es el nombre del plan (§11 C2); en la tabla es la columna `canal`.
2. **Lecturas de fase 5** (`funciones-tareas-lectura.handler.ts`, `RRHH_FT_REPORTES` o
   `RRHH_FT_VER_TODO`, rango ≤ 31 días). Cumplimiento = (HECHA + VERIFICADA) / (asignadas −
   NO_APLICA), 1 decimal, `null` si no hay base. PENDIENTE, RECHAZADA y VENCIDA no cuentan.
   Conteos (`ConteoFt`): `asignadas, hechas, verificadas, vencidas, sinVerificar, noAplica,
   rechazadas, pendientes`.

   | Canal | Argumentos | Respuesta |
   |---|---|---|
   | `ft-cumplimiento` | `{ desde, hasta \| mes 'YYYY-MM', agrupar?: 'persona' (def.) \| 'cargo' \| 'turno', funcionarioId? }` | `{ desde, hasta, agrupar, total: {…conteos, cumplimiento}, filas: [{ id, nombre, …conteos, cumplimiento }] }` (peor primero; cargo/turno = el vigente el día de cada tarea, `SIN CARGO`/`SIN TURNO`) |
   | `ft-vencidas` | `{ desde, hasta, funcionarioId?, soloCriticas? }` | `[{ id, titulo, fecha, vence, estado, critica, nivelEscalado, plantillaId, responsable: { id, nombre }, atrasoMin }]`: VENCIDA y también PENDIENTE/RECHAZADA ya vencidas que el motor todavía no procesó |
   | `ft-historico` | `{ desde, hasta \| mes, por?: 'semana' (def., lunes) \| 'mes', funcionarioId? }` | `{ desde, hasta, por, periodos: [{ periodo, personas: [{ id, nombre, …conteos, cumplimiento }] }], reincidencias: [{ funcionarioId, nombre, plantillaId, titulo, veces ≥ 2 }] }` |
   | `ft-de-turno-hoy` | `fecha?` (def. hoy) | `{ fecha, personas: [{ funcionario, cargo, turno: { id, nombre, horaEntrada, horaSalida }, tareas: {…conteos, cumplimiento} }] }` |
   | `ft-estado-motor` | — | `{ activo, intervaloMin, ultimoTick, minutosDesdeUltimoTick, atrasado }` (`atrasado` = sin tick o más de 3 intervalos: server apagado o motor trabado) |

3. Antes de activar avisos por la app en producción, verificar que el WhatsApp de FRC
   Gourmet esté configurado; si no, las reglas arrancan en `APP` o `GERENTE` (§11 C5).

## Permisos (`SEED_PERMISOS` en `permissions.handler.ts`, módulo RRHH)

| Código | Para qué |
|---|---|
| `RRHH_FT_CONFIGURAR` | ABM de funciones, plantillas, ítems, reglas y `ft-config-set`; resolver propuestas; verificar aunque no sea del cargo verificador |
| `RRHH_FT_VER_TODO` | Ver las tareas de todos (tablero, `ft-avisos`, lecturas) |
| `RRHH_FT_MARCAR_PROPIAS` | Mis tareas, marcar, foto, «no aplica» propio, mis funciones |
| `RRHH_FT_VERIFICAR` | Verificar/rechazar tareas de otros, «no aplica» ajeno, tarea manual, resolver propuestas |
| `RRHH_FT_REPORTES` | Solo lectura: `ft-avisos`, cumplimiento, vencidas, histórico, de turno, estado del motor (usuario del Gerente) |

ADMINISTRADOR los recibe por seed. `RRHH_FT_MARCAR_PROPIAS` se suma a la plantilla
`COLABORADOR_DR` (`seed-system.ts`; mismo público que vota en DR). Ningún otro rol cambia.
`LECTURA_GENERAL` del handler = CONFIGURAR | VER_TODO | VERIFICAR | REPORTES. `/api/rpc` es
default-allow: el `ensurePermission` de cada `ft-*` es la única frontera (§10 B5).

## Configuración (`ft_config`, `ft-config-get` / `ft-config-set`)

| Clave | Default | Validación |
|---|---|---|
| `activo` | `false` | `true`/`false`: interruptor global (motor + eventos) |
| `intervalo_min` | `5` | 1–60 |
| `grupo_adm_destino` | `''` | ≤ 200 car. (informativo para el Gerente) |
| `umbral_reincidencia` | `3` | 1–100 |
| `ventana_reincidencia_dias` | `30` | 1–365 |
| `encargado_destino` | `''` | teléfono o vacío |
| `canal_ausente` | `APP` | APP / WHATSAPP / AMBOS / GERENTE |
| `foto_max_kb` | `2048` | 50–10240 |
| `motor_lock`, `ultimo_tick` | — | internas, **no** se escriben desde `ft-config-set` (`CLAVE NO CONFIGURABLE`) |

`ft-config-get` → `{ valores, ultimoTick, lock }`.

## Canales RPC — `funciones-tareas.handler.ts`

Registrados en `electron/utils/register-all-handlers.ts` (`registerFuncionesTareasHandlers`
y `registerFuncionesTareasLecturaHandlers`, firma `(dataSource, getCurrentUser)`). Errores
con `codigo` + mensaje en MAYÚSCULAS (`VALIDACION`, `NO_ENCONTRADO`, `FORBIDDEN`,
`ESTADO_INVALIDO`, `ALCANCE_INVALIDO`, `EN_USO`, `RANGO_EXCEDIDO`, `ITEMS_PENDIENTES`,
`EVIDENCIA_REQUERIDA`, `FOTO_EXCEDIDA`, `PROPIA`, `AUTO_RESOLUCION`). Los textos se guardan
en MAYÚSCULAS. Los ids de relación se aceptan como `cargoId` o `cargo: { id }` (`idDe`).

| Canal | Argumentos | Permiso | Respuesta |
|---|---|---|---|
| `ft-funciones-list` | `{ cargoId?, funcionarioId?, incluirInactivas? }` | lectura general | `FtFuncion[]` con cargo/funcionario |
| `ft-funciones-save` | `{ id?, descripcion, detalle?, orden?, activo?, cargoId \| funcionarioId }` | CONFIGURAR | `FtFuncion` |
| `ft-funciones-set-activo` | `(id, activo)` | CONFIGURAR | `{ ok }` |
| `ft-funciones-delete` | `(id)` | CONFIGURAR | `{ ok }` |
| `ft-funciones-de` | `(funcionarioId?, fecha?)` | lectura general, o MARCAR_PROPIAS (solo las propias) | `{ fecha, funcionario, cargo, generales, especificas }` |
| `ft-plantillas-list` | `{ cargoId?, funcionarioId?, turnoId?, grupoId?, incluirInactivas? }` | lectura general | `FtPlantillaTarea[]` |
| `ft-plantillas-get` | `(id)` | lectura general | plantilla con todas las relaciones, `items` y `reglas` ordenados |
| `ft-plantillas-save` | plantilla + `items: [{ id?, texto, orden?, obligatorio? }]` + `reglas: [{ id?, momento, minutos, nivel, canal, destino?, activo? }]` (reemplazan la lista: los que faltan se borran) | CONFIGURAR | plantilla completa |
| `ft-plantillas-set-activo` | `(id, activo)` | CONFIGURAR | `{ ok }` |
| `ft-plantillas-delete` | `(id)` | CONFIGURAR | `{ ok }` o `EN_USO` |
| `ft-config-get` | — | lectura general | `{ valores, ultimoTick, lock }` |
| `ft-config-set` | `{ clave: valor, … }` | CONFIGURAR | valores |
| `ft-mis-tareas-hoy` | — | MARCAR_PROPIAS | tareas del funcionario de la sesión (hoy + nocturnas de ayer abiertas) con ítems |
| `ft-tareas-list` | `{ desde, hasta (≤ 31), funcionarioId?, estado? }` | lectura general | tareas con ítems, `hechaPor`, `verificadaPor` (sin datos sensibles del usuario) |
| `ft-tarea-marcar` | `(tareaId, { itemId?, hecho?, nota?, evidenciaUrl?, completar? })` | MARCAR_PROPIAS | tarea |
| `ft-tarea-no-aplica` | `(tareaId, motivo)` | MARCAR_PROPIAS (propia) / VERIFICAR (ajena) | tarea |
| `ft-tarea-verificar` | `(tareaId, nota?)` | VERIFICAR | tarea |
| `ft-tarea-rechazar` | `(tareaId, motivo)` | VERIFICAR | tarea |
| `ft-tarea-crear-manual` | `{ funcionarioId, titulo?, plantillaId?, fecha?, inicio?, vence? \| duracionMin?, critica?, peso?, items?: string[] }` | VERIFICAR | tarea |
| `ft-tarea-subir-foto` | `(tareaId, { base64 })` | MARCAR_PROPIAS | `{ url, bytes, tarea }` |
| `ft-avisos` | ver *Contrato con el Gerente* | REPORTES \| VER_TODO | avisos |
| `ft-propuestas-list` | `{ estado?, desde?, hasta?, funcionarioId? }` (máx. 500) | lectura general | `[{ id, estado, motivo, funcionario, tarea, tipoFalta, creadaEn, resueltaPor }]` |
| `ft-propuesta-resolver` | `(id, { estado, nota? })` | VERIFICAR \| CONFIGURAR | `{ ok, id, estado }` |

Lecturas de fase 5: ver la tabla del contrato con el Gerente.

## Pantallas

**Escritorio** (`src/app/pages/rrhh/funciones-tareas/`; menú RRHH › grupo «Funciones y
tareas» en `menu-tree.ts`):

- `funciones-tareas-api.service.ts`: wrapper de todos los `ft-*`, constantes de enums y
  `ftMensajeError`.
- **Tablero de tareas** (`ft-tablero`, `RRHH_FT_VER_TODO`): pestañas Cumplimiento (del día
  por funcionario, desde `ft-tareas-list`, con vencidas y «no aplica»), **Por verificar**
  (HECHAS: verificar / rechazar; valida el backend), Avisos (filtro canal/estado) y
  Propuestas de falta (Registrar / Descartar con nota).
- **Configurar funciones y tareas** (`ft-config`, `RRHH_FT_CONFIGURAR`, `esConfig`):
  pestañas Funciones (por cargo o funcionario), Plantillas de tareas (alcance cargo+turno,
  funcionario o área; reemplazo; recurrencia/ancla/evento/caja; días; ítems; reglas de aviso
  con canal y destino; tipo de falta) y Configuración del motor (activo, claves, último
  tick y lock). Confirmaciones con `ConfirmationDialogComponent`.

**Celular / PWA** (`projects/mobile/src/app/pages/rrhh/funciones-tareas/`, sección RRHH de
`app.routes.ts`, con `permisoGuard`). Llama a los mismos `ft-*` por `window.api.callIpc` →
`/api/rpc` (los canales no están en `preload.ts`):

| Ruta | Página | Permiso | Canales |
|---|---|---|---|
| `/rrhh/mis-tareas` | `mis-tareas/mis-tareas.page.ts` («Mis tareas de hoy») | `RRHH_FT_MARCAR_PROPIAS` | `ft-mis-tareas-hoy`, `ft-tarea-marcar` (ítem por ítem o completar; nota si la pide), `ft-tarea-subir-foto` (cámara → JPEG achicado dentro de `foto_max_kb`: empieza en 1024 KB y reintenta con el tope que devuelve el error), `ft-tarea-no-aplica` |
| `/rrhh/verificar-tareas` | `verificar/verificar-tareas.page.ts` (bandeja de 7 días, pestañas HECHA / VENCIDA) | `RRHH_FT_VERIFICAR` | `ft-tareas-list` (estado HECHA y VENCIDA), `ft-tarea-verificar`, `ft-tarea-rechazar`, `ft-tarea-no-aplica` |

Helpers comunes en `ft-mobile.utils.ts` (`ftCall`, `ftComprimirFoto`, etiquetas de estado,
`ftMensajeError`). Configuración y tablero quedan en escritorio. (Las páginas móviles se
estaban terminando al escribir este doc: si algo no coincide, manda el código.)

## Tests

- `npm run test:funciones-tareas` (`scripts/test-funciones-tareas-e2e.ts`): **122/122** en
  SQLite temporal y en Postgres con `FT_E2E_PG=ft_e2e`, siempre con
  `TZ=America/Asuncion`. Bloques: validaciones, funciones combinadas, motor apagado,
  idempotencia, específica/reemplazo, nocturno (y pasada la medianoche), snapshot, marcar y
  checklist, verificar/rechazar, permisos (solo REPORTES no marca), no aplica / manual /
  vencimiento, cambio de cargo, lock, avisos por canal (GERENTE no llama a `enviarDirecto` ni
  a `dispatchEvento`; WHATSAPP queda `enviadoPorApp`), ausentes, escalamiento y propuesta,
  eventos de caja/compra (hook con error forzado: la apertura sale igual; la tarea es solo
  de quien abrió), foto y lecturas del Gerente.
- `npm run test:funciones-tareas-migracion`: up/down/up **11/11** en los dos motores.
- No están en `test:all`. Si se toca caja, correr además `test:caja-apertura` y
  `test:caja-cerrada`; para DR, `test:disciplina-e2e` (`test-disciplina-migracion` tolera
  migraciones posteriores a DR).

## Pitfalls y decisiones

- **Timestamps en Postgres:** comparar `inicio`/`vence`/`created_at` con `paramTs(ds, d)`,
  no con `fechaParamSql`. Las columnas son `timestamp` **sin zona** y node-pg escribe/lee en
  hora local; un ISO con `Z` queda corrido el huso (3 h en Paraguay). Otros handlers que usan
  `fechaParamSql` en PG fuera de UTC pueden tener el mismo problema (no revisado).
- **Entidades con `Date | null`** rompían TypeORM (`DataTypeNotSupportedError`): los
  timestamps opcionales se declaran `Date` con `nullable: true`.
- **Reloj:** usar siempre `ahoraFt()` en motor y handlers (los tests lo fijan con
  `fijarRelojFt`), no `new Date()` suelto.
- **`fecha` de la tarea = día de entrada al turno**, no el día calendario del vencimiento.
- **El motor nunca genera tareas ya vencidas** (server apagado). Una tarea que nunca se
  generó no aparece como incumplida: mirar `ft-estado-motor.atrasado`.
- **Sin turno solo hay `HORA_FIJA`.** En Don Franco casi no hay turnos asignados: cargarlos
  es tarea operativa previa.
- **El canal `GERENTE` depende del bot:** si el Gerente no está en línea esos avisos quedan
  `PARA_GERENTE` sin salir. Los recordatorios que no pueden esperar van por `WHATSAPP`.
- **`requiereVerificacion` y `criterio`** se guardan pero el motor todavía no los usa: una
  tarea HECHA ya cuenta como cumplida aunque nadie la verifique.
- **Resolver una propuesta como REGISTRADA no crea la falta:** hay que cargarla en
  Disciplina (`dr-registrar-falta`).
- El plan admitía `EVENTO` como alcance; en el código el evento es una recurrencia (con
  ancla `EVENTO`), no un alcance.
- `funcionarioDeSesion` es util compartido; DR conserva su copia propia.
- Pendiente antes del merge: prueba real de abrir/cerrar caja en sandbox con el módulo
  activo y apagado (checklist §8).
