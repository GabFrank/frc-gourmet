# Checklist de pruebas — Disciplina y Reconocimiento (fases 1 y 2)

Feature: módulo RRHH **Disciplina y Reconocimiento (DR)** (PR #313): faltas con advertencia,
multa y apelación; errores con puntos; puntaje diario por criterios; votación anónima entre
compañeros; premios por votación, criterios o saldo de puntos. Lo aprobado entra a la
liquidación como `Penalizacion` / `Bono` con prefijo `[DR]`.

> **La fase 1 no tiene pantallas.** Todo se prueba con los scripts de test o llamando a los
> canales por `POST /api/rpc` (modo servidor) / `invoke` desde la consola de DevTools del
> desktop. **Requiere reiniciar la app**: el cambio toca `electron/handlers/`, entidades y
> una migración.

Automatizado: `npm run test:disciplina-motor` (motor puro), `npm run test:disciplina-e2e`
(SQLite temporal con migraciones y handlers reales, bloques [A]–[P]) y
`npm run test:disciplina-migracion` (up → down → up). Las dos últimas aceptan
`DR_E2E_PG=<base>` para correr contra Postgres. **Ninguna está en `test:all`**: correrlas a
mano. Referencia del módulo: `.claude/skills/frc-gourmet-expert/domains/rrhh-disciplina.md`.

Forma de una llamada por RPC (con el token de un usuario logueado):

```bash
curl -s -X POST http://<servidor>:<puerto>/api/rpc \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"method":"dr-get-tipos-falta","params":[{}]}'
```

**Nunca contra la base de producción.** Usar una base de prueba (copia o vacía). No generar
ni aprobar liquidaciones reales.

---

## 0. Preparación

- [ ] Backup de la base antes de migrar (en el servidor Postgres, backup manual completo).
- [ ] Arranque sin error de migración (log `DatabaseService.runMigrations`); existen las 19
      tablas `dr_*`.
- [ ] En *Configuración RRHH* aparecen `DR_VOTACION_MIN_VOTANTES = 4` y
      `DR_TOPE_DESCUENTO_MENSUAL = 0`.
- [ ] Usuarios de prueba, cada uno vinculado a un funcionario (`Funcionario.usuario`):
      - un **admin** con `RRHH_DR_CONFIGURAR`, `RRHH_DR_APROBAR`, `RRHH_DR_RESULTADOS_VER`;
      - un **auditor** con el rol plantilla `AUDITOR_DR`;
      - al menos **4 colaboradores** con `COLABORADOR_DR`, todos en el mismo grupo.
- [ ] Todos los funcionarios con `monedaSalario` = PYG y los tipos de falta/premios en PYG.
- [ ] Anotar el valor de `PENALIZACION_AUTO_TARDANZA` (por defecto está **encendida**).

## 1. Migración reversible (SQLite y Postgres)

- [ ] `npm run test:disciplina-migracion` → 0 fallas en SQLite.
- [ ] `DR_E2E_PG=frc_dr_test npm run test:disciplina-migracion` → 0 fallas en Postgres
      (base vacía de prueba).
- [ ] Lo que verifica, y conviene mirar en el resumen: la migración DR es la última; `up`
      crea exactamente las tablas `dr_*` de las entidades; **`down` borra todas las `dr_*` y
      no toca ninguna otra tabla ni columna**; `down` quita el registro de la migración; `up`
      de nuevo deja el mismo esquema.
- [ ] Manual en una copia: correr `migration:revert` una vez y confirmar que no quedan
      tablas `dr_*` y que el resto de la app arranca igual. Volver a migrar.

## 2. Permisos sin regresión

- [ ] `npm run test:permisos` da **los mismos asserts** que en develop (en la auditoría:
      87/89; las 2 fallas son de `backup-create`, preexistentes, #265). Ningún permiso
      existente cambió de nombre ni desapareció.
- [ ] Aparecen los 7 permisos nuevos en el módulo RRHH: `RRHH_DR_CONFIGURAR`,
      `RRHH_DR_REGISTRAR`, `RRHH_DR_PUNTUAR`, `RRHH_DR_APROBAR`, `RRHH_DR_RESULTADOS_VER`,
      `RRHH_DR_VOTAR`, `RRHH_DR_MIS_DATOS`.
- [ ] Roles plantilla: `AUDITOR_DR` = REGISTRAR + PUNTUAR + VOTAR + MIS_DATOS;
      `COLABORADOR_DR` = VOTAR + MIS_DATOS. **Ninguna** plantilla tiene CONFIGURAR, APROBAR
      ni RESULTADOS_VER.
- [ ] `get-penalizaciones` y `get-bonos` ahora piden permiso: con un usuario sin permisos de
      RRHH → `FORBIDDEN`; con `RRHH_PENALIZACION_REGISTRAR` / `RRHH_BONO_OTORGAR` (o
      cualquiera de liquidación, funcionario-ver, dashboard RRHH, reportes RRHH o
      `RRHH_DR_APROBAR`) → responden. Revisar que las pantallas viejas de penalizaciones y
      bonos sigan cargando con los usuarios reales de RRHH.
- [ ] Un colaborador no puede `dr-registrar-falta`, `dr-aprobar-falta`, `dr-puntuar`,
      `dr-save-grupos` ni `dr-get-resultados-encuesta` (`FORBIDDEN`).

## 3. Faltas: registro, advertencia y multa

Crear con `dr-save-tipo-falta` un tipo: `advertenciasPrevias: 1`, `montoMulta: 50000`,
moneda PYG, `reinicio: 'MENSUAL'`, `plazoApelacionHoras: 48`.

- [ ] 1.ª falta del mes a un funcionario → `resultado: ADVERTENCIA`, `nOcurrencia: 1`,
      `montoCalculado: 0`.
- [ ] 2.ª en el mismo mes → `MULTA`, 50.000.
- [ ] En el mes siguiente vuelve a ADVERTENCIA (reinicio mensual).
- [ ] Una falta ANULADA o JUSTIFICADA no cuenta para la siguiente; una APELADA sí cuenta.
- [ ] Varios `funcionarioIds` en una llamada → una falta por persona con el mismo `loteId`.
- [ ] Monto negativo en el tipo → `VALIDACION`.
- [ ] Registrar **no** crea ninguna `Penalizacion` (verificar con `get-penalizaciones`).

## 4. Apelación: plazo y renuncia

- [ ] Recién registrada (plazo 48 h vigente), `dr-aprobar-falta` → rechazo
      `PLAZO_APELACION_VIGENTE`.
- [ ] El dueño apela (`dr-apelar-falta`, con texto) → estado `APELADA`, texto en mayúsculas.
- [ ] Otro colaborador intenta apelar o renunciar esa falta → `NO_ENCONTRADO`.
- [ ] Apelar sin texto → `VALIDACION`.
- [ ] En otra falta, el dueño renuncia (`dr-renunciar-apelacion`) → sigue `REGISTRADA` con
      `renunciaApelacion: true`; **apelar después** → `RENUNCIO_APELACION`; el admin ya la
      puede aprobar sin esperar el plazo.
- [ ] Con el plazo vencido (en la base de prueba, `apelacion_vence` en el pasado), apelar →
      `PLAZO_VENCIDO`, y el admin la aprueba sin renuncia.
- [ ] Un tipo con `plazoApelacionHoras: 0` se aprueba enseguida.
- [ ] Una falta APELADA se puede aprobar (se resuelve con la apelación a la vista) o
      justificar (`dr-justificar-falta`, motivo obligatorio).

## 5. Aprobación → liquidación

- [ ] Aprobar una MULTA → devuelve `penalizacionId` y `mesDestino`; se crea **una**
      `Penalizacion` tipo OTRO, descripción `[DR] <TIPO> #2 (FALTA <id>)`, 50.000.
- [ ] Aprobar de nuevo la misma falta → `ESTADO_INVALIDO`; sigue habiendo una sola
      penalización (doble clic no duplica).
- [ ] Aprobar una ADVERTENCIA → APROBADA sin penalización.
- [ ] `generar-liquidacion-borrador` de ese mes → item `PENALIZACION` por 50.000.
- [ ] Con la liquidación de ese mes **APROBADA**, una multa nueva de ese mes va al **mes
      siguiente** (`mesDestino`, fecha de la penalización = día 1 del mes siguiente).
- [ ] Anular una falta cuya multa está en una liquidación APROBADA/PAGADA →
      `LIQUIDACION_CERRADA`.
- [ ] Anular una falta aprobada con el mes todavía abierto → su penalización queda
      `anulada`.
- [ ] Moneda del tipo de falta distinta de la del sueldo → `MONEDA_DISTINTA` al aprobar.
- [ ] Las penalizaciones `[DR]` no se pueden editar ni anular con `update-penalizacion` /
      `anular-penalizacion`, ni crear una con descripción que empiece con `[DR]` por
      `create-penalizacion` (`FORBIDDEN`). Idem bonos `[DR]` con `create-bono` /
      `anular-bono`.

## 6. Tope mensual y borrador desactualizado

- [ ] Con `DR_TOPE_DESCUENTO_MENSUAL = 0` no hay tope (una multa de 50.000 sale entera).
- [ ] Con tope 30.000: una multa de 50.000 → `cuotas` = 30.000 en el mes y 20.000 en el
      siguiente, dos penalizaciones `… CUOTA 1/2` y `CUOTA 2/2`.
- [ ] Si ya existía el BORRADOR del mes, queda un `dr_liquidacion_pendiente` PENDIENTE y
      `aprobar-liquidacion-sueldo` falla con «LIQUIDACIÓN DESACTUALIZADA POR CAMBIOS DE
      DISCIPLINA…».
- [ ] Regenerar el borrador → descuenta solo la cuota del mes y el pendiente pasa a
      RESUELTO; ahora sí se aprueba.
- [ ] Con una cuota en liquidación aprobada, anular la falta → `LIQUIDACION_CERRADA`.
- [ ] Volver el tope a 0 al terminar.

## 7. Tardanza sin doble descuento

Tipo de falta de tardanza: `fuenteAsistencia: true`, `toleranciaMinutos: 5`,
`montoMulta: 10000`, `advertenciasPrevias: 0`, `plazoApelacionHoras: 0`.

- [ ] Funcionario A con una asistencia en TARDANZA ese día (y por lo tanto una penalización
      automática de asistencias, aunque sea de ₲0). `dr-registrar-falta` con
      `minutosTardanza: 20` para A y B → A sale en `ignoradas` («YA TIENE PENALIZACIÓN
      AUTOMÁTICA DE ASISTENCIA ESE DÍA»), B recibe la falta.
- [ ] Una penalización `[DR]` previa del mismo día **no** cuenta como automática de
      asistencias (B no se ignora por eso).
- [ ] Otro día sin auto-penalización: A sí recibe la multa DR y, aprobada, hay **una sola**
      penalización por día.
- [ ] `minutosTardanza: 3` (dentro de la tolerancia) → no se crea ninguna falta.
- [ ] ⚠️ Limitación conocida: si la falta DR se carga **antes** que la asistencia, la
      auto-penalización se crea igual y hay doble descuento. Confirmar que sigue así hasta
      que se arregle (ver `reference/known-bugs.md`) y decidir con el propietario cuál de los
      dos descuenta la tardanza antes de activar.

## 8. Votación anónima

Grupo con 4 colaboradores (`dr-save-grupos`, `dr-save-grupo-miembros`), encuesta con una
pregunta ESCALA 1–5 obligatoria y una TEXTO opcional. `dr-abrir-periodo` con `encuestaId`.

- [ ] `dr-mis-encuestas-pendientes` de un colaborador → la encuesta con los otros 3
      compañeros (no aparece él mismo).
- [ ] Votar incluyéndose a sí mismo, dejando un compañero afuera o fuera de rango → rechazo
      (`AUTOVOTO`, `ENVIO_INCOMPLETO`, `FUERA_DE_RANGO`).
- [ ] **Voto atómico:** forzar una falla al guardar los agregados (el e2e renombra
      `dr_voto_agregado` en medio): el voto falla y **no queda** ni la participación ni
      comentarios sueltos; al restaurar, la misma persona puede votar.
- [ ] Voto válido de los 4; un segundo voto de cualquiera → `YA_VOTO`.
- [ ] Con el período ABIERTO: en `dr_voto_agregado` solo hay `datos_cifrados`; las columnas
      numéricas están en NULL. Existe `userData/dr-votos.key`.
- [ ] Las tablas `dr_voto_agregado` y `dr_respuesta_texto` no tienen columnas de votante,
      usuario, `created_*` ni fecha; `dr_participacion` solo (id, periodo, funcionario).
- [ ] `dr-get-resultados-encuesta` con el período abierto → `PERIODO_ABIERTO`.
- [ ] `dr-cerrar-periodo` → `votantes: 4`; los agregados quedan en columnas y sin cifrado;
      textos y participaciones tienen **ids nuevos** (se reescribieron mezclados).
- [ ] Resultados: promedio ponderado por evaluado/pregunta; los textos vienen sin id ni
      fecha y en orden aleatorio.
- [ ] Con menos de `DR_VOTACION_MIN_VOTANTES` votantes → `suficiente: false`, sin filas.
- [ ] Un miembro con `pesoVoto: 2` pesa el doble en el promedio.
- [ ] Revisar los logs del servidor durante la votación: no aparece el contenido de ningún
      voto.

## 9. Premios

- [ ] **VOTACION:** período del premio cerrado → `dr-calcular-premio` propone ganador;
      con menos votantes que el mínimo → DESIERTO (`MINIMO_VOTANTES`).
- [ ] **CRITERIOS:** `dr-puntuar` con valores 0–2; recargar el mismo día/criterio reemplaza;
      valor 3 → `VALIDACION`. Dos empatados con `DIVIDIR` → cada uno la mitad (guaraníes
      enteros, el resto al primero alfabético).
- [ ] `MONTO_COMPLETO_CADA_UNO` → cada empatado el monto completo; `DESIERTO` → nadie.
- [ ] **SALDO_PUNTOS:** `dr-registrar-error` descuenta los puntos de la gravedad; un error
      anulado (`dr-anular-error`, motivo obligatorio) no descuenta.
- [ ] Calcular con el período ABIERTO → `ESTADO_INVALIDO`. Recalcular reemplaza la
      propuesta; con un resultado ya APROBADO → rechazo.
- [ ] `dr-aprobar-premio` → un `Bono` DESEMPENIO `[DR] <PREMIO> (PERÍODO <id>)` por
      ganador; el período pasa a APROBADO; aprobar de nuevo → `ESTADO_INVALIDO`.
- [ ] El bono aparece en el borrador como `BONO_MANUAL`. ⚠️ Si el borrador ya existía, hay
      que regenerarlo a mano (aprobar un premio no crea el pendiente).
- [ ] `dr-mis-premios` / `dr-mis-puntos` de un colaborador → solo lo suyo.

## 10. Prueba de concurrencia (Postgres, opcional)

- [ ] Dos aprobaciones simultáneas de la misma falta → una sola penalización.
- [ ] Dos votos simultáneos en un período recién abierto: puede salir un error crudo de
      índice único en uno (limitación conocida); reintentar ese voto funciona y el conteo
      final es correcto.

---

## Fase 2 (UI desktop)

Probar en modo oscuro y, si se puede, sobre una copia de la base real (nunca producción).
Sin Electron: `npx ts-node ... scripts/ui-sandbox.ts` levanta la app web contra una base
temporal (ver cabecera del script).

### 11. Menú y permisos
- [ ] *RRHH › Disciplina y reconocimiento* muestra 3 entradas: Registro (permiso
      `RRHH_DR_REGISTRAR`), Aprobaciones (`RRHH_DR_APROBAR`) y Configuración
      (`RRHH_DR_CONFIGURAR`). Un usuario sin el permiso no ve la entrada.

### 12. Configuración
- [ ] Pestañas: Tipos de falta (con checklist), Gravedades, Tipos de error, Criterios,
      Premios, Grupos y miembros, Encuestas y preguntas.
- [ ] Alta, edición y desactivación en cada catálogo (nada se borra); los hijos (checklist,
      miembros, preguntas) se filtran por el padre seleccionado.
- [ ] «Cargar ejemplo Cocina» crea los datos de ejemplo; pulsarlo de nuevo no duplica.
      La multa colectiva queda desactivada.
- [ ] Todos los montos y nombres se pueden editar (nada fijo en el código).

### 13. Registro
- [ ] Pestaña Faltas: registrar falta a un funcionario; el historial muestra quién la
      registró y se filtra por fechas, funcionario y estado.
- [ ] Pestaña Errores: registrar error con gravedad; muestra los puntos.

### 14. Aprobaciones
- [ ] Pendientes: aprobar con **otro** usuario genera la Penalización en la liquidación
      del mes abierto. El mismo usuario que registró no puede aprobar.
- [ ] Apeladas: la falta apelada aparece con su descargo; se resuelve aprobando (multa),
      justificando o anulando.
- [ ] Pendientes también permite justificar o anular.
- [ ] Premios: calcular, revisar y aprobar; aprobar marca el borrador de liquidación como
      desactualizado.

### Fase 3 (PWA) — pendiente
- [ ] Registro rápido, error en 3 toques, puntaje del día, votación paso a paso con envío
      único y «Ya votaste», Mi resumen con «Apelar» y plazo. Capturas mobile (390 px).
- [ ] Cierre de período con ranking y empates, y el aviso de anonimato del constructor de
      encuestas en grupos chicos.
