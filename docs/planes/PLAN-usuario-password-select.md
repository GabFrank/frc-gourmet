# Plan — `Usuario.password` con `select: false` y recorte de los joins de caja (PR 1)

> Branch: `fix/usuario-password-select` · base `origin/develop` `a834cbef` (= `v1.21.0-alpha.165`)
> Estado: **implementado** (2026-09-28)
> Plan madre: `docs/planes/PLAN-caja-cerrada-guard.md` (rama `fix/caja-cerrada-guard`) — este PR
> implementa **sólo su Fase 4 y su decisión D14**. Las Fases 1–3 y 5 (guard de caja cerrada, índice
> único por dispositivo, revalidación del PdV) van en el **PR 2**, sobre esa otra rama.
> Auditorías del plan madre: `docs/planes/AUDIT-PLAN-caja-cerrada-guard-A.md` y `-B.md`
> (las dos **APROBADO CON CAMBIOS**; el registro completo está en su §15). Lo que llega acá desde
> esas auditorías es el hallazgo **B5** —`getVentasByDateRange` hidrata **tres** `Usuario`/`Persona`,
> no dos, y `delivery-listar-pdv` publica las columnas salariales del repartidor— y el **A7**
> descartado (`password-recovery` sólo escribe el hash: no necesita `addSelect`).

## Por qué se partió en dos PRs

Decisión **Q5** de Gabriel (2026-09-28, §0 del plan madre): el trabajo original eran cuatro frentes
en un solo PR, y el riesgo **R10** era que la auditoría se diluyera. La fuga de datos es
independiente del guard de caja —no comparte ni un archivo con las Fases 1–3— y es la que se puede
mergear primero sin esperar nada. El PR 2 se rebasa sobre `develop` después de que este entre; sus
tests de caja no dependen de la Fase 4.

## Alcance

### 1. Fix de raíz — `@Column({ select: false })` en `Usuario.password`

`src/app/database/entities/personas/usuario.entity.ts`. Es una **bandera de query, no un cambio de
schema**: no genera DDL y **no lleva migración**. Con eso el hash bcrypt deja de venir en cualquier
`find`/`leftJoinAndSelect` que hidrate un `Usuario` — o sea en las ~30 respuestas del sistema que
arrastran `createdBy`, de una sola vez y sin costo en runtime.

### 2. Los 7 lectores que sí necesitan el hash

Verificados con `rg -n "password" electron src/app/database projects --glob '!*.spec.ts'`; la lista
está cerrada (ningún otro lector, tampoco en SQL crudo: las baselines sólo declaran la columna, y
`create-edit-usuario.component.ts` la **escribe**).

| Archivo | Qué hace | Cómo quedó |
|---|---|---|
| `electron/handlers/auth.handler.ts` (`login`) | login IPC | `.addSelect('usuario.password')` |
| `electron/handlers/auth.handler.ts` (`validate-credentials`) | autorización puntual | ídem |
| `electron/server/auth-routes.ts` | login HTTP (PWA, `/admin`, modo cliente) | ídem |
| `electron/handlers/personas.handler.ts` (`change-password`) | cambio de contraseña | `findOne` → QB con `addSelect` |
| `electron/handlers/onboarding-tasks.config.ts` | detecta admin con contraseña default | ídem |
| `electron/utils/seed-system.ts` (`markDefaultAdminMustChangePassword`) | marca `mustChangePassword` | ídem |
| `electron/utils/migrate-passwords.ts` | one-shot plaintext → bcrypt | `repo.find()` → QB con `addSelect`. **Sin esto se volvía un no-op silencioso** (`if (!u.password) continue` salteaba a todos, sin lanzar ni loguear) |

`password-recovery.handler.ts` **no** entra: sólo **escribe** el hash (A7, descartado con evidencia
en la §15 del plan madre).

### 3. Los tres `save()` sobre una entidad cargada sin la columna

