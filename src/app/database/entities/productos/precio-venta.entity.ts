import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Presentacion } from './presentacion.entity';
import { Moneda } from '../financiero/moneda.entity';
import { TipoPrecio } from '../financiero/tipo-precio.entity';
import type { Receta } from './receta.entity';
import type { RecetaPresentacion } from './receta-presentacion.entity';
import type { Producto } from './producto.entity';

@Entity('precio_venta')
export class PrecioVenta extends BaseModel {
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor!: number;

  @Column({ type: 'boolean', default: false, comment: 'Indica si este es el precio por defecto para la presentación o receta.' })
  principal!: boolean;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  // --- Programación de vigencia (precios por día/horario) ---
  // Todos nullable: un precio sin programación es el fallback/base. El resolver
  // (electron/utils/precio-vigencia.util.ts) elige el de mayor prioridad cuya
  // ventana matchea la fecha/hora actual; si ninguno programado matchea, usa el
  // fallback sin programación.

  // CSV de días de semana en los que aplica: "1,2,3,4,5" (1=Lunes … 7=Domingo).
  // null = todos los días.
  @Column({ type: 'varchar', length: 30, nullable: true, name: 'dias_semana' })
  diasSemana?: string;

  // Hora de inicio de vigencia "HH:mm". Soporta cruce de medianoche
  // (horaInicio > horaFin → la ventana abarca la medianoche).
  @Column({ type: 'varchar', length: 5, nullable: true, name: 'hora_inicio' })
  horaInicio?: string;

  // Hora de fin de vigencia "HH:mm".
  @Column({ type: 'varchar', length: 5, nullable: true, name: 'hora_fin' })
  horaFin?: string;

  // Fecha desde la cual el precio es válido (feriados / promos puntuales).
  @Column({ type: 'date', nullable: true, name: 'fecha_inicio' })
  fechaInicio?: Date;

  // Fecha hasta la cual el precio es válido.
  @Column({ type: 'date', nullable: true, name: 'fecha_fin' })
  fechaFin?: Date;

  // Ante solape de varias reglas activas, gana la de mayor prioridad.
  @Column({ type: 'int', default: 0 })
  prioridad!: number;

  // --- Buffet por peso (cuando el producto es BUFFET_POR_PESO) ---
  // `valor` se interpreta como precio por kilo. Estos topes son schedule-aware
  // (van en PrecioVenta), así el "libre" de almuerzo puede diferir del de cena.

  // Cobro mínimo por plato (independiente del peso). null = sin mínimo.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'precio_minimo' })
  precioMinimo?: number;

  // Tope "buffet libre": a partir de este monto se cobra fijo. null = sin tope.
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'precio_maximo' })
  precioMaximo?: number;

  // Relationships
  @ManyToOne('Presentacion', { nullable: true })
  @JoinColumn({ name: 'presentacion_id' })
  presentacion?: Presentacion;

  @ManyToOne('Receta', { nullable: true })
  @JoinColumn({ name: 'receta_id' })
  receta?: Receta;

  // Precios directos para productos (COMBO, etc.)
  @ManyToOne('Producto', { nullable: true })
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  // Precios específicos para variaciones de receta
  @ManyToOne('RecetaPresentacion', { nullable: true })
  @JoinColumn({ name: 'receta_presentacion_id' })
  recetaPresentacion?: RecetaPresentacion;

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @ManyToOne(() => TipoPrecio)
  @JoinColumn({ name: 'tipo_precio_id' })
  tipoPrecio!: TipoPrecio;
}
