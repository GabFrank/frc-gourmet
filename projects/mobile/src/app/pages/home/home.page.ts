import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService, Usuario } from '@frc/shared-core';
import { NAV_ITEMS, NavItem } from '../../core/shell/nav';
import { PwaInstallService } from '../../core/services/pwa-install.service';

/** Dashboard de inicio: saludo + accesos rápidos a las secciones. */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
  private readonly auth = inject(AuthService);
  readonly pwa = inject(PwaInstallService);

  readonly user: Usuario | null = this.auth.currentUser;
  readonly accesos: NavItem[] = NAV_ITEMS.filter((i) => !i.exact);
}
