# Workflow: ciclo de implementación de una feature o fix

Ciclo canónico y **obligatorio** para cualquier feature o fix en este repo. Definido por Gabriel (2026-07-30). Seguir siempre, salvo indicación explícita en contrario.

## Pasos

1. **Iniciar siempre desde `develop` remoto.**
   - `git fetch origin develop` y basar la rama de trabajo en `origin/develop` actualizado.
   - Trabajar en la rama designada (`claude/...`); nunca commitear directo a `develop`/`master`.

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
   - Implementar fase por fase.
   - **Commit y push en cada fase.**
   - No es necesario parar/esperar entre fases.

7. **3 iteraciones de revisión.** Al terminar la implementación, lanzar **3 pasadas** buscando:
   - código mal escrito, posibles bugs, malas prácticas, huecos/edge cases faltantes.

8. **Batería completa de tests.**
   - Ejecutar todos los tests.
   - Si algún test falla → corregir y volver a ejecutar hasta que pase.

9. **Documentación final.**
   - Preparar un **manual de pruebas manuales** de lo implementado.
   - Actualizar la documentación del repo reflejando todo lo implementado/modificado.
   - Si corresponde, **actualizar la skill `frc-gourmet-expert`**.

10. **Cierre.**
    - Commit y push final.
    - **Consultar** si se va a crear PR (nunca crear PR sin pedido explícito).
