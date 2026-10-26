import cron from 'node-cron';
import type { AlertasSlaService } from '../../application/services/alertas-sla.service';
import type { CierreAutomaticoService } from '../../application/services/cierre-automatico.service';
import type { EscalamientoService } from '../../application/services/escalamiento.service';
import type { Clock } from '../../domain/health/clock';

// Cómo se programa una tarea: node-cron en producción, un doble en las pruebas. `zonaHoraria` interpreta la expresión
// en esa zona (SPEC 36); sin ella, en la del proceso.
export type Programador = (
  expresion: string,
  tarea: () => Promise<void>,
  opciones?: { zonaHoraria?: string },
) => { stop(): void | Promise<void> };

export interface RegistroJob {
  info(mensaje: string): void;
  error(mensaje: string, error?: unknown): void;
}

export interface PasosSla {
  alertas: Pick<AlertasSlaService, 'procesar'>; // SPEC 31
  escalamiento: Pick<EscalamientoService, 'procesar'>; // SPEC 32
  cierre: Pick<CierreAutomaticoService, 'procesar'>; // SPEC 33
}

const programarConNodeCron: Programador = (expresion, tarea, opciones) =>
  cron.schedule(expresion, tarea, opciones?.zonaHoraria ? { timezone: opciones.zonaHoraria } : undefined);

// El único job de SLA (SPEC 31, 32 y 33), delgado: en cada corrida ejecuta las alertas, el escalamiento y el cierre
// automático, en ese orden y con el mismo `ahora`. Las reglas viven en application/, como pide CLAUDE.md. Un error en
// un paso queda en el log y no impide los siguientes; si una corrida sigue en curso, la siguiente se salta. Devuelve
// una función para detenerlo.
export function iniciarJobSla(
  pasos: PasosSla,
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
        registro.info(`SLA: ${resultado(cantidad)}`);
      }
    } catch (error) {
      registro.error(`SLA: falló el paso de ${nombre}`, error);
    }
  };

  const tarea = programar(config.cron, async () => {
    if (enCurso) {
      registro.info('SLA: la corrida anterior sigue en curso, se salta esta');
      return;
    }
    enCurso = true;
    try {
      const ahora = reloj.now();
      await ejecutar('alertas', () => pasos.alertas.procesar(ahora), (n) => `${n} alertas enviadas`);
      await ejecutar('escalamiento', () => pasos.escalamiento.procesar(ahora), (n) => `${n} quejas escaladas`);
      await ejecutar('cierre', () => pasos.cierre.procesar(ahora), (n) => `${n} quejas cerradas automáticamente`);
    } finally {
      enCurso = false;
    }
  });
  registro.info(`Job de SLA programado con "${config.cron}"`);
  return () => void tarea.stop();
}
