import { Injectable, Pipe, PipeTransform, effect, inject } from '@angular/core';
import { DateAdapter, MAT_DATE_FORMATS, MAT_NATIVE_DATE_FORMATS, MatDateFormats, NativeDateAdapter } from '@angular/material/core';
import { MatDatepickerIntl } from '@angular/material/datepicker';
import { TranslocoService } from '@jsverse/transloco';
import { IdiomaService } from './idioma';

/** Formato del campo: DD/MM/AAAA, el de Colombia, en los dos idiomas (la institución es colombiana). */
const DD_MM_AAAA = 'DD/MM/AAAA';
const FORMATOS: MatDateFormats = { ...MAT_NATIVE_DATE_FORMATS, display: { ...MAT_NATIVE_DATE_FORMATS.display, dateInput: DD_MM_AAAA } };

/** Escribe y lee DD/MM/AAAA; los nombres de meses y días del calendario siguen el idioma activo. */
@Injectable()
export class FechaAdapter extends NativeDateAdapter {
  constructor() {
    super();
    const idioma = inject(IdiomaService);
    effect(() => this.setLocale(idioma.locale()));
  }

  override parse(valor: unknown): Date | null {
    if (typeof valor !== 'string' || !valor.trim()) return valor instanceof Date ? valor : null;
    const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(valor);
    if (!m) return this.invalid();
    const [d, mes, a] = [+m[1], +m[2] - 1, +m[3]];
    const f = new Date(a, mes, d);
    // new Date corrige 31/02 a marzo: se rechaza en lugar de guardar otra fecha.
    return f.getFullYear() === a && f.getMonth() === mes && f.getDate() === d ? f : this.invalid();
  }

  override format(fecha: Date, formato: object | string): string {
    if (formato !== DD_MM_AAAA) return super.format(fecha, formato);
    const dos = (n: number) => String(n).padStart(2, '0');
    return `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
  }
}

/** Textos accesibles del calendario (botones, etiquetas), traducidos. */
@Injectable()
export class FechaIntl extends MatDatepickerIntl {
  constructor() {
    super();
    const t = inject(TranslocoService);
    const idioma = inject(IdiomaService);
    effect(() => {
      idioma.actual();
      const claves = ['calendarLabel', 'openCalendarLabel', 'closeCalendarLabel', 'prevMonthLabel', 'nextMonthLabel', 'prevYearLabel', 'nextYearLabel', 'prevMultiYearLabel', 'nextMultiYearLabel', 'switchToMonthViewLabel', 'switchToMultiYearViewLabel'] as const;
      for (const c of claves) this[c] = t.translate(`calendario.${c}`);
      this.changes.next();
    });
  }
}

export const provideFechas = () => [
  { provide: DateAdapter, useClass: FechaAdapter },
  { provide: MAT_DATE_FORMATS, useValue: FORMATOS },
  { provide: MatDatepickerIntl, useClass: FechaIntl },
];

/** Lo guardado (AAAA-MM-DD) como Date para el campo. Pura: la misma cadena da el mismo objeto y no reescribe lo que se teclea. */
@Pipe({ name: 'aFecha' })
export class AFechaPipe implements PipeTransform {
  transform(iso: string | null | undefined): Date | null {
    const m = iso && /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
}

/** Date del campo → AAAA-MM-DD; vacío si no hay fecha o no es válida. */
export const iso = (f: Date | null): string => {
  if (!f || isNaN(f.getTime())) return '';
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${f.getFullYear()}-${dos(f.getMonth() + 1)}-${dos(f.getDate())}`;
};
