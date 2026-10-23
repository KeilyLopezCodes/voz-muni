// Un problema de un formulario validado de una vez (DATOS_EXTRA_INVALIDOS, …): { campo, problema }.
export interface DetalleError {
  campo: string
  problema: string
}

// status 0 = red no disponible o tiempo agotado.
export class ApiError extends Error {
  readonly status: number
  readonly codigo: string
  readonly detalles: DetalleError[]

  constructor(status: number, codigo: string, detalles: DetalleError[] = []) {
    super(codigo)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
    this.detalles = detalles
  }
}
