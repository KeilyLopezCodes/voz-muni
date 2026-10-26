import cron from 'node-cron';
import type { DespachoCorreosService } from '../../application/services/despacho-correos.service';
import type { Clock } from '../../domain/health/clock';
import type { Programador, RegistroJob } from './sla.job';

const programarConNodeCron: Programador = (expresion, tarea) => cron.schedule(expresion, tarea);

// El job de correos (SPEC 34), delgado como el de SLA: en cada corrida reintenta los correos pendientes cuyo
// proximo_intento_en ya pasó. Las reglas (reintentos, descarte, bloqueo de filas) viven en DespachoCorreosService. Si
// una corrida sigue en curso, la siguiente se salta; un error queda en el log y no detiene el job. Devuelve una
// función para detenerlo.
export function iniciarJobCorreos(
  despacho: Pick<DespachoCorreosService, 'procesar'>,
  config: { cron: string },
  reloj: Clock,
  programar: Programador = programarConNodeCron,
  registro: RegistroJob = console,
): () => void {
  let enCurso = false;

  const tarea = programar(config.cron, async () => {
    if (enCurso) {
      registro.info('Correos: la corrida anterior sigue en curso, se salta esta');
      return;
    }
    enCurso = true;
    try {
      const procesados = await despacho.procesar(reloj.now());
      if (procesados > 0) {
        registro.info(`Correos: ${procesados} correos procesados`);
      }
    } catch (error) {
      registro.error('Correos: falló la corrida', error);
    } finally {
      enCurso = false;
    }
  });
  registro.info(`Job de correos programado con "${config.cron}"`);
  return () => void tarea.stop();
}
