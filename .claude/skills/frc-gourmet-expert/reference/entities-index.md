# Índice de entidades

~170 entidades. Todas extienden `BaseModel` (id, createdAt, updatedAt, createdBy, updatedBy). Listadas en `src/app/database/entities/<dominio>/`.

## Personas (9)

| Entidad | Tabla | Notas |
|---|---|---|
| Persona | `personas` | Entidad raíz para Usuario/Cliente/Funcionario |
| Usuario | `usuarios` | nickname UNIQUE, password ⚠️ texto plano |
| Role | `roles` | Rol del sistema |
| UsuarioRole | `usuario_roles` | M:N |
| Permission | `permissions` | codigo UNIQUE UPPERCASE |
| RolePermission | `role_permissions` | M:N |
| Cliente | `clientes` | Persona + datos comerciales (saldoActual, credito) |
| TipoCliente | `tipo_clientes` | Mayorista/Minorista/etc. |
| LoginSession | `login_sessions` | (en `auth/`) |

## Personalización (1)

| Entidad | Tabla | Notas |
|---|---|---|
| DashboardShortcut | `dashboard_shortcuts` | Accesos rápidos personalizados |

## Productos (~30)

| Entidad | Tabla | Notas |
|---|---|---|
| Familia | `familias` | |
| Subfamilia | `subfamilias` | |
| Producto | `productos` | tipo: ProductoTipo. Campos clave: `iva` (int 0/5/10, default 10, para SIFEN futuro), `registroCompleto` (boolean, default true; productos creados desde import OCR arrancan en false → chip "Parcial"). `subfamilia` es **nullable** (productos parciales sin clasificar). |
| Presentacion | `presentaciones` | |
| CodigoBarra | `codigos_barra` | N por presentación |
| PrecioVenta | `precios_venta` | Polimórfico (presentacion / receta / producto / recetaPresentacion) |
| PrecioCosto | `precios_costo` | fuente: COMPRA / MANUAL / AJUSTE_RECETA |
| Receta | `recetas` | + costoCalculado cache |
| RecetaIngrediente | `receta_ingredientes` | |
| RecetaIngredienteIntercambiable | `receta_ingredientes_intercambiables` | |
| Adicional | `adicionales` | Con receta opcional |
| RecetaAdicionalVinculacion | `receta_adicional_vinculacion` | Precio específico por receta |
| Observacion | `observaciones` | descripcion UNIQUE |
| ProductoObservacion | `producto_observacion` | M:N |
| TamanhoPizza | `tamanhos_pizza` | LEGACY |
| SaborPizza | `sabores_pizza` | LEGACY |
| EnsambladoPizza | `ensamblados_pizza` | LEGACY |
| EnsambladoPizzaSabor | `ensamblados_pizza_sabor` | LEGACY |
| Combo | `combos` | |
| ComboProducto | `combo_productos` | Componentes |
| Promocion | `promociones` | Sin UI ni motor |
| PromocionPresentacion | `promocion_presentacion` | M:N |
| Sabor | `sabores` | Para ELABORADO_CON_VARIACION |
| RecetaPresentacion | `recetas_presentaciones` | Variación = Presentación × Sabor + Receta única |
| Produccion | `producciones` | Sin UI |
| ProduccionIngrediente | `produccion_ingredientes` | |
| StockMovimiento | `stock_movimientos` | |
| ConfiguracionMonetaria | `configuraciones_monetarias` | Moneda principal del sistema |
| ConversionMoneda | `conversiones_moneda` | Histórico de tasas |
| RecetaAdicional | `receta_adicional` | LEGACY (deprecated por RecetaAdicionalVinculacion) |

## Ventas (22)

