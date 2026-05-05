# Catálogo de enums

30+ enums distribuidos por dominio. Lista referencia.

## Personas / Auth

```typescript
// persona-tipo.enum.ts
PersonaTipo = FISICA | JURIDICA

// documento-tipo.enum.ts
DocumentoTipo = CI | RUC | CPF | PASAPORTE

// sexo.enum.ts
SexoEnum = MASCULINO | FEMENINO | OTRO

// estado-civil.enum.ts
EstadoCivil = SOLTERO | CASADO | UNION_LIBRE | DIVORCIADO | VIUDO
```

## Productos

```typescript
// producto-tipo.enum.ts
ProductoTipo = RETAIL | RETAIL_INGREDIENTE | ELABORADO_SIN_VARIACION | ELABORADO_CON_VARIACION | COMBO

// receta-tipo.enum.ts
RecetaTipo = BASE | VARIACION

// (en precio-costo.entity.ts)
FuenteCosto = COMPRA | MANUAL | AJUSTE_RECETA

// (en stock-movimiento.entity.ts)
StockMovimientoTipo = COMPRA | VENTA | TRANSFERENCIA | AJUSTE_POSITIVO | AJUSTE_NEGATIVO | DESCARTE | PRODUCCION_ENTRADA | PRODUCCION_SALIDA
StockMovimientoTipoReferencia = VENTA | COMPRA | PRODUCCION | AJUSTE | TRANSFERENCIA | DESCARTE

// (en promocion.entity.ts)
TipoPromocion = DESCUENTO_PORCENTAJE | DESCUENTO_MONTO | PRODUCTO_GRATIS | COMBO_ESPECIAL
```

## Compras

```typescript
// compras/estado.enum.ts
CompraEstado = ABIERTO | ACTIVO (deprecated) | FINALIZADO | CANCELADO

// compras/tipo-boleta.enum.ts
TipoBoleta = LEGAL | COMUN | OTRO | SIN_COMPROBANTE

// compras/forma-pago-compra.enum.ts
FormaPagoCompra = EFECTIVO | BANCO

// (Pago, deprecated)
PagoEstado = ABIERTO | PAGO_PARCIAL | PAGADO | CANCELADO
```

## Ventas

```typescript
// (en venta.entity.ts)
VentaEstado = ABIERTA | CONCLUIDA | CANCELADA

// (en venta-item.entity.ts)
EstadoVentaItem = ACTIVO | MODIFICADO | CANCELADO

// (en comanda.entity.ts)
ComandaEstado = DISPONIBLE | OCUPADO

// (en comanda-item.entity.ts)
ComandaItemEstado = PENDIENTE | EN_PREPARACION | LISTO | ENTREGADO | CANCELADO

// (en pdv-mesa.entity.ts)
PdvMesaEstado = DISPONIBLE | OCUPADO

// (en delivery.entity.ts)
DeliveryEstado = ABIERTO | PARA_ENTREGA | EN_CAMINO | ENTREGADO | CANCELADO

// (en venta-item-ingrediente-modificacion.entity.ts)
TipoModificacionIngrediente = REMOVIDO | INTERCAMBIADO

// (en pago-detalle.entity.ts, legacy)
TipoDetalle = PAGO | VUELTO | DESCUENTO | AUMENTO
```

## Caja Mayor

```typescript
// caja-mayor-enums.ts
CajaMayorEstado = ABIERTA | CERRADA

TipoMovimiento (28 valores, ver dominio):
  // Ingresos (9)
  INGRESO_RETIRO_CAJA
  INGRESO_CIERRE_CAJA
  INGRESO_ENTRADA_VARIA
  INGRESO_OPERACION_FINANCIERA
  INGRESO_RETIRO_BANCO
  INGRESO_COBRO_CLIENTE
  INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO
  TRANSFERENCIA_ENTRADA
  AJUSTE_POSITIVO

  // Egresos (14)
  EGRESO_GASTO
  EGRESO_COMPRA              // legacy pre-refactor 2026-05-05
  EGRESO_CUOTA_COMPRA
  EGRESO_CUOTA_PRESTAMO
  EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO
  EGRESO_VALE
  EGRESO_SALARIO
  EGRESO_CHEQUE
  EGRESO_OPERACION_FINANCIERA
  EGRESO_DEPOSITO_BANCO
  EGRESO_CAJA_INICIAL
  TRANSFERENCIA_SALIDA
  AJUSTE_NEGATIVO

  // Administrativo (1)
  ANULACION

GastoEstado = PENDIENTE | PAGADO | PROGRAMADO | CANCELADO
GastoFrecuencia = DIARIO | SEMANAL | QUINCENAL | MENSUAL | BIMESTRAL | TRIMESTRAL | SEMESTRAL | ANUAL

RetiroCajaEstado = FLOTANTE | VINCULADO_PENDIENTE | INGRESADO

DiferenciaDestinoTipo = GASTO | VALE | IGNORAR
TipoOperacionFinanciera = CAMBIO_DIVISA | DEPOSITO_BANCARIO | RETIRO_BANCARIO | TRANSFERENCIA_ENTRE_CAJAS
```

## Banking

