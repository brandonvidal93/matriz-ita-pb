import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { AFechaPipe, FechaAdapter, iso } from './fechas';

describe('fechas DD/MM/AAAA', () => {
  let a: FechaAdapter;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TranslocoTestingModule.forRoot({ langs: { es: {} } })], providers: [FechaAdapter] });
    a = TestBed.inject(FechaAdapter);
  });

  it('lee día/mes/año, no mes/día', () => {
    expect(iso(a.parse('05/11/2026'))).toBe('2026-11-05');
    expect(iso(a.parse('5-1-2026'))).toBe('2026-01-05');
  });

  it('rechaza fechas que no existen o incompletas', () => {
    expect(a.isValid(a.parse('31/02/2026')!)).toBe(false);
    expect(a.isValid(a.parse('1/1/26')!)).toBe(false);
    expect(a.parse('')).toBeNull();
  });

  it('muestra DD/MM/AAAA y conserva AAAA-MM-DD al guardar', () => {
    const f = new AFechaPipe().transform('2026-03-07')!;
    expect(a.format(f, 'DD/MM/AAAA')).toBe('07/03/2026');
    expect(iso(f)).toBe('2026-03-07');
    expect(new AFechaPipe().transform('')).toBeNull();
  });
});
