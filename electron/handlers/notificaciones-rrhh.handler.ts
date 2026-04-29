import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { NotificacionRrhh } from '../../src/app/database/entities/rrhh/notificacion-rrhh.entity';
import { TipoNotificacionRrhh, PrioridadNotificacion } from '../../src/app/database/entities/rrhh/notificacion-rrhh-enums';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { VacacionPeriodo, VacacionPeriodoEstado } from '../../src/app/database/entities/rrhh/vacacion-periodo.entity';
import { LiquidacionSueldo } from '../../src/app/database/entities/rrhh/liquidacion-sueldo.entity';
import { LiquidacionSueldoEstado } from '../../src/app/database/entities/rrhh/liquidacion-sueldo-estado.enum';
import { LiquidacionComision } from '../../src/app/database/entities/rrhh/liquidacion-comision.entity';
import { LiquidacionComisionEstado } from '../../src/app/database/entities/rrhh/regla-comision-enums';
import { FuncionarioDocumento } from '../../src/app/database/entities/rrhh/funcionario-documento.entity';
import { CuentaPorPagar } from '../../src/app/database/entities/financiero/cuenta-por-pagar.entity';
import { CuentaPorPagarCuota } from '../../src/app/database/entities/financiero/cuenta-por-pagar-cuota.entity';
import { CuentaPorPagarTipo, CuentaPorPagarEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

let _dataSource: DataSource;

export async function generarNotificacionesRrhh(): Promise<void> {
  if (!_dataSource) return;
  try {
    const hoy = new Date();
    const hoyStr = hoy.toISOString().slice(0, 10);
    const notifRepo = _dataSource.getRepository(NotificacionRrhh);

    const notifsPorInsertar: Partial<NotificacionRrhh>[] = [];

    // Helper: skip si clave dedupe ya existe hoy
    const claveExiste = async (clave: string): Promise<boolean> => {
      const existe = await notifRepo.findOne({ where: { claveDedupe: clave } });
      return !!existe;
    };

    // 1. CUMPLEANIOS: funcionarios activo cuya persona.fechaNacimiento mes/dia = hoy
    try {
      const funcionarios = await _dataSource.getRepository(Funcionario).find({
        where: { activo: true },
        relations: ['persona'],
      });
      const mesDia = `${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
      for (const f of funcionarios) {
        if (!f.persona?.fechaNacimiento) continue;
        const fn = new Date(f.persona.fechaNacimiento);
        const fnMesDia = `${String(fn.getMonth() + 1).padStart(2, '0')}-${String(fn.getDate()).padStart(2, '0')}`;
        if (fnMesDia === mesDia) {
          const clave = `CUMPLEANIOS-${hoyStr}-${f.id}`;
          if (!(await claveExiste(clave))) {
            notifsPorInsertar.push({
              tipo: TipoNotificacionRrhh.CUMPLEANIOS,
              prioridad: PrioridadNotificacion.BAJA,
              titulo: `CUMPLEANOS DE ${(f.persona.nombre + ' ' + (f.persona.apellido || '')).trim()}`.toUpperCase(),
              mensaje: `HOY ES EL CUMPLEANOS DE ${(f.persona.nombre + ' ' + (f.persona.apellido || '')).trim().toUpperCase()}. NO OLVIDE FELICITARLE.`,
              funcionario: f,
              fechaGenerada: hoy,
              claveDedupe: clave,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error generando notif cumpleanios:', e);
    }

    // 2. CUOTA_VENCIDA: CuentaPorPagarCuota vencida de prestamo funcionario
    try {
      const cuotas = await _dataSource.getRepository(CuentaPorPagarCuota).find({
        relations: ['cuentaPorPagar', 'cuentaPorPagar.funcionario', 'cuentaPorPagar.funcionario.persona'],
      });
      for (const c of cuotas) {
        const cpp = c.cuentaPorPagar as any;
        if (!cpp || cpp.tipo !== CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO) continue;
        if ((c as any).estado === 'PAGADA') continue;
        const fVenc = new Date(c.fechaVencimiento);
        if (fVenc < hoy) {
          const clave = `CUOTA_VENCIDA-${hoyStr}-${c.id}`;
          if (!(await claveExiste(clave))) {
            const nomFun = cpp.funcionario?.persona
              ? `${cpp.funcionario.persona.nombre} ${cpp.funcionario.persona.apellido || ''}`.trim().toUpperCase()
              : 'FUNCIONARIO DESCONOCIDO';
            notifsPorInsertar.push({
              tipo: TipoNotificacionRrhh.CUOTA_VENCIDA,
              prioridad: PrioridadNotificacion.ALTA,
              titulo: `CUOTA VENCIDA - ${nomFun}`,
              mensaje: `LA CUOTA NRO ${c.numero} DEL PRESTAMO DE ${nomFun} VENCIO EL ${fVenc.toISOString().slice(0, 10)}.`,
              funcionario: cpp.funcionario,
              fechaGenerada: hoy,
              claveDedupe: clave,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error generando notif cuota vencida:', e);
    }

    // 3. PRESTAMO_VENCIDO: CuentaPorPagar tipo PRESTAMO_FUNCIONARIO con todas cuotas vencidas
    try {
      const cpps = await _dataSource.getRepository(CuentaPorPagar).find({
        where: { tipo: CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO },
        relations: ['funcionario', 'funcionario.persona', 'cuotas'],
      });
      for (const cpp of cpps) {
        if (cpp.estado === CuentaPorPagarEstado.PAGADO || cpp.estado === CuentaPorPagarEstado.CANCELADO) continue;
        const cuotasArr = (cpp as any).cuotas as any[] || [];
        const todasVencidas = cuotasArr.length > 0 && cuotasArr.every((c: any) => {
          const fv = new Date(c.fechaVencimiento);
          return c.estado !== 'PAGADA' && fv < hoy;
        });
        if (todasVencidas) {
          const clave = `PRESTAMO_VENCIDO-${hoyStr}-${cpp.id}`;
          if (!(await claveExiste(clave))) {
            const nomFun = (cpp as any).funcionario?.persona
              ? `${(cpp as any).funcionario.persona.nombre} ${(cpp as any).funcionario.persona.apellido || ''}`.trim().toUpperCase()
              : 'FUNCIONARIO DESCONOCIDO';
            notifsPorInsertar.push({
              tipo: TipoNotificacionRrhh.PRESTAMO_VENCIDO,
              prioridad: PrioridadNotificacion.ALTA,
              titulo: `PRESTAMO VENCIDO - ${nomFun}`,
              mensaje: `EL PRESTAMO DE ${nomFun} TIENE TODAS SUS CUOTAS VENCIDAS Y SIN PAGAR.`,
              funcionario: (cpp as any).funcionario,
              fechaGenerada: hoy,
              claveDedupe: clave,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error generando notif prestamo vencido:', e);
    }

    // 4. VACACION_PROXIMA: VacacionPeriodo PROGRAMADA con fechaDesde entre hoy y +30 dias
    try {
      const en30 = new Date(hoy);
      en30.setDate(en30.getDate() + 30);
      const periodos = await _dataSource.getRepository(VacacionPeriodo).find({
        where: { estado: VacacionPeriodoEstado.PROGRAMADA },
        relations: ['vacacion', 'vacacion.funcionario', 'vacacion.funcionario.persona'],
      });
      for (const p of periodos) {
        const fd = new Date(p.fechaDesde);
        if (fd >= hoy && fd <= en30) {
          const clave = `VACACION_PROXIMA-${hoyStr}-${p.id}`;
          if (!(await claveExiste(clave))) {
            const f = (p as any).vacacion?.funcionario;
            const nomFun = f?.persona
              ? `${f.persona.nombre} ${f.persona.apellido || ''}`.trim().toUpperCase()
              : 'FUNCIONARIO';
            notifsPorInsertar.push({
              tipo: TipoNotificacionRrhh.VACACION_PROXIMA,
              prioridad: PrioridadNotificacion.MEDIA,
              titulo: `VACACION PROXIMA - ${nomFun}`,
              mensaje: `${nomFun} TIENE VACACIONES PROGRAMADAS DESDE ${p.fechaDesde} HASTA ${p.fechaHasta}.`,
              funcionario: f,
              fechaGenerada: hoy,
              claveDedupe: clave,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error generando notif vacacion proxima:', e);
    }

    // 5. LIQUIDACION_PENDIENTE: LiquidacionSueldo APROBADA sin pagar > 7 dias
    try {
      const liqAprobadas = await _dataSource.getRepository(LiquidacionSueldo).find({
        where: { estado: LiquidacionSueldoEstado.APROBADA },
        relations: ['funcionario', 'funcionario.persona'],
      });
      const hace7 = new Date(hoy);
      hace7.setDate(hace7.getDate() - 7);
      for (const liq of liqAprobadas) {
        if (!liq.fechaAprobacion) continue;
        if (new Date(liq.fechaAprobacion) > hace7) continue;
        const clave = `LIQUIDACION_PENDIENTE-${hoyStr}-${liq.id}`;
        if (!(await claveExiste(clave))) {
          const nomFun = liq.funcionario?.persona
            ? `${(liq.funcionario as any).persona.nombre} ${(liq.funcionario as any).persona.apellido || ''}`.trim().toUpperCase()
            : 'FUNCIONARIO';
          notifsPorInsertar.push({
            tipo: TipoNotificacionRrhh.LIQUIDACION_PENDIENTE,
            prioridad: PrioridadNotificacion.ALTA,
            titulo: `LIQUIDACION PENDIENTE DE PAGO - ${nomFun}`,
            mensaje: `LA LIQUIDACION DE ${nomFun} PARA EL PERIODO ${liq.periodo} FUE APROBADA HACE MAS DE 7 DIAS Y AUN NO HA SIDO PAGADA.`,
            funcionario: liq.funcionario,
            fechaGenerada: hoy,
            claveDedupe: clave,
          });
        }
      }
    } catch (e) {
      console.error('Error generando notif liquidacion pendiente:', e);
    }

    // 6. COMISION_PENDIENTE: LiquidacionComision APROBADA
    try {
      const liqComAprobadas = await _dataSource.getRepository(LiquidacionComision).find({
        where: { estado: LiquidacionComisionEstado.APROBADA },
        relations: ['funcionario', 'funcionario.persona'],
      });
      for (const lc of liqComAprobadas) {
        const clave = `COMISION_PENDIENTE-${hoyStr}-${lc.id}`;
        if (!(await claveExiste(clave))) {
          const nomFun = (lc as any).funcionario?.persona
            ? `${(lc as any).funcionario.persona.nombre} ${(lc as any).funcionario.persona.apellido || ''}`.trim().toUpperCase()
            : 'FUNCIONARIO';
          notifsPorInsertar.push({
            tipo: TipoNotificacionRrhh.COMISION_PENDIENTE,
            prioridad: PrioridadNotificacion.MEDIA,
            titulo: `COMISION APROBADA PENDIENTE - ${nomFun}`,
            mensaje: `LA LIQUIDACION DE COMISION DE ${nomFun} PARA EL PERIODO ${lc.periodo} ESTA APROBADA Y PENDIENTE DE INTEGRACION.`,
            funcionario: (lc as any).funcionario,
            fechaGenerada: hoy,
            claveDedupe: clave,
          });
        }
      }
    } catch (e) {
      console.error('Error generando notif comision pendiente:', e);
    }

    // 7. DOCUMENTO_VENCE: FuncionarioDocumento con vencimiento entre hoy y +30 dias
    try {
      const en30 = new Date(hoy);
      en30.setDate(en30.getDate() + 30);
      const docs = await _dataSource.getRepository(FuncionarioDocumento).find({
        relations: ['funcionario', 'funcionario.persona'],
      });
      for (const doc of docs) {
        if (!doc.vencimiento) continue;
        const fv = new Date(doc.vencimiento);
        if (fv >= hoy && fv <= en30) {
          const clave = `DOCUMENTO_VENCE-${hoyStr}-${doc.id}`;
          if (!(await claveExiste(clave))) {
            const nomFun = doc.funcionario?.persona
              ? `${(doc.funcionario as any).persona.nombre} ${(doc.funcionario as any).persona.apellido || ''}`.trim().toUpperCase()
              : 'FUNCIONARIO';
            notifsPorInsertar.push({
              tipo: TipoNotificacionRrhh.DOCUMENTO_VENCE,
              prioridad: PrioridadNotificacion.MEDIA,
              titulo: `DOCUMENTO POR VENCER - ${nomFun}`,
              mensaje: `EL DOCUMENTO "${doc.nombreArchivo}" DE ${nomFun} VENCE EL ${doc.vencimiento}.`,
              funcionario: doc.funcionario,
              fechaGenerada: hoy,
              claveDedupe: clave,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error generando notif documento vence:', e);
    }

    // Insertar todas las notificaciones generadas
    for (const n of notifsPorInsertar) {
      try {
        const entity = notifRepo.create(n);
        await notifRepo.save(entity);
      } catch (e) {
        // Puede fallar por dedupe unique constraint - ignorar
      }
    }

    console.log(`[NotificacionesRrhh] Generadas ${notifsPorInsertar.length} notificaciones`);
  } catch (e) {
    console.error('Error en generarNotificacionesRrhh:', e);
  }
}

export function registerNotificacionesRrhhHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => Usuario | null,
): void {
  _dataSource = dataSource;

  ipcMain.handle('get-notificaciones-rrhh', async (_event, filtros?: { usuarioId?: number; soloNoLeidas?: boolean; limit?: number }) => {
    try {
      const repo = dataSource.getRepository(NotificacionRrhh);
      const qb = repo.createQueryBuilder('n')
        .leftJoinAndSelect('n.funcionario', 'funcionario')
        .leftJoinAndSelect('funcionario.persona', 'persona')
        .leftJoinAndSelect('n.usuarioDestino', 'usuarioDestino')
        .orderBy('n.fechaGenerada', 'DESC');

      if (filtros?.soloNoLeidas) {
        qb.andWhere('n.fechaLeida IS NULL');
      }
      if (filtros?.usuarioId) {
        qb.andWhere('(n.usuarioDestino IS NULL OR usuarioDestino.id = :uid)', { uid: filtros.usuarioId });
      }
      if (filtros?.limit) {
        qb.take(filtros.limit);
      }
      return await qb.getMany();
    } catch (error) {
      console.error('Error get-notificaciones-rrhh:', error);
      throw error;
    }
  });

  ipcMain.handle('marcar-notificacion-leida', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(NotificacionRrhh);
      await repo.update(id, { fechaLeida: new Date() });
      return { success: true };
    } catch (error) {
      console.error('Error marcar-notificacion-leida:', error);
      throw error;
    }
  });

  ipcMain.handle('marcar-todas-notificaciones-leidas', async (_event, usuarioId?: number) => {
    try {
      const repo = dataSource.getRepository(NotificacionRrhh);
      const qb = repo.createQueryBuilder()
        .update()
        .set({ fechaLeida: new Date() })
        .where('fechaLeida IS NULL');
      if (usuarioId) {
        qb.andWhere('(usuarioDestino IS NULL OR usuario_destino_id = :uid)', { uid: usuarioId });
      }
      await qb.execute();
      return { success: true };
    } catch (error) {
      console.error('Error marcar-todas-notificaciones-leidas:', error);
      throw error;
    }
  });

  ipcMain.handle('generar-notificaciones-rrhh', async () => {
    try {
      await generarNotificacionesRrhh();
      return { success: true };
    } catch (error) {
      console.error('Error generar-notificaciones-rrhh:', error);
      throw error;
    }
  });

  ipcMain.handle('count-notificaciones-no-leidas', async (_event, usuarioId?: number) => {
    try {
      const repo = dataSource.getRepository(NotificacionRrhh);
      const qb = repo.createQueryBuilder('n').where('n.fechaLeida IS NULL');
      if (usuarioId) {
        qb.andWhere('(n.usuarioDestino IS NULL OR n.usuario_destino_id = :uid)', { uid: usuarioId });
      }
      const count = await qb.getCount();
      return { count };
    } catch (error) {
      console.error('Error count-notificaciones-no-leidas:', error);
      throw error;
    }
  });
}
