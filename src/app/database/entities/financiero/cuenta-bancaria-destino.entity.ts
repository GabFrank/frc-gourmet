import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from './moneda.entity';
import { Persona } from '../personas/persona.entity';
import { TipoCuentaBancaria } from './banking-enums';

/**
 * Cuenta bancaria de DESTINO/COBRO (terceros, SIN saldo).
 * 
 * IMPORTANTE: Distinta de CuentaBancaria (EMPRESA, CON saldo).
 * 
 * - CuentaBancaria = activo de la empresa (caja mayor, POS, transferencias internas)
 * - CuentaBancariaDestino = información de cobro de terceros (proveedores/clientes/funcionarios)
 * 
 * El titular se DERIVA de Persona (readonly en UI), a diferencia de
 * CuentaBancaria.titular que es string libre editable.
 */
@Entity('cuentas_bancarias_destino')
export class CuentaBancariaDestino extends BaseModel {
  // DUEÑO: Persona que figura como titular en el banco
  @ManyToOne(() => Persona, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'persona_id' })
  persona!: Persona;

  @Column({ type: 'int', name: 'persona_id' })
  personaId!: number;

  @Column({ type: 'varchar', length: 100 })
  banco!: string;

  @Column({ type: 'varchar', length: 50, name: 'numero_cuenta' })
  numeroCuenta!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  alias?: string;

  // TITULAR derivado de Persona (readonly UI) — poblado automáticamente al crear/actualizar
  // Desnormalizado para consistencia con CuentaBancaria.titular (empresa)
  @Column({ type: 'varchar', length: 200, name: 'titular' })
  titular!: string;

  @ManyToOne(() => Moneda, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({ type: 'int', name: 'moneda_id' })
  monedaId!: number;

  @Column({ 
    type: 'varchar', 
    length: 20, 
    name: 'tipo_cuenta', 
    enum: TipoCuentaBancaria, 
    default: TipoCuentaBancaria.CORRIENTE 
  })
  tipoCuenta!: TipoCuentaBancaria;

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'text', nullable: true })
  observacion?: string;
}
