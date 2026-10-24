import { slaNulo, slaVacio } from '../../support/sla-vacio';
import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { ConfirmacionService } from '../../../src/application/services/confirmacion.service';
import { EnvioCorreo } from '../../../src/application/services/envio-correo';
import type { Alcance } from '../../../src/domain/auth/permisos';
import type { FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import { InvalidTransitionError } from '../../../src/domain/errors/invalid-transition-error';
import type {
  TicketEscrituraRepository,
  TicketParaTransicion,
} from '../../../src/domain/repositories/ticket-escritura-repository';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { type ResultadoTransicion, Ticket, type TicketProps } from '../../../src/domain/ticket/ticket';
import {
  correosPendientes,
  EnviadorEnMemoria,
  PlantillasEnMemoria,
  RelojFalso,
  TransaccionEnMemoria,
} from '../auth/dobles';

const AHORA = new Date('2026-11-05T15:00:00.000Z');
const VENCE = new Date('2026-11-10T05:59:59.999Z');

const VECINO: UsuarioAutenticado = {
  id: 7,
  nombre: 'Ana Vecina',
  rol: 'vecino',
  dependenciaId: null,
  permisos: { 'tickets.ver': 'propia', 'tickets.cambiar_estado': 'propia' },
};

const COORDINADOR: UsuarioAutenticado = {
  id: 40,
  nombre: 'Coordinadora',
  rol: 'coordinador',
  dependenciaId: 4,
  permisos: { 'tickets.ver': 'dependencia', 'tickets.cambiar_estado': 'dependencia' },
};

class TicketsEnMemoria implements Pick<TicketEscrituraRepository, 'obtenerParaActualizar' | 'guardarTransicion'> {
  readonly tickets = new Map<number, Ticket>();
  readonly guardadas: ResultadoTransicion[] = [];
  readonly filtros: FiltroTickets[] = [];
  email: string | null = 'ana@correo.gt';

  agregar(id: number, estado: EstadoTicket, cambios: Partial<TicketProps> = {}): void {
    this.tickets.set(
      id,
      Ticket.reconstituir({
        id,
        numero: `Q-2026-${String(id).padStart(6, '0')}`,
        estado,
        dependenciaId: 4,
        asignadoA: 30,
        prioridad: 'media',
        escalado: false,
        resueltoEn: estado === 'resuelta' ? new Date('2026-11-02T15:00:00.000Z') : null,
        cerradoEn: null,
        resolucion: estado === 'resuelta' ? 'Se rellenó el bache' : null,
        resueltoPor: estado === 'resuelta' ? 30 : null,
        confirmacionVenceEn: estado === 'resuelta' ? VENCE : null,
        reaperturas: 0,
        escaladoEn: null,
        escaladoPor: null,
        ...cambios,
      }),
    );
  }

  async obtenerParaActualizar(id: number, filtro: FiltroTickets): Promise<TicketParaTransicion | null> {
    this.filtros.push(filtro);
    const ticket = this.tickets.get(id);
    if (!ticket || filtro === null) {
      return null;
    }
    return {
      ticket,
      titulo: 'Bache frente a la escuela',
      categoria: { id: 1, nombre: 'Baches' },
      solicitante: { id: 7, nombre: 'Ana Vecina', email: this.email }, sla: slaVacio(), zonaId: 1,
    };
  }

  async guardarTransicion(resultado: ResultadoTransicion): Promise<void> {
    this.guardadas.push(resultado);
    this.tickets.set(resultado.ticket.id, resultado.ticket);
  }
}

function plantillas(): PlantillasEnMemoria {
  const repo = new PlantillasEnMemoria();
  for (const [clave, texto] of [
    ['queja_cerrada', '{{nombre}} {{numero}} {{titulo}} {{enlace}}'],
    ['queja_reabierta', '{{nombre}} {{numero}} {{titulo}} motivo: {{motivo}} {{enlace}}'],
  ]) {
    repo.plantillas.set(clave, { clave, asunto: clave, cuerpoTexto: texto, cuerpoHtml: `<p>${texto}</p>` });
  }
  return repo;
}

function armar({ maxReaperturas = 2, ahora = AHORA }: { maxReaperturas?: number; ahora?: Date } = {}) {
  const tickets = new TicketsEnMemoria();
  const enviador = new EnviadorEnMemoria();
  const errores: string[] = [];
  const servicio = new ConfirmacionService(
    new TransaccionEnMemoria({ ticketsEscritura: tickets as unknown as TicketEscrituraRepository }),
    { maxReaperturas: async () => maxReaperturas },
    new EnvioCorreo(plantillas(), enviador, (mensaje) => errores.push(mensaje)),
    new RelojFalso(ahora),
    'https://vozmuni.test',
    slaNulo,
  );
  return { tickets, enviador, errores, servicio };
}

function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => {
      throw new Error('se esperaba una excepción');
    },
    (error: unknown) => error,
  );
}

