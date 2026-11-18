import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { FuenteEvidencias } from '../../core/evidencias';
import { CATALOGO_ACC, hallazgosGenerados } from './catalogo';
import { EvaluacionesService } from './evaluaciones.service';
import { Destinos } from './modelo';

/** Claves de destino: `c<fila>` para un criterio y `h<id>` para un hallazgo. */
export const claveCriterio = (fila: number) => `c${fila}`;
export const claveHallazgo = (id: string) => `h${id}`;

export function destinos(evidencia: string, claves: string[]): Destinos {
  return {
    evidencia,
    criterios: claves.filter((c) => c[0] === 'c').map((c) => +c.slice(1)),
    hallazgos: claves.filter((c) => c[0] === 'h').map((c) => c.slice(1)),
  };
}

const CRITERIO_POR_FILA = new Map(CATALOGO_ACC.criterios.map((c) => [c.fila, c]));

/** Evidencias de la evaluación de accesibilidad activa: se asignan a criterios y hallazgos. */
export function fuenteAccesibilidad(): FuenteEvidencias {
  const svc = inject(EvaluacionesService);
  const t = inject(TranslocoService);
  /** Solo los hallazgos visibles: los de criterios en "No cumple". */
  const lista = () => { const e = svc.activa(); return e ? hallazgosGenerados(e) : []; };
  const hallazgo = (clave: string) => {
    const l = lista();
    const n = l.findIndex((h) => h.id === clave.slice(1));
    return { n: n + 1, h: l[n] };
  };
  return {
    soloLectura: svc.soloLectura,
    nombre: () => t.translate('acc.ticket', { n: svc.activa()?.ticket }),
    evidencias: () => svc.activa()?.evidencias ?? [],
    agregar: (d) => svc.agregarEvidencia(d),
    editar: (id, c) => svc.editarEvidencia(id, c),
    eliminar: (id) => svc.eliminarEvidencia(id),
    asignar: (id, c) => svc.asignarEvidencia(destinos(id, c)),
    quitar: (id, c) => svc.quitarEvidencia(destinos(id, c)),
    usos: (id) => {
      const e = svc.activa();
      if (!e) return [];
      return [
        ...CATALOGO_ACC.criterios.filter((c) => e.criterios[c.fila]?.evidencias.includes(id)).map((c) => claveCriterio(c.fila)),
        ...lista().filter((h) => h.evidencias.includes(id)).map((h) => claveHallazgo(h.id)),
      ];
    },
    grupos: () => {
      const porPrincipio = new Map<string, { clave: string; texto: string; etiqueta: string }[]>();
      for (const c of CATALOGO_ACC.criterios)
        porPrincipio.set(c.principio, [
          ...(porPrincipio.get(c.principio) ?? []),
          { clave: claveCriterio(c.fila), texto: `${c.sc} ${c.criterio}`, etiqueta: t.translate('acc.criterios.nivelN', { n: c.nivel }) },
        ]);
      const hallazgos = lista().map((h, i) => ({
        clave: claveHallazgo(h.id),
        texto: `${h.cat.sc} ${h.hallazgo || h.cat.criterio}`,
        etiqueta: t.translate('acc.hallazgos.numero', { n: i + 1 }),
      }));
      return [
        ...[...porPrincipio].map(([titulo, items]) => ({ clave: titulo, titulo, items })),
        ...(hallazgos.length ? [{ clave: 'hallazgos', titulo: t.translate('acc.seccion.hallazgos'), items: hallazgos }] : []),
      ];
    },
    enlace: (c) => ({
      ruta: ['/accesibilidad/r', svc.activaId()],
      queryParams: { [c[0] === 'c' ? 'fila' : 'hallazgo']: c.slice(1) },
    }),
    descripcion: (c) => {
      if (c[0] === 'c') {
        const it = CRITERIO_POR_FILA.get(+c.slice(1));
        return it ? `${it.principio} › ${it.sc} ${it.criterio}` : c;
      }
      const { n, h } = hallazgo(c);
      return `${t.translate('acc.hallazgos.numero', { n })}${h ? ` › ${h.cat.sc} ${(h.hallazgo || h.cat.criterio).slice(0, 100)}` : ''}`;
    },
  };
}
