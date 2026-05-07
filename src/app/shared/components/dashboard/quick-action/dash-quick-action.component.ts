import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-dash-quick-action',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './dash-quick-action.component.html',
})
export class DashQuickActionComponent {
  @Input() icon = 'play_arrow';
  @Input() title = '';
  @Input() color = '#7c4dff';
  @Input() disabled = false;
  @Input() tooltip = '';
  @Output() action = new EventEmitter<void>();

  onClick(): void {
    if (!this.disabled) this.action.emit();
  }
}
