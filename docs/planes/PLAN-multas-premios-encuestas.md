# PLAN — Módulo de Disciplina y Reconocimiento (multas, premios, encuestas anónimas)

Estado: APROBADO por el propietario el 2026-10-23 13:05 («Aprobado, arrancá la fase 1») tras doble auditoría (A: aprobado con observaciones; B: aprobado con cambios; ambas incorporadas en §12) · base develop 0ae70c8e
Pedido: páginas Loom «prompt-gourmet-multas-premios» y «multas-premios-cocina» + 2 agregados del propietario (config y reportes también en desktop; nada hardcodeado).

## 1. Qué existe y qué se reutiliza

| Pieza existente | Dónde | Uso en el módulo |
|---|---|---|
| `Penalizacion` (multa: funcionario, tipo, monto, fecha, registradoPor, anulada) | entities/rrhh/penalizacion.entity.ts, IPC en asistencias.handler.ts | **Salida** de una multa aprobada. La liquidación ya la descuenta (concepto PENALIZACION). No se toca la liquidación. |
| `Bono` (premio: funcionario, tipo, monto, fecha, motivo, autorizadoPor, anulado) | entities/rrhh/bono.entity.ts, liquidacion-sueldo.handler.ts | **Salida** de un premio aprobado (BONO_MANUAL, HABER). |
| `generar-liquidacion-borrador` | liquidacion-sueldo.handler.ts:512 | Sin cambios: ya toma Penalizacion/Bono no anulados del período. |
| `LiquidacionConcepto` (catálogo, seed idempotente) | liquidacion-sueldo.handler.ts:46 | Solo si se decide separar líneas (D2). |
| `Asistencia.minutosTardanza` + tolerancia del turno + auto-penalización | asistencias.handler.ts:41-90 | Fuente opcional para «llegada tardía». La auto-penalización actual (`PENALIZACION_AUTO_TARDANZA`) debe quedar apagada para no duplicar (se verifica en producción). |
| `ConfiguracionRrhh` (clave/valor) | configuracion-rrhh.handler.ts | Parámetros generales (inicio de semana, plazo de apelación por defecto). |
| Permisos `SEED_PERMISOS` + `ROLES_PLANTILLA` + `ensurePermission` | permissions.handler.ts, seed-system.ts, auth.utils.ts | Permisos nuevos `RRHH_DR_*` y roles plantilla. |
| `Funcionario.usuario` | funcionario.entity.ts | Identidad del votante y de «Mi resumen» (cada uno entra con su usuario). |
| PWA `projects/mobile` (Angular 15 + Material, login propio, permisoGuard) | projects/mobile/src/app | Registro rápido, puntaje diario, votación, Mi resumen. |
| Desktop: MENU_TREE + tabs + dialogs Material, modo pantalla completa del KDS | src/app/services/menu-tree.ts, pages/ventas/kds | Configuración, aprobaciones, cierre, tablero y reportes. |
| Test e2e con SQLite temporal | scripts/test-funcionario-vales-e2e.ts | Nueva suite `test:disciplina-e2e`. |

No existe: encuestas, checklists, catálogo de errores, puntaje por criterios, cierre de período, apelaciones. Eso es lo nuevo.

### Hallazgos que condicionan el diseño
1. **Penalizacion y Bono entran a la liquidación apenas se crean** (solo filtran `anulada`). El módulo NO los crea al registrar el hecho: los crea recién cuando un admin aprueba. Así nada se descuenta ni se paga sin aprobación.
2. **`BaseModel` guarda `createdBy` y `createdAt` con hora.** Las tablas de votos no heredan BaseModel; si no, se sabría quién votó a quién (§4).
3. **El RPC es default-allow** (solo denylist): todo handler nuevo valida permiso adentro, y los de «mis datos»/votar toman la identidad del token, nunca de un id del cliente.

## 2. Modelo de datos (nuevo, prefijo `dr_`, migración aditiva sqlite + postgres)
Cada catálogo tiene `area` (texto configurable: COCINA, SALON, DELIVERY…) y `activo`. Nada se borra: se desactiva o se anula con motivo.

