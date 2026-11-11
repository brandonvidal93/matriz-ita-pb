import { ApplicationConfig, LOCALE_ID, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { TitleStrategy, provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { interceptorSesion } from './core/guardias';
import { CargadorTraducciones, IDIOMAS, IDIOMA_PREDETERMINADO, IdiomaService, TituloTraducido } from './core/idioma';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([interceptorSesion])),
    // Hash para poder publicarlo como sitio estático en cualquier servidor.
    provideRouter(routes, withComponentInputBinding(), withHashLocation()),
    { provide: TitleStrategy, useExisting: TituloTraducido },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
    provideTransloco({
      config: {
        availableLangs: IDIOMAS.map((i) => i.codigo),
        defaultLang: IDIOMA_PREDETERMINADO,
        fallbackLang: IDIOMA_PREDETERMINADO,
        missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: CargadorTraducciones,
    }),
    // Carga el idioma antes de pintar para no mostrar claves sin traducir.
    provideAppInitializer(() => inject(IdiomaService).iniciar()),
    // Locale de arranque para pipes de Angular; las fechas usan `FechaPipe`, que sigue el idioma activo.
    { provide: LOCALE_ID, useFactory: () => IDIOMAS.find((i) => i.codigo === inject(IdiomaService).inicial())!.locale },
  ],
};
