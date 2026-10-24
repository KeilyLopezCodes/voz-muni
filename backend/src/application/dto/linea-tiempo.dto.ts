import type { ActorEvento, DetalleEvento } from '../../domain/repositories/linea-tiempo-repository';

export interface EventoLineaTiempoDto {
  id: string;
  ocurridoEn: string; // ISO 8601 en UTC
  actor: ActorEvento;
  detalle: DetalleEvento;
}

export interface PaginaLineaTiempoDto {
  datos: EventoLineaTiempoDto[];
  siguienteCursor: string | null;
}
