import { Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { textoObservacion } from '../../core/catalogo';
import { FUENTE_EVIDENCIAS } from '../../core/evidencias';
import { EvidenciasItem } from '../../core/evidencias-item';
import { Evidencia } from '../../core/modelos';
import { ElegirEvidenciaDialog } from '../../dialogos/dialogos';
import { EvaluacionesService } from './evaluaciones.service';
import { CATALOGO_ACC, HallazgoGenerado, hallazgosGenerados } from './catalogo';
import { claveHallazgo } from './fuente';
import { Cierre, Hallazgo, Identificacion, codigos } from './modelo';

const BASE = [FormsModule, TextFieldModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, TranslocoPipe];

// Secciones de la página Diligenciar que no son criterios. El título (h1) lo pone la página.

// ---------------------------------------------------------------- Hoja 1
@Component({ selector: 'app-acc-identificacion', imports: BASE, templateUrl: './identificacion.html' })
export class SeccionIdentificacion {
  protected svc = inject(EvaluacionesService);
  ambientes = codigos('ambiente');
  tipos = codigos('tipo');

  /** Los textos esperan a que se deje de escribir; las listas se guardan al elegir. */
  cambiar<K extends keyof Identificacion>(campo: K, valor: Identificacion[K], texto = true) {
    this.svc.cambiar({ identificacion: { [campo]: valor } }, texto ? `identificacion.${campo}` : undefined);
  }
}

// ---------------------------------------------------------------- Hoja 3
@Component({
  selector: 'app-acc-hallazgos',
  imports: [...BASE, RouterLink, EvidenciasItem],
  styles: `article { scroll-margin-top: 140px; }`,
  templateUrl: './hallazgos.html',
})
export class SeccionHallazgos {
  /** Hallazgo enlazado desde otra página (?hallazgo=…). */
  resaltado = input<string | null>(null);
  protected svc = inject(EvaluacionesService);
  private dialog = inject(MatDialog);
  private fuente = inject(FUENTE_EVIDENCIAS);
  max = CATALOGO_ACC.maxHallazgos;
  severidades = codigos('severidad');
  estados = codigos('estadoHallazgo');
  lista = computed(() => hallazgosGenerados(this.svc.activa()!));

  cambiar<K extends keyof Hallazgo>(id: string, campo: K, valor: Hallazgo[K], texto = true) {
    this.svc.cambiar({ hallazgos: { [id]: { [campo]: valor } } }, texto ? `hallazgo.${id}.${campo}` : undefined);
  }

  evidencias(h: Hallazgo): Evidencia[] {
    const todas = this.svc.activa()?.evidencias ?? [];
    return h.evidencias.map((id) => todas.find((e) => e.id === id)).filter((e): e is Evidencia => !!e);
  }
  vista = (h: HallazgoGenerado) => textoObservacion({ observacion: h.hallazgo, evidencias: h.evidencias }, this.svc.activa()!);

  elegirEvidencia(h: Hallazgo) {
    this.dialog.open(ElegirEvidenciaDialog, { data: { claves: [claveHallazgo(h.id)], fuente: this.fuente } });
  }
  quitarEvidencia(h: Hallazgo, e: Evidencia) {
    this.svc.quitarEvidencia({ evidencia: e.id, hallazgos: [h.id] });
  }
}

// ---------------------------------------------------------------- Hoja 4
@Component({ selector: 'app-acc-cierre', imports: [...BASE, MatCheckboxModule], templateUrl: './cierre.html' })
export class SeccionCierre {
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
