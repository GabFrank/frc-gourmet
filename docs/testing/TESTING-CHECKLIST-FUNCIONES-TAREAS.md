# Checklist de pruebas — Funciones y Tareas (escritorio y celular)

Feature: módulo RRHH **Funciones y Tareas (FT)**: funciones generales por cargo y específicas
por funcionario; plantillas de tareas y checklists (por cargo + turno, funcionario o área)
que un motor genera solas; avisos por app / WhatsApp / bot Gerente; vencimiento,
escalamiento y propuesta de falta; foto de evidencia y verificación por otra persona; tareas
disparadas por apertura/cierre de caja y por compras recibidas.

> **Requiere reiniciar la app**: el cambio toca `electron/handlers/`, `electron/services/`,
> entidades y una migración (`1793042064365-FuncionesTareas`). El motor corre solo en el
> equipo dueño de la base (**standalone o servidor**, nunca en un cliente).

Automatizado: `npm run test:funciones-tareas` (122/122) y
`npm run test:funciones-tareas-migracion` (11/11, up → down → up). Correrlas con
`TZ=America/Asuncion`; con `FT_E2E_PG=<base>` corren contra Postgres. **No están en
`test:all`**: correrlas a mano. Referencia del módulo:
`.claude/skills/frc-gourmet-expert/domains/rrhh-funciones-tareas.md`.

Forma de una llamada por RPC (con el token de un usuario logueado):

```bash
curl -s -X POST http://<servidor>:<puerto>/api/rpc \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"method":"ft-estado-motor","params":[]}'
```

**Nunca contra la base de producción.** Usar una base de prueba (copia o vacía). Para los
avisos por WhatsApp, usar teléfonos de prueba propios.

Tip para no esperar horas: crear plantillas con `HORA_FIJA` unos minutos adelante y
`duracion_min` corta (5–10), y bajar `intervalo_min` a 1 en *Configuración del motor*.

---

## 0. Preparación

- [ ] Backup de la base antes de migrar.
- [ ] Arranque sin error de migración; existen las 9 tablas `ft_*` (`ft_funcion`,
      `ft_plantilla_tarea`, `ft_plantilla_item`, `ft_regla_aviso`, `ft_tarea`,
      `ft_tarea_item`, `ft_config`, `ft_aviso_enviado`, `ft_propuesta_falta`).
- [ ] Los 5 permisos `RRHH_FT_*` aparecen en *Permisos* (módulo RRHH); el rol ADMINISTRADOR
      los tiene; la plantilla `COLABORADOR_DR` tiene `RRHH_FT_MARCAR_PROPIAS`.
- [ ] Usuarios de prueba, cada uno **vinculado a un funcionario** (`Funcionario.usuario`):
      - **admin** con todos los `RRHH_FT_*`;
      - **encargado** con `RRHH_FT_VERIFICAR` + `RRHH_FT_VER_TODO`, con cargo «ENCARGADO»;
      - **colaborador A** y **colaborador B** con `RRHH_FT_MARCAR_PROPIAS`, mismo cargo
        (p. ej. «COCINERO»), con turno asignado (`FuncionarioTurno`) que cubra hoy;
      - **usuario Gerente** con **solo** `RRHH_FT_REPORTES`;
      - un usuario con `RRHH_FT_MARCAR_PROPIAS` **sin funcionario vinculado**.
- [ ] Al menos un turno diurno y un **turno nocturno** (salida ≤ entrada, p. ej. 22:00–06:00).

## 1. Módulo apagado por defecto

- [ ] En *RRHH › Funciones y tareas › Configurar funciones y tareas › Configuración del
      motor*: **Activo = no**; último tick vacío.
- [ ] Crear una plantilla diaria para COCINERO: tras varios intervalos **no** se genera
      ninguna tarea (tablero vacío, `ft-estado-motor.activo = false`).

## 2. Funciones generales y específicas (escritorio)

- [ ] Pestaña **Funciones**: crear 2 funciones del cargo COCINERO (generales) y 1 del
      colaborador A (específica). Los textos quedan en MAYÚSCULAS.
- [ ] No se puede guardar una función sin cargo ni funcionario, ni con los dos.
- [ ] `ft-funciones-de` del colaborador A devuelve las 2 generales + la específica; del B,
      solo las 2 generales.
- [ ] Cambiar el cargo del colaborador B con un histórico de cargo desde hoy: ahora ve las
      funciones del cargo nuevo (cargo vigente por `HistoricoCargo`).
- [ ] Desactivar una función: deja de aparecer; borrarla la elimina.

## 3. Plantillas (escritorio)

- [ ] Pestaña **Plantillas de tareas**: crear
      - P1 **general** COCINERO, SIMPLE, diaria, `INICIO_TURNO` + 0, 60 min;
      - P2 **general** COCINERO + turno diurno, CHECKLIST con 3 ítems (uno no obligatorio);
      - P3 **área** (un grupo DR), `HORA_FIJA`;
      - P4 **específica** del colaborador A que **reemplaza** a P1.
