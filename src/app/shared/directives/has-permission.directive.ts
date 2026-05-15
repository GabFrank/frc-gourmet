import { Directive, Input, OnDestroy, OnInit, TemplateRef, ViewContainerRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { PermissionService } from '../../services/permission.service';

/**
 * Renderiza el elemento solo si el usuario logueado tiene el codigo de
 * permiso indicado. Comparacion UPPERCASE. Re-evalua automaticamente cuando
 * cambian los permisos del usuario (login/logout/refresh).
 *
 * Uso:
 *   <a *appHasPermission="'PRODUCTOS_VER'" ...>Productos</a>
 *   <button *appHasPermission="'USUARIOS_GESTIONAR'" mat-flat-button>Nuevo</button>
 *
 * El admin (rol ADMINISTRADOR) tiene todos los permisos por auto-sync, asi
 * que ve TODO sin necesidad de chequeos especiales en codigo.
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective implements OnInit, OnDestroy {
  @Input('appHasPermission') codigo!: string;

  private sub: Subscription | null = null;
  private rendered = false;

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.sub = this.permissionService.codigos$.subscribe(() => this.update());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private update(): void {
    const ok = this.permissionService.has(this.codigo);
    if (ok && !this.rendered) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.rendered = true;
    } else if (!ok && this.rendered) {
      this.viewContainer.clear();
      this.rendered = false;
    }
  }
}

/**
 * Renderiza si el usuario tiene AL MENOS UNO de los codigos indicados.
 * Util para cabeceras de seccion del sidenav: si el usuario tiene CUALQUIER
 * permiso de la seccion, la seccion se muestra (los items adentro se filtran
 * uno por uno con `*appHasPermission`).
 *
 * Uso:
 *   <mat-expansion-panel *appHasAnyPermission="['VENTAS_DASHBOARD_VER','VENTAS_PDV']">
 */
@Directive({
  selector: '[appHasAnyPermission]',
  standalone: true,
})
export class HasAnyPermissionDirective implements OnInit, OnDestroy {
  @Input('appHasAnyPermission') codigos: string[] = [];

  private sub: Subscription | null = null;
  private rendered = false;

  constructor(
    private templateRef: TemplateRef<unknown>,
    private viewContainer: ViewContainerRef,
    private permissionService: PermissionService,
  ) {}

  ngOnInit(): void {
    this.sub = this.permissionService.codigos$.subscribe(() => this.update());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private update(): void {
    const ok = this.permissionService.hasAny(this.codigos || []);
    if (ok && !this.rendered) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.rendered = true;
    } else if (!ok && this.rendered) {
      this.viewContainer.clear();
      this.rendered = false;
    }
  }
}