Configuración
- `dr_grupo` (nombre, área) + `dr_grupo_miembro` (funcionario, rol MIEMBRO/AUDITOR, `peso_voto` decimal, activo). Así «equipo de cocina» y «Fermina pesa 2» son datos.
- `dr_tipo_falta`: nombre, descripción, grupo, `modo_aplicacion` (INDIVIDUAL | TODOS_PRESENTES), `advertencias_previas` (ej. 1), `monto_multa`, moneda, `escala_montos` (JSON opcional por n.º de ocurrencia), `reinicio` (NUNCA|SEMANAL|MENSUAL), `tolerancia_minutos` (opcional), `fuente_asistencia`, `plazo_apelacion_horas`, `requiere_checklist`, orden.
- `dr_checklist_item` (tipo_falta, texto, orden).
- `dr_gravedad` (nombre, puntos que descuenta, color, orden) y `dr_tipo_error` (nombre, gravedad, grupo).
- `dr_premio`: nombre, monto, moneda, `periodo` (SEMANAL|QUINCENAL|MENSUAL), `metodo` (CRITERIOS | VOTACION | SALDO_PUNTOS), `regla_empate` (DIVIDIR | MONTO_COMPLETO_C/U | DESIERTO), `puntos_iniciales`, `encuesta_id`, grupo.
- `dr_criterio` (premio, texto, descripción, escala_min, escala_max, orden).
- `dr_encuesta` (título, grupo, periodicidad: día de apertura + horas abierta) y `dr_encuesta_pregunta` (texto, tipo ESCALA|SI_NO|TEXTO, escala_max, obligatoria, orden).

Hechos (heredan BaseModel)
- `dr_falta`: fecha, funcionario, tipo, detectado_por, motivo, observación, `n_ocurrencia`, `resultado` (ADVERTENCIA|MULTA), `monto_calculado`, `estado` (REGISTRADA, APELADA, APROBADA, JUSTIFICADA, ANULADA), apelación (texto, vence), resuelto_por, motivo_anulacion, `penalizacion_id`, `lote_id` (TODOS_PRESENTES), checklist fallado (JSON).
- `dr_error`: fecha, funcionario, tipo_error, puntos (copiados al registrar), detalle, registrado_por, estado VIGENTE|ANULADO.
- `dr_puntaje_criterio`: fecha, funcionario, criterio, valor, auditor. Único por (fecha, funcionario, criterio).

Período y cierre
- `dr_periodo` (premio/encuesta, desde, hasta, estado ABIERTO|CERRADO|APROBADO).
- `dr_resultado_premio` (periodo, funcionario, puntaje, posición, ganador, monto_propuesto, monto_aprobado, `bono_id`, aprobado_por).

Votación anónima: `dr_participacion`, `dr_voto_agregado`, `dr_respuesta_texto` (§4).

## 3. Motor de cálculo (servicio puro `electron/services/disciplina/`, testeable)
- Multa: al registrar, cuenta las faltas del mismo funcionario y tipo con estado distinto de ANULADA/JUSTIFICADA en la ventana de `reinicio`. Si n ≤ `advertencias_previas` → ADVERTENCIA (₲0); si no → MULTA (`escala_montos[n]` o `monto_multa`). Tardanza: minutos ≤ tolerancia → advertencia de tolerancia (configurable) o nada.
- TODOS_PRESENTES: pide los presentes (precarga desde asistencias del día, editable) y crea una falta por persona con el mismo `lote_id`.
- CRITERIOS: suma de puntajes del período. SALDO_PUNTOS: `puntos_iniciales − Σ puntos de errores VIGENTES`. VOTACION: promedio ponderado `Σ suma_ponderada / Σ pesos` sobre preguntas de escala (Sí=1/No=0 normalizado).
- Empate según regla; DIVIDIR = monto / n en guaraníes enteros (el resto al primero por orden alfabético, documentado).
- Recalcular es idempotente mientras el período no esté APROBADO.

## 4. Voto anónimo (seguridad)
- `dr_participacion` (periodo, funcionario, fecha sin hora), único: solo dice «ya votó».
- `dr_voto_agregado` (periodo, evaluado, pregunta, suma_ponderada, suma_pesos, cantidad, conteo_si, conteo_no): no se guarda ningún voto individual; cada envío suma al agregado en la misma transacción que la participación. Sin `created_by` ni timestamps.
- `dr_respuesta_texto` (periodo, evaluado, pregunta, texto): id UUID aleatorio, sin autor ni hora, insertado en orden aleatorio.
- El votante sale del token; el servidor arma la lista de evaluados = miembros activos del grupo menos él (todos aparecen, incluida la auditora). Rechaza: votarse, votar dos veces, envío incompleto (un solo envío con todas las personas).
- Peso = `peso_voto` del votante en el grupo.
- Resultados solo con `RRHH_DR_RESULTADOS_VER` y solo con el período cerrado (si no, comparando el agregado antes y después de cada voto se deduciría el voto). Logs del handler sin payload.
- Límite honesto: con 6 personas una respuesta de TEXTO puede delatar al autor por su estilo; el constructor lo avisa.

