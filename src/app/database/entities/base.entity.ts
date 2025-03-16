import { BaseEntity, CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';

/**
 * Base entity with common fields for all database entities
 */
export abstract class BaseModel extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne('Usuario', { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: any;

  @ManyToOne('Usuario', { nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedBy?: any;
} 