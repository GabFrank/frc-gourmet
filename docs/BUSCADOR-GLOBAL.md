# Buscador Global (Command Palette)

Buscador tipo *command palette* accesible desde el ícono de lupa en el toolbar
(a la izquierda del botón de perfil) o con el atajo **Ctrl+Espacio**. Abre un
diálogo con un input y resultados **agrupados por sección**.

## Secciones

| Sección | Origen | Permiso |
|---|---|---|
| **Menús y submenús** | Cliente (registro de menús) | el `permiso` de cada entrada |
| **Productos** | Backend `buscar-global` | `PRODUCTOS_VER` |
| **Clientes** | Backend `buscar-global` | `CLIENTES_VER` |
| **Funcionarios** | Backend `buscar-global` | `RRHH_FUNCIONARIO_VER` |
| **Proveedores** | Backend `buscar-global` | `PROVEEDORES_VER` |
| **Configuraciones** | Cliente (registro de menús, `esConfig=true`) | el `permiso` de cada entrada |

Una misma persona aparece en **todas** las secciones que le apliquen: si
"Camila" es clienta y funcionaria, sale en Clientes **y** en Funcionarios; si
además hay un producto con "camila", sale en Productos.

## Arquitectura

Dos dominios de búsqueda independientes:

1. **Menús y Configuraciones — 100% en el cliente.** Se filtran desde el
   **árbol de menú** `src/app/services/menu-tree.ts` (`MENU_TREE`) — la **fuente
   única** que comparten el sidenav y el buscador. `MenuService.getBuscables()`
   aplana las hojas indexables (`enBuscador !== false`) y el buscador filtra por
   permiso con `PermissionService.has(permiso)`. Latencia cero. Al elegir una
   entrada se abre su tab (`TabsService.openTab`) o, si es un **diálogo-destino**
   (`action.mode: 'dialog'`), se abre con `MatDialog`.

   Cada hoja del árbol declara con booleanos dónde aparece: `enSidenav` (menú
   lateral) y `enBuscador` (buscador). Así hay pantallas que solo viven en el
   buscador (ej. acciones *Crear producto* / *Crear receta*, con
   `enSidenav: false`) y otras en ambos. Los diálogos **contextuales**
   (edit/create/confirm/selector/detalle/…) NO se incluyen.

2. **Entidades — un solo handler backend.** `buscar-global(termino)`
   (`electron/handlers/busqueda-global.handler.ts`) corre en **una sola
   llamada** una query acotada por sección (`LIMIT 8`), con **gating de
   permisos server-side** (cada sección solo se consulta si el usuario tiene su
   permiso — `/api/rpc` es default-allow, así que el guard va en el handler).
   - Búsqueda en **UPPERCASE** (los datos ya lo están); el término se normaliza
     (mayúsculas, sin acentos) en el cliente y en mayúsculas en el backend.
   - **Ranking:** coincidencia por prefijo primero, luego alfabético.
   - Campos: personas `nombre + apellido + documento`; productos `nombre`;
     proveedores `nombre + razón social + ruc`; funcionarios + `código interno`.

### Capas IPC

`buscar-global` (handler) → `preload.ts` (`buscarGlobal`) →
`RepositoryService.buscarGlobal(termino)` (abstract/ipc/http). En modo cliente,
el ruteo a HTTP lo hace el preload (`invokeRouter`).

## UI

`src/app/shared/components/buscador-global-dialog/` — diálogo standalone con
input auto-focus, resultados agrupados, navegación por teclado (**↑ ↓** mover,
**Enter** abrir, **Esc** cerrar), debounce 280 ms y mínimo 2 caracteres.

## ⚠️ Regla: todo menú nuevo debe ser encontrable

**Cada vez que se agrega una pantalla navegable nueva** — un menú del sidenav, o
una sub-pantalla que se abre con `openTab(...)` desde otro componente, o un
diálogo-destino — se **debe** agregar su hoja en el árbol único `MENU_TREE`
(`src/app/services/menu-tree.ts`). Al hacerlo queda disponible en el **sidenav
y el buscador a la vez**. Una hoja lleva:

```ts
{
  id, label, icon, keywords: ['sinónimos','en','español'],
  permiso,             // el mismo *appHasPermission del item
  esConfig,            // true → sección "Configuraciones" del buscador
  enSidenav,           // default true; false = solo buscador (ej. "Crear …")
  enBuscador,          // default true; false = solo sidenav
  action: { component, title, tabId, data },  // EXACTOS del openTab(...)
}
```

Para un **diálogo-destino** el `action` lleva `mode: 'dialog'`, `component` (el
del diálogo) y `dialogConfig`. No registrar diálogos contextuales
(edit/create/confirm/selector/detalle/…).

Si la pantalla nueva no se registra, funcionará normal pero **no aparecerá** en
el buscador. Esto es parte del checklist de "agregar una pantalla nueva".

## Extensiones futuras (v2)

- Buscar **Ventas/Compras por número**, **Cajas**.
- Al elegir un resultado de entidad, abrir el **detalle** del registro (hoy abre
  el listado de la sección con `focusId`/`buscarTermino` en el `data`).
- Reutilizar el handler `buscar-global` desde la PWA mobile.
