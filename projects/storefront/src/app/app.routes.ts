import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/menu/menu.page').then((m) => m.MenuPage) },
  { path: 'producto/:id', loadComponent: () => import('./pages/producto/producto-detalle.page').then((m) => m.ProductoDetallePage) },
  { path: 'carrito', loadComponent: () => import('./pages/cart/cart.page').then((m) => m.CartPage) },
  { path: 'checkout', loadComponent: () => import('./pages/checkout/checkout.page').then((m) => m.CheckoutPage) },
  { path: 'login', loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage) },
  { path: 'mis-pedidos', loadComponent: () => import('./pages/mis-pedidos/mis-pedidos.page').then((m) => m.MisPedidosPage) },
  { path: 'cuenta', loadComponent: () => import('./pages/cuenta/cuenta.page').then((m) => m.CuentaPage) },
  { path: '**', redirectTo: '' },
];
