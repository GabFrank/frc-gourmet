# AUDIT-DIFF — `fix/usuario-password-select` (PR 1) — Motor / SQLite-PG / fugas

> **Auditor:** Diff — Motor (correctitud del cambio) · SQLite-vs-Postgres · fugas hidratadas residuales
> **Modelo:** Claude Code local — `claude-opus-5[1m]` (Opus 5, 1M context)
> **Fecha:** 2026-09-28
> **Base:** `origin/develop` `a834cbef` (`v1.21.0-alpha.165`) + **working tree** de `fix/usuario-password-select`
> **Diff auditado:** `/workspace/gourmet-qa/pr1-llm/pr1.diff` (= `git diff origin/develop`, 21 archivos, +1010/−86)
> **Alcance del PR:** Fase 4 y decisión D14 de `PLAN-caja-cerrada-guard.md`, según
> `docs/planes/PLAN-usuario-password-select.md`.

---

## Veredicto

## **APROBADO CON CAMBIOS**

El fix de raíz es correcto y la lista de lectores del hash está **cerrada** (verificada con grep
amplio sobre `electron/`, `src/`, `projects/`, `scripts/` y SQL crudo: no falta ningún `addSelect`).
Los 11 recortes mantienen **paridad exacta** con lo que devolvía `find({ relations })` y ningún
consumidor del frontend lee un campo recortado. No encontré ningún hallazgo BLOQUEANTE ni ALTA.

Lo que pide cambio antes del merge es **M1**: queda **una** respuesta que sigue publicando el hash
bcrypt —la de `update-usuario` cuando el payload trae una contraseña nueva—, que es justo el camino
del reset administrativo, y el test del PR no la cubre. Es una línea de fix y un assert.

---

## Hallazgos

| # | Sev. | Eje | Título |
|---|---|---|---|
| **M1** | **MEDIA** | FIJO 2 (fuga residual) | `update-usuario` devuelve el hash recién generado en su respuesta |
| **M2** | BAJA | FIJO 2 (fuga residual) | El `Usuario` en memoria de `setCurrentUser` conserva el hash y se serializa en las respuestas que lo asignan a una entidad |
| **M3** | BAJA | FIJO 1 (correctitud/acoplamiento) | `delivery.handler` reutiliza `COLUMNAS_PERSONA_PUBLICA` para la `Persona` de un `Funcionario` |
| **M4** | BAJA | test-coverage | El `addSelect` de `onboarding-tasks.config.ts` no tiene assert propio |

---

### M1 — MEDIA — `update-usuario` devuelve el hash recién generado en su respuesta

**Evidencia**

- `electron/handlers/personas.handler.ts:272-273` — si el payload trae contraseña, se asigna el hash
  nuevo a la entidad en memoria: `usuario.password = await hashPassword(usuarioData.password)`.
- `electron/handlers/personas.handler.ts:283-285` — `const updatedUsuario = await usuarioRepository.save(usuario);`
  → `return { success: true, usuario: updatedUsuario };`. `save()` devuelve **la misma instancia**,
  así que la propiedad `password` que se acaba de setear viaja en la respuesta.
- Contraste dentro del mismo archivo: `change-password` **sí** lo saca —
  `personas.handler.ts:355`: `return { success: true, usuario: { ...updated, password: undefined } };`.
  Mismo patrón en `auth.handler.ts:81` (login), `:173` (`getCurrentUser`) y `:212` (`restoreSession`).
  `create-usuario` se salva por accidente: refetchea con `findOne` (`personas.handler.ts:198-201`),
  y con `select: false` ese refetch ya no trae la columna.
- **Camino real de disparo:** `src/app/pages/personas/usuarios/reset-password-dialog/reset-password-dialog.component.ts:69-71`
  → `updateUsuario(usuarioId, { password: pass, mustChangePassword: true })`. También
  `create-edit-usuario.component.ts:282-295` cuando el form trae contraseña.

**Falla concreta**: un admin con `USUARIOS_GESTIONAR` abre "Resetear contraseña" de **otro** usuario;
el handler responde `{ success: true, usuario: { …, password: '$2a$10$…' } }`. En `standalone` eso
queda en memoria del renderer y en DevTools; en **`mode=client`** ese mismo objeto se serializa y
cruza la LAN por `/api/rpc` (y entra en cualquier log intermedio). Es el hash de un tercero, no del
que llama. Mitigante real: quien llama ya conoce el texto plano (lo generó/tipeó el propio diálogo),
así que no gana información nueva — por eso es MEDIA y no ALTA.

