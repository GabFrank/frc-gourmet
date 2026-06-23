import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '@frc/shared-core';
import { sessionExpired$ } from './core/data/auth-events';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
      }
    `,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private sub?: Subscription;

  ngOnInit(): void {
    // Sesión expirada (401 irrecuperable) → cerrar sesión y volver al login.
    this.sub = sessionExpired$.subscribe(() => {
      if (this.auth.isLoggedIn) {
        void this.auth.logout();
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
