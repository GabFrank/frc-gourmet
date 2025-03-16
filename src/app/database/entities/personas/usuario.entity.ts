import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity representing a system user
 */
@Entity('usuarios')
export class Usuario extends BaseModel {
  @ManyToOne('Persona')
  @JoinColumn({ name: 'persona_id' })
  persona!: any;

  @Column({ unique: true })
  nickname!: string;

  @Column()
  password!: string;

  @Column({ default: true })
  activo!: boolean;
} 