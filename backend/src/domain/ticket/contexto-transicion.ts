// Quién ejecuta la transición y cuándo. La entidad no consulta relojes ni sesiones.
export interface ContextoTransicion {
  actorId: number | null; // null = sistema
  ahora: Date; // UTC
}
