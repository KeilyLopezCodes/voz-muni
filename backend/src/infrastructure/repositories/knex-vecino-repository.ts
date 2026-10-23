import type { Knex } from 'knex';
import type { CriterioVecino, Vecino, VecinoRepository } from '../../domain/repositories/vecino-repository';

interface FilaVecino {
  id: string; // pg devuelve los bigint como string
  nombre: string;
  email: string | null;
  telefono: string | null;
}

const aVecino = (fila: FilaVecino): Vecino => ({ ...fila, id: Number(fila.id) });

export class KnexVecinoRepository implements VecinoRepository {
  constructor(private readonly db: Knex) {}

  // Solo usuarios activos con rol vecino. El DPI nunca se selecciona (RNF-12).
  private activos() {
    return this.db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .where({ 'r.nombre': 'vecino', 'u.activo': true })
      .select('u.id', 'u.nombre', 'u.email', 'u.telefono');
  }

  async obtenerActivo(id: number): Promise<Vecino | null> {
    const fila: FilaVecino | undefined = await this.activos().where('u.id', id).first();
    return fila ? aVecino(fila) : null;
  }

  async buscarActivos(criterio: CriterioVecino, limite: number): Promise<Vecino[]> {
    const consulta = this.activos();
    if ('email' in criterio) {
      consulta.whereRaw('lower(u.email) = lower(?)', [criterio.email]);
    } else if ('telefono' in criterio) {
      consulta.where('u.telefono', criterio.telefono);
    } else {
      consulta.where('u.dpi', criterio.dpi);
    }
    const filas: FilaVecino[] = await consulta.orderBy('u.nombre').orderBy('u.id').limit(limite);
    return filas.map(aVecino);
  }
}
