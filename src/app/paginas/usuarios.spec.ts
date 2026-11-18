import { problemaClave } from './ingresar';
import { generarClave } from './usuarios';

describe('generarClave', () => {
  it('genera contraseñas distintas de letras y números que cumplen la política', () => {
    const claves = Array.from({ length: 200 }, () => generarClave());
    for (const c of claves) {
      expect(c).toMatch(/^[A-Za-z0-9]{12}$/);
      expect(problemaClave(c)).toBeNull();
    }
    expect(new Set(claves).size).toBe(200);
  });
});
