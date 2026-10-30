# PLAN #317 — `fechaParamSql` en Postgres corre los filtros de fecha 3 h

## Problema
`electron/utils/date.utils.ts` → `fechaParamSql()` devolvía en Postgres `toISOString()` (UTC con `Z`).
Las columnas son `timestamp without time zone` y guardan la hora **local** del proceso (el driver `pg`
serializa un `Date` con su offset local y Postgres lo descarta). Al comparar contra un literal con `Z`,
Postgres también descarta la zona → el límite queda +3 h en America/Asuncion. Reportes y dashboards por
día pierden lo vendido entre 00:00 y 03:00 del primer día y suman lo de 00:00–03:00 del día siguiente.

## Cambio (solo código, sin migración ni datos)
- En Postgres, `fechaParamSql` devuelve la hora local sin zona `YYYY-MM-DD HH:mm:ss.SSS`, armada con
  getters locales (misma representación que guarda la columna).
- SQLite no cambia (TEXT UTC con espacio, fix de #249).
- Los 26 llamadores (reportes, dashboards, delivery, finanzas) quedan corregidos sin tocarlos.
  `funciones-tareas/fechas.ts` ya pasaba el `Date` directo en Postgres: no cambia.

## Riesgo
- Supone que el proceso Node corre en la misma zona con la que se guardaron los datos (el mismo
  supuesto con el que ya escribe TypeORM). Si el servidor corriera en UTC, ambos lados quedan en UTC y el
  filtro sigue siendo coherente con lo guardado.
- Sin arreglos retroactivos: no se recalcula nada guardado; solo cambian las lecturas.

## Pruebas
- Nuevo `test:fecha-param-pg` (entra en `test:all`): formato en SQLite y Postgres, y contra Postgres real
  (si hay) inserta filas con `Date` como TypeORM y filtra un día que cruza medianoche en
  America/Asuncion; control que reproduce el bug con el ISO `Z`. Sin Postgres se autosaltea.
- `test:reporte-filtro-dia-uno` (#249, SQLite) sigue pasando.
- Sin pantalla nueva ni cambios de cobro/factura/PDV → no aplica prueba de UI con cobro.

## Auditoría (2 agentes, 30/10)
- Corregido: `reportes-finanzas.helper.ts` `ingresoEgresoRango` mandaba `toISOString()` directo; ahora pasa por
  `fechaParamSql` y los KPIs de Ingresos/Egresos cuadran con flujo y composición (en Postgres y en SQLite).
- Supuesto verificado: `created_at` lo completa Postgres con `now()` en la zona de la sesión. En la copia de
  producción del 24/10 las ventas pican a las 12–13 h y 20–21 h → la base de Don Franco guarda hora local.
- Deuda previa sin cambio (vencimientos de cheques con `toISOString()` contra columnas `date`): fuera de alcance.
