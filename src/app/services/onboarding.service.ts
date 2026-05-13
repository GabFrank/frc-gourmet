import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { RepositoryService } from 'src/app/database/repository.service';

export interface OnboardingTaskStatus {
  key: string;
  titulo: string;
  descripcion: string;
  icono: string;
  actionTabKey: string;
  perUser: boolean;
  manualOnly: boolean;
  completed: boolean;
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

export type OnboardingAction = 'MANUAL' | 'SKIPPED' | 'RESET';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private statusSubject = new BehaviorSubject<OnboardingStatus | null>(null);
  /** Stream del estado actual. Componentes se suscriben para reaccionar a cambios. */
  status$: Observable<OnboardingStatus | null> = this.statusSubject.asObservable();

  constructor(private repo: RepositoryService) {}

  /**
   * Refresca el estado desde el backend y lo emite en `status$`.
   * Retorna el valor para que el caller pueda encadenar.
   */
  refresh(): Observable<OnboardingStatus | null> {
    return this.repo.getOnboardingStatus().pipe(
      tap((status: OnboardingStatus) => this.statusSubject.next(status)),
      catchError((err) => {
        console.warn('OnboardingService.refresh error:', err);
        this.statusSubject.next(null);
        return of(null);
      }),
    );
  }

  getStatus(): OnboardingStatus | null {
    return this.statusSubject.getValue();
  }

  markTask(taskKey: string, action: OnboardingAction): Observable<any> {
    return this.repo.markOnboardingTask({ taskKey, action });
  }
}
