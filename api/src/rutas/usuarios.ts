import type { FastifyInstance } from 'fastify';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { auditar } from '../auditoria';
import { COLUMNA_FORMATOS, cerrarSesionesDe, hashClave, requiere, usuarioDesdeFila } from '../auth';
import type { Contexto } from '../app';
import { type Conexion, enTransaccion } from '../db';
import { CambioUsuario, NuevoUsuario } from '../esquemas';

const CAMPOS = `u.id, usuario, nombre, rol, activo, debe_cambiar_clave, creado, ultimo_ingreso, ${COLUMNA_FORMATOS}`;

/** Reemplaza los formatos asignados al usuario. */
async function asignarFormatos(cx: Conexion, id: number, formatos: Record<string, string>) {
  await cx.query('DELETE FROM usuario_formatos WHERE usuario_id = ?', [id]);
  const filas = Object.entries(formatos).map(([f, p]) => [id, f, p]);
  if (filas.length) await cx.query('INSERT INTO usuario_formatos (usuario_id, formato, permiso) VALUES ?', [filas]);
}

export async function rutasUsuarios(app: FastifyInstance, { db }: Contexto) {
  const soloAdmin = { preHandler: requiere('admin') };

  app.get('/api/usuarios', soloAdmin, async () => {
    const [filas] = await db.query<RowDataPacket[]>(`SELECT ${CAMPOS} FROM usuarios u ORDER BY nombre`);
    return filas.map((f) => ({
      ...usuarioDesdeFila(f),
      creado: f['creado']?.toISOString(),
      ultimoIngreso: f['ultimo_ingreso']?.toISOString() ?? null,
    }));
  });

  app.post('/api/usuarios', soloAdmin, async (req, reply) => {
    const d = NuevoUsuario.parse(req.body);
    const clave = await hashClave(d.clave);
    try {
      const u = await enTransaccion(db, async (cx) => {
        const [r] = await cx.query<ResultSetHeader>(
          'INSERT INTO usuarios (usuario, nombre, rol, clave_hash, debe_cambiar_clave) VALUES (?, ?, ?, ?, 1)',
          [d.usuario, d.nombre, d.rol, clave],
        );
        await asignarFormatos(cx, r.insertId, d.formatos);
        await auditar(cx, req.usuario, 'usuario-creado', null, { id: r.insertId, usuario: d.usuario, rol: d.rol, formatos: d.formatos });
        const [f] = await cx.query<RowDataPacket[]>(`SELECT ${CAMPOS} FROM usuarios u WHERE u.id = ?`, [r.insertId]);
        return usuarioDesdeFila(f[0]!);
      });
      return reply.code(201).send(u);
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') return reply.code(409).send({ error: `El usuario “${d.usuario}” ya existe.` });
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>('/api/usuarios/:id', soloAdmin, async (req, reply) => {
    const id = Number(req.params.id);
    const d = CambioUsuario.parse(req.body);
    const resultado = await enTransaccion(db, async (cx) => {
      const [f] = await cx.query<RowDataPacket[]>(`SELECT ${CAMPOS} FROM usuarios u WHERE u.id = ? FOR UPDATE`, [id]);
      if (!f[0]) return { codigo: 404, error: 'Usuario no encontrado.' };
      const actual = usuarioDesdeFila(f[0]);
      // Nunca dejar el sistema sin un administrador activo.
      const pierdeAdmin = actual.rol === 'admin' && actual.activo && ((d.rol && d.rol !== 'admin') || d.activo === false);
      if (pierdeAdmin) {
        const [n] = await cx.query<RowDataPacket[]>(
          "SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id <> ? FOR UPDATE",
          [id],
        );
        if (!n[0]!['n']) return { codigo: 409, error: 'Debe quedar al menos un administrador activo.' };
      }
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (d.nombre !== undefined) sets.push('nombre = ?'), vals.push(d.nombre);
      if (d.rol !== undefined) sets.push('rol = ?'), vals.push(d.rol);
      if (d.activo !== undefined) sets.push('activo = ?'), vals.push(d.activo ? 1 : 0);
      if (d.clave !== undefined) sets.push('clave_hash = ?', 'debe_cambiar_clave = 1'), vals.push(await hashClave(d.clave));
      if (sets.length) await cx.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
      // Los permisos se leen en cada petición, así que no hace falta cerrar sus sesiones.
      if (d.formatos !== undefined) await asignarFormatos(cx, id, d.formatos);
      // Al desactivar, cambiar rol o restablecer la contraseña se cierran sus sesiones.
      if (d.activo === false || d.clave !== undefined || (d.rol && d.rol !== actual.rol)) await cerrarSesionesDe(cx, id);
      await auditar(cx, req.usuario, 'usuario-modificado', null, {
        id,
        usuario: actual.usuario,
        ...d,
        clave: d.clave !== undefined ? '(restablecida)' : undefined,
      });
      const [g] = await cx.query<RowDataPacket[]>(`SELECT ${CAMPOS} FROM usuarios u WHERE u.id = ?`, [id]);
      return { usuario: usuarioDesdeFila(g[0]!) };
    });
    if ('error' in resultado) return reply.code(resultado.codigo!).send({ error: resultado.error });
    return resultado.usuario;
  });
}
