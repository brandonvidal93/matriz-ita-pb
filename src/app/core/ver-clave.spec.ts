import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { VerClave } from './ver-clave';

@Component({
  imports: [VerClave],
  template: `<input #c type="password" /><ita-ver-clave [campo]="c" />`,
})
class Anfitrion {}

describe('VerClave', () => {
  it('alterna el tipo del campo y anuncia el estado con aria-pressed', async () => {
    TestBed.configureTestingModule({
      imports: [TranslocoTestingModule.forRoot({ langs: { es: { clave: { mostrar: 'Mostrar contraseña' } } }, translocoConfig: { availableLangs: ['es'], defaultLang: 'es' }, preloadLangs: true })],
    });
    const f = TestBed.createComponent(Anfitrion);
    await f.whenStable();
    const campo: HTMLInputElement = f.nativeElement.querySelector('input');
    const boton: HTMLButtonElement = f.nativeElement.querySelector('button');
    expect(boton.type).toBe('button');
    expect(boton.getAttribute('aria-label')).toBe('Mostrar contraseña');
    expect(boton.getAttribute('aria-pressed')).toBe('false');

    boton.click();
    await f.whenStable();
    expect(campo.type).toBe('text');
    expect(boton.getAttribute('aria-pressed')).toBe('true');

    boton.click();
    await f.whenStable();
    expect(campo.type).toBe('password');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
  });
});
