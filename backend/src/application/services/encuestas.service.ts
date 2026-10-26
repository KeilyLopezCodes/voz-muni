import { filtroTicketsParaAccion } from '../../domain/autorizacion/alcance-tickets';
import {
  CLAVE_PLAZO_ENCUESTA,
  CLAVE_UMBRAL_ENCUESTA,
  exigirCalificable,
  plazoEncuestaValido,
  umbralEncuestaValido,
  validarEncuesta,
} from '../../domain/encuestas/encuesta';
import type { Clock } from '../../domain/health/clock';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import type { UsuarioAutenticado } from '../dto/auth.dto';
import { conReglasDeNegocio, ErrorDeAplicacion } from '../errors/error-de-aplicacion';
import type { NotificacionesInternasService } from './notificaciones-internas.service';

export interface DatosCalificacion {
  calificacion: number;
  comentario?: string;
}

export interface EncuestaDto {
  calificacion: number;
  comentario: string | null;
  creadoEn: string; // ISO 8601 en UTC
}

// Encuesta de satisfacción al cerrar (RF-37, SPEC 39). Solo el solicitante califica, una vez, una queja cerrada y
// dentro del plazo. Una calificación baja avisa a los coordinadores de la dependencia (SPEC 36).
export class EncuestasService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly parametros: ParametroRepository,
    private readonly clock: Clock,
    private readonly notificaciones: Pick<NotificacionesInternasService, 'notificar'>,
  ) {}

  async calificar(usuario: UsuarioAutenticado, ticketId: number, datos: DatosCalificacion): Promise<EncuestaDto> {
    const plazoDias = await this.parametro(CLAVE_PLAZO_ENCUESTA, plazoEncuestaValido);
    const umbral = await this.parametro(CLAVE_UMBRAL_ENCUESTA, umbralEncuestaValido);
    const filtro = filtroTicketsParaAccion(usuario, 'tickets.ver');

    return conReglasDeNegocio(() =>
      this.transaccion.ejecutar(async ({ ticketsEscritura, encuestas, destinatarios, notificaciones, auditoria }) => {
        // FOR UPDATE con el filtro de tickets.ver (SPEC 11): fuera de alcance responde lo mismo que una inexistente, y
        // dos envíos simultáneos se aplican uno después del otro.
        const actual = await ticketsEscritura.obtenerParaActualizar(ticketId, filtro);
        if (!actual) {
          throw new ErrorDeAplicacion('NO_ENCONTRADO', `No existe el ticket ${ticketId}`);
        }
        // La regla es ser el solicitante, no una acción de la matriz: un interno con alcance no califica.
        if (actual.solicitante.id !== usuario.id) {
          throw new ErrorDeAplicacion('PERMISO_DENEGADO', 'Solo quien registró la queja puede calificarla');
        }
        const ahora = this.clock.now();
        exigirCalificable(actual.ticket.estado, actual.ticket.cerradoEn, ahora, plazoDias);
        const encuesta = { ...validarEncuesta(datos.calificacion, datos.comentario), creadoEn: ahora };
        await encuestas.crear(ticketId, encuesta);
        // Una encuesta por queja: su id en la bitácora es el de la queja (SPEC 41).
        await auditoria.registrar({
          accion: 'encuesta.registrar',
          entidadId: ticketId,
          usuarioId: usuario.id,
          dependenciaId: actual.ticket.dependenciaId,
          datos: { calificacion: encuesta.calificacion },
        });

        // Con el umbral en 0 la alerta queda desactivada: ninguna calificación es menor o igual a 0.
        if (encuesta.calificacion <= umbral) {
          await this.notificaciones.notificar(
            { destinatarios, notificaciones },
            {
              tipo: 'encuesta_baja',
              ticketId,
              autorId: usuario.id,
              candidatos: { coordinadoresDe: actual.ticket.dependenciaId },
              datos: { calificacion: encuesta.calificacion },
            },
            ahora,
          );
        }
        return { calificacion: encuesta.calificacion, comentario: encuesta.comentario, creadoEn: ahora.toISOString() };
      }),
    );
  }

  // Un parámetro que falta o está fuera de rango no deja guardar nada (el mismo código de SPEC 27).
  private async parametro(clave: string, validar: (valor: unknown) => number | null): Promise<number> {
    const valor = validar(await this.parametros.obtener(clave));
    if (valor === null) {
      throw new ErrorDeAplicacion('PARAMETRO_INVALIDO', `El parámetro ${clave} falta o no es válido`);
    }
    return valor;
  }
}
