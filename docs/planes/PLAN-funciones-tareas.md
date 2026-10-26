# PLAN — Funciones por cargo/funcionario, tareas y checklists automáticas

Estado: auditado (AUDIT-PLAN-funciones-tareas-A/B, correcciones incorporadas en §10); falta OK del propietario. Sin código todavía.
Rama: `bot/ceo-frc-gourmet/feat-funciones-tareas` desde `origin/develop`.
Entrega: rama aparte, se mergea a develop **junto con** Disciplina y Reconocimiento (PR #314), con OK del propietario (decisión 26/10). Don Franco está en canal alpha: merge a develop = producción.

## 1. Objetivo

- Cargos libres (ya lo son: `Cargo`, ABM en `pages/rrhh/cargos`).
- Funciones **generales** por cargo y **específicas** por funcionario (ej.: dos gerentes de cocina, diurno y nocturno, comparten las generales y cada uno tiene las suyas).
- Tareas y checklists, también generales (cargo / cargo+turno / área) y específicas (funcionario), generadas y recordadas **por el sistema**.
- Seguimiento de solo lectura por el bot Gerente Don Franco vía `POST /api/rpc`.
- Nada hardcodeado: catálogos, horarios, avisos y escalamientos se configuran en la app (escritorio). Datos iniciales los confirman David y el propietario; no se inventan.

## 2. Base existente reutilizada (verificada en develop)

| Pieza | Archivo | Uso |
|---|---|---|
| `Cargo` (tabla `cargos`, `activo`) | `entities/rrhh/cargo.entity.ts` | dueño de funciones/plantillas generales |
| `HistoricoCargo` | `entities/rrhh/historico-cargo.entity.ts` | cargo vigente a una fecha |
| `Turno` (`hora_entrada`, `hora_salida`, `tolerancia_tardanza_minutos`) y `FuncionarioTurno` (`fecha_desde`, `fecha_hasta`) | `entities/rrhh/` | ventana horaria y alcance cargo+turno |
| Asistencia | `entities/rrhh/` | quién está presente; aviso para reasignar críticas |
| Disciplina (`dr_*`, migración `1792785488053`) | `electron/services/disciplina/*` | tarea incumplida → **propuesta** de hecho (falta) con aprobación/apelación; cumplimiento → criterio de puntaje diario |
| `NotificacionRrhh` | `entities/rrhh/notificacion-rrhh.entity.ts` | avisos dentro de la app (dedupe) |
| `dispatchEvento` / `enviarDirecto` + `LogNotificacion` (dedupe por clave) | `electron/services/notificacion.service.ts`, `whatsapp.service.ts` | WhatsApp; el evento `RECORDATORIO_TAREA` ya existe en el catálogo (`notificaciones-config.handler.ts`) pero nada lo dispara |
| PWA con login de funcionario | `projects/mobile` | «Mis tareas de hoy» |

Falta: entidades de funciones/plantillas/instancias, motor programado (hoy no hay scheduler de negocio; solo `setInterval` de pings SSE), pantallas y consultas.

## 3. Modelo de datos (migración nueva `<timestamp>-FuncionesTareas`, SQLite + Postgres)

Prefijo `ft_`. Todas heredan `BaseModel`.

- `ft_funcion`: `descripcion`, `detalle`, `orden`, `activo`, `cargo_id` NULL | `funcionario_id` NULL (exactamente uno, validado en handler y CHECK). Vista combinada = generales del cargo vigente + específicas.
- `ft_plantilla_tarea`:
  - `titulo`, `instrucciones`, `tipo` (`SIMPLE` | `CHECKLIST`), `activo`, `critica`, `peso`.
  - Alcance: `cargo_id`, `turno_id`, `funcionario_id`, `dr_grupo_id` (área); combinaciones válidas validadas en handler. `reemplaza_plantilla_id` opcional (una específica reemplaza a una general).
  - Recurrencia: `recurrencia` (`DIARIA` | `DIAS_SEMANA` | `MENSUAL` | `UNICA` | `EVENTO`), `dias_semana` (bitmask), `dia_mes`, `fecha_unica`, `evento` (`CAJA_ABIERTA` | `CAJA_CERRADA` | `COMPRA_RECIBIDA`).
  - Ventana: `ancla` (`INICIO_TURNO` | `FIN_TURNO` | `HORA_FIJA` | `EVENTO`), `offset_inicio_min`, `duracion_min`, `hora_fija`.
  - `evidencia` (`NINGUNA` | `NOTA` | `FOTO`), `requiere_verificacion`, `verificador_cargo_id`.
  - Vínculos opcionales: `dr_tipo_falta_id`, `dr_criterio_id`.
  - `vigencia_desde`, `vigencia_hasta`.
- `ft_plantilla_item`: ítems de checklist (`plantilla_id`, `texto`, `orden`, `obligatorio`).
- `ft_regla_aviso`: por plantilla, `momento` (`ANTES_INICIO` | `ANTES_VENCER` | `AL_VENCER` | `ESCALAMIENTO`), `minutos`, `nivel` (1 persona/encargado, 2 grupo ADM, 3 propuesta de falta), `canal` (`APP` | `WHATSAPP` | `AMBOS`), destino configurable.
- `ft_tarea`: instancia por funcionario y fecha. `plantilla_id`, `funcionario_id`, `fecha` (date), `inicio`, `vence`, `estado` (`PENDIENTE` | `HECHA` | `VERIFICADA` | `VENCIDA` | `NO_APLICA` | `RECHAZADA`), `hecha_por`, `hecha_en`, `verificada_por`, `verificada_en`, `nota`, `evidencia_url`, `motivo_no_aplica`, `nivel_escalado`, `origen` (`MOTOR` | `EVENTO` | `MANUAL`), `evento_ref` (NOT NULL, '' si no aplica, para que el UNIQUE funcione igual en SQLite y Postgres). Snapshot de `titulo`/`critica`/`peso`: editar la plantilla no reescribe historia. **UNIQUE (plantilla_id, funcionario_id, fecha, evento_ref)** → idempotencia del motor.
- `ft_tarea_item`: estado por ítem del checklist (`tarea_id`, `item_id`, `texto` snapshot, `hecho`, `hecho_en`).
- `ft_config`: clave/valor (intervalo del motor, activo global, grupo ADM destino, umbral de reincidencia). Arranca **desactivado**.

Fechas: helpers de `electron/services/disciplina/fechas.ts` y `fechaParamSql` (lección #249); nunca `toISOString()` para fecha local.

## 4. Motor (`electron/services/funciones-tareas/motor.ts`)

- Corre **solo en el proceso dueño de la base** (standalone o server; nunca en client), con `setInterval` configurable (def. 5 min) + una ejecución al arrancar. Lock en memoria para no solaparse.
- Cada tick, para hoy (y ayer hasta el fin de un turno nocturno que cruza medianoche):
  1. Generar: funcionarios activos × cargo vigente × turno vigente × plantillas aplicables → `INSERT` idempotente (UNIQUE). Las específicas se suman a las generales o las reemplazan.
  2. Ausente (sin marcación tras la tolerancia) con tarea crítica → aviso al encargado para reasignar (no reasigna solo).
  3. Avisos según `ft_regla_aviso`, dedupe con clave `ft:<tarea>:<momento>:<nivel>:r<regla>`.
  4. Vencer: `PENDIENTE` con `vence < ahora` → `VENCIDA`.
  5. Nivel 3 (reincidencia configurable, ej. 3 vencidas en 30 días): crea una **propuesta** de hecho en Disciplina pendiente de aprobación; nunca multa directa.
- Eventos: hooks en los handlers de abrir/cerrar caja y recepción de compra llaman `ftOnEvento(tipo, ref)` **después del commit** y dentro de try/catch (un fallo del módulo nunca rompe la caja). **Toca punto de venta → prueba real de abrir/cerrar caja en sandbox antes del merge.**
- Interruptor global `ft_config.activo` (apagado por defecto).

## 5. Handlers IPC/RPC (`electron/handlers/funciones-tareas.handler.ts`), con `ensurePermission`

- ABM: `ft-funciones-*`, `ft-plantillas-*` (con ítems y reglas), `ft-config-get/set`.
- Operación: `ft-mis-tareas-hoy`, `ft-tarea-marcar` (por ítem, nota/foto con el upload existente), `ft-tarea-no-aplica`, `ft-tarea-verificar` / `ft-tarea-rechazar`, `ft-tarea-crear-manual`.
- Lectura para el Gerente (máx. 31 días, validado): `ft-cumplimiento` (persona/cargo/turno: asignadas, hechas, verificadas, vencidas, sin verificar), `ft-vencidas` (responsable, vence, atraso), `ft-historico` (semana/mes, % y reincidencias), `ft-funciones-de` (combinadas), `ft-de-turno-hoy`, `ft-estado-motor` (último tick).
- Regla: nadie verifica su propia tarea (mismo criterio que la autoaprobación de DR).
- Permisos nuevos (migración + seed, roles existentes intactos): `FT_CONFIGURAR`, `FT_VER_TODO`, `FT_MARCAR_PROPIAS`, `FT_VERIFICAR`, `FT_REPORTES`. El usuario de solo lectura del Gerente recibe `FT_REPORTES` solo con OK del propietario al cargarlo en producción.

## 6. Pantallas (modo oscuro; capturas al chat)

Escritorio (toda la administración):
- RRHH → Cargos: pestañas «Funciones generales» y «Tareas del cargo».
- Ficha del funcionario: funciones combinadas, específicas y tareas propias; imprimir descripción de puesto.
- Plantillas de tareas/checklists (alcance, recurrencia, ventana, ítems, avisos, vínculos DR).
- Tablero de cumplimiento (pantalla grande) y reporte por persona.
- Configuración del motor.

Celular (PWA): «Mis tareas de hoy» (marcar, checklist, foto, no aplica); encargado: pendientes de verificar y críticas sin dueño.

## 7. Fases

1. Migración + entidades + permisos + handlers ABM + motor (generación y vencimiento) + e2e (SQLite y Postgres).
2. Avisos, escalamiento, propuesta de falta, eventos de caja/compra + e2e.
3. Pantallas de escritorio + capturas con la copia de Don Franco.
4. PWA + capturas tamaño celular.
5. Consultas del Gerente + página `gourmet-api-guia` + docs (dominio RRHH, handlers-index, entities, testing).

## 8. Pruebas

- e2e del módulo en SQLite y Postgres: idempotencia (2 ticks = mismas tareas), turno nocturno que cruza medianoche, cambio de cargo a mitad de mes, específica que reemplaza general, plantilla editada no altera tareas pasadas, dedupe de avisos, escalamiento → propuesta DR pendiente, nadie verifica lo propio, límite 31 días, motor no corre en modo client.
- Migración up/down/up en ambos motores y sobre la copia de Don Franco.
- `npm run check`, `test:all` sin fallas nuevas vs. línea base de develop.
- UI escritorio y celular en modo oscuro, capturas al propietario.
- Caja: abrir/cerrar caja real en sandbox con el módulo activo e inactivo.

## 9. Riesgos y decisiones abiertas

- Turnos: en Don Franco hay 1 sola asignación de turno; sin turnos el motor solo genera tareas con `HORA_FIJA`. Cargarlos es tarea operativa previa (David).
- Si el server está apagado no hay recordatorios; el tablero muestra «último tick».
- Volumen WhatsApp: por defecto solo las críticas; el resto en la app.
- Fotos: almacenamiento de uploads existente, con tope de tamaño.
- Datos iniciales (apertura, cierre de caja, limpieza de cocina, temperatura de heladeras) se cargan desde la app tras confirmación; ningún seed con datos de negocio.

## 10. Correcciones de la doble auditoría (prevalecen sobre lo anterior)

A1. Disciplina no tiene estado «propuesto» (`DrFaltaEstado`: REGISTRADA/APELADA/APROBADA/JUSTIFICADA/ANULADA). El nivel 3 **no** inserta en `dr_falta`: crea `ft_propuesta_falta` (tarea, funcionario, tipo de falta sugerido, motivo, estado PENDIENTE/REGISTRADA/DESCARTADA) y avisa; un humano la registra con `dr-registrar-falta`.
A2. Entidades de DR en `src/app/database/entities/rrhh/disciplina/` (`dr_tipo_falta`, `dr_grupo`).
A3. Motor arranca en `main.ts` solo si `readAppSettings().mode !== 'client'`, con el patrón de `startRetryComandaWorker` (arranque/parada). Para varias PC sobre el mismo Postgres: lock en base (fila `ft_config` `motor_lock` con dueño + expiración, update condicional), no solo en memoria.
A4. Sí hay schedulers de negocio (acreditaciones, backup automático, reintento de comandas): se copia ese patrón.
A5. Dedupe atómico propio: `ft_aviso_enviado` con UNIQUE(clave) insertado **antes** de enviar; reintento acotado si falla. Persona/encargado vía `enviarDirecto` con su teléfono; grupo ADM vía `dispatchEvento('RECORDATORIO_TAREA')`. Respeta `NOTIF_GLOBAL_ACTIVO`.
A6. No se usa `NotificacionRrhh` (enum con CHECK en SQLite obligaría a recrear la tabla); avisos en la app se muestran desde `ft_tarea`/`ft_aviso_enviado`.
A7. Hooks: caja PdV `create-caja`, `abrir-caja-desde-conteo`, `update-caja` (→CERRADO, bloque post-transacción); caja mayor `create-caja-mayor`, `cerrar-caja-mayor`; compras `finalizar-compra`, `crear-compra-simplificada`. Siempre post-commit con `setImmediate` + try/catch. El evento lleva tipo de caja (PDV/MAYOR).
A8. Fechas: helper nuevo `fechaLocalHoy` (patrón `musica-planner.service.ts`); `fecha` de la tarea = día de entrada al turno; turno nocturno si `salida <= entrada`; `inicio`/`vence` datetime comparados con `fechaParamSql`. No reutilizar `fechaIso` de DR (usa `toISOString`).
A9. Cargo vigente: `HistoricoCargo` a la fecha; si no hay, `funcionario.cargo`.
A10. Migración manual por motor (patrón `1792785488053`: `isPg`, CHECK de enums solo en SQLite), registrar entidades y migración en `database.config.ts`.
B1. Permisos `RRHH_FT_CONFIGURAR`, `RRHH_FT_VER_TODO`, `RRHH_FT_MARCAR_PROPIAS`, `RRHH_FT_VERIFICAR`, `RRHH_FT_REPORTES` (`modulo: 'RRHH'`) en `SEED_PERMISOS`; no por migración.
B2. ADMINISTRADOR los recibe por seed; `RRHH_FT_MARCAR_PROPIAS` se suma a la plantilla `COLABORADOR_DR` (mismo público que marca en DR). Ningún otro rol cambia.
B3. Las pantallas de DR están en la rama de PR #314 (no en develop). Esta rama se basa en develop y se rebasa sobre la de DR antes del merge conjunto; las pantallas FT se estiman completas (escritorio + celular, con entradas de menú con `permiso`).
B4. Celular: «usuario vinculado a funcionario»; `funcionarioDeSesion` pasa a util compartido; e2e de usuario sin funcionario.
B5. `/api/rpc` expone todo salvo bloqueados: cada `ft-*` llama `ensurePermission`; e2e: con solo `RRHH_FT_REPORTES` se rechaza `ft-tarea-marcar`.
B6. Fotos: carpeta `ft-evidencias` con función de guardado propia y tope de tamaño validado en el handler.
B7. Registro en `register-all-handlers.ts` con firma `(dataSource, getCurrentUser)`.
B8. Pruebas: `scripts/test-funciones-tareas-e2e.ts` (SQLite temporal y `FT_E2E_PG=<base>`) y `test-funciones-tareas-migracion.ts`, scripts en `package.json`.

## 11. App como dueña de tareas y avisos; WhatsApp coordinado con el Gerente (pedido 26/10)

C1. Tareas, checklists, recordatorios y notificaciones viven y se gestionan **solo en FRC Gourmet** (motor, `ft_tarea`, `ft_aviso_enviado`, bandeja de avisos en escritorio y celular). El bot Gerente no crea ni marca tareas: lee y evalúa.
C2. `ft_regla_aviso.canal` pasa a `APP` | `WHATSAPP` | `AMBOS` | `GERENTE`:
  - `WHATSAPP`/`AMBOS`: lo envía la app con su servicio de WhatsApp (recordatorios y vencimientos, que no dependen de que el bot esté en línea).
  - `GERENTE`: la app no envía; registra el aviso en `ft_aviso_enviado` con `destino_canal = 'GERENTE'` y el Gerente lo toma y lo manda por WhatsApp (resúmenes, escalamientos al grupo ADM, seguimiento con criterio).
  - Qué regla va por cada vía se cambia desde la app, sin código.
C3. Lectura nueva para el Gerente: `ft-avisos` (rango ≤ 31 días, filtro por canal/estado): todos los avisos con `id`, tarea, persona, momento, nivel, canal y si la app ya lo envió. Con eso el Gerente no duplica lo que la app mandó y deduplica lo suyo por `id`. Solo lectura (`RRHH_FT_REPORTES`).
C4. Contrato con el Gerente documentado en `gourmet-api-guia` y en el doc de dominio, acordado con él antes de la fase 5.
C5. Antes de activar avisos por la app en Don Franco: verificar que el WhatsApp de FRC Gourmet esté configurado en producción; si no, las reglas arrancan en `APP` o `GERENTE`.
C6. e2e: regla `GERENTE` no llama a `enviarDirecto` ni a `dispatchEvento` y aparece en `ft-avisos`; regla `WHATSAPP` aparece marcada como enviada por la app.
