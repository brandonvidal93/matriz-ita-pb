import type { FastifyInstance } from 'fastify';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { auditar } from '../auditoria';
import { cerrarSesionesDe, hashClave, requiere, usuarioDesdeFila } from '../auth';
import type { Contexto } from '../app';
import { enTransaccion } from '../db';
import { CambioUsuario, NuevoUsuario } from '../esquemas';

const CAMPOS = 'id, usuario, nombre, rol, activo, debe_cambiar_clave, creado, ultimo_ingreso';

export async function rutasUsuarios(app: FastifyInstance, { db }: Contexto) {
  const soloAdmin = { preHandler: requiere('admin') };

  app.get('/api/usuarios', soloAdmin, async () => {
    const [filas] = await db.query<RowDataPacket[]>(`SELECT ${CAMPOS} FROM usuarios ORDER BY nombre`);
    return filas.map((f) => ({
      ...usuarioDesdeFila(f),
      creado: f['creado']?.toISOString(),
      ultimoIngreso: f['ultimo_ingreso']?.toISOString() ?? null,
    }));
  });

  app.post('/api/usuarios', soloAdmin, async (req, reply) => {
    const d = NuevoUsuario.parse(req.body);
    try {
      const [r] = await db.query<ResultSetHeader>(
        'INSERT INTO usuarios (usuario, nombre, rol, clave_hash, debe_cambiar_clave) VALUES (?, ?, ?, ?, 1)',
        [d.usuario, d.nombre, d.rol, await hashClave(d.clave)],
      );
      await auditar(db, req.usuario, 'usuario-creado', null, { id: r.insertId, usuario: d.usuario, rol: d.rol });
      const [f] = await db.query<RowDataPacket[]>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, [r.insertId]);
      return reply.code(201).send(usuarioDesdeFila(f[0]!));
    } catch (e: any) {
      if (e?.code === 'ER_DUP_ENTRY') return reply.code(409).send({ error: `El usuario “${d.usuario}” ya existe.` });
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>('/api/usuarios/:id', soloAdmin, async (req, reply) => {
    const id = Number(req.params.id);
    const d = CambioUsuario.parse(req.body);
    const resultado = await enTransaccion(db, async (cx) => {
      const [f] = await cx.query<RowDataPacket[]>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ? FOR UPDATE`, [id]);
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
      // Al desactivar, cambiar rol o restablecer la contraseña se cierran sus sesiones.
      if (d.activo === false || d.clave !== undefined || (d.rol && d.rol !== actual.rol)) await cerrarSesionesDe(cx, id);
      await auditar(cx, req.usuario, 'usuario-modificado', null, {
        id,
        usuario: actual.usuario,
        ...d,
        clave: d.clave !== undefined ? '(restablecida)' : undefined,
      });
      const [g] = await cx.query<RowDataPacket[]>(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, [id]);
      return { usuario: usuarioDesdeFila(g[0]!) };
    });
    if ('error' in resultado) return reply.code(resultado.codigo!).send({ error: resultado.error });
    return resultado.usuario;
  });
}
