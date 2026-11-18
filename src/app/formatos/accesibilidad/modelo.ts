/**
 * Modelo de la Matriz de evaluación - Nivel de Accesibilidad. Lo comparten la interfaz y la API.
 * No importa el catálogo (catalogo.ts) para que el servicio, que se carga al inicio, no lo arrastre.
 */
import type { Evidencia } from '../../core/modelos';

export type Nivel = 'A' | 'AA' | 'AAA';

/** Criterio de la hoja 2, con la definición de la hoja 8. Texto oficial, siempre en español. */
export interface CriterioCatalogo {
  fila: number;
  sc: string;
  mintic: string;
  principio: string;
  directriz: string;
  criterio: string;
  nivel: Nivel;
  metodo: string;
  descripcion: string;
  excepcion: string;
  enlace: string;
}

/** Listas desplegables: código → texto que va en el .xlsx. La interfaz traduce el código con `acc.op.<lista>.<código>`. */
export const OPCIONES = {
  ambiente: { desarrollo: 'Desarrollo', pruebas: 'Pruebas', produccion: 'Producción' },
  tipo: {
    contenido: 'Contenido', pagina: 'Página', documento: 'Documento', multimedia: 'Multimedia',
    formulario: 'Formulario', componente: 'Componente', micrositio: 'Micrositio', portal: 'Portal',
  },
  estado: { cumple: 'Cumple', noCumple: 'No cumple', noAplica: 'No aplica' },
  severidad: { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' },
  estadoHallazgo: { pendiente: 'Pendiente', enProceso: 'En proceso', corregido: 'Corregido', revalidado: 'Revalidado' },
  resultado: {
    cumple: 'Cumple', conObservaciones: 'Cumple con observaciones', requiereAjustes: 'Requiere ajustes', noAplica: 'No aplica',
  },
  decision: { autoriza: 'Autoriza', noAutoriza: 'No autoriza hasta corregir', conPlan: 'Autoriza con plan de mejora registrado' },
} as const;
export type Lista = keyof typeof OPCIONES;
export type Opcion<L extends Lista> = keyof (typeof OPCIONES)[L];
export const codigos = <L extends Lista>(l: L) => Object.keys(OPCIONES[l]) as Opcion<L>[];

export interface Identificacion {
  requerimiento: string;
  url: string;
  ambiente: Opcion<'ambiente'> | '';
  responsable: string;
  /** AAAA-MM-DD o vacío. */
  fecha: string;
  /** Navegador, sistema operativo y dispositivo. */
  entorno: string;
  tipo: Opcion<'tipo'> | '';
}

/** Evidencias y nota interna de un criterio o un hallazgo, igual que en los ítems de ITA. */
interface ConEvidencias {
  /** Ids de la biblioteca de evidencias de la evaluación, en el orden en que se listan. */
  evidencias: string[];
  /** Nota de trabajo; NO se exporta. */
  notaInterna: string;
}

export interface Criterio extends ConEvidencias {
  estado: Opcion<'estado'> | null;
  observacion: string;
}

export interface Hallazgo extends ConEvidencias {
  id: string;
  /** Código del criterio (p. ej. SC1.1.1) o vacío. */
  criterio: string;
  /** null: aún sin texto propio, se usa la observación del criterio. */
  hallazgo: string | null;
  severidad: Opcion<'severidad'> | '';
  accion: string;
  responsable: string;
  fecha: string;
  estado: Opcion<'estadoHallazgo'> | '';
}

export interface Cierre {
  /** Filas de la hoja 4 de las herramientas usadas. */
  herramientas: number[];
  evidencias: string;
  automatizadas: string;
  manuales: string;
  resultado: Opcion<'resultado'> | '';
  justificacion: string;
  decision: Opcion<'decision'> | '';
  profesional: string;
  cargo: string;
  fecha: string;
  editorial: string;
}

export interface Contenido {
  identificacion: Identificacion;
  criterios: Record<number, Criterio>;
  hallazgos: Hallazgo[];
  cierre: Cierre;
  /** Biblioteca de evidencias: una URL puede respaldar varios criterios y hallazgos. */
  evidencias: Evidencia[];
  /** Cómo se escriben las evidencias en el .xlsx. */
  formatoEvidencias: 'url' | 'titulo-url';
}

export interface Evaluacion extends Contenido {
  id: string;
  /** Consecutivo que asigna la base de datos. */
  ticket: number;
  creado: string;
  actualizado: string;
}

/** Criterios (por fila) y hallazgos (por id) a los que se asigna o quita una evidencia. */
export interface Destinos {
  evidencia: string;
  criterios?: number[];
  hallazgos?: string[];
}

type Editable<T extends ConEvidencias> = Partial<Omit<T, 'evidencias' | 'id'>>;

/**
 * Cambio parcial. En `hallazgos` y `evidencias`, un id nuevo agrega el elemento al final y `null`
 * lo elimina (al eliminar una evidencia también se quita de donde estaba asignada).
 */
export interface CambioEvaluacion {
  identificacion?: Partial<Identificacion>;
  cierre?: Partial<Cierre>;
  criterios?: Record<number, Editable<Criterio>>;
  hallazgos?: Record<string, Editable<Hallazgo> | null>;
  evidencias?: Record<string, Partial<Omit<Evidencia, 'id'>> | null>;
  asignar?: Destinos;
  quitar?: Destinos;
  formatoEvidencias?: Contenido['formatoEvidencias'];
}

export const criterioVacio = (): Criterio => ({ estado: null, observacion: '', evidencias: [], notaInterna: '' });
export const hallazgoVacio = (id: string): Hallazgo => ({
  id, criterio: '', hallazgo: null, severidad: '', accion: '', responsable: '', fecha: '', estado: '', evidencias: [], notaInterna: '',
});

export function contenidoVacio(): Contenido {
  return {
    identificacion: { requerimiento: '', url: '', ambiente: '', responsable: '', fecha: '', entorno: '', tipo: '' },
    criterios: {},
    hallazgos: [],
    cierre: {
      herramientas: [], evidencias: '', automatizadas: '', manuales: '', resultado: '', justificacion: '',
      decision: '', profesional: '', cargo: '', fecha: '', editorial: '',
    },
    evidencias: [],
    formatoEvidencias: 'url',
  };
}

/** Completa con valores vacíos un contenido guardado antes de que existieran algunos campos. */
export function completar<T extends Contenido>(c: T): T {
  const v = contenidoVacio();
  return {
    ...v,
    ...c,
    identificacion: { ...v.identificacion, ...c.identificacion },
    cierre: { ...v.cierre, ...c.cierre },
    criterios: Object.fromEntries(Object.entries(c.criterios ?? {}).map(([f, x]) => [f, { ...criterioVacio(), ...x }])),
    hallazgos: (c.hallazgos ?? []).map((h) => ({ ...hallazgoVacio(h.id), ...h })),
  };
}

/** Aplica un cambio sin modificar el original. La API y la interfaz usan la misma función. */
export function aplicarCambio<T extends Contenido>(c: T, d: CambioEvaluacion): T {
  let evidencias = c.evidencias;
  const borradas = new Set<string>();
  for (const [id, e] of Object.entries(d.evidencias ?? {})) {
    if (e === null) (evidencias = evidencias.filter((x) => x.id !== id)), borradas.add(id);
    else if (evidencias.some((x) => x.id === id)) evidencias = evidencias.map((x) => (x.id === id ? { ...x, ...e } : x));
    else evidencias = [...evidencias, { titulo: '', url: '', ...e, id }];
  }
  const existe = new Set(evidencias.map((e) => e.id));
  /** Ajusta la lista de evidencias de un criterio o hallazgo según asignar, quitar y las borradas. */
  const ids = (actuales: string[], tipo: 'criterios' | 'hallazgos', clave: number | string) => {
    const en = (x?: Destinos) => !!x && existe.has(x.evidencia) && (x[tipo] as (number | string)[] | undefined)?.includes(clave);
    let r = actuales.filter((x) => !borradas.has(x) && !(en(d.quitar) && x === d.quitar!.evidencia));
    if (en(d.asignar) && !r.includes(d.asignar!.evidencia)) r = [...r, d.asignar!.evidencia];
    return r;
  };

  const criterios = { ...c.criterios };
  for (const [f, x] of Object.entries(d.criterios ?? {})) criterios[+f] = { ...(criterios[+f] ?? criterioVacio()), ...x };
  for (const f of d.asignar?.criterios ?? []) criterios[f] ??= criterioVacio();
  for (const [f, x] of Object.entries(criterios)) {
    const nuevas = ids(x.evidencias, 'criterios', +f);
    if (nuevas.join() !== x.evidencias.join()) criterios[+f] = { ...x, evidencias: nuevas };
  }

  let hallazgos = c.hallazgos;
  for (const [id, h] of Object.entries(d.hallazgos ?? {})) {
    if (h === null) hallazgos = hallazgos.filter((x) => x.id !== id);
    else if (hallazgos.some((x) => x.id === id)) hallazgos = hallazgos.map((x) => (x.id === id ? { ...x, ...h } : x));
    else hallazgos = [...hallazgos, { ...hallazgoVacio(id), ...h }];
  }
  // El hallazgo de un criterio se guarda la primera vez que se le asigna algo (la API valida los ids).
  if (d.asignar && existe.has(d.asignar.evidencia))
    for (const id of d.asignar.hallazgos ?? []) if (!hallazgos.some((x) => x.id === id)) hallazgos = [...hallazgos, hallazgoVacio(id)];
  hallazgos = hallazgos.map((h) => {
    const nuevas = ids(h.evidencias, 'hallazgos', h.id);
    return nuevas.join() === h.evidencias.join() ? h : { ...h, evidencias: nuevas };
  });

  return {
    ...c,
    identificacion: { ...c.identificacion, ...d.identificacion },
    cierre: { ...c.cierre, ...d.cierre },
    criterios,
    hallazgos,
    evidencias,
    formatoEvidencias: d.formatoEvidencias ?? c.formatoEvidencias,
  };
}
