# Auditoría de diff — PR 1 usuario-password-select (Fijo 2 permisos/fugas + Fijo 3 tests)
**Auditor:** Diff — Permisos/fugas y poder discriminante de tests
**Modelo:** DeepSeek Flash (deepseek-flash vía heavy-llm, text-only, sin acceso al repo)
**Fecha:** 2026-09-28

## Veredicto (APROBADO CON CAMBIOS)

El fix de raíz (`@Column({select:false})`) y los 11 recortes están bien encarados y el test es serio (walker recursivo, fixture con los campos sensibles cargados, discriminación declarada canal por canal). Pero quedan huecos concretos: **`validate-credentials` addSelectea el hash y el test no verifica su respuesta** (a diferencia de login/change-password), **`createUsuario`/`updateUsuario` con password nuevo no están cubiertos** (select:false no protege objetos en memoria), y **el test no ejercita el patrón exacto de los ~20 canales que se apoyan en el fix de raíz** (`leftJoinAndSelect('X.createdBy')`). Además hay dos recortes del delivery sin assert negativo (persona de cliente y de repartidor). Nada de esto invalida el diseño, pero varios son "verificar antes de merge".

## Hallazgos

| ID | Severidad | Archivo | Hallazgo | Fix concreto |
|---|---|---|---|---|
| T1 | ALTA | `electron/handlers/auth.handler.ts` (validate-credentials) | El handler ahora hace `addSelect('usuario.password')` pero el diff **no muestra el `return`**. Si devuelve la entidad (como `login`), el hash recién cargado viaja en la respuesta de un canal default-allow. El test sólo asserta `val?.success`; **no** verifica `val.usuario.password === undefined`, cosa que sí hace para `login` y `change-password`. Es exactamente la clase de fuga que el PR viene a cerrar. | Añadir assert `ok(val?.usuario?.password === undefined, ...)` (o `rutasConClave(val,['password']).length===0`) y, si el handler devuelve la entidad, sanearla (no devolver el objeto con `addSelect`). |
| T2 | MEDIA | `electron/handlers/personas.handler.ts` (create-usuario/update-usuario) | El PR declara `select:false` como fix de raíz, pero **`select:false` no aplica a objetos en memoria**: si `create-usuario` —o `update-usuario` **con `password` nuevo**— devuelve la entidad guardada, el hash seteado viaja en la respuesta. El test sólo prueba `update-usuario` **sin** password (assert 5b), así que la rama que sí setea hash no está cubierta. | Assert explícito de que `create-usuario` y `update-usuario` con `password` devuelven `usuario.password === undefined`; si no, no devolver la entidad o construir un DTO. |
| T3 | MEDIA | `scripts/test-sin-fuga-datos-e2e.ts` | El valor del fix de raíz ("~30 respuestas", "los ~20 canales restantes ya no publican el hash") se apoya en que TypeORM 0.3 respete `select:false` en **`leftJoinAndSelect('X.createdBy')`**. El assert [1b] sólo ejercita un `find()` pelado y `get-usuarios`; **ningún** assert hace un `leftJoinAndSelect` sobre una relación a `Usuario` fuera de los 11. Si el comportamiento fuera distinto por tipo de join, el test no lo detecta. | Agregar un probe: `ds.getRepository(Caja).createQueryBuilder('c').leftJoinAndSelect('c.createdBy','createdBy').getOne()` y assert sin `password`. Es barato y cubre el mecanismo real de la deuda. |
| T4 | MEDIA | `scripts/test-sin-fuga-datos-e2e.ts` (assert 2/2b) | El recorte de **`cliente.persona`** en `delivery-listar-pdv` no tiene assert negativo: el walker [2] sólo mira objetos con `nickname` (el cliente no lo tiene) y [2b] sólo mira columnas salariales. Revertir `.leftJoin('cliente.persona',...)` a `leftJoinAndSelect` **pasa verde**. | Assert de que `filaDelivery.cliente.persona.telefono/email/fechaNacimiento === undefined`. |
| T5 | MEDIA | `scripts/test-sin-fuga-datos-e2e.ts` (assert 2b) | La persona del **repartidor** tampoco tiene assert negativo: [2] no la ve (sin `nickname`), [2b] sólo cubre salario/sueldo. Sólo falla si se revierte **junto** el `Funcionario` y su persona; un revert parcial de `repartidor.persona` no rompe nada. | Extender [2b] para prohibir `repartidorPersona.{documento,telefono,direccion,email,fechaNacimiento}`. |
| T6 | BAJA | `scripts/test-sin-fuga-datos-e2e.ts` | Asserts de la forma `ok(x?.usuario?.password === undefined)` (login IPC, change-password) **pasan vacíamente** si `usuario` no existe en la respuesta. No hay un `ok(!!login.usuario)` previo que fuerce la presencia. | Antes del negativo, assert de existencia del objeto (`ok(!!login?.usuario, ...)`). |
| T7 | BAJA | `scripts/test-sin-fuga-datos-e2e.ts` (assert 3) | `get-caja`, `get-caja-by-dispositivo`, `get-cajas-abiertas` y `get-retiro-caja` no tienen **assert positivo** de que el usuario recortado siga llegando. Si el alias del helper quedara mal y la relación viniera `null`, los negativos [1]/[2] pasarían igual y la UI perdería el cajero sin que el test lo note. | Un assert positivo por canal (p. ej. `createdBy.nickname === 'cajera'`). |
| T8 | BAJA | `electron/utils/resumen-caja.utils.ts` + test | Se recorta `responsableRetiro` de los retiros manuales, pero la fixture **no crea ningún retiro MANUAL** y el test sólo asserta `resumen.caja.createdBy`. El recorte nuevo queda sin cobertura. | Agregar un `RetiroCaja` MANUAL a la fixture y assert de que `responsableRetiro` no trae campos de persona. |
| T9 | BAJA | `.claude/skills/frc-gourmet-expert/reference/known-bugs.md` | El encabezado "Dos hallazgos **preexistentes** … que se dejaron sin arreglar a propósito" quedó desalineado: uno de los dos ahora dice "✅ RESUELTO". | Reescribir la intro (`uno resuelto, uno abierto`) o mover el nuevo bloque fuera de esa sección. |
| T10 | BAJA | `ventas.handler.ts`, `delivery.handler.ts` | Se conserva `cliente.persona.documento` (y `direccion` en delivery) en canales default-allow. Está documentado como decisión, pero sigue siendo PII de terceros expuesta sin `ensurePermission`. | Dejarlo anotado (ya está) y evaluar `ensurePermission` en el PR de permisos; no bloquea este PR. |

