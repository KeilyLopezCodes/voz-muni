import type { UsuarioAutenticado } from '../../../src/application/dto/auth.dto';
import { ConsultaTicketsService } from '../../../src/application/services/consulta-tickets.service';
import { cumpleFiltro, type FiltroTickets } from '../../../src/domain/autorizacion/alcance-tickets';
import type {
  Pagina,
  TicketLecturaRepository,
  TicketResumen,
} from '../../../src/domain/repositories/ticket-lectura-repository';

// Aplica el filtro en memoria con la misma regla del dominio y registra lo que recibe.
class TicketsEnMemoria implements TicketLecturaRepository {
  readonly filtrosRecibidos: FiltroTickets[] = [];

  constructor(private readonly tickets: TicketResumen[]) {}

  async listar(filtro: FiltroTickets, pagina: number, tamano: number): Promise<Pagina<TicketResumen>> {
    this.filtrosRecibidos.push(filtro);
    const datos = this.tickets.filter((t) => cumpleFiltro(t, filtro));
    return { datos, pagina, tamano, total: datos.length };
  }

  async obtener(id: number, filtro: FiltroTickets): Promise<TicketResumen | null> {
    this.filtrosRecibidos.push(filtro);
    return this.tickets.find((t) => t.id === id && cumpleFiltro(t, filtro)) ?? null;
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
  return { repo, servicio: new ConsultaTicketsService(repo) };
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
});
