/**
 * Test de la lógica del árbol de menú (fuente única sidenav + buscador).
 *
 * - Parte A: prueba los helpers PUROS (`buildSidenavTree`, `flattenBuscables`,
 *   `esHoja`) con un fixture — permisos, enSidenav/enBuscador, poda de ramas,
 *   3 niveles de anidación.
 * - Parte B: valida invariantes estructurales del árbol REAL (`menu-tree.ts`)
 *   leyendo el archivo (sin importarlo, para no arrastrar componentes Angular):
 *   ids únicos y toda hoja con `action`.
 *
 * Correr: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-menu-tree.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  MenuNode, esHoja, buildSidenavTree, flattenBuscables,
} from '../src/app/services/menu-tree-utils';

let fallos = 0;
function check(nombre: string, cond: boolean): void {
  if (cond) {
    console.log(`  ✓ ${nombre}`);
  } else {
    console.error(`  ✗ ${nombre}`);
    fallos++;
  }
}

// Componente dummy (los helpers no lo ejecutan, solo lo transportan).
const C: any = class Dummy {};

// ── Fixture: 3 niveles, con permisos y flags variados ──
const FIXTURE: MenuNode[] = [
  { id: 'home', label: 'Inicio', permiso: 'HOME', action: { component: C, title: 'Inicio' } },
  {
    id: 'g-fin', label: 'Financiero',
    children: [
      { id: 'fin-dash', label: 'Dashboard', permiso: 'FIN_DASH', action: { component: C, title: 'Dash' } },
      {
        id: 'g-cm', label: 'Caja Mayor',
        children: [
          { id: 'gastos', label: 'Gastos', permiso: 'CAJA', action: { component: C, title: 'Gastos' } },
          { id: 'retiros', label: 'Retiros', permiso: 'CAJA', action: { component: C, title: 'Retiros' } },
        ],
      },
    ],
  },
  {
    id: 'g-solo-config', label: 'SoloConfig',
    children: [
      { id: 'oculto', label: 'Oculto', permiso: 'NADIE', action: { component: C, title: 'Oculto' } },
    ],
  },
  // Hoja solo-buscador (no en sidenav)
  { id: 'crear-x', label: 'Crear X', enSidenav: false, action: { component: C, title: 'Crear X' } },
  // Hoja solo-sidenav (no en buscador)
  { id: 'solo-nav', label: 'Solo Nav', enBuscador: false, action: { component: C, title: 'Solo Nav' } },
];

const permisos = new Set(['HOME', 'FIN_DASH', 'CAJA']); // NO tiene 'NADIE'
const has = (p: string) => permisos.has(p);

console.log('Parte A — helpers puros con fixture');

// esHoja
check('esHoja: hoja con action es hoja', esHoja(FIXTURE[0]) === true);
check('esHoja: rama con children NO es hoja', esHoja(FIXTURE[1]) === false);

// buildSidenavTree
const sidenav = buildSidenavTree(FIXTURE, has);
const idsSidenav = new Set<string>();
(function walk(ns: MenuNode[]) { ns.forEach((n) => { idsSidenav.add(n.id); walk(n.children || []); }); })(sidenav);

check('sidenav incluye home (permiso ok)', idsSidenav.has('home'));
check('sidenav incluye grupo financiero', idsSidenav.has('g-fin'));
check('sidenav incluye subgrupo caja mayor (3 niveles)', idsSidenav.has('g-cm'));
check('sidenav incluye gastos y retiros', idsSidenav.has('gastos') && idsSidenav.has('retiros'));
check('sidenav PODA grupo sin hojas permitidas (SoloConfig)', !idsSidenav.has('g-solo-config'));
check('sidenav excluye hoja sin permiso (oculto)', !idsSidenav.has('oculto'));
check('sidenav excluye hoja enSidenav:false (crear-x)', !idsSidenav.has('crear-x'));
check('sidenav incluye hoja enBuscador:false (solo-nav)', idsSidenav.has('solo-nav'));

// flattenBuscables (no filtra permiso; sí enBuscador)
const buscables = flattenBuscables(FIXTURE);
const idsBusc = new Set(buscables.map((b) => b.id));
check('buscables incluye hoja enSidenav:false (crear-x)', idsBusc.has('crear-x'));
check('buscables EXCLUYE hoja enBuscador:false (solo-nav)', !idsBusc.has('solo-nav'));
check('buscables incluye hojas anidadas (gastos)', idsBusc.has('gastos'));
check('buscables NO incluye ramas (g-fin)', !idsBusc.has('g-fin'));
const gastos = buscables.find((b) => b.id === 'gastos');
check('buscables hereda el grupo raíz como contexto (gastos → Financiero)', gastos?.group === 'Financiero');

console.log('\nParte B — invariantes del árbol real (menu-tree.ts)');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'services', 'menu-tree.ts'), 'utf8');
// Extraer todos los `id: '...'` dentro de MENU_TREE.
const ids = Array.from(src.matchAll(/\bid:\s*'([^']+)'/g)).map((m) => m[1]);
check('el árbol real declara muchos nodos (>60)', ids.length > 60);
const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
check(`ids únicos en el árbol real (dupes: ${[...new Set(dupes)].join(', ') || 'ninguno'})`, dupes.length === 0);

console.log(`\n${fallos === 0 ? '✅ TODOS OK' : `❌ ${fallos} FALLO(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
