import { Component, Injector, afterNextRender, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { enfocarTitulo } from '../../core/foco';
import { nuevoId } from '../../core/modelos';
import { EvaluacionesService } from './evaluaciones.service';
import { CATALOGO_ACC } from './catalogo';
import { Cierre, Hallazgo, Identificacion, codigos } from './modelo';

const BASE = [FormsModule, TextFieldModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, TranslocoPipe];

// ---------------------------------------------------------------- Hoja 1
@Component({ imports: BASE, templateUrl: './identificacion.html' })
export class IdentificacionPage {
  protected svc = inject(EvaluacionesService);
  ambientes = codigos('ambiente');
  tipos = codigos('tipo');

  /** Los textos esperan a que se deje de escribir; las listas se guardan al elegir. */
  cambiar<K extends keyof Identificacion>(campo: K, valor: Identificacion[K], texto = true) {
    this.svc.cambiar({ identificacion: { [campo]: valor } }, texto ? `identificacion.${campo}` : undefined);
  }
}

// ---------------------------------------------------------------- Hoja 3
@Component({ imports: BASE, templateUrl: './hallazgos.html' })
export class HallazgosPage {
  protected svc = inject(EvaluacionesService);
  private injector = inject(Injector);
  criterios = CATALOGO_ACC.criterios;
  max = CATALOGO_ACC.maxHallazgos;
  severidades = codigos('severidad');
  estados = codigos('estadoHallazgo');

  cambiar<K extends keyof Hallazgo>(id: string, campo: K, valor: Hallazgo[K], texto = true) {
    this.svc.cambiar({ hallazgos: { [id]: { [campo]: valor } } }, texto ? `hallazgo.${id}.${campo}` : undefined);
  }

  agregar() {
    const id = nuevoId();
    this.svc.cambiar({ hallazgos: { [id]: {} } });
    // El foco va al primer campo del hallazgo nuevo.
    afterNextRender(() => document.getElementById(`h-${id}-texto`)?.focus(), { injector: this.injector });
  }

  eliminar(id: string) {
    this.svc.cambiar({ hallazgos: { [id]: null } });
    // El botón pulsado desaparece con su hallazgo.
    afterNextRender(() => enfocarTitulo(), { injector: this.injector });
  }
}

// ---------------------------------------------------------------- Hoja 4
@Component({ imports: [...BASE, MatCheckboxModule], templateUrl: './cierre.html' })
export class CierrePage {
  protected svc = inject(EvaluacionesService);
  herramientas = CATALOGO_ACC.herramientas;
  resultados = codigos('resultado');
  decisiones = codigos('decision');

  cambiar<K extends keyof Cierre>(campo: K, valor: Cierre[K], texto = true) {
    this.svc.cambiar({ cierre: { [campo]: valor } }, texto ? `cierre.${campo}` : undefined);
  }

  herramienta(fila: number, usada: boolean) {
    const actuales = this.svc.activa()?.cierre.herramientas ?? [];
    this.cambiar('herramientas', usada ? [...new Set([...actuales, fila])] : actuales.filter((f) => f !== fila), false);
  }
}
