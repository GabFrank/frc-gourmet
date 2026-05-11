import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { RetiroCajaEstado } from './caja-mayor-enums';
import { Usuario } from '../personas/usuario.entity';

@Entity('retiros_caja')
export class RetiroCaja extends BaseModel {
  @ManyToOne('Caja', { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_id' })
  caja!: any;

  @ManyToOne('CajaMayor', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_mayor_id' })
  cajaMayor?: any;

  @Column({
    type: 'varchar',
    enum: RetiroCajaEstado,
    default: RetiroCajaEstado.FLOTANTE
  })
  estado!: RetiroCajaEstado;

  @Column({ name: 'fecha_retiro' })
  fechaRetiro!: Date;

  @Column({ name: 'fecha_ingreso', nullable: true })
  fechaIngreso?: Date;

  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'responsable_retiro_id' })
  responsableRetiro!: Usuario;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'responsable_ingreso_id' })
  responsableIngreso?: Usuario;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @OneToMany('RetiroCajaDetalle', 'retiroCaja', { cascade: true })
  detalles!: any[];
}
