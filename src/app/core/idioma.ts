import { DOCUMENT, formatDate, registerLocaleData } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, Pipe, PipeTransform, computed, inject, signal } from '@angular/core';
import localeEsCO from '@angular/common/locales/es-CO';
import { Title } from '@angular/platform-browser';
import { Translation, TranslocoLoader, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

// en-US viene incluido en Angular; es-CO hay que registrarlo.
registerLocaleData(localeEsCO, 'es-CO');

/**
 * Idiomas de la interfaz. El catálogo oficial ITA y el .xlsx exportado
 * se mantienen siempre en español: solo se traduce la interfaz.
 */
export const IDIOMAS = [
  { codigo: 'es', locale: 'es-CO', nombre: 'Español' },
  { codigo: 'en', locale: 'en-US', nombre: 'English' },
] as const;

export type CodigoIdioma = (typeof IDIOMAS)[number]['codigo'];
export const IDIOMA_PREDETERMINADO: CodigoIdioma = 'es';
const CLAVE_PREFERENCIA = 'matriz-ita.idioma';

const esIdioma = (v: unknown): v is CodigoIdioma => IDIOMAS.some((i) => i.codigo === v);

/** Carga `public/i18n/<idioma>.json` (ruta relativa al `<base href>`). */
@Injectable({ providedIn: 'root' })
export class CargadorTraducciones implements TranslocoLoader {
  private http = inject(HttpClient);
  getTranslation(idioma: string) {
    return this.http.get<Translation>(`i18n/${idioma}.json`);
  }
}

/** Idioma activo de la interfaz: lo aplica a Transloco, a `<html lang>`, al título y a las fechas. */
@Injectable({ providedIn: 'root' })
export class IdiomaService {
  private transloco = inject(TranslocoService);
  private documento = inject(DOCUMENT);
  private titulo = inject(Title);

  /** Solo cambia cuando las traducciones del idioma ya están cargadas. */
  readonly actual = signal<CodigoIdioma>(IDIOMA_PREDETERMINADO);
  readonly locale = computed(() => IDIOMAS.find((i) => i.codigo === this.actual())!.locale);
  readonly idiomas = IDIOMAS;

  /** Idioma inicial: la preferencia guardada o, si no hay, español. */
  inicial(): CodigoIdioma {
    try {
      const v = localStorage.getItem(CLAVE_PREFERENCIA);
      if (esIdioma(v)) return v;
    } catch {
      // Sin acceso al almacenamiento (modo privado, bloqueado): se usa el predeterminado.
    }
    return IDIOMA_PREDETERMINADO;
  }

  iniciar(): Promise<void> {
    return this.cambiar(this.inicial(), false);
  }

  async cambiar(codigo: CodigoIdioma, recordar = true): Promise<void> {
    if (!esIdioma(codigo)) codigo = IDIOMA_PREDETERMINADO;
    try {
      await firstValueFrom(this.transloco.load(codigo));
    } catch {
      // Si el archivo no carga, se queda en el idioma actual.
      return;
    }
    this.transloco.setActiveLang(codigo);
    this.actual.set(codigo);
    this.documento.documentElement.lang = this.locale();
    this.titulo.setTitle(this.transloco.translate('app.tituloDocumento'));
    if (recordar) {
      try {
        localStorage.setItem(CLAVE_PREFERENCIA, codigo);
      } catch {
        // La preferencia es solo una comodidad.
      }
    }
  }
}

/**
 * Como `DatePipe`, pero sigue el idioma activo sin recargar la página
 * (el `LOCALE_ID` de Angular se fija una sola vez al arrancar).
 */
@Pipe({ name: 'fecha', pure: false })
export class FechaPipe implements PipeTransform {
  private idioma = inject(IdiomaService);
  private cache?: { valor: unknown; formato: string; locale: string; texto: string };

  transform(valor: string | number | Date | null | undefined, formato = 'medium'): string {
    if (valor == null || valor === '') return '';
    const locale = this.idioma.locale();
    const c = this.cache;
    if (c && c.valor === valor && c.formato === formato && c.locale === locale) return c.texto;
    const texto = formatDate(valor, formato, locale);
    this.cache = { valor, formato, locale, texto };
    return texto;
  }
}
