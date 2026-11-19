import { Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { A11yModule } from '@angular/cdk/a11y';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

/** Mismo punto de corte que `lg:` de Tailwind, donde la barra pasa a ser una columna fija. */
const ANCHA = '(min-width: 1024px)';

/**
 * Barra lateral de secciones de Diligenciar, común a todos los formatos. En pantallas anchas es una
 * columna fija; en angostas (o con zoom) se oculta tras un botón y se abre como panel lateral modal.
 * Elegir una sección (cualquier botón del contenido) la cierra.
 */
@Component({
  selector: 'app-lateral',
  imports: [A11yModule, MatButtonModule, MatIconModule, TranslocoPipe],
  host: { class: 'block min-w-0' },
  templateUrl: './lateral.html',
})
export class Lateral {
  /** Nombre accesible de la navegación. */
  etiqueta = input.required<string>();
  /** Sección abierta, para el texto del botón en pantallas angostas. */
  actual = input('');
  /** El nombre de la sección es texto oficial de la matriz (en español). */
  oficial = input(true);

  abierto = signal(false);
  private boton = viewChild.required('boton', { read: ElementRef<HTMLButtonElement> });
  private panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  constructor() {
    inject(BreakpointObserver).observe(ANCHA).pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((b) => { if (b.matches) this.abierto.set(false); });
  }

  abrir() {
    this.abierto.set(true);
    // shortcut: el fondo de la página sigue desplazable con el panel abierto; bloquearlo si molesta en móvil.
    const nav = this.panel().nativeElement;
    setTimeout(() => (nav.querySelector<HTMLElement>('nav [aria-current="true"]') ?? nav.querySelector<HTMLElement>('nav button'))?.focus());
  }

  cerrar() {
    if (!this.abierto()) return;
    this.abierto.set(false);
    // Tras ocultar el panel: si se enfoca antes, el navegador lo suelta al esconder el elemento que lo tenía.
    setTimeout(() => this.boton().nativeElement.focus());
  }

  /** Al elegir una sección en el panel, se cierra. */
  alClic(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('nav button')) this.cerrar();
  }
}
