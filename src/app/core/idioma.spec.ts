import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import es from '../../../public/i18n/es.json';
import en from '../../../public/i18n/en.json';
import { FechaPipe, IDIOMAS, IdiomaService, TituloTraducido } from './idioma';

/** Rutas de todas las claves hoja de un objeto de traducciones. */
function claves(obj: object, prefijo = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? claves(v, `${prefijo}${k}.`) : [`${prefijo}${k}`],
  );
}

describe('archivos de traducción', () => {
  it('en.json tiene exactamente las mismas claves que es.json', () => {
    expect(claves(en).sort()).toEqual(claves(es).sort());
  });

  it('no hay textos vacíos', () => {
    for (const [nombre, t] of Object.entries({ es, en })) {
      const vacias = claves(t).filter((c) => !String(c.split('.').reduce((o: any, k) => o[k], t)).trim());
      expect(vacias, nombre).toEqual([]);
    }
  });

  it('cada idioma declarado tiene su archivo', () => {
    expect(IDIOMAS.map((i) => i.codigo).sort()).toEqual(['en', 'es']);
  });
});

describe('IdiomaService y FechaPipe', () => {
  let idioma: IdiomaService;
  let pipe: FechaPipe;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { es, en },
          translocoConfig: { availableLangs: ['es', 'en'], defaultLang: 'es' },
          preloadLangs: true,
        }),
      ],
      providers: [FechaPipe],
    });
    idioma = TestBed.inject(IdiomaService);
    pipe = TestBed.inject(FechaPipe);
  });

  it('arranca en español si no hay preferencia guardada', () => {
    expect(idioma.inicial()).toBe('es');
  });

  it('usa la preferencia guardada y descarta valores desconocidos', () => {
    localStorage.setItem('matriz-ita.idioma', 'en');
    expect(idioma.inicial()).toBe('en');
    localStorage.setItem('matriz-ita.idioma', 'fr');
    expect(idioma.inicial()).toBe('es');
  });

  it('al cambiar aplica Transloco, <html lang>, título y recuerda la preferencia', async () => {
    await idioma.cambiar('en');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('en');
    expect(idioma.actual()).toBe('en');
    expect(document.documentElement.lang).toBe('en-US');
    expect(TestBed.inject(Title).getTitle()).toBe(en.app.tituloDocumento);
    expect(localStorage.getItem('matriz-ita.idioma')).toBe('en');
  });

  it('iniciar no sobrescribe la preferencia', async () => {
    await idioma.iniciar();
    expect(document.documentElement.lang).toBe('es-CO');
    expect(localStorage.getItem('matriz-ita.idioma')).toBeNull();
  });

  it('formatea fechas según el idioma activo', async () => {
    const f = new Date(2026, 10, 7, 15, 5);
    await idioma.cambiar('es');
    expect(pipe.transform(f, 'd MMM y')).toBe('7 nov 2026');
    await idioma.cambiar('en');
    expect(pipe.transform(f, 'd MMM y')).toBe('7 Nov 2026');
  });

  it('traduce el título de la ruta según el idioma activo y usa el general si no tiene', async () => {
    const titulos = TestBed.inject(TituloTraducido);
    const titulo = TestBed.inject(Title);
    const buildTitle = vi.spyOn(titulos, 'buildTitle').mockReturnValue('titulos.mapa');
    await idioma.cambiar('en');
    titulos.updateTitle({} as RouterStateSnapshot);
    expect(titulo.getTitle()).toBe(`${en.titulos.mapa} · ${en.app.nombre}`);
    buildTitle.mockReturnValue(undefined);
    titulos.updateTitle({} as RouterStateSnapshot);
    expect(titulo.getTitle()).toBe(en.app.tituloDocumento);
  });

  it('devuelve vacío sin fecha', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
