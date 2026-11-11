#!/usr/bin/env python3
"""Genera docs/api/CATALOGO-RPC.md: todos los métodos que acepta POST /api/rpc.

Lee los `ipcMain.handle('<canal>', ...)` de electron/handlers/*.ts (+ auto-updater
y auth.utils), sus parámetros, los permisos que exige (`ensure*Permission('X')`)
y la lista de bloqueados de electron/server/rpc-router.ts.

Uso:  python3 scripts/generate-api-catalog.py        (regenera el archivo)
      python3 scripts/generate-api-catalog.py --check (falla si está desactualizado)
Correrlo en cada PR que agregue, quite o cambie un handler.
"""
import collections, glob, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'api', 'CATALOGO-RPC.md')
FILES = sorted(glob.glob(ROOT + '/electron/handlers/*.ts')) + [ROOT + '/electron/utils/auto-updater.ts']
FILES = [f for f in FILES if not re.search(r'\.(spec|test)\.ts$', f)]
HANDLE = re.compile(r"ipcMain\.handle(?:Once)?\(\s*(['\"`])([^'\"`]+)\1\s*,")
READ = ('get', 'list', 'buscar', 'search', 'obtener', 'check', 'validar', 'validate', 'verificar',
        'calcular', 'calculate', 'preview', 'count', 'export', 'find', 'is-', 'has-', 'consultar',
        'resolver', 'ver-', 'leer', 'descargar', 'stats', 'reporte', 'dashboard', 'resumen')
DESTR = ('delete', 'eliminar', 'borrar', 'anular', 'reset', 'purge', 'limpiar', 'clear', 'restore',
         'remove', 'quitar', 'cancelar', 'revertir', 'desvincular', 'drop', 'cerrar')
# Correcciones manuales a la heurística por nombre (verificadas leyendo el handler).
FIX = {'verificar-acreditacion-pos': 'E', 'calcular-aguinaldos-anio': 'E', 'puede-ajustar-caja': 'L'}
NOTA = {'get-qr-mesas': 'crea config por defecto si falta', 'get-facturacion-config': 'crea config por defecto si falta',
        'getPdvConfig': 'crea config por defecto si falta'}


def match_paren(s, i):
    d, j, q = 0, i, None
    while j < len(s):
        c = s[j]
        if q:
            if c == '\\':
                j += 2; continue
            if c == q: q = None
        elif c in '\'"`': q = c
        elif c in '([{': d += 1
        elif c in ')]}':
            d -= 1
            if d == 0: return j
        j += 1
    return -1


def split_top(s):
    out, d, cur = [], 0, ''
    for c in s:
        if c in '([{<': d += 1
        elif c in ')]}>': d -= 1
        if c == ',' and d == 0:
            out.append(cur); cur = ''
        else:
            cur += c
    if cur.strip(): out.append(cur)
    return [x.strip() for x in out]


def param_corto(p):
    p = re.sub(r'\s+', ' ', p)
    p = re.sub(r'\s*=\s*.*$', '', p)
    name = re.split(r'\s*[:?]', p, 1)[0].strip()
    opt = '?' if re.match(r'^[\w$]+\?', p) or '=' in p else ''
    if name.startswith('{'): name = 'obj'
    return name + opt


def extraer():
    rr = open(ROOT + '/electron/server/rpc-router.ts').read()
    blk = set(re.findall(r"^\s*'([^']+)',", rr.split('new Set<string>([')[1].split(']);')[0], re.M))
    res = []
    for f in FILES:
        src = open(f).read()
        ms = list(HANDLE.finditer(src))
        for i, m in enumerate(ms):
            ch = m.group(2)
            body = src[m.start(): ms[i + 1].start() if i + 1 < len(ms) else len(src)]
            k = m.end()
            mm = re.match(r"\s*(async\s+)?(function\s*\w*\s*)?\(", src[k:k + 400])
            params = []
            if mm:
                st = k + mm.end() - 1
                en = match_paren(src, st)
                raw = re.sub(r'//[^\n]*', '', re.sub(r'/\*.*?\*/', '', src[st + 1:en], flags=re.S))
                params = [param_corto(p) for p in split_top(raw)[1:]]
            perms = sorted(set(re.findall(r"ensure\w*Permission\w*\([^)]*?'([A-Z_]+)'", body)))
            low = ch.split(':')[-1]
            if ch in blk or ch.startswith('window:'): t = 'B'
            elif ch in FIX: t = FIX[ch]
            elif any(low.startswith(x) or ('-' + x) in low[:12] for x in DESTR): t = 'D'
            elif any(low.startswith(x) for x in READ): t = 'L'
            else: t = 'E'
            mod = os.path.basename(f).replace('.handler.ts', '').replace('.handlers.ts', '').replace('.ts', '')
            res.append(dict(canal=ch, mod=mod, params=params, perms=perms, t=t))
    return res


def render(res):
    tot = collections.Counter(x['t'] for x in res)
    grupos = collections.OrderedDict()
    for x in res: grupos.setdefault(x['mod'], []).append(x)
    L = ['# Catálogo de métodos RPC (generado)', '',
         '> **No editar a mano.** Lo genera `python3 scripts/generate-api-catalog.py` desde `electron/handlers/*.ts`',
         '> y `electron/server/rpc-router.ts`. Cómo llamar a la API: [README.md](README.md).', '',
         f"Total: **{len(res)} métodos** en {len(grupos)} módulos — {tot['L']} lectura (L), {tot['E']} escritura (E), "
         f"{tot['D']} destructivos (D), {tot['B']} bloqueados por HTTP (B).", '',
         'Formato: `TIPO método(param1, param2?)` 🔒 permisos que exige (si exige alguno basta tener uno).',
         'Los parámetros van **en ese orden** en `params` (array posicional). `?` = opcional. `obj` = objeto desestructurado.',
         'La clasificación L/E/D es por el nombre del método (heurística, con correcciones manuales): ante la duda, leer el handler.', '',
         '## Módulos', '']
    L.append(' · '.join(f"[{m}](#{m.lower()}) ({len(xs)})" for m, xs in grupos.items()))
    for m, xs in grupos.items():
        c = collections.Counter(x['t'] for x in xs)
        L += ['', f"## {m}", '', f"`electron/handlers/{m}*.ts` — {len(xs)} métodos: {c['L']}L {c['E']}E {c['D']}D {c['B']}B", '']
        for x in xs:
            s = f"- {x['t']} `{x['canal']}`({', '.join(x['params'])})"
            if x['perms']: s += ' 🔒 ' + ', '.join(x['perms'])
            if x['canal'] in NOTA: s += f" — {NOTA[x['canal']]}"
            L.append(s)
    return '\n'.join(L) + '\n'


if __name__ == '__main__':
    out = render(extraer())
    if '--check' in sys.argv:
        cur = open(OUT).read() if os.path.exists(OUT) else ''
        if cur != out:
            print('docs/api/CATALOGO-RPC.md desactualizado: correr python3 scripts/generate-api-catalog.py'); sys.exit(1)
        print('catálogo al día'); sys.exit(0)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w').write(out)
    print('escrito', OUT)
