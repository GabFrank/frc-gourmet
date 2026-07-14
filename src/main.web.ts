import 'reflect-metadata';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideAnimations } from '@angular/platform-browser/animations';
import { importProvidersFrom, LOCALE_ID } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AppRoutingModule } from './app/app-routing.module';
import { AppModule } from './app/app.module';
import { registerLocaleData } from '@angular/common';
import localeEsPY from '@angular/common/locales/es-PY';
import localeEs from '@angular/common/locales/es';
import { installApiHttp } from './app/web/api-http';

// Locale "es-PY" para formateo de monedas (PYG sin decimales, separador miles ".")
registerLocaleData(localeEsPY, 'es-PY');
registerLocaleData(localeEs, 'es');

// Entry point del frontend desktop servido como web (ruta /admin del server).
// Instala el window.api HTTP ANTES del bootstrap — RepositoryIpcService lo lee en
// su constructor. En Electron ese window.api lo provee el preload; acá no hay
// preload, así que el shim rutea todo a /api/rpc del server Fastify (modo server).
installApiHttp();

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    importProvidersFrom(RouterModule),
    importProvidersFrom(AppRoutingModule),
    importProvidersFrom(AppModule),
    { provide: LOCALE_ID, useValue: 'es-PY' },
  ]
})
  .catch(err => console.error(err));
