import { ipcMain } from 'electron';
import { DataSource, IsNull } from 'typeorm';
import { OnboardingTaskOverride } from '../../src/app/database/entities/personalizacion/onboarding-task-override.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { ONBOARDING_TASKS, OnboardingTaskDef } from './onboarding-tasks.config';

export interface OnboardingTaskStatus {
  key: string;
  titulo: string;
  descripcion: string;
  icono: string;
  actionTabKey: string;
  perUser: boolean;
  manualOnly: boolean;
  completed: boolean;
  /** 'auto' = count > threshold, 'manual' = marcada por usuario, 'skipped' = no aplica, null = pendiente */
  completedBy: 'auto' | 'manual' | 'skipped' | null;
  count: number;
  threshold: number;
}

export interface OnboardingStatus {
  tasks: OnboardingTaskStatus[];
  totalCompleted: number;
  totalTasks: number;
  allCompleted: boolean;
}

export function registerOnboardingHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('get-onboarding-status', async (): Promise<OnboardingStatus> => {
    const overrideRepo = dataSource.getRepository(OnboardingTaskOverride);
    const userId = getCurrentUser()?.id;

    // 1) Traer overrides relevantes en una sola query
    //    (globales = usuario_id IS NULL + las del usuario actual si existe)
    const overrides = await overrideRepo.find({
      where: userId
        ? [{ usuario: IsNull() }, { usuario: { id: userId } }]
        : [{ usuario: IsNull() }],
      relations: ['usuario'],
    });

    const overrideByKey = new Map<string, OnboardingTaskOverride>();
    for (const ov of overrides) {
      // Si una tarea es perUser y vienen 2 overrides (global + user), prioriza user
      const existing = overrideByKey.get(ov.taskKey);
      if (!existing) {
        overrideByKey.set(ov.taskKey, ov);
      } else {
        // El que tiene usuario gana sobre el global
        if (ov.usuario && !existing.usuario) overrideByKey.set(ov.taskKey, ov);
      }
    }

    // 2) Correr detect() de cada tarea en paralelo (con try/catch defensivo)
    const detectResults = await Promise.all(
      ONBOARDING_TASKS.map(async (task) => {
        if (task.manualOnly || !task.detect) return { count: 0 };
        try {
          return await task.detect(dataSource, task.perUser ? userId : undefined);
        } catch (e) {
          console.warn(`onboarding.detect(${task.key}) failed:`, e instanceof Error ? e.message : e);
          return { count: 0 };
        }
      }),
    );

    // 3) Armar response
    const tasks: OnboardingTaskStatus[] = ONBOARDING_TASKS.map((task, idx) => {
      const override = overrideByKey.get(task.key);
      const count = detectResults[idx].count;
      const threshold = task.threshold ?? 0;

      let completed = false;
      let completedBy: 'auto' | 'manual' | 'skipped' | null = null;

      if (override?.estado === 'MANUAL') {
        completed = true;
        completedBy = 'manual';
      } else if (override?.estado === 'SKIPPED') {
        completed = true;
        completedBy = 'skipped';
      } else if (!task.manualOnly && count > threshold) {
        completed = true;
        completedBy = 'auto';
      }

      return {
        key: task.key,
        titulo: task.titulo,
        descripcion: task.descripcion,
        icono: task.icono,
        actionTabKey: task.actionTabKey,
        perUser: !!task.perUser,
        manualOnly: !!task.manualOnly,
        completed,
        completedBy,
        count,
        threshold,
      };
    });

    const totalCompleted = tasks.filter((t) => t.completed).length;
    return {
      tasks,
      totalCompleted,
      totalTasks: tasks.length,
      allCompleted: totalCompleted === tasks.length,
    };
  });

  ipcMain.handle(
    'mark-onboarding-task',
    async (_event, payload: { taskKey: string; action: 'MANUAL' | 'SKIPPED' | 'RESET' }) => {
      if (!payload?.taskKey || !payload.action) {
        return { success: false, message: 'taskKey y action son requeridos.' };
      }

      const taskDef = ONBOARDING_TASKS.find((t) => t.key === payload.taskKey);
      if (!taskDef) {
        return { success: false, message: `Tarea ${payload.taskKey} no existe.` };
      }

      const repo = dataSource.getRepository(OnboardingTaskOverride);
      const currentUser = getCurrentUser();
      const userId = taskDef.perUser ? currentUser?.id ?? null : null;

      // Buscar override existente para esta tarea y este scope (global o user)
      const existing = await repo.findOne({
        where: userId
          ? { taskKey: payload.taskKey, usuario: { id: userId } }
          : { taskKey: payload.taskKey, usuario: IsNull() },
        relations: ['usuario'],
      });

      if (payload.action === 'RESET') {
        if (existing) await repo.remove(existing);
        return { success: true };
      }

      if (existing) {
        existing.estado = payload.action;
        await setEntityUserTracking(dataSource, existing, currentUser?.id, true);
        await repo.save(existing);
      } else {
        const entity = repo.create({
          taskKey: payload.taskKey,
          estado: payload.action,
          usuario: userId ? ({ id: userId } as any) : null,
        });
        await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
        await repo.save(entity);
      }
      return { success: true };
    },
  );
}
