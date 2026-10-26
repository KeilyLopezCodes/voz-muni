import type { Knex } from 'knex';
import type { ContextoSolicitud } from '../../domain/auditoria/contexto-solicitud';
import type { ReposTransaccionales, Transaccion } from '../../domain/repositories/transaccion';
import { KnexAuditoria } from '../auditoria/knex-auditoria';
import { KnexAdjuntoRepository } from './knex-adjunto-repository';
import { KnexAlertasSlaRepository } from './knex-alertas-sla-repository';
import { KnexAsignacionRepository } from './knex-asignacion-repository';
import { KnexAvisosComentariosRepository } from './knex-avisos-comentarios-repository';
import { KnexCatalogosAdminRepository } from './knex-catalogos-admin-repository';
import { KnexCategoriaAdminRepository } from './knex-categoria-admin-repository';
import { KnexCierreAutomaticoRepository } from './knex-cierre-automatico-repository';
import { KnexComentarioRepository } from './knex-comentario-repository';
import { KnexCorreoSalienteRepository } from './knex-correo-saliente-repository';
import { KnexDestinatariosRepository } from './knex-destinatarios-repository';
import { KnexEncuestaRepository } from './knex-encuesta-repository';
import { KnexEscalamientoRepository } from './knex-escalamiento-repository';
import { KnexNotificacionRepository } from './knex-notificacion-repository';
import { KnexParametroRepository } from './knex-parametro-repository';
import { KnexPoliticaSlaRepository } from './knex-politica-sla-repository';
import { KnexRegistroVecinoRepository } from './knex-registro-vecino-repository';
import { KnexRestablecimientoRepository } from './knex-restablecimiento-repository';
import { KnexSesionRepository } from './knex-sesion-repository';
import { KnexTicketEscrituraRepository } from './knex-ticket-escritura-repository';
import { KnexTrasladoRepository } from './knex-traslado-repository';
import { KnexUsuarioAdminRepository } from './knex-usuario-admin-repository';
import { KnexUsuarioRepository } from './knex-usuario-repository';
import { KnexVecinoRepository } from './knex-vecino-repository';

// Los repositorios Knex aceptan una transacción en lugar de la conexión.
export class KnexTransaccion implements Transaccion {
  constructor(
    private readonly db: Knex,
    private readonly contexto: ContextoSolicitud, // la IP de la bitácora (SPEC 41)
  ) {}

  ejecutar<T>(trabajo: (repos: ReposTransaccionales) => Promise<T>): Promise<T> {
    return this.db.transaction((trx) =>
      trabajo({
        usuarios: new KnexUsuarioRepository(trx),
        usuariosAdmin: new KnexUsuarioAdminRepository(trx),
        sesiones: new KnexSesionRepository(trx),
        restablecimientos: new KnexRestablecimientoRepository(trx),
        vecinos: new KnexVecinoRepository(trx),
        categoriasAdmin: new KnexCategoriaAdminRepository(trx),
        registroVecinos: new KnexRegistroVecinoRepository(trx),
        ticketsEscritura: new KnexTicketEscrituraRepository(trx),
        asignaciones: new KnexAsignacionRepository(trx),
        traslados: new KnexTrasladoRepository(trx),
        comentarios: new KnexComentarioRepository(trx),
        adjuntos: new KnexAdjuntoRepository(trx),
        politicasSla: new KnexPoliticaSlaRepository(trx),
        alertasSla: new KnexAlertasSlaRepository(trx),
        notificaciones: new KnexNotificacionRepository(trx),
        escalamiento: new KnexEscalamientoRepository(trx),
        cierreAutomatico: new KnexCierreAutomaticoRepository(trx),
        correosSalientes: new KnexCorreoSalienteRepository(trx),
        avisosComentarios: new KnexAvisosComentariosRepository(trx),
        destinatarios: new KnexDestinatariosRepository(trx),
        encuestas: new KnexEncuestaRepository(trx),
        catalogosAdmin: new KnexCatalogosAdminRepository(trx),
        auditoria: new KnexAuditoria(trx, this.contexto),
        parametros: new KnexParametroRepository(trx),
      }),
    );
  }
}
