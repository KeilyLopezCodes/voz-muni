import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { AtencionService } from '../../../src/application/services/atencion.service';
import type { FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import { InvalidTransitionError } from '../../../src/domain/errors/invalid-transition-error';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import type {
  AtencionLecturaRepository,
  EstadoAtencion,
} from '../../../src/domain/repositories/atencion-lectura-repository';
import type {
  TicketEscrituraRepository,
  TicketParaTransicion,
} from '../../../src/domain/repositories/ticket-escritura-repository';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { type ResultadoTransicion, Ticket } from '../../../src/domain/ticket/ticket';
import { correosPendientes, EnviadorEnMemoria, PlantillasEnMemoria, RelojFalso, TransaccionEnMemoria } from '../auth/dobles';
import { SLA_VACIO, SlaNulo } from '../sla/dobles-sla';
import { notificadorDePrueba } from '../notificaciones/dobles-correo';

const AHORA = new Date('2026-10-23T15:00:00.000Z');
const VENCE_CONFIRMACION = new Date('2026-10-31T05:59:59.999Z');

const TECNICO: UsuarioAutenticado = {
  id: 30,
  nombre: 'Luis Técnico',
  rol: 'tecnico',
  dependenciaId: 4,
  permisos: { 'tickets.ver': 'asignadas', 'tickets.cambiar_estado': 'asignadas' },
};

class TicketsEnMemoria implements Pick<TicketEscrituraRepository, 'obtenerParaActualizar' | 'guardarTransicion'> {
  readonly tickets = new Map<number, Ticket>();
  readonly guardadas: ResultadoTransicion[] = [];
  readonly filtros: FiltroTickets[] = [];
  email: string | null = null;

  agregar(id: number, estado: EstadoTicket, asignadoA: number | null = 30): void {
    this.tickets.set(
      id,
      Ticket.reconstituir({
        id,
        numero: `Q-2026-${String(id).padStart(6, '0')}`,
        estado,
        dependenciaId: 4,
        asignadoA,
        prioridad: 'media',
        escalado: false,
        escaladoEn: null,
        escaladoPor: null,
        resueltoEn: null,
        cerradoEn: null,
        resolucion: null,
        resueltoPor: null,
        confirmacionVenceEn: null,
        reaperturas: 0,
      }),
    );
  }

  async obtenerParaActualizar(id: number, filtro: FiltroTickets): Promise<TicketParaTransicion | null> {
    this.filtros.push(filtro);
    const ticket = this.tickets.get(id);
    if (!ticket || filtro === null || filtro.some((c) => c.campo === 'asignadoA' && c.valor !== ticket.asignadoA)) {
      return null;
    }
    return { ticket, titulo: 'Bache', categoria: { id: 1, nombre: 'Baches' }, solicitante: { id: 7, nombre: 'Ana', email: this.email }, sla: SLA_VACIO };
  }

  async guardarTransicion(resultado: ResultadoTransicion): Promise<void> {
    this.guardadas.push(resultado);
    this.tickets.set(resultado.ticket.id, resultado.ticket);
  }
}

class BandejaFalsa implements AtencionLecturaRepository {
  readonly llamadas: { filtro: FiltroTickets; estados: readonly EstadoAtencion[] }[] = [];

  async listar(filtro: FiltroTickets, estados: readonly EstadoAtencion[], pagina: number, tamano: number) {
    this.llamadas.push({ filtro, estados });
    return { datos: [], pagina, tamano, total: 0 };
  }
}

// El cálculo real del plazo (calendario y parámetros) se prueba en la base; aquí solo importa qué recibe.
function armar(vencimiento: (ahora: Date) => Promise<Date> = async () => VENCE_CONFIRMACION) {
  const tickets = new TicketsEnMemoria();
  const bandeja = new BandejaFalsa();
  const pedidos: Date[] = [];
  const plantillas = new PlantillasEnMemoria();
  plantillas.plantillas.set('queja_resuelta', {
    clave: 'queja_resuelta',
    asunto: 'Resuelta {{numero}}',
    cuerpoTexto: '{{nombre}} {{titulo}} {{solucion}} hasta {{fecha_limite}} en {{enlace}}',
    cuerpoHtml: '<p>{{solucion}}</p><a href="{{enlace}}">{{fecha_limite}}</a>',
  });
  const enviador = new EnviadorEnMemoria();
  const errores: string[] = [];
  const servicio = new AtencionService(
    new TransaccionEnMemoria({ ticketsEscritura: tickets as unknown as TicketEscrituraRepository }),
    bandeja,
    new RelojFalso(AHORA),
    (ahora) => {
      pedidos.push(ahora);
      return vencimiento(ahora);
    },
    new SlaNulo(),
    notificadorDePrueba(plantillas, enviador, (mensaje) => errores.push(mensaje)),
    'https://vozmuni.test',
  );
  return { tickets, bandeja, servicio, pedidos, enviador, errores };
}

function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => {
      throw new Error('se esperaba una excepción');
    },
    (error: unknown) => error,
  );
}

