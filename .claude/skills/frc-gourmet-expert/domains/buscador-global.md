# Dominio: Buscador Global (Command Palette)

Buscador tipo *command palette* (estilo Cloudflare/Linear/VS Code). Ícono de
lupa en el toolbar (a la izquierda del botón de perfil) + atajo **Ctrl+Espacio**.
Abre un diálogo con input y resultados **agrupados por sección**.

> Doc de proyecto (más orientado a usuario/dev): `docs/BUSCADOR-GLOBAL.md`.

## Secciones y origen

| Sección | Origen | Permiso |
|---|---|---|
| Menús y submenús | Cliente — registro de menús | el `permiso` de la entrada |
| Productos | Backend `buscar-global` | `PRODUCTOS_VER` |
| Clientes | Backend `buscar-global` | `CLIENTES_VER` |
| Funcionarios | Backend `buscar-global` | `RRHH_FUNCIONARIO_VER` |
| Proveedores | Backend `buscar-global` | `PROVEEDORES_VER` |
| Configuraciones | Cliente — registro (`esConfig=true`) | el `permiso` de la entrada |

Una persona aparece en **cada** sección que le aplique (clienta Y funcionaria, etc.).

## Piezas

- **Registro de menús:** `src/app/services/menu-registry.ts` → `MENU_ENTRIES: MenuEntry[]`.
  Fuente de verdad de los ítems del sidenav para el buscador (metadata + cómo abrir el tab).
  El sidenav en sí sigue en `app.component.html` (no se refactorizó); el registro es paralelo.
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

Todo menú nuevo del sidenav DEBE agregarse a `MENU_ENTRIES`, o no será encontrable
por el buscador. Ver el checklist en `workflows/add-new-entity.md`.

## Extensiones futuras (v2)

- Secciones de Ventas/Compras por número, Cajas.
- Resultado de entidad → abrir el **detalle** del registro (hoy abre el listado).
- Reutilizar `buscar-global` desde la PWA mobile (mismo `/api/rpc`).
