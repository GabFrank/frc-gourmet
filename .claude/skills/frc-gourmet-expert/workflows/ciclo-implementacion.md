# Workflow: ciclo de implementación de una feature o fix

Ciclo canónico y **obligatorio** para cualquier feature o fix en este repo. Definido por Gabriel (2026-07-30), ampliado y cerrado el 2026-08-15 — con la aclaración explícita de que **no vuelve a explicarse**: es el flujo por defecto de toda implementación, sin que haga falta pedirlo.

Sólo se cambia si el usuario lo pide **para esa tarea puntual**. Ante la duda, se sigue este ciclo completo.

## Pasos

1. **Iniciar siempre desde `develop` remoto.**
   - `git fetch origin develop` y basar la rama de trabajo en `origin/develop` actualizado.
   - Trabajar en la rama designada (`claude/...`, `feat/...`, `fix/...`); nunca commitear directo a `develop`/`master`.

2. **Cargar la skill `frc-gourmet-expert`.**

3. **Análisis e investigación.** Usar todas las fuentes:
   - Docs de la skill (dominio, arquitectura, convenciones, reference).
   - Código real (leer antes de afirmar — la skill puede estar desactualizada).
   - Memorias de sesiones pasadas (si conflictúan con la skill, la memoria gana).
   - `git log` / historial para estado actual.

4. **Planificación.**
   - Hacer **preguntas interactivas** al usuario si hay ambigüedad (usar `AskUserQuestion`).
   - El plan **debe incluir los tests** a escribir/ejecutar.
   - Dividir el trabajo en **fases**.

5. **Presentar el plan y esperar aprobación.**
   - Excepción: si se indicó explícitamente que la planificación no requiere aprobación → pasar directo a implementación.

6. **Implementación por fases.**
   - Implementar fase por fase, en el orden que las dependencias impongan.
   - **Commit y push al terminar cada fase.**
   - No parar ni esperar confirmación entre fases.
   - **Todo el trabajo va a UN solo PR**, salvo que el usuario pida separarlo.

7. **Revisión de código por agentes auditores.**
   - Al terminar todas las fases, lanzar **agentes externos** (Agent tool) a auditar el diff completo.
   - Siempre con **`model: "sonnet"`** — regla global del usuario, sin excepción.
   - Buscar: bugs, código mal escrito, malas prácticas, edge cases sin cubrir, violaciones de las convenciones del repo.
   - Los hallazgos se **verifican contra el código antes de aplicarlos** — un agente puede equivocarse.

8. **Testeo general.**
   - Ejecutar **toda** la batería de tests del repo, no sólo los del módulo tocado.
   - Si algo falla → corregir y volver a ejecutar hasta que pase.

9. **AOT.**
   - `npm run check` (build de producción). Es un paso propio, no opcional: el AOT rechaza errores de template y tipo que `ng serve` y `npm run build` toleran.

10. **Documentación.**
    - **Manual de pruebas manuales** de lo implementado, en `docs/testing/`.
    - Actualizar la documentación del repo que el cambio afecte.
    - **Actualizar la skill** si el cambio invalida algo que ella afirma, agrega un gotcha o cambia una convención.
    - Mover el ítem en el backlog (`workflows/todos-pendientes.md` o `reference/known-bugs.md`).

11. **Cierre: commit, push y PR a `develop`.**
    - Commit y push final.
    - **Crear el PR a `develop` directamente** — es el comportamiento esperado, no hace falta consultarlo.
    - Conventional commits: `feat(modulo):` minor, `fix(modulo):` patch.
    - **Esperar a que el CI esté verde antes de dar el trabajo por terminado.** No anunciar la implementación como completa con checks pendientes.

## Por qué el CI es parte del ciclo y no un trámite

Toda la verificación local corre sobre **SQLite**: la app dev, `npm run build`, `npm run check`, los `test:*` y correr migraciones contra una copia de la base real. **Ninguno toca Postgres.**

En el PR #234 eso dejó pasar un `@Column({ nullable: true })` sobre un campo tipado `string | null`: SQLite lo tolera y Postgres lo rechaza al **validar las entidades**, antes de correr una sola migración. Lo atajó el job *Migration run (Postgres baseline + incrementales)* después de que tres agentes auditores y toda la verificación local lo dieran por bueno.

Al tocar entidades o migraciones: declarar el `type` de columna explícito, y decir con qué se verificó y con qué no. Detalle en [`conventions/pitfalls-typeorm-electron.md`](../conventions/pitfalls-typeorm-electron.md).
