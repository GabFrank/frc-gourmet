#!/usr/bin/env python3
"""
Genera src/app/database/repository-http.service.ts: skeleton con 668 stubs
que tiran NotImplementedError. Cada stub tiene la misma firma que el metodo
abstract de RepositoryService — F4 los reemplazara por impl real con HTTP.

Para retornos Observable<T>, devuelve `throwError()` (rxjs). Para retornos
sincrónicos (number, void, etc.), tira excepción directa.

Uso:
    python3 scripts/generate-repository-http-skeleton.py
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src/app/database/repository-ipc.service.ts'  # source de firmas (parsea las publicas)
ABSTRACT = ROOT / 'src/app/database/repository.service.ts'  # para sacar imports
OUT = ROOT / 'src/app/database/repository-http.service.ts'


def parse_methods(class_body: str):
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


def stub_body(name: str, ret: str) -> str:
    msg = f'`RepositoryHttpService.{name}() no esta implementado todavia. F4 (modo cliente) traera la impl HTTP real.`'
    if ret.startswith('Observable'):
        return f'    return throwError(() => new Error({msg})) as any;'
    if ret == 'void':
        return f'    throw new Error({msg});'
    # default: throw (covers number, undefined, primitive types, etc.)
    return f'    throw new Error({msg});'


def main():
    # Source for method signatures: the IPC impl
    src = SRC.read_text()
    class_match = re.search(r'export class RepositoryIpcService\b[^{]*\{', src)
    if not class_match:
        print('ERROR: no se encontro export class RepositoryIpcService en', SRC, file=sys.stderr)
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

    methods = parse_methods(class_body)
    fixed = [(n, strip_defaults(p), r) for n, p, r in methods]

    # Re-use imports of the abstract (already curated)
    abstract_src = ABSTRACT.read_text()
    imports_pat = re.compile(r"^import\s+.*?from\s+['\"][^'\"]+['\"]\s*;", re.MULTILINE | re.DOTALL)
    imports = imports_pat.findall(abstract_src)

    header = "import { Injectable } from '@angular/core';\n"
    header += "import { Observable, throwError } from 'rxjs';\n"
    header += "import { RepositoryService, LoginResult } from './repository.service';\n"
    # Plus all entity imports from abstract
    for imp in imports:
        if 'rxjs' in imp:
            continue
        if 'repository.service' in imp:
            continue
        if "'./repository.service'" in imp:
            continue
        header += imp + '\n'

    header += '''
/**
 * Skeleton de la implementación HTTP del repositorio. F4 (modo cliente) la
 * llenará: cada metodo hara `POST /api/rpc { method, params }` contra el
 * server. Por ahora cada stub tira `Error('not implemented')`.
 *
 * Auto-generada con `scripts/generate-repository-http-skeleton.py`.
 *
 * Cuando F4 reemplace los stubs, este archivo deja de ser auto-generado y
 * pasa a ser editado a mano (o reemplazado por una capa generica que
 * mappee todos los metodos a `dbRpc(method, params)` en una sola linea).
 */
@Injectable({
  providedIn: 'root'
})
export class RepositoryHttpService extends RepositoryService {
  constructor() {
    super();
  }

'''

    body_lines = []
    for n, p, r in fixed:
        body_lines.append(f'  {n}({p}): {r} {{')
        body_lines.append(stub_body(n, r))
        body_lines.append('  }')

    out = header + '\n'.join(body_lines) + '\n}\n'
    OUT.write_text(out)
    print(f'Wrote {len(fixed)} stubs to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
