import type { AdjuntoLeido } from '../../domain/repositories/adjunto-repository';

// Un archivo recibido en POST /api/v1/tickets/:id/adjuntos (SPEC 24).
export interface ArchivoSubido {
  nombre: string; // el original del usuario; se limpia antes de guardarlo
  contenido: Buffer;
}

// La ruta en disco nunca sale de la API.
export interface AdjuntoDto extends Omit<AdjuntoLeido, 'ruta' | 'creadoEn'> {
  creadoEn: string; // ISO 8601 en UTC
  borrable: boolean; // el usuario es el autor y no pasaron 5 minutos
}

export interface DescargaAdjunto {
  nombre: string;
  mime: string;
  tamanoBytes: number;
  contenido: NodeJS.ReadableStream;
}
