# Capítulo 0 — Introducción

## ¿Qué es la app mobile de FRC Gourmet?

Es una **aplicación web** (PWA) pensada para usarse desde el **celular o la tablet**.
No se instala desde una tienda: la abrís desde el navegador y, si querés, la "agregás a
la pantalla de inicio" para que quede como un ícono más (ver
[Acceso e instalación](01-acceso-e-instalacion.md)).

La app mobile **no tiene base de datos propia**. Todo lo que ves y guardás viaja por
internet (o por la red del local) hasta la **PC central** donde corre FRC Gourmet de
escritorio. Esa PC es el "servidor". La app mobile es solo una ventana cómoda para
trabajar desde el teléfono.

```
   📱 Celular / Tablet                      💻 PC del local (servidor)
   ┌───────────────────┐                   ┌────────────────────────┐
   │  App mobile (PWA)  │  ── internet ──▶  │  FRC Gourmet escritorio │
   │  Consultar / editar│  ◀── red LAN ──   │  Base de datos central  │
   └───────────────────┘                   └────────────────────────┘
```

## ¿Para qué sirve? (alcance de esta versión)

La versión actual cubre **tareas de mesero** (tomar pedidos en el salón) y **tareas
administrativas** (consultar y mantener al día los datos del negocio). Concretamente,
podés:

- **Ventas (meseros):** abrir mesas y comandas, **tomar el pedido** (agregar/editar ítems,
  escanear códigos, pesables de buffet, variaciones), asignar el cliente, transferir mesa o
  comanda e imprimir la pre-cuenta.
- **RRHH:** gestionar cargos, turnos, feriados, motivos de vale, personas, funcionarios,
  clientes, tipos de cliente y usuarios. Consultar vales, liquidaciones, penalizaciones,
  bonos, aguinaldos, asistencias, horas extra, permisos y notificaciones.
- **Finanzas:** gestionar categorías de gasto y **operar la Caja Mayor** (registrar gastos,
  entradas varias, ajustes y anular movimientos). Consultar cajas, cuentas por cobrar y
  comisiones (reglas, equipos, liquidaciones).
- **Compras:** gestionar categorías de compra. Consultar compras y proveedores.
- **Productos:** gestionar familias, subfamilias y adicionales. Consultar el catálogo de
  productos.

> "Gestionar" = ver, crear, editar y (donde corresponde) eliminar.
> "Consultar" = solo ver la información (las altas/operaciones se hacen en el escritorio).

## ¿Qué NO hace todavía?

La app mobile **no reemplaza** a la de escritorio. No incluye, por ahora:

- **Cobrar / cerrar una venta** (el pago y cierre de la mesa o comanda se hacen en el
  Punto de Venta del escritorio). En mobile el mesero **toma el pedido**, pero no cobra.
- Delivery.
- Recetas y sabores.
- Alta/edición de monedas.
- Importación de facturas con IA (OCR).
- Reportes y dashboards.
- Operaciones de escritura sobre RRHH financiero (confirmar un vale, generar una
  liquidación, cambiar el cargo o salario de un funcionario, cobrar/pagar).

Todo eso se sigue haciendo desde la **app de escritorio**. El detalle está en el
[Qué falta en mobile](10-limitaciones-y-version-escritorio.md).

## ¿A quién está dirigida?

- **Mesero:** tomar pedidos en el salón desde su propio teléfono o tablet, sin ir a la caja.
- **Dueño / Gerente / Administrador:** revisar y mantener datos desde cualquier lado,
  sin tener que ir a la PC.
- **Encargado de RRHH:** dar de alta funcionarios, personas, usuarios; consultar vales y
  liquidaciones.
- **Encargado de Compras / Productos:** mantener categorías, proveedores, familias.

Lo que cada persona puede ver o cambiar **depende de sus permisos** (los mismos que en el
escritorio). Ver [Permisos y roles](08-permisos-y-roles.md).

## Requisitos

- Un celular o tablet con navegador moderno (Chrome, Safari, Edge, Firefox).
- Que la **PC del local esté encendida y en "modo servidor"** (lo configura el
  administrador en la app de escritorio: *Sistema → Modo de operación → Servidor*).
- Estar conectado a la **misma red del local** o, si estás afuera, a la red privada
  (mesh) que conecta tu teléfono con esa PC. Ver [Acceso e instalación](01-acceso-e-instalacion.md).

## Conceptos rápidos

- **Servidor:** la PC del local que tiene los datos. La app mobile se conecta a ella.
- **Sin conexión:** si esa PC está apagada o no se la alcanza por la red, la app muestra
  un aviso "Sin conexión" y **no permite hacer acciones** (no hay modo offline).
- **Sesión:** una vez que iniciás sesión, la app te mantiene logueado bastante tiempo,
  renovando tu acceso sola por detrás. Ver [Iniciar sesión y navegar](02-login-y-navegacion.md).
- **MAYÚSCULAS:** como en todo FRC Gourmet, los textos (nombres, descripciones) se
  guardan en mayúsculas automáticamente. Las únicas excepciones son el **usuario
  (nickname)** y la **contraseña**, que respetan lo que escribís.

---

**Próximo capítulo →** [01 — Acceso e instalación](01-acceso-e-instalacion.md)