`personas.handler.ts` `update-usuario` y `change-password`, y `password-recovery.handler.ts`.
TypeORM ignora las propiedades `undefined` al calcular el diff del UPDATE, así que el hash existente
no se pisa ni se borra — pero es exactamente la clase de detalle que no se asume: los tres tienen
assert propio (5, 5b, 5c). El comportamiento de escritura de `update-usuario` **no cambió**: si el
payload trae `password` vacío o ausente, no toca el hash; si trae uno nuevo, lo hashea como antes. Lo
que sí cambió —por el hallazgo M1/T2 del diff-audit— es que su **respuesta** ya no lleva el hash
recién generado.

### 4. Helper nuevo — `electron/utils/select-usuario-publico.util.ts`

`selectUsuarioPublico(qb, relacionPath, alias, personaAlias?)` hace `leftJoin` + `addSelect` de
`id`, `nickname` y `persona.{id,nombre,apellido}`. Es lo que la UI muestra, verificado contra los
templates que pintan al cajero: `seleccionar-caja-dialog` (desktop y PWA), `list-cajas`,
`list-caja-dialog`, `resumen-caja-dialog`, `list-retiros-caja`, `registrar-ingreso-dialog`,
historial de ventas, `caja-detalle.page` y `cajas-list.page` de la PWA. Los `id` van porque sin la
PK TypeORM no arma el objeto de la relación.

Es el mismo patrón que `getVentasByDateRange` ya aplicaba al repartidor desde la sesión 2026-08-28.
Los canales que usaban `find({ relations })` pasaron a QueryBuilder: un `select` acotado sobre
`find` obliga a enumerar también las columnas de la raíz y se rompe en silencio al agregar una.

### 5. Los 11 canales recortados (D14)

`get-cajas`, `get-caja`, `get-caja-by-dispositivo`, `get-cajas-abiertas` (`financiero.handler.ts`);
`getResumenCaja` → `computeResumenCaja` (`resumen-caja.utils.ts`); `getVentasByDateRange`
(`ventas.handler.ts`); `get-retiros-caja`, `get-retiro-caja` (`caja-mayor.handler.ts`);
`get-gastos-caja` (`gastos-caja.handler.ts`); `get-egresos-caja` (`pdv-egresos.handler.ts`);
`delivery-listar-pdv` (`delivery.handler.ts`).

Antes de recortar se grepeó qué consume el frontend de cada respuesta. **Dos campos se conservaron
por uso real**, y uno por decisión del plan:

- **`cliente.persona.direccion` en `delivery-listar-pdv`** — lo usa
  `convertir-modo-delivery-dialog.component.ts:144` como fallback cuando el reparto no trae la suya.
  Sin él, convertir un delivery a retiro perdía la dirección en pantalla. **No estaba en el plan**:
  salió de verificar los consumidores.
- **`cliente.persona.documento`** en `getVentasByDateRange` y en `delivery-listar-pdv` — lo pide el
  plan madre para la facturación desde el historial. Verificado: **hoy el Historial no tiene acción
  de facturar**, así que ningún consumidor lo lee todavía; se conserva igual porque es la decisión
  escrita y no agrega riesgo (el documento del **cliente** no es lo que el PR saca de circulación).
- `revisadoPor` de la `Caja` no lo consume nadie en el frontend; se recortó con el helper en vez de
  sacarlo, para no romper un consumidor futuro.

`resumen-caja.utils.ts` también recorta el `responsableRetiro` de los retiros manuales aunque su
salida ya era una proyección (`responsable: persona?.nombre`): no era una fuga, pero hidratar la
`Persona` entera para leer un campo es la forma en que vuelve.

### Lo que este PR NO hace

- No toca permisos: ningún `ensurePermission` cambia, ni se agrega uno. Poner un permiso en
  `getVentasByDateRange` cambiaría quién puede usar el Historial y necesita decidirse aparte.
- No sanea los ~20 canales restantes que hidratan `createdBy`. Con `select: false` ya no publican el
  hash; lo que sigue expuesto ahí son datos personales, un grado menos grave y una superficie mucho
  más grande. Queda anotado en `known-bugs.md` **y** en `todos-pendientes.md`, con el grep que lo
  reproduce.
