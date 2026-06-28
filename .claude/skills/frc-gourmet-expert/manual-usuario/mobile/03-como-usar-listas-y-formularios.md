# Capítulo 3 — Cómo usar las listas y los formularios

Todas las pantallas de la app mobile funcionan igual. Si entendés este capítulo, sabés
usar **cualquier** módulo (RRHH, Finanzas, Compras, Productos). Los capítulos siguientes
solo explican las particularidades de cada uno.

Hay dos tipos de pantallas:

- **Listas** — muestran registros (cargos, funcionarios, productos…).
- **Formularios** — para crear o editar un registro.

---

## 1. Las listas

Una lista se ve así (ejemplo: Cargos):

```
┌──────────────────────────────────────────────┐
│  Buscar cargo            ✕      [ Filtrar ]   │   ← barra de búsqueda
├──────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐  │
│  │ MOZO                          Activo  ⋮ │  │   ← tarjeta
│  │ Salario ref.: 2.500.000                 │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │ COCINERO                      Activo  ⋮ │  │
│  └────────────────────────────────────────┘  │
│                                          (+)   │   ← botón Crear
└──────────────────────────────────────────────┘
```

### Tarjetas (cards), no tablas

Cada registro es una **tarjeta**. No hay tablas con scroll horizontal: todo entra en el
ancho de la pantalla y solo se desliza hacia **arriba y abajo**. Cada tarjeta muestra:

- El **nombre** o título principal (arriba, en negrita).
- Datos secundarios debajo (por ejemplo, salario de referencia, descripción).
- Una **etiqueta de estado** a la derecha:
  - **Activo** (verde) / **Inactivo** (gris/atenuado).
  - En las listas de consulta puede aparecer el estado de la operación (ej. el estado de
    un vale o una liquidación).

### Buscar y filtrar

- Escribí en el campo **"Buscar…"** y tocá el botón **Filtrar** (o la tecla Enter del
  teclado). La lista se reduce a lo que coincide con el texto.
- **No filtra mientras escribís:** tenés que tocar Filtrar. Esto evita que la lista salte
  con cada letra.
- Para limpiar, tocá la **✕** dentro del campo (vuelve a mostrar todo).

### El menú de acciones (⋮)

En las listas donde podés modificar, cada tarjeta tiene un botón **⋮** (tres puntos) a la
derecha. Tocálo para ver las acciones:

- **Editar** — abre el formulario con los datos cargados.
- **Eliminar** — borra el registro (pide confirmación). Solo aparece si tenés permiso.

> En las pantallas de **solo consulta** no hay ⋮ ni botón de crear: solo podés ver.

### Crear un registro nuevo (botón +)

Abajo a la derecha hay un **botón flotante redondo con un "+"** (el "FAB"). Tocálo para
abrir el formulario en blanco y crear un registro nuevo.

> El botón **+** y la opción **Eliminar** solo aparecen **si tu usuario tiene permiso**
> para esa sección. Si no los ves, es porque no tenés permiso (ver
> [Permisos y roles](08-permisos-y-roles.md)).

### Mientras carga / si hay error

- Una **barra de progreso** arriba indica que la lista se está cargando.
- Si no se pueden traer los datos, aparece un mensaje de error (por ejemplo
  "No se pudieron cargar…"). Suele ser un problema de conexión: revisá el aviso
  "Sin conexión" y volvé a intentar.
- Si no hay registros, ves un texto tipo **"No hay …"** / **"Sin registros"**.

---

## 2. Los formularios (crear / editar)

Al tocar **+** (crear) o **Editar**, se abre un formulario **a pantalla completa**:

```
┌──────────────────────────────────────────────┐
│  ←   Nuevo cargo                   Guardar    │   ← barra del formulario
├──────────────────────────────────────────────┤
│  Nombre                                       │
│  ┌────────────────────────────────────────┐  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│  Descripción                                  │
│  ┌────────────────────────────────────────┐  │
│  └────────────────────────────────────────┘  │
│  Salario de referencia                        │
│  ┌────────────────────────────────────────┐  │
│  └────────────────────────────────────────┘  │
│  [✓] Activo                                   │
│                                               │
│        [        Guardar        ]              │
└──────────────────────────────────────────────┘
```

### La barra de arriba

- **← (volver):** descarta y vuelve a la lista **sin guardar**.
- **Título:** "Nuevo …" cuando creás, "Editar …" cuando modificás.
- **Guardar:** guarda. (También hay un botón **Guardar** grande al final del formulario;
  hacen lo mismo.)

### Tipos de campos

- **Texto:** nombre, descripción, etc. Se guardan en MAYÚSCULAS automáticamente.
- **Número:** salarios, montos, valores. El teclado se abre en modo numérico.
- **Listas desplegables (selects):** para elegir algo relacionado, por ejemplo la Persona
  de un funcionario, su Cargo o la Moneda. Tocá el campo y elegí de la lista.
- **Interruptores (toggles):** por ejemplo **Activo**. Deslizá para encender/apagar.
- **Fechas:** se eligen con el selector de fecha del teléfono.

### Campos obligatorios

Si un campo es obligatorio y lo dejás vacío, al intentar guardar aparece **"Requerido"**
debajo del campo y no se guarda hasta que lo completes.

### Al guardar

- Aparece un mensaje breve abajo (un "snackbar"), por ejemplo **"Cargo guardado"**, y la
  app te devuelve a la lista.
- Si el servidor rechaza el guardado por permisos, ves **"Sin permiso para guardar"**.
- Si hubo otro problema, ves **"No se pudo guardar"** (revisá la conexión y reintentá).

---

## 3. Eliminar un registro

1. En la lista, tocá **⋮** en la tarjeta → **Eliminar**.
2. Aparece una confirmación: **"¿Eliminar «…»? Esta acción no se puede deshacer."**
3. Tocá **Eliminar** para confirmar, o **Cancelar** para abortar.

Si el servidor no te deja (por permisos o porque el registro está en uso), aparece un
mensaje como **"Sin permiso para eliminar"** o **"No se pudo eliminar"**.

> **Inactivar en lugar de borrar:** en muchos casos conviene **no** eliminar, sino marcar
> el registro como **Inactivo** (desde el formulario, apagando el interruptor *Activo*).
> Así deja de aparecer en uso pero se conserva el historial. Algunos registros (como
> Funcionarios) directamente **no se pueden eliminar**: solo se inactivan.

---

## 4. Resumen de íconos y gestos

| Elemento | Significado |
|---|---|
| **Filtrar** | Aplica la búsqueda escrita |
| **✕** (en el buscador) | Limpia la búsqueda |
| **⋮** | Menú de acciones de la tarjeta (Editar / Eliminar) |
| **(+)** flotante | Crear un registro nuevo |
| **←** | Volver / salir sin guardar |
| **Guardar** | Confirmar el registro |
| Chip **verde** | Activo |
| Chip **gris/atenuado** | Inactivo |
| Chip **naranja** | Estado de una operación (en listas de consulta) |

---

**Próximo capítulo →** [Módulo Ventas — meseros](04-modulo-ventas-meseros.md)
