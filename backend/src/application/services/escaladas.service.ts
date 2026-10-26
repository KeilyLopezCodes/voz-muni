import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import type { EscaladasLecturaRepository, TicketEscalado } from '../../domain/repositories/escaladas-lectura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { aSlaDto, type SlaDto } from '../dto/sla.dto';

export interface TicketEscaladoDto extends Omit<TicketEscalado, 'escaladoEn' | 'sla'> {
  escaladoEn: string; // ISO 8601 en UTC
  sla: SlaDto;
}

// Bandeja de escalamientos del supervisor (RF-29, SPEC 32). El permiso es tickets.triage; el filtro de alcance de
// esa acción (SPEC 11) limita qué quejas aparecen, como en la bandeja del triage.
export class EscaladasService {
  constructor(private readonly bandeja: EscaladasLecturaRepository) {}

  async listar(
    usuario: UsuarioAutenticado,
    dependenciaId: number | null,
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketEscaladoDto>> {
    const resultado = await this.bandeja.listar(filtroTicketsParaAccion(usuario, 'tickets.triage'), dependenciaId, pagina, tamano);
    return {
      ...resultado,
      datos: resultado.datos.map((t) => ({ ...t, escaladoEn: t.escaladoEn.toISOString(), sla: aSlaDto(t.sla, t.estado) })),
    };
  }
}
