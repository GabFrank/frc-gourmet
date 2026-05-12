import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  OnboardingAction,
  OnboardingStatus,
  OnboardingTaskStatus,
} from 'src/app/services/onboarding.service';

export interface OnboardingActionEvent {
  taskKey: string;
  actionTabKey: string;
}

export interface OnboardingMarkRequest {
  taskKey: string;
  action: OnboardingAction;
}

@Component({
  selector: 'app-onboarding-list',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './onboarding-list.component.html',
  styleUrls: ['./onboarding-list.component.scss'],
})
export class OnboardingListComponent {
  @Input() status: OnboardingStatus | null = null;

  @Output() action = new EventEmitter<OnboardingActionEvent>();
  @Output() markRequest = new EventEmitter<OnboardingMarkRequest>();

  get progressValue(): number {
    if (!this.status || this.status.totalTasks === 0) return 0;
    return (this.status.totalCompleted / this.status.totalTasks) * 100;
  }

  onHacer(task: OnboardingTaskStatus): void {
    this.action.emit({ taskKey: task.key, actionTabKey: task.actionTabKey });
  }

  onMark(task: OnboardingTaskStatus, action: OnboardingAction): void {
    this.markRequest.emit({ taskKey: task.key, action });
  }

  trackByKey(_index: number, task: OnboardingTaskStatus): string {
    return task.key;
  }
}
