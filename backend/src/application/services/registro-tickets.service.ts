import type { Alcance } from '../../domain/auth/permisos';
import { hoyGuatemala, validarDatosExtra } from '../../domain/categorias/datos-extra';
import type { Clock } from '../../domain/health/clock';
import type { CatalogoLecturaRepository } from '../../domain/repositories/catalogo-lectura-repository';
import type { RegistroTicketRepository } from '../../domain/repositories/registro-ticket-repository';
import type { VecinoRepository } from '../../domain/repositories/vecino-repository';
import { type Canal, CANALES_INTERNOS } from '../../domain/ticket/canal';
import { Ticket } from '../../domain/ticket/ticket';
import { validarUbicacion } from '../../domain/ubicacion/limites-municipio';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { DatosRegistroTicket, TicketCreadoDto } from '../dto/registro-ticket.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { NotificadorCorreo } from './notificador-correo.service';
import type { ParametrosService } from './parametros.service';

// Registro de quejas (RF-06, RF-08). El alcance de tickets.crear decide quién es el solicitante y el canal.
export class RegistroTicketsService {
  constructor(
    private readonly registros: RegistroTicketRepository,
    private readonly catalogo: CatalogoLecturaRepository,
    private readonly vecinos: VecinoRepository,
    private readonly correo: NotificadorCorreo,
    private readonly parametros: ParametrosService,
    private readonly clock: Clock,
    private readonly appUrl: string, // APP_URL, sin barra final
  ) {}

  async registrar(usuario: UsuarioAutenticado, alcance: Alcance, datos: DatosRegistroTicket): Promise<TicketCreadoDto> {
    return conReglasDeNegocio(async () => {
      const { solicitanteId, canal } = this.solicitanteYCanal(usuario, alcance, datos);

      const solicitante = await this.vecinos.obtenerActivo(solicitanteId);
      if (!solicitante) {
        throw new ErrorDeAplicacion('SOLICITANTE_INVALIDO', `El usuario ${solicitanteId} no es un vecino activo`);
      }
      if (!(await this.catalogo.categoriaRegistrable(datos.categoriaId))) {
        throw new ErrorDeAplicacion('CATEGORIA_INVALIDA', 'La categoría no existe, está inactiva o su dependencia lo está');
      }
      if (!(await this.catalogo.zonaExiste(datos.zonaId))) {
        throw new ErrorDeAplicacion('ZONA_INVALIDA', `La zona ${datos.zonaId} no existe`);
      }
      // Los límites solo se leen si vino alguna coordenada; sin coordenadas la queja se registra igual.
      const conCoordenadas = datos.lat !== undefined || datos.lng !== undefined;
      const limites = conCoordenadas ? await this.parametros.obtenerLimites() : null;
      const ubicacion = validarUbicacion(limites, datos.lat, datos.lng);

      const ahora = this.clock.now();
      // registrado_por siempre es el usuario autenticado (SPEC 11): el vecino para sí, o el receptor de ventanilla.
      const registro = Ticket.registrar(
        {
          solicitanteId,
          registradoPor: usuario.id,
          categoriaId: datos.categoriaId,
          zonaId: datos.zonaId,
          canal,
          titulo: datos.titulo,
          descripcion: datos.descripcion,
          direccion: datos.direccion,
          ubicacion,
        },
        { actorId: usuario.id, ahora },
      );
      // Los campos se leen en la misma transacción del registro; sin datosExtra cuenta como {}.
      const hoy = hoyGuatemala(ahora);
      // El aviso se encola en la misma transacción del registro (SPEC 34): si se revierte, no queda correo.
      let correoId: number | null = null;
      const creado = await this.registros.registrar(
        registro,
        (campos) => validarDatosExtra(campos, datos.datosExtra, hoy),
        async (nuevo, { correos, auditoria }) => {
          // La bitácora, en la transacción del registro (SPEC 41). Todavía no tiene dependencia.
          await auditoria.registrar({
            accion: 'ticket.registrar',
            entidadId: nuevo.id,
            usuarioId: usuario.id,
            dependenciaId: null,
            cambios: { estado: { antes: null, despues: 'nueva' } },
            datos: { canal, categoriaId: datos.categoriaId },
          });
          if (solicitante.email) {
            correoId = await this.correo.encolar(
              'queja_registrada',
              {
                nombre: solicitante.nombre,
                numero: nuevo.numero,
                titulo: registro.datos.titulo,
                enlace: `${this.appUrl}/consulta?numero=${nuevo.numero}`,
              },
              { para: solicitante.email, usuarioId: solicitante.id, ticketId: nuevo.id },
              correos,
            );
          }
        },
      );

      // Después del commit y sin esperar: la queja no depende del correo.
      await this.correo.despachar([correoId]);
      return { id: creado.id, numero: creado.numero, estado: 'nueva', creadoEn: creado.creadoEn.toISOString() };
    });
  }

  private solicitanteYCanal(
    usuario: UsuarioAutenticado,
    alcance: Alcance,
    datos: DatosRegistroTicket,
  ): { solicitanteId: number; canal: Canal } {
    if (alcance === 'propia') {
      if (datos.solicitanteId !== undefined || datos.canal !== undefined) {
        throw new ErrorDeAplicacion('VALIDACION', 'El vecino registra para sí: no envía solicitanteId ni canal');
      }
      return { solicitanteId: usuario.id, canal: 'portal' };
    }
    if (alcance === 'a_nombre_de_vecino' || alcance === 'todas') {
      if (datos.solicitanteId === undefined || datos.canal === undefined || !CANALES_INTERNOS.includes(datos.canal)) {
        throw new ErrorDeAplicacion(
          'VALIDACION',
          `Hay que enviar solicitanteId y un canal entre ${CANALES_INTERNOS.join(', ')}`,
        );
      }
      return { solicitanteId: datos.solicitanteId, canal: datos.canal };
    }
    throw new ErrorDeAplicacion('PERMISO_DENEGADO', `El alcance ${alcance} no permite registrar quejas`);
  }
}
