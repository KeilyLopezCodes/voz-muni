import type { Knex } from 'knex';
import type {
  CorreoReclamado,
  CorreoSalienteRepository,
  NuevoCorreo,
} from '../../domain/repositories/correo-saliente-repository';

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

// Mientras se envía un correo reclamado, otra corrida no lo vuelve a tomar.
const RESERVA_MS = 10 * 60_000;

export class KnexCorreoSalienteRepository implements CorreoSalienteRepository {
  constructor(private readonly db: Knex) {}

  async insertar(correo: NuevoCorreo, ahora: Date): Promise<number> {
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
        creado_en: ahora,
        proximo_intento_en: new Date(ahora.getTime() + RESERVA_MS),
      })
      .returning('id');
    return Number(fila.id);
  }

  async reclamarVencidos(ahora: Date, limite: number): Promise<CorreoReclamado[]> {
    const { rows } = (await this.db.raw(
      `UPDATE correos_salientes SET proximo_intento_en = :reserva
       WHERE id IN (
         SELECT id FROM correos_salientes
         WHERE estado = 'pendiente' AND proximo_intento_en <= :ahora
         ORDER BY proximo_intento_en, id
         LIMIT :limite
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, plantilla_clave, para, asunto, texto, html, ticket_id, usuario_id, expira_en, intentos`,
      { ahora, limite, reserva: new Date(ahora.getTime() + RESERVA_MS) },
    )) as { rows: FilaCorreo[] };
    return rows.map((fila) => ({
      id: Number(fila.id),
      plantillaClave: fila.plantilla_clave,
      para: fila.para,
      asunto: fila.asunto,
      texto: fila.texto,
      html: fila.html,
      ticketId: fila.ticket_id === null ? null : Number(fila.ticket_id),
      usuarioId: fila.usuario_id === null ? null : Number(fila.usuario_id),
      expiraEn: fila.expira_en,
      intentos: fila.intentos,
    }));
  }

  async marcarEnviado(id: number, ahora: Date): Promise<void> {
    await this.terminar(id, 'enviado', ahora, { intentos: this.db.raw('intentos + 1') });
  }

  async marcarDescartado(id: number, ahora: Date): Promise<void> {
    await this.terminar(id, 'descartado', ahora, {});
  }

  async registrarFallo(id: number, error: string, proximo: Date | null, ahora: Date): Promise<void> {
    const cambios = { intentos: this.db.raw('intentos + 1'), ultimo_error: error.slice(0, 1000) };
    if (proximo === null) {
      await this.terminar(id, 'fallido', ahora, cambios);
      return;
    }
    await this.db('correos_salientes').where({ id }).update({ ...cambios, proximo_intento_en: proximo });
  }

  private async terminar(id: number, estado: string, ahora: Date, extra: Record<string, unknown>): Promise<void> {
    await this.db('correos_salientes')
      .where({ id, estado: 'pendiente' })
      .update({ ...extra, estado, terminado_en: ahora, texto: null, html: null });
  }
}
