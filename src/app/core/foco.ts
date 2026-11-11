import { ErrorStateMatcher } from '@angular/material/core';

/** Lleva el foco al título de la página: al navegar o cuando desaparece el elemento que lo tenía. */
export function enfocarTitulo(opciones?: FocusOptions): void {
  const main = document.getElementById('contenido');
  const destino = main?.querySelector<HTMLElement>('h1') ?? main;
  destino?.setAttribute('tabindex', '-1');
  destino?.focus(opciones);
}

/** Lleva el foco al primer campo inválido de un formulario enviado. */
export function enfocarInvalido(): void {
  document.querySelector<HTMLElement>('input.ng-invalid, textarea.ng-invalid')?.focus();
}

/** Marca un campo como inválido según una condición propia, con `aria-invalid` y el error asociado de Material. */
export const errorSi = (activo: () => boolean) => ({ isErrorState: activo }) as ErrorStateMatcher;
