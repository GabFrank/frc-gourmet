import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { ChequeraEstado } from './cheques-enums';

@Entity('chequeras')
export class Chequera extends BaseModel {
  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @ManyToOne('CuentaBancaria', { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_bancaria_id' })
  cuentaBancaria!: any;

  @Column({ name: 'numero_inicial', type: 'varchar', length: 30 })
  numeroInicial!: string;

  @Column({ name: 'numero_final', type: 'varchar', length: 30 })
  numeroFinal!: string;

  @Column({ name: 'siguiente_numero', type: 'varchar', length: 30 })
  siguienteNumero!: string;

  @Column({
    type: 'varchar',
    enum: ChequeraEstado,
    default: ChequeraEstado.ACTIVA,
  })
  estado!: ChequeraEstado;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @OneToMany('Cheque', 'chequera')
  cheques?: any[];
}
