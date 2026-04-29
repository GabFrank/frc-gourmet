import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

@Entity('feriados')
export class Feriado extends BaseModel {
  @Index({ unique: true })
  @Column({ type: 'date' })
  fecha!: Date;

  @Column()
  descripcion!: string;

  @Column({ name: 'es_nacional', default: true })
  esNacional!: boolean;

  @Column({
    name: 'recargo_porcentaje',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 100,
  })
  recargoPorcentaje!: number;

  @Column({ default: true })
  activo!: boolean;
}