describe('AtencionService', () => {
  it('iniciar con técnico pasa a en_proceso y escribe el historial del técnico', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada');

    const respuesta = await servicio.transicionar(TECNICO, 1, { accion: 'iniciar' });

    expect(respuesta).toEqual({ id: 1, numero: 'Q-2026-000001', estado: 'en_proceso', asignadoA: 30, resueltoEn: null });
    expect(tickets.guardadas[0].historial).toMatchObject({
      estadoAnterior: 'asignada',
      estadoNuevo: 'en_proceso',
      usuarioId: 30,
      motivo: null,
      creadoEn: AHORA,
    });
    expect(tickets.filtros).toEqual([[{ campo: 'asignadoA', valor: 30 }, { campo: 'asignadoA', valor: 30 }]]);
  });

  it('iniciar sin técnico lanza TECNICO_REQUERIDO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada', null);
    const supervisor: UsuarioAutenticado = {
      ...TECNICO,
      id: 50,
      rol: 'supervisor',
      permisos: { 'tickets.ver': 'todas', 'tickets.cambiar_estado': 'todas' },
    };

    const error = await capturar(servicio.transicionar(supervisor, 1, { accion: 'iniciar' }));

    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    expect(error).toMatchObject({ codigo: 'TECNICO_REQUERIDO' });
  });

  it.each(['', '   '])('poner_en_espera con el motivo %p lanza MOTIVO_REQUERIDO', async (motivo) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    expect(await capturar(servicio.transicionar(TECNICO, 1, { accion: 'poner_en_espera', motivo }))).toMatchObject({
      codigo: 'MOTIVO_REQUERIDO',
    });
  });

  it('poner_en_espera guarda el motivo recortado y reanudar vuelve a en_proceso', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    const espera = await servicio.transicionar(TECNICO, 1, { accion: 'poner_en_espera', motivo: '  Foto del poste  ' });
    expect(espera.estado).toBe('en_espera');
    expect(tickets.guardadas[0].historial.motivo).toBe('Foto del poste');

    expect((await servicio.transicionar(TECNICO, 1, { accion: 'reanudar' })).estado).toBe('en_proceso');
  });

  it.each(['', '   '])('resolver con la descripción %p lanza DESCRIPCION_REQUERIDA', async (descripcion) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    expect(await capturar(servicio.transicionar(TECNICO, 1, { accion: 'resolver', descripcion }))).toMatchObject({
      codigo: 'DESCRIPCION_REQUERIDA',
    });
  });

  it('resolver fija resueltoEn y guarda la descripción recortada en el historial', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_proceso');

    const respuesta = await servicio.transicionar(TECNICO, 1, { accion: 'resolver', descripcion: ' Se cambió la lámpara ' });

    expect(respuesta).toMatchObject({ estado: 'resuelta', resueltoEn: AHORA.toISOString() });
    expect(tickets.guardadas[0].historial).toMatchObject({ estadoNuevo: 'resuelta', motivo: 'Se cambió la lámpara' });
  });

  it('resolver guarda el plazo de confirmación calculado para el momento de la resolución (SPEC 27)', async () => {
    const { tickets, servicio, pedidos } = armar();
    tickets.agregar(1, 'en_proceso');

    await servicio.transicionar(TECNICO, 1, { accion: 'resolver', descripcion: 'Hecho' });

    expect(pedidos).toEqual([AHORA]);
    expect(tickets.guardadas[0].ticket.confirmacionVenceEn).toEqual(VENCE_CONFIRMACION);
  });

  it('si el plazo no se puede calcular, resolver lanza el error y no guarda nada', async () => {
    const { tickets, servicio } = armar(async () => {
      throw new ReglaDeNegocioError('CALENDARIO_INCOMPLETO', 'Sin calendario');
    });
    tickets.agregar(1, 'en_proceso');

    expect(await capturar(servicio.transicionar(TECNICO, 1, { accion: 'resolver', descripcion: 'Hecho' }))).toMatchObject({
      codigo: 'CALENDARIO_INCOMPLETO',
    });
    expect(tickets.guardadas).toEqual([]);
    expect(tickets.tickets.get(1)!.estado).toBe('en_proceso');
  });

  it('las demás acciones no piden el plazo', async () => {
    const { tickets, servicio, pedidos } = armar();
    tickets.agregar(1, 'asignada');

    await servicio.transicionar(TECNICO, 1, { accion: 'iniciar' });

    expect(pedidos).toEqual([]);
  });

  it.each<[EstadoTicket, Parameters<AtencionService['transicionar']>[2]]>([
    ['en_proceso', { accion: 'iniciar' }],
    ['asignada', { accion: 'poner_en_espera', motivo: 'x' }],
    ['en_proceso', { accion: 'reanudar' }],
    ['en_espera', { accion: 'resolver', descripcion: 'x' }],
  ])('desde %s, %o lanza InvalidTransitionError', async (estado, comando) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, estado);

    expect(await capturar(servicio.transicionar(TECNICO, 1, comando))).toBeInstanceOf(InvalidTransitionError);
    expect(tickets.guardadas).toEqual([]);
  });

  it('un ticket no asignado al técnico → NO_ENCONTRADO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'asignada', 99);

    expect(await capturar(servicio.transicionar(TECNICO, 1, { accion: 'iniciar' }))).toMatchObject({ codigo: 'NO_ENCONTRADO' });
  });

  it('listar usa el filtro de tickets.cambiar_estado', async () => {
    const { bandeja, servicio } = armar();

    await servicio.listar(TECNICO, ['en_espera'], 1, 20);

    expect(bandeja.llamadas).toEqual([
      { filtro: [{ campo: 'asignadoA', valor: 30 }, { campo: 'asignadoA', valor: 30 }], estados: ['en_espera'] },
    ]);
  });
});

