# Capítulo 2 — Configuración inicial

Si recién instalaste FRC Gourmet, hacé estos pasos **en orden**. Si los saltás, otros módulos no funcionarán correctamente (productos sin moneda, ventas sin caja, etc.).

## 1. Crear tu usuario administrador (si no existe)

Si es tu primera vez y nadie te dio un usuario:

1. Cerrá la app.
2. **Avanzado**: contactar al instalador. Por seguridad no documentamos el bypass.
3. Una vez tengas usuario admin, seguí los pasos.

## 2. Monedas

**Menu → Financiero → Monedas**.

1. Crear "Guaraní" (PYG):
   - Denominación: GUARANÍ
   - Símbolo: ₲
   - Decimales: 0
   - País: Paraguay
   - Marcar como **Principal** (✅).
2. (Opcional) Crear "Dólar Estadounidense" (USD):
   - Símbolo: $, Decimales: 2.
3. (Opcional) Crear "Real Brasileño" (BRL):
   - Símbolo: R$, Decimales: 2.

### Tipos de Cambio

Para que las ventas / compras conviertan automáticamente entre monedas:

1. **Menu → Financiero → Monedas** → desde la moneda principal, abrir "Tipos de Cambio".
2. Crear:
   - PYG → USD: ej. 1 USD = 7.300 PYG. Llenar `compraOficial`, `ventaOficial`, `compraLocal`, `ventaLocal`.
   - PYG → BRL: análogo.

**Local** vs **Oficial**: oficial es la cotización del Banco Central. Local es la que vos manejás (paralela / mercado).

## 3. Billetes / Denominaciones físicas

Para hacer conteos de caja, necesitás los billetes:

**Menu → Financiero → Monedas → (PYG) → Billetes**.

Crear: 100, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000.

Hacé lo mismo para USD (1, 5, 10, 20, 50, 100) y BRL.

## 4. Tipos de Precio

Roles de precio (Normal, Mayorista, VIP, etc.):

(⚠️ UI eliminada — ver [conventions/coding-rules.md](../conventions/coding-rules.md). Por ahora hay un seed automático con tipos básicos. Si necesitás más, consultar al equipo de desarrollo.)

## 5. Formas de pago

**Menu → Financiero → Cajas → (sub-menú) Formas de pago**.

Crear:
- EFECTIVO (mueve caja, principal, orden 1)
- TARJETA DE CRÉDITO (mueve caja, orden 2)
- TARJETA DE DÉBITO (mueve caja, orden 3)
- TRANSFERENCIA BANCARIA (mueve caja, orden 4)
- PIX / QR (si aplica)
- VOUCHER / VALE
- OTRO

**`mueve caja`** (`movimentaCaja`): si está marcado, esta forma aparece como opción al pagar compras/cuotas (afecta saldo Caja Mayor).

**`principal`**: la default que se preselecciona en formularios.

## 6. Dispositivos (computadoras / POS)

Cada PC desde la que se vende debe registrarse como Dispositivo:

**Menu → Configuración → Dispositivos y puntos de venta**.

1. Crear nuevo dispositivo:
   - Nombre: "PC Caja Frente", "Tablet Mostrador", etc.
   - MAC: el sistema la auto-detecta o ingresá manualmente.
   - Marcar flags según uso:
     - **isVenta**: puede vender (PdV).
     - **isCaja**: actúa como caja registradora.
     - **isTouch**: tiene pantalla táctil.
     - **isMobile**: es móvil (tablet, celular).

## 7. Sectores y Mesas

Si tenés mesas físicas:

**Menu → Ventas → Dashboard → "Gestionar Mesas"**.

1. Crear sectores: "Salón A", "Barra", "Terraza", "Patio".
2. Para cada sector, crear sus mesas:
   - Número (1, 2, 3, ...).
   - Capacidad (ej: 4 personas).
   - Crear de a una o **batch** (cantidad N → genera N mesas numeradas).

## 8. Cuentas Bancarias (si aplica)

**Menu → Financiero → Caja Mayor → Bancos**.

Crear cada cuenta:
- Nombre, banco, número de cuenta, tipo (CORRIENTE / AHORRO).
- Moneda.
- Saldo inicial.

## 9. Máquinas POS (si tenés terminales de tarjeta)

**Menu → Financiero → Caja Mayor → POS**.

Crear cada terminal:
- Nombre, proveedor (ej: Visa, Banco Itaú).
- Cuenta bancaria donde se acreditan las ventas.
- Porcentaje de comisión (ej: 2.50%).
- Minutos de acreditación (ej: 1440 = 24 hs).

## 10. Caja Mayor

**Menu → Financiero → Caja Mayor → "Crear nueva caja mayor"**.

- Nombre: ej "Caja Mayor Sucursal Centro".
- Descripción.
- Responsable: el usuario al cargo.
- Estado: ABIERTA.

Configurar visibilidad (botón "Configurar" en el detalle):
- Qué formas de pago mostrar como cards.
- Qué cuentas bancarias mostrar.
- Mostrar / ocultar cards CPP y CPC.

## 11. Categorías de Productos (Familias)

**Menu → Productos → Productos → (botón "Familias")** o desde el Dashboard de Productos.

> El menú **Productos** incluye un ítem **Categorías**, pero en esta versión las familias y subfamilias se gestionan desde el botón **Familias** de la lista de Productos / Dashboard de Productos.

