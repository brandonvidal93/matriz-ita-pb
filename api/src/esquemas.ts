import { z } from 'zod';
import { FORMATOS } from '../../src/app/core/modelos';

export const Credenciales = z.object({ usuario: z.string().trim().min(1).max(60), clave: z.string().min(1).max(200) });

/** Política mínima: 10 caracteres con letras y números. */
export const Clave = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(200)
  .refine((c) => /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) && /\d/.test(c), { message: 'La contraseña debe combinar letras y números' });

export const CambioClave = z.object({ actual: z.string().min(1).max(200), nueva: Clave });

export const Rol = z.enum(['admin', 'editor', 'lector']);
/** Permiso por formato; un formato que no aparece queda sin acceso. */
const Formatos = z.partialRecord(z.enum(FORMATOS), z.enum(['ver', 'editar']));
export const NuevoUsuario = z.object({
  usuario: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,60}$/, 'Usuario: 3 a 60 caracteres (letras, números, . _ -)'),
  nombre: z.string().trim().min(1).max(120),
  rol: Rol,
  clave: Clave,
  formatos: Formatos.default({}),
});
export const CambioUsuario = z
  .object({ nombre: z.string().trim().min(1).max(120), rol: Rol, activo: z.boolean(), clave: Clave, formatos: Formatos })
  .partial();
