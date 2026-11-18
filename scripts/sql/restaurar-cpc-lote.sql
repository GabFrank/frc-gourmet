-- Vuelta atrás de `cancelar-cpc-lote` (Postgres). Revierte SOLO las CPC
-- canceladas con el motivo indicado: CPC a ACTIVO, cuotas a PENDIENTE,
-- saldo del cliente +monto y borra sus AJUSTE_NEGATIVO de cancelación.
-- Uso: psql -v motivo="'SOCIO 17/11'" -f scripts/sql/restaurar-cpc-lote.sql
-- (el motivo exacto, en mayúsculas, como lo devolvió la llamada). Backup antes.
BEGIN;
CREATE TEMP TABLE _lote ON COMMIT DROP AS
  SELECT id, cliente_id, monto_total FROM cuentas_por_cobrar
  WHERE estado = 'CANCELADO' AND motivo_cancelacion = :motivo AND monto_cobrado = 0;
SELECT COUNT(*) AS cpc_a_restaurar, COALESCE(SUM(monto_total), 0) AS total FROM _lote;
UPDATE cuentas_por_cobrar_cuotas SET estado = 'PENDIENTE'
  WHERE estado = 'CANCELADO' AND monto_cobrado = 0 AND cuenta_por_cobrar_id IN (SELECT id FROM _lote);
UPDATE clientes c SET saldo_actual = c.saldo_actual + s.t
  FROM (SELECT cliente_id, SUM(monto_total) AS t FROM _lote GROUP BY cliente_id) s WHERE c.id = s.cliente_id;
DELETE FROM movimientos_cliente
  WHERE tipo = 'AJUSTE_NEGATIVO' AND cuenta_por_cobrar_id IN (SELECT id FROM _lote)
    AND observacion = 'CANCELACION CPC #' || cuenta_por_cobrar_id || ' - ' || :motivo;
UPDATE cuentas_por_cobrar SET estado = 'ACTIVO', fecha_cancelacion = NULL, motivo_cancelacion = NULL
  WHERE id IN (SELECT id FROM _lote);
COMMIT;