const alcanceDe = (usuario: UsuarioAutenticado) => usuario.permisos['tickets.cambiar_estado'] as Alcance;

describe('ConfirmacionService', () => {
  it('el vecino confirma sin motivo: cerrada, cerradoEn, historial sin motivo y correo queja_cerrada', async () => {
    const { tickets, enviador, servicio } = armar();
    tickets.agregar(1, 'resuelta');

    const respuesta = await servicio.transicionar(VECINO, alcanceDe(VECINO), 1, { accion: 'confirmar' });
    await correosPendientes();

    expect(respuesta).toEqual({
      id: 1,
      numero: 'Q-2026-000001',
      estado: 'cerrada',
      asignadoA: 30,
      resueltoEn: '2026-11-02T15:00:00.000Z',
      cerradoEn: AHORA.toISOString(),
      reaperturas: 0,
    });
    expect(tickets.guardadas[0].historial).toMatchObject({ estadoAnterior: 'resuelta', estadoNuevo: 'cerrada', usuarioId: 7, motivo: null });
    expect(tickets.filtros).toEqual([[{ campo: 'solicitanteId', valor: 7 }, { campo: 'solicitanteId', valor: 7 }]]);
    expect(enviador.enviados).toHaveLength(1);
    expect(enviador.enviados[0]).toMatchObject({ para: 'ana@correo.gt', asunto: 'queja_cerrada' });
    expect(enviador.enviados[0].texto).toBe(
      'Ana Vecina Q-2026-000001 Bache frente a la escuela https://vozmuni.test/consulta?numero=Q-2026-000001',
    );
  });

  it('el vecino reabre: en_proceso, mismo técnico, una reapertura, sin plazo ni resolución, y correo con el motivo', async () => {
    const { tickets, enviador, servicio } = armar();
    tickets.agregar(1, 'resuelta');

    const respuesta = await servicio.transicionar(VECINO, alcanceDe(VECINO), 1, {
      accion: 'reabrir',
      motivo: '  Sigue saliendo agua  ',
    });
    await correosPendientes();

    expect(respuesta).toMatchObject({ estado: 'en_proceso', asignadoA: 30, resueltoEn: null, reaperturas: 1 });
    const guardado = tickets.guardadas[0].ticket;
    expect(guardado.confirmacionVenceEn).toBeNull();
    expect(guardado.resolucion).toBeNull();
    expect(tickets.guardadas[0].historial.motivo).toBe('Sigue saliendo agua');
    expect(enviador.enviados[0]).toMatchObject({ asunto: 'queja_reabierta' });
    expect(enviador.enviados[0].texto).toContain('motivo: Sigue saliendo agua');
  });

  it.each([undefined, '', '   '])('un interno que confirma con motivo %j recibe MOTIVO_REQUERIDO sin tocar la queja', async (motivo) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'resuelta');

    const error = await capturar(
      servicio.transicionar(COORDINADOR, alcanceDe(COORDINADOR), 1, { accion: 'confirmar', motivo }),
    );

    expect(error).toMatchObject({ name: 'ErrorDeAplicacion', codigo: 'MOTIVO_REQUERIDO' });
    expect(tickets.filtros).toEqual([]);
  });

  it('un interno confirma con motivo y queda en el historial', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'resuelta');

    await servicio.transicionar(COORDINADOR, alcanceDe(COORDINADOR), 1, {
      accion: 'confirmar',
      motivo: ' El vecino confirmó por teléfono ',
    });

    expect(tickets.guardadas[0].historial).toMatchObject({ usuarioId: 40, motivo: 'El vecino confirmó por teléfono' });
  });

  it('confirmar una queja en en_proceso lanza InvalidTransitionError antes de revisar el plazo', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    expect(await capturar(servicio.transicionar(VECINO, 'propia', 1, { accion: 'confirmar' }))).toBeInstanceOf(
      InvalidTransitionError,
    );
  });

  it('sin vencimiento guardado → PLAZO_NO_DEFINIDO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'resuelta', { confirmacionVenceEn: null });

    expect(await capturar(servicio.transicionar(VECINO, 'propia', 1, { accion: 'confirmar' }))).toMatchObject({
      codigo: 'PLAZO_NO_DEFINIDO',
    });
  });

  it('con el plazo vencido → ErrorDeAplicacion PLAZO_CONFIRMACION_VENCIDO', async () => {
    const { tickets, servicio } = armar({ ahora: new Date(VENCE.getTime() + 1) });
    tickets.agregar(1, 'resuelta');

    expect(await capturar(servicio.transicionar(VECINO, 'propia', 1, { accion: 'reabrir', motivo: 'x' }))).toMatchObject({
      name: 'ErrorDeAplicacion',
      codigo: 'PLAZO_CONFIRMACION_VENCIDO',
    });
    expect(tickets.guardadas).toEqual([]);
  });

  it('en el instante exacto del vencimiento todavía se puede confirmar', async () => {
    const { tickets, servicio } = armar({ ahora: VENCE });
    tickets.agregar(1, 'resuelta');

    expect((await servicio.transicionar(VECINO, 'propia', 1, { accion: 'confirmar' })).estado).toBe('cerrada');
  });

  it('en el límite de reaperturas → ErrorDeAplicacion LIMITE_REAPERTURAS', async () => {
    const { tickets, servicio } = armar({ maxReaperturas: 2 });
    tickets.agregar(1, 'resuelta', { reaperturas: 2 });

    expect(await capturar(servicio.transicionar(VECINO, 'propia', 1, { accion: 'reabrir', motivo: 'x' }))).toMatchObject({
      name: 'ErrorDeAplicacion',
      codigo: 'LIMITE_REAPERTURAS',
    });
  });

  it('un ticket fuera de alcance → NO_ENCONTRADO', async () => {
    const { servicio } = armar();

    expect(await capturar(servicio.transicionar(VECINO, 'propia', 99, { accion: 'confirmar' }))).toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
  });

  it('un fallo del envío no cambia la respuesta y queda en el log', async () => {
    const { tickets, enviador, errores, servicio } = armar();
    enviador.fallar = true;
    tickets.agregar(1, 'resuelta');

    const respuesta = await servicio.transicionar(VECINO, 'propia', 1, { accion: 'confirmar' });
    await correosPendientes();

    expect(respuesta.estado).toBe('cerrada');
    expect(errores).toEqual([expect.stringContaining('queja_cerrada al usuario_id 7')]);
  });

  it('un solicitante sin correo no recibe nada', async () => {
    const { tickets, enviador, servicio } = armar();
    tickets.email = null;
    tickets.agregar(1, 'resuelta');

    await servicio.transicionar(VECINO, 'propia', 1, { accion: 'confirmar' });
    await correosPendientes();

    expect(enviador.enviados).toEqual([]);
  });
});