```typescript
// banking-enums.ts
TipoCuentaBancaria = CORRIENTE | AHORRO

MovimientoBancarioTipo = ENTRADA_MANUAL | SALIDA_MANUAL | AJUSTE_POSITIVO | AJUSTE_NEGATIVO

AcreditacionPosEstado = PENDIENTE | ACREDITADO_AUTO | VERIFICADO | CON_DIFERENCIA

// cheques-enums.ts
ChequeEstado = EMITIDO | DIFERIDO | COBRADO | ANULADO
ChequeraEstado = ACTIVA | AGOTADA | ANULADA
```

## Cuentas

```typescript
// cuentas-por-pagar-enums.ts
CuentaPorPagarTipo = COMPRA | PRESTAMO | PRESTAMO_FUNCIONARIO | OTRO
CuentaPorPagarEstado = ACTIVO | PAGADO | CANCELADO
CuotaEstado = PENDIENTE | PARCIAL | PAGADA | VENCIDA | CANCELADA

// cuentas-por-cobrar-enums.ts
CuentaPorCobrarTipo = CREDITO_VENTA | PRESTAMO_CLIENTE | OTRO
CuentaPorCobrarEstado = ACTIVO | COBRADO | CANCELADO
CuentaPorCobrarCuotaEstado = PENDIENTE | PARCIAL | COBRADO | CANCELADO

// (movimiento-cliente.entity.ts)
MovimientoClienteTipo = CARGO | PAGO | AJUSTE_POSITIVO | AJUSTE_NEGATIVO
```

## RRHH

```typescript
// rrhh/asistencia-estado.enum.ts
AsistenciaEstado = PRESENTE | AUSENTE | TARDANZA | MEDIA_FALTA | JUSTIFICADO | FERIADO | VACACION

// rrhh/penalizacion-tipo.enum.ts
PenalizacionTipo = TARDANZA | AUSENCIA | QUEJA_CLIENTE | AMBIENTE_LABORAL | DANIO_MATERIAL | COMISION_DESCUENTO | OTRO

// rrhh/hora-extra-tipo.enum.ts
HoraExtraTipo = DIURNA | NOCTURNA | FERIADO

// rrhh/vale-estado.enum.ts
ValeEstado = SOLICITADO | CONFIRMADO | DESCONTADO | ANULADO

// rrhh/bono-tipo.enum.ts
BonoTipo = CUMPLEANIOS | NAVIDAD | DESEMPENIO | PRODUCTIVIDAD | OTRO

// (en aguinaldo.entity.ts)
AguinaldoEstado = CALCULADO | APROBADO | PAGADO

// (en vacacion-periodo.entity.ts)
VacacionPeriodoEstado = PROGRAMADA | EN_CURSO | GOZADA | CANCELADA

// rrhh/liquidacion-sueldo-estado.enum.ts
LiquidacionSueldoEstado = BORRADOR | APROBADA | PAGADA | ANULADA

// (en liquidacion-final.entity.ts)
LiquidacionFinalEstado = BORRADOR | APROBADA | PAGADA | ANULADA

// rrhh/motivo-egreso.enum.ts
MotivoEgreso = RENUNCIA | DESPIDO_JUSTIFICADO | DESPIDO_INJUSTIFICADO | MUTUO_ACUERDO | JUBILACION | FALLECIMIENTO | OTRO

// rrhh/funcionario-documento-tipo.enum.ts
FuncionarioDocumentoTipo = CEDULA | CONTRATO | CERTIFICADO | CV | ANTECEDENTES | CARNET_SALUD | TITULO_ACADEMICO | OTRO

// rrhh/liquidacion-item-tipo.enum.ts
LiquidacionItemTipo = HABER | DESCUENTO

// rrhh/configuracion-rrhh-tipo.enum.ts
ConfiguracionRrhhTipo = NUMBER | STRING | BOOLEAN | DATE

// rrhh/regla-comision-enums.ts
TipoReglaComision = META_UNIDADES | PORCENTAJE_VENTA | META_VENTA_LOCAL | EXTRA_MANUAL | PENALIZACION_MANUAL | EQUIPO_PORCENTAJE
ModoValidacionComision = TODO_O_NADA | PROPORCIONAL
RecurrenciaComision = UNICA | DEFINIDA | INDEFINIDA
TipoRequisitoComision = TARDANZA_MAX | QUEJA_MAX | ASISTENCIA_MIN | CUSTOM
LiquidacionComisionEstado = BORRADOR | APROBADA | INTEGRADA | ANULADA

// rrhh/notificacion-rrhh-enums.ts
TipoNotificacionRrhh = PRESTAMO_VENCIDO | CUOTA_VENCIDA | CUMPLEANIOS | VACACION_PROXIMA | CONTRATO_VENCE | LIQUIDACION_PENDIENTE | COMISION_PENDIENTE | DOCUMENTO_VENCE
PrioridadNotificacion = ALTA | MEDIA | BAJA
```

## Caja PdV

```typescript
// (en caja.entity.ts)
CajaEstado = ABIERTO | CERRADO | CANCELADO
```

## Core (compartidos)

```typescript
// src/app/core/enums/metodo-pago.enum.ts
MetodoPago = (ver archivo)
```
