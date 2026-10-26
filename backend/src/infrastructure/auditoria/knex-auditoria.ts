import type { Knex } from 'knex';
import { ACCIONES_BITACORA, esAccionBitacora } from '../../domain/auditoria/acciones';
import type { Auditoria, EventoAuditoria } from '../../domain/auditoria/auditoria';
import type { ContextoSolicitud } from '../../domain/auditoria/contexto-solicitud';
import { sanearDetalle } from '../../domain/auditoria/saneamiento';

// Escribe en la tabla bitacora, solo de inserción (SPEC 03), con el Knex de la transacción del caso de uso.
export class KnexAuditoria implements Auditoria {
  constructor(
    private readonly db: Knex,
    private readonly contexto: ContextoSolicitud,
  ) {}

  async registrar(evento: EventoAuditoria): Promise<void> {
    // El catálogo es la única lista válida: una acción desconocida es un error de programación, no del usuario.
    if (!esAccionBitacora(evento.accion)) {
      throw new Error(`Acción de bitácora desconocida: ${String(evento.accion)}`);
    }
    await this.db('bitacora').insert({
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