**Por qué el test no lo ve**: `scripts/test-sin-fuga-datos-e2e.ts:453-456` (assert 5b) llama
`update-usuario` **sin** `password` (`{ nickname: 'cajera2' }`), que es exactamente el caso en que
`usuario.password` vale `undefined`. La rama que sí setea el hash nunca se ejercita.

**Fix concreto** (una línea + un assert):

```ts
// personas.handler.ts:285
return { success: true, usuario: { ...updatedUsuario, password: undefined } };
```

y en `scripts/test-sin-fuga-datos-e2e.ts`, junto al 5b:

```ts
const updConPass = await call('update-usuario', cajero.id, { password: 'reseteada999', mustChangePassword: true });
ok(updConPass?.usuario?.password === undefined, 'update-usuario con password no devuelve el hash', updConPass?.usuario);
const loginReset = await call('login', { nickname: 'cajera2', password: 'reseteada999', deviceInfo: {} });
ok(loginReset?.success === true, 'update-usuario con password sí cambia el hash en la base');
```

El segundo assert además cubre un camino de escritura que hoy no tiene ninguno: que `update-usuario`
**escriba** el hash nuevo (5b sólo prueba que no lo *borre*).

---

### M2 — BAJA — el `Usuario` en memoria de `setCurrentUser` conserva el hash

**Evidencia**

- `electron/handlers/auth.handler.ts:29` hidrata el hash con `addSelect` (correcto, lo necesita), y
  `:63` guarda **la entidad entera** en el singleton del main process: `setCurrentUser(usuario);`.
- El canal `getCurrentUser` lo sanea (`auth.handler.ts:173`), pero los handlers que **asignan**
  `getCurrentUser()` a una entidad y devuelven esa entidad no: caso concreto verificado,
  `electron/handlers/banking.handler.ts:471-479` →
  `acred.verificadoPor = currentUser; … return acred;`.
  El patrón `= currentUser` aparece en ~28 lugares (`rg -n '= currentUser;' electron/handlers/`);
  la mayoría devuelve `{ success: true }` (p. ej. `caja-mayor.handler.ts:1775` → `:1810`), pero
  alcanza con uno para que el hash salga.

**Alcance real (por qué es BAJA)**: sólo afecta a `standalone`/IPC. En `server`/`client` el
`getCurrentUser()` efectivo sale del `AsyncLocalStorage` que llena el router con
`dataSource.getRepository(Usuario).findOne(...)` (`electron/server/rpc-router.ts:155-157`), que con
`select: false` **no** trae la columna. Y el hash expuesto es el **del propio usuario logueado**.

**Dónde el PR se pasa de afirmación**: `electron/utils/select-usuario-publico.util.ts:9-11` dice
«El hash de la contraseña ya no viaja por ningún lado». Con M1 y M2 abiertos, no es exacto.

**Fix concreto**, en `auth.handler.ts:63` (nada aguas abajo lee `currentUser.password` — verificado:
los únicos lectores del hash son los 7 del §2 del plan, y todos lo piden por `addSelect`):

```ts
setCurrentUser({ ...usuario, password: undefined } as Usuario);
```

(El `session.usuario = usuario` de `:53` y el `verifyPassword` de `:38` ocurren **antes**, así que no
se rompe el login ni la `LoginSession`.)

---

### M3 — BAJA — `COLUMNAS_PERSONA_PUBLICA` reutilizada para un `Funcionario`

**Evidencia**: `electron/handlers/delivery.handler.ts:45` y `:208` —
`.addSelect(['repartidor.id', ...COLUMNAS_PERSONA_PUBLICA.map((c) => \`repartidorPersona.${c}\`)])`,
donde `repartidorPersona` es la `Persona` de un **`Funcionario`**, no de un `Usuario`. La constante
está documentada en `electron/utils/select-usuario-publico.util.ts:30-31` como «Columnas públicas de
su `Persona`», con «su» = la del `Usuario`.

**Falla concreta**: el día que alguien necesite `documento` en el recorte de **usuario** (el propio
plan ya discute conservar `documento` para facturación, §5) y lo agregue a
`COLUMNAS_PERSONA_PUBLICA`, `delivery-listar-pdv` empieza a publicar el **documento del
repartidor** sin que nadie toque `delivery.handler.ts` — y el documento del repartidor es
exactamente uno de los campos que este PR saca de circulación. El assert 2b del e2e
(`CAMPOS_PROHIBIDOS_FUNCIONARIO`) no lo atrapa: sólo mira `salarioBase`, `valorJornal`, `numeroIps`
y `cuentaBancariaPropia`, no la `Persona`.

