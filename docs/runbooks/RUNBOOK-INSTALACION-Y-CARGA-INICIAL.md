# Runbook: instalación de una estación y carga inicial de datos

> **Destinatario: un agente de IA** con acceso a la PC Windows donde se instala FRC
> Gourmet (shell PowerShell, archivos, red local) y con un canal de preguntas
> interactivas al dueño del local.
>
> **Objetivo:** dejar la estación instalada y la app **lista para vender**, sin que el
> usuario tenga que entrar pantalla por pantalla. El agente **pregunta**, arma un
> plan, lo hace **confirmar** y después **carga todo por la API** de la propia app.
>
> Relevado contra el código el 2026-10-29 (rama `develop` + PR GabFrank/frc-gourmet#327).
> Si un canal responde 404 o cambió su payload, **pará y avisá**: no improvises SQL.
>
> **Versión de la app:** este runbook asume una build que incluye los arreglos del
> PR GabFrank/frc-gourmet#327 (issues #329 a #340). En una build anterior, mirá el
> Anexo D: algunos pasos tienen un rodeo.

---

## 0. Reglas que no se negocian

1. **Nunca escribas en la base de datos directamente** (ni SQLite ni Postgres).
   Todo se hace por `POST /api/rpc`, que ejecuta exactamente los mismos handlers que
   la UI, con sus permisos, validaciones y auditoría.
2. **Preguntá, no inventes.** Si falta un dato (un precio, un RUC, una comisión),
   preguntalo. Para lo opcional, ofrecé saltearlo; nunca pongas un valor "de ejemplo".
3. **Confirmá antes de escribir.** Después de la entrevista mostrá un **resumen del
   plan** y esperá el "sí". Después de cada bloque de carga, mostrá lo que se creó.
4. **Idempotencia.** Antes de cada alta, listá lo que ya existe con el `get-*` y
   **no dupliques**. Ningún `create-*` valida duplicados por nombre, y reintentar
   duplica.
5. **Todo texto en MAYÚSCULAS** antes de mandarlo. Casi ningún handler lo convierte
   y la app asume mayúsculas en BD. Las excepciones son los emails (en minúsculas) y
   las contraseñas (tal cual).
6. **Validá cada id antes de usarlo.** Si mandás `productoId: undefined`, TypeORM
   hace `findOneBy({ id: undefined })` y **devuelve la primera fila de la tabla**: el
   registro queda pegado a otra entidad **sin error**. Nunca mandes un id que no
   salió de una respuesta real.
7. **Revisá `result.success`.** Muchos handlers responden HTTP 200 con
   `{ success: false, message }`. Un 200 no significa que funcionó.
8. **Registrá todo** en `setup-state.json`: el plan confirmado, el id de cada cosa
   creada y cada error. Si la sesión se corta, retomás desde ahí sin duplicar.
9. **Secretos:** las contraseñas que te dicten no van al log ni a `setup-state.json`.
   Al final entregalas una sola vez y recomendá cambiarlas.

---

## 1. Fase A: entrevista

Hacé las preguntas **por bloques**, con opciones cuando se pueda, y mostrá el
default sugerido. Para listas largas (productos, funcionarios) **ofrecé recibir una
planilla** (Excel/CSV) con las columnas del Anexo C en lugar de preguntar uno por
uno. Guardá las respuestas en `setup-plan.json`.

### A1. Estación y modo de operación

| Pregunta | Opciones / notas |
|---|---|
| ¿Cuántas PCs/terminales van a usar el sistema? | **Una sola**: standalone o server. **Varias, o tablets/celulares de mozos**: esta PC es el **servidor** |
| ¿Base de datos? | **SQLite** (default, una PC; nada que instalar) / **PostgreSQL** (servidor con varios clientes o mucho volumen) |
| ¿Esta PC tiene que arrancar sola con Windows? | sí / no |
| Nombre de esta terminal | ej. `CAJA 1`. Si es la única, se renombra el dispositivo sembrado `TERMINAL PRINCIPAL` |
| ¿Hay más cajas/terminales? Nombres | Se crean como dispositivos; cada PC cliente se configura aparte |

> La carga por API exige que la app corra en **modo server** mientras configurás
> (sección B3). Si el local va a quedar en standalone, al final se vuelve a
> standalone.

### A2. Empresa

Nombre comercial, razón social, RUC, dirección, teléfono, email, (opcional) sitio
web, actividad económica. Zona horaria: default `America/Asuncion`. Si van a
facturar legalmente, el timbrado (número, vigencia, punto de expedición). Si no lo
tienen a mano, se deja para después.

### A3. Monedas y cotizaciones

- Moneda principal: **GUARANI** (sembrada). ¿Aceptan **DOLAR** y/o **REAL**?
- Para cada extranjera aceptada: cotización de **compra** y **venta**, en guaraníes
  por 1 unidad. El sistema guarda oficial y local; si no distinguen, usá el mismo
  valor en los dos.

### A4. Impresoras

Antes de preguntar, **listá lo que ve Windows** (sección D3) y mostráselo.

| Pregunta | Notas |
|---|---|
| ¿Cuál es la impresora de **tickets de caja**? | Recibe ticket de pago, pre-cuenta, cierres y fichas |
| ¿Hay impresoras de **cocina / barra**? ¿Cuál va a cada sector? | Las comandas se rutean por sector |
| ¿Alguna es de red (IP) y no aparece en Windows? IP y puerto | Default 9100 |
| Ancho del papel de cada una | **80 mm = 48 columnas**, 58 mm = 32 columnas |

### A5. Punto de venta

| Pregunta | Campo |
|---|---|
| ¿Atienden con mesas? ¿Cuántas? ¿En qué salones/sectores? | mesas + sectores |
| ¿Cuentas separadas por persona (comandas)? | `comandasHabilitadas` |
| ¿Imprimir la comanda sola al cargar ítems? | `autoImprimirComanda` (default sí) |
| ¿Ticket de pago automático en el cobro rápido y a crédito? | `autoImprimirTicketVenta` (default sí) |
| ¿Hacen delivery? | `deliveryHabilitado` |
| ¿A qué hora "empieza el día" comercial? | `inicioJornadaHora` (default 7; usar 0 si cierran antes de medianoche) |
| ¿Pizzas con varios sabores? Máximo de sabores y cómo cobran (el más caro / promedio) | `pizzaMaxSabores`, `pizzaEstrategiaPrecio` |
| **¿Es una cantina de eventos con fichas?** | Ver A5.1 |
| ¿Qué pantalla abre por defecto? | `pdvTabDefault`: MESAS / COMANDAS |

**A5.1 Cantina de eventos (fichas).** Sólo si lo usan (requiere la versión con el
PR GabFrank/frc-gourmet#327):

- ¿Una ficha por unidad o por ítem? `fichasModo`: POR_UNIDAD / POR_ITEM.
- ¿El precio va en la ficha?
- Nombre del evento.
- ¿Productos que no llevan ficha o que salen como una sola? Es un override por
  producto.

### A6. Bancos, POS y caja mayor

- **Cuentas bancarias** (repetir por cada una): banco, nombre de la cuenta, número,
  tipo (CORRIENTE/AHORRO), moneda, titular, alias, **saldo inicial**.
- **Máquinas POS** (repetir): nombre (ej. BANCARD 1), proveedor, **a qué cuenta
  acredita**, comisión %, en cuánto acredita (horas/días). ¿Es Bancard o uPay? Hay
  reglas precargables por medio (crédito / débito / QR).
- ¿Cobran por **QR** o **transferencia**? ¿A qué cuenta va cada una?
- **Caja mayor**: nombre (ej. CAJA MAYOR), responsable y **saldo inicial en efectivo
  por moneda**.

> En builds anteriores al arreglo de #340, una base Postgres no acepta en la caja
> mayor montos ni saldos de 100.000.000 Gs o más. Ver Anexo D.

### A7. Personal y usuarios

Para cada persona del equipo:

| Dato | Para qué |
|---|---|
| Nombre, apellido, CI, teléfono | Persona |
| ¿Usa el sistema? usuario y **rol** (ADMINISTRADOR / GERENTE / CAJERO / MOZO) | Usuario + rol |
| ¿Es funcionario en planilla? cargo, fecha de ingreso, salario y moneda, turno, ¿IPS? | Funcionario |

Cargos sembrados: ADMINISTRADOR, CAJERO, MOZO, COCINERO, AYUDANTE COCINA, DELIVERY,
LIMPIEZA. Turnos sembrados: MAÑANA 06-14, TARDE 14-22, NOCHE 22-06.

Preguntá también: ¿los funcionarios **consumen a crédito** en el local (cliente
conveniado, descontado de su sueldo)?

### A8. Catálogo

**Pedí la lista de precios en planilla** (Anexo C1). Si la dictan, agrupá por
familia. Por producto:

| Dato | Notas |
|---|---|
| Nombre | |
| Familia / subfamilia | ej. BEBIDAS / CERVEZAS. Hay una `GENERAL / GENERAL` sembrada |
| Tipo | **Comprado y revendido** (cerveza, gaseosa) → `RETAIL`. **Elaborado en cocina** → `ELABORADO_SIN_VARIACION`. **Pizza por tamaño y sabor** → `ELABORADO_CON_VARIACION`. **Por kilo** → `BUFFET_POR_PESO` |
| Presentación | ej. UNIDAD, BOTELLA 1L, PACK X6 (cantidad 6) |
| **Precio de venta** (Gs) | Por presentación |
| **Costo** (Gs) | Por unidad base. Para elaborados se calcula de la receta: preguntá si quieren cargar recetas ahora o sólo el precio |
| IVA | 10 / 5 / 0 (default 10) |
| ¿Controla stock? ¿Stock inicial? | Recomendado sólo para RETAIL |
| ¿A qué sector/impresora va la comanda? | ej. COCINA, BARRA |
| ¿En qué botón del PdV aparece? | Grupos de atajos, ej. BEBIDAS > CERVEZAS |

Para pizzas: tamaños (presentaciones), sabores y el precio de **cada** sabor × tamaño.

### A9. Clientes (opcional)

Clientes frecuentes o corporativos con crédito: nombre, RUC/CI, razón social,
límite de crédito.

### A10. Cierre de la entrevista

Mostrá el **resumen del plan**: conteos por bloque y detalle de lo sensible
(precios, comisiones, saldos). Pedí confirmación explícita y guardá
`setup-plan.json`.

---

## 2. Fase B: preparar la PC

### B1. Instalar

1. Instalar el `.exe`. El instalador NSIS es de un click, por usuario, y queda en
   `%LOCALAPPDATA%\Programs\FRC Gourmet`.
2. **Postgres (sólo si eligieron Postgres):** instalar PostgreSQL 16 x64 con puerto
   5432 y anotar la contraseña del superusuario `postgres`. **No** crear la base a
   mano: la app la crea.
3. Abrir la app una vez y cerrarla. En ese primer arranque corre las migraciones y
   los seeds.

### B2. Contraseña del admin (paso manual, obligatorio)

El seed crea `admin` / `admin` con **cambio de contraseña obligatorio**. Mientras no
se cambie, **todo** handler protegido responde 403 `DEBE CAMBIAR SU CONTRASEÑA`.

> **Recomendado:** pedile al usuario que abra la app, entre con `admin` / `admin` y
> ponga la contraseña nueva en el diálogo (mínimo 6 caracteres). Pedile que te la
> dicte para usarla en la carga, o que te cree un usuario ADMINISTRADOR propio.
>
> Con los arreglos de #337 también podés hacerlo vos por HTTP después de B3:
> `POST /api/auth/login` con admin/admin y después
> `change-password [ {usuarioId, currentPassword:'admin', newPassword} ]`. Ese canal
> no necesita permiso, así que funciona aunque el usuario tenga el cambio pendiente.
> Volvé a hacer login con la contraseña nueva.

Si eligieron **Postgres**, en el mismo paso (los canales de configuración de BD
están bloqueados por HTTP):

1. Ir a *Sistema → Configuración BD → Postgres*.
2. Completar host `localhost`, puerto `5432`, superusuario `postgres` con su
   contraseña, base `frc_gourmet`, usuario `frc_user` y una contraseña nueva.
3. *Inicializar BD → Probar conexión → Guardar → Reiniciar*.
4. Volver a entrar con `admin` / `admin` y cambiar la contraseña otra vez: es una
   base nueva.

### B3. Pasar a modo server para la carga

El modo se lee de `app-settings.json`. Por HTTP no se puede cambiar (`app-mode-save`
está bloqueado), así que se edita el archivo **con la app cerrada**.

1. Ubicar el archivo. Debería ser `%APPDATA%\FRC Gourmet\app-settings.json`:
   ```powershell
   Get-ChildItem $env:APPDATA -Recurse -Filter app-settings.json -ErrorAction SilentlyContinue |
     Where-Object { $_.FullName -match 'FRC' }
   ```
   Si no está, buscalo junto a `frc-gourmet.db` o `logs\main.log`.
2. **Hacé un backup** del archivo antes de tocarlo.
3. Cerrá la app por completo; revisá que no quede en la bandeja del sistema.
4. Agregá o cambiá **sólo** estas claves. La app completa el resto con sus defaults:
   ```json
   {
     "mode": "server",
     "network": { "serverPort": 7070 },
     "windowBehavior": { "autoStart": true, "startMinimized": false, "closeAction": "minimize", "autoStartPrompted": true }
   }
   ```
   `autoStart` va según lo que respondieron en A1. `autoStartPrompted: true` evita un
   diálogo en el primer arranque.
5. Firewall, **sólo si va a haber otras terminales o tablets**:
   ```powershell
   New-NetFirewallRule -DisplayName "FRC Gourmet 7070" -Direction Inbound -Protocol TCP -LocalPort 7070 -Action Allow -Profile Private
   ```
6. Abrí la app, que tiene que quedar abierta mientras cargás. Verificá:
   ```powershell
   Invoke-RestMethod http://localhost:7070/api/health
   Invoke-RestMethod http://localhost:7070/api/version
   ```

---

## 3. Fase C: cliente de la API

### C1. Contrato

- **Login:** `POST /api/auth/login` con `{ "nickname": "...", "password": "..." }`.
  Devuelve `{ success, usuario: { id, nickname, mustChangePassword }, accessToken, refreshToken }`.
  - 401 `password_incorrecto` / `usuario_no_encontrado_o_inactivo`.
  - El access token **dura 15 minutos**.
- **Refresh:** `POST /api/auth/refresh` con `{ "refreshToken": "..." }`. Devuelve
  tokens nuevos y **rota** el refresh, así que hay que guardar el nuevo.
- **RPC:** `POST /api/rpc` con `Authorization: Bearer <accessToken>` y body
  `{ "method": "<canal>", "params": [arg1, arg2, ...] }`. Los **params son
  posicionales**: un `update-x` es `[id, data]` y un `create-x` es `[data]`.
- **Respuestas:**
  - 200 `{ "result": ... }`; revisar `result.success === false`.
  - 401: token vencido, hacer refresh.
  - 403 `PERMISO REQUERIDO` / `DEBE CAMBIAR SU CONTRASEÑA` / `channel_bloqueado_para_http`.
  - 404: el canal no existe en esta versión. **Pará.**
  - 500 `{ error }`.
- **Rate limit:** `/api/auth/*` 30 por minuto y `/api/rpc` 600 por minuto. Con un
  catálogo grande, metele una pausa de 120 ms entre llamadas.
- Las **relaciones** se mandan como `{ id }` (`sector: { id: 3 }`), salvo los campos
  terminados en `Id` (`printerTicketId`, `sectorId`, `presentacionId`…).

### C2. Helper PowerShell

```powershell
$Base = 'http://localhost:7070'
$Script:Tok = $null; $Script:Ref = $null
function Login($nick, $pass) {
  $r = Invoke-RestMethod -Method Post "$Base/api/auth/login" -ContentType 'application/json' `
       -Body (@{ nickname = $nick; password = $pass } | ConvertTo-Json)
  if (-not $r.success) { throw "Login falló" }
  if ($r.usuario.mustChangePassword) { throw "El usuario debe cambiar la contraseña en la app (ver B2)" }
  $Script:Tok = $r.accessToken; $Script:Ref = $r.refreshToken
}
function Refresh() {
  $r = Invoke-RestMethod -Method Post "$Base/api/auth/refresh" -ContentType 'application/json' `
       -Body (@{ refreshToken = $Script:Ref } | ConvertTo-Json)
  $Script:Tok = $r.accessToken; $Script:Ref = $r.refreshToken
}
function Rpc($method, [object[]]$params = @()) {
  $body = @{ method = $method; params = $params } | ConvertTo-Json -Depth 20 -Compress
  for ($i = 0; $i -lt 2; $i++) {
    try {
      $r = Invoke-RestMethod -Method Post "$Base/api/rpc" -ContentType 'application/json; charset=utf-8' `
           -Headers @{ Authorization = "Bearer $Script:Tok" } -Body ([Text.Encoding]::UTF8.GetBytes($body))
      if ($r.result -is [psobject] -and $r.result.PSObject.Properties['success'] -and $r.result.success -eq $false) {
        throw "$method → $($r.result.message)"
      }
      Start-Sleep -Milliseconds 120
      return $r.result
    } catch {
      if ($_.Exception.Response.StatusCode.value__ -eq 401 -and $i -eq 0) { Refresh; continue }
      throw
    }
  }
}
```

> Cuidado con `ConvertTo-Json`: con un array de un solo elemento, PowerShell 5 lo
> "aplana". Para `params` usá siempre `@(, $obj)` o armá el JSON a mano. Mandá el
> body en UTF-8, como el helper, por las tildes y la Ñ.

---

## 4. Fase D: carga, en este orden

Cada paso dice canal y `params`. **Antes de crear, listá. Después de crear, guardá
el id.**

### D1. Lecturas de referencia

```
get-empresa []                getMonedas []             getFormasPago []
get-dispositivos []           getSectores []            get-printers []
get-roles []                  get-cargos []             get-turnos []
get-tipo-clientes []          get-tipo-precios []       getPdvConfig []
```

Anotá los ids de: `GUARANI`, `DOLAR`, `REAL`; `EFECTIVO`, `TARJETA DEBITO`,
`TARJETA CREDITO`, `TRANSFERENCIA`; el dispositivo `TERMINAL PRINCIPAL`; el sector
`SALON`; el tipo de precio `PRECIO NORMAL`; los roles; la familia y subfamilia
`GENERAL`.

### D2. Empresa y monedas

- `update-empresa [ {nombre, nombreComercial, razonSocial, ruc, direccion, telefono, email, actividadEconomica, zonaHoraria, timbradoNumero?, timbradoVigenciaHasta?, puntoExpedicion?} ]`.
  Sólo cambia las claves que mandes y este handler **sí** pasa a mayúsculas.
- Cotización, por cada moneda extranjera:
  `create-moneda-cambio [ {monedaOrigen:{id:DOLAR}, monedaDestino:{id:GUARANI}, compraOficial, ventaOficial, compraLocal, ventaLocal, activo:true} ]`.
  - Los cuatro valores son **obligatorios** y son **guaraníes por 1 unidad** de la
    moneda extranjera.
  - **Origen = extranjera, destino = GUARANI**, igual que la UI.
- Moneda no aceptada: `updateMoneda [id, {activo:false}]`. Preguntá antes de desactivar.

### D3. Impresoras

1. Detectar:
   - `list-system-printers []` lista las impresoras instaladas en Windows;
   - para las de red, `scan-network-printers [ {mdns:true, tcpScan:false, tcpPort:9100} ]`.
2. Alta, por cada impresora:
   `add-printer [ {name:'CAJA', type:'epson', connectionType:'system'|'network', address:<nombre en Windows o IP>, port:9100, width:48|32, characterSet:'PC437_USA', isDefault:<sólo la de caja>} ]`.
   - **USB/instalada en Windows:** `connectionType:'system'` y `address` = el nombre
     **exacto** del spooler.
   - **Red:** `connectionType:'network'` con la IP.
3. Probar:
   - `test-printer-connection [ {connectionType, address, port, type} ]` → `{ ok }`;
   - después `print-test-page [printerId]` y **pedile al usuario que confirme** que
     salió el papel.
4. Ticket de la terminal: `update-dispositivo [dispositivoId, {printerTicketId: <id CAJA>, nombre:'CAJA 1'}]`.
   Otras terminales: `create-dispositivo [ {nombre, isVenta:true, isCaja:true, isTouch:false, isMobile:false, activo:true, printerTicketId?} ]`.
5. Sectores de comanda:
   - `createSector [ {nombre:'COCINA', tipo:'IMPRESION', activo:true} ]`. Los
     salones con mesas usan `tipo:'MESA'`.
   - `create-sector-impresora [ {sectorId, printerId, rol:'COMANDA'} ]`. Para la
     pre-cuenta en otra impresora, `rol:'PRECUENTA'`.

### D4. Punto de venta

1. `getPdvConfig []` para obtener `id`.
2. `updatePdvConfig [id, { cantidad_mesas, comandasHabilitadas, autoImprimirComanda, autoImprimirTicketVenta, deliveryHabilitado, inicioJornadaHora, pdvTabDefault, pizzaMaxSabores, pizzaEstrategiaPrecio, fichasHabilitadas?, fichasModo?, fichasMostrarPrecio?, fichasNombreEvento? }]`.
   - `cantidad_mesas` va en **snake_case**; todos los demás campos en camelCase.
   - No uses `createPdvConfig`.
3. Mesas: `createBatchPdvMesas [ [ {numero:1, cantidad_personas:4, activo:true, sector:{id}}, ... ] ]`.
   Ojo: es un array **dentro** del array de params. `cantidad_mesas` **no** crea mesas.

### D5. Bancos, POS, formas de pago y caja mayor

1. Cuenta, con trazabilidad del saldo inicial:
   - `create-cuenta-bancaria [ {nombre, banco, numeroCuenta, tipoCuenta:'CORRIENTE'|'AHORRO', moneda:{id}, titular, alias, saldo:0, activo:true} ]`;
   - si hay saldo inicial, `create-movimiento-bancario [ {cuentaBancariaId, tipoMovimiento:'ENTRADA_MANUAL', monto, observacion:'SALDO INICIAL'} ]`.
2. POS: `create-maquina-pos [ {nombre, proveedor, cuentaBancaria:{id}, porcentajeComision, minutosAcreditacion, autoAcreditar:true, activo:true} ]`.
   - `minutosAcreditacion`: 24 h = 1440.
   - Reglas por medio, si es Bancard o uPay: `cargar-reglas-observadas-pos [maquinaPosId, 'BANCARD'|'UPAY']`.
     Quedan **inactivas** hasta que el usuario las verifique; avisale.
   - Reglas a medida: `save-maquina-pos-regla [ {maquinaPosId, medio:'CREDITO'|'DEBITO'|'QR', plazoDias, tipoDias:'HABILES'|'CORRIDOS', porcentajeComision, ...} ]`.
3. Formas de pago. Al **reiniciar**, la app vincula sola todas las POS activas a las
   formas de pago con TARJETA/CREDITO/DEBITO en el nombre, y todas las cuentas
   activas a TRANSFERENCIA/PIX. Ese vínculo automático sólo agrega, nunca quita. Si
   el local quiere otro vínculo:
   - `updateFormaPago [id, {maquinasPosIds:[...], cuentasBancariasIds:[...]}]`. Los
     arrays **reemplazan** la lista completa.
   - Nuevas (ej. QR): `createFormaPago [ {nombre:'QR', movimentaCaja:false, principal:false, activo:true, orden:7, maquinasPosIds?, cuentasBancariasIds?} ]`.
4. Caja mayor:
   - `create-caja-mayor [ {nombre:'CAJA MAYOR', descripcion?, responsable?:{id: usuarioId}} ]`;
   - saldo inicial por moneda: `create-caja-mayor-movimiento [ {cajaMayor:{id}, tipoMovimiento:'AJUSTE_POSITIVO', moneda:{id}, formaPago:{id:EFECTIVO}, monto, observacion:'SALDO INICIAL'} ]`.

### D6. Personal

Por persona, en este orden:

1. `create-persona [ {nombre, apellido, documento, tipoDocumento:'CI', tipoPersona:'FISICA', telefono, email?, activo:true} ]`.
   Devuelve la persona con su `id`.
2. Si usa el sistema:
   - `create-usuario [ {nickname, password:<temporal>, persona_id, activo:true, mustChangePassword:<ver nota>} ]`;
     el **id está en `result.usuario.id`**;
   - `assign-role-to-usuario [usuarioId, roleId]`.
3. Si es funcionario:
   - si el cargo no existe, `create-cargo [ {nombre, descripcion?} ]`;
   - `create-funcionario [ {personaId, cargoId, monedaSalarioId, salarioBase, fechaIngreso:'YYYY-MM-DD', usuarioId?, ipsActivo?, numeroIps?, crearClienteConveniado:<ver nota>} ]`;
   - turno: `asignar-turno-funcionario [ {funcionarioId, turnoId, fechaDesde:'YYYY-MM-DD'} ]`.

> **`crearClienteConveniado`:** `true` crea un cliente CONVENIADO para que el
> funcionario consuma a crédito. El seed crea ese tipo de cliente desde #339. Si
> `get-tipo-clientes` no lo muestra (build anterior), crealo antes con
> `create-tipo-cliente [ {descripcion:'CONVENIADO', credito:true, activo:true} ]` o
> mandá `false`.
>
> **`mustChangePassword` para usuarios nuevos:** `true`, con una contraseña
> temporal. Cada uno la cambia en su primer ingreso, desde cualquier terminal (#337).

### D7. Clientes (opcional)

- `create-cliente [ {persona:{id}, tipo_cliente:{id}, ruc?, razon_social?, credito?, limite_credito?, activo:true} ]`.
  Antes crear la persona.

### D8. Catálogo

1. Familias y subfamilias, buscando antes en `get-familias`/`get-subfamilias`:
   - `create-familia [ {nombre, activo:true} ]`;
   - `create-subfamilia [ {nombre, familiaId, activo:true} ]`.
2. Producto **RETAIL**, el caso común:
   1. `create-producto [ {nombre, tipo:'RETAIL', unidadBase:'UNIDAD'|'KILOGRAMO'|'LITRO', iva:10, subfamiliaId, activo:true, esVendible:true, esComprable:true, controlaStock:true, esIngrediente:false, requiereComanda:true|false} ]`;
   2. `create-presentacion [ {productoId, nombre:'UNIDAD', cantidad:1, principal:true, activo:true} ]`;
   3. `create-precio-venta [ {presentacionId, valor, monedaId:GUARANI, tipoPrecioId:PRECIO_NORMAL, principal:true, activo:true} ]`.
      El precio es de la **presentación completa** (un pack x6 lleva el precio del pack);
   4. `create-precio-costo [ {productoId, valor, monedaId:GUARANI, fuente:'MANUAL', fecha:'YYYY-MM-DD', activo:true} ]`.
      El costo es **por unidad base**, la `fecha` es obligatoria y no hay que cargar
      dos costos;
   5. stock inicial: `create-stock-movimiento [ {productoId, cantidad, tipo:'AJUSTE_POSITIVO', tipoReferencia:'AJUSTE', observaciones:'STOCK INICIAL', fecha:'YYYY-MM-DD', activo:true} ]`.
3. **Elaborado** (`ELABORADO_SIN_VARIACION`):
   1. `create-producto` con `controlaStock:false`;
   2. `create-receta [ {nombre, rendimiento:1, unidadRendimiento:'UNIDADES'} ]`;
   3. `vincular-receta-a-producto [productoId, recetaId]`;
   4. `create-precio-venta [ {recetaId, valor, monedaId, tipoPrecioId, principal:true, activo:true} ]`.

   Si dieron ingredientes: `create-receta-ingrediente [ {recetaId, ingredienteId, cantidad, unidad} ]`.
   El ingrediente es un producto `RETAIL_INGREDIENTE` con su costo, y el costo de la
   receta se recalcula solo.
4. **Pizza** (`ELABORADO_CON_VARIACION`):
   1. `create-producto`;
   2. **primero** las presentaciones (tamaños);
   3. `create-sabor [ {nombre, categoria, productoId} ]` por sabor;
   4. `get-variaciones-by-producto [productoId]`;
   5. `create-precio-venta [ {recetaPresentacionId, valor, ...} ]` por cada sabor × tamaño.

   Si se agrega un tamaño después: `generate-variaciones-faltantes`.
5. Comanda: `set-producto-sectores [productoId, [sectorId, ...]]`. Reemplaza el
   conjunto completo.
   Un producto que **no** va a cocina (entradas, servicios, bebidas que se sirven en
   caja) va con `requiereComanda:false` en `create-producto`/`update-producto` (#336).
6. Botones del PdV:
   1. `createPdvAtajoGrupo [ {nombre, posicion, activo:true} ]`;
   2. `createPdvAtajoItem [ {nombre, activo:true, colorFondo, colorTexto} ]`;
   3. `assignAtajoItemToGrupo [grupoId, itemId, posicion]`;
   4. `assignProductoToAtajoItem [atajoItemId, productoId, {}]`.

   Usá colores legibles en tema claro y oscuro: fondo de color medio y texto blanco.
7. Fichas de cantina, si aplica: `update-producto [productoId, {fichaModo:'POR_ITEM'|'NO_IMPRIME'|'POR_UNIDAD'|null}]`.
   `null` hereda el modo del PdV.

> El PdV usa el precio **activo y principal**, sin filtrar por moneda: cargá **un
> solo** precio por presentación, en guaraníes. Montos en guaraníes **sin
> decimales**. El tope de un precio es 99.999.999.

---

## 5. Fase E: verificación y entrega

1. **Relectura:** listá cada entidad cargada y compará contra `setup-plan.json`.
   Mostrá las diferencias.
2. **Prueba real con el usuario:**
   1. abrir caja en el PdV;
   2. una venta rápida de 1 producto;
   3. cobrar en efectivo;
   4. confirmar el ticket impreso;
   5. si hay mesas, cargar un ítem a una mesa y confirmar la **comanda en la
      impresora del sector**;
   6. si hay fichas, confirmar que salen;
   7. cancelar esa venta de prueba (gerente).
3. **Volver a standalone**, sólo si el local quedó con una sola PC y no usa tablets:
   cerrar la app, poner `"mode": "standalone"` en `app-settings.json` y abrirla de
   nuevo.
4. **Backup:** en *Sistema → Backup*, activar el backup automático (diario, 7 copias)
   y hacer uno manual ahora.
5. **Reporte final**, también guardado como `setup-report.md`:
   - qué se creó, con cantidades;
   - qué quedó pendiente y por qué;
   - usuarios y contraseñas temporales, **entregados una sola vez**;
   - recordatorios: verificar las reglas POS precargadas (quedaron inactivas),
     cotizaciones diarias, cambio de contraseñas;
   - si la build es anterior al PR #327, los rodeos del Anexo D que se aplicaron.

---

## Anexo A: lo que ya existe después del primer arranque

No lo crees de nuevo.

| Qué | Valores |
|---|---|
| Usuario | `admin` (rol ADMINISTRADOR, con todos los permisos) |
| Roles | ADMINISTRADOR, GERENTE, GERENTE_READONLY, CAJERO, MOZO, AUDITOR_DR, COLABORADOR_DR |
| Monedas | GUARANI (principal, 0 decimales), DOLAR (2), REAL (2) y sus billetes |
| Formas de pago | EFECTIVO (principal, mueve caja), TARJETA DEBITO, TARJETA CREDITO, TRANSFERENCIA, PIX, CHEQUE |
| Tipo de precio | PRECIO NORMAL |
| Tipo de cliente | CONSUMIDOR FINAL (**no** CONVENIADO) |
| Dispositivo | TERMINAL PRINCIPAL (venta + caja) |
| Sector | SALON |
| Familia / Subfamilia | GENERAL / GENERAL |
| Cargos | ADMINISTRADOR, CAJERO, MOZO, COCINERO, AYUDANTE COCINA, DELIVERY, LIMPIEZA |
| Turnos | MAÑANA 06-14, TARDE 14-22, NOCHE 22-06 |
| Otros | Feriados PY del año, 11 observaciones (PARA LLEVAR, SIN CEBOLLA…), categorías de gasto y compra, PROVEEDOR GENERAL |
| Se crean al leerlas | Empresa "MI EMPRESA" (`get-empresa`) y PdvConfig (`getPdvConfig`) |
| **No existen** | Cotizaciones, impresoras, mesas, cuentas bancarias, máquinas POS, caja mayor, productos |

## Anexo B: canales bloqueados por HTTP

Se hacen desde la UI o editando `app-settings.json`:

- **Base de datos:** `db-config-*` (Postgres).
- **Modo de operación:** `app-mode-save`.
- **Backups:** `backup-restore`, `backup-config-set`, `backup-db-reset`.
- **Otros:** `reset-database`, `restart-app`, `set-notif-secret` (API key de
  WhatsApp), `ia-config-set`, conexión de Spotify, actualizaciones (`auto-update:*`)
  y las ventanas (`window:*`).
- **Cambio de contraseña:** **no** está bloqueado. En builds anteriores al arreglo
  de #337 fallaba por HTTP.

## Anexo C: planillas sugeridas

**C1. Productos (`productos.csv`)**

```
familia,subfamilia,producto,tipo,presentacion,cantidad_presentacion,unidad_base,precio_venta,costo,iva,controla_stock,stock_inicial,sector_comanda,atajo_grupo,atajo_boton,ficha_modo
BEBIDAS,CERVEZAS,CERVEZA PILSEN 1L,RETAIL,UNIDAD,1,UNIDAD,15000,9000,10,SI,48,BARRA,BEBIDAS,CERVEZAS,
BEBIDAS,CERVEZAS,PACK PILSEN X6,RETAIL,PACK X6,6,UNIDAD,80000,,10,SI,,BARRA,BEBIDAS,CERVEZAS,POR_ITEM
COCINA,PLATOS,MILANESA CON PAPAS,ELABORADO_SIN_VARIACION,,,,45000,,10,NO,,COCINA,COMIDAS,PLATOS,
```

- `tipo` ∈ RETAIL | ELABORADO_SIN_VARIACION | ELABORADO_CON_VARIACION | BUFFET_POR_PESO.
- Las filas con el mismo `producto` y distinta `presentacion` son presentaciones
  del mismo producto.
- Pizzas: una planilla aparte, `producto, tamaño, sabor, precio`.

**C2. Personal (`personal.csv`)**

```
nombre,apellido,ci,telefono,usuario,rol,es_funcionario,cargo,fecha_ingreso,salario,moneda_salario,turno,ips,consume_a_credito
JUAN,PEREZ,1234567,0981000000,JPEREZ,CAJERO,SI,CAJERO,2026-11-01,2800000,GUARANI,TARDE,SI,NO
```

**C3. Bancos y POS (`bancos.csv`, `pos.csv`)**

```
banco,nombre_cuenta,numero,tipo,moneda,titular,alias,saldo_inicial
nombre_pos,proveedor,cuenta_destino,comision_pct,horas_acreditacion,reglas_observadas
```

## Anexo D: arreglos de los que depende este runbook

Todos están en el PR GabFrank/frc-gourmet#327. Con una build **anterior**, aplicá el
rodeo:

| Issue | Qué arregla | Rodeo en una build anterior |
|---|---|---|
| GabFrank/frc-gourmet#336 | `requiereComanda` se guarda | No hay: el producto queda con comanda; dejalo sin sector |
| GabFrank/frc-gourmet#337 | `change-password` funciona por HTTP | Cambiar las contraseñas desde la app de escritorio del servidor |
| GabFrank/frc-gourmet#338 | La UI asigna los roles al crear un usuario | Por API se asignan bien; sólo afecta a altas manuales |
| GabFrank/frc-gourmet#339 | El seed crea el tipo de cliente CONVENIADO | Crearlo con `create-tipo-cliente` o mandar `crearClienteConveniado:false` |
| GabFrank/frc-gourmet#340 | Caja mayor admite ≥ 100 M Gs en Postgres | Cargar el saldo inicial en partes menores |
| GabFrank/frc-gourmet#329 | Concluir una venta exige un `Pago` | — (no afecta la carga; sí a quien automatice ventas) |
| GabFrank/frc-gourmet#332 | Pagos consolidados en moneda cruzada | No pagar deudas en USD/BRL con guaraníes por pago consolidado |

Cómo saber si la build los trae: `GET /api/version` devuelve `appVersion`; compará
con el release que incluyó el PR #327.
