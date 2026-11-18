/** Validación de las entradas de la Matriz de evaluación - Nivel de Accesibilidad. */
import { z } from 'zod';
import { CATALOGO_ACC } from '../../../../src/app/formatos/accesibilidad/catalogo';
import { OPCIONES, type Lista } from '../../../../src/app/formatos/accesibilidad/modelo';
import { CambioEvidencia, EvidenciaEntrada } from '../ita/esquemas';

const FILAS = new Set(CATALOGO_ACC.criterios.map((c) => c.fila));
const CODIGOS_SC = new Set(CATALOGO_ACC.criterios.map((c) => c.sc));
const HERRAMIENTAS = new Set(CATALOGO_ACC.herramientas.map((h) => h.fila));
const MAX_TEXTO = 32000; // límite de una celda de Excel

const texto = (max = MAX_TEXTO) => z.string().max(max);
const opcion = (l: Lista) => z.enum(Object.keys(OPCIONES[l]) as [string, ...string[]]);
const opcionOVacia = (l: Lista) => z.union([z.literal(''), opcion(l)]);
const fecha = z.union([z.literal(''), z.iso.date()]);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,36}$/, 'Identificador inválido');

const Identificacion = z.strictObject({
  requerimiento: texto(500),
  url: texto(2048),
  ambiente: opcionOVacia('ambiente'),
  responsable: texto(200),
  fecha,
  entorno: texto(500),
  tipo: opcionOVacia('tipo'),
});

const Criterio = z.strictObject({ estado: opcion('estado').nullable(), observacion: texto(), notaInterna: texto() });

const Hallazgo = z.strictObject({
  criterio: z.union([z.literal(''), z.string().refine((s) => CODIGOS_SC.has(s), { message: 'Criterio inexistente' })]),
  hallazgo: texto().nullable(),
  severidad: opcionOVacia('severidad'),
  accion: texto(),
  responsable: texto(200),
  fecha,
  estado: opcionOVacia('estadoHallazgo'),
  notaInterna: texto(),
});

const fila = z.number().int().refine((f) => FILAS.has(f), { message: 'Fila fuera de la matriz' });
/** Un hallazgo por criterio: `c<fila>` (idHallazgo). */
const idHallazgo = z.string().refine((s) => /^c\d+$/.test(s) && FILAS.has(+s.slice(1)), { message: 'Hallazgo inexistente' });
const Destinos = z.strictObject({
  evidencia: id,
  criterios: z.array(fila).max(FILAS.size).optional(),
  hallazgos: z.array(idHallazgo).max(FILAS.size).optional(),
});

const Cierre = z.strictObject({
  herramientas: z.array(z.number().int().refine((f) => HERRAMIENTAS.has(f), { message: 'Herramienta inexistente' })).max(HERRAMIENTAS.size),
  evidencias: texto(),
  automatizadas: texto(),
  manuales: texto(),
  resultado: opcionOVacia('resultado'),
  justificacion: texto(),
  decision: opcionOVacia('decision'),
  profesional: texto(200),
  cargo: texto(200),
  fecha,
  editorial: texto(),
});

export const CambioEvaluacion = z
  .strictObject({
    identificacion: Identificacion.partial().optional(),
    cierre: Cierre.partial().optional(),
    criterios: z
      .record(z.string().refine((f) => FILAS.has(+f), { message: 'Fila fuera de la matriz' }), Criterio.partial())
      .optional(),
    hallazgos: z.record(idHallazgo, Hallazgo.partial().nullable()).optional(),
    evidencias: z.record(id, CambioEvidencia.strict().nullable()).optional(),
    asignar: Destinos.optional(),
    quitar: Destinos.optional(),
    formatoEvidencias: z.enum(['url', 'titulo-url']).optional(),
  })
  .refine((d) => Object.values(d).some((v) => typeof v === 'string' || (v && Object.keys(v).length)), { message: 'Sin cambios' });

/** Máximo de evidencias por evaluación. */
export const MAX_EVIDENCIAS = 2000;

/** Respaldo completo (GET /api/accesibilidad/respaldo). Lo que falte se completa con valores vacíos. */
const conEvidencias = { evidencias: z.array(id).max(MAX_EVIDENCIAS).default([]) };
const EvaluacionRespaldo = z.object({
  id,
  ticket: z.number().int().positive().optional(),
  creado: z.iso.datetime().optional(),
  actualizado: z.iso.datetime().optional(),
  identificacion: Identificacion.partial().default({}),
  criterios: z
    .record(z.string().refine((f) => FILAS.has(+f), { message: 'Fila fuera de la matriz' }), Criterio.partial().extend(conEvidencias))
    .default({}),
  // Ids sin validar: un respaldo puede traer hallazgos de antes de que se generaran por criterio.
  hallazgos: z.array(Hallazgo.partial().extend({ id, ...conEvidencias })).max(500).default([]),
  cierre: Cierre.partial().default({}),
  evidencias: z.array(EvidenciaEntrada).max(MAX_EVIDENCIAS).default([]),
  formatoEvidencias: z.enum(['url', 'titulo-url']).default('url'),
});
export const RespaldoAccesibilidad = z.object({ evaluaciones: z.array(EvaluacionRespaldo).max(500) });
