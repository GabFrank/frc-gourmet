# RRHH — Disciplina y Reconocimiento (multas, premios, encuestas anónimas)

> Módulo **DR**: faltas con advertencia/multa y apelación, errores que descuentan puntos,
> puntaje diario por criterios, votación anónima entre compañeros y premios con tres
> métodos de cálculo. Lo aprobado se materializa como **`Penalizacion` / `Bono` normales**
> marcados con el prefijo `[DR]`, así la liquidación de sueldo los toma sin cambios.
>
> **Fase 1 (PR #313): solo backend.** Entidades `dr_*`, migración, permisos, motor puro,
> handlers RPC y tres suites de test. **No hay pantallas todavía** (fase 2 desktop,
> fase 3 PWA). Todo se ejercita por IPC / `POST /api/rpc`.

## Principios de diseño (el porqué)

- **Nada se descuenta ni se paga sin aprobación.** `Penalizacion` y `Bono` entran a la
  liquidación apenas existen (solo filtran `anulada`/`anulado`). Por eso registrar una
  falta **no** crea la `Penalizacion`: recién la crea `dr-aprobar-falta`. Lo mismo con
  los premios: `dr-calcular-premio` solo propone, `dr-aprobar-premio` crea el `Bono`.
- **Reutilizar los conceptos de liquidación existentes** (decisión del propietario): cero
  cambios en el armado del borrador. Las multas salen como concepto `PENALIZACION` y los
  premios como `BONO_MANUAL`.
- **Aprobación idempotente garantizada por la base**, no por la UI: índice único en
  `dr_falta.penalizacion_id` y en `dr_resultado_premio.bono_id`, y transición de estado
  condicional (`UPDATE … WHERE estado = <esperado>`). Con un doble clic o dos aprobadores a
  la vez, la segunda transacción no afecta filas y revierte (`ESTADO_INVALIDO`).
- **Identidad desde la sesión, nunca del cliente.** El RPC es default-allow: cada handler
  valida su permiso adentro, y los de «lo mío» (`dr-mis-*`, apelar, renunciar, votar)
  resuelven el funcionario por `Funcionario.usuario` del usuario de la sesión/token.
- **Nada hardcodeado.** Grupos, tipos de falta, gravedades, errores, premios, criterios y
  encuestas son datos (`area` es texto libre: COCINA, SALON, DELIVERY…). Nada se borra:
  se desactiva (`activo`) o se anula con motivo.
- **Las Penalizacion/Bono `[DR]` solo se tocan desde el módulo** (trazabilidad falta →
  aprobación → descuento). Ver *Protección* abajo.
- **Módulo aislado para poder apagarlo:** tablas propias `dr_*`, migración aditiva cuyo
  `down` borra solo `dr_*`; quitar los permisos lo apaga.

## Modelo de datos

Entidades en `src/app/database/entities/rrhh/disciplina/`. Migración
`1792785488053-DisciplinaReconocimiento.ts` (19 tablas, driver-aware SQLite/Postgres, FKs
inline, enums como `text` con CHECK en SQLite). No toca ninguna tabla existente.

### Configuración (heredan `BaseModel`)

| Entity | Tabla | Campos clave |
|---|---|---|
| `DrGrupo` | `dr_grupo` | `nombre`, `area`, `descripcion`, `activo`; `miembros` (1:N) |
| `DrGrupoMiembro` | `dr_grupo_miembro` | `grupo`, `funcionario`, `rol` (`DrGrupoRol`), `pesoVoto` (decimal, default 1), `activo`. Único (grupo, funcionario) |
| `DrTipoFalta` | `dr_tipo_falta` | `nombre`, `grupo?`, `modoAplicacion`, `advertenciasPrevias`, `montoMulta`, `moneda?`, `escalaMontos` (JSON `{ "<n>": monto }`), `reinicio`, `toleranciaMinutos?`, `fuenteAsistencia`, `plazoApelacionHoras` (default 48), `requiereChecklist`, `orden`, `activo`; `checklist` (1:N) |
| `DrChecklistItem` | `dr_checklist_item` | `tipoFalta`, `texto`, `orden`, `activo` |
| `DrGravedad` | `dr_gravedad` | `nombre`, `area`, `puntos` (cuánto descuenta), `color` (nombre de color del tema, no hex), `orden` |
| `DrTipoError` | `dr_tipo_error` | `nombre`, `gravedad`, `grupo?`, `orden`, `activo` |
| `DrPremio` | `dr_premio` | `nombre`, `monto`, `moneda?`, `periodo` (`DrPremioPeriodo`), `metodo` (`DrPremioMetodo`), `reglaEmpate` (`DrReglaEmpate`), `puntosIniciales?` (SALDO_PUNTOS), `encuesta?` (VOTACION), `grupo?`; `criterios` (1:N) |
| `DrCriterio` | `dr_criterio` | `premio`, `texto`, `descripcion`, `escalaMin` (0), `escalaMax` (2), `orden`, `activo` |
| `DrEncuesta` | `dr_encuesta` | `titulo`, `grupo?`, `diaApertura` (1–7), `horaApertura` 'HH:MM', `horasAbierta` (24); `preguntas` (1:N) |
| `DrEncuestaPregunta` | `dr_encuesta_pregunta` | `encuesta`, `texto`, `tipo` (`DrPreguntaTipo`), `escalaMin` (1), `escalaMax?`, `obligatoria`, `orden`, `activo` |

### Hechos (heredan `BaseModel`)

| Entity | Tabla | Campos clave |
|---|---|---|
| `DrFalta` | `dr_falta` | `fecha`, `funcionario`, `tipoFalta`, `detectadoPor`, `observacion`, `minutosTardanza?`, `nOcurrencia`, `resultado` (`DrFaltaResultado`), `montoCalculado`, `moneda?`, `estado` (`DrFaltaEstado`), `apelacionTexto/Fecha/Vence`, `renunciaApelacion`, `resueltoPor/En`, `resolucionTexto`, `motivoAnulacion`, `penalizacion?` (**único**), `mesDestino` 'YYYY-MM', `loteId`, `checklistFallado` (JSON) |
| `DrError` | `dr_error` | `fecha`, `funcionario`, `tipoError`, `puntos` (**copiados de la gravedad al registrar**: cambiar la gravedad después no reescribe la historia), `detalle`, `registradoPor`, `estado` (`DrErrorEstado`), `motivoAnulacion` |
| `DrPuntajeCriterio` | `dr_puntaje_criterio` | `fecha`, `funcionario`, `criterio`, `valor`, `auditor`. Único (fecha, funcionario, criterio): recargar reemplaza |

### Período, resultados y liquidación

| Entity | Tabla | Campos clave |
|---|---|---|
| `DrPeriodo` | `dr_periodo` | `premio?`, `encuesta?`, `desde`, `hasta`, `abreEn`, `cierraEn`, `estado` (`DrPeriodoEstado`), `cerradoPor/En`, `aprobadoPor/En` |
| `DrResultadoPremio` | `dr_resultado_premio` | `periodo`, `funcionario` (único por período), `puntaje`, `posicion`, `ganador`, `montoPropuesto`, `montoAprobado?`, `moneda`, `estado` (`DrResultadoEstado`), `bono?` (**único**), `mesDestino`, `aprobadoPor/En` |
| `DrLiquidacionPendiente` | `dr_liquidacion_pendiente` | `funcionario`, `mes` 'YYYY-MM', `liquidacion?`, `motivo`, `estado` (`DrLiquidacionPendienteEstado`), `resueltoEn` |

### Votación anónima (NO heredan `BaseModel`)

| Entity | Tabla | Campos |
|---|---|---|
| `DrParticipacion` | `dr_participacion` | `id` UUID, `periodo`, `funcionario`. Único (periodo, funcionario). **Nada más** |
| `DrVotoAgregado` | `dr_voto_agregado` | `id` UUID, `periodo`, `evaluado`, `pregunta`, `datosCifrados`, `sumaPonderada`, `sumaPesos`, `cantidad`, `conteoSi`, `conteoNo`. Único (periodo, evaluado, pregunta) |
| `DrRespuestaTexto` | `dr_respuesta_texto` | `id` UUID, `periodo`, `evaluado`, `pregunta`, `texto` |

Los UUID salen de `drNuevoUuid()` (`dr-uuid.ts`, `crypto.randomUUID`), generados en código
para que sean iguales en los dos drivers sin extensiones de Postgres.

## Motor puro — `electron/services/disciplina/`

Sin acceso a la base, testeable aislado (`test:disciplina-motor`):

| Archivo | Qué hace |
|---|---|
| `motor-multas.ts` | `calcularMulta`, `contarFaltasPrevias`, `inicioVentana`, `montoParaOcurrencia`, `debeIgnorarTardanza` |
| `motor-premios.ts` | `calcularCriterios`, `calcularSaldoPuntos`, `calcularVotacion`, `rankear`, `dividirMonto`, `resolverPremio`; `MIN_VOTANTES_DEFAULT = 4` |
| `votacion.ts` | `validarEnvio`/`assertEnvioValido`, `acumular`, `cifrarAgregado`/`descifrarAgregado` (AES-256-GCM), `mezclar` (Fisher-Yates con `crypto.randomInt`) |
| `liquidacion-destino.ts` | `mesAbierto`, `mesDestino`, `aplicarTope`, `validarMoneda` |
| `fechas.ts` | aritmética de calendario sobre 'YYYY-MM-DD' (sin zona horaria) |
| `errores.ts` | `DisciplinaError` con `codigo` estable en MAYÚSCULAS; los handlers lo pasan a `err.code` |

## Faltas: estados y flujo

```
REGISTRADA ──(funcionario apela, dentro del plazo)──▶ APELADA
    │  └─(funcionario renuncia a apelar: renunciaApelacion=true, sigue REGISTRADA)
    ├──▶ APROBADA    (dr-aprobar-falta; si MULTA y monto>0 → Penalizacion [DR])
    ├──▶ JUSTIFICADA (dr-justificar-falta: apelación aceptada; desde REGISTRADA/APELADA)
    └──▶ ANULADA     (dr-anular-falta: desde REGISTRADA/APELADA/APROBADA)
```

1. **Registro** (`dr-registrar-falta`, `RRHH_DR_REGISTRAR`): `{ tipoFaltaId, fecha,
   funcionarioIds[], observacion?, minutosTardanza?, checklistFallado? }`. Una falta por
   funcionario; si son varios, comparten `loteId` (UUID). Por cada uno el motor calcula:
   - `nOcurrencia = 1 + faltas previas` del mismo funcionario y tipo, con estado distinto de
     ANULADA/JUSTIFICADA, dentro de la ventana de `reinicio` (NUNCA: todas; SEMANAL: desde el
     lunes de esa semana; MENSUAL: desde el día 1) y con fecha ≤ la del hecho. **Las APELADAS
     sí cuentan.**
   - `n ≤ advertenciasPrevias` → ADVERTENCIA (₲0); si no → MULTA con `escalaMontos[n]` o, si
     la escala no define ese n, `montoMulta`.
   - Tardanza con `minutos ≤ toleranciaMinutos` → resultado NINGUNO: **no se crea la falta**.
   - `apelacionVence = ahora + plazoApelacionHoras`.
   - Devuelve `{ creadas, loteId, ignoradas }`.
2. **Apelación** (`dr-apelar-falta`, `RRHH_DR_MIS_DATOS`, solo el dueño de la falta): exige
   texto, plazo vigente (`PLAZO_VENCIDO`) y que no haya renunciado (`RENUNCIO_APELACION`).
   UPDATE condicional `estado=REGISTRADA AND renunciaApelacion=false` → APELADA.
3. **Renuncia** (`dr-renunciar-apelacion`, `RRHH_DR_MIS_DATOS`): marca
   `renunciaApelacion=true` (sigue REGISTRADA). Desde ahí se puede aprobar sin esperar el
   plazo, y ya **no** se puede apelar.
4. **Aprobación** (`dr-aprobar-falta`, `RRHH_DR_APROBAR`): solo desde REGISTRADA o APELADA.
   Si está REGISTRADA, sin renuncia y con el plazo vigente → `PLAZO_APELACION_VIGENTE`
   (por qué: aprobar antes dejaría sin efecto el derecho a apelar). Una APELADA se resuelve
   con la apelación a la vista. Si es MULTA con monto > 0: valida moneda, calcula mes
   destino, aplica el tope y crea una o más `Penalizacion` (ver *Integración con la
   liquidación*). Las advertencias se aprueban sin generar nada.
5. **Justificar / anular** (`dr-justificar-falta` / `dr-anular-falta`, motivo obligatorio):
   si la falta tenía Penalizacion, anula **todas sus cuotas** (las encuentra por la marca
   `(FALTA <id>)` en la descripción), salvo que alguna esté en una liquidación APROBADA o
   PAGADA → `LIQUIDACION_CERRADA` (no se hacen arreglos retroactivos; la corrección de algo
   ya liquidado es un ajuste en el mes siguiente). Marca el borrador del mes como
   desactualizado.

`modoAplicacion` (INDIVIDUAL / TODOS_PRESENTES) hoy es solo un dato de configuración: el
handler no lo interpreta, y la aplicación colectiva es mandar varios `funcionarioIds`. La
**multa colectiva queda desactivada** hasta validarla con asesoría laboral (el ejemplo de
cocina de la fase 2 la carga con `activo=false`).

## Errores con puntos y puntaje por criterios

- `dr-registrar-error` (`RRHH_DR_REGISTRAR`): uno o varios funcionarios, mismo tipo y
  fecha; `puntos` = puntos de la gravedad en ese momento. `dr-anular-error`
  (`RRHH_DR_APROBAR`, motivo obligatorio) pasa a ANULADO, no borra.
- `dr-puntuar` (`RRHH_DR_PUNTUAR`): `{ fecha, puntajes: [{ funcionarioId, criterioId,
  valor }] }`, valor entero dentro de `escalaMin..escalaMax` del criterio. Recargar el mismo
  (fecha, funcionario, criterio) reemplaza.
- «Lo mío»: `dr-mis-puntos` (errores, puntajes y saldo por cada premio SALDO_PUNTOS
  activo) y `dr-mis-premios`.

## Votación anónima — cómo se preserva el anonimato

1. **No se guarda ningún voto individual.** Cada envío se valida completo y se **suma** a
   un agregado por (período, evaluado, pregunta). Ninguna tabla de votos tiene votante,
   `created_*` ni fecha.
2. **La participación está separada** (`dr_participacion`: solo «ya votó», para impedir el
   doble voto por índice único). No tiene fecha ni orden, y el id es UUID aleatorio para no
   delatar el orden de llegada.
3. **Agregados cifrados mientras el período está ABIERTO** (AES-256-GCM, con AAD
   `periodo|evaluado|pregunta` para que no se puedan intercambiar valores entre filas). La
   clave vive en `userData/dr-votos.key` (permisos 0600), fuera de la base. Por qué:
   comparando dos backups de la base se deduciría qué votó cada uno. Las columnas numéricas
   quedan NULL hasta el cierre.
4. **Voto atómico:** participación + agregados + textos en **una sola transacción**, con el
   período re-verificado ABIERTO adentro (en Postgres, `FOR SHARE` sobre el período y
   `FOR UPDATE` sobre cada agregado existente). Si falla algo no queda «votó» sin voto
   contado y la persona puede reintentar.
5. **Respuestas de texto** (`dr_respuesta_texto`): sin autor ni hora, id UUID. Al cerrar el
   período, **textos y participaciones se borran y se reinsertan mezclados con ids nuevos**:
   así ni el orden físico ni los metadatos de transacción de la base (p. ej. `xmin` en
   Postgres, que dejaría el comentario «pegado» a la participación escrita en la misma
   transacción) vinculan comentario y votante. Los resultados devuelven los textos mezclados
   y sin id.
6. **Votante desde el token:** `dr-votar` usa `getRequestUser() ?? usuario de sesión`, nunca
   un id del cliente. Validaciones (`validarEnvio`): sin votante, autovoto, evaluado fuera del
   grupo, envío incompleto (un solo envío con **todos** los compañeros activos), pregunta
   inexistente, respuesta duplicada, obligatoria vacía, fuera de rango, tipo inválido. Los
   mensajes de error no incluyen valores (no filtran votos a los logs).
7. **Resultados** (`dr-get-resultados-encuesta`, `RRHH_DR_RESULTADOS_VER`): solo con el
   período **cerrado** (si no, comparando el agregado antes y después de cada voto se
   deduciría el voto) y con al menos `DR_VOTACION_MIN_VOTANTES` votantes; si no se alcanza
   devuelve `suficiente: false` sin filas. Muestra promedio ponderado por evaluado/pregunta.

Peso del voto = `pesoVoto` del votante en el grupo. ESCALA suma el valor; SI_NO se normaliza
Sí=1/No=0 (y cuenta `conteoSi`/`conteoNo`); TEXTO no se agrega.

**Límite honesto:** con grupos chicos una respuesta de texto puede delatar al autor por su
estilo. La UI del constructor de encuestas tiene que avisarlo (fase 2).

Ciclo del período: `dr-abrir-periodo` (`{ encuestaId?, premioId?, desde, hasta }`) →
`dr-votar` → `dr-cerrar-periodo` (descifra a columnas, borra el cifrado, reescribe
mezclado; devuelve `votantes`). `diaApertura`/`horaApertura`/`horasAbierta` de la encuesta
todavía **no** disparan nada: los períodos se abren y cierran a mano.

## Premios — tres métodos

`dr-calcular-premio` (`RRHH_DR_APROBAR`, período **CERRADO**) arma el ranking de los
miembros activos del grupo del premio (o del grupo de su encuesta) y guarda
`dr_resultado_premio` en PROPUESTO (o DESIERTO). Recalcular reemplaza la propuesta; si ya hay
un resultado APROBADO, se rechaza.

| Método | Puntaje |
|---|---|
| `CRITERIOS` | Σ `dr_puntaje_criterio.valor` de los criterios del premio dentro de `desde..hasta` |
| `SALDO_PUNTOS` | `puntosIniciales − Σ puntos` de errores VIGENTES del período (tipos de error del grupo del premio o globales) |
| `VOTACION` | `Σ sumaPonderada / Σ sumaPesos` sobre preguntas ESCALA y SI_NO del período; sin votos → 0. Con menos votantes que el mínimo → DESIERTO (`MINIMO_VOTANTES`) |

Ranking descendente; los empates comparten posición (1, 1, 3) y se ordenan alfabéticamente.
Regla de empate en el primer puesto: `DIVIDIR` (monto/n en guaraníes enteros, **el resto al
primero en orden alfabético**), `MONTO_COMPLETO_CADA_UNO` (cada empatado cobra el monto
completo; el motor lo llama `MONTO_COMPLETO_CU` y el handler traduce), `DESIERTO`. El cálculo
es idempotente: mismas entradas → mismo resultado.

`dr-aprobar-premio` crea un `Bono` por ganador PROPUESTO (tipo `DESEMPENIO`, motivo
`[DR] <PREMIO> (PERÍODO <id>)`, `autorizadoPor` = aprobador), con UPDATE condicional sobre
el resultado, y pasa el período a APROBADO.

## Integración con la liquidación de sueldo

- **Mes abierto** por funcionario = sin liquidación o con liquidación BORRADOR (las ANULADAS
  se ignoran). La multa/premio va al **primer mes abierto desde el mes del hecho** (multa:
  fecha de la falta; premio: `hasta` del período). Si cae en otro mes, la fecha de la
  `Penalizacion`/`Bono` es el día 1 del mes destino y `mesDestino` queda guardado. Por qué:
  nunca se toca una liquidación cerrada.
- **Moneda:** la de la multa/premio tiene que ser la del sueldo (`monedaSalario`); si no
  coincide → `MONEDA_DISTINTA`. Si el tipo de falta / el premio no tiene moneda, no se valida.
- **Tope mensual** (`DR_TOPE_DESCUENTO_MENSUAL`, 0 = apagado): suma las Penalizacion `[DR]`
  vigentes del mes; lo que excede se parte en **cuotas** en los meses siguientes (máximo 24;
  si no alcanza → `TOPE_EXCEDIDO`). Cada cuota es una `Penalizacion` con descripción
  `… CUOTA k/n`.
- **Borrador desactualizado:** si al aprobar/anular/justificar una falta existe un BORRADOR
  de ese funcionario y mes, se registra un `dr_liquidacion_pendiente` PENDIENTE.
  `aprobar-liquidacion-sueldo` lo rechaza (`LIQUIDACIÓN DESACTUALIZADA POR CAMBIOS DE
  DISCIPLINA: REGENERÁ EL BORRADOR ANTES DE APROBAR`) y `generar-liquidacion-borrador` lo
  pasa a RESUELTO. El borrador **no** se regenera solo.
- Formato: multa → `Penalizacion` tipo `OTRO`, `autoGenerada: true`, descripción
  `[DR] <TIPO> #<n> (FALTA <id>)`, `registradoPor` = aprobador → concepto `PENALIZACION`
  (DESCUENTO). Premio → `Bono` → concepto `BONO_MANUAL` (HABER). Detalle en
  [rrhh-liquidaciones.md](rrhh-liquidaciones.md).

## Interacción con la tardanza de asistencias (no doble descuento)

`crearAsistenciaInterno` (asistencias) ya genera una `Penalizacion` automática por tardanza
cuando `PENALIZACION_AUTO_TARDANZA` está activa (**encendida por defecto** si no hay
configuración), aunque el monto sea ₲0. Si un tipo de falta DR es de tardanza
(`fuenteAsistencia`, o se manda `minutosTardanza`), `dr-registrar-falta` busca Penalizaciones
`autoGenerada` no anuladas del funcionario **que no sean `[DR]`** en ese día: si hay una,
**ignora** la tardanza DR de ese día y la informa en `ignoradas` (`YA TIENE PENALIZACIÓN
AUTOMÁTICA DE ASISTENCIA ESE DÍA`). Las Penalizacion `[DR]` también son `autoGenerada: true`;
por eso el filtro por prefijo.

⚠️ La protección es **en un solo sentido**: si la falta DR se carga antes que la asistencia,
la auto-penalización de asistencias se crea igual (ver *Limitaciones*). Antes de activar el
módulo en producción hay que leer la configuración real y decidir cuál de los dos descuenta
la tardanza.

## Protección de Penalizacion / Bono `[DR]`

`electron/utils/disciplina-proteccion.ts`: `bloquearSiEsDr` hace que `create-penalizacion`,
`update-penalizacion`, `anular-penalizacion`, `create-bono` y `anular-bono` rechacen
(`FORBIDDEN`) un registro cuya descripción/motivo empiece con `[DR]`, o crear uno con ese
prefijo desde afuera. Además `get-penalizaciones` y `get-bonos` **pasan a exigir permiso**
(antes los leía cualquiera): `PERMISOS_LECTURA_PENALIZACIONES` (`RRHH_PENALIZACION_REGISTRAR`
+ lectura común) y `PERMISOS_LECTURA_BONOS` (`RRHH_BONO_OTORGAR` + lectura común:
`RRHH_FUNCIONARIO_VER`, `RRHH_DASHBOARD_VER`, `RRHH_REPORTE_GENERAR`,
`RRHH_LIQUIDACION_GENERAR`, `RRHH_LIQUIDACION_APROBAR`, `RRHH_LIQUIDACION_PAGAR`,
`RRHH_LIQUIDACION_ANULAR`, `RRHH_DR_APROBAR`).

## Permisos (`SEED_PERMISOS`, módulo RRHH)

| Código | Qué habilita |
|---|---|
| `RRHH_DR_CONFIGURAR` | Catálogos (`dr-save-*`, tipos de falta) |
| `RRHH_DR_REGISTRAR` | Registrar faltas y errores; listar faltas/errores |
| `RRHH_DR_PUNTUAR` | Puntaje diario por criterios |
| `RRHH_DR_APROBAR` | Aprobar/justificar/anular faltas, anular errores, abrir/cerrar períodos, calcular/aprobar premios |
| `RRHH_DR_RESULTADOS_VER` | Resultados de encuestas (período cerrado) |
| `RRHH_DR_VOTAR` | Votar y ver encuestas pendientes |
| `RRHH_DR_MIS_DATOS` | Mis faltas, apelar, renunciar, mis puntos, mis premios |

Roles plantilla (`ROLES_PLANTILLA` en `seed-system.ts`): **`AUDITOR_DR`** (REGISTRAR,
PUNTUAR, VOTAR, MIS_DATOS) y **`COLABORADOR_DR`** (VOTAR, MIS_DATOS). Aprobar, configurar y
ver resultados **no** van en ninguna plantilla: los asigna el propietario a mano.

## Configuración

`ConfiguracionRrhh` (seed en `configuracion-rrhh.handler.ts`):

| Clave | Default | Efecto |
|---|---|---|
| `DR_VOTACION_MIN_VOTANTES` | 4 | Mínimo de votantes para ver resultados y premiar por votación |
| `DR_TOPE_DESCUENTO_MENSUAL` | 0 | Tope (PYG) de multas DR por funcionario y mes; 0 = sin tope |
| `PENALIZACION_AUTO_TARDANZA` (existente) | true | Auto-penalización de asistencias; ver no doble descuento |

Por tipo de falta: `advertenciasPrevias`, `montoMulta`, `escalaMontos`, `reinicio`,
`toleranciaMinutos`, `plazoApelacionHoras`, `fuenteAsistencia`. La semana del reinicio
SEMANAL arranca el lunes (el motor acepta otro inicio, el handler no lo pasa) y la
«advertencia de tolerancia» del motor (`advertirDentroTolerancia`) no está expuesta.

## Pantallas desktop (fase 2)

En `src/app/pages/rrhh/disciplina/`, desde *RRHH › Disciplina y reconocimiento*
(`menu-tree.ts`):

| Pantalla | Permiso | Qué hace |
|---|---|---|
| `registro-disciplina` | `RRHH_DR_REGISTRAR` | Pestañas Faltas y Errores: registrar (diálogos `registrar-falta-dialog`, `registrar-error-dialog`) e historial filtrable |
| `aprobaciones-disciplina` | `RRHH_DR_APROBAR` | Pestañas Pendientes, Apeladas y Premios |
| `config-disciplina` | `RRHH_DR_CONFIGURAR` | Catálogos genéricos por pestaña (formulario `dr-form-dialog`) y botón «Cargar ejemplo Cocina» |

`disciplina-api.service.ts` envuelve los canales `dr-*`. Los datos de ejemplo
(`ejemplo-cocina.ts`) son solo semilla editable: los carga `cargarEjemploCocina`, que es
idempotente y se prueba con `npm run test:disciplina-ejemplo`. Para probar pantallas sin
Electron: `scripts/ui-sandbox.ts` (app web contra una base temporal).

Separación de funciones (backend): nadie resuelve un hecho que registró ni uno cargado a su
propio funcionario (`noAutoResolver`), y quien está entre los ganadores no aprueba el premio.

## Handlers

`disciplina.handler.ts` (faltas), `disciplina-votacion.handler.ts` (períodos y votación),
`disciplina-premios.handler.ts` (cálculo y aprobación), `disciplina-puntos.handler.ts`
(errores, puntajes, mis puntos/premios), `disciplina-catalogos.handler.ts` (`dr-get-*` /
`dr-save-*` genérico por catálogo). Lista de canales en
[../reference/handlers-index.md](../reference/handlers-index.md).

## Tests

| Script | Qué cubre |
|---|---|
| `npm run test:disciplina-motor` | Motor puro: conteo y reinicio, escala, tolerancia, ranking, empates, validación de voto, cifrado |
| `npm run test:disciplina-e2e` | SQLite temporal con migraciones y handlers reales, bloques [A]–[P]: catálogo, registro y lote, permisos, identidad, apelación/renuncia/plazo, aprobación → Penalizacion, borrador, mes cerrado → siguiente, anular/justificar, protección `[DR]`, votación (atomicidad, cifrado, columnas sin votante, reescritura al cerrar), premios por votación/criterios/saldo, tope en cuotas + borrador desactualizado, tardanza sin doble descuento. Con `DR_E2E_PG=<base>` corre contra Postgres |
| `npm run test:disciplina-migracion` | up → down → up; down borra solo `dr_*` y el resto del esquema queda idéntico. `DR_E2E_PG=<base>` para Postgres |

Además `npm run test:permisos` tiene que dar los mismos asserts que en develop. Las tres
suites DR **no** están en `scripts/run-all-tests.js` (no corren con `test:all`).

Manual: `docs/testing/TESTING-CHECKLIST-DISCIPLINA-RECONOCIMIENTO.md`.

## Limitaciones conocidas

1. **Carrera en el primer INSERT del agregado de votos.** Si dos personas votan a la vez y
   la fila (período, evaluado, pregunta) todavía no existe, las dos hacen `insert` y una
   choca con el índice único: recibe el error crudo de la base (no un código DR). La
   transacción entera revierte (no queda participación), así que **reintentar funciona**.
   Ver [../reference/known-bugs.md](../reference/known-bugs.md).
2. **Doble descuento si la falta DR se carga antes que la asistencia.** El chequeo de
   tardanza solo mira las Penalizaciones automáticas que ya existen.
3. **Sin UI mobile.** La fase 2 trajo las pantallas desktop; falta la fase 3 (PWA:
   registro rápido, puntaje, votación, Mi resumen y apelación del funcionario).
4. ~~Aprobar un premio no marcaba el borrador como desactualizado~~: corregido en fase 2.
6. Aprobar un premio toma la última propuesta guardada: si otro recalcula entre «Calcular»
   y «Aprobar», se aprueba lo recalculado.
7. La bandeja de aprobaciones trae hasta 1000 faltas pendientes.
5. La apertura y el cierre automático de encuestas por día y hora no están implementados.