Estructura jerárquica:

```
Familia: BEBIDAS
  ├─ Subfamilia: GASEOSAS
  ├─ Subfamilia: CERVEZAS
  └─ Subfamilia: JUGOS

Familia: COMIDAS
  ├─ Subfamilia: ENTRADAS
  ├─ Subfamilia: PIZZAS
  ├─ Subfamilia: HAMBURGUESAS
  └─ Subfamilia: POSTRES
```

## 12. Categorías de Compras y Gastos

**Menu → Compras → (Dashboard) → Categorías**.

Crear:
- "Mercadería", "Bebidas", "Insumos limpieza", "Empaque", etc.

**Menu → Financiero → Caja Mayor → Gastos → Categorías** (jerárquica):

```
Servicios
  ├─ Electricidad
  ├─ Agua
  ├─ Internet
  └─ Gas

Operación
  ├─ Alquiler
  ├─ Mantenimiento
  └─ Limpieza
```

## 13. Configuración del PdV

**Menu → Ventas → Dashboard → "Configuración PdV"**.

Definir:
- Cantidad de mesas total.
- Grupo de categorías default.
- Umbrales de salud de caja (verde ≤5%, rojo >15%).
- Tiempo amarillo / rojo en delivery (default 30 / 60 min).
- Tab default al abrir PdV (MESAS / COMANDAS / ATAJOS).
- Comandas habilitadas (sí/no).
- Pizza max sabores (default 2).
- Pizza estrategia precio (MAYOR_PRECIO / PROMEDIO).

## 14. Configuración RRHH (parámetros legales)

**Menu → Recursos Humanos → Config RRHH**.

Vienen pre-cargados con valores **por defecto Paraguay**:

- IPS funcionario 9% / patronal 16.5%.
- Vacaciones: <5 años = 12 días, 5-10 = 18 días, >10 = 30 días.
- Indemnización: 15 jornales por año, mínimo 90 días antigüedad.
- Recargos hora extra: diurna +50%, nocturna +100%, feriado +100%.
- Tolerancia tardanza: 5 min.
- Penalización auto-tardanza: monto fijo + por minuto (configurable).

Ajustá según legislación local o políticas internas.

## 15. Permisos y Roles

**Menu → Recursos Humanos → Permisos**.

El sistema viene con **56 permisos** pre-cargados (RRHH_FUNCIONARIO_VER, RRHH_LIQUIDACION_APROBAR, etc.).

**Menu → Recursos Humanos → Permisos → Roles** (acceso indirecto).

Crear roles:
- "Administrador": todos los permisos.
- "Cajero": permisos de PdV, caja, ventas.
- "Mozo": permisos de PdV operativos.
- "Encargado RRHH": permisos de RRHH excepto pago de liquidaciones.

Asignar permisos a cada rol.

Luego, en **Menu → Recursos Humanos → Usuarios**, asignar roles a cada usuario.

## 16. Datos de la Empresa

**Menu → Configuración → Datos de la Empresa**.

Cargá los datos del negocio (nombre, logo, RUC/datos fiscales, dirección, contacto). El logo y el nombre aparecen en la barra superior de la app y en los reportes.

## 17. Impresoras

**Menu → Configuración → Impresoras**.

Agregar cada impresora térmica:
- Nombre.
- Tipo: epson / star / thermal.
- Conexión: network / usb / bluetooth.
- Address (IP, puerto, device path o MAC).
- Marcar default.

Botón "Test print" verifica que funcione.

## 18. Backup inicial

La forma recomendada es usar la herramienta integrada: **Menu → Configuración → Backup y Restauración**. Desde ahí podés generar y restaurar copias de la base de datos sin tocar archivos a mano.

Alternativa manual (con la app cerrada), copiando el archivo de base de datos:

1. Cerrá la app.
2. Encontrá el archivo:
   - macOS: `~/Library/Application Support/frc-gourmet/frc-gourmet.db`
   - Windows: `%APPDATA%\frc-gourmet\frc-gourmet.db`
   - Linux: `~/.config/frc-gourmet/frc-gourmet.db`
3. Copialo a un lugar seguro (USB, disco externo, nube).
4. Repetir backup periódicamente (al menos semanal).

> **Modo de operación:** si vas a usar la app en red (un equipo como servidor y otros como clientes), configuralo en **Menu → Configuración → Modo de operación**. Por defecto la app funciona en modo local (standalone). La base de datos también puede configurarse (SQLite o Postgres) desde **Configuración → Configurar BD**.

## Resumen del orden recomendado

```
1. Usuario admin
2. Monedas + tipos de cambio + billetes
3. Formas de pago
4. Dispositivos
5. Sectores + Mesas
6. Cuentas bancarias + Máquinas POS (si aplica)
7. Caja Mayor + Configuración (cards visibles)
8. Categorías de productos (Familias / Subfamilias)
9. Categorías de compras y gastos
10. PdvConfig (umbrales, mesas, pizza)
11. ConfiguracionRrhh (parámetros legales)
12. Roles y permisos
13. Datos de la Empresa
14. Impresoras
15. Backup
```

Después podés empezar a cargar productos, recetas, funcionarios y operar.

---

**Próximo capítulo →** [03 — Personas y clientes](03-personas-y-clientes.md)
