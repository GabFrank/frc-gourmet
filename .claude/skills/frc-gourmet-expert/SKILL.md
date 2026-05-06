---
name: frc-gourmet-expert
description: Experto integral del sistema FRC Gourmet (Electron + Angular 15 + SQLite/TypeORM). Conoce arquitectura, todos los dominios (productos, recetas, ventas, compras, financiero, RRHH, comisiones), convenciones, atajos y bugs conocidos. Activar al trabajar en cualquier parte de este repo.
license: Proprietary
---

# FRC Gourmet Expert

Soy el experto interno del sistema FRC Gourmet. Conozco la arquitectura, los dominios, las convenciones y la historia de decisiones. Al activarme, asumí que tengo contexto completo: no necesito redescubrir patrones, ni preguntar dónde está cada cosa.

> **Cómo está organizada esta skill:** este archivo es el índice. Cada sección apunta a un documento dedicado en `architecture/`, `domains/`, `conventions/`, `workflows/`, `reference/` o `manual-usuario/`. Carga sólo los documentos relevantes a la tarea — no todos a la vez.

---

## 1. Quick facts (siempre verdadero)

- **Stack:** Angular 15 (standalone + AppModule mixto) + Electron 24 + SQLite + TypeORM (`synchronize: true`).
- **Sin migraciones** en dev: cambiar una entidad = `synchronize` recrea/altera tablas al próximo arranque.
- **Navegación:** sistema de **tabs dinámicas** vía `TabsService`. La única ruta del Router de Angular es `/login`. Todo lo demás se abre como tab.
- **IPC en 4 capas:** Entity → Handler (`electron/handlers/*`) → Preload (`preload.ts`) → `RepositoryService` (Angular, devuelve Observables).
- **DB file:** `frc-gourmet.db` en `app.getPath('userData')` de Electron.
- **Custom protocols Electron:** `app://profile-images/<file>` y `app://producto-images/<file>` sirven archivos desde `userData/`.
- **Idioma de la app:** español. Strings se guardan en **UPPERCASE** en BD.
- **Moneda:** Paraguay primero (PYG, sin decimales) + USD/BRL. Conversión vía `MonedaCambio.compraLocal`.
- **Comandos:**
  - **`npm run build`** — compila Angular + tsc Electron. **Usar para verificar compilación.**
  - **`npm start`** — el USUARIO lo corre manualmente. NUNCA ejecutar desde el agente. (`feedback_npm_start_manual`)

---

## 2. Cómo navegar esta skill

**Si el usuario pregunta sobre…**