| Entidad | Tabla | Notas |
|---|---|---|
| Venta | `ventas` | estado: ABIERTA / CONCLUIDA / CANCELADA |
| VentaItem | `venta_items` | estado: ACTIVO / MODIFICADO / CANCELADO |
| VentaItemSabor | `venta_item_sabores` | Multi-sabor pizza |
| VentaItemAdicional | `venta_item_adicionales` | Extras |
| VentaItemIngredienteModificacion | `venta_item_ingrediente_modificaciones` | REMOVIDO / INTERCAMBIADO |
| VentaItemObservacion | `venta_item_observaciones` | predefinida o libre |
| PdvMesa | `pdv_mesas` | estado: DISPONIBLE / OCUPADO |
| Sector | `sectores` | Salón A, Barra, Terraza |
| Reserva | `reservas` | UI parcial |
| Delivery | `deliveries` | estado: ABIERTO → PARA_ENTREGA → EN_CAMINO → ENTREGADO / CANCELADO |
| PrecioDelivery | `precios_delivery` | Zona + valor |
| Comanda | `comandas` | Tarjeta cocina, estado: DISPONIBLE / OCUPADO |
| ComandaItem | `comanda_items` | estado: PENDIENTE / EN_PREPARACION / LISTO / ENTREGADO / CANCELADO |
| PdvGrupoCategoria | `pdv_grupo_categoria` | LEGACY (parcial uso) |
| PdvCategoria | `pdv_categoria` | LEGACY |
| PdvCategoriaItem | `pdv_categoria_item` | LEGACY |
| PdvItemProducto | `pdv_item_producto` | LEGACY |
| PdvAtajoGrupo | `pdv_atajo_grupos` | Sistema actual de atajos |
| PdvAtajoItem | `pdv_atajo_items` | Botones |
| PdvAtajoGrupoItem | `pdv_atajo_grupo_items` | M:N |
| PdvAtajoItemProducto | `pdv_atajo_item_productos` | M:N atajo→producto |
| PdvConfig | `pdv_config` | Config global PdV (1 fila) |

## Compras (13)

| Entidad | Tabla | Notas |
|---|---|---|
| Proveedor | `proveedores` | |
| ProveedorProducto | `proveedores_productos` | Histórico precios por proveedor |
| Compra | `compras` | estado: ABIERTO / FINALIZADO / CANCELADO |
| CompraDetalle | `compras_detalles` | |
| CompraCategoria | `compra_categorias` | Jerárquica |
| CompraCuota | `compras_cuotas` | DEPRECATED (reemplazado por CuentaPorPagarCuota) |
| Pago | `pagos` | DEPRECATED |
| PagoDetalle | `pagos_detalles` | DEPRECATED |
| FormasPago | `formas_pago` | Tabla general (PYG, USD, Tarjeta, etc.) |
| DocumentoCompraImportado | `documentos_compra_importados` | Factura subida vía OCR + IA. Estado PENDIENTE/PROCESANDO/REQUIERE_REVISION/CONFIRMADO/ERROR/DESCARTADO. Vinculada a Compra al confirmar. |
| OcrAliasProveedor | `ocr_aliases_proveedor` | Mapeo `(textoOcr o rucOcr) → Proveedor`. `vecesUsado >= 2` = match ALTA |
| OcrAliasProducto | `ocr_aliases_producto` | Mapeo `(proveedor + textoOcr) → Producto + Presentacion`. Aprende por proveedor (mismo "POLLO 1KG" puede ser distinto producto según proveedor) |
| (Estado/TipoBoleta/DocumentoEstado enums) | — | |

## Financiero (~30)

| Entidad | Tabla | Notas |
|---|---|---|
| Moneda | `monedas` | principal: PYG |
| MonedaBillete | `monedas_billetes` | Denominaciones físicas |
| MonedaCambio | `monedas_cambio` | Tasas oficial / local |
| TipoPrecio | `tipo_precio` | NORMAL / MAYORISTA / etc. |
| Dispositivo | `dispositivos` | Hardware POS |
| Caja | `cajas` | PdV registradora |
| CajaMoneda | `cajas_monedas` | M:N caja-moneda |
| Conteo | `conteos` | Apertura/cierre |
| ConteoDetalle | `conteos_detalles` | Por billete |
| **CajaMayor** | `cajas_mayor` | Ledger central |
| **CajaMayorMovimiento** | `cajas_mayor_movimientos` | 28 tipos, inmutable |
| **CajaMayorSaldo** | `cajas_mayor_saldos` | Snapshot por (cm, mon, fp) |
| **CajaMayorConfiguracion** | `cajas_mayor_configuraciones` | Visibilidad cards + M:N FPs/Cuentas |
| Gasto | `gastos` | + GastoCategoria + GastoDetalle |
| GastoCategoria | `gastos_categorias` | Jerárquica |
| GastoDetalle | `gastos_detalles` | Multi-moneda en mismo gasto |
| RetiroCaja | `retiros_caja` | + RetiroCajaDetalle |
| RetiroCajaDetalle | `retiros_caja_detalle` | |
| EntradaVaria | `entradas_varias` | Destino dual (CM o banco) |
| EntradaVariaCategoria | `entradas_varias_categorias` | |
| OperacionFinanciera | `operaciones_financieras` | 4 tipos (CAMBIO_DIVISA, DEPOSITO_BANCARIO, RETIRO_BANCARIO, TRANSFERENCIA_ENTRE_CAJAS) |
| OperacionFinancieraCategoria | `operaciones_financieras_categorias` | |
| **CuentaBancaria** | `cuentas_bancarias` | saldo + saldoReservado |
| **MovimientoBancario** | `movimientos_bancarios` | Manual, no toca CM |
| **MaquinaPos** | `maquinas_pos` | + porcentajeComision + minutosAcreditacion |
| **AcreditacionPos** | `acreditaciones_pos` | Scheduler 5 min |
| **Chequera** | `chequeras` | numeroInicial / siguiente |
| **Cheque** | `cheques` | EMITIDO / DIFERIDO / COBRADO / ANULADO |
| **CuentaPorPagar** | `cuentas_por_pagar` | tipo: COMPRA / PRESTAMO / PRESTAMO_FUNCIONARIO / OTRO |
| **CuentaPorPagarCuota** | `cuentas_por_pagar_cuotas` | |
| **CuentaPorCobrar** | `cuentas_por_cobrar` | tipo: CREDITO_VENTA / PRESTAMO_CLIENTE / OTRO |
| **CuentaPorCobrarCuota** | `cuentas_por_cobrar_cuotas` | |
| **MovimientoCliente** | `movimientos_cliente` | Tracking saldoActual cliente |

