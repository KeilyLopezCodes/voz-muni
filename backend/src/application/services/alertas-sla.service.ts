import type { AlertaPendiente, PlazoAlerta } from '../../domain/repositories/alertas-sla-repository';
import type { DestinatariosRepository } from '../../domain/repositories/destinatarios-repository';
import type { TipoNotificacion } from '../../domain/repositories/notificacion-repository';
import type { ParametroRepository } from '../../domain/repositories/parametro-repository';
import type { Transaccion } from '../../domain/repositories/transaccion';
import { CLAVE_UMBRAL_ALERTA, validarUmbralAlerta } from '../../domain/sla/vencimientos';
import { conReglasDeNegocio } from '../errors/error-de-aplicacion';

export type { AlertaPendiente, PlazoAlerta } from '../../domain/repositories/alertas-sla-repository';

const TIPO_POR_PLAZO: Readonly<Record<PlazoAlerta, TipoNotificacion>> = {
  respuesta: 'sla_alerta_respuesta',
  resolucion: 'sla_alerta_resolucion',
};

export const TAMANO_LOTE_ALERTAS = 200;

// El técnico asignado (si está activo) y los coordinadores activos de la dependencia, sin duplicados, con el técnico
// primero (SPEC 31). Los grupos viven en DestinatariosRepository (SPEC 36).
async function destinatariosDeAlerta(grupos: DestinatariosRepository, alerta: AlertaPendiente): Promise<number[]> {
  const ids = await grupos.coordinadores(alerta.dependenciaId);
  if (alerta.asignadoA !== null && !ids.includes(alerta.asignadoA)) {
    const [tecnico] = await grupos.usuarios([alerta.asignadoA]);
    if (tecnico?.activo) {
      ids.unshift(alerta.asignadoA);
    }
  }
  return ids;
}

// Envío de las alertas al umbral del plazo (RF-28, SPEC 31). Los instantes los precalcula SlaService: aquí solo se
// reclaman los que llegaron, se avisa y se marcan, todo en una transacción por lote. Lo llama el job de node-cron.
export class AlertasSlaService {
  constructor(
    private readonly transaccion: Transaccion,
    private readonly parametros: ParametroRepository,
    private readonly log: (mensaje: string) => void,
  ) {}

  // Procesa por lotes hasta que no queden pendientes. Devuelve cuántas alertas marcó como enviadas.
  async procesar(ahora: Date): Promise<number> {
    const umbral = await conReglasDeNegocio(async () =>
      validarUmbralAlerta(await this.parametros.obtener(CLAVE_UMBRAL_ALERTA)),
    );
    let enviadas = 0;
    for (;;) {
      const lote = await this.transaccion.ejecutar(async ({ alertasSla, notificaciones, destinatarios: grupos }) => {
        const pendientes = await alertasSla.reclamarPendientes(ahora, TAMANO_LOTE_ALERTAS);
        for (const alerta of pendientes) {
          const destinatarios = await destinatariosDeAlerta(grupos, alerta);
          if (destinatarios.length === 0) {
            // Se marca igual: si no, se reintentaría para siempre.
            this.log(`Alerta de ${alerta.plazo} del ticket ${alerta.ticketId} sin destinatarios`);
          }
          await notificaciones.crear(
            destinatarios.map((usuarioId) => ({
              usuarioId,
              ticketId: alerta.ticketId,
              tipo: TIPO_POR_PLAZO[alerta.plazo],
              datos: { vence: alerta.vence.toISOString(), umbral },
              creadoEn: ahora,
            })),
          );
          await alertasSla.marcarEnviada(alerta.ticketId, alerta.plazo, ahora);
        }
        return pendientes.length;
      });
      enviadas += lote;
      if (lote < TAMANO_LOTE_ALERTAS) {
        return enviadas;
      }
    }
  }
}
