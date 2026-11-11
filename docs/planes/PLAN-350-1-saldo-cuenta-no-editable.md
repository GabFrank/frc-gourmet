# PLAN #350 punto 1 — el saldo de una cuenta bancaria no se edita a mano

**Decisión del propietario (08/11/2026):** «No editable: ajustes solo como movimiento con motivo».

## Problema
El diálogo «Editar cuenta bancaria» muestra el campo «Saldo inicial» editable y lo manda en
`update-cuenta-bancaria`. El handler hace `Object.assign(existing, data)` + `save()`, así que:
1. Cualquiera con BANCOS_GESTIONAR cambia el saldo sin movimiento ni motivo (no queda rastro).
2. Aunque no lo toque, el diálogo manda el saldo leído al abrirlo: si entre tanto entró una
   acreditación o un ajuste (#190), el guardado lo pisa.
3. `delete-cuenta-bancaria` (desactivar) hace `save()` de la entidad entera con el saldo leído: misma carrera.

## Cambio
- `electron/handlers/banking.handler.ts`
  - `update-cuenta-bancaria`: descarta `saldo`, `saldoReservado` e `id` del pedido; antes del `save()`
    pone `saldo`/`saldoReservado` en `undefined` (TypeORM no escribe esas columnas, mismo patrón que
    update-cliente en #350 pts 2-4) y devuelve la cuenta releída (con el saldo real).
  - `delete-cuenta-bancaria`: mismo `undefined` antes del `save()`.
  - `create-cuenta-bancaria` sin cambios: el saldo inicial al crear sigue permitido.
- Diálogo `create-edit-cuenta-bancaria`: al editar, el campo pasa a «Saldo actual», deshabilitado, con
  la ayuda «Para corregirlo, cargá un ajuste con motivo en los movimientos de la cuenta» y no se manda.
  Los ajustes ya existen: `create-movimiento-bancario` (AJUSTE_POSITIVO/NEGATIVO con observación), desde
  el diálogo de movimientos de la cuenta.

## Pruebas
- `test:saldos-atomicos`: I (PG real) editar con saldo leído pisa el ajuste (control) / con `undefined`
  lo conserva; J guardia estática del handler y del diálogo (4 asserts fallan con develop).
- tsc del proceso principal y de Angular; test:all --jobs 3 sin fallas nuevas.
- No toca cobro, factura ni punto de venta: no requiere cobrar/facturar.

## Fuera de alcance
- Cambiar la moneda de una cuenta con saldo (queda como está).
- Datos de producción: sin arreglos retroactivos.