- [ ] Validaciones: alcance cargo + funcionario a la vez → error de alcance; una general no
      puede reemplazar; CHECKLIST sin ítems y SIMPLE con ítems se rechazan; `DIAS_SEMANA` sin
      días, `MENSUAL` sin día, `UNICA` sin fecha, `EVENTO` sin evento o con otra ancla se
      rechazan; vigencia que termina antes de empezar se rechaza.
- [ ] Editar P2 quitando un ítem y agregando otro: se guardan bien; las tareas ya generadas
      **no cambian** (snapshot).
- [ ] Borrar una plantilla que ya generó tareas → «desactivala en vez de borrarla».

## 4. Motor: generación, idempotencia y vencimiento

- [ ] Activar el motor (Activo = sí, intervalo 1). En el próximo tick:
      - colaborador A recibe **P4** (no P1), P2;
      - colaborador B recibe P1 y P2;
      - los miembros del grupo de P3 reciben P3.
- [ ] Dejar pasar varios ticks: **no** se duplican tareas (mismo número en el tablero).
- [ ] Con dos equipos sobre el mismo Postgres (servidor + otro standalone apuntando a la
      misma base, solo en prueba): siguen sin duplicarse; el lock aparece en *Configuración
      del motor*.
- [ ] Una tarea que no se marca antes de `vence` pasa a **VENCIDA** en el siguiente tick.
- [ ] Apagar el servidor más que la duración de una tarea y volver a prenderlo: **no**
      aparecen de golpe tareas ya vencidas que nunca se habían generado.
- [ ] **Nocturno:** funcionario con turno 22:00–06:00 y plantilla `HORA_FIJA 02:00`: la tarea
      tiene `fecha` = día de entrada y vence en la madrugada siguiente; después de las 00:00
      sigue apareciendo en *Mis tareas*.
- [ ] Funcionario **sin turno**: solo recibe plantillas `HORA_FIJA`.
- [ ] `ft-estado-motor` (usuario Gerente): `activo: true`, `atrasado: false`; con el servidor
      apagado más de 3 intervalos, `atrasado: true`.

## 5. Celular — «Mis tareas» (`/rrhh/mis-tareas`)

Entrar a la PWA (`https://<servidor>:7443/`) con el colaborador A.

- [ ] En RRHH aparece **Mis tareas** (y **no** «Verificar tareas»). Sin
      `RRHH_FT_MARCAR_PROPIAS` la opción no aparece y la ruta no abre.
- [ ] Se ven las tareas de hoy con su ventana y estado. El usuario sin funcionario
      vinculado ve un error claro, no la lista de otro.
- [ ] Checklist: marcar los ítems uno por uno; al marcar el último **obligatorio** la tarea
      pasa sola a «Hecha · falta verificar». Desmarcar un ítem antes de eso funciona.
- [ ] Tarea con evidencia **NOTA**: pide la nota; sin nota no se completa.
- [ ] Tarea con evidencia **FOTO**: abre la cámara, sube la foto y recién entonces se
      completa; la foto se ve en la tarjeta. Una foto enorme se achica sola; con
      `foto_max_kb` bajo (p. ej. 100) igual entra o da un mensaje claro de tamaño.
- [ ] «No aplica» con motivo: la tarea queda NO_APLICA; sin motivo no deja.
- [ ] Una tarea VENCIDA no se puede marcar.
- [ ] Doble toque rápido en «Hecha»: no da error raro ni duplica nada.

## 6. Verificación — nadie verifica lo propio

- [ ] **Escritorio**, encargado: *Tablero de tareas › Por verificar* muestra las HECHAS;
      verificar una → VERIFICADA; rechazar otra con motivo → RECHAZADA.
- [ ] **Celular**, encargado: **Verificar tareas** (`/rrhh/verificar-tareas`) muestra
      pestañas HECHA y VENCIDA de los últimos 7 días; verificar, rechazar con motivo y
      «no aplica» en una vencida funcionan.
- [ ] El colaborador A ve el motivo del rechazo en *Mis tareas* y la puede rehacer.
- [ ] El encargado **no** puede verificar ni rechazar una tarea suya ni una que marcó él
      (error «no podés verificar tu propia tarea»).
- [ ] Plantilla con **cargo verificador** = ENCARGADO: un verificador de otro cargo no puede
      verificarla (salvo con `RRHH_FT_CONFIGURAR`).
- [ ] Rechazar sin motivo no deja.

## 7. Avisos, canales y escalamiento

Configurar en una plantilla reglas con canal distinto cada una.

- [ ] **APP**: el aviso aparece en *Tablero › Avisos* como ENVIADO; no sale ningún WhatsApp.
- [ ] **WHATSAPP** nivel 1 `ANTES_VENCER`: llega al teléfono del responsable; en *Avisos*
      queda ENVIADO. Con el envío global de notificaciones apagado queda FALLIDO con el
      error y se reintenta (máx. 3) al volver a prenderlo.
