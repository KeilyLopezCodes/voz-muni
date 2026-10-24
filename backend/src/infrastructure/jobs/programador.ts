import cron from 'node-cron';

// Una tarea programada: llama a un servicio de aplicación, el mismo que usa la API (las reglas viven en un solo lugar).
export interface TareaProgramada {
  nombre: string;
  cron: string;
  ejecutar: () => Promise<unknown>;
}

// Programa las tareas con node-cron. Si una corrida sigue en curso, la siguiente se salta; un error se registra y
// no detiene el proceso. Devuelve una función que las detiene (server.ts la llama antes de cerrar Knex).
export function iniciarTareas(tareas: readonly TareaProgramada[], registrar: (mensaje: string) => void): () => void {
  const programadas = tareas.map((tarea) => {
    if (!cron.validate(tarea.cron)) {
      throw new Error(`Expresión cron inválida para ${tarea.nombre}: ${tarea.cron}`);
    }
    let enCurso = false;
    return cron.schedule(tarea.cron, async () => {
      if (enCurso) {
        return;
      }
      enCurso = true;
      try {
        await tarea.ejecutar();
      } catch (error) {
        registrar(`Tarea ${tarea.nombre}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        enCurso = false;
      }
    });
  });
  return () => {
    for (const programada of programadas) {
      void programada.stop();
    }
  };
}
