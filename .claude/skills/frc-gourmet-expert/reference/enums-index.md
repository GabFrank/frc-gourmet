# Catálogo de enums

30+ enums distribuidos por dominio. Lista de referencia — **no exhaustiva ni siempre exacta** (los enums cambian seguido). Antes de usar un valor, verificarlo en el archivo `*.enum.ts` / `*-enums.ts` del dominio. Enums recientes no listados abajo: por ejemplo `RetiroCajaOrigen`, `GastoDestinoTipo` (financiero), enums de buffet por peso (productos/ventas), KDS.

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
ProductoTipo = RETAIL | RETAIL_INGREDIENTE | ELABORADO_SIN_VARIACION | ELABORADO_CON_VARIACION | COMBO | BUFFET_POR_PESO

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

// compras/documento-compra-importado-estado.enum.ts (módulo OCR + IA)
DocumentoCompraImportadoEstado = PENDIENTE | PROCESANDO | REQUIERE_REVISION | CONFIRMADO | ERROR | DESCARTADO
DocumentoCompraImportadoTipo = PDF | IMAGE

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
DeliveryModo   = DELIVERY | RETIRO        // se reparte / lo pasa a buscar

// (en pdv-config.entity.ts) — fichas de cantina de la venta directa (2026-10)
// Guardado como varchar sin CHECK en `pdv_config.fichas_modo` y
// `producto.ficha_modo` (null en el producto = hereda el global).
FichaModo      = POR_UNIDAD | POR_ITEM | NO_IMPRIME

// (en shared/utils/canal-venta.util.ts — NO es una columna: se DERIVA)
// Cómo llegó el pedido a manos del cliente. Fuente única compartida entre el
// backend (que además tiene el CASE SQL equivalente en
// electron/utils/canal-venta.utils.ts) y el renderer. El reparto gana sobre la
// mesa, y un delivery sin `modo` cuenta como DELIVERY.
CanalVenta = SALON | MOSTRADOR | DELIVERY | RETIRO
// ⚠️ Distinto de `Venta.canalOrigen` (LOCAL | WEB | QR_MESA), que dice por qué
// PUERTA entró el pedido. Se cruzan, no se reemplazan.

// (en venta-item-ingrediente-modificacion.entity.ts)
TipoModificacionIngrediente = REMOVIDO | INTERCAMBIADO

// (en pago-detalle.entity.ts, legacy)
TipoDetalle = PAGO | VUELTO | DESCUENTO | AUMENTO
```

## Caja Mayor

```typescript
// caja-mayor-enums.ts
CajaMayorEstado = ABIERTA | CERRADA

// caja-mayor-enums.ts también define: RetiroCajaOrigen, GastoDestinoTipo (verificar en el archivo).

TipoMovimiento (23 valores — verificar en `caja-mayor-enums.ts`):
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

  // Egresos (13)
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
TipoOperacionFinanciera = CAMBIO_DIVISA | DEPOSITO_BANCARIO | RETIRO_BANCARIO | TRANSFERENCIA_ENTRE_CAJAS | TRANSFERENCIA_BANCARIA
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
// CARGO/AJUSTE_POSITIVO suben la deuda; PAGO/AJUSTE_NEGATIVO la bajan.
// El descuento de un cobro consolidado se registra como AJUSTE_NEGATIVO, no como
// PAGO: los dos bajan la deuda, pero el estado de cuenta tiene que poder decir
// cuanto pago el cliente y cuanto se le perdono.

// pago-consolidado-enums.ts — motor consolidado de Caja Mayor (pagos Y cobros)
PagoConcepto = COMPRA | GASTO | VALE | LIQUIDACION_SUELDO | COBRO_CLIENTE
PagoOrigenTipo = CPP_CUOTA | GASTO | VALE | LIQUIDACION_SUELDO | CPC_CUOTA
PagoConsolidadoEstado = ACTIVO | ANULADO
PagoConsolidadoFuente = CAJA_MAYOR | CUENTA_BANCARIA | DESCUENTO
// DESCUENTO no es una fuente de fondos: condona deuda sin mover plata. Solo la
// admite COBRO_CLIENTE, que es el unico concepto de sentido INGRESO.
// Tablas por concepto (todas Record<PagoConcepto, ...> exhaustivas, para que el
// compilador obligue a decidir al agregar un concepto): CONCEPTO_ORIGEN,
// CONCEPTO_PERMITE_PARCIAL, CONCEPTO_SELECCION_UNICA, CONCEPTO_BENEFICIARIO_UNICO
// (+ _ERROR), CONCEPTO_PERMITE_DESCUENTO, CONCEPTO_ES_INGRESO.
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

