import { Column, Entity } from 'typeorm';
import { BaseModel } from './base.entity';

@Entity('printers')
export class Printer extends BaseModel {
  @Column()
  name!: string;

  @Column()
  type!: string;

  @Column({ name: 'connection_type' })
  connectionType!: string;

  @Column()
  address!: string;

  @Column({ nullable: true })
  port?: number;

  @Column({ nullable: true })
  dpi?: number;

  @Column({ nullable: true })
  width?: number;

  @Column({ name: 'character_set', nullable: true })
  characterSet?: string;

  @Column({ name: 'is_default', default: false })
  isDefault!: boolean;

  @Column({ nullable: true, type: 'text' })
  options?: string;
} 