# Dominio: Buscador Global (Command Palette)

Buscador tipo *command palette* (estilo Cloudflare/Linear/VS Code). Ícono de
lupa en el toolbar (a la izquierda del botón de perfil) + atajo **Ctrl+Espacio**.
Abre un diálogo con input y resultados **agrupados por sección**.

> Doc de proyecto (más orientado a usuario/dev): `docs/BUSCADOR-GLOBAL.md`.

## Secciones y origen

| Sección | Origen | Permiso |
|---|---|---|
| Menús y submenús | Cliente — árbol de menú | el `permiso` de la hoja |
| Productos | Backend `buscar-global` | `PRODUCTOS_VER` |
| Clientes | Backend `buscar-global` | `CLIENTES_VER` |
| Funcionarios | Backend `buscar-global` | `RRHH_FUNCIONARIO_VER` |
| Proveedores | Backend `buscar-global` | `PROVEEDORES_VER` |
| Configuraciones | Cliente — árbol (`esConfig=true`) | el `permiso` de la hoja |

Una persona aparece en **cada** sección que le aplique (clienta Y funcionaria, etc.).

## Piezas

- **Árbol de menú (fuente única):** `src/app/services/menu-tree.ts` → `MENU_TREE: MenuNode[]`.
  Un solo árbol que alimenta **el sidenav Y el buscador**. Ramas (`children`, hasta 3
  niveles) y hojas (`action`). Cada hoja marca `enSidenav`/`enBuscador`. `MenuService`
  (`src/app/services/menu.service.ts`) resuelve el árbol filtrado por permisos:
  `getSidenavTree()` para el menú lateral, `getBuscables()` (aplanado) para el buscador.
  El sidenav se renderiza con el componente recursivo
  `src/app/shared/components/sidenav-menu/`.
- **Handler backend:** `electron/handlers/busqueda-global.handler.ts` → canal `buscar-global`.
  Una sola llamada, query acotada por sección (`LIMIT 8`), gating de permisos server-side
  con `getUserPermissionCodes`, ranking prefijo>contiene, búsqueda en UPPERCASE.
- **Capas IPC:** `preload.ts` (`buscarGlobal`) + `RepositoryService.buscarGlobal` (abstract/ipc/http).
- **UI:** `src/app/shared/components/buscador-global-dialog/`. Diálogo standalone,
  navegación por teclado (↑↓/Enter/Esc), debounce 280 ms, mínimo 2 caracteres.
  Menús → `TabsService.openTab`. Entidades → abren el listado de la sección con
  `data: { source:'buscador', focusId, buscarTermino }`.
- **Toolbar + atajo:** `app.component.ts` (`abrirBuscador()` + HostListener `Ctrl+Espacio`)
  y el botón lupa en `app.component.html`.

## ⚠️ Regla dura (SKILL.md #22)

Toda pantalla navegable nueva DEBE tener su hoja en `MENU_TREE`, o no aparecerá ni en
el sidenav ni en el buscador. Elegí `enSidenav`/`enBuscador` según dónde deba verse.
Ver el checklist en `workflows/add-new-entity.md`.

## Extensiones futuras (v2)

- Secciones de Ventas/Compras por número, Cajas.
- Resultado de entidad → abrir el **detalle** del registro (hoy abre el listado).
- Reutilizar `buscar-global` desde la PWA mobile (mismo `/api/rpc`).
