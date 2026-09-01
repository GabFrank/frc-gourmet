# Workflow: ciclo de implementación de una feature o fix

Ciclo canónico y **obligatorio** para cualquier feature o fix en este repo. Definido por Gabriel (2026-07-30), ampliado el 2026-08-15 y reformado el 2026-09-01 — con la aclaración explícita de que **no vuelve a explicarse**: es el flujo por defecto de toda implementación, sin que haga falta pedirlo.

Sólo se cambia si el usuario lo pide **para esa tarea puntual**. Ante la duda, se sigue este ciclo completo.

> **Este documento es el dueño único del checklist ordenado.** `definition-of-done.md` quedó con lo que no está acá: dónde se registra cada cosa (SSOT), la política de issues y la regla de oro. Antes los dos tenían su propia copia de los pasos y divergieron — así fue como una decía "nunca corras `npm start`" y la otra lo contrario durante tres semanas.

## Si un paso no se puede cumplir

**Decilo en el momento. Nunca lo saltees en silencio.**

Puede pasar que una instrucción externa a la skill —la configuración de la sesión, una restricción del entorno, una herramienta que no está disponible— impida ejecutar un paso que acá figura como obligatorio. Eso no lo resuelve el agente por su cuenta: **se le informa al usuario cuando ocurre**, con qué paso es y por qué, y él decide.

Y el corolario, que costó caro una vez: **el plan es un registro, no un espejo de lo hecho.** Un paso que no se cumplió se anota como no cumplido. Editar el plan para que coincida con lo que efectivamente se hizo borra la evidencia de la omisión y convierte al documento en algo peor que inútil. Por eso el paso 6 exige commitear el plan apenas se aprueba: cualquier reescritura posterior queda en `git log -p` de ese archivo.

## Pasos

1. **Iniciar siempre desde `develop` remoto.**
   - `git fetch origin develop` y basar la rama de trabajo en `origin/develop` actualizado.
   - Trabajar en la rama designada (`claude/...`, `feat/...`, `fix/...`); nunca commitear directo a `develop`/`master`.

2. **Cargar la skill `frc-gourmet-expert`.**

3. **Análisis e investigación.** Usar todas las fuentes:
   - Docs de la skill (dominio, arquitectura, convenciones, reference).
   - **Código real** — leer antes de afirmar; la skill puede estar desactualizada.
   - **`reference/known-bugs.md`** y memoria de sesiones pasadas (si una memoria conflictúa con la skill, gana la memoria).
   - `git log` / historial para el estado actual.

4. **Planificación.**
   - **El plan se escribe a un archivo: `docs/planes/PLAN-<NOMBRE>.md`.** No alcanza con describirlo en el chat — el paso 5 necesita un artefacto que auditar, y el paso 6 lo commitea.
   - Hacer **preguntas interactivas** al usuario si hay ambigüedad (`AskUserQuestion`).
   - El plan **debe incluir los tests** a escribir/ejecutar.
   - Si el cambio toca **backend o entidades**: planear la **migración desde el arranque**. No hay auto-DDL; una entidad sin migración no existe en runtime. Ver [add-new-entity.md](add-new-entity.md).
   - Dividir el trabajo en **fases**.

5. **Auditoría del plan — 2 agentes, antes de mostrárselo al usuario.**
   - Van **antes** del paso 6 a propósito: ese paso tiene una excepción ("si se indicó que no requiere aprobación → directo a implementar"), y colgar la auditoría después dejaría que esa excepción se la llevara puesta. Acá corre siempre.
   - **Insumo:** el archivo del plan, el **código real** del área afectada, `reference/known-bugs.md` (para no reintroducir algo conocido) y `workflows/todos-pendientes.md` (para no duplicar ni contradecir el backlog).
   - **Dos ejes, divididos por *concern* y no por capa** — una división backend/frontend deja sin auditor a cualquier plan que sea todo de un lado:

     | Eje | Qué responde |
     |---|---|
     | **Alcance y convenciones** | ¿Resuelve lo pedido sin quedarse corto ni pasarse? ¿Respeta las reglas duras de [SKILL.md](../SKILL.md) §3? ¿Contradice `known-bugs.md` o el backlog? Si toca entidades, ¿contempla las 4 capas + migración desde el diseño? |
     | **Correctitud técnica y riesgo** | ¿El diseño es correcto contra el código real, no contra lo que dice la skill? Si toca entidades o queries, ¿contempla los dos drivers? ¿Contempla permisos desde el diseño y no como parche? ¿El plan de tests apunta a los riesgos reales o es un "agregar tests" genérico? |

   - **Un veredicto binario no es una salida válida.** Cada auditor devuelve al menos un riesgo identificado, o una justificación explícita de por qué no encontró ninguno. Un plan sin ningún riesgo señalado es sospechoso, no una buena noticia.
   - Los dos corren **sin ver la salida del otro**.
   - **Si se contradicen, no lo resuelve quien escribió el plan**: las dos posturas van al usuario en el paso 6 y él arbitra.

