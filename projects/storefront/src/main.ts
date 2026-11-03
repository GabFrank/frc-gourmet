import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { ErrorHandler, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsPY from '@angular/common/locales/es-PY';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { ChunkErrorHandler } from './app/core/chunk-error.handler';

// Locale es-PY: PYG sin decimales, separador de miles ".". Igual que el desktop.
registerLocaleData(localeEsPY, 'es-PY');

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideAnimations(),
    { provide: LOCALE_ID, useValue: 'es-PY' },
    { provide: ErrorHandler, useClass: ChunkErrorHandler },
  ],
}).catch((err) => console.error(err));
