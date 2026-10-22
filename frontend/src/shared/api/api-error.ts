// status 0 = red no disponible o tiempo agotado.
export class ApiError extends Error {
  readonly status: number
  readonly codigo: string

  constructor(status: number, codigo: string) {
    super(codigo)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
  }
}
