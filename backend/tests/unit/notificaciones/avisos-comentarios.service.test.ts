import { AvisosComentariosService, TAMANO_LOTE_AVISOS } from '../../../src/application/services/avisos-comentarios.service';
import type { EstadoAvisoComentarios } from '../../../src/domain/notificaciones/aviso-comentarios';
import type {
  AvisosComentariosRepository,
  QuejaConAvisoPendiente,
} from '../../../src/domain/repositories/avisos-comentarios-repository';
import type { CorreoSalienteRepository } from '../../../src/domain/repositories/correo-saliente-repository';
import type { ReposTransaccionales, Transaccion } from '../../../src/domain/repositories/transaccion';

const AHORA = new Date('2026-11-02T15:00:00.000Z');
const minutos = (n: number) => new Date(AHORA.getTime() + n * 60_000);

interface FilaAviso extends EstadoAvisoComentarios {
  queja: QuejaConAvisoPendiente;
}

class AvisosEnMemoria implements AvisosComentariosRepository {
  readonly filas = new Map<number, FilaAviso>();

  agregar(ticketId: number, estado: EstadoAvisoComentarios, email: string | null = 'ana@vozmuni.test') {
    this.filas.set(ticketId, {
      ...estado,
      queja: {
        ticketId,
        numero: `Q-2026-${String(ticketId).padStart(6, '0')}`,
        titulo: 'Bache',
        solicitante: { id: 7, nombre: 'Ana', email },
        pendientes: estado.pendientes,
      },
    });
  }

  async obtenerEstado(ticketId: number): Promise<EstadoAvisoComentarios> {
    const { avisoComentarioEn, pendientes } = this.filas.get(ticketId)!;
    return { avisoComentarioEn, pendientes };
  }

  async guardarEstado(ticketId: number, estado: EstadoAvisoComentarios): Promise<void> {
    Object.assign(this.filas.get(ticketId)!, estado);
  }

  async reclamarVencidos(cerradaHasta: Date, limite: number): Promise<QuejaConAvisoPendiente[]> {
    return [...this.filas.values()]
      .filter((f) => f.pendientes > 0 && f.avisoComentarioEn !== null && f.avisoComentarioEn <= cerradaHasta)
      .slice(0, limite)
      .map((f) => ({ ...f.queja, pendientes: f.pendientes }));
  }
}

function montar(ventana: unknown = 30) {
  const avisos = new AvisosEnMemoria();
  const encolados: { clave: string; variables: Record<string, string>; ticketId?: number }[] = [];
  const despachados: (number | null)[][] = [];
  const logs: string[] = [];
  let transacciones = 0;
  const transaccion: Transaccion = {
    ejecutar: (trabajo) => {
      transacciones++;
      return trabajo({ avisosComentarios: avisos, correosSalientes: {} } as unknown as ReposTransaccionales);
    },
  };
  const servicio = new AvisosComentariosService(
    transaccion,
    { obtener: async () => ventana, guardar: async () => {} },
    {
      encolar: async (clave, variables, destino) => (encolados.push({ clave, variables, ticketId: destino.ticketId }), encolados.length),
      despachar: async (ids) => void despachados.push([...ids]),
    },
    'https://vozmuni.test',
    (m) => logs.push(m),
  );
  const repos = { avisosComentarios: avisos, correosSalientes: {} as CorreoSalienteRepository };
  return { avisos, encolados, despachados, logs, servicio, repos, transacciones: () => transacciones };
}

const queja = (id = 1, email: string | null = 'ana@vozmuni.test') => ({
  id,
  numero: `Q-2026-${String(id).padStart(6, '0')}`,
  titulo: 'Bache',
  solicitante: { id: 7, nombre: 'Ana', email },
});

describe('AvisosComentariosService.alComentar', () => {
  it('el primero se encola con el enlace a la consulta, los siguientes de la ventana se acumulan', async () => {
    const { avisos, encolados, servicio, repos } = montar();
    avisos.agregar(1, { avisoComentarioEn: null, pendientes: 0 });

    expect(await servicio.alComentar(repos, queja(), AHORA)).toBe(1);
    expect(await servicio.alComentar(repos, queja(), minutos(5))).toBeNull();
    expect(await servicio.alComentar(repos, queja(), minutos(10))).toBeNull();

    expect(encolados).toEqual([
      {
        clave: 'comentario_publico',
        variables: { nombre: 'Ana', numero: 'Q-2026-000001', titulo: 'Bache', enlace: 'https://vozmuni.test/consulta?numero=Q-2026-000001' },
        ticketId: 1,
      },
    ]);
    expect(await avisos.obtenerEstado(1)).toEqual({ avisoComentarioEn: AHORA, pendientes: 2 });
  });

  it('sin correo del solicitante actualiza el estado y no encola', async () => {
    const { avisos, encolados, servicio, repos } = montar();
    avisos.agregar(1, { avisoComentarioEn: null, pendientes: 0 });

    expect(await servicio.alComentar(repos, queja(1, null), AHORA)).toBeNull();
    expect(encolados).toEqual([]);
    expect(await avisos.obtenerEstado(1)).toEqual({ avisoComentarioEn: AHORA, pendientes: 0 });
  });

  it('con el parámetro inválido avisa al instante y lo registra en el log', async () => {
    const { avisos, encolados, logs, servicio, repos } = montar('treinta');
    avisos.agregar(1, { avisoComentarioEn: null, pendientes: 0 });

    await servicio.alComentar(repos, queja(), AHORA);
    await servicio.alComentar(repos, queja(), minutos(1));

    expect(encolados).toHaveLength(2);
    expect(logs[0]).toContain('aviso_comentarios_ventana_minutos');
  });
});

describe('AvisosComentariosService.procesar', () => {
  it('al cerrarse la ventana encola el agrupado con la cantidad y abre una ventana nueva', async () => {
    const { avisos, encolados, despachados, servicio } = montar();
    avisos.agregar(1, { avisoComentarioEn: AHORA, pendientes: 2 });

    expect(await servicio.procesar(minutos(29))).toBe(0);
    expect(await servicio.procesar(minutos(30))).toBe(1);

    expect(encolados).toEqual([
      expect.objectContaining({ clave: 'comentarios_publicos_agrupados', variables: expect.objectContaining({ cantidad: '2' }) }),
    ]);
    expect(despachados.at(-1)).toEqual([1]);
    expect(await avisos.obtenerEstado(1)).toEqual({ avisoComentarioEn: minutos(30), pendientes: 0 });
  });

  it('un solicitante sin correo reinicia el estado sin encolar', async () => {
    const { avisos, encolados, servicio } = montar();
    avisos.agregar(1, { avisoComentarioEn: AHORA, pendientes: 1 }, null);

    expect(await servicio.procesar(minutos(30))).toBe(0);
    expect(encolados).toEqual([]);
    expect((await avisos.obtenerEstado(1)).pendientes).toBe(0);
  });

  it(`más de ${TAMANO_LOTE_AVISOS} quejas se procesan en varios lotes`, async () => {
    const { avisos, servicio, transacciones } = montar();
    for (let id = 1; id <= TAMANO_LOTE_AVISOS + 2; id++) {
      avisos.agregar(id, { avisoComentarioEn: AHORA, pendientes: 1 });
    }

    expect(await servicio.procesar(minutos(30))).toBe(TAMANO_LOTE_AVISOS + 2);
    expect(transacciones()).toBe(2);
  });
});
