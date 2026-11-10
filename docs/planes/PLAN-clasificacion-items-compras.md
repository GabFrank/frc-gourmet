# PLAN — Clasificación de ítems de compra (CMV, gasto operativo, reventa)

Estado: aprobado por el propietario (10/11/2026). Base: develop `87ba505a`. Rama: `feat/clasificacion-items-compras`.
Un solo cambio con etapas 1 a 3 (un PR, un merge). Etapa 4 (líneas sin producto) queda fuera. Etapa 0 es configuración en producción, con backup.

## 1. Objetivo

Que cada línea de compra diga **qué es** (clase) y **a dónde va su costo** (destino: `CMV`, `GASTO_OPERATIVO`, `REVENTA`), y que la marca/contenido comprados queden en el alias del proveedor, sin crear un producto por marca. Base genérica: clases en tabla configurable, no enum de Don Franco.

## 2. Decisiones del propietario (10/11)

- Clases: Insumo de producción (CMV), Bebida de reventa (REVENTA), Descartable/packaging (CMV), Limpieza e higiene, Mantenimiento, Menaje/utensilios, Otros (GASTO_OPERATIVO).
- Limpieza, mantenimiento y menaje: `controlaStock=false` salvo costo ≥ ₲ 150.000 por unidad o marcados críticos (sugerencia, nunca automático).
- Compras viejas: quedan **«Sin clasificar»** (sin arreglo retroactivo).
- Etapas 1+2+3 en un solo PR/merge. Etapa 4 después.

## 3. Etapa 0 — Configuración en producción (antes del código)

Backup JSON de `get-familias`, `get-subfamilias`, `get-productos` en `/estacion/backups/clasif-compras/` antes de escribir.
1. Crear familias de no-venta con subfamilia `GENERAL`: `LIMPIEZA E HIGIENE`, `DESCARTABLES/PACKAGING`, `MANTENIMIENTO`, `MENAJE/UTENSILIOS` (`create-familia`, `create-subfamilia`).
2. Genéricos: solo los que aparecen en compras reales (Embalaclean, M&M, cajas de pizza), nombre en mayúsculas sin marca, `esVendible=false`, `esComprable=true`, `controlaStock` según la regla de ₲ 150.000. Lista concreta se arma con el Gerente y va en **una** aprobación.
3. Nada se borra ni se mueve; productos existentes no cambian de subfamilia en esta etapa.
Vuelta atrás: desactivar (`activo=false`) lo creado, listado en el registro de cambios.

## 4. Etapa 1 — Clases

- Entidad nueva `CompraItemClase` (`compra_item_clase`): `nombre`, `destino` (varchar: CMV|GASTO_OPERATIVO|REVENTA), `controla_stock_por_defecto`, `orden`, `activo` + BaseModel.
- Columnas nullable `clase_id` en `subfamilia`, `producto` y `compras_detalles` (sin FK física, como el resto del repo).
- Migración aditiva **SQLite y Postgres** (una por motor, como las vigentes) con semilla de las 7 clases (idempotente por nombre). Registrada en `database.config.ts`.
- Clase efectiva de una línea: `detalle.claseId ?? producto.claseId ?? producto.subfamilia.claseId ?? null`. Función pura `resolverClaseLinea()` en `electron/utils/compra-clase.utils.ts`, testeada.
- `create-compra-borrador`, `update-compra-borrador`, la confirmación de importación por factura y `createCompraDetalle`: si la línea trae `claseId` se usa; si no, se resuelve y **se guarda** la heredada (la línea queda fija aunque después se reclasifique el producto).
- RPC: `get-compra-item-clases` (lectura), `create-compra-item-clase`, `update-compra-item-clase` (permiso `COMPRAS_GESTIONAR`; sin delete, solo `activo`).
- UI: ABM de clases en Compras → Configuración; selector de clase en subfamilia y producto; columna/selector de clase por línea en el borrador de compra (`create-edit-compra`) y en `revisar-factura`.
- No cambia stock ni costo promedio: siguen mirando `producto.controlaStock`.

