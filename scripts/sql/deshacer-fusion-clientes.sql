-- Vuelta atrás de `fusionar-clientes`, con el `respaldo` que devolvió la llamada real.
-- Completar las variables con los valores del respaldo (listas separadas por coma; si
-- una lista está vacía, poner 0) y correr con psql -v ON_ERROR_STOP=1. Queda sin COMMIT:
-- revisar el SELECT final y decidir COMMIT o ROLLBACK.
\set origen 27
\set destino 523
\set cpc_ids '0'
\set mov_ids '0'
\set venta_ids '0'
\set convenio_ids '0'
\set convenios_agregados '0'
\set activo_origen true

BEGIN;
SELECT id FROM clientes WHERE id IN (:origen, :destino) ORDER BY id FOR UPDATE;
UPDATE cuentas_por_cobrar  SET cliente_id = :origen, updated_at = now() WHERE id IN (:cpc_ids) AND cliente_id = :destino;
UPDATE movimientos_cliente SET cliente_id = :origen WHERE id IN (:mov_ids) AND cliente_id = :destino;
UPDATE ventas              SET cliente_id = :origen WHERE id IN (:venta_ids) AND cliente_id = :destino;
INSERT INTO cliente_convenios (cliente_id, convenio_id)
  SELECT :origen, c FROM unnest(ARRAY[:convenio_ids]::int[]) c WHERE c > 0 ON CONFLICT DO NOTHING;
DELETE FROM cliente_convenios WHERE cliente_id = :destino AND convenio_id IN (:convenios_agregados);
UPDATE clientes c SET saldo_actual = coalesce((
  SELECT round(sum(CASE WHEN m.tipo IN ('CARGO','AJUSTE_POSITIVO') THEN m.monto
                        WHEN m.tipo IN ('PAGO','AJUSTE_NEGATIVO') THEN -m.monto ELSE 0 END), 2)
  FROM movimientos_cliente m WHERE m.cliente_id = c.id), 0)
WHERE c.id IN (:origen, :destino);
UPDATE clientes SET activo = :activo_origen, updated_at = now() WHERE id = :origen;
SELECT id, activo, saldo_actual FROM clientes WHERE id IN (:origen, :destino) ORDER BY id;
-- COMMIT;  o  ROLLBACK;
