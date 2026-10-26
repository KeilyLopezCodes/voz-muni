import cron from 'node-cron';
import type { AvisosComentariosService } from '../../application/services/avisos-comentarios.service';
import type { DespachoCorreosService } from '../../application/services/despacho-correos.service';
import type { Clock } from '../../domain/health/clock';
import type { Programador, RegistroJob } from './sla.job';

export interface PasosCorreos {
  avisos: Pick<AvisosComentariosService, 'procesar'>; // SPEC 35
  despacho: Pick<DespachoCorreosService, 'procesar'>; // SPEC 34
}

const programarConNodeCron: Programador = (expresion, tarea) => cron.schedule(expresion, tarea);

// El job de correos (SPEC 34 y 35), delgado como el de SLA: en cada corrida, con el mismo `ahora`, encola los avisos
// agrupados de comentarios cuya ventana se cerró y después reintenta los correos pendientes cuyo proximo_intento_en
// ya pasó. Las reglas viven en application/. Un error en un paso queda en el log y no impide el siguiente; si una
// corrida sigue en curso, la siguiente se salta. Devuelve una función para detenerlo.
export function iniciarJobCorreos(
  pasos: PasosCorreos,
  config: { cron: string },
  reloj: Clock,
  programar: Programador = programarConNodeCron,
  registro: RegistroJob = console,
): () => void {
  let enCurso = false;

  const ejecutar = async (nombre: string, paso: () => Promise<number>, resultado: (n: number) => string) => {
    try {
      const cantidad = await paso();
      if (cantidad > 0) {
        registro.info(`Correos: ${resultado(cantidad)}`);
      }
    } catch (error) {
      registro.error(`Correos: falló el paso de ${nombre}`, error);
    }
  };

  const tarea = programar(config.cron, async () => {
    if (enCurso) {
      registro.info('Correos: la corrida anterior sigue en curso, se salta esta');
      return;
    }
    enCurso = true;
    try {
      const ahora = reloj.now();
      await ejecutar('avisos de comentarios', () => pasos.avisos.procesar(ahora), (n) => `${n} avisos de comentarios encolados`);
      await ejecutar('despacho', () => pasos.despacho.procesar(ahora), (n) => `${n} correos procesados`);
    } finally {
      enCurso = false;
    }
  });
  registro.info(`Job de correos programado con "${config.cron}"`);
  return () => void tarea.stop();
}
