import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Datos de la empresa (singleton). Hay una sola fila (id=1) por instalacion.
 * Se consume desde el header de la app, KuDEs/tickets de impresion y reportes
 * exportados. El handler `get-empresa` crea la fila default si no existe.
 *
 * Strings UPPERCASE en BD (nombre, razonSocial, direccion, actividadEconomica).
 */
@Entity('empresa')
export class Empresa extends BaseModel {
  @Column({ type: 'varchar', length: 120 })
  nombre!: string;

  @Column({ type: 'varchar', length: 120, name: 'nombre_comercial', nullable: true })
  nombreComercial?: string | null;

  @Column({ type: 'varchar', length: 180, name: 'razon_social', nullable: true })
  razonSocial?: string | null;

  /** Formato PY: 80012345-6 (1..8 digitos, guion, 1 digito verificador). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  ruc?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  direccion?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  telefono?: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 200, name: 'sitio_web', nullable: true })
  sitioWeb?: string | null;

  /** Servido por protocol `app://logos/<file>` (F2). */
  @Column({ type: 'varchar', length: 300, name: 'logo_url', nullable: true })
  logoUrl?: string | null;

  @Column({ type: 'varchar', length: 40, name: 'timbrado_numero', nullable: true })
  timbradoNumero?: string | null;

  @Column({ type: 'date', name: 'timbrado_vigencia_hasta', nullable: true })
  timbradoVigenciaHasta?: Date | null;

  /** Ej. "001-001" (establecimiento-punto). */
  @Column({ type: 'varchar', length: 20, name: 'punto_expedicion', nullable: true })
  puntoExpedicion?: string | null;

  @Column({ type: 'varchar', length: 60, default: 'PARAGUAY' })
  pais!: string;

  @Column({ type: 'varchar', length: 60, name: 'zona_horaria', default: 'America/Asuncion' })
  zonaHoraria!: string;

  /** FK informativa a moneda (no enforced). Se setea cuando F2/F3 lo requieran. */
  @Column({ type: 'int', name: 'moneda_principal_id', nullable: true })
  monedaPrincipalId?: number | null;

  /** Ej. "RESTAURANTE", "ALMACEN". */
  @Column({ type: 'varchar', length: 120, name: 'actividad_economica', nullable: true })
  actividadEconomica?: string | null;
}
