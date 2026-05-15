/** Conventional Commits para FRC Gourmet.
 * Ver https://www.conventionalcommits.org/
 *
 * Tipos válidos:
 *   feat       — nueva funcionalidad → minor
 *   fix        — bugfix → patch
 *   perf       — mejora de performance → patch
 *   refactor   — cambio interno sin alterar comportamiento
 *   docs       — solo documentación
 *   test       — agregar/cambiar tests
 *   build      — sistema de build / dependencias
 *   ci         — workflows / pipeline
 *   chore      — tareas de mantenimiento
 *   style      — formato (sin cambio de lógica)
 *   revert     — revertir un commit
 *
 * BREAKING CHANGE en footer o `feat!:` → major.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    // El body de los commits frecuentemente incluye bullets largos, snippets
    // de codigo, paths absolutos y URLs. El default de 100 chars dispara
    // falsos positivos contra el estilo de log que ya usamos. Footer queda
    // libre porque puede llevar URLs o co-authored-by largos.
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'style', 'revert'],
    ],
  },
};
