import type { Knex } from 'knex';
import type {
  CorreoReclamado,
  CorreoSalienteRepository,
  NuevoCorreo,
} from '../../domain/repositories/correo-saliente-repository';

// pg devuelve los bigint como string.
interface FilaCorreo {
  id: string;
  plantilla_clave: string;
  para: string;
  asunto: string;
  texto: string;
  html: string;
  ticket_id: string | null;
  usuario_id: string | null;
  expira_en: Date | null;
  intentos: number;
}

const COLUMNAS = [
  'id',
  'plantilla_clave',
  'para',
  'asunto',
  'texto',
  'html',
  'ticket_id',
  'usuario_id',
  'expira_en',
  'intentos',
];

const numeroONull = (valor: string | null) => (valor === null ? null : Number(valor));

function aCorreo(fila: FilaCorreo): CorreoReclamado {
  return {
    id: Number(fila.id),
    plantillaClave: fila.plantilla_clave,
    para: fila.para,
    asunto: fila.asunto,
    texto: fila.texto,
    html: fila.html,
    ticketId: numeroONull(fila.ticket_id),
    usuarioId: numeroONull(fila.usuario_id),
    expiraEn: fila.expira_en,
    intentos: fila.intentos,
  };
}

export class KnexCorreoSalienteRepository implements CorreoSalienteRepository {
  constructor(private readonly db: Knex) {}

  async insertar(correo: NuevoCorreo): Promise<number> {
    const [fila] = await this.db('correos_salientes')
      .insert({
        plantilla_clave: correo.plantillaClave,
        para: correo.para,
        asunto: correo.asunto,
        texto: correo.texto,
        html: correo.html,
        ticket_id: correo.ticketId,
        usuario_id: correo.usuarioId,
        expira_en: correo.expiraEn,
      })
      .returning('id');
    return Number(fila.id);
  }

  async reclamarPorId(ids: readonly number[]): Promise<CorreoReclamado[]> {
    if (ids.length === 0) {
      return [];
    }
    const filas: FilaCorreo[] = await this.db('correos_salientes')
      .whereIn('id', ids)
      .where('estado', 'pendiente')
      .orderBy('id')
      .forUpdate()
      .skipLocked()
      .select(COLUMNAS);
    return filas.map(aCorreo);
  }

  async reclamarVencidos(ahora: Date, limite: number): Promise<CorreoReclamado[]> {
    // Usa correos_salientes_pendientes_idx (0029).
    const filas: FilaCorreo[] = await this.db('correos_salientes')
      .where('estado', 'pendiente')
      .where('proximo_intento_en', '<=', ahora)
      .orderBy([{ column: 'proximo_intento_en' }, { column: 'id' }])
      .limit(limite)
      .forUpdate()
      .skipLocked()
      .select(COLUMNAS);
    return filas.map(aCorreo);
  }

  async marcarEnviado(id: number, ahora: Date): Promise<void> {
    await this.terminar(id, 'enviado', ahora, null);
  }

  async marcarDescartado(id: number, ahora: Date): Promise<void> {
    await this.terminar(id, 'descartado', ahora, null);
  }

  async registrarFallo(id: number, error: string, proximo: Date | null, ahora: Date): Promise<void> {
    if (proximo === null) {
      await this.terminar(id, 'fallido', ahora, error);
      return;
    }
    await this.db('correos_salientes')
      .where({ id })
      .update({ intentos: this.db.raw('intentos + 1'), ultimo_error: error, proximo_intento_en: proximo });
  }

  // El cuerpo puede llevar tokens y datos personales: al terminar solo quedan los metadatos.
  private async terminar(id: number, estado: 'enviado' | 'descartado' | 'fallido', ahora: Date, error: string | null) {
    await this.db('correos_salientes')
      .where({ id })
      .update({
        estado,
        intentos: estado === 'descartado' ? this.db.raw('intentos') : this.db.raw('intentos + 1'),
        texto: null,
        html: null,
        terminado_en: ahora,
        ...(error === null ? {} : { ultimo_error: error }),
      });
  }
}
