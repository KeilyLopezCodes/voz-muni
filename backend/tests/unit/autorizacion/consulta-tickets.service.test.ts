import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { ConsultaTicketsService } from '../../../src/application/services/consulta-tickets.service';
import { cumpleFiltro, type FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import type {
  Pagina,
  ResolucionLectura,
  TicketDetalleLectura,
  TicketLecturaRepository,
  TicketListado,
  TicketResumen,
} from '../../../src/domain/repositories/ticket-lectura-repository';
import type { EstadoTicket } from '../../../src/domain/ticket/estado-ticket';
import { RelojFalso } from '../auth/dobles';

const AHORA = new Date('2026-11-05T15:00:00.000Z');

interface PlazoFalso {
  venceEn: Date;
  reaperturas: number;
}

interface PasoHistorial {
  ticketId: number;
  estadoNuevo: EstadoTicket;
  motivo: string | null;
}

function servicioCon(repo: TicketLecturaRepository, maxReaperturas = 2): ConsultaTicketsService {
  return new ConsultaTicketsService(repo, { maxReaperturas: async () => maxReaperturas }, new RelojFalso(AHORA));
}

// Aplica el filtro en memoria con la misma regla del dominio y registra lo que recibe.
class TicketsEnMemoria implements TicketLecturaRepository {
  readonly filtrosRecibidos: FiltroTickets[] = [];

  constructor(
    private readonly tickets: TicketResumen[],
    private readonly historial: PasoHistorial[] = [],
    private readonly resoluciones: Record<number, ResolucionLectura> = {},
    private readonly plazos: Record<number, PlazoFalso> = {},
  ) {}

  async listar(filtro: FiltroTickets, pagina: number, tamano: number): Promise<Pagina<TicketResumen>> {
    this.filtrosRecibidos.push(filtro);
    const datos = this.tickets.filter((t) => cumpleFiltro(t, filtro));
    return { datos, pagina, tamano, total: datos.length };
  }

  async obtener(id: number, filtro: FiltroTickets): Promise<TicketResumen | null> {
    this.filtrosRecibidos.push(filtro);
    return this.tickets.find((t) => t.id === id && cumpleFiltro(t, filtro)) ?? null;
  }

  async listarConTitulo(filtro: FiltroTickets, pagina: number, tamano: number): Promise<Pagina<TicketListado>> {
    this.filtrosRecibidos.push(filtro);
    const datos = this.tickets
      .filter((t) => cumpleFiltro(t, filtro))
      .map((t) => ({
        id: t.id,
        numero: t.numero,
        titulo: `Queja ${t.id}`,
        estado: t.estado,
        creadoEn: t.creadoEn,
        esperaRespuesta: t.estado === 'en_espera',
      }));
    return { datos, pagina, tamano, total: datos.length };
  }

  // Misma regla que la consulta SQL: el motivo del último paso a en_espera, solo si sigue en espera.
  async obtenerDetalle(id: number, filtro: FiltroTickets): Promise<TicketDetalleLectura | null> {
    this.filtrosRecibidos.push(filtro);
    const t = this.tickets.find((x) => x.id === id && cumpleFiltro(x, filtro));
    if (!t) {
      return null;
    }
    const esperas = this.historial.filter((h) => h.ticketId === id && h.estadoNuevo === 'en_espera');
    return {
      id: t.id,
      numero: t.numero,
      estado: t.estado,
      titulo: `Queja ${t.id}`,
      descripcion: 'Descripción',
      categoria: { id: 1, nombre: 'Alumbrado' },
      zona: { id: 1, nombre: 'Zona 1', tipo: 'zona' },
      direccion: 'Dirección',
      dependencia: t.dependenciaId === null ? null : { id: t.dependenciaId, nombre: 'Dependencia' },
      creadoEn: t.creadoEn,
      resueltoEn: null,
      cerradoEn: null,
      informacionSolicitada: t.estado === 'en_espera' ? (esperas.at(-1)?.motivo ?? null) : null,
      resolucion: t.estado === 'resuelta' || t.estado === 'cerrada' ? (this.resoluciones[id] ?? null) : null,
      confirmacionVenceEn: this.plazos[id]?.venceEn ?? null,
      reaperturas: this.plazos[id]?.reaperturas ?? 0,
      solicitanteId: t.solicitanteId,
      sla: { venceRespuesta: null, primeraRespuestaEn: null, venceResolucion: null, restanteMinutosEnPausa: null },
    };
  }
}

const DEP_A = 10;
const DEP_B = 20;

function ticket(id: number, dependenciaId: number | null): TicketResumen {
  return {
    id,
    numero: `Q-2026-00000${id}`,
    estado: 'asignada',
    creadoEn: new Date('2026-10-22T00:00:00Z'),
    solicitanteId: 1,
    registradoPor: 1,
    asignadoA: null,
    dependenciaId,
  };
}

const coordinadorA: UsuarioAutenticado = {
  id: 4,
  nombre: 'Coordinadora A',
  rol: 'coordinador',
  dependenciaId: DEP_A,
  permisos: { 'tickets.ver': 'dependencia', 'tickets.clasificar': 'todas', 'tickets.asignar': 'dependencia' },
};

function crear() {
  const repo = new TicketsEnMemoria([ticket(1, DEP_A), ticket(2, DEP_B)]);
  return { repo, servicio: servicioCon(repo) };
}

async function errorDe(promesa: Promise<unknown>): Promise<unknown> {
  return promesa.then(
    () => {
      throw new Error('se esperaba un error');
    },
    (error: unknown) => error,
  );
}

describe('ConsultaTicketsService', () => {
  it('fuera de alcance e inexistente lanzan el mismo NO_ENCONTRADO', async () => {
    const { servicio } = crear();

    const fueraDeAlcance = (await errorDe(servicio.obtenerParaAccion(coordinadorA, 'tickets.ver', 2))) as {
      codigo: string;
      name: string;
    };
    const inexistente = (await errorDe(servicio.obtenerParaAccion(coordinadorA, 'tickets.ver', 99))) as {
      codigo: string;
      name: string;
    };

    expect(fueraDeAlcance).toMatchObject({ name: 'ErrorDeAplicacion', codigo: 'NO_ENCONTRADO' });
    expect(inexistente).toMatchObject({ name: 'ErrorDeAplicacion', codigo: 'NO_ENCONTRADO' });
  });

  it('el coordinador con tickets.clasificar sobre otra dependencia recibe NO_ENCONTRADO', async () => {
    const { servicio } = crear();

    await expect(servicio.obtenerParaAccion(coordinadorA, 'tickets.clasificar', 2)).rejects.toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
    await expect(servicio.obtenerParaAccion(coordinadorA, 'tickets.clasificar', 1)).resolves.toMatchObject({ id: 1 });
  });

  it('sin la acción, el repositorio recibe null y responde NO_ENCONTRADO', async () => {
    const { repo, servicio } = crear();

    await expect(servicio.obtenerParaAccion(coordinadorA, 'tickets.trasladar', 1)).rejects.toMatchObject({
      codigo: 'NO_ENCONTRADO',
    });
    expect(repo.filtrosRecibidos).toEqual([null]);
  });

  it('listar pasa al repositorio el filtro de tickets.ver', async () => {
    const { repo, servicio } = crear();

    const pagina = await servicio.listar(coordinadorA, 1, 20);

    expect(repo.filtrosRecibidos).toEqual([[{ campo: 'dependenciaId', valor: DEP_A }]]);
    expect(pagina.datos.map((t) => t.id)).toEqual([1]);
  });

  it.each([
    [0, 20],
    [1, 0],
    [1, 101],
    [1.5, 20],
  ])('listar rechaza pagina %s y tamano %s con VALIDACION', (pagina, tamano) => {
    const { servicio } = crear();

    expect(() => servicio.listar(coordinadorA, pagina, tamano)).toThrow(expect.objectContaining({ codigo: 'VALIDACION' }));
  });

  describe('detalle (SPEC 25)', () => {
    const VECINO = 7;
    const vecino: UsuarioAutenticado = {
      id: VECINO,
      nombre: 'Vecina',
      rol: 'vecino',
      dependenciaId: null,
      permisos: { 'tickets.ver': 'propia' },
    };

    function conEstado(id: number, estado: EstadoTicket, solicitanteId = VECINO): TicketResumen {
      return { ...ticket(id, DEP_A), estado, solicitanteId };
    }

    function crearDetalle() {
      const repo = new TicketsEnMemoria(
        [conEstado(1, 'en_espera'), conEstado(2, 'en_proceso'), conEstado(3, 'en_espera', 99)],
        [
          { ticketId: 1, estadoNuevo: 'en_espera', motivo: 'Envíe una foto' },
          { ticketId: 1, estadoNuevo: 'en_proceso', motivo: null },
          { ticketId: 1, estadoNuevo: 'en_espera', motivo: 'Envíe el número de contador' },
          { ticketId: 2, estadoNuevo: 'en_espera', motivo: 'Ya respondido' },
          { ticketId: 2, estadoNuevo: 'en_proceso', motivo: null },
        ],
      );
      return { repo, servicio: servicioCon(repo) };
    }

    it('informacionSolicitada es el motivo del último paso a en_espera', async () => {
      const { servicio } = crearDetalle();

      const detalle = await servicio.detalle(vecino, 1);

      expect(detalle.informacionSolicitada).toBe('Envíe el número de contador');
      expect(detalle.creadoEn).toBe('2026-10-22T00:00:00.000Z');
    });

    it('informacionSolicitada es null si la queja ya no está en espera', async () => {
      const { servicio } = crearDetalle();

      await expect(servicio.detalle(vecino, 2)).resolves.toMatchObject({ estado: 'en_proceso', informacionSolicitada: null });
    });

    it('esSolicitante es true para el solicitante y false para otro usuario', async () => {
      const { servicio } = crearDetalle();

      await expect(servicio.detalle(vecino, 1)).resolves.toMatchObject({ esSolicitante: true });
      await expect(servicio.detalle(coordinadorA, 1)).resolves.toMatchObject({ esSolicitante: false });
    });

    it('no expone el id del solicitante', async () => {
      const { servicio } = crearDetalle();

      expect(await servicio.detalle(vecino, 1)).not.toHaveProperty('solicitanteId');
    });

    it('fuera de alcance responde NO_ENCONTRADO, igual que un ticket inexistente', async () => {
      const { repo, servicio } = crearDetalle();

      await expect(servicio.detalle(vecino, 3)).rejects.toMatchObject({ name: 'ErrorDeAplicacion', codigo: 'NO_ENCONTRADO' });
      await expect(servicio.detalle(vecino, 99)).rejects.toMatchObject({ codigo: 'NO_ENCONTRADO' });
      expect(repo.filtrosRecibidos[0]).toEqual([{ campo: 'solicitanteId', valor: VECINO }]);
    });

    it('listarParaUsuario usa el filtro de tickets.ver y devuelve fechas ISO', async () => {
      const { repo, servicio } = crearDetalle();

      const pagina = await servicio.listarParaUsuario(vecino, 1, 20);

      expect(repo.filtrosRecibidos).toEqual([[{ campo: 'solicitanteId', valor: VECINO }]]);
      expect(pagina.datos.map((t) => t.id)).toEqual([1, 2]);
      expect(pagina.datos[0]).toMatchObject({ esperaRespuesta: true, creadoEn: '2026-10-22T00:00:00.000Z' });
    });

    describe('resolución (SPEC 26)', () => {
      const RESOLUCION: ResolucionLectura = {
        descripcion: 'Se rellenó el bache',
        resueltaEn: new Date('2026-10-23T18:30:00Z'),
        resueltaPor: { id: 30, nombre: 'Técnico de desarrollo' },
      };
      const supervisor: UsuarioAutenticado = {
        id: 5,
        nombre: 'Supervisora',
        rol: 'supervisor',
        dependenciaId: null,
        permisos: { 'tickets.ver': 'todas' },
      };

      function crearResueltas() {
        const repo = new TicketsEnMemoria(
          [conEstado(4, 'en_proceso'), conEstado(5, 'resuelta'), conEstado(6, 'cerrada')],
          [],
          { 4: RESOLUCION, 5: RESOLUCION, 6: RESOLUCION },
        );
        return servicioCon(repo);
      }

      it('una queja en_proceso no trae resolución', async () => {
        await expect(crearResueltas().detalle(supervisor, 4)).resolves.toMatchObject({ resolucion: null });
      });

      it.each([
        ['el supervisor', supervisor],
        ['el coordinador', coordinadorA],
      ])('%s ve la descripción, la fecha y quién resolvió', async (_quien, usuario) => {
        await expect(crearResueltas().detalle(usuario, 5)).resolves.toMatchObject({
          resolucion: {
            descripcion: 'Se rellenó el bache',
            resueltaEn: '2026-10-23T18:30:00.000Z',
            resueltaPor: { id: 30, nombre: 'Técnico de desarrollo' },
          },
        });
      });

      it('con alcance propia (el vecino) resueltaPor es null', async () => {
        await expect(crearResueltas().detalle(vecino, 5)).resolves.toMatchObject({
          resolucion: { descripcion: 'Se rellenó el bache', resueltaEn: '2026-10-23T18:30:00.000Z', resueltaPor: null },
        });
      });

      it('una queja cerrada mantiene la resolución', async () => {
        await expect(crearResueltas().detalle(vecino, 6)).resolves.toMatchObject({
          estado: 'cerrada',
          resolucion: { descripcion: 'Se rellenó el bache' },
        });
      });
    });

    describe('confirmación (SPEC 27)', () => {
      const tecnico: UsuarioAutenticado = {
        id: 30,
        nombre: 'Técnico',
        rol: 'tecnico',
        dependenciaId: DEP_A,
        permisos: { 'tickets.ver': 'todas', 'tickets.cambiar_estado': 'asignadas' },
      };
      const vecinoQueAtiende: UsuarioAutenticado = { ...vecino, permisos: { ...vecino.permisos, 'tickets.cambiar_estado': 'propia' } };
      const VIGENTE = new Date(AHORA.getTime() + 86_400_000);

      function crearConPlazos(plazos: Record<number, PlazoFalso>) {
        const repo = new TicketsEnMemoria(
          [conEstado(4, 'en_proceso'), conEstado(5, 'resuelta'), conEstado(6, 'cerrada')],
          [],
          {},
          plazos,
        );
        return servicioCon(repo);
      }

      it('el vecino en resuelta puede confirmar y reabrir, sin motivo al confirmar', async () => {
        const servicio = crearConPlazos({ 5: { venceEn: VIGENTE, reaperturas: 0 } });

        await expect(servicio.detalle(vecinoQueAtiende, 5)).resolves.toMatchObject({
          confirmacion: {
            venceEn: VIGENTE.toISOString(),
            vencida: false,
            reaperturasRestantes: 2,
            puedeConfirmar: true,
            puedeReabrir: true,
            exigeMotivoAlConfirmar: false,
          },
        });
      });

      it('un alcance sin confirmación (el técnico) ve el plazo sin poder actuar', async () => {
        const servicio = crearConPlazos({ 5: { venceEn: VIGENTE, reaperturas: 0 } });

        await expect(servicio.detalle(tecnico, 5)).resolves.toMatchObject({
          confirmacion: { puedeConfirmar: false, puedeReabrir: false, exigeMotivoAlConfirmar: true },
        });
      });

      it('con el plazo vencido no se puede actuar; en el límite de reaperturas no se puede reabrir', async () => {
        const vencido = crearConPlazos({ 5: { venceEn: new Date(AHORA.getTime() - 1), reaperturas: 0 } });
        const enElTope = crearConPlazos({ 5: { venceEn: VIGENTE, reaperturas: 3 } });

        await expect(vencido.detalle(vecinoQueAtiende, 5)).resolves.toMatchObject({
          confirmacion: { vencida: true, puedeConfirmar: false, puedeReabrir: false },
        });
        await expect(enElTope.detalle(vecinoQueAtiende, 5)).resolves.toMatchObject({
          confirmacion: { reaperturasRestantes: 0, puedeConfirmar: true, puedeReabrir: false },
        });
      });

      it('fuera de resuelta, o sin vencimiento, confirmacion es null', async () => {
        const servicio = crearConPlazos({ 4: { venceEn: VIGENTE, reaperturas: 0 }, 6: { venceEn: VIGENTE, reaperturas: 0 } });

        for (const id of [4, 6]) {
          await expect(servicio.detalle(vecinoQueAtiende, id)).resolves.toMatchObject({ confirmacion: null });
        }
        await expect(crearConPlazos({}).detalle(vecinoQueAtiende, 5)).resolves.toMatchObject({ confirmacion: null });
      });
    });

    it('listarParaUsuario rechaza un tamano mayor que 50', async () => {
      const { servicio } = crearDetalle();

      await expect(servicio.listarParaUsuario(vecino, 1, 51)).rejects.toMatchObject({ codigo: 'VALIDACION' });
    });
  });
});
