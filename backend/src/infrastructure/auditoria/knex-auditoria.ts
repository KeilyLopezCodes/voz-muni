import type { Knex } from 'knex';
import { ACCIONES_BITACORA, esAccionBitacora } from '../../domain/auditoria/acciones';
import type { Auditoria, EventoAuditoria } from '../../domain/auditoria/auditoria';
import type { ContextoSolicitud } from '../../domain/auditoria/contexto-solicitud';
import { sanearDetalle } from '../../domain/auditoria/saneamiento';

// Escribe en la tabla bitacora, solo de inserción (SPEC 03), con el Knex de la transacción del caso de uso.
// `raiz` es la conexión sin transacción, para registrarIndependiente (SPEC 42).
export class KnexAuditoria implements Auditoria {
  constructor(
    private readonly db: Knex,
    private readonly contexto: ContextoSolicitud,
    private readonly raiz: Knex = db,
    private readonly registrarError: (mensaje: string) => void = (mensaje) => console.error(mensaje),
  ) {}

  registrar(evento: EventoAuditoria): Promise<void> {
    return this.insertar(this.db, evento);
  }

  async registrarIndependiente(evento: EventoAuditoria): Promise<void> {
    try {
      await this.raiz.transaction((trx) => this.insertar(trx, evento));
    } catch (error) {
      // Nunca el detalle: puede llevar datos del usuario.
      this.registrarError(
        `No se pudo registrar ${String(evento.accion)} en la bitácora (usuario ${evento.usuarioId ?? 'sistema'}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async insertar(db: Knex, evento: EventoAuditoria): Promise<void> {
    // El catálogo es la única lista válida: una acción desconocida es un error de programación, no del usuario.
    if (!esAccionBitacora(evento.accion)) {
      throw new Error(`Acción de bitácora desconocida: ${String(evento.accion)}`);
    }
    await db('bitacora').insert({
      usuario_id: evento.usuarioId,
      accion: evento.accion,
      entidad: ACCIONES_BITACORA[evento.accion].entidad,
      entidad_id: evento.entidadId === null ? null : String(evento.entidadId),
      dependencia_id: evento.dependenciaId,
      detalle: JSON.stringify(sanearDetalle({ cambios: evento.cambios, datos: evento.datos })),
      ip: this.contexto.ip(),
    });
  }
}
