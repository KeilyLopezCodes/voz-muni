import type { Transaccion } from '../../domain/repositories/transaccion';
import type { EnvioCorreo } from './envio-correo';
import { notificarInternos } from './notificaciones-internas';

const LOTE = 200;

export interface ResultadoTareasSla {
  alertas: number;
  escaladas: number;
  cerradas: number;
}

interface CierreHecho {
  ticketId: number;
  numero: string;
  titulo: string;
  solicitante: { id: number; nombre: string; email: string | null };
}

// Tareas del job de SLA (RF-28, RF-29, RF-30, SPEC 31, 32 y 33): alertas al umbral, escalamiento y cierre
// automático, en ese orden y con el mismo `ahora`. Llaman a los mismos métodos de dominio que la API: las reglas
// viven en un solo lugar. Un error en un paso se registra y no impide los siguientes.
export class TareasSlaService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly correo: EnvioCorreo,
    private readonly appUrl: string,
    private readonly registrar: (mensaje: string) => void,
  ) {}

  async procesar(ahora: Date): Promise<ResultadoTareasSla> {
    const resultado: ResultadoTareasSla = { alertas: 0, escaladas: 0, cerradas: 0 };
    const pasos: [keyof ResultadoTareasSla, (ahora: Date) => Promise<number>][] = [
      ['alertas', (a) => this.procesarAlertas(a)],
      ['escaladas', (a) => this.procesarEscalamientos(a)],
      ['cerradas', (a) => this.procesarCierres(a)],
    ];
    for (const [clave, paso] of pasos) {
      try {
        resultado[clave] = await paso(ahora);
      } catch (error) {
        this.registrar(`Job de SLA, paso ${clave}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return resultado;
  }

  // Alerta al técnico asignado y a los coordinadores de la dependencia (SPEC 31). Sin destinatarios, la alerta se
  // marca igual para no reintentarla para siempre.
  async procesarAlertas(ahora: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const procesadas = await this.transaccion.ejecutar(async (repos) => {
        const pendientes = await repos.tareasSla.reclamarAlertas(ahora, LOTE);
        for (const alerta of pendientes) {
          const coordinadores = alerta.dependenciaId === null ? [] : await repos.destinatarios.coordinadores(alerta.dependenciaId);
          const enviadas = await notificarInternos(
            {
              tipo: alerta.plazo === 'respuesta' ? 'sla_alerta_respuesta' : 'sla_alerta_resolucion',
              ticketId: alerta.ticketId,
              autorId: null,
              candidatos: [alerta.asignadoA, ...coordinadores],
              datos: { vence: alerta.vence.toISOString() },
              ahora,
            },
            repos,
          );
          if (enviadas === 0) {
            this.registrar(`Alerta de SLA sin destinatarios para la queja ${alerta.ticketId}`);
          }
          await repos.tareasSla.marcarAlertaEnviada(alerta.ticketId, alerta.plazo, ahora);
        }
        return pendientes.length;
      });
      total += procesadas;
      if (procesadas < LOTE) {
        return total;
      }
    }
  }

  // Marca la queja como escalada con el dominio y avisa a quienes tienen tickets.triage (SPEC 32).
  async procesarEscalamientos(ahora: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const procesadas = await this.transaccion.ejecutar(async (repos) => {
        const pendientes = await repos.tareasSla.reclamarEscalamientos(ahora, LOTE);
        const supervisores = pendientes.length > 0 ? await repos.destinatarios.supervisores() : [];
        for (const pendiente of pendientes) {
          const actual = await repos.ticketsEscritura.obtenerParaActualizar(pendiente.ticketId, []);
          if (!actual) {
            continue;
          }
          await repos.ticketsEscritura.guardarEscalado(actual.ticket.marcarEscalado(ahora, pendiente.plazo));
          const enviadas = await notificarInternos(
            {
              tipo: 'sla_escalamiento',
              ticketId: pendiente.ticketId,
              autorId: null,
              candidatos: supervisores,
              datos: { plazo: pendiente.plazo, vence: pendiente.vence.toISOString() },
              ahora,
            },
            repos,
          );
          if (enviadas === 0) {
            this.registrar(`Queja ${pendiente.ticketId} escalada sin supervisores activos`);
          }
        }
        return pendientes.length;
      });
      total += procesadas;
      if (procesadas < LOTE) {
        return total;
      }
    }
  }

  // Cierra las quejas resueltas cuyo plazo de confirmación venció (SPEC 33) y avisa al vecino después del commit.
  async procesarCierres(ahora: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const cerradas = await this.transaccion.ejecutar(async (repos) => {
        const ids = await repos.tareasSla.reclamarCierres(ahora, LOTE);
        const hechas: CierreHecho[] = [];
        for (const id of ids) {
          const actual = await repos.ticketsEscritura.obtenerParaActualizar(id, []);
          if (!actual || actual.ticket.estado !== 'resuelta' || actual.ticket.confirmacionVenceEn === null) {
            continue;
          }
          const resultado = actual.ticket.cerrarPorVencimiento({ actorId: null, ahora }, actual.ticket.confirmacionVenceEn);
          await repos.ticketsEscritura.guardarTransicion(resultado, actual.categoria.id);
          hechas.push({ ticketId: id, numero: actual.ticket.numero, titulo: actual.titulo, solicitante: actual.solicitante });
        }
        return { reclamadas: ids.length, hechas };
      });
      for (const hecha of cerradas.hechas) {
        if (hecha.solicitante.email) {
          this.correo.sinEsperar(
            'queja_cerrada_automaticamente',
            hecha.solicitante.email,
            {
              nombre: hecha.solicitante.nombre,
              numero: hecha.numero,
              titulo: hecha.titulo,
              enlace: `${this.appUrl}/tickets/${hecha.ticketId}`,
            },
            hecha.solicitante.id,
          );
        }
      }
      total += cerradas.hechas.length;
      if (cerradas.reclamadas < LOTE) {
        break;
      }
    }
    const sinPlazo = await this.transaccion.ejecutar(({ tareasSla }) => tareasSla.contarResueltasSinPlazo());
    if (sinPlazo > 0) {
      this.registrar(`Hay ${sinPlazo} quejas resueltas sin plazo de confirmación: no se cierran automáticamente`);
    }
    return total;
  }
}