## 5. Aprobación y liquidación
- Bandeja de aprobaciones (permiso `RRHH_DR_APROBAR`: propietario y David): faltas con resultado MULTA cuyo plazo de apelación venció o fue resuelto, y resultados de períodos cerrados.
- Aprobar multa → crea `Penalizacion` (tipo OTRO, descripción «[DR] <tipo>: motivo», fecha del hecho, registradoPor = quien la detectó) y guarda el vínculo. Aprobar premio → crea `Bono` (tipo DESEMPENIO, motivo «[DR] <premio> semana dd/mm», autorizadoPor = aprobador).
- Las advertencias nunca generan Penalizacion. APELADA pendiente, JUSTIFICADA o ANULADA no cuentan.
- Anular algo ya aprobado anula su Penalizacion/Bono solo si la liquidación del mes sigue en BORRADOR o no existe; si está APROBADA/PAGADA se bloquea con aviso (sin arreglos retroactivos).
- El detalle de la liquidación muestra motivo, fecha y quién registró (vía la descripción y el vínculo).

## 6. Permisos nuevos (seed idempotente, módulo RRHH)
`RRHH_DR_CONFIGURAR` · `RRHH_DR_REGISTRAR` · `RRHH_DR_PUNTUAR` · `RRHH_DR_APROBAR` (aprobar, justificar, resolver apelaciones, cerrar período) · `RRHH_DR_RESULTADOS_VER` · `RRHH_DR_VOTAR` · `RRHH_DR_MIS_DATOS` (ver lo propio y apelar).
Roles plantilla: AUDITOR_DR (REGISTRAR, PUNTUAR, VOTAR, MIS_DATOS) y COLABORADOR_DR (VOTAR, MIS_DATOS). Asignar a personas reales lo hace el propietario desde Roles (backup antes).

## 7. Pantallas (detalle en el HTML de maqueta adjunto)
Mobile (PWA, mobile first, botones grandes): M1 Registrar falta (con vista previa «será ADVERTENCIA / MULTA ₲50.000») · M2 Registrar error (3 toques) · M3 Puntaje del día (una persona por pantalla, 0/1/2) · M4 Votación stepper (un compañero por pantalla, barra de avance, revisión y envío único; «Ya votaste») · M5 Mi resumen (advertencias, multas con «Apelar» y plazo, puntos, premios) · M6 Aprobaciones (admin).
Desktop (RRHH › Disciplina y reconocimiento): D1 Configuración en pestañas (Grupos y pesos · Faltas y checklists · Gravedades y errores · Premios y criterios · Encuestas con constructor y vista previa · Parámetros) · D2 Registro e historial filtrable · D3 Aprobaciones y apelaciones (selección múltiple) · D4 Cierre de período (ranking, empates, monto editable, «Aprobar y enviar a liquidación») · D5 Tablero semanal en pantalla completa para la revisión con David · D6 Reporte por persona y período con neto que impacta en sueldo, export PDF/Excel · D7 Resultados de encuesta (período cerrado).
Toda la administración existe en desktop; registro y votación también funcionan en desktop.

## 8. Datos iniciales
Botón «Cargar ejemplo Cocina» en Configuración (idempotente por nombre) con lo de la página multas-premios-cocina: 5 faltas (2.ª = ₲50.000; limpieza general ₲30.000 a todos los presentes; tolerancia 10 min; apelación 48 h; reinicio mensual), checklists, 3 gravedades y 15 errores, 3 premios de ₲100.000 (criterios 5×0-2, encuesta Compañerismo 5×1-10 los lunes, saldo 10 puntos), empate dividido. Miembros y peso de Fermina se cargan desde la pantalla. Nada en constantes de lógica.

## 9. Fases (un PR feat/ desde develop por fase)
1. Entidades + migración + permisos + motor + handlers + suite e2e (sin UI).
2. Desktop: Configuración, Registro, Aprobaciones, ejemplo Cocina.
3. Mobile: registro rápido, puntaje, votación, Mi resumen.
4. Cierre de período → Penalizacion/Bono, tablero y reportes.

## 10. Pruebas
- `test:disciplina-e2e` (SQLite temporal): advertencia→multa por conteo y reinicio mensual; TODOS_PRESENTES; tolerancia; apelación dentro/fuera de plazo; anulación; empate dividido; saldo de puntos; votación (no a sí mismo, doble voto, peso 2, incompleto); test que recorre todas las columnas de las tablas de votos y verifica que no hay rastro del votante; 403 sin permiso y «mis datos» de otro; aprobar crea Penalizacion/Bono y `generar-liquidacion-borrador` los incluye en la base temporal; anular con liquidación APROBADA queda bloqueado.
- Gates: build, check, test:all sin sumar fallas a la línea base (~9).
- UI: sandbox Electron y PWA con datos de prueba; capturas mobile (390 px) y desktop (1920 px) al propietario.
- Nunca se genera ni modifica una liquidación real. No toca cobro, factura ni PdV.

