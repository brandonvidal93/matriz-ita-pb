import { inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { AlmacenService } from '../../core/almacen.service';
import { ITEM_POR_FILA, SECCIONES, etiquetaCorta } from '../../core/catalogo';
import { FuenteEvidencias } from '../../core/evidencias';

/** Evidencias del registro ITA activo; la clave de cada destino es su fila. */
export function fuenteIta(): FuenteEvidencias {
  const almacen = inject(AlmacenService);
  const t = inject(TranslocoService);
  const filas = (claves: string[]) => claves.map(Number);
  return {
    soloLectura: almacen.soloLectura,
    nombre: () => almacen.activo()?.nombre ?? '',
    evidencias: () => almacen.activo()?.evidencias ?? [],
    agregar: (d) => almacen.agregarEvidencia(d),
    editar: (id, c) => almacen.editarEvidencia(id, c),
    eliminar: (id) => almacen.eliminarEvidencia(id),
    asignar: (id, c) => almacen.asignarEvidencia(id, filas(c)),
    quitar: (id, c) => almacen.quitarEvidencia(id, filas(c)),
    usos: (id) => almacen.usos(id).map(String),
    grupos: () =>
      SECCIONES.map((s) => ({
        clave: s.clave,
        titulo: s.titulo,
        items: s.items.map((it) => ({
          clave: String(it.fila),
          texto: etiquetaCorta(it, 140),
          etiqueta: t.translate('dialogos.asignar.fila', { fila: it.fila }),
        })),
      })),
    enlace: (c) => ({ ruta: ['/ita/r', almacen.activoId()], queryParams: { fila: c } }),
    descripcion: (c) => {
      const it = ITEM_POR_FILA.get(+c);
      return it ? `${it.nivel1 ? it.nivel1.slice(0, 40) + ' › ' : ''}${etiquetaCorta(it, 110)}` : t.translate('evidencias.fila', { fila: c });
    },
  };
}