### RRHH — Disciplina y Reconocimiento (`rrhh/disciplina/`, PR #313)

Todos se guardan como `text` (CHECK en SQLite). → [domains/rrhh-disciplina.md](../domains/rrhh-disciplina.md).

```typescript
// rrhh/disciplina/dr-falta.enum.ts
DrFaltaEstado = REGISTRADA | APELADA | APROBADA | JUSTIFICADA | ANULADA
DrFaltaResultado = ADVERTENCIA | MULTA          // el motor además devuelve NINGUNO (tardanza en tolerancia: no se crea la falta)

// rrhh/disciplina/dr-tipo-falta.enum.ts
DrModoAplicacion = INDIVIDUAL | TODOS_PRESENTES
DrReinicio = NUNCA | SEMANAL | MENSUAL

// rrhh/disciplina/dr-error-estado.enum.ts
DrErrorEstado = VIGENTE | ANULADO

// rrhh/disciplina/dr-grupo-rol.enum.ts
DrGrupoRol = MIEMBRO | AUDITOR

// rrhh/disciplina/dr-premio.enum.ts
DrPremioPeriodo = SEMANAL | QUINCENAL | MENSUAL
DrPremioMetodo = CRITERIOS | VOTACION | SALDO_PUNTOS
DrReglaEmpate = DIVIDIR | MONTO_COMPLETO_CADA_UNO | DESIERTO   // el motor usa 'MONTO_COMPLETO_CU'; el handler traduce

// rrhh/disciplina/dr-pregunta-tipo.enum.ts
DrPreguntaTipo = ESCALA | SI_NO | TEXTO

// rrhh/disciplina/dr-periodo-estado.enum.ts
DrPeriodoEstado = ABIERTO | CERRADO | APROBADO

// rrhh/disciplina/dr-resultado-estado.enum.ts
DrResultadoEstado = PROPUESTO | APROBADO | DESIERTO | ANULADO

// rrhh/disciplina/dr-liquidacion-pendiente-estado.enum.ts
DrLiquidacionPendienteEstado = PENDIENTE | RESUELTO
```

### RRHH — Funciones y Tareas (`rrhh/funciones-tareas/ft.enums.ts`)

Todos se guardan como `text` (CHECK en SQLite). → [domains/rrhh-funciones-tareas.md](../domains/rrhh-funciones-tareas.md).

```typescript
FtTipoTarea = SIMPLE | CHECKLIST
FtRecurrencia = DIARIA | DIAS_SEMANA | MENSUAL | UNICA | EVENTO      // dias_semana: bitmask lun=1 … dom=64
FtEvento = CAJA_ABIERTA | CAJA_CERRADA | COMPRA_RECIBIDA
FtEventoCaja = PDV | MAYOR                                           // filtra eventos de caja; null = cualquiera
FtAncla = INICIO_TURNO | FIN_TURNO | HORA_FIJA | EVENTO
FtEvidencia = NINGUNA | NOTA | FOTO
FtMomentoAviso = ANTES_INICIO | ANTES_VENCER | AL_VENCER | ESCALAMIENTO           // de una regla
FtMomentoAvisoRegistro = ANTES_INICIO | ANTES_VENCER | AL_VENCER | ESCALAMIENTO | AUSENTE  // ft_aviso_enviado
FtCanalAviso = APP | WHATSAPP | AMBOS | GERENTE    // GERENTE: la app no envía, lo manda el bot Gerente
FtEstadoTarea = PENDIENTE | HECHA | VERIFICADA | VENCIDA | NO_APLICA | RECHAZADA
FtOrigenTarea = MOTOR | EVENTO | MANUAL
FtEstadoAviso = PENDIENTE | ENVIADO | FALLIDO | PARA_GERENTE
FtEstadoPropuesta = PENDIENTE | REGISTRADA | DESCARTADA
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
