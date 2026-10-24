import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import { InvalidTransitionError } from '../../domain/errors/invalid-transition-error';
import type { Clock } from '../../domain/health/clock';
import type { TicketParaTransicion } from '../../domain/repositories/ticket-escritura-repository';
import type { Pagina } from '../../domain/repositories/ticket-lectura-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { EstadoTriage, TriageLecturaRepository } from '../../domain/repositories/triage-lectura-repository';
import type { ResultadoTransicion } from '../../domain/ticket/ticket';
import { puedeTransicionar } from '../../domain/ticket/transiciones';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import type { ComandoTriage, TicketTriageDto, TransicionDto } from '../dto/triage.dto';
import { ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { EnvioCorreo } from './envio-correo';
import type { MotorSla } from './sla.service';

interface TransicionHecha {
  actual: TicketParaTransicion;
  resultado: ResultadoTransicion;
  categoriaId: number;
  dependenciaNombre: string | null; // solo al aceptar
}

// Triage del supervisor (RF-12, RF-13, SPEC 19): tomar, aceptar o rechazar las quejas nuevas.
// Los errores del dominio (InvalidTransitionError, ReglaDeNegocioError) los traduce el manejador de errores.
export class TriageService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly bandeja: TriageLecturaRepository,
    private readonly correo: EnvioCorreo,
    private readonly clock: Clock,
    private readonly appUrl: string, // APP_URL, sin barra final
    private readonly sla: MotorSla,
  ) {}

  async transicionar(usuario: UsuarioAutenticado, id: number, comando: ComandoTriage): Promise<TransicionDto> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.triage');
    const hecha = await this.transaccion.ejecutar(async ({ ticketsEscritura }): Promise<TransicionHecha> => {
      // FOR UPDATE: un segundo supervisor espera aquí y luego ve el estado nuevo, así que recibe 409.
      const actual = await ticketsEscritura.obtenerParaActualizar(id, filtro);
      if (!actual) {
        throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${id}`);
      }
      const ctx = { actorId: usuario.id, ahora: this.clock.now() };

      if (comando.accion === 'tomar') {
        const resultado = actual.ticket.enviarARevision(ctx);
        await ticketsEscritura.guardarTransicion(resultado, actual.categoria.id);
        return { actual, resultado, categoriaId: actual.categoria.id, dependenciaNombre: null };
      }
      if (comando.accion === 'rechazar') {
        const resultado = actual.ticket.rechazar(ctx, comando.motivo);
        await ticketsEscritura.guardarTransicion(resultado, actual.categoria.id);
        return { actual, resultado, categoriaId: actual.categoria.id, dependenciaNombre: null };
      }

      // Primero el estado de origen, como en el dominio: aceptar una `nueva` es 409 aunque la categoría falle.
      if (!puedeTransicionar(actual.ticket.estado, 'asignada')) {
        throw new InvalidTransitionError(actual.ticket.estado, 'asignada');
      }
      const destino = await ticketsEscritura.obtenerCategoria(comando.categoriaId ?? actual.categoria.id);
      if (!destino || !destino.activa) {
        throw new ErrorDeAplicacion('CATEGORIA_INVALIDA', 'La categoría no existe, está inactiva o su dependencia lo está');
      }
      // La dependencia sale de la categoría final (RF-13). datos_extra no se toca.
      const nota =
        destino.id === actual.categoria.id ? undefined : `Categoría: ${actual.categoria.nombre} → ${destino.nombre}`;
      const resultado = actual.ticket.asignar(ctx, destino.dependenciaId, comando.prioridad, nota);
      // Los dos plazos corren desde el registro con la categoría y la prioridad finales (SPEC 30).
      const cambiosSla = await this.sla.alAceptar(actual.sla, { categoriaId: destino.id, prioridad: comando.prioridad });
      await ticketsEscritura.guardarTransicion(resultado, destino.id, cambiosSla);
      return { actual, resultado, categoriaId: destino.id, dependenciaNombre: destino.dependenciaNombre };
    });

    this.avisarSolicitante(comando, hecha);
    const { ticket } = hecha.resultado;
    return {
      id: ticket.id,
      numero: ticket.numero,
      estado: ticket.estado,
      prioridad: ticket.prioridad,
      categoriaId: hecha.categoriaId,
      dependenciaId: ticket.dependenciaId,
    };
  }

  async listar(
    usuario: UsuarioAutenticado,
    estados: readonly EstadoTriage[],
    pagina: number,
    tamano: number,
  ): Promise<Pagina<TicketTriageDto>> {
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.triage');
    const resultado = await this.bandeja.listar(filtro, estados, pagina, tamano);
    return { ...resultado, datos: resultado.datos.map((t) => ({ ...t, creadoEn: t.creadoEn.toISOString() })) };
  }

  // Después del commit y sin esperar: la transición no depende del correo. Tomar no avisa.
  private avisarSolicitante(comando: ComandoTriage, { actual, resultado, dependenciaNombre }: TransicionHecha): void {
    const { solicitante } = actual;
    if (comando.accion === 'tomar' || !solicitante.email) {
      return;
    }
    const comunes = {
      nombre: solicitante.nombre,
      numero: resultado.ticket.numero,
      titulo: actual.titulo,
      enlace: `${this.appUrl}/consulta?numero=${resultado.ticket.numero}`,
    };
    // Al aceptar va la dependencia; al rechazar, el motivo recortado que quedó en el historial.
    const [clave, variables] =
      comando.accion === 'aceptar'
        ? ['queja_aceptada', { ...comunes, dependencia: dependenciaNombre ?? '' }]
        : ['queja_rechazada', { ...comunes, motivo: resultado.historial.motivo ?? '' }];
    this.correo.sinEsperar(clave, solicitante.email, variables, solicitante.id);
  }
}
