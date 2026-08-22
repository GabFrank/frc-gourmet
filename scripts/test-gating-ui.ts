/**
 * Guarda contra el gate de permisos que esconde un boton en silencio.
 *
 * `*appHasPermission` desazucara a `<ng-template appHasPermission ...>`. Si el
 * componente standalone NO importa `HasPermissionDirective`, nadie instancia ese
 * template: **el elemento simplemente no se renderiza**. No hay error de AOT, ni
 * de consola, ni de tests — el boton desaparece y punto. Le paso al boton COBRAR
 * del PdV, que quedo invisible incluso para el ADMIN.
 *
 * Este test cruza cada template que usa la directiva con el TS de su componente.
 *
 * Uso: npm run test:gating-ui
 */
import * as fs from 'fs';
import * as path from 'path';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra, null, 2) : ''); }
}

const ROOT = path.resolve(__dirname, '..');

function templatesConDirectiva(raiz: string): string[] {
  const encontrados: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { recorrer(full); continue; }
      if (!e.name.endsWith('.html')) continue;
      const texto = fs.readFileSync(full, 'utf8');
      if (/\*appHasPermission|\*appHasAnyPermission/.test(texto)) encontrados.push(full);
    }
  };
  recorrer(raiz);
  return encontrados;
}

/**
 * Devuelve el array `imports: [...]` del @Component que declara ESE template.
 *
 * Un archivo puede tener varios componentes (p. ej. un dialogo auxiliar arriba
 * del componente principal); agarrar el primer `imports:` que aparezca da un
 * falso positivo. Se busca el decorador cuyo `templateUrl` apunte al html.
 */
function extraerImportsDelDecorador(codigo: string, templateBasename: string): string | null {
  const decoradores: string[] = [];
  const re = /@Component\s*\(\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) {
    let nivel = 1;
    let i = m.index + m[0].length;
    for (; i < codigo.length && nivel > 0; i++) {
      const c = codigo[i];
      if (c === '{') nivel++;
      else if (c === '}') nivel--;
    }
    decoradores.push(codigo.slice(m.index, i));
  }

  const propio = decoradores.find((d) => d.includes(templateBasename));
  if (!propio) return null;

  const mi = /(^|[\s,{])imports\s*:\s*\[/.exec(propio);
  if (!mi) return null;
  const inicio = mi.index + mi[0].length;
  let nivel = 1;
  for (let i = inicio; i < propio.length; i++) {
    const c = propio[i];
    if (c === '[') nivel++;
    else if (c === ']') {
      nivel--;
      if (nivel === 0) return propio.slice(inicio, i);
    }
  }
  return null;
}

function main() {
  const templates = templatesConDirectiva(path.join(ROOT, 'src/app'));
  ok(templates.length > 0, `hay templates usando la directiva (${templates.length})`);

  const sinImportar: Array<{ template: string; componente: string; usa: string[] }> = [];
  let standalone = 0;
  let enModulo = 0;

  for (const template of templates) {
    const ts = template.replace(/\.html$/, '.ts');
    if (!fs.existsSync(ts)) continue;
    const codigo = fs.readFileSync(ts, 'utf8');

    // Los componentes declarados en un NgModule heredan la directiva del modulo;
    // el riesgo es exclusivo de los standalone, que declaran sus propios imports.
    if (!/standalone:\s*true/.test(codigo)) { enModulo++; continue; }
    standalone++;

    const html = fs.readFileSync(template, 'utf8');
    const usa: string[] = [];
    if (/\*appHasPermission/.test(html)) usa.push('HasPermissionDirective');
    if (/\*appHasAnyPermission/.test(html)) usa.push('HasAnyPermissionDirective');

    // Se mira el array `imports` del decorador, NO el archivo entero: tener la
    // linea `import { HasPermissionDirective } from ...` y olvidarse de sumarla
    // al array es exactamente el modo de falla — el import queda sin usar y la
    // directiva nunca se aplica.
    const bloque = extraerImportsDelDecorador(codigo, path.basename(template));
    const faltantes = bloque === null
      ? usa  // sin array `imports` no puede tener la directiva
      : usa.filter((d) => !new RegExp(`\\b${d}\\b`).test(bloque));
    if (faltantes.length) {
      sinImportar.push({
        template: path.relative(ROOT, template),
        componente: path.relative(ROOT, ts),
        usa: faltantes,
      });
    }
  }

  console.log(`  (${standalone} standalone revisados, ${enModulo} declarados en NgModule omitidos)`);
  ok(sinImportar.length === 0,
    'todo componente standalone que usa la directiva la importa', sinImportar);

  console.log(`\n${failed === 0 ? '✅' : '❌'} gating-ui: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main();
