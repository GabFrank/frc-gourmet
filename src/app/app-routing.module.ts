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
  // Fallback route
  { path: '**', redirectTo: '' }
];

@NgModule({
  // `useHash: true` NO es cosmético: en la build empaquetada la ventana carga
  // `file://.../dist/frc-gourmet/index.html` y el `<base href="/">` no aplica a
  // `history.pushState`, que resuelve contra la URL REAL del documento. Con
  // rutas por path, un `router.navigate(['/login'])` no falla ni lanza — deja
  // `location.href` apuntando a `file:///login` (la raíz del filesystem), en
  // silencio. La app sigue andando porque el Router lee `location.pathname`,
  // pero la ventana queda con una URL que no existe: el siguiente reload real
  // —el botón "Recargar la aplicación", `main.ts` → `webContents.reload()`—
  // muere con ERR_FILE_NOT_FOUND y deja la pantalla en blanco hasta reiniciar
  // el proceso.
  //
  // Y se llega ahí por dos caminos que corren TODOS los días: el arranque en
  // frío (el `BehaviorSubject` de sesión emite `null` antes de que termine la
  // restauración async, y `app.component` navega al login) y cada logout.
  //
  // Con hash, la ruta viaja en el fragmento y `location` nunca se corrompe.
  // Es barato: este router tiene dos rutas (`login` y el fallback), todo lo
  // demás son tabs. El storefront y la PWA tienen sus propios routers y no se
  // ven afectados; la web `/admin` sirve este mismo bundle y el fragmento
  // jamás llega al servidor.
  imports: [RouterModule.forRoot(routes, { useHash: true })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
