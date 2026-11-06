/**
 * F10: el texto para el cajero de cada código de error de los handlers de pedidos web.
 *
 * Lo usan LAS DOS pantallas de atención —la cola del diálogo de delivery y la bandeja— para que
 * el mismo rechazo del servidor se lea igual en las dos (ver domains/pedidos-online.md, «Dos
 * pantallas, un pedido»). Un código nuevo en un handler va acá, no en cada componente.
 */
const TEXTOS: Record<string, string> = {
  sin_caja: 'para esto hace falta una caja abierta.',
  no_hay_caja_abierta: 'no hay una caja abierta.',
  caja_ambigua: 'hay más de una caja abierta; hacelo desde el PdV de la caja que corresponde.',
  sin_venta: 'el pedido todavía no tiene venta. Usá «Enviar a cocina» con tu caja abierta.',
  transicion_invalida: 'el pedido ya cambió de estado. Actualizá la lista.',
  pedido_no_encontrado: 'el pedido ya no existe.',
  estado_no_rechazable: 'el pedido ya no se puede cancelar (ya salió o terminó).',
  mesa_ya_materializada: 'el pedido ya está en la cuenta de la mesa. Quitá los ítems desde el PdV.',
  sin_solicitud: 'la solicitud ya fue respondida.',
  pedido_cambio_reintentar: 'el pedido cambió mientras tanto. Volvé a intentarlo.',
  pedido_desfasado_del_delivery: 'el delivery avanzó pero el pedido no. Repetí la acción.',
  pedido_sin_pago_confirmado: 'el pago con tarjeta todavía no está confirmado.',
  pedido_no_aceptado: 'el pedido ya no está aceptado.',
  no_materializable: 'el pedido ya no está aceptado.',
  no_hay_devolucion_pendiente: 'ese pago ya no está pendiente de devolución.',
  estado_invalido: 'estado inválido para esta acción.',
};

/** Texto de un resultado `{ success:false, error, detalle }` de un handler. */
export function textoErrorPedidoOnline(res: any): string {
  const codigo = String(res?.error || '');
  if (codigo === 'delivery_rechazo_transicion') return limpiarCodigo(res?.detalle) || 'el delivery no permite ese cambio.';
  return TEXTOS[codigo] || limpiarCodigo(res?.detalle) || codigo || 'error desconocido.';
}

/** Texto de una excepción (IPC o HTTP): busca un código conocido; si no, el mensaje sin prefijos. */
export function textoExcepcionPedidoOnline(e: any): string {
  const msg = String(e?.message || e || '');
  const conocido = Object.keys(TEXTOS).find((c) => msg.includes(c));
  return conocido ? TEXTOS[conocido] : limpiarCodigo(msg);
}

/**
 * Saca el prefijo de Electron y el código en MAYÚSCULAS que los handlers anteponen
 * («VENTA_CANCELADA: esta venta…» → «esta venta…»): el código es para los logs.
 */
export function limpiarCodigo(msg: any): string {
  return String(msg || '')
    .replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
    .replace(/^Error:\s*/, '')
    .replace(/^[A-Z][A-Z0-9_]{3,}:\s*/, '')
    .trim();
}
