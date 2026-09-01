# Dónde se registra cada cosa (SSOT) y regla de oro

> **Regla marco del proyecto.** La **skill es la fuente de verdad** del estado del proyecto; mantenerla al día es parte del trabajo, no un extra opcional.
>
> **El checklist de "terminado" vive en [ciclo-implementacion.md](ciclo-implementacion.md)**, que es su dueño único. Este documento tiene sólo lo que no está allá: dónde se registra cada tipo de información, la política de issues y la regla de oro.
>
> *(Hasta 2026-09-01 los dos documentos tenían su propia copia de los pasos. Divergieron: éste decía "nunca corras `npm start`" mientras `SKILL.md` regla #1 decía lo contrario desde el 2026-08-11, y citaba la regla dura #21 para `ensurePermission` cuando es la #22. Por eso ahora hay una sola copia.)*

## 1. Dónde se registra cada cosa (SSOT)

| Qué | Dónde | Notas |
|---|---|---|
| **Feature / mejora pendiente** (backlog) | [todos-pendientes.md](todos-pendientes.md) | Fuente de verdad del backlog. Con prioridad P0–P5 al final. |
| **Bug / defecto** | [../reference/known-bugs.md](../reference/known-bugs.md) | Síntoma + causa + ubicación + estado. |
| **Decisión no obvia / gotcha aprendido** | memoria + la sección correspondiente de la skill | Ej. "los handlers no quedan como listeners de ipcMain". |
| **Plan de una implementación** | `docs/planes/PLAN-<NOMBRE>.md` — **efímero** | Se commitea al aprobarse (paso 6) y **se borra en el PR final** (paso 11). Mientras vive es un registro: un paso no cumplido se anota, no se borra del plan. Nunca se enlaza desde un doc de dominio. |
| **Manual de pruebas manuales** | `docs/testing/TESTING-CHECKLIST-<NOMBRE>.md` | Incluye los casos que habrían detectado los bugs que encontró la auditoría. |
| **Trabajo hecho** (registro histórico) | **conventional commit + PR** | El commit etiqueta (`feat`/`fix`/…), el PR describe el qué y el porqué. No hace falta issue para esto. |
| **Estado general del repo** | [SKILL.md](../SKILL.md) §4 | Snapshot; reauditar contra `git log` cuando quede viejo. |

### GitHub issues — política selectiva (NO uno por cada cambio)

Crear un issue en GitHub **solo** cuando aporta algo que el commit/PR y el backlog de la skill no dan:
- **Reporte externo** (alguien que no es el dev reporta un bug o pide un feature).
- **Algo que NO se hace ahora** y querés trazarlo formalmente fuera del `todos-pendientes.md` (ej. compromiso con un tercero).
- **Discusión / decisión** que necesita un hilo, o trabajo que **abarca varios PRs**.

Para el flujo normal (implementás algo en la sesión y lo mergeás), el **conventional commit + PR a `develop` es el registro suficiente**. No abrir issues ceremoniales.

## 2. Regla de oro

> Un cambio de código **sin** su actualización de documentación está **incompleto**. La doc y el código se commitean juntos (o en commits contiguos del mismo PR), nunca "después". Si dejás doc desactualizada, el próximo que lea la skill va a actuar sobre información falsa — que es exactamente lo que esta reauditoría tuvo que arreglar.

## 3. Corolario: la doc también se relee, no sólo se agrega

La regla de oro se cumple a medias si sólo se **agrega** documentación. Dos formas de dejar doc falsa sin darse cuenta:

- **Escribirla antes de verificar.** Lo redactado durante la implementación describe la intención; si la auditoría después encuentra bugs, esas afirmaciones quedan mintiendo. Por eso el paso 11 del ciclo exige releer lo escrito contra los hallazgos.
- **Dejar vieja una afirmación que otro PR invalidó.** Un PR que se mergeó, un TODO que alguien resolvió, un número de regla que se corrió. Eso no lo detecta el auditor de un PR, porque la información que lo invalida está en un commit ajeno. Requiere un **barrido periódico del corpus** — ver el ítem correspondiente en [todos-pendientes.md](todos-pendientes.md).