## 11. Riesgos y vuelta atrás
- Doble descuento por tardanza (auto-penalización existente + módulo): revisar `PENALIZACION_AUTO_TARDANZA` en producción y dejar uno solo antes de activar.
- Anonimato: §4, revisado de nuevo en la auditoría del diff.
- Rollback: módulo aislado en tablas `dr_*`; se apaga quitando los permisos (desaparece del menú). Migración aditiva, `down` elimina solo `dr_*`. Lo aprobado quedó como Penalizacion/Bono normales y se anula con sus flujos.

## Decisiones del propietario
- D1: Multas: siempre las aprueba un admin en la bandeja (recomendado) o pasan solas al vencer la apelación.
- D2: Líneas de liquidación: reutilizar PENALIZACION/BONO_MANUAL (recomendado, cero cambios en liquidación) o conceptos nuevos.
- D3: Orden de fases: backend + desktop primero (recomendado) o mobile primero.

## 12. Cambios incorporados por la doble auditoría (prevalecen sobre lo anterior)
Anonimato
- `dr_participacion` guarda solo (periodo, funcionario) único: sin fecha, sin hora, sin número de orden; id no secuencial (UUID).
- `dr_respuesta_texto`: al cerrar el período se reescriben todas las filas en orden aleatorio (borrar + reinsertar mezcladas) para que el orden físico no delate al autor.
- Los agregados de `dr_voto_agregado` del período ABIERTO se guardan cifrados (AES-GCM) con una clave fuera de la base (archivo en userData, generado al primer uso); se descifran solo al cerrar. Así, comparar dos backups no revela qué votó cada uno.
- El handler de votar no pasa por ningún registro técnico de payload (sin log del cuerpo, sin auditoría de parámetros).
- Si el servidor no puede identificar al votante desde su sesión/token, rechaza. Nunca usa el usuario logueado en la PC como fallback.
- Resultados: solo admin, período cerrado y mínimo de votantes configurable (`dr.votacion.min_votantes`, 4 por defecto); si no se alcanza, el premio queda DESIERTO o se decide a mano. Se muestra solo el promedio ponderado.
Aprobación y liquidación
- Aprobación idempotente garantizada por la base: índice único en `dr_falta.penalizacion_id` y en `dr_resultado_premio.bono_id`, y transición de estado condicional (UPDATE … WHERE estado = esperado); doble clic no duplica.
- Antes de vencer la apelación solo se aprueba si la persona no apeló (o renunció).
- «Mes abierto» por funcionario = sin liquidación o con liquidación BORRADOR. Si el mes del hecho está APROBADO/PAGADO, la Penalizacion/Bono va al siguiente mes abierto, con la fecha original en el motivo; el mes destino queda guardado (`mes_destino`).
- Borrador desactualizado: si al aprobar/anular existe el borrador de ese funcionario y mes, se regenera en la misma operación; si falla, se marca desactualizado (`dr_liquidacion_pendiente`) y no se puede aprobar la liquidación hasta regenerarla.
- Corrección de algo ya liquidado: ajuste compensatorio en el mes siguiente; nunca se toca una liquidación cerrada.
- Tope de descuentos DR por funcionario y mes (`dr.tope_descuento_mensual`, configurable; vacío = sin tope). Lo que excede se parte en cuotas a meses siguientes y queda pendiente con aviso.
- Moneda de la multa/premio = moneda del sueldo del funcionario; si no coincide, se rechaza.
- Protección: Penalizacion/Bono creados por el módulo (marcados con vínculo DR y prefijo «[DR]») solo se editan/anulan desde el módulo; los handlers viejos de penalizaciones y bonos los rechazan. `get-penalizaciones` y `get-bonos` pasan a exigir permiso (hoy cualquiera los lee).
Antes de activar en Don Franco
- La auto-multa por tardanza está encendida por defecto si no hay configuración. El motor ignora la tardanza de un día si ya existe una Penalizacion automática ese día (aunque sea ₲0). Antes de activar, se lee la configuración real en producción y decide el propietario.
- Multas como descuento y la colectiva (TODOS_PRESENTES) a validar con asesoría laboral; la colectiva queda desactivada (`activo=false`) en el ejemplo Cocina hasta confirmación.
- Backup manual completo de la base Postgres del servidor antes de la migración y otro antes de asignar permisos.
- Migración compatible SQLite y Postgres, probada up y down en ambos.
Datos de cocina
- Solo vía botón «Cargar ejemplo Cocina» (idempotente); nada en el código de lógica.

## 13. Alcance de la fase 1 (este PR)
Entidades `dr_*` + migración (sqlite y postgres, up/down) + permisos RRHH_DR_* y roles plantilla + motor puro (`electron/services/disciplina/`) + handlers RPC con validación de permiso e identidad desde la sesión + permisos en get-penalizaciones/get-bonos + bloqueo de edición DR desde handlers viejos + suite `test:disciplina-e2e`. Sin pantallas. No toca cobro, factura ni punto de venta.
