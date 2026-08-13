# Permisos y roles

## Cómo funcionan los permisos

Cada usuario tiene uno o más **roles** (por ejemplo GERENTE, CAJERO, MOZO). Cada rol
otorga un conjunto de **permisos**. Los permisos son los mismos en la app de escritorio y
en la mobile: si en el escritorio podés gestionar funcionarios, en mobile también.

La app mobile aplica los permisos de **dos maneras**, para que la experiencia sea clara:

1. **Ocultando lo que no podés hacer.** Si no tenés permiso para gestionar una sección, no
   vas a ver el botón **+** (crear) ni la opción **Eliminar** en el menú ⋮. Las pantallas
   quedan en modo "solo lectura" para vos.
2. **Validando en el servidor.** Aunque la app intente una acción, el servidor vuelve a
   chequear el permiso. Si no lo tenés, la operación se rechaza y ves un mensaje
   **"Sin permiso…"**. Esto garantiza que nadie pueda saltarse las reglas.

> Quién tiene cada permiso lo define el **administrador**, asignando roles a los usuarios.
> Eso se hace en el sub-módulo **Usuarios** (ver [Módulo RRHH](04-modulo-rrhh.md)) o desde
> el escritorio.

## Qué permiso necesita cada sección (gestión)

Esta tabla lista el permiso requerido para **crear / editar / eliminar** en cada
sub-módulo de la app mobile. Si solo querés **consultar**, en general alcanza con poder
entrar a la sección.

| Sección | Permiso para gestionar |
|---|---|
| RRHH · Cargos | `RRHH_CONFIG_EDITAR` |
| RRHH · Turnos | `RRHH_CONFIG_EDITAR` |
| RRHH · Motivos de vale | `RRHH_CONFIG_EDITAR` |
| RRHH · Feriados | `RRHH_CONFIG_EDITAR` |
| RRHH · Personas | `PERSONAS_GESTIONAR` |
| RRHH · Funcionarios | `RRHH_FUNCIONARIO_EDITAR` |
| RRHH · Clientes | `CLIENTES_GESTIONAR` |
| RRHH · Tipos de cliente | `CLIENTES_GESTIONAR` |
| RRHH · Usuarios | `USUARIOS_GESTIONAR` |
| Finanzas · Categorías de gasto | `CAJA_MAYOR_OPERAR` |
| Finanzas · Caja Mayor (gastos, ingresos, ajustes, anular) | `CAJA_MAYOR_OPERAR` |
| Compras · Categorías de compra | `COMPRAS_GESTIONAR` |
| Productos · Familias | `CATEGORIAS_GESTIONAR` |
| Productos · Subfamilias | `CATEGORIAS_GESTIONAR` |
| Productos · Adicionales | `ADICIONALES_GESTIONAR` |

Las secciones de **solo consulta** (Vales, Liquidaciones, Cajas, CxC, Compras,
Proveedores, Productos, Comisiones, etc.) no tienen botón de crear/editar en mobile, así
que no dependen de un permiso de gestión para verlas.

**Ventas (meseros)** es visible para cualquier usuario logueado. Tomar pedidos, transferir,
imprimir, etc. se validan en el servidor con los **mismos permisos del PdV** del escritorio.

> **Qué se muestra en la barra de navegación:** **Inicio**, **Ventas** y **Productos** los
> ve cualquier usuario logueado. **Compras**, **Finanzas** y **RRHH** aparecen solo si tu
> usuario tiene al menos un permiso de esa sección (de dashboard, de ver o de gestionar).

## Si te falta un permiso

- **No ves el botón "+" o "Eliminar":** es esperado, no es un error. Significa que tu rol
  no incluye ese permiso.
- **Ves "Sin permiso para guardar / eliminar":** intentaste una acción que tu rol no
  autoriza.

En ambos casos, la solución es que el **administrador** te asigne el rol o permiso
correspondiente (en Usuarios, o desde el escritorio).

---

**Próximo capítulo →** [Solución de problemas](09-solucion-de-problemas.md)
