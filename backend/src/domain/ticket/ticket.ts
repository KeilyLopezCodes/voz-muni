import { InvalidTransitionError } from '../errors/invalid-transition-error';
import { ReglaDeNegocioError } from '../errors/regla-de-negocio-error';
import type { ContextoTransicion } from './contexto-transicion';
import { esFinal, type EstadoTicket } from './estado-ticket';
import { esPrioridad, type Prioridad } from './prioridad';
import type { RegistroHistorial } from './registro-historial';

export interface TicketProps {
  readonly id: number;
  readonly numero: string;
  readonly estado: EstadoTicket;
  readonly dependenciaId: number | null;
  readonly asignadoA: number | null;
  readonly prioridad: Prioridad | null;
  readonly escalado: boolean;
  readonly resueltoEn: Date | null;
  readonly cerradoEn: Date | null;
}

// Vive aquí y no en registro-historial.ts para no crear un ciclo de imports (regla no-circular).
export interface ResultadoTransicion {
  ticket: Ticket;
  historial: RegistroHistorial;
}

interface CambiosTransicion {
  cambios?: Partial<TicketProps>;
  motivo?: string | null;
}

// Entidad inmutable: cada acción devuelve un ticket nuevo y su registro de historial.
export class Ticket {
  private readonly props: TicketProps;

  private constructor(props: TicketProps) {
    this.props = Object.freeze({ ...props });
    Object.freeze(this);
  }

  // Sin validar: los datos vienen de la persistencia, que ya los escribió el dominio.
  static reconstituir(props: TicketProps): Ticket {
    return new Ticket(props);
  }

  get id(): number {
    return this.props.id;
  }

  get numero(): string {
    return this.props.numero;
  }

  get estado(): EstadoTicket {
    return this.props.estado;
  }

  get dependenciaId(): number | null {
    return this.props.dependenciaId;
  }

  get asignadoA(): number | null {
    return this.props.asignadoA;
  }

  get prioridad(): Prioridad | null {
    return this.props.prioridad;
  }

  get escalado(): boolean {
    return this.props.escalado;
  }

  get resueltoEn(): Date | null {
    return this.props.resueltoEn;
  }

  get cerradoEn(): Date | null {
    return this.props.cerradoEn;
  }

  enviarARevision(ctx: ContextoTransicion): ResultadoTransicion {
    return this.transicionar(ctx, ['nueva'], 'en_revision');
  }

  rechazar(ctx: ContextoTransicion, motivo: string): ResultadoTransicion {
    return this.transicionar(ctx, ['en_revision'], 'rechazada', () => ({
      motivo: textoRequerido(motivo, 'MOTIVO_REQUERIDO', 'El motivo es obligatorio'),
    }));
  }

  asignar(ctx: ContextoTransicion, dependenciaId: number, prioridad: Prioridad): ResultadoTransicion {
    return this.transicionar(ctx, ['en_revision'], 'asignada', () => {
      if (!esIdValido(dependenciaId)) {
        throw new ReglaDeNegocioError('DEPENDENCIA_INVALIDA', 'La dependencia debe ser un id entero mayor que 0');
      }
      if (!esPrioridad(prioridad)) {
        throw new ReglaDeNegocioError('PRIORIDAD_INVALIDA', `La prioridad ${String(prioridad)} no es válida`);
      }
      return { cambios: { dependenciaId, prioridad } };
    });
  }

  iniciar(ctx: ContextoTransicion): ResultadoTransicion {
    return this.transicionar(ctx, ['asignada'], 'en_proceso', () => {
      if (this.asignadoA === null) {
        throw new ReglaDeNegocioError('TECNICO_REQUERIDO', 'La queja necesita un técnico asignado para iniciar');
      }
      return {};
    });
  }

  // No cambia de estado, así que no genera historial.
  asignarTecnico(tecnicoId: number): Ticket {
    if (this.estado !== 'asignada' && this.estado !== 'en_proceso') {
      throw new ReglaDeNegocioError(
        'OPERACION_NO_PERMITIDA',
        `No se puede asignar técnico a una queja en estado ${this.estado}`,
      );
    }
    if (!esIdValido(tecnicoId)) {
      throw new ReglaDeNegocioError('TECNICO_INVALIDO', 'El técnico debe ser un id entero mayor que 0');
    }
    return new Ticket({ ...this.props, asignadoA: tecnicoId });
  }

  // El motivo es la información que se solicita al vecino (RF-21).
  ponerEnEspera(ctx: ContextoTransicion, motivo: string): ResultadoTransicion {
    return this.transicionar(ctx, ['en_proceso'], 'en_espera', () => ({
      motivo: textoRequerido(motivo, 'MOTIVO_REQUERIDO', 'El motivo es obligatorio'),
    }));
  }

  reanudar(ctx: ContextoTransicion): ResultadoTransicion {
    return this.transicionar(ctx, ['en_espera'], 'en_proceso');
  }

