// Un problema de un formulario validado de una vez (DATOS_EXTRA_INVALIDOS, …): { campo, problema }.
export interface DetalleError {
  campo: string
  problema: string
}

// Un registro que impide la operación (SPEC 40): por ejemplo, las categorías activas de una dependencia.
export interface RegistroError {
  id: number
  nombre: string
}

// status 0 = red no disponible o tiempo agotado.
export class ApiError extends Error {
  readonly status: number
  readonly codigo: string
  readonly detalles: DetalleError[]
  readonly registros: RegistroError[]

  constructor(status: number, codigo: string, detalles: DetalleError[] = [], registros: RegistroError[] = []) {
    super(codigo)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
    this.detalles = detalles
    this.registros = registros
  }
}
