# Capítulo 20 — Importación de facturas con IA (OCR)

FRC Gourmet puede leer una **foto o PDF de una factura física** y armar el borrador de compra automáticamente, usando inteligencia artificial. Vos solo revisás y confirmás.

## Qué hace

1. Subís una imagen (JPG/PNG/WEBP) o un PDF de tu factura de proveedor.
2. La IA "lee" el documento y extrae:
   - Datos del proveedor (nombre, RUC, teléfono).
   - Datos del documento (número de factura, fecha, tipo, moneda, total).
   - Cada ítem comprado (descripción, cantidad, precio unitario, IVA si aparece).
3. El sistema busca esos datos en tu base:
   - Si encuentra el proveedor por RUC → lo vincula automáticamente.
   - Si no, te muestra los más parecidos para que elijas (o crees uno nuevo).
   - Cada producto se intenta vincular a uno ya registrado, sino podés crear uno rápido.
4. Confirmás → se crea una **compra borrador** que se abre para que la finalices con el flujo normal (eligiendo si es contado/crédito, fecha de cuotas, etc.).

## Configurar la IA (una sola vez)

Vas a **Sistema → Configurar IA** en el menú lateral.

- **API Key de OpenAI**: pegá la clave (empieza con `sk-...`). Cómo obtenerla: cuenta en https://platform.openai.com, sección "API Keys". Necesitás cargar saldo (mínimo USD 5). No es la cuenta de ChatGPT — es separada.
- **Modelo**: por defecto **gpt-4o** (~USD 0.01 por factura, mejor calidad). Si querés bajar costo, usá **gpt-4o-mini** (~USD 0.002, calidad algo menor).
- Marcá **Habilitar importación con IA** para activar el módulo.
- Tocá **Probar conexión**. Si dice "Conexión OK" + latencia, está listo.

> La clave queda guardada solo en tu equipo (en el archivo `ia-config.json` dentro de los datos de la app). No se sube a internet ni se incluye en backups de la base.

## Importar una factura

1. Andá a **Compras → Compras** (o **Compras → Importaciones IA** para llevar el historial).
2. Tocá **Importar con IA**.
3. Seleccioná el archivo (foto JPG/PNG o PDF, hasta 5MB).
4. Esperá 10-30 segundos mientras la IA procesa.
5. Se abre la pestaña **Revisar factura #N**.

### En la pestaña de revisión

**Sección Proveedor**
- Arriba muestra lo que detectó el OCR: nombre, RUC, teléfono.
- Si ves un chip verde **Auto-vinculado** → el sistema ya lo vinculó por RUC o por aprendizaje previo. Listo.
- Si ves chip amarillo **Sugerencia** → el sistema cree que es uno determinado pero no está 100% seguro. Mirá el dropdown y confirmá tocando la opción correcta.
- Si ves chip naranja **Sin coincidencia** → tocá el dropdown y elegí, o presioná **Crear nuevo** para registrar el proveedor (los datos vienen pre-cargados del OCR).
- Si tocás el dropdown y elegís/confirmás, el chip pasa a verde **Validado**.

**Sección Datos del documento**
- Número de nota, fecha, tipo (LEGAL/COMÚN/OTRO/SIN COMPROBANTE), moneda.
- **Total detectado** = lo que dice la factura.
- **Total ajustado** = lo que se va a guardar (cambia si omitís ítems o editás precios). Si difiere del total OCR, queda en amarillo.
- Badge naranja "N omitidos" si tachás líneas.

**Sección Ítems**
- Tabla con todas las líneas que la IA detectó. Por cada una:
  - **Producto**: dropdown para vincular a un producto del sistema. Las primeras opciones son las sugerencias por similitud. Botón **+** abre un formulario rápido para crear un producto nuevo (con datos pre-cargados del OCR).
  - **Presentación**: una vez elegido el producto, aparecen sus presentaciones (botella 750ml, kg, etc.). Por defecto se selecciona la principal.
  - **Cantidad / P. Unit. / Subtotal**: editables si querés ajustar.
  - Botón **○** (con menos) para **omitir** la línea (cuando la IA detectó algo que no es un producto, ej. un "DELIVERY" o un descuento). La fila se tacha y no se incluye en la compra.

