# PLAN — Acreditaciones POS por medio de pago y conciliación real (issue #320)

## Problema
El saldo futuro de bancos no cuadra: hoy cada `MaquinaPos` tiene un solo % y un plazo en minutos
(prod: BANCARD 3,5 %/2160 min → BNF; UENO 1,8 %/1440 → UENO; DINELCO 2 %/1440 → CONTI; STONE 1 %/1440 → cuenta en R$).
`create-acreditacion-pos` no calcula IVA de la comisión, retenciones ni días hábiles, y
`procesarAcreditacionesPendientes` suma `montoEsperado` al saldo al vencer, sin evidencia del banco.

## Evidencia (extracto Bancard crédito, 91 boletas 26/9–26/10, ₲ 8.547.200 bruto → ₲ 8.102.074 neto = 5,21 %)
Verificado por script, 91/91 filas cumplen:
- comisión = 3 % del bruto truncado a decenas (por eso el % aparente 2,95–2,99);
- IVA comisión = 10 % de la comisión; ret. renta = 1 % del bruto; ret. IVA = bruto/11 × 10 % (0,909 %);
- neto = bruto − comisión − IVA − ret. renta − ret. IVA; todas las marcas iguales (Visa, MC, Diners), POS y APP;
- plazo: crédito = proceso + 2 días hábiles; ventas de sáb/dom se procesan el lunes; feriado 28/9 corre todo un día.
uPay (QR/débito/crédito) y Bancard débito según tabla de la issue. Stone QR (cobros «Transação» del extracto R$ 1–30/9/2026): 0,75 % truncado al centavo, D+0, neto, verificado 302/302. Stone tarjetas («Recebível de Cartão» / transferencias desde «Stone Principal») llegan agrupadas sin bruto: hace falta el reporte de ventas de Stone para verificarlas.

## Cambios
1. **Enum `MedioPos`** (QR, DEBITO, CREDITO) + `marca` y `cuotas` opcionales en `PagoDetalle` y `AcreditacionPos`. Selector de medio en `cobrar-venta-dialog` solo cuando la forma de pago tiene máquina POS (por defecto: último usado; obligatorio si la máquina tiene reglas por medio).
2. **Entidad `MaquinaPosRegla`** (maquina, medio, plazoDias, tipoDias HABILES|CORRIDOS, base PROCESO_SIGUIENTE_HABIL|TRANSACCION, %comision, redondeoComision (unidad, ej. 10), %ivaComision, %retRenta, %retIva sobre IVA de la venta, ivaVentaDivisor (11), modo NETO|BRUTO_COMISION_APARTE, activo). Sin regla → se usa `MaquinaPos` como hoy (cero cambio de comportamiento hasta configurar).
3. **Servicio puro `calcularAcreditacion(regla, bruto, fecha, feriados)`** → {comision, ivaComision, retRenta, retIva, neto, fechaEsperada}. Reusa la tabla `feriados` (RRHH) existente. Columnas nuevas en `AcreditacionPos`: medio, marca, cuotas, ivaComision, retRenta, retIva, reglaId.
4. **No auto-sumar al vencer** (opción por máquina `autoAcreditar`, default true = hoy). Si false → estado `VENCIDA_SIN_CONCILIAR`, no toca saldo.
5. **Conciliación agrupada**: diálogo en Bancos que toma un crédito real (monto + fecha), sugiere las acreditaciones pendientes que suman ese neto (misma cuenta, fecha esperada ±2 días) y las marca VERIFICADO en una transacción; diferencia → ajuste explícito. Bancard débito: comisión como débito aparte.
6. **Reportes**: pendiente por cuenta y fecha esperada; comisiones, IVA de comisión y retenciones del mes (retenciones = crédito fiscal). Saldo futuro usa `montoEsperado` nuevo.
7. **Config UI desktop**: pestaña «Reglas por medio» en el diálogo de máquina POS; botón «Cargar reglas observadas» con los valores de la tabla (editables, nada hardcodeado en el cálculo).

## Migración
Una migración (SQLite + Postgres): tabla `maquinas_pos_reglas`, columnas nullables en `acreditaciones_pos` y `pagos_detalle`, `auto_acreditar` default true. Sin backfill: las acreditaciones existentes quedan como están (sin arreglos retroactivos).