  // Efecto de un traslado ya aprobado: vuelve a revisión sin dependencia ni técnico.
  trasladar(ctx: ContextoTransicion, motivo: string): ResultadoTransicion {
    return this.transicionar(ctx, ['asignada', 'en_proceso'], 'en_revision', () => ({
      cambios: { dependenciaId: null, asignadoA: null },
      motivo: textoRequerido(motivo, 'MOTIVO_REQUERIDO', 'El motivo es obligatorio'),
    }));
  }

  // La descripción de la resolución se guarda como motivo del historial (RF-23).
  resolver(ctx: ContextoTransicion, descripcion: string): ResultadoTransicion {
    return this.transicionar(ctx, ['en_proceso'], 'resuelta', () => ({
      cambios: { resueltoEn: ctx.ahora },
      motivo: textoRequerido(descripcion, 'DESCRIPCION_REQUERIDA', 'La descripción de la resolución es obligatoria'),
    }));
  }

  // El vecino confirma dentro del plazo; el límite exacto cuenta como dentro.
  confirmarSolucion(ctx: ContextoTransicion, confirmacionVenceEn: Date): ResultadoTransicion {
    return this.transicionar(ctx, ['resuelta'], 'cerrada', () => {
      if (ctx.actorId === null) {
        throw new ReglaDeNegocioError('ACTOR_REQUERIDO', 'La confirmación necesita un usuario');
      }
      exigirPlazoVigente(ctx.ahora, confirmacionVenceEn);
      return { cambios: { cerradoEn: ctx.ahora } };
    });
  }

  // El sistema cierra cuando venció el plazo de confirmación sin respuesta (RF-30).
  cerrarPorVencimiento(ctx: ContextoTransicion, confirmacionVenceEn: Date): ResultadoTransicion {
    return this.transicionar(ctx, ['resuelta'], 'cerrada', () => {
      if (ctx.actorId !== null) {
        throw new ReglaDeNegocioError('SOLO_SISTEMA', 'Solo el sistema cierra por vencimiento');
      }
      if (ctx.ahora.getTime() <= confirmacionVenceEn.getTime()) {
        throw new ReglaDeNegocioError('PLAZO_CONFIRMACION_VIGENTE', 'El plazo de confirmación todavía no vence');
      }
      return { cambios: { cerradoEn: ctx.ahora } };
    });
  }

  // Vuelve al mismo técnico y reinicia el plazo de resolución, por eso limpia resueltoEn y escalado.
  reabrir(ctx: ContextoTransicion, motivo: string, confirmacionVenceEn: Date): ResultadoTransicion {
    return this.transicionar(ctx, ['resuelta'], 'en_proceso', () => {
      const motivoRecortado = textoRequerido(motivo, 'MOTIVO_REQUERIDO', 'El motivo es obligatorio');
      exigirPlazoVigente(ctx.ahora, confirmacionVenceEn);
      return { cambios: { resueltoEn: null, escalado: false }, motivo: motivoRecortado };
    });
  }

  // Escalada es una marca, no un estado: no genera historial. Cuándo se marca lo decide la spec de SLA.
  marcarEscalado(): Ticket {
    if (esFinal(this.estado)) {
      throw new ReglaDeNegocioError(
        'OPERACION_NO_PERMITIDA',
        `No se puede escalar una queja en estado final ${this.estado}`,
      );
    }
    return this.escalado ? this : new Ticket({ ...this.props, escalado: true });
  }

  // Orden de validación de la SPEC 04: primero el estado de origen, después los datos.
  private transicionar(
    ctx: ContextoTransicion,
    desde: readonly EstadoTicket[],
    hacia: EstadoTicket,
    preparar: () => CambiosTransicion = () => ({}),
  ): ResultadoTransicion {
    if (!desde.includes(this.estado)) {
      throw new InvalidTransitionError(this.estado, hacia);
    }
    const { cambios = {}, motivo = null } = preparar();
    return {
      ticket: new Ticket({ ...this.props, ...cambios, estado: hacia }),
      historial: {
        ticketId: this.id,
        estadoAnterior: this.estado,
        estadoNuevo: hacia,
        usuarioId: ctx.actorId,
        motivo,
        creadoEn: ctx.ahora,
      },
    };
  }
}

// Un motivo o descripción es válido si no queda vacío después de trim(); se guarda recortado.
function textoRequerido(valor: string, codigo: string, mensaje: string): string {
  const recortado = typeof valor === 'string' ? valor.trim() : '';
  if (recortado === '') {
    throw new ReglaDeNegocioError(codigo, mensaje);
  }
  return recortado;
}

function exigirPlazoVigente(ahora: Date, confirmacionVenceEn: Date): void {
  if (ahora.getTime() > confirmacionVenceEn.getTime()) {
    throw new ReglaDeNegocioError('PLAZO_CONFIRMACION_VENCIDO', 'El plazo de confirmación ya venció');
  }
}

function esIdValido(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}
