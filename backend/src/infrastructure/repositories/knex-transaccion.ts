import type { Knex } from 'knex';
import type { ReposTransaccionales, Transaccion } from '../../domain/repositories/transaccion';
import { KnexRestablecimientoRepository } from './knex-restablecimiento-repository';
import { KnexSesionRepository } from './knex-sesion-repository';
import { KnexUsuarioAdminRepository } from './knex-usuario-admin-repository';
import { KnexUsuarioRepository } from './knex-usuario-repository';

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
      }),
    );
  }
}
