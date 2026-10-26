import cron from 'node-cron';
import type { AlertasSlaService } from '../../application/services/alertas-sla.service';
import type { Clock } from '../../domain/health/clock';

// Cómo se programa una tarea: node-cron en producción, un doble en las pruebas.
export type Programador = (expresion: string, tarea: () => Promise<void>) => { stop(): void | Promise<void> };

export interface RegistroJob {
  info(mensaje: string): void;
  error(mensaje: string, error?: unknown): void;
}

const programarConNodeCron: Programador = (expresion, tarea) => cron.schedule(expresion, tarea);

// Job delgado (RF-28, SPEC 31): solo llama a AlertasSlaService.procesar, que vive en application/ como pide
// CLAUDE.md. Si una corrida sigue en curso, la siguiente se salta; un error queda en el log y la siguiente corrida
// reintenta. Devuelve una función para detenerlo.
export function iniciarJobAlertasSla(
  servicio: Pick<AlertasSlaService, 'procesar'>,
  config: { cron: string },
  reloj: Clock,
  programar: Programador = programarConNodeCron,
  registro: RegistroJob = console,
): () => void {
  let enCurso = false;
  const tarea = programar(config.cron, async () => {
    if (enCurso) {
      registro.info('Alertas de SLA: la corrida anterior sigue en curso, se salta esta');
      return;
    }
    enCurso = true;
    try {
      const enviadas = await servicio.procesar(reloj.now());
      if (enviadas > 0) {
        registro.info(`Alertas de SLA: ${enviadas} enviadas`);
      }
    } catch (error) {
      registro.error('Alertas de SLA: la corrida falló', error);
    } finally {
      enCurso = false;
    }
  });
  registro.info(`Alertas de SLA programadas con "${config.cron}"`);
  return () => void tarea.stop();
}
