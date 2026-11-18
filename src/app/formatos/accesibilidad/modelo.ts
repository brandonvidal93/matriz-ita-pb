/**
 * Modelo de la Matriz de evaluación - Nivel de Accesibilidad. Lo comparten la interfaz y la API.
 * No importa el catálogo (catalogo.ts) para que el servicio, que se carga al inicio, no lo arrastre.
 */

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

export interface Criterio {
  estado: Opcion<'estado'> | null;
  observacion: string;
}

export interface Hallazgo {
  id: string;
  /** Código del criterio (p. ej. SC1.1.1) o vacío. */
  criterio: string;
  hallazgo: string;
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
}

export interface Evaluacion extends Contenido {
  id: string;
  /** Consecutivo que asigna la base de datos. */
  ticket: number;
  creado: string;
  actualizado: string;
}

/** Cambio parcial. En `hallazgos`, un id nuevo agrega el hallazgo al final y `null` lo elimina. */
export interface CambioEvaluacion {
  identificacion?: Partial<Identificacion>;
  cierre?: Partial<Cierre>;
  criterios?: Record<number, Partial<Criterio>>;
  hallazgos?: Record<string, Partial<Omit<Hallazgo, 'id'>> | null>;
}

export const criterioVacio = (): Criterio => ({ estado: null, observacion: '' });
export const hallazgoVacio = (id: string): Hallazgo => ({
  id, criterio: '', hallazgo: '', severidad: '', accion: '', responsable: '', fecha: '', estado: '',
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
  };
}

/** Aplica un cambio sin modificar el original. La API y la interfaz usan la misma función. */
export function aplicarCambio<T extends Contenido>(c: T, d: CambioEvaluacion): T {
  const criterios = { ...c.criterios };
  for (const [f, x] of Object.entries(d.criterios ?? {})) criterios[+f] = { ...(criterios[+f] ?? criterioVacio()), ...x };
  let hallazgos = c.hallazgos;
  for (const [id, h] of Object.entries(d.hallazgos ?? {})) {
    if (h === null) hallazgos = hallazgos.filter((x) => x.id !== id);
    else if (hallazgos.some((x) => x.id === id)) hallazgos = hallazgos.map((x) => (x.id === id ? { ...x, ...h } : x));
    else hallazgos = [...hallazgos, { ...hallazgoVacio(id), ...h }];
  }
  return {
    ...c,
    identificacion: { ...c.identificacion, ...d.identificacion },
    cierre: { ...c.cierre, ...d.cierre },
    criterios,
    hallazgos,
  };
}
