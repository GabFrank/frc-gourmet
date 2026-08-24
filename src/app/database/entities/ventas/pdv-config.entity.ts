import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { PdvGrupoCategoria } from './pdv-grupo-categoria.entity';

@Entity('pdv_config')
export class PdvConfig extends BaseModel {
  @Column({ nullable: false, default: 0 })
  cantidad_mesas!: number;

  // Foreign key
  @Column({ nullable: true })
  pdvGrupoCategoriaId?: number;

  // Relationship
  @ManyToOne(() => PdvGrupoCategoria, { nullable: true })
  @JoinColumn({ name: 'pdvGrupoCategoriaId' })
  pdvGrupoCategoria?: PdvGrupoCategoria;

  // Umbrales de diferencia de caja (porcentaje)
  @Column({ name: 'umbral_diferencia_baja', type: 'decimal', precision: 10, scale: 2, default: 5 })
  umbralDiferenciaBaja!: number;

  @Column({ name: 'umbral_diferencia_alta', type: 'decimal', precision: 10, scale: 2, default: 15 })
  umbralDiferenciaAlta!: number;

  // Umbrales de tiempo de espera delivery (minutos)
  @Column({ name: 'delivery_tiempo_amarillo', type: 'int', default: 30 })
  deliveryTiempoAmarillo!: number;

  @Column({ name: 'delivery_tiempo_rojo', type: 'int', default: 60 })
  deliveryTiempoRojo!: number;

  /**
   * Hora en que arranca la JORNADA COMERCIAL (0–23).
   *
   * Los turnos noche cruzan las 00:00 y llegan hasta las 02:00, así que el día
   * calendario parte las ventas de un mismo turno en dos. Con 7, la jornada del
   * día D va de `D 07:00:00.000` a `D+1 06:59:59.999`, y una venta de la 01:30
   * cuenta para el día anterior — que es como lo piensa el negocio.
   *
   * ⚠️ **0 = día calendario**, el comportamiento previo a 2026-08. Es la vía de
   * escape si algo no cuadra: se pone 0 y todos los dashboards vuelven a cortar
   * a medianoche, sin desplegar nada.
   *
   * Aplica a fechas de TRANSACCIÓN (cuándo pasó), nunca a fechas de vencimiento
   * (cuándo vence): un cheque vence el día X, no "en la jornada X".
   */
  @Column({ name: 'inicio_jornada_hora', type: 'int', default: 7 })
  inicioJornadaHora!: number;

  // Comandas
  @Column({ name: 'pdv_tab_default', type: 'varchar', default: 'MESAS' })
  pdvTabDefault!: string;

  @Column({ name: 'comandas_habilitadas', default: false })
  comandasHabilitadas!: boolean;

  /**
   * Si true, vincular una comanda a una mesa marca la mesa como OCUPADA, y al
   * liberar/cerrar la comanda la mesa vuelve a DISPONIBLE solo si no quedan otras
   * comandas OCUPADO ni una venta de mesa ABIERTA. Default false: la comanda no
   * ocupa la mesa (cuenta portátil independiente).
   */
  @Column({ name: 'ocupar_mesa_al_vincular_comanda', default: false })
  ocuparMesaAlVincularComanda!: boolean;

  // Tamaño del grid de atajos: 1=grande, 2=mediano, 3=pequeño
  @Column({ name: 'atajos_grid_size', type: 'int', default: 3 })
  atajosGridSize!: number;

  // Tamaño del grid de productos dentro de atajos: 1=grande, 2=mediano, 3=pequeño
  @Column({ name: 'atajos_productos_grid_size', type: 'int', default: 3 })
  atajosProductosGridSize!: number;

  // Configuración para productos con variaciones (pizzas, etc.)
  @Column({ name: 'pizza_max_sabores', type: 'int', default: 2 })
  pizzaMaxSabores!: number;

  @Column({ name: 'pizza_estrategia_precio', type: 'varchar', length: 50, default: 'MAYOR_PRECIO' })
  pizzaEstrategiaPrecio!: string; // MAYOR_PRECIO | PROMEDIO

  // ─── Impresión automática ───────────────────────────────────────────────
  // Flags que controlan los hooks de auto-impresión en `ventas.handler.ts`.
  // Si false, el cajero/mozo dispara la impresión manualmente desde la UI.

  /** Al agregar items a la comanda → imprimir automáticamente a impresoras del sector. */
  @Column({ name: 'auto_imprimir_comanda', default: true })
  autoImprimirComanda!: boolean;

  /** Al cobrar venta (CONCLUIDA) → imprimir ticket de venta automáticamente. */
  @Column({ name: 'auto_imprimir_ticket_venta', default: true })
  autoImprimirTicketVenta!: boolean;

  /** Botón "Pre-cuenta" del PdV imprime sin confirmación intermedia. */
  @Column({ name: 'imprimir_precuenta_al_solicitar', default: true })
  imprimirPrecuentaAlSolicitar!: boolean;

  // --- Balanza (etiqueta EAN-13 de buffet por peso) ---
  // Prefijo que identifica una etiqueta de balanza (típicamente '2').
  @Column({ name: 'balanza_prefijo', type: 'varchar', length: 2, default: '2' })
  balanzaPrefijo!: string;

  // Qué codifica el valor embebido de la etiqueta: PESO | PRECIO.
  @Column({ name: 'balanza_modo', type: 'varchar', length: 10, default: 'PESO' })
  balanzaModo!: string;

  // Factor para convertir el valor embebido a gramos (gramos = valor * factor).
  @Column({ name: 'balanza_factor_peso', type: 'decimal', precision: 10, scale: 3, default: 1 })
  balanzaFactorPeso!: number;

  // ─── WhatsApp: envío automático del resumen al cerrar caja ───────────────
  // Si está activo y hay un destino configurado, al cerrar una caja PdV se
  // envía por WhatsApp (Evolution API, config de Notificaciones) una imagen con
  // el resumen del cierre. Best-effort: si falla, no bloquea el cierre.
  @Column({ name: 'whatsapp_cierre_caja_activo', default: false })
  whatsappCierreCajaActivo!: boolean;

  // Número internacional (ej. 595991123456) o JID de grupo (…@g.us).
  @Column({ name: 'whatsapp_cierre_caja_destino', type: 'varchar', length: 120, nullable: true })
  whatsappCierreCajaDestino?: string | null;
}
