import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { PresentacionSabor } from './presentacion-sabor.entity';
import type { IntercambioIngrediente } from './intercambio-ingrediente.entity';

/**
 * Entity representing a product flavor
 */
@Entity('producto_sabores')
export class Sabor extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('PresentacionSabor', 'sabor')
  presentacionesSabores!: PresentacionSabor[];

  @OneToMany('IntercambioIngrediente', 'sabor')
  intercambioIngredientes!: IntercambioIngrediente[];
}
