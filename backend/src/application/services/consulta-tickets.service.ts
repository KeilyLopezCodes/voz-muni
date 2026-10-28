import { exigeMotivoAlConfirmar, puedeConfirmar } from '../../domain/atencion/acciones-confirmacion';
import type { Accion } from '../../domain/auth/permisos';
import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import { CLAVE_PLAZO_ENCUESTA, esCalificable, plazoEncuestaValido, venceEncuesta } from '../../domain/encuestas/encuesta';
import { fechaLocal } from '../../domain/calendario/plazo-confirmacion';
import type { Clock } from '../../domain/health/clock';
import { rangoReportes } from '../../domain/reportes/rango-fechas';
import { interpretarBusqueda } from '../../domain/ticket/busqueda';
import type {
  CriteriosConteo,
  Pagina,
  TicketDetalleLectura,
  TicketLecturaRepository,
  TicketResumen,
} from '../../domain/repositories/ticket-lectura-repository';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type {
  ConfirmacionDetalleDto,
  FiltrosConteoDto,
  FiltrosListadoDto,
  ResumenTicketsDto,
  TicketDetalleDto,
  TicketListadoDto,
} from '../dto/consulta-tickets.dto';
import { aSlaDto } from '../dto/sla.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { PlazosConfirmacionService } from './plazos-confirmacion.service';

const TAMANO_MAXIMO = 100;
const TAMANO_MAXIMO_LISTADO = 50;

const isoONull = (fecha: Date | null) => (fecha === null ? null : fecha.toISOString());

function validarPaginacion(pagina: number, tamano: number, maximo: number): void {
  if (!Number.isInteger(pagina) || pagina < 1 || !Number.isInteger(tamano) || tamano < 1 || tamano > maximo) {
    throw new ErrorDeAplicacion('VALIDACION', `pagina debe ser ≥ 1 y tamano estar entre 1 y ${maximo}`);
  }
}

// Entrada recomendada para leer tickets o cargarlos antes de actuar sobre ellos (SPEC 11).
export class ConsultaTicketsService {
  constructor(
    private readonly tickets: TicketLecturaRepository,
    private readonly plazos: Pick<PlazosConfirmacionService, 'maxReaperturas'>,
    private readonly clock: Clock,
    private readonly parametros: ParametroRepository, // el plazo de la encuesta (SPEC 39)
  ) {}

  listar(usuario: UsuarioAutenticado, pagina: number, tamano: number): Promise<Pagina<TicketResumen>> {
    validarPaginacion(pagina, tamano, TAMANO_MAXIMO);
    return this.tickets.listar(filtroTicketsParaAccion(usuario, 'tickets.ver'), pagina, tamano);
  }