## Pruebas
- Unit del cálculo con casos reales: 56.000→53.083; 17.940→17.015; 27.090→25.682; 349.000→330.820; plazos lun→mié, vie→mar, jue→lun, feriado 28/9; uPay QR/crédito con fin de semana.
- e2e handlers SQLite+PG: crear acreditación con/sin regla (sin regla = idéntico a hoy), vencida sin auto, conciliación agrupada, anulación de cobro.
- **Toca el cobro**: prueba real en sandbox sobre la copia de Don Franco: cobrar con tarjeta crédito/débito/QR, efectivo y mixto; facturar; verificar ticket, arqueo de caja y acreditación (regla incidente alpha.159). Capturas en modo oscuro, desktop.
- `npm run check`, build, `test:all` sin fallas nuevas vs develop; CI 4/4.

## Riesgos y mitigación
- Cobro bloqueado por el selector → el medio nunca bloquea el cobro: si falta, se usa la regla por defecto o el % de la máquina y se avisa.
- Saldos bancarios mal → sin regla el comportamiento es el actual; `autoAcreditar` default true; nada retroactivo.
- Feriados incompletos → fecha esperada solo afecta proyección; la conciliación usa ±2 días.
- Moneda (STONE en R$) → se mantiene el control MONEDA_NO_COINCIDE_CON_CUENTA.

## Vuelta atrás
Feature por configuración: borrar/desactivar reglas y `autoAcreditar=true` vuelve al comportamiento actual. Migración con `down` probada (up/down/up SQLite+PG). Revert del squash si hace falta.

## Entrega
Rama `feat/acreditaciones-pos-reglas`, PR a develop. Merge = producción (canal alpha): solo con OK del propietario. Después del merge, cargar reglas en prod con backup previo y su OK.

## Ajustes por auditoría del plan (27/10)
1. **Reglas no verificadas**: solo Bancard crédito está validada (91/91). «Cargar reglas observadas» carga Bancard crédito activa; uPay QR/débito/crédito y Bancard débito quedan **inactivas y marcadas «sin verificar»** hasta tener extracto; Stone QR se carga activa (verificada); Stone débito/crédito no se cargan hasta tener el reporte de ventas. Tests unitarios también para débito (BRUTO + comisión aparte), QR y uPay crédito con fin de semana, con los valores de la issue y rotulados como supuestos.
2. **Vuelta atrás de datos**: cada conciliación agrupada guarda un `ConciliacionPos` (crédito real, fecha, monto, usuario, acreditaciones incluidas, movimiento bancario generado). Acción «Deshacer conciliación» (BANCOS_GESTIONAR, transaccional): revierte el movimiento y devuelve las acreditaciones a su estado previo. Las acreditaciones calculadas con regla guardan `reglaId` y el desglose: desactivar reglas no las recalcula (sin retroactivos). Revertir código = nueva versión (canal alpha); el down de la migración solo para desarrollo, no se corre en producción.
3. **Estado VENCIDA_SIN_CONCILIAR**: se agrega al enum (columna varchar, sin CHECK que migrar; se verifica en SQLite y PG). Saldo futuro y reportes incluyen PENDIENTE + VENCIDA_SIN_CONCILIAR; la conciliación acepta ambos. Al pasar una máquina a autoAcreditar=false, sus pendientes existentes siguen la nueva regla al vencer (no se tocan saldos ya acreditados). Test de compatibilidad de consultas existentes.
4. **Conciliación idempotente**: un `ConciliacionPos` por crédito real, con clave única (cuenta + fecha + monto + referencia opcional); una acreditación solo puede estar en una conciliación activa (FK + chequeo en transacción). La sugerencia es greedy por fecha esperada y el usuario confirma/edita la selección; sin auto-match ciego. Test de doble conciliación.
5. **Fiscal**: el reporte rotula IVA de comisión y retenciones como «informativo, a validar por el contador»; no genera asientos.
6. **Evidencia**: el script de verificación (91/91) se agrega como test con los 91 casos anonimizados (solo montos y fechas, sin tarjetas ni autorizaciones).
