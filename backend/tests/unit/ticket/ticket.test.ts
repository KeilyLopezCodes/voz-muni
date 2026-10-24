import { InvalidTransitionError } from '../../../src/domain/errors/invalid-transition-error';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import type { ContextoTransicion } from '../../../src/domain/ticket/contexto-transicion';
import { ESTADOS_TICKET, type EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import type { Prioridad } from '../../../src/domain/ticket/prioridad';
import { Ticket, type TicketProps } from '../../../src/domain/ticket/ticket';

const ctx: ContextoTransicion = { actorId: 7, ahora: new Date('2026-10-22T15:00:00.000Z') };

const BASE: TicketProps = {
  id: 1,
  numero: 'Q-2026-000001',
  estado: 'nueva',
  dependenciaId: null,
  asignadoA: null,
  prioridad: null,
  escalado: false,
  resueltoEn: null,
  cerradoEn: null,
  resolucion: null,
  resueltoPor: null,
  confirmacionVenceEn: null,
  reaperturas: 0,
};

function ticketEn(estado: EstadoTicket, overrides: Partial<TicketProps> = {}): Ticket {
  return Ticket.reconstituir({ ...BASE, ...overrides, estado });
}

// Devuelve el error lanzado por `fn`; falla la prueba si no lanza.
function capturar(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('se esperaba una excepción');
}

function esperarRegla(fn: () => unknown, codigo: string): void {
  const error = capturar(fn);
  expect(error).toBeInstanceOf(ReglaDeNegocioError);
  expect(error).toMatchObject({ codigo });
}

function esperarTransicionInvalida(fn: () => unknown, desde: EstadoTicket, hacia: EstadoTicket): void {
  const error = capturar(fn);
  expect(error).toBeInstanceOf(InvalidTransitionError);
  expect(error).toMatchObject({ codigo: 'TRANSICION_INVALIDA', desde, hacia });
}

function otrosEstados(...permitidos: EstadoTicket[]): EstadoTicket[] {
  return ESTADOS_TICKET.filter((estado) => !permitidos.includes(estado));
}

describe('Ticket', () => {
  describe('reconstituir', () => {
    it('expone las propiedades y congela la instancia', () => {
      const ticket = ticketEn('asignada', { dependenciaId: 3, asignadoA: 9, prioridad: 'alta' });

      expect(ticket).toMatchObject({
        id: 1,
        numero: 'Q-2026-000001',
        estado: 'asignada',
        dependenciaId: 3,
        asignadoA: 9,
        prioridad: 'alta',
        escalado: false,
        resueltoEn: null,
        cerradoEn: null,
        resolucion: null,
        resueltoPor: null,
        confirmacionVenceEn: null,
        reaperturas: 0,
      });
      expect(Object.isFrozen(ticket)).toBe(true);
    });

    it('no valida invariantes: los datos vienen de la persistencia', () => {
      expect(() => ticketEn('asignada', { dependenciaId: null, prioridad: null })).not.toThrow();
    });
  });

  describe('enviarARevision', () => {
    it('pasa de nueva a en_revision y arma el historial', () => {
      const { ticket, historial } = ticketEn('nueva').enviarARevision(ctx);

      expect(ticket.estado).toBe('en_revision');
      expect(historial).toEqual({
        ticketId: 1,
        estadoAnterior: 'nueva',
        estadoNuevo: 'en_revision',
        usuarioId: 7,
        motivo: null,
        creadoEn: ctx.ahora,
      });
    });

    it.each(otrosEstados('nueva'))('desde %s lanza InvalidTransitionError', (estado) => {
      esperarTransicionInvalida(() => ticketEn(estado).enviarARevision(ctx), estado, 'en_revision');
    });

    it('con actor null (sistema) deja usuarioId null', () => {
      const { historial } = ticketEn('nueva').enviarARevision({ ...ctx, actorId: null });
      expect(historial.usuarioId).toBeNull();
    });
  });

  describe('rechazar', () => {
    it('pasa a rechazada con el motivo recortado y sin fijar cerradoEn', () => {
      const { ticket, historial } = ticketEn('en_revision').rechazar(ctx, '  Duplicada de Q-2026-000002  ');

      expect(ticket.estado).toBe('rechazada');
      expect(ticket.cerradoEn).toBeNull();
      expect(historial).toMatchObject({
        estadoAnterior: 'en_revision',
        estadoNuevo: 'rechazada',
        motivo: 'Duplicada de Q-2026-000002',
      });
    });

    it.each(['', '   '])('con motivo %j lanza MOTIVO_REQUERIDO', (motivo) => {
      esperarRegla(() => ticketEn('en_revision').rechazar(ctx, motivo), 'MOTIVO_REQUERIDO');
    });

    it.each(otrosEstados('en_revision'))('desde %s lanza InvalidTransitionError', (estado) => {
      esperarTransicionInvalida(() => ticketEn(estado).rechazar(ctx, 'motivo'), estado, 'rechazada');
    });

    it('valida el estado antes que el motivo', () => {
      esperarTransicionInvalida(() => ticketEn('nueva').rechazar(ctx, ''), 'nueva', 'rechazada');
    });
  });

  describe('asignar', () => {
    it('pasa a asignada y fija dependencia y prioridad', () => {
      const { ticket, historial } = ticketEn('en_revision').asignar(ctx, 4, 'urgente');

      expect(ticket.estado).toBe('asignada');
      expect(ticket.dependenciaId).toBe(4);
      expect(ticket.prioridad).toBe('urgente');
      expect(historial).toMatchObject({ estadoAnterior: 'en_revision', estadoNuevo: 'asignada', motivo: null });
    });

    it('con nota la guarda recortada como motivo del historial (SPEC 19)', () => {
      const { historial } = ticketEn('en_revision').asignar(ctx, 4, 'media', '  Categoría: Baches → Alumbrado ');

      expect(historial.motivo).toBe('Categoría: Baches → Alumbrado');
    });

    it.each([undefined, '', '   '])('con la nota %p el motivo es null', (nota) => {
      expect(ticketEn('en_revision').asignar(ctx, 4, 'media', nota).historial.motivo).toBeNull();
    });

    it.each([0, -1, 1.5, Number.NaN])('con dependenciaId %p lanza DEPENDENCIA_INVALIDA', (dependenciaId) => {
      esperarRegla(() => ticketEn('en_revision').asignar(ctx, dependenciaId, 'media'), 'DEPENDENCIA_INVALIDA');
    });

    it('con prioridad critica lanza PRIORIDAD_INVALIDA', () => {
      esperarRegla(() => ticketEn('en_revision').asignar(ctx, 4, 'critica' as Prioridad), 'PRIORIDAD_INVALIDA');
    });

    it.each(otrosEstados('en_revision'))('desde %s lanza InvalidTransitionError', (estado) => {
      esperarTransicionInvalida(() => ticketEn(estado).asignar(ctx, 4, 'media'), estado, 'asignada');
    });
  });

  describe('iniciar', () => {
    it('pasa de asignada a en_proceso con técnico asignado', () => {
      const { ticket, historial } = ticketEn('asignada', { asignadoA: 9 }).iniciar(ctx);

      expect(ticket.estado).toBe('en_proceso');
      expect(ticket.asignadoA).toBe(9);
      expect(historial).toMatchObject({ estadoAnterior: 'asignada', estadoNuevo: 'en_proceso', motivo: null });
    });

    it('sin técnico asignado lanza TECNICO_REQUERIDO', () => {
      esperarRegla(() => ticketEn('asignada').iniciar(ctx), 'TECNICO_REQUERIDO');
    });

    it.each(otrosEstados('asignada'))('desde %s lanza InvalidTransitionError', (estado) => {
      esperarTransicionInvalida(() => ticketEn(estado, { asignadoA: 9 }).iniciar(ctx), estado, 'en_proceso');
    });
  });

  describe('asignarTecnico', () => {
    it.each<EstadoTicket>(['asignada', 'en_proceso'])('en %s fija asignadoA sin cambiar de estado', (estado) => {
      const original = ticketEn(estado, { asignadoA: 9 });
      const ticket = original.asignarTecnico(12);

      expect(ticket).toBeInstanceOf(Ticket);
      expect(ticket.estado).toBe(estado);
      expect(ticket.asignadoA).toBe(12);
      expect(original.asignadoA).toBe(9);
      expect(Object.isFrozen(ticket)).toBe(true);
    });

    it.each([0, -3, 2.5])('con tecnicoId %p lanza TECNICO_INVALIDO', (tecnicoId) => {
      esperarRegla(() => ticketEn('asignada').asignarTecnico(tecnicoId), 'TECNICO_INVALIDO');
    });

    it.each(otrosEstados('asignada', 'en_proceso'))('en %s lanza OPERACION_NO_PERMITIDA', (estado) => {
      esperarRegla(() => ticketEn(estado).asignarTecnico(12), 'OPERACION_NO_PERMITIDA');
    });
  });

  describe('ponerEnEspera', () => {
    it('pasa de en_proceso a en_espera con el motivo recortado', () => {
      const { ticket, historial } = ticketEn('en_proceso').ponerEnEspera(ctx, ' Falta el número de contador ');

      expect(ticket.estado).toBe('en_espera');
      expect(historial).toMatchObject({
        estadoAnterior: 'en_proceso',
        estadoNuevo: 'en_espera',
        motivo: 'Falta el número de contador',
      });
    });

    it.each(['', '   '])('con motivo %j lanza MOTIVO_REQUERIDO', (motivo) => {
      esperarRegla(() => ticketEn('en_proceso').ponerEnEspera(ctx, motivo), 'MOTIVO_REQUERIDO');
    });

    it.each(otrosEstados('en_proceso'))('desde %s lanza InvalidTransitionError', (estado) => {
      esperarTransicionInvalida(() => ticketEn(estado).ponerEnEspera(ctx, 'motivo'), estado, 'en_espera');
    });
  });

  describe('reanudar', () => {
    it('pasa de en_espera a en_proceso', () => {
      const { ticket, historial } = ticketEn('en_espera').reanudar(ctx);

      expect(ticket.estado).toBe('en_proceso');
      expect(historial).toMatchObject({ estadoAnterior: 'en_espera', estadoNuevo: 'en_proceso', motivo: null });
    });

    it('sobre resuelta lanza InvalidTransitionError aunque resuelta → en_proceso esté en la tabla', () => {
      esperarTransicionInvalida(() => ticketEn('resuelta').reanudar(ctx), 'resuelta', 'en_proceso');
    });

    it.each(otrosEstados('en_espera'))('desde %s lanza InvalidTransitionError', (estado) => {
      esperarTransicionInvalida(() => ticketEn(estado).reanudar(ctx), estado, 'en_proceso');
    });
  });

  describe('trasladar', () => {
    it.each<EstadoTicket>(['asignada', 'en_proceso'])(
      'desde %s vuelve a en_revision y limpia dependencia y técnico',
      (estado) => {
        const { ticket, historial } = ticketEn(estado, { dependenciaId: 4, asignadoA: 9, prioridad: 'alta' }).trasladar(
          ctx,
          ' Corresponde a Alumbrado ',
        );

        expect(ticket.estado).toBe('en_revision');
        expect(ticket.dependenciaId).toBeNull();
        expect(ticket.asignadoA).toBeNull();
        expect(ticket.prioridad).toBe('alta');
        expect(historial).toMatchObject({
          estadoAnterior: estado,
          estadoNuevo: 'en_revision',
          motivo: 'Corresponde a Alumbrado',
        });
      },
    );

    it.each(['', '   '])('con motivo %j lanza MOTIVO_REQUERIDO', (motivo) => {
      esperarRegla(() => ticketEn('asignada').trasladar(ctx, motivo), 'MOTIVO_REQUERIDO');
    });

    it.each(otrosEstados('asignada', 'en_proceso'))('desde %s lanza InvalidTransitionError', (estado) => {
      esperarTransicionInvalida(() => ticketEn(estado).trasladar(ctx, 'motivo'), estado, 'en_revision');
    });
  });

  describe('resolver', () => {
    const venceConfirmacion = new Date('2026-10-30T05:59:59.999Z');

    it('pasa a resuelta, fija resueltoEn y guarda la descripción recortada como motivo', () => {
      const { ticket, historial } = ticketEn('en_proceso', { asignadoA: 9 }).resolver(
        ctx,
        '  Se cambió la lámpara  ',
        venceConfirmacion,
      );

      expect(ticket.estado).toBe('resuelta');
      expect(ticket.resueltoEn).toEqual(ctx.ahora);
      expect(historial).toMatchObject({
        estadoAnterior: 'en_proceso',
        estadoNuevo: 'resuelta',
        motivo: 'Se cambió la lámpara',
      });
    });

    it('deja resolucion con la descripción recortada y resueltoPor con el actor (SPEC 26)', () => {
      const { ticket, historial } = ticketEn('en_proceso', { asignadoA: 9 }).resolver(
        ctx,
        '  Se cambió la lámpara\nY el poste  ',
        venceConfirmacion,
      );

      expect(ticket.resolucion).toBe('Se cambió la lámpara\nY el poste');
      expect(ticket.resueltoPor).toBe(ctx.actorId);
      expect(historial.motivo).toBe(ticket.resolucion);
    });

    it('fija confirmacionVenceEn con el plazo recibido (SPEC 27)', () => {
      const { ticket } = ticketEn('en_proceso', { asignadoA: 9 }).resolver(ctx, 'hecho', venceConfirmacion);

      expect(ticket.confirmacionVenceEn).toEqual(venceConfirmacion);
    });

    it.each(['', '   '])('con descripción %j lanza DESCRIPCION_REQUERIDA', (descripcion) => {
      esperarRegla(() => ticketEn('en_proceso').resolver(ctx, descripcion, venceConfirmacion), 'DESCRIPCION_REQUERIDA');
    });

    it.each(otrosEstados('en_proceso'))('desde %s lanza InvalidTransitionError', (estado) => {
      esperarTransicionInvalida(() => ticketEn(estado).resolver(ctx, 'hecho', venceConfirmacion), estado, 'resuelta');
    });
  });

  describe('plazo de confirmación', () => {
    const vence = new Date('2026-10-29T15:00:00.000Z');
    const enElLimite: ContextoTransicion = { actorId: 7, ahora: new Date(vence.getTime()) };
    const despues: ContextoTransicion = { actorId: 7, ahora: new Date(vence.getTime() + 1) };
    const sistema = (c: ContextoTransicion): ContextoTransicion => ({ ...c, actorId: null });
    const resuelta = () =>
      ticketEn('resuelta', {
        dependenciaId: 4,
        asignadoA: 9,
        prioridad: 'media',
        escalado: true,
        resueltoEn: new Date('2026-10-22T10:00:00.000Z'),
        resolucion: 'Se cambió la lámpara',
        resueltoPor: 9,
        confirmacionVenceEn: vence,
      });

    describe('confirmarSolucion', () => {
      it('con motivo lo deja recortado en el historial (SPEC 27)', () => {
        const { historial } = resuelta().confirmarSolucion(enElLimite, vence, '  El vecino confirmó por teléfono  ');

        expect(historial.motivo).toBe('El vecino confirmó por teléfono');
      });

      it.each([undefined, '', '   '])('con motivo %j deja null en el historial', (motivo) => {
        expect(resuelta().confirmarSolucion(enElLimite, vence, motivo).historial.motivo).toBeNull();
      });

      it('en el límite exacto cierra y fija cerradoEn', () => {
        const { ticket, historial } = resuelta().confirmarSolucion(enElLimite, vence);

        expect(ticket.estado).toBe('cerrada');
        expect(ticket.cerradoEn).toEqual(enElLimite.ahora);
        // La resolución se mantiene al cerrar (SPEC 26).
        expect(ticket.resolucion).toBe('Se cambió la lámpara');
        expect(ticket.resueltoPor).toBe(9);
        expect(historial).toMatchObject({
          estadoAnterior: 'resuelta',
          estadoNuevo: 'cerrada',
          usuarioId: 7,
          motivo: null,
        });
      });

      it('1 ms después del límite lanza PLAZO_CONFIRMACION_VENCIDO', () => {
        esperarRegla(() => resuelta().confirmarSolucion(despues, vence), 'PLAZO_CONFIRMACION_VENCIDO');
      });

      it('sin actor lanza ACTOR_REQUERIDO', () => {
        esperarRegla(() => resuelta().confirmarSolucion(sistema(enElLimite), vence), 'ACTOR_REQUERIDO');
      });

      it.each(otrosEstados('resuelta'))('desde %s lanza InvalidTransitionError', (estado) => {
        esperarTransicionInvalida(() => ticketEn(estado).confirmarSolucion(enElLimite, vence), estado, 'cerrada');
      });
    });

    describe('cerrarPorVencimiento', () => {
      it('1 ms después del límite, el sistema cierra y fija cerradoEn', () => {
        const { ticket, historial } = resuelta().cerrarPorVencimiento(sistema(despues), vence);

        expect(ticket.estado).toBe('cerrada');
        expect(ticket.cerradoEn).toEqual(despues.ahora);
        expect(historial).toMatchObject({ estadoAnterior: 'resuelta', estadoNuevo: 'cerrada', usuarioId: null });
      });

      it('en el límite exacto lanza PLAZO_CONFIRMACION_VIGENTE', () => {
        esperarRegla(() => resuelta().cerrarPorVencimiento(sistema(enElLimite), vence), 'PLAZO_CONFIRMACION_VIGENTE');
      });

      it('con actor lanza SOLO_SISTEMA', () => {
        esperarRegla(() => resuelta().cerrarPorVencimiento(despues, vence), 'SOLO_SISTEMA');
      });

      it.each(otrosEstados('resuelta'))('desde %s lanza InvalidTransitionError', (estado) => {
        esperarTransicionInvalida(
          () => ticketEn(estado).cerrarPorVencimiento(sistema(despues), vence),
          estado,
          'cerrada',
        );
      });
    });

    describe('reabrir', () => {
      const MAX = 2;

      it('en el límite exacto vuelve a en_proceso, conserva el técnico y limpia resueltoEn y escalado', () => {
        const { ticket, historial } = resuelta().reabrir(enElLimite, ' Sigue sin luz ', vence, MAX);

        expect(ticket.estado).toBe('en_proceso');
        expect(ticket.asignadoA).toBe(9);
        expect(ticket.dependenciaId).toBe(4);
        expect(ticket.resueltoEn).toBeNull();
        expect(ticket.resolucion).toBeNull();
        expect(ticket.resueltoPor).toBeNull();
        expect(ticket.escalado).toBe(false);
        expect(historial).toMatchObject({
          estadoAnterior: 'resuelta',
          estadoNuevo: 'en_proceso',
          motivo: 'Sigue sin luz',
        });
      });

      it('suma 1 a reaperturas y limpia confirmacionVenceEn (SPEC 27)', () => {
        const { ticket } = resuelta().reabrir(enElLimite, 'Sigue sin luz', vence, MAX);

        expect(ticket.reaperturas).toBe(1);
        expect(ticket.confirmacionVenceEn).toBeNull();
      });

      it('con reaperturas = maxReaperturas lanza LIMITE_REAPERTURAS', () => {
        const enElTope = ticketEn('resuelta', { reaperturas: MAX, confirmacionVenceEn: vence });

        esperarRegla(() => enElTope.reabrir(enElLimite, 'Sigue sin luz', vence, MAX), 'LIMITE_REAPERTURAS');
      });

      it('con maxReaperturas = 0 nunca se puede reabrir', () => {
        esperarRegla(() => resuelta().reabrir(enElLimite, 'Sigue sin luz', vence, 0), 'LIMITE_REAPERTURAS');
      });

      it('con el plazo vencido lanza PLAZO_CONFIRMACION_VENCIDO aunque también esté en el límite', () => {
        const enElTope = ticketEn('resuelta', { reaperturas: MAX, confirmacionVenceEn: vence });

        esperarRegla(() => enElTope.reabrir(despues, 'Sigue sin luz', vence, MAX), 'PLAZO_CONFIRMACION_VENCIDO');
      });

      it('1 ms después del límite lanza PLAZO_CONFIRMACION_VENCIDO', () => {
        esperarRegla(() => resuelta().reabrir(despues, 'Sigue sin luz', vence, MAX), 'PLAZO_CONFIRMACION_VENCIDO');
      });

      it.each(['', '   '])('con motivo %j lanza MOTIVO_REQUERIDO', (motivo) => {
        esperarRegla(() => resuelta().reabrir(enElLimite, motivo, vence, MAX), 'MOTIVO_REQUERIDO');
      });

      it.each(otrosEstados('resuelta'))('desde %s lanza InvalidTransitionError', (estado) => {
        const enElTope = ticketEn(estado, { reaperturas: MAX });

        esperarTransicionInvalida(() => enElTope.reabrir(enElLimite, 'motivo', vence, MAX), estado, 'en_proceso');
      });
    });
  });

  describe('marcarEscalado', () => {
    it.each(otrosEstados('rechazada', 'cerrada'))('en %s marca escalado sin cambiar de estado', (estado) => {
      const original = ticketEn(estado);
      const ticket = original.marcarEscalado();

      expect(ticket.escalado).toBe(true);
      expect(ticket.estado).toBe(estado);
      expect(original.escalado).toBe(false);
    });

    it('es idempotente', () => {
      const ticket = ticketEn('en_proceso').marcarEscalado().marcarEscalado();
      expect(ticket.escalado).toBe(true);
    });

    it.each<EstadoTicket>(['rechazada', 'cerrada'])('en %s lanza OPERACION_NO_PERMITIDA', (estado) => {
      esperarRegla(() => ticketEn(estado).marcarEscalado(), 'OPERACION_NO_PERMITIDA');
    });
  });

  describe('inmutabilidad', () => {
    it('el ticket original conserva todos sus valores y el nuevo también está congelado', () => {
      const original = ticketEn('en_revision');
      const antes = { ...BASE, estado: 'en_revision' };

      const { ticket } = original.asignar(ctx, 4, 'alta');

      expect(original).toMatchObject(antes);
      expect(ticket).not.toBe(original);
      expect(Object.isFrozen(original)).toBe(true);
      expect(Object.isFrozen(ticket)).toBe(true);
    });

    it('no permite asignar propiedades', () => {
      const ticket = ticketEn('nueva');
      expect(() => {
        (ticket as unknown as { estado: string }).estado = 'cerrada';
      }).toThrow(TypeError);
      expect(ticket.estado).toBe('nueva');
    });
  });
});
