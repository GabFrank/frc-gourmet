import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CajaMayorEstado } from './caja-mayor-enums';
import { Usuario } from '../personas/usuario.entity';

@Entity('cajas_mayor')
export class CajaMayor extends BaseModel {
  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion?: string;

  @Column({
    type: 'varchar',
    enum: CajaMayorEstado,
    default: CajaMayorEstado.ABIERTA
  })
  estado!: CajaMayorEstado;

  @Column({ name: 'fecha_apertura' })
  fechaApertura!: Date;

  @Column({ name: 'fecha_cierre', nullable: true })
  fechaCierre?: Date;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'responsable_id' })
  responsable!: Usuario;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('CajaMayorSaldo', 'cajaMayor')
  saldos?: any[];

  @OneToMany('CajaMayorMovimiento', 'cajaMayor')
  movimientos?: any[];
}