**Fix concreto**: enumerar las columnas inline, como ya hace `getVentasByDateRange` para el mismo
repartidor (`ventas.handler.ts:1109`), o exportar una constante propia
(`COLUMNAS_PERSONA_FUNCIONARIO`). Alternativa equivalente: extender el assert 2 del e2e para que
también recorra la `Persona` de cualquier objeto con forma de `Funcionario`.

*(Nota menor del mismo punto: el recorte del repartidor quedó **asimétrico** entre los dos canales —
`delivery-listar-pdv` manda `apellido` y `getVentasByDateRange` no. Es inocuo, pero si se unifica,
unificar para el mismo lado.)*

---

### M4 — BAJA — `onboarding-tasks.config.ts` sin assert propio

**Evidencia**: `electron/handlers/onboarding-tasks.config.ts:53-64` agrega el `addSelect` y su
comentario describe el modo de falla correcto («la tarea se marcaría completa aunque el admin
siguiera con la contraseña default»). El e2e cubre el caso **gemelo** de `seed-system.ts`
(`markDefaultAdminMustChangePassword`, assert 8 en `scripts/test-sin-fuga-datos-e2e.ts:496-506`)
pero no este. La cabecera del script lista 8 asserts de poder discriminante y no incluye el
onboarding.

**Falla concreta**: si alguien revierte ese `addSelect`, `verifyPassword('admin', undefined)`
devuelve `false` → `stillDefault = false` → `{ count: 1 }` → la tarea de onboarding «cambiá la
contraseña del admin» se muestra **completada** con el admin todavía en `admin`/`admin`, y ningún
test se pone rojo.

**Fix concreto**: un assert en el bloque [8], reusando el `admin` que ya crea el fixture:

```ts
const tarea = ONBOARDING_TASKS.find(t => /* la de cambio de password del admin */);
ok((await tarea.detect(ds)).count === 0, 'onboarding detecta el admin con la contraseña default');
```

---

## Riesgos

1. **`select: false` no tiene red de seguridad ruidosa, y el PR lo sabe.** Un lector nuevo que se
   olvide del `addSelect` recibe `undefined` y `verifyPassword` devuelve `false`: falla **cerrado**
   en los caminos de login (rechaza), pero falla **abierto y silencioso** en los caminos de
   detección (`onboarding`, `seed`, `migrate-passwords`: «no hay nada que hacer»). El PR mitigó los
   tres casos conocidos con `addSelect` + assert, pero el riesgo estructural queda vivo para el
   próximo lector. El `@Column({ select: false })` en `usuario.entity.ts:596-609` documenta esto
   bien; lo que **no** hay es un test que falle cuando aparezca un lector nuevo sin `addSelect`.
2. **La deuda declarada es real y grande.** Los ~20 canales que siguen hidratando `createdBy` ya no
   publican el hash, pero sí `documento`/`telefono`/`email`/`direccion` de quien cargó cada
   registro, sobre `/api/rpc` default-allow. Verifiqué la lista de `known-bugs.md` con
   `rg -n "createdBy\.persona" electron/`: los **14 sitios en 6 archivos** citados existen y son
   exactos (`caja-mayor` ×6, `banking` ×2, `dashboard-financiero`, `dashboard-ventas`, `vales`,
   `ventas` ×2). El riesgo de dejarlo es el de siempre: el próximo recorte necesita repetir el grep
   de consumidores, y la ventana de exposición sigue abierta mientras tanto.
