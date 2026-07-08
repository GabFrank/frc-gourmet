# Qué falta en mobile (y se hace desde el escritorio)

La app mobile cubre las **tareas administrativas** del día a día. Otras funciones, más
complejas o con efectos contables/operativos, **siguen en la app de escritorio**. Este
capítulo te dice claramente qué buscar en cada lado, para que no pierdas tiempo.

## Resumen rápido

| Necesito… | ¿Dónde? |
|---|---|
| Consultar y mantener datos maestros (cargos, personas, funcionarios, clientes, usuarios, categorías, familias, adicionales) | ✅ **Mobile** |
| Revisar vales, liquidaciones, comisiones, cajas, cuentas por cobrar, compras, proveedores, productos | ✅ **Mobile** (solo lectura) |
| Tomar pedidos en mesas y comandas (mesero) | ✅ **Mobile** |
| Operar la Caja Mayor (gastos, ingresos, ajustes, anular) | ✅ **Mobile** |
| **Cobrar / cerrar** una venta (pago de la mesa o comanda) | 💻 Escritorio (caja / PdV) |
| Delivery | 💻 Escritorio |
| Cargar recetas, sabores y variaciones | 💻 Escritorio |
| Crear/editar monedas | 💻 Escritorio |
| Registrar una compra nueva o importar facturas con IA | 💻 Escritorio |
| Confirmar un vale, generar una liquidación, cambiar cargo/salario, cobrar/pagar | 💻 Escritorio |
| Ver reportes y dashboards | 💻 Escritorio |

## Detalle de lo que NO está en mobile (todavía)

### Cobro / cierre de ventas y delivery

En mobile el mesero **toma el pedido** (mesas y comandas), pero el **cobro y cierre** de la
venta —elegir formas de pago, vuelto, facturación— se hacen en la **caja (PdV del
escritorio)**. La **pre-cuenta** que imprime el mesero es solo informativa. El **delivery**
también se maneja en el escritorio. Ver [Módulo Ventas — meseros](04-modulo-ventas-meseros.md).

### Recetas y Sabores

La gestión de recetas, sabores y variaciones (como las pizzas multi-sabor) involucra
varias pantallas relacionadas y queda en el escritorio. En mobile aparecen como **"pronto"**
dentro de Productos. (Sí podés **vender** un producto con variaciones/sabores al tomar un
pedido; lo que no está en mobile es **gestionar** las recetas y los sabores.)

### Monedas

El alta/edición de monedas se maneja en el escritorio. En Finanzas aparece como
**"pronto"**. (La **Caja Mayor sí se opera desde mobile**: gastos, ingresos, ajustes y
anulaciones; ver [Módulo Finanzas](05-modulo-finanzas.md).)

### Compras nuevas e Importación con IA

En mobile podés **consultar** compras y proveedores y **gestionar categorías de compra**,
pero **registrar una compra nueva** (con su detalle y pago) y la **importación de facturas
con OCR/IA** se hacen en el escritorio. "Importaciones IA" aparece como **"pronto"**.

### Operaciones de escritura en RRHH financiero

En mobile **consultás** vales, liquidaciones, penalizaciones, bonos y aguinaldos, pero las
**operaciones que los crean o cierran** se hacen en el escritorio, porque tienen reglas y
efectos contables (afectan la Caja Mayor, generan movimientos):

- Confirmar / pagar un vale.
- Generar una liquidación de sueldo o de comisión.
- Cambiar el **cargo** o el **salario** de un funcionario (genera historial).
- Cobrar una cuenta por cobrar / pagar una cuenta por pagar.

### Reportes y dashboards

Los tableros con indicadores y los reportes están en el escritorio.

### Configuración del sistema

Impresoras, dispositivos, modo de operación, backups y demás ajustes técnicos son del
escritorio (y normalmente los maneja el administrador).

## ¿Por qué esta separación?

La idea del MVP mobile fue darte **movilidad para lo administrativo** (lo que más se
necesita consultar y mantener fuera de la PC) de forma simple y segura, dejando las
operaciones críticas y multi-pantalla en el escritorio, donde ya están maduras y probadas.
Con el tiempo se irán habilitando más funciones en mobile (las verás pasar de **"pronto"**
a disponibles).

---

**Volver al índice →** [README](README.md)
