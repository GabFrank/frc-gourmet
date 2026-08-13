# Definición de terminado (DoD) y registro de trabajo

> **Regla marco del proyecto.** Ningún feature o bug se considera terminado hasta cumplir este checklist. Aplica a mí (el agente) en cada tarea de implementación, sin que el usuario lo repita. La **skill es la fuente de verdad** del estado del proyecto; mantenerla al día es parte del trabajo, no un extra opcional.

## 1. Dónde se registra cada cosa (SSOT)

| Qué | Dónde | Notas |
|---|---|---|
| **Feature / mejora pendiente** (backlog) | [todos-pendientes.md](todos-pendientes.md) | Fuente de verdad del backlog. Con prioridad P0–P5 al final. |
| **Bug / defecto** | [../reference/known-bugs.md](../reference/known-bugs.md) | Síntoma + causa + ubicación + estado. |
| **Decisión no obvia / gotcha aprendido** | memoria + la sección correspondiente de la skill | Ej. "los handlers no quedan como listeners de ipcMain". |
| **Trabajo hecho** (registro histórico) | **conventional commit + PR** | El commit etiqueta (`feat`/`fix`/…), el PR describe el qué y el porqué. No hace falta issue para esto. |
| **Estado general del repo** | [SKILL.md](../SKILL.md) §4 | Snapshot; reauditar contra `git log` cuando quede viejo. |

### GitHub issues — política selectiva (NO uno por cada cambio)

Crear un issue en GitHub **solo** cuando aporta algo que el commit/PR y el backlog de la skill no dan:
- **Reporte externo** (alguien que no es el dev reporta un bug o pide un feature).
- **Algo que NO se hace ahora** y querés trazarlo formalmente fuera del `todos-pendientes.md` (ej. compromiso con un tercero).
- **Discusión / decisión** que necesita un hilo, o trabajo que **abarca varios PRs**.

Para el flujo normal (implementás algo en la sesión y lo mergeás), el **conventional commit + PR a `develop` es el registro suficiente**. No abrir issues ceremoniales.

## 2. Checklist de "terminado" para CUALQUIER feature o fix

**Antes de codear**
1. **Leer el código real** del área afectada (no confiar solo en la skill — puede estar desactualizada). Revisar `known-bugs.md` y memoria por si ya hay contexto.
2. Si el cambio toca backend/entidades: planear la **migración** desde el arranque (no hay auto-DDL).

**Al implementar**
3. Si agregás/cambiás una entidad → las **4 capas** + `database.config.ts` + **migración** con timestamp epoch-ms real (`date +%s%3N`). Ver [add-new-entity.md](add-new-entity.md).
4. Todo handler que **muta** datos lleva `ensurePermission(...)` como primera sentencia (regla dura #21). `/api/rpc` es default-allow.
5. Respetar las reglas duras de [SKILL.md](../SKILL.md) §3 (UPPERCASE, sin funciones/getters en templates, sin colores hardcoded, mat-menu para acciones, etc.).

**Verificar**
6. `npm run build` durante el desarrollo; **`npm run check` (AOT) antes de pushear** — caza errores de template/tipo que el dev build tolera. **Nunca correr `npm start`** (lo corre el usuario).
7. Avisar si el cambio **requiere reiniciar la app** (backend/`preload.ts`/`main.ts`/entidades → reinicio; solo Angular → hot reload).

**Documentar (obligatorio, no opcional)**
8. **Actualizar el/los doc(s) de dominio afectados** en `domains/` (o `architecture/`, `conventions/`). Si es un **subsistema nuevo** → doc nuevo en `domains/` + fila en la tabla de navegación de [SKILL.md](../SKILL.md) §2.
9. **Actualizar la skill si el cambio invalida algo que ella afirma**, cambió una convención/arquitectura, o introdujo un comportamiento no obvio. Ejemplo real: el refactor "cada variación su propia receta" dejó **falsa** la nota de "receta compartida por sabor" → hubo que corregirla, no solo agregar.
10. **Mover el ítem en el backlog:** si el trabajo estaba en `todos-pendientes.md` → marcarlo `[x]` / moverlo a completado. Si arreglaste un bug de `known-bugs.md` → marcarlo RESUELTO con el commit. Si descubriste deuda nueva → **agregarla** al backlog correspondiente.
11. Si aprendiste un gotcha no obvio → guardarlo en memoria + en la sección de convenciones/known-bugs.

**Cerrar**
12. **Conventional commit**: `feat(scope):` / `fix(scope):` / `refactor(scope):` / `docs(scope):` / `perf(scope):`. Mensaje que explique el *qué* y el *porqué*.
13. **PR a `develop`** (branch de trabajo, canal alpha). `master` es releases. Branch protection exige los checks Lint+Build (ubuntu + windows).
14. Si abriste un GitHub issue por los criterios de arriba → cerrarlo desde el PR (`Closes #N`).

## 3. Regla de oro

> Un cambio de código **sin** su actualización de documentación está **incompleto**. La doc y el código se commitean juntos (o en commits contiguos del mismo PR), nunca "después". Si dejás doc desactualizada, el próximo que lea la skill va a actuar sobre información falsa — que es exactamente lo que esta reauditoría tuvo que arreglar.
