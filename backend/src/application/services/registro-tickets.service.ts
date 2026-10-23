import type { Alcance } from '../../domain/auth/permisos';
import { hoyGuatemala, validarDatosExtra } from '../../domain/categorias/datos-extra';
import type { Clock } from '../../domain/health/clock';
import type { CatalogoLecturaRepository } from '../../domain/repositories/catalogo-lectura-repository';
import type { RegistroTicketRepository } from '../../domain/repositories/registro-ticket-repository';
import type { VecinoRepository } from '../../domain/repositories/vecino-repository';
import { type Canal, CANALES_INTERNOS } from '../../domain/ticket/canal';
import { Ticket } from '../../domain/ticket/ticket';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { DatosRegistroTicket, TicketCreadoDto } from '../dto/registro-ticket.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { EnvioCorreo } from './envio-correo';

// Registro de quejas (RF-06, RF-08). El alcance de tickets.crear decide quién es el solicitante y el canal.
export class RegistroTicketsService {
  constructor(
    private readonly registros: RegistroTicketRepository,
    private readonly catalogo: CatalogoLecturaRepository,
    private readonly vecinos: VecinoRepository,
    private readonly correo: EnvioCorreo,
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
        },
        { actorId: usuario.id, ahora },
      );
      // Los campos se leen en la misma transacción del registro; sin datosExtra cuenta como {}.
      const hoy = hoyGuatemala(ahora);
      const creado = await this.registros.registrar(registro, (campos) =>
        validarDatosExtra(campos, datos.datosExtra, hoy),
      );

      // Después del commit y sin esperar: la queja no depende del correo.
      if (solicitante.email) {
        this.correo.sinEsperar(
          'queja_registrada',
          solicitante.email,
          {
            nombre: solicitante.nombre,
            numero: creado.numero,
            titulo: registro.datos.titulo,
            enlace: `${this.appUrl}/consulta?numero=${creado.numero}`,
          },
          solicitante.id,
        );
      }
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
