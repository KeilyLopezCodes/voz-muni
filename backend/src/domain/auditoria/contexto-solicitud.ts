// El contexto de la petición HTTP en curso (SPEC 41), sin conocer Express: la bitácora toma de aquí la IP sin cambiar
// la firma de cada servicio.
export interface ContextoSolicitud {
  // null fuera de una petición HTTP (los jobs).
  ip(): string | null;
  // Ejecuta `trabajo` (y todo lo asíncrono que derive de él) con esta IP como contexto.
  ejecutar<T>(ip: string | null, trabajo: () => T): T;
}
