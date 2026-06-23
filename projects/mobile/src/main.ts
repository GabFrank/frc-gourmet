import 'reflect-metadata';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsPY from '@angular/common/locales/es-PY';
import localeEs from '@angular/common/locales/es';

import { RepositoryService, RepositoryIpcService, AppModeService } from '@frc/shared-core';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { installApiHttp } from './app/core/data/api-http';
import { MobileAppModeService } from './app/core/services/mobile-app-mode.service';

// Locale es-PY: PYG sin decimales, separador de miles ".". Mismo criterio que el desktop.
registerLocaleData(localeEsPY, 'es-PY');
registerLocaleData(localeEs, 'es');

// Instala el window.api HTTP ANTES del bootstrap (RepositoryIpcService lo lee en
// su constructor). En mobile el "repo IPC" enruta a /api/rpc del server.
installApiHttp();

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimations(),
    provideHttpClient(),
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'es-PY' },
    // El contrato RepositoryService lo cumple la impl IPC, ahora sobre HTTP.
    { provide: RepositoryService, useClass: RepositoryIpcService },
    // Modo siempre 'client' en mobile (stub sin Electron).
    { provide: AppModeService, useClass: MobileAppModeService },
  ],
}).catch((err) => console.error(err));
