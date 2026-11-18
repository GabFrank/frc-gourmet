# PLAN — `fusionar-clientes`: unir dos fichas de cliente (origen → destino)

Pedido: propietario, 18/11/2026 15:14 (panel del Gerente Don Franco): «Que el CEO
Gourmet haga una función para unir fichas», en vez de correr SQL a mano.
Caso inicial: cliente 27 «JONATAN» (CI de relleno) → cliente 523 Jhonatan Andrés
Díaz Sánchez (CI real). Hoy no hay método para mover deudas entre clientes:
`update-cuenta-por-cobrar` no cambia el cliente y cancelar + recrear pierde historia.

## Qué se cambia

1. `electron/handlers/cuentas-por-cobrar.handler.ts`
   - Se extrae la suma de `recalcular-saldo-cliente` a `saldoPorMovimientos(manager, clienteId)`
     (misma fórmula: CARGO/AJUSTE_POSITIVO suman, PAGO/AJUSTE_NEGATIVO restan).
   - Handler nuevo `fusionar-clientes`, permiso `CPC_GESTIONAR`.
     Params: `[{ origenId, destinoId, motivo?, simular?, esperado?: { saldoDestino } }]`.
     Una sola transacción:
     1. Valida: ids enteros distintos, los dos existen, destino activo.
     2. Bloquea las dos fichas (Postgres `FOR UPDATE`, mismo lock que los cobros).
     3. Respaldo: ids de CPC, movimientos, ventas y convenios del origen, y activo/saldo
        previos de las dos fichas. Vuelve en la respuesta (`respaldo`) para guardarlo en JSON.
     4. Mueve al destino: CPC (las cuotas cuelgan de la CPC y van solas),
        `movimientos_cliente` y `ventas`.
     5. Convenios: el destino queda en los convenios del origen que no tenía; el origen sale de todos.
     6. Recalcula `saldo_actual` de las dos con `saldoPorMovimientos`.
     7. Desactiva el origen.
     - `simular:true`: corre todo y deshace al final. La real exige `esperado.saldoDestino`
       igual al de la simulación; si no coincide, aborta sin tocar nada.
     - No toca caja, banco, facturas, delivery, reservas ni cuentas online (documentos históricos).
2. `preload.ts`: `fusionarClientes(payload)` + regenerar los `api-channel-map.generated.ts`.
3. Test `scripts/test-fusionar-clientes-e2e.ts` + `test:fusionar-clientes`.
4. SQL de vuelta atrás `scripts/sql/deshacer-fusion-clientes.sql` (a partir del respaldo).
5. Página `gourmet-api-guia`: sección del método (al publicar).

Sin migración, sin UI, sin cambio de esquema.

## Cómo se prueba
- `test:fusionar-clientes` (SQLite, migraciones reales): simular no escribe; real mueve
  CPC/cuotas/movs/ventas/convenio, saldos recalculados, origen inactivo; esperado distinto
  → error sin cambios; mismo id, inexistente, destino inactivo, sin esperado, sin permiso → error;
  no toca otros clientes.
- Copia de Don Franco (Postgres `donfranco_copia`): 27 → 523 simulado y real, comparado
  con el resultado del SQL `fusion-cliente-27-a-523.sql`.
- `npm run check`, `test:cpc-lote`, `test:all` (no sumar fallas a la línea base).
- No toca cobro, factura ni PdV.

## Riesgos
- Fusionar las fichas equivocadas: `simular` + `esperado`, la ficha muestra nombre y CI de las dos.
- Concurrencia con un cobro: lock de las dos fichas en la misma transacción.

## Vuelta atrás
- Código: revert del squash-merge.
- Datos: el `respaldo` devuelto + `scripts/sql/deshacer-fusion-clientes.sql`.