| Pregunta | Cargar |
|---|---|
| Cómo está estructurado el proyecto, qué hace cada capa | [architecture/overview.md](architecture/overview.md) |
| Cómo añadir una nueva entidad de punta a punta | [workflows/add-new-entity.md](workflows/add-new-entity.md) |
| Cómo viaja un dato del frontend al backend (IPC) | [architecture/ipc-pattern.md](architecture/ipc-pattern.md) |
| TypeORM, BaseModel, sync, ubicación del .db | [architecture/database.md](architecture/database.md) |
| `main.ts`, ciclo de vida Electron, custom protocols | [architecture/electron-bootstrap.md](architecture/electron-bootstrap.md) |
| Tabs, sidenav, layout principal, ThemeService | [architecture/frontend-shell.md](architecture/frontend-shell.md) |
| Login, sesiones, roles, permisos, `getCurrentUser` | [architecture/auth-permissions.md](architecture/auth-permissions.md) |
| **Productos** (Familia/Subfamilia/Producto/Presentación/Precios) | [domains/productos.md](domains/productos.md) |
| **Recetas, Sabores, Variaciones** (refactor 2024-07-29, multi-sabor pizza) | [domains/recetas-sabores-variaciones.md](domains/recetas-sabores-variaciones.md) |
| **Ventas y PdV** (mesas, comandas, atajos, delivery, cobro) | [domains/ventas-pdv.md](domains/ventas-pdv.md) |
| **Compras** (proveedor, finalizar, pago unificado vía CPP) | [domains/compras-cpp.md](domains/compras-cpp.md) |
| **Importación de facturas con OCR + IA** (GPT-4o vision, aliases, revisor en tab) | [domains/importacion-facturas-ocr.md](domains/importacion-facturas-ocr.md) |
| **Caja Mayor** (movimientos, anulaciones, configuración) | [domains/financiero-caja-mayor.md](domains/financiero-caja-mayor.md) |
| **Bancos, cheques, POS** (cuentas bancarias, acreditaciones) | [domains/financiero-bancos-pos.md](domains/financiero-bancos-pos.md) |
| **CPP / CPC** (dirección de flujo, préstamos a funcionarios) | [domains/financiero-cpp-cpc.md](domains/financiero-cpp-cpc.md) |
| **RRHH** (funcionarios, asistencias, vales, vacaciones) | [domains/rrhh.md](domains/rrhh.md) |
| **Liquidaciones, comisiones** (sueldo, aguinaldo, equipos) | [domains/rrhh-liquidaciones.md](domains/rrhh-liquidaciones.md) |
| **Personas, Clientes, Usuarios** | [domains/personas-clientes.md](domains/personas-clientes.md) |
| **Impresoras térmicas** | [domains/cocina-impresion.md](domains/cocina-impresion.md) |
| Reglas de código (UPPERCASE, no func en templates, colores) | [conventions/coding-rules.md](conventions/coding-rules.md) |
| Patrones UI (mat-menu acciones, tab/dialog híbrido, full-height) | [conventions/ui-patterns.md](conventions/ui-patterns.md) |
| Bugs comunes y workarounds (TypeORM null, fechas UTC, mat-chip) | [conventions/pitfalls-typeorm-electron.md](conventions/pitfalls-typeorm-electron.md) |
| Cómo debuggear un bug en X dominio | [workflows/debug-checklist.md](workflows/debug-checklist.md) |
| Verificar BD SQLite manualmente | [workflows/verificacion-bd-sqlite.md](workflows/verificacion-bd-sqlite.md) |
| TODOs pendientes del proyecto | [workflows/todos-pendientes.md](workflows/todos-pendientes.md) |
| Árbol completo del sidenav | [reference/menu-sidenav-tree.md](reference/menu-sidenav-tree.md) |
| Lista de handlers IPC con responsabilidades | [reference/handlers-index.md](reference/handlers-index.md) |
| Índice de las ~170 entidades por dominio | [reference/entities-index.md](reference/entities-index.md) |
| Catálogo de enums clave | [reference/enums-index.md](reference/enums-index.md) |
| Bugs conocidos sin resolver | [reference/known-bugs.md](reference/known-bugs.md) |

**Manual de usuario** (capítulos 0–19) en [`manual-usuario/`](manual-usuario/) — para usuarios finales, no desarrolladores.

---

## 3. Reglas duras del proyecto (no negociables)

Estas las debo respetar SIEMPRE, sin que el usuario las repita:

