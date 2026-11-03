# PLAN #322 — Cancelar una CPC deja sus cuotas PENDIENTE

## Problema
`cancelar-cuenta-por-cobrar` pasa la CPC a `CANCELADO` pero no toca sus cuotas, que
quedan `PENDIENTE`. Las consultas que filtran solo por `cuota.estado` las siguen
sumando:

- `get-caja-mayor-cpc-resumen` (Caja Mayor → CPC: este mes, mes que viene, total, vencidas).
- `get-saldo-cliente` y `get-cliente-estado-cuenta` (conteo de cuotas vencidas).

En producción salió con la CPC 183 (Eudelio) y las 74 de Franco Emprendimientos.
En la copia de Don Franco (24/10) hay 5 cuotas así, por ₲677.000.

Las demás consultas por cuota ya filtran `cpc.estado = ACTIVO` (pago consolidado,
convenios, rrhh-funcionarios, liquidación de sueldo y final).

## Cambio (solo código, sin tocar datos existentes)
1. `cancelar-cuenta-por-cobrar`: dentro de la misma transacción, las cuotas
   `PENDIENTE`/`PARCIAL` de la CPC pasan a `CANCELADO` (no puede haber cobros: se
   valida `montoCobrado = 0` antes).
2. `get-caja-mayor-cpc-resumen`, `get-saldo-cliente`, `get-cliente-estado-cuenta`:
   agregar `cpc.estado = 'ACTIVO'`. Esto excluye también las CPC canceladas antes del
   arreglo, sin arreglo retroactivo de datos.
3. `cobrar-cpc-cuota`: rechazar el cobro si la CPC está cancelada (hoy una cuota
   PENDIENTE de una CPC cancelada se podía cobrar).

## Fuera de alcance
- La cancelación de CPC al anular una venta a crédito (`ventas.handler`, A-01) tampoco
  cancela cuotas. Queda cubierta por el filtro de lectura del punto 2; cambiarla toca el
  flujo de PdV y va en un PR aparte con prueba real.
- Datos ya cancelados en producción: no se modifican.

## Pruebas
- Nuevo `test:cpc-cancelada-cuotas` (SQLite): reproduce el bug en develop (7 fallas) y
  pasa con el arreglo (11/11).
- build, check, test:all sin fallas nuevas sobre la línea base (9).
- Sin pantalla nueva ni cambios de cobro/factura en PdV: no aplica prueba de UI.