**Botones del header**
- **Ver factura**: abre la imagen ampliada en una ventana grande para que puedas comparar.
- **Cancelar**: cierra la pestaña sin guardar. La factura queda con estado "Requiere revisión" y podés volver más tarde.
- **Confirmar y crear borrador**: valida que todo esté vinculado, crea la compra borrador y abre la pestaña de edición de compra para que la finalices.

## Crear producto rápido (desde el revisor)

Si una línea no tiene producto vinculado, tocá el botón **+**. Se abre un diálogo con campos mínimos:

- **Nombre**: viene precargado de la descripción OCR.
- **Tipo**: RETAIL (reventa) o RETAIL + INGREDIENTE.
- **IVA**: viene precargado del OCR si lo tenía (10/5/0%, default 10%).
- **Unidad base**: KG / LITRO / UNIDAD / etc. — el sistema intenta inferirlo de la descripción ("750 ML" → MILILITRO, "1 KG" → KG).
- **Presentación principal**: nombre + cantidad. También se infiere ("750 ML" → cantidad 750).
- **Código de barras**: si el OCR detectó uno (formato GTIN 8-14 dígitos), se carga automáticamente.

Tocá **Crear (parcial)**. Por qué "parcial": el producto queda guardado con datos mínimos y aparece en la lista de productos con un chip naranja "Parcial". Eso es para que después, cuando tengas tiempo, vayas a **Productos → Productos** y completes los datos faltantes (familia, subfamilia, precios de venta, recetas si aplica). Filtrá por "Solo parciales" para encontrarlos rápido.

## Crear proveedor rápido

Si tocás **Crear nuevo** en la sección Proveedor, se abre un diálogo con los datos del OCR pre-cargados (nombre, RUC, teléfono). Solo confirmá.

## El sistema aprende

La primera vez que importás una factura de un proveedor, tenés que vincular cada producto a mano (o crearlos). **La próxima vez** que aparezca el mismo proveedor con los mismos productos:

- El proveedor se vincula automáticamente (chip verde).
- Cada producto que ya vinculaste antes aparece **Auto-vinculado** sin que toques nada.
- Solo tendrías que validar productos nuevos del proveedor, si los hay.

El sistema guarda esto como "alias OCR": una pareja `(texto detectado → producto del sistema)` por proveedor. La carga de las primeras 1-2 facturas de cada proveedor es la pesada; después es casi automática.

## Lista de Importaciones IA

En **Compras → Importaciones IA** ves todo el historial:

- Estado: PROCESANDO, REQUIERE REVISIÓN, CONFIRMADO, ERROR, DESCARTADO.
- Modelo y costo en USD por documento.
- Compra vinculada (link directo si está confirmada).
- Acciones (menú ⋮):
  - **Revisar**: reabre la pestaña de revisión.
  - **Reprocesar IA**: vuelve a llamar a la IA sobre el mismo archivo (útil si la primera vez salió mal).
  - **Ver compra vinculada**: abre el detalle de la compra creada.
  - **Descartar**: marca el documento como no útil (no lo borra del disco).

## Errores comunes

- **"Archivo demasiado grande"**: la imagen pesa más de 5MB. Reducí resolución o usá un PDF.
- **"OpenAI 401"**: API key incorrecta o sin saldo. Verificá en platform.openai.com.
- **"Timeout"**: la imagen tardó más de 45 segundos. Reintentá o achicá la imagen.
- **"Falta vincular N ítems"**: alguna línea no tiene producto + presentación. Vinculá o tocá omitir.
- **El proveedor sugerido es el cliente, no el vendedor**: la IA tiene una regla explícita para no confundirlos pero a veces falla con facturas mal escaneadas. Cambiá manualmente desde el dropdown.

## ¿Cuándo NO importar con IA?

- Compras pequeñas o sin comprobante: cargá manualmente desde **Nueva compra**.
- Si la foto está muy borrosa o el documento es manuscrito: la IA puede no leer bien. Probá una mejor foto o cargalo a mano.
- Si tu proveedor te manda XML SIFEN: ese flujo es directo (futura facturación electrónica), no pasa por OCR.
