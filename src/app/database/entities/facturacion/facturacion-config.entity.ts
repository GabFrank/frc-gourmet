import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { TipoFacturacion } from './factura.entity';
import { FacturaPlantilla } from './factura-plantilla.entity';
import { TimbradoDetalle } from './timbrado-detalle.entity';

/**
 * Configuracion global (singleton, id=1) del modulo de facturacion.
 *
 * Un sistema opera con un unico modelo de facturacion (pre-impreso /
 * auto-impreso / electronico) y una plantilla/diseno predeterminado. La fila
 * se crea on-demand desde el handler get-facturacion-config.
 */
@Entity('facturacion_config')
export class FacturacionConfig extends BaseModel {
  /** Modelo de facturacion activo para todo el sistema. */
  @Column({ type: 'varchar', enum: TipoFacturacion, default: TipoFacturacion.PRE_IMPRESO, name: 'tipo_facturacion' })
  tipoFacturacion!: TipoFacturacion;

  /** Diseno predeterminado a usar al emitir facturas. */
  @ManyToOne(() => FacturaPlantilla, { nullable: true })
  @JoinColumn({ name: 'plantilla_predeterminada_id' })
  plantillaPredeterminada?: FacturaPlantilla;

  /** Punto de expedicion (numeracion) predeterminado al emitir. */
  @ManyToOne(() => TimbradoDetalle, { nullable: true })
  @JoinColumn({ name: 'timbrado_detalle_predeterminado_id' })
  timbradoDetallePredeterminado?: TimbradoDetalle;

  /**
   * En pre-impreso, permitir editar el numero de factura al emitir (la hoja
   * fisica ya tiene su numero; el sistema solo lo registra).
   */
  @Column({ default: true, name: 'permitir_editar_numero_preimpreso' })
  permitirEditarNumeroPreimpreso!: boolean;
}