describe('AtencionService: correo al resolver (SPEC 33)', () => {
  it('el solicitante con correo recibe queja_resuelta con la solución, la fecha límite en Guatemala y el enlace al detalle', async () => {
    const { tickets, servicio, enviador } = armar();
    tickets.email = 'ana@correo.gt';
    tickets.agregar(5, 'en_proceso');
    await servicio.transicionar(TECNICO, 5, { accion: 'resolver', descripcion: 'Se rellenó el bache' });
    await correosPendientes();

    expect(enviador.enviados).toHaveLength(1);
    expect(enviador.enviados[0]).toMatchObject({ para: 'ana@correo.gt', asunto: 'Resuelta Q-2026-000005' });
    // 05:59:59.999 UTC del 31 = 23:59 del viernes 30 de octubre en Guatemala.
    expect(enviador.enviados[0].texto).toBe(
      'Ana Bache Se rellenó el bache hasta viernes, 30 de octubre de 2026, 23:59 en https://vozmuni.test/tickets/5',
    );
  });

  it('una solución con <script> va escapada en el html', async () => {
    const { tickets, servicio, enviador } = armar();
    tickets.email = 'ana@correo.gt';
    tickets.agregar(5, 'en_proceso');
    await servicio.transicionar(TECNICO, 5, { accion: 'resolver', descripcion: '<script>alert(1)</script>' });
    await correosPendientes();
    expect(enviador.enviados[0].html).toContain('&lt;script&gt;');
    expect(enviador.enviados[0].html).not.toContain('<script>');
  });

  it('un solicitante sin correo no recibe nada', async () => {
    const { tickets, servicio, enviador } = armar();
    tickets.agregar(5, 'en_proceso');
    await servicio.transicionar(TECNICO, 5, { accion: 'resolver', descripcion: 'Listo' });
    await correosPendientes();
    expect(enviador.enviados).toEqual([]);
  });

  it('un fallo del enviador queda en el log y no cambia la respuesta', async () => {
    const { tickets, servicio, enviador, errores } = armar();
    tickets.email = 'ana@correo.gt';
    enviador.fallar = true;
    tickets.agregar(5, 'en_proceso');
    await expect(servicio.transicionar(TECNICO, 5, { accion: 'resolver', descripcion: 'Listo' })).resolves.toMatchObject({
      estado: 'resuelta',
    });
    await correosPendientes();
    expect(errores).toEqual([expect.stringContaining('queja_resuelta')]);
  });

  it('las demás acciones no envían correo', async () => {
    const { tickets, servicio, enviador } = armar();
    tickets.email = 'ana@correo.gt';
    tickets.agregar(5, 'asignada');
    await servicio.transicionar(TECNICO, 5, { accion: 'iniciar' });
    await correosPendientes();
    expect(enviador.enviados).toEqual([]);
  });
});
