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

// Locale "es-PY" para formateo de monedas (PYG sin decimales, separador miles ".")
// Usado por DecimalPipe via `| number:'...':'es-PY'` y por la directiva CurrencyInput.
registerLocaleData(localeEsPY, 'es-PY');
registerLocaleData(localeEs, 'es');

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
