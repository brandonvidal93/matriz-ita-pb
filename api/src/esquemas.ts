import { z } from 'zod';
import catalogo from '../../src/app/data/catalogo-ita-2023.json' with { type: 'json' };

export const VERSION_MATRIZ: string = catalogo.version;
export const FILAS_VALIDAS: ReadonlySet<number> = new Set(catalogo.items.map((i) => i.fila));
const MAX_TEXTO = 32000; // límite de una celda de Excel

const fila = z.number().int().refine((f) => FILAS_VALIDAS.has(f), { message: 'Fila fuera de la matriz' });
const filas = z.array(fila).min(1).max(FILAS_VALIDAS.size);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,36}$/, 'Identificador inválido');
const urlHttp = z
  .string()
  .trim()
  .max(2048)
  .refine((u) => /^https?:\/\//i.test(u) && URL.canParse(u), { message: 'URL inválida (debe empezar por http:// o https://)' });
const estado = z.enum(['SI', 'NO', 'NA']).nullable();
const verificacion = z.object({
  fecha: z.iso.datetime(),
  estado: z.enum(['ok', 'error', 'desconocido']),
  detalle: z.string().max(500).optional(),
});

export const Credenciales = z.object({ usuario: z.string().trim().min(1).max(60), clave: z.string().min(1).max(200) });

/** Política mínima: 10 caracteres con letras y números. */
export const Clave = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200)
  .refine((c) => /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) && /\d/.test(c), { message: 'La contraseña debe combinar letras y números' });

export const CambioClave = z.object({ actual: z.string().min(1).max(200), nueva: Clave });

export const Rol = z.enum(['admin', 'editor', 'lector']);
export const NuevoUsuario = z.object({
  usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,60}$/, 'Usuario: 3 a 60 caracteres (letras, números, . _ -)'),
  nombre: z.string().trim().min(1).max(120),
  rol: Rol,
  clave: Clave,
});
export const CambioUsuario = z
  .object({ nombre: z.string().trim().min(1).max(120), rol: Rol, activo: z.boolean(), clave: Clave })
  .partial();

const datosRegistro = {
  nombre: z.string().trim().min(1).max(200),
  tipo: z.enum(['procuraduria', 'seguimiento']),
  vigencia: z.number().int().min(2000).max(2100),
  periodo: z.string().trim().max(60).optional().nullable(),
};

export const EvidenciaEntrada = z.object({
  id,
  titulo: z.string().trim().max(500).default(''),
  url: urlHttp,
  descripcion: z.string().max(5000).optional(),
  verificacion: verificacion.optional(),
});

export const RespuestaEntrada = z.object({
  estado: estado.default(null),
  observacion: z.string().max(MAX_TEXTO).default(''),
  evidencias: z.array(id).max(500).default([]),
  notaInterna: z.string().max(MAX_TEXTO).optional(),
  actualizado: z.string().optional(),
});

/** Contenido completo de un registro (copia, importación de .xlsx o respaldo). */
export const ContenidoRegistro = z.object({
  respuestas: z.record(z.string().regex(/^\d+$/), RespuestaEntrada).refine(
    (r) => Object.keys(r).every((k) => FILAS_VALIDAS.has(+k)),
    { message: 'El contenido tiene filas fuera de la matriz' },
  ),
  evidencias: z.array(EvidenciaEntrada).max(5000),
  formatoEvidencias: z.enum(['url', 'titulo-url']).optional(),
});

export const NuevoRegistro = z.object({
  ...datosRegistro,
  /** Id generado por el cliente (opcional). */
  id: id.optional(),
  /** Copiar respuestas y evidencias de otro registro existente. */
  baseId: id.optional(),
  /** O bien, partir de un contenido enviado (p. ej. importado de un .xlsx). */
  contenido: ContenidoRegistro.optional(),
});

export const CambioRegistro = z
  .object({ ...datosRegistro, formatoEvidencias: z.enum(['url', 'titulo-url']) })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Sin cambios' });

export const CambioRespuestas = z.object({
  filas,
  cambios: z
    .object({ estado, observacion: z.string().max(MAX_TEXTO), notaInterna: z.string().max(MAX_TEXTO) })
    .partial()
    .refine((c) => Object.keys(c).length > 0, { message: 'Sin cambios' }),
});

export const CambioEvidencia = z
  .object({
    titulo: z.string().trim().max(500),
    url: urlHttp,
    descripcion: z.string().max(5000).nullable(),
    verificacion: verificacion.nullable(),
  })
  .partial();

export const Filas = z.object({ filas });

/** Registro completo dentro de un respaldo .json. */
export const RegistroRespaldo = ContenidoRegistro.extend({
  ...datosRegistro,
  id,
  creado: z.string().optional(),
  actualizado: z.string().optional(),
  formatoEvidencias: z.enum(['url', 'titulo-url']).default('url'),
});

/** Acepta el archivo de datos `{ app, registros: [...] }` o el respaldo de un solo registro. */
export const Respaldo = z.preprocess(
  (d: any) => (d && d.respuestas && Array.isArray(d.evidencias) ? { registros: [d] } : d),
  z.object({ registros: z.array(RegistroRespaldo).max(500) }),
);
