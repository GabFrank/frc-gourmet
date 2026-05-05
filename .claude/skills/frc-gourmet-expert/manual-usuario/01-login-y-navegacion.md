# Capítulo 1 — Login y navegación

## Pantalla de login

Al abrir FRC Gourmet, la primera pantalla pide:

- **Usuario** (nickname)
- **Contraseña**

El sistema **no distingue mayúsculas/minúsculas** en el nickname (admin = ADMIN = Admin). La contraseña sí.

Si los datos son correctos, te lleva al **Dashboard** principal.

Si te equivocás, aparece el mensaje "Usuario o contraseña incorrectos".

## Layout principal

Una vez logueado, ves esta estructura:

```
┌─────────────────────────────────────────────────────────────────┐
│ [☰] FRC Gourmet              [☀ ⇄ 🌙] [🔔] [👤 ▾]                │  ← Toolbar
├──────────┬──────────────────────────────────────────────────────┤
│ MENU     │                                                      │
│ LATERAL  │   ÁREA DE TRABAJO (PESTAÑAS)                         │
│          │   ┌────────┬─────────┬─────────┐                     │
│          │   │ Dash   │ PdV [×] │ Compras │ ...                 │
│          │   ├────────┴─────────┴─────────┘                     │
│          │   │                                                  │
│          │   │   Pestaña activa                                 │
│          │   │                                                  │
│          │   └──────────────────────────────────────────────────┘
└──────────┴──────────────────────────────────────────────────────┘
```

### Toolbar (arriba)

- **☰**: abre/cierra el menú lateral.
- **☀ / 🌙**: cambia entre tema claro y oscuro. Tu preferencia se guarda.
- **🔔**: notificaciones de RRHH (cumpleaños próximos, cuotas vencidas, etc.). El número rojo es la cantidad sin leer.
- **👤 Mi Perfil ▾**: tu menú de usuario:
  - **Mi Perfil**: ver tus datos.
  - **Cerrar Sesión**: salir del sistema.

### Menú lateral

Tiene 8 secciones (cada una expandible):

1. **Dashboard** (item simple, va al inicio).
2. **Ventas** → Dashboard de ventas, abre PdV desde acá.
3. **Recursos Humanos** → 19 sub-items (Funcionarios, Asistencias, Vales, Liquidaciones, etc.).
4. **Comisiones** → Reglas, Equipos, Liquidaciones de comisión.
5. **Productos** → Dashboard, Productos, Recetas, Sabores, Adicionales.
6. **Compras** → Dashboard, Lista de compras.
7. **Financiero** → Dashboard, Cajas, Monedas, Caja Mayor, Cuentas por Cobrar.
8. **Configuración** → Impresoras, Dispositivos.

**Click** en el icono de la sección → expande sus items.
**Click** en un item → abre una **pestaña** en el área de trabajo.

### Modo colapsado del menú

Si el menú está colapsado (60 px), solo ves iconos centrados. Click en cualquier icono lo expande automáticamente.

Click fuera del menú lo colapsa de vuelta.

### Pestañas

Cada item del menú abre como una **pestaña** (no como página completa). Esto permite:

- Tener varios módulos abiertos a la vez (ej: PdV + Compras + Caja Mayor).
- Saltar entre ellos sin perder el estado.
- Cerrar pestañas con la **×**.

**Click en una pestaña** la activa. **Doble click** no hace nada especial.

**Si abrís el mismo módulo dos veces**, el sistema activa la pestaña ya abierta en lugar de duplicarla.

## Tema oscuro / claro

El switch de tema en la toolbar cambia inmediatamente todos los colores:

- **Claro**: fondo blanco, texto oscuro. Más legible con luz natural.
- **Oscuro**: fondo gris oscuro, texto blanco. Más cómodo en ambientes con poca luz, menos cansancio visual.

Tu elección se guarda y se aplica la próxima vez que entrás.

## Sesión

Tu sesión dura **7 días** sin necesidad de re-login (a menos que cierres sesión manualmente o cierres la app).

Cada 5 minutos el sistema actualiza tu "última actividad" para mantener la sesión viva.

Si cerrás sesión, todas tus pestañas abiertas se cierran y volvés a la pantalla de login.

## Atajos de teclado generales

| Tecla | Función |
|---|---|
| `Esc` | Cierra dialogs / deselecciona |
| `F1` (en PdV) | Cobrar |
| `F2` (en PdV) | Cobro rápido |
| `F3` (en PdV) | Buscar producto |
| `F4` (en PdV) | Cancelar venta |
| `F5` (en PdV) | Pre-cuenta / imprimir |
| `Tab` | Navegar entre campos |
| `Enter` | Confirmar (en formularios) |

## Errores comunes

### "No puedo iniciar sesión"

- Verificá CapsLock.
- Si es la primera vez, contactá a quien instaló el sistema — necesitás un usuario ya creado.
- Si el sistema dice "Usuario inactivo": tu administrador debe reactivarte (`activo = true`).

### "El menú no responde"

- Refrescá la app: cerrala y abrila de nuevo.
- Si persiste: posible bug de UI. Reportá al equipo de soporte.

### "Mi pestaña desapareció"

- Click en ×, o cambio de pestaña con un solo click. No hay "deshacer".
- Volvé al menú lateral y abrí de nuevo.

## Personalización del Dashboard

En la pantalla principal (Dashboard) podés agregar **accesos rápidos** personalizados:

- Click derecho / botón "+" → "Agregar acceso directo".
- Elegí destino (un módulo, una caja específica, una lista filtrada).
- Asignale título, icono, color.
- Aparece como tarjeta clickeable.

Los accesos pueden ser:
- **Globales**: visibles para todos los usuarios (creados por admin).
- **Personales**: solo los ves vos.

→ Más detalle en [17-reportes-y-dashboards.md](17-reportes-y-dashboards.md).

---

**Próximo capítulo →** [02 — Configuración inicial](02-configuracion-inicial.md)