3. **Ninguno de los 11 canales gana `ensurePermission`** (decisión explícita del plan, §"Lo que este
   PR NO hace"). `get-cajas`, `get-caja`, `get-caja-by-dispositivo`, `get-cajas-abiertas`,
   `get-retiros-caja`, `get-retiro-caja`, `getVentasByDateRange` y `delivery-listar-pdv` siguen
   siendo invocables por cualquier JWT válido; lo que cambió es *qué* devuelven. Correcto como
   decisión de alcance, pero es el 50% del problema original que queda abierto.
4. **No pude ejecutar la suite** — ver §Verificación. La afirmación «62 OK, 0 fallidos» del plan
   queda **sin confirmar por esta auditoría**; el análisis de los 62 asserts es estático.
5. **Reinicio obligatorio, sin migración.** Correcto: `select: false` es metadata de query y no
   genera DDL, así que una base existente no necesita nada (y `synchronize: false` lo vuelve moot).
   El hook `scripts/check-entity-migration.sh` emite sólo un **WARN** para entities modificadas
   (línea 40 en adelante), no bloquea — así que el commit pasa sin migración, como corresponde.

---

## Verificado OK

**FIJO 1 — Motor**

- **Lectores del hash: lista cerrada.** `rg 'verifyPassword|isHashed|\.password\b'` sobre `electron/`
  + barrido de `src/`, `projects/`, `scripts/` y SQL crudo. Los 7 lectores tienen `addSelect`:
  `auth.handler.ts:29` (login IPC), `:98` (`validate-credentials`), `server/auth-routes.ts:57`
  (login HTTP), `personas.handler.ts:334` (`change-password`), `onboarding-tasks.config.ts:59`,
  `seed-system.ts:99`, `migrate-passwords.ts:18`. **No falta ninguno.**
- **`password-recovery.handler.ts` correctamente excluido**: en `:157` carga el usuario sin el hash y
  en `:189` lo **asigna** (`usuario.password = await hashPassword(newPassword)`) antes del `save`.
  Sólo escribe → no necesita `addSelect`. El descarte A7 del plan madre es correcto.
- **`repo.save` NO pisa el hash.** Verificado en el código de TypeORM instalado (**0.3.21**):
  `node_modules/typeorm/persistence/SubjectChangedColumnsComputer.js:48-51` —
  `if (entityValue === undefined) return;` con el comentario «we don't perform operation over
  undefined properties (but we DO need null properties!)». Aplica a los tres `save` del §3 del plan
  (`update-usuario`, `change-password`, `reset-password-with-code`) y también a
  `delete-usuario` (`personas.handler.ts:365-372`), que no estaba en la lista y también carga sin la
  columna. El comentario de `personas.handler.ts:265-271` es exacto.
- **Login/refresh/validate/recovery/onboarding/seed/migrate**: ninguno llega con `undefined`.
  `/api/auth/refresh` (`auth-routes.ts:169-186`) no toca el hash. `restoreSession`
  (`auth.handler.ts:196-212`) tampoco.
- **`createUsuario` no filtra** el hash: refetch con `findOne` (`personas.handler.ts:198-201`), que
  con `select: false` ya no trae la columna. **`getUsuarios`/`get-usuario` tampoco** (cubierto por
  el assert 1b del e2e).
- **Paridad relación por relación con lo que devolvía `find`** — comparé las 8 conversiones una a
  una y **no falta ninguna relación**: `get-cajas`/`get-caja`/`get-caja-by-dispositivo`
  (`dispositivo` + `conteoApertura` + `conteoCierre` + `revisadoPor` + `createdBy`),
  `get-cajas-abiertas` (`dispositivo` + `conteoApertura` + `createdBy`), `get-retiro-caja`
  (`caja` + `caja.dispositivo` + `cajaMayor` + `detalles` + `detalles.moneda` + `detalles.formaPago`
  + los dos responsables), `get-gastos-caja` (`gastoCategoria` + `moneda` + `formaPago`),
  `get-egresos-caja` (`moneda` + `formaPago`), `computeResumenCaja` (caja y retiros).
- **Ninguna relación `eager` se perdió al pasar de `find` a QueryBuilder** (riesgo clásico: el QB no
  resuelve `eager`). `rg -n 'eager' src/app/database/entities/` devuelve **un solo** hit
  (`receta-presentacion.entity.ts:32`), ajeno a estas entidades.
- **`getOne()` no trunca los `detalles`** de `get-retiro-caja`: verificado en
  `node_modules/typeorm/query-builder/SelectQueryBuilder.js:710-712` — `getOne()` llama
  `getRawAndEntities()` y **no** aplica `LIMIT 1`, así que la `@OneToMany` se hidrata completa.
- **QB bien armados**: ningún `getRawMany` nuevo; el único `getRawOne` de la zona
  (`ventas.handler.ts:1295-1297`) es el de totales, con su propio builder sin el join de `items`
  (intacto). `getManyAndCount` + `skip`/`take` sólo en `getVentasByDateRange` y
  `delivery-listar-pdv`, ambos **preexistentes**, y en los dos el `ORDER BY` apunta a una columna
  que sigue en el `SELECT` (`venta.createdAt`, `delivery.fechaAbierto`), así que el
  `distinctAlias` no se rompe.
- **Consumidores del frontend: ninguno lee un campo recortado.** Grepeé template por template
  (desktop + PWA + storefront): `seleccionar-caja-dialog.component.ts:42-45`,
  `list-cajas.component.ts:225,283,466`, `list-caja-dialog.component.html:52`,
  `resumen-caja-dialog.component.html:17`, `list-retiros-caja.component.html:91`,
  `registrar-ingreso-dialog.component.html:101,133`, `list-ventas.component.ts:116,181` y
  `.html:81`, `delivery-dialog.component.ts:477,487` y `.html:203,217-219`,
  `convertir-modo-delivery-dialog.component.ts:142,144`, `pdv.component.html:137`,
  PWA `cajas-list.page.ts:52`, `caja-detalle.page.ts:87-88`, `ingresar-retiro.page.ts:94,108`.
  **Todos** leen sólo `persona.nombre`, `persona.apellido` o `nickname` — que es exactamente lo que
  `selectUsuarioPublico` conserva. Los consumidores backend también:
  `resumen-caja-imagen.util.ts:183,337`, `documentos-tickets.handler.ts:1670-1672` y
  `resumen-caja.utils.ts:259` usan `nombre` con fallback a `nickname`.
- **`cliente.persona.direccion` conservada por uso real**: `convertir-modo-delivery-dialog.component.ts:144`
  la usa de fallback. Bien detectado por el plan (no estaba en el original).
- **`revisadoPor`**: confirmado que ningún consumidor del frontend lo lee; recortarlo en vez de
  sacarlo es la decisión conservadora correcta.

**COND 1 — SQLite vs Postgres**

- **`alias.caja_id` es seguro en los dos drivers.** Es el punto que más me preocupaba
  (`gastos-caja.handler.ts:255`, `pdv-egresos.handler.ts:312`, `resumen-caja.utils.ts:236`).
  Verificado en `node_modules/typeorm/query-builder/QueryBuilder.js:432-513`
  (`replacePropertyNamesForTheWholeQuery`): el mapa de reemplazos incluye
  `replacements[alias]['<databaseName>'] = '<databaseName>'` (líneas 466-469), y el join column de
  la relación **está** en `metadata.columns` — así que `gasto.caja_id` se reemplaza por
  `"gasto"."caja_id"` **con quoting correcto**. Tampoco hay colisión con la relación `gasto.caja`:
  el lookahead `(?=[ =),]|.{0}$)` de la regex (línea 495) impide que `gasto.caja` matchee dentro de
  `gasto.caja_id`. Y ya es el patrón establecido en el repo (`venta.caja_id` en
  `delivery.handler.ts:222`, `delivery.precio_delivery_id` en `ventas.handler.ts:1247`,
  `retiro.caja_mayor_id` en `caja-mayor.handler.ts:1692`).
- **`orderBy` con alias**: todos los `orderBy` nuevos apuntan a **propiedades de entidad**, no a
  nombres de columna (`caja.fechaApertura`, `retiro.fechaRetiro`, `gasto.fecha`, `egreso.fecha`,
  `gasto.id`), así que TypeORM los reescribe contra el mapa de columnas. Es justo el error que
  `delivery.handler.ts:229-233` documenta («con el nombre crudo revienta …`databaseName`»).
- **Sin problema de enum/cast en PG**: todas las columnas comparadas en los `where` nuevos son
  `varchar` con `enum:` sólo como hint TS, sin `transformer` — `Caja.estado`
  (`caja.entity.ts:38-42`), `RetiroCaja.estado`/`origen` (`retiro-caja.entity.ts:16-28`),
  `GastoCaja.estado` (`:37-38`), `EgresoCaja.estado` (`:58-59`). No hay diferencia entre el binding
  de `find({ where })` y el de `andWhere(':param')`.
- **`addSelect` con columnas de relaciones**: patrón `leftJoin` + `addSelect(['alias.col', …])`,
  idéntico al que `getVentasByDateRange` ya corría en producción para el repartidor desde
  2026-08-28. Sin decimales ni booleanos nuevos en juego.
- **`get-caja-by-dispositivo`** filtra por el alias del LEFT JOIN
  (`financiero.handler.ts:672`: `where('dispositivo.id = :dispositivoId')`). Funciona en los dos
  drivers y es semánticamente equivalente al `where: { dispositivo: { id } }` anterior (que también
  generaba LEFT JOIN + WHERE). `caja.dispositivo_id` sería un pelo más robusto, pero no es un bug.
- **Orden de los `.leftJoin` en la cadena**: `selectUsuarioPublico` se llama *después* del
  `orderBy`/`where` en varios handlers (`caja-mayor.handler.ts:1684`, `ventas.handler.ts:1113`).
  Irrelevante — el `SelectQueryBuilder` compone el SQL al final y todos son LEFT JOIN sobre rutas
  independientes.

**FIJO 2 — fugas y permisos**

- **Los 11 canales quedan limpios de hash y de PII del usuario** (análisis estático relación por
  relación, más el walk recursivo del e2e). En los canales que hidratan otras entidades revisé que
  no entre un `Usuario` por la puerta de atrás: `get-retiros-caja` trae `retiro.caja` pero **no**
  `caja.createdBy`/`caja.revisadoPor`; `getVentasByDateRange` trae `venta.items` y `venta.pago`
  sin sus `createdBy`; `delivery-listar-pdv` acota `venta.caja` a `caja.id`.
- **`ensurePermission` intacto.** `git diff origin/develop -- electron/ | grep -E '^-.*ensurePermission'`
  → **vacío**: el PR no quita, mueve ni debilita ningún permiso. Los dos handlers tocados que lo
  tienen lo conservan como **primera sentencia**: `gastos-caja.handler.ts:45` y
  `pdv-egresos.handler.ts:394`.
- **Login HTTP no filtra**: `auth-routes.ts:113-127` construye el objeto campo por campo
  (`id`, `nickname`, `persona`, `mustChangePassword`) en vez de spread.
- **Backup / migración de datos: no hay riesgo de perder los hashes.** Era el otro modo de falla
  grave de `select: false` (una herramienta que copie filas vía entidades omitiría la columna en
  silencio). Verificado que **no existe**: `backup-utils.ts:197` es `fs.copyFileSync` (SQLite) y
  `pg-backup.utils.ts` usa `pg_dump`/`pg_restore` (SQL crudo); `getEntitiesList` sólo se usa en
  `src/app/database/database.config.ts`, no hay copia entity-a-entity entre datasources.
- **SQL crudo sobre `usuarios` no toca el hash**: los dos únicos joins
  (`dashboard-ventas.handler.ts:479`, `reportes-ventas.helper.ts:281`) seleccionan
  `u.id`, `u.nickname` y `per.nombre` explícitamente, nunca `u.*`.
- **Ningún componente del frontend leía el hash**: `rg '\.password'` en
  `src/app/pages/personas/usuarios/`, `src/app/auth/`, `projects/mobile/.../usuarios/` — todos los
  hits **escriben** la contraseña (form) o son CSS/plaintext temporal
  (`create-usuario-rapido-dialog` muestra `passwordTemporal`, que es el texto plano que el handler
  genera, no el hash).
- **`pedidos-online` es otra tabla**, confirmado: `pedidos-online-auth.handler.ts:185,259-262` usa
  `CuentaCliente.passwordHash`, ajeno a `Usuario.password`.
- **Documentación honesta**: `known-bugs.md` y `todos-pendientes.md` declaran la deuda con líneas
  verificables, y las **14 referencias `createdBy.persona`** que citan coinciden exactamente con el
  grep actual. La cabecera de `test-sin-fuga-datos-e2e.ts:17-52` («qué revertir para que falle cada
  assert») es el mejor documento del PR. El desdoblamiento del assert 1 en 1/1b —porque las dos
  capas se tapan entre sí en esos 11 canales— está bien razonado y es empíricamente cierto.

**Verificación ejecutada**

- `npx tsc -p tsconfig.electron.json --noEmit` → **limpio, 0 errores** (corrido en este worktree).
- ⚠️ **`npm run test:sin-fuga-datos` NO se pudo ejecutar**: el entorno de esta auditoría rechazó la
  invocación (`This command requires approval`), tanto vía `npm run` como vía `npx ts-node` directo.
  Los 62 asserts fueron auditados **leyendo el script completo**
  (`scripts/test-sin-fuga-datos-e2e.ts`, 520 líneas): el fixture carga los cinco campos sensibles de
  la `Persona` del cajero y las cuatro columnas salariales del `Funcionario` (líneas 185-243), así
  que los asserts 2 y 2b tienen poder discriminante real; el walk de `caminar`/`rutasConClave`
  (líneas 96-122) recorre cualquier profundidad y no filtra por tipo de relación, que es lo correcto
  —cortar por tipo es justo lo que dejó pasar el bug original—. **La cifra «62 OK, 0 fallidos» del
  plan queda sin confirmar por esta auditoría.** Quien haga el merge debería correrla.
