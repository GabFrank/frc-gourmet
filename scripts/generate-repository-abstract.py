#!/usr/bin/env python3
"""
Genera src/app/database/repository.service.abstract.ts a partir de las firmas
publicas de RepositoryService en src/app/database/repository.service.ts.

F2 (cliente/servidor): la abstract class permite hacer DI swap entre
RepositoryIpcService (Electron IPC, default) y RepositoryHttpService (HTTP API,
modo cliente). Cada vez que se agrega un metodo a la implementacion, hay
que regenerar la abstract para que el TypeScript siga forzando que ambas
implementaciones esten sincronizadas.

Uso:
    python3 scripts/generate-repository-abstract.py

El script:
  1. Parsea la clase RepositoryService (cuenta parens/braces/angles para
     identificar correctamente firmas con tipos complejos).
  2. Strippea valores default de parametros (no permitidos en abstract decls)
     y los marca como opcionales (`name?: T`). Para defaults sin tipo
     anotado infiere el tipo del literal.
  3. Reusa los imports del archivo original para que los tipos resuelvan.
  4. Conserva la interface LoginResult que vive en el mismo archivo.
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src/app/database/repository.service.ts'
OUT = ROOT / 'src/app/database/repository.service.abstract.ts'


def parse_methods(class_body: str):
    """Return list of (name, params_str, return_type_str) for each public method."""
    methods = []
    pos = 0
    pretext = '\n' + class_body
    method_re = re.compile(
        r'(?<=\n)  (?!private\s|protected\s|constructor\b|//|\*|/\*)'
        r'([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\('
    )
    while True:
        m = method_re.search(pretext, pos + 1)
        if not m:
            break
        name = m.group(1)
        i = m.end()
        paren = 1
        while i < len(pretext) and paren > 0:
            c = pretext[i]
            if c == '(':
                paren += 1
            elif c == ')':
                paren -= 1
            i += 1
        params = pretext[m.end():i - 1]
        while i < len(pretext) and pretext[i] in ' \n\t':
            i += 1
        if i >= len(pretext) or pretext[i] != ':':
            pos = m.end()
            continue
        i += 1
        ret_start = i
        angle = pp = bb = 0
        while i < len(pretext):
            c = pretext[i]
            if c == '<':
                angle += 1
            elif c == '>':
                if angle > 0:
                    angle -= 1
            elif c == '(':
                pp += 1
            elif c == ')':
                pp -= 1
            elif c == '{':
                if angle == 0 and pp == 0:
                    break
                bb += 1
            elif c == '}':
                if bb > 0:
                    bb -= 1
            i += 1
        ret = pretext[ret_start:i].strip()
        methods.append((name, params.strip(), ret))
        pos = i
    return methods


def infer_type(default_val: str) -> str:
    v = default_val.strip()
    if re.match(r'^-?\d+(\.\d+)?$', v):
        return 'number'
    if v in ('true', 'false'):
        return 'boolean'
    if v.startswith("'") or v.startswith('"') or v.startswith('`'):
        return 'string'
    if v.startswith('['):
        return 'any[]'
    return 'any'


def strip_defaults(params: str) -> str:
    """Convert `x: T = default` → `x?: T`, `x = default` → `x?: <inferred>`."""
    if not params.strip():
        return params
    parts = []
    cur = ''
    pp = bb = aa = 0
    for c in params:
        if c == '(':
            pp += 1
        elif c == ')':
            pp -= 1
        elif c == '{':
            bb += 1
        elif c == '}':
            bb -= 1
        elif c == '<':
            aa += 1
        elif c == '>':
            if aa > 0:
                aa -= 1
        if c == ',' and pp == 0 and bb == 0 and aa == 0:
            parts.append(cur)
            cur = ''
        else:
            cur += c
    if cur.strip():
        parts.append(cur)
    out = []
    for p in parts:
        m1 = re.match(
            r'^(\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\??)\s*:\s*(.+?)\s*=\s*.+$',
            p, re.DOTALL,
        )
        m2 = re.match(
            r'^(\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\??)\s*=\s*(.+)$',
            p, re.DOTALL,
        )
        if m1:
            ws, name, _, typ = m1.groups()
            out.append(f'{ws}{name}?: {typ.strip()}')
        elif m2:
            ws, name, _, dv = m2.groups()
            out.append(f'{ws}{name}?: {infer_type(dv)}')
        else:
            out.append(p)
    return ','.join(out)


def main():
    src = SRC.read_text()
    class_match = re.search(r'export class RepositoryService\b[^{]*\{', src)
    if not class_match:
        print('ERROR: no se encontro export class RepositoryService', file=sys.stderr)
        sys.exit(1)
    class_start = class_match.end()
    depth = 1
    i = class_start
    while i < len(src) and depth > 0:
        if src[i] == '{':
            depth += 1
        elif src[i] == '}':
            depth -= 1
        i += 1
    class_body = src[class_start:i - 1]

    login_result_match = re.search(r'export interface LoginResult\s*\{[^}]*\}', src)
    login_result_def = login_result_match.group(0) if login_result_match else ''

    methods = parse_methods(class_body)
    fixed = [(n, strip_defaults(p), r) for n, p, r in methods]

    imports_pat = re.compile(r"^import\s+.*?from\s+['\"][^'\"]+['\"]\s*;", re.MULTILINE | re.DOTALL)
    imports = imports_pat.findall(src)
    keep_imports = [imp for imp in imports if "@angular/core" not in imp and "rxjs" not in imp]

    header = "import { Observable } from 'rxjs';\n\n" + '\n'.join(keep_imports) + '\n\n'
    if login_result_def:
        header += login_result_def + '\n\n'
    header += (
        '/**\n'
        ' * Abstracción del repositorio de datos.\n'
        ' *\n'
        ' * F2 (cliente/servidor): permite swap entre `RepositoryIpcService` (modo\n'
        ' * standalone/server, usa Electron IPC) y `RepositoryHttpService` (modo\n'
        ' * cliente, llama HTTP al server). Componentes inyectan `RepositoryService`\n'
        ' * (esta abstract class actúa como token DI) y la factory en `app.module.ts`\n'
        ' * decide la impl en runtime según `app-settings.mode`.\n'
        ' *\n'
        ' * Auto-generada con `scripts/generate-repository-abstract.py` desde la\n'
        ' * implementación actual. Si agregás un método a la impl (RepositoryIpcService),\n'
        ' * regenerá este archivo.\n'
        ' */\n'
        'export abstract class RepositoryService {\n'
    )

    body = '\n'.join(f'  abstract {n}({p}): {r};' for n, p, r in fixed)
    OUT.write_text(header + body + '\n}\n')
    print(f'Wrote {len(fixed)} abstract methods to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
