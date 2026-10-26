import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { ErrorDeAplicacion } from '../../../src/application/errors/error-de-aplicacion';
import { EnvioCorreo } from '../../../src/application/services/envio-correo';
import { TriageService } from '../../../src/application/services/triage.service';
import type { FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import { InvalidTransitionError } from '../../../src/domain/errors/invalid-transition-error';
import { ReglaDeNegocioError } from '../../../src/domain/errors/regla-de-negocio-error';
import type {
  CategoriaDestino,
  TicketEscrituraRepository,
  TicketParaTransicion,
} from '../../../src/domain/repositories/ticket-escritura-repository';
import type { Pagina } from '../../../src/domain/repositories/ticket-lectura-repository';
import type {
  EstadoTriage,
  TicketTriage,
  TriageLecturaRepository,
} from '../../../src/domain/repositories/triage-lectura-repository';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { Ticket, type ResultadoTransicion } from '../../../src/domain/ticket/ticket';
import {
  correosPendientes,
  EnviadorEnMemoria,
  PlantillasEnMemoria,
  RelojFalso,
  TransaccionEnMemoria,
} from '../auth/dobles';
import { SLA_VACIO, SlaNulo } from '../sla/dobles-sla';

const AHORA = new Date('2026-10-23T15:00:00.000Z');

const SUPERVISOR: UsuarioAutenticado = {
  id: 50,
  nombre: 'Sara Supervisora',
  rol: 'supervisor',
  dependenciaId: null,
  permisos: { 'tickets.ver': 'todas', 'tickets.triage': 'todas' },
};

const CATEGORIAS: CategoriaDestino[] = [
  { id: 1, nombre: 'Baches', activa: true, dependenciaId: 10, dependenciaNombre: 'Dirección de Obras' },
  { id: 2, nombre: 'Alumbrado', activa: true, dependenciaId: 20, dependenciaNombre: 'Servicios Públicos' },
  { id: 3, nombre: 'Antigua', activa: false, dependenciaId: 10, dependenciaNombre: 'Dirección de Obras' },
];

// Como el repositorio real, pero en memoria: guarda las transiciones en lugar de escribir la base.
class TicketsEnMemoria implements TicketEscrituraRepository {
  readonly guardadas: { resultado: ResultadoTransicion; categoriaId: number }[] = [];
  readonly filtros: FiltroTickets[] = [];
  readonly tickets = new Map<number, TicketParaTransicion>();

  agregar(id: number, estado: EstadoTicket, email: string | null = 'vecina@correo.gt'): void {
    this.tickets.set(id, {
      ticket: Ticket.reconstituir({
        id,
        numero: `Q-2026-${String(id).padStart(6, '0')}`,
        estado,
        dependenciaId: null,
        asignadoA: null,
        prioridad: null,
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
      titulo: 'Bache frente a la escuela',
      categoria: { id: 1, nombre: 'Baches' },
      solicitante: { id: 7, nombre: 'Ana López', email },
      sla: SLA_VACIO,
    });
  }

  async obtenerParaActualizar(id: number, filtro: FiltroTickets): Promise<TicketParaTransicion | null> {
    this.filtros.push(filtro);
    return filtro === null ? null : (this.tickets.get(id) ?? null);
  }

  async obtenerCategoria(categoriaId: number): Promise<CategoriaDestino | null> {
    return CATEGORIAS.find((c) => c.id === categoriaId) ?? null;
  }

  async guardarTecnico(): Promise<void> {
    throw new Error('el triage no asigna técnico');
  }

  async guardarEscalado(): Promise<void> {
    throw new Error('el triage no escala');
  }

  async guardarTransicion(resultado: ResultadoTransicion, categoriaId: number): Promise<void> {
    this.guardadas.push({ resultado, categoriaId });
  }
}

class BandejaFalsa implements TriageLecturaRepository {
  readonly llamadas: { filtro: FiltroTickets; estados: readonly EstadoTriage[] }[] = [];

  async listar(filtro: FiltroTickets, estados: readonly EstadoTriage[], pagina: number, tamano: number) {
    this.llamadas.push({ filtro, estados });
    const ticket: TicketTriage = {
      id: 1,
      numero: 'Q-2026-000001',
      estado: 'nueva',
      titulo: 'Bache',
      descripcion: 'Bache profundo',
      categoria: { id: 1, nombre: 'Baches' },
      zona: { id: 1, nombre: 'Zona 1', tipo: 'zona' },
      direccion: '5a avenida',
      canal: 'portal',
      datosExtra: {},
      ubicacion: null,
      solicitanteNombre: 'Ana López',
      trasladoReciente: null,
      creadoEn: AHORA,
    };
    return { datos: [ticket], pagina, tamano, total: 1 } satisfies Pagina<TicketTriage>;
  }
}

function armar() {
  const tickets = new TicketsEnMemoria();
  const bandeja = new BandejaFalsa();
  const enviador = new EnviadorEnMemoria();
  const errores: string[] = [];
  const correo = new EnvioCorreo(plantillasConTriage(), enviador, (mensaje) => errores.push(mensaje));
  const servicio = new TriageService(
    new TransaccionEnMemoria({ ticketsEscritura: tickets }),
    bandeja,
    correo,
    new RelojFalso(AHORA),
    'http://localhost:5173',
    new SlaNulo(),
  );
  return { tickets, bandeja, enviador, errores, servicio };
}

// Las plantillas de esta spec, con las variables a la vista para comprobar el contenido.
function plantillasConTriage(): PlantillasEnMemoria {
  const plantillas = new PlantillasEnMemoria();
  for (const [clave, texto] of [
    ['queja_aceptada', '{{nombre}} {{numero}} {{titulo}} → {{dependencia}} {{enlace}}'],
    ['queja_rechazada', '{{nombre}} {{numero}} {{titulo}} motivo: {{motivo}} {{enlace}}'],
  ]) {
    plantillas.plantillas.set(clave, { clave, asunto: clave, cuerpoTexto: texto, cuerpoHtml: `<p>${texto}</p>` });
  }
  return plantillas;
}

function capturar(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => {
      throw new Error('se esperaba una excepción');
    },
    (error: unknown) => error,
  );
}

describe('TriageService', () => {
  it('tomar desde nueva pasa a en_revision, con historial del supervisor y sin correo', async () => {
    const { tickets, enviador, servicio } = armar();
    tickets.agregar(1, 'nueva');

    const respuesta = await servicio.transicionar(SUPERVISOR, 1, { accion: 'tomar' });
    await correosPendientes();

    expect(respuesta).toEqual({
      id: 1,
      numero: 'Q-2026-000001',
      estado: 'en_revision',
      prioridad: null,
      categoriaId: 1,
      dependenciaId: null,
      venceRespuesta: null,
      venceResolucion: null,
    });
    expect(tickets.guardadas[0].resultado.historial).toMatchObject({
      estadoAnterior: 'nueva',
      estadoNuevo: 'en_revision',
      usuarioId: 50,
      motivo: null,
      creadoEn: AHORA,
    });
    expect(tickets.filtros).toEqual([[]]);
    expect(enviador.enviados).toEqual([]);
  });

  it('aceptar sin categoriaId asigna la dependencia de la categoría actual, sin nota', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_revision');

    const respuesta = await servicio.transicionar(SUPERVISOR, 1, { accion: 'aceptar', prioridad: 'alta' });

    expect(respuesta).toMatchObject({ estado: 'asignada', prioridad: 'alta', categoriaId: 1, dependenciaId: 10 });
    expect(tickets.guardadas[0].categoriaId).toBe(1);
    expect(tickets.guardadas[0].resultado.historial.motivo).toBeNull();
  });

  it('aceptar con otra categoría la cambia, asigna su dependencia y deja la nota en el historial', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_revision');

    const respuesta = await servicio.transicionar(SUPERVISOR, 1, { accion: 'aceptar', prioridad: 'media', categoriaId: 2 });

    expect(respuesta).toMatchObject({ categoriaId: 2, dependenciaId: 20 });
    expect(tickets.guardadas[0].categoriaId).toBe(2);
    expect(tickets.guardadas[0].resultado.historial.motivo).toBe('Categoría: Baches → Alumbrado');
  });

  it('aceptar con la misma categoría enviada explícitamente no deja nota', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_revision');

    await servicio.transicionar(SUPERVISOR, 1, { accion: 'aceptar', prioridad: 'baja', categoriaId: 1 });

    expect(tickets.guardadas[0].resultado.historial.motivo).toBeNull();
  });

  it.each([3, 99])('aceptar con la categoría %i (inactiva o inexistente) lanza CATEGORIA_INVALIDA', async (categoriaId) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_revision');

    const error = await capturar(servicio.transicionar(SUPERVISOR, 1, { accion: 'aceptar', prioridad: 'alta', categoriaId }));

    expect(error).toBeInstanceOf(ErrorDeAplicacion);
    expect(error).toMatchObject({ codigo: 'CATEGORIA_INVALIDA' });
    expect(tickets.guardadas).toEqual([]);
  });

  it('aceptar desde nueva lanza InvalidTransitionError, aunque la categoría sea inválida', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'nueva');

    const error = await capturar(servicio.transicionar(SUPERVISOR, 1, { accion: 'aceptar', prioridad: 'alta', categoriaId: 3 }));

    expect(error).toBeInstanceOf(InvalidTransitionError);
    expect(tickets.guardadas).toEqual([]);
  });

  it('tomar una queja ya tomada lanza InvalidTransitionError', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_revision');

    expect(await capturar(servicio.transicionar(SUPERVISOR, 1, { accion: 'tomar' }))).toBeInstanceOf(InvalidTransitionError);
  });

  it.each(['', '   '])('rechazar con el motivo %p lanza MOTIVO_REQUERIDO', async (motivo) => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'en_revision');

    const error = await capturar(servicio.transicionar(SUPERVISOR, 1, { accion: 'rechazar', motivo }));

    expect(error).toBeInstanceOf(ReglaDeNegocioError);
    expect(error).toMatchObject({ codigo: 'MOTIVO_REQUERIDO' });
  });

  it('un ticket inexistente o fuera de alcance lanza NO_ENCONTRADO', async () => {
    const { servicio } = armar();

    expect(await capturar(servicio.transicionar(SUPERVISOR, 404, { accion: 'tomar' }))).toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
  });

  it('sin tickets.triage el filtro es null y responde NO_ENCONTRADO', async () => {
    const { tickets, servicio } = armar();
    tickets.agregar(1, 'nueva');
    const receptor = { ...SUPERVISOR, rol: 'receptor' as const, permisos: { 'tickets.ver': 'registradas' as const } };

    expect(await capturar(servicio.transicionar(receptor, 1, { accion: 'tomar' }))).toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
    expect(tickets.filtros).toEqual([null]);
  });

  it('aceptar envía queja_aceptada con la dependencia y el enlace de consulta', async () => {
    const { tickets, enviador, servicio } = armar();
    tickets.agregar(1, 'en_revision');

    await servicio.transicionar(SUPERVISOR, 1, { accion: 'aceptar', prioridad: 'alta', categoriaId: 2 });
    await correosPendientes();

    expect(enviador.enviados).toHaveLength(1);
    expect(enviador.enviados[0]).toMatchObject({ para: 'vecina@correo.gt', asunto: 'queja_aceptada' });
    expect(enviador.enviados[0].texto).toBe(
      'Ana López Q-2026-000001 Bache frente a la escuela → Servicios Públicos http://localhost:5173/consulta?numero=Q-2026-000001',
    );
  });

  it('rechazar envía queja_rechazada con el motivo recortado', async () => {
    const { tickets, enviador, servicio } = armar();
    tickets.agregar(1, 'en_revision');

    const respuesta = await servicio.transicionar(SUPERVISOR, 1, { accion: 'rechazar', motivo: '  Es un duplicado  ' });
    await correosPendientes();

    expect(respuesta.estado).toBe('rechazada');
    expect(tickets.guardadas[0].resultado.historial.motivo).toBe('Es un duplicado');
    expect(enviador.enviados[0]).toMatchObject({ asunto: 'queja_rechazada' });
    expect(enviador.enviados[0].texto).toContain('motivo: Es un duplicado http');
  });

  it('un solicitante sin correo no recibe nada', async () => {
    const { tickets, enviador, servicio } = armar();
    tickets.agregar(1, 'en_revision', null);

    await servicio.transicionar(SUPERVISOR, 1, { accion: 'rechazar', motivo: 'Fuera del municipio' });
    await correosPendientes();

    expect(enviador.enviados).toEqual([]);
  });

  it('un fallo del enviador no cambia el resultado y queda en el log', async () => {
    const { tickets, enviador, errores, servicio } = armar();
    tickets.agregar(1, 'en_revision');
    enviador.fallar = true;

    const respuesta = await servicio.transicionar(SUPERVISOR, 1, { accion: 'aceptar', prioridad: 'urgente' });
    await correosPendientes();

    expect(respuesta.estado).toBe('asignada');
    expect(errores).toEqual([expect.stringContaining('queja_aceptada al usuario_id 7')]);
  });

  it('listar usa el filtro de tickets.triage y devuelve creadoEn en ISO', async () => {
    const { bandeja, servicio } = armar();

    const pagina = await servicio.listar(SUPERVISOR, ['nueva'], 1, 20);

    expect(bandeja.llamadas).toEqual([{ filtro: [], estados: ['nueva'] }]);
    expect(pagina).toMatchObject({ pagina: 1, tamano: 20, total: 1 });
    expect(pagina.datos[0].creadoEn).toBe('2026-10-23T15:00:00.000Z');
  });
});
