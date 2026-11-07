/** Se lanza cuando el registro pedido no existe; el manejador global responde 404. */
export class NoEncontrado extends Error {
  constructor(mensaje = 'El registro no existe o fue eliminado.') {
    super(mensaje);
  }
}