## RRHH (~40)

| Entidad | Tabla | Notas |
|---|---|---|
| ConfiguracionRrhh | `configuraciones_rrhh` | clave UNIQUE |
| Cargo | `cargos` | |
| Funcionario | `funcionarios` | |
| HistoricoCargo | `historicos_cargo` | |
| HistoricoSalario | `historicos_salario` | |
| FuncionarioDocumento | `funcionarios_documentos` | Filesystem path |
| Turno | `turnos` | horaEntrada/Salida + tolerancia |
| FuncionarioTurno | `funcionarios_turnos` | Vigencia |
| Asistencia | `asistencias` | INDEX (funcionario, fecha) |
| Penalizacion | `penalizaciones` | autoGenerada / manual |
| Feriado | `feriados` | UNIQUE fecha |
| HoraExtra | `horas_extra` | DIURNA / NOCTURNA / FERIADO |
| Vale | `vales` | SOLICITADO → CONFIRMADO → DESCONTADO / ANULADO |
| MotivoVale | `motivos_vale` | Catálogo |
| LiquidacionSueldo | `liquidaciones_sueldo` | INDEX (funcionario, periodo) |
| LiquidacionItem | `liquidaciones_items` | HABER / DESCUENTO |
| LiquidacionConcepto | `liquidaciones_conceptos` | Catálogo |
| Bono | `bonos` | + recurrencia |
| Aguinaldo | `aguinaldos` | CALCULADO / APROBADO / PAGADO |
| Vacacion | `vacaciones` | INDEX (funcionario, anioServicio) |
| VacacionPeriodo | `vacaciones_periodos` | PROGRAMADA / EN_CURSO / GOZADA / CANCELADA |
| LiquidacionFinal | `liquidaciones_final` | + indemnización + vac no gozadas + aguinaldo prop |
| LiquidacionFinalItem | `liquidaciones_final_items` | |
| ReglaComision | `reglas_comision` | 6 tipos |
| ReglaComisionProducto | `reglas_comision_productos` | |
| ReglaComisionRequisito | `reglas_comision_requisitos` | |
| FuncionarioReglaComision | `funcionarios_reglas_comision` | Vigencia |
| EquipoComision | `equipos_comision` | |
| EquipoComisionMiembro | `equipos_comision_miembros` | porcentajeReparto |
| EquipoComisionRegla | `equipos_comision_reglas` | |
| LiquidacionComision | `liquidaciones_comision` | BORRADOR / APROBADA / INTEGRADA / ANULADA |
| LiquidacionComisionItem | `liquidaciones_comision_items` | |
| NotificacionRrhh | `notificaciones_rrhh` | claveDedupe UNIQUE |

## Auth (1)

| Entidad | Tabla | Notas |
|---|---|---|
| LoginSession | `login_sessions` | Sesiones JWT (token NO persistido) |

## Printer (1)

| Entidad | Tabla | Notas |
|---|---|---|
| Printer | `printers` | epson/star/thermal |

## Listas para programáticamente

Lista completa registrada en `src/app/database/entities/index.ts` y en el array `entities` de `database.config.ts:185-341`.
