import type { Knex } from 'knex';
import type { Plantilla } from '../../domain/notificaciones/plantilla';
import type { PlantillaRepository } from '../../domain/repositories/plantilla-repository';

export class KnexPlantillaRepository implements PlantillaRepository {
  constructor(private readonly db: Knex) {}

  async buscarPorClave(clave: string): Promise<Plantilla | null> {
    const fila: { clave: string; asunto: string; cuerpo_texto: string; cuerpo_html: string } | undefined = await this.db(
      'plantillas_notificacion',
    )
      .where({ clave })
      .first('clave', 'asunto', 'cuerpo_texto', 'cuerpo_html');
    if (!fila) {
      return null;
    }
    return { clave: fila.clave, asunto: fila.asunto, cuerpoTexto: fila.cuerpo_texto, cuerpoHtml: fila.cuerpo_html };
  }
}
