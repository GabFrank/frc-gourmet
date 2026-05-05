# Capítulo 17 — Reportes y dashboards

## 1. Dashboards disponibles

### Home

**Menu → Dashboard**.

- Acceso rápido a todos los módulos.
- Tarjetas personalizables (capítulo 1).

### Dashboard de Ventas

**Menu → Ventas → Dashboard**.

- Botones: Abrir PdV, Listado de ventas, Gestionar mesas, Configuración PdV.
- Tarjetas con KPIs (TODO en algunos).

### Dashboard de Productos

**Menu → Productos → Dashboard**.

- Cards de Productos, Recetas, Sabores, Adicionales.

### Dashboard de Compras

**Menu → Compras → Dashboard**.

- Cards: Compras, Proveedores, Categorías.
- Botón "Nueva compra".

### Dashboard Financiero

**Menu → Financiero → Dashboard**.

- Resumen de cajas, monedas, caja mayor, cuentas por cobrar.

### Dashboard Caja Mayor

Detalle del Caja Mayor. Ya cubierto en capítulo 8.

### Dashboard RRHH (Fase 8)

**Menu → Recursos Humanos → Dashboard RRHH**.

KPIs:
- **Total nómina mes actual**: SUM totalNeto liquidaciones PAGADA.
- **% Asistencia mes**: (PRESENTE + TARDANZA) / días laborales.
- **Vales pendientes**: SUM CONFIRMADO.
- **Préstamos activos**: SUM cuotas VENCIDA.
- **Próximos cumpleaños** (30 días).
- **Vacaciones próximas** (30 días, PROGRAMADA + EN_CURSO).
- **Top 5 vendedores**: SUM comisiones del mes.
- **Gráfico**: evolución asistencia últimos 3 meses (Chart.js).

## 2. Reportes RRHH

**Menu → Recursos Humanos → Reportes**.

Selector de tipo de reporte:

### Nómina del mes

- Filtros: período (YYYY-MM).
- Tabla: funcionario, salario base, haberes, descuentos, neto.
- Exports: PDF, Excel.

### Asistencia por rango

- Filtros: fechaDesde, fechaHasta, funcionario opcional.
- Tabla: funcionario, días PRESENTE, TARDANZA, AUSENTE, VACACION, total.

### Vales pendientes

- Tabla: funcionario, fecha vale, monto, estado, motivo.

### Préstamos activos

- Tabla: funcionario, monto total, pagado, saldo, cuotas vencidas.

### Vacaciones

- Tabla: funcionario, año servicio, días generados, gozados, disponibles, prescripción.

### Comisiones

- Filtros: período.
- Tabla: funcionario, total calculado, estado.

### Liquidaciones

- Filtros: período, funcionario.
- Lista completa con detalles.

## 3. Notificaciones RRHH

**Menu → Recursos Humanos → Notificaciones**.

Lista filtrable por:
- Tipo (CUMPLEANIOS, CUOTA_VENCIDA, VACACION_PROXIMA, etc.).
- Prioridad (ALTA / MEDIA / BAJA).
- Leídas / no leídas.
- Funcionario.

**Click en notificación**:
- Abre destino (ej: notificación de cuota → abre CPP).
- Marca como leída.

### Generación

El sistema corre cada 24h y genera notificaciones automáticas:
- **CUMPLEANIOS**: funcionarios con cumpleaños hoy.
- **CUOTA_VENCIDA**: CPP con cuotas vencidas.
- **VACACION_PROXIMA**: períodos a punto de terminar (±3 días).
- **LIQUIDACION_PENDIENTE**: APROBADA hace > 5 días sin pagar.
- **COMISION_PENDIENTE**: APROBADA no integrada.
- **DOCUMENTO_VENCE**: documentos con vencimiento ≤ hoy + 30 días.

Deduplicación automática (no se generan duplicados).

## 4. Listados con filtros

Cada módulo tiene sus listas con filtros propios. Patrón general:

### Filtros
- **Rangos rápidos**: HOY, ESTA SEMANA, ESTE MES, ÚLTIMO TRIMESTRE.
- **Datepicker**: desde / hasta.
- **Estado**: dropdown.
- **Búsqueda libre**: nombre / nota / descripción.
- Específicos del dominio (proveedor, cliente, mesa, etc.).

Botón **"Filtrar"** explícito (no live filtering).
Botón **"Reset"** para limpiar.
**Badge** con cantidad de filtros activos.

### Paginación

Mat-paginator con 25 / 50 / 100 ítems por página. Localizado en español ("1 - 25 de 153").

### Acciones

Columna `acciones` con `mat-menu` (icono ⋮) — ver / editar / eliminar / acciones específicas.

## 5. Exports

### PDF (`pdfmake`)

Disponible en reportes RRHH. Formato:
- Encabezado con logo + datos del negocio.
- Tabla con datos.
- Pie con paginación + fecha.

### Excel (`exceljs`)

Disponible en reportes RRHH:
- Hoja con tabla.
- Columnas con formato (moneda, fecha).
- Auto-ancho.

## 6. Dashboards personalizados (DashboardShortcut)

En el **Home Dashboard**, podés agregar accesos rápidos personalizados:

1. Click "+" en el dashboard.
2. Elegir destino:
   - Caja Mayor específica.
   - Una compra específica.
   - Lista filtrada (Acreditaciones POS pendientes, CPP vencidas).
3. Asignar título, icono, color.
4. Aparece como tarjeta clickeable.

Tipos de target soportados (algunos):
- CAJA_MAYOR_DETALLE
- ACREDITACIONES_POS
- CUENTAS_POR_PAGAR
- VENTAS_LISTADO
- LIQUIDACIONES
- (extensible)

`targetData` (JSON): params específicos. Ej: `{ cajaMayorId: 1, estado: "ABIERTA" }`.

Visibilidad:
- **Personal** (`usuario_id` set): solo vos lo ves.
- **Global** (`usuario_id = null`): todos los usuarios.

Permisos para crear globales: típicamente solo admin.

## 7. Tipos de gráficos

Implementados con `chart.js` + `ng2-charts`:

- **Línea**: evolución temporal (asistencia, ventas, nómina).
- **Barras**: comparación entre categorías.
- **Pie / Doughnut**: distribución.

Disponibles principalmente en **Dashboard RRHH**. Otros dashboards: TODO.

## 8. Estadísticas en tiempo real

PdV refresca cada 1 segundo el estado de mesas. No hay otros widgets en tiempo real.

## 9. Auditoría

Cada entidad tiene `createdAt`, `createdBy`, `updatedAt`, `updatedBy`. En vistas de detalle podés ver quién creó / modificó cada registro.

Los movimientos de Caja Mayor son **inmutables**: anular crea un contra-movimiento. El histórico completo nunca se pierde.

## 10. Pendientes

- Reportes de Ventas con exports.
- Reportes de Compras con exports.
- Dashboard de Ventas con datos reales (actualmente placeholder).
- Estadísticas en tiempo real (websocket).
- Reportes financieros consolidados (flujo de caja, balance).

→ [workflows/todos-pendientes.md](../../workflows/todos-pendientes.md).

---

**Próximo capítulo →** [18 — Solución de problemas](18-solucion-de-problemas.md)