6. **Presentar el plan y esperar aprobación.**
   - Se presenta el plan **ya revisado** por el paso 5, con los hallazgos incorporados y las contradicciones expuestas.
   - **Al aprobarse, commitear el archivo del plan.** Es lo que hace auditable cualquier edición posterior.
   - Excepción: si se indicó explícitamente que la planificación no requiere aprobación → pasar directo a implementación (el paso 5 corre igual).

7. **Implementación por fases.**
   - Implementar fase por fase, en el orden que las dependencias impongan.
   - **Commit y push al terminar cada fase.**
   - No parar ni esperar confirmación entre fases.
   - **Todo el trabajo va a UN solo PR**, salvo que el usuario pida separarlo.
   - Durante la implementación: `npm run build` para verificar compilación; **`ensurePermission` como primera sentencia** de todo handler que muta (regla dura §3 #22 — `/api/rpc` es default-allow); respetar las reglas duras de [SKILL.md](../SKILL.md) §3.
   - **Todo test nuevo escrito para un bug se verifica revirtiendo el fix**: si el test sigue en verde sin el arreglo, no prueba nada. Aplica a los tests de regresión que nacen de un bug, no a re-correr los 56 existentes.

8. **Auditoría de la implementación por agentes.**
   - Al terminar todas las fases, lanzar **agentes externos** (Agent tool) a auditar el diff completo. Siempre con **`model: "sonnet"`** — regla global del usuario, sin excepción.
   - Los hallazgos se **verifican contra el código antes de aplicarlos** — un agente puede equivocarse, y de hecho se equivocan.
   - **3 fijos + hasta 2 condicionales.** El disparador de los condicionales es un `git diff --name-only`, no un criterio:

     | Eje | Cuándo | Qué busca |
     |---|---|---|
     | **Correctitud del motor** | Siempre | Bugs de lógica, edge cases, agregados mal armados (un `SUM` sobre un builder clonado que arrastra un join `@OneToMany` multiplica por la cantidad de hijos) |
     | **Seguridad y permisos** | Siempre | `ensurePermission` en handlers mutantes; exposición vía `/api/rpc`, que es default-allow; **fuga por relaciones hidratadas enteras** (`leftJoinAndSelect` de un `Funcionario` publica su salario y su cuenta bancaria) |
     | **Poder discriminante de los tests** | Siempre | ¿Qué mutación del código dejaría el test en verde? Fixtures que esconden el bug (un ítem por venta oculta una multiplicación por cantidad de ítems) |
     | **Paridad de driver SQLite/Postgres** | Si toca `entities/`, `migrations/`, columnas `decimal`/`numeric`/`float`, o SQL crudo/QueryBuilder sobre esas columnas o sobre fechas | Tipos de columna explícitos; `decimal` que en Postgres llega como **string**; comparación de fechas en texto; locks con join. Ver el cierre de este documento |
     | **Convenciones de UI** | Si toca `.html`, `.scss` o componentes bajo `pages/` o `shared/components/` | Reglas duras §3: `mat-menu` para acciones, sin colores hardcodeados, sin funciones ni getters en templates, `number:'1.0-2'`, `ConfirmationDialogComponent` |

   - **Techo: 5.** Cada agente extra trae falsos positivos que hay que verificar a mano, así que la cobertura no es gratis. Si un cambio parece necesitar seis lentes ortogonales, la señal no es sumar un agente: **el PR es demasiado grande y hay que partirlo**.

9. **Testeo general.**
   - **`npm run test:all`** — corre toda la batería. Es un comando, no un criterio: "las suites relacionadas con lo que toqué" no es cumplir este paso.
   - Si algo falla → corregir y volver a ejecutar hasta que pase.
   - `test:all` **no incluye** los que dependen de un navegador (`test`, `test:mobile`, Karma) ni Playwright/Electron (`test:e2e`). Ésos se corren aparte cuando el cambio los toca, con `CHROME_BIN` apuntando a un Chromium instalado.

10. **AOT.**
    - `npm run check` (build de producción). Es un paso propio, no opcional: el AOT rechaza errores de template y tipo que `ng serve` y `npm run build` toleran.
    - Si el cambio toca `projects/mobile`: además `npx ng build mobile`.

11. **Documentación.**
    - **Manual de pruebas manuales** de lo implementado, en `docs/testing/`. **Si el paso 8 encontró y arregló bugs, el manual tiene que incluir el caso de prueba que los habría detectado** — un arreglo sin su caso de prueba manual queda sin verificar del lado del usuario.
    - **Releer lo ya escrito, no sólo agregar.** Por cada hallazgo ALTA o MEDIA del paso 8: buscar en los docs redactados durante la implementación si afirman algo sobre ese comportamiento, y corregirlo. La documentación escrita antes de verificar describe la intención, no el resultado.
    - Actualizar el/los **doc(s) de dominio** afectados (`domains/`, `architecture/`, `conventions/`).
    - **Índices de `reference/` — checklist, no criterio:**
      - ¿Enum nuevo o modificado? → `reference/enums-index.md`
      - ¿Handler o canal IPC nuevo? → `reference/handlers-index.md`
      - ¿Entidad nueva? → `reference/entities-index.md`
      - ¿Pantalla navegable nueva? → `reference/menu-sidenav-tree.md` (y `MENU_TREE`, regla dura §3 #23)
    - **Actualizar la skill si el cambio invalida algo que ella afirma**, cambió una convención o introdujo un comportamiento no obvio. Ejemplo real: el refactor "cada variación su propia receta" dejó **falsa** la nota de "receta compartida por sabor" → hubo que corregirla, no sólo agregar.
    - **Mover el ítem en el backlog:** si estaba en `todos-pendientes.md` → marcarlo `[x]`. Si arreglaste un bug de `known-bugs.md` → marcarlo RESUELTO. Si descubriste deuda nueva → agregarla.
    - Si aprendiste un gotcha no obvio → guardarlo en **memoria** además de en la skill.

12. **Cierre: commit, push y PR a `develop`.**
    - **Conventional commits**: `feat(modulo):` minor, `fix(modulo):` patch, y además `refactor(...)`, `docs(...)`, `perf(...)`, `test(...)`. El mensaje explica el *qué* y el *porqué*.
    - **Crear el PR a `develop` directamente** — es el comportamiento esperado, no hace falta consultarlo.
    - Si abriste un GitHub issue (ver la política en [definition-of-done.md](definition-of-done.md)) → cerrarlo desde el PR con `Closes #N`.
    - **Avisar si el cambio requiere reiniciar la app**: backend, `electron/handlers/`, `preload.ts`, `main.ts`, entidades o `database.config.ts` → reinicio. Sólo Angular (templates/scss/ts del renderer) → hot reload.
    - **Esperar a que el CI esté verde antes de dar el trabajo por terminado.** No anunciar la implementación como completa con checks pendientes.
      - Los checks se miran **sobre el SHA del head actual**, no "los del PR": un push nuevo **cancela** los del commit anterior.
        ```bash
        gh api repos/GabFrank/frc-gourmet/commits/<sha>/check-runs \
          --jq '.check_runs[] | "\(.name): \(.status)/\(.conclusion)"'
        ```
      - **`cancelled` no es `success`.** Tampoco `skipped` ni `neutral`. Está verde cuando **todos** dan `completed/success`.
      - Branch protection exige **Lint + Build (ubuntu-latest)** y **Lint + Build (windows-latest)**. El job **Migration run (Postgres baseline + incrementales)** es el único que toca Postgres de verdad — ver abajo.

## Por qué el CI es parte del ciclo y no un trámite

Toda la verificación local corre sobre **SQLite**: la app dev, `npm run build`, `npm run check`, los `test:*` y correr migraciones contra una copia de la base real. **Ninguno toca Postgres.** Y el CI **no corre ninguna** de las suites `test:*` — sólo `tsc --noEmit`, `ng lint`, el build de producción y el job de migraciones. O sea que el paso 9 es la única red que existe para la batería, y el job de migraciones es la única que existe para Postgres.

En el PR #234 eso dejó pasar un `@Column({ nullable: true })` sobre un campo tipado `string | null`: SQLite lo tolera y Postgres lo rechaza al **validar las entidades**, antes de correr una sola migración. Lo atajó el job *Migration run (Postgres baseline + incrementales)* después de que tres agentes auditores y toda la verificación local lo dieran por bueno.

Al tocar entidades o migraciones: declarar el `type` de columna explícito, y decir con qué se verificó y con qué no. Detalle en [`conventions/pitfalls-typeorm-electron.md`](../conventions/pitfalls-typeorm-electron.md).
