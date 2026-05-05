# Capítulo 19 — Glosario

Términos del sistema y del dominio gastronómico.

## Sistema

| Término | Definición |
|---|---|
| **PdV** | Punto de Venta. Pantalla principal de operación de ventas. |
| **Caja** | Caja registradora física, hardware-bound, con apertura/cierre diario. |
| **Caja Mayor** | Ledger contable virtual. Consolida todos los movimientos del negocio (ingresos/egresos por caja, gastos, salarios, etc.). |
| **CPP** | Cuentas por Pagar. Deudas del negocio (a proveedores, bancos, empleados). |
| **CPC** | Cuentas por Cobrar. Créditos otorgados a clientes. |
| **RRHH** | Recursos Humanos. Módulo de gestión de empleados. |
| **POS** | Point of Sale (terminales de tarjeta). |
| **CM** | Caja Mayor (abreviatura). |
| **UB** | Unidad Base. La unidad de medida de un producto (KILOGRAMO, LITRO, UNIDAD). |
| **PYG** | Guaraní paraguayo. |
| **Tab** / **Pestaña** | Cada módulo abierto en el área de trabajo. Sistema de navegación principal. |

## Productos

| Término | Definición |
|---|---|
| **Familia** | Clasificación más alta. Ej: BEBIDAS, COMIDAS. |
| **Subfamilia** | Sub-categoría de Familia. Ej: GASEOSAS, PIZZAS. |
| **Producto** | Item del catálogo. Tiene tipo (RETAIL / RETAIL_INGREDIENTE / ELABORADO_SIN_VARIACION / ELABORADO_CON_VARIACION / COMBO). |
| **Presentación** | Variante de empaque/tamaño de un producto. Ej: Botella 500ml, Pack 6. |
| **Código de barra** | EAN/UPC. Múltiples por presentación. |
| **Receta** | Lista de ingredientes con cantidades. |
| **Sabor** | Variante semántica de un producto ELABORADO_CON_VARIACION (ej: Calabresa, Pepperoni). |
| **Variación** (RecetaPresentacion) | Combinación específica (Presentación × Sabor) con su receta única. |
| **Combo** | Bundle de varios productos. |
| **Promoción** | Descuento temporal. |
| **Adicional** | Extra agregable a un producto en venta. Puede tener receta propia. |
| **Observación** | Nota predefinida (SIN GLUTEN, BIEN COCIDO, etc.). |
| **Stock** | Inventario. Calculado por suma de movimientos activos. |
| **Producción** | Registro de fabricación de un elaborado. |

## Ventas

| Término | Definición |
|---|---|
| **Venta** | Transacción comercial. Estados: ABIERTA / CONCLUIDA / CANCELADA. |
| **VentaItem** | Línea de una venta. Estados: ACTIVO / MODIFICADO / CANCELADO. |
| **Comanda** | Tarjeta física con número/código de barras. Para cuentas individuales. Estados: DISPONIBLE / OCUPADO. |
| **Mesa** | Ubicación física del local. |
| **Sector** | Zona del local (Salón A, Barra, Terraza). |
| **Reserva** | Reserva de mesa para cliente. |
| **Delivery** | Servicio domiciliario. Estados: ABIERTO → PARA_ENTREGA → EN_CAMINO → ENTREGADO / CANCELADO. |
| **Cobro rápido** (F2) | Cobra total en moneda principal + forma principal con un click. |
| **Pre-cuenta** | Resumen de cuenta antes de cobrar. |
| **Atajos PdV** | Botones rápidos configurables en el PdV. |

## Compras

| Término | Definición |
|---|---|
| **Proveedor** | Persona/empresa a quien le comprás. |
| **Compra** | Transacción de compra. Estados: ABIERTO (borrador) → FINALIZADO → CANCELADO. |
| **CompraDetalle** | Línea de compra. |
| **ProveedorProducto** | Histórico de precios por proveedor + producto. |
| **Costo promedio ponderado** | Algoritmo que mezcla costo anterior y nuevo según stock. |
| **Tipo de boleta** | LEGAL / COMÚN / OTRO / SIN_COMPROBANTE. |

## Financiero

| Término | Definición |
|---|---|
| **Moneda** | PYG, USD, BRL, etc. |
| **Tipo de cambio** | MonedaCambio: oficial vs local, compra vs venta. |
| **Forma de pago** | Efectivo, tarjeta, transferencia, PIX, etc. |
| **Conteo** | Registro físico de billetes/monedas (apertura/cierre). |
| **Saldo Caja Mayor** | Balance por (caja, moneda, formaPago). Snapshot. |
| **Movimiento** | Cada operación financiera. **Inmutable** — anular crea contra-movimiento. |
| **Anulación** | Generación de contra-movimiento que revierte el original. |
| **Gasto** | Egreso operativo (alquiler, servicios, etc.). Recurrente o único. |
| **Retiro de caja** | Cajero retira efectivo de caja PdV → Caja Mayor. |
| **Entrada varia** | Ingreso extraordinario (donación, recupero, etc.). |
| **Operación financiera** | Transferencia entre cuentas/cajas. 4 tipos: cambio divisa / depósito / retiro / transferencia entre cajas. |
| **Cheque** | Cheque emitido. Estados: EMITIDO / DIFERIDO / COBRADO / ANULADO. |
| **Diferido** | Cheque postfechado. |
| **Saldo reservado** | Plata comprometida en cheques diferidos. |
| **Acreditación POS** | Liquidación bancaria de venta con tarjeta. |
| **CPP/CPC** | Ya definidos arriba. |
| **Cuota** | Pago parcial de CPP o CPC. |