## Matriz de poder discriminante

| Assert | Qué revertir | ¿Falla? |
|---|---|---|
| [1] sin `password` en los 11 | Revertir **sólo** un recorte | **No** (lo tapa `select:false`) — el header lo reconoce |
| [1] | Revertir recorte **+** sacar `select:false` | Sí (doble revert) |
| [1b] `find()` pelado | Sacar `select:false` | Sí |
| [1b] `get-usuarios` | Sacar `select:false` | Sí (si usa `find`/relations; no verificado en el diff) |
| [2] persona del cajero | `selectUsuarioPublico` → `leftJoinAndSelect` | Sí (5 rutas) |
| [2b] salario del repartidor | `entregadoPorFuncionario` + `repartidor.persona` a `leftJoinAndSelect` | Sí (revert completo) / **No** (sólo `repartidor.persona`) |
| — persona del cliente (delivery) | `cliente.persona` a `leftJoinAndSelect` | **No** (no existe assert) |
| [3] nickname/nombre | Recortar de más (sacar `nickname`) | Sí |
| [4] login IPC | Sacar su `addSelect` | Sí |
| [4] `login.usuario.password === undefined` | (nada) | Pasa vacío si `usuario` ausente (ver T6) |
| [4b] login HTTP | Sacar `addSelect` de `auth-routes` | Sí |
| [5] change-password / [5b] update-usuario / [5c] reset | Sacar `addSelect` / forzar `password=''` / romper `save` | Sí |
| [6] validate-credentials | Sacar su `addSelect` | Sí (fuga de hash en respuesta: **no** cubierta) |
| [7] migratePlaintextPasswords | Volver a `repo.find()` | Sí |
| [8] seed admin default | Sacar su `addSelect` | Sí |

El walker recursivo es correcto para objetos/arrays/`null`/`Date` y corta ciclos con `vistos`; `usuariosEn` ancla en `nickname`, que es el discriminador robusto para usuarios. El defecto no es el walker, es **qué respuestas se le pasan**: no se corre sobre `login`, `validate-credentials`, `create-usuario` ni `update-usuario`.

## Riesgos

- **R1 — `select:false` y `leftJoinAndSelect`**: el ahorro de "todas las lecturas del sistema" depende del comportamiento de TypeORM 0.3 en QueryBuilder. `find()` respeta la bandera con seguridad; el join no está probado (T3). Si la premisa fallara, las ~20 lecturas de deuda seguirían publicando el hash y el test no lo vería.
- **R2 — Lectores no listados**: el plan afirma que `rg -n "password"` cerró la lista. Cualquier lector por SQL crudo (`dbQuery`, `getRawMany`) o `select('usuario.password')` no queda cubierto por `select:false` y rompería silenciosamente (o filtraría). No verificable desde el diff.
- **R3 — Recorte de más / UI**: `selectUsuarioPublico` fija `id,nickname,persona.{id,nombre,apellido}`; si algún template usa otro campo del usuario, rompe en silencio y ningún assert lo cubre para 4 canales (T7).
- **R4 — `x.caja_id` en QueryBuilder crudo** (`gastos-caja`, `pdv-egresos`, `resumen-caja`): si el nombre de columna no es exactamente `caja_id`, revienta en runtime. El test lo tomaría al invocar el canal, pero no es verificable desde el diff.
- **R5 — Flakiness del test HTTP**: puerto fijo `17171` y dependencia de `startServer` (jwt/config). Si falla, degrada a `ok(false)` sin distinguir causa.

## No verificable con el material

- El `return` real de `validate-credentials`, `create-usuario` y `update-usuario` (T1/T2): el diff sólo muestra la carga, no qué se responde.
- Que `ensurePermission` siga siendo la primera sentencia de `update-usuario` y `change-password` (el diff no muestra el inicio de esos handlers). En los que sí se ven (`get-gastos-caja`, `get-egresos-caja`) sigue primero.
- Que `CajaMayor`, `venta.pago`, `venta.mesa` o `conteo*` no arrastren a su vez relaciones a `Usuario`/`Persona` por `eager` (residuo potencial en `get-retiros-caja`, `get-retiro-caja`, `getVentasByDateRange`).
- Que `get-usuarios` (assert 1b) use `find({relations})` y no una proyección que ya excluya `password` — si fuera proyección, ese assert dejaría de discriminar.
- Que `getResumenCaja` esté efectivamente registrado por alguno de los `register*` que el test importa (si viviera en un handler no registrado, el canal fallaría).
- Consumidores reales del frontend (`direccion`/`documento` conservados, `activo`/`tipoDocumento` no expuestos): el plan dice haberlos grepeado, pero no es contrastable aquí.
