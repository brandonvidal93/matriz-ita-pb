import { construirApp } from '../src/app';
import { leerConfig } from '../src/config';

// No usa la base: estas rutas no consultan MySQL.
const app = (env: Record<string, string>) =>
  construirApp({ db: {} as any, config: leerConfig({ ITA_DB_URL: 'mysql://x@localhost/x', ITA_WEB_DIR: '', ...env }) });

describe('documentación Swagger', () => {
  it('se publica en desarrollo con ITA_DOCS=true y documenta rutas, cuerpos y la cookie de sesión', async () => {
    const a = await app({ ITA_DOCS: 'true' });
    const r = await a.inject('/api/docs/json');
    expect(r.statusCode).toBe(200);
    const spec = r.json();
    expect(spec.components.securitySchemes.sesion).toMatchObject({ in: 'cookie', name: 'ita_sesion' });
    expect(spec.paths['/api/auth/ingresar'].post.requestBody.content['application/json'].schema.required).toEqual(['usuario', 'clave']);
    expect(spec.paths['/api/registros/{id}'].get.security).toEqual([{ sesion: [] }]);
    expect(Object.keys(spec.paths).every((p) => p.startsWith('/api/') && !p.startsWith('/api/docs'))).toBe(true);
    // Los esquemas no validan: un cuerpo inválido sigue llegando a zod y responde con su mensaje.
    const inv = await a.inject({ method: 'POST', url: '/api/auth/ingresar', payload: {} });
    expect(inv.statusCode).toBe(400);
    expect(inv.json().error).toMatch(/^Datos inválidos/);
    await a.close();
  });

  it('no existe sin ITA_DOCS ni en producción', async () => {
    for (const env of [{}, { ITA_DOCS: 'true', NODE_ENV: 'production' }]) {
      const a = await app(env as Record<string, string>);
      expect((await a.inject('/api/docs/json')).statusCode).toBe(404);
      await a.close();
    }
  });
});
