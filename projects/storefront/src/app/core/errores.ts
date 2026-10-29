/**
 * Tabla única de errores del server (`/pub/rpc`) → mensaje para el cliente.
 * Nunca se muestra el código crudo ni el texto de HttpClient.
 */
const MENSAJES: Record<string, string> = {
  // Carta y pedido
  producto_no_disponible: 'Uno de los productos ya no está disponible. Revisá tu pedido.',
  producto_inexistente: 'Uno de los productos ya no está en la carta. Revisá tu pedido.',
  opcion_invalida: 'Una de las opciones elegidas ya no está disponible. Revisá tu pedido.',
  adicional_invalido: 'Uno de los adicionales elegidos no corresponde a ese producto o ya no está disponible. Revisá tu pedido.',
  sabor_o_tamano_invalido: 'Uno de los sabores o tamaños ya no está disponible. Revisá tu pedido.',
  demasiados_sabores: 'Elegiste más sabores de los permitidos.',
  cantidad_excedida: 'La cantidad de un producto es demasiado grande.',
  demasiados_items: 'Tu pedido tiene demasiados productos. Dividilo en dos.',
  pedido_sin_items: 'Tu pedido está vacío.',
  tienda_cerrada: 'El local está cerrado en este momento.',
  pickup_no_disponible: 'Ahora no estamos tomando pedidos para retirar.',
  delivery_no_disponible: 'Por ahora no hacemos delivery. Podés pedir para retirar.',
  fuera_de_cobertura: 'Todavía no llegamos a esa zona.',
  zona_delivery_invalida: 'No pudimos ubicar tu dirección. Volvé a marcarla en el mapa.',
  zona_no_encontrada: 'No pudimos ubicar tu dirección. Volvé a marcarla en el mapa.',
  falta_ubicacion_mapa: 'Marcá en el mapa dónde entregamos.',
  coordenadas_invalidas: 'Marcá en el mapa dónde entregamos.',
  monto_minimo_no_alcanzado: 'Tu pedido no llega al mínimo para tu zona.',
  monto_minimo_global: 'Tu pedido no llega al mínimo.',
  metodo_pago_no_disponible: 'Ese medio de pago no está disponible.',
  tipo_pedido_invalido: 'Elegí si es para retirar o delivery.',
  falta_nombre: 'Ingresá tu nombre para el pedido.',
  nombre_requerido: 'Ingresá tu nombre.',
  pedido_no_encontrado: 'No encontramos ese pedido.',
  // Mesa
  mesa_invalida: 'No pudimos validar la mesa. Volvé a escanear el QR.',
  falta_mesa_token: 'No pudimos validar la mesa. Volvé a escanear el QR.',
  mesa_no_habilitada: 'La mesa todavía no está habilitada. Pedile al mozo que la active.',
  mesa_no_disponible: 'La mesa no está disponible ahora. Consultá al mozo.',
  fuera_de_red_local: 'Para pedir desde la mesa conectate al wifi del local.',
  // Ingreso
  otp_no_disponible: 'El ingreso con código por WhatsApp no está disponible. Entrá con email.',
  codigo_incorrecto: 'El código no es correcto.',
  codigo_expirado: 'El código venció. Pedí uno nuevo.',
  otp_no_encontrado_o_expirado: 'El código venció. Pedí uno nuevo.',
  envio_fallido: 'No pudimos mandarte el código. Probá de nuevo en un rato.',
  telefono_invalido: 'Ingresá un número válido.',
  email_invalido: 'Email inválido.',
  email_en_uso: 'Ese email ya tiene una cuenta. Ingresá con él.',
  cuenta_o_password_invalidos: 'Email o contraseña incorrectos.',
  password_incorrecto: 'Email o contraseña incorrectos.',
  password_corto: 'La contraseña necesita al menos 8 caracteres.',
  password_actual_incorrecta: 'La contraseña actual no es correcta.',
  falta_password_actual: 'Ingresá tu contraseña actual.',
  google_no_configurado: 'El ingreso con Google no está disponible.',
  google_email_no_verificado: 'Tu cuenta de Google no tiene el email verificado.',
  google_token_invalido: 'No se pudo ingresar con Google. Probá de nuevo.',
  google_aud_mismatch: 'No se pudo ingresar con Google. Probá de nuevo.',
  google_error: 'No se pudo ingresar con Google. Probá de nuevo.',
  cuenta_invalida: 'Tu cuenta no está activa.',
  cuenta_no_encontrada: 'Tu cuenta no está activa.',
  no_autenticado: 'Tu sesión venció. Ingresá de nuevo.',
  cliente_no_autenticado: 'Tu sesión venció. Ingresá de nuevo.',
  sesion_invalida_o_expirada: 'Tu sesión venció. Ingresá de nuevo.',
  refresh_invalido_o_expirado: 'Tu sesión venció. Ingresá de nuevo.',
  // Límites
  demasiadas_solicitudes: 'Hiciste muchos intentos seguidos. Esperá unos minutos.',
  demasiados_intentos: 'Hiciste muchos intentos seguidos. Esperá unos minutos.',
};

const GENERICO = 'Algo salió mal. Probá de nuevo en un rato.';

/** Código del server a partir de un string («producto_no_disponible:12») o un error. */
export function codigoError(e: unknown): string | null {
  if (!e) return null;
  if (typeof e === 'string') return e.split(':')[0].trim() || null;
  const any = e as any;
  if (typeof any?.error?.error === 'string') return codigoError(any.error.error);
  if (typeof any?.error === 'string') return codigoError(any.error);
  if (typeof any?.message === 'string' && /^[a-z_]+(:|$)/.test(any.message)) return codigoError(any.message);
  return null;
}

/** Mensaje en español para mostrar. `porDefecto` reemplaza el genérico. */
export function mensajeError(e: unknown, porDefecto = GENERICO): string {
  const any = e as any;
  if (any && typeof any === 'object' && 'status' in any) {
    if (any.status === 0) return 'Sin conexión. Revisá tu internet y probá de nuevo.';
    if (any.status === 429) return MENSAJES['demasiadas_solicitudes'];
    if (any.status === 401) return MENSAJES['no_autenticado'];
  }
  const c = codigoError(e);
  return (c && MENSAJES[c]) || porDefecto;
}
