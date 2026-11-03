# PLAN #350 (puntos 2-4): saves que pisan saldos de cliente / cuenta

Seguimiento de #190 (PR #349). El punto 1 (saldo editable en el diálogo de cuenta
bancaria) y el 5 (aviso de límite de crédito) quedan fuera: el 1 necesita decisión
de producto y el 5 es un aviso confirmable.

## Cambios
1. `update-cliente` / `delete-cliente` (personas.handler): `saldoActual = undefined`
   antes del `save()` (TypeORM no escribe columnas `undefined`), así la edición no
   reescribe el saldo leído si entró un cobro en el medio. `update-cliente` relee
   el saldo para devolverlo.
2. `acreditar-transferencia-bancaria` (banking.handler): ajuste atómico del saldo y
   movimiento bancario en la misma transacción (si falla el movimiento, el saldo
   no queda sumado sin respaldo).
3. `recalcular-saldo-cliente` (cuentas-por-cobrar.handler): transacción; en
   Postgres `SELECT … FOR UPDATE` del cliente antes de sumar `movimientos_cliente`
   (los cobros toman ese lock al ajustar, #190); `UPDATE` de la columna sola.

## Pruebas
- `test:saldos-atomicos` H: CONTROL (save con saldo leído pisa un cobro) y fix.
  Guardia G: se quita la excepción de recalcular (ya no asigna en memoria).
- Prueba real con handlers en clon PG de Don Franco (`.tmp/real-350.ts`).
- test:all sin fallas nuevas sobre la línea base (9).