## 5. Etapa 2 — Alias con marca

- `ocr_aliases_producto`: columnas nullable `marca`, `contenido`, `codigo_proveedor`, `activo` (default true).
- `compras_detalles`: `alias_id` y `texto_original` (varchar 500) nullable.
- RPC `get-alias-productos-proveedor [proveedorId]` (lectura, permiso de compras ver) y `upsert-alias-producto [{proveedorId, textoOcr, productoId, presentacionId?, marca?, contenido?, codigoProveedor?, activo?}]` (escritura, `COMPRAS_GESTIONAR`), respetando la unique actual.
- Borrador/importación aceptan `aliasId`/`textoOriginal` por línea y los guardan; la importación IA, al crear o reforzar un alias, conserva marca/contenido si vienen.
- `get-alias-productos-proveedor` y `upsert-alias-producto` se declaran en la guía de la API.

## 6. Etapa 3 — Reporte por clase

- RPC `get-reporte-compras-por-clase [{desde, hasta, monedaId?}]` (lectura): suma `subtotal` de líneas activas de compras **no anuladas** (finalizadas y pagadas; borradores aparte), agrupado por destino y clase, con fila «Sin clasificar» para `clase_id` nulo. Las compras simplificadas (sin detalle) salen como «Sin detalle» con su total de cabecera. Por moneda, sin convertir.
- Bloque en el dashboard de compras: tabla destino → clase → monto del mes, con selector de mes.
- No suma gastos de caja (origen distinto): el reporte lo aclara en la leyenda para evitar doble conteo.

## 7. Pruebas

- Unit (`test:unit` del área): `resolverClaseLinea` (subfamilia→producto→línea, override por línea, nulos); handler de borrador guarda la clase heredada y la de override; upsert de alias (crear, actualizar marca, unique); reporte (agrupa, excluye anuladas, «Sin clasificar», «Sin detalle»).
- Migración: BD vacía SQLite y Postgres local; y la **copia de Don Franco** (`donfranco_copia`): compras viejas intactas, stock y costo promedio iguales antes/después (consulta de comparación guardada como evidencia).
- Interfaz en modo oscuro sobre la copia: compra mixta (insumo + limpieza + bebida), cambiar la clase de una línea, finalizar, ver el reporte del mes; anular esa compra y ver que sale del reporte y el stock vuelve. Capturas al propietario.
- No toca cobro, factura de venta ni PdV: no aplica cobrar/facturar. Sí finalizar y anular compras con stock.
- Gates: build, check, suites tocadas mientras se programa; `test:all -- --jobs 3` una vez al final sin fallas nuevas sobre la línea base; CI 4/4 verde.

## 8. Riesgos y vuelta atrás

| Riesgo | Cobertura |
|---|---|
| Migración en SQLite de producción | Solo tabla nueva + columnas nullable; backup pre-migración automático; probada sobre la copia |
| Línea mal clasificada | Clase visible/editable por línea; «Sin clasificar» explícito |
| Clientes viejos (PC/PWA) sin `claseId` | Campo opcional: se hereda en servidor |
| Doble conteo con gastos de caja | Reporte solo de compras, leyenda explícita |
| Alias erróneo reutilizado | `activo` en alias y editable por RPC |

Vuelta atrás: revert del squash-merge por PR (con OK). Las columnas nuevas quedan sin uso; no se pierden datos. Etapa 0: desactivar lo creado.

## 9. Entrega

PR `feat(compras): clasificación de ítems de compra por clase y destino`, con capturas. Antes del merge: mostrar resultado al propietario y pedir su OK. Después: avisar al Gerente Don Franco las reglas de clasificación por línea para la carga por foto (orden: alias → genérico → palabra clave → encuesta) y actualizar la página `gourmet-api-guia`.
