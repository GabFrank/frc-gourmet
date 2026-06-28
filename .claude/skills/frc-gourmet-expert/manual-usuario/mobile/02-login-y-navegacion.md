# Capítulo 2 — Iniciar sesión y navegar

## Iniciar sesión

La primera pantalla pide:

- **Usuario:** tu nickname (el mismo que usás en la app de escritorio).
- **Contraseña.**

Tocá **Ingresar**.

```
┌─────────────────────────────┐
│        FRC Gourmet          │
│       Iniciar sesión        │
│                             │
│  Usuario                    │
│  ┌───────────────────────┐  │
│  │ admin                 │  │
│  └───────────────────────┘  │
│  Contraseña                 │
│  ┌───────────────────────┐  │
│  │ ••••••••              │  │
│  └───────────────────────┘  │
│                             │
│      [   Ingresar   ]       │
└─────────────────────────────┘
```

Detalles a tener en cuenta:

- El **usuario** no distingue mayúsculas de minúsculas en la mayoría de los casos, pero la
  **contraseña sí**: escribila exactamente como la creaste.
- El teclado no pone mayúscula automática ni autocorrige el campo de usuario (así no se
  "ensucia" tu nickname).
- Mientras procesa, el botón muestra **"Ingresando…"**.

### Si no entra

- **"Credenciales inválidas":** usuario o contraseña incorrectos. Revisá el bloq. mayús.
- **"No se pudo conectar con el servidor":** la PC del local está apagada, fuera de la red,
  o no está en modo servidor. Ver [Solución de problemas](09-solucion-de-problemas.md).

> Si es tu primera vez en el sistema y nunca tuviste usuario, pediselo al administrador:
> los usuarios se crean en RRHH (y también se pueden crear desde la app mobile, ver
> [Módulo RRHH](04-modulo-rrhh.md)).

## La pantalla principal (Inicio)

Apenas entrás, ves la pantalla de **Inicio**:

- Un **saludo** con tu nombre de usuario.
- **Accesos rápidos** a las grandes secciones del sistema. Solo aparecen las secciones a
  las que tu usuario tiene acceso: Ventas y Productos las ve cualquier usuario logueado;
  Compras, Finanzas y RRHH aparecen solo si tenés el permiso correspondiente. Tocá
  cualquiera para entrar.

## La barra superior

Arriba siempre tenés:

```
┌──────────────────────────────────────────────┐
│  Título de la pantalla        🌙   👤         │
└──────────────────────────────────────────────┘
```

- **Título:** cambia según dónde estés (por ejemplo "Cargos", "Funcionarios").
- **🌙 / ☀️ (tema):** alterna entre **tema oscuro y claro**. Tu preferencia se recuerda.
- **👤 (cuenta):** abre un menú con tu usuario y la opción **Cerrar sesión**.

## Moverte por la app

La forma de navegar **se adapta al tamaño de la pantalla**:

### En tablet (pantalla grande)

Hay una **barra de navegación lateral** (a la izquierda) con hasta seis destinos:

| Ícono | Destino | Qué contiene |
|---|---|---|
| 🏠 | **Inicio** | Saludo y accesos rápidos |
| 🍽️ | **Ventas** | Mesas y comandas (tomar pedidos) |
| 📦 | **Productos** | Familias, subfamilias, adicionales, productos |
| 🛒 | **Compras** | Compras, proveedores, categorías |
| 💵 | **Finanzas** | Cajas, Caja Mayor, cuentas por cobrar, gastos, comisiones |
| 👥 | **RRHH** | Empleados, personas, clientes, usuarios, vales… |

> **Ventas** y **Productos** las ve cualquier usuario logueado. **Compras**, **Finanzas** y
> **RRHH** aparecen en la barra **solo si tu usuario tiene el permiso** de esa sección; si
> no lo tenés, ese destino no se muestra.

### En teléfono (pantalla chica)

Los mismos destinos aparecen en una **barra inferior** (abajo de todo), cómoda para
el pulgar.

### Dentro de cada sección

Al tocar RRHH, Finanzas, Compras o Productos, ves un **índice de la sección**: una grilla
de tarjetas, una por cada sub-módulo.

- Las tarjetas **normales** te llevan a la lista correspondiente.
- Las tarjetas con la etiqueta **"pronto"** están atenuadas y todavía no se pueden abrir
  (esa función aún no está disponible en mobile).

## Sin conexión

Si en algún momento la PC del local deja de responder (se apagó, se cayó la red), aparece
un aviso flotante:

```
        ☁️✕  Sin conexión con el servidor
```

Mientras ese aviso esté visible, **no vas a poder guardar ni cargar datos**: la app mobile
necesita el servidor para todo (no guarda nada en el celular). En cuanto la conexión
vuelve, el aviso desaparece solo y podés seguir trabajando.

## Tu sesión: cuánto dura

- Una vez que iniciás sesión, la app te mantiene logueado y **renueva tu acceso
  automáticamente** por detrás, sin que tengas que volver a escribir la contraseña.
- Esa renovación funciona durante un período prolongado (aproximadamente **30 días** de
  inactividad antes de que caduque del todo).
- Si la renovación falla (por ejemplo, pasó demasiado tiempo o el administrador cerró tu
  sesión), la app te **devuelve automáticamente a la pantalla de login**. Volvé a entrar
  con tu usuario y contraseña.

## Cerrar sesión

1. Tocá el ícono **👤** (cuenta) arriba a la derecha.
2. Tocá **Cerrar sesión**.

Volvés a la pantalla de login. Hacé esto si compartís el dispositivo con otra persona.

---

**Próximo capítulo →** [03 — Cómo usar las listas y los formularios](03-como-usar-listas-y-formularios.md)