- [ ] **WHATSAPP** nivel 1 `AL_VENCER`: llega al encargado (cargo verificador o
      `encargado_destino`).
- [ ] Nivel 2 (grupo ADM): sale por el evento de notificación `RECORDATORIO_TAREA` a los
      receptores suscriptos en *Configuración › Notificaciones*.
- [ ] **GERENTE**: no sale ningún WhatsApp desde la app; el aviso queda PARA_GERENTE.
- [ ] Ningún aviso se repite en ticks siguientes (una fila por tarea + momento + nivel).
- [ ] **Ausente**: tarea **crítica** de un funcionario que no marcó entrada pasada la
      tolerancia del turno → un aviso AUSENTE al encargado por `canal_ausente`. Si marca
      entrada antes, no hay aviso.
- [ ] **Nivel 3 / propuesta de falta**: con `umbral_reincidencia = 2` y una plantilla que el
      colaborador dejó vencer 2 veces en la ventana, aparece una propuesta PENDIENTE en
      *Tablero › Propuestas de falta*; con una sola vencida, no. No se crea ninguna
      `dr_falta` sola.
- [ ] Registrar / Descartar la propuesta con nota: cambia de estado y muestra quién la
      resolvió. El propio funcionario no puede resolver una propuesta sobre sí mismo.

## 8. Caja y compras con el módulo activo y apagado (no debe romper nunca)

Crear plantillas `EVENTO`: «Contar fondo» en `CAJA_ABIERTA` (caja PDV), «Guardar recaudación»
en `CAJA_CERRADA` (PDV), una en `CAJA_ABIERTA` de caja **MAYOR** y «Controlar mercadería» en
`COMPRA_RECIBIDA`, para el cargo de quien opera la caja.

**Módulo activo:**

- [ ] Abrir una caja PDV desde el PdV (y otra desde conteo): la caja abre **igual que
      siempre**, sin demora visible; al rato aparece «Contar fondo» **solo** para quien abrió
      (si está en el alcance).
- [ ] Cerrar la caja PDV: el cierre, el ticket de cierre y el resumen por WhatsApp salen
      normal; aparece «Guardar recaudación».
- [ ] Abrir y cerrar una **Caja Mayor**: funciona normal; la plantilla PDV **no** se dispara
      con la mayor y viceversa.
- [ ] Finalizar una compra y crear una compra simplificada: se guardan normal; aparece
      «Controlar mercadería».
- [ ] Repetir la misma operación no duplica la tarea del mismo evento.
- [ ] Si quien abrió no está en el alcance, la tarea va a los del alcance que están en turno
      (o a todos si nadie está en turno).

**Módulo apagado** (Activo = no):

- [ ] Abrir/cerrar caja PDV, caja mayor y compras: todo funciona normal y **no** se crea
      ninguna tarea.

**Con error en FT** (opcional, base de prueba): desactivar o romper la plantilla EVENTO
(p. ej. borrar su cargo en la base) y abrir/cerrar caja: la caja **abre y cierra igual**;
como mucho queda un aviso `[ft]` en el log. El caso del error forzado lo cubre el e2e.

## 9. Lecturas del Gerente (usuario con solo `RRHH_FT_REPORTES`)

- [ ] `ft-avisos {desde, hasta}`: lista con `id`, tarea, funcionario, momento, nivel, canal,
      estado; los WHATSAPP enviados traen `enviadoPorApp: true`, los GERENTE `PARA_GERENTE`.
- [ ] `ft-cumplimiento {mes}` y con `agrupar: 'cargo'` / `'turno'`: totales coherentes con el
      tablero; % = (hechas + verificadas) / (asignadas − no aplica).
- [ ] `ft-vencidas`, `ft-historico {por: 'semana'}`, `ft-de-turno-hoy`, `ft-estado-motor`
      responden.
- [ ] Rango de más de 31 días → `RANGO_EXCEDIDO`.
- [ ] Con ese usuario, `ft-tarea-marcar`, `ft-plantillas-save` y `ft-config-set` se
      **rechazan** (solo lectura). Un colaborador no puede leer `ft-cumplimiento`.

## 10. Permisos y menú

- [ ] Escritorio: el grupo **RRHH › Funciones y tareas** muestra *Tablero de tareas* solo
      con `RRHH_FT_VER_TODO` y *Configurar funciones y tareas* solo con
      `RRHH_FT_CONFIGURAR`.
- [ ] Por RPC, un usuario sin permisos FT recibe error de permiso en cualquier `ft-*`.
- [ ] Un colaborador no puede marcar ni subir foto en la tarea de otro (responde «no
      encontrada»).

## 11. Backup y restauración

- [ ] Hacer un backup completo: incluye la carpeta `ft-evidencias` con las fotos.
- [ ] Restaurarlo en otra base de prueba: las fotos de evidencia se siguen viendo en las
      tareas.

## 12. Modo oscuro y claro

- [ ] Tablero, configuración, *Mis tareas* y *Verificar tareas* se leen bien en los dos
      temas (sin colores fijos).