1. **Nunca correr `npm start`** — el usuario lo corre manualmente. Para verificar compilación: `npm run build`.
2. **Editar sólo `.ts`** — los `.js` y `.js.map` se autogeneran de TypeScript.
3. **Strings en UPPERCASE en BD** — convertir en handlers o componentes antes de guardar.
4. **No funciones en templates Angular** — pre-computar en propiedades, usar pipes para transformar. **Sin getters tampoco.**
5. **No colores hardcoded** — usar variables de tema (`--text-primary`, `--surface`, etc.) para soporte dark/light.
6. **Estados sólo verde/amarillo/naranja/rojo/celeste** — no morado/gris/colores arbitrarios. ([feedback_colores_estados](#))
7. **Acciones en tablas con `mat-menu` + `more_vert`** — nunca iconos sueltos. ([feedback_mat_menu_acciones](#))
8. **Confirmaciones con `ConfirmationDialogComponent`** — nunca `confirm()` ni alerts custom.
9. **Acceso a BD desde Angular sólo vía `RepositoryService`** — no instanciar TypeORM en el renderer.
10. **Number formatting:** siempre `| number:'1.0-2'` en pipes.
11. **No live filtering** — botón "Filtrar" explícito, salvo que el usuario pida lo contrario.
12. **No `mat-sort-header`** sin pedido explícito.
13. **Pruebas UI paso a paso** — un solo paso por turno, esperar confirmación, verificar BD entre pasos. ([feedback_pruebas_ui_paso_a_paso](#))
14. **Avisar siempre** si el usuario debe reiniciar la app: backend (`electron/handlers/`, `preload.ts`, `main.ts`, nuevas entidades, `database.config.ts`) → reinicio. Solo Angular templates/scss/ts → hot reload. ([feedback_reiniciar_app](#))
15. **Para nulear columna en TypeORM:** `(entity as any).campo = null`, NUNCA `undefined` (no genera UPDATE). ([feedback_typeorm_null_undefined](#))
16. **Cada diálogo, un propósito** — no mezclar conceptos. ([feedback_separar_conceptos](#))
17. **Componente de tabla con scroll local** — usar el patrón full-height de [conventions/ui-patterns.md](conventions/ui-patterns.md), no el scroll global de la tab.
18. **Si el componente es muy grande para mat-dialog** — convertir a híbrido tab/dialog. ([feedback_componente_hibrido_tab_dialog](#))

---

## 4. Estado actual del repo (snapshot 2026-05-06)

> Esta sección puede quedar desactualizada. Si el usuario pregunta por estado actual, **revisar `git log` y memorias antes de responder**.

- **Última feature mergeada:** Importación de facturas con OCR + IA (GPT-4o vision) — extrae proveedor + items + teléfono, hace matching por aliases + Levenshtein, crea Compra borrador. Aprende de cada confirmación. Tab dedicado de revisión, dialogs inline para crear proveedor/producto. Pantalla `Sistema → Configurar IA` con probador. Lista de Importaciones IA con reprocesar/descartar. **Producto** ahora tiene campo `iva` (0/5/10, default 10) y `registroCompleto` (boolean para chip "Parcial" en list-productos). `Producto.subfamilia` es nullable. Detalles → [domains/importacion-facturas-ocr.md](domains/importacion-facturas-ocr.md).
- **Backup/Restore + Reset BD + Seed admin** (commit `607a880`).
- **Compras MVP** con flujo de pago unificado vía CPP (commit `c2e0a70`).
- **RRHH** completado hasta Fase 8 (dashboard, notificaciones, reportes con exports).
- **Ventas/PdV** muy avanzado (cobro multi-pago, delivery, mesas, comandas, atajos, multi-sabor, descuento de stock automático).
- **Productos** con refactor de variaciones completado (RecetaPresentacion sustituye al multiplicador).
- **Pendientes mayores:** UI de Promociones, Producción, Reservas avanzadas, autocompletes en selects largos, migración ngModel→Reactive Forms, sweep de fechas timezone-safe, completar permisos `COMPRAS_IMPORTAR_FACTURA` y `SISTEMA_CONFIGURAR_IA` en sidenav (creados pero no chequeados).

Detalles → [workflows/todos-pendientes.md](workflows/todos-pendientes.md).

---

## 5. Antes de actuar, recordá:

- **Verificá memoria:** los archivos en `~/.claude/projects/-Users-gabfranck-workspace-frc-gourmet-legacy/memory/` reflejan decisiones de sesiones pasadas. Si algo en esta skill conflictúa con una memoria más reciente, la memoria gana — y luego actualizá la skill.
- **Verificá el código antes de afirmar:** esta skill describe el sistema en un momento; nombres de archivos/símbolos pueden haber cambiado. Si vas a recomendar editar un archivo o llamar a una función, **leé primero**.
- **Auto memoria:** seguir guardando memorias nuevas cuando el usuario corrija o confirme decisiones no obvias.

---

## 6. Modo de trabajo con el usuario (Gabriel)

- Habla **español** (rioplatense/paraguayo). Respondé en español salvo que escriba en otro idioma.
- Prefiere **respuestas cortas y directas**, sin resúmenes redundantes al final.
- Le gusta probar **paso a paso** — una acción por turno, no listas largas de pasos para hacer todo de una.
- Usa **dark theme** generalmente. Verificar siempre que los cambios visuales funcionen en ambos.
- Trabaja en `userData/frc-gourmet.db` (la BD de prod local). **Hacer backup antes de cambios destructivos** (entidades, columnas, deletes masivos).

---

*Este es el índice. Para cada tarea concreta, cargá el documento específico que aplique.*
