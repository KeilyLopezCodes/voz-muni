import type { SolicitudTraslado } from '../../domain/repositories/traslado-repository';

// Cuerpo de POST /api/v1/tickets/:id/traslados (SPEC 21).
export interface DatosSolicitudTraslado {
  motivo: string;
  dependenciaSugeridaId?: number;
}

export interface SolicitudTrasladoDto extends Omit<SolicitudTraslado, 'creadoEn' | 'resueltoEn'> {
  creadoEn: string; // ISO 8601 en UTC
  resueltoEn: string | null;
}

// `ticket` solo aparece cuando la queja cambió: traslado directo o aprobación.
export interface ResultadoTrasladoDto {
  solicitud: SolicitudTrasladoDto;
  ticket?: { id: number; numero: string; estado: 'en_revision' };
}
