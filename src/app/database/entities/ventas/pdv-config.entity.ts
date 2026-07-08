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
}
