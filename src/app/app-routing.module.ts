import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

// Import the components from the correct paths
import { HomeComponent } from './pages/home/home.component';

const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [AuthGuard],
    children: [
      // Protected routes go here
      {
        path: 'usuarios',
        loadComponent: () => import('./pages/personas/usuarios/list-usuarios.component').then(m => m.ListUsuariosComponent)
      },
      {
        path: 'personas',
        loadComponent: () => import('./pages/personas/personas/list-personas.component').then(m => m.ListPersonasComponent)
      },
      {
        path: '',
        redirectTo: '/usuarios',
        pathMatch: 'full'
      }
    ]
  },
  // Fallback route
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
