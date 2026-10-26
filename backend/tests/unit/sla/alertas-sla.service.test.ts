import { AlertasSlaService, TAMANO_LOTE_ALERTAS } from '../../../src/application/services/alertas-sla.service';
import type {
  AlertaPendiente,
  AlertasSlaRepository,
  PlazoAlerta,
} from '../../../src/domain/repositories/alertas-sla-repository';
import type { DestinatariosRepository, UsuarioDestino } from '../../../src/domain/repositories/destinatarios-repository';
import type { NotificacionRepository, NuevaNotificacion } from '../../../src/domain/repositories/notificacion-repository';
import type { ParametroRepository } from '../../../src/domain/repositories/parametro-repository';
import type { ReposTransaccionales, Transaccion } from '../../../src/domain/repositories/transaccion';

const AHORA = new Date('2026-11-02T20:00:00.000Z');
const VENCE = new Date('2026-11-03T15:00:00.000Z');

class AlertasEnMemoria implements AlertasSlaRepository {
  readonly marcadas: [number, PlazoAlerta][] = [];
  readonly limites: number[] = [];

  constructor(private pendientes: AlertaPendiente[]) {}

  async reclamarPendientes(_ahora: Date, limite: number): Promise<AlertaPendiente[]> {
    this.limites.push(limite);
    const lote = this.pendientes.slice(0, limite);
    this.pendientes = this.pendientes.slice(limite);
    return lote;
  }

  async marcarEnviada(ticketId: number, plazo: PlazoAlerta): Promise<void> {
    this.marcadas.push([ticketId, plazo]);
  }

}

// Los grupos de destinatarios (SPEC 36): coordinadores por dependencia y todos los usuarios activos.
class DestinatariosEnMemoria implements Pick<DestinatariosRepository, 'coordinadores' | 'usuarios'> {
  constructor(private readonly porDependencia: Record<number, number[]>) {}

  async coordinadores(dependenciaId: number): Promise<number[]> {
    return [...(this.porDependencia[dependenciaId] ?? [])];
  }

  async usuarios(ids: readonly number[]): Promise<UsuarioDestino[]> {
    return ids.map((id) => ({ id, activo: true, dependenciaId: null, permisos: {} }));
  }
}

class NotificacionesEnMemoria implements Pick<NotificacionRepository, 'crear'> {
  readonly creadas: NuevaNotificacion[] = [];

  async crear(notificaciones: readonly NuevaNotificacion[]): Promise<void> {
    this.creadas.push(...notificaciones);
  }
}

const parametros = (umbral: unknown): ParametroRepository => ({
  obtener: async (clave) => (clave === 'sla_umbral_alerta' ? umbral : null),
  guardar: async () => {},
});

function montar(pendientes: AlertaPendiente[], umbral: unknown = 80, porDependencia?: Record<number, number[]>) {
  const alertas = new AlertasEnMemoria(pendientes);
  const destinatarios = new DestinatariosEnMemoria(porDependencia ?? { 1: [20] });
  const notificaciones = new NotificacionesEnMemoria();
  const transacciones: number[] = [];
  const transaccion: Transaccion = {
    ejecutar: (trabajo) => {
      transacciones.push(transacciones.length + 1);
      return trabajo({ alertasSla: alertas, notificaciones, destinatarios } as unknown as ReposTransaccionales);
    },
  };
  const logs: string[] = [];
  const servicio = new AlertasSlaService(transaccion, parametros(umbral), (m) => logs.push(m));
  return { servicio, alertas, notificaciones, transacciones, logs };
}

const alerta = (ticketId: number, cambios: Partial<AlertaPendiente> = {}): AlertaPendiente => ({
  ticketId,
  plazo: 'respuesta',
  vence: VENCE,
  dependenciaId: 1,
  asignadoA: 10,
  ...cambios,
});

describe('AlertasSlaService', () => {
  it('notifica al técnico y a los coordinadores con tipo y datos, y marca la alerta', async () => {
    const { servicio, alertas, notificaciones } = montar([alerta(5), alerta(6, { plazo: 'resolucion', asignadoA: null })]);
    expect(await servicio.procesar(AHORA)).toBe(2);
    expect(notificaciones.creadas).toEqual([
      { usuarioId: 10, ticketId: 5, tipo: 'sla_alerta_respuesta', datos: { vence: VENCE.toISOString(), umbral: 80 }, creadoEn: AHORA },
      { usuarioId: 20, ticketId: 5, tipo: 'sla_alerta_respuesta', datos: { vence: VENCE.toISOString(), umbral: 80 }, creadoEn: AHORA },
      { usuarioId: 20, ticketId: 6, tipo: 'sla_alerta_resolucion', datos: { vence: VENCE.toISOString(), umbral: 80 }, creadoEn: AHORA },
    ]);
    expect(alertas.marcadas).toEqual([
      [5, 'respuesta'],
      [6, 'resolucion'],
    ]);
  });

  it('sin destinatarios marca la alerta, no inserta y deja un aviso en el log', async () => {
    const { servicio, alertas, notificaciones, logs } = montar([alerta(7, { asignadoA: null, dependenciaId: 9 })]);
    expect(await servicio.procesar(AHORA)).toBe(1);
    expect(notificaciones.creadas).toEqual([]);
    expect(alertas.marcadas).toEqual([[7, 'respuesta']]);
    expect(logs).toEqual([expect.stringContaining('ticket 7')]);
  });

  it(`procesa más de ${TAMANO_LOTE_ALERTAS} pendientes en varios lotes, una transacción por lote`, async () => {
    const pendientes = Array.from({ length: TAMANO_LOTE_ALERTAS * 2 + 5 }, (_, i) => alerta(i + 1));
    const { servicio, alertas, transacciones } = montar(pendientes);
    expect(await servicio.procesar(AHORA)).toBe(TAMANO_LOTE_ALERTAS * 2 + 5);
    expect(transacciones).toHaveLength(3);
    expect(alertas.limites).toEqual([TAMANO_LOTE_ALERTAS, TAMANO_LOTE_ALERTAS, TAMANO_LOTE_ALERTAS]);
  });

  it('sin pendientes no envía nada', async () => {
    const { servicio, notificaciones } = montar([]);
    expect(await servicio.procesar(AHORA)).toBe(0);
    expect(notificaciones.creadas).toEqual([]);
  });

  it.each([null, 0, 100])('con el umbral %s → PARAMETRO_INVALIDO, sin reclamar nada', async (umbral) => {
    const { servicio, transacciones } = montar([alerta(5)], umbral);
    await expect(servicio.procesar(AHORA)).rejects.toMatchObject({ codigo: 'PARAMETRO_INVALIDO' });
    expect(transacciones).toEqual([]);
  });
});
