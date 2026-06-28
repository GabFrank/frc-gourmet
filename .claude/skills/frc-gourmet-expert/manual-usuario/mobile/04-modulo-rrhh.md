# Módulo RRHH (Recursos Humanos)

Es el módulo administrativo más completo de la app mobile. Entrás tocando **RRHH** (👥) en
la navegación (aparece solo si tu usuario tiene permiso de RRHH). Vas a ver una grilla de
tarjetas con todos los sub-módulos.

> El destino **RRHH** en la barra solo se muestra a usuarios con algún permiso de RRHH (ver
> dashboard o ver funcionarios). Ver [Permisos y roles](08-permisos-y-roles.md).

> Antes de leer este capítulo conviene tener claro cómo funcionan las listas y los
> formularios en general → [Cómo usar las listas y los formularios](03-como-usar-listas-y-formularios.md).

Los sub-módulos se dividen en dos grupos:

- **Se pueden gestionar** (crear / editar / eliminar): Cargos, Turnos, Motivos de vale,
  Feriados, Personas, Funcionarios, Clientes, Tipos de cliente, Usuarios.
- **Solo consulta** (ver, sin crear desde mobile): Vales, Liquidaciones, Penalizaciones,
  Bonos, Aguinaldos, Asistencias, Horas extra, Permisos, Notificaciones.

---

## A. Sub-módulos que podés gestionar

### Cargos

Los puestos de trabajo (MOZO, COCINERO, CAJERO…).

- **Campos:** Nombre, Descripción (opcional), Salario de referencia (opcional), Activo.
- **Permiso:** `RRHH_CONFIG_EDITAR`.
- El salario de referencia es solo orientativo; el salario real de cada empleado se define
  en el Funcionario.

### Turnos

Las franjas horarias de trabajo.

- **Campos típicos:** Nombre/descripción del turno y sus horarios, Activo.
- **Permiso:** `RRHH_CONFIG_EDITAR`.

### Motivos de vale

El catálogo de razones por las que se da un vale a un empleado (ADELANTO, PRÉSTAMO, etc.).

- **Campos:** Nombre, Activo.
- **Permiso:** `RRHH_CONFIG_EDITAR`.

### Feriados

El calendario de días no laborables.

- **Campos:** Fecha y descripción del feriado, Activo.
- **Permiso:** `RRHH_CONFIG_EDITAR`.

### Personas

El registro base de cualquier persona (datos de identidad). Una **Persona** es el dato
común que después se usa para crear un **Funcionario**, un **Cliente** o un **Usuario**.

- **Campos:** Nombre, Apellido, documento, contacto, etc.
- **Permiso:** `PERSONAS_GESTIONAR`.
- **Buen orden de trabajo:** primero creás la Persona, después la convertís en Funcionario,
  Cliente o Usuario según corresponda.

### Funcionarios

Los empleados del negocio. Es el formulario más detallado.

- **Permiso:** `RRHH_FUNCIONARIO_EDITAR`.
- **Al CREAR un funcionario** elegís:
  - **Persona** (de la lista; tiene que existir antes).
  - **Cargo.**
  - **Moneda del salario** (viene preseleccionada la moneda principal del sistema).
  - **Fecha de ingreso.**
  - **Salario base.**
  - Datos opcionales: Código interno, si es **jornalero** (y su valor de jornal),
    observación, Activo.
- **Al EDITAR un funcionario**, algunos campos quedan **bloqueados** y no se pueden tocar:
  Persona, Cargo, Moneda, Fecha de ingreso y Salario base. Esto es a propósito:
  - Cambiar el **cargo** o el **salario** de un empleado no es una simple edición: genera
    historial. Esos cambios se hacen desde la **app de escritorio** (flujos de cambio de
    cargo / ajuste salarial).
  - En mobile, al editar solo podés cambiar: Código interno, jornalero / valor de jornal,
    observación y el estado **Activo**.
- **No se puede eliminar** un funcionario desde mobile. Para "darlo de baja", apagá el
  interruptor **Activo** en el formulario.

### Clientes

Los clientes del negocio (para ventas a crédito, fidelización, etc.).

- **Permiso:** `CLIENTES_GESTIONAR`.
- Un Cliente vincula una **Persona** (ya existente) con un **Tipo de cliente**. Elegís
  ambos en el formulario.

### Tipos de cliente

Las categorías de clientes (MINORISTA, MAYORISTA, VIP…), usadas para precios y beneficios.

- **Campos:** Nombre/denominación, Activo.
- **Permiso:** `CLIENTES_GESTIONAR`.

### Usuarios

Las cuentas que pueden iniciar sesión en el sistema (escritorio y mobile).

- **Permiso:** `USUARIOS_GESTIONAR`.
- **Campos:**
  - **Usuario (nickname):** se respeta tal cual lo escribís (no se pasa a mayúsculas).
  - **Persona** asociada (opcional, de la lista).
  - **Contraseña:** **obligatoria al crear**. (El cambio de contraseña de un usuario
    existente es un flujo aparte: desde mobile no se cambia la contraseña al editar.)
  - **Roles:** una lista de selección múltiple. Marcá uno o varios roles; al guardar, la
    app calcula qué roles agregar y cuáles quitar.
  - **Activo.**
- Los **roles** determinan qué permisos tiene el usuario. Ver
  [Permisos y roles](08-permisos-y-roles.md).

---

## B. Sub-módulos de solo consulta

Estos te dejan **ver** los registros pero **no crearlos ni editarlos** desde mobile. Las
altas y operaciones (confirmar un vale, generar una liquidación, etc.) se hacen en la app
de escritorio. Cada tarjeta muestra el funcionario, la fecha, el motivo/concepto, el monto
y, cuando aplica, una etiqueta de **estado**.

| Sub-módulo | Qué muestra |
|---|---|
| **Vales** | Adelantos y préstamos dados a empleados, con monto y estado |
| **Liquidaciones** | Liquidaciones de sueldo, con su monto neto/total |
| **Penalizaciones** | Descuentos por tardanzas/faltas, con monto |
| **Bonos** | Bonos otorgados |
| **Aguinaldos** | Aguinaldos calculados |
| **Asistencias** | Registros de asistencia |
| **Horas extra** | Horas extra registradas |
| **Permisos** | Catálogo de permisos del sistema (referencia) |
| **Notificaciones** | Avisos de RRHH (cumpleaños, vencimientos), con estado Leída/Nueva |

> ¿Por qué solo consulta? Estas operaciones tienen reglas y efectos contables (afectan la
> Caja Mayor, generan movimientos, etc.) que por ahora se manejan únicamente en el
> escritorio para evitar errores. La app mobile te sirve para **revisarlas estando fuera
> de la PC**. Ver [Qué falta en mobile](10-limitaciones-y-version-escritorio.md).

---

## Errores comunes

- **No veo el botón "+" para crear:** no tenés el permiso de ese sub-módulo. Pediselo al
  administrador.
- **"Sin permiso para guardar":** intentaste guardar algo para lo que no tenés permiso.
- **Al editar un funcionario no me deja cambiar el cargo/salario:** es correcto, esos
  cambios van por el escritorio (ver arriba).
- **Quiero crear un funcionario pero no aparece la persona en la lista:** primero creá la
  **Persona** en el sub-módulo Personas.

---

**Próximo capítulo →** [Módulo Finanzas](05-modulo-finanzas.md)