- No agrega el sanitizador central en `installHandlerRegistry` (alternativa descartada en D14: rompe
  `db-config.handler.ts`, que usa un campo `password` legítimo, cuesta un walk recursivo por request
  para siempre, y no resuelve la mitad de `persona`).

## Test — `npm run test:sin-fuga-datos`

`scripts/test-sin-fuga-datos-e2e.ts`, SQLite en `.tmp/`, handlers reales vía
`invokeHandlerWithContext`, mismo patrón que `test-terminal-caja-e2e.ts`. **90 asserts** (62 en la
primera vuelta + 28 del diff-audit, ver esa sección).

Cubre los 8 del §11 del plan madre (incluidos 2b, 5b y 5c): walk recursivo sin clave `password` en
los 11 canales; sin `documento`/`telefono`/`direccion`/`email`/`fechaNacimiento` de la `Persona` de
ningún `Usuario`; sin columnas salariales del repartidor; **sí** `nickname` y `persona.nombre`;
login IPC y login HTTP real (levanta Fastify con `startServer`, como `test:rate-limit`);
`change-password` + login con la nueva; `update-usuario` que no rompe el hash;
`reset-password-with-code`; `validate-credentials`; `migratePlaintextPasswords`; y el seed del admin
default. La cabecera del script documenta **qué revertir para que falle cada assert**.

