# Capítulo 3 — Personas, usuarios y clientes

## Persona: la entidad raíz

En FRC Gourmet, **toda persona del sistema** (usuario interno, cliente, funcionario, proveedor) parte de una entidad común: **Persona**.

Una vez que creás una Persona, podés vincularla a:
- Un **Usuario** (acceso al sistema con nickname + contraseña)
- Un **Cliente** (a quien le vendés)
- Un **Funcionario** (empleado — capítulo 11)
- Un **Proveedor** (a quien le comprás — capítulo 7)

Esto permite que la misma persona física aparezca en distintos roles sin duplicar datos personales.

## Crear una Persona

**Menu → Recursos Humanos → Personas → Botón "Nueva persona"**.

Campos:
- **Nombre** (obligatorio): se guarda en MAYÚSCULAS.
- **Apellido**: opcional.
- **Email, Teléfono, Dirección**: opcionales.
- **Fecha de nacimiento**: usado para notificaciones de cumpleaños RRHH.
- **Sexo**: MASCULINO / FEMENINO / OTRO.
- **Estado civil**: SOLTERO / CASADO / UNIÓN LIBRE / DIVORCIADO / VIUDO.
- **Tipo de documento**: CI / RUC / CPF / PASAPORTE.
- **Documento**: número.
- **Tipo de persona**: FÍSICA (individual) / JURÍDICA (empresa).
- **Foto** (opcional): se guarda en disco como `app://profile-images/<file>`.

Click en **Guardar**.

## Editar / eliminar persona

En la lista, click en la fila → menú **⋮** → **Editar** o **Eliminar**.

**Eliminar** = soft delete (marca `activo = false`). No se borra de la BD.

## Crear un Usuario

Para que alguien pueda iniciar sesión:

**Menu → Recursos Humanos → Usuarios → Botón "Nuevo usuario"**.

Campos:
- **Persona**: seleccionar de la lista (debe existir antes).
- **Nickname**: único, sin espacios. Ej: `juan`, `maria.gomez`. Es lo que escribirá al loguearse.
- **Contraseña**: ⚠️ **se guarda en texto plano** en esta versión. Asignar contraseñas robustas.
- **Activo**: ✅ por default.

Click en **Guardar**.

### Asignar roles al usuario

Sin un rol, el usuario logueado **no tiene permisos para casi nada**.

1. En la lista de usuarios, click en el usuario → **"Asignar roles"** o vista de detalle.
2. Marcar los roles que tendrá.
3. Guardar.

Los roles disponibles dependen de los que tengas creados (ver capítulo 2).

### Recuperar contraseña

⚠️ **Función no implementada** en esta versión. Si un usuario olvida su contraseña, el administrador debe editarla manualmente desde la lista de usuarios.

## Clientes

**Menu → Recursos Humanos → Clientes → Botón "Nuevo cliente"**.

Campos:
- **Persona**: seleccionar de la lista.
- **Tipo de cliente**: Mayorista, Minorista, Delivery, etc. (definidos previamente).
- **RUC** (si es jurídica).
- **Razón social** (si es jurídica).
- **Tributa**: si emite factura.
- **Crédito** (✅ / ❌): permite ventas a crédito.
- **Límite de crédito**: monto máximo adeudado.
- **Saldo actual**: se calcula automáticamente con cada venta a crédito y cada pago.

### Tipos de cliente

**Menu → Recursos Humanos → Clientes → (sub-menú) Tipos**.

Crear:
- Mayorista: con `descuento=true`, `porcentaje_descuento=10`.
- Minorista: sin descuento.
- Delivery: cliente solo para servicio domiciliario.
- VIP: descuento extra.

El tipo aplica como default — al crear un cliente, hereda esos parámetros.

## Convenios (cobro consolidado)

Un **Convenio** agrupa varios clientes que pertenecen a una empresa o entidad externa con la que tenés un acuerdo (ej. "FUNCIONARIOS EMPRESA X"). A fin de mes, la empresa puede pagar de forma consolidada la deuda de todos sus clientes, y luego descontarla internamente a cada uno.

**Menu → Recursos Humanos → Convenios**.

- **Nuevo convenio**: nombre, descripción, RUC y contacto de la empresa (opcionales).
- **Asignar clientes**: vinculá los clientes que forman parte del convenio (un cliente puede estar en varios convenios).
- **Cobro consolidado**: registra el pago único de toda la deuda del grupo.

## Búsqueda rápida en PdV

Cuando estás cobrando una venta y querés vincularla a un cliente registrado:

1. En el PdV, click en el ícono de **buscar cliente** (lupa con persona).
2. Buscar por nombre, RUC, teléfono.
3. Seleccionar.

También: el delivery soporta autocompletar al ingresar **teléfono** — escribís 3 caracteres y aparece la lista de clientes con ese teléfono.

## Movimientos de cliente

Si un cliente tiene crédito, cada operación queda registrada en su histórico:

**Menu → Recursos Humanos → Clientes → click en cliente → "Movimientos"**.

Ves:
- CARGO: cuando le vendiste a crédito.
- PAGO: cuando te pagó.
- AJUSTE_POSITIVO / AJUSTE_NEGATIVO: correcciones manuales.

El **saldoActual** se calcula así:
```
saldo = SUM(CARGOs - PAGOs - AJUSTES_NEGATIVOS + AJUSTES_POSITIVOS)
```

## Errores comunes

### "Persona no se puede crear"

- Verificá que el documento no esté duplicado (si lo cargás, debe ser único en la práctica).
- El nombre es obligatorio.

### "No puedo crear un usuario"

- El nickname debe ser único. Si dice "ya existe", probá variantes (`juan` → `juan.perez`).
- La persona debe existir antes.

### "Cliente nuevo no aparece en buscador del PdV"

- Verificá que esté `activo = true`.
- Si lo creaste recién, refrescá la pestaña del PdV.

## Crear cliente rápido desde delivery

Cuando llega un pedido nuevo de delivery y el cliente no está registrado:

1. PdV → DELIVERY → Nuevo Delivery.
2. Ingresá teléfono. Si no existe, llenás nombre + dirección.
3. Al confirmar, el sistema crea **automáticamente la Persona y el Cliente**.

→ Más detalle del flujo en [06-pdv-uso-diario.md](06-pdv-uso-diario.md).

---

**Próximo capítulo →** [04 — Productos, presentaciones y precios](04-productos-presentaciones-precios.md)
