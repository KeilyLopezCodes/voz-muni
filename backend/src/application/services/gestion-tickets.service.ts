import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import type { FiltroOpciones, GestionLecturaRepository } from '../../domain/repositories/gestion-lectura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import { type Busqueda, interpretarBusqueda } from '../../domain/ticket/busqueda';
import type { EstadoTicket } from '../../domain/ticket/estado-ticket';
import type { Prioridad } from '../../domain/ticket/prioridad';
import { rangoCreacion } from '../../domain/ticket/rango-creacion';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { OpcionesGestionDto, TicketGestionDto } from '../dto/gestion-tickets.dto';
import { aSlaDto } from '../dto/sla.dto';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';

export interface ConsultaGestion {
  estados: readonly EstadoTicket[];
  q?: string; // ya recortado, de 2 a 100 caracteres
  dependenciaId?: number;
  categoriaId?: number;
  prioridad?: Prioridad;
  desde?: string; // YYYY-MM-DD en America/Guatemala
  hasta?: string;
  tecnico?: number | 'sin_asignar';
  pagina: number;
  tamano: number;
}

// Listado general de quejas para los internos (SPEC 45). El alcance de tickets.ver (SPEC 11) limita las quejas y
// las opciones de los filtros; los filtros solo lo reducen, nunca lo amplían.
export class GestionTicketsService {
  constructor(private readonly gestion: GestionLecturaRepository) {}

  async listar(usuario: UsuarioAutenticado, consulta: ConsultaGestion): Promise<Pagina<TicketGestionDto>> {
    const rango = await conReglasDeNegocio(async () => rangoCreacion(consulta.desde, consulta.hasta));
    const busqueda: Busqueda | null = consulta.q === undefined ? null : interpretarBusqueda(consulta.q);
    const resultado = await this.gestion.listar(
      filtroTicketsParaAccion(usuario, 'tickets.ver'),
      {
        estados: consulta.estados,
        busqueda,
        dependenciaId: consulta.dependenciaId ?? null,
        categoriaId: consulta.categoriaId ?? null,
        prioridad: consulta.prioridad ?? null,
        inicio: rango.inicio,
        fin: rango.fin,
        tecnico: consulta.tecnico ?? null,
      },
      consulta.pagina,
      consulta.tamano,
    );
    return {
      ...resultado,
      datos: resultado.datos.map((t) => ({ ...t, creadoEn: t.creadoEn.toISOString(), sla: aSlaDto(t.sla, t.estado) })),
    };
  }

  async opciones(usuario: UsuarioAutenticado): Promise<OpcionesGestionDto> {
    return this.gestion.opciones(filtroOpciones(usuario));
  }
}

// Por alcance de tickets.ver, nunca por nombre de rol: dependencia y asignadas ven su dependencia (asignadas sin
// técnicos, porque solo ve las suyas); registradas y todas, todo.
function filtroOpciones(usuario: UsuarioAutenticado): FiltroOpciones {
  switch (usuario.permisos['tickets.ver']) {
    case 'dependencia':
      return usuario.dependenciaId === null ? null : { dependencias: usuario.dependenciaId, tecnicos: true };
    case 'asignadas':
      return usuario.dependenciaId === null ? null : { dependencias: usuario.dependenciaId, tecnicos: false };
    case 'registradas':
    case 'todas':
      return { dependencias: 'todas', tecnicos: true };
    default:
      return null;
  }
}
