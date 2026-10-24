import type { Knex } from 'knex';
import type { ReposTransaccionales, Transaccion } from '../../domain/repositories/transaccion';
import { KnexAsignacionRepository } from './knex-asignacion-repository';
import { KnexCategoriaAdminRepository } from './knex-categoria-admin-repository';
import { KnexRegistroVecinoRepository } from './knex-registro-vecino-repository';
import { KnexRestablecimientoRepository } from './knex-restablecimiento-repository';
import { KnexSesionRepository } from './knex-sesion-repository';
import { KnexTicketEscrituraRepository } from './knex-ticket-escritura-repository';
import { KnexUsuarioAdminRepository } from './knex-usuario-admin-repository';
import { KnexUsuarioRepository } from './knex-usuario-repository';
import { KnexVecinoRepository } from './knex-vecino-repository';

// Los repositorios Knex aceptan una transacción en lugar de la conexión.
export class KnexTransaccion implements Transaccion {
  constructor(private readonly db: Knex) {}

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
      }),
    );
  }
}