## RRHH

| Término | Definición |
|---|---|
| **Funcionario** | Empleado. Vinculado a una Persona. |
| **Cargo** | Puesto laboral (MOZO, GERENTE). NO es Role del sistema. |
| **Turno** | Horario de trabajo (entrada, salida, tolerancia). |
| **Asistencia** | Registro diario. Estados: PRESENTE / AUSENTE / TARDANZA / MEDIA_FALTA / JUSTIFICADO / FERIADO / VACACION. |
| **Tardanza** | Llegada tarde (diff > tolerancia). |
| **Penalización** | Sanción económica (manual o auto-tardanza). |
| **Justificar** | Validar una asistencia con motivo. Anula penalizaciones auto. |
| **Hora extra** | Horas trabajadas fuera de turno. Tipos: DIURNA / NOCTURNA / FERIADO con recargos diferentes. |
| **Vale** | Adelanto de plata al empleado. Ciclo: SOLICITADO → CONFIRMADO → DESCONTADO / ANULADO. |
| **Adelanto** | Vale específicamente de "parte del sueldo del mes". |
| **Préstamo a funcionario** | CPP tipo PRESTAMO_FUNCIONARIO. Multi-cuotas. |
| **Liquidación de sueldo** | Cálculo mensual del salario. Estados: BORRADOR → APROBADA → PAGADA / ANULADA. |
| **Liquidación final** | Liquidación al egreso. Incluye indemnización, vacaciones no gozadas, aguinaldo proporcional. |
| **Indemnización** | Compensación por DESPIDO_INJUSTIFICADO. 15 jornales por año (configurable). |
| **Aguinaldo** | 13° salario. 1/12 del total ganado. |
| **Bono** | Bonificación adicional. Manual o recurrente. |
| **Vacación** | Acumulado anual de días por año de servicio. |
| **Vacación período** | Período específico de goce. Estados: PROGRAMADA / EN_CURSO / GOZADA / CANCELADA. |
| **Prescripción** | Vacaciones perdidas tras 24 meses sin gozar. |
| **IPS** | Aporte previsional Paraguay (9% empleado, 16.5% empresa). |

## Comisiones

| Término | Definición |
|---|---|
| **Regla de comisión** | Configuración que determina cómo calcular incentivos. 6 tipos. |
| **META_UNIDADES** | Si vende N unidades → monto fijo. |
| **PORCENTAJE_VENTA** | % sobre el total vendido. |
| **META_VENTA_LOCAL** | Si total monto ≥ X → monto fijo. |
| **EXTRA_MANUAL** | Bonus mensual fijo. |
| **PENALIZACION_MANUAL** | Resta. |
| **EQUIPO_PORCENTAJE** | Distribuye entre miembros de un equipo. |
| **TODO_O_NADA** | Cumple meta o cero. |
| **PROPORCIONAL** | Reduce proporcional al cumplimiento. |
| **Equipo de comisión** | Grupo de funcionarios con porcentaje de reparto. |
| **Liquidación de comisión** | Cálculo mensual de comisión por funcionario. Estados: BORRADOR → APROBADA → INTEGRADA. |
| **Integrada** | Estado tras pagar la liquidación de sueldo que incluyó la comisión. |
| **Vendedor (vendedor_id)** | Usuario asociado a la venta para comisiones. Default: `created_by`. |

## Personas

| Término | Definición |
|---|---|
| **Persona** | Entidad raíz. Datos personales (nombre, documento, etc.). |
| **Usuario** | Persona + credenciales de sistema. |
| **Cliente** | Persona + datos comerciales (RUC, crédito, saldo). |
| **Funcionario** | Persona + datos laborales. |
| **Proveedor** | Persona + datos comerciales como vendedor. |
| **Tipo de cliente** | Mayorista / Minorista / Delivery / VIP. |
| **Saldo cliente** | `Cliente.saldoActual`. Monto adeudado. |
| **Movimiento de cliente** | Registro de cargos/pagos del cliente. |

## Permisos

| Término | Definición |
|---|---|
| **Role** | Rol del sistema (Administrador, Cajero, Mozo). |
| **Permission** | Permiso granular (RRHH_VALE_CONFIRMAR, etc.). 56 códigos seed. |
| **UsuarioRole** | M:N usuario-rol. |
| **RolePermission** | M:N rol-permiso. |

## Personalización

| Término | Definición |
|---|---|
| **Dashboard Shortcut** | Acceso rápido personalizable en el Home u otros dashboards. |
| **Tema** | Light / Dark. Persiste en localStorage. |
| **Sesión** | LoginSession. JWT 7 días. |

---

**Fin del manual** 🎉

Si querés profundizar en arquitectura técnica, ver:
- [architecture/](../architecture/)
- [domains/](../domains/)
- [conventions/](../conventions/)
- [workflows/](../workflows/)
- [reference/](../reference/)

Para preguntas, contactar al equipo de desarrollo.
