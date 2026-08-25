import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Producto } from './producto.entity';

@Entity('sabor')
export class Sabor extends BaseModel {
  @Column({ type: 'varchar', length: 100 })
  nombre!: string; // "Calabresa", "Pepperoni"

  @Column({ type: 'varchar', length: 100 })
  categoria!: string; // "PIZZA", "HAMBURGUESA", "PASTA"

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  /**
   * Si el nombre de esta parte figura en el nombre compuesto de la variación
   * (`producto + tamaño + sabor`). Se apaga cuando el nombre es de relleno: hay
   * presentaciones llamadas «TRADICIONAL» que existen sólo porque el nombre es
   * obligatorio, y sabores únicos que no distinguen nada. Default true: no
   * cambia nada hasta que alguien lo marque.
   */
  @Column({ name: 'mostrar_en_nombre', type: 'boolean', default: true })
  mostrarEnNombre!: boolean;


  // Imagen del sabor (PIZZA Pepperoni vs Calabresa). URL `app://producto-images/<file>`.
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'image_url' })
  imageUrl?: string;

  // Relationships
  @ManyToOne(() => Producto, producto => producto.sabores)
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;
}
