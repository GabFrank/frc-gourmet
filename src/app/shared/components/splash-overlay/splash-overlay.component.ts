import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';
import { ThemeService } from '../../../services/theme.service';

@Component({
  selector: 'app-splash-overlay',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  templateUrl: './splash-overlay.component.html',
  styleUrls: ['./splash-overlay.component.scss'],
})
export class SplashOverlayComponent implements OnInit, OnDestroy {
  @Input() userName: string | null = null;
  @Input() greeting: string | null = null;

  isDarkTheme = false;
  private themeSub?: Subscription;

  constructor(private themeService: ThemeService) {}

  ngOnInit(): void {
    this.themeSub = this.themeService.isDarkTheme().subscribe(v => {
      this.isDarkTheme = v;
    });
  }

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
  }
}