⚠️ **Un assert del plan había que partirlo en dos.** El assert 1 ("ningún `password` en los 11
canales") **no discrimina el fix de raíz**: los recortes del punto 5 ya alcanzan para que esos 11 no
publiquen el hash, así que sacar el `select: false` los deja igual de verdes. Se verificó
empíricamente. Por eso se agregó el **assert 1b**, que es el que falla si se revierte: un `find()`
pelado de `Usuario` y el canal `get-usuarios` —que sigue sin recortar, es parte de la deuda— no
traen el hash. Las dos capas son defensa en profundidad para los 11 canales; para las otras ~20
lecturas, `select: false` es la **única** que hay.

## Diff-audit (2026-09-28)

Dos auditorías del **diff** (no del plan), con el diff completo contra `origin/develop`:

| Auditoría | Eje | Modelo | Veredicto |
|---|---|---|---|
| `AUDIT-DIFF-usuario-password-select-MOTOR.md` | motor del cambio, SQLite-vs-PG, fugas hidratadas residuales | Claude Code local (`claude-opus-5[1m]`) | **APROBADO CON CAMBIOS** (M1 MEDIA; M2, M3, M4 BAJA) |
| `AUDIT-DIFF-usuario-password-select-PERMISOS-TESTS.md` | permisos/fugas y poder discriminante de los tests | DeepSeek Flash (text-only, sin acceso al repo) | **APROBADO CON CAMBIOS** (T1 ALTA, T2–T5 MEDIA, T6–T10 BAJA) |

Ninguna encontró un BLOQUEANTE. Las dos coinciden en el hallazgo principal —el hash que seguía
saliendo por `update-usuario` cuando el payload trae contraseña nueva (M1 = T2)— y en que el walk
recursivo del test es correcto: el problema no era el walker, era **qué respuestas se le pasaban**.

### Qué se aplicó

**Código**

- **M1 / T2 (MEDIA) — `update-usuario` devolvía el hash recién generado.** `save()` devuelve la misma
  instancia y el hash se asigna *en memoria* (`usuario.password = await hashPassword(...)`), así que
  `select: false` no lo cubre: es el camino del **reset administrativo**
  (`reset-password-dialog` → `updateUsuario(id, { password, mustChangePassword: true })`) y el hash es
  de **otro** usuario. `personas.handler.ts` ahora devuelve la entidad sin la propiedad (destructuring,
  no `password: undefined`: así la clave ni existe). El resto del contrato no cambia. `create-usuario`
  ya estaba limpio —refetchea con `findOne`, que con `select: false` no trae la columna—, pero eso es
  un accidente feliz y ahora tiene assert propio.
- **M2 (BAJA) — el `Usuario` en memoria de `setCurrentUser` conservaba el hash.** `auth.handler.ts`
  (`login`) guarda una copia sin la propiedad. Importa porque ~28 handlers hacen
  `x.verificadoPor = currentUser` y alguno devuelve esa entidad (verificado:
  `banking.handler.ts:471-479`). Grepeado: **ningún** consumidor de `getCurrentUser()` lee
  `.password` —los 7 lectores del hash lo piden con `addSelect`—, y el `verifyPassword` y el
  `session.usuario` de la `LoginSession` ocurren antes. Sólo afectaba a `standalone`/IPC: en
  `server`/`client` el `getCurrentUser()` sale del `AsyncLocalStorage` que llena `rpc-router.ts` con
  un `findOne` (sin la columna).
- **M3 (BAJA) — acoplamiento en `delivery.handler.ts`.** La `Persona` del **`Funcionario`** repartidor
  usaba `COLUMNAS_PERSONA_PUBLICA`, que describe la `Persona` de un **`Usuario`**. El día que esa
  lista gane `documento` (el propio plan lo discute para facturación), `delivery-listar-pdv` empezaría
  a publicar el documento del repartidor sin que nadie toque el archivo. Ahora tiene su propia
  constante local `COLUMNAS_PERSONA_REPARTIDOR`, con el por qué escrito al lado.

**Tests** (`scripts/test-sin-fuga-datos-e2e.ts`; cada uno con su línea en la cabecera "qué revertir
para que falle")

- **M4 → \[8b\]** — la tarea de onboarding `PASSWORD_ADMIN` no tenía assert (sólo lo tenía el caso
  gemelo de `seed-system.ts`). Sin su `addSelect`, `verifyPassword('admin', undefined)` da `false` y
  la tarea se muestra **completada** con el admin todavía en `admin`/`admin`.
- **T2 → \[5d\]** — `update-usuario` **con** contraseña nueva: respuesta sin la clave `password`
  (walk) **y** login con la nueva funciona (cubre un camino de escritura que no tenía ninguno: 5b sólo
  probaba que el hash no se *borre*). Más `create-usuario` sin hash en la respuesta.
- **T3 → \[1c\]** — probe del mecanismo exacto de la deuda:
  `leftJoinAndSelect('c.createdBy', …)` y `find({ relations: ['createdBy'] })` sobre `Caja`. Que
  `select: false` valga en el **join** —y no sólo en un `find()` de `Usuario` pelado, que es lo único
  que probaba \[1b\]— es la premisa entera del ahorro sobre las otras ~20 lecturas.
- **T4 → \[2c\]** y **T5 → \[2d\]** — la `Persona` del **cliente** y la del **repartidor** en
  `delivery-listar-pdv` no las veía ningún assert: `usuariosEn` ancla en `nickname` (que ninguna de
  las dos tiene) y \[2b\] sólo mira columnas salariales, así que un revert parcial pasaba en verde.
  La fixture ganó `fechaNacimiento` en las dos personas para que el assert discrimine de verdad.
- **T6** — assert de **presencia** antes de cada negativo `x?.usuario?.password === undefined` (login
  IPC, `change-password`, `update-usuario`, `create-usuario`, `validate-credentials`): sin él el
  negativo pasa vacío si la respuesta no trae `usuario`.
- **T7 → \[3b\]** — assert positivo del usuario recortado en `get-caja`, `get-caja-by-dispositivo`,
  `get-cajas-abiertas` y `get-retiro-caja` (los dos responsables). Un alias mal puesto dejaría la
  relación en `null` con los negativos igual de verdes y la UI sin cajero.
- **T8 → \[3c\]** — el `responsableRetiro` de los retiros MANUALES de `getResumenCaja`. La fixture
  **ya creaba** un retiro `origen: 'MANUAL'` (la auditoría, sin acceso al repo, asumió que no), así
  que lo que faltaba eran los asserts: el nombre del responsable sigue llegando y la proyección no
  arrastra datos personales. El comentario de la fixture ahora dice por qué el `origen` importa.

### Qué se descartó, y por qué

- **T1 (ALTA) — `validate-credentials` NO es una fuga.** La auditoría no tenía el `return` del
  handler y asumió que devolvía la entidad. `auth.handler.ts:112` devuelve una **proyección**
  (`{ id, nickname, persona }`), así que el hash que pide con `addSelect` no sale. Queda **sólo el
  assert** \[6b\], que es lo valioso del hallazgo: hoy no filtra, y el assert es lo que impide que
  pase a filtrar si alguien la cambia por el patrón de `login`.
- **T10 — `cliente.persona.documento` (y `direccion` en delivery) sobre canales default-allow.** Es
  PII de terceros sin `ensurePermission`, pero es una **decisión escrita** de este PR (§5) y la
  propia auditoría la deja fuera de alcance ("no bloquea este PR"). Queda anotado acá y en el
  comentario del assert \[2c\]; el permiso se decide en el PR de permisos.
- El resto de los riesgos que las dos auditorías listan (R1–R5 / 1–5) ya estaban contemplados en el
  plan o quedaron verificados por la auditoría del motor: `alias.caja_id` es seguro en los dos
  drivers, ningún `eager` se perdió al pasar a QueryBuilder, `getOne()` no trunca los `detalles`,
  el backup no copia entidad-a-entidad (`fs.copyFileSync` / `pg_dump`) y el SQL crudo sobre
  `usuarios` nunca hace `u.*`.

## Verificación hecha

- `npx tsc -p tsconfig.electron.json --noEmit` — limpio.
- `npm run test:sin-fuga-datos` — **90 OK, 0 fallidos** (62 antes del diff-audit; +28 asserts).
- **Poder discriminante comprobado revirtiendo y restaurando:**
  - `select: false` → caen los 2 asserts de 1b;
  - el recorte de `get-cajas` (vuelto a `leftJoinAndSelect`) → cae su assert 2 con las cinco rutas
    (`cajera.persona.documento`, `.telefono`, `.direccion`, `.email`, `.fechaNacimiento`);
  - el `addSelect` de `migrate-passwords` → cae el assert 7 (el no-op silencioso de R4).
  - Los asserts nuevos del diff-audit, igual (revertido y restaurado uno por uno):
    el saneo del `return` de `update-usuario` → cae \[5d\] con la ruta `$.usuario.password`;
    `cliente.persona` vuelto a `leftJoinAndSelect` → cae \[2c\] con `telefono`/`email`/`fechaNacimiento`;
    **sólo** `repartidor.persona` vuelto a `leftJoinAndSelect` —el revert parcial que antes pasaba en
    verde— → cae \[2d\] con los cinco campos; el `addSelect` de `onboarding-tasks.config.ts` → cae
    \[8b\] con `{count: 1}`, o sea la tarea marcándose completa con el admin en `admin`/`admin`.
- Suites vecinas en verde: `test:terminal-caja` (30), `test:resumen-caja-numeros` (12),
  `test:integridad-cobro` (21), `test:delivery` (55), `test:delivery-conversion` (67),
  `test:cobro-parcial` (25), `test:transferencia-pdv` (71), `test:roles-pdv` (105).

## Riesgos del plan madre que este PR cierra

| # | Riesgo | Cómo queda |
|---|---|---|
| R3 | `select: false` rompe el cambio de contraseña porque el `save` no emite la columna | Asserts 5, 5b y 5c. TypeORM no emite la columna cuando vale `undefined`, así que el hash no se pisa; si algún día hiciera falta forzarlo, el camino es `repo.update(id, {...})` |
| R4 | `migrate-passwords` se vuelve un no-op silencioso | `addSelect` + assert 7, con el revert comprobado |

## Reinicio

Toca `electron/handlers/`, `electron/utils/`, `electron/server/` y una entidad → **la app requiere
reinicio**. No hay migración: `select: false` no es DDL, así que una base existente no necesita nada.