  // Devuelve el ticket si el usuario puede verlo y hacer la acción. Fuera de alcance responde lo mismo que
  // un ticket inexistente, para no revelar qué tickets existen.
  async obtenerParaAccion(usuario: UsuarioAutenticado, accion: Accion, id: number): Promise<TicketResumen> {
    const ticket = await this.tickets.obtener(id, filtroTicketsParaAccion(usuario, accion));
    if (!ticket) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${id}`);
    }
    return ticket;
  }

  // GET /api/v1/tickets (SPEC 25 y 38): dentro del alcance de tickets.ver, filtrado por estados y por `q`, con lo que
  // pide acción primero (en espera, después resueltas con el plazo de confirmación vigente).
  async listarParaUsuario(
    usuario: UsuarioAutenticado,
    filtros: FiltrosListadoDto,
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketListadoDto>> {
    validarPaginacion(pagina, tamano, TAMANO_MAXIMO_LISTADO);
    const ahora = this.clock.now();
    // Depende del alcance de tickets.ver, nunca del nombre del rol (SPEC 45).
    const vistaDelSolicitante = usuario.permisos['tickets.ver'] === 'propia';
    const plazoEncuesta = await this.plazoEncuesta();
    const resultado = await this.tickets.listarConTitulo(
      filtroTicketsParaAccion(usuario, 'tickets.ver'),
      {
        estados: filtros.estados,
        ...(await this.criterios(filtros, ahora)),
        // El vecino ve primero lo que le pide acción (SPEC 38); los internos, lo más reciente (SPEC 45).
        orden: vistaDelSolicitante ? 'accion_pendiente' : 'recientes',
      },
      pagina,
      tamano,
      ahora,
    );
    return {
      ...resultado,
      datos: resultado.datos.map(({ cerradoEn, tieneEncuesta, solicitanteId, interno, ...t }) => ({
        ...t,
        interno: vistaDelSolicitante ? null : { ...interno, sla: aSlaDto(interno.sla, t.estado) },
        creadoEn: t.creadoEn.toISOString(),
        confirmacionVenceEn: isoONull(t.confirmacionVenceEn),
        pendienteCalificar:
          solicitanteId === usuario.id &&
          plazoEncuesta !== null &&
          esCalificable(t.estado, cerradoEn, tieneEncuesta, ahora, plazoEncuesta),
      })),
    };
  }

  // GET /api/v1/tickets/resumen (SPEC 38): cuántas hay en cada estado con el mismo alcance y la misma búsqueda que el
  // listado. Un rol nunca cuenta quejas que no puede ver.
  async resumen(usuario: UsuarioAutenticado, filtros: FiltrosConteoDto): Promise<ResumenTicketsDto> {
    const porEstado = await this.tickets.contarPorEstado(
      filtroTicketsParaAccion(usuario, 'tickets.ver'),
      await this.criterios(filtros, this.clock.now()),
    );
    return { porEstado, total: Object.values(porEstado).reduce((suma, n) => suma + n, 0) };
  }

  // Criterios comunes del listado y del resumen (SPEC 38 y 45). Sin desde ni hasta no se filtra por fecha; con alguno,
  // el rango sale de rangoReportes (SPEC 43): días completos en Guatemala, de 366 como máximo (RANGO_INVALIDO).
  private async criterios(filtros: FiltrosConteoDto, ahora: Date): Promise<CriteriosConteo> {
    const conRango = filtros.desde !== undefined || filtros.hasta !== undefined;
    const rango = conRango
      ? await conReglasDeNegocio(async () => rangoReportes(filtros.desde, filtros.hasta, fechaLocal(ahora)))
      : null;
    return {
      busqueda: filtros.q === undefined ? null : interpretarBusqueda(filtros.q),
      dependenciaId: filtros.dependenciaId ?? null,
      categoriaId: filtros.categoriaId ?? null,
      prioridad: filtros.prioridad ?? null,
      registro: rango === null ? null : { inicio: rango.inicio, fin: rango.fin },
      soloEscaladas: filtros.escalado === true,
    };
  }

  // GET /api/v1/tickets/:id (SPEC 25). Con el filtro de tickets.ver en el mismo WHERE, igual que obtenerParaAccion:
  // fuera de alcance responde lo mismo que un ticket inexistente.
  async detalle(usuario: UsuarioAutenticado, id: number): Promise<TicketDetalleDto> {
    const ticket = await this.tickets.obtenerDetalle(id, filtroTicketsParaAccion(usuario, 'tickets.ver'));
    if (!ticket) {
      throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${id}`);
    }
    const {
      solicitanteId,
      creadoEn,
      resueltoEn,
      cerradoEn,
      resolucion,
      confirmacionVenceEn,
      reaperturas,
      sla,
      encuesta,
      ...resto
    } = ticket;
    // Solo el solicitante califica (SPEC 39), y solo dentro del plazo. La encuesta la ve quien ve la queja.
    const plazoEncuesta = await this.plazoEncuesta();
    const puedeCalificar =
      solicitanteId === usuario.id &&
      plazoEncuesta !== null &&
      esCalificable(ticket.estado, cerradoEn, encuesta !== null, this.clock.now(), plazoEncuesta);
    // Con el alcance propia (el vecino) no se expone quién resolvió, como el técnico en SPEC 25. Depende del
    // alcance, no del nombre del rol (SPEC 26).
    const verQuienResolvio = usuario.permisos['tickets.ver'] !== 'propia';
    return {
      ...resto,
      creadoEn: creadoEn.toISOString(),
      resueltoEn: isoONull(resueltoEn),
      cerradoEn: isoONull(cerradoEn),
      esSolicitante: solicitanteId === usuario.id,
      resolucion:
        resolucion === null
          ? null
          : {
              descripcion: resolucion.descripcion,
              resueltaEn: resolucion.resueltaEn.toISOString(),
              resueltaPor: verQuienResolvio ? resolucion.resueltaPor : null,
            },
      confirmacion: await this.confirmacion(usuario, ticket),
      // Los vencimientos son para los internos: con el alcance propia (el vecino) no se envían (SPEC 30).
      sla: verQuienResolvio ? aSlaDto(sla, ticket.estado) : null,
      encuesta: encuesta === null ? null : { ...encuesta, creadoEn: encuesta.creadoEn.toISOString() },
      puedeCalificar,
      encuestaVenceEn: puedeCalificar ? isoONull(venceEncuesta(cerradoEn, plazoEncuesta!)) : null,
    };
  }

  // Un plazo que falta o no es válido no rompe la lectura: la queja simplemente no se ofrece para calificar (al
  // calificar, POST /encuesta responde 409 PARAMETRO_INVALIDO).
  private async plazoEncuesta(): Promise<number | null> {
    return plazoEncuestaValido(await this.parametros.obtener(CLAVE_PLAZO_ENCUESTA));
  }

  // Solo en resuelta y con vencimiento (SPEC 27). El alcance que decide es el de tickets.cambiar_estado: el técnico,
  // el receptor y el administrador ven el plazo sin poder actuar.
  private async confirmacion(
    usuario: UsuarioAutenticado,
    { estado, confirmacionVenceEn, reaperturas }: TicketDetalleLectura,
  ): Promise<ConfirmacionDetalleDto | null> {
    if (estado !== 'resuelta' || confirmacionVenceEn === null) {
      return null;
    }
    const alcance = usuario.permisos['tickets.cambiar_estado'];
    const vencida = this.clock.now().getTime() > confirmacionVenceEn.getTime();
    const reaperturasRestantes = Math.max(0, (await this.plazos.maxReaperturas()) - reaperturas);
    const puede = puedeConfirmar(alcance) && !vencida;
    return {
      venceEn: confirmacionVenceEn.toISOString(),
      vencida,
      reaperturasRestantes,
      puedeConfirmar: puede,
      puedeReabrir: puede && reaperturasRestantes > 0,
      exigeMotivoAlConfirmar: alcance === undefined || exigeMotivoAlConfirmar(alcance),
    };
  }
}
