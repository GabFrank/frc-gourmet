# Capítulo 10 — Qué falta en mobile (y se hace desde el escritorio)

La app mobile cubre las **tareas administrativas** del día a día. Otras funciones, más
complejas o con efectos contables/operativos, **siguen en la app de escritorio**. Este
capítulo te dice claramente qué buscar en cada lado, para que no pierdas tiempo.

## Resumen rápido

| Necesito… | ¿Dónde? |
|---|---|
| Consultar y mantener datos maestros (cargos, personas, funcionarios, clientes, usuarios, categorías, familias, adicionales) | ✅ **Mobile** |
| Revisar vales, liquidaciones, comisiones, cajas, cuentas por cobrar, compras, proveedores, productos | ✅ **Mobile** (solo lectura) |
| Vender (Punto de Venta, mesas, comandas, delivery, cobros) | 💻 Escritorio |
| Cargar recetas, sabores y variaciones | 💻 Escritorio |
| Operar la Caja Mayor (egresos, ingresos, anulaciones) | 💻 Escritorio |
| Crear/editar monedas | 💻 Escritorio |
| Registrar una compra nueva o importar facturas con IA | 💻 Escritorio |
| Confirmar un vale, generar una liquidación, cambiar cargo/salario, cobrar/pagar | 💻 Escritorio |
| Ver reportes y dashboards | 💻 Escritorio |

## Detalle de lo que NO está en mobile (todavía)

### Punto de Venta (PdV)

Vender, manejar mesas, comandas, delivery y cobrar. Es la operación más sensible del
sistema y se hace en la PC del local con la app de escritorio.

### Recetas y Sabores

La gestión de recetas, sabores y variaciones (como las pizzas multi-sabor) involucra
varias pantallas relacionadas y queda en el escritorio. En mobile aparecen como **"pronto"**
dentro de Productos.

### Caja Mayor y Monedas

Los movimientos de la Caja Mayor (egresos, ingresos, anulaciones) y el alta de monedas se
manejan en el escritorio. En Finanzas aparecen como **"pronto"**.

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
