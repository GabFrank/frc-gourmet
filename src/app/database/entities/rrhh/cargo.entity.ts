import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Cargo laboral. NO equivale al Role de sistema (autenticacion).
 * Ej: MOZO, PARRILLERO, PIZZERO, CAJERO, COCINERO, ENCARGADO, DELIVERY.
 */
@Entity('cargos')
export class Cargo extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({
    name: 'salario_referencia',
    type: 'decimal',
    precision: 18,
    scale: 2,
    nullable: true,
  })
  salarioReferencia?: number;

  @Column({ default: true })
  activo!: boolean;
}
