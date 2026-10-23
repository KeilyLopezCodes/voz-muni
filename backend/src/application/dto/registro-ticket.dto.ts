import type { Canal } from '../../domain/ticket/canal';

// Cuerpo de POST /api/v1/tickets. solicitanteId y canal solo los envían el receptor y el supervisor.
export interface DatosRegistroTicket {
  categoriaId: number;
  zonaId: number;
  titulo: string;
  descripcion: string;
  direccion: string;
  solicitanteId?: number;
  canal?: Canal;
  datosExtra?: unknown; // se valida contra los campos de la categoría (SPEC 14)
}

export interface TicketCreadoDto {
  id: number;
  numero: string;
  estado: 'nueva';
  creadoEn: string; // ISO 8601 en UTC
}

export interface VecinoEncontrado {
  id: number;
  nombre: string;
  email: string | null; // enmascarado: a***@dominio.gt
  telefono: string | null; // enmascarado: ****0000
}
